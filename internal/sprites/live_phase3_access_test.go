package sprites

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
)

const (
	livePhase3HTTPMeasurements      = 20
	livePhase3SSEMeasurements       = 20
	livePhase3RevocationBudget      = 10 * time.Second
	livePhase3RevocationWait        = 12 * time.Second
	livePhase3ReconnectBudget       = 3 * time.Second
	livePhase3InteractiveBudget     = 250 * time.Millisecond
	livePhase3GatewayOverheadBudget = 100 * time.Millisecond
)

type livePhase3Candidate string

const (
	livePhase3CandidateA livePhase3Candidate = "candidate_a_public_url"
	livePhase3CandidateB livePhase3Candidate = "candidate_b_private_proxy"
)

type livePhase3Result struct {
	Candidate                  livePhase3Candidate       `json:"candidate"`
	RuntimeName                string                    `json:"runtime_name"`
	Placement                  string                    `json:"placement"`
	ProviderServer             string                    `json:"provider_server"`
	URLAccess                  runtimeprovider.URLAccess `json:"url_access"`
	HTTPP95Milliseconds        float64                   `json:"http_p95_ms"`
	SSEFirstEventP95Millis     float64                   `json:"sse_first_event_p95_ms"`
	ReconnectP95Milliseconds   float64                   `json:"reconnect_p95_ms"`
	WarmWakeP95Milliseconds    float64                   `json:"warm_wake_p95_ms"`
	UnauthenticatedStatus      int                       `json:"unauthenticated_status"`
	UnauthenticatedWokeRuntime bool                      `json:"unauthenticated_woke_runtime"`
	RevocationMilliseconds     float64                   `json:"revocation_ms"`
	RevocationObserved         bool                      `json:"revocation_observed"`
	RevocationWithinBudget     bool                      `json:"revocation_within_budget"`
	RotationPassed             bool                      `json:"rotation_passed"`
	SuspensionStatus           int                       `json:"suspension_status"`
	SuspensionOpenedTransport  bool                      `json:"suspension_opened_transport"`
	RateLimitStatus            int                       `json:"rate_limit_status"`
	RateLimitOpenedTransport   bool                      `json:"rate_limit_opened_transport"`
	CredentialLeakObserved     bool                      `json:"credential_leak_observed"`
	ProxyDials                 int64                     `json:"proxy_dials"`
	Notes                      []string                  `json:"notes"`
}

func TestLivePhase3AccessComparison(t *testing.T) {
	if os.Getenv("SETTA_LIVE_SPRITES") != "1" || os.Getenv("SETTA_LIVE_PHASE3_ACCESS") != "1" {
		t.Skip("set SETTA_LIVE_SPRITES=1 and SETTA_LIVE_PHASE3_ACCESS=1 after Phase 3 authorization")
	}
	token := os.Getenv("SPRITE_TOKEN")
	if token == "" {
		t.Fatal("SPRITE_TOKEN is required after Phase 3 authorization")
	}
	runID := os.Getenv("SETTA_SPRITES_LIVE_RUN_ID")
	if runID == "" {
		t.Fatal("SETTA_SPRITES_LIVE_RUN_ID is required after Phase 3 authorization")
	}
	if organization := os.Getenv("SETTA_SPRITES_ORGANIZATION"); organization != "setta-100" {
		t.Fatalf("SETTA_SPRITES_ORGANIZATION = %q, want authorized organization setta-100", organization)
	}
	if maximumSpend := os.Getenv("SETTA_SPRITES_MAX_SPEND_USD"); maximumSpend != "5" {
		t.Fatalf("SETTA_SPRITES_MAX_SPEND_USD = %q, want authorized cap 5", maximumSpend)
	}
	cleanupDeadline, err := time.Parse(time.RFC3339, os.Getenv("SETTA_SPRITES_CLEANUP_DEADLINE"))
	if err != nil {
		t.Fatalf("parse SETTA_SPRITES_CLEANUP_DEADLINE: %v", err)
	}
	if !time.Now().Before(cleanupDeadline) {
		t.Fatalf("cleanup deadline has passed: %s", cleanupDeadline)
	}

	ctx, cancel := context.WithDeadline(context.Background(), cleanupDeadline.Add(-2*time.Minute))
	defer cancel()
	inputs := buildLiveRuntimeInstallInputs(t, ctx)
	results := make([]livePhase3Result, 0, 2)
	for _, candidate := range []livePhase3Candidate{livePhase3CandidateA, livePhase3CandidateB} {
		candidate := candidate
		if !t.Run(string(candidate), func(t *testing.T) {
			results = append(results, runLivePhase3Candidate(t, ctx, token, runID, inputs, candidate))
		}) {
			t.Errorf("%s harness failed after cleanup", candidate)
		}
	}
	if len(results) != 2 {
		t.Fatalf("Phase 3 results = %d, want 2", len(results))
	}
	if results[0].Placement != "" && results[1].Placement != "" && results[0].Placement != results[1].Placement {
		t.Fatalf("candidate placements differ: %q vs %q", results[0].Placement, results[1].Placement)
	}
	for _, result := range results {
		payload, err := json.Marshal(result)
		if err != nil {
			t.Fatalf("marshal %s result: %v", result.Candidate, err)
		}
		t.Logf("PHASE3_RESULT %s", payload)
	}
}

func runLivePhase3Candidate(
	t *testing.T,
	ctx context.Context,
	providerToken string,
	runID string,
	inputs liveRuntimeInstallInputs,
	candidate livePhase3Candidate,
) livePhase3Result {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("phase3-access:" + runID + ":" + string(candidate))
	if err != nil {
		t.Fatalf("derive %s identity: %v", candidate, err)
	}
	adapter, err := NewAdapter(providerToken)
	if err != nil {
		t.Fatalf("NewAdapter: %v", err)
	}
	defer destroyLivePhase3Runtime(t, adapter, identity.Name)

	observation := createLiveRuntime(t, ctx, adapter, identity, string(candidate))
	serverVersion, err := adapter.ServerVersion(ctx, identity.Name)
	if err != nil {
		t.Fatalf("provider server version: %v", err)
	}
	uploadLiveReleaseVerifier(t, ctx, adapter, identity.Name, inputs)
	loop := runtimeinstall.Loop{
		Provider:           adapter,
		Verifier:           runtimeinstall.MinisignVerifier{},
		RemoteVerifierPath: inputs.remoteVerifierPath,
	}
	installResult, err := loop.Install(ctx, runtimeinstall.InstallRequest{
		RuntimeName:    identity.Name,
		Desired:        inputs.artifact,
		HealthAttempts: 60,
		HealthInterval: 2 * time.Second,
	})
	if err != nil || !installResult.Health.OK {
		t.Fatalf("install signed runtime: result=%+v err=%v", installResult.Health, err)
	}

	access := runtimeprovider.URLAccessPublic
	if candidate == livePhase3CandidateB {
		access = runtimeprovider.URLAccessAuthenticated
	}
	if err := adapter.ConfigureURL(ctx, identity.Name, access); err != nil {
		t.Fatalf("configure %s URL: %v", candidate, err)
	}
	observation = inspectRequiredRuntime(t, ctx, adapter, identity.Name)
	if observation.URLAccess != access {
		t.Fatalf("URL access = %q, want %q", observation.URLAccess, access)
	}

	countingDialer := &livePhase3CountingDialer{dialer: adapter}
	privateTransport, err := runtimeaccess.NewPrivateHTTPTransport(countingDialer, identity.Name, "127.0.0.1:7345")
	if err != nil {
		t.Fatalf("private transport: %v", err)
	}
	defer privateTransport.CloseIdleConnections()
	privateClient := &http.Client{Transport: privateTransport, Timeout: 20 * time.Second}
	firstDevice := pairLivePhase3Device(t, ctx, adapter, identity.Name, installResult.Installed.BinaryPath, privateClient, "Phase 3 device one")

	if candidate == livePhase3CandidateA {
		privateTransport.CloseIdleConnections()
		return measureLivePhase3CandidateA(t, ctx, adapter, newSDKClient(providerToken), observation, serverVersion, installResult.Installed.BinaryPath, firstDevice)
	}
	return measureLivePhase3CandidateB(t, ctx, adapter, newSDKClient(providerToken), observation, serverVersion, installResult.Installed.BinaryPath, privateTransport, privateClient, countingDialer, firstDevice)
}

type livePhase3Device struct {
	ID    string
	Token string
}

func pairLivePhase3Device(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	runtimeName string,
	binaryPath string,
	client *http.Client,
	displayName string,
) livePhase3Device {
	t.Helper()
	result := mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        binaryPath,
		Arguments:   []string{"pair", "--app-data-dir", runtimeinstall.DefaultLayout().RuntimeStateDir},
	})
	var pairingURL string
	for field := range strings.FieldsSeq(string(result.Stdout)) {
		if strings.HasPrefix(field, "setta://pair?") {
			pairingURL = field
			break
		}
	}
	parsed, err := url.Parse(pairingURL)
	if err != nil || parsed.Query().Get("tok") == "" {
		t.Fatal("remote pairing command did not return a valid one-time token")
	}
	var paired httpapi.CompletePairingResponse
	livePhase3JSONRequest(t, client, http.MethodPost, "http://localhost:7345/pairing/complete", "", httpapi.CompletePairingRequest{
		PairingToken:      parsed.Query().Get("tok"),
		ClientDisplayName: displayName,
	}, http.StatusOK, &paired)
	if paired.DeviceID == "" || paired.DeviceToken == "" {
		t.Fatal("pairing response omitted device credentials")
	}
	return livePhase3Device{ID: paired.DeviceID, Token: paired.DeviceToken}
}

func measureLivePhase3CandidateA(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	providerClient *sdkClient,
	observation runtimeprovider.RuntimeObservation,
	serverVersion string,
	binaryPath string,
	firstDevice livePhase3Device,
) livePhase3Result {
	t.Helper()
	transport := http.DefaultTransport.(*http.Transport).Clone()
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 20 * time.Second}
	baseURL := strings.TrimRight(observation.URL, "/")
	warmWake := livePhase3MeasureWarmWakes(t, ctx, adapter, providerClient, observation.Name, client, baseURL, firstDevice.Token, func() {
		client.CloseIdleConnections()
		transport.CloseIdleConnections()
	})

	client.CloseIdleConnections()
	transport.CloseIdleConnections()
	time.Sleep(time.Second)
	suspendLivePhase3Runtime(t, ctx, adapter, providerClient, observation.Name)
	status, body, _ := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", "", nil)
	time.Sleep(time.Second)
	afterWake := inspectRequiredRuntime(t, ctx, adapter, observation.Name)
	metrics := livePhase3MeasureTraffic(t, client, baseURL, firstDevice.Token)

	privateTransport, err := runtimeaccess.NewPrivateHTTPTransport(adapter, observation.Name, "127.0.0.1:7345")
	if err != nil {
		t.Fatalf("rotation private transport: %v", err)
	}
	defer privateTransport.CloseIdleConnections()
	secondDevice := pairLivePhase3Device(t, ctx, adapter, observation.Name, binaryPath, &http.Client{Transport: privateTransport, Timeout: 20 * time.Second}, "Phase 3 device two")
	revocationDuration, revocationObserved := livePhase3MeasureRuntimeRevocation(t, client, baseURL, firstDevice, secondDevice)
	newStatus, newBody, _ := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", secondDevice.Token, nil)
	oldStatus, oldBody, _ := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", firstDevice.Token, nil)

	rateStatus := 0
	for range 12 {
		rateStatus, _, _ = livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", livePhase3Secret(t), nil)
	}
	mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: observation.Name,
		Path:        binaryPath,
		Arguments:   []string{"devices", "revoke", "--app-data-dir", runtimeinstall.DefaultLayout().RuntimeStateDir, secondDevice.ID},
	})
	suspensionStatus, suspensionBody, _ := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", secondDevice.Token, nil)

	return livePhase3Result{
		Candidate:                  livePhase3CandidateA,
		RuntimeName:                observation.Name,
		Placement:                  observation.Placement,
		ProviderServer:             serverVersion,
		URLAccess:                  observation.URLAccess,
		HTTPP95Milliseconds:        livePhase3Millis(livePhase3P95(metrics.http)),
		SSEFirstEventP95Millis:     livePhase3Millis(livePhase3P95(metrics.sse)),
		ReconnectP95Milliseconds:   livePhase3Millis(livePhase3P95(metrics.sse)),
		WarmWakeP95Milliseconds:    livePhase3Millis(livePhase3P95(warmWake)),
		UnauthenticatedStatus:      status,
		UnauthenticatedWokeRuntime: afterWake.Activity == runtimeprovider.RuntimeActivityActive,
		RevocationMilliseconds:     livePhase3Millis(revocationDuration),
		RevocationObserved:         revocationObserved,
		RevocationWithinBudget:     revocationObserved && revocationDuration <= livePhase3RevocationBudget,
		RotationPassed:             newStatus == http.StatusOK && oldStatus == http.StatusUnauthorized,
		SuspensionStatus:           suspensionStatus,
		RateLimitStatus:            rateStatus,
		CredentialLeakObserved:     livePhase3ContainsSecrets(append(body, append(newBody, append(oldBody, suspensionBody...)...)...), firstDevice.Token, secondDevice.Token),
		Notes: []string{
			"SSE metric uses the production Codex account snapshot-required event; it does not prove conversation cursor replay.",
			"Candidate A has no central pre-wake suspension or rate-limit boundary; both checks reached the runtime.",
		},
	}
}

func measureLivePhase3CandidateB(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	providerClient *sdkClient,
	observation runtimeprovider.RuntimeObservation,
	serverVersion string,
	binaryPath string,
	privateTransport *http.Transport,
	privateClient *http.Client,
	countingDialer *livePhase3CountingDialer,
	firstDevice livePhase3Device,
) livePhase3Result {
	t.Helper()
	authorizer := newLivePhase3Authorizer(observation.Name)
	clientTokenOne := livePhase3Secret(t)
	authorizer.allow(clientTokenOne)
	routes := &livePhase3RouteResolver{
		runtimeName: observation.Name,
		authority:   "localhost:7345",
		transport:   privateTransport,
		credential:  firstDevice.Token,
	}
	gateway, err := runtimeaccess.NewGateway(runtimeaccess.GatewayConfig{
		Authorizer: authorizer,
		Observer: runtimeaccess.GatewayObserverFunc(func(
			runtimeaccess.GatewayRequestObservation,
		) {
		}),
		Routes: routes,
	})
	if err != nil {
		t.Fatalf("NewGateway: %v", err)
	}
	gatewayHTTPServer, err := runtimeaccess.NewGatewayHTTPServer(gateway)
	if err != nil {
		t.Fatalf("NewGatewayHTTPServer: %v", err)
	}
	gatewayServer := httptest.NewServer(gatewayHTTPServer.Handler)
	defer gatewayServer.Close()
	client := gatewayServer.Client()
	client.Timeout = 20 * time.Second
	warmWake := livePhase3MeasureWarmWakes(t, ctx, adapter, providerClient, observation.Name, client, gatewayServer.URL, clientTokenOne, func() {
		client.CloseIdleConnections()
		privateTransport.CloseIdleConnections()
	})

	client.CloseIdleConnections()
	privateTransport.CloseIdleConnections()
	time.Sleep(time.Second)
	suspendLivePhase3Runtime(t, ctx, adapter, providerClient, observation.Name)
	routesBefore := routes.calls.Load()
	dialsBefore := countingDialer.calls.Load()
	unauthStatus, unauthBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", "", nil)
	time.Sleep(time.Second)
	afterDenied := inspectRequiredRuntime(t, ctx, adapter, observation.Name)
	unauthOpened := routes.calls.Load() != routesBefore || countingDialer.calls.Load() != dialsBefore
	metrics := livePhase3MeasureTraffic(t, client, gatewayServer.URL, clientTokenOne)

	secondDevice := pairLivePhase3Device(t, ctx, adapter, observation.Name, binaryPath, privateClient, "Phase 3 device two")
	routes.setCredential(secondDevice.Token)
	revokeLivePhase3Device(t, client, gatewayServer.URL, clientTokenOne, firstDevice.ID)
	oldRuntimeStatus, oldRuntimeBody, _ := livePhase3RawRequest(t, privateClient, http.MethodGet, "http://localhost:7345/workspace-session", firstDevice.Token, nil)
	newRuntimeStatus, newRuntimeBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", clientTokenOne, nil)

	stream := openLivePhase3SSE(t, client, gatewayServer.URL, clientTokenOne)
	revocationStarted := time.Now()
	authorizer.revoke(clientTokenOne)
	revocationDuration, revocationObserved := stream.waitForClose(t, livePhase3RevocationWait)
	if revocationObserved {
		revocationDuration = time.Since(revocationStarted)
	}
	routesBefore = routes.calls.Load()
	dialsBefore = countingDialer.calls.Load()
	revokedStatus, revokedBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", clientTokenOne, nil)
	revokedOpened := routes.calls.Load() != routesBefore || countingDialer.calls.Load() != dialsBefore

	clientTokenTwo := livePhase3Secret(t)
	authorizer.allow(clientTokenTwo)
	rotatedStatus, rotatedBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", clientTokenTwo, nil)
	authorizer.suspend(clientTokenTwo)
	routesBefore = routes.calls.Load()
	dialsBefore = countingDialer.calls.Load()
	suspensionStatus, suspensionBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", clientTokenTwo, nil)
	suspensionOpened := routes.calls.Load() != routesBefore || countingDialer.calls.Load() != dialsBefore

	rateToken := livePhase3Secret(t)
	authorizer.rateLimit(rateToken)
	routesBefore = routes.calls.Load()
	dialsBefore = countingDialer.calls.Load()
	rateStatus, rateBody, _ := livePhase3RawRequest(t, client, http.MethodGet, gatewayServer.URL+"/workspace-session", rateToken, nil)
	rateOpened := routes.calls.Load() != routesBefore || countingDialer.calls.Load() != dialsBefore

	allBodies := bytes.Join([][]byte{unauthBody, oldRuntimeBody, newRuntimeBody, revokedBody, rotatedBody, suspensionBody, rateBody}, nil)
	return livePhase3Result{
		Candidate:                  livePhase3CandidateB,
		RuntimeName:                observation.Name,
		Placement:                  observation.Placement,
		ProviderServer:             serverVersion,
		URLAccess:                  observation.URLAccess,
		HTTPP95Milliseconds:        livePhase3Millis(livePhase3P95(metrics.http)),
		SSEFirstEventP95Millis:     livePhase3Millis(livePhase3P95(metrics.sse)),
		ReconnectP95Milliseconds:   livePhase3Millis(livePhase3P95(metrics.sse)),
		WarmWakeP95Milliseconds:    livePhase3Millis(livePhase3P95(warmWake)),
		UnauthenticatedStatus:      unauthStatus,
		UnauthenticatedWokeRuntime: afterDenied.Activity == runtimeprovider.RuntimeActivityActive,
		RevocationMilliseconds:     livePhase3Millis(revocationDuration),
		RevocationObserved:         revocationObserved,
		RevocationWithinBudget:     revocationObserved && revocationDuration <= livePhase3RevocationBudget,
		RotationPassed:             oldRuntimeStatus == http.StatusUnauthorized && newRuntimeStatus == http.StatusOK && revokedStatus == http.StatusUnauthorized && !revokedOpened && rotatedStatus == http.StatusOK,
		SuspensionStatus:           suspensionStatus,
		SuspensionOpenedTransport:  suspensionOpened,
		RateLimitStatus:            rateStatus,
		RateLimitOpenedTransport:   rateOpened,
		CredentialLeakObserved:     livePhase3ContainsSecrets(allBodies, firstDevice.Token, secondDevice.Token, clientTokenOne, clientTokenTwo, rateToken),
		ProxyDials:                 countingDialer.calls.Load(),
		Notes: []string{
			fmt.Sprintf("Denied request opened route or transport: %t.", unauthOpened),
			"SSE metric uses the production Codex account snapshot-required event; it does not prove conversation cursor replay.",
			"Gateway ran on the test client host; production gateway region, operating cost, and bandwidth remain unmeasured.",
		},
	}
}

type livePhase3TrafficMetrics struct {
	http []time.Duration
	sse  []time.Duration
}

func livePhase3MeasureTraffic(t *testing.T, client *http.Client, baseURL string, credential string) livePhase3TrafficMetrics {
	t.Helper()
	metrics := livePhase3TrafficMetrics{}
	for range livePhase3HTTPMeasurements {
		status, _, duration := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", credential, nil)
		if status != http.StatusOK {
			t.Fatalf("protected HTTP status = %d", status)
		}
		metrics.http = append(metrics.http, duration)
	}
	for range livePhase3SSEMeasurements {
		stream := openLivePhase3SSE(t, client, baseURL, credential)
		metrics.sse = append(metrics.sse, stream.firstEventDuration)
		stream.cancel()
		stream.body.Close()
	}
	return metrics
}

func livePhase3MeasureWarmWakes(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	providerClient *sdkClient,
	runtimeName string,
	client *http.Client,
	baseURL string,
	credential string,
	closeIdle func(),
) []time.Duration {
	t.Helper()
	var measurements []time.Duration
	for range 5 {
		closeIdle()
		time.Sleep(500 * time.Millisecond)
		suspendLivePhase3Runtime(t, ctx, adapter, providerClient, runtimeName)
		status, _, duration := livePhase3RawRequest(t, client, http.MethodGet, baseURL+"/workspace-session", credential, nil)
		if status != http.StatusOK {
			t.Fatalf("warm wake status = %d", status)
		}
		measurements = append(measurements, duration)
	}
	return measurements
}

func suspendLivePhase3Runtime(t *testing.T, ctx context.Context, adapter *Adapter, client *sdkClient, runtimeName string) {
	t.Helper()
	response, _, err := client.requestAPI(ctx, http.MethodPost, "/v1/sprites/"+url.PathEscape(runtimeName)+"/suspend")
	if err != nil {
		t.Fatalf("suspend Sprite: %v", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		t.Fatalf("suspend Sprite status = %d", response.StatusCode)
	}
	started := time.Now()
	deadline := started.Add(60 * time.Second)
	lastLoggedSecond := -1
	for time.Now().Before(deadline) {
		observation := inspectRequiredRuntime(t, ctx, adapter, runtimeName)
		if observation.Activity != runtimeprovider.RuntimeActivityActive {
			t.Logf("Sprite suspended after %.3fs with activity=%s", time.Since(started).Seconds(), observation.Activity)
			return
		}
		elapsedSecond := int(time.Since(started).Seconds())
		if elapsedSecond/10 != lastLoggedSecond/10 {
			t.Logf("waiting for suspend elapsed=%ds activity=%s", elapsedSecond, observation.Activity)
			lastLoggedSecond = elapsedSecond
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("Sprite did not leave active state after suspend")
}

type livePhase3SSEStream struct {
	body               io.ReadCloser
	reader             *bufio.Reader
	cancel             context.CancelFunc
	firstEventDuration time.Duration
}

func openLivePhase3SSE(t *testing.T, client *http.Client, baseURL string, credential string) livePhase3SSEStream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/codex/account/events", nil)
	if err != nil {
		cancel()
		t.Fatalf("create SSE request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	started := time.Now()
	response, err := client.Do(request)
	if err != nil {
		cancel()
		t.Fatalf("open SSE: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		response.Body.Close()
		cancel()
		t.Fatalf("open SSE status=%d body=%q", response.StatusCode, payload)
	}
	reader := bufio.NewReader(response.Body)
	foundData := false
	for !foundData {
		line, err := reader.ReadString('\n')
		if err != nil {
			response.Body.Close()
			cancel()
			t.Fatalf("read first SSE event: %v", err)
		}
		foundData = strings.HasPrefix(line, "data: ")
	}
	return livePhase3SSEStream{body: response.Body, reader: reader, cancel: cancel, firstEventDuration: time.Since(started)}
}

func (stream livePhase3SSEStream) waitForClose(t *testing.T, timeout time.Duration) (time.Duration, bool) {
	t.Helper()
	started := time.Now()
	done := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, stream.reader)
		close(done)
	}()
	select {
	case <-done:
		stream.cancel()
		stream.body.Close()
		return time.Since(started), true
	case <-time.After(timeout):
		stream.cancel()
		stream.body.Close()
		<-done
		return timeout, false
	}
}

func livePhase3MeasureRuntimeRevocation(
	t *testing.T,
	client *http.Client,
	baseURL string,
	first livePhase3Device,
	second livePhase3Device,
) (time.Duration, bool) {
	t.Helper()
	stream := openLivePhase3SSE(t, client, baseURL, first.Token)
	started := time.Now()
	revokeLivePhase3Device(t, client, baseURL, second.Token, first.ID)
	duration, observed := stream.waitForClose(t, livePhase3RevocationWait)
	if observed {
		return time.Since(started), true
	}
	return duration, false
}

func revokeLivePhase3Device(t *testing.T, client *http.Client, baseURL string, credential string, deviceID string) {
	t.Helper()
	var response httpapi.RevokeDeviceResponse
	livePhase3JSONRequest(t, client, http.MethodPost, baseURL+"/devices/revoke", credential, httpapi.RevokeDeviceRequest{DeviceID: deviceID}, http.StatusOK, &response)
	if response.Device.ID != deviceID {
		t.Fatalf("revoked device = %q, want %q", response.Device.ID, deviceID)
	}
}

func livePhase3JSONRequest(t *testing.T, client *http.Client, method string, requestURL string, credential string, payload any, wantStatus int, target any) {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		t.Fatalf("encode request: %v", err)
	}
	status, responseBody, _ := livePhase3RawRequest(t, client, method, requestURL, credential, &body)
	if status != wantStatus {
		t.Fatalf("%s %s status=%d want=%d body=%q", method, requestURL, status, wantStatus, responseBody)
	}
	if target != nil {
		if err := json.Unmarshal(responseBody, target); err != nil {
			t.Fatalf("decode %s response: %v", requestURL, err)
		}
	}
}

func livePhase3RawRequest(t *testing.T, client *http.Client, method string, requestURL string, credential string, body io.Reader) (int, []byte, time.Duration) {
	t.Helper()
	request, err := http.NewRequestWithContext(context.Background(), method, requestURL, body)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	started := time.Now()
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("request %s: %v", requestURL, err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	return response.StatusCode, responseBody, time.Since(started)
}

type livePhase3CountingDialer struct {
	dialer runtimeprovider.PrivateAccessDialer
	calls  atomic.Int64
}

func (dialer *livePhase3CountingDialer) DialPrivateRuntime(ctx context.Context, runtimeName string, network string, address string) (net.Conn, error) {
	dialer.calls.Add(1)
	return dialer.dialer.DialPrivateRuntime(ctx, runtimeName, network, address)
}

type livePhase3RouteResolver struct {
	runtimeName string
	authority   string
	transport   http.RoundTripper
	calls       atomic.Int64
	mu          sync.RWMutex
	credential  string
}

func (resolver *livePhase3RouteResolver) ResolveRuntimeRoute(context.Context, string) (runtimeaccess.RuntimeRoute, error) {
	resolver.calls.Add(1)
	resolver.mu.RLock()
	defer resolver.mu.RUnlock()
	return runtimeaccess.RuntimeRoute{
		RuntimeName:       resolver.runtimeName,
		UpstreamAuthority: resolver.authority,
		RuntimeCredential: resolver.credential,
		Transport:         resolver.transport,
	}, nil
}

func (resolver *livePhase3RouteResolver) setCredential(credential string) {
	resolver.mu.Lock()
	defer resolver.mu.Unlock()
	resolver.credential = credential
}

type livePhase3Grant struct {
	outcome     runtimeaccess.AuthorizationOutcome
	invalidated chan struct{}
	closed      bool
}

type livePhase3Authorizer struct {
	runtimeName string
	mu          sync.Mutex
	grants      map[string]*livePhase3Grant
}

func newLivePhase3Authorizer(runtimeName string) *livePhase3Authorizer {
	return &livePhase3Authorizer{runtimeName: runtimeName, grants: map[string]*livePhase3Grant{}}
}

func (authorizer *livePhase3Authorizer) AuthorizeClient(_ context.Context, credential string) (runtimeaccess.ClientAuthorization, error) {
	authorizer.mu.Lock()
	defer authorizer.mu.Unlock()
	grant, ok := authorizer.grants[credential]
	if !ok {
		return runtimeaccess.ClientAuthorization{Outcome: runtimeaccess.AuthorizationUnauthorized}, nil
	}
	if grant.outcome != runtimeaccess.AuthorizationAllowed {
		return runtimeaccess.ClientAuthorization{Outcome: grant.outcome}, nil
	}
	return runtimeaccess.ClientAuthorization{
		Outcome:     grant.outcome,
		RuntimeName: authorizer.runtimeName,
		Invalidated: grant.invalidated,
	}, nil
}

func (authorizer *livePhase3Authorizer) allow(credential string) {
	authorizer.set(credential, runtimeaccess.AuthorizationAllowed)
}

func (authorizer *livePhase3Authorizer) rateLimit(credential string) {
	authorizer.set(credential, runtimeaccess.AuthorizationRateLimited)
}

func (authorizer *livePhase3Authorizer) set(credential string, outcome runtimeaccess.AuthorizationOutcome) {
	authorizer.mu.Lock()
	defer authorizer.mu.Unlock()
	authorizer.grants[credential] = &livePhase3Grant{outcome: outcome, invalidated: make(chan struct{})}
}

func (authorizer *livePhase3Authorizer) revoke(credential string) {
	authorizer.update(credential, runtimeaccess.AuthorizationRevoked)
}

func (authorizer *livePhase3Authorizer) suspend(credential string) {
	authorizer.update(credential, runtimeaccess.AuthorizationSuspended)
}

func (authorizer *livePhase3Authorizer) update(credential string, outcome runtimeaccess.AuthorizationOutcome) {
	authorizer.mu.Lock()
	defer authorizer.mu.Unlock()
	grant := authorizer.grants[credential]
	grant.outcome = outcome
	if !grant.closed {
		close(grant.invalidated)
		grant.closed = true
	}
}

func livePhase3Secret(t *testing.T) string {
	t.Helper()
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		t.Fatalf("generate test credential: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func livePhase3P95(values []time.Duration) time.Duration {
	values = slices.Clone(values)
	slices.Sort(values)
	index := (95*len(values)+99)/100 - 1
	return values[index]
}

func livePhase3Millis(duration time.Duration) float64 {
	return float64(duration.Microseconds()) / 1000
}

func livePhase3ContainsSecrets(body []byte, secrets ...string) bool {
	for _, secret := range secrets {
		if secret != "" && bytes.Contains(body, []byte(secret)) {
			return true
		}
	}
	return false
}

func destroyLivePhase3Runtime(t *testing.T, adapter *Adapter, runtimeName string) {
	t.Helper()
	cleanupCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := adapter.Destroy(cleanupCtx, runtimeName); err != nil {
		t.Errorf("destroy %s: %v", runtimeName, err)
		return
	}
	_, found, err := adapter.Inspect(cleanupCtx, runtimeName)
	if err != nil {
		t.Errorf("verify destroy %s: %v", runtimeName, err)
		return
	}
	if found {
		t.Errorf("verify destroy %s: still present", runtimeName)
	}
}

var _ runtimeaccess.ClientAuthorizer = (*livePhase3Authorizer)(nil)
var _ runtimeaccess.RuntimeRouteResolver = (*livePhase3RouteResolver)(nil)
var _ runtimeprovider.PrivateAccessDialer = (*livePhase3CountingDialer)(nil)
