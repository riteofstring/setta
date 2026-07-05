package workspaceui

import "testing"

func TestServiceAppliesPaneResizeOperationsAtomically(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	read := readLayoutForResizeTransactionTest(t, service, "workspace_api")

	result, err := service.applyPaneResizeOperations("workspace_api", read, []WorkspaceUIPaneOperation{
		{
			Kind:   WorkspaceUIPaneOperationKindResizePane,
			PaneID: "workspace_pane_0",
			Resize: resizePaneOperation(ColumnWidthSpec{
				Unit:  ColumnWidthUnitPX,
				Value: 700,
			}),
		},
		{
			Kind:   WorkspaceUIPaneOperationKindResizePane,
			PaneID: "workspace_pane_1",
			Resize: resizePaneHeightOperation(260),
		},
		{
			Kind:   WorkspaceUIPaneOperationKindResizePane,
			PaneID: "workspace_pane_0",
			Resize: resizePaneSplitOperation("workspace_pane_2", 1.2, 0.8),
		},
	})
	if err != nil {
		t.Fatalf("apply resize transaction: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want one transaction revision 2", result.Revision, result.Layout.Revision)
	}
	if len(result.OperationResults) != 3 {
		t.Fatalf("operation results = %+v, want three outcomes", result.OperationResults)
	}
	if result.Warnings == nil || len(result.Warnings) != 0 {
		t.Fatalf("warnings = %+v, want empty slice", result.Warnings)
	}

	assertPaneHeightPX(t, paneByID(t, result.Layout, "workspace_pane_0"), 260)
	assertPaneHeightPX(t, paneByID(t, result.Layout, "workspace_pane_1"), 260)
	if paneByID(t, result.Layout, "workspace_pane_2").HeightPX != nil {
		t.Fatalf("pane 2 heightPx = %#v, want nil", paneByID(t, result.Layout, "workspace_pane_2").HeightPX)
	}
	if paneByID(t, result.Layout, "workspace_pane_0").Weight != 1.2 || paneByID(t, result.Layout, "workspace_pane_2").Weight != 0.8 {
		t.Fatalf("split weights = %v %v, want 1.2 and 0.8", paneByID(t, result.Layout, "workspace_pane_0").Weight, paneByID(t, result.Layout, "workspace_pane_2").Weight)
	}
	if result.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("column 0 width = %+v, want 700px", result.Layout.Columns[0].WidthSpec)
	}
	if result.Layout.Columns[1].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480}) {
		t.Fatalf("column 1 width = %+v, want unchanged 480px", result.Layout.Columns[1].WidthSpec)
	}
	assertDimensionChanges(t, result.BeforeAfterDimensions, []WorkspaceUIPaneDimensionChange{
		{
			PaneID: "workspace_pane_0",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1.6,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
			After: WorkspaceUIPaneDimensions{
				HeightPX:  intPointer(260),
				ColumnID:  "workspace_column_0",
				Weight:    1.2,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 700},
			},
		},
		{
			PaneID: "workspace_pane_2",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
			After: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    0.8,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 700},
			},
		},
		{
			PaneID: "workspace_pane_1",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_1",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480},
			},
			After: WorkspaceUIPaneDimensions{
				HeightPX:  intPointer(260),
				ColumnID:  "workspace_column_1",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480},
			},
		},
	})

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want persisted transaction revision 2", loaded.Layout)
	}
	if loaded.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("loaded width = %+v, want transaction width", loaded.Layout.Columns[0].WidthSpec)
	}
	assertPaneHeightPX(t, paneByID(t, *loaded.Layout, "workspace_pane_0"), 260)
}

func TestServicePaneResizeOperationsRollbackWhenLaterOperationFails(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	read := readLayoutForResizeTransactionTest(t, service, "workspace_api")

	_, err := service.applyPaneResizeOperations("workspace_api", read, []WorkspaceUIPaneOperation{
		{
			Kind:   WorkspaceUIPaneOperationKindResizePane,
			PaneID: "workspace_pane_0",
			Resize: resizePaneOperation(ColumnWidthSpec{
				Unit:  ColumnWidthUnitPX,
				Value: 700,
			}),
		},
		{
			Kind:   WorkspaceUIPaneOperationKindResizePane,
			PaneID: "workspace_pane_0",
			Resize: resizePaneSplitOperation("workspace_pane_missing", 1.2, 0.8),
		},
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want original revision 1", loaded.Layout)
	}
	if loaded.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620}) {
		t.Fatalf("loaded width = %+v, want rollback to 620px", loaded.Layout.Columns[0].WidthSpec)
	}
}

func TestServicePaneResizeOperationsRejectsNonResizeOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	read := readLayoutForResizeTransactionTest(t, service, "workspace_api")

	_, err := service.applyPaneResizeOperations("workspace_api", read, []WorkspaceUIPaneOperation{
		{
			Kind:   WorkspaceUIPaneOperationKindFocusPane,
			PaneID: "workspace_pane_0",
		},
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || loaded.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("loaded layout = %+v, want unchanged focus and revision", loaded.Layout)
	}
}

func readLayoutForResizeTransactionTest(t *testing.T, service *Service, workspaceID string) WorkspaceUILayout {
	t.Helper()
	read, err := service.ReadLayout(workspaceID)
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if read.Layout == nil {
		t.Fatal("layout = nil, want saved layout")
	}
	return *read.Layout
}
