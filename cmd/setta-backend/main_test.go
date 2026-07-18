package main

import (
	"bytes"
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

func TestConfigFromArgsEnablesLocalCredentialIssuerOnlyWithExplicitFlag(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	config, err := configFromArgs([]string{
		"--app-data-dir", t.TempDir(),
		"--local-credential-issuer",
	}, &stdout, &stderr, emptyEnv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if !config.EnableLocalCredentialIssuer || !config.SkipBootstrapDeviceSession {
		t.Fatalf("local issuer config = %+v", config)
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

func emptyEnv(string) string {
	return ""
}
