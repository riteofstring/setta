//go:build !windows

package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestConfigureProcessRequestsIndependentGroup(t *testing.T) {
	command := exec.Command("/bin/sleep", "30")
	configureProcess(command)
	if command.SysProcAttr == nil || !command.SysProcAttr.Setpgid {
		t.Fatalf("process attributes = %#v, want Setpgid", command.SysProcAttr)
	}
}

func TestPOSIXOwnedProcessFinalizesTheLaunchProcessGroup(t *testing.T) {
	type signalCall struct {
		processID int
		signal    syscall.Signal
	}
	var calls []signalCall
	var sleeps []time.Duration
	owner, err := newPOSIXOwnedProcessForPID(4242, posixProcessOperations{
		kill: func(processID int, signal syscall.Signal) error {
			calls = append(calls, signalCall{processID: processID, signal: signal})
			if signal == syscall.SIGKILL {
				return syscall.ESRCH
			}
			return nil
		},
		sleep:          func(duration time.Duration) { sleeps = append(sleeps, duration) },
		currentProcess: func() int { return 1 },
		currentGroup:   func() int { return 2 },
	})
	if err != nil {
		t.Fatalf("newPOSIXOwnedProcessForPID() error = %v", err)
	}
	if err := owner.finalize(); err != nil {
		t.Fatalf("finalize() error = %v", err)
	}
	if len(calls) != 2 || calls[0] != (signalCall{processID: -4242, signal: syscall.SIGTERM}) || calls[1] != (signalCall{processID: -4242, signal: syscall.SIGKILL}) {
		t.Fatalf("process-group signals = %#v", calls)
	}
	if len(sleeps) != 1 || sleeps[0] != processTerminationGrace {
		t.Fatalf("termination grace = %#v, want %s", sleeps, processTerminationGrace)
	}
}

func TestRunFinalizesBackgroundChildAfterNormalRootExit(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 1_024)
	backgroundPID := filepath.Join(projectDirectory, "runner-background-pid")
	t.Cleanup(func() { stopTestBackground(t, backgroundPID) })

	result, err := service.Run(
		context.Background(),
		Program{ProjectID: "project:runner", Revision: 4, Code: "normal-background"},
		Request{},
	)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Termination != TerminationExited || result.ExitCode == nil || *result.ExitCode != 0 {
		t.Fatalf("normal-root result = %#v", result)
	}
	waitForTestFile(t, filepath.Join(projectDirectory, "runner-background-ready"))
	waitForTestFile(t, filepath.Join(projectDirectory, "runner-background-terminated"))
	assertNoArtifacts(t, projectDirectory)
}

func TestRunBoundsInheritedOutputAfterNormalRootExit(t *testing.T) {
	service, projectDirectory := newTestService(t, 100*time.Millisecond, 1_024)
	backgroundPID := filepath.Join(projectDirectory, "runner-inherited-background-pid")
	t.Cleanup(func() { stopTestBackground(t, backgroundPID) })

	started := time.Now()
	result, err := service.Run(
		context.Background(),
		Program{ProjectID: "project:runner", Revision: 4, Code: "normal-inherited-background"},
		Request{},
	)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Termination != TerminationTimedOut || result.ExitCode != nil {
		t.Fatalf("inherited-output result = %#v", result)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("Run() did not bound inherited-output drain: %s", elapsed)
	}
	waitForTestFile(t, filepath.Join(projectDirectory, "runner-inherited-background-ready"))
	if runtime.GOOS == "darwin" {
		assertTestBackgroundGone(t, backgroundPID)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestExecutionMonitorCancellationDoesNotDeadlockWhenHeldPipesOutliveFailedTreeTermination(t *testing.T) {
	treeErr := errors.New("tree termination unavailable")
	monitor, cancel, result := newHeldOutputMonitor(t, 5*time.Second, &testOwnedProcess{terminateErr: treeErr})
	cancel()
	select {
	case outcome := <-result:
		runErr := errors.Join(outputCaptureError(outcome.stdout, outcome.stderr), monitor.resultError())
		if !errors.Is(runErr, context.Canceled) || !errors.Is(runErr, treeErr) {
			t.Fatalf("Run() error = %v, want cancellation and tree errors", runErr)
		}
		if errors.Is(runErr, os.ErrClosed) {
			t.Fatalf("Run() error = %v, want forced pipe closure to remain structured", runErr)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() deadlocked after tree termination left output pipes open")
	}
}

func TestExecutionMonitorBoundsHeldPipeDrainAfterSuccessfulTreeTermination(t *testing.T) {
	monitor, _, result := newHeldOutputMonitor(t, 100*time.Millisecond, &testOwnedProcess{})
	select {
	case outcome := <-result:
		if runErr := errors.Join(outputCaptureError(outcome.stdout, outcome.stderr), monitor.resultError()); runErr != nil {
			t.Fatalf("Run() error = %v", runErr)
		}
		terminationResult, err := buildResult(
			Program{ProjectID: "project:runner", Revision: 4},
			outcome.stdout,
			outcome.stderr,
			outcome.waitErr,
			monitor.termination.reason,
			0,
		)
		if err != nil {
			t.Fatalf("buildResult() error = %v", err)
		}
		if terminationResult.Termination != TerminationTimedOut || terminationResult.ExitCode != nil {
			t.Fatalf("termination result = %#v", terminationResult)
		}
		if !terminationResult.StdoutTruncated || !terminationResult.StderrTruncated {
			t.Fatalf("forced pipe closure must mark both streams truncated: %#v", terminationResult)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("monitor did not bound pipe draining after successful tree termination")
	}
}

func TestExecutionMonitorStartsWaitOnlyAfterBothCapturesComplete(t *testing.T) {
	command := exec.Command("/bin/sh", "-c", "exit 0")
	if err := command.Start(); err != nil {
		t.Fatalf("start completed process: %v", err)
	}
	stdoutResult := make(chan outputCapture)
	stderrResult := make(chan outputCapture)
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	monitor := newExecutionMonitor(startedExecution{
		command:      command,
		limitReached: make(chan struct{}, 2),
		stdoutResult: stdoutResult,
		stderrResult: stderrResult,
	}, timer, context.Background())
	t.Cleanup(func() {
		if monitor.waitResult == nil && command.Process != nil {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})

	monitor.acceptStdout(outputCapture{bytes: []byte("stdout")})
	if monitor.waitResult != nil {
		t.Fatal("Wait() started before stderr capture completed")
	}
	monitor.acceptStderr(outputCapture{bytes: []byte("stderr")})
	if monitor.waitResult == nil {
		t.Fatal("Wait() did not start after both captures completed")
	}
	select {
	case waitErr := <-monitor.waitResult:
		if waitErr != nil {
			t.Fatalf("Wait() error = %v", waitErr)
		}
	case <-time.After(time.Second):
		t.Fatal("Wait() did not complete after both captures completed")
	}
}

func TestBuildResultOmitsNumericExitCodeForEnforcedTermination(t *testing.T) {
	command := exec.Command("/bin/sh", "-c", "exit 9")
	waitErr := command.Run()
	if waitErr == nil {
		t.Fatal("fake interpreter exit unexpectedly succeeded")
	}
	if _, ok := waitErr.(*exec.ExitError); !ok {
		t.Fatalf("wait error = %T, want *exec.ExitError", waitErr)
	}
	for _, termination := range []TerminationReason{TerminationTimedOut, TerminationOutputLimit, TerminationSignaled} {
		result, err := buildResult(
			Program{ProjectID: "project:runner", Revision: 4},
			outputCapture{},
			outputCapture{},
			waitErr,
			termination,
			0,
		)
		if err != nil {
			t.Fatalf("buildResult() error = %v", err)
		}
		if result.ExitCode != nil || result.Termination != termination {
			t.Fatalf("termination %q result = %#v", termination, result)
		}
	}
}

func TestStopOwnedProcessDoesNotKillAcknowledgedPrivateGuardian(t *testing.T) {
	command := exec.Command("/bin/sleep", "30")
	if err := command.Start(); err != nil {
		t.Fatalf("start acknowledged guardian: %v", err)
	}
	t.Cleanup(func() {
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		_ = command.Wait()
	})
	owner := &acknowledgedTestGuardian{}

	if err := stopOwnedProcess(command, owner); err != nil {
		t.Fatalf("stopOwnedProcess() error = %v", err)
	}
	if !owner.acknowledged {
		t.Fatal("guardian acknowledgement was not observed")
	}
	if err := command.Process.Signal(syscall.Signal(0)); err != nil {
		t.Fatalf("direct guardian was killed after acknowledgement: %v", err)
	}
}

type monitorOutcome struct {
	stdout  outputCapture
	stderr  outputCapture
	waitErr error
}

func newHeldOutputMonitor(t *testing.T, timeout time.Duration, owner ownedProcess) (*executionMonitor, context.CancelFunc, <-chan monitorOutcome) {
	t.Helper()
	stdoutReader, stdoutWriter := newTestOutputPipe(t)
	stderrReader, stderrWriter := newTestOutputPipe(t)
	command := exec.Command("/bin/sleep", "30")
	// These parent-owned writers keep both reads open after /bin/sleep dies.
	// They model inherited descriptors retained by an escaped descendant without
	// creating an orphaned process group in the governed test itself.
	command.Stdout = stdoutWriter
	command.Stderr = stderrWriter
	if err := command.Start(); err != nil {
		t.Fatalf("start held-output process: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	timer := time.NewTimer(timeout)
	limitReached := make(chan struct{}, 2)
	monitor := newExecutionMonitor(startedExecution{
		command:      command,
		owner:        owner,
		pipes:        outputPipes{stdout: stdoutReader, stderr: stderrReader},
		limitReached: limitReached,
		stdoutResult: captureOutput(stdoutReader, 1_024, limitReached),
		stderrResult: captureOutput(stderrReader, 1_024, limitReached),
	}, timer, ctx)
	result := make(chan monitorOutcome, 1)
	done := make(chan struct{})
	go func() {
		stdout, stderr, waitErr := monitor.wait()
		result <- monitorOutcome{stdout: stdout, stderr: stderr, waitErr: waitErr}
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		_ = stdoutWriter.Close()
		_ = stderrWriter.Close()
		_ = stdoutReader.Close()
		_ = stderrReader.Close()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			if command.Process != nil {
				_ = command.Process.Kill()
			}
			t.Errorf("held-output monitor did not stop during cleanup")
		}
	})
	return monitor, cancel, result
}

func newTestOutputPipe(t *testing.T) (*os.File, *os.File) {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create held-output pipe: %v", err)
	}
	return reader, writer
}

func stopTestBackground(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil || processID < 1 {
		return
	}
	if err := syscall.Kill(processID, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		t.Errorf("cleanup background child %d: %v", processID, err)
	}
}

func assertTestBackgroundGone(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read background child PID: %v", err)
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil || processID < 1 {
		t.Fatalf("background child PID = %q, want positive integer", data)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		err := syscall.Kill(processID, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if err != nil {
			t.Fatalf("check background child %d: %v", processID, err)
		}
		if time.Now().After(deadline) {
			t.Fatalf("TERM-ignoring background child %d survived Darwin group cleanup", processID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

type acknowledgedTestGuardian struct {
	acknowledged bool
}

func (guardian *acknowledgedTestGuardian) terminate() error {
	guardian.acknowledged = true
	return nil
}

func (guardian *acknowledgedTestGuardian) finalize() error {
	return nil
}

func (guardian *acknowledgedTestGuardian) ownsCommandTermination() bool {
	return guardian.acknowledged
}
