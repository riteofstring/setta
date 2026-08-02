package main

import (
	"bytes"
	"strings"
	"testing"

	"setta/internal/runtime"
	"setta/internal/speech"
)

func TestBackendConfigIgnoresInheritedSpeechCredentialAndDoesNotPrintIt(t *testing.T) {
	const credential = "sk-setta invalid backend speech credential"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	requested := map[string]int{}
	config, err := configFromArgs(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		trackedEnv(requested, map[string]string{
			speech.APIKeyEnvironmentVariable: credential,
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
	if strings.Contains(stdout.String(), credential) || strings.Contains(stderr.String(), credential) {
		t.Fatal("backend launch output contains the rejected speech credential")
	}
	assertEnvNotRequested(t, requested, speech.APIKeyEnvironmentVariable)
}
