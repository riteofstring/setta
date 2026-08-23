//go:build windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

type conPTY interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Resize(int, int) error
	Close() error
	Wait(context.Context) (uint32, error)
	Pid() int
}

// suspendedConPTY has created the trusted ConPTY root, but its first thread
// cannot execute the configured shell until Resume succeeds. This closes the
// otherwise unavoidable window between CreateProcess and Job assignment.
type suspendedConPTY interface {
	conPTY
	// Abort stops a newly created root which has not reached Job assignment.
	// CREATE_SUSPENDED prevents user code from running in that interval, but a
	// rollback still has to terminate the otherwise-unowned process.
	Abort() error
	Resume() error
}

type windowsPTYConfiguration struct {
	directory   string
	environment []string
	columns     int
	rows        int
}

type windowsPTYOperations struct {
	startSuspended func(string, windowsPTYConfiguration) (suspendedConPTY, error)
	createJob      func() (windows.Handle, error)
	setKillOnClose func(windows.Handle) error
	terminateJob   func(windows.Handle, uint32) error
	openProcess    func(uint32) (windows.Handle, error)
	assignProcess  func(windows.Handle, windows.Handle) error
	closeHandle    func(windows.Handle) error
}

type windowsJob struct {
	handle       windows.Handle
	closeHandle  func(windows.Handle) error
	terminateJob func(windows.Handle, uint32) error
}

func (job windowsJob) Close() error {
	if job.handle == 0 || job.handle == windows.InvalidHandle {
		return nil
	}
	if job.closeHandle == nil {
		return errors.New("terminal: job close is unavailable")
	}
	if err := job.closeHandle(job.handle); err != nil {
		return job.closeFailure(err)
	}
	return nil
}

func (job windowsJob) closeFailure(closeErr error) error {
	if job.terminateJob == nil {
		return fmt.Errorf("terminal: close process job: %w", closeErr)
	}
	if err := job.terminateJob(job.handle, 1); err != nil {
		return errors.Join(
			fmt.Errorf("terminal: close process job: %w", closeErr),
			fmt.Errorf("terminal: terminate process job after close failure: %w", err),
		)
	}
	return fmt.Errorf("terminal: close process job: %w", closeErr)
}

func (job windowsJob) discard() error {
	firstErr := job.Close()
	if firstErr == nil {
		return nil
	}
	if retryErr := job.Close(); retryErr != nil {
		return errors.Join(firstErr, fmt.Errorf("terminal: retry close process job: %w", retryErr))
	}
	return firstErr
}

type windowsPTY struct {
	pty       conPTY
	job       windowsJob
	closeOnce sync.Once
	closeErr  error
}

func resolveShell(configured []string) ([]string, error) {
	if len(configured) != 0 {
		return resolveCommand(configured)
	}
	return resolveCommand([]string{"cmd.exe"})
}

func resolveCommand(command []string) ([]string, error) {
	if len(command) == 0 || strings.TrimSpace(command[0]) == "" {
		return nil, fmt.Errorf("terminal shell is required")
	}
	path, err := exec.LookPath(command[0])
	if err != nil {
		return nil, fmt.Errorf("resolve terminal shell %q: %w", command[0], err)
	}
	return append([]string{path}, command[1:]...), nil
}

func openPTY(command []string, directory string, environment []string, columns int, rows int) (ptySession, error) {
	commandLine := make([]string, len(command))
	for index, argument := range command {
		commandLine[index] = windows.EscapeArg(argument)
	}
	return startWindowsPTY(
		strings.Join(commandLine, " "),
		windowsPTYConfiguration{directory: directory, environment: append([]string(nil), environment...), columns: columns, rows: rows},
		defaultWindowsPTYOperations(),
	)
}

func startWindowsPTY(commandLine string, configuration windowsPTYConfiguration, operations windowsPTYOperations) (*windowsPTY, error) {
	job, err := newKillOnCloseJob(operations)
	if err != nil {
		return nil, err
	}
	instance, err := operations.startSuspended(commandLine, configuration)
	if err != nil || instance == nil {
		return nil, cleanupWindowsPTYStart(
			startWindowsPTYError(err),
			instance,
			0,
			false,
			job,
			operations,
		)
	}
	process, err := openWindowsPTYRootProcess(instance, operations)
	if err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("open terminal PTY root process: %w", err),
			instance,
			0,
			false,
			job,
			operations,
		)
	}
	if err := operations.assignProcess(job.handle, process); err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("assign terminal PTY root process to job: %w", err),
			instance,
			process,
			false,
			job,
			operations,
		)
	}
	assigned := true
	if err := closeWindowsHandle(process, operations); err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("release terminal PTY root process handle: %w", err),
			instance,
			process,
			assigned,
			job,
			operations,
		)
	}
	if err := instance.Resume(); err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("resume terminal PTY root process: %w", err),
			instance,
			0,
			assigned,
			job,
			operations,
		)
	}
	return &windowsPTY{pty: instance, job: job}, nil
}

func defaultWindowsPTYOperations() windowsPTYOperations {
	return windowsPTYOperations{
		startSuspended: startSuspendedConPTY,
		createJob:      createTerminalJob,
		setKillOnClose: setKillOnClose,
		terminateJob:   windows.TerminateJobObject,
		openProcess:    openTerminalProcess,
		assignProcess:  windows.AssignProcessToJobObject,
		closeHandle:    windows.CloseHandle,
	}
}

func createTerminalJob() (windows.Handle, error) {
	return windows.CreateJobObject(nil, nil)
}

func setKillOnClose(job windows.Handle) error {
	information := killOnCloseJobInformation()
	_, err := windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&information)),
		uint32(unsafe.Sizeof(information)),
	)
	return err
}

func killOnCloseJobInformation() windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
	return windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{
		BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
			LimitFlags: windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
		},
	}
}

func openTerminalProcess(processID uint32) (windows.Handle, error) {
	return windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, processID)
}

func newKillOnCloseJob(operations windowsPTYOperations) (windowsJob, error) {
	handle, err := operations.createJob()
	job := windowsJob{handle: handle, closeHandle: operations.closeHandle, terminateJob: operations.terminateJob}
	if err != nil {
		return windowsJob{}, cleanupWindowsPTYStart(
			fmt.Errorf("create terminal process job: %w", err),
			nil,
			0,
			false,
			job,
			operations,
		)
	}
	if err := operations.setKillOnClose(handle); err != nil {
		return windowsJob{}, cleanupWindowsPTYStart(
			fmt.Errorf("configure terminal process job: %w", err),
			nil,
			0,
			false,
			job,
			operations,
		)
	}
	return job, nil
}

func startWindowsPTYError(err error) error {
	if err != nil {
		return fmt.Errorf("start terminal PTY: %w", err)
	}
	return errors.New("start terminal PTY: no PTY instance returned")
}

func openWindowsPTYRootProcess(instance conPTY, operations windowsPTYOperations) (windows.Handle, error) {
	processID := instance.Pid()
	if processID < 1 {
		return 0, errors.New("terminal PTY root process ID is invalid")
	}
	return operations.openProcess(uint32(processID))
}

func cleanupWindowsPTYStart(
	cause error,
	instance suspendedConPTY,
	process windows.Handle,
	rootAssigned bool,
	job windowsJob,
	operations windowsPTYOperations,
) error {
	var cleanup []error
	if err := closeWindowsHandle(process, operations); err != nil {
		cleanup = append(cleanup, fmt.Errorf("release terminal PTY root process handle: %w", err))
	}
	if instance != nil && !rootAssigned {
		if err := instance.Abort(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("abort unassigned terminal PTY root: %w", err))
		}
	}
	if err := job.discard(); err != nil {
		cleanup = append(cleanup, fmt.Errorf("close terminal process job: %w", err))
	}
	if instance != nil {
		if err := instance.Close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("close terminal PTY: %w", err))
		}
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func closeWindowsHandle(handle windows.Handle, operations windowsPTYOperations) error {
	if handle == 0 || handle == windows.InvalidHandle {
		return nil
	}
	return operations.closeHandle(handle)
}

func (session *windowsPTY) Read(data []byte) (int, error)  { return session.pty.Read(data) }
func (session *windowsPTY) Write(data []byte) (int, error) { return session.pty.Write(data) }
func (session *windowsPTY) Resize(columns int, rows int) error {
	return session.pty.Resize(columns, rows)
}
func (session *windowsPTY) Close() error {
	session.closeOnce.Do(func() {
		session.closeErr = errors.Join(session.job.discard(), session.pty.Close())
	})
	return session.closeErr
}
func (session *windowsPTY) Wait() error {
	_, waitErr := session.pty.Wait(context.Background())
	return errors.Join(waitErr, session.Close())
}

func managedRunCommand(interpreter string, artifact string) string {
	return windowsQuote(interpreter) + " " + windowsQuote(artifact) + "\r\n"
}

func windowsQuote(value string) string { return "\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\"" }
