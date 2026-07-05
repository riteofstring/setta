package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOpenLocalCreatesWorkspaceMetadata(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	manager := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))

	summary, state, err := manager.OpenLocal(rootPath)
	if err != nil {
		t.Fatalf("open local workspace: %v", err)
	}

	if !strings.HasPrefix(summary.ID, "workspace_") {
		t.Fatalf("summary id = %q, want workspace_ prefix", summary.ID)
	}
	canonicalRootPath, err := validateRootPath(rootPath)
	if err != nil {
		t.Fatalf("canonicalize root path: %v", err)
	}
	if summary.RootPath != canonicalRootPath {
		t.Fatalf("summary root = %q, want %q", summary.RootPath, canonicalRootPath)
	}
	if summary.DisplayName != filepath.Base(canonicalRootPath) {
		t.Fatalf("summary display name = %q, want %q", summary.DisplayName, filepath.Base(canonicalRootPath))
	}
	if summary.LastOpenedAt != "2026-05-29T20:00:00Z" {
		t.Fatalf("last opened = %q", summary.LastOpenedAt)
	}
	if state.ID != summary.ID {
		t.Fatalf("state id = %q, want %q", state.ID, summary.ID)
	}

	persisted := readWorkspaceState(t, StateFilePath(appDataDir, summary.ID))
	if persisted != state {
		t.Fatalf("persisted state = %+v, want %+v", persisted, state)
	}
	if _, err := os.Stat(filepath.Join(rootPath, ".setta")); !os.IsNotExist(err) {
		t.Fatalf("workspace root .setta stat error = %v, want missing", err)
	}
}

func TestOpenLocalReusesExistingWorkspaceID(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	first := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))
	if _, _, err := first.OpenLocal(rootPath); err != nil {
		t.Fatalf("first open: %v", err)
	}

	second := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:05:00Z"))
	summary, state, err := second.OpenLocal(rootPath)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}

	if state.CreatedAt != "2026-05-29T20:00:00Z" {
		t.Fatalf("createdAt = %q, want original timestamp", state.CreatedAt)
	}
	if state.UpdatedAt != "2026-05-29T20:05:00Z" {
		t.Fatalf("updatedAt = %q, want second open timestamp", state.UpdatedAt)
	}
	if summary.LastOpenedAt != "2026-05-29T20:05:00Z" {
		t.Fatalf("lastOpenedAt = %q, want second open timestamp", summary.LastOpenedAt)
	}
}

func TestOpenLocalRejectsInvalidPaths(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "file.txt")
	if err := os.WriteFile(filePath, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write file path fixture: %v", err)
	}

	tests := map[string]string{
		"file path":     filePath,
		"missing path":  filepath.Join(tempDir, "missing"),
		"relative path": "relative-workspace",
	}

	manager := testManager(t, t.TempDir(), mustTime(t, "2026-05-29T20:00:00Z"))
	for name, path := range tests {
		t.Run(name, func(t *testing.T) {
			if _, _, err := manager.OpenLocal(path); err == nil {
				t.Fatal("open local succeeded, want error")
			}
		})
	}
}

func TestOpenLocalRejectsMalformedMetadata(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	statePath := statePathForRoot(t, appDataDir, rootPath)
	stateDir := filepath.Dir(statePath)
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("create metadata dir: %v", err)
	}
	if err := os.WriteFile(statePath, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed metadata: %v", err)
	}

	manager := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))
	_, _, err := manager.OpenLocal(rootPath)
	if err == nil {
		t.Fatal("open local succeeded, want malformed metadata error")
	}
	if !strings.Contains(err.Error(), "malformed workspace metadata") {
		t.Fatalf("error = %q, want malformed metadata", err)
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestOpenLocalRejectsTrailingMetadataJSON(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	writeWorkspaceStateFixture(t, appDataDir, rootPath, `{"schemaVersion":1,"id":"`+workspaceIDForRoot(t, rootPath)+`","rootPath":"`+rootPath+`","displayName":"api","createdAt":"2026-05-29T20:00:00Z","updatedAt":"2026-05-29T20:00:00Z"}{"junk":true}`)

	manager := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))
	_, _, err := manager.OpenLocal(rootPath)
	if err == nil {
		t.Fatal("open local succeeded, want trailing metadata error")
	}
	if !strings.Contains(err.Error(), "exactly one value") {
		t.Fatalf("error = %q, want exactly one value", err)
	}
}

func TestOpenLocalRejectsUnknownMetadataFields(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	writeWorkspaceStateFixture(t, appDataDir, rootPath, `{"schemaVersion":1,"id":"`+workspaceIDForRoot(t, rootPath)+`","rootPath":"`+rootPath+`","displayName":"api","createdAt":"2026-05-29T20:00:00Z","updatedAt":"2026-05-29T20:00:00Z","extra":true}`)

	manager := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))
	_, _, err := manager.OpenLocal(rootPath)
	if err == nil {
		t.Fatal("open local succeeded, want unknown field metadata error")
	}
	if !strings.Contains(err.Error(), `unknown field "extra"`) {
		t.Fatalf("error = %q, want unknown field", err)
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestOpenLocalFailsWhenAppDataWorkspaceRootCannotBecomeDirectory(t *testing.T) {
	appDataDir := t.TempDir()
	rootPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(appDataDir, stateDirName), []byte("file"), 0o644); err != nil {
		t.Fatalf("write app-data workspaces file fixture: %v", err)
	}

	manager := testManager(t, appDataDir, mustTime(t, "2026-05-29T20:00:00Z"))
	_, _, err := manager.OpenLocal(rootPath)
	if err == nil {
		t.Fatal("open local succeeded, want metadata creation error")
	}
	if !strings.Contains(err.Error(), "read workspace metadata") {
		t.Fatalf("error = %q, want metadata read failure", err)
	}
}

func testManager(t *testing.T, appDataDir string, now time.Time) *Manager {
	t.Helper()

	manager, err := NewManager(
		appDataDir,
		WithClock(func() time.Time {
			return now
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	return manager
}

func readWorkspaceState(t *testing.T, statePath string) WorkspaceState {
	t.Helper()

	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read workspace state: %v", err)
	}
	var state WorkspaceState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatalf("decode workspace state: %v", err)
	}
	return state
}

func writeWorkspaceStateFixture(t *testing.T, appDataDir string, rootPath string, content string) {
	t.Helper()

	stateDir := filepath.Dir(statePathForRoot(t, appDataDir, rootPath))
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("create metadata dir: %v", err)
	}
	if err := os.WriteFile(statePathForRoot(t, appDataDir, rootPath), []byte(content), 0o644); err != nil {
		t.Fatalf("write metadata fixture: %v", err)
	}
}

func statePathForRoot(t *testing.T, appDataDir string, rootPath string) string {
	t.Helper()

	return StateFilePath(appDataDir, workspaceIDForRoot(t, rootPath))
}

func workspaceIDForRoot(t *testing.T, rootPath string) string {
	t.Helper()

	canonicalPath, err := validateRootPath(rootPath)
	if err != nil {
		t.Fatalf("canonicalize root path: %v", err)
	}
	return workspaceID(canonicalPath)
}

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}
