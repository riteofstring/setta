package terminal

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestManagerCreateAttachWriteResizeAndClose(t *testing.T) {
	root := t.TempDir()
	resolvedRoot := mustResolvePath(t, root)
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	assertCreatedSession(t, created, resolvedRoot)

	handle := starter.handleAt(t, 0)
	assertStartedProfile(t, handle, resolvedRoot)
	assertSessionReuse(t, manager, starter, created.ID, root)
	assertAttach(t, manager, created.ID)
	assertWriteInput(t, manager, handle, created.ID)
	assertResize(t, manager, handle, created.ID)
	assertClose(t, manager, handle, created.ID)
}

func assertCreatedSession(t *testing.T, created SessionSummary, resolvedRoot string) {
	t.Helper()
	if created.WorkspaceID != "workspace_terminal" || created.PaneID != "pane_shell" {
		t.Fatalf("created session attachment = %s/%s, want workspace_terminal/pane_shell", created.WorkspaceID, created.PaneID)
	}
	if created.CWD != resolvedRoot {
		t.Fatalf("created cwd = %q, want %q", created.CWD, resolvedRoot)
	}
	if created.ProfileID != DefaultProfileID {
		t.Fatalf("created profile = %q, want %q", created.ProfileID, DefaultProfileID)
	}
	if created.Cols != 80 || created.Rows != 24 || created.Status != SessionStatusRunning {
		t.Fatalf("created dims/status = %dx%d/%s, want 80x24/running", created.Cols, created.Rows, created.Status)
	}
}

func assertStartedProfile(t *testing.T, handle *recordingPTYHandle, resolvedRoot string) {
	t.Helper()
	if handle.profile.CWD != resolvedRoot || handle.profile.Cols != 80 || handle.profile.Rows != 24 {
		t.Fatalf("pty profile = %+v, want resolved cwd and 80x24", handle.profile)
	}
}

func assertSessionReuse(t *testing.T, manager *Manager, starter *recordingPTYStarter, sessionID string, root string) {
	t.Helper()
	reused := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "custom", root, 100, 30)
	if reused.ID != sessionID {
		t.Fatalf("reused session id = %s, want %s", reused.ID, sessionID)
	}
	if starter.count() != 1 {
		t.Fatalf("pty starts = %d, want 1", starter.count())
	}
}

func assertAttach(t *testing.T, manager *Manager, sessionID string) {
	t.Helper()
	attached, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach session: %v", err)
	}
	if attached.ID != sessionID {
		t.Fatalf("attached session id = %s, want %s", attached.ID, sessionID)
	}
}

func assertWriteInput(t *testing.T, manager *Manager, handle *recordingPTYHandle, sessionID string) {
	t.Helper()
	accepted, err := manager.WriteInput(context.Background(), sessionID, []byte("printf ok\n"))
	if err != nil {
		t.Fatalf("write input: %v", err)
	}
	if accepted != len("printf ok\n") {
		t.Fatalf("accepted input bytes = %d, want %d", accepted, len("printf ok\n"))
	}
	if written := handle.writtenString(); written != "printf ok\n" {
		t.Fatalf("written input = %q, want printf ok", written)
	}
}

func assertResize(t *testing.T, manager *Manager, handle *recordingPTYHandle, sessionID string) {
	t.Helper()
	resized, err := manager.Resize(context.Background(), sessionID, 120, 40)
	if err != nil {
		t.Fatalf("resize session: %v", err)
	}
	if resized.Cols != 120 || resized.Rows != 40 {
		t.Fatalf("resized dims = %dx%d, want 120x40", resized.Cols, resized.Rows)
	}
	if cols, rows := handle.lastResize(); cols != 120 || rows != 40 {
		t.Fatalf("handle resize = %dx%d, want 120x40", cols, rows)
	}
}

func assertClose(t *testing.T, manager *Manager, handle *recordingPTYHandle, sessionID string) {
	t.Helper()
	closed, err := manager.Close(context.Background(), sessionID, CloseModeTerminate)
	if err != nil {
		t.Fatalf("close session: %v", err)
	}
	if closed.Status != SessionStatusClosed || closed.Message != string(CloseModeTerminate) {
		t.Fatalf("closed status/message = %s/%q, want closed/terminate", closed.Status, closed.Message)
	}
	if !handle.wasTerminated() {
		t.Fatal("handle was not terminated")
	}
	if _, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell"); err == nil {
		t.Fatal("attach after close succeeded, want error")
	}
}

func TestManagerPublishesLifecycleAndOutputEvents(t *testing.T) {
	root := t.TempDir()
	resolvedRoot := mustResolvePath(t, root)
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	started := readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	if started.Payload.Status != SessionStatusRunning || started.Payload.CWD != resolvedRoot {
		t.Fatalf("started payload = %+v, want running with workspace cwd", started.Payload)
	}
	if started.EventID == "" || started.StreamID == "" || started.Sequence == 0 {
		t.Fatalf("started event identifiers = %+v, want populated stream metadata", started)
	}

	handle := starter.handleAt(t, 0)
	handle.emit([]byte("ready\n"))
	output := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	if output.Payload.DataBase64 != "cmVhZHkK" || output.Payload.ByteCount != len("ready\n") {
		t.Fatalf("output payload = %+v, want base64 ready output", output.Payload)
	}

	if _, err := manager.Close(context.Background(), created.ID, CloseModeKill); err != nil {
		t.Fatalf("close session: %v", err)
	}
	closed := readTerminalEvent(t, subscription.Events, TerminalEventClosed, created.ID)
	if closed.Payload.Status != SessionStatusClosed || closed.Payload.Message != string(CloseModeKill) {
		t.Fatalf("closed payload = %+v, want closed/kill", closed.Payload)
	}
}

func TestManagerRejectsInvalidRequests(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	t.Cleanup(func() {
		_, _ = manager.Close(context.Background(), created.ID, CloseModeKill)
	})

	expectErrorContains(t, "empty workspace", func() error {
		_, err := manager.Create(context.Background(), "", "pane_shell", "", "", 80, 24)
		return err
	}, "workspace id is required")
	expectErrorContains(t, "empty pane", func() error {
		_, err := manager.Create(context.Background(), "workspace_terminal", "", "", "", 80, 24)
		return err
	}, "pane id is required")
	expectErrorContains(t, "invalid cols", func() error {
		_, err := manager.Create(context.Background(), "workspace_terminal", "pane_other", "", "", 0, 24)
		return err
	}, "terminal cols must be between")
	expectErrorContains(t, "invalid rows", func() error {
		_, err := manager.Create(context.Background(), "workspace_terminal", "pane_other", "", "", 80, MaxRows+1)
		return err
	}, "terminal rows must be between")
	expectErrorContains(t, "relative cwd", func() error {
		_, err := manager.Create(context.Background(), "workspace_terminal", "pane_other", "", "relative", 80, 24)
		return err
	}, "cwd must be absolute")
	expectErrorContains(t, "missing cwd", func() error {
		_, err := manager.Create(context.Background(), "workspace_terminal", "pane_other", "", filepath.Join(root, "missing"), 80, 24)
		return err
	}, "cwd does not exist")
	expectErrorContains(t, "unknown workspace", func() error {
		_, err := manager.Create(context.Background(), "workspace_missing", "pane_other", "", "", 80, 24)
		return err
	}, "workspace not found")
	expectErrorContains(t, "empty session write", func() error {
		_, err := manager.WriteInput(context.Background(), "", []byte("x"))
		return err
	}, "session id is required")
	expectErrorContains(t, "oversized input", func() error {
		_, err := manager.WriteInput(context.Background(), created.ID, bytes.Repeat([]byte("x"), MaxInputBytes+1))
		return err
	}, "terminal input exceeds")
	expectErrorContains(t, "invalid resize", func() error {
		_, err := manager.Resize(context.Background(), created.ID, MaxCols+1, 24)
		return err
	}, "terminal cols must be between")
	expectErrorContains(t, "unsupported close mode", func() error {
		_, err := manager.Close(context.Background(), created.ID, CloseMode("gentle"))
		return err
	}, "unsupported terminal close mode")
}

func newTestManager(t *testing.T, starter PTYStarter, roots map[string]string) *Manager {
	t.Helper()
	manager, err := NewManager(ManagerConfig{
		WorkspaceResolver: fakeWorkspaceResolver(roots),
		PTY:               starter,
		Clock:             testClock(t),
	})
	if err != nil {
		t.Fatalf("new terminal manager: %v", err)
	}
	return manager
}

func mustCreateTestSession(
	t *testing.T,
	manager *Manager,
	workspaceID string,
	paneID string,
	profileID string,
	cwd string,
	cols int,
	rows int,
) SessionSummary {
	t.Helper()
	session, err := manager.Create(context.Background(), workspaceID, paneID, profileID, cwd, cols, rows)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return session
}

func readTerminalEvent(t *testing.T, events <-chan TerminalEvent, eventType TerminalEventType, sessionID string) TerminalEvent {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Fatalf("terminal event stream closed before %s", eventType)
			}
			if event.Type == eventType && event.SessionID == sessionID {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for terminal event %s", eventType)
		}
	}
}

func expectErrorContains(t *testing.T, label string, operation func() error, want string) {
	t.Helper()
	err := operation()
	if err == nil {
		t.Fatalf("%s succeeded, want error containing %q", label, want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("%s error = %q, want containing %q", label, err.Error(), want)
	}
}

func testClock(t *testing.T) func() time.Time {
	t.Helper()
	var mu sync.Mutex
	next := time.Date(2026, 6, 6, 12, 0, 0, 0, time.UTC)
	return func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		value := next
		next = next.Add(time.Millisecond)
		return value
	}
}

func mustResolvePath(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(filepath.Clean(path))
	if err != nil {
		t.Fatalf("resolve path %s: %v", path, err)
	}
	return filepath.Clean(resolved)
}

type fakeWorkspaceResolver map[string]string

func (resolver fakeWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	root, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found: " + id)
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: root}, nil
}

type recordingPTYStarter struct {
	mu      sync.Mutex
	handles []*recordingPTYHandle
	err     error
}

func (starter *recordingPTYStarter) Start(_ context.Context, profile Profile) (PTYHandle, error) {
	if starter.err != nil {
		return nil, starter.err
	}
	handle := newRecordingPTYHandle(profile)
	starter.mu.Lock()
	starter.handles = append(starter.handles, handle)
	starter.mu.Unlock()
	return handle, nil
}

func (starter *recordingPTYStarter) count() int {
	starter.mu.Lock()
	defer starter.mu.Unlock()
	return len(starter.handles)
}

func (starter *recordingPTYStarter) handleAt(t *testing.T, index int) *recordingPTYHandle {
	t.Helper()
	starter.mu.Lock()
	defer starter.mu.Unlock()
	if index >= len(starter.handles) {
		t.Fatalf("pty handle index %d missing from %d handles", index, len(starter.handles))
	}
	return starter.handles[index]
}

type recordingPTYHandle struct {
	closed     chan struct{}
	closedOnce sync.Once
	output     chan []byte
	profile    Profile

	mu         sync.Mutex
	killed     bool
	resizes    []terminalSize
	terminated bool
	writes     bytes.Buffer
}

type terminalSize struct {
	cols int
	rows int
}

func newRecordingPTYHandle(profile Profile) *recordingPTYHandle {
	return &recordingPTYHandle{
		closed:  make(chan struct{}),
		output:  make(chan []byte, 16),
		profile: profile,
	}
}

func (handle *recordingPTYHandle) Read(buffer []byte) (int, error) {
	select {
	case data := <-handle.output:
		return copy(buffer, data), nil
	case <-handle.closed:
		return 0, io.EOF
	}
}

func (handle *recordingPTYHandle) Write(data []byte) (int, error) {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writes.Write(data)
}

func (handle *recordingPTYHandle) Resize(cols int, rows int) error {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	handle.resizes = append(handle.resizes, terminalSize{cols: cols, rows: rows})
	return nil
}

func (handle *recordingPTYHandle) Terminate() error {
	handle.mu.Lock()
	handle.terminated = true
	handle.mu.Unlock()
	handle.close()
	return nil
}

func (handle *recordingPTYHandle) Kill() error {
	handle.mu.Lock()
	handle.killed = true
	handle.mu.Unlock()
	handle.close()
	return nil
}

func (handle *recordingPTYHandle) Close() error {
	handle.close()
	return nil
}

func (handle *recordingPTYHandle) Wait() error {
	<-handle.closed
	return nil
}

func (handle *recordingPTYHandle) emit(data []byte) {
	handle.output <- data
}

func (handle *recordingPTYHandle) writtenString() string {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writes.String()
}

func (handle *recordingPTYHandle) lastResize() (int, int) {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	if len(handle.resizes) == 0 {
		return 0, 0
	}
	last := handle.resizes[len(handle.resizes)-1]
	return last.cols, last.rows
}

func (handle *recordingPTYHandle) wasTerminated() bool {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.terminated
}

func (handle *recordingPTYHandle) close() {
	handle.closedOnce.Do(func() {
		close(handle.closed)
	})
}
