package terminal

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
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

func TestManagerCreatesSessionFromSelectedProfile(t *testing.T) {
	root := t.TempDir()
	customCWD := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	profiles, err := manager.CreateProfile(TerminalProfileInput{
		Name:       "Custom project tool",
		LaunchMode: ProfileLaunchModeCustomCommand,
		ShellPath:  testExecutablePath(t),
		Args:       []string{"--profile-test"},
		CWDMode:    ProfileCWDModeCustom,
		CWD:        customCWD,
		Env:        map[string]string{"SETTA_PROFILE_TEST": "1"},
		FontFamily: "Fira Code",
		FontSize:   15,
		ThemeID:    ThemeSettaDark,
		Scrollback: 900,
	})
	if err != nil {
		t.Fatalf("create terminal profile: %v", err)
	}
	profileID := profiles.Profiles[1].ID

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_custom", profileID, "", 100, 32)
	if created.ProfileID != profileID {
		t.Fatalf("created profile id = %s, want %s", created.ProfileID, profileID)
	}
	if created.CWD != mustResolvePath(t, customCWD) {
		t.Fatalf("created cwd = %s, want custom cwd %s", created.CWD, customCWD)
	}
	handle := starter.handleAt(t, 0)
	if handle.profile.ShellPath != testExecutablePath(t) {
		t.Fatalf("pty shell path = %s, want test executable", handle.profile.ShellPath)
	}
	if strings.Join(handle.profile.Args, " ") != "--profile-test" {
		t.Fatalf("pty args = %#v, want --profile-test", handle.profile.Args)
	}
	if handle.profile.Env["SETTA_PROFILE_TEST"] != "1" {
		t.Fatalf("pty env = %#v, want SETTA_PROFILE_TEST", handle.profile.Env)
	}
	if handle.profile.Cols != 100 || handle.profile.Rows != 32 {
		t.Fatalf("pty dims = %dx%d, want 100x32", handle.profile.Cols, handle.profile.Rows)
	}
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
	closed, err := manager.Close(context.Background(), sessionID, false)
	if err != nil {
		t.Fatalf("close session: %v", err)
	}
	if closed.Kind != TerminalCloseResultClosed || closed.Session == nil {
		t.Fatalf("closed result = %+v, want closed session", closed)
	}
	if closed.Session.Status != SessionStatusClosed || closed.Session.Message != string(TerminalCloseAssessmentIdleShell) {
		t.Fatalf("closed status/message = %s/%q, want closed/idle_shell", closed.Session.Status, closed.Session.Message)
	}
	if handle.wasTerminated() {
		t.Fatal("safe close terminated the idle shell")
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

	handle.closeAssessment = terminalCloseAssessment(TerminalCloseSafetyDestructive, TerminalCloseAssessmentForegroundProcess)
	if _, err := manager.Close(context.Background(), created.ID, true); err != nil {
		t.Fatalf("close session: %v", err)
	}
	closed := readTerminalEvent(t, subscription.Events, TerminalEventClosed, created.ID)
	if closed.Payload.Status != SessionStatusClosed || closed.Payload.Message != "confirmed" {
		t.Fatalf("closed payload = %+v, want closed/confirmed", closed.Payload)
	}
}

func TestManagerReplaysBufferedEventsFromCursor(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	started := readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	handle := starter.handleAt(t, 0)
	handle.emit([]byte("one"))
	first := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	handle.emit([]byte("two"))
	second := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	subscription.Unsubscribe()

	replay, err := manager.SubscribeEvents(EventCursor{
		StreamID: started.StreamID,
		Sequence: started.Sequence,
	})
	if err != nil {
		t.Fatalf("subscribe replay terminal events: %v", err)
	}
	defer replay.Unsubscribe()

	replayedFirst := readTerminalEvent(t, replay.Events, TerminalEventOutput, created.ID)
	replayedSecond := readTerminalEvent(t, replay.Events, TerminalEventOutput, created.ID)
	if replayedFirst.EventID != first.EventID || replayedSecond.EventID != second.EventID {
		t.Fatalf(
			"replayed output event ids = %s/%s, want %s/%s",
			replayedFirst.EventID,
			replayedSecond.EventID,
			first.EventID,
			second.EventID,
		)
	}
}

func TestManagerAttachPublishesReplayForExistingSession(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	starter.handleAt(t, 0).emit([]byte("reload me"))
	original := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)

	attached, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach terminal session: %v", err)
	}
	if attached.ID != created.ID {
		t.Fatalf("attached id = %s, want %s", attached.ID, created.ID)
	}
	replayed := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	if replayed.EventID == original.EventID {
		t.Fatalf("attach replay event id = %s, want a fresh stream event id", replayed.EventID)
	}
	if replayed.Payload.DataBase64 != original.Payload.DataBase64 {
		t.Fatalf("attach replay payload = %+v, want original output payload %+v", replayed.Payload, original.Payload)
	}
}

func TestManagerBackendCrashRestartResumesSessionAndReplaysOutput(t *testing.T) {
	appDataDir := t.TempDir()
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	clock := testClock(t)
	first := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
		Clock:      clock,
	})
	subscription, err := first.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}

	created := mustCreateTestSession(t, first, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	starter.handleAt(t, 0).emit([]byte("durable terminal tail"))
	output := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	resized, err := first.Resize(context.Background(), created.ID, 132, 43)
	if err != nil {
		t.Fatalf("resize terminal before cold wake: %v", err)
	}
	if resized.Cols != 132 || resized.Rows != 43 {
		t.Fatalf("resized terminal = %+v, want 132x43", resized)
	}
	subscription.Unsubscribe()

	restartedStarter := &recordingPTYStarter{}
	restarted := newTestManagerWithConfig(t, restartedStarter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
		Clock:      clock,
	})
	if err := restarted.RecoveryError(); err != nil {
		t.Fatalf("terminal replay recovery error: %v", err)
	}
	reconnect, err := restarted.SubscribeEvents(EventCursor{
		StreamID: output.StreamID,
		Sequence: output.Sequence,
	})
	if err != nil {
		t.Fatalf("subscribe after backend crash: %v", err)
	}
	defer reconnect.Unsubscribe()
	attached, err := restarted.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach recovered terminal: %v", err)
	}
	if attached.ID != created.ID ||
		attached.Status != SessionStatusRunning ||
		attached.Message != "" ||
		attached.Cols != 132 ||
		attached.Rows != 43 {
		t.Fatalf("recovered session = %+v, want resumed session %s", attached, created.ID)
	}
	if restartedStarter.count() != 1 {
		t.Fatalf("restarted PTY count = %d, want one resumed shell", restartedStarter.count())
	}
	resumed := readTerminalEvent(t, reconnect.Events, TerminalEventStarted, created.ID)
	if resumed.Payload.Status != SessionStatusRunning {
		t.Fatalf("resumed event = %+v, want running", resumed.Payload)
	}
	replayedOutput := readTerminalEvent(t, reconnect.Events, TerminalEventOutput, created.ID)
	if replayedOutput.Payload.DataBase64 != output.Payload.DataBase64 {
		t.Fatalf("replayed output = %+v, want %+v", replayedOutput.Payload, output.Payload)
	}
	if _, err := restarted.WriteInput(context.Background(), created.ID, []byte("echo resumed\n")); err != nil {
		t.Fatalf("write to resumed terminal: %v", err)
	}
}

func TestManagerBackendCrashCursorAheadOfDiskResetsWithoutMarkingRestore(t *testing.T) {
	appDataDir := t.TempDir()
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	first := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	subscription, err := first.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	created := mustCreateTestSession(t, first, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	starter.handleAt(t, 0).emit([]byte("durable before crash"))
	durableOutput := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	first.eventHub.mu.Lock()
	first.eventHub.flushScheduledPersistLocked()
	first.eventHub.mu.Unlock()

	replayPath := filepath.Join(appDataDir, replayStateDirName, replayStateFileName)
	durableState, err := os.ReadFile(replayPath)
	if err != nil {
		t.Fatalf("read durable terminal state: %v", err)
	}
	starter.handleAt(t, 0).emit([]byte("delivered but not durable"))
	aheadOutput := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	first.eventHub.mu.Lock()
	if first.eventHub.persistTimer != nil {
		first.eventHub.persistTimer.Stop()
		first.eventHub.persistTimer = nil
	}
	first.eventHub.mu.Unlock()
	if err := os.WriteFile(replayPath, durableState, 0o600); err != nil {
		t.Fatalf("simulate backend crash before output flush: %v", err)
	}
	subscription.Unsubscribe()

	restartedStarter := &recordingPTYStarter{}
	restarted := newTestManagerWithConfig(t, restartedStarter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	if _, err := restarted.SubscribeEvents(EventCursor{
		StreamID: aheadOutput.StreamID,
		Sequence: aheadOutput.Sequence,
	}); err == nil || !strings.Contains(err.Error(), "ahead of restored stream") {
		t.Fatalf("ahead cursor error = %v, want reconnect reset", err)
	}
	reconnect, err := restarted.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe after cursor reset: %v", err)
	}
	defer reconnect.Unsubscribe()
	initialReplay := readTerminalEvent(t, reconnect.Events, TerminalEventOutput, created.ID)
	if initialReplay.Payload.DataBase64 != durableOutput.Payload.DataBase64 {
		t.Fatalf("initial replay output = %+v, want %+v", initialReplay.Payload, durableOutput.Payload)
	}
	attached, err := restarted.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach after cursor reset: %v", err)
	}
	if attached.Status != SessionStatusRunning || restartedStarter.count() != 1 {
		t.Fatalf("session after cursor reset = %+v starts=%d, want resumed", attached, restartedStarter.count())
	}
	resumed := readTerminalEvent(t, reconnect.Events, TerminalEventStarted, created.ID)
	if resumed.Sequence <= durableOutput.Sequence {
		t.Fatalf("resumed sequence = %d, want new event after durable sequence %d", resumed.Sequence, durableOutput.Sequence)
	}
	replayed := readTerminalEvent(t, reconnect.Events, TerminalEventOutput, created.ID)
	if replayed.Payload.DataBase64 != durableOutput.Payload.DataBase64 {
		t.Fatalf("replayed durable output = %+v, want %+v", replayed.Payload, durableOutput.Payload)
	}
}

func TestManagerBackendCrashRestartDoesNotRerunUnsafeProfile(t *testing.T) {
	appDataDir := t.TempDir()
	root := t.TempDir()
	first := newTestManagerWithConfig(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	profiles, err := first.CreateProfile(TerminalProfileInput{
		Name:       "Unsafe recovery command",
		LaunchMode: ProfileLaunchModeCustomCommand,
		ShellPath:  testExecutablePath(t),
		CWDMode:    ProfileCWDModeProject,
		FontFamily: "Fira Code",
		FontSize:   14,
		ThemeID:    ThemeSettaDark,
		Scrollback: 1000,
	})
	if err != nil {
		t.Fatalf("create unsafe terminal profile: %v", err)
	}
	profileID := profiles.Profiles[len(profiles.Profiles)-1].ID
	created := mustCreateTestSession(t, first, "workspace_terminal", "pane_unsafe", profileID, "", 80, 24)
	first.eventHub.mu.Lock()
	first.eventHub.flushScheduledPersistLocked()
	first.eventHub.mu.Unlock()

	restartedStarter := &recordingPTYStarter{}
	restarted := newTestManagerWithConfig(t, restartedStarter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	attached, err := restarted.Attach(context.Background(), "workspace_terminal", "pane_unsafe")
	if err != nil {
		t.Fatalf("attach unsafe recovered terminal: %v", err)
	}
	if attached.ID != created.ID ||
		attached.Status != SessionStatusError ||
		attached.Message != terminalSessionExplicitRestartAfterRuntimeRestartMessage {
		t.Fatalf("unsafe recovered session = %+v, want explicit-restart error", attached)
	}
	if restartedStarter.count() != 0 {
		t.Fatalf("unsafe recovered PTY starts = %d, want zero", restartedStarter.count())
	}
}

func TestManagerReplayFileHonorsDocumentedDiskCap(t *testing.T) {
	appDataDir := t.TempDir()
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir:      appDataDir,
		ReplayFileBytes: minimumReplayFileBytes,
	})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	chunk := bytes.Repeat([]byte("x"), 8*1024)
	for index := 0; index < 20; index++ {
		starter.handleAt(t, 0).emit(chunk)
		_ = readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	}
	manager.CloseEvents()

	path := filepath.Join(appDataDir, replayStateDirName, replayStateFileName)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat terminal replay: %v", err)
	}
	if info.Size() > minimumReplayFileBytes {
		t.Fatalf("terminal replay size = %d, cap = %d", info.Size(), minimumReplayFileBytes)
	}
	if runtime.GOOS != "windows" {
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("terminal replay mode = %o, want 600", info.Mode().Perm())
		}
		dirInfo, err := os.Stat(filepath.Dir(path))
		if err != nil {
			t.Fatalf("stat terminal replay directory: %v", err)
		}
		if dirInfo.Mode().Perm() != 0o700 {
			t.Fatalf("terminal replay directory mode = %o, want 700", dirInfo.Mode().Perm())
		}
	}
	restarted := newTestManagerWithConfig(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir:      appDataDir,
		ReplayFileBytes: minimumReplayFileBytes,
	})
	if err := restarted.RecoveryError(); err != nil {
		t.Fatalf("reload capped terminal replay: %v", err)
	}
	replay, err := restarted.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe capped terminal replay: %v", err)
	}
	defer replay.Unsubscribe()
	truncated := readTerminalEvent(t, replay.Events, TerminalEventBufferTruncated, created.ID)
	if truncated.Payload.DroppedBytes == 0 || truncated.Payload.DroppedChunks == 0 {
		t.Fatalf("disk-cap truncation event = %+v, want explicit dropped output", truncated.Payload)
	}
}

func TestManagerCheckpointRollbackReloadsTerminalStateAsHistorical(t *testing.T) {
	appDataDir := t.TempDir()
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	started := readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	starter.handleAt(t, 0).emit([]byte("checkpoint terminal tail"))
	checkpointOutput := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	manager.eventHub.mu.Lock()
	manager.eventHub.flushScheduledPersistLocked()
	manager.eventHub.mu.Unlock()

	replayPath := filepath.Join(appDataDir, replayStateDirName, replayStateFileName)
	checkpoint, err := os.ReadFile(replayPath)
	if err != nil {
		t.Fatalf("read checkpoint replay state: %v", err)
	}
	var newerOutput TerminalEvent
	for index := 0; index < 4; index++ {
		starter.handleAt(t, 0).emit([]byte("newer output rolled back"))
		newerOutput = readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	}
	manager.eventHub.mu.Lock()
	manager.eventHub.flushScheduledPersistLocked()
	manager.eventHub.mu.Unlock()
	subscription.Unsubscribe()
	if err := os.WriteFile(replayPath, checkpoint, 0o600); err != nil {
		t.Fatalf("restore checkpoint replay state: %v", err)
	}

	restoredStarter := &recordingPTYStarter{}
	restored := newTestManagerWithConfig(t, restoredStarter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		AppDataDir:        appDataDir,
		HistoricalRestore: true,
	})
	if _, err := restored.SubscribeEvents(EventCursor{
		StreamID: newerOutput.StreamID,
		Sequence: newerOutput.Sequence,
	}); err == nil || !strings.Contains(err.Error(), "ahead of restored stream") {
		t.Fatalf("checkpoint-restored stale cursor error = %v, want ahead-of-stream reset", err)
	}
	attached, err := restored.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach checkpoint-restored terminal: %v", err)
	}
	if attached.Status != SessionStatusError || attached.Message != terminalSessionInterruptedByCheckpointRestoreMessage {
		t.Fatalf("checkpoint-restored session = %+v, want historical interrupted state", attached)
	}
	if restoredStarter.count() != 0 {
		t.Fatalf("checkpoint-restored PTY starts = %d, want historical state only", restoredStarter.count())
	}
	replay, err := restored.SubscribeEvents(EventCursor{
		StreamID: started.StreamID,
		Sequence: started.Sequence,
	})
	if err != nil {
		t.Fatalf("subscribe checkpoint-restored replay: %v", err)
	}
	defer replay.Unsubscribe()
	replayed := readTerminalEvent(t, replay.Events, TerminalEventOutput, created.ID)
	if replayed.Payload.DataBase64 != checkpointOutput.Payload.DataBase64 {
		t.Fatalf("checkpoint-restored output = %+v, want checkpoint tail", replayed.Payload)
	}
}

func TestManagerCorruptReplayReportsTypedRecoveryWithoutBlockingStartup(t *testing.T) {
	appDataDir := t.TempDir()
	replayPath := filepath.Join(appDataDir, replayStateDirName, replayStateFileName)
	if err := os.MkdirAll(filepath.Dir(replayPath), 0o700); err != nil {
		t.Fatalf("create replay directory: %v", err)
	}
	if err := os.WriteFile(replayPath, []byte("{"), 0o600); err != nil {
		t.Fatalf("write corrupt replay: %v", err)
	}

	manager := newTestManagerWithConfig(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": t.TempDir()}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	var recoveryErr *ReplayRecoveryError
	if !errors.As(manager.RecoveryError(), &recoveryErr) {
		t.Fatalf("recovery error = %T %v, want ReplayRecoveryError", manager.RecoveryError(), manager.RecoveryError())
	}
	if _, err := manager.SubscribeEvents(EventCursor{}); err != nil {
		t.Fatalf("terminal manager did not remain available after corrupt replay: %v", err)
	}

	reloaded := newTestManagerWithConfig(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": t.TempDir()}, ManagerConfig{
		AppDataDir: appDataDir,
	})
	if err := reloaded.RecoveryError(); err != nil {
		t.Fatalf("corrupt replay replacement did not recover: %v", err)
	}
}

func TestManagerStoresReplayTruncationWhenOutputBufferOverflows(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		OutputBufferBytesPerSession: 8,
	})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 1, 1)
	started := readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	handle := starter.handleAt(t, 0)
	for index := 0; index < 10; index += 1 {
		handle.emit([]byte{byte('a' + index)})
		_ = readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	}
	expectNoTerminalEvent(t, subscription.Events, TerminalEventBufferTruncated, created.ID)
	subscription.Unsubscribe()

	replay, err := manager.SubscribeEvents(EventCursor{
		StreamID: started.StreamID,
		Sequence: started.Sequence,
	})
	if err != nil {
		t.Fatalf("subscribe replay terminal events: %v", err)
	}
	defer replay.Unsubscribe()

	truncated := readTerminalEvent(t, replay.Events, TerminalEventBufferTruncated, created.ID)
	if truncated.Payload.DroppedChunks == 0 || truncated.Payload.DroppedBytes == 0 {
		t.Fatalf("truncated payload = %+v, want dropped chunk and byte counts", truncated.Payload)
	}
	if truncated.Payload.Message != "terminal replay history truncated; 1 output chunk unavailable" {
		t.Fatalf("truncated message = %q, want replay history message", truncated.Payload.Message)
	}
}

func TestManagerRetainsAgedReplayTailForRunningSession(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	var clockMu sync.Mutex
	now := time.Date(2026, 6, 6, 12, 0, 0, 0, time.UTC)
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		Clock: func() time.Time {
			clockMu.Lock()
			defer clockMu.Unlock()
			return now
		},
		ReplayRetention: time.Second,
	})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	handle := starter.handleAt(t, 0)
	handle.emit([]byte("idle prompt$ "))
	original := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)

	clockMu.Lock()
	now = now.Add(2 * time.Second)
	clockMu.Unlock()
	attached, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach terminal session: %v", err)
	}
	if attached.ID != created.ID {
		t.Fatalf("attached id = %s, want %s", attached.ID, created.ID)
	}

	replayed := readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	if replayed.Payload.DataBase64 != original.Payload.DataBase64 {
		t.Fatalf("aged replay payload = %+v, want original output payload %+v", replayed.Payload, original.Payload)
	}
	expectNoTerminalEvent(t, subscription.Events, TerminalEventBufferTruncated, created.ID)
}

func TestManagerStoresReplayTruncationWhenOutputHistoryExpires(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	var clockMu sync.Mutex
	now := time.Date(2026, 6, 6, 12, 0, 0, 0, time.UTC)
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		Clock: func() time.Time {
			clockMu.Lock()
			defer clockMu.Unlock()
			return now
		},
		ReplayRetention: time.Second,
	})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 1, 1)
	started := readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	handle := starter.handleAt(t, 0)
	for index := 0; index < 10; index += 1 {
		handle.emit([]byte{byte('a' + index)})
		_ = readTerminalEvent(t, subscription.Events, TerminalEventOutput, created.ID)
	}

	clockMu.Lock()
	now = now.Add(2 * time.Second)
	clockMu.Unlock()
	expectNoTerminalEvent(t, subscription.Events, TerminalEventBufferTruncated, created.ID)
	subscription.Unsubscribe()

	replay, err := manager.SubscribeEvents(EventCursor{
		StreamID: started.StreamID,
		Sequence: started.Sequence,
	})
	if err != nil {
		t.Fatalf("subscribe replay terminal events: %v", err)
	}
	defer replay.Unsubscribe()

	truncated := readTerminalEvent(t, replay.Events, TerminalEventBufferTruncated, created.ID)
	if truncated.Payload.DroppedChunks != 2 || truncated.Payload.DroppedBytes != 2 {
		t.Fatalf("truncated payload = %+v, want two dropped one-byte chunks", truncated.Payload)
	}
	if truncated.Payload.Message != "terminal replay history truncated; 2 output chunks unavailable" {
		t.Fatalf("truncated message = %q, want replay history message", truncated.Payload.Message)
	}
}

func TestManagerKeepsExitedSessionAttachableUntilClose(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	subscription, err := manager.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe terminal events: %v", err)
	}
	defer subscription.Unsubscribe()

	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	_ = readTerminalEvent(t, subscription.Events, TerminalEventStarted, created.ID)
	starter.handleAt(t, 0).close()
	exited := readTerminalEvent(t, subscription.Events, TerminalEventExited, created.ID)
	if exited.Payload.Status != SessionStatusExited {
		t.Fatalf("exited payload status = %s, want exited", exited.Payload.Status)
	}

	attached, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell")
	if err != nil {
		t.Fatalf("attach exited terminal session: %v", err)
	}
	if attached.Status != SessionStatusExited {
		t.Fatalf("attached exited status = %s, want exited", attached.Status)
	}
	if _, err := manager.WriteInput(context.Background(), created.ID, []byte("echo no\n")); err == nil {
		t.Fatal("write to exited session succeeded, want error")
	}
	closed, err := manager.Close(context.Background(), created.ID, false)
	if err != nil {
		t.Fatalf("close exited session: %v", err)
	}
	if closed.Session == nil || closed.Session.Status != SessionStatusClosed {
		t.Fatalf("closed exited result = %+v, want closed", closed)
	}
	if _, err := manager.Attach(context.Background(), "workspace_terminal", "pane_shell"); err == nil {
		t.Fatal("attach after closing exited session succeeded, want error")
	}
}

func TestManagerCloseTerminatesThenKillsAfterTimeout(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		CloseKillTimeout: 10 * time.Millisecond,
	})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	handle := starter.handleAt(t, 0)
	handle.closeAssessment = terminalCloseAssessment(TerminalCloseSafetyDestructive, TerminalCloseAssessmentForegroundProcess)
	handle.terminateCloses = false

	closed, err := manager.Close(context.Background(), created.ID, true)
	if err != nil {
		t.Fatalf("close terminal session: %v", err)
	}
	if closed.Session == nil || closed.Session.Status != SessionStatusClosed {
		t.Fatalf("closed result = %+v, want closed", closed)
	}
	if !handle.wasTerminated() || !handle.wasKilled() {
		t.Fatalf("handle terminated/killed = %t/%t, want true/true", handle.wasTerminated(), handle.wasKilled())
	}
}

func TestManagerSafeCloseReturnsWithoutWaitingForCloseTimeout(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
		CloseKillTimeout: 250 * time.Millisecond,
	})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	handle := starter.handleAt(t, 0)
	handle.closeAssessment = terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentIdleShell)
	handle.terminateCloses = false

	type closeOutcome struct {
		result TerminalCloseResult
		err    error
	}
	done := make(chan closeOutcome, 1)
	go func() {
		result, err := manager.Close(context.Background(), created.ID, false)
		done <- closeOutcome{result: result, err: err}
	}()

	select {
	case outcome := <-done:
		if outcome.err != nil {
			t.Fatalf("close terminal session: %v", outcome.err)
		}
		if outcome.result.Kind != TerminalCloseResultClosed ||
			outcome.result.Session == nil ||
			outcome.result.Session.Status != SessionStatusClosed {
			t.Fatalf("safe close result = %+v, want closed", outcome.result)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("safe close waited for the process close timeout")
	}
	if handle.wasTerminated() || handle.wasKilled() {
		t.Fatalf("safe close terminated/killed = %t/%t, want false/false", handle.wasTerminated(), handle.wasKilled())
	}
}

func TestManagerCloseRequiresConfirmationForDestructiveOrUnknownSessions(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	handle := starter.handleAt(t, 0)
	handle.closeAssessment = terminalCloseAssessment(
		TerminalCloseSafetyDestructive,
		TerminalCloseAssessmentForegroundProcess,
	)

	result, err := manager.Close(context.Background(), created.ID, false)
	if err != nil {
		t.Fatalf("close terminal session: %v", err)
	}
	if result.Kind != TerminalCloseResultConfirmationRequired || result.Session == nil {
		t.Fatalf("close result = %+v, want confirmation required with session", result)
	}
	if !result.Assessment.RequiresConfirmation || result.Assessment.Safety != TerminalCloseSafetyDestructive {
		t.Fatalf("assessment = %+v, want destructive confirmation", result.Assessment)
	}
	if handle.wasTerminated() || handle.wasKilled() {
		t.Fatalf("unconfirmed close mutated process terminated/killed = %t/%t", handle.wasTerminated(), handle.wasKilled())
	}

	confirmed, err := manager.Close(context.Background(), created.ID, true)
	if err != nil {
		t.Fatalf("confirmed close terminal session: %v", err)
	}
	if confirmed.Kind != TerminalCloseResultClosed || confirmed.Session == nil || confirmed.Session.Status != SessionStatusClosed {
		t.Fatalf("confirmed close = %+v, want closed", confirmed)
	}
	if !handle.wasTerminated() {
		t.Fatal("confirmed destructive close did not terminate the process")
	}

	unknown := mustCreateTestSession(t, manager, "workspace_terminal", "pane_unknown", "", "", 80, 24)
	unknownHandle := starter.handleAt(t, 1)
	unknownHandle.closeAssessment = terminalCloseAssessment(
		TerminalCloseSafetyUnknown,
		TerminalCloseAssessmentInspectionFailed,
	)
	unknownResult, err := manager.Close(context.Background(), unknown.ID, false)
	if err != nil {
		t.Fatalf("close unknown terminal session: %v", err)
	}
	if unknownResult.Kind != TerminalCloseResultConfirmationRequired ||
		unknownResult.Assessment.Safety != TerminalCloseSafetyUnknown ||
		!unknownResult.Assessment.RequiresConfirmation {
		t.Fatalf("unknown close result = %+v, want confirmation required", unknownResult)
	}
	if unknownHandle.wasTerminated() || unknownHandle.wasKilled() {
		t.Fatalf("unconfirmed unknown close mutated process terminated/killed = %t/%t", unknownHandle.wasTerminated(), unknownHandle.wasKilled())
	}
	_, _ = manager.Close(context.Background(), unknown.ID, true)
}

func TestManagerCloseReturnsClosedForMissingSession(t *testing.T) {
	root := t.TempDir()
	manager := newTestManager(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": root})

	result, err := manager.Close(context.Background(), "terminal_missing", false)
	if err != nil {
		t.Fatalf("close missing session: %v", err)
	}
	if result.Kind != TerminalCloseResultClosed || result.Session != nil {
		t.Fatalf("missing close result = %+v, want closed without session", result)
	}
	if result.Assessment.Reason != TerminalCloseAssessmentNoSession || result.Assessment.RequiresConfirmation {
		t.Fatalf("missing close assessment = %+v, want safe no_session", result.Assessment)
	}
}

func TestManagerRejectsInvalidRequests(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	t.Cleanup(func() {
		_, _ = manager.Close(context.Background(), created.ID, true)
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
}

func newTestManager(t *testing.T, starter PTYStarter, roots map[string]string) *Manager {
	t.Helper()
	manager := newTestManagerWithConfig(t, starter, roots, ManagerConfig{})
	return manager
}

func newTestManagerWithConfig(
	t *testing.T,
	starter PTYStarter,
	roots map[string]string,
	config ManagerConfig,
) *Manager {
	t.Helper()
	if config.AppDataDir == "" {
		config.AppDataDir = t.TempDir()
	}
	config.WorkspaceResolver = fakeWorkspaceResolver(roots)
	config.PTY = starter
	if config.Clock == nil {
		config.Clock = testClock(t)
	}
	manager, err := NewManager(config)
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

func expectNoTerminalEvent(t *testing.T, events <-chan TerminalEvent, eventType TerminalEventType, sessionID string) {
	t.Helper()
	deadline := time.After(50 * time.Millisecond)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Fatalf("terminal event stream closed while checking for absent %s", eventType)
			}
			if event.Type == eventType && event.SessionID == sessionID {
				t.Fatalf("unexpected terminal event %s for %s: %+v", eventType, sessionID, event.Payload)
			}
		case <-deadline:
			return
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

	mu              sync.Mutex
	closeAssessment TerminalCloseAssessment
	killed          bool
	resizes         []terminalSize
	terminateCloses bool
	terminated      bool
	writes          bytes.Buffer
}

type terminalSize struct {
	cols int
	rows int
}

func newRecordingPTYHandle(profile Profile) *recordingPTYHandle {
	return &recordingPTYHandle{
		closed:          make(chan struct{}),
		closeAssessment: terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentIdleShell),
		output:          make(chan []byte, 16),
		profile:         profile,
		terminateCloses: true,
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
	terminateCloses := handle.terminateCloses
	handle.mu.Unlock()
	if terminateCloses {
		handle.close()
	}
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

func (handle *recordingPTYHandle) CloseSafetyAssessment() TerminalCloseAssessment {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.closeAssessment
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

func (handle *recordingPTYHandle) wasKilled() bool {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.killed
}

func (handle *recordingPTYHandle) close() {
	handle.closedOnce.Do(func() {
		close(handle.closed)
	})
}
