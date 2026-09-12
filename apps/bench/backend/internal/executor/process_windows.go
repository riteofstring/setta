//go:build windows

package executor

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	windowsGuardianInvocation          = "--setta-bench-guardian-windows"
	windowsGuardianReleaseEnvironment  = "SETTA_BENCH_GUARDIAN_RELEASE_HANDLE"
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

type windowsProcess struct {
	job  syscall.Handle
	once sync.Once
	err  error
}

func init() {
	if len(os.Args) >= 4 && os.Args[1] == windowsGuardianInvocation && os.Args[2] == "--" {
		runWindowsGuardian(os.Args[3:])
	}
}

func startOwned(candidate *exec.Cmd) (*exec.Cmd, ownedProcess, error) {
	job, err := createWindowsJob()
	if err != nil {
		return nil, nil, err
	}
	releaseReader, releaseWriter, err := os.Pipe()
	if err != nil {
		_ = syscall.CloseHandle(job)
		return nil, nil, err
	}
	releaseHandle := syscall.Handle(releaseReader.Fd())
	if err := syscall.SetHandleInformation(releaseHandle, syscall.HANDLE_FLAG_INHERIT, syscall.HANDLE_FLAG_INHERIT); err != nil {
		_ = releaseReader.Close()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("executor: prepare Windows guardian release: %w", err)
	}
	executable, err := os.Executable()
	if err != nil {
		_ = releaseReader.Close()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, err
	}
	arguments := append([]string{windowsGuardianInvocation, "--", candidate.Path}, candidate.Args[1:]...)
	command := exec.Command(executable, arguments...)
	copyCommand(command, candidate)
	command.Env = append(command.Env, windowsGuardianReleaseEnvironment+"="+strconv.FormatUint(uint64(releaseReader.Fd()), 10))
	command.SysProcAttr = &syscall.SysProcAttr{AdditionalInheritedHandles: []syscall.Handle{releaseHandle}}
	if err := command.Start(); err != nil {
		_ = releaseReader.Close()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("executor: start Windows process guardian: %w", err)
	}
	_ = releaseReader.Close()
	process, err := syscall.OpenProcess(windowsProcessSetQuota|syscall.PROCESS_TERMINATE, false, uint32(command.Process.Pid))
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("executor: open Windows guardian: %w", err)
	}
	assigned, _, assignmentErr := windowsAssignProcessToJobObject.Call(uintptr(job), uintptr(process))
	_ = syscall.CloseHandle(process)
	if assigned == 0 {
		_ = command.Process.Kill()
		_ = command.Wait()
		_ = releaseWriter.Close()
		_ = syscall.CloseHandle(job)
		return nil, nil, fmt.Errorf("executor: assign Windows guardian to job: %w", assignmentErr)
	}
	count, writeErr := releaseWriter.Write([]byte{1})
	closeErr := releaseWriter.Close()
	if writeErr != nil || closeErr != nil || count != 1 {
		owner := &windowsProcess{job: job}
		_ = owner.Terminate()
		_ = command.Wait()
		return nil, nil, fmt.Errorf("executor: release Windows guardian: %w", errors.Join(writeErr, closeErr, io.ErrShortWrite))
	}
	return command, &windowsProcess{job: job}, nil
}

func (process *windowsProcess) Terminate() error {
	return process.stop()
}

func (process *windowsProcess) Finalize() error {
	return process.stop()
}

func (process *windowsProcess) stop() error {
	if process == nil || process.job == 0 || process.job == syscall.InvalidHandle {
		return errors.New("executor: Windows process job is unavailable")
	}
	process.once.Do(func() {
		if err := syscall.CloseHandle(process.job); err != nil {
			terminated, _, terminateErr := windowsTerminateJobObject.Call(uintptr(process.job), 1)
			if terminated == 0 {
				process.err = errors.Join(err, terminateErr)
			} else {
				process.err = err
			}
		}
	})
	return process.err
}

func createWindowsJob() (syscall.Handle, error) {
	value, _, createErr := windowsCreateJobObject.Call(0, 0)
	if value == 0 {
		return 0, fmt.Errorf("executor: create Windows process job: %w", createErr)
	}
	job := syscall.Handle(value)
	information := windowsExtendedLimitInformation{Basic: windowsBasicLimitInformation{LimitFlags: windowsJobKillOnClose}}
	result, _, setErr := windowsSetInformationJobObject.Call(uintptr(job), windowsJobExtendedLimitInformation, uintptr(unsafe.Pointer(&information)), unsafe.Sizeof(information))
	if result == 0 {
		_ = syscall.CloseHandle(job)
		return 0, fmt.Errorf("executor: configure Windows process job: %w", setErr)
	}
	return job, nil
}

func runWindowsGuardian(arguments []string) {
	handleText := os.Getenv(windowsGuardianReleaseEnvironment)
	_ = os.Unsetenv(windowsGuardianReleaseEnvironment)
	handleValue, err := strconv.ParseUint(handleText, 10, 64)
	if err != nil || handleValue == 0 || len(arguments) == 0 {
		os.Exit(125)
	}
	release := os.NewFile(uintptr(handleValue), "setta-bench-guardian-release")
	if release == nil {
		os.Exit(125)
	}
	var token [1]byte
	_, readErr := io.ReadFull(release, token[:])
	_ = release.Close()
	if readErr != nil || token[0] != 1 {
		os.Exit(125)
	}
	command := exec.Command(arguments[0], arguments[1:]...)
	command.Dir = currentWindowsDirectory()
	command.Env = withoutEnvironment(os.Environ(), windowsGuardianReleaseEnvironment)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	err = command.Run()
	if err == nil {
		os.Exit(0)
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		os.Exit(exitError.ExitCode())
	}
	os.Exit(125)
}

func currentWindowsDirectory() string {
	directory, err := os.Getwd()
	if err != nil {
		return `C:\`
	}
	return directory
}

func withoutEnvironment(environment []string, name string) []string {
	prefix := strings.ToUpper(name) + "="
	filtered := make([]string, 0, len(environment))
	for _, entry := range environment {
		if !strings.HasPrefix(strings.ToUpper(entry), prefix) {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}
