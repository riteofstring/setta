//go:build windows

package proctree

import (
	"errors"
	"fmt"
	"sync"
	"syscall"
	"unsafe"
)

const (
	windowsJobExtendedLimitInformation = 9
	windowsJobKillOnClose              = 0x00002000
	windowsProcessSetQuota             = 0x0100
)

var (
	windowsKernel                   = syscall.NewLazyDLL("kernel32.dll")
	windowsCreateJobObject          = windowsKernel.NewProc("CreateJobObjectW")
	windowsSetInformationJobObject  = windowsKernel.NewProc("SetInformationJobObject")
	windowsAssignProcessToJobObject = windowsKernel.NewProc("AssignProcessToJobObject")
	windowsTerminateJobObject       = windowsKernel.NewProc("TerminateJobObject")
)

type windowsBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type windowsIOCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

type windowsExtendedLimitInformation struct {
	Basic                 windowsBasicLimitInformation
	IO                    windowsIOCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

type jobOperations struct {
	create    func() (syscall.Handle, error)
	configure func(syscall.Handle) error
	open      func(uint32) (syscall.Handle, error)
	assign    func(syscall.Handle, syscall.Handle) error
	close     func(syscall.Handle) error
	terminate func(syscall.Handle, uint32) error
}

type Job struct {
	handle     syscall.Handle
	operations jobOperations
	mutex      sync.Mutex
	closed     bool
}

func NewJob() (*Job, error) {
	return newJob(defaultJobOperations())
}

func newJob(operations jobOperations) (*Job, error) {
	if operations.create == nil || operations.configure == nil || operations.open == nil || operations.assign == nil || operations.close == nil || operations.terminate == nil {
		return nil, errors.New("proctree: Windows Job Object operations are unavailable")
	}
	handle, err := operations.create()
	if err != nil {
		return nil, fmt.Errorf("proctree: create Windows Job Object: %w", err)
	}
	job := &Job{handle: handle, operations: operations}
	if handle == 0 || handle == syscall.InvalidHandle {
		return nil, errors.Join(errors.New("proctree: Windows Job Object handle is invalid"), job.discard())
	}
	if err := operations.configure(handle); err != nil {
		return nil, errors.Join(fmt.Errorf("proctree: configure Windows Job Object: %w", err), job.discard())
	}
	return job, nil
}

func defaultJobOperations() jobOperations {
	return jobOperations{
		create:    createWindowsJob,
		configure: configureWindowsJob,
		open: func(processID uint32) (syscall.Handle, error) {
			return syscall.OpenProcess(windowsProcessSetQuota|syscall.PROCESS_TERMINATE, false, processID)
		},
		assign:    assignWindowsProcess,
		close:     syscall.CloseHandle,
		terminate: terminateWindowsJob,
	}
}

func createWindowsJob() (syscall.Handle, error) {
	value, _, callErr := windowsCreateJobObject.Call(0, 0)
	if value == 0 {
		return 0, callErr
	}
	return syscall.Handle(value), nil
}

func configureWindowsJob(handle syscall.Handle) error {
	information := windowsExtendedLimitInformation{Basic: windowsBasicLimitInformation{LimitFlags: windowsJobKillOnClose}}
	result, _, callErr := windowsSetInformationJobObject.Call(
		uintptr(handle),
		windowsJobExtendedLimitInformation,
		uintptr(unsafe.Pointer(&information)),
		unsafe.Sizeof(information),
	)
	if result == 0 {
		return callErr
	}
	return nil
}

func assignWindowsProcess(job syscall.Handle, process syscall.Handle) error {
	result, _, callErr := windowsAssignProcessToJobObject.Call(uintptr(job), uintptr(process))
	if result == 0 {
		return callErr
	}
	return nil
}

func terminateWindowsJob(job syscall.Handle, exitCode uint32) error {
	result, _, callErr := windowsTerminateJobObject.Call(uintptr(job), uintptr(exitCode))
	if result == 0 {
		return callErr
	}
	return nil
}

func (job *Job) Assign(processID int) error {
	if job == nil || job.handle == 0 || job.handle == syscall.InvalidHandle {
		return errors.New("proctree: Windows Job Object is unavailable")
	}
	if processID < 1 {
		return errors.New("proctree: Windows process ID is invalid")
	}
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if job.closed {
		return errors.New("proctree: Windows Job Object is closed")
	}
	process, err := job.operations.open(uint32(processID))
	if err != nil {
		return fmt.Errorf("proctree: open Windows process %d: %w", processID, err)
	}
	assignErr := job.operations.assign(job.handle, process)
	closeErr := job.operations.close(process)
	if assignErr != nil {
		assignErr = fmt.Errorf("proctree: assign Windows process %d: %w", processID, assignErr)
	}
	if closeErr != nil {
		closeErr = fmt.Errorf("proctree: close Windows process %d handle: %w", processID, closeErr)
	}
	return errors.Join(assignErr, closeErr)
}

func (job *Job) Close() error {
	if job == nil {
		return errors.New("proctree: Windows Job Object is unavailable")
	}
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if job.closed {
		return nil
	}
	if err := job.closeHandle(); err != nil {
		terminateErr := job.operations.terminate(job.handle, 1)
		retryErr := job.closeHandle()
		if retryErr == nil {
			job.closed = true
		}
		return errors.Join(
			fmt.Errorf("proctree: close Windows Job Object: %w", err),
			wrapWindowsJobError("terminate Windows Job Object after close failure", terminateErr),
			wrapWindowsJobError("retry Windows Job Object close", retryErr),
		)
	}
	job.closed = true
	return nil
}

func (job *Job) discard() error {
	if job == nil || job.handle == 0 || job.handle == syscall.InvalidHandle || job.operations.close == nil {
		return nil
	}
	return job.operations.close(job.handle)
}

func (job *Job) closeHandle() error {
	if job.handle == 0 || job.handle == syscall.InvalidHandle {
		return nil
	}
	return job.operations.close(job.handle)
}

func wrapWindowsJobError(action string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("proctree: %s: %w", action, err)
}
