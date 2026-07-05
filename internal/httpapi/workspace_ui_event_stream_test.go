package httpapi

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/workspaceui"
)

func TestWorkspaceUIEventStreamReplaysSavedLayoutForWorkspace(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
		mustTime(t, "2026-05-29T20:05:00Z"),
	})
	other := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	postJSON[workspaceui.WorkspaceUILayout](t, handler, "/workspaces/ui/layout/save", SaveWorkspaceUILayoutRequest{
		Layout: workspaceUILayout(other.Workspace.ID),
	}, http.StatusOK)
	postJSON[workspaceui.WorkspaceUILayout](t, handler, "/workspaces/ui/layout/save", SaveWorkspaceUILayoutRequest{
		Layout: workspaceUILayout(opened.Workspace.ID),
	}, http.StatusOK)

	server := httptest.NewServer(handler)
	defer server.Close()

	response := openWorkspaceUIEventStream(t, server, opened.Workspace.ID, "")
	first := readServerSentWorkspaceUIEvent(t, bufio.NewReader(response.Body))
	response.Body.Close()
	if first.Type != workspaceui.WorkspaceUIEventTypeLayoutUpdated ||
		first.WorkspaceID != opened.Workspace.ID ||
		first.Layout == nil ||
		first.Layout.WorkspaceID != opened.Workspace.ID ||
		first.Revision != 1 {
		t.Fatalf("first workspace UI event = %+v, want workspace-specific layout update", first)
	}
	if first.StreamID == "" || first.Sequence == 0 || first.EventID == "" || first.SchemaVersion != workspaceui.EventSchemaVersion {
		t.Fatalf("first workspace UI event envelope = %+v, want stream metadata", first)
	}

	updated := workspaceUILayout(opened.Workspace.ID)
	updated.Revision = 2
	updated.FocusedPaneID = "workspace_pane_0"
	postJSON[workspaceui.WorkspaceUILayout](t, handler, "/workspaces/ui/layout/save", SaveWorkspaceUILayoutRequest{
		Layout: updated,
	}, http.StatusOK)

	replayResponse := openWorkspaceUIEventStream(t, server, opened.Workspace.ID, first.EventID)
	defer replayResponse.Body.Close()
	replayed := readServerSentWorkspaceUIEvent(t, bufio.NewReader(replayResponse.Body))
	if replayed.Type != workspaceui.WorkspaceUIEventTypeLayoutUpdated ||
		replayed.WorkspaceID != opened.Workspace.ID ||
		replayed.Revision != 2 ||
		replayed.Layout == nil ||
		replayed.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("replayed workspace UI event = %+v, want revision 2 layout update", replayed)
	}
}

func TestWorkspaceUIEventStreamRejectsInvalidCursor(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/workspaces/ui/events?workspaceId=workspace_api&lastEventId=bad", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&errResponse); err != nil {
		t.Fatalf("decode cursor error response: %v", err)
	}
	if errResponse.Error.Code != "invalid_workspace_ui_event_cursor" {
		t.Fatalf("error code = %q, want invalid_workspace_ui_event_cursor", errResponse.Error.Code)
	}
}

func openWorkspaceUIEventStream(t *testing.T, server *httptest.Server, workspaceID string, lastEventID string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/workspaces/ui/events?workspaceId="+workspaceID, nil)
	if err != nil {
		t.Fatalf("create workspace UI event stream request: %v", err)
	}
	if lastEventID != "" {
		request.Header.Set("Last-Event-ID", lastEventID)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("open workspace UI event stream: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		defer response.Body.Close()
		t.Fatalf("workspace UI event stream status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if response.Header.Get("Content-Type") != "text/event-stream" {
		defer response.Body.Close()
		t.Fatalf("workspace UI event stream content type = %q, want text/event-stream", response.Header.Get("Content-Type"))
	}
	return response
}

func readServerSentWorkspaceUIEvent(t *testing.T, reader *bufio.Reader) workspaceui.WorkspaceUIEvent {
	t.Helper()

	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read workspace UI event stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event workspaceui.WorkspaceUIEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode workspace UI event stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}
