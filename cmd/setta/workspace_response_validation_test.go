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
