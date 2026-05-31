package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
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

func TestWorkspaceSessionEndpointReturnsCurrentSession(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/workspace-session", nil)
	authorizeTestRequest(request)
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
	authorizeTestRequest(request)
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
	return NewHandler(HandlerConfig{
		AuthToken:        testAuthToken,
		Metadata:         BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceService: service,
	}), filepath.Dir(store.Path())
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
	authorizeTestRequest(request)
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
