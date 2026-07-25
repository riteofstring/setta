package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/httpapi"
	"setta/internal/runtimeauth"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestStartReportsReadyAfterListenerIsBound(t *testing.T) {
	var stdout bytes.Buffer
	config := testConfig(t)
	config.Stdout = &stdout
	config.Version = "test"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	defer shutdownServer(t, server)

	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if ready.Event != "ready" {
		t.Fatalf("ready event = %q, want ready", ready.Event)
	}
	if ready.Addr != server.Addr() {
		t.Fatalf("ready addr = %q, want %q", ready.Addr, server.Addr())
	}
	if ready.BootstrapToken == "" {
		t.Fatal("ready bootstrap token is empty")
	}
	if ready.ProtocolVersion != httpapi.ProtocolVersion {
		t.Fatalf("ready protocol version = %d, want %d", ready.ProtocolVersion, httpapi.ProtocolVersion)
	}

	response, err := http.Get("http://" + ready.Addr + "/health")
	if err != nil {
		t.Fatalf("get health from ready addr: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}

func TestRuntimeServesDurableConversationNavigator(t *testing.T) {
	config := testConfig(t)
	store, err := conversation.NewStore(config.AppDataDir)
	if err != nil {
		t.Fatalf("create conversation store: %v", err)
	}
	topic := conversation.TopicConversation{
		ID:          "conversation-runtime",
		WorkspaceID: "workspace-runtime",
		Title:       "Runtime topic",
		Status:      conversation.ConversationStatusIdle,
		CreatedAt:   "2026-07-11T20:00:00Z",
		UpdatedAt:   "2026-07-11T20:00:00Z",
	}
	resolvedNarratorVoiceID := speech.SpeechVoiceAlloy
	_, err = store.Transact(context.Background(), "seed runtime navigator", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.InsertConversation(topic); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(
			conversation.ConversationPresentationProfile{
				ConversationID:          topic.ID,
				PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
				ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
				NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
				ResolvedNarratorVoiceID: &resolvedNarratorVoiceID,
				NarratorSpeechEnabled:   true,
				UpdatedAt:               topic.UpdatedAt,
			},
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "runtime-navigator-seeded",
			StreamID:    "conversation:" + topic.ID,
			Kind:        "conversation_state_changed",
			Payload:     topic,
			CommittedAt: topic.UpdatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed runtime navigator: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close seeded conversation store: %v", err)
	}

	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)
	page := postRuntimeJSON[conversation.NavigatorPage](
		t,
		authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second),
		"http://"+server.Addr(),
		"/conversations/navigator/list",
		httpapi.ListTopicConversationsRequest{WorkspaceID: topic.WorkspaceID, Limit: 80},
		http.StatusOK,
	)
	if len(page.Items) != 1 || page.Items[0].Conversation.ID != topic.ID {
		t.Fatalf("runtime navigator page = %+v", page)
	}
}

func TestHTTPServerUsesBoundedReadConfiguration(t *testing.T) {
	server, err := newHTTPServer(DefaultConfig(), runtimeServices{})
	if err != nil {
		t.Fatalf("create HTTP server: %v", err)
	}

	if server.ReadHeaderTimeout != httpReadHeaderTimeout {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", server.ReadHeaderTimeout, httpReadHeaderTimeout)
	}
	if server.ReadTimeout != httpReadTimeout {
		t.Fatalf("ReadTimeout = %s, want %s", server.ReadTimeout, httpReadTimeout)
	}
	if server.MaxHeaderBytes != httpMaxHeaderBytes {
		t.Fatalf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, httpMaxHeaderBytes)
	}
	if server.WriteTimeout != 0 {
		t.Fatalf("WriteTimeout = %s, want zero for event streams", server.WriteTimeout)
	}
}

func TestInvalidStartupConfigurationFails(t *testing.T) {
	tests := map[string]Config{
		"empty app data":    withAppDataDir(t, ""),
		"relative app data": withAppDataDir(t, "relative-app-data"),
		"bad origin":        withAllowedHTTPSOrigins(t, "http://runtime.gateway.example"),
		"bad request host":  withAllowedRequestHosts(t, "https://runtime.gateway.example"),
		"empty codex":       withCodexCommand(t, " "),
		"bad codex timeout": withCodexDiagnosticsTimeout(t, -time.Second),
		"bad disk minimum":  withMinimumDiskFreeMiB(t, -1),
		"relative policy":   withPolicyPath(t, "runtime-policy.json"),
		"empty host":        withHost(t, ""),
		"empty bootstrap":   withBootstrapDisplayName(t, ""),
		"non numeric host":  withHost(t, "localhost"),
		"non loopback host": withHost(t, "0.0.0.0"),
		"negative port":     withPort(t, -1),
		"large port":        withPort(t, 65536),
		"bad speech key":    withSpeech(t, speech.OpenAIClientConfig{APIKey: "secret value"}),
		"speech test URL":   withSpeech(t, speech.OpenAIClientConfig{BaseURL: "http://127.0.0.1:24891/v1"}),
		"empty version":     withVersion(t, ""),
	}

	for name, config := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := Start(context.Background(), config); err == nil {
				t.Fatal("start succeeded, want error")
			}
		})
	}
}

func TestStartAllowsConfiguredHTTPSOrigin(t *testing.T) {
	config := testConfig(t)
	config.AllowedHTTPSOrigins = []string{"https://runtime.gateway.example"}
	config.CodexCommand = filepath.Join(config.AppDataDir, "missing-codex")
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	request, err := http.NewRequest(http.MethodGet, "http://"+ready.Addr+"/runtime/info", nil)
	if err != nil {
		t.Fatalf("create runtime info request: %v", err)
	}
	request.Header.Set("Origin", "https://runtime.gateway.example")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get runtime info: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("runtime info status = %d, want 200", response.StatusCode)
	}
	if got := response.Header.Get("Access-Control-Allow-Origin"); got != "https://runtime.gateway.example" {
		t.Fatalf("allow origin = %q, want configured origin", got)
	}
}

func TestStartRejectsUnconfiguredHTTPSOrigin(t *testing.T) {
	config := testConfig(t)
	config.AllowedHTTPSOrigins = []string{"https://runtime.gateway.example"}
	config.CodexCommand = filepath.Join(config.AppDataDir, "missing-codex")
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	request, err := http.NewRequest(http.MethodGet, "http://"+ready.Addr+"/runtime/info", nil)
	if err != nil {
		t.Fatalf("create runtime info request: %v", err)
	}
	request.Header.Set("Origin", "https://other.gateway.example")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get runtime info: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("runtime info status = %d, want 403", response.StatusCode)
	}
}

func TestAllowRemotePermitsNonLoopbackNumericHost(t *testing.T) {
	config := testConfig(t)
	config.AllowRemote = true
	config.Host = "0.0.0.0"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend with allow remote: %v", err)
	}
	defer shutdownServer(t, server)
}

func TestStartAcceptsConfiguredSpeechClient(t *testing.T) {
	config := testConfig(t)
	config.Speech = speech.OpenAIClientConfig{APIKey: "sk-setta-speech-runtime-test"}

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend with configured speech client: %v", err)
	}
	defer shutdownServer(t, server)
}

func TestStartCanSkipBootstrapDeviceSession(t *testing.T) {
	var stdout bytes.Buffer
	config := testConfig(t)
	config.Stdout = &stdout
	config.SkipBootstrapDeviceSession = true

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	shutdownServer(t, server)

	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if ready.BootstrapToken != "" {
		t.Fatalf("ready bootstrap token = %q, want empty", ready.BootstrapToken)
	}

	store, err := runtimeauth.NewStore(config.AppDataDir)
	if err != nil {
		t.Fatalf("open runtime auth store: %v", err)
	}
	defer store.Close()
	sessions, err := store.ListDeviceSessions(context.Background())
	if err != nil {
		t.Fatalf("list device sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("device sessions = %+v, want none", sessions)
	}
}

func TestExplicitLocalCredentialIssuerEnrollsRefreshesAndAuthenticates(t *testing.T) {
	config := testConfig(t)
	config.EnableLocalCredentialIssuer = true
	config.SkipBootstrapDeviceSession = true
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)
	if ready.LocalPairingToken == "" || ready.BootstrapToken != "" {
		t.Fatalf("ready credentials = %+v", ready)
	}

	baseURL := "http://" + ready.Addr
	info := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, baseURL, "/runtime/info")
	enrolled := postRuntimeJSON[httpapi.LocalCredentialEnrollResponse](
		t,
		http.DefaultClient,
		baseURL,
		"/local-credentials/enroll",
		httpapi.LocalCredentialEnrollRequest{
			ClientDisplayName: "Local desktop",
			PairingToken:      ready.LocalPairingToken,
		},
		http.StatusOK,
	)
	if enrolled.RuntimeID != info.RuntimeID || enrolled.DeviceSecret == "" || enrolled.RuntimeCredential.Token == "" {
		t.Fatalf("local enrollment = %+v", enrolled)
	}

	authedClient := authenticatedRuntimeTestClient(enrolled.RuntimeCredential.Token, 5*time.Second)
	response, err := authedClient.Get(baseURL + "/appearance/settings")
	if err != nil {
		t.Fatalf("authenticated local credential request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("authenticated local credential status = %d", response.StatusCode)
	}

	refreshed := postRuntimeJSON[httpapi.LocalCredentialRefreshResponse](
		t,
		http.DefaultClient,
		baseURL,
		"/local-credentials/refresh",
		httpapi.LocalCredentialRefreshRequest{
			DeviceID:     enrolled.DeviceID,
			DeviceSecret: enrolled.DeviceSecret,
			RuntimeID:    enrolled.RuntimeID,
		},
		http.StatusOK,
	)
	if refreshed.Token == enrolled.RuntimeCredential.Token || refreshed.DeviceID != enrolled.DeviceID {
		t.Fatalf("refreshed local credential = %+v", refreshed)
	}
}

func TestLocalCredentialIssuerRequiresBootstrapDeviceSessionsDisabled(t *testing.T) {
	config := testConfig(t)
	config.EnableLocalCredentialIssuer = true
	if err := config.Validate(); err == nil {
		t.Fatal("local credential issuer with bootstrap device session validated")
	}
}

func TestStartServesSetupAttestationAndPersistsReplayState(t *testing.T) {
	config := testConfig(t)
	config.Version = "v1.2.3"
	config.SkipBootstrapDeviceSession = true
	seed := writeRuntimeSetupSeed(t, config, "setup_restart_012345", "attestation-key-restart-0123456789")

	server, ready := startRuntimeTestServer(t, config)
	baseURL := "http://" + ready.Addr
	firstInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, baseURL, "/runtime/info")
	if err := runtimecapability.ValidateRuntimeFeatureSet(firstInfo.FeatureSet); err != nil {
		shutdownServer(t, server)
		t.Fatalf("runtime feature set: %v", err)
	}
	attestation := postRuntimeJSON[httpapi.SetupAttestationResponse](
		t,
		http.DefaultClient,
		baseURL,
		"/setup/attestation",
		httpapi.SetupAttestationRequest{SetupID: seed.SetupID, Nonce: "nonce-restart-0123456789"},
		http.StatusOK,
	)
	if err := runtimesetup.VerifyAttestation(runtimesetup.Attestation{
		Algorithm:       attestation.Algorithm,
		BackendName:     attestation.BackendName,
		RuntimeID:       attestation.RuntimeID,
		RuntimeName:     attestation.RuntimeName,
		SetupID:         attestation.SetupID,
		ReleaseVersion:  attestation.ReleaseVersion,
		CredentialEpoch: uint64(attestation.CredentialEpoch),
		FeatureSet:      attestation.FeatureSet,
		Nonce:           attestation.Nonce,
		ExpiresAt:       attestation.ExpiresAt,
		Attestation:     attestation.Attestation,
	}, seed.AttestationKey); err != nil {
		shutdownServer(t, server)
		t.Fatalf("verify setup attestation: %v", err)
	}
	shutdownServer(t, server)

	restarted, restartedReady := startRuntimeTestServer(t, config)
	defer shutdownServer(t, restarted)
	restartedBaseURL := "http://" + restartedReady.Addr
	secondInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, restartedBaseURL, "/runtime/info")
	if secondInfo.RuntimeID != firstInfo.RuntimeID || secondInfo.DisplayName != firstInfo.DisplayName {
		t.Fatalf("runtime identity after restart = %+v, want %+v", secondInfo, firstInfo)
	}
	replay := postRuntimeJSON[httpapi.ErrorResponse](
		t,
		http.DefaultClient,
		restartedBaseURL,
		"/setup/attestation",
		httpapi.SetupAttestationRequest{SetupID: seed.SetupID, Nonce: "nonce-restart-0123456789"},
		http.StatusUnauthorized,
	)
	if replay.Error.Code != "setup_attestation_replayed_nonce" {
		t.Fatalf("replay error code = %q, want setup_attestation_replayed_nonce", replay.Error.Code)
	}
}

func TestStartColdWakeKeepsDurableReleaseAndDropsMemoryOnlyLease(t *testing.T) {
	config := testConfig(t)
	config.Version = "v1.2.3"
	config.SkipBootstrapDeviceSession = true
	writeRuntimeDiagnosticJSON(t, filepath.Join(config.AppDataDir, "runtime-install", "current.json"), map[string]any{
		"schemaVersion": 1,
		"version":       config.Version,
	})
	now := time.Now().UTC()
	config.WorkloadLeaseManager = &fakeRuntimeWorkloadLeaseManager{
		lease: runtimeprovider.WorkloadLease{
			Name:      config.WorkloadLeaseDiagnosticName,
			StartedAt: now.Add(-time.Minute),
			ExpiresAt: now.Add(time.Hour),
		},
		found: true,
	}

	server, ready := startRuntimeTestServer(t, config)
	firstInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, "http://"+ready.Addr, "/runtime/info")
	if firstInfo.Diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusOK ||
		!firstInfo.Diagnostics.WorkloadLease.Active {
		shutdownServer(t, server)
		t.Fatalf("initial runtime diagnostics = %+v", firstInfo.Diagnostics)
	}
	shutdownServer(t, server)

	coldConfig := config
	coldConfig.WorkloadLeaseManager = &fakeRuntimeWorkloadLeaseManager{}
	restarted, restartedReady := startRuntimeTestServer(t, coldConfig)
	defer shutdownServer(t, restarted)
	secondInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, "http://"+restartedReady.Addr, "/runtime/info")
	if secondInfo.Diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusOK ||
		secondInfo.Diagnostics.SettaRelease.InstalledVersion != config.Version {
		t.Fatalf("release diagnostics after cold wake = %+v", secondInfo.Diagnostics.SettaRelease)
	}
	if secondInfo.Diagnostics.WorkloadLease.Active {
		t.Fatalf("workload lease after cold wake = %+v, want in-memory lease gone", secondInfo.Diagnostics.WorkloadLease)
	}
}

func TestGracefulShutdownStopsServing(t *testing.T) {
	server, err := Start(context.Background(), testConfig(t))
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}

	shutdownServer(t, server)

	conn, err := net.DialTimeout("tcp", server.Addr(), 100*time.Millisecond)
	if err == nil {
		conn.Close()
		t.Fatalf("dial after shutdown succeeded")
	}
}

func shutdownServer(t *testing.T, server *Server) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), DefaultConfig().ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown backend: %v", err)
	}
	if err := server.Wait(); err != nil {
		t.Fatalf("wait for backend: %v", err)
	}
}

func startRuntimeTestServer(t *testing.T, config Config) (*Server, ReadyEvent) {
	t.Helper()

	var stdout bytes.Buffer
	config.Stdout = &stdout
	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		shutdownServer(t, server)
		t.Fatalf("decode ready event: %v", err)
	}
	return server, ready
}

func authenticatedRuntimeTestClient(token string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: runtimeTestAuthTransport{
			token: token,
			base:  http.DefaultTransport,
		},
	}
}

type runtimeTestAuthTransport struct {
	token string
	base  http.RoundTripper
}

func (transport runtimeTestAuthTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if transport.token == "" || request.Header.Get("Authorization") != "" {
		return transport.base.RoundTrip(request)
	}
	clone := request.Clone(request.Context())
	clone.Header = request.Header.Clone()
	clone.Header.Set("Authorization", "Bearer "+transport.token)
	return transport.base.RoundTrip(clone)
}

func testConfig(t *testing.T) Config {
	t.Helper()

	config := DefaultConfig()
	config.AppDataDir = t.TempDir()
	return config
}

func withAppDataDir(t *testing.T, appDataDir string) Config {
	t.Helper()

	config := testConfig(t)
	config.AppDataDir = appDataDir
	return config
}

func withHost(t *testing.T, host string) Config {
	t.Helper()

	config := testConfig(t)
	config.Host = host
	return config
}

func withAllowedHTTPSOrigins(t *testing.T, origins ...string) Config {
	t.Helper()
	config := testConfig(t)
	config.AllowedHTTPSOrigins = origins
	return config
}

func withAllowedRequestHosts(t *testing.T, hosts ...string) Config {
	t.Helper()
	config := testConfig(t)
	config.AllowedRequestHosts = hosts
	return config
}

func withCodexCommand(t *testing.T, command string) Config {
	t.Helper()
	config := testConfig(t)
	config.CodexCommand = command
	return config
}

func withCodexDiagnosticsTimeout(t *testing.T, timeout time.Duration) Config {
	t.Helper()
	config := testConfig(t)
	config.CodexDiagnosticsTimeout = timeout
	return config
}

func withMinimumDiskFreeMiB(t *testing.T, minimum int) Config {
	t.Helper()
	config := testConfig(t)
	config.MinimumDiskFreeMiB = minimum
	return config
}

func withPolicyPath(t *testing.T, path string) Config {
	t.Helper()
	config := testConfig(t)
	config.PolicyPath = path
	return config
}

func writeRuntimeSetupSeed(t *testing.T, config Config, setupID string, attestationKey string) runtimesetup.Seed {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("runtime-server-" + setupID)
	if err != nil {
		t.Fatalf("create managed identity: %v", err)
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         setupID,
		ReleaseVersion:  config.Version,
		CredentialEpoch: 1,
		AttestationKey:  attestationKey,
	}, time.Now().UTC())
	if err != nil {
		t.Fatalf("create setup seed: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(runtimesetup.SeedPath(config.AppDataDir), seed); err != nil {
		t.Fatalf("write setup seed: %v", err)
	}
	return seed
}

func withPort(t *testing.T, port int) Config {
	t.Helper()

	config := testConfig(t)
	config.Port = port
	return config
}

func withVersion(t *testing.T, version string) Config {
	t.Helper()

	config := testConfig(t)
	config.Version = version
	return config
}

func withBootstrapDisplayName(t *testing.T, displayName string) Config {
	t.Helper()

	config := testConfig(t)
	config.BootstrapDeviceDisplayName = displayName
	return config
}

func withSpeech(t *testing.T, speechConfig speech.OpenAIClientConfig) Config {
	t.Helper()

	config := testConfig(t)
	config.Speech = speechConfig
	return config
}
