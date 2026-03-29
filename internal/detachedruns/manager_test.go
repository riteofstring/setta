package detachedruns

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDetachedRunHelperProcess(t *testing.T) {
	separator := -1
	for index, arg := range os.Args {
		if arg == "--" {
			separator = index
			break
		}
	}
	if separator == -1 || separator+1 >= len(os.Args) {
		return
	}

	switch os.Args[separator+1] {
	case "print":
		fmt.Println("detached-helper")
		os.Exit(0)
	case "sleep":
		time.Sleep(10 * time.Second)
		os.Exit(0)
	case "fail":
		os.Exit(3)
	default:
		os.Exit(2)
	}
}

func TestManagerStartRunPersistsStatusAndLogs(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-success")
	snapshotPath := filepath.Join(t.TempDir(), "snapshot.py")
	entrySectionID := "section-a"

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("print"),
		SnapshotPath:    snapshotPath,
		ProjectConfigID: "project-a",
		EntrySectionID:  &entrySectionID,
		Tags:            map[string]string{"kind": "test"},
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}
	if run.Status != StatusRunning {
		t.Fatalf("expected running status, got %q", run.Status)
	}

	status := waitForDetachedRunStatus(t, manager, run.RunID, func(run Run) bool {
		return run.Status != StatusRunning
	})
	if status.Status != StatusExited {
		t.Fatalf("expected exited status, got %#v", status)
	}
	if status.ExitCode == nil || *status.ExitCode != 0 {
		t.Fatalf("expected zero exit code, got %#v", status.ExitCode)
	}
	if status.ProjectConfigID != "project-a" {
		t.Fatalf("expected project-a, got %#v", status.ProjectConfigID)
	}
	if status.EntrySectionID == nil || *status.EntrySectionID != entrySectionID {
		t.Fatalf("expected entry section %q, got %#v", entrySectionID, status.EntrySectionID)
	}
	if status.Tags["kind"] != "test" {
		t.Fatalf("expected tags to persist, got %#v", status.Tags)
	}

	metaPath := filepath.Join(manager.root, run.RunID, "meta.json")
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("stat meta.json: %v", err)
	}
	stdoutPath := filepath.Join(manager.root, run.RunID, "stdout.log")
	content, err := os.ReadFile(stdoutPath)
	if err != nil {
		t.Fatalf("read stdout.log: %v", err)
	}
	if !strings.Contains(string(content), "detached-helper") {
		t.Fatalf("expected stdout log to include helper output, got %q", string(content))
	}
}

func TestManagerStartRunPreservesFileSnapshotPath(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-file-snapshot")
	snapshotPath := filepath.Join(t.TempDir(), "snapshot.py")
	if err := os.WriteFile(snapshotPath, []byte("print('detached')\n"), 0o644); err != nil {
		t.Fatalf("write snapshot file: %v", err)
	}

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("print") + " " + strconv.Quote(snapshotPath),
		SnapshotPath:    snapshotPath,
		ProjectConfigID: "project-a",
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}

	status := waitForDetachedRunStatus(t, manager, run.RunID, func(run Run) bool {
		return run.Status != StatusRunning
	})
	if status.ExitCode == nil || *status.ExitCode != 0 {
		t.Fatalf("expected zero exit code, got %#v", status.ExitCode)
	}
	if status.SnapshotPath != snapshotPath {
		t.Fatalf("expected snapshot path %q, got %q", snapshotPath, status.SnapshotPath)
	}
}

func TestManagerStartRunInvalidCommandMarksFailed(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-invalid")

	_, err := manager.StartRun(Spec{
		Command:         "bad\x00cmd",
		SnapshotPath:    filepath.Join(t.TempDir(), "snapshot.py"),
		ProjectConfigID: "project-a",
	})
	if err == nil {
		t.Fatal("expected invalid command error")
	}

	status, err := manager.GetStatus("run-invalid")
	if err != nil {
		t.Fatalf("get status after invalid command: %v", err)
	}
	if status.Status != StatusFailed {
		t.Fatalf("expected failed status, got %#v", status)
	}
	if status.ExitCode == nil || *status.ExitCode != -1 {
		t.Fatalf("expected exit code -1, got %#v", status.ExitCode)
	}
	if status.PID != nil {
		t.Fatalf("expected pid to be nil, got %#v", status.PID)
	}
	if status.StartedAtMS != nil {
		t.Fatalf("expected startedAtMs to be nil, got %#v", status.StartedAtMS)
	}
	if status.ExitedAtMS == nil {
		t.Fatalf("expected exitedAtMs to be set")
	}
}

func TestManagerCancelRunMarksCanceled(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-cancel")

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("sleep"),
		SnapshotPath:    filepath.Join(t.TempDir(), "snapshot.py"),
		ProjectConfigID: "project-a",
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}

	if _, err := manager.CancelRun(run.RunID); err != nil {
		t.Fatalf("cancel detached run: %v", err)
	}

	status := waitForDetachedRunStatus(t, manager, run.RunID, func(run Run) bool {
		return run.Status == StatusCanceled && run.ExitCode != nil
	})
	if status.Status != StatusCanceled {
		t.Fatalf("expected canceled status, got %#v", status)
	}
	if status.ExitCode == nil {
		t.Fatalf("expected canceled run exit code, got %#v", status.ExitCode)
	}
}

func TestManagerCancelRunKeepsExitedStatus(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-exited")

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("print"),
		SnapshotPath:    filepath.Join(t.TempDir(), "snapshot.py"),
		ProjectConfigID: "project-a",
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}

	// Wait for the helper to exit so CancelRun exercises the already-exited path.
	exited := waitForDetachedRunStatus(t, manager, run.RunID, func(run Run) bool {
		return run.Status == StatusExited
	})

	canceled, err := manager.CancelRun(run.RunID)
	if err != nil {
		t.Fatalf("cancel detached run after exit: %v", err)
	}
	if canceled.Status != StatusExited {
		t.Fatalf("expected exited status after cancel, got %#v", canceled)
	}
	if canceled.ExitCode == nil || *canceled.ExitCode != 0 {
		t.Fatalf("expected exit code 0 after cancel, got %#v", canceled.ExitCode)
	}
	if canceled.ExitedAtMS == nil {
		t.Fatalf("expected exitedAtMs to remain set, got %#v", canceled)
	}
	if exited.ExitedAtMS == nil || *canceled.ExitedAtMS != *exited.ExitedAtMS {
		t.Fatalf("expected cancel to preserve exited metadata, before=%#v after=%#v", exited, canceled)
	}

	status, err := manager.GetStatus(run.RunID)
	if err != nil {
		t.Fatalf("get status after canceling exited run: %v", err)
	}
	if status.Status != StatusExited {
		t.Fatalf("expected persisted exited status, got %#v", status)
	}
}

func TestManagerGetStatusUntrackedRunMarksLost(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-lost")

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("sleep"),
		SnapshotPath:    filepath.Join(t.TempDir(), "snapshot.py"),
		ProjectConfigID: "project-a",
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}

	manager.mu.Lock()
	tracked := manager.processes[run.RunID]
	delete(manager.processes, run.RunID)
	manager.mu.Unlock()
	if tracked == nil {
		t.Fatal("expected tracked process")
	}
	t.Cleanup(func() {
		_ = killProcess(tracked.cmd)
		<-tracked.done
	})

	status, err := manager.GetStatus(run.RunID)
	if err != nil {
		t.Fatalf("get status: %v", err)
	}
	if status.Status != StatusLost {
		t.Fatalf("expected lost status, got %#v", status)
	}
}

func TestManagerCancelRunUntrackedRunMarksLost(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t, "run-cancel-lost")

	run, err := manager.StartRun(Spec{
		Command:         testDetachedRunHelperCommand("sleep"),
		SnapshotPath:    filepath.Join(t.TempDir(), "snapshot.py"),
		ProjectConfigID: "project-a",
	})
	if err != nil {
		t.Fatalf("start detached run: %v", err)
	}

	manager.mu.Lock()
	tracked := manager.processes[run.RunID]
	delete(manager.processes, run.RunID)
	manager.mu.Unlock()
	if tracked == nil {
		t.Fatal("expected tracked process")
	}

	// Keep the helper process from leaking after the manager reports the run as lost.
	t.Cleanup(func() {
		_ = killProcess(tracked.cmd)
		<-tracked.done
	})

	status, err := manager.CancelRun(run.RunID)
	if err != nil {
		t.Fatalf("cancel untracked detached run: %v", err)
	}
	if status.Status != StatusLost {
		t.Fatalf("expected lost status, got %#v", status)
	}
	if status.ExitCode != nil {
		t.Fatalf("expected lost status to avoid inventing an exit code, got %#v", status.ExitCode)
	}
	if status.ExitedAtMS == nil {
		t.Fatalf("expected lost status to record exitedAtMs, got %#v", status)
	}

	persisted, err := manager.GetStatus(run.RunID)
	if err != nil {
		t.Fatalf("get status after canceling untracked run: %v", err)
	}
	if persisted.Status != StatusLost {
		t.Fatalf("expected persisted lost status, got %#v", persisted)
	}
}

func newTestManager(t *testing.T, runID string) *Manager {
	t.Helper()

	manager, err := NewManager(ManagerOptions{
		RuntimeRoot: t.TempDir(),
		NewRunID: func() string {
			return runID
		},
	})
	if err != nil {
		t.Fatalf("new detached run manager: %v", err)
	}
	return manager
}

func testDetachedRunHelperCommand(action string) string {
	return fmt.Sprintf(`"%s" -test.run=^TestDetachedRunHelperProcess$ -- %s`, os.Args[0], action)
}

func waitForDetachedRunStatus(t *testing.T, manager *Manager, runID string, done func(Run) bool) Run {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		run, err := manager.GetStatus(runID)
		if err != nil {
			t.Fatalf("get detached run status: %v", err)
		}
		if done(run) {
			return run
		}
		time.Sleep(50 * time.Millisecond)
	}

	run, err := manager.GetStatus(runID)
	if err != nil {
		t.Fatalf("get detached run status after timeout: %v", err)
	}
	t.Fatalf("timed out waiting for detached run state, last status %#v", run)
	return Run{}
}
