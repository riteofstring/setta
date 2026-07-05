package main

import (
	"strings"
	"testing"

	"setta/internal/workspaceui"
)

func TestValidateWorkspacePaneOperationResponseAcceptsOpenOutcome(t *testing.T) {
	operation := workspacePaneOpenValidationOperation()
	response := workspacePaneOpenValidationResponse(operation)

	if err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation); err != nil {
		t.Fatalf("validate open operation response: %v", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsOpenWithoutOutcome(t *testing.T) {
	operation := workspacePaneOpenValidationOperation()
	response := workspacePaneOpenValidationResponse(operation)
	response.OperationResult.Open = nil

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "open details are required") {
		t.Fatalf("validation error = %v, want missing open outcome", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsOpenPaneIDMissingFromLayout(t *testing.T) {
	operation := workspacePaneOpenValidationOperation()
	response := workspacePaneOpenValidationResponse(operation)
	response.OperationResult.PaneID = "workspace_pane_missing"

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "workspace_pane_missing") {
		t.Fatalf("validation error = %v, want missing created pane", err)
	}
}

func TestValidateWorkspacePaneOperationResponseAcceptsResizeWidthOutcome(t *testing.T) {
	operation := workspacePaneResizeWidthValidationOperation()
	response := workspacePaneResizeWidthValidationResponse(operation)

	if err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation); err != nil {
		t.Fatalf("validate resize width operation response: %v", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsResizeWidthWrongColumn(t *testing.T) {
	operation := workspacePaneResizeWidthValidationOperation()
	response := workspacePaneResizeWidthValidationResponse(operation)
	response.OperationResult.Resize.TargetColumnID = "workspace_column_0"

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "targetColumnId") {
		t.Fatalf("validation error = %v, want target column mismatch", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsResizeResetHeightWithHeight(t *testing.T) {
	operation := workspacePaneResizeResetHeightValidationOperation()
	response := workspacePaneResizeResetHeightValidationResponse(operation)
	response.OperationResult.Resize.HeightPX = workspaceResponseValidationIntPointer(240)

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "must be nil for reset-height") {
		t.Fatalf("validation error = %v, want reset-height shape mismatch", err)
	}
}

func workspacePaneOpenValidationOperation() workspaceui.WorkspaceUIPaneOperation {
	return workspaceui.WorkspaceUIPaneOperation{
		Kind: workspaceui.WorkspaceUIPaneOperationKindOpenPane,
		Open: &workspaceui.WorkspaceUIPaneOpenOperation{
			SurfaceKind: workspaceui.SurfaceKindTerminal,
			Title:       "Scratch",
		},
	}
}

func workspacePaneOpenValidationResponse(operation workspaceui.WorkspaceUIPaneOperation) workspaceui.WorkspaceUIPaneOperationResult {
	layout := workspaceui.WorkspaceUILayout{
		SchemaVersion: workspaceui.SchemaVersion,
		Revision:      2,
		WorkspaceID:   "workspace_api",
		FocusedPaneID: "workspace_pane_2",
		Columns: []workspaceui.WorkspaceUIColumn{
			{
				ColumnID:       "workspace_column_0",
				IdealWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 480},
				PaneIDs:        []string{"workspace_pane_2"},
				WidthSpec:      workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 480},
			},
		},
		Panes: []workspaceui.WorkspaceUIPane{
			{
				ColumnID:    "workspace_column_0",
				PaneID:      "workspace_pane_2",
				SurfaceID:   "workspace_surface_2",
				SurfaceKind: operation.Open.SurfaceKind,
				Title:       operation.Open.Title,
				Tone:        workspaceui.PaneToneGreen,
				Weight:      1,
			},
		},
	}
	return workspaceui.WorkspaceUIPaneOperationResult{
		WorkspaceID: "workspace_api",
		Revision:    2,
		Layout:      layout,
		Changed:     true,
		OperationResult: workspaceui.WorkspaceUIPaneOperationOutcome{
			Kind:          operation.Kind,
			PaneID:        "workspace_pane_2",
			FocusedPaneID: "workspace_pane_2",
			Open: &workspaceui.WorkspaceUIPaneOpenOutcome{
				ColumnID:    "workspace_column_0",
				Placement:   workspaceui.WorkspaceUIPaneDropPlacementAfter,
				SurfaceID:   "workspace_surface_2",
				SurfaceKind: operation.Open.SurfaceKind,
				TargetKind:  workspaceui.WorkspaceUIPaneOpenTargetKindColumnEnd,
				Title:       operation.Open.Title,
				WidthSpec:   workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 480},
			},
		},
		BeforeAfterDimensions: []workspaceui.WorkspaceUIPaneDimensionChange{},
		Warnings:              []workspaceui.WorkspaceUIPaneOperationWarning{},
	}
}

func workspacePaneResizeWidthValidationOperation() workspaceui.WorkspaceUIPaneOperation {
	widthSpec := workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}
	return workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_1",
		Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
			WidthSpec: &widthSpec,
		},
	}
}

func workspacePaneResizeWidthValidationResponse(operation workspaceui.WorkspaceUIPaneOperation) workspaceui.WorkspaceUIPaneOperationResult {
	layout := workspacePaneResizeValidationLayout(nil, nil)
	layout.Columns[1].WidthSpec = *operation.Resize.WidthSpec
	return workspaceui.WorkspaceUIPaneOperationResult{
		WorkspaceID: "workspace_api",
		Revision:    2,
		Layout:      layout,
		Changed:     true,
		OperationResult: workspaceui.WorkspaceUIPaneOperationOutcome{
			Kind:                  operation.Kind,
			PaneID:                operation.PaneID,
			FocusedPaneID:         operation.PaneID,
			PreviousFocusedPaneID: operation.PaneID,
			Resize: &workspaceui.WorkspaceUIPaneResizeOutcome{
				PreviousWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 640},
				SlotIndex:         1,
				TargetColumnID:    "workspace_column_1",
				WidthSpec:         *operation.Resize.WidthSpec,
			},
		},
		BeforeAfterDimensions: []workspaceui.WorkspaceUIPaneDimensionChange{},
		Warnings:              []workspaceui.WorkspaceUIPaneOperationWarning{},
	}
}

func workspacePaneResizeResetHeightValidationOperation() workspaceui.WorkspaceUIPaneOperation {
	return workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
		PaneID: "workspace_pane_1",
		Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
			ResetHeight: true,
		},
	}
}

func workspacePaneResizeResetHeightValidationResponse(operation workspaceui.WorkspaceUIPaneOperation) workspaceui.WorkspaceUIPaneOperationResult {
	layout := workspacePaneResizeValidationLayout(nil, nil)
	return workspaceui.WorkspaceUIPaneOperationResult{
		WorkspaceID: "workspace_api",
		Revision:    2,
		Layout:      layout,
		Changed:     true,
		OperationResult: workspaceui.WorkspaceUIPaneOperationOutcome{
			Kind:                  operation.Kind,
			PaneID:                operation.PaneID,
			FocusedPaneID:         operation.PaneID,
			PreviousFocusedPaneID: operation.PaneID,
			Resize: &workspaceui.WorkspaceUIPaneResizeOutcome{
				PlaneIndex:    0,
				RowIndex:      0,
				TargetPaneIDs: []string{"workspace_pane_0", "workspace_pane_1"},
			},
		},
		BeforeAfterDimensions: []workspaceui.WorkspaceUIPaneDimensionChange{},
		Warnings:              []workspaceui.WorkspaceUIPaneOperationWarning{},
	}
}

func workspacePaneResizeValidationLayout(firstHeight *int, secondHeight *int) workspaceui.WorkspaceUILayout {
	return workspaceui.WorkspaceUILayout{
		SchemaVersion: workspaceui.SchemaVersion,
		Revision:      2,
		WorkspaceID:   "workspace_api",
		FocusedPaneID: "workspace_pane_1",
		Columns: []workspaceui.WorkspaceUIColumn{
			{
				ColumnID:  "workspace_column_0",
				PaneIDs:   []string{"workspace_pane_0"},
				SlotIndex: 0,
				WidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
			},
			{
				ColumnID:  "workspace_column_1",
				PaneIDs:   []string{"workspace_pane_1"},
				SlotIndex: 1,
				WidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 640},
			},
		},
		Panes: []workspaceui.WorkspaceUIPane{
			workspacePaneResizeValidationPane("workspace_column_0", "workspace_pane_0", "workspace_surface_0", firstHeight),
			workspacePaneResizeValidationPane("workspace_column_1", "workspace_pane_1", "workspace_surface_1", secondHeight),
		},
	}
}

func workspacePaneResizeValidationPane(columnID string, paneID string, surfaceID string, heightPX *int) workspaceui.WorkspaceUIPane {
	return workspaceui.WorkspaceUIPane{
		ColumnID:    columnID,
		HeightPX:    heightPX,
		PaneID:      paneID,
		SurfaceID:   surfaceID,
		SurfaceKind: workspaceui.SurfaceKindTerminal,
		Title:       "Terminal",
		Tone:        workspaceui.PaneToneGreen,
		Weight:      1,
	}
}

func workspaceResponseValidationIntPointer(value int) *int {
	return &value
}
