package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreLoadReturnsEmptyDocumentWhenFileMissing(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))

	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load project document: %v", err)
	}

	if document.SchemaVersion != CurrentSchemaVersion {
		t.Fatalf("expected schema version %d, got %d", CurrentSchemaVersion, document.SchemaVersion)
	}
	if len(document.Projects) != 0 {
		t.Fatalf("expected no projects, got %d", len(document.Projects))
	}
}

func TestStoreLoadRejectsNonObjectPayload(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestFile(t, projectPath, []byte(`["not-an-object"]`))
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrProjectPayloadNotObject) {
		t.Fatalf("expected non-object payload error, got %v", err)
	}
}

func TestStoreLoadRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestFile(t, projectPath, []byte(`{`))
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if err == nil {
		t.Fatal("expected invalid JSON error")
	}
}

func TestStoreLoadRejectsUnsupportedSchemaVersion(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion": 99,
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrUnsupportedSchemaVersion) {
		t.Fatalf("expected unsupported schema version error, got %v", err)
	}
}

func TestStoreSaveRoundTripsDocument(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	store := newTestStore(t, projectPath)
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save project document: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load saved project document: %v", err)
	}
	if loaded.SchemaVersion != document.SchemaVersion {
		t.Fatalf("expected schema version %d, got %d", document.SchemaVersion, loaded.SchemaVersion)
	}
	if loaded.DefaultProjectID != document.DefaultProjectID {
		t.Fatalf("expected default project id %q, got %q", document.DefaultProjectID, loaded.DefaultProjectID)
	}
	project, ok := loaded.Projects["project-alpha"]
	if !ok {
		t.Fatal("expected project-alpha to be present")
	}
	if project.Name != "Alpha" {
		t.Fatalf("expected project name Alpha, got %q", project.Name)
	}
}

func TestStoreSaveRejectsInvalidDocument(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "missing",
		Projects:         map[string]Project{},
	}

	err := store.Save(context.Background(), document)
	if !errors.Is(err, ErrDefaultProjectNotFound) {
		t.Fatalf("expected missing default project error, got %v", err)
	}
}

func TestStoreSaveCreatesReadableJSONFile(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "nested", "project.json")
	store := newTestStore(t, projectPath)

	if err := store.Save(context.Background(), NewDocument()); err != nil {
		t.Fatalf("save empty project document: %v", err)
	}

	content, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read project document: %v", err)
	}
	if string(content) == "" {
		t.Fatal("expected saved project document content")
	}
	if content[len(content)-1] != '\n' {
		t.Fatal("expected saved project document to end with a newline")
	}
}

func newTestStore(t *testing.T, path string) *Store {
	t.Helper()

	store, err := NewStore(path, StoreOptions{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func writeTestFile(t *testing.T, path string, content []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}

func writeTestJSON(t *testing.T, path string, payload map[string]any) {
	t.Helper()

	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	content = append(content, '\n')
	writeTestFile(t, path, content)
}
