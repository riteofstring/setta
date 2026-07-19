package main

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"setta/internal/speech"
)

func TestConfigFromArgsUsesExplicitPort(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	appDataDir := t.TempDir()

	config, err := configFromArgs([]string{"--app-data-dir", appDataDir, "--port", "0", "--version", "test"}, &stdout, &stderr, emptyEnv, ignoreUnsetenv)
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
	}, &stdout, &stderr, emptyEnv, ignoreUnsetenv)
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
	}, ignoreUnsetenv)
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
	}, &stdout, &stderr, emptyEnv, ignoreUnsetenv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if !config.SkipBootstrapDeviceSession {
		t.Fatal("skip bootstrap device session = false, want true")
	}
}

func TestConfigFromArgsMapsSpeechEnvironment(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	var cleared string
	config, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stdout, &stderr, func(name string) string {
		switch name {
		case "SETTA_E2E":
			return "1"
		case speech.APIKeyEnvironmentVariable:
			return "sk-openai-speech-backend"
		case speech.E2EBaseURLEnvironmentVariable:
			return "http://127.0.0.1:24891/v1"
		default:
			return ""
		}
	}, func(name string) error {
		cleared = name
		return nil
	})
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.Speech.APIKey != "sk-openai-speech-backend" {
		t.Fatalf("speech API key = %q, want OpenAI API key", config.Speech.APIKey)
	}
	if config.Speech.BaseURL != "http://127.0.0.1:24891/v1" || !config.Speech.AllowTestBaseURL {
		t.Fatalf("speech provider config = %+v, want guarded E2E URL", config.Speech)
	}
	if cleared != speech.APIKeyEnvironmentVariable {
		t.Fatalf("cleared environment variable = %q, want %q", cleared, speech.APIKeyEnvironmentVariable)
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
	}, ignoreUnsetenv)
	if err == nil || !strings.Contains(err.Error(), "requires SETTA_E2E=1") {
		t.Fatalf("error = %v, want SETTA_E2E guard error", err)
	}
}

func TestConfigFromArgsRejectsUnclearedSpeechCredential(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	clearErr := errors.New("environment is read-only")

	_, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		emptyEnv,
		func(string) error { return clearErr },
	)
	if !errors.Is(err, clearErr) || !strings.Contains(err.Error(), speech.APIKeyEnvironmentVariable) {
		t.Fatalf("error = %v, want wrapped speech credential clear failure", err)
	}
}

func emptyEnv(string) string {
	return ""
}

func ignoreUnsetenv(string) error {
	return nil
}
