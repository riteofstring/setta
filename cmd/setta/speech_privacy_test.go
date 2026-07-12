package main

import (
	"bytes"
	"strings"
	"testing"

	"setta/internal/speech"
)

func TestServeLaunchDoesNotPrintRejectedSpeechCredential(t *testing.T) {
	const credential = "sk-setta invalid serve speech credential"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.stderr = &stderr
	deps.getenv = func(name string) string {
		if name == speech.APIKeyEnvironmentVariable {
			return credential
		}
		return ""
	}

	exitCode := runWithDeps([]string{"serve", "--app-data-dir", t.TempDir()}, deps)
	if exitCode != 1 {
		t.Fatalf("serve exit code = %d, want startup failure", exitCode)
	}
	if !strings.Contains(stderr.String(), "visible ASCII") {
		t.Fatalf("serve launch error = %q, want specific credential validation", stderr.String())
	}
	if strings.Contains(stdout.String(), credential) || strings.Contains(stderr.String(), credential) {
		t.Fatal("setta serve output contains the rejected speech credential")
	}
}
