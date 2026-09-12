package durable

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReplaceOverwritesExistingFileWithoutLeavingStaging(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := filepath.Join(root, "state.json")
	if err := Replace(path, []byte("first"), 0o600); err != nil {
		t.Fatalf("first Replace() = %v", err)
	}
	if err := Replace(path, []byte("second"), 0o600); err != nil {
		t.Fatalf("second Replace() = %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != "second" {
		t.Fatalf("content = %q, %v", content, err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 || entries[0].Name() != "state.json" {
		t.Fatalf("directory entries = %#v, %v", entries, err)
	}
}
