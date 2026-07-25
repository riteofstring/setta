package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/controlplane"
	"setta/internal/runtimereporting"
)

func TestGenerateRuntimeReportingCredentialWritesPrivateFileWithoutPrintingSecret(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credentials", "runtime-reporter.json")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exitCode := runGenerateRuntimeReportingCredential(
		[]string{"--output", path},
		&stdout,
		&stderr,
	); exitCode != 0 {
		t.Fatalf("generate runtime reporting credential exit = %d: %s", exitCode, stderr.String())
	}
	credential, err := runtimereporting.ReadCredentialFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stdout.String(), credential.Token) ||
		strings.Contains(stderr.String(), credential.Token) ||
		strings.Contains(stdout.String(), path) {
		t.Fatalf("credential generation output exposed private data: %s%s", stdout.String(), stderr.String())
	}
	var event controlplane.AdminEvent
	if err := json.Unmarshal(stdout.Bytes(), &event); err != nil ||
		event.Event != "runtime_reporting_credential_generated" ||
		event.Status != "created" {
		t.Fatalf("credential generation event = %+v, %v", event, err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("credential file mode = %v, %v", info, err)
	}
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if exitCode := runGenerateRuntimeReportingCredential(
		[]string{"--output", path},
		&bytes.Buffer{},
		&bytes.Buffer{},
	); exitCode != 1 {
		t.Fatalf("credential overwrite exit = %d", exitCode)
	}
	unchanged, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(unchanged, original) {
		t.Fatalf("credential file changed after refused overwrite: %v", err)
	}
}
