package appspec

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestWriteAndReadRoundTrip(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	payload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
	}

	specPath := JoinPath("sample.json")
	if err := Write(root, specPath, payload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	loaded, err := Read(root, specPath)
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
	absolutePath := filepath.Join(root, filepath.FromSlash(RootPath()), "spec.json")
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		t.Fatalf("create app spec dir: %v", err)
	}
	if err := os.WriteFile(absolutePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("write spec file: %v", err)
	}

	normalized, err := NormalizePath(root, absolutePath)
	if err != nil {
		t.Fatalf("normalize path: %v", err)
	}
	if want := JoinPath("spec.json"); normalized != want {
		t.Fatalf("expected normalized path %q, got %q", want, normalized)
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
		t.Fatalf("expected write outside %s to fail", RootPath())
	}
}
