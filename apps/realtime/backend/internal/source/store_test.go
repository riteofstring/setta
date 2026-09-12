package source

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/setta/realtime/backend/internal/contracts"
)

func TestStoreReadsAndAtomicallyAppliesCurrentEntrypoint(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "app.py")
	if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	store, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	project := sourceProject()
	before, err := store.Read(project)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	assertSourceDocument(t, before, project.ID, "handlers = {}\n")
	after, err := store.Apply(project, contracts.ApplyRuntimeSourceRequest{
		ProjectID: project.ID, Entrypoint: "app.py", ExpectedVersion: before.Version, Source: "handlers = {\"run\": lambda: None}\n",
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if after.Source != "handlers = {\"run\": lambda: None}\n" || after.Version == before.Version {
		t.Fatalf("Apply() = %#v", after)
	}
	assertSourceFile(t, path, after.Source, 0o600)
	assertOnlyEntrypoint(t, root)
}

func assertSourceDocument(t *testing.T, document contracts.RuntimeSourceDocument, projectID string, content string) {
	t.Helper()
	if document.ProjectID != projectID || document.Entrypoint != "app.py" || document.Source != content || len(document.Version) != 64 {
		t.Fatalf("source document = %#v", document)
	}
	if document.Version != sourceVersion([]byte(document.Source)) || document.Version != strings.ToLower(document.Version) {
		t.Fatalf("source version = %q", document.Version)
	}
}

func assertSourceFile(t *testing.T, path string, content string, mode os.FileMode) {
	t.Helper()
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != content {
		t.Fatalf("entrypoint = %q, error = %v", actual, err)
	}
	information, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if information.Mode().Perm() != mode {
		t.Fatalf("entrypoint mode = %v", information.Mode().Perm())
	}
}

func assertOnlyEntrypoint(t *testing.T, root string) {
	t.Helper()
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 || entries[0].Name() != "app.py" {
		t.Fatalf("project files = %#v, error = %v", entries, err)
	}
}

func TestStoreConflictsLeaveEntrypointUnchanged(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "app.py")
	if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	store, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	project := sourceProject()
	for _, request := range []contracts.ApplyRuntimeSourceRequest{
		{ProjectID: project.ID, Entrypoint: "app.py", ExpectedVersion: strings.Repeat("0", 64), Source: "changed\n"},
		{ProjectID: "other-project", Entrypoint: "app.py", ExpectedVersion: strings.Repeat("0", 64), Source: "changed\n"},
		{ProjectID: project.ID, Entrypoint: "other.py", ExpectedVersion: strings.Repeat("0", 64), Source: "changed\n"},
	} {
		if _, err := store.Apply(project, request); !errors.Is(err, ErrConflict) {
			t.Fatalf("Apply(%#v) error = %v", request, err)
		}
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != "handlers = {}\n" {
		t.Fatalf("entrypoint = %q, error = %v", content, err)
	}
	document, err := store.Read(project)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if err := os.WriteFile(path, []byte("external change\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(external) error = %v", err)
	}
	if _, err := store.Apply(project, contracts.ApplyRuntimeSourceRequest{
		ProjectID: project.ID, Entrypoint: "app.py", ExpectedVersion: document.Version, Source: "browser change\n",
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("Apply(stale external version) error = %v", err)
	}
	content, err = os.ReadFile(path)
	if err != nil || string(content) != "external change\n" {
		t.Fatalf("entrypoint after external conflict = %q, error = %v", content, err)
	}
}

func TestStoreRejectsInvalidAndOversizedText(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "app.py")
	if err := os.WriteFile(path, []byte{0xff}, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	store, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	project := sourceProject()
	if _, err := store.Read(project); !errors.Is(err, ErrInvalidText) {
		t.Fatalf("Read(invalid UTF-8) error = %v", err)
	}
	if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(valid) error = %v", err)
	}
	document, err := store.Read(project)
	if err != nil {
		t.Fatalf("Read(valid) error = %v", err)
	}
	request := contracts.ApplyRuntimeSourceRequest{
		ProjectID: "", Entrypoint: "app.py", ExpectedVersion: document.Version, Source: strings.Repeat("x", MaximumBytes+1),
	}
	if _, err := store.Apply(project, request); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("Apply(oversized) error = %v", err)
	}
	request.Source = "bad\x00source"
	if _, err := store.Apply(project, request); !errors.Is(err, ErrInvalidText) {
		t.Fatalf("Apply(NUL) error = %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != document.Source {
		t.Fatalf("entrypoint after invalid source = %q, error = %v", content, err)
	}
}

func TestStoreRejectsSymlinkAndNonregularEntrypoints(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.py")
	if err := os.WriteFile(outside, []byte("outside\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(outside) error = %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "app.py")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	store, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	if _, err := store.Read(sourceProject()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Read(symlink) error = %v", err)
	}
	if err := os.Remove(filepath.Join(root, "app.py")); err != nil {
		t.Fatalf("Remove(symlink) error = %v", err)
	}
	if err := os.Mkdir(filepath.Join(root, "app.py"), 0o700); err != nil {
		t.Fatalf("Mkdir(entrypoint) error = %v", err)
	}
	if _, err := store.Read(sourceProject()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Read(directory) error = %v", err)
	}
	if err := os.Remove(filepath.Join(root, "app.py")); err != nil {
		t.Fatalf("Remove(directory) error = %v", err)
	}
	nestedOutside := t.TempDir()
	if err := os.WriteFile(filepath.Join(nestedOutside, "app.py"), []byte("outside\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(nested outside) error = %v", err)
	}
	if err := os.Symlink(nestedOutside, filepath.Join(root, "nested")); err != nil {
		t.Skipf("nested symlink unavailable: %v", err)
	}
	project := sourceProject()
	project.Runtime.Entrypoint = filepath.Join("nested", "app.py")
	if _, err := store.Read(project); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Read(nested symlink) error = %v", err)
	}
}

func TestStoreSerializesVersionedWriters(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "app.py"), []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	store, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	project := sourceProject()
	document, err := store.Read(project)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	var wait sync.WaitGroup
	wait.Add(2)
	errorsByWriter := make(chan error, 2)
	for _, candidate := range []string{"first\n", "second\n"} {
		candidate := candidate
		go func() {
			defer wait.Done()
			_, applyErr := store.Apply(project, contracts.ApplyRuntimeSourceRequest{
				ProjectID: project.ID, Entrypoint: "app.py", ExpectedVersion: document.Version, Source: candidate,
			})
			errorsByWriter <- applyErr
		}()
	}
	wait.Wait()
	close(errorsByWriter)
	succeeded := 0
	conflicted := 0
	for err := range errorsByWriter {
		if err == nil {
			succeeded++
		} else if errors.Is(err, ErrConflict) {
			conflicted++
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("writers succeeded = %d, conflicted = %d", succeeded, conflicted)
	}
}

func sourceProject() contracts.Project {
	return contracts.Project{ID: "project-source", Runtime: contracts.RuntimeDeclaration{Kind: "python", Entrypoint: "app.py"}}
}
