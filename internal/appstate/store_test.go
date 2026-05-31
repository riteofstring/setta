package appstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/workspace"
)

func TestStorePersistsAppState(t *testing.T) {
	store := newTestStore(t)
	state := State{
		SchemaVersion:       SchemaVersion,
		SelectedWorkspaceID: "workspace_web",
		ActiveWorkspaceIDs:  []string{"workspace_api", "workspace_web"},
		RecentWorkspaces: []workspace.WorkspaceSummary{
			summary("workspace_web", "2026-05-29T20:05:00Z"),
			summary("workspace_api", "2026-05-29T20:00:00Z"),
		},
	}

	if err := store.Save(state); err != nil {
		t.Fatalf("save app state: %v", err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("load app state: %v", err)
	}

	if loaded.SelectedWorkspaceID != state.SelectedWorkspaceID {
		t.Fatalf("selected = %q, want %q", loaded.SelectedWorkspaceID, state.SelectedWorkspaceID)
	}
	if loaded.ActiveWorkspaceIDs[0] != "workspace_api" || loaded.ActiveWorkspaceIDs[1] != "workspace_web" {
		t.Fatalf("active ids = %#v", loaded.ActiveWorkspaceIDs)
	}
}

func TestLoadMissingAppStateReturnsEmptyState(t *testing.T) {
	store := newTestStore(t)

	state, err := store.Load()
	if err != nil {
		t.Fatalf("load missing app state: %v", err)
	}
	if state.SchemaVersion != SchemaVersion {
		t.Fatalf("schemaVersion = %d, want %d", state.SchemaVersion, SchemaVersion)
	}
	if len(state.ActiveWorkspaceIDs) != 0 || len(state.RecentWorkspaces) != 0 || state.SelectedWorkspaceID != "" {
		t.Fatalf("state = %+v, want empty state", state)
	}
}

func TestStoreRejectsMalformedAppState(t *testing.T) {
	store := newTestStore(t)
	if err := os.MkdirAll(filepath.Dir(store.Path()), 0o755); err != nil {
		t.Fatalf("create app data dir: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed app state: %v", err)
	}

	_, err := store.Load()
	if err == nil {
		t.Fatal("load succeeded, want malformed app state error")
	}
	if !strings.Contains(err.Error(), "malformed app state") {
		t.Fatalf("error = %q, want malformed app state", err)
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRejectsTrailingAppStateJSON(t *testing.T) {
	store := newTestStore(t)
	writeAppStateFixture(t, store, `{"schemaVersion":1,"selectedWorkspaceId":"","activeWorkspaceIds":[],"recentWorkspaces":[]}{"junk":true}`)

	_, err := store.Load()
	if err == nil {
		t.Fatal("load succeeded, want trailing JSON error")
	}
	if !strings.Contains(err.Error(), "exactly one value") {
		t.Fatalf("error = %q, want exactly one value", err)
	}
}

func TestStoreRejectsUnknownAppStateFields(t *testing.T) {
	store := newTestStore(t)
	writeAppStateFixture(t, store, `{"schemaVersion":1,"selectedWorkspaceId":"","activeWorkspaceIds":[],"recentWorkspaces":[],"extra":true}`)

	_, err := store.Load()
	if err == nil {
		t.Fatal("load succeeded, want unknown field error")
	}
	if !strings.Contains(err.Error(), `unknown field "extra"`) {
		t.Fatalf("error = %q, want unknown field", err)
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRejectsInvalidStateRelationships(t *testing.T) {
	store := newTestStore(t)
	state := State{
		SchemaVersion:       SchemaVersion,
		SelectedWorkspaceID: "workspace_missing",
		ActiveWorkspaceIDs:  []string{"workspace_missing"},
		RecentWorkspaces:    []workspace.WorkspaceSummary{},
	}

	if err := store.Save(state); err == nil {
		t.Fatal("save succeeded, want relationship error")
	}
}

func TestStoreReportsPersistenceFailure(t *testing.T) {
	appDataFile := filepath.Join(t.TempDir(), "app-data-file")
	if err := os.WriteFile(appDataFile, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write app data file fixture: %v", err)
	}
	store, err := NewStore(appDataFile)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	err = store.Save(EmptyState())
	if err == nil {
		t.Fatal("save succeeded, want persistence error")
	}
	if !IsPersistenceError(err) {
		t.Fatalf("error = %T %v, want PersistenceError", err, err)
	}
}

func TestStoreWritesJSONShape(t *testing.T) {
	store := newTestStore(t)
	if err := store.Save(EmptyState()); err != nil {
		t.Fatalf("save empty app state: %v", err)
	}

	data, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("read app state file: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("decode app state json: %v", err)
	}
	if payload["schemaVersion"] != float64(SchemaVersion) {
		t.Fatalf("schemaVersion json = %#v, want %d", payload["schemaVersion"], SchemaVersion)
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func writeAppStateFixture(t *testing.T, store *Store, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(store.Path()), 0o755); err != nil {
		t.Fatalf("create app data dir: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(content), 0o644); err != nil {
		t.Fatalf("write app state fixture: %v", err)
	}
}

func summary(id string, lastOpenedAt string) workspace.WorkspaceSummary {
	return workspace.WorkspaceSummary{
		ID:           id,
		RootPath:     "/tmp/" + id,
		DisplayName:  id,
		LastOpenedAt: lastOpenedAt,
	}
}
