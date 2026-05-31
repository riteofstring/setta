package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/backendconn"
)

const testAuthToken = "test-token"

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

	request, err := http.NewRequest(http.MethodGet, "http://"+ready.Addr+"/health", nil)
	if err != nil {
		t.Fatalf("create health request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+config.AuthToken)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get health from ready addr: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}

func TestStartWritesAndShutdownRemovesRuntimeConnectionFile(t *testing.T) {
	config := testConfig(t)
	config.Version = "test"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}

	path := backendconn.RuntimeFilePath(config.AppDataDir)
	record, err := backendconn.ReadRuntimeFile(path)
	if err != nil {
		t.Fatalf("read runtime connection file: %v", err)
	}
	if record.SchemaVersion != backendconn.RuntimeSchemaVersion ||
		record.Addr != "http://"+server.Addr() ||
		record.Token != config.AuthToken ||
		record.PID <= 0 ||
		record.AppDataDir != config.AppDataDir ||
		record.Version != "test" {
		t.Fatalf("runtime connection record = %+v", record)
	}

	shutdownServer(t, server)
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("runtime connection file stat after shutdown = %v, want not exist", err)
	}
}

func TestInvalidStartupConfigurationFails(t *testing.T) {
	tests := map[string]Config{
		"empty app data":    withAppDataDir(t, ""),
		"relative app data": withAppDataDir(t, "relative-app-data"),
		"bad chat harness":  withChatHarness(t, "unsupported"),
		"empty host":        withHost(t, ""),
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

func shutdownServer(t *testing.T, server *Server) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown backend: %v", err)
	}
	if err := server.Wait(); err != nil {
		t.Fatalf("wait for backend: %v", err)
	}
}

func testConfig(t *testing.T) Config {
	t.Helper()

	config := DefaultConfig()
	config.AppDataDir = t.TempDir()
	config.AuthToken = testAuthToken
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
