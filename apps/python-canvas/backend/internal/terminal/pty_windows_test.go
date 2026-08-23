//go:build windows

package terminal

import (
	"context"
	"errors"
	"io"
	"os/exec"
	"slices"
	"testing"
	"time"
	"unicode/utf16"

	"golang.org/x/sys/windows"
)

const (
	testWindowsJobHandle     = windows.Handle(41)
	testWindowsProcessHandle = windows.Handle(42)
)

var errWindowsPTYInjected = errors.New("injected Windows PTY failure")

func TestStartWindowsPTYAssignsRootToKillOnCloseJob(t *testing.T) {
	fixture := newWindowsPTYFixture("")
	configuration := windowsPTYConfiguration{
		directory:   `C:\terminal-工作目录`,
		environment: []string{"PATH=C:\\Python", "SETTA_SECRET=not-command-metadata"},
		columns:     101,
		rows:        37,
	}
	session, err := startWindowsPTY("cmd.exe", configuration, fixture.operations())
	if err != nil {
		t.Fatalf("startWindowsPTY() error = %v", err)
	}
	if fixture.openedProcessID != 4242 || fixture.assignedJob != testWindowsJobHandle || fixture.assignedProcess != testWindowsProcessHandle {
		t.Fatalf("opened/assigned process = %d %v/%v", fixture.openedProcessID, fixture.assignedJob, fixture.assignedProcess)
	}
	if !slices.Equal(fixture.configuration.environment, configuration.environment) || fixture.configuration.directory != configuration.directory || fixture.configuration.columns != configuration.columns || fixture.configuration.rows != configuration.rows {
		t.Fatalf("suspended ConPTY configuration = %#v, want %#v", fixture.configuration, configuration)
	}
	if err := session.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := session.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
	assertWindowsPTYCalls(t, fixture.calls, []string{
		"create-job",
		"set-kill-on-close",
		"start-suspended-conpty",
		"open-root-process",
		"assign-root-process",
		"close-root-process",
		"resume-root",
		"close-job",
		"close-conpty",
	})
}

func TestWindowsPTYRetainsCloseFailureThroughWait(t *testing.T) {
	fixture := newWindowsPTYFixture("close-job")
	session := &windowsPTY{
		pty: &fakeConPTY{fixture: fixture, processID: 4242},
		job: windowsJob{handle: testWindowsJobHandle, closeHandle: fixture.closeHandle, terminateJob: fixture.terminateJob},
	}
	if err := session.Close(); !errors.Is(err, errWindowsPTYInjected) {
		t.Fatalf("Close() error = %v, want retained job close failure", err)
	}
	if err := session.Close(); !errors.Is(err, errWindowsPTYInjected) {
		t.Fatalf("second Close() error = %v, want retained job close failure", err)
	}
	if err := session.Wait(); !errors.Is(err, errWindowsPTYInjected) {
		t.Fatalf("Wait() error = %v, want retained job close failure", err)
	}
	assertWindowsPTYCalls(t, fixture.calls, []string{"close-job", "terminate-job", "close-job", "terminate-job", "close-conpty"})
}

func TestWindowsJobCloseFailureTerminatesThenRetriesHandleRelease(t *testing.T) {
	fixture := newWindowsPTYFixture("")
	fixture.closeJobFailures = 1
	job := windowsJob{
		handle:       testWindowsJobHandle,
		closeHandle:  fixture.closeHandle,
		terminateJob: fixture.terminateJob,
	}
	if err := job.discard(); !errors.Is(err, errWindowsPTYInjected) {
		t.Fatalf("discard job error = %v, want retained initial close failure", err)
	}
	assertWindowsPTYCalls(t, fixture.calls, []string{"close-job", "terminate-job", "close-job"})
}

func TestStartWindowsPTYRollsBackEveryAcquiredResource(t *testing.T) {
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
			name:  "ConPTY startup",
			stage: "start-conpty",
			calls: []string{"create-job", "set-kill-on-close", "start-suspended-conpty", "abort-conpty", "close-job", "close-conpty"},
		},
		{
			name:  "root process open",
			stage: "open-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-suspended-conpty", "open-root-process", "abort-conpty", "close-job", "close-conpty"},
		},
		{
			name:  "root process assignment",
			stage: "assign-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-suspended-conpty", "open-root-process", "assign-root-process", "close-root-process", "abort-conpty", "close-job", "close-conpty"},
		},
		{
			name:  "root process handle release",
			stage: "close-root-process",
			calls: []string{"create-job", "set-kill-on-close", "start-suspended-conpty", "open-root-process", "assign-root-process", "close-root-process", "close-root-process", "close-job", "close-conpty"},
		},
		{
			name:  "root resume",
			stage: "resume-root",
			calls: []string{"create-job", "set-kill-on-close", "start-suspended-conpty", "open-root-process", "assign-root-process", "close-root-process", "resume-root", "close-job", "close-conpty"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newWindowsPTYFixture(testCase.stage)
			if _, err := startWindowsPTY("cmd.exe", windowsPTYConfiguration{}, fixture.operations()); !errors.Is(err, errWindowsPTYInjected) {
				t.Fatalf("startWindowsPTY() error = %v, want injected failure", err)
			}
			assertWindowsPTYCalls(t, fixture.calls, testCase.calls)
		})
	}
}

func TestKillOnCloseJobInformationRequestsTreeTermination(t *testing.T) {
	information := killOnCloseJobInformation()
	if information.BasicLimitInformation.LimitFlags&windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE == 0 {
		t.Fatalf("job limit flags = %#x, want kill on close", information.BasicLimitInformation.LimitFlags)
	}
}

func TestTerminalConPTYEnvironmentBlockUsesCreateProcessContract(t *testing.T) {
	environment := []string{"z=last", "Beta=two", "alpha=one"}
	block, err := terminalConPTYEnvironmentBlock(environment)
	if err != nil {
		t.Fatalf("terminalConPTYEnvironmentBlock() error = %v", err)
	}
	want := utf16.Encode([]rune("alpha=one\x00Beta=two\x00z=last\x00\x00"))
	if !slices.Equal(block, want) {
		t.Fatalf("environment block = %#v, want %#v", block, want)
	}
	if !slices.Equal(environment, []string{"z=last", "Beta=two", "alpha=one"}) {
		t.Fatalf("environment input was modified: %#v", environment)
	}
	empty, err := terminalConPTYEnvironmentBlock([]string{})
	if err != nil {
		t.Fatalf("empty terminalConPTYEnvironmentBlock() error = %v", err)
	}
	if !slices.Equal(empty, []uint16{0, 0}) {
		t.Fatalf("empty environment block = %#v, want two UTF-16 NULs", empty)
	}
	if _, err := terminalConPTYEnvironmentBlock([]string{"PATH=C:\\bin\x00unsafe"}); err == nil {
		t.Fatal("terminalConPTYEnvironmentBlock() error = nil for embedded NUL")
	}
}

func TestDiscardUnassignedTerminalConPTYPreservesEveryRollbackFailure(t *testing.T) {
	terminateErr := errors.New("terminate unassigned root")
	rootCloseErr := errors.New("close root handles")
	pipeCloseErr := errors.New("close pipe handles")
	var calls []string
	err := discardUnassignedTerminalConPTY(
		windows.ProcessInformation{Process: windows.Handle(71), Thread: windows.Handle(72)},
		windows.Handle(73),
		[]windows.Handle{windows.Handle(74), windows.Handle(75)},
		terminalConPTYRollbackOperations{
			terminate: func(handle windows.Handle, exitCode uint32) error {
				if handle != windows.Handle(71) || exitCode != 1 {
					t.Fatalf("terminate unassigned root = (%v, %d)", handle, exitCode)
				}
				calls = append(calls, "terminate")
				return terminateErr
			},
			closeHandles: func(handles ...windows.Handle) error {
				switch {
				case slices.Equal(handles, []windows.Handle{windows.Handle(71), windows.Handle(72)}):
					calls = append(calls, "close-root")
					return rootCloseErr
				case slices.Equal(handles, []windows.Handle{windows.Handle(74), windows.Handle(75)}):
					calls = append(calls, "close-pipes")
					return pipeCloseErr
				default:
					t.Fatalf("close handles = %v", handles)
					return nil
				}
			},
			closePseudoConsole: func(handle windows.Handle) {
				if handle != windows.Handle(73) {
					t.Fatalf("close pseudo console = %v", handle)
				}
				calls = append(calls, "close-pseudo-console")
			},
		},
	)
	for _, want := range []error{terminateErr, rootCloseErr, pipeCloseErr} {
		if !errors.Is(err, want) {
			t.Fatalf("rollback error = %v, want %v", err, want)
		}
	}
	assertWindowsPTYCalls(t, calls, []string{
		"terminate",
		"close-pseudo-console",
		"close-root",
		"close-pipes",
	})
}

func TestSuspendedConPTYCloseLeavesTheStableWaitHandleToItsWaiter(t *testing.T) {
	waitStarted := make(chan struct{})
	releaseWait := make(chan struct{})
	closedWaitHandle := make(chan windows.Handle, 1)
	pty := &suspendedWindowsConPTY{
		waitProcess: windows.Handle(73),
		waitDone:    make(chan struct{}),
		waitOperations: terminalConPTYWaitOperations{
			wait: func(windows.Handle, uint32) (uint32, error) {
				close(waitStarted)
				<-releaseWait
				return uint32(windows.WAIT_OBJECT_0), nil
			},
			exitCode: func(windows.Handle, *uint32) error { return nil },
			close: func(handle windows.Handle) error {
				closedWaitHandle <- handle
				return nil
			},
		},
	}
	go pty.waitForRoot()
	<-waitStarted
	if err := pty.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	select {
	case handle := <-closedWaitHandle:
		t.Fatalf("Close() released wait handle %v while WaitForSingleObject was active", handle)
	default:
	}
	close(releaseWait)
	if _, err := pty.Wait(context.Background()); err != nil {
		t.Fatalf("Wait() error = %v", err)
	}
	if handle := <-closedWaitHandle; handle != pty.waitProcess {
		t.Fatalf("waiter closed handle %v, want %v", handle, pty.waitProcess)
	}
}

func TestKillOnCloseJobTerminatesAssignedRoot(t *testing.T) {
	operations := defaultWindowsPTYOperations()
	job, err := newKillOnCloseJob(operations)
	if err != nil {
		t.Fatalf("newKillOnCloseJob() error = %v", err)
	}
	jobClosed := false
	process := windows.Handle(0)
	processClosed := false
	command := exec.Command("cmd.exe", "/d", "/s", "/c", "ping -n 31 127.0.0.1 >NUL")
	if err := command.Start(); err != nil {
		_ = job.Close()
		t.Fatalf("start child process: %v", err)
	}
	waitStarted := false
	waitFinished := false
	waitDone := make(chan error, 1)
	t.Cleanup(func() {
		if !processClosed {
			_ = closeWindowsHandle(process, operations)
		}
		if !jobClosed {
			_ = job.Close()
		}
		if !waitStarted {
			_ = command.Process.Kill()
			_ = command.Wait()
			return
		}
		if !waitFinished {
			_ = command.Process.Kill()
			select {
			case <-waitDone:
			case <-time.After(time.Second):
			}
		}
	})

	process, err = operations.openProcess(uint32(command.Process.Pid))
	if err != nil {
		t.Fatalf("open child process: %v", err)
	}
	if err := operations.assignProcess(job.handle, process); err != nil {
		t.Fatalf("assign child process to job: %v", err)
	}
	if err := closeWindowsHandle(process, operations); err != nil {
		t.Fatalf("release child process handle: %v", err)
	}
	processClosed = true
	if err := job.Close(); err != nil {
		t.Fatalf("close job: %v", err)
	}
	jobClosed = true
	waitStarted = true
	go func() { waitDone <- command.Wait() }()
	select {
	case <-waitDone:
		waitFinished = true
	case <-time.After(5 * time.Second):
		t.Fatal("closing the job did not terminate its assigned process")
	}
}

type windowsPTYFixture struct {
	stage            string
	pty              *fakeConPTY
	calls            []string
	openedProcessID  uint32
	assignedJob      windows.Handle
	assignedProcess  windows.Handle
	closeJobFailures int
	configuration    windowsPTYConfiguration
}

func newWindowsPTYFixture(stage string) *windowsPTYFixture {
	fixture := &windowsPTYFixture{stage: stage}
	fixture.pty = &fakeConPTY{fixture: fixture, processID: 4242}
	return fixture
}

func (fixture *windowsPTYFixture) operations() windowsPTYOperations {
	return windowsPTYOperations{
		startSuspended: func(_ string, configuration windowsPTYConfiguration) (suspendedConPTY, error) {
			fixture.record("start-suspended-conpty")
			fixture.configuration = configuration
			return fixture.pty, fixture.errorAt("start-conpty")
		},
		createJob: func() (windows.Handle, error) {
			fixture.record("create-job")
			return testWindowsJobHandle, fixture.errorAt("create-job")
		},
		setKillOnClose: func(windows.Handle) error {
			fixture.record("set-kill-on-close")
			return fixture.errorAt("set-kill-on-close")
		},
		terminateJob: fixture.terminateJob,
		openProcess: func(processID uint32) (windows.Handle, error) {
			fixture.record("open-root-process")
			fixture.openedProcessID = processID
			return testWindowsProcessHandle, fixture.errorAt("open-root-process")
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

func (fixture *windowsPTYFixture) terminateJob(windows.Handle, uint32) error {
	fixture.record("terminate-job")
	return fixture.errorAt("terminate-job")
}

func (fixture *windowsPTYFixture) closeHandle(handle windows.Handle) error {
	switch handle {
	case testWindowsJobHandle:
		fixture.record("close-job")
		if fixture.closeJobFailures > 0 {
			fixture.closeJobFailures--
			return errWindowsPTYInjected
		}
		return fixture.errorAt("close-job")
	case testWindowsProcessHandle:
		fixture.record("close-root-process")
		return fixture.errorAt("close-root-process")
	}
	return nil
}

func (fixture *windowsPTYFixture) errorAt(stage string) error {
	if fixture.stage == stage {
		return errWindowsPTYInjected
	}
	return nil
}

func (fixture *windowsPTYFixture) record(call string) {
	fixture.calls = append(fixture.calls, call)
}

type fakeConPTY struct {
	fixture   *windowsPTYFixture
	processID int
}

func (pty *fakeConPTY) Read([]byte) (int, error)       { return 0, io.EOF }
func (pty *fakeConPTY) Write(data []byte) (int, error) { return len(data), nil }
func (pty *fakeConPTY) Resize(int, int) error          { return nil }
func (pty *fakeConPTY) Abort() error {
	pty.fixture.record("abort-conpty")
	return pty.fixture.errorAt("abort-conpty")
}
func (pty *fakeConPTY) Close() error {
	pty.fixture.record("close-conpty")
	return nil
}
func (pty *fakeConPTY) Wait(context.Context) (uint32, error) { return 0, nil }
func (pty *fakeConPTY) Pid() int                             { return pty.processID }
func (pty *fakeConPTY) Resume() error {
	pty.fixture.record("resume-root")
	return pty.fixture.errorAt("resume-root")
}

func assertWindowsPTYCalls(t *testing.T, got []string, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("lifecycle calls = %q, want %q", got, want)
	}
}
