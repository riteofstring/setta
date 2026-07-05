package main

import (
	"strings"
	"testing"

	"setta/internal/workspaceui"
)

func TestValidateWorkspaceLayoutOperationResponseAcceptsResizeOutcomes(t *testing.T) {
	input := workspaceLayoutApplyValidationInput()
	response := workspaceLayoutApplyValidationResponse(input)

	if err := validateWorkspaceLayoutOperationResponse(response, "workspace_api", input); err != nil {
		t.Fatalf("validate layout operation response: %v", err)
	}
}

func TestValidateWorkspaceLayoutOperationResponseRejectsWrongOutcomeCount(t *testing.T) {
	input := workspaceLayoutApplyValidationInput()
	response := workspaceLayoutApplyValidationResponse(input)
	response.OperationResults = response.OperationResults[:1]

	err := validateWorkspaceLayoutOperationResponse(response, "workspace_api", input)
	if err == nil || !strings.Contains(err.Error(), "operation results") {
		t.Fatalf("validation error = %v, want operation result count mismatch", err)
	}
}

func workspaceLayoutApplyValidationInput() workspaceui.WorkspaceUILayoutOperations {
	widthSpec := workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}
	return workspaceui.WorkspaceUILayoutOperations{
		Operations: []workspaceui.WorkspaceUIPaneOperation{
			{
				Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
				PaneID: "workspace_pane_1",
				Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
					WidthSpec: &widthSpec,
				},
			},
			{
				Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
				PaneID: "workspace_pane_1",
				Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
					HeightPX: workspaceResponseValidationIntPointer(240),
				},
			},
		},
	}
}

func workspaceLayoutApplyValidationResponse(input workspaceui.WorkspaceUILayoutOperations) workspaceui.WorkspaceUILayoutOperationResult {
	layout := workspacePaneResizeValidationLayout(workspaceResponseValidationIntPointer(240), workspaceResponseValidationIntPointer(240))
	layout.Columns[1].WidthSpec = *input.Operations[0].Resize.WidthSpec
	return workspaceui.WorkspaceUILayoutOperationResult{
		WorkspaceID: "workspace_api",
		Revision:    2,
		Layout:      layout,
		Changed:     true,
		OperationResults: []workspaceui.WorkspaceUIPaneOperationOutcome{
			{
				Kind:                  workspaceui.WorkspaceUIPaneOperationKindResizePane,
				PaneID:                "workspace_pane_1",
				FocusedPaneID:         "workspace_pane_1",
				PreviousFocusedPaneID: "workspace_pane_1",
				Resize: &workspaceui.WorkspaceUIPaneResizeOutcome{
					PreviousWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 640},
					SlotIndex:         1,
					TargetColumnID:    "workspace_column_1",
					WidthSpec:         *input.Operations[0].Resize.WidthSpec,
				},
			},
			{
				Kind:                  workspaceui.WorkspaceUIPaneOperationKindResizePane,
				PaneID:                "workspace_pane_1",
				FocusedPaneID:         "workspace_pane_1",
				PreviousFocusedPaneID: "workspace_pane_1",
				Resize: &workspaceui.WorkspaceUIPaneResizeOutcome{
					HeightPX:      workspaceResponseValidationIntPointer(240),
					PlaneIndex:    0,
					RowIndex:      0,
					TargetPaneIDs: []string{"workspace_pane_0", "workspace_pane_1"},
				},
			},
		},
		BeforeAfterDimensions: []workspaceui.WorkspaceUIPaneDimensionChange{},
		Warnings:              []workspaceui.WorkspaceUIPaneOperationWarning{},
	}
}
