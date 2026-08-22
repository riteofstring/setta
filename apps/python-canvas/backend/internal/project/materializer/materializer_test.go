package materializer

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentStagesRollsBackAndFinalizesOneProjectSibling(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	document, err := New(filepath.Join(directory, "project.json"))
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer func() {
		if err := document.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	}()
	if filepath.Dir(document.Path()) != directory {
		t.Fatalf("generated path = %q, want sibling in %q", document.Path(), directory)
	}
	if err := document.Initialize("before"); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}

	staged, err := document.Stage("candidate")
	if err != nil {
		t.Fatalf("Stage() error = %v", err)
	}
	if err := staged.Install(); err != nil {
		t.Fatalf("Install() error = %v", err)
	}
	requireDocumentContent(t, document.Path(), "candidate")
	if err := staged.Rollback(); err != nil {
		t.Fatalf("Rollback() error = %v", err)
	}
	requireDocumentContent(t, document.Path(), "before")

	staged, err = document.Stage("durable candidate")
	if err != nil {
		t.Fatalf("second Stage() error = %v", err)
	}
	if err := staged.Install(); err != nil {
		t.Fatalf("second Install() error = %v", err)
	}
	if err := staged.Finalize(); err != nil {
		t.Fatalf("Finalize() error = %v", err)
	}
	requireDocumentContent(t, document.Path(), "durable candidate")
}

func TestInstallFailureLeavesCurrentMaterializationUntouched(t *testing.T) {
	t.Parallel()

	document, err := New(filepath.Join(t.TempDir(), "project.json"))
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer document.Close()
	if err := document.Initialize("before"); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	document.replace = func(string, string) error { return errors.New("injected replacement failure") }
	staged, err := document.Stage("candidate")
	if err != nil {
		t.Fatalf("Stage() error = %v", err)
	}
	if err := staged.Install(); err == nil {
		t.Fatal("Install() succeeded, want injected failure")
	}
	requireDocumentContent(t, document.Path(), "before")
	if err := staged.Discard(); err != nil {
		t.Fatalf("Discard() error = %v", err)
	}
}

func TestNewRequiresAProjectDirectory(t *testing.T) {
	t.Parallel()

	if _, err := New(" "); !errors.Is(err, ErrProjectPathRequired) {
		t.Fatalf("New(blank) error = %v, want project path failure", err)
	}
}

func requireDocumentContent(t *testing.T, path string, want string) {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	if got := string(content); got != want {
		t.Fatalf("document content = %q, want %q", got, want)
	}
}
