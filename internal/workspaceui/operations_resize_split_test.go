package workspaceui

import (
	"math"
	"reflect"
	"testing"
)

func TestServiceAppliesResizePaneOperationToPaneSplitWeights(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneSplitOperation("workspace_pane_1", 1.45, 0.55),
	})
	if err != nil {
		t.Fatalf("apply resize operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	upperPane := paneByID(t, result.Layout, "workspace_pane_0")
	lowerPane := paneByID(t, result.Layout, "workspace_pane_1")
	if upperPane.Weight != 1.45 || lowerPane.Weight != 0.55 {
		t.Fatalf("split weights = %v %v, want 1.45 and 0.55", upperPane.Weight, lowerPane.Weight)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	assertResizeOutcome(t, result.OperationResult.Resize, WorkspaceUIPaneResizeOutcome{
		LowerPaneID:         "workspace_pane_1",
		LowerWeight:         0.55,
		PlaneIndex:          0,
		PreviousLowerWeight: 1,
		PreviousUpperWeight: 1.6,
		RowIndex:            0,
		TargetPaneIDs:       []string{"workspace_pane_0", "workspace_pane_1"},
		UpperPaneID:         "workspace_pane_0",
		UpperWeight:         1.45,
	})
	assertDimensionChanges(t, result.BeforeAfterDimensions, []WorkspaceUIPaneDimensionChange{
		{
			PaneID: "workspace_pane_0",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1.6,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
			After: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1.45,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
		{
			PaneID: "workspace_pane_1",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
			After: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    0.55,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
	})
	if result.Warnings == nil || len(result.Warnings) != 0 {
		t.Fatalf("warnings = %+v, want empty slice", result.Warnings)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want resized split at revision 2", loaded.Layout)
	}
	loadedUpperPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	loadedLowerPane := paneByID(t, *loaded.Layout, "workspace_pane_1")
	if loadedUpperPane.Weight != 1.45 || loadedLowerPane.Weight != 0.55 {
		t.Fatalf("loaded split weights = %v %v, want 1.45 and 0.55", loadedUpperPane.Weight, loadedLowerPane.Weight)
	}
}

func TestServiceResizePaneOperationNoopsWhenSplitWeightsUnchanged(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneSplitOperation("workspace_pane_1", 1.6, 1),
	})
	if err != nil {
		t.Fatalf("apply resize operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
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
				ColumnID:  "workspace_column_0",
				Weight:    1.6,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
		{
			PaneID: "workspace_pane_1",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
			After: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_0",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
	})
}

func TestServiceResizePaneOperationReturnsSplitWeightNormalizationWarning(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneSplitOperation("workspace_pane_1", 0.05, 0.08),
	})
	if err != nil {
		t.Fatalf("apply resize operation: %v", err)
	}
	upperPane := paneByID(t, result.Layout, "workspace_pane_0")
	lowerPane := paneByID(t, result.Layout, "workspace_pane_1")
	if upperPane.Weight != minimumPaneWeight || lowerPane.Weight != minimumPaneWeight {
		t.Fatalf("split weights = %v %v, want normalized minimum", upperPane.Weight, lowerPane.Weight)
	}
	if len(result.Warnings) != 1 {
		t.Fatalf("warnings = %+v, want one normalization warning", result.Warnings)
	}
	warning := result.Warnings[0]
	if warning.Code != "pane_weight_normalized" {
		t.Fatalf("warning = %+v, want pane_weight_normalized", warning)
	}
	if !reflect.DeepEqual(warning.Fields, map[string]string{
		"lowerWeight":          "0.1",
		"requestedLowerWeight": "0.08",
		"requestedUpperWeight": "0.05",
		"upperWeight":          "0.1",
	}) {
		t.Fatalf("warning fields = %+v, want requested and normalized weights", warning.Fields)
	}
}

func TestServiceResizePaneOperationRejectsMissingSplitLowerPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneSplitOperation("workspace_pane_missing", 1.1, 0.9),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want unchanged revision 1", loaded.Layout)
	}
}

func TestServiceResizePaneOperationRejectsNonAdjacentSplitPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneSplitOperation("workspace_pane_1", 1.1, 0.9),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want unchanged revision 1", loaded.Layout)
	}
	loadedUpperPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	loadedLowerPane := paneByID(t, *loaded.Layout, "workspace_pane_1")
	if loadedUpperPane.Weight != 1.6 || loadedLowerPane.Weight != 1 {
		t.Fatalf("loaded weights = %v %v, want unchanged", loadedUpperPane.Weight, loadedLowerPane.Weight)
	}
}

func TestServicePaneOperationRejectsInvalidResizeSplit(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	cases := []struct {
		name   string
		resize *WorkspaceUIPaneResizeOperation
	}{
		{
			name:   "missing lower pane id",
			resize: resizePaneSplitOperation("", 1.1, 0.9),
		},
		{
			name:   "same lower pane id",
			resize: resizePaneSplitOperation("workspace_pane_0", 1.1, 0.9),
		},
		{
			name:   "zero upper weight",
			resize: resizePaneSplitOperation("workspace_pane_1", 0, 0.9),
		},
		{
			name:   "negative lower weight",
			resize: resizePaneSplitOperation("workspace_pane_1", 1.1, -0.1),
		},
		{
			name:   "nan upper weight",
			resize: resizePaneSplitOperation("workspace_pane_1", math.NaN(), 0.9),
		},
		{
			name:   "infinite lower weight",
			resize: resizePaneSplitOperation("workspace_pane_1", 1.1, math.Inf(1)),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindResizePane,
				PaneID: "workspace_pane_0",
				Resize: tc.resize,
			})
			if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
				t.Fatalf("error = %T %v, want invalid_operation", err, err)
			}
		})
	}
}

func resizePaneSplitOperation(lowerPaneID string, upperWeight float64, lowerWeight float64) *WorkspaceUIPaneResizeOperation {
	return &WorkspaceUIPaneResizeOperation{
		Split: &WorkspaceUIPaneSplitResizeOperation{
			LowerPaneID: lowerPaneID,
			UpperWeight: upperWeight,
			LowerWeight: lowerWeight,
		},
	}
}
