package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/runtimeauth"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
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

func TestHTTPServerUsesBoundedReadConfiguration(t *testing.T) {
	server, err := newHTTPServer(DefaultConfig(), runtimeServices{})
	if err != nil {
		t.Fatalf("newHTTPServer: %v", err)
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
		"bad chat harness":  withChatHarness(t, "unsupported"),
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

func TestLocalCredentialIssuerRequiresExplicitConfiguration(t *testing.T) {
	config := testConfig(t)
	config.SkipBootstrapDeviceSession = true
	server, ready := startRuntimeTestServer(t, config)
	if ready.LocalPairingToken != "" {
		shutdownServer(t, server)
		t.Fatalf("local pairing token = %q without explicit configuration", ready.LocalPairingToken)
	}
	response := postRuntimeJSON[httpapi.ErrorResponse](t, http.DefaultClient, "http://"+ready.Addr, "/local-credentials/enroll", httpapi.LocalCredentialEnrollRequest{}, http.StatusNotFound)
	if response.Error.Code != "local_credential_issuer_disabled" {
		shutdownServer(t, server)
		t.Fatalf("disabled issuer error = %+v", response.Error)
	}
	shutdownServer(t, server)

	config = testConfig(t)
	config.EnableLocalCredentialIssuer = true
	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "legacy bootstrap") {
		t.Fatalf("Validate error = %v, want explicit bootstrap-session guard", err)
	}
}

func TestExplicitLocalCredentialIssuerEnrollsAndAuthenticates(t *testing.T) {
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
	enrolled := postRuntimeJSON[httpapi.LocalCredentialEnrollResponse](t, http.DefaultClient, baseURL, "/local-credentials/enroll", httpapi.LocalCredentialEnrollRequest{
		ClientDisplayName: "Local desktop",
		PairingToken:      ready.LocalPairingToken,
	}, http.StatusOK)
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
	refreshed := postRuntimeJSON[httpapi.LocalCredentialRefreshResponse](t, http.DefaultClient, baseURL, "/local-credentials/refresh", httpapi.LocalCredentialRefreshRequest{
		DeviceID:     enrolled.DeviceID,
		DeviceSecret: enrolled.DeviceSecret,
		RuntimeID:    enrolled.RuntimeID,
	}, http.StatusOK)
	if refreshed.Token == enrolled.RuntimeCredential.Token || refreshed.DeviceID != enrolled.DeviceID {
		t.Fatalf("refreshed local credential = %+v", refreshed)
	}
}

func TestStartServesSetupAttestationFromPersistentSeed(t *testing.T) {
	config := testConfig(t)
	config.Version = "v1.2.3"
	config.SkipBootstrapDeviceSession = true
	now := time.Now().UTC()
	identity, err := runtimeprovider.NewManagedIdentity("runtime-server-setup-attestation")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_runtime_012345",
		ReleaseVersion:  config.Version,
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-7777777777777777",
	}, now)
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(runtimesetup.SeedPath(config.AppDataDir), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}

	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)
	response := postRuntimeJSON[httpapi.SetupAttestationResponse](t, http.DefaultClient, "http://"+ready.Addr, "/setup/attestation", httpapi.SetupAttestationRequest{
		SetupID: seed.SetupID,
		Nonce:   "nonce-runtime-0123456789",
	}, http.StatusOK)
	if response.RuntimeName != identity.Name || response.ReleaseVersion != config.Version {
		t.Fatalf("setup attestation response = %+v", response)
	}
	if err := runtimesetup.VerifyAttestation(runtimesetup.Attestation{
		Algorithm:       response.Algorithm,
		BackendName:     response.BackendName,
		RuntimeID:       response.RuntimeID,
		RuntimeName:     response.RuntimeName,
		SetupID:         response.SetupID,
		ReleaseVersion:  response.ReleaseVersion,
		CredentialEpoch: uint64(response.CredentialEpoch),
		FeatureSet:      response.FeatureSet,
		Nonce:           response.Nonce,
		ExpiresAt:       response.ExpiresAt,
		Attestation:     response.Attestation,
	}, seed.AttestationKey); err != nil {
		t.Fatalf("VerifyAttestation: %v", err)
	}
}

func TestStartRestartPreservesIdentityAndAttestationReplayState(t *testing.T) {
	config := testConfig(t)
	config.Version = "v1.2.3"
	config.SkipBootstrapDeviceSession = true
	seed := writeRuntimeSetupSeed(t, config, "setup_restart_012345", "attestation-key-restart-0123456789")

	server, ready := startRuntimeTestServer(t, config)
	baseURL := "http://" + ready.Addr
	firstInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, baseURL, "/runtime/info")
	attestation := postRuntimeJSON[httpapi.SetupAttestationResponse](t, http.DefaultClient, baseURL, "/setup/attestation", httpapi.SetupAttestationRequest{
		SetupID: seed.SetupID,
		Nonce:   "nonce-restart-0123456789",
	}, http.StatusOK)
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
		t.Fatalf("VerifyAttestation: %v", err)
	}
	shutdownServer(t, server)

	restarted, restartedReady := startRuntimeTestServer(t, config)
	defer shutdownServer(t, restarted)
	restartedBaseURL := "http://" + restartedReady.Addr
	secondInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, restartedBaseURL, "/runtime/info")
	if secondInfo.RuntimeID != firstInfo.RuntimeID || secondInfo.DisplayName != firstInfo.DisplayName {
		t.Fatalf("runtime identity after restart = %+v, want %+v", secondInfo, firstInfo)
	}

	replay := postRuntimeJSON[httpapi.ErrorResponse](t, http.DefaultClient, restartedBaseURL, "/setup/attestation", httpapi.SetupAttestationRequest{
		SetupID: seed.SetupID,
		Nonce:   "nonce-restart-0123456789",
	}, http.StatusUnauthorized)
	if replay.Error.Code != "setup_attestation_replayed_nonce" {
		t.Fatalf("replay error code = %q, want setup_attestation_replayed_nonce", replay.Error.Code)
	}
}

func TestStartConfirmedColdWakeRestoresDiskStateAndDropsMemoryOnlyState(t *testing.T) {
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
	baseURL := "http://" + ready.Addr
	firstInfo := getRuntimeJSON[httpapi.RuntimeInfoResponse](t, http.DefaultClient, baseURL, "/runtime/info")
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
	if secondInfo.RuntimeID != firstInfo.RuntimeID || secondInfo.DisplayName != firstInfo.DisplayName {
		t.Fatalf("runtime identity after cold wake = %+v, want %+v", secondInfo, firstInfo)
	}
	if secondInfo.Diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusOK ||
		secondInfo.Diagnostics.SettaRelease.InstalledVersion != config.Version {
		t.Fatalf("release diagnostics after cold wake = %+v, want durable release metadata intact", secondInfo.Diagnostics.SettaRelease)
	}
	if secondInfo.Diagnostics.WorkloadLease.Active {
		t.Fatalf("workload lease after cold wake = %+v, want in-memory lease gone", secondInfo.Diagnostics.WorkloadLease)
	}
}

func TestInvalidStartupConfigurationFailsForE2EPostCommitStartupFailureEnv(t *testing.T) {
	t.Setenv(e2eChatFailPostCommitStartupPointEnv, "unsupported")

	_, err := Start(context.Background(), testConfig(t))
	if err == nil || !strings.Contains(err.Error(), "unsupported "+e2eChatFailPostCommitStartupPointEnv) {
		t.Fatalf("start error = %v, want unsupported post-commit startup failure point", err)
	}
}

func TestStartReportsReadyWithMalformedHistoricalRunState(t *testing.T) {
	var stdout bytes.Buffer
	config := testConfig(t)
	config.Stdout = &stdout
	config.Version = "test"

	runPath := filepath.Join(config.AppDataDir, "workspaces", "workspace_bad", "runs", "run_bad.json")
	if err := os.MkdirAll(filepath.Dir(runPath), 0o755); err != nil {
		t.Fatalf("create run dir: %v", err)
	}
	rawRun := `{"schemaVersion":1,"id":"run_bad","workspaceId":"workspace_bad","conversationId":"conversation_bad","triggerMessageId":"message_user","assistantMessageId":"message_assistant","harness":"codex","status":"completed","startedAt":"2026-05-29T20:00:00Z","completedAt":"2026-05-29T20:00:01Z","promptSummary":"prompt","error":"","pendingApproval":{"id":"approval_bad","runId":"run_bad","kind":"permission","title":"Permission","status":"pending","createdAt":"2026-05-29T20:00:00Z"}}`
	if err := os.WriteFile(runPath, []byte(rawRun), 0o644); err != nil {
		t.Fatalf("write malformed run: %v", err)
	}

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

func TestShutdownDrainsActiveChatTurnBeforeClosingEvents(t *testing.T) {
	config := testConfig(t)
	config.ChatHarness = ChatHarnessScriptedWorkflow
	server, ready := startRuntimeTestServer(t, config)
	shutdown := false
	defer func() {
		if !shutdown {
			shutdownServer(t, server)
		}
	}()

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput("workflow hold for queue and steering"),
	}, http.StatusOK)
	waitForRuntimeAssistantText(t, client, baseURL, opened.Workspace.ID, conversation.ID, result.Run.ID, "Workflow stream started.")

	shutdownServer(t, server)
	shutdown = true

	store, err := chat.NewStore(config.AppDataDir)
	if err != nil {
		t.Fatalf("open chat store: %v", err)
	}
	run, err := store.LoadRun(opened.Workspace.ID, result.Run.ID)
	if err != nil {
		t.Fatalf("load run after shutdown: %v", err)
	}
	if run.Status != chat.RunStatusFailed || run.Error != "run interrupted by backend shutdown" {
		t.Fatalf("run after shutdown = %+v, want backend shutdown failure", run)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	for _, diagnostic := range diagnostics {
		switch diagnostic.Code {
		case "fail_turn_transition_failed", "complete_turn_transition_failed", "cancel_turn_transition_failed", "terminal_turn_publish_failed":
			t.Fatalf("unexpected terminal transition diagnostic after shutdown: %+v", diagnostic)
		}
	}
}

func waitForRuntimeAssistantText(t *testing.T, client *http.Client, baseURL string, workspaceID string, conversationID string, runID string, want string) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	var lastPage chat.MessagePage
	for time.Now().Before(deadline) {
		page := postRuntimeJSON[chat.MessagePage](t, client, baseURL, "/chat/messages/page", httpapi.GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          40,
		}, http.StatusOK)
		lastPage = page
		for _, message := range page.Messages {
			if message.RunID == runID && message.Role == chat.RoleAssistant && strings.Contains(runtimeMessageText(t, message), want) {
				return
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for assistant text %q; last page = %+v", want, lastPage)
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

func writeRuntimeSetupSeed(t *testing.T, config Config, setupID string, attestationKey string) runtimesetup.Seed {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("runtime-server-" + setupID)
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         setupID,
		ReleaseVersion:  config.Version,
		CredentialEpoch: 1,
		AttestationKey:  attestationKey,
	}, time.Now().UTC())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(runtimesetup.SeedPath(config.AppDataDir), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	return seed
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

func withChatHarness(t *testing.T, harness ChatHarnessMode) Config {
	t.Helper()

	config := testConfig(t)
	config.ChatHarness = harness
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
