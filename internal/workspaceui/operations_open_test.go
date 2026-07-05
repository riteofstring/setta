package workspaceui

import (
	"reflect"
	"testing"
)

func TestServiceAppliesOpenPaneTerminalAtEnd(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: openPaneOperation(
			SurfaceKindTerminal,
			"Build Terminal",
			"command surface",
			PaneToneGreen,
		),
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}
	assertOpenTerminalResult(t, result)

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	assertLoadedOpenTerminalLayout(t, loaded)
}

func assertOpenTerminalResult(t *testing.T, result WorkspaceUIPaneOperationResult) {
	t.Helper()
	assertOpenTerminalRevisionAndFocus(t, result)
	assertOpenTerminalColumns(t, result.Layout)
	assertOpenTerminalPane(t, result.Layout)
	assertOpenTerminalOutcome(t, result.OperationResult)
	assertOpenTerminalEmptyCollections(t, result)
}

func assertOpenTerminalRevisionAndFocus(t *testing.T, result WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_2" {
		t.Fatalf("focused pane = %q, want created pane", result.Layout.FocusedPaneID)
	}
}

func assertOpenTerminalColumns(t *testing.T, layout WorkspaceUILayout) {
	t.Helper()
	assertPaneIDs(t, layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_1")
	assertPaneIDs(t, layout.Columns[1].PaneIDs, "workspace_pane_2")
	column := layout.Columns[1]
	if column.ColumnID != "workspace_column_1" || column.SlotIndex != 1 || column.WidthSpec != defaultOpenPaneColumnWidthSpec() {
		t.Fatalf("created column = %+v, want default appended column", column)
	}
}

func assertOpenTerminalPane(t *testing.T, layout WorkspaceUILayout) {
	t.Helper()
	pane := paneByID(t, layout, "workspace_pane_2")
	if pane.SurfaceID != "workspace_surface_2" || pane.SurfaceKind != SurfaceKindTerminal || pane.TerminalConfig == nil {
		t.Fatalf("created pane = %+v, want terminal pane with config", pane)
	}
	if pane.TerminalConfig.ProfileID != "" || pane.TerminalConfig.CWDOverride != "" || pane.TerminalConfig.TitleOverride != "" {
		t.Fatalf("terminal config = %+v, want empty normalized config", pane.TerminalConfig)
	}
}

func assertOpenTerminalOutcome(t *testing.T, outcome WorkspaceUIPaneOperationOutcome) {
	t.Helper()
	assertOpenOutcome(t, outcome.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:    "workspace_column_1",
		ColumnIndex: 1,
		PaneIndex:   0,
		PlaneIndex:  0,
		SurfaceID:   "workspace_surface_2",
		SurfaceKind: SurfaceKindTerminal,
		Title:       "Build Terminal",
		WidthSpec:   defaultOpenPaneColumnWidthSpec(),
	})
	if outcome.PaneID != "workspace_pane_2" || outcome.PreviousFocusedPaneID != "workspace_pane_1" || outcome.FocusedPaneID != "workspace_pane_2" {
		t.Fatalf("operation outcome focus fields = %+v, want created pane focused", outcome)
	}
}

func assertOpenTerminalEmptyCollections(t *testing.T, result WorkspaceUIPaneOperationResult) {
	t.Helper()
	if result.BeforeAfterDimensions == nil || len(result.BeforeAfterDimensions) != 0 {
		t.Fatalf("beforeAfterDimensions = %+v, want empty slice", result.BeforeAfterDimensions)
	}
	if result.Warnings == nil || len(result.Warnings) != 0 {
		t.Fatalf("warnings = %+v, want empty slice", result.Warnings)
	}
}

func assertLoadedOpenTerminalLayout(t *testing.T, loaded WorkspaceUILayoutReadResult) {
	t.Helper()
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != "workspace_pane_2" || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want persisted open pane", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[1].PaneIDs, "workspace_pane_2")
}

func TestServiceAppliesOpenPaneChatAfterAdjacentColumn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	widthSpec := ColumnWidthSpec{Unit: ColumnWidthUnitProportion, Value: 0.5}
	open := openPaneOperation(SurfaceKindChatDOM, "Side Chat", "workspace chat", PaneToneCyan)
	open.AdjacentToColumnID = "workspace_column_0"
	open.WidthSpec = &widthSpec

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Layout.FocusedPaneID != "workspace_pane_3" {
		t.Fatalf("focused pane = %q, want created pane", result.Layout.FocusedPaneID)
	}
	if len(result.Layout.Columns) != 3 {
		t.Fatalf("columns = %+v, want inserted column", result.Layout.Columns)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_2")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_3")
	assertPaneIDs(t, result.Layout.Columns[2].PaneIDs, "workspace_pane_1")
	if result.Layout.Columns[1].ColumnID != "workspace_column_2" || result.Layout.Columns[1].SlotIndex != 1 || result.Layout.Columns[2].SlotIndex != 2 {
		t.Fatalf("columns = %+v, want new slot between existing columns", result.Layout.Columns)
	}
	assertPreviousProportionWidth(t, result.Layout.Columns[1], 0.5)
	pane := paneByID(t, result.Layout, "workspace_pane_3")
	if pane.SurfaceKind != SurfaceKindChatDOM || pane.TerminalConfig != nil || pane.Title != "Side Chat" {
		t.Fatalf("created pane = %+v, want chat pane without terminal config", pane)
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		AdjacentToColumnID: "workspace_column_0",
		ColumnID:           "workspace_column_2",
		ColumnIndex:        1,
		PaneIndex:          0,
		PlaneIndex:         0,
		SurfaceID:          "workspace_surface_3",
		SurfaceKind:        SurfaceKindChatDOM,
		Title:              "Side Chat",
		WidthSpec:          widthSpec,
	})
}

func TestServiceAppliesOpenPaneWorkflowGraphWithWidthNormalizationWarning(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	widthSpec := ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 12}
	open := openPaneOperation(SurfaceKindWorkflowGraph, "Workflow Graph", "workflow graph", PaneToneCyan)
	open.WidthSpec = &widthSpec

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}
	createdColumn := result.Layout.Columns[1]
	if createdColumn.WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: minimumColumnWidthPX}) {
		t.Fatalf("created column width = %+v, want normalized minimum", createdColumn.WidthSpec)
	}
	pane := paneByID(t, result.Layout, "workspace_pane_2")
	if pane.SurfaceKind != SurfaceKindWorkflowGraph || pane.TerminalConfig != nil {
		t.Fatalf("created pane = %+v, want workflow graph pane", pane)
	}
	if !reflect.DeepEqual(result.Warnings, []WorkspaceUIPaneOperationWarning{
		{
			Code:    "column_width_normalized",
			Message: "workspace pane open widthSpec was normalized",
			Fields: map[string]string{
				"requestedUnit":  string(ColumnWidthUnitPX),
				"requestedValue": "12",
				"widthSpecUnit":  string(ColumnWidthUnitPX),
				"widthSpecValue": "96",
			},
		},
	}) {
		t.Fatalf("warnings = %+v, want width normalization warning", result.Warnings)
	}
}

func TestServiceRejectsOpenPaneUnsupportedSurfaceKind(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: openPaneOperation(
			SurfaceKindSettingsDOM,
			"Settings",
			"workspace settings",
			PaneToneSlate,
		),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeUnsupportedOperation {
		t.Fatalf("error = %v, want unsupported operation", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || len(loaded.Layout.Columns) != 1 || len(loaded.Layout.Panes) != 2 {
		t.Fatalf("loaded layout = %+v, want unchanged layout", loaded.Layout)
	}
}

func TestServiceRejectsOpenPaneMissingAdjacentColumnWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindChatDOM, "Side Chat", "workspace chat", PaneToneCyan)
	open.AdjacentToColumnID = "workspace_column_missing"

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeColumnNotFound {
		t.Fatalf("error = %v, want column not found", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || len(loaded.Layout.Columns) != 2 || len(loaded.Layout.Panes) != 3 {
		t.Fatalf("loaded layout = %+v, want unchanged layout", loaded.Layout)
	}
}

func TestServiceRejectsOpenPaneInvalidPayloads(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	cases := []struct {
		name      string
		operation WorkspaceUIPaneOperation
	}{
		{
			name: "caller pane id",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindOpenPane,
				PaneID: "workspace_pane_agent",
				Open:   openPaneOperation(SurfaceKindChatDOM, "Chat", "workspace chat", PaneToneCyan),
			},
		},
		{
			name: "missing open payload",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
			},
		},
		{
			name: "terminal config on chat",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: &WorkspaceUIPaneOpenOperation{
					SurfaceKind: SurfaceKindChatDOM,
					TerminalConfig: &TerminalPaneConfig{
						ProfileID: "default",
					},
					Title: "Chat",
					Tone:  PaneToneCyan,
				},
			},
		},
		{
			name: "title whitespace",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: openPaneOperation(
					SurfaceKindWorkflowGraph,
					" Workflow Graph",
					"workflow graph",
					PaneToneCyan,
				),
			},
		},
		{
			name: "open payload on focus",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindFocusPane,
				PaneID: "workspace_pane_0",
				Open:   openPaneOperation(SurfaceKindChatDOM, "Chat", "workspace chat", PaneToneCyan),
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.ApplyPaneOperation("workspace_api", tc.operation)
			if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
				t.Fatalf("error = %v, want invalid operation", err)
			}
		})
	}
}

func openPaneOperation(surfaceKind SurfaceKind, title string, subtitle string, tone PaneTone) *WorkspaceUIPaneOpenOperation {
	return &WorkspaceUIPaneOpenOperation{
		Subtitle:    subtitle,
		SurfaceKind: surfaceKind,
		Title:       title,
		Tone:        tone,
	}
}

func assertOpenOutcome(t *testing.T, got *WorkspaceUIPaneOpenOutcome, want WorkspaceUIPaneOpenOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("open outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("open outcome = %+v, want %+v", got, want)
	}
}
