//go:build windows

package worker

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"unsafe"
)

const (
	windowsJobExtendedLimitInformation = 9
	windowsJobKillOnClose              = 0x00002000
	windowsProcessSetQuota             = 0x0100
	windowsReleaseEnvironment          = "SETTA_WORKER_RELEASE_HANDLE"
	windowsPrelude                     = "import os,sys,msvcrt,runpy;h=int(os.environ.pop('SETTA_WORKER_RELEASE_HANDLE'));f=os.fdopen(msvcrt.open_osfhandle(h,os.O_RDONLY),'rb',buffering=0);token=f.read(1);f.close();token==b'\\x01' or sys.exit(125);runpy.run_path(sys.argv[1],run_name='__main__')"
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

type windowsProcess struct {
	job  syscall.Handle
	once sync.Once
	err  error
}

func startContainedWorker(interpreter string, bootstrap string, directory string, environment []string, input *os.File, output *os.File, stdout io.Writer, stderr io.Writer) (*exec.Cmd, ownedProcess, error) {
	job, err := createWindowsJob()
	if err != nil {
		return nil, nil, err
	}
	releaseReader, releaseWriter, err := os.Pipe()
	if err != nil {
		_ = syscall.CloseHandle(job)
		return nil, nil, err
	}
	handles := []syscall.Handle{syscall.Handle(input.Fd()), syscall.Handle(output.Fd()), syscall.Handle(releaseReader.Fd())}
	for _, handle := range handles {
		if err := syscall.SetHandleInformation(handle, syscall.HANDLE_FLAG_INHERIT, syscall.HANDLE_FLAG_INHERIT); err != nil {
			_ = releaseReader.Close()
			_ = releaseWriter.Close()
			_ = syscall.CloseHandle(job)
			return nil, nil, fmt.Errorf("worker: prepare inherited handle: %w", err)
		}
	}
	start := processStart{interpreter: interpreter, bootstrap: bootstrap, directory: directory, environment: environment, input: input, output: output, stdout: stdout, stderr: stderr}
	command := workerCommand(start, interpreter, "-I", "-c", windowsPrelude, bootstrap)
	command.Env = append(command.Env,
		InputFDEnvironment+"="+strconv.FormatUint(uint64(input.Fd()), 10),
		OutputFDEnvironment+"="+strconv.FormatUint(uint64(output.Fd()), 10),
		windowsReleaseEnvironment+"="+strconv.FormatUint(uint64(releaseReader.Fd()), 10),
	)
	command.SysProcAttr = &syscall.SysProcAttr{AdditionalInheritedHandles: handles}
	if err := command.Start(); err != nil {
		_ = releaseReader.Close()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("worker: start contained Python: %w", err)
	}
	_ = releaseReader.Close()
	process, err := syscall.OpenProcess(windowsProcessSetQuota|syscall.PROCESS_TERMINATE, false, uint32(command.Process.Pid))
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("worker: open Python process: %w", err)
	}
	assigned, _, assignmentErr := windowsAssignProcessToJobObject.Call(uintptr(job), uintptr(process))
	_ = syscall.CloseHandle(process)
	if assigned == 0 {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("worker: assign Python process job: %w", assignmentErr)
	}
	count, releaseErr := releaseWriter.Write([]byte{1})
	closeErr := releaseWriter.Close()
	if releaseErr != nil || closeErr != nil || count != 1 {
		owner := &windowsProcess{job: job}
		_ = owner.terminate()
		_ = command.Wait()
		return nil, nil, fmt.Errorf("worker: release contained Python: %w", errors.Join(releaseErr, closeErr, io.ErrShortWrite))
	}
	return command, &windowsProcess{job: job}, nil
}

func createWindowsJob() (syscall.Handle, error) {
	value, _, createErr := windowsCreateJobObject.Call(0, 0)
	if value == 0 {
		return 0, fmt.Errorf("worker: create Windows process job: %w", createErr)
	}
	job := syscall.Handle(value)
	information := windowsExtendedLimitInformation{Basic: windowsBasicLimitInformation{LimitFlags: windowsJobKillOnClose}}
	result, _, setErr := windowsSetInformationJobObject.Call(uintptr(job), windowsJobExtendedLimitInformation, uintptr(unsafe.Pointer(&information)), unsafe.Sizeof(information))
	if result == 0 {
		_ = syscall.CloseHandle(job)
		return 0, fmt.Errorf("worker: configure Windows process job: %w", setErr)
	}
	return job, nil
}

func (process *windowsProcess) terminate() error {
	if process == nil || process.job == 0 || process.job == syscall.InvalidHandle {
		return errors.New("worker: Windows process job is unavailable")
	}
	process.once.Do(func() {
		if err := syscall.CloseHandle(process.job); err != nil {
			terminated, _, terminateErr := windowsTerminateJobObject.Call(uintptr(process.job), 1)
			if terminated == 0 {
				process.err = errors.Join(err, terminateErr)
				return
			}
			process.err = err
		}
	})
	return process.err
}

func (process *windowsProcess) finalize() error {
	return process.terminate()
}
