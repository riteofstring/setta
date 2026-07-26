package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/controlplane"
	"setta/internal/runtime"
	"setta/internal/speech"
)

func TestConfigFromArgsUsesExplicitPort(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	appDataDir := t.TempDir()

	config, err := configFromArgs([]string{
		"--app-data-dir", appDataDir,
		"--port", "0",
		"--version", "test",
	}, &stdout, &stderr, emptyEnv, ignoreUnsetenv)
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
	if config.MinimumDiskFreeMiB != runtime.DefaultConfig().MinimumDiskFreeMiB ||
		config.MinimumDiskFreeMiB <= 0 {
		t.Fatalf(
			"minimum free disk = %d MiB, want positive runtime default %d",
			config.MinimumDiskFreeMiB,
			runtime.DefaultConfig().MinimumDiskFreeMiB,
		)
	}
}

func TestConfigFromArgsAllowsExplicitDiskAdmissionOptOut(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	config, err := configFromArgs([]string{
		"--app-data-dir", t.TempDir(),
		"--minimum-disk-free-mib", "0",
	}, &stdout, &stderr, emptyEnv, ignoreUnsetenv)
	if err != nil {
		t.Fatalf("config from args: %v", err)
	}
	if config.MinimumDiskFreeMiB != 0 {
		t.Fatalf("minimum free disk = %d MiB, want explicit zero", config.MinimumDiskFreeMiB)
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

func TestConfigFromArgsConfiguresExplicitSpritesWorkloadLeaseSocket(t *testing.T) {
	directory := t.TempDir()
	socketPath := filepath.Join(directory, "sprites.sock")
	credentialPath := filepath.Join(directory, "reporter.json")
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(credentialPath, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&bytes.Buffer{},
		&bytes.Buffer{},
		func(name string) string {
			switch name {
			case "SETTA_SPRITES_WORKLOAD_LEASE_SOCKET":
				return socketPath
			case "SETTA_WORKLOAD_ACCOUNTING_URL":
				return "https://control.setta.example"
			case "SETTA_WORKLOAD_ACCOUNTING_CREDENTIAL_FILE":
				return credentialPath
			}
			return ""
		},
		ignoreUnsetenv,
	)
	if err != nil {
		t.Fatal(err)
	}
	if config.WorkloadLeaseManager == nil || config.WorkloadLeaseReporter == nil {
		t.Fatal("explicit Sprites workload accounting did not configure both dependencies")
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
