package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunRequiresOutputFlag(t *testing.T) {
	t.Parallel()

	var stderr bytes.Buffer
	exitCode := run(nil, &stderr)

	if exitCode != 2 {
		t.Fatalf("run() exit code = %d, want 2", exitCode)
	}
	if got := stderr.String(); got != requiredOutputMessage+"\n" {
		t.Fatalf("run() stderr = %q, want %q", got, requiredOutputMessage+"\n")
	}
}

func TestRunWritesRequestedSchemaAndSidecarOutputs(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	schemaPath := filepath.Join(tempDir, "schema.json")
	sidecarPath := filepath.Join(tempDir, "sidecar.json")
	var stderr bytes.Buffer

	exitCode := run([]string{
		"-schema-out", schemaPath,
		"-sidecar-out", sidecarPath,
	}, &stderr)

	if exitCode != 0 {
		t.Fatalf("run() exit code = %d, stderr = %q", exitCode, stderr.String())
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("run() stderr = %q, want empty", got)
	}
	assertJSONFile(t, schemaPath)
	assertJSONFile(t, sidecarPath)
}

func assertJSONFile(t *testing.T, path string) {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("unmarshal %s: %v", path, err)
	}
	if len(value) == 0 {
		t.Fatalf("%s decoded to an empty object", path)
	}
}
