package runner

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestRunCapturesSeparateOutputAndNonzeroExit(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 1024)
	result, err := service.Run(context.Background(), Program{ProjectID: "project:runner", Revision: 4, Code: "separate"}, Request{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.ProjectID != "project:runner" || result.Revision != 4 {
		t.Fatalf("result identity = %#v", result)
	}
	if result.Stdout != "stdout marker\n" || result.Stderr != "stderr marker\n" {
		t.Fatalf("result output = stdout %q stderr %q", result.Stdout, result.Stderr)
	}
	if result.ExitCode == nil || *result.ExitCode != 7 || result.Termination != TerminationExited {
		t.Fatalf("result exit = %#v", result)
	}
	if result.StdoutTruncated || result.StderrTruncated || result.Elapsed < 0 {
		t.Fatalf("result metadata = %#v", result)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunCapturesHighOutputFromBothPipes(t *testing.T) {
	const outputSize = 128 * 1024
	service, projectDirectory := newTestService(t, 5*time.Second, outputSize+1)
	result, err := service.Run(context.Background(), Program{ProjectID: "project:runner", Revision: 4, Code: "high-output"}, Request{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Stdout != strings.Repeat("o", outputSize) || result.Stderr != strings.Repeat("e", outputSize) {
		t.Fatalf("captured output sizes = stdout %d stderr %d", len(result.Stdout), len(result.Stderr))
	}
	if result.StdoutTruncated || result.StderrTruncated || result.ExitCode == nil || *result.ExitCode != 0 || result.Termination != TerminationExited {
		t.Fatalf("high output result = %#v", result)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunTerminatesOnTimeoutAndCleansArtifact(t *testing.T) {
	service, projectDirectory := newTestService(t, 80*time.Millisecond, 1024)
	result, err := service.Run(context.Background(), Program{ProjectID: "project:runner", Revision: 4, Code: "timeout"}, Request{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Termination != TerminationTimedOut || result.ExitCode != nil {
		t.Fatalf("timeout result = %#v", result)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunTerminatesOnPerStreamOutputLimitAndRetainsBoundedOutput(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 257)
	result, err := service.Run(context.Background(), Program{ProjectID: "project:runner", Revision: 4, Code: "limit"}, Request{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Termination != TerminationOutputLimit || !result.StdoutTruncated || len(result.Stdout) != 257 {
		t.Fatalf("output-limited result = %#v", result)
	}
	if result.Stderr != "" || result.StderrTruncated {
		t.Fatalf("unexpected stderr capture = %#v", result)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunCancellationTerminatesOwnedProcessAndReturnsContextError(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 1024)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := service.Run(ctx, Program{ProjectID: "project:runner", Revision: 4, Code: "timeout"}, Request{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context cancellation", err)
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunCancellationDuringExecutionTerminatesOwnedProcessAndReturnsContextError(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 1024)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() {
		_, err := service.Run(ctx, Program{ProjectID: "project:runner", Revision: 4, Code: "cancellable"}, Request{})
		result <- err
	}()
	waitForTestFile(t, filepath.Join(projectDirectory, "runner-started"))
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run() error = %v, want context cancellation", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run() did not return after context cancellation")
	}
	assertNoArtifacts(t, projectDirectory)
}

func TestRunMakesArtifactCleanupFailureObservable(t *testing.T) {
	service, projectDirectory := newTestService(t, 2*time.Second, 1024)
	cleanupErr := errors.New("remove denied")
	service.removeArtifact = func(artifact) error { return cleanupErr }

	result, err := service.Run(context.Background(), Program{ProjectID: "project:runner", Revision: 4, Code: "separate"}, Request{})
	if !errors.Is(err, cleanupErr) {
		t.Fatalf("Run() error = %v, want cleanup failure", err)
	}
	if result != (Result{}) {
		t.Fatalf("Run() returned successful result despite cleanup failure: %#v", result)
	}
	artifacts, globErr := filepath.Glob(filepath.Join(projectDirectory, ".setta-ai-run-*.py"))
	if globErr != nil || len(artifacts) != 1 {
		t.Fatalf("artifact visibility = %v, %v", artifacts, globErr)
	}
	if removeErr := os.Remove(artifacts[0]); removeErr != nil {
		t.Fatalf("test cleanup artifact: %v", removeErr)
	}
}

func TestCaptureOutputKeepsUnexpectedClosedPipeFailure(t *testing.T) {
	capture := <-captureOutput(closedOutputReader{}, 1, make(chan struct{}, 1))
	if !errors.Is(capture.err, os.ErrClosed) {
		t.Fatalf("capture error = %v, want closed-pipe failure", capture.err)
	}
	if capture.truncated {
		t.Fatalf("capture = %#v, want no truncation", capture)
	}
}

func TestBuildResultRejectsUnexpectedWaitFailure(t *testing.T) {
	waitErr := errors.New("wait failed")
	result, err := buildResult(
		Program{ProjectID: "project:runner", Revision: 4},
		outputCapture{},
		outputCapture{},
		waitErr,
		TerminationExited,
		0,
	)
	if !errors.Is(err, waitErr) {
		t.Fatalf("buildResult() error = %v, want wait failure", err)
	}
	if result != (Result{}) {
		t.Fatalf("buildResult() result = %#v, want no synthetic completion", result)
	}
}

func TestTerminationStateKeepsTheFirstEnforcedReasonAcrossMultipleSignals(t *testing.T) {
	state := terminationState{}
	terminationCalls := 0
	for _, reason := range []TerminationReason{
		TerminationOutputLimit,
		TerminationOutputLimit,
		TerminationTimedOut,
		TerminationSignaled,
	} {
		if state.enforce(reason) {
			terminationCalls++
		}
	}
	if terminationCalls != 1 || state.reason != TerminationOutputLimit {
		t.Fatalf("termination state = calls %d reason %q", terminationCalls, state.reason)
	}
}

func TestCleanupOwnedProcessMakesFinalizationFailureObservable(t *testing.T) {
	cleanupErr := errors.New("close process group")
	result := Result{Termination: TerminationExited}
	var runErr error
	owner := &testOwnedProcess{finalizeErr: cleanupErr}

	cleanupOwnedProcess(owner, &result, &runErr)

	if !errors.Is(runErr, cleanupErr) {
		t.Fatalf("cleanup error = %v, want finalization failure", runErr)
	}
	if result != (Result{}) {
		t.Fatalf("cleanup retained successful result: %#v", result)
	}
	if owner.finalizeCalls != 1 {
		t.Fatalf("owner finalizations = %d, want 1", owner.finalizeCalls)
	}
}

func TestCleanupExecutionJoinsOwnerAndLaunchFailures(t *testing.T) {
	ownerErr := errors.New("close process group")
	launchErr := errors.New("close guardian input")
	result := Result{Termination: TerminationExited}
	var runErr error
	owner := &testOwnedProcess{finalizeErr: ownerErr}

	cleanupExecution(owner, func() error { return launchErr }, &result, &runErr)

	if !errors.Is(runErr, ownerErr) || !errors.Is(runErr, launchErr) {
		t.Fatalf("cleanup error = %v, want owner and launch failures", runErr)
	}
	if result != (Result{}) {
		t.Fatalf("cleanup retained successful result: %#v", result)
	}
	if owner.finalizeCalls != 1 {
		t.Fatalf("owner finalizations = %d, want 1", owner.finalizeCalls)
	}
}

func TestNewRequiresExplicitInterpreterAndProjectDirectory(t *testing.T) {
	projectDirectory := t.TempDir()
	if _, err := New(Options{ProjectDirectory: projectDirectory}); !errors.Is(err, ErrInterpreterRequired) {
		t.Fatalf("missing interpreter error = %v", err)
	}
	interpreter := writeTestInterpreter(t, projectDirectory)
	if _, err := New(Options{Interpreter: interpreter}); !errors.Is(err, ErrProjectDirectoryRequired) {
		t.Fatalf("missing project directory error = %v", err)
	}
	if _, err := New(Options{Interpreter: interpreter, ProjectDirectory: projectDirectory, DefaultTimeout: -time.Second}); !errors.Is(err, ErrInvalidTimeout) {
		t.Fatalf("invalid timeout error = %v", err)
	}
	if _, err := New(Options{Interpreter: interpreter, ProjectDirectory: projectDirectory, OutputLimit: -1}); !errors.Is(err, ErrInvalidOutputLimit) {
		t.Fatalf("invalid output limit error = %v", err)
	}
}

func TestNewUsesTheBoundedDefaultExecutionPolicy(t *testing.T) {
	projectDirectory := t.TempDir()
	service, err := New(Options{
		Interpreter:      writeTestInterpreter(t, projectDirectory),
		ProjectDirectory: projectDirectory,
		Environment:      []string{"PATH=/usr/bin:/bin"},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if service.defaultTimeout != DefaultTimeout || service.outputLimit != DefaultOutputLimit {
		t.Fatalf("default runner policy = timeout %s output %d", service.defaultTimeout, service.outputLimit)
	}
}

func newTestService(t *testing.T, timeout time.Duration, outputLimit int) (*Service, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the shell-script fake interpreter is Unix-only")
	}
	projectDirectory := t.TempDir()
	interpreter := writeTestInterpreter(t, projectDirectory)
	service, err := New(Options{
		Interpreter:      interpreter,
		ProjectDirectory: projectDirectory,
		Environment:      []string{"PATH=/usr/bin:/bin"},
		DefaultTimeout:   timeout,
		OutputLimit:      outputLimit,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return service, projectDirectory
}

func writeTestInterpreter(t *testing.T, directory string) string {
	t.Helper()
	path := filepath.Join(directory, "fake-python")
	contents := `#!/bin/sh
mode=$(cat "$1")
case "$mode" in
  separate)
    printf 'stdout marker\n'
    printf 'stderr marker\n' >&2
    exit 7
    ;;
  timeout)
    exec sleep 30
    ;;
  limit)
    while :; do printf x; done
    ;;
  cancellable)
    : > runner-started
    exec sleep 30
    ;;
  high-output)
    dd if=/dev/zero bs=1024 count=128 2>/dev/null | tr '\000' o
    dd if=/dev/zero bs=1024 count=128 2>/dev/null | tr '\000' e >&2
    ;;
  normal-background)
    (
      trap ': > runner-background-terminated; exit 0' TERM
      : > runner-background-ready
      while :; do :; done
    ) </dev/null >/dev/null 2>&1 &
    child=$!
    while [ ! -f runner-background-ready ]; do :; done
    printf '%s\n' "$child" > runner-background-pid
    exit 0
    ;;
  normal-inherited-background)
    (
      trap '' TERM
      : > runner-inherited-background-ready
      while :; do :; done
    ) &
    child=$!
    while [ ! -f runner-inherited-background-ready ]; do :; done
    printf '%s\n' "$child" > runner-inherited-background-pid
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`
	if err := os.WriteFile(path, []byte(contents), 0o700); err != nil {
		t.Fatalf("write fake interpreter: %v", err)
	}
	return path
}

type closedOutputReader struct{}

func (closedOutputReader) Read([]byte) (int, error) {
	return 0, os.ErrClosed
}

type testOwnedProcess struct {
	terminateErr   error
	finalizeErr    error
	terminateCalls int
	finalizeCalls  int
}

func (process *testOwnedProcess) terminate() error {
	process.terminateCalls++
	return process.terminateErr
}

func (process *testOwnedProcess) finalize() error {
	process.finalizeCalls++
	return process.finalizeErr
}

func assertNoArtifacts(t *testing.T, directory string) {
	t.Helper()
	artifacts, err := filepath.Glob(filepath.Join(directory, ".setta-ai-run-*.py"))
	if err != nil {
		t.Fatalf("glob artifacts: %v", err)
	}
	if len(artifacts) != 0 {
		t.Fatalf("retained run artifacts = %s", strings.Join(artifacts, ", "))
	}
}

func waitForTestFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
}
