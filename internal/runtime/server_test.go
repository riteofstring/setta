package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/runtimeauth"
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
	server := newHTTPServer(DefaultConfig(), runtimeServices{})

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
		"relative CLI dir":  withBundledSettaCLIDir(t, "relative-cli-dir"),
		"bad chat harness":  withChatHarness(t, "unsupported"),
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

func TestBundledSettaCLIDirValidationRequiresExecutable(t *testing.T) {
	dir := t.TempDir()
	config := testConfig(t)
	config.BundledSettaCLIDir = dir

	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "bundled setta CLI executable is missing") {
		t.Fatalf("validate missing bundled CLI error = %v, want missing executable", err)
	}

	executable := bundledSettaCLIExecutablePath(dir)
	if err := os.WriteFile(executable, []byte("#!/bin/sh\n"), 0o644); err != nil {
		t.Fatalf("write bundled CLI fixture: %v", err)
	}
	if goruntime.GOOS != "windows" {
		if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "bundled setta CLI executable is not executable") {
			t.Fatalf("validate non-executable bundled CLI error = %v, want not executable", err)
		}
	}
	if err := os.Chmod(executable, 0o755); err != nil {
		t.Fatalf("chmod bundled CLI fixture: %v", err)
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("validate executable bundled CLI: %v", err)
	}
}

func TestCodexProcessEnvPrependsBundledSettaCLIDir(t *testing.T) {
	currentPath := filepath.Join(string(filepath.Separator), "usr", "bin")
	t.Setenv("PATH", currentPath)
	dir := filepath.Join(string(filepath.Separator), "opt", "setta", "bin")

	env := codexProcessEnvForBundledSettaCLI(dir)
	if len(env) != 1 {
		t.Fatalf("env entries = %v, want one PATH entry", env)
	}
	want := "PATH=" + dir + string(os.PathListSeparator) + currentPath
	if env[0] != want {
		t.Fatalf("PATH env = %q, want %q", env[0], want)
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

func withAppDataDir(t *testing.T, appDataDir string) Config {
	t.Helper()

	config := testConfig(t)
	config.AppDataDir = appDataDir
	return config
}

func withBundledSettaCLIDir(t *testing.T, dir string) Config {
	t.Helper()

	config := testConfig(t)
	config.BundledSettaCLIDir = dir
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
