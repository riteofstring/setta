package workspaceui

import (
	"reflect"
	"strconv"
	"strings"
	"testing"

	"setta/internal/workspace"
)

func TestDefaultLayoutCreatesBackendOwnedInitialWorkspacePanes(t *testing.T) {
	layout := DefaultLayout(workspace.WorkspaceSummary{
		ID:           "workspace_api",
		RootPath:     "/tmp/api",
		DisplayName:  "API Workspace",
		LastOpenedAt: "2026-05-29T20:00:00Z",
	})
	if _, err := newTestStore(t, t.TempDir()).SaveLayout(layout); err != nil {
		t.Fatalf("save default layout: %v", err)
	}
	if layout.SchemaVersion != SchemaVersion || layout.Revision != 1 || layout.WorkspaceID != "workspace_api" {
		t.Fatalf("layout identity = %+v, want schema %d revision 1 workspace_api", layout, SchemaVersion)
	}
	if layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want workspace_pane_0", layout.FocusedPaneID)
	}
	if len(layout.Panes) != 4 || len(layout.Columns) != 4 {
		t.Fatalf("layout has %d panes and %d columns, want 4 each", len(layout.Panes), len(layout.Columns))
	}

	expectedPanes := []defaultPaneExpectation{
		{
			columnID:    "workspace_column_0",
			paneID:      "workspace_pane_0",
			subtitle:    "API Workspace",
			surfaceID:   "workspace_surface_0",
			surfaceKind: SurfaceKindChatDOM,
			title:       "Chat",
			tone:        PaneToneCyan,
			weight:      1.6,
		},
		{
			columnID:    "workspace_column_1",
			paneID:      "workspace_pane_1",
			subtitle:    "workspace command surface",
			surfaceID:   "workspace_surface_1",
			surfaceKind: SurfaceKindTerminal,
			title:       "Terminal",
			tone:        PaneToneGreen,
			weight:      1,
		},
		{
			columnID:    "workspace_column_2",
			paneID:      "workspace_pane_2",
			subtitle:    "workflow graph",
			surfaceID:   "workspace_surface_2",
			surfaceKind: SurfaceKindWorkflowGraph,
			title:       "Workflow Graph",
			tone:        PaneToneCyan,
			weight:      1,
		},
		{
			columnID:    "workspace_column_3",
			paneID:      "workspace_pane_3",
			subtitle:    "workspace settings",
			surfaceID:   "workspace_surface_3",
			surfaceKind: SurfaceKindSettingsDOM,
			title:       "Settings",
			tone:        PaneToneSlate,
			weight:      1,
		},
	}
	for index, expected := range expectedPanes {
		assertDefaultPane(t, layout.Panes[index], expected)
	}
	for index, column := range layout.Columns {
		wantColumnID := "workspace_column_" + strconv.Itoa(index)
		wantPaneID := "workspace_pane_" + strconv.Itoa(index)
		if column.ColumnID != wantColumnID || column.Index != index || column.PlaneIndex != 0 || column.SlotIndex != index {
			t.Fatalf("column %d = %+v, want id %s plane 0 slot %d", index, column, wantColumnID, index)
		}
		if !reflect.DeepEqual(column.PaneIDs, []string{wantPaneID}) {
			t.Fatalf("column %d pane ids = %+v, want %s", index, column.PaneIDs, wantPaneID)
		}
		if column.IdealWidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: defaultWorkspaceUIColumnWidthPX}) ||
			column.WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: defaultWorkspaceUIColumnWidthPX}) ||
			column.PreviousProportionWidth != nil {
			t.Fatalf("column %d width = %+v, want default px width without previous proportion", index, column)
		}
	}
}

type defaultPaneExpectation struct {
	columnID    string
	paneID      string
	surfaceID   string
	surfaceKind SurfaceKind
	title       string
	subtitle    string
	tone        PaneTone
	weight      float64
}

func TestServiceInitializeLayoutPersistsDefaultLayoutAndPublishesEvent(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 4)
	subscription := subscribeWorkspaceUIEvents(t, service, EventCursor{}, "workspace_api")
	defer subscription.Unsubscribe()

	layout, err := service.InitializeLayout("workspace_api")
	if err != nil {
		t.Fatalf("initialize layout: %v", err)
	}
	if layout.WorkspaceID != "workspace_api" || layout.Revision != 1 || layout.Panes[0].Subtitle != "workspace_api" {
		t.Fatalf("initialized layout = %+v, want workspace_api default layout", layout)
	}

	event := receiveWorkspaceUIEvent(t, subscription)
	if event.Type != WorkspaceUIEventTypeLayoutUpdated || event.Sequence != 1 || event.Revision != 1 || event.Layout == nil {
		t.Fatalf("event = %+v, want first layout update with revision 1", event)
	}
	if !reflect.DeepEqual(*event.Layout, layout) {
		t.Fatalf("event layout = %+v, want initialized layout %+v", event.Layout, layout)
	}

	read, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read initialized layout: %v", err)
	}
	if read.Layout == nil || !reflect.DeepEqual(*read.Layout, layout) {
		t.Fatalf("read layout = %+v, want initialized layout", read.Layout)
	}
}

func TestServiceInitializeLayoutRejectsExistingLayout(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	existing, err := service.SaveLayout(testLayout("workspace_api"))
	if err != nil {
		t.Fatalf("save existing layout: %v", err)
	}

	_, err = service.InitializeLayout("workspace_api")
	if err == nil || !strings.Contains(err.Error(), "workspace UI layout already exists") {
		t.Fatalf("initialize existing layout error = %v, want already exists", err)
	}
	read, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if read.Layout == nil || !reflect.DeepEqual(*read.Layout, existing) {
		t.Fatalf("read layout after rejected initialize = %+v, want existing layout", read.Layout)
	}
}

func assertDefaultPane(
	t *testing.T,
	pane WorkspaceUIPane,
	expected defaultPaneExpectation,
) {
	t.Helper()
	if pane.ColumnID != expected.columnID ||
		pane.PaneID != expected.paneID ||
		pane.SurfaceID != expected.surfaceID ||
		pane.SurfaceKind != expected.surfaceKind ||
		pane.Title != expected.title ||
		pane.Subtitle != expected.subtitle ||
		pane.Tone != expected.tone ||
		pane.Weight != expected.weight {
		t.Fatalf("pane = %+v, want %+v", pane, expected)
	}
	if pane.TerminalConfig != nil || pane.WorkflowNodeDetailsConfig != nil || pane.HeightPX != nil {
		t.Fatalf("pane config = %+v, want no optional configs or explicit height", pane)
	}
}
