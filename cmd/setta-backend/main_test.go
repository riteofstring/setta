package main

import (
	"bytes"
	"strings"
	"testing"

	"setta/internal/evalharness/toolpolicy"
	"setta/internal/runtime"
	"setta/internal/speech"
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

func TestConfigFromArgsCanSkipBootstrapDeviceSession(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{
		"--app-data-dir",
		t.TempDir(),
		"--skip-bootstrap-device-session",
	}, &stdout, &stderr, emptyEnv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if !config.SkipBootstrapDeviceSession {
		t.Fatal("skip bootstrap device session = false, want true")
	}
}

func TestConfigFromArgsEnablesEvalExternalToolRestriction(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		func(name string) string {
			if name == toolpolicy.RestrictExternalToolsEnvironment {
				return "1"
			}
			return ""
		},
	)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if !config.RestrictAgentExternalTools {
		t.Fatal("eval external tool restriction = false, want true")
	}
}

func TestConfigFromArgsMapsDesktopSpeechProviderEnvironment(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	requested := map[string]int{}

	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		trackedEnv(requested, map[string]string{
			"SETTA_E2E":                          "1",
			speech.APIKeyEnvironmentVariable:     "secret value",
			speech.E2EBaseURLEnvironmentVariable: "http://127.0.0.1:24891/v1",
		}),
	)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.SpeechStartupAPIKey != "" {
		t.Fatalf("speech startup API key = %q, want empty", config.SpeechStartupAPIKey)
	}
	if config.SpeechCredentialOwner != runtime.SpeechCredentialOwnerElectronVault {
		t.Fatalf("speech credential owner = %q, want electron_vault", config.SpeechCredentialOwner)
	}
	if config.Speech.BaseURL != "http://127.0.0.1:24891/v1" || !config.Speech.AllowTestBaseURL {
		t.Fatalf("speech provider config = %+v, want guarded E2E URL", config.Speech)
	}
	assertEnvNotRequested(t, requested, speech.APIKeyEnvironmentVariable)
}

func TestConfigFromArgsRejectsSpeechBaseURLWithoutE2EGuard(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		if name == speech.E2EBaseURLEnvironmentVariable {
			return "http://127.0.0.1:24891/v1"
		}
		return ""
	})
	if err == nil || !strings.Contains(err.Error(), "requires SETTA_E2E=1") {
		t.Fatalf("error = %v, want SETTA_E2E guard error", err)
	}
}

func TestConfigFromArgsIgnoresInheritedSpeechCredential(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	requested := map[string]int{}

	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		trackedEnv(requested, map[string]string{
			speech.APIKeyEnvironmentVariable: "secret value",
		}),
	)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.SpeechStartupAPIKey != "" {
		t.Fatalf("speech startup API key = %q, want empty", config.SpeechStartupAPIKey)
	}
	if config.SpeechCredentialOwner != runtime.SpeechCredentialOwnerElectronVault {
		t.Fatalf("speech credential owner = %q, want electron_vault", config.SpeechCredentialOwner)
	}
	assertEnvNotRequested(t, requested, speech.APIKeyEnvironmentVariable)
}

func emptyEnv(string) string {
	return ""
}

func trackedEnv(requested map[string]int, values map[string]string) func(string) string {
	return func(name string) string {
		requested[name]++
		return values[name]
	}
}

func assertEnvNotRequested(t *testing.T, requested map[string]int, name string) {
	t.Helper()
	if requested[name] != 0 {
		t.Fatalf("environment variable %s was requested %d time(s)", name, requested[name])
	}
}
