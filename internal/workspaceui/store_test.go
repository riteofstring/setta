package workspaceui

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/workspace"
)

func TestStorePersistsWorkspaceUILayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	layout := testLayout("workspace_api")

	saved, err := store.SaveLayout(layout)
	if err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := store.LoadLayout(layout.WorkspaceID)
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}

	if saved.WorkspaceID != layout.WorkspaceID {
		t.Fatalf("saved workspaceID = %q, want %q", saved.WorkspaceID, layout.WorkspaceID)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout is nil")
	}
	if loaded.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focusedPaneId = %q, want workspace_pane_1", loaded.Layout.FocusedPaneID)
	}
	if loaded.Layout.Columns[0].PreviousProportionWidth == nil || *loaded.Layout.Columns[0].PreviousProportionWidth != 0.42 {
		t.Fatalf("previous proportion width = %#v", loaded.Layout.Columns[0].PreviousProportionWidth)
	}
	path := StateFilePath(appDataDir, layout.WorkspaceID)
	wantPath := filepath.Join(appDataDir, "workspace-ui", layout.WorkspaceID, "layout.json")
	if path != wantPath {
		t.Fatalf("state path = %q, want %q", path, wantPath)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("stat layout file: %v", err)
	}
}

func TestLoadMissingWorkspaceUILayoutReturnsNilLayout(t *testing.T) {
	store := newTestStore(t, t.TempDir())

	result, err := store.LoadLayout("workspace_api")
	if err != nil {
		t.Fatalf("load missing layout: %v", err)
	}
	if result.WorkspaceID != "workspace_api" {
		t.Fatalf("workspaceID = %q, want workspace_api", result.WorkspaceID)
	}
	if result.Layout != nil {
		t.Fatalf("layout = %+v, want nil", result.Layout)
	}
}

func TestStoreRejectsMalformedWorkspaceUILayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	path := StateFilePath(appDataDir, "workspace_api")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed layout: %v", err)
	}

	_, err := store.LoadLayout("workspace_api")
	if err == nil {
		t.Fatal("load succeeded, want malformed workspace UI state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRejectsWorkspaceIDPathTraversal(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("../workspace_api")

	if _, err := store.SaveLayout(layout); err == nil {
		t.Fatal("save succeeded, want invalid workspace id error")
	}
	if _, err := store.LoadLayout("../workspace_api"); err == nil {
		t.Fatal("load succeeded, want invalid workspace id error")
	}
}

func TestStoreRejectsInvalidLayoutRelationships(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Columns[0].PaneIDs = []string{"workspace_pane_missing"}

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want relationship error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStorePersistsEasyButtonPaneConfig(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindEasyButton
	layout.Panes[0].EasyButtonConfig = &EasyButtonPaneConfig{ConversationID: "conversation-1"}

	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("save layout with easy button config: %v", err)
	}
	loaded, err := store.LoadLayout(layout.WorkspaceID)
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Panes[0].EasyButtonConfig == nil {
		t.Fatalf("loaded easy button config = %+v", loaded.Layout)
	}
	if loaded.Layout.Panes[0].EasyButtonConfig.ConversationID != "conversation-1" {
		t.Fatalf("loaded conversation id = %q, want conversation-1", loaded.Layout.Panes[0].EasyButtonConfig.ConversationID)
	}
}

func TestStoreRejectsInvalidEasyButtonPaneConfig(t *testing.T) {
	tests := []struct {
		name        string
		surfaceKind SurfaceKind
		config      *EasyButtonPaneConfig
		want        string
	}{
		{
			name:        "missing config",
			surfaceKind: SurfaceKindEasyButton,
			config:      nil,
			want:        "easyButtonConfig is required for easy-button panes",
		},
		{
			name:        "missing conversation",
			surfaceKind: SurfaceKindEasyButton,
			config:      &EasyButtonPaneConfig{},
			want:        "conversationId is required",
		},
		{
			name:        "surrounding whitespace",
			surfaceKind: SurfaceKindEasyButton,
			config:      &EasyButtonPaneConfig{ConversationID: " conversation-1"},
			want:        "must not have surrounding whitespace",
		},
		{
			name:        "wrong surface",
			surfaceKind: SurfaceKindEmptyFrame,
			config:      &EasyButtonPaneConfig{ConversationID: "conversation-1"},
			want:        "only valid for easy-button panes",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTestStore(t, t.TempDir())
			layout := testLayout("workspace_api")
			layout.Panes[0].SurfaceKind = test.surfaceKind
			layout.Panes[0].EasyButtonConfig = test.config

			_, err := store.SaveLayout(layout)
			if err == nil {
				t.Fatal("save succeeded, want invalid easy button config error")
			}
			if !IsCorruptStateError(err) || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %T %v, want corrupt state containing %q", err, err, test.want)
			}
		})
	}
}

func TestStoreRejectsPersistedEasyButtonPaneWithoutConversationBinding(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	layout := testLayout("workspace_api")
	layout.Panes[0].EasyButtonConfig = nil
	payload, err := json.Marshal(layout)
	if err != nil {
		t.Fatalf("marshal invalid layout fixture: %v", err)
	}
	path := StateFilePath(appDataDir, layout.WorkspaceID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write invalid layout fixture: %v", err)
	}

	_, err = store.LoadLayout(layout.WorkspaceID)
	if err == nil {
		t.Fatal("load succeeded, want missing Easy Button binding error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "easyButtonConfig is required for easy-button panes") {
		t.Fatalf("error = %T %v, want missing Easy Button binding corrupt state", err, err)
	}
}

func TestStoreRejectsDuplicateEasyButtonConversationBindings(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[1].SurfaceKind = SurfaceKindEasyButton
	layout.Panes[1].EasyButtonConfig = &EasyButtonPaneConfig{ConversationID: "conversation_test"}

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want duplicate conversation binding error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "bound to multiple easy-button panes") {
		t.Fatalf("error = %T %v, want duplicate Easy Button binding corrupt state", err, err)
	}
}

func TestServiceRequiresResolvedWorkspace(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{})

	_, err := service.ReadLayout("workspace_api")
	if err == nil {
		t.Fatal("read succeeded, want workspace resolver error")
	}
	if !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("error = %q, want workspace not found", err)
	}
}

func TestServicePersistsResolvedWorkspaceLayout(t *testing.T) {
	appDataDir := t.TempDir()
	service := newTestService(t, appDataDir, testResolver{
		"workspace_api": "/tmp/api",
	})

	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.WorkspaceID != "workspace_api" {
		t.Fatalf("loaded layout = %+v", loaded.Layout)
	}
}

func TestServiceObservesSavedAndReadWorkspaceLayouts(t *testing.T) {
	appDataDir := t.TempDir()
	observer := &recordingLayoutObserver{}
	service, err := NewService(
		newTestStore(t, appDataDir),
		testResolver{"workspace_api": "/tmp/api"},
		observer,
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	layout := testLayout("workspace_api")

	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	if _, err := service.ReadLayout(layout.WorkspaceID); err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if len(observer.layouts) != 2 {
		t.Fatalf("observed layout count = %d, want 2", len(observer.layouts))
	}
	for index, observed := range observer.layouts {
		if observed.WorkspaceID != layout.WorkspaceID || observed.FocusedPaneID != layout.FocusedPaneID {
			t.Errorf("observed layout %d = %+v, want workspace %s focus %s", index, observed, layout.WorkspaceID, layout.FocusedPaneID)
		}
	}
}

type recordingLayoutObserver struct {
	layouts []WorkspaceUILayout
}

func (observer *recordingLayoutObserver) ObserveWorkspaceUILayout(layout WorkspaceUILayout) error {
	observer.layouts = append(observer.layouts, layout)
	return nil
}

func newTestStore(t *testing.T, appDataDir string) *Store {
	t.Helper()

	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func newTestService(t *testing.T, appDataDir string, resolver testResolver) *Service {
	t.Helper()

	service, err := NewService(newTestStore(t, appDataDir), resolver, discardingLayoutObserver{})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

type discardingLayoutObserver struct{}

func (discardingLayoutObserver) ObserveWorkspaceUILayout(WorkspaceUILayout) error {
	return nil
}

type testResolver map[string]string

func (resolver testResolver) LookupWorkspace(id string) (workspace.WorkspaceSummary, error) {
	rootPath, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found: " + id)
	}
	return workspace.WorkspaceSummary{
		ID:           id,
		RootPath:     rootPath,
		DisplayName:  id,
		LastOpenedAt: "2026-05-29T20:00:00Z",
	}, nil
}

func testLayout(workspaceID string) WorkspaceUILayout {
	previous := 0.42
	return WorkspaceUILayout{
		SchemaVersion: SchemaVersion,
		WorkspaceID:   workspaceID,
		FocusedPaneID: "workspace_pane_1",
		Columns: []WorkspaceUIColumn{
			{
				ColumnID:                "workspace_column_0",
				IdealWidthSpec:          ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520},
				Index:                   0,
				PaneIDs:                 []string{"workspace_pane_0", "workspace_pane_1"},
				PlaneIndex:              0,
				PreviousProportionWidth: &previous,
				SlotIndex:               0,
				WidthSpec:               ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
		Panes: []WorkspaceUIPane{
			{
				ColumnID:         "workspace_column_0",
				EasyButtonConfig: &EasyButtonPaneConfig{ConversationID: "conversation_test"},
				Heat:             0,
				PaneID:           "workspace_pane_0",
				Sequence:         0,
				Subtitle:         "topic",
				SurfaceID:        "workspace_surface_0",
				SurfaceKind:      SurfaceKindEasyButton,
				Title:            "Topic",
				Tone:             PaneToneCyan,
				Weight:           1.6,
			},
			{
				ColumnID:    "workspace_column_0",
				Heat:        37,
				PaneID:      "workspace_pane_1",
				Sequence:    1,
				Subtitle:    "browser",
				SurfaceID:   "workspace_surface_1",
				SurfaceKind: SurfaceKindBrowser,
				Title:       "Browser",
				Tone:        PaneToneGreen,
				Weight:      1,
			},
		},
	}
}
