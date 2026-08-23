//go:build linux

package runner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

type linuxGuardianTestInput struct {
	closeErr error
	closes   int
}

func (input *linuxGuardianTestInput) Read([]byte) (int, error) {
	return 0, io.EOF
}

func (input *linuxGuardianTestInput) Close() error {
	input.closes++
	return input.closeErr
}

func TestReapLinuxGuardianChildrenKillsAdoptedChildrenUntilECHILD(t *testing.T) {
	snapshots := [][]int{{41, 42}, {43}, {}}
	nextSnapshot := 0
	var killed []int
	waits := 0
	noHangWaits := 0
	err := reapLinuxGuardianChildren(linuxGuardianReaperOperations{
		children: func() ([]int, error) {
			if nextSnapshot >= len(snapshots) {
				return nil, errors.New("unexpected child snapshot")
			}
			children := snapshots[nextSnapshot]
			nextSnapshot++
			return children, nil
		},
		kill: func(processID int, signal syscall.Signal) error {
			if signal != syscall.SIGKILL {
				t.Fatalf("signal child %d with %s, want SIGKILL", processID, signal)
			}
			killed = append(killed, processID)
			return nil
		},
		waitOne: func() error {
			waits++
			return nil
		},
		waitNoHang: func() (bool, error) {
			noHangWaits++
			return false, syscall.ECHILD
		},
	})
	if err != nil {
		t.Fatalf("reapLinuxGuardianChildren() error = %v", err)
	}
	if got, want := fmt.Sprint(killed), "[41 42 43]"; got != want {
		t.Fatalf("killed children = %s, want %s", got, want)
	}
	if waits != 2 || noHangWaits != 1 {
		t.Fatalf("guardian reaping calls = wait %d nonblocking %d, want 2 and 1", waits, noHangWaits)
	}
}

func TestLinuxTargetInputCloseFailureAbortsStartedTargetAndReaps(t *testing.T) {
	closeErr := errors.New("close generated Python input")
	input := &linuxGuardianTestInput{closeErr: closeErr}
	started := false
	command, err := startLinuxGuardianTargetWithOperations("interpreter", "artifact", linuxGuardianTargetStartOperations{
		openInput: func() (io.ReadCloser, error) { return input, nil },
		startCommand: func(*exec.Cmd) error {
			started = true
			return nil
		},
	})
	if !started || command == nil {
		t.Fatalf("target start = started %t command %#v, want started command", started, command)
	}
	if !errors.Is(err, closeErr) {
		t.Fatalf("target start error = %v, want input close failure", err)
	}
	if input.closes != 1 {
		t.Fatalf("input closes = %d, want 1", input.closes)
	}

	stopErr := errors.New("stop started target")
	reapErr := errors.New("reap adopted descendants")
	var cleanupCalls []string
	err = handleLinuxGuardianTargetStart(command, err, func(got *exec.Cmd, cause error) error {
		if got != command {
			t.Fatalf("cleanup command = %#v, want started command %#v", got, command)
		}
		if !errors.Is(cause, closeErr) {
			t.Fatalf("cleanup cause = %v, want input close failure", cause)
		}
		return abortLinuxGuardianTargetWithOperations(got, cause, linuxGuardianTargetCleanupOperations{
			cleanupCommand: func(*exec.Cmd) error {
				cleanupCalls = append(cleanupCalls, "target")
				return stopErr
			},
			reapChildren: func() error {
				cleanupCalls = append(cleanupCalls, "reaper")
				return reapErr
			},
		})
	})
	if !errors.Is(err, closeErr) || !errors.Is(err, stopErr) || !errors.Is(err, reapErr) {
		t.Fatalf("rollback error = %v, want joined input, target, and reaper failures", err)
	}
	if got, want := fmt.Sprint(cleanupCalls), "[target reaper]"; got != want {
		t.Fatalf("rollback calls = %s, want %s", got, want)
	}
}

func TestLinuxFinishReapsAfterUnexpectedTargetWaitFailure(t *testing.T) {
	waitErr := errors.New("target wait failed")
	reapErr := errors.New("reap adopted descendants")
	reapCalls := 0
	_, err := finishLinuxGuardianTargetWithOperations(waitErr, nil, linuxGuardianTargetFinishOperations{
		reapChildren: func() error {
			reapCalls++
			return reapErr
		},
	})
	if !errors.Is(err, waitErr) || !errors.Is(err, reapErr) {
		t.Fatalf("finish error = %v, want joined target wait and reaper failures", err)
	}
	if reapCalls != 1 {
		t.Fatalf("reap calls = %d, want 1", reapCalls)
	}
}

func TestRunReapsSetsidDescendantAfterNormalRootExit(t *testing.T) {
	service, projectDirectory := newLinuxContainmentService(t, 3*time.Second)
	childPIDPath := filepath.Join(projectDirectory, "setsid-child-pid")
	t.Cleanup(func() { stopLinuxContainmentChild(t, childPIDPath) })

	result, err := service.Run(
		context.Background(),
		Program{ProjectID: "project:runner", Revision: 4, Code: linuxSetsidProgram(childPIDPath, "")},
		Request{},
	)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Termination != TerminationExited || result.ExitCode == nil || *result.ExitCode != 0 {
		t.Fatalf("normal root exit result = %#v", result)
	}
	assertLinuxContainmentChildGone(t, childPIDPath)
	assertNoArtifacts(t, projectDirectory)
}

func TestRunCancellationReapsSetsidDescendant(t *testing.T) {
	service, projectDirectory := newLinuxContainmentService(t, 5*time.Second)
	childPIDPath := filepath.Join(projectDirectory, "setsid-cancel-child-pid")
	parentReadyPath := filepath.Join(projectDirectory, "setsid-cancel-parent-ready")
	t.Cleanup(func() { stopLinuxContainmentChild(t, childPIDPath) })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	completed := make(chan error, 1)
	go func() {
		_, err := service.Run(
			ctx,
			Program{ProjectID: "project:runner", Revision: 4, Code: linuxSetsidProgram(childPIDPath, parentReadyPath)},
			Request{},
		)
		completed <- err
	}()
	waitForTestFile(t, parentReadyPath)
	cancel()
	select {
	case err := <-completed:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run() error = %v, want context cancellation", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run() did not return after cancelling a setsid descendant")
	}
	assertLinuxContainmentChildGone(t, childPIDPath)
	assertNoArtifacts(t, projectDirectory)
}

func newLinuxContainmentService(t *testing.T, timeout time.Duration) (*Service, string) {
	t.Helper()
	interpreter := linuxPythonInterpreter(t)
	projectDirectory := t.TempDir()
	service, err := New(Options{
		Interpreter:      interpreter,
		ProjectDirectory: projectDirectory,
		Environment:      os.Environ(),
		DefaultTimeout:   timeout,
		OutputLimit:      1_024,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return service, projectDirectory
}

func linuxPythonInterpreter(t *testing.T) string {
	t.Helper()
	for _, candidate := range []string{"/usr/bin/python3", "python3"} {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path
		}
	}
	t.Skip("python3 is required for Linux process-containment coverage")
	return ""
}

func linuxSetsidProgram(childPIDPath string, parentReadyPath string) string {
	return fmt.Sprintf(`import os
import time

child_pid_path = %q
parent_ready_path = %q
child = os.fork()
if child == 0:
    os.setsid()
    with open(child_pid_path, "w", encoding="utf-8") as marker:
        marker.write(str(os.getpid()))
        marker.flush()
        os.fsync(marker.fileno())
    null = os.open(os.devnull, os.O_RDWR)
    os.dup2(null, 1)
    os.dup2(null, 2)
    while True:
        time.sleep(1)

while not os.path.exists(child_pid_path):
    time.sleep(0.01)
if parent_ready_path:
    with open(parent_ready_path, "w", encoding="utf-8") as marker:
        marker.write("ready")
        marker.flush()
        os.fsync(marker.fileno())
    while True:
        time.sleep(1)
os._exit(0)
`, childPIDPath, parentReadyPath)
}

func assertLinuxContainmentChildGone(t *testing.T, path string) {
	t.Helper()
	processID := linuxContainmentChildPID(t, path)
	deadline := time.Now().Add(2 * time.Second)
	for {
		err := syscall.Kill(processID, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if err != nil {
			t.Fatalf("check contained child %d: %v", processID, err)
		}
		if time.Now().After(deadline) {
			t.Fatalf("setsid descendant %d survived guardian cleanup", processID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func stopLinuxContainmentChild(t *testing.T, path string) {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		return
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(contents)))
	if err != nil || processID < 1 {
		return
	}
	if err := syscall.Kill(processID, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		t.Errorf("cleanup setsid descendant %d: %v", processID, err)
	}
}

func linuxContainmentChildPID(t *testing.T, path string) int {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read setsid child PID: %v", err)
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(contents)))
	if err != nil || processID < 1 {
		t.Fatalf("setsid child PID = %q, want positive integer", contents)
	}
	return processID
}
