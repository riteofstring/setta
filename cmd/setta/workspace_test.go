package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/chat"
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

func TestWorkspacePaneLayoutWriteCommandsAcceptPaneIDBeforeOperationFlags(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)

	rename := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "rename", "workspace_pane_1", "--title", "Shell")
	if !rename.Changed || rename.Revision != 2 || rename.OperationResult.Rename == nil || rename.OperationResult.Rename.Title != "Shell" {
		t.Fatalf("rename result = %+v, want changed revision 2 title Shell", rename)
	}

	move := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "move", "workspace_pane_1", "--direction", "left")
	if !move.Changed || move.Revision != 3 || move.OperationResult.Move == nil || move.OperationResult.Move.Direction != workspaceui.WorkspaceUIPaneMoveDirectionLeft {
		t.Fatalf("move result = %+v, want changed revision 3 left move", move)
	}

	closeResult := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "close", "workspace_pane_1", "--surface-close", "none")
	if !closeResult.Changed || closeResult.Revision != 4 || closeResult.OperationResult.Close == nil {
		t.Fatalf("close result = %+v, want changed revision 4 close outcome", closeResult)
	}
}

func TestWorkspacePanesOpenCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeWorkspacePaneOpenInputForCLITest(t, workspaceui.WorkspaceUIPaneOpenOperation{
		AdjacentToColumnID: "workspace_column_1",
		Subtitle:           "CLI opened pane",
		SurfaceKind:        workspaceui.SurfaceKindTerminal,
		TerminalConfig: &workspaceui.TerminalPaneConfig{
			ProfileID: "default",
		},
		Title: "Scratch",
		Tone:  workspaceui.PaneToneGreen,
		WidthSpec: &workspaceui.ColumnWidthSpec{
			Unit:  workspaceui.ColumnWidthUnitPX,
			Value: 480,
		},
	})

	openResult := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "open", "--input", inputPath)
	if !openResult.Changed || openResult.Revision != 2 || openResult.OperationResult.Open == nil {
		t.Fatalf("open result = %+v, want changed revision 2 open outcome", openResult)
	}
	openOutcome := openResult.OperationResult.Open
	if openResult.OperationResult.PaneID != "workspace_pane_2" || openResult.Layout.FocusedPaneID != "workspace_pane_2" {
		t.Fatalf("open focused pane = %q/%q, want workspace_pane_2", openResult.OperationResult.PaneID, openResult.Layout.FocusedPaneID)
	}
	if openOutcome.TargetKind != workspaceui.WorkspaceUIPaneOpenTargetKindAdjacentColumn ||
		openOutcome.AdjacentToColumnID != "workspace_column_1" ||
		openOutcome.SurfaceKind != workspaceui.SurfaceKindTerminal ||
		openOutcome.Title != "Scratch" {
		t.Fatalf("open outcome = %+v, want terminal adjacent column Scratch pane", openOutcome)
	}
	if openOutcome.WidthSpec.Unit != workspaceui.ColumnWidthUnitPX || openOutcome.WidthSpec.Value != 480 {
		t.Fatalf("open width = %+v, want 480px", openOutcome.WidthSpec)
	}

	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 3 {
		t.Fatalf("pane list after open has %d panes, want 3", len(list.Panes))
	}
	openedPane := list.Panes[2]
	if openedPane.PaneID != "workspace_pane_2" || !openedPane.Focused || openedPane.Title != "Scratch" {
		t.Fatalf("opened pane descriptor = %+v, want focused Scratch pane", openedPane)
	}
	if openedPane.ContentRefs.Terminal == nil || openedPane.ContentRefs.Terminal.ProfileID != "default" {
		t.Fatalf("opened pane terminal ref = %+v, want default profile", openedPane.ContentRefs.Terminal)
	}
}

func TestWorkspacePanesResizeCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)

	assertWorkspacePanesResizeWidthPXCommand(t, fixture)
	assertWorkspacePanesResizeHeightPXCommand(t, fixture)
	assertWorkspacePanesResizeHeightScaleCommand(t, fixture)
	assertWorkspacePanesResizeResetHeightCommand(t, fixture)
	assertWorkspacePanesResizeWidthScaleCommand(t, fixture)
}

func TestWorkspaceTerminalsReadCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	session := createWorkspaceTerminalSessionForCLITest(t, fixture)

	read := runWorkspaceCommandJSON[httpapi.ReadWorkspaceUITerminalResponse](t, fixture, "terminals", "read", "workspace_pane_1", "--recent-output-byte-limit", "4096")
	if read.WorkspaceID != fixture.opened.Workspace.ID || read.Pane.PaneID != "workspace_pane_1" {
		t.Fatalf("terminal read envelope = %+v, want workspace terminal pane", read)
	}
	if read.Terminal.SessionID != session.ID || read.Terminal.Session.ID != session.ID {
		t.Fatalf("terminal read session = %+v, want created terminal session %s", read.Terminal, session.ID)
	}
	if read.Terminal.Session.WorkspaceID != fixture.opened.Workspace.ID || read.Terminal.Session.PaneID != "workspace_pane_1" {
		t.Fatalf("terminal read attachment = %+v, want fixture workspace pane", read.Terminal.Session)
	}
	if read.Terminal.RecentOutput.Chunks == nil {
		t.Fatalf("terminal recent output chunks is nil, want empty or populated array")
	}
	if read.Terminal.Screen.Cols != read.Terminal.Session.Cols || read.Terminal.Screen.Rows != read.Terminal.Session.Rows {
		t.Fatalf("terminal screen dimensions = %dx%d, want session %dx%d", read.Terminal.Screen.Cols, read.Terminal.Screen.Rows, read.Terminal.Session.Cols, read.Terminal.Session.Rows)
	}
	if len(read.Terminal.Screen.Lines) != read.Terminal.Screen.Rows {
		t.Fatalf("terminal screen lines = %d, want rows %d", len(read.Terminal.Screen.Lines), read.Terminal.Screen.Rows)
	}
}

func TestWorkspaceChatsReadCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	conversation := createWorkspaceChatConversationForCLITest(t, fixture)
	layout := cliTestWorkspaceUILayout(fixture.opened.Workspace.ID)
	layout.Panes[0].ChatConfig = &workspaceui.ChatPaneConfig{ConversationID: conversation.ID}
	seedWorkspaceUILayoutForCLITest(t, fixture.appDataDir, layout)

	read := runWorkspaceCommandJSON[httpapi.ReadWorkspaceUIChatResponse](t, fixture, "chats", "read", "workspace_pane_0", "--limit", "5")
	if read.WorkspaceID != fixture.opened.Workspace.ID || read.Pane.PaneID != "workspace_pane_0" {
		t.Fatalf("chat read envelope = %+v, want workspace chat pane", read)
	}
	if read.ConversationID != conversation.ID || read.Page.Conversation.ID != conversation.ID {
		t.Fatalf("chat read conversation = %s page %+v, want %s", read.ConversationID, read.Page.Conversation, conversation.ID)
	}
	if read.Pane.ContentRefs.Chat == nil || read.Pane.ContentRefs.Chat.ConversationID != conversation.ID {
		t.Fatalf("chat content ref = %+v, want conversation %s", read.Pane.ContentRefs.Chat, conversation.ID)
	}
	if !workspacePaneReadModesContain(read.Pane.ReadModes, workspaceui.WorkspaceUIPaneReadModeChatState) {
		t.Fatalf("chat read modes = %+v, want chat_state", read.Pane.ReadModes)
	}
	if read.ActiveRun != nil || read.ActiveRunLiveness != nil {
		t.Fatalf("active run fields = %+v %+v, want none", read.ActiveRun, read.ActiveRunLiveness)
	}
}

func TestWorkspaceChatsSendCommandIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	conversation := createWorkspaceChatConversationForCLITest(t, fixture)
	layout := cliTestWorkspaceUILayout(fixture.opened.Workspace.ID)
	layout.Panes[0].ChatConfig = &workspaceui.ChatPaneConfig{ConversationID: conversation.ID}
	seedWorkspaceUILayoutForCLITest(t, fixture.appDataDir, layout)
	inputPath := writeWorkspaceChatSendInputForCLITest(t, chat.TextChatInput("send through workspace chat pane"))

	sent := runWorkspaceCommandJSON[httpapi.SendWorkspaceUIChatResponse](t, fixture, "chats", "send", "workspace_pane_0", "--input", inputPath)
	if sent.WorkspaceID != fixture.opened.Workspace.ID || sent.Pane.PaneID != "workspace_pane_0" {
		t.Fatalf("chat send envelope = %+v, want workspace chat pane", sent)
	}
	if sent.ConversationID != conversation.ID || sent.Result.Conversation.ID != conversation.ID {
		t.Fatalf("chat send conversation = %s result %+v, want %s", sent.ConversationID, sent.Result.Conversation, conversation.ID)
	}
	if sent.Result.UserMessage.ConversationID != conversation.ID ||
		sent.Result.AssistantMessage.ConversationID != conversation.ID ||
		sent.Result.Run.ConversationID != conversation.ID {
		t.Fatalf("chat send result target = %+v, want bound conversation %s", sent.Result, conversation.ID)
	}
	if sent.Result.UserMessage.Delivery != chat.MessageDeliveryNormal {
		t.Fatalf("chat send delivery = %s, want normal", sent.Result.UserMessage.Delivery)
	}
	if !workspacePaneWriteModesContain(sent.Pane.WriteModes, workspaceui.WorkspaceUIPaneWriteModeChatSend) {
		t.Fatalf("chat send pane write modes = %+v, want chat_send", sent.Pane.WriteModes)
	}
}

func TestWorkspaceTerminalsWriteCommandsIntegration(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	session := createWorkspaceTerminalSessionForCLITest(t, fixture)
	data := []byte("echo cli terminal write\n")
	digest := terminalWriteCLITestSHA256(data)
	inputPath := writeWorkspaceTerminalWriteInputForCLITest(t, workspaceTerminalWritePrepareInput{
		DataBase64: base64.StdEncoding.EncodeToString(data),
		ByteCount:  len(data),
		SHA256:     digest,
	})

	prepared := runWorkspaceCommandJSON[httpapi.PrepareWorkspaceUITerminalWriteResponse](t, fixture, "terminals", "writes", "prepare", "workspace_pane_1", "--input", inputPath)
	if prepared.WorkspaceID != fixture.opened.Workspace.ID ||
		prepared.Pane.PaneID != "workspace_pane_1" ||
		prepared.PreparedWrite.SessionID != session.ID ||
		prepared.PreparedWrite.SHA256 != digest ||
		prepared.PreparedWrite.ByteCount != len(data) {
		t.Fatalf("prepared write = %+v, want terminal pane session %s", prepared, session.ID)
	}
	if prepared.PreparedWrite.DeviceSessionID == "" {
		t.Fatalf("prepared write device session is empty: %+v", prepared.PreparedWrite)
	}

	committed := runWorkspaceCommandJSON[httpapi.CommitWorkspaceUITerminalWriteResponse](t, fixture, "terminals", "writes", "commit", prepared.PreparedWrite.PreparedWriteID, "--sha256", digest)
	if committed.PreparedWrite.PreparedWriteID != prepared.PreparedWrite.PreparedWriteID ||
		committed.PreparedWrite.WorkspaceID != fixture.opened.Workspace.ID ||
		committed.PreparedWrite.PaneID != "workspace_pane_1" ||
		committed.PreparedWrite.SessionID != session.ID ||
		committed.PreparedWrite.DeviceSessionID != prepared.PreparedWrite.DeviceSessionID ||
		committed.PreparedWrite.WrittenByteCount != len(data) {
		t.Fatalf("committed write = %+v, want prepared terminal write committed", committed.PreparedWrite)
	}
}

func assertWorkspacePanesResizeWidthPXCommand(t *testing.T, fixture workspaceCLITestFixture) {
	t.Helper()
	widthPX := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "resize", "workspace_pane_1", "--width-px", "700")
	if !widthPX.Changed || widthPX.Revision != 2 || widthPX.OperationResult.Resize == nil {
		t.Fatalf("width px result = %+v, want changed revision 2 resize outcome", widthPX)
	}
	if widthPX.OperationResult.Resize.WidthSpec != (workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("width px outcome = %+v, want 700px", widthPX.OperationResult.Resize)
	}
	if column := workspaceCLIColumnByID(t, widthPX.Layout, "workspace_column_1"); column.WidthSpec != (workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}) {
		t.Fatalf("resized column = %+v, want 700px", column)
	}
	if len(widthPX.BeforeAfterDimensions) != 1 || widthPX.BeforeAfterDimensions[0].PaneID != "workspace_pane_1" {
		t.Fatalf("width px dimension changes = %+v, want target pane only", widthPX.BeforeAfterDimensions)
	}
}

func assertWorkspacePanesResizeHeightPXCommand(t *testing.T, fixture workspaceCLITestFixture) {
	t.Helper()
	heightPX := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "resize", "--height-px", "240", "workspace_pane_1")
	if !heightPX.Changed || heightPX.Revision != 3 || heightPX.OperationResult.Resize == nil || heightPX.OperationResult.Resize.HeightPX == nil || *heightPX.OperationResult.Resize.HeightPX != 240 {
		t.Fatalf("height px result = %+v, want changed revision 3 height 240", heightPX)
	}
	if len(heightPX.BeforeAfterDimensions) != 2 {
		t.Fatalf("height px dimension changes = %+v, want row-scoped changes for two panes", heightPX.BeforeAfterDimensions)
	}
	assertWorkspaceCLIPaneHeight(t, heightPX.Layout, "workspace_pane_0", 240)
	assertWorkspaceCLIPaneHeight(t, heightPX.Layout, "workspace_pane_1", 240)
}

func assertWorkspacePanesResizeHeightScaleCommand(t *testing.T, fixture workspaceCLITestFixture) {
	t.Helper()
	heightScale := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "resize", "workspace_pane_1", "--height-scale", "1.5")
	if !heightScale.Changed || heightScale.Revision != 4 || heightScale.OperationResult.Resize == nil || heightScale.OperationResult.Resize.HeightPX == nil || *heightScale.OperationResult.Resize.HeightPX != 360 {
		t.Fatalf("height scale result = %+v, want changed revision 4 height 360", heightScale)
	}
	assertWorkspaceCLIPaneHeight(t, heightScale.Layout, "workspace_pane_0", 360)
	assertWorkspaceCLIPaneHeight(t, heightScale.Layout, "workspace_pane_1", 360)
}

func assertWorkspacePanesResizeResetHeightCommand(t *testing.T, fixture workspaceCLITestFixture) {
	t.Helper()
	resetHeight := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "resize", "workspace_pane_1", "--reset-height")
	if !resetHeight.Changed || resetHeight.Revision != 5 || resetHeight.OperationResult.Resize == nil || resetHeight.OperationResult.Resize.HeightPX != nil {
		t.Fatalf("reset height result = %+v, want changed revision 5 nil height", resetHeight)
	}
	assertWorkspaceCLIPaneHeightReset(t, resetHeight.Layout, "workspace_pane_0")
	assertWorkspaceCLIPaneHeightReset(t, resetHeight.Layout, "workspace_pane_1")
}

func assertWorkspacePanesResizeWidthScaleCommand(t *testing.T, fixture workspaceCLITestFixture) {
	t.Helper()
	widthScale := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneOperationResult](t, fixture, "panes", "resize", "workspace_pane_1", "--width-scale", "0.5")
	if !widthScale.Changed || widthScale.Revision != 6 || widthScale.OperationResult.Resize == nil {
		t.Fatalf("width scale result = %+v, want changed revision 6 resize outcome", widthScale)
	}
	expectedWidth := workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitProportion, Value: 0.5}
	if widthScale.OperationResult.Resize.WidthSpec != expectedWidth {
		t.Fatalf("width scale outcome = %+v, want %+v", widthScale.OperationResult.Resize, expectedWidth)
	}
	if column := workspaceCLIColumnByID(t, widthScale.Layout, "workspace_column_1"); column.WidthSpec != expectedWidth {
		t.Fatalf("resized column = %+v, want %+v", column, expectedWidth)
	}
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

func TestWorkspacePanesOpenCommandRejectsMissingInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "open"), commandDeps); code != 2 {
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

func TestWorkspacePanesOpenCommandRejectsCallerSuppliedPaneID(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeRawWorkspacePaneOpenInputForCLITest(t, `{
  "paneId": "workspace_pane_attacker",
  "surfaceKind": "terminal",
  "subtitle": "should be rejected before HTTP",
  "title": "Scratch",
  "tone": "green"
}`)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "open", "--input", inputPath), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_pane_open_input_decode_failed" {
		t.Fatalf("error code = %q, want workspace_pane_open_input_decode_failed", errResponse.Error.Code)
	}
	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 2 {
		t.Fatalf("pane list after rejected open = %+v, want original two panes", list)
	}
}

func TestWorkspacePanesResizeCommandRejectsMultipleTargets(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "panes", "resize", "workspace_pane_1", "--width-px", "700", "--height-px", "240"), commandDeps); code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_usage_error" {
		t.Fatalf("error code = %q, want workspace_usage_error", errResponse.Error.Code)
	}
	list := runWorkspaceCommandJSON[workspaceui.WorkspaceUIPaneListResult](t, fixture, "panes", "list")
	if len(list.Panes) != 2 {
		t.Fatalf("pane list after rejected resize = %+v, want original two panes", list)
	}
}

func TestWorkspaceTerminalsReadCommandRejectsNonTerminalPane(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "terminals", "read", "workspace_pane_0"), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "unsupported_workspace_ui_terminal_pane" {
		t.Fatalf("error code = %q, want unsupported_workspace_ui_terminal_pane", errResponse.Error.Code)
	}
}

func TestWorkspaceChatsReadCommandRejectsUnboundPane(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "chats", "read", "workspace_pane_0"), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "unsupported_workspace_ui_chat_pane" {
		t.Fatalf("error code = %q, want unsupported_workspace_ui_chat_pane", errResponse.Error.Code)
	}
}

func TestWorkspaceChatsSendCommandRejectsIdentityInInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeRawWorkspaceChatSendInputForCLITest(t, `{
  "conversationId": "conversation_attacker",
  "parts": [
    {
      "type": "text",
      "text": {
        "text": "hello",
        "format": "plain"
      }
    }
  ]
}`)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "chats", "send", "workspace_pane_0", "--input", inputPath), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_chat_send_input_decode_failed" {
		t.Fatalf("error code = %q, want workspace_chat_send_input_decode_failed", errResponse.Error.Code)
	}
}

func TestWorkspaceTerminalsWritePrepareRejectsDeviceSessionInput(t *testing.T) {
	fixture := newWorkspaceCLITestFixture(t)
	inputPath := writeRawWorkspaceTerminalWriteInputForCLITest(t, `{
  "dataBase64": "ZWNobyBoaQo=",
  "byteCount": 8,
  "sha256": "cb49f2e47b27bcd521b26686b2b3c412357170971c0e3ff8c702f6ff5a1da59b",
  "deviceSessionId": "device_attacker"
}`)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := fixture.deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr

	if code := runWithDeps(workspaceCommandArgs(fixture, "terminals", "writes", "prepare", "workspace_pane_1", "--input", inputPath), commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workspace_terminal_write_input_decode_failed" {
		t.Fatalf("error code = %q, want workspace_terminal_write_input_decode_failed", errResponse.Error.Code)
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

func createWorkspaceTerminalSessionForCLITest(t *testing.T, fixture workspaceCLITestFixture) httpapi.TerminalSessionSummary {
	t.Helper()
	token, cleanup, err := createRuntimeCLIAuthSession(context.Background(), fixture.appDataDir, "Setta CLI test terminal creator")
	if err != nil {
		t.Fatalf("create CLI auth session: %v", err)
	}
	defer cleanup()
	created := postAuthedRuntimeJSON[httpapi.TerminalSessionResponse](t, fixture.deps.httpClient, readServeBaseURLForCLITest(t, fixture.appDataDir), token, "/terminals/create", httpapi.CreateTerminalRequest{
		WorkspaceID: fixture.opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	})
	return created.Session
}

func createWorkspaceChatConversationForCLITest(t *testing.T, fixture workspaceCLITestFixture) chat.Conversation {
	t.Helper()
	token, cleanup, err := createRuntimeCLIAuthSession(context.Background(), fixture.appDataDir, "Setta CLI test chat creator")
	if err != nil {
		t.Fatalf("create CLI auth session: %v", err)
	}
	defer cleanup()
	return postAuthedRuntimeJSON[chat.Conversation](t, fixture.deps.httpClient, readServeBaseURLForCLITest(t, fixture.appDataDir), token, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: fixture.opened.Workspace.ID,
		Title:       "CLI chat read",
	})
}

func readServeBaseURLForCLITest(t *testing.T, appDataDir string) string {
	t.Helper()
	state, err := readServeState(appDataDir)
	if err != nil {
		t.Fatalf("read serve state: %v", err)
	}
	return state.BaseURL
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
	if len(command) >= 3 && command[0] == "terminals" && command[1] == "writes" {
		args := []string{"workspace", "terminals", "writes", command[2], "--app-data-dir", fixture.appDataDir}
		return append(args, command[3:]...)
	}
	if len(command) >= 2 && (command[0] == "chats" || command[0] == "panes" || command[0] == "terminals") {
		args := []string{"workspace", "panes", command[1], "--app-data-dir", fixture.appDataDir}
		if command[0] == "chats" {
			args = []string{"workspace", "chats", command[1], "--app-data-dir", fixture.appDataDir}
		}
		if command[0] == "terminals" {
			args = []string{"workspace", "terminals", command[1], "--app-data-dir", fixture.appDataDir}
		}
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
	if !workspacePaneReadModesContain(terminalPane.ReadModes, workspaceui.WorkspaceUIPaneReadModeTerminalRecentOutput) ||
		!workspacePaneReadModesContain(terminalPane.ReadModes, workspaceui.WorkspaceUIPaneReadModeTerminalScreen) {
		t.Fatalf("terminal read modes = %+v, want terminal recent-output and screen modes", terminalPane.ReadModes)
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

func writeWorkspacePaneOpenInputForCLITest(t *testing.T, input workspaceui.WorkspaceUIPaneOpenOperation) string {
	t.Helper()
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		t.Fatalf("marshal workspace pane open input: %v", err)
	}
	return writeRawWorkspacePaneOpenInputForCLITest(t, string(data))
}

func writeRawWorkspacePaneOpenInputForCLITest(t *testing.T, data string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "open-pane.json")
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatalf("write workspace pane open input: %v", err)
	}
	return path
}

func writeWorkspaceChatSendInputForCLITest(t *testing.T, input chat.ChatInput) string {
	t.Helper()
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		t.Fatalf("marshal workspace chat send input: %v", err)
	}
	return writeRawWorkspaceChatSendInputForCLITest(t, string(data))
}

func writeRawWorkspaceChatSendInputForCLITest(t *testing.T, data string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "chat-message.json")
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatalf("write workspace chat send input: %v", err)
	}
	return path
}

func writeWorkspaceTerminalWriteInputForCLITest(t *testing.T, input workspaceTerminalWritePrepareInput) string {
	t.Helper()
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		t.Fatalf("marshal workspace terminal write input: %v", err)
	}
	return writeRawWorkspaceTerminalWriteInputForCLITest(t, string(data))
}

func writeRawWorkspaceTerminalWriteInputForCLITest(t *testing.T, data string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "terminal-write.json")
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatalf("write workspace terminal write input: %v", err)
	}
	return path
}

func terminalWriteCLITestSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func workspaceCLIColumnByID(t *testing.T, layout workspaceui.WorkspaceUILayout, columnID string) workspaceui.WorkspaceUIColumn {
	t.Helper()
	for _, column := range layout.Columns {
		if column.ColumnID == columnID {
			return column
		}
	}
	t.Fatalf("column %s not found in layout %+v", columnID, layout)
	return workspaceui.WorkspaceUIColumn{}
}

func assertWorkspaceCLIPaneHeight(t *testing.T, layout workspaceui.WorkspaceUILayout, paneID string, expected int) {
	t.Helper()
	for _, pane := range layout.Panes {
		if pane.PaneID != paneID {
			continue
		}
		if pane.HeightPX == nil || *pane.HeightPX != expected {
			t.Fatalf("pane %s height = %v, want %d", paneID, pane.HeightPX, expected)
		}
		return
	}
	t.Fatalf("pane %s not found in layout %+v", paneID, layout)
}

func assertWorkspaceCLIPaneHeightReset(t *testing.T, layout workspaceui.WorkspaceUILayout, paneID string) {
	t.Helper()
	for _, pane := range layout.Panes {
		if pane.PaneID != paneID {
			continue
		}
		if pane.HeightPX != nil {
			t.Fatalf("pane %s height = %v, want nil", paneID, pane.HeightPX)
		}
		return
	}
	t.Fatalf("pane %s not found in layout %+v", paneID, layout)
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
