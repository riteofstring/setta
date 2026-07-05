package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	goruntime "runtime"
	"testing"

	"setta/internal/runtime"
)

func TestConfigFromArgsUsesExplicitPort(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	appDataDir := t.TempDir()

	config, err := configFromArgs([]string{"--app-data-dir", appDataDir, "--port", "0", "--version", "test"}, &stdout, &stderr, emptyEnv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.Port != 0 {
		t.Fatalf("port = %d, want 0", config.Port)
	}
	if config.Version != "test" {
		t.Fatalf("version = %q, want test", config.Version)
	}
	if config.AppDataDir != appDataDir {
		t.Fatalf("app data dir = %q, want %q", config.AppDataDir, appDataDir)
	}
}

func TestConfigFromArgsUsesBundledSettaCLIDirFlag(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	cliDir := createBundledSettaCLIFixture(t)
	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir(), "--bundled-cli-dir", cliDir}, &stdout, &stderr, emptyEnv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.BundledSettaCLIDir != cliDir {
		t.Fatalf("bundled CLI dir = %q, want %q", config.BundledSettaCLIDir, cliDir)
	}
}

func TestConfigFromArgsUsesBundledSettaCLIDirEnv(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	cliDir := createBundledSettaCLIFixture(t)
	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_BUNDLED_SETTA_CLI_DIR" {
			return cliDir
		}
		return ""
	})
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.BundledSettaCLIDir != cliDir {
		t.Fatalf("bundled CLI dir = %q, want %q", config.BundledSettaCLIDir, cliDir)
	}
}

func TestConfigFromArgsRejectsMissingBundledSettaCLI(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir(), "--bundled-cli-dir", t.TempDir()}, &stdout, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want missing bundled CLI error")
	}
}

func TestConfigFromArgsRejectsInvalidEnvPort(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	_, err := configFromArgs(nil, &stdout, &stderr, func(name string) string {
		if name == "SETTA_BACKEND_PORT" {
			return "abc"
		}
		return ""
	})
	if err == nil {
		t.Fatal("config succeeded, want error")
	}
}

func TestConfigFromArgsUsesScriptedWorkflowHarnessEnvWithE2EGuard(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_E2E" {
			return "1"
		}
		if name == "SETTA_E2E_CHAT_HARNESS" {
			return string(runtime.ChatHarnessScriptedWorkflow)
		}
		return ""
	})
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.ChatHarness != runtime.ChatHarnessScriptedWorkflow {
		t.Fatalf("chat harness = %q, want %q", config.ChatHarness, runtime.ChatHarnessScriptedWorkflow)
	}
}

func TestConfigFromArgsRejectsScriptedWorkflowHarnessWithoutE2EGuard(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_E2E_CHAT_HARNESS" {
			return string(runtime.ChatHarnessScriptedWorkflow)
		}
		return ""
	})
	if err == nil {
		t.Fatal("config succeeded, want SETTA_E2E guard error")
	}
}

func TestConfigFromArgsDisablesAutomaticCartographerWithE2EGuard(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_E2E" {
			return "1"
		}
		if name == "SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER" {
			return "1"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if !config.DisableAutomaticCartographerProcessing {
		t.Fatal("automatic cartographer processing was not disabled")
	}
}

func TestConfigFromArgsRejectsAutomaticCartographerDisableWithoutE2EGuard(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER" {
			return "1"
		}
		return ""
	})
	if err == nil {
		t.Fatal("config succeeded, want SETTA_E2E guard error")
	}
}

func TestBackendServeStateWriteAndRemove(t *testing.T) {
	appDataDir := t.TempDir()
	state := backendServeState{
		SchemaVersion:   backendServeStateSchemaVersion,
		PID:             os.Getpid(),
		Addr:            "127.0.0.1:7345",
		BaseURL:         "http://127.0.0.1:7345",
		RuntimeID:       "runtime_test",
		DisplayName:     "setta-test",
		ProtocolVersion: 13,
		StartedAt:       "2026-07-07T18:00:00Z",
	}
	if err := writeBackendServeState(appDataDir, state); err != nil {
		t.Fatalf("write serve state: %v", err)
	}
	path := filepath.Join(appDataDir, "runtime", "serve-state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read serve state: %v", err)
	}
	var saved backendServeState
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("decode serve state: %v", err)
	}
	if saved != state {
		t.Fatalf("serve state = %+v, want %+v", saved, state)
	}
	if err := removeBackendServeStateIfMatches(appDataDir, state); err != nil {
		t.Fatalf("remove serve state: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("serve state still exists or stat failed: %v", err)
	}
}

func TestDecodeBackendReadyEventKeepsPayloadForwardable(t *testing.T) {
	payload := []byte(`{"event":"ready","addr":"127.0.0.1:7345","bootstrapToken":"token_test","protocolVersion":13}` + "\n")
	ready, err := decodeBackendReadyEvent(bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if ready.Addr != "127.0.0.1:7345" {
		t.Fatalf("ready addr = %q, want 127.0.0.1:7345", ready.Addr)
	}
	var forwarded bytes.Buffer
	if _, err := forwarded.Write(payload); err != nil {
		t.Fatalf("forward ready payload: %v", err)
	}
	if forwarded.String() != string(payload) {
		t.Fatalf("forwarded payload = %q, want %q", forwarded.String(), string(payload))
	}
}

func emptyEnv(string) string {
	return ""
}

func createBundledSettaCLIFixture(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	name := "setta"
	if goruntime.GOOS == "windows" {
		name = "setta.exe"
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write bundled CLI fixture: %v", err)
	}
	return dir
}
