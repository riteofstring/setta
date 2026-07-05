package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

func TestWorkspaceEndpointsOpenSelectReorderCloseAndRemoveRecent(t *testing.T) {
	handler := newWorkspaceHandler(t, []string{"workspace_api", "workspace_web"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
		mustTime(t, "2026-05-29T20:05:00Z"),
	})

	apiRoot := t.TempDir()
	webRoot := t.TempDir()

	openAPI := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: apiRoot}, http.StatusOK)
	if !strings.HasPrefix(openAPI.Workspace.ID, "workspace_") {
		t.Fatalf("opened workspace id = %q, want workspace_ prefix", openAPI.Workspace.ID)
	}
	openWeb := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: webRoot}, http.StatusOK)
	assertIDs(t, "active after open", openWeb.Session.ActiveWorkspaces, []string{openAPI.Workspace.ID, openWeb.Workspace.ID})
	if openWeb.Session.SelectedWorkspaceID != openWeb.Workspace.ID {
		t.Fatalf("selected after open = %q, want %s", openWeb.Session.SelectedWorkspaceID, openWeb.Workspace.ID)
	}

	selected := postJSON[workspacesession.WorkspaceSession](t, handler, "/workspaces/select", SelectWorkspaceRequest{ID: openAPI.Workspace.ID}, http.StatusOK)
	if selected.SelectedWorkspaceID != openAPI.Workspace.ID {
		t.Fatalf("selected = %q, want %s", selected.SelectedWorkspaceID, openAPI.Workspace.ID)
	}

	selectedConversations := postJSON[WorkspaceSelectedConversations](t, handler, "/workspaces/selected-conversation", SetWorkspaceSelectedConversationRequest{
		WorkspaceID:    openAPI.Workspace.ID,
		ConversationID: "conversation_api",
	}, http.StatusOK)
	if selectedConversations.SelectedConversationIDsByWorkspaceID[openAPI.Workspace.ID] != "conversation_api" {
		t.Fatalf("selected conversation ids = %#v", selectedConversations.SelectedConversationIDsByWorkspaceID)
	}

	reordered := postJSON[workspacesession.WorkspaceSession](t, handler, "/workspaces/reorder", ReorderWorkspaceRequest{IDs: []string{openWeb.Workspace.ID, openAPI.Workspace.ID}}, http.StatusOK)
	assertIDs(t, "active after reorder", reordered.ActiveWorkspaces, []string{openWeb.Workspace.ID, openAPI.Workspace.ID})

	closedWeb := postJSON[workspacesession.WorkspaceSession](t, handler, "/workspaces/close", CloseWorkspaceRequest{ID: openWeb.Workspace.ID}, http.StatusOK)
	assertIDs(t, "active after close web", closedWeb.ActiveWorkspaces, []string{openAPI.Workspace.ID})
	assertIDs(t, "recent after close web", closedWeb.RecentWorkspaces, []string{openWeb.Workspace.ID, openAPI.Workspace.ID})

	if errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/remove-recent", RemoveRecentWorkspaceRequest{ID: openAPI.Workspace.ID}, http.StatusBadRequest); errResponse.Error.Code != "remove_recent_workspace_failed" {
		t.Fatalf("active remove error code = %q", errResponse.Error.Code)
	}

	removedRecent := postJSON[workspacesession.WorkspaceSession](t, handler, "/workspaces/remove-recent", RemoveRecentWorkspaceRequest{ID: openWeb.Workspace.ID}, http.StatusOK)
	assertIDs(t, "recent after remove web", removedRecent.RecentWorkspaces, []string{openAPI.Workspace.ID})
}

func TestWorkspaceSelectedConversationsEndpointReturnsCurrentSelection(t *testing.T) {
	handler := newWorkspaceHandler(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	postJSON[WorkspaceSelectedConversations](t, handler, "/workspaces/selected-conversation", SetWorkspaceSelectedConversationRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: "conversation_api",
	}, http.StatusOK)

	request := httptest.NewRequest(http.MethodGet, "/workspaces/selected-conversations", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var selected WorkspaceSelectedConversations
	if err := json.NewDecoder(response.Body).Decode(&selected); err != nil {
		t.Fatalf("decode selected conversations: %v", err)
	}
	if selected.SelectedConversationIDsByWorkspaceID[opened.Workspace.ID] != "conversation_api" {
		t.Fatalf("selected conversation ids = %#v", selected.SelectedConversationIDsByWorkspaceID)
	}
}

func TestWorkspaceUILayoutEndpointsPersistByWorkspaceID(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, nil, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	seedWorkspaceUILayout(t, appDataDir, layout)

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil {
		t.Fatal("read layout is nil")
	}
	if read.Layout.FocusedPaneID != layout.FocusedPaneID {
		t.Fatalf("focusedPaneID = %q, want %q", read.Layout.FocusedPaneID, layout.FocusedPaneID)
	}
	if _, err := os.Stat(workspaceui.StateFilePath(appDataDir, opened.Workspace.ID)); err != nil {
		t.Fatalf("stat workspace UI state: %v", err)
	}
}

func TestWorkspaceUILayoutInitializeEndpointPersistsDefaultLayoutOnce(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, nil, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)

	initialized := postJSON[workspaceui.WorkspaceUILayout](t, handler, "/workspaces/ui/layout/initialize", InitializeWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if initialized.WorkspaceID != opened.Workspace.ID || initialized.Revision != 1 || len(initialized.Panes) != 4 {
		t.Fatalf("initialized layout = %+v, want default layout at revision 1", initialized)
	}
	if initialized.Panes[0].Subtitle != opened.Workspace.DisplayName {
		t.Fatalf("first pane subtitle = %q, want workspace display name %q", initialized.Panes[0].Subtitle, opened.Workspace.DisplayName)
	}
	if _, err := os.Stat(workspaceui.StateFilePath(appDataDir, opened.Workspace.ID)); err != nil {
		t.Fatalf("stat initialized workspace UI state: %v", err)
	}

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/layout/initialize", InitializeWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "initialize_workspace_ui_layout_failed" {
		t.Fatalf("error code = %q, want initialize_workspace_ui_layout_failed", errResponse.Error.Code)
	}

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil || read.Layout.Revision != initialized.Revision || len(read.Layout.Panes) != len(initialized.Panes) {
		t.Fatalf("read initialized layout = %+v, want original initialized layout", read.Layout)
	}
}

func TestWorkspaceUILayoutResetEndpointRecreatesDefaultLayout(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Revision = 5
	seedWorkspaceUILayout(t, appDataDir, layout)

	reset := postJSON[workspaceui.WorkspaceUILayout](t, handler, "/workspaces/ui/layout/reset", ResetWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if reset.WorkspaceID != opened.Workspace.ID || reset.Revision != 6 || len(reset.Panes) != 4 {
		t.Fatalf("reset layout = %+v, want default layout at revision 6", reset)
	}
	if reset.Panes[0].SurfaceKind != workspaceui.SurfaceKindChatDOM || reset.Panes[3].SurfaceKind != workspaceui.SurfaceKindSettingsDOM {
		t.Fatalf("reset pane kinds = %+v, want backend default panes", reset.Panes)
	}

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil || read.Layout.Revision != reset.Revision || len(read.Layout.Panes) != len(reset.Panes) {
		t.Fatalf("read reset layout = %+v, want persisted reset layout", read.Layout)
	}
}

func TestWorkspaceUILayoutEndpointRejectsUnknownWorkspace(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: "workspace_missing",
	}, http.StatusBadRequest)

	if errResponse.Error.Code != "read_workspace_ui_layout_failed" {
		t.Fatalf("error code = %q, want read_workspace_ui_layout_failed", errResponse.Error.Code)
	}
}

func TestWorkspaceUIPaneIntrospectionEndpoints(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{
		ProfileID:     "default",
		CWDOverride:   "/tmp/workspace",
		TitleOverride: "CLI",
	}
	seedWorkspaceUILayout(t, appDataDir, layout)

	schema := getJSON[workspaceui.WorkspaceUISchema](t, handler, "/workspaces/ui/schema", http.StatusOK)
	assertWorkspaceUIPaneIntrospectionSchema(t, schema)

	list := postJSON[workspaceui.WorkspaceUIPaneListResult](t, handler, "/workspaces/ui/panes/list", ListWorkspaceUIPanesRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	assertWorkspaceUIPaneIntrospectionList(t, list)

	read := postJSON[workspaceui.WorkspaceUIPaneReadResult](t, handler, "/workspaces/ui/panes/read", ReadWorkspaceUIPaneRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
	}, http.StatusOK)
	assertWorkspaceUIPaneIntrospectionRead(t, read)
}

func assertWorkspaceUIPaneIntrospectionSchema(t *testing.T, schema workspaceui.WorkspaceUISchema) {
	t.Helper()

	if schema.LayoutSchemaVersion != workspaceui.SchemaVersion {
		t.Fatalf("layout schema version = %d, want %d", schema.LayoutSchemaVersion, workspaceui.SchemaVersion)
	}
	if len(schema.SurfaceKinds) == 0 || len(schema.PaneReadModes) == 0 {
		t.Fatalf("schema = %+v, want surface kinds and read modes", schema)
	}
}

func assertWorkspaceUIPaneIntrospectionList(t *testing.T, list workspaceui.WorkspaceUIPaneListResult) {
	t.Helper()

	if !list.LayoutPresent || len(list.Panes) != 2 {
		t.Fatalf("pane list = %+v, want persisted two-pane layout", list)
	}
	terminalPane := list.Panes[1]
	if terminalPane.PaneID != "workspace_pane_1" || !terminalPane.Focused {
		t.Fatalf("second pane = %+v, want focused terminal", terminalPane)
	}
	if terminalPane.ContentRefs.Terminal == nil || terminalPane.ContentRefs.Terminal.CWDOverride != "/tmp/workspace" {
		t.Fatalf("terminal content ref = %+v", terminalPane.ContentRefs.Terminal)
	}
	if !workspacePaneReadModesContain(terminalPane.ReadModes, workspaceui.WorkspaceUIPaneReadModeTerminalRecentOutput) ||
		!workspacePaneReadModesContain(terminalPane.ReadModes, workspaceui.WorkspaceUIPaneReadModeTerminalScreen) {
		t.Fatalf("terminal read modes = %+v, want terminal recent-output and screen capabilities", terminalPane.ReadModes)
	}
	if !terminalPane.CanFocus || !terminalPane.CanMove || !terminalPane.CanClosePane ||
		len(terminalPane.WriteModes) != 1 ||
		terminalPane.WriteModes[0] != workspaceui.WorkspaceUIPaneWriteModeTerminalInput {
		t.Fatalf("terminal capabilities = focus:%v move:%v close:%v writeModes:%+v, want layout capabilities and terminal_input", terminalPane.CanFocus, terminalPane.CanMove, terminalPane.CanClosePane, terminalPane.WriteModes)
	}
	if len(terminalPane.SurfaceCloseModes) != 1 || terminalPane.SurfaceCloseModes[0] != workspaceui.WorkspaceUISurfaceCloseModeNone {
		t.Fatalf("terminal surface close modes = %+v, want none", terminalPane.SurfaceCloseModes)
	}
}

func assertWorkspaceUIPaneIntrospectionRead(t *testing.T, read workspaceui.WorkspaceUIPaneReadResult) {
	t.Helper()

	if read.Pane.PaneID != "workspace_pane_1" || read.Pane.Location.ColumnIndex != 1 {
		t.Fatalf("read pane = %+v, want terminal in second column", read.Pane)
	}
}

func TestWorkspaceUITerminalReadEndpointResolvesPaneSession(t *testing.T) {
	handler, appDataDir, starter := newWorkspaceHandlerWithTerminal(t)
	server := httptest.NewServer(handler)
	defer server.Close()

	eventResponse, err := http.Get(server.URL + "/terminals/events")
	if err != nil {
		t.Fatalf("open terminal event stream: %v", err)
	}
	defer eventResponse.Body.Close()
	if eventResponse.StatusCode != http.StatusOK {
		t.Fatalf("terminal event stream status = %d, want 200", eventResponse.StatusCode)
	}
	eventReader := bufio.NewReader(eventResponse.Body)

	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{ProfileID: terminal.DefaultProfileID}
	seedWorkspaceUILayout(t, appDataDir, layout)
	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	started := readServerSentTerminalEvent(t, eventReader)
	if started.Type != terminal.TerminalEventStarted || started.SessionID != created.Session.ID {
		t.Fatalf("started event = %+v, want terminal.started for %s", started, created.Session.ID)
	}
	starter.handleAt(t, 0).emit([]byte("pane output\n"))
	output := readServerSentTerminalEvent(t, eventReader)
	if output.Type != terminal.TerminalEventOutput || output.SessionID != created.Session.ID {
		t.Fatalf("output event = %+v, want terminal output for %s", output, created.Session.ID)
	}

	read := postJSON[ReadWorkspaceUITerminalResponse](t, handler, "/workspaces/ui/terminals/read", ReadWorkspaceUITerminalRequest{
		WorkspaceID:           opened.Workspace.ID,
		PaneID:                "workspace_pane_1",
		RecentOutputByteLimit: 32,
	}, http.StatusOK)
	if read.WorkspaceID != opened.Workspace.ID || read.Pane.PaneID != "workspace_pane_1" {
		t.Fatalf("terminal read envelope = %+v, want workspace terminal pane", read)
	}
	if read.Terminal.SessionID != created.Session.ID || read.Terminal.Session.PaneID != "workspace_pane_1" {
		t.Fatalf("terminal read session = %+v, want created pane session", read.Terminal)
	}
	if read.Terminal.RecentOutput.Text != "pane output\n" || len(read.Terminal.RecentOutput.Chunks) != 1 {
		t.Fatalf("terminal recent output = %+v, want emitted pane output", read.Terminal.RecentOutput)
	}
	if !strings.HasPrefix(read.Terminal.Screen.Lines[0], "pane output") || read.Terminal.Screen.Cursor.Row != 1 {
		t.Fatalf("terminal screen = %+v, want pane output on visible screen", read.Terminal.Screen)
	}
}

func workspacePaneReadModesContain(readModes []workspaceui.WorkspaceUIPaneReadMode, target workspaceui.WorkspaceUIPaneReadMode) bool {
	for _, mode := range readModes {
		if mode == target {
			return true
		}
	}
	return false
}

func workspacePaneWriteModesContain(writeModes []workspaceui.WorkspaceUIPaneWriteMode, target workspaceui.WorkspaceUIPaneWriteMode) bool {
	for _, mode := range writeModes {
		if mode == target {
			return true
		}
	}
	return false
}

func TestWorkspaceUITerminalReadEndpointRejectsNonTerminalPane(t *testing.T) {
	handler, appDataDir, _ := newWorkspaceHandlerWithTerminal(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	seedWorkspaceUILayout(t, appDataDir, workspaceUILayout(opened.Workspace.ID))

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/terminals/read", ReadWorkspaceUITerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_0",
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "unsupported_workspace_ui_terminal_pane" {
		t.Fatalf("error code = %q, want unsupported_workspace_ui_terminal_pane", errResponse.Error.Code)
	}
}

func TestWorkspaceUITerminalWriteEndpointsPrepareAndCommit(t *testing.T) {
	handler, appDataDir, starter := newWorkspaceHandlerWithTerminal(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{ProfileID: terminal.DefaultProfileID}
	seedWorkspaceUILayout(t, appDataDir, layout)
	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	data := []byte("printf ok\r\n")
	digest := terminalWriteHTTPTestSHA256(data)

	prepared := postJSON[PrepareWorkspaceUITerminalWriteResponse](t, handler, "/workspaces/ui/terminals/writes/prepare", PrepareWorkspaceUITerminalWriteRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		DataBase64:  base64.StdEncoding.EncodeToString(data),
		ByteCount:   len(data),
		SHA256:      digest,
	}, http.StatusOK)
	if prepared.WorkspaceID != opened.Workspace.ID || prepared.Pane.PaneID != "workspace_pane_1" {
		t.Fatalf("prepared envelope = %+v, want terminal pane", prepared)
	}
	if !workspacePaneWriteModesContain(prepared.Pane.WriteModes, workspaceui.WorkspaceUIPaneWriteModeTerminalInput) {
		t.Fatalf("prepared pane write modes = %+v, want terminal_input", prepared.Pane.WriteModes)
	}
	if prepared.PreparedWrite.WorkspaceID != opened.Workspace.ID ||
		prepared.PreparedWrite.PaneID != "workspace_pane_1" ||
		prepared.PreparedWrite.SessionID != created.Session.ID ||
		prepared.PreparedWrite.ByteCount != len(data) ||
		prepared.PreparedWrite.SHA256 != digest ||
		prepared.PreparedWrite.Preview != `printf ok\r\n` {
		t.Fatalf("prepared write = %+v, want bound immutable bytes for session %s", prepared.PreparedWrite, created.Session.ID)
	}
	if prepared.PreparedWrite.DeviceSessionID == "" || prepared.PreparedWrite.PreparedWriteID == "" {
		t.Fatalf("prepared write ids = %+v, want device session and prepared id", prepared.PreparedWrite)
	}

	committed := postJSON[CommitWorkspaceUITerminalWriteResponse](t, handler, "/workspaces/ui/terminals/writes/commit", CommitWorkspaceUITerminalWriteRequest{
		WorkspaceID:     opened.Workspace.ID,
		PreparedWriteID: prepared.PreparedWrite.PreparedWriteID,
		SHA256:          digest,
	}, http.StatusOK)
	if committed.PreparedWrite.PreparedWriteID != prepared.PreparedWrite.PreparedWriteID ||
		committed.PreparedWrite.WorkspaceID != opened.Workspace.ID ||
		committed.PreparedWrite.PaneID != "workspace_pane_1" ||
		committed.PreparedWrite.SessionID != created.Session.ID ||
		committed.PreparedWrite.WrittenByteCount != len(data) {
		t.Fatalf("committed write = %+v, want written bytes for prepared write", committed.PreparedWrite)
	}
	if written := starter.handleAt(t, 0).writtenString(); written != string(data) {
		t.Fatalf("terminal written bytes = %q, want %q", written, string(data))
	}
}

func TestWorkspaceUITerminalWriteCommitRejectsDeviceMismatchBeforeWrite(t *testing.T) {
	handler, appDataDir, starter := newWorkspaceHandlerWithTerminal(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{ProfileID: terminal.DefaultProfileID}
	seedWorkspaceUILayout(t, appDataDir, layout)
	postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	data := []byte("echo mismatch\n")
	digest := terminalWriteHTTPTestSHA256(data)
	prepared := postJSON[PrepareWorkspaceUITerminalWriteResponse](t, handler, "/workspaces/ui/terminals/writes/prepare", PrepareWorkspaceUITerminalWriteRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		DataBase64:  base64.StdEncoding.EncodeToString(data),
		ByteCount:   len(data),
		SHA256:      digest,
	}, http.StatusOK)

	authHandler, ok := handler.(authenticatedTestHandler)
	if !ok {
		t.Fatalf("handler type = %T, want authenticatedTestHandler", handler)
	}
	_, otherToken, err := authHandler.store.CreateDeviceSession(context.Background(), "Other test device")
	if err != nil {
		t.Fatalf("create second device session: %v", err)
	}
	errResponse := postJSONWithToken[ErrorResponse](t, handler, "/workspaces/ui/terminals/writes/commit", CommitWorkspaceUITerminalWriteRequest{
		WorkspaceID:     opened.Workspace.ID,
		PreparedWriteID: prepared.PreparedWrite.PreparedWriteID,
		SHA256:          digest,
	}, otherToken, http.StatusBadRequest)
	if errResponse.Error.Code != "commit_workspace_ui_terminal_write_failed" {
		t.Fatalf("error code = %q, want commit_workspace_ui_terminal_write_failed", errResponse.Error.Code)
	}
	if written := starter.handleAt(t, 0).writtenString(); written != "" {
		t.Fatalf("terminal written bytes = %q, want no write", written)
	}
}

func TestWorkspaceUITerminalWriteCommitRejectsWorkspaceMismatchBeforeWrite(t *testing.T) {
	handler, appDataDir, starter := newWorkspaceHandlerWithTerminal(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{ProfileID: terminal.DefaultProfileID}
	seedWorkspaceUILayout(t, appDataDir, layout)
	postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	data := []byte("echo wrong workspace\n")
	digest := terminalWriteHTTPTestSHA256(data)
	prepared := postJSON[PrepareWorkspaceUITerminalWriteResponse](t, handler, "/workspaces/ui/terminals/writes/prepare", PrepareWorkspaceUITerminalWriteRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		DataBase64:  base64.StdEncoding.EncodeToString(data),
		ByteCount:   len(data),
		SHA256:      digest,
	}, http.StatusOK)

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/terminals/writes/commit", CommitWorkspaceUITerminalWriteRequest{
		WorkspaceID:     "workspace_other",
		PreparedWriteID: prepared.PreparedWrite.PreparedWriteID,
		SHA256:          digest,
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "commit_workspace_ui_terminal_write_failed" {
		t.Fatalf("error code = %q, want commit_workspace_ui_terminal_write_failed", errResponse.Error.Code)
	}
	if written := starter.handleAt(t, 0).writtenString(); written != "" {
		t.Fatalf("terminal written bytes = %q, want no write", written)
	}
}

func TestWorkspaceUITerminalWriteCommitRejectsRemovedPaneBeforeWrite(t *testing.T) {
	handler, appDataDir, starter := newWorkspaceHandlerWithTerminal(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	layout := workspaceUILayout(opened.Workspace.ID)
	layout.Panes[1].TerminalConfig = &workspaceui.TerminalPaneConfig{ProfileID: terminal.DefaultProfileID}
	seedWorkspaceUILayout(t, appDataDir, layout)
	postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	data := []byte("echo removed pane\n")
	digest := terminalWriteHTTPTestSHA256(data)
	prepared := postJSON[PrepareWorkspaceUITerminalWriteResponse](t, handler, "/workspaces/ui/terminals/writes/prepare", PrepareWorkspaceUITerminalWriteRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_1",
		DataBase64:  base64.StdEncoding.EncodeToString(data),
		ByteCount:   len(data),
		SHA256:      digest,
	}, http.StatusOK)

	postJSON[workspaceui.WorkspaceUIPaneOperationResult](t, handler, "/workspaces/ui/panes/operation", ApplyWorkspaceUIPaneOperationRequest{
		WorkspaceID: opened.Workspace.ID,
		Operation: workspaceui.WorkspaceUIPaneOperation{
			Kind:   workspaceui.WorkspaceUIPaneOperationKindClosePane,
			PaneID: "workspace_pane_1",
			Close: &workspaceui.WorkspaceUIPaneCloseOperation{
				SurfaceClose: workspaceui.WorkspaceUISurfaceCloseModeNone,
			},
		},
	}, http.StatusOK)

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/terminals/writes/commit", CommitWorkspaceUITerminalWriteRequest{
		WorkspaceID:     opened.Workspace.ID,
		PreparedWriteID: prepared.PreparedWrite.PreparedWriteID,
		SHA256:          digest,
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "commit_workspace_ui_terminal_write_failed" {
		t.Fatalf("error code = %q, want commit_workspace_ui_terminal_write_failed", errResponse.Error.Code)
	}
	if written := starter.handleAt(t, 0).writtenString(); written != "" {
		t.Fatalf("terminal written bytes = %q, want no write", written)
	}
}

func terminalWriteHTTPTestSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func TestWorkspaceUIPaneReadRejectsMissingPane(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	seedWorkspaceUILayout(t, appDataDir, workspaceUILayout(opened.Workspace.ID))

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/panes/read", ReadWorkspaceUIPaneRequest{
		WorkspaceID: opened.Workspace.ID,
		PaneID:      "workspace_pane_missing",
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "read_workspace_ui_pane_failed" {
		t.Fatalf("error code = %q, want read_workspace_ui_pane_failed", errResponse.Error.Code)
	}
}

func TestWorkspaceUIPaneOperationEndpointPersistsLayoutOperation(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	seedWorkspaceUILayout(t, appDataDir, workspaceUILayout(opened.Workspace.ID))

	result := postJSON[workspaceui.WorkspaceUIPaneOperationResult](t, handler, "/workspaces/ui/panes/operation", ApplyWorkspaceUIPaneOperationRequest{
		WorkspaceID: opened.Workspace.ID,
		Operation: workspaceui.WorkspaceUIPaneOperation{
			Kind:   workspaceui.WorkspaceUIPaneOperationKindFocusPane,
			PaneID: "workspace_pane_0",
		},
	}, http.StatusOK)
	if result.WorkspaceID != opened.Workspace.ID || result.Revision != 2 || !result.Changed {
		t.Fatalf("operation result = %+v, want changed revision 2 for workspace", result)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want workspace_pane_0", result.Layout.FocusedPaneID)
	}

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil || read.Layout.Revision != 2 || read.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("read layout after operation = %+v, want persisted focused pane at revision 2", read.Layout)
	}

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/panes/operation", ApplyWorkspaceUIPaneOperationRequest{
		WorkspaceID: opened.Workspace.ID,
		Operation: workspaceui.WorkspaceUIPaneOperation{
			Kind:   workspaceui.WorkspaceUIPaneOperationKindFocusPane,
			PaneID: "workspace_pane_missing",
		},
	}, http.StatusBadRequest)
	if errResponse.Error.Code != string(workspaceui.WorkspaceUIOperationErrorCodePaneNotFound) {
		t.Fatalf("error code = %q, want pane_not_found", errResponse.Error.Code)
	}
}

func TestWorkspaceUILayoutApplyEndpointPersistsTransaction(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	seedWorkspaceUILayout(t, appDataDir, workspaceUILayout(opened.Workspace.ID))
	heightPX := 260
	widthSpec := workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}

	result := postJSON[workspaceui.WorkspaceUILayoutOperationResult](t, handler, "/workspaces/ui/layout/apply", ApplyWorkspaceUILayoutOperationsRequest{
		WorkspaceID: opened.Workspace.ID,
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
					HeightPX: &heightPX,
				},
			},
		},
	}, http.StatusOK)
	if result.WorkspaceID != opened.Workspace.ID || result.Revision != 2 || !result.Changed || len(result.OperationResults) != 2 {
		t.Fatalf("layout apply result = %+v, want changed revision 2 with two outcomes", result)
	}
	if result.Layout.Columns[1].WidthSpec != widthSpec {
		t.Fatalf("layout column width = %+v, want %+v", result.Layout.Columns[1].WidthSpec, widthSpec)
	}
	if result.Layout.Panes[0].HeightPX == nil || *result.Layout.Panes[0].HeightPX != heightPX ||
		result.Layout.Panes[1].HeightPX == nil || *result.Layout.Panes[1].HeightPX != heightPX {
		t.Fatalf("layout pane heights = %+v, want transaction height %d", result.Layout.Panes, heightPX)
	}

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil || read.Layout.Revision != 2 || read.Layout.Columns[1].WidthSpec != widthSpec {
		t.Fatalf("read layout after apply = %+v, want persisted transaction", read.Layout)
	}
}

func TestWorkspaceUILayoutApplyEndpointRollsBackFailedTransaction(t *testing.T) {
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, []string{"workspace_api"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	seedWorkspaceUILayout(t, appDataDir, workspaceUILayout(opened.Workspace.ID))
	widthSpec := workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 700}

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/ui/layout/apply", ApplyWorkspaceUILayoutOperationsRequest{
		WorkspaceID: opened.Workspace.ID,
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
					Split: &workspaceui.WorkspaceUIPaneSplitResizeOperation{
						LowerPaneID: "workspace_pane_missing",
						UpperWeight: 1.2,
						LowerWeight: 0.8,
					},
				},
			},
		},
	}, http.StatusBadRequest)
	if errResponse.Error.Code != string(workspaceui.WorkspaceUIOperationErrorCodePaneNotFound) {
		t.Fatalf("error code = %q, want pane_not_found", errResponse.Error.Code)
	}

	read := postJSON[workspaceui.WorkspaceUILayoutReadResult](t, handler, "/workspaces/ui/layout/read", ReadWorkspaceUILayoutRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if read.Layout == nil || read.Layout.Revision != 1 || read.Layout.Columns[1].WidthSpec.Value != 520 {
		t.Fatalf("read layout after failed apply = %+v, want original layout", read.Layout)
	}
}

func TestWorkspaceSessionEndpointReturnsCurrentSession(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/workspace-session", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var session workspacesession.WorkspaceSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if len(session.ActiveWorkspaces) != 0 || len(session.RecentWorkspaces) != 0 || session.SelectedWorkspaceID != "" {
		t.Fatalf("session = %+v, want empty session", session)
	}
}

func TestWorkspaceEndpointReturnsStructuredError(t *testing.T) {
	handler := newWorkspaceHandler(t, []string{"workspace_unused"}, []time.Time{mustTime(t, "2026-05-29T20:00:00Z")})

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: "relative"}, http.StatusBadRequest)
	if errResponse.Error.Code != "open_workspace_failed" {
		t.Fatalf("error code = %q, want open_workspace_failed", errResponse.Error.Code)
	}
	if errResponse.Error.Message == "" {
		t.Fatal("error message is empty")
	}
}

func TestWorkspaceEndpointMapsMalformedMetadataToCorruptState(t *testing.T) {
	times := []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
		mustTime(t, "2026-05-29T20:05:00Z"),
	}
	handler, appDataDir := newWorkspaceHandlerWithAppDataDir(t, nil, times)
	rootPath := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: rootPath}, http.StatusOK)
	metadataPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "workspace.json")
	if err := os.WriteFile(metadataPath, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed workspace metadata: %v", err)
	}

	errResponse := postJSON[ErrorResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: rootPath}, http.StatusInternalServerError)
	if errResponse.Error.Code != "corrupt_workspace_state" {
		t.Fatalf("error code = %q, want corrupt_workspace_state", errResponse.Error.Code)
	}
}

func TestWorkspaceEndpointRejectsMalformedJSON(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/workspaces/select", bytes.NewBufferString("{"))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&errResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResponse.Error.Code != "invalid_json" {
		t.Fatalf("error code = %q, want invalid_json", errResponse.Error.Code)
	}
}

func TestWorkspaceEndpointRejectsTrailingJSON(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	errResponse := postRaw[ErrorResponse](t, handler, "/workspaces/select", `{"id":"workspace_api"}{"junk":true}`, http.StatusBadRequest)

	if errResponse.Error.Code != "invalid_json" {
		t.Fatalf("error code = %q, want invalid_json", errResponse.Error.Code)
	}
	if errResponse.Error.Message != "request body must contain exactly one JSON value" {
		t.Fatalf("error message = %q", errResponse.Error.Message)
	}
}

func TestWorkspaceEndpointRejectsUnknownJSONFields(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	errResponse := postRaw[ErrorResponse](t, handler, "/workspaces/select", `{"id":"workspace_api","extra":true}`, http.StatusBadRequest)

	if errResponse.Error.Code != "invalid_json" {
		t.Fatalf("error code = %q, want invalid_json", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, `unknown field "extra"`) {
		t.Fatalf("error message = %q, want unknown field", errResponse.Error.Message)
	}
}

func newWorkspaceHandler(t *testing.T, _ []string, times []time.Time) http.Handler {
	t.Helper()

	handler, _ := newWorkspaceHandlerWithAppDataDir(t, nil, times)
	return handler
}

func newWorkspaceHandlerWithAppDataDir(t *testing.T, _ []string, times []time.Time) (http.Handler, string) {
	t.Helper()

	store, err := appstate.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	timeIndex := 0
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			value := times[timeIndex]
			timeIndex++
			return value
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	service, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	uiStore, err := workspaceui.NewStore(filepath.Dir(store.Path()))
	if err != nil {
		t.Fatalf("new workspace UI store: %v", err)
	}
	uiService, err := workspaceui.NewService(uiStore, service)
	if err != nil {
		t.Fatalf("new workspace UI service: %v", err)
	}
	return newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceService:   service,
		WorkspaceUIService: uiService,
	}), filepath.Dir(store.Path())
}

func newWorkspaceHandlerWithTerminal(t *testing.T) (http.Handler, string, *httpRecordingPTYStarter) {
	t.Helper()

	appDataDir := t.TempDir()
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	now := time.Date(2026, 5, 29, 20, 0, 0, 0, time.UTC)
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			value := now
			now = now.Add(time.Minute)
			return value
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	workspaceService, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	uiStore, err := workspaceui.NewStore(filepath.Dir(store.Path()))
	if err != nil {
		t.Fatalf("new workspace UI store: %v", err)
	}
	uiService, err := workspaceui.NewService(uiStore, workspaceService)
	if err != nil {
		t.Fatalf("new workspace UI service: %v", err)
	}
	starter := &httpRecordingPTYStarter{root: appDataDir}
	terminalService, err := terminal.NewManager(terminal.ManagerConfig{
		AppDataDir:        filepath.Dir(store.Path()),
		WorkspaceResolver: workspaceService,
		PTY:               starter,
	})
	if err != nil {
		t.Fatalf("new terminal manager: %v", err)
	}
	t.Cleanup(func() {
		if err := terminalService.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown terminal service: %v", err)
		}
	})
	return newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		TerminalService:    terminalService,
		WorkspaceService:   workspaceService,
		WorkspaceUIService: uiService,
	}), filepath.Dir(store.Path()), starter
}

func seedWorkspaceUILayout(t *testing.T, appDataDir string, layout workspaceui.WorkspaceUILayout) {
	t.Helper()

	store, err := workspaceui.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new workspace UI store: %v", err)
	}
	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("seed workspace UI layout: %v", err)
	}
}

func postJSON[T any](t *testing.T, handler http.Handler, path string, payload any, wantStatus int) T {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request payload: %v", err)
	}
	return postRaw[T](t, handler, path, string(body), wantStatus)
}

func postRaw[T any](t *testing.T, handler http.Handler, path string, body string, wantStatus int) T {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", path, response.Code, wantStatus, response.Body.String())
	}
	var decoded T
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode response %s: %v", path, err)
	}
	return decoded
}

func assertIDs(t *testing.T, label string, summaries []workspace.WorkspaceSummary, want []string) {
	t.Helper()

	if len(summaries) != len(want) {
		t.Fatalf("%s ids length = %d, want %d: %+v", label, len(summaries), len(want), summaries)
	}
	for index, summary := range summaries {
		if summary.ID != want[index] {
			t.Fatalf("%s id[%d] = %q, want %q", label, index, summary.ID, want[index])
		}
	}
}

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}

func workspaceUILayout(workspaceID string) workspaceui.WorkspaceUILayout {
	return workspaceui.WorkspaceUILayout{
		SchemaVersion: workspaceui.SchemaVersion,
		Revision:      1,
		WorkspaceID:   workspaceID,
		FocusedPaneID: "workspace_pane_1",
		Columns: []workspaceui.WorkspaceUIColumn{
			{
				ColumnID:                "workspace_column_0",
				IdealWidthSpec:          workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
				Index:                   0,
				PaneIDs:                 []string{"workspace_pane_0"},
				PlaneIndex:              0,
				PreviousProportionWidth: nil,
				SlotIndex:               0,
				WidthSpec:               workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
			},
			{
				ColumnID:                "workspace_column_1",
				IdealWidthSpec:          workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
				Index:                   1,
				PaneIDs:                 []string{"workspace_pane_1"},
				PlaneIndex:              0,
				PreviousProportionWidth: nil,
				SlotIndex:               1,
				WidthSpec:               workspaceui.ColumnWidthSpec{Unit: workspaceui.ColumnWidthUnitPX, Value: 520},
			},
		},
		Panes: []workspaceui.WorkspaceUIPane{
			{
				ColumnID:    "workspace_column_0",
				Heat:        0,
				PaneID:      "workspace_pane_0",
				Sequence:    0,
				Subtitle:    "workspace chat",
				SurfaceID:   "workspace_surface_0",
				SurfaceKind: workspaceui.SurfaceKindChatDOM,
				Title:       "Chat",
				Tone:        workspaceui.PaneToneCyan,
				Weight:      1.6,
			},
			{
				ColumnID:    "workspace_column_1",
				Heat:        37,
				PaneID:      "workspace_pane_1",
				Sequence:    1,
				Subtitle:    "terminal",
				SurfaceID:   "workspace_surface_1",
				SurfaceKind: workspaceui.SurfaceKindTerminal,
				Title:       "Terminal",
				Tone:        workspaceui.PaneToneGreen,
				Weight:      1,
			},
		},
	}
}
