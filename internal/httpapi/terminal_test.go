package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"setta/internal/terminal"
	"setta/internal/workspace"
)

func TestTerminalEndpointsCreateResizeAndClose(t *testing.T) {
	handler, starter := newTerminalHandler(t, nil)
	resolvedRoot := mustResolveHTTPTestPath(t, starter.root)

	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	if created.Session.ID == "" || created.Session.Status != terminal.SessionStatusRunning {
		t.Fatalf("created terminal session = %+v, want running session with id", created.Session)
	}
	if created.Session.CWD != resolvedRoot {
		t.Fatalf("created cwd = %q, want %q", created.Session.CWD, resolvedRoot)
	}

	resized := postJSON[TerminalSessionResponse](t, handler, "/terminals/resize", ResizeTerminalRequest{
		SessionID: created.Session.ID,
		Cols:      100,
		Rows:      30,
	}, http.StatusOK)
	if resized.Session.Cols != 100 || resized.Session.Rows != 30 {
		t.Fatalf("resized session dims = %dx%d, want 100x30", resized.Session.Cols, resized.Session.Rows)
	}

	closed := postJSON[CloseTerminalResponse](t, handler, "/terminals/close", CloseTerminalRequest{
		SessionID: created.Session.ID,
		Confirmed: false,
	}, http.StatusOK)
	if closed.Kind != terminal.TerminalCloseResultClosed ||
		closed.Session == nil ||
		closed.Session.Status != terminal.SessionStatusClosed ||
		closed.Assessment.Safety != terminal.TerminalCloseSafetySafe {
		t.Fatalf("closed session = %+v, want safe closed result", closed)
	}
}

func TestTerminalCloseEndpointRequiresBackendConfirmationForDestructiveClose(t *testing.T) {
	handler, starter := newTerminalHandler(t, nil)
	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	handle := starter.handleAt(t, 0)
	handle.closeAssessment = terminal.TerminalCloseAssessment{
		Safety:  terminal.TerminalCloseSafetyDestructive,
		Reason:  terminal.TerminalCloseAssessmentForegroundProcess,
		Summary: "Closing this terminal may terminate a foreground process.",
	}

	unconfirmed := postJSON[CloseTerminalResponse](t, handler, "/terminals/close", CloseTerminalRequest{
		SessionID: created.Session.ID,
		Confirmed: false,
	}, http.StatusOK)
	if unconfirmed.Kind != terminal.TerminalCloseResultConfirmationRequired ||
		unconfirmed.Session == nil ||
		!unconfirmed.Assessment.RequiresConfirmation {
		t.Fatalf("unconfirmed close = %+v, want confirmation required", unconfirmed)
	}
	if handle.wasTerminated() {
		t.Fatal("unconfirmed destructive close terminated the process")
	}

	confirmed := postJSON[CloseTerminalResponse](t, handler, "/terminals/close", CloseTerminalRequest{
		SessionID: created.Session.ID,
		Confirmed: true,
	}, http.StatusOK)
	if confirmed.Kind != terminal.TerminalCloseResultClosed ||
		confirmed.Session == nil ||
		confirmed.Session.Status != terminal.SessionStatusClosed {
		t.Fatalf("confirmed close = %+v, want closed", confirmed)
	}
	if !handle.wasTerminated() {
		t.Fatal("confirmed destructive close did not terminate the process")
	}
}

func TestTerminalProfileEndpointsManageProfiles(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	cwd := t.TempDir()
	executable := httpTestExecutablePath(t)

	initial := getJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles", http.StatusOK)
	if initial.DefaultProfileID != terminal.DefaultProfileID || len(initial.Profiles) != 1 {
		t.Fatalf("initial profiles = %+v, want one default profile", initial)
	}

	created := postJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles/create", CreateTerminalProfileRequest{
		Profile: terminal.TerminalProfileInput{
			Name:       "HTTP profile",
			LaunchMode: terminal.ProfileLaunchModeCustomCommand,
			ShellPath:  executable,
			Args:       []string{"--http-profile"},
			CWDMode:    terminal.ProfileCWDModeCustom,
			CWD:        cwd,
			Env:        map[string]string{"SETTA_HTTP_PROFILE": "1"},
			FontFamily: "Fira Code",
			FontSize:   16,
			ThemeID:    terminal.ThemeSettaLight,
			Scrollback: 1400,
		},
	}, http.StatusOK)
	profileID := created.Profiles[1].ID

	selected := postJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles/default", SelectDefaultTerminalProfileRequest{
		ID: profileID,
	}, http.StatusOK)
	if selected.DefaultProfileID != profileID {
		t.Fatalf("selected default profile = %s, want %s", selected.DefaultProfileID, profileID)
	}

	updated := postJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles/update", UpdateTerminalProfileRequest{
		ID: profileID,
		Profile: terminal.TerminalProfileInput{
			Name:       "HTTP shell",
			LaunchMode: terminal.ProfileLaunchModeShell,
			ShellPath:  executable,
			Args:       []string{"--http-shell"},
			CWDMode:    terminal.ProfileCWDModeHome,
			CWD:        "",
			Env:        map[string]string{"SETTA_HTTP_PROFILE": "updated"},
			FontFamily: "JetBrains Mono",
			FontSize:   14,
			ThemeID:    terminal.ThemeHighContrastDark,
			Scrollback: 1800,
		},
	}, http.StatusOK)
	if updated.Profiles[1].Name != "HTTP shell" || !updated.Profiles[1].SafeAutoStart {
		t.Fatalf("updated profile = %+v, want shell profile", updated.Profiles[1])
	}

	postJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles/default", SelectDefaultTerminalProfileRequest{
		ID: terminal.DefaultProfileID,
	}, http.StatusOK)
	deleted := postJSON[terminal.TerminalProfileList](t, handler, "/terminals/profiles/delete", DeleteTerminalProfileRequest{
		ID: profileID,
	}, http.StatusOK)
	if len(deleted.Profiles) != 1 || deleted.Profiles[0].ID != terminal.DefaultProfileID {
		t.Fatalf("profiles after delete = %+v, want only default", deleted.Profiles)
	}
}

func TestTerminalEndpointMapsUnsupportedPTYToNotImplemented(t *testing.T) {
	handler, _ := newTerminalHandler(t, terminal.UnsupportedPlatformError{Platform: "test-os"})

	errResponse := postJSON[ErrorResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusNotImplemented)
	if errResponse.Error.Code != "terminal_unsupported" {
		t.Fatalf("unsupported error code = %q, want terminal_unsupported", errResponse.Error.Code)
	}
}

func TestTerminalStreamTicketAndUpgradeRequireValidCredentials(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	ticket := postJSON[CreateTerminalStreamTicketResponse](t, handler, "/terminals/stream/ticket", CreateTerminalStreamTicketRequest{
		ClientStreamID: "terminal_stream_test",
	}, http.StatusOK)
	if ticket.Ticket == "" || ticket.ClientStreamID != "terminal_stream_test" || ticket.ExpiresInSeconds != terminal.TerminalStreamTicketTTLSeconds {
		t.Fatalf("terminal stream ticket = %+v", ticket)
	}

	request := httptest.NewRequest(http.MethodGet, "/terminals/stream", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("stream status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
	var streamError ErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &streamError); err != nil {
		t.Fatalf("decode stream error: %v", err)
	}
	if streamError.Error.Code != "invalid_terminal_stream_ticket" {
		t.Fatalf("stream error code = %q, want invalid_terminal_stream_ticket", streamError.Error.Code)
	}
}

func newTerminalHandler(t *testing.T, startErr error) (http.Handler, *httpRecordingPTYStarter) {
	t.Helper()
	root := t.TempDir()
	starter := &httpRecordingPTYStarter{
		root: root,
		err:  startErr,
	}
	manager, err := terminal.NewManager(terminal.ManagerConfig{
		AppDataDir:        t.TempDir(),
		WorkspaceResolver: httpTerminalWorkspaceResolver{root: root},
		PTY:               starter,
	})
	if err != nil {
		t.Fatalf("new terminal manager: %v", err)
	}
	t.Cleanup(func() {
		_ = manager.Shutdown(context.Background())
	})
	return newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		TerminalService: manager,
	}), starter
}

func httpTestExecutablePath(t *testing.T) string {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("read test executable path: %v", err)
	}
	return executable
}

func mustResolveHTTPTestPath(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(filepath.Clean(path))
	if err != nil {
		t.Fatalf("resolve path %s: %v", path, err)
	}
	return filepath.Clean(resolved)
}

type httpTerminalWorkspaceResolver struct {
	root string
}

func (resolver httpTerminalWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != "workspace_terminal" {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found: " + id)
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: resolver.root}, nil
}

type httpRecordingPTYStarter struct {
	root string

	mu      sync.Mutex
	handles []*httpRecordingPTYHandle
	err     error
}

func (starter *httpRecordingPTYStarter) Start(_ context.Context, profile terminal.Profile) (terminal.PTYHandle, error) {
	if starter.err != nil {
		return nil, starter.err
	}
	handle := newHTTPRecordingPTYHandle(profile)
	starter.mu.Lock()
	starter.handles = append(starter.handles, handle)
	starter.mu.Unlock()
	return handle, nil
}

func (starter *httpRecordingPTYStarter) handleAt(t *testing.T, index int) *httpRecordingPTYHandle {
	t.Helper()
	starter.mu.Lock()
	defer starter.mu.Unlock()
	if index >= len(starter.handles) {
		t.Fatalf("pty handle index %d missing from %d handles", index, len(starter.handles))
	}
	return starter.handles[index]
}

type httpRecordingPTYHandle struct {
	closed     chan struct{}
	closedOnce sync.Once
	output     chan []byte
	profile    terminal.Profile

	mu              sync.Mutex
	closeAssessment terminal.TerminalCloseAssessment
	terminated      bool
	writes          bytes.Buffer
}

func newHTTPRecordingPTYHandle(profile terminal.Profile) *httpRecordingPTYHandle {
	return &httpRecordingPTYHandle{
		closed: make(chan struct{}),
		closeAssessment: terminal.TerminalCloseAssessment{
			Safety:               terminal.TerminalCloseSafetySafe,
			Reason:               terminal.TerminalCloseAssessmentIdleShell,
			RequiresConfirmation: false,
			Summary:              "Terminal shell is idle.",
		},
		output:  make(chan []byte, 16),
		profile: profile,
	}
}

func (handle *httpRecordingPTYHandle) Read(buffer []byte) (int, error) {
	select {
	case data := <-handle.output:
		return copy(buffer, data), nil
	case <-handle.closed:
		return 0, io.EOF
	}
}

func (handle *httpRecordingPTYHandle) Write(data []byte) (int, error) {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writes.Write(data)
}

func (handle *httpRecordingPTYHandle) Resize(_ int, _ int) error {
	return nil
}

func (handle *httpRecordingPTYHandle) Terminate() error {
	handle.mu.Lock()
	handle.terminated = true
	handle.mu.Unlock()
	handle.close()
	return nil
}

func (handle *httpRecordingPTYHandle) Kill() error {
	handle.close()
	return nil
}

func (handle *httpRecordingPTYHandle) Close() error {
	handle.close()
	return nil
}

func (handle *httpRecordingPTYHandle) Wait() error {
	<-handle.closed
	return nil
}

func (handle *httpRecordingPTYHandle) CloseSafetyAssessment() terminal.TerminalCloseAssessment {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.closeAssessment
}

func (handle *httpRecordingPTYHandle) writtenString() string {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writes.String()
}

func (handle *httpRecordingPTYHandle) wasTerminated() bool {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.terminated
}

func (handle *httpRecordingPTYHandle) close() {
	handle.closedOnce.Do(func() {
		close(handle.closed)
	})
}
