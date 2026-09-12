//go:build darwin

package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

const (
	darwinPrivateGuardianInvocation       = "--setta-runner-guardian-darwin"
	darwinPrivateGuardianWorkerInvocation = "--setta-runner-guardian-darwin-worker"

	darwinWorkerStarted byte = 16
	darwinWorkerExited  byte = 17
	darwinWorkerFailure byte = 18
)

type darwinGuardianWorker struct {
	command      *exec.Cmd
	reportReader *os.File
	reportWriter *os.File
	mutex        sync.Mutex
	readerClosed bool
	writerClosed bool
	readerErr    error
	writerErr    error
}

type darwinGuardianWorkerRuntime struct {
	startTarget func(string, string) (*exec.Cmd, error)
	closeOutput func() error
	writeStatus func(*os.File, byte) error
	writeExit   func(*os.File, privateGuardianExit) error
	waitTarget  func(*exec.Cmd) <-chan error
	killGroup   func() error
	hold        func() error
	signals     <-chan os.Signal
}

func init() {
	interpreter, artifact, handled, err := parsePrivateGuardianInvocation(os.Args[1:], darwinPrivateGuardianInvocation)
	if handled {
		runDarwinGuardianProcess(interpreter, artifact, err)
		return
	}
	interpreter, artifact, handled, err = parsePrivateGuardianInvocation(os.Args[1:], darwinPrivateGuardianWorkerInvocation)
	if handled {
		runDarwinGuardianWorkerProcess(interpreter, artifact, err)
	}
}

func runDarwinGuardianProcess(interpreter string, artifact string, parseErr error) {
	if parseErr != nil {
		fmt.Fprintln(os.Stderr, parseErr)
		os.Exit(125)
	}
	status, err := privateGuardianStatusFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	defer status.Close()
	result, err := runDarwinPrivateGuardian(interpreter, artifact, status)
	if err != nil {
		_ = writePrivateGuardianStatus(status, privateGuardianFailure)
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	exitDarwinPrivateGuardian(result)
}

func runDarwinGuardianWorkerProcess(interpreter string, artifact string, parseErr error) {
	if parseErr != nil {
		fmt.Fprintln(os.Stderr, parseErr)
		os.Exit(125)
	}
	report, err := privateGuardianStatusFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	defer report.Close()
	if err := runDarwinPrivateGuardianWorker(interpreter, artifact, report); err != nil {
		_ = writeDarwinWorkerStatus(report, darwinWorkerFailure)
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
}

func runDarwinPrivateGuardian(interpreter string, artifact string, status *os.File) (privateGuardianExit, error) {
	if err := prepareDarwinPrivateGuardian(status); err != nil {
		return privateGuardianExit{}, err
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	worker, err := startDarwinGuardianWorker(interpreter, artifact)
	if err != nil {
		return privateGuardianExit{}, err
	}
	if received, err := waitForDarwinGuardianWorkerStart(worker, signals); received != nil {
		return terminateDarwinGuardian(worker, status, received)
	} else if err != nil {
		return privateGuardianExit{}, abortDarwinGuardianWorker(worker, err)
	}
	if err := closePrivateGuardianOutput(); err != nil {
		return privateGuardianExit{}, abortDarwinGuardianWorker(worker, err)
	}
	if err := writePrivateGuardianStatus(status, privateGuardianStarted); err != nil {
		return privateGuardianExit{}, abortDarwinGuardianWorker(worker, fmt.Errorf("runner: report macOS guardian start: %w", err))
	}
	return waitForDarwinGuardianResult(worker, status, signals)
}

func prepareDarwinPrivateGuardian(status *os.File) error {
	if status == nil {
		return errors.New("runner: private process guardian status pipe is unavailable")
	}
	syscall.CloseOnExec(int(status.Fd()))
	if err := writePrivateGuardianStatus(status, privateGuardianReady); err != nil {
		return fmt.Errorf("runner: report macOS guardian readiness: %w", err)
	}
	if err := readPrivateGuardianRelease(); err != nil {
		return err
	}
	return nil
}

func waitForDarwinGuardianWorkerStart(worker *darwinGuardianWorker, signals <-chan os.Signal) (os.Signal, error) {
	started := make(chan error, 1)
	go func() { started <- worker.waitStarted() }()
	select {
	case err := <-started:
		return nil, err
	case received := <-signals:
		return received, nil
	}
}

func waitForDarwinGuardianResult(worker *darwinGuardianWorker, status *os.File, signals <-chan os.Signal) (privateGuardianExit, error) {
	result := make(chan privateGuardianExit, 1)
	resultErr := make(chan error, 1)
	go func() {
		value, err := worker.waitResult()
		if err != nil {
			resultErr <- err
			return
		}
		result <- value
	}()
	select {
	case targetResult := <-result:
		return finishDarwinGuardian(worker, status, targetResult)
	case err := <-resultErr:
		return privateGuardianExit{}, abortDarwinGuardianWorker(worker, err)
	case received := <-signals:
		return terminateDarwinGuardian(worker, status, received)
	}
}

func startDarwinGuardianWorker(interpreter string, artifact string) (*darwinGuardianWorker, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("runner: resolve macOS process worker: %w", err)
	}
	reportReader, reportWriter, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("runner: create macOS process worker report pipe: %w", err)
	}
	worker := &darwinGuardianWorker{reportReader: reportReader, reportWriter: reportWriter}
	input, err := os.Open(os.DevNull)
	if err != nil {
		_ = worker.close()
		return nil, fmt.Errorf("runner: open generated Python input: %w", err)
	}
	command := exec.Command(
		darwinSandboxExecutable,
		"-p",
		darwinProcessContainmentProfile,
		executable,
		darwinPrivateGuardianWorkerInvocation,
		"--",
		interpreter,
		artifact,
	)
	command.Stdin = input
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.ExtraFiles = []*os.File{reportWriter}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		return nil, cleanupDarwinGuardianWorkerStart(
			fmt.Errorf("runner: start macOS process worker: %w", err),
			input,
			worker,
			nil,
		)
	}
	worker.command = command
	if err := input.Close(); err != nil {
		return nil, cleanupDarwinGuardianWorkerStart(
			fmt.Errorf("runner: close generated Python input: %w", err),
			input,
			worker,
			command,
		)
	}
	if err := worker.closeReportWriter(); err != nil {
		return nil, cleanupDarwinGuardianWorkerStart(
			fmt.Errorf("runner: close macOS process worker report writer: %w", err),
			nil,
			worker,
			command,
		)
	}
	return worker, nil
}

func cleanupDarwinGuardianWorkerStart(cause error, input *os.File, worker *darwinGuardianWorker, command *exec.Cmd) error {
	var cleanup []error
	if input != nil {
		if err := input.Close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("runner: close macOS process worker input: %w", err))
		}
	}
	if command != nil {
		if err := terminateDarwinWorker(command); err != nil {
			cleanup = append(cleanup, fmt.Errorf("runner: terminate partially started macOS process worker: %w", err))
		}
	}
	if worker != nil {
		if err := worker.close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("runner: close macOS process worker report pipes: %w", err))
		}
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func runDarwinPrivateGuardianWorker(interpreter string, artifact string, report *os.File) error {
	if report == nil {
		return errors.New("runner: macOS process worker report pipe is unavailable")
	}
	syscall.CloseOnExec(int(report.Fd()))
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	return runDarwinPrivateGuardianWorkerWithRuntime(interpreter, artifact, report, darwinGuardianWorkerRuntime{
		startTarget: startDarwinGuardianTarget,
		closeOutput: closePrivateGuardianOutput,
		writeStatus: writeDarwinWorkerStatus,
		writeExit:   writeDarwinWorkerExit,
		waitTarget:  waitForDarwinGuardianTarget,
		killGroup:   killDarwinGuardianWorkerGroup,
		hold: func() error {
			return holdDarwinGuardianWorkerForOuterCleanup(signals)
		},
		signals: signals,
	})
}

func runDarwinPrivateGuardianWorkerWithRuntime(
	interpreter string,
	artifact string,
	report *os.File,
	runtime darwinGuardianWorkerRuntime,
) error {
	if report == nil {
		return errors.New("runner: macOS process worker report pipe is unavailable")
	}
	if err := validateDarwinGuardianWorkerRuntime(runtime); err != nil {
		return err
	}
	target, err := runtime.startTarget(interpreter, artifact)
	if err != nil {
		return runtime.handleTargetStartFailure(report, target, err)
	}
	if target == nil {
		return errors.New("runner: macOS generated Python process is unavailable")
	}
	return runtime.runTarget(target, report)
}

func validateDarwinGuardianWorkerRuntime(runtime darwinGuardianWorkerRuntime) error {
	if runtime.startTarget == nil || runtime.closeOutput == nil || runtime.writeStatus == nil || runtime.writeExit == nil || runtime.waitTarget == nil || runtime.killGroup == nil || runtime.hold == nil || runtime.signals == nil {
		return errors.New("runner: macOS process worker runtime is unavailable")
	}
	return nil
}

func (runtime darwinGuardianWorkerRuntime) handleTargetStartFailure(report *os.File, target *exec.Cmd, cause error) error {
	if target == nil {
		return cause
	}
	return runtime.containFailure(report, cause)
}

func (runtime darwinGuardianWorkerRuntime) runTarget(target *exec.Cmd, report *os.File) error {
	if err := runtime.closeOutput(); err != nil {
		return runtime.containFailure(report, err)
	}
	if err := runtime.writeStatus(report, darwinWorkerStarted); err != nil {
		return runtime.containFailure(report, fmt.Errorf("runner: report macOS process worker start: %w", err))
	}
	return runtime.awaitTarget(target, report)
}

func (runtime darwinGuardianWorkerRuntime) awaitTarget(target *exec.Cmd, report *os.File) error {
	targetDone := runtime.waitTarget(target)
	if targetDone == nil {
		return runtime.containFailure(report, errors.New("runner: macOS generated Python wait is unavailable"))
	}
	select {
	case targetErr := <-targetDone:
		return runtime.reportTargetExit(report, targetErr)
	case <-runtime.signals:
		return runtime.hold()
	}

}

func (runtime darwinGuardianWorkerRuntime) reportTargetExit(report *os.File, targetErr error) error {
	result, err := privateGuardianExitFromTarget(targetErr)
	if err != nil {
		return runtime.containFailure(report, err)
	}
	if err := runtime.writeExit(report, result); err != nil {
		return runtime.containFailure(report, fmt.Errorf("runner: report macOS generated Python exit: %w", err))
	}
	return runtime.hold()
}

func (runtime darwinGuardianWorkerRuntime) containFailure(report *os.File, cause error) error {
	reportErr := runtime.writeStatus(report, darwinWorkerFailure)
	killErr := runtime.killGroup()
	holdErr := runtime.hold()
	return errors.Join(cause, reportErr, killErr, holdErr)
}

func holdDarwinGuardianWorkerForOuterCleanup(signals <-chan os.Signal) error {
	for range signals {

	}
	return errors.New("runner: macOS process worker signal stream ended before containment cleanup")
}

func killDarwinGuardianWorkerGroup() error {
	processID := os.Getpid()
	if processID < 1 {
		return errors.New("runner: macOS process worker ID is invalid")
	}
	if err := syscall.Kill(-processID, syscall.SIGKILL); err != nil {
		return fmt.Errorf("runner: kill macOS process worker group from its live leader: %w", err)
	}
	return errors.New("runner: macOS process worker survived its own group kill")
}

func startDarwinGuardianTarget(interpreter string, artifact string) (*exec.Cmd, error) {
	input, err := os.Open(os.DevNull)
	if err != nil {
		return nil, fmt.Errorf("runner: open generated Python input: %w", err)
	}
	command := exec.Command(interpreter, artifact)
	command.Stdin = input
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		_ = input.Close()
		return nil, fmt.Errorf("runner: start generated Python: %w", err)
	}
	if err := input.Close(); err != nil {
		return command, fmt.Errorf("runner: close generated Python input: %w", err)
	}
	return command, nil
}

func waitForDarwinGuardianTarget(command *exec.Cmd) <-chan error {
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	return done
}

func finishDarwinGuardian(worker *darwinGuardianWorker, status *os.File, result privateGuardianExit) (privateGuardianExit, error) {
	if err := terminateDarwinGuardianWorker(worker); err != nil {
		return privateGuardianExit{}, err
	}
	if err := writePrivateGuardianStatus(status, privateGuardianComplete); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: report macOS guardian completion: %w", err)
	}
	return result, nil
}

func terminateDarwinGuardian(worker *darwinGuardianWorker, status *os.File, received os.Signal) (privateGuardianExit, error) {
	if err := terminateDarwinGuardianWorker(worker); err != nil {
		return privateGuardianExit{}, err
	}
	if err := writePrivateGuardianStatus(status, privateGuardianTerminated); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: report macOS guardian termination: %w", err)
	}
	terminationSignal, ok := received.(syscall.Signal)
	if !ok {
		terminationSignal = syscall.SIGTERM
	}
	return privateGuardianExit{signal: terminationSignal}, nil
}

func abortDarwinGuardianWorker(worker *darwinGuardianWorker, cause error) error {
	if err := terminateDarwinGuardianWorker(worker); err != nil {
		return errors.Join(cause, err)
	}
	return cause
}

func terminateDarwinGuardianWorker(worker *darwinGuardianWorker) error {
	if worker == nil {
		return errors.New("runner: macOS process worker is unavailable")
	}
	if err := terminateDarwinWorker(worker.command); err != nil {
		_ = worker.close()
		return err
	}
	return worker.close()
}

func terminateDarwinWorker(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	processID := command.Process.Pid
	if processID < 1 {
		return errors.New("runner: macOS process worker ID is invalid")
	}
	var failures []error
	if err := signalLiveDarwinWorkerGroup(processID, syscall.SIGTERM); err != nil {
		failures = append(failures, fmt.Errorf("runner: terminate macOS process worker group: %w", err))
	}
	time.Sleep(processTerminationGrace)
	if err := signalLiveDarwinWorkerGroup(processID, syscall.SIGKILL); err != nil {
		failures = append(failures, err)
	}
	if err := command.Wait(); err != nil {
		var exitError *exec.ExitError
		if !errors.As(err, &exitError) && !errors.Is(err, os.ErrProcessDone) {
			failures = append(failures, fmt.Errorf("runner: reap macOS process worker: %w", err))
		}
	}
	return errors.Join(failures...)
}

func signalLiveDarwinWorkerGroup(processID int, signal syscall.Signal) error {
	groupID, err := syscall.Getpgid(processID)
	if errors.Is(err, syscall.ESRCH) {

		return signalDarwinWorkerGroup(processID, signal)
	}
	if err != nil {
		return fmt.Errorf("runner: verify macOS process worker group: %w", err)
	}
	if groupID != processID {
		return fmt.Errorf("runner: macOS process worker group changed from %d to %d", processID, groupID)
	}
	return signalDarwinWorkerGroup(processID, signal)
}

func signalDarwinWorkerGroup(processID int, signal syscall.Signal) error {
	if err := syscall.Kill(-processID, signal); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("runner: signal macOS process worker group: %w", err)
	}
	return nil
}

func (worker *darwinGuardianWorker) waitStarted() error {
	status, err := worker.readReport(privateGuardianStartupTimeout)
	if err != nil {
		return err
	}
	if status == darwinWorkerStarted {
		return nil
	}
	if status == darwinWorkerFailure {
		return errors.New("runner: macOS process worker failed before generated Python started")
	}
	return fmt.Errorf("runner: macOS process worker status %d, want start", status)
}

func (worker *darwinGuardianWorker) waitResult() (privateGuardianExit, error) {
	status, err := worker.readReport(0)
	if err != nil {
		return privateGuardianExit{}, err
	}
	if status == darwinWorkerFailure {
		return privateGuardianExit{}, errors.New("runner: macOS process worker failed while running generated Python")
	}
	if status != darwinWorkerExited {
		return privateGuardianExit{}, fmt.Errorf("runner: macOS process worker status %d, want exit", status)
	}
	var payload [2]byte
	if _, err := io.ReadFull(worker.reportReader, payload[:]); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: read macOS process worker exit: %w", err)
	}
	if payload[0] == 1 {
		return privateGuardianExit{signal: syscall.Signal(payload[1])}, nil
	}
	if payload[0] == 0 {
		return privateGuardianExit{code: int(payload[1])}, nil
	}
	return privateGuardianExit{}, errors.New("runner: macOS process worker exit payload is invalid")
}

func (worker *darwinGuardianWorker) readReport(timeout time.Duration) (byte, error) {
	if worker == nil || worker.reportReader == nil {
		return 0, errors.New("runner: macOS process worker report reader is unavailable")
	}
	if timeout > 0 {
		if err := worker.reportReader.SetReadDeadline(time.Now().Add(timeout)); err != nil {
			return 0, fmt.Errorf("runner: set macOS process worker report deadline: %w", err)
		}
		defer func() { _ = worker.reportReader.SetReadDeadline(time.Time{}) }()
	}
	var status [1]byte
	if _, err := io.ReadFull(worker.reportReader, status[:]); err != nil {
		return 0, fmt.Errorf("runner: read macOS process worker report: %w", err)
	}
	return status[0], nil
}

func (worker *darwinGuardianWorker) close() error {
	if worker == nil {
		return nil
	}
	return errors.Join(worker.closeReportReader(), worker.closeReportWriter())
}

func (worker *darwinGuardianWorker) closeReportReader() error {
	worker.mutex.Lock()
	defer worker.mutex.Unlock()
	if worker.readerClosed {
		return worker.readerErr
	}
	worker.readerClosed = true
	if worker.reportReader != nil {
		worker.readerErr = worker.reportReader.Close()
	}
	return worker.readerErr
}

func (worker *darwinGuardianWorker) closeReportWriter() error {
	worker.mutex.Lock()
	defer worker.mutex.Unlock()
	if worker.writerClosed {
		return worker.writerErr
	}
	worker.writerClosed = true
	if worker.reportWriter != nil {
		worker.writerErr = worker.reportWriter.Close()
	}
	return worker.writerErr
}

func writeDarwinWorkerStatus(report *os.File, status byte) error {
	return writePrivateGuardianStatus(report, status)
}

func writeDarwinWorkerExit(report *os.File, result privateGuardianExit) error {
	payload := [3]byte{darwinWorkerExited}
	if result.signal != 0 {
		payload[1] = 1
		payload[2] = byte(result.signal)
	} else {
		payload[2] = byte(result.code)
	}
	count, err := report.Write(payload[:])
	if err != nil {
		return err
	}
	if count != len(payload) {
		return io.ErrShortWrite
	}
	return nil
}

func exitDarwinPrivateGuardian(result privateGuardianExit) {
	if result.signal != 0 {
		signal.Reset(result.signal)
		_ = syscall.Kill(os.Getpid(), result.signal)
		os.Exit(128 + int(result.signal))
	}
	os.Exit(result.code)
}
