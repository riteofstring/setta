package workspaceui

import (
	"math"
	"reflect"
	"testing"
)

func TestServiceAppliesRenamePaneOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Planning Chat"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	renamedPane := paneByID(t, result.Layout, "workspace_pane_0")
	if renamedPane.Title != "Planning Chat" || renamedPane.Subtitle != "workspace chat" {
		t.Fatalf("renamed pane = %+v, want title change only", renamedPane)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("operation result = %+v, want unchanged focus", result.OperationResult)
	}
	assertRenameOutcome(t, result.OperationResult.Rename, WorkspaceUIPaneRenameOutcome{
		PreviousTitle: "Chat",
		Title:         "Planning Chat",
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
	if loaded.Layout == nil {
		t.Fatal("loaded layout = nil, want renamed pane layout")
	}
	loadedPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	if loaded.Layout.Revision != 2 || loadedPane.Title != "Planning Chat" {
		t.Fatalf("loaded layout = %+v, want renamed pane at revision 2", loaded.Layout)
	}
}

func TestServiceRenamePaneOperationNoopsWhenTitleUnchanged(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_1",
		Rename: renamePaneOperation("Terminal"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
	}
	assertRenameOutcome(t, result.OperationResult.Rename, WorkspaceUIPaneRenameOutcome{
		PreviousTitle: "Terminal",
		Title:         "Terminal",
	})
}

func TestServiceRenamePaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_missing",
		Rename: renamePaneOperation("Missing"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout = nil, want original layout")
	}
	loadedPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	if loaded.Layout.Revision != 1 || loadedPane.Title != "Chat" {
		t.Fatalf("loaded layout = %+v, want original title and revision", loaded.Layout)
	}
}

func TestServiceAppliesResizePaneOperationToColumn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_1",
		Resize: resizePaneOperation(ColumnWidthSpec{
			Unit:  ColumnWidthUnitPX,
			Value: 680,
		}),
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
	if result.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 680}) {
		t.Fatalf("resized column = %+v, want 680px", result.Layout.Columns[0])
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("operation result = %+v, want unchanged focus", result.OperationResult)
	}
	assertResizeOutcome(t, result.OperationResult.Resize, WorkspaceUIPaneResizeOutcome{
		PreviousWidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
		SlotIndex:         0,
		TargetColumnID:    "workspace_column_0",
		WidthSpec:         ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 680},
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
				Weight:    1.6,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 680},
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
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 680},
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
	if loaded.Layout == nil || loaded.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 680}) || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want resized column at revision 2", loaded.Layout)
	}
}

func TestServiceResizePaneOperationUpdatesSameSlotColumnsAcrossPlanes(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiPlaneSlotLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_3",
		Resize: resizePaneOperation(ColumnWidthSpec{
			Unit:  ColumnWidthUnitProportion,
			Value: 0.5,
		}),
	})
	if err != nil {
		t.Fatalf("apply resize operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	expectedWidth := ColumnWidthSpec{Unit: ColumnWidthUnitProportion, Value: 0.5}
	if result.Layout.Columns[0].WidthSpec != expectedWidth || result.Layout.Columns[2].WidthSpec != expectedWidth {
		t.Fatalf("same-slot widths = %+v, want columns 0 and 2 resized", result.Layout.Columns)
	}
	if result.Layout.Columns[1].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480}) {
		t.Fatalf("slot 1 column = %+v, want unchanged", result.Layout.Columns[1])
	}
	assertPreviousProportionWidth(t, result.Layout.Columns[0], 0.5)
	assertPreviousProportionWidth(t, result.Layout.Columns[2], 0.5)
	assertResizeOutcome(t, result.OperationResult.Resize, WorkspaceUIPaneResizeOutcome{
		PreviousWidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 360},
		SlotIndex:         0,
		TargetColumnID:    "workspace_column_2",
		WidthSpec:         expectedWidth,
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
				Weight:    1.6,
				WidthSpec: expectedWidth,
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
				Weight:    1,
				WidthSpec: expectedWidth,
			},
		},
		{
			PaneID: "workspace_pane_3",
			Before: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_2",
				Weight:    1,
				WidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 360},
			},
			After: WorkspaceUIPaneDimensions{
				ColumnID:  "workspace_column_2",
				Weight:    1,
				WidthSpec: expectedWidth,
			},
		},
	})
}

func TestServiceResizePaneOperationNoopsWhenWidthUnchanged(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneOperation(ColumnWidthSpec{
			Unit:  ColumnWidthUnitPX,
			Value: 620,
		}),
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

func TestServiceResizePaneOperationReturnsNormalizationWarning(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_1",
		Resize: resizePaneOperation(ColumnWidthSpec{
			Unit:  ColumnWidthUnitPX,
			Value: 24,
		}),
	})
	if err != nil {
		t.Fatalf("apply resize operation: %v", err)
	}
	if result.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: minimumColumnWidthPX}) {
		t.Fatalf("resized width = %+v, want normalized minimum", result.Layout.Columns[0].WidthSpec)
	}
	if len(result.Warnings) != 1 {
		t.Fatalf("warnings = %+v, want one normalization warning", result.Warnings)
	}
	warning := result.Warnings[0]
	if warning.Code != "column_width_normalized" {
		t.Fatalf("warning = %+v, want column_width_normalized", warning)
	}
	if !reflect.DeepEqual(warning.Fields, map[string]string{
		"requestedUnit":  string(ColumnWidthUnitPX),
		"requestedValue": "24",
		"widthSpecUnit":  string(ColumnWidthUnitPX),
		"widthSpecValue": "96",
	}) {
		t.Fatalf("warning fields = %+v, want requested and normalized width", warning.Fields)
	}
}

func TestServiceResizePaneOperationReturnsProportionNormalizationWarning(t *testing.T) {
	cases := []struct {
		name            string
		requestedValue  float64
		normalizedValue float64
	}{
		{
			name:            "below minimum",
			requestedValue:  0.01,
			normalizedValue: minimumColumnWidthProportion,
		},
		{
			name:            "above maximum",
			requestedValue:  1.5,
			normalizedValue: maximumColumnWidthProportion,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := newTestService(t, t.TempDir(), testResolver{
				"workspace_api": "/tmp/api",
			})
			if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
				t.Fatalf("save layout: %v", err)
			}

			result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindResizePane,
				PaneID: "workspace_pane_1",
				Resize: resizePaneOperation(ColumnWidthSpec{
					Unit:  ColumnWidthUnitProportion,
					Value: tc.requestedValue,
				}),
			})
			if err != nil {
				t.Fatalf("apply resize operation: %v", err)
			}
			expectedWidth := ColumnWidthSpec{
				Unit:  ColumnWidthUnitProportion,
				Value: tc.normalizedValue,
			}
			if result.Layout.Columns[0].WidthSpec != expectedWidth {
				t.Fatalf("resized width = %+v, want normalized proportion", result.Layout.Columns[0].WidthSpec)
			}
			assertPreviousProportionWidth(t, result.Layout.Columns[0], tc.normalizedValue)
			if len(result.Warnings) != 1 {
				t.Fatalf("warnings = %+v, want one normalization warning", result.Warnings)
			}
			warning := result.Warnings[0]
			if warning.Code != "column_width_normalized" {
				t.Fatalf("warning = %+v, want column_width_normalized", warning)
			}
			if !reflect.DeepEqual(warning.Fields, map[string]string{
				"requestedUnit":  string(ColumnWidthUnitProportion),
				"requestedValue": formatFloat(tc.requestedValue),
				"widthSpecUnit":  string(ColumnWidthUnitProportion),
				"widthSpecValue": formatFloat(tc.normalizedValue),
			}) {
				t.Fatalf("warning fields = %+v, want requested and normalized width", warning.Fields)
			}
		})
	}
}

func TestServiceResizePaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_missing",
		Resize: resizePaneOperation(ColumnWidthSpec{
			Unit:  ColumnWidthUnitPX,
			Value: 680,
		}),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Revision != 1 || loaded.Layout.Columns[0].WidthSpec != (ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620}) {
		t.Fatalf("loaded layout = %+v, want original width and revision", loaded.Layout)
	}
}

func TestServicePaneOperationRejectsFocusWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsMoveWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsCloseWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsFocusWithResizePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
		Resize: resizePaneOperation(ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520}),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsResizeWithoutPayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsResizeWithoutWidthSpec(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Resize: &WorkspaceUIPaneResizeOperation{},
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsResizeWithMovePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
		Resize: resizePaneOperation(ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520}),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsInvalidResizeWidthSpec(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	cases := []struct {
		name      string
		widthSpec ColumnWidthSpec
	}{
		{
			name:      "unsupported unit",
			widthSpec: ColumnWidthSpec{Unit: ColumnWidthUnit("em"), Value: 1},
		},
		{
			name:      "zero value",
			widthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 0},
		},
		{
			name:      "negative value",
			widthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: -1},
		},
		{
			name:      "nan value",
			widthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: math.NaN()},
		},
		{
			name:      "infinite value",
			widthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: math.Inf(1)},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindResizePane,
				PaneID: "workspace_pane_0",
				Resize: resizePaneOperation(tc.widthSpec),
			})
			if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
				t.Fatalf("error = %T %v, want invalid_operation", err, err)
			}
		})
	}
}

func TestServicePaneOperationRejectsRenameWithoutPayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameWithClosePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameWithMovePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameEmptyTitle(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation(""),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameTitleWithSurroundingWhitespace(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation(" Chat "),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func renamePaneOperation(title string) *WorkspaceUIPaneRenameOperation {
	return &WorkspaceUIPaneRenameOperation{Title: title}
}

func resizePaneOperation(widthSpec ColumnWidthSpec) *WorkspaceUIPaneResizeOperation {
	return &WorkspaceUIPaneResizeOperation{WidthSpec: &widthSpec}
}

func assertRenameOutcome(t *testing.T, got *WorkspaceUIPaneRenameOutcome, want WorkspaceUIPaneRenameOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("rename outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("rename outcome = %+v, want %+v", got, want)
	}
}

func assertResizeOutcome(t *testing.T, got *WorkspaceUIPaneResizeOutcome, want WorkspaceUIPaneResizeOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("resize outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("resize outcome = %+v, want %+v", got, want)
	}
}

func assertDimensionChanges(t *testing.T, got []WorkspaceUIPaneDimensionChange, want []WorkspaceUIPaneDimensionChange) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dimension changes = %+v, want %+v", got, want)
	}
}

func assertPreviousProportionWidth(t *testing.T, column WorkspaceUIColumn, want float64) {
	t.Helper()
	if column.PreviousProportionWidth == nil || *column.PreviousProportionWidth != want {
		t.Fatalf("column %s previousProportionWidth = %#v, want %v", column.ColumnID, column.PreviousProportionWidth, want)
	}
}

func testMultiPlaneSlotLayout(workspaceID string) WorkspaceUILayout {
	layout := testMultiColumnLayout(workspaceID)
	layout.Columns = append(layout.Columns, WorkspaceUIColumn{
		ColumnID:       "workspace_column_2",
		IdealWidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 360},
		Index:          2,
		PaneIDs:        []string{"workspace_pane_3"},
		PlaneIndex:     1,
		SlotIndex:      0,
		WidthSpec:      ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 360},
	})
	layout.Panes = append(layout.Panes, WorkspaceUIPane{
		ColumnID:    "workspace_column_2",
		Heat:        0,
		PaneID:      "workspace_pane_3",
		Sequence:    3,
		Subtitle:    "lower plane",
		SurfaceID:   "workspace_surface_3",
		SurfaceKind: SurfaceKindEmptyFrame,
		Title:       "Lower",
		Tone:        PaneToneSlate,
		Weight:      1,
	})
	return layout
}
