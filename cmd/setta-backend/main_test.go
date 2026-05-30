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

func TestConfigFromArgsUsesScriptedWorkflowHarnessEnv(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == "SETTA_TEST_CHAT_HARNESS" {
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

func emptyEnv(string) string {
	return ""
}
