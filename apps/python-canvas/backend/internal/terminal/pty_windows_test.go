//go:build windows

package terminal

import (
	"context"
	"errors"
	"io"
	"slices"
	"testing"
	"unicode/utf16"

	"golang.org/x/sys/windows"
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
	if fixture.assignedProcessID != 4242 {
		t.Fatalf("assigned process = %d, want 4242", fixture.assignedProcessID)
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
		"new-job",
		"start-suspended-conpty",
		"assign-root-process",
		"resume-root",
		"close-job",
		"close-conpty",
	})
}

func TestWindowsPTYRetainsCloseFailureThroughWait(t *testing.T) {
	fixture := newWindowsPTYFixture("close-job")
	session := &windowsPTY{
		pty: &fakeConPTY{fixture: fixture, processID: 4242},
		job: &fakeWindowsProcessJob{fixture: fixture},
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
	assertWindowsPTYCalls(t, fixture.calls, []string{"close-job", "close-conpty"})
}

func TestStartWindowsPTYRollsBackEveryAcquiredResource(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		stage string
		calls []string
	}{
		{
			name:  "job creation",
			stage: "new-job",
			calls: []string{"new-job"},
		},
		{
			name:  "ConPTY startup",
			stage: "start-conpty",
			calls: []string{"new-job", "start-suspended-conpty", "abort-conpty", "close-job", "close-conpty"},
		},
		{
			name:  "root process assignment",
			stage: "assign-root-process",
			calls: []string{"new-job", "start-suspended-conpty", "assign-root-process", "abort-conpty", "close-job", "close-conpty"},
		},
		{
			name:  "root resume",
			stage: "resume-root",
			calls: []string{"new-job", "start-suspended-conpty", "assign-root-process", "resume-root", "abort-conpty", "close-job", "close-conpty"},
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

type windowsPTYFixture struct {
	stage             string
	pty               *fakeConPTY
	calls             []string
	assignedProcessID int
	configuration     windowsPTYConfiguration
}

func newWindowsPTYFixture(stage string) *windowsPTYFixture {
	fixture := &windowsPTYFixture{stage: stage}
	fixture.pty = &fakeConPTY{fixture: fixture, processID: 4242}
	return fixture
}

func (fixture *windowsPTYFixture) operations() windowsPTYOperations {
	return windowsPTYOperations{
		newJob: func() (windowsProcessJob, error) {
			fixture.record("new-job")
			if err := fixture.errorAt("new-job"); err != nil {
				return nil, err
			}
			return &fakeWindowsProcessJob{fixture: fixture}, nil
		},
		startSuspended: func(_ string, configuration windowsPTYConfiguration) (suspendedConPTY, error) {
			fixture.record("start-suspended-conpty")
			fixture.configuration = configuration
			return fixture.pty, fixture.errorAt("start-conpty")
		},
	}
}

type fakeWindowsProcessJob struct {
	fixture *windowsPTYFixture
}

func (job *fakeWindowsProcessJob) Assign(processID int) error {
	job.fixture.record("assign-root-process")
	job.fixture.assignedProcessID = processID
	return job.fixture.errorAt("assign-root-process")
}

func (job *fakeWindowsProcessJob) Close() error {
	job.fixture.record("close-job")
	return job.fixture.errorAt("close-job")
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
