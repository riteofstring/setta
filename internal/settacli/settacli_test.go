package settacli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"setta/internal/backendconn"
	"setta/internal/chat"
	"setta/internal/httpapi"
)

type testEnvelope[T any] struct {
	SchemaVersion int      `json:"schemaVersion"`
	Command       string   `json:"command"`
	Data          T        `json:"data"`
	Warnings      []string `json:"warnings"`
}

func TestDiscoveryCommandsDoNotRequireBackend(t *testing.T) {
	version := runJSONCommand[versionOutput](t, "", "version", "--json")
	if version.Data.Version == "" {
		t.Fatal("version is empty")
	}

	commands := runJSONCommand[commandsOutput](t, "", "commands", "--json")
	if len(commands.Data.Commands) == 0 {
		t.Fatal("commands output is empty")
	}
	assertCommandExists(t, commands.Data.Commands, []string{"workspace", "open"})
	assertCommandExists(t, commands.Data.Commands, []string{"api", "endpoints"})

	help := runJSONCommand[helpOutput](t, "", "help", "workspace", "open", "--json")
	if help.Data.Command.OutputSchemaName != "OpenWorkspaceResponse" {
		t.Fatalf("workspace open output schema = %q", help.Data.Command.OutputSchemaName)
	}

	schema := runJSONCommand[schemaOutput](t, "", "schema", "workspace", "open", "--json")
	if schema.Data.InputSchema["title"] != "OpenWorkspaceRequest" {
		t.Fatalf("schema input title = %v, want OpenWorkspaceRequest", schema.Data.InputSchema["title"])
	}

	errors := runJSONCommand[errorsOutput](t, "", "errors", "--json")
	if len(errors.Data.ExitCodes) != 10 {
		t.Fatalf("exit code count = %d, want 10", len(errors.Data.ExitCodes))
	}
}

func TestJSONErrorEnvelopeGoesToStdout(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run([]string{"workspace", "open", t.TempDir(), "--json"}, strings.NewReader(""), &stdout, &stderr, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: t.TempDir(),
	}))
	if exitCode != exitBackendUnavailable {
		t.Fatalf("exit code = %d, want %d", exitCode, exitBackendUnavailable)
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %q, want empty", stderr.String())
	}
	var envelope errorEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &envelope); err != nil {
		t.Fatalf("decode error envelope: %v", err)
	}
	if envelope.Error.Code != "backend_unavailable" || !envelope.Error.Retryable {
		t.Fatalf("error envelope = %+v, want backend_unavailable retryable", envelope.Error)
	}
}

func TestHumanErrorGoesToStderr(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run([]string{"workspace", "open", t.TempDir()}, strings.NewReader(""), &stdout, &stderr, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: t.TempDir(),
	}))
	if exitCode != exitBackendUnavailable {
		t.Fatalf("exit code = %d, want %d", exitCode, exitBackendUnavailable)
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	if !strings.Contains(stderr.String(), missingBackendConnectionMessage) {
		t.Fatalf("stderr = %q, want backend connection diagnostic", stderr.String())
	}
}

func TestBackendConnectionResolutionPrecedence(t *testing.T) {
	flagServer := newBackendConnectionTestServer(t, "flag-token")
	envServer := newBackendConnectionTestServer(t, "env-token")
	runtimeServer := newBackendConnectionTestServer(t, "runtime-token")
	appDataDir := t.TempDir()
	writeTestRuntimeConnection(t, appDataDir, runtimeServer.URL, "runtime-token", os.Getpid())

	context := newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AddrEnv:       envServer.URL,
		backendconn.TokenEnv:      "env-token",
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals = Globals{
		BackendAddr:  flagServer.URL,
		BackendToken: "flag-token",
		Timeout:      time.Second,
	}
	connection, err := context.resolveBackendConnection(true)
	if err != nil {
		t.Fatalf("resolve flag connection: %v", err)
	}
	if connection.Source != "flags" || connection.Addr != flagServer.URL || !connection.Authenticated {
		t.Fatalf("flag connection = %+v", connection)
	}

	context = newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AddrEnv:       envServer.URL,
		backendconn.TokenEnv:      "env-token",
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second
	connection, err = context.resolveBackendConnection(true)
	if err != nil {
		t.Fatalf("resolve env connection: %v", err)
	}
	if connection.Source != "environment" || connection.Addr != envServer.URL || !connection.Authenticated {
		t.Fatalf("env connection = %+v", connection)
	}

	context = newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second
	connection, err = context.resolveBackendConnection(true)
	if err != nil {
		t.Fatalf("resolve runtime connection: %v", err)
	}
	if connection.Source != "runtime_file" || connection.Addr != runtimeServer.URL || !connection.Authenticated {
		t.Fatalf("runtime connection = %+v", connection)
	}
}

func TestBackendConnectionReportsMissingRuntimeFile(t *testing.T) {
	context := newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: t.TempDir(),
	}))
	context.Globals.Timeout = time.Second

	_, err := context.resolveBackendConnection(true)
	if err == nil || err.Error() != missingBackendConnectionMessage {
		t.Fatalf("missing connection error = %v, want %q", err, missingBackendConnectionMessage)
	}
}

func TestBackendConnectionRejectsMalformedRuntimeFile(t *testing.T) {
	appDataDir := t.TempDir()
	path := backendconn.RuntimeFilePath(appDataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create runtime dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatalf("write malformed runtime file: %v", err)
	}
	context := newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second

	_, err := context.resolveBackendConnection(true)
	if err == nil || !strings.Contains(err.Error(), "decode backend runtime file") {
		t.Fatalf("malformed runtime error = %v, want decode diagnostic", err)
	}
}

func TestBackendConnectionRejectsStaleRuntimePID(t *testing.T) {
	if _, supported := backendconn.ProcessAlive(os.Getpid()); !supported {
		t.Skip("PID liveness check is not supported on this platform")
	}
	server := newBackendConnectionTestServer(t, "runtime-token")
	appDataDir := t.TempDir()
	writeTestRuntimeConnection(t, appDataDir, server.URL, "runtime-token", 99_999_999)
	context := newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second

	_, err := context.resolveBackendConnection(true)
	if err == nil || !strings.Contains(err.Error(), "is stale") {
		t.Fatalf("stale runtime error = %v, want stale diagnostic", err)
	}
}

func TestBackendConnectionRejectsWrongHostAndToken(t *testing.T) {
	appDataDir := t.TempDir()
	writeRawRuntimeConnection(t, appDataDir, backendconn.RuntimeFile{
		SchemaVersion: backendconn.RuntimeSchemaVersion,
		Addr:          "http://192.0.2.10:41000",
		Token:         "runtime-token",
		PID:           os.Getpid(),
		AppDataDir:    appDataDir,
		StartedAt:     "2026-06-03T12:00:00Z",
		Version:       "test",
	})
	context := newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second
	_, err := context.resolveBackendConnection(true)
	if err == nil || !strings.Contains(err.Error(), "host must be loopback") {
		t.Fatalf("wrong host error = %v, want loopback diagnostic", err)
	}

	server := newBackendConnectionTestServer(t, "right-token")
	appDataDir = t.TempDir()
	writeTestRuntimeConnection(t, appDataDir, server.URL, "wrong-token", os.Getpid())
	context = newRunContext(strings.NewReader(""), io.Discard, io.Discard, mapEnv(map[string]string{
		backendconn.AppDataDirEnv: appDataDir,
	}))
	context.Globals.Timeout = time.Second
	_, err = context.resolveBackendConnection(true)
	if err == nil || !strings.Contains(err.Error(), "backend_auth_failed") {
		t.Fatalf("wrong token error = %v, want auth diagnostic", err)
	}
}

func TestAPIEndpointsDeriveFromHTTPRegistry(t *testing.T) {
	output := runJSONCommand[apiEndpointsOutput](t, "", "api", "endpoints", "--json")
	if len(output.Data.Endpoints) != len(httpapi.Contracts().Endpoints) {
		t.Fatalf("endpoint count = %d, want %d", len(output.Data.Endpoints), len(httpapi.Contracts().Endpoints))
	}
	foundListApprovals := false
	for _, endpoint := range output.Data.Endpoints {
		if endpoint.Name == "ListApprovals" {
			foundListApprovals = true
		}
	}
	if !foundListApprovals {
		t.Fatal("api endpoints did not include ListApprovals")
	}
}

func TestScriptedBackendWorkflowE2E(t *testing.T) {
	t.Setenv("SETTA_E2E", "1")
	t.Setenv("SETTA_E2E_CHAT_HARNESS", "scripted-workflow")
	t.Setenv(backendconn.AddrEnv, "")
	t.Setenv(backendconn.TokenEnv, "")

	appDataDir := t.TempDir()
	t.Setenv(backendconn.AppDataDirEnv, appDataDir)
	started := runBackendStart(t, appDataDir)
	stopProcess(t, started.PID)

	waitForHealth(t)
	connection := runJSONCommand[backendConnection](t, "", "backend", "connection", "--json")
	if connection.Data.Addr != started.Addr || connection.Data.Token != "" || !connection.Data.Authenticated {
		t.Fatalf("backend connection = %+v, want authenticated connection without token", connection.Data)
	}
	opened := runJSONCommand[httpapi.OpenWorkspaceResponse](t, "", "workspace", "open", t.TempDir(), "--json")
	if opened.Data.Workspace.ID == "" {
		t.Fatal("opened workspace ID is empty")
	}

	conversation := runJSONCommand[chat.Conversation](t, "", "conversation", "create", "--workspace", opened.Data.Workspace.ID, "--title", "CLI E2E", "--json")
	if conversation.Data.ID == "" {
		t.Fatal("conversation ID is empty")
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run([]string{
		"--timeout", "10s",
		"chat", "send",
		"--workspace", opened.Data.Workspace.ID,
		"--conversation", conversation.Data.ID,
		"--prompt-file", "-",
		"--wait",
		"--ndjson",
	}, strings.NewReader("hello from cli"), &stdout, &stderr, os.Getenv)
	if exitCode != exitSuccess {
		t.Fatalf("chat send exit code = %d, stderr = %q, stdout = %q", exitCode, stderr.String(), stdout.String())
	}
	events := decodeNDJSONEvents(t, stdout.String())
	if !hasRunStatus(events, chat.RunStatusCompleted) {
		t.Fatalf("events = %+v, want completed run update", events)
	}

	page := runJSONCommand[chat.MessagePage](t, "", "message", "page", "--workspace", opened.Data.Workspace.ID, "--conversation", conversation.Data.ID, "--limit", "20", "--json")
	if len(page.Data.Messages) < 2 {
		t.Fatalf("message count = %d, want at least user and assistant", len(page.Data.Messages))
	}
}

func TestLiveCodexCLIWorkflow(t *testing.T) {
	openAIKey := cliOpenAIKeyFromDotEnv(t)
	codexHome := cliTempDirWithRetryCleanup(t, "setta-cli-live-codex-home-*")
	cliLoginCodexWithAPIKey(t, codexHome, openAIKey)
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("OPENAI_API_KEY", openAIKey)
	t.Setenv(backendconn.AddrEnv, "")
	t.Setenv(backendconn.TokenEnv, "")

	appDataDir := cliTempDirWithRetryCleanup(t, "setta-cli-live-app-data-*")
	t.Setenv(backendconn.AppDataDirEnv, appDataDir)
	started := runBackendStart(t, appDataDir)
	stopProcess(t, started.PID)
	waitForHealth(t)

	opened := runJSONCommand[httpapi.OpenWorkspaceResponse](t, "", "workspace", "open", t.TempDir(), "--json")
	conversation := runJSONCommand[chat.Conversation](t, "", "conversation", "create", "--workspace", opened.Data.Workspace.ID, "--title", "CLI live", "--json")
	sent := runJSONCommand[chat.SendMessageResult](t, "Reply with one short sentence about Setta CLI.", "chat", "send", "--workspace", opened.Data.Workspace.ID, "--conversation", conversation.Data.ID, "--prompt-file", "-", "--json")
	t.Cleanup(func() {
		cancelActiveRunBestEffort(opened.Data.Workspace.ID, conversation.Data.ID)
	})

	page := waitForLiveCLIReply(t, opened.Data.Workspace.ID, conversation.Data.ID, sent.Data.Run.ID)
	if len(page.Messages) < 2 {
		t.Fatalf("live CLI message count = %d, want at least user and assistant", len(page.Messages))
	}
}

func newBackendConnectionTestServer(t *testing.T, token string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/health" {
			http.NotFound(response, request)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		if request.Header.Get("Authorization") != backendconn.BearerToken(token) {
			response.WriteHeader(http.StatusUnauthorized)
			_, _ = response.Write([]byte(`{"error":{"code":"backend_auth_failed","message":"backend authorization failed"}}`))
			return
		}
		_, _ = response.Write([]byte(`{"ok":true,"name":"setta-backend","version":"test"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func writeTestRuntimeConnection(t *testing.T, appDataDir string, addr string, token string, pid int) {
	t.Helper()
	if err := backendconn.WriteRuntimeFile(backendconn.RuntimeFile{
		SchemaVersion: backendconn.RuntimeSchemaVersion,
		Addr:          addr,
		Token:         token,
		PID:           pid,
		AppDataDir:    appDataDir,
		StartedAt:     "2026-06-03T12:00:00Z",
		Version:       "test",
	}); err != nil {
		t.Fatalf("write runtime connection: %v", err)
	}
}

func writeRawRuntimeConnection(t *testing.T, appDataDir string, record backendconn.RuntimeFile) {
	t.Helper()
	path := backendconn.RuntimeFilePath(appDataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create runtime dir: %v", err)
	}
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("marshal raw runtime connection: %v", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		t.Fatalf("write raw runtime connection: %v", err)
	}
}

func mapEnv(values map[string]string) func(string) string {
	return func(name string) string {
		return values[name]
	}
}

func runJSONCommand[T any](t *testing.T, stdin string, args ...string) testEnvelope[T] {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run(args, strings.NewReader(stdin), &stdout, &stderr, os.Getenv)
	if exitCode != exitSuccess {
		t.Fatalf("Run(%v) exit code = %d, stderr = %q, stdout = %q", args, exitCode, stderr.String(), stdout.String())
	}
	var envelope testEnvelope[T]
	if err := json.Unmarshal(stdout.Bytes(), &envelope); err != nil {
		t.Fatalf("decode stdout %q: %v", stdout.String(), err)
	}
	return envelope
}

func runBackendStart(t *testing.T, appDataDir string) backendStartOutput {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run([]string{"backend", "start", "--app-data-dir", appDataDir, "--json"}, strings.NewReader(""), &stdout, &stderr, os.Getenv)
	if exitCode != exitSuccess {
		t.Fatalf("backend start exit code = %d, stderr = %q, stdout = %q", exitCode, stderr.String(), stdout.String())
	}
	var output backendStartOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		t.Fatalf("decode backend start output %q: %v", stdout.String(), err)
	}
	return output
}

func waitForHealth(t *testing.T) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		exitCode := Run([]string{"health", "--json"}, strings.NewReader(""), &stdout, &stderr, os.Getenv)
		if exitCode == exitSuccess {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("backend did not become healthy")
}

func stopProcess(t *testing.T, pid int) {
	t.Helper()

	process, err := os.FindProcess(pid)
	if err != nil {
		t.Fatalf("find backend process %d: %v", pid, err)
	}
	t.Cleanup(func() {
		_ = process.Signal(syscall.SIGTERM)
		time.Sleep(100 * time.Millisecond)
		_ = process.Kill()
	})
}

func waitForLiveCLIReply(t *testing.T, workspaceID string, conversationID string, runID string) chat.MessagePage {
	t.Helper()

	deadline := time.Now().Add(90 * time.Second)
	var lastPage chat.MessagePage
	for time.Now().Before(deadline) {
		page := runJSONCommand[chat.MessagePage](t, "", "message", "page", "--workspace", workspaceID, "--conversation", conversationID, "--limit", "40", "--json")
		lastPage = page.Data
		for _, message := range page.Data.Messages {
			if message.RunID != runID || message.Role != chat.RoleAssistant {
				continue
			}
			switch message.Status {
			case chat.MessageStatusError:
				t.Fatalf("live CLI assistant message failed: %+v", message)
			case chat.MessageStatusComplete:
				if strings.TrimSpace(messageText(message)) == "" {
					t.Fatal("live CLI assistant completed with empty text")
				}
				return page.Data
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live CLI reply; last page = %+v", lastPage)
	return chat.MessagePage{}
}

func cancelActiveRunBestEffort(workspaceID string, conversationID string) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	_ = Run([]string{"run", "cancel", "--workspace", workspaceID, "--conversation", conversationID, "--confirm", "--json"}, strings.NewReader(""), &stdout, &stderr, os.Getenv)
}

func messageText(message chat.ChatMessage) string {
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		parts = append(parts, part.Text)
	}
	return strings.Join(parts, "")
}

func cliOpenAIKeyFromDotEnv(t *testing.T) string {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(cliRepoRoot(t), ".env"))
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("OPENAI_API_KEY is not present in .env")
	}
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	for _, line := range strings.Split(string(content), "\n") {
		key, value, ok := parseCLIDotEnvLine(line)
		if ok && key == "OPENAI_API_KEY" && value != "" {
			return value
		}
	}
	t.Skip("OPENAI_API_KEY is not present in .env")
	return ""
}

func parseCLIDotEnvLine(line string) (string, string, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false
	}
	line = strings.TrimPrefix(line, "export ")
	key, value, found := strings.Cut(line, "=")
	if !found {
		return "", "", false
	}
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'") && len(value) >= 2 {
		value = strings.TrimSuffix(strings.TrimPrefix(value, "'"), "'")
	} else if unquoted, err := strconv.Unquote(value); err == nil {
		value = unquoted
	}
	return key, value, key != ""
}

func cliRepoRoot(t *testing.T) string {
	t.Helper()

	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repository root")
		}
		dir = parent
	}
}

func cliLoginCodexWithAPIKey(t *testing.T, codexHome string, openAIKey string) {
	t.Helper()

	command := exec.Command("codex", "login", "--with-api-key")
	command.Env = append(os.Environ(), "CODEX_HOME="+codexHome)
	command.Stdin = strings.NewReader(openAIKey + "\n")
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("codex login --with-api-key failed: %v, stderr: %s", err, stderr.String())
	}
}

func cliTempDirWithRetryCleanup(t *testing.T, pattern string) string {
	t.Helper()

	dir, err := os.MkdirTemp("", pattern)
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}
	t.Cleanup(func() {
		var removeErr error
		for attempt := 0; attempt < 20; attempt++ {
			removeErr = os.RemoveAll(dir)
			if removeErr == nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatalf("remove temp dir %s: %v", dir, removeErr)
	})
	return dir
}

func assertCommandExists(t *testing.T, commands []CommandSpec, path []string) {
	t.Helper()

	want := commandPath(path)
	for _, command := range commands {
		if commandPath(command.Path) == want {
			return
		}
	}
	t.Fatalf("command %s not found", want)
}

func decodeNDJSONEvents(t *testing.T, raw string) []chat.Event {
	t.Helper()

	lines := strings.Split(strings.TrimSpace(raw), "\n")
	events := make([]chat.Event, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		var event chat.Event
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatalf("decode event line %q: %v", line, err)
		}
		events = append(events, event)
	}
	if len(events) == 0 {
		t.Fatal("no NDJSON events emitted")
	}
	return events
}

func hasRunStatus(events []chat.Event, status chat.RunStatus) bool {
	for _, event := range events {
		if event.Type != chat.EventTypeRunUpdated {
			continue
		}
		var payload chat.RunUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			continue
		}
		if payload.Run.Status == status {
			return true
		}
	}
	return false
}
