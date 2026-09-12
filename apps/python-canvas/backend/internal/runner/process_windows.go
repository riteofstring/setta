//go:build windows

package runner

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsOwnedProcessOperations struct {
	createJob      func() (windows.Handle, error)
	setKillOnClose func(windows.Handle) error
	terminateJob   func(windows.Handle, uint32) error
	startCommand   func(*exec.Cmd) (uint32, error)
	cleanupCommand func(*exec.Cmd) error
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
		return errors.New("runner: process job close is unavailable")
	}
	if err := job.closeHandle(job.handle); err != nil {
		return job.closeFailure(err)
	}
	return nil
}

func (job windowsJob) closeFailure(closeErr error) error {
	if job.terminateJob == nil {
		return fmt.Errorf("runner: close process job: %w", closeErr)
	}
	if err := job.terminateJob(job.handle, 1); err != nil {
		return errors.Join(
			fmt.Errorf("runner: close process job: %w", closeErr),
			fmt.Errorf("runner: terminate process job after close failure: %w", err),
		)
	}
	return fmt.Errorf("runner: close process job: %w", closeErr)
}

func (job windowsJob) discard() error {
	firstErr := job.Close()
	if firstErr == nil {
		return nil
	}
	if retryErr := job.Close(); retryErr != nil {
		return errors.Join(firstErr, fmt.Errorf("runner: retry close process job: %w", retryErr))
	}
	return firstErr
}

type windowsOwnedProcess struct {
	job    windowsJob
	mutex  sync.Mutex
	closed bool
}

type windowsGuardianLaunch struct {
	command *exec.Cmd
	release func(string) error
	cleanup func() error
}

const (
	windowsGuardianReleaseToken = "\x01"
	windowsGuardianFailureCode  = 125
	windowsGuardianPrelude      = "import sys,nt;sys.stdin.buffer.read(1)==b'\\x01' or sys.exit(125);null=nt.open('NUL',nt.O_RDONLY);nt.dup2(null,0);nt.close(null);sys.exit(nt.spawnv(nt.P_WAIT,sys.argv[1],sys.argv[1:]))"
)

func prepareProcessLaunch(interpreter string, artifact string, directory string, environment []string) (processLaunch, error) {
	guardian, err := prepareWindowsGuardianLaunch(interpreter, artifact, directory, environment)
	if err != nil {
		return processLaunch{}, err
	}
	return processLaunch{
		command:  guardian.command,
		activate: func() error { return guardian.release(windowsGuardianReleaseToken) },
		cleanup:  guardian.cleanup,
	}, nil
}

func prepareWindowsGuardianLaunch(interpreter string, artifact string, directory string, environment []string) (windowsGuardianLaunch, error) {

	command := exec.Command(interpreter, "-I", "-S", "-c", windowsGuardianPrelude, interpreter, artifact)
	command.Dir = directory
	command.Env = append([]string(nil), environment...)
	input, err := command.StdinPipe()
	if err != nil {
		return windowsGuardianLaunch{}, fmt.Errorf("runner: create generated Python guardian input: %w", err)
	}
	release, cleanup := windowsGuardianInput(input)
	return windowsGuardianLaunch{command: command, release: release, cleanup: cleanup}, nil
}

func windowsGuardianInput(input io.WriteCloser) (func(string) error, func() error) {
	var closeOnce sync.Once
	var closeErr error
	closeInput := func() error {
		closeOnce.Do(func() { closeErr = input.Close() })
		return closeErr
	}
	release := func(token string) error {
		_, writeErr := io.WriteString(input, token)
		return errors.Join(writeErr, closeInput())
	}
	return release, closeInput
}

func startOwnedProcess(launch processLaunch) (ownedProcess, error) {
	return startWindowsOwnedProcess(launch, defaultWindowsOwnedProcessOperations())
}

func startWindowsOwnedProcess(launch processLaunch, operations windowsOwnedProcessOperations) (*windowsOwnedProcess, error) {
	command := launch.command
	job, err := newWindowsKillOnCloseJob(operations)
	if err != nil {
		return nil, err
	}
	processID, err := operations.startCommand(command)
	if err != nil {
		return nil, cleanupWindowsOwnedProcessStart(
			fmt.Errorf("runner: start generated Python: %w", err),
			command,
			job,
			operations,
		)
	}
	owner, err := attachWindowsOwnedProcess(job, processID, operations)
	if err != nil {
		return nil, cleanupWindowsOwnedProcessStart(err, command, windowsJob{}, operations)
	}
	return owner, nil
}

func defaultWindowsOwnedProcessOperations() windowsOwnedProcessOperations {
	return windowsOwnedProcessOperations{
		createJob:      createRunnerJob,
		setKillOnClose: setKillOnClose,
		terminateJob:   windows.TerminateJobObject,
		startCommand:   startWindowsCommand,
		cleanupCommand: cleanupStartedCommand,
		openProcess:    openRunnerProcess,
		assignProcess:  windows.AssignProcessToJobObject,
		closeHandle:    windows.CloseHandle,
	}
}

func createRunnerJob() (windows.Handle, error) {
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

func startWindowsCommand(command *exec.Cmd) (uint32, error) {
	if command == nil {
		return 0, errors.New("generated Python command is required")
	}
	configureProcess(command)
	if err := command.Start(); err != nil {
		return 0, err
	}
	if command.Process == nil || command.Process.Pid < 1 {
		return 0, errors.New("generated Python process is unavailable")
	}
	return uint32(command.Process.Pid), nil
}

func configureProcess(*exec.Cmd) {}

func openRunnerProcess(processID uint32) (windows.Handle, error) {
	return windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, processID)
}

func newWindowsKillOnCloseJob(operations windowsOwnedProcessOperations) (windowsJob, error) {
	handle, err := operations.createJob()
	job := windowsJob{handle: handle, closeHandle: operations.closeHandle, terminateJob: operations.terminateJob}
	if err != nil {
		return windowsJob{}, closeWindowsJobError(fmt.Errorf("runner: create generated Python process job: %w", err), job)
	}
	if err := operations.setKillOnClose(handle); err != nil {
		return windowsJob{}, closeWindowsJobError(fmt.Errorf("runner: configure generated Python process job: %w", err), job)
	}
	return job, nil
}

func attachWindowsOwnedProcess(job windowsJob, processID uint32, operations windowsOwnedProcessOperations) (*windowsOwnedProcess, error) {
	if processID < 1 {
		return nil, closeWindowsJobError(errors.New("runner: generated Python process ID is invalid"), job)
	}
	process, err := operations.openProcess(processID)
	if err != nil {
		return nil, closeWindowsJobError(fmt.Errorf("runner: open generated Python process: %w", err), job)
	}
	if err := operations.assignProcess(job.handle, process); err != nil {
		return nil, cleanupWindowsOwnedProcessAttachment(
			fmt.Errorf("runner: assign generated Python process to job: %w", err),
			process,
			job,
			operations,
		)
	}
	if err := closeWindowsHandle(process, operations); err != nil {
		return nil, cleanupWindowsOwnedProcessAttachment(
			fmt.Errorf("runner: release generated Python process handle: %w", err),
			process,
			job,
			operations,
		)
	}
	return &windowsOwnedProcess{job: job}, nil
}

func cleanupWindowsOwnedProcessStart(cause error, command *exec.Cmd, job windowsJob, operations windowsOwnedProcessOperations) error {
	var cleanup []error
	if err := job.discard(); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: close generated Python process job: %w", err))
	}
	if operations.cleanupCommand == nil {
		cleanup = append(cleanup, errors.New("runner: generated Python command cleanup is unavailable"))
	} else if err := operations.cleanupCommand(command); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: stop partially started generated Python: %w", err))
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func cleanupWindowsOwnedProcessAttachment(cause error, process windows.Handle, job windowsJob, operations windowsOwnedProcessOperations) error {
	var cleanup []error
	if err := closeWindowsHandle(process, operations); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: release generated Python process handle: %w", err))
	}
	if err := job.discard(); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: close generated Python process job: %w", err))
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func closeWindowsJobError(cause error, job windowsJob) error {
	if err := job.discard(); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: close generated Python process job: %w", err))
	}
	return cause
}

func closeWindowsHandle(handle windows.Handle, operations windowsOwnedProcessOperations) error {
	if handle == 0 || handle == windows.InvalidHandle {
		return nil
	}
	if operations.closeHandle == nil {
		return errors.New("runner: Windows handle close is unavailable")
	}
	return operations.closeHandle(handle)
}

func (process *windowsOwnedProcess) terminate() error {
	return process.closeJob()
}

func (process *windowsOwnedProcess) finalize() error {
	return process.closeJob()
}

func (process *windowsOwnedProcess) closeJob() error {
	if process == nil {
		return errors.New("runner: generated Python process owner is unavailable")
	}
	process.mutex.Lock()
	defer process.mutex.Unlock()
	if process.closed {
		return nil
	}
	if err := process.job.Close(); err != nil {
		return err
	}
	process.closed = true
	return nil
}
