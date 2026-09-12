//go:build windows

package runner

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

const (
	testRunnerJobHandle     = windows.Handle(41)
	testRunnerProcessHandle = windows.Handle(42)
)

var errWindowsProcessInjected = errors.New("injected Windows process failure")

func TestStartWindowsOwnedProcessAssignsRootToKillOnCloseJob(t *testing.T) {
	fixture := newWindowsOwnedProcessFixture("")
	launch := fixture.launch()
	owner, err := startWindowsOwnedProcess(launch, fixture.operations())
	if err != nil {
		t.Fatalf("startWindowsOwnedProcess() error = %v", err)
	}
	if err := launch.activateAfterOwnership(); err != nil {
		t.Fatalf("activateAfterOwnership() error = %v", err)
	}
	if fixture.openedProcessID != 4242 || fixture.assignedJob != testRunnerJobHandle || fixture.assignedProcess != testRunnerProcessHandle {
		t.Fatalf("opened/assigned process = %d %v/%v", fixture.openedProcessID, fixture.assignedJob, fixture.assignedProcess)
	}
	if err := owner.finalize(); err != nil {
		t.Fatalf("finalize() error = %v", err)
	}
	if err := owner.finalize(); err != nil {
		t.Fatalf("second finalize() error = %v", err)
	}
	assertWindowsOwnedProcessCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-command",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"release-guardian",
		"close-job",
	})
}

func TestStartWindowsOwnedProcessRollsBackEveryAcquiredResource(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		stage string
		calls []string
	}{
		{
			name:  "job creation",
			stage: "create-job",
			calls: []string{"create-job", "close-job"},
		},
		{
			name:  "job configuration",
			stage: "set-kill-on-close",
			calls: []string{"create-job", "set-kill-on-close", "close-job"},
		},
		{
			name:  "command startup",
			stage: "start-command",
			calls: []string{"create-job", "set-kill-on-close", "start-command", "close-job", "cleanup-command"},
		},
		{
			name:  "root process open",
			stage: "open-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-command", "open-root-process", "close-job", "cleanup-command"},
		},
		{
			name:  "root process assignment",
			stage: "assign-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-command", "open-root-process", "assign-root-process", "close-root-process", "close-job", "cleanup-command"},
		},
		{
			name:  "root process handle release",
			stage: "close-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-command", "open-root-process", "assign-root-process", "close-root-process", "close-root-process", "close-job", "cleanup-command"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newWindowsOwnedProcessFixture(testCase.stage)
			if _, err := startWindowsOwnedProcess(fixture.launch(), fixture.operations()); !errors.Is(err, errWindowsProcessInjected) {
				t.Fatalf("startWindowsOwnedProcess() error = %v, want injected failure", err)
			}
			assertWindowsOwnedProcessCalls(t, fixture.calls, testCase.calls)
		})
	}
}

func TestWindowsOwnedProcessCloseFailureTerminatesWholeJobAndRetriesClosure(t *testing.T) {
	fixture := newWindowsOwnedProcessFixture("")
	fixture.closeJobFailures = 1
	launch := fixture.launch()
	owner, err := startWindowsOwnedProcess(launch, fixture.operations())
	if err != nil {
		t.Fatalf("startWindowsOwnedProcess() error = %v", err)
	}
	if err := launch.activateAfterOwnership(); err != nil {
		t.Fatalf("activateAfterOwnership() error = %v", err)
	}
	if err := owner.finalize(); !errors.Is(err, errWindowsProcessInjected) {
		t.Fatalf("first finalize() error = %v, want close failure", err)
	}
	if err := owner.finalize(); err != nil {
		t.Fatalf("retry finalize() error = %v", err)
	}
	assertWindowsOwnedProcessCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-command",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"release-guardian",
		"close-job",
		"terminate-job",
		"close-job",
	})
}

func TestWindowsOwnedProcessReportsJobCloseAndTerminationFailures(t *testing.T) {
	fixture := newWindowsOwnedProcessFixture("")
	fixture.closeJobFailures = 1
	fixture.terminateJobErr = errors.New("terminate job denied")
	launch := fixture.launch()
	owner, err := startWindowsOwnedProcess(launch, fixture.operations())
	if err != nil {
		t.Fatalf("startWindowsOwnedProcess() error = %v", err)
	}
	if err := launch.activateAfterOwnership(); err != nil {
		t.Fatalf("activateAfterOwnership() error = %v", err)
	}
	if err := owner.finalize(); !errors.Is(err, errWindowsProcessInjected) || !errors.Is(err, fixture.terminateJobErr) {
		t.Fatalf("finalize() error = %v, want close and termination failures", err)
	}
	assertWindowsOwnedProcessCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-command",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"release-guardian",
		"close-job",
		"terminate-job",
	})
}

func TestKillOnCloseJobInformationRequestsTreeTermination(t *testing.T) {
	information := killOnCloseJobInformation()
	if information.BasicLimitInformation.LimitFlags&windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE == 0 {
		t.Fatalf("job limit flags = %#x, want kill on close", information.BasicLimitInformation.LimitFlags)
	}
}

func TestWindowsGuardianPreservesInterpreterAndArtifactArguments(t *testing.T) {
	interpreter := `C:\setta path\π&%!\python.exe`
	artifact := `generated & 你好.py`
	environment := []string{`PATH=C:\Python`, "LANG=en_US.UTF-8"}
	launch, err := prepareProcessLaunch(interpreter, artifact, `C:\project path\α`, environment)
	if err != nil {
		t.Fatalf("prepareProcessLaunch() error = %v", err)
	}
	t.Cleanup(func() {
		if launch.cleanup != nil {
			_ = launch.cleanup()
		}
	})
	want := []string{interpreter, "-I", "-S", "-c", windowsGuardianPrelude, interpreter, artifact}
	if !slices.Equal(launch.command.Args, want) {
		t.Fatalf("guardian argv = %q, want %q", launch.command.Args, want)
	}
	if launch.command.Dir != `C:\project path\α` || !slices.Equal(launch.command.Env, environment) {
		t.Fatalf("guardian command boundary = dir %q env %q", launch.command.Dir, launch.command.Env)
	}
	readIndex := strings.Index(windowsGuardianPrelude, "sys.stdin.buffer.read(1)")
	spawnIndex := strings.Index(windowsGuardianPrelude, "nt.spawnv(nt.P_WAIT")
	if readIndex < 0 || spawnIndex < 0 || readIndex > spawnIndex {
		t.Fatalf("guardian prelude does not wait before launching the artifact child: %q", windowsGuardianPrelude)
	}
	if strings.Contains(windowsGuardianPrelude, "nt.execv") {
		t.Fatalf("guardian prelude overlays the Job-owned root instead of supervising the artifact child: %q", windowsGuardianPrelude)
	}
	if !strings.Contains(windowsGuardianPrelude, "==b'\\x01' or sys.exit(125)") {
		t.Fatalf("guardian prelude accepts EOF or an unexpected release token: %q", windowsGuardianPrelude)
	}
	if !strings.HasPrefix(windowsGuardianPrelude, "import sys,nt;") || strings.Contains(windowsGuardianPrelude, "os.") {
		t.Fatalf("guardian prelude imports project-resolved modules: %q", windowsGuardianPrelude)
	}
	if !strings.Contains(windowsGuardianPrelude, "nt.open('NUL',nt.O_RDONLY)") || !strings.Contains(windowsGuardianPrelude, "nt.dup2(null,0)") {
		t.Fatalf("guardian prelude does not give the artifact child NUL stdin: %q", windowsGuardianPrelude)
	}
}

func TestWindowsGuardianActivationFailureClosesInput(t *testing.T) {
	writeErr := errors.New("guardian release write denied")
	closeErr := errors.New("guardian input close denied")
	input := &fakeWindowsGuardianInput{writeErr: writeErr, closeErr: closeErr}
	release, cleanup := windowsGuardianInput(input)
	if err := release(windowsGuardianReleaseToken); !errors.Is(err, writeErr) || !errors.Is(err, closeErr) {
		t.Fatalf("activate() error = %v, want write and close failures", err)
	}
	if input.writes != 1 || input.closes != 1 || string(input.data) != windowsGuardianReleaseToken {
		t.Fatalf("guardian input lifecycle = writes %d closes %d data %q", input.writes, input.closes, input.data)
	}
	if err := cleanup(); !errors.Is(err, closeErr) {
		t.Fatalf("cleanup() error = %v, want retained close failure", err)
	}
	if input.closes != 1 {
		t.Fatalf("guardian input closed %d times, want one", input.closes)
	}
}

func TestActivationFailureTerminatesAssignedGuardian(t *testing.T) {
	fixture := newWindowsOwnedProcessFixture("release-guardian")
	fixture.closeJobFailures = 1
	launch := fixture.launch()
	owner, err := startWindowsOwnedProcess(launch, fixture.operations())
	if err != nil {
		t.Fatalf("startWindowsOwnedProcess() error = %v", err)
	}
	activationErr := launch.activateAfterOwnership()
	if !errors.Is(activationErr, errWindowsProcessInjected) {
		t.Fatalf("activateAfterOwnership() error = %v, want injected failure", activationErr)
	}
	if err := cleanupActivationError(activationErr, nil, owner); !errors.Is(err, errWindowsProcessInjected) {
		t.Fatalf("cleanupActivationError() error = %v, want activation failure", err)
	}
	assertWindowsOwnedProcessCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-command",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"release-guardian",
		"close-job",
		"terminate-job",
		"close-job",
	})
}

func TestWindowsGuardianRequiresExactReleaseToken(t *testing.T) {
	interpreter, err := findWindowsTestPython()
	if err != nil {
		t.Skipf("Python interpreter is unavailable: %v", err)
	}
	directory := t.TempDir()
	artifact := filepath.Join(directory, "guardian-artifact.py")
	if err := os.WriteFile(artifact, []byte("from pathlib import Path\nPath('guardian-ran').write_text('yes')\n"), 0o600); err != nil {
		t.Fatalf("write guardian artifact: %v", err)
	}
	for _, testCase := range []struct {
		name         string
		token        string
		exitCode     int
		artifactRuns bool
	}{
		{name: "end of file", token: "", exitCode: windowsGuardianFailureCode},
		{name: "wrong token", token: "\x02", exitCode: windowsGuardianFailureCode},
		{name: "exact token", token: windowsGuardianReleaseToken, exitCode: 0, artifactRuns: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			marker := filepath.Join(directory, "guardian-ran")
			if err := os.Remove(marker); err != nil && !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("reset guardian marker: %v", err)
			}
			guardian, err := prepareWindowsGuardianLaunch(interpreter, artifact, directory, os.Environ())
			if err != nil {
				t.Fatalf("prepareWindowsGuardianLaunch() error = %v", err)
			}
			guardian.command.Stdout = io.Discard
			guardian.command.Stderr = io.Discard
			t.Cleanup(func() {
				if guardian.command.ProcessState == nil && guardian.command.Process != nil {
					_ = guardian.command.Process.Kill()
					_ = guardian.command.Wait()
				}
				_ = guardian.cleanup()
			})
			if err := guardian.command.Start(); err != nil {
				t.Fatalf("start guardian: %v", err)
			}
			if err := guardian.release(testCase.token); err != nil {
				t.Fatalf("release guardian: %v", err)
			}
			if err := guardian.command.Wait(); !windowsGuardianExitedWith(err, testCase.exitCode) {
				t.Fatalf("guardian wait error = %v, want exit %d", err, testCase.exitCode)
			}
			_, markerErr := os.Stat(marker)
			if testCase.artifactRuns && markerErr != nil {
				t.Fatalf("guardian did not run artifact: %v", markerErr)
			}
			if !testCase.artifactRuns && !errors.Is(markerErr, os.ErrNotExist) {
				t.Fatalf("guardian ran artifact before exact release: %v", markerErr)
			}
		})
	}
}

func TestWindowsGuardianStaysAliveAsArtifactSupervisor(t *testing.T) {
	interpreter, err := findWindowsTestPython()
	if err != nil {
		t.Skipf("Python interpreter is unavailable: %v", err)
	}
	directory := t.TempDir()
	parentPath := filepath.Join(directory, "artifact-parent")
	artifact := filepath.Join(directory, "guardian-artifact.py")
	contents := "import os\nimport time\nfrom pathlib import Path\nPath('artifact-parent').write_text(str(os.getppid()))\ntime.sleep(0.2)\n"
	if err := os.WriteFile(artifact, []byte(contents), 0o600); err != nil {
		t.Fatalf("write guardian artifact: %v", err)
	}
	guardian, err := prepareWindowsGuardianLaunch(interpreter, artifact, directory, os.Environ())
	if err != nil {
		t.Fatalf("prepareWindowsGuardianLaunch() error = %v", err)
	}
	guardian.command.Stdout = io.Discard
	guardian.command.Stderr = io.Discard
	t.Cleanup(func() {
		if guardian.command.ProcessState == nil && guardian.command.Process != nil {
			_ = guardian.command.Process.Kill()
			_ = guardian.command.Wait()
		}
		_ = guardian.cleanup()
	})
	if err := guardian.command.Start(); err != nil {
		t.Fatalf("start guardian: %v", err)
	}
	guardianPID := guardian.command.Process.Pid
	if err := guardian.release(windowsGuardianReleaseToken); err != nil {
		t.Fatalf("release guardian: %v", err)
	}
	if err := guardian.command.Wait(); err != nil {
		t.Fatalf("wait for guardian: %v", err)
	}
	parentContents, err := os.ReadFile(parentPath)
	if err != nil {
		t.Fatalf("read artifact parent: %v", err)
	}
	parentPID, err := strconv.Atoi(strings.TrimSpace(string(parentContents)))
	if err != nil {
		t.Fatalf("artifact parent PID = %q: %v", parentContents, err)
	}
	if parentPID != guardianPID {
		t.Fatalf("artifact parent PID = %d, want stable guardian PID %d", parentPID, guardianPID)
	}
}

func TestStartupRollbackRetriesJobCloseAfterTerminationFallback(t *testing.T) {
	fixture := newWindowsOwnedProcessFixture("assign-root-process")
	fixture.closeJobFailures = 1
	if _, err := startWindowsOwnedProcess(fixture.launch(), fixture.operations()); !errors.Is(err, errWindowsProcessInjected) {
		t.Fatalf("startWindowsOwnedProcess() error = %v, want injected failure", err)
	}
	assertWindowsOwnedProcessCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-command",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"close-job",
		"terminate-job",
		"close-job",
		"cleanup-command",
	})
}

func TestRunnerJobTerminatesAssignedRoot(t *testing.T) {
	operations := defaultWindowsOwnedProcessOperations()
	job, err := newWindowsKillOnCloseJob(operations)
	if err != nil {
		t.Fatalf("newWindowsKillOnCloseJob() error = %v", err)
	}
	owner := &windowsOwnedProcess{job: job}
	command := exec.Command("cmd.exe", "/d", "/s", "/c", "ping -n 31 127.0.0.1 >NUL")
	if err := command.Start(); err != nil {
		_ = owner.finalize()
		t.Fatalf("start child process: %v", err)
	}
	process, err := operations.openProcess(uint32(command.Process.Pid))
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = owner.finalize()
		t.Fatalf("open child process: %v", err)
	}
	if err := operations.assignProcess(job.handle, process); err != nil {
		_ = closeWindowsHandle(process, operations)
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = owner.finalize()
		t.Fatalf("assign child process to job: %v", err)
	}
	if err := closeWindowsHandle(process, operations); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = owner.finalize()
		t.Fatalf("release child process handle: %v", err)
	}
	if err := owner.finalize(); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("finalize() error = %v", err)
	}
	waitForWindowsCommandExit(t, command)
}

type windowsOwnedProcessFixture struct {
	stage            string
	calls            []string
	openedProcessID  uint32
	assignedJob      windows.Handle
	assignedProcess  windows.Handle
	closeJobFailures int
	terminateJobErr  error
}

func newWindowsOwnedProcessFixture(stage string) *windowsOwnedProcessFixture {
	return &windowsOwnedProcessFixture{stage: stage}
}

func (fixture *windowsOwnedProcessFixture) launch() processLaunch {
	return processLaunch{
		activate: func() error {
			fixture.record("release-guardian")
			return fixture.errorAt("release-guardian")
		},
	}
}

func (fixture *windowsOwnedProcessFixture) operations() windowsOwnedProcessOperations {
	return windowsOwnedProcessOperations{
		createJob: func() (windows.Handle, error) {
			fixture.record("create-job")
			return testRunnerJobHandle, fixture.errorAt("create-job")
		},
		setKillOnClose: func(windows.Handle) error {
			fixture.record("set-kill-on-close")
			return fixture.errorAt("set-kill-on-close")
		},
		terminateJob: func(windows.Handle, uint32) error {
			fixture.record("terminate-job")
			return fixture.terminateJobErr
		},
		startCommand: func(*exec.Cmd) (uint32, error) {
			fixture.record("start-command")
			return 4242, fixture.errorAt("start-command")
		},
		cleanupCommand: func(*exec.Cmd) error {
			fixture.record("cleanup-command")
			return fixture.errorAt("cleanup-command")
		},
		openProcess: func(processID uint32) (windows.Handle, error) {
			fixture.record("open-root-process")
			fixture.openedProcessID = processID
			return testRunnerProcessHandle, fixture.errorAt("open-root-process")
		},
		assignProcess: func(job windows.Handle, process windows.Handle) error {
			fixture.record("assign-root-process")
			fixture.assignedJob = job
			fixture.assignedProcess = process
			return fixture.errorAt("assign-root-process")
		},
		closeHandle: fixture.closeHandle,
	}
}

func (fixture *windowsOwnedProcessFixture) closeHandle(handle windows.Handle) error {
	switch handle {
	case testRunnerJobHandle:
		fixture.record("close-job")
		if fixture.closeJobFailures > 0 {
			fixture.closeJobFailures--
			return errWindowsProcessInjected
		}
	case testRunnerProcessHandle:
		fixture.record("close-root-process")
		return fixture.errorAt("close-root-process")
	}
	return nil
}

func (fixture *windowsOwnedProcessFixture) errorAt(stage string) error {
	if fixture.stage == stage {
		return errWindowsProcessInjected
	}
	return nil
}

func (fixture *windowsOwnedProcessFixture) record(call string) {
	fixture.calls = append(fixture.calls, call)
}

func waitForWindowsCommandExit(t *testing.T, command *exec.Cmd) {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		_ = command.Process.Kill()
		select {
		case <-done:
		case <-time.After(time.Second):
		}
		t.Fatal("closing the process job did not terminate its assigned process")
	}
}

type fakeWindowsGuardianInput struct {
	writes   int
	closes   int
	data     []byte
	writeErr error
	closeErr error
}

func (input *fakeWindowsGuardianInput) Write(data []byte) (int, error) {
	input.writes++
	input.data = append(input.data, data...)
	return len(data), input.writeErr
}

func (input *fakeWindowsGuardianInput) Close() error {
	input.closes++
	return input.closeErr
}

func findWindowsTestPython() (string, error) {
	for _, name := range []string{"python.exe", "python"} {
		if interpreter, err := exec.LookPath(name); err == nil {
			return interpreter, nil
		}
	}
	return "", errors.New("python executable not found")
}

func windowsGuardianExitedWith(err error, exitCode int) bool {
	if exitCode == 0 {
		return err == nil
	}
	var exitError *exec.ExitError
	return errors.As(err, &exitError) && exitError.ExitCode() == exitCode
}

func assertWindowsOwnedProcessCalls(t *testing.T, got []string, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("lifecycle calls = %q, want %q", got, want)
	}
}
