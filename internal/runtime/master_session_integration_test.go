package runtime

import (
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
)

func TestRuntimeFoundationRestoresDurableRestrictedMasterSession(t *testing.T) {
	appDataDir := t.TempDir()
	installRuntimeMasterCodexFixture(t)
	config := DefaultConfig()
	config.AppDataDir = appDataDir
	config.Version = "master-session-integration-test"

	first := newTestRuntimeFoundation(t, config)
	started, err := first.masterSessionService.EnsureSession(t.Context())
	if err != nil {
		shutdownRuntimeFoundation(first, config.ShutdownTimeout)
		t.Fatalf("start runtime master session: %v", err)
	}
	if started.ProviderThreadID == nil {
		shutdownRuntimeFoundation(first, config.ShutdownTimeout)
		t.Fatal("started runtime master session has no provider thread")
	}
	threadID := *started.ProviderThreadID
	shutdownRuntimeFoundation(first, config.ShutdownTimeout)

	restarted := newTestRuntimeFoundation(t, config)
	t.Cleanup(func() { shutdownRuntimeFoundation(restarted, config.ShutdownTimeout) })
	restored, err := restarted.masterSessionService.EnsureSession(t.Context())
	if err != nil {
		t.Fatalf("restore runtime master session: %v", err)
	}
	if restored.ID != started.ID || restored.ProviderThreadID == nil ||
		*restored.ProviderThreadID != threadID {
		t.Fatalf("restored runtime master session = %+v, want session %s thread %s", restored, started.ID, threadID)
	}
}

func newTestRuntimeFoundation(t *testing.T, config Config) runtimeFoundation {
	t.Helper()
	foundation, err := newRuntimeFoundation(config)
	if err != nil {
		t.Fatalf("newRuntimeFoundation: %v", err)
	}
	return foundation
}

func installRuntimeMasterCodexFixture(t *testing.T) {
	t.Helper()
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("locate node for scripted Codex app-server: %v", err)
	}
	fixture := readRuntimeMasterCodexFixture(t, "fake-topic-codex-app-server.mjs")
	binDir := t.TempDir()
	writeRuntimeMasterCodexHelper(t, binDir)
	commandPath := filepath.Join(binDir, "codex")
	if goruntime.GOOS == "windows" {
		commandPath += ".cmd"
		fixtureName := "fake-topic-codex-app-server.mjs"
		if err := os.WriteFile(filepath.Join(binDir, fixtureName), fixture, 0o600); err != nil {
			t.Fatalf("write scripted Codex app-server: %v", err)
		}
		quotedNodePath := strings.ReplaceAll(nodePath, `"`, `""`)
		command := "@\"" + quotedNodePath + "\" \"%~dp0" + fixtureName + "\" %*\r\n"
		if err := os.WriteFile(commandPath, []byte(command), 0o700); err != nil {
			t.Fatalf("write scripted Codex command: %v", err)
		}
	} else {
		command := append([]byte("#!/usr/bin/env node\n"), fixture...)
		if err := os.WriteFile(commandPath, command, 0o700); err != nil {
			t.Fatalf("write scripted Codex command: %v", err)
		}
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SETTA_E2E_TOPIC_CODEX_STATE_PATH", filepath.Join(t.TempDir(), "codex-state.json"))
}

func readRuntimeMasterCodexFixture(t *testing.T, name string) []byte {
	t.Helper()
	fixturePath := runtimeMasterCodexFixturePath(t, name)
	fixture, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("load scripted Codex app-server fixture %s: %v", name, err)
	}
	return fixture
}

func runtimeMasterCodexFixturePath(t *testing.T, name string) string {
	t.Helper()
	fixturePath, err := filepath.Abs(filepath.Join("..", "..", "desktop", "tests", "electron", "fixtures", name))
	if err != nil {
		t.Fatalf("resolve scripted Codex app-server fixture %s: %v", name, err)
	}
	if _, err := os.Stat(fixturePath); err != nil {
		t.Fatalf("read scripted Codex app-server fixture %s: %v", name, err)
	}
	return fixturePath
}

func writeRuntimeMasterCodexHelper(t *testing.T, binDir string) {
	t.Helper()
	for _, name := range []string{
		"fake-topic-artifact-tool.mjs",
		"fake-topic-artifact-turns.mjs",
	} {
		fixture := readRuntimeMasterCodexFixture(t, name)
		if err := os.WriteFile(filepath.Join(binDir, name), fixture, 0o600); err != nil {
			t.Fatalf("write scripted Codex app-server helper %s: %v", name, err)
		}
	}
}
