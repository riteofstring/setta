package appspec

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestDefaultPath(t *testing.T) {
	t.Parallel()

	if path := DefaultPath(); path != "app_specs/app.json" {
		t.Fatalf("expected default app spec path app_specs/app.json, got %q", path)
	}
}

func TestWriteAndReadRoundTrip(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	payload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
	}

	if err := Write(root, "app_specs/sample.json", payload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	loaded, err := Read(root, "app_specs/sample.json")
	if err != nil {
		t.Fatalf("read app spec: %v", err)
	}
	if !reflect.DeepEqual(loaded, payload) {
		t.Fatalf("expected round-tripped payload %#v, got %#v", payload, loaded)
	}
}

func TestNormalizePathReturnsRelativePath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	absolutePath := filepath.Join(root, "app_specs", "spec.json")
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		t.Fatalf("create app_specs dir: %v", err)
	}
	if err := os.WriteFile(absolutePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("write spec file: %v", err)
	}

	normalized, err := NormalizePath(root, absolutePath)
	if err != nil {
		t.Fatalf("normalize path: %v", err)
	}
	if normalized != "app_specs/spec.json" {
		t.Fatalf("expected normalized path app_specs/spec.json, got %q", normalized)
	}
}

func TestWriteOutsideAppSpecsFails(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	payload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
	}

	if err := Write(root, "outside.json", payload); err == nil {
		t.Fatal("expected write outside app_specs to fail")
	}
}
