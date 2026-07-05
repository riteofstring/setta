package workspaceui

import (
	"reflect"
	"testing"
)

func TestServiceAppliesReorderPaneRowIntentAcrossColumns(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testMultiColumnLayout("workspace_api")
	paneIndex := paneIndexByID(layout.Panes, "workspace_pane_2")
	layout.Panes[paneIndex].HeightPX = intPointer(240)
	layout.Panes[paneIndex].Weight = 2
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_2",
		Reorder: reorderPaneRowOperation(
			"workspace_pane_1",
			WorkspaceUIPaneDropPlacementAfter,
		),
	})
	if err != nil {
		t.Fatalf("apply reorder operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_1", "workspace_pane_2")
	movedPane := paneByID(t, result.Layout, "workspace_pane_2")
	if movedPane.ColumnID != "workspace_column_1" || movedPane.Weight != 1 || movedPane.HeightPX != nil {
		t.Fatalf("moved pane = %+v, want reset sizing in workspace_column_1", movedPane)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_2" {
		t.Fatalf("focused pane = %q, want moved source pane", result.Layout.FocusedPaneID)
	}
	assertReorderOutcome(t, result.OperationResult.Reorder, WorkspaceUIPaneReorderOutcome{
		ColumnID:            "workspace_column_1",
		ColumnIndex:         1,
		DestinationColumnID: "workspace_column_1",
		IntentKind:          WorkspaceUIPaneReorderIntentKindRow,
		PaneIndex:           1,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   1,
		PreviousPlaneIndex:  0,
		ResetPaneSizing:     true,
		TargetPaneID:        "workspace_pane_1",
	})
	if result.BeforeAfterDimensions == nil || len(result.BeforeAfterDimensions) != 0 {
		t.Fatalf("beforeAfterDimensions = %+v, want empty slice", result.BeforeAfterDimensions)
	}
	if result.Warnings == nil || len(result.Warnings) != 0 {
		t.Fatalf("warnings = %+v, want empty slice", result.Warnings)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want persisted revision 2", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[1].PaneIDs, "workspace_pane_1", "workspace_pane_2")
}

func TestServiceReorderPaneRowIntentNoopsWhenPositionUnchanged(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_1",
		Reorder: reorderPaneRowOperation(
			"workspace_pane_0",
			WorkspaceUIPaneDropPlacementAfter,
		),
	})
	if err != nil {
		t.Fatalf("apply reorder operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want unchanged focus", result.Layout.FocusedPaneID)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_1")
	assertReorderOutcome(t, result.OperationResult.Reorder, WorkspaceUIPaneReorderOutcome{
		ColumnID:            "workspace_column_0",
		ColumnIndex:         0,
		DestinationColumnID: "workspace_column_0",
		IntentKind:          WorkspaceUIPaneReorderIntentKindRow,
		PaneIndex:           1,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   1,
		PreviousPlaneIndex:  0,
		TargetPaneID:        "workspace_pane_0",
	})
}

func TestServiceAppliesReorderPaneSwapIntent(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:    WorkspaceUIPaneOperationKindReorderPane,
		PaneID:  "workspace_pane_0",
		Reorder: reorderPaneSwapOperation("workspace_pane_1"),
	})
	if err != nil {
		t.Fatalf("apply reorder operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_1", "workspace_pane_2")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_0")
	if paneByID(t, result.Layout, "workspace_pane_0").ColumnID != "workspace_column_1" {
		t.Fatalf("pane 0 = %+v, want moved to target column", paneByID(t, result.Layout, "workspace_pane_0"))
	}
	if paneByID(t, result.Layout, "workspace_pane_1").ColumnID != "workspace_column_0" {
		t.Fatalf("pane 1 = %+v, want moved to source column", paneByID(t, result.Layout, "workspace_pane_1"))
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want unchanged focus", result.Layout.FocusedPaneID)
	}
	assertReorderOutcome(t, result.OperationResult.Reorder, WorkspaceUIPaneReorderOutcome{
		ColumnID:            "workspace_column_1",
		ColumnIndex:         1,
		DestinationColumnID: "workspace_column_1",
		IntentKind:          WorkspaceUIPaneReorderIntentKindSwap,
		PaneIndex:           0,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   0,
		PreviousPlaneIndex:  0,
		TargetPaneID:        "workspace_pane_1",
	})
}

func TestServiceAppliesReorderPaneColumnIntent(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testMultiColumnLayout("workspace_api")
	paneIndex := paneIndexByID(layout.Panes, "workspace_pane_2")
	layout.Panes[paneIndex].HeightPX = intPointer(220)
	layout.Panes[paneIndex].Weight = 1.4
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_2",
		Reorder: reorderPaneColumnOperation(
			"workspace_column_1",
			0,
			WorkspaceUIPaneDropPlacementAfter,
		),
	})
	if err != nil {
		t.Fatalf("apply reorder operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if len(result.Layout.Columns) != 3 {
		t.Fatalf("columns = %+v, want inserted column", result.Layout.Columns)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_1")
	assertPaneIDs(t, result.Layout.Columns[2].PaneIDs, "workspace_pane_2")
	insertedColumn := result.Layout.Columns[2]
	if insertedColumn.ColumnID != "workspace_column_2" || insertedColumn.SlotIndex != 2 || insertedColumn.WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480}) {
		t.Fatalf("inserted column = %+v, want copied target width at slot 2", insertedColumn)
	}
	movedPane := paneByID(t, result.Layout, "workspace_pane_2")
	if movedPane.ColumnID != "workspace_column_2" || movedPane.Weight != 1 || movedPane.HeightPX != nil {
		t.Fatalf("moved pane = %+v, want reset sizing in inserted column", movedPane)
	}
	assertReorderOutcome(t, result.OperationResult.Reorder, WorkspaceUIPaneReorderOutcome{
		ColumnID:            "workspace_column_2",
		ColumnIndex:         2,
		CreatedColumnID:     "workspace_column_2",
		DestinationColumnID: "workspace_column_2",
		IntentKind:          WorkspaceUIPaneReorderIntentKindColumn,
		PaneIndex:           0,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   1,
		PreviousPlaneIndex:  0,
		ResetPaneSizing:     true,
		TargetColumnID:      "workspace_column_1",
	})
}

func TestServiceAppliesReorderPanePlaneSlotIntent(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiPlaneSlotLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_1",
		Reorder: reorderPanePlaneSlotOperation(
			1,
			"workspace_column_2",
			1,
		),
	})
	if err != nil {
		t.Fatalf("apply reorder operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if len(result.Layout.Columns) != 3 {
		t.Fatalf("columns = %+v, want source column replaced by plane slot column", result.Layout.Columns)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_2")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_3")
	assertPaneIDs(t, result.Layout.Columns[2].PaneIDs, "workspace_pane_1")
	insertedColumn := result.Layout.Columns[2]
	if insertedColumn.ColumnID != "workspace_column_3" || insertedColumn.PlaneIndex != 1 || insertedColumn.SlotIndex != 1 || insertedColumn.WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 360}) {
		t.Fatalf("inserted column = %+v, want copied reference width in plane 1 slot 1", insertedColumn)
	}
	movedPane := paneByID(t, result.Layout, "workspace_pane_1")
	if movedPane.ColumnID != "workspace_column_3" || movedPane.Weight != 1 || movedPane.HeightPX != nil {
		t.Fatalf("moved pane = %+v, want reset sizing in plane-slot column", movedPane)
	}
	assertReorderOutcome(t, result.OperationResult.Reorder, WorkspaceUIPaneReorderOutcome{
		ColumnID:            "workspace_column_3",
		ColumnIndex:         2,
		CreatedColumnID:     "workspace_column_3",
		DestinationColumnID: "workspace_column_3",
		IntentKind:          WorkspaceUIPaneReorderIntentKindPlaneSlot,
		PaneIndex:           0,
		PlaneIndex:          1,
		PreviousColumnID:    "workspace_column_1",
		PreviousColumnIndex: 1,
		PreviousPaneIndex:   0,
		PreviousPlaneIndex:  0,
		RemovedColumn:       true,
		ResetPaneSizing:     true,
		TargetColumnID:      "workspace_column_2",
	})
}

func TestServiceReorderPaneOperationRejectsMissingTargets(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:    WorkspaceUIPaneOperationKindReorderPane,
		PaneID:  "workspace_pane_0",
		Reorder: reorderPaneRowOperation("workspace_pane_missing", WorkspaceUIPaneDropPlacementBefore),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	_, err = service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_0",
		Reorder: reorderPaneColumnOperation(
			"workspace_column_missing",
			0,
			WorkspaceUIPaneDropPlacementBefore,
		),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeColumnNotFound {
		t.Fatalf("error = %T %v, want column_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want unchanged revision 1", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_2")
	assertPaneIDs(t, loaded.Layout.Columns[1].PaneIDs, "workspace_pane_1")
}

func TestServicePaneOperationRejectsReorderWithResizePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_0",
		Reorder: reorderPaneRowOperation(
			"workspace_pane_1",
			WorkspaceUIPaneDropPlacementBefore,
		),
		Resize: resizePaneOperation(ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520}),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func reorderPaneRowOperation(targetPaneID string, placement WorkspaceUIPaneDropPlacement) *WorkspaceUIPaneReorderOperation {
	return &WorkspaceUIPaneReorderOperation{
		Intent: WorkspaceUIPaneReorderIntent{
			Kind:         WorkspaceUIPaneReorderIntentKindRow,
			Placement:    placement,
			TargetPaneID: targetPaneID,
		},
	}
}

func reorderPaneSwapOperation(targetPaneID string) *WorkspaceUIPaneReorderOperation {
	return &WorkspaceUIPaneReorderOperation{
		Intent: WorkspaceUIPaneReorderIntent{
			Kind:         WorkspaceUIPaneReorderIntentKindSwap,
			TargetPaneID: targetPaneID,
		},
	}
}

func reorderPaneColumnOperation(targetColumnID string, planeIndex int, placement WorkspaceUIPaneDropPlacement) *WorkspaceUIPaneReorderOperation {
	return &WorkspaceUIPaneReorderOperation{
		Intent: WorkspaceUIPaneReorderIntent{
			Kind:           WorkspaceUIPaneReorderIntentKindColumn,
			PlaneIndex:     intPointer(planeIndex),
			SlotPlacement:  placement,
			TargetColumnID: targetColumnID,
		},
	}
}

func reorderPanePlaneSlotOperation(planeIndex int, referenceColumnID string, slotIndex int) *WorkspaceUIPaneReorderOperation {
	return &WorkspaceUIPaneReorderOperation{
		Intent: WorkspaceUIPaneReorderIntent{
			Kind:              WorkspaceUIPaneReorderIntentKindPlaneSlot,
			PlaneIndex:        intPointer(planeIndex),
			ReferenceColumnID: referenceColumnID,
			SlotIndex:         intPointer(slotIndex),
		},
	}
}

func assertReorderOutcome(t *testing.T, got *WorkspaceUIPaneReorderOutcome, want WorkspaceUIPaneReorderOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("reorder outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("reorder outcome = %+v, want %+v", got, want)
	}
}
