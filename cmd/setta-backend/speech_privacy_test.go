package main

import (
	"bytes"
	"strings"
	"testing"

	"setta/internal/speech"
)

func TestBackendLaunchDoesNotPrintRejectedSpeechCredential(t *testing.T) {
	const credential = "sk-setta invalid backend speech credential"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run(
		[]string{"--app-data-dir", t.TempDir()},
		&stdout,
		&stderr,
		func(name string) string {
			if name == speech.APIKeyEnvironmentVariable {
				return credential
			}
			return ""
		},
		ignoreUnsetenv,
	)
	if exitCode != 2 {
		t.Fatalf("backend exit code = %d, want configuration failure", exitCode)
	}
	if !strings.Contains(stderr.String(), "visible ASCII") {
		t.Fatalf("backend launch error = %q, want specific credential validation", stderr.String())
	}
	if strings.Contains(stdout.String(), credential) || strings.Contains(stderr.String(), credential) {
		t.Fatal("backend launch output contains the rejected speech credential")
	}
}
