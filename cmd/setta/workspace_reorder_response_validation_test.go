package main

import (
	"strings"
	"testing"

	"setta/internal/workspaceui"
)

func TestValidateWorkspacePaneOperationResponseAcceptsReorderOutcome(t *testing.T) {
	operation := workspacePaneReorderValidationOperation()
	response := workspacePaneReorderValidationResponse(operation)

	if err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation); err != nil {
		t.Fatalf("validate reorder operation response: %v", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsReorderWrongIntentKind(t *testing.T) {
	operation := workspacePaneReorderValidationOperation()
	response := workspacePaneReorderValidationResponse(operation)
	response.OperationResult.Reorder.IntentKind = workspaceui.WorkspaceUIPaneReorderIntentKindSwap

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "intentKind") {
		t.Fatalf("validation error = %v, want intent kind mismatch", err)
	}
}

func TestValidateWorkspacePaneOperationResponseRejectsReorderWrongTargetPane(t *testing.T) {
	operation := workspacePaneReorderValidationOperation()
	response := workspacePaneReorderValidationResponse(operation)
	response.OperationResult.Reorder.TargetPaneID = "workspace_pane_missing"

	err := validateWorkspacePaneOperationResponse(response, "workspace_api", operation)
	if err == nil || !strings.Contains(err.Error(), "targetPaneId") {
		t.Fatalf("validation error = %v, want target pane mismatch", err)
	}
}

func workspacePaneReorderValidationOperation() workspaceui.WorkspaceUIPaneOperation {
	return workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_1",
		Reorder: &workspaceui.WorkspaceUIPaneReorderOperation{
			Intent: workspaceui.WorkspaceUIPaneReorderIntent{
				Kind:         workspaceui.WorkspaceUIPaneReorderIntentKindRow,
				Placement:    workspaceui.WorkspaceUIPaneDropPlacementBefore,
				TargetPaneID: "workspace_pane_0",
			},
		},
	}
}

func workspacePaneReorderValidationResponse(operation workspaceui.WorkspaceUIPaneOperation) workspaceui.WorkspaceUIPaneOperationResult {
	layout := workspaceui.WorkspaceUILayout{
		SchemaVersion: workspaceui.SchemaVersion,
		Revision:      2,
		WorkspaceID:   "workspace_api",
		FocusedPaneID: operation.PaneID,
		Columns: []workspaceui.WorkspaceUIColumn{
			{
				ColumnID:       "workspace_column_0",
				IdealWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
				Index:          0,
				PaneIDs:        []string{"workspace_pane_1", "workspace_pane_0"},
				PlaneIndex:     0,
				SlotIndex:      0,
				WidthSpec:      workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
			},
		},
		Panes: []workspaceui.WorkspaceUIPane{
			workspacePaneResizeValidationPane("workspace_column_0", "workspace_pane_1", "workspace_surface_1", nil),
			workspacePaneResizeValidationPane("workspace_column_0", "workspace_pane_0", "workspace_surface_0", nil),
		},
	}
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
			Reorder: &workspaceui.WorkspaceUIPaneReorderOutcome{
				ColumnID:            "workspace_column_0",
				ColumnIndex:         0,
				DestinationColumnID: "workspace_column_0",
				IntentKind:          operation.Reorder.Intent.Kind,
				PaneIndex:           0,
				PlaneIndex:          0,
				PreviousColumnID:    "workspace_column_1",
				PreviousColumnIndex: 1,
				PreviousPaneIndex:   0,
				PreviousPlaneIndex:  0,
				RemovedColumn:       true,
				ResetPaneSizing:     true,
				TargetPaneID:        operation.Reorder.Intent.TargetPaneID,
			},
		},
		BeforeAfterDimensions: []workspaceui.WorkspaceUIPaneDimensionChange{},
		Warnings:              []workspaceui.WorkspaceUIPaneOperationWarning{},
	}
}
