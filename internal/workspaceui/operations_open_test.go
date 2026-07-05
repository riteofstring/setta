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
		Placement:   WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:   "workspace_surface_2",
		SurfaceKind: SurfaceKindTerminal,
		TargetKind:  WorkspaceUIPaneOpenTargetKindColumnEnd,
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
		Placement:          WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:          "workspace_surface_3",
		SurfaceKind:        SurfaceKindChatDOM,
		TargetKind:         WorkspaceUIPaneOpenTargetKindAdjacentColumn,
		Title:              "Side Chat",
		WidthSpec:          widthSpec,
	})
}

func TestServiceAppliesOpenPaneEmptyFrameInTargetRow(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
	open.Row = &WorkspaceUIPaneOpenRowTarget{
		Placement:    WorkspaceUIPaneDropPlacementAfter,
		TargetPaneID: "workspace_pane_0",
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}

	if result.Layout.FocusedPaneID != "workspace_pane_2" || result.Revision != 2 {
		t.Fatalf("result = %+v, want created row pane focused at revision 2", result)
	}
	if len(result.Layout.Columns) != 1 {
		t.Fatalf("columns = %+v, want same-column row insert", result.Layout.Columns)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_2", "workspace_pane_1")
	pane := paneByID(t, result.Layout, "workspace_pane_2")
	if pane.ColumnID != "workspace_column_0" || pane.SurfaceKind != SurfaceKindEmptyFrame || pane.Title != "New frame" {
		t.Fatalf("created pane = %+v, want empty frame in target row", pane)
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:     "workspace_column_0",
		ColumnIndex:  0,
		PaneIndex:    1,
		PlaneIndex:   0,
		Placement:    WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:    "workspace_surface_2",
		SurfaceKind:  SurfaceKindEmptyFrame,
		TargetKind:   WorkspaceUIPaneOpenTargetKindRow,
		TargetPaneID: "workspace_pane_0",
		Title:        "New frame",
		WidthSpec:    ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
	})

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want persisted row open", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_2", "workspace_pane_1")
}

func TestServiceAppliesOpenPaneEmptyFrameInPlaneAboveFirstPlane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
	open.Plane = &WorkspaceUIPaneOpenPlaneTarget{
		Placement:    WorkspaceUIPaneDropPlacementBefore,
		TargetPaneID: "workspace_pane_1",
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}

	createdColumnIndex := columnIndexByID(result.Layout.Columns, "workspace_column_2")
	if createdColumnIndex < 0 {
		t.Fatalf("columns = %+v, want created column", result.Layout.Columns)
	}
	createdColumn := result.Layout.Columns[createdColumnIndex]
	if createdColumn.PlaneIndex != 0 || createdColumn.SlotIndex != 1 || createdColumn.WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480}) {
		t.Fatalf("created column = %+v, want plane above target slot with copied width", createdColumn)
	}
	for _, column := range result.Layout.Columns {
		if column.ColumnID != "workspace_column_2" && column.PlaneIndex != 1 {
			t.Fatalf("column = %+v, want original columns shifted below created plane", column)
		}
		if column.PlaneIndex < 0 {
			t.Fatalf("columns = %+v, want non-negative planes", result.Layout.Columns)
		}
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:     "workspace_column_2",
		ColumnIndex:  createdColumnIndex,
		PaneIndex:    0,
		PlaneIndex:   0,
		Placement:    WorkspaceUIPaneDropPlacementBefore,
		SurfaceID:    "workspace_surface_3",
		SurfaceKind:  SurfaceKindEmptyFrame,
		TargetKind:   WorkspaceUIPaneOpenTargetKindPlaneSlot,
		TargetPaneID: "workspace_pane_1",
		Title:        "New frame",
		WidthSpec:    ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480},
	})
}

func TestServiceOpenPanePlaneTargetShiftsOccupiedSlot(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiPlaneSlotLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
	open.Plane = &WorkspaceUIPaneOpenPlaneTarget{
		Placement:    WorkspaceUIPaneDropPlacementAfter,
		TargetPaneID: "workspace_pane_0",
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}

	createdColumnIndex := columnIndexByID(result.Layout.Columns, "workspace_column_3")
	shiftedColumnIndex := columnIndexByID(result.Layout.Columns, "workspace_column_2")
	if createdColumnIndex < 0 || shiftedColumnIndex < 0 {
		t.Fatalf("columns = %+v, want created and shifted lower-plane columns", result.Layout.Columns)
	}
	createdColumn := result.Layout.Columns[createdColumnIndex]
	shiftedColumn := result.Layout.Columns[shiftedColumnIndex]
	if createdColumn.PlaneIndex != 1 || createdColumn.SlotIndex != 0 {
		t.Fatalf("created column = %+v, want lower plane target slot", createdColumn)
	}
	if shiftedColumn.PlaneIndex != 1 || shiftedColumn.SlotIndex != 1 {
		t.Fatalf("shifted column = %+v, want existing lower slot shifted right", shiftedColumn)
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:     "workspace_column_3",
		ColumnIndex:  createdColumnIndex,
		PaneIndex:    0,
		PlaneIndex:   1,
		Placement:    WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:    "workspace_surface_4",
		SurfaceKind:  SurfaceKindEmptyFrame,
		TargetKind:   WorkspaceUIPaneOpenTargetKindPlaneSlot,
		TargetPaneID: "workspace_pane_0",
		Title:        "New frame",
		WidthSpec:    ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
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

func TestServiceAppliesOpenPaneSettingsDOMForRendererCutover(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: openPaneOperation(
			SurfaceKindSettingsDOM,
			"Settings",
			"workspace settings",
			PaneToneSlate,
		),
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_2" || result.Revision != 2 {
		t.Fatalf("result = %+v, want created settings pane focused at revision 2", result)
	}
	pane := paneByID(t, result.Layout, "workspace_pane_2")
	if pane.SurfaceKind != SurfaceKindSettingsDOM ||
		pane.TerminalConfig != nil ||
		pane.WorkflowNodeDetailsConfig != nil {
		t.Fatalf("created pane = %+v, want settings pane without domain config", pane)
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:    "workspace_column_1",
		ColumnIndex: 1,
		PaneIndex:   0,
		PlaneIndex:  0,
		Placement:   WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:   "workspace_surface_2",
		SurfaceKind: SurfaceKindSettingsDOM,
		TargetKind:  WorkspaceUIPaneOpenTargetKindColumnEnd,
		Title:       "Settings",
		WidthSpec:   defaultOpenPaneColumnWidthSpec(),
	})
}

func TestServiceAppliesOpenPaneWorkflowNodeDetailsWithConfig(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	config := testWorkflowNodeDetailsConfig("workspace_api")
	widthSpec := ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 380}
	open := openPaneOperation(SurfaceKindWorkflowNodeDetails, "Workflow Node", "workflow node details", PaneToneCyan)
	open.WorkflowNodeDetailsConfig = config
	open.WidthSpec = &widthSpec

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if err != nil {
		t.Fatalf("apply open operation: %v", err)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_2" || result.Revision != 2 {
		t.Fatalf("result = %+v, want created details pane focused at revision 2", result)
	}
	pane := paneByID(t, result.Layout, "workspace_pane_2")
	if pane.SurfaceKind != SurfaceKindWorkflowNodeDetails ||
		pane.TerminalConfig != nil ||
		!reflect.DeepEqual(pane.WorkflowNodeDetailsConfig, config) {
		t.Fatalf("created pane = %+v, want workflow node details config", pane)
	}
	assertOpenOutcome(t, result.OperationResult.Open, WorkspaceUIPaneOpenOutcome{
		ColumnID:    "workspace_column_1",
		ColumnIndex: 1,
		PaneIndex:   0,
		PlaneIndex:  0,
		Placement:   WorkspaceUIPaneDropPlacementAfter,
		SurfaceID:   "workspace_surface_2",
		SurfaceKind: SurfaceKindWorkflowNodeDetails,
		TargetKind:  WorkspaceUIPaneOpenTargetKindColumnEnd,
		Title:       "Workflow Node",
		WidthSpec:   widthSpec,
	})
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	loadedPane := paneByID(t, *loaded.Layout, "workspace_pane_2")
	if !reflect.DeepEqual(loadedPane.WorkflowNodeDetailsConfig, config) {
		t.Fatalf("loaded details config = %+v, want %+v", loadedPane.WorkflowNodeDetailsConfig, config)
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
			SurfaceKindSemanticNodeDetails,
			"Semantic Node",
			"semantic node details",
			PaneTonePink,
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

func TestServiceRejectsOpenPaneWorkflowNodeDetailsWorkspaceMismatchWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindWorkflowNodeDetails, "Workflow Node", "workflow node details", PaneToneCyan)
	open.WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig("workspace_other")

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %v, want invalid operation", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || len(loaded.Layout.Panes) != 2 {
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

func TestServiceRejectsOpenPaneMissingRowTargetPaneWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
	open.Row = &WorkspaceUIPaneOpenRowTarget{
		Placement:    WorkspaceUIPaneDropPlacementAfter,
		TargetPaneID: "workspace_pane_missing",
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %v, want pane not found", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || len(loaded.Layout.Columns) != 1 || len(loaded.Layout.Panes) != 2 {
		t.Fatalf("loaded layout = %+v, want unchanged layout", loaded.Layout)
	}
}

func TestServiceRejectsOpenPaneMissingPlaneTargetPaneWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
	open.Plane = &WorkspaceUIPaneOpenPlaneTarget{
		Placement:    WorkspaceUIPaneDropPlacementBefore,
		TargetPaneID: "workspace_pane_missing",
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindOpenPane,
		Open: open,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %v, want pane not found", err)
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
			name: "workflow node details config on chat",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: &WorkspaceUIPaneOpenOperation{
					SurfaceKind:               SurfaceKindChatDOM,
					WorkflowNodeDetailsConfig: testWorkflowNodeDetailsConfig("workspace_api"),
					Title:                     "Chat",
					Tone:                      PaneToneCyan,
				},
			},
		},
		{
			name: "workflow node details missing config",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: openPaneOperation(
					SurfaceKindWorkflowNodeDetails,
					"Workflow Node",
					"workflow node details",
					PaneToneCyan,
				),
			},
		},
		{
			name: "multiple targets",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: func() *WorkspaceUIPaneOpenOperation {
					open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
					open.AdjacentToColumnID = "workspace_column_0"
					open.Row = &WorkspaceUIPaneOpenRowTarget{
						Placement:    WorkspaceUIPaneDropPlacementAfter,
						TargetPaneID: "workspace_pane_0",
					}
					return open
				}(),
			},
		},
		{
			name: "row target missing pane",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: func() *WorkspaceUIPaneOpenOperation {
					open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
					open.Row = &WorkspaceUIPaneOpenRowTarget{
						Placement: WorkspaceUIPaneDropPlacementAfter,
					}
					return open
				}(),
			},
		},
		{
			name: "plane target invalid placement",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: func() *WorkspaceUIPaneOpenOperation {
					open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
					open.Plane = &WorkspaceUIPaneOpenPlaneTarget{
						Placement:    WorkspaceUIPaneDropPlacement("beside"),
						TargetPaneID: "workspace_pane_0",
					}
					return open
				}(),
			},
		},
		{
			name: "row target with width",
			operation: WorkspaceUIPaneOperation{
				Kind: WorkspaceUIPaneOperationKindOpenPane,
				Open: func() *WorkspaceUIPaneOpenOperation {
					widthSpec := ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 420}
					open := openPaneOperation(SurfaceKindEmptyFrame, "New frame", "choose a pane type", PaneToneSlate)
					open.Row = &WorkspaceUIPaneOpenRowTarget{
						Placement:    WorkspaceUIPaneDropPlacementAfter,
						TargetPaneID: "workspace_pane_0",
					}
					open.WidthSpec = &widthSpec
					return open
				}(),
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
