package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/workspace"
	"setta/internal/workspaceui"
)

type workspaceCLITestFixture struct {
	appDataDir string
	deps       cliDeps
	opened     httpapi.OpenWorkspaceResponse
}

func TestWorkspaceReadOnlyCommandsIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)

	current := runWorkspaceCommandJSON[workspace.WorkspaceSummary](t, fixture, "current")
	if current.ID != fixture.opened.Workspace.ID || current.RootPath != fixture.opened.Workspace.RootPath {
		t.Fatalf("current workspace = %+v, want %+v", current, fixture.opened.Workspace)
	}

	schema := runWorkspaceCommandJSON[workspaceui.WorkspaceUISchema](t, fixture, "schema")
	if schema.LayoutSchemaVersion != workspaceui.SchemaVersion || len(schema.SurfaceKinds) == 0 {
		t.Fatalf("schema = %+v, want workspace UI schema", schema)
	}

	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	assertWorkspacePaneListForCLITest(t, list)

	read := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneReadResult](t, fixture, "panes", "read", "workspace_pane_1")
	if read.Pane.PaneID != "workspace_pane_1" || read.Pane.Location.ColumnIndex != 1 {
		t.Fatalf("read pane = %+v, want second-column terminal", read.Pane)
	}
}

func TestWorkspacePaneLayoutWriteCommandsIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)

	focus := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "focus", "workspace_pane_0")
	assertWorkspacePaneFocusCLIResult(t, focus)

	rename := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "rename", "--title", "Shell", "workspace_pane_1")
	assertWorkspacePaneRenameCLIResult(t, rename)

	move := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "move", "--direction", "left", "workspace_pane_1")
	assertWorkspacePaneMoveCLIResult(t, move)

	closeResult := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "close", "--surface-close", "none", "workspace_pane_1")
	assertWorkspacePaneCloseCLIResult(t, closeResult)

	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	assertWorkspacePaneListAfterWriteCLITest(t, list)
}

func assertWorkspacePaneFocusCLIResult(t *testing.T, result workspaceui.WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !result.Changed || result.Revision != 2 || result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focus result = %+v, want changed revision 2 focused chat pane", result)
	}
	if result.OperationResult.Kind != workspaceui.WorkspaceUIPaneOperationKindFocusPane || result.OperationResult.PaneID != "workspace_pane_0" {
		t.Fatalf("focus outcome = %+v, want focus_pane for workspace_pane_0", result.OperationResult)
	}
}

func assertWorkspacePaneRenameCLIResult(t *testing.T, result workspaceui.WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !result.Changed || result.Revision != 3 || result.OperationResult.Rename == nil || result.OperationResult.Rename.Title != "Shell" {
		t.Fatalf("rename result = %+v, want changed revision 3 title Shell", result)
	}
}

func assertWorkspacePaneMoveCLIResult(t *testing.T, result workspaceui.WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !result.Changed || result.Revision != 4 || result.OperationResult.Move == nil || result.OperationResult.Move.Direction != workspaceui.WorkspaceUIPaneMoveDirectionLeft {
		t.Fatalf("move result = %+v, want changed revision 4 left move", result)
	}
}

func assertWorkspacePaneCloseCLIResult(t *testing.T, closeResult workspaceui.WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !closeResult.Changed || closeResult.Revision != 5 || closeResult.OperationResult.Close == nil {
		t.Fatalf("close result = %+v, want changed revision 5 close outcome", closeResult)
	}
	if closeResult.OperationResult.Close.SurfaceClose != workspaceui.WorkspaceUISurfaceCloseModeNone {
		t.Fatalf("close surface mode = %s, want none", closeResult.OperationResult.Close.SurfaceClose)
	}
}

func assertWorkspacePaneListAfterWriteCLITest(t *testing.T, list workspaceui.WorkspaceUIPaneListResult) {
	t.Helper()
	if len(list.Panes) != 1 || list.Panes[0].PaneID != "workspace_pane_0" || !list.Panes[0].Focused {
		t.Fatalf("pane list after writes = %+v, want only focused workspace_pane_0", list)
	}
}

func TestWorkspacePanesReadCommandFailsForMissingPane(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "read", "workspace_pane_missing"), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "read_workspace_ui_pane_failed" {
		t.Fatalf("error code = %q, want read_workspace_ui_pane_failed", errResponse.Error.Code)
	}
}

func TestWorkspacePanesCloseCommandFailsForUnsupportedSurfaceClose(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "close", "--surface-close", "safe", "workspace_pane_1"), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != string(workspaceui.WorkspaceUIOperationErrorCodeUnsupportedSurfaceClose) {
		t.Fatalf("error code = %q, want unsupported_surface_close", errResponse.Error.Code)
	}
	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 2 {
		t.Fatalf("pane list after failed safe close = %+v, want original two panes", list)
	}
}

func TestWorkspacePanesMoveCommandRejectsInvalidDirection(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "move", "--direction", "sideways", "workspace_pane_1"), commandDeps); code != 2 {
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

func newWorkspaceCLITestFixture(t *testing.T) workspaceCLITestFixture {
	t.Helper()
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}
	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})
	opened := openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)
	seedWorkspaceUILayoutForCLITest(t, appDataDir, cliTestWorkspaceUILayout(opened.Workspace.ID))
	return workspaceCLITestFixture{
		appDataDir: appDataDir,
		deps:       deps,
		opened:     opened,
	}
}

func runWorkspaceCommandJSON[T any](t *testing.T, fixture workspaceCLITestFixture, command ...string) T {
	t.Helper()
	var stdout bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	if code := runWithDeps(workspaceCommandArgs(fixture, command...), commandDeps); code != 0 {
		t.Fatalf("workspace command %v exit code = %d, want 0", command, code)
	}
	var decoded T
	if err := json.NewDecoder(&stdout).Decode(&decoded); err != nil {
		t.Fatalf("decode workspace command %v output: %v\noutput:\n%s", command, err, stdout.String())
	}
	return decoded
}

func workspaceCommandArgs(fixture workspaceCLITestFixture, command ...string) []string {
	if len(command) >= 2 && command[0] == "panes" {
		args := []string{"workspace", "panes", command[1], "--app-data-dir", fixture.appDataDir}
		return append(args, command[2:]...)
	}
	args := []string{"workspace"}
	args = append(args, command...)
	args = append(args, "--app-data-dir", fixture.appDataDir)
	return args
}

func assertWorkspacePaneListForCLITest(t *testing.T, list workspaceui.WorkspaceUIPaneListResult) {
	t.Helper()
	if !list.LayoutPresent || len(list.Panes) != 2 {
		t.Fatalf("pane list = %+v, want two persisted panes", list)
	}
	terminalPane := list.Panes[1]
	if terminalPane.PaneID != "workspace_pane_1" || !terminalPane.Focused {
		t.Fatalf("second pane = %+v, want focused terminal pane", terminalPane)
	}
	if terminalPane.ContentRefs.Terminal == nil || terminalPane.ContentRefs.Terminal.ProfileID != "default" {
		t.Fatalf("terminal content ref = %+v", terminalPane.ContentRefs.Terminal)
	}
}

func seedWorkspaceUILayoutForCLITest(t *testing.T, appDataDir string, layout workspaceui.WorkspaceUILayout) {
	t.Helper()

	store, err := workspaceui.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new workspace UI store: %v", err)
	}
	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("seed workspace UI layout: %v", err)
	}
}

func cliTestWorkspaceUILayout(workspaceID string) workspaceui.WorkspaceUILayout {
	return workspaceui.WorkspaceUILayout{
		SchemaVersion: workspaceui.SchemaVersion,
		Revision:      1,
		WorkspaceID:   workspaceID,
		FocusedPaneID: "workspace_pane_1",
		Columns: []workspaceui.WorkspaceUIColumn{
			cliTestWorkspaceColumn("workspace_column_0", 0, "workspace_pane_0", 520),
			cliTestWorkspaceColumn("workspace_column_1", 1, "workspace_pane_1", 640),
		},
		Panes: []workspaceui.WorkspaceUIPane{
			cliTestWorkspacePane("workspace_column_0", "workspace_pane_0", "workspace_surface_0", workspaceui.SurfaceKindChatDOM, nil),
			cliTestWorkspacePane("workspace_column_1", "workspace_pane_1", "workspace_surface_1", workspaceui.SurfaceKindTerminal, &workspaceui.TerminalPaneConfig{
				ProfileID:     "default",
				CWDOverride:   "",
				TitleOverride: "",
			}),
		},
	}
}

func cliTestWorkspaceColumn(columnID string, index int, paneID string, width float64) workspaceui.WorkspaceUIColumn {
	return workspaceui.WorkspaceUIColumn{
		ColumnID:       columnID,
		IdealWidthSpec: workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
		Index:          index,
		PaneIDs:        []string{paneID},
		PlaneIndex:     0,
		SlotIndex:      index,
		WidthSpec:      workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: width},
	}
}

func cliTestWorkspacePane(
	columnID string,
	paneID string,
	surfaceID string,
	surfaceKind workspaceui.SurfaceKind,
	terminalConfig *workspaceui.TerminalPaneConfig,
) workspaceui.WorkspaceUIPane {
	sequence := 0
	if paneID == "workspace_pane_1" {
		sequence = 1
	}
	return workspaceui.WorkspaceUIPane{
		ColumnID:       columnID,
		Heat:           sequence * 37,
		PaneID:         paneID,
		Sequence:       sequence,
		Subtitle:       cliTestWorkspacePaneSubtitle(surfaceKind),
		SurfaceID:      surfaceID,
		SurfaceKind:    surfaceKind,
		TerminalConfig: terminalConfig,
		Title:          cliTestWorkspacePaneTitle(surfaceKind),
		Tone:           cliTestWorkspacePaneTone(surfaceKind),
		Weight:         cliTestWorkspacePaneWeight(surfaceKind),
	}
}

func cliTestWorkspacePaneSubtitle(surfaceKind workspaceui.SurfaceKind) string {
	if surfaceKind == workspaceui.SurfaceKindTerminal {
		return "workspace command surface"
	}
	return "workspace chat"
}

func cliTestWorkspacePaneTitle(surfaceKind workspaceui.SurfaceKind) string {
	if surfaceKind == workspaceui.SurfaceKindTerminal {
		return "Terminal"
	}
	return "Chat"
}

func cliTestWorkspacePaneTone(surfaceKind workspaceui.SurfaceKind) workspaceui.PaneTone {
	if surfaceKind == workspaceui.SurfaceKindTerminal {
		return workspaceui.PaneToneGreen
	}
	return workspaceui.PaneToneCyan
}

func cliTestWorkspacePaneWeight(surfaceKind workspaceui.SurfaceKind) float64 {
	if surfaceKind == workspaceui.SurfaceKindTerminal {
		return 1
	}
	return 1.6
}
