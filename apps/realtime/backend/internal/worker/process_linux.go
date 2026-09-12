//go:build linux

package worker

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
	linuxGuardianInvocation = "--setta-realtime-worker-guardian-linux"
	linuxStatusFD           = 5
	linuxReady              = 1
	linuxStarted            = 2
	linuxTerminated         = 3
	linuxComplete           = 4
	linuxFailure            = 5
	linuxRelease            = 1
)

type linuxGuardianProcess struct {
	command      *exec.Cmd
	input        io.WriteCloser
	status       *os.File
	mu           sync.Mutex
	terminated   bool
	finalized    bool
	finalizeErr  error
	inputClosed  bool
	statusClosed bool
}

func init() {
	if len(os.Args) == 5 && os.Args[1] == linuxGuardianInvocation && os.Args[2] == "--" {
		runLinuxGuardian(os.Args[3], os.Args[4])
	}
}

func startContainedWorker(interpreter string, bootstrap string, directory string, environment []string, input *os.File, output *os.File, stdout io.Writer, stderr io.Writer) (*exec.Cmd, ownedProcess, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, nil, fmt.Errorf("worker: resolve Linux process guardian: %w", err)
	}
	statusReader, statusWriter, err := os.Pipe()
	if err != nil {
		return nil, nil, fmt.Errorf("worker: create Linux guardian status: %w", err)
	}
	start := processStart{interpreter: interpreter, bootstrap: bootstrap, directory: directory, environment: environment, input: input, output: output, stdout: stdout, stderr: stderr}
	command := workerCommand(start, executable, linuxGuardianInvocation, "--", interpreter, bootstrap)
	command.Env = append(command.Env, InputFDEnvironment+"=3", OutputFDEnvironment+"=4")
	command.ExtraFiles = []*os.File{input, output, statusWriter}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	release, err := command.StdinPipe()
	if err != nil {
		_ = statusReader.Close()
		_ = statusWriter.Close()
		return nil, nil, fmt.Errorf("worker: create Linux guardian release: %w", err)
	}
	if err := command.Start(); err != nil {
		_ = release.Close()
		_ = statusReader.Close()
		_ = statusWriter.Close()
		return nil, nil, fmt.Errorf("worker: start Linux process guardian: %w", err)
	}
	_ = statusWriter.Close()
	guardian := &linuxGuardianProcess{command: command, input: release, status: statusReader}
	if err := guardian.expect(linuxReady, 5*time.Second); err != nil {
		return nil, nil, guardian.abort(err)
	}
	if count, err := release.Write([]byte{linuxRelease}); err != nil || count != 1 {
		return nil, nil, guardian.abort(fmt.Errorf("worker: release Linux guardian: %w", errors.Join(err, io.ErrShortWrite)))
	}
	if err := guardian.closeInput(); err != nil {
		return nil, nil, guardian.abort(fmt.Errorf("worker: close Linux guardian release: %w", err))
	}
	if err := guardian.expect(linuxStarted, 5*time.Second); err != nil {
		return nil, nil, guardian.abort(err)
	}
	return command, guardian, nil
}

func (process *linuxGuardianProcess) terminate() error {
	if process == nil || process.command == nil || process.command.Process == nil {
		return errors.New("worker: Linux guardian is unavailable")
	}
	process.mu.Lock()
	defer process.mu.Unlock()
	if process.terminated {
		return nil
	}
	if err := process.command.Process.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("worker: terminate Linux guardian: %w", err)
	}
	status, err := process.readStatus(2 * time.Second)
	if err != nil {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		return err
	}
	if status != linuxTerminated && status != linuxComplete {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		return fmt.Errorf("worker: Linux guardian termination status %d", status)
	}
	process.terminated = true
	return nil
}

func (process *linuxGuardianProcess) finalize() error {
	if process == nil {
		return errors.New("worker: Linux guardian is unavailable")
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
			process.finalizeErr = fmt.Errorf("worker: Linux guardian completion status %d", status)
		}
	}
	process.finalizeErr = errors.Join(process.finalizeErr, process.closeInput(), process.closeStatus())
	return process.finalizeErr
}

func (process *linuxGuardianProcess) expect(expected byte, timeout time.Duration) error {
	status, err := process.readStatus(timeout)
	if err != nil {
		return err
	}
	if status == linuxFailure {
		return errors.New("worker: Linux guardian reported failure")
	}
	if status != expected {
		return fmt.Errorf("worker: Linux guardian status %d, want %d", status, expected)
	}
	return nil
}

func (process *linuxGuardianProcess) readStatus(timeout time.Duration) (byte, error) {
	if process.status == nil {
		return 0, errors.New("worker: Linux guardian status is unavailable")
	}
	if err := process.status.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return 0, err
	}
	defer process.status.SetReadDeadline(time.Time{})
	var value [1]byte
	if _, err := io.ReadFull(process.status, value[:]); err != nil {
		return 0, fmt.Errorf("worker: read Linux guardian status: %w", err)
	}
	return value[0], nil
}

func (process *linuxGuardianProcess) closeInput() error {
	if process.inputClosed {
		return nil
	}
	process.inputClosed = true
	if process.input == nil {
		return nil
	}
	return process.input.Close()
}

func (process *linuxGuardianProcess) closeStatus() error {
	if process.statusClosed {
		return nil
	}
	process.statusClosed = true
	if process.status == nil {
		return nil
	}
	return process.status.Close()
}

func (process *linuxGuardianProcess) abort(cause error) error {
	if process.command != nil && process.command.Process != nil {
		_ = syscall.Kill(-process.command.Process.Pid, syscall.SIGKILL)
		_ = process.command.Wait()
	}
	return errors.Join(cause, process.closeInput(), process.closeStatus())
}

func runLinuxGuardian(interpreter string, bootstrap string) {
	status := os.NewFile(uintptr(linuxStatusFD), "setta-worker-guardian-status")
	if status == nil {
		os.Exit(125)
	}
	defer status.Close()
	if prepareLinuxGuardian(status) != nil {
		writeLinuxStatus(status, linuxFailure)
		os.Exit(125)
	}
	command, err := startLinuxGuardianTarget(interpreter, bootstrap)
	if err != nil {
		writeLinuxStatus(status, linuxFailure)
		os.Exit(125)
	}
	if writeLinuxStatus(status, linuxStarted) != nil {
		abortLinuxGuardianTarget(command)
		os.Exit(125)
	}
	_ = os.Stdout.Close()
	_ = os.Stderr.Close()
	waitForLinuxGuardianTarget(command, status)
}

func prepareLinuxGuardian(status *os.File) error {
	if _, _, errno := syscall.RawSyscall6(syscall.SYS_PRCTL, 36, 1, 0, 0, 0, 0); errno != 0 {
		return errno
	}
	if err := writeLinuxStatus(status, linuxReady); err != nil {
		return err
	}
	var release [1]byte
	if _, err := io.ReadFull(os.Stdin, release[:]); err != nil || release[0] != linuxRelease {
		return errors.New("worker: Linux guardian release is invalid")
	}
	return nil
}

func startLinuxGuardianTarget(interpreter string, bootstrap string) (*exec.Cmd, error) {
	input := os.NewFile(3, "setta-worker-input")
	output := os.NewFile(4, "setta-worker-output")
	if input == nil || output == nil {
		return nil, errors.New("worker: Linux guardian protocol files are unavailable")
	}
	defer input.Close()
	defer output.Close()
	command := exec.Command(interpreter, "-I", bootstrap)
	command.Dir = currentDirectory()
	command.Env = os.Environ()
	command.Stdin = nil
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.ExtraFiles = []*os.File{input, output}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		return nil, err
	}
	return command, nil
}

func abortLinuxGuardianTarget(command *exec.Cmd) {
	_ = command.Process.Kill()
	_ = command.Wait()
	_ = reapLinuxChildren()
}

func waitForLinuxGuardianTarget(command *exec.Cmd, status *os.File) {
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	select {
	case result := <-done:
		finishLinuxGuardianTarget(status, result)
	case received := <-signals:
		terminateLinuxGuardianTarget(command, done, status, received)
	}
}

func finishLinuxGuardianTarget(status *os.File, result error) {
	if reapLinuxChildren() != nil || writeLinuxStatus(status, linuxComplete) != nil {
		os.Exit(125)
	}
	exitLike(result)
}

func terminateLinuxGuardianTarget(command *exec.Cmd, done <-chan error, status *os.File, received os.Signal) {
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
	exitWithLinuxSignal(received)
}

func exitWithLinuxSignal(received os.Signal) {
	signalValue, ok := received.(syscall.Signal)
	if !ok {
		signalValue = syscall.SIGTERM
	}
	signal.Reset(signalValue)
	_ = syscall.Kill(os.Getpid(), signalValue)
	os.Exit(128 + int(signalValue))
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

func currentDirectory() string {
	directory, err := os.Getwd()
	if err != nil {
		return string(filepath.Separator)
	}
	return directory
}

func reapLinuxChildren() error {
	for {
		done, err := reapLinuxChildBatch()
		if err != nil {
			return err
		}
		if done {
			return nil
		}
	}
}

func reapLinuxChildBatch() (bool, error) {
	children, err := linuxChildren()
	if err != nil {
		return false, err
	}
	if len(children) == 0 {
		return reapLinuxWithoutChildren()
	}
	for _, pid := range children {
		if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return false, err
		}
	}
	var status syscall.WaitStatus
	_, err = syscall.Wait4(-1, &status, 0, nil)
	return false, ignoreNoLinuxChildren(err)
}

func reapLinuxWithoutChildren() (bool, error) {
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

func ignoreNoLinuxChildren(err error) error {
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
	seen := make(map[int]struct{})
	for _, thread := range threads {
		data, err := os.ReadFile(filepath.Join("/proc/self/task", thread.Name(), "children"))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, value := range strings.Fields(string(data)) {
			pid, err := strconv.Atoi(value)
			if err != nil || pid < 1 {
				return nil, errors.New("worker: Linux guardian child identity is invalid")
			}
			seen[pid] = struct{}{}
		}
	}
	children := make([]int, 0, len(seen))
	for pid := range seen {
		children = append(children, pid)
	}
	sort.Ints(children)
	return children, nil
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
		signal.Reset(status.Signal())
		_ = syscall.Kill(os.Getpid(), status.Signal())
		os.Exit(128 + int(status.Signal()))
	}
	os.Exit(exitError.ExitCode())
}
