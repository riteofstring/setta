package settadocs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLoaderLoadReturnsDefaultBundle(t *testing.T) {
	t.Parallel()

	root := filepath.Join(t.TempDir(), "docs")
	writeDocsTestFile(t, filepath.Join(root, "reference", "setta-listener-examples.md"), "# Examples\n")
	writeDocsTestFile(t, filepath.Join(root, "reference", "emit_to_frontend.md"), "# Emit\n")
	writeDocsTestFile(t, filepath.Join(root, "reference", "setta-listener-hot-reload.md"), "# Reload\n")
	writeDocsTestFile(t, filepath.Join(root, "reference", "setta-realtime-behavior.md"), "# Realtime\n")
	writeDocsTestFile(t, filepath.Join(root, "guides", "extra.md"), "# Extra\n")

	loader, err := NewLoader(root)
	if err != nil {
		t.Fatalf("new loader: %v", err)
	}

	bundle, err := loader.Load(nil)
	if err != nil {
		t.Fatalf("load default docs: %v", err)
	}
	if len(bundle.Docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", bundle.Docs)
	}
	if bundle.Docs[0].DocID != "examples" || bundle.Docs[0].Path != "docs/reference/setta-listener-examples.md" {
		t.Fatalf("unexpected first default doc %#v", bundle.Docs[0])
	}
	if len(bundle.AvailableDocs) < 5 {
		t.Fatalf("expected available docs list, got %#v", bundle.AvailableDocs)
	}
}

func TestLoaderLoadSupportsRelativePathsAndRejectsEscapes(t *testing.T) {
	t.Parallel()

	root := filepath.Join(t.TempDir(), "docs")
	writeDocsTestFile(t, filepath.Join(root, "reference", "listener-flows.md"), "# Flows\n")

	loader, err := NewLoader(root)
	if err != nil {
		t.Fatalf("new loader: %v", err)
	}

	bundle, err := loader.Load([]string{"reference/listener-flows"})
	if err != nil {
		t.Fatalf("load relative doc path: %v", err)
	}
	if len(bundle.Docs) != 1 || bundle.Docs[0].Path != "docs/reference/listener-flows.md" {
		t.Fatalf("unexpected relative doc payload %#v", bundle.Docs)
	}

	if _, err := loader.Load([]string{"../outside"}); !errors.Is(err, ErrDocIDInvalid) {
		t.Fatalf("expected invalid doc-id error, got %v", err)
	}
	if _, err := loader.Load([]string{"/tmp/absolute"}); !errors.Is(err, ErrDocIDInvalid) {
		t.Fatalf("expected invalid absolute doc-id error, got %v", err)
	}
}

func TestLoaderLoadDistinguishesMissingDocsRootAndMissingDoc(t *testing.T) {
	t.Parallel()

	missingRoot := filepath.Join(t.TempDir(), "docs")
	loader, err := NewLoader(missingRoot)
	if err != nil {
		t.Fatalf("new loader with missing root: %v", err)
	}

	if _, err := loader.Load(nil); !errors.Is(err, ErrDocsRootNotFound) {
		t.Fatalf("expected docs-root-not-found error, got %v", err)
	}

	root := filepath.Join(t.TempDir(), "docs")
	writeDocsTestFile(t, filepath.Join(root, "reference", "emit_to_frontend.md"), "# Emit\n")
	loader, err = NewLoader(root)
	if err != nil {
		t.Fatalf("new loader with real root: %v", err)
	}

	if _, err := loader.Load([]string{"missing"}); !errors.Is(err, ErrDocNotFound) {
		t.Fatalf("expected missing-doc error, got %v", err)
	}
}

func writeDocsTestFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir docs parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write docs file: %v", err)
	}
}
