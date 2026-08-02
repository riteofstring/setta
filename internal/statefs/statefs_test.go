package statefs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveWithinRootAcceptsRelativePath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	resolved, err := ResolveWithinRoot(root, "./nested/file.txt", "test path")
	if err != nil {
		t.Fatalf("resolve within root: %v", err)
	}

	expected := filepath.Join(root, "nested", "file.txt")
	if resolved != expected {
		t.Fatalf("expected %q, got %q", expected, resolved)
	}
}

func TestResolveWithinRootRejectsEscape(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if _, err := ResolveWithinRoot(root, "../outside.txt", "test path"); err == nil {
		t.Fatal("expected path escape error")
	}
}

func TestAtomicWriteFileCreatesParentAndReplacesContent(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	target := filepath.Join(root, "nested", "state.json")
	if err := AtomicWriteFile(target, []byte("first"), 0o644); err != nil {
		t.Fatalf("write first payload: %v", err)
	}
	if err := AtomicWriteFile(target, []byte("second"), 0o644); err != nil {
		t.Fatalf("write second payload: %v", err)
	}

	content, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if string(content) != "second" {
		t.Fatalf("expected replaced content, got %q", string(content))
	}
}
