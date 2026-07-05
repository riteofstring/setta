package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/workspaceui"
)

func TestWorkspacePanesReorderCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeWorkspacePaneReorderInputForCLITest(t, workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindReorderPane,
		PaneID: "workspace_pane_1",
		Reorder: &workspaceui.WorkspaceUIPaneReorderOperation{
			Intent: workspaceui.WorkspaceUIPaneReorderIntent{
				Kind:         workspaceui.WorkspaceUIPaneReorderIntentKindRow,
				Placement:    workspaceui.WorkspaceUIPaneDropPlacementBefore,
				TargetPaneID: "workspace_pane_0",
			},
		},
	})

	result := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "reorder", "--input", inputPath)
	if !result.Changed || result.Revision != 2 || result.OperationResult.Reorder == nil {
		t.Fatalf("reorder result = %+v, want changed revision 2 reorder outcome", result)
	}
	outcome := result.OperationResult.Reorder
	if outcome.IntentKind != workspaceui.WorkspaceUIPaneReorderIntentKindRow ||
		outcome.TargetPaneID != "workspace_pane_0" ||
		outcome.DestinationColumnID != "workspace_column_0" ||
		!outcome.RemovedColumn ||
		!outcome.ResetPaneSizing {
		t.Fatalf("reorder outcome = %+v, want row reorder into first column with reset sizing", outcome)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want moved pane focused", result.Layout.FocusedPaneID)
	}
	if len(result.Layout.Columns) != 1 {
		t.Fatalf("columns = %+v, want source column removed", result.Layout.Columns)
	}
	if column := workspaceCLIColumnByID(t, result.Layout, "workspace_column_0"); !stringSlicesEqual(column.PaneIDs, []string{"workspace_pane_1", "workspace_pane_0"}) {
		t.Fatalf("column panes = %+v, want terminal before chat", column.PaneIDs)
	}

	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	terminalPane := workspaceCLIPaneDescriptorByID(t, list, "workspace_pane_1")
	if !terminalPane.Focused || terminalPane.Location.ColumnIndex != 0 || terminalPane.Location.PaneIndex != 0 {
		t.Fatalf("terminal descriptor after reorder = %+v, want focused first pane", terminalPane)
	}
}

func TestWorkspacePanesReorderCommandRejectsMissingInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "reorder"), commandDeps); code != 2 {
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

func TestWorkspacePanesReorderCommandRejectsNonReorderOperationInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeWorkspacePaneReorderInputForCLITest(t, workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
	})
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "reorder", "--input", inputPath), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_pane_reorder_input_invalid" {
		t.Fatalf("error code = %q, want workspace_pane_reorder_input_invalid", errResponse.Error.Code)
	}
	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 2 {
		t.Fatalf("pane list after rejected reorder = %+v, want original two panes", list)
	}
}

func writeWorkspacePaneReorderInputForCLITest(t *testing.T, operation workspaceui.WorkspaceUIPaneOperation) string {
	t.Helper()
	data, err := json.MarshalIndent(operation, "", "  ")
	if err != nil {
		t.Fatalf("marshal workspace pane reorder input: %v", err)
	}
	path := filepath.Join(t.TempDir(), "reorder-pane.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write workspace pane reorder input: %v", err)
	}
	return path
}

func workspaceCLIPaneDescriptorByID(t *testing.T, list workspaceui.WorkspaceUIPaneListResult, paneID string) workspaceui.WorkspaceUIPaneDescriptor {
	t.Helper()
	for _, pane := range list.Panes {
		if pane.PaneID == paneID {
			return pane
		}
	}
	t.Fatalf("pane %s not found in list %+v", paneID, list)
	return workspaceui.WorkspaceUIPaneDescriptor{}
}

func stringSlicesEqual(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
