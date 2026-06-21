package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"setta/internal/terminal"
	"setta/internal/workspace"
)

func TestTerminalEndpointsCreateInputResizeAndClose(t *testing.T) {
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

	input := postJSON[TerminalInputResponse](t, handler, "/terminals/input", TerminalInputRequest{
		SessionID:  created.Session.ID,
		DataBase64: base64.StdEncoding.EncodeToString([]byte("echo ok\n")),
	}, http.StatusOK)
	if input.AcceptedBytes != len("echo ok\n") {
		t.Fatalf("accepted input bytes = %d, want %d", input.AcceptedBytes, len("echo ok\n"))
	}
	if written := starter.handleAt(t, 0).writtenString(); written != "echo ok\n" {
		t.Fatalf("terminal input = %q, want echo ok", written)
	}

	resized := postJSON[TerminalSessionResponse](t, handler, "/terminals/resize", ResizeTerminalRequest{
		SessionID: created.Session.ID,
		Cols:      100,
		Rows:      30,
	}, http.StatusOK)
	if resized.Session.Cols != 100 || resized.Session.Rows != 30 {
		t.Fatalf("resized session dims = %dx%d, want 100x30", resized.Session.Cols, resized.Session.Rows)
	}

	closed := postJSON[TerminalSessionResponse](t, handler, "/terminals/close", CloseTerminalRequest{
		SessionID: created.Session.ID,
		Mode:      terminal.CloseModeTerminate,
	}, http.StatusOK)
	if closed.Session.Status != terminal.SessionStatusClosed || closed.Session.Message != string(terminal.CloseModeTerminate) {
		t.Fatalf("closed session = %+v, want closed terminate", closed.Session)
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

func TestTerminalEndpointRejectsInvalidInputEncoding(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)

	invalid := postJSON[ErrorResponse](t, handler, "/terminals/input", TerminalInputRequest{
		SessionID:  created.Session.ID,
		DataBase64: "@@@",
	}, http.StatusBadRequest)
	if invalid.Error.Code != "invalid_terminal_input" {
		t.Fatalf("invalid input error code = %q, want invalid_terminal_input", invalid.Error.Code)
	}

	tooLarge := postJSON[ErrorResponse](t, handler, "/terminals/input", TerminalInputRequest{
		SessionID:  created.Session.ID,
		DataBase64: strings.Repeat("A", base64.StdEncoding.EncodedLen(terminal.MaxInputBytes+1)),
	}, http.StatusBadRequest)
	if tooLarge.Error.Code != "terminal_input_too_large" {
		t.Fatalf("oversized input error code = %q, want terminal_input_too_large", tooLarge.Error.Code)
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

func TestTerminalEventStreamPushesTerminalEvents(t *testing.T) {
	handler, starter := newTerminalHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	response, err := http.Get(server.URL + "/terminals/events")
	if err != nil {
		t.Fatalf("open terminal event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("terminal event stream status = %d, want 200", response.StatusCode)
	}
	reader := bufio.NewReader(response.Body)

	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	started := readServerSentTerminalEvent(t, reader)
	if started.Type != terminal.TerminalEventStarted || started.SessionID != created.Session.ID {
		t.Fatalf("started event = %+v, want terminal.started for %s", started, created.Session.ID)
	}

	starter.handleAt(t, 0).emit([]byte("ready\n"))
	output := readServerSentTerminalEvent(t, reader)
	if output.Type != terminal.TerminalEventOutput || output.Payload.DataBase64 != "cmVhZHkK" {
		t.Fatalf("output event = %+v, want base64 ready output", output)
	}
}

func TestTerminalEventStreamReplaysFromCursor(t *testing.T) {
	handler, starter := newTerminalHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	firstResponse, err := http.Get(server.URL + "/terminals/events")
	if err != nil {
		t.Fatalf("open terminal event stream: %v", err)
	}
	firstReader := bufio.NewReader(firstResponse.Body)

	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_shell",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	started := readServerSentTerminalEvent(t, firstReader)
	if started.Type != terminal.TerminalEventStarted || started.SessionID != created.Session.ID {
		t.Fatalf("started event = %+v, want terminal.started for %s", started, created.Session.ID)
	}
	starter.handleAt(t, 0).emit([]byte("replayed\n"))
	output := readServerSentTerminalEvent(t, firstReader)
	if output.Type != terminal.TerminalEventOutput {
		t.Fatalf("output event = %+v, want terminal.output", output)
	}
	firstResponse.Body.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/terminals/events", nil)
	if err != nil {
		t.Fatalf("create replay request: %v", err)
	}
	request.Header.Set("Last-Event-ID", started.EventID)
	replayResponse, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("open replay terminal event stream: %v", err)
	}
	defer replayResponse.Body.Close()
	if replayResponse.StatusCode != http.StatusOK {
		t.Fatalf("replay terminal event stream status = %d, want 200", replayResponse.StatusCode)
	}
	replayed := readServerSentTerminalEvent(t, bufio.NewReader(replayResponse.Body))
	if replayed.EventID != output.EventID || replayed.Payload.DataBase64 != output.Payload.DataBase64 {
		t.Fatalf("replayed event = %+v, want original output event %+v", replayed, output)
	}
}

func TestTerminalEventStreamRejectsInvalidCursor(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	request := httptest.NewRequest(http.MethodGet, "/terminals/events?lastEventId=bad", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("cursor response status = %d, want 400", response.Code)
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&errResponse); err != nil {
		t.Fatalf("decode cursor error response: %v", err)
	}
	if errResponse.Error.Code != "invalid_terminal_event_cursor" {
		t.Fatalf("cursor error code = %q, want invalid_terminal_event_cursor", errResponse.Error.Code)
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
	return NewHandler(HandlerConfig{
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

func readServerSentTerminalEvent(t *testing.T, reader *bufio.Reader) terminal.TerminalEvent {
	t.Helper()
	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read terminal event stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event terminal.TerminalEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode terminal event stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
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

	mu     sync.Mutex
	writes bytes.Buffer
}

func newHTTPRecordingPTYHandle(profile terminal.Profile) *httpRecordingPTYHandle {
	return &httpRecordingPTYHandle{
		closed:  make(chan struct{}),
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

func (handle *httpRecordingPTYHandle) emit(data []byte) {
	handle.output <- data
}

func (handle *httpRecordingPTYHandle) writtenString() string {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writes.String()
}

func (handle *httpRecordingPTYHandle) close() {
	handle.closedOnce.Do(func() {
		close(handle.closed)
	})
}
