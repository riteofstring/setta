package applayout

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorePersistsAppPaneLayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	layout := testLayout()

	saved, err := store.SaveLayout(layout)
	if err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := store.LoadLayout()
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}

	if saved.FocusedPaneID != layout.FocusedPaneID {
		t.Fatalf("saved focusedPaneID = %q, want %q", saved.FocusedPaneID, layout.FocusedPaneID)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout is nil")
	}
	if loaded.Layout.MaximizedPaneID == nil || *loaded.Layout.MaximizedPaneID != "app_pane_master" {
		t.Fatalf("maximizedPaneId = %#v, want app_pane_master", loaded.Layout.MaximizedPaneID)
	}
	if loaded.Layout.Panes[1].ConversationConfig == nil {
		t.Fatalf("loaded conversation config is nil: %+v", loaded.Layout.Panes[1])
	}
	if loaded.Layout.Panes[1].ConversationConfig.ResourceBindings[0].Folder.RootPath != "/tmp/setta-project" {
		t.Fatalf("folder binding = %+v", loaded.Layout.Panes[1].ConversationConfig.ResourceBindings)
	}
	path := StateFilePath(appDataDir)
	wantPath := filepath.Join(appDataDir, "app-pane-layout", "layout.json")
	if path != wantPath {
		t.Fatalf("state path = %q, want %q", path, wantPath)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("stat layout file: %v", err)
	}
}

func TestLoadMissingAppPaneLayoutReturnsNilLayout(t *testing.T) {
	store := newTestStore(t, t.TempDir())

	result, err := store.LoadLayout()
	if err != nil {
		t.Fatalf("load missing layout: %v", err)
	}
	if result.Layout != nil {
		t.Fatalf("layout = %+v, want nil", result.Layout)
	}
}

func TestStoreRejectsMalformedAppPaneLayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	path := StateFilePath(appDataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed layout: %v", err)
	}

	_, err := store.LoadLayout()
	if err == nil {
		t.Fatal("load succeeded, want malformed app pane layout state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRejectsInvalidAppPaneLayoutRelationships(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout()
	layout.Columns[0].PaneIDs = []string{"app_pane_missing"}

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want relationship error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRequiresExactlyOneMasterPane(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*AppPaneLayout)
		want   string
	}{
		{
			name: "missing master",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes = layout.Panes[1:]
				layout.Columns[0].PaneIDs = []string{"app_pane_conversation"}
				layout.FocusedPaneID = "app_pane_conversation"
				layout.MaximizedPaneID = nil
			},
			want: "exactly one master pane, got 0",
		},
		{
			name: "duplicate master",
			mutate: func(layout *AppPaneLayout) {
				duplicate := layout.Panes[0]
				duplicate.PaneID = "app_pane_master_duplicate"
				duplicate.SurfaceID = "app_surface_master_duplicate"
				duplicate.Sequence = 2
				layout.Panes = append(layout.Panes, duplicate)
				layout.Columns[0].PaneIDs = append(layout.Columns[0].PaneIDs, duplicate.PaneID)
			},
			want: "exactly one master pane, got 2",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTestStore(t, t.TempDir())
			layout := testLayout()
			test.mutate(&layout)

			_, err := store.SaveLayout(layout)
			if err == nil {
				t.Fatal("save succeeded, want master pane invariant error")
			}
			if !IsCorruptStateError(err) || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %T %v, want corrupt state containing %q", err, err, test.want)
			}
		})
	}
}

func TestStoreRejectsInvalidPaneConfigs(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*AppPaneLayout)
		want   string
	}{
		{
			name: "missing master config",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes[0].MasterConfig = nil
			},
			want: "masterConfig is required for master panes",
		},
		{
			name: "misplaced master config",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes[1].MasterConfig = &MasterPaneConfig{}
			},
			want: "masterConfig is only valid for master panes",
		},
		{
			name: "missing conversation config",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes[1].ConversationConfig = nil
			},
			want: "conversationConfig is required for conversation panes",
		},
		{
			name: "null resource bindings",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes[1].ConversationConfig.ResourceBindings = nil
			},
			want: "resourceBindings must not be null",
		},
		{
			name: "relative folder binding",
			mutate: func(layout *AppPaneLayout) {
				layout.Panes[1].ConversationConfig.ResourceBindings = []ConversationPaneResourceBinding{{
					Folder: &FolderResourceBinding{RootPath: "relative"},
					Kind:   ConversationPaneResourceBindingKindFolder,
				}}
			},
			want: "folder.rootPath must be absolute",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTestStore(t, t.TempDir())
			layout := testLayout()
			test.mutate(&layout)

			_, err := store.SaveLayout(layout)
			if err == nil {
				t.Fatal("save succeeded, want config error")
			}
			if !IsCorruptStateError(err) || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %T %v, want corrupt state containing %q", err, err, test.want)
			}
		})
	}
}

func TestStoreRejectsPersistedConversationPaneWithoutConfig(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	layout := testLayout()
	layout.Panes[1].ConversationConfig = nil
	payload, err := json.Marshal(layout)
	if err != nil {
		t.Fatalf("marshal invalid layout fixture: %v", err)
	}
	path := StateFilePath(appDataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write invalid layout fixture: %v", err)
	}

	_, err = store.LoadLayout()
	if err == nil {
		t.Fatal("load succeeded, want missing conversation config error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "conversationConfig is required for conversation panes") {
		t.Fatalf("error = %T %v, want missing conversation config corrupt state", err, err)
	}
}

func TestStoreRejectsDuplicateConversationPaneBindings(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout()
	duplicate := layout.Panes[1]
	duplicate.PaneID = "app_pane_conversation_duplicate"
	duplicate.SurfaceID = "app_surface_conversation_duplicate"
	duplicate.Sequence = 2
	layout.Panes = append(layout.Panes, duplicate)
	layout.Columns[0].PaneIDs = append(layout.Columns[0].PaneIDs, duplicate.PaneID)

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want duplicate conversation binding error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "bound to multiple app conversation panes") {
		t.Fatalf("error = %T %v, want duplicate conversation binding corrupt state", err, err)
	}
}

func TestServicePersistsAppPaneLayout(t *testing.T) {
	service, err := NewService(newTestStore(t, t.TempDir()))
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	layout := testLayout()

	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := service.ReadLayout()
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != layout.FocusedPaneID {
		t.Fatalf("loaded layout = %+v, want focus %s", loaded.Layout, layout.FocusedPaneID)
	}
}

func newTestStore(t *testing.T, appDataDir string) *Store {
	t.Helper()

	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func testLayout() AppPaneLayout {
	maximizedPaneID := "app_pane_master"
	previous := 0.42
	return AppPaneLayout{
		SchemaVersion:   SchemaVersion,
		FocusedPaneID:   "app_pane_master",
		MaximizedPaneID: &maximizedPaneID,
		Columns: []AppPaneColumn{
			{
				ColumnID:                "app_column_0",
				IdealWidthSpec:          AppPaneColumnWidthSpec{Unit: AppPaneColumnWidthUnitPX, Value: 640},
				Index:                   0,
				PaneIDs:                 []string{"app_pane_master", "app_pane_conversation"},
				PlaneIndex:              0,
				PreviousProportionWidth: &previous,
				SlotIndex:               0,
				WidthSpec:               AppPaneColumnWidthSpec{Unit: AppPaneColumnWidthUnitPX, Value: 720},
			},
		},
		Panes: []AppPane{
			{
				ColumnID:     "app_column_0",
				Heat:         0,
				MasterConfig: &MasterPaneConfig{},
				PaneID:       "app_pane_master",
				Sequence:     0,
				Subtitle:     "Global coordinator",
				SurfaceID:    "app_surface_master",
				SurfaceKind:  AppPaneSurfaceKindMaster,
				Title:        "Setta",
				Tone:         AppPaneToneSlate,
				Weight:       1.6,
			},
			{
				ColumnID: "app_column_0",
				ConversationConfig: &ConversationPaneConfig{
					ConversationID: "conversation_test",
					PresentationIdentity: ConversationPanePresentationIdentity{
						Subtitle: "Topic conversation",
						Title:    "Topic",
						Tone:     AppPaneToneCyan,
					},
					ResourceBindings: []ConversationPaneResourceBinding{{
						Folder: &FolderResourceBinding{RootPath: "/tmp/setta-project"},
						Kind:   ConversationPaneResourceBindingKindFolder,
					}},
				},
				Heat:        37,
				PaneID:      "app_pane_conversation",
				Sequence:    1,
				Subtitle:    "Topic conversation",
				SurfaceID:   "app_surface_conversation",
				SurfaceKind: AppPaneSurfaceKindConversation,
				Title:       "Topic",
				Tone:        AppPaneToneCyan,
				Weight:      1,
			},
		},
	}
}
