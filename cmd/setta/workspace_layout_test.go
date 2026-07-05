package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/workspaceui"
)

func TestWorkspaceLayoutApplyCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeWorkspaceLayoutApplyInputForCLITest(t, workspaceui.WorkspaceUILayoutOperations{
		Operations: []workspaceui.WorkspaceUIPaneOperation{
			workspaceLayoutApplyResizeWidthOperation("workspace_pane_1", workspaceui.ColumnWidthSpec{
				Unit:  workspaceui.ColumnWidthUnitPX,
				Value: 700,
			}),
			workspaceLayoutApplyResizeHeightOperation("workspace_pane_1", 240),
		},
	})

	result := runWorkspaceCommandJSON[workspaceui.WorkspaceUILayoutOperationResult](t, fixture, "layout", "apply", "--input", inputPath)
	if !result.Changed || result.Revision != 2 || len(result.OperationResults) != 2 {
		t.Fatalf("layout apply result = %+v, want changed revision 2 with two outcomes", result)
	}
	if column := workspaceCLIColumnByID(t, result.Layout, "workspace_column_1"); column.WidthSpec != (workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("transaction column = %+v, want 700px", column)
	}
	assertWorkspaceCLIPaneHeight(t, result.Layout, "workspace_pane_0", 240)
	assertWorkspaceCLIPaneHeight(t, result.Layout, "workspace_pane_1", 240)
	if len(result.BeforeAfterDimensions) != 2 {
		t.Fatalf("dimension changes = %+v, want two affected panes", result.BeforeAfterDimensions)
	}

	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	terminalPane := workspaceCLIPaneDescriptorByID(t, list, "workspace_pane_1")
	if terminalPane.Location.WidthSpec != (workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("terminal descriptor width = %+v, want persisted 700px", terminalPane.Location.WidthSpec)
	}
}

func TestWorkspaceLayoutApplyCommandRejectsMissingInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "layout", "apply"), commandDeps); code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_usage_error" {
		t.Fatalf("error code = %q, want workspace_usage_error", errResponse.Error.Code)
	}
}

func TestWorkspaceLayoutApplyCommandRejectsNonResizeOperationInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeWorkspaceLayoutApplyInputForCLITest(t, workspaceui.WorkspaceUILayoutOperations{
		Operations: []workspaceui.WorkspaceUIPaneOperation{
			{
				Kind:   workspaceui.WorkspaceUIPaneOperationKindFocusPane,
				PaneID: "workspace_pane_0",
			},
		},
	})
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "layout", "apply", "--input", inputPath), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_layout_apply_input_invalid" {
		t.Fatalf("error code = %q, want workspace_layout_apply_input_invalid", errResponse.Error.Code)
	}
	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 2 || list.Panes[1].Location.WidthSpec.Value != 640 {
		t.Fatalf("pane list after rejected layout apply = %+v, want original layout", list)
	}
}

func writeWorkspaceLayoutApplyInputForCLITest(t *testing.T, input workspaceui.WorkspaceUILayoutOperations) string {
	t.Helper()
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		t.Fatalf("marshal workspace layout apply input: %v", err)
	}
	path := filepath.Join(t.TempDir(), "layout-operations.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write workspace layout apply input: %v", err)
	}
	return path
}

func workspaceLayoutApplyResizeWidthOperation(paneID string, width workspaceui.ColumnWidthSpec) workspaceui.WorkspaceUIPaneOperation {
	return workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
		PaneID: paneID,
		Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
			WidthSpec: &width,
		},
	}
}

func workspaceLayoutApplyResizeHeightOperation(paneID string, heightPX int) workspaceui.WorkspaceUIPaneOperation {
	return workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
		PaneID: paneID,
		Resize: &workspaceui.WorkspaceUIPaneResizeOperation{
			HeightPX: &heightPX,
		},
	}
}
