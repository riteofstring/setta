package main

import (
	"bytes"
	"strings"
	"testing"

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

func TestConfigFromArgsMapsDesktopSpeechProviderEnvironment(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		switch name {
		case "SETTA_E2E":
			return "1"
		case speech.APIKeyEnvironmentVariable:
			return "secret value"
		case speech.E2EBaseURLEnvironmentVariable:
			return "http://127.0.0.1:24891/v1"
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.SpeechStartupAPIKey != "" {
		t.Fatalf("speech startup API key = %q, want empty", config.SpeechStartupAPIKey)
	}
	if config.Speech.BaseURL != "http://127.0.0.1:24891/v1" || !config.Speech.AllowTestBaseURL {
		t.Fatalf("speech provider config = %+v, want guarded E2E URL", config.Speech)
	}
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

	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		func(name string) string {
			if name == speech.APIKeyEnvironmentVariable {
				return "secret value"
			}
			return ""
		},
	)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.SpeechStartupAPIKey != "" {
		t.Fatalf("speech startup API key = %q, want empty", config.SpeechStartupAPIKey)
	}
}

func emptyEnv(string) string {
	return ""
}
