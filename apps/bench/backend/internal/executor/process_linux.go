//go:build linux

package executor

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	linuxGuardianInvocation      = "--setta-bench-guardian-linux"
	linuxStatusFD                = 3
	linuxReleaseFD               = 4
	linuxReady              byte = 1
	linuxStarted            byte = 2
	linuxTerminated         byte = 3
	linuxComplete           byte = 4
	linuxFailure            byte = 5
	linuxRelease            byte = 1
)

type linuxProcess struct {
	command       *exec.Cmd
	release       *os.File
	status        *os.File
	mu            sync.Mutex
	terminated    bool
	finalized     bool
	finalizeErr   error
	releaseClosed bool
	statusClosed  bool
}

func init() {
	if len(os.Args) >= 4 && os.Args[1] == linuxGuardianInvocation && os.Args[2] == "--" {
		runLinuxGuardian(os.Args[3:])
	}
}

func startOwned(candidate *exec.Cmd) (*exec.Cmd, ownedProcess, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, nil, fmt.Errorf("executor: resolve Linux process guardian: %w", err)
	}
	statusReader, statusWriter, err := os.Pipe()
	if err != nil {
		return nil, nil, fmt.Errorf("executor: create Linux guardian status: %w", err)
	}
	releaseReader, releaseWriter, err := os.Pipe()
	if err != nil {
		_ = statusReader.Close()
		_ = statusWriter.Close()
		return nil, nil, fmt.Errorf("executor: create Linux guardian release: %w", err)
	}
	arguments := append([]string{linuxGuardianInvocation, "--", candidate.Path}, candidate.Args[1:]...)
	command := exec.Command(executable, arguments...)
	copyCommand(command, candidate)
	command.ExtraFiles = []*os.File{statusWriter, releaseReader}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGTERM}
	if err := command.Start(); err != nil {
		_ = statusReader.Close()
		_ = statusWriter.Close()
		_ = releaseReader.Close()
		_ = releaseWriter.Close()
		return nil, nil, fmt.Errorf("executor: start Linux process guardian: %w", err)
	}
	_ = statusWriter.Close()
	_ = releaseReader.Close()
	owner := &linuxProcess{command: command, release: releaseWriter, status: statusReader}
	if err := owner.expect(linuxReady, 5*time.Second); err != nil {
		return nil, nil, owner.abort(err)
	}
	count, writeErr := owner.release.Write([]byte{linuxRelease})
	closeErr := owner.closeRelease()
	if writeErr != nil || closeErr != nil || count != 1 {
		return nil, nil, owner.abort(fmt.Errorf("executor: release Linux guardian: %w", errors.Join(writeErr, closeErr, io.ErrShortWrite)))
	}
	if err := owner.expect(linuxStarted, 5*time.Second); err != nil {
		return nil, nil, owner.abort(err)
	}
	return command, owner, nil
}

func (process *linuxProcess) Terminate() error {
	if process == nil || process.command == nil || process.command.Process == nil {
		return errors.New("executor: Linux guardian is unavailable")
	}
	process.mu.Lock()
	defer process.mu.Unlock()
	if process.terminated {
		return nil
	}
	if err := process.command.Process.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("executor: terminate Linux guardian: %w", err)
	}
	status, err := process.readStatus(2 * time.Second)
	if err != nil {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		return err
	}
	if status != linuxTerminated && status != linuxComplete {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		return fmt.Errorf("executor: Linux guardian termination status %d", status)
	}
	process.terminated = true
	return nil
}

func (process *linuxProcess) Finalize() error {
	if process == nil {
		return errors.New("executor: Linux guardian is unavailable")
	}
	process.mu.Lock()
	defer process.mu.Unlock()
	if process.finalized {
		return process.finalizeErr
	}
	process.finalized = true
	if !process.terminated {
		status, err := process.readStatus(2 * time.Second)
		if err != nil {
			process.finalizeErr = err
		} else if status != linuxComplete {
			process.finalizeErr = fmt.Errorf("executor: Linux guardian completion status %d", status)
		}
	}
	process.finalizeErr = errors.Join(process.finalizeErr, process.closeRelease(), process.closeStatus())
	return process.finalizeErr
}

func (process *linuxProcess) expect(expected byte, timeout time.Duration) error {
	status, err := process.readStatus(timeout)
	if err != nil {
		return err
	}
	if status == linuxFailure {
		return errors.New("executor: Linux guardian reported failure")
	}
	if status != expected {
		return fmt.Errorf("executor: Linux guardian status %d, want %d", status, expected)
	}
	return nil
}

func (process *linuxProcess) readStatus(timeout time.Duration) (byte, error) {
	if process.status == nil {
		return 0, errors.New("executor: Linux guardian status is unavailable")
	}
	if err := process.status.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return 0, err
	}
	defer process.status.SetReadDeadline(time.Time{})
	var value [1]byte
	if _, err := io.ReadFull(process.status, value[:]); err != nil {
		return 0, fmt.Errorf("executor: read Linux guardian status: %w", err)
	}
	return value[0], nil
}

func (process *linuxProcess) closeRelease() error {
	if process.releaseClosed {
		return nil
	}
	process.releaseClosed = true
	if process.release == nil {
		return nil
	}
	return process.release.Close()
}

func (process *linuxProcess) closeStatus() error {
	if process.statusClosed {
		return nil
	}
	process.statusClosed = true
	if process.status == nil {
		return nil
	}
	return process.status.Close()
}

func (process *linuxProcess) abort(cause error) error {
	if process.command != nil && process.command.Process != nil {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		_ = process.command.Wait()
	}
	return errors.Join(cause, process.closeRelease(), process.closeStatus())
}

func runLinuxGuardian(arguments []string) {
	status := os.NewFile(uintptr(linuxStatusFD), "setta-bench-guardian-status")
	release := os.NewFile(uintptr(linuxReleaseFD), "setta-bench-guardian-release")
	if status == nil || release == nil || len(arguments) == 0 {
		os.Exit(125)
	}
	defer status.Close()
	defer release.Close()
	syscall.CloseOnExec(linuxStatusFD)
	syscall.CloseOnExec(linuxReleaseFD)
	if _, _, errno := syscall.RawSyscall6(syscall.SYS_PRCTL, 36, 1, 0, 0, 0, 0); errno != 0 {
		writeLinuxStatus(status, linuxFailure)
		os.Exit(125)
	}
	if writeLinuxStatus(status, linuxReady) != nil {
		os.Exit(125)
	}
	var token [1]byte
	if _, err := io.ReadFull(release, token[:]); err != nil || token[0] != linuxRelease {
		writeLinuxStatus(status, linuxFailure)
		os.Exit(125)
	}
	command := exec.Command(arguments[0], arguments[1:]...)
	command.Dir = currentDirectory()
	command.Env = os.Environ()
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		writeLinuxStatus(status, linuxFailure)
		os.Exit(125)
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	_ = os.Stdout.Close()
	_ = os.Stderr.Close()
	if writeLinuxStatus(status, linuxStarted) != nil {
		abortLinuxTarget(command)
		os.Exit(125)
	}
	waitLinuxTarget(command, status, signals)
}

func waitLinuxTarget(command *exec.Cmd, status *os.File, signals <-chan os.Signal) {
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	select {
	case result := <-done:
		if reapLinuxChildren() != nil || writeLinuxStatus(status, linuxComplete) != nil {
			os.Exit(125)
		}
		exitLike(result)
	case received := <-signals:
		_ = command.Process.Signal(syscall.SIGTERM)
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-done:
			timer.Stop()
		case <-timer.C:
			_ = command.Process.Kill()
			<-done
		}
		if reapLinuxChildren() != nil || writeLinuxStatus(status, linuxTerminated) != nil {
			os.Exit(125)
		}
		exitWithSignal(received)
	}
}

func abortLinuxTarget(command *exec.Cmd) {
	_ = command.Process.Kill()
	_ = command.Wait()
	_ = reapLinuxChildren()
}

func writeLinuxStatus(status *os.File, value byte) error {
	count, err := status.Write([]byte{value})
	if err != nil {
		return err
	}
	if count != 1 {
		return io.ErrShortWrite
	}
	return nil
}

func reapLinuxChildren() error {
	for {
		children, err := linuxChildren()
		if err != nil {
			return err
		}
		if len(children) == 0 {
			complete, err := pollLinuxChildren()
			if complete || err != nil {
				return err
			}
			continue
		}
		if err := killLinuxChildren(children); err != nil {
			return err
		}
		if err := waitLinuxChild(); err != nil {
			return err
		}
	}
}

func pollLinuxChildren() (bool, error) {
	var status syscall.WaitStatus
	pid, err := syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
	if errors.Is(err, syscall.ECHILD) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if pid == 0 {
		time.Sleep(time.Millisecond)
	}
	return false, nil
}

func killLinuxChildren(children []int) error {
	for _, processID := range children {
		if err := syscall.Kill(processID, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return err
		}
	}
	return nil
}

func waitLinuxChild() error {
	var status syscall.WaitStatus
	_, err := syscall.Wait4(-1, &status, 0, nil)
	if errors.Is(err, syscall.ECHILD) {
		return nil
	}
	return err
}

func linuxChildren() ([]int, error) {
	threads, err := os.ReadDir("/proc/self/task")
	if err != nil {
		return nil, err
	}
	seen := map[int]struct{}{}
	for _, thread := range threads {
		data, err := os.ReadFile(filepath.Join("/proc/self/task", thread.Name(), "children"))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, value := range strings.Fields(string(data)) {
			processID, err := strconv.Atoi(value)
			if err != nil || processID < 1 {
				return nil, errors.New("executor: Linux guardian child identity is invalid")
			}
			seen[processID] = struct{}{}
		}
	}
	values := make([]int, 0, len(seen))
	for processID := range seen {
		values = append(values, processID)
	}
	sort.Ints(values)
	return values, nil
}

func currentDirectory() string {
	directory, err := os.Getwd()
	if err != nil {
		return string(filepath.Separator)
	}
	return directory
}

func exitLike(result error) {
	if result == nil {
		os.Exit(0)
	}
	var exitError *exec.ExitError
	if !errors.As(result, &exitError) {
		os.Exit(125)
	}
	status, ok := exitError.Sys().(syscall.WaitStatus)
	if ok && status.Signaled() {
		exitWithSignal(status.Signal())
	}
	os.Exit(exitError.ExitCode())
}

func exitWithSignal(received os.Signal) {
	signalValue, ok := received.(syscall.Signal)
	if !ok {
		signalValue = syscall.SIGTERM
	}
	signal.Reset(signalValue)
	_ = syscall.Kill(os.Getpid(), signalValue)
	os.Exit(128 + int(signalValue))
}
