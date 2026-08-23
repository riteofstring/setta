//go:build darwin || linux

package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

const (
	privateGuardianStatusFD = 3

	privateGuardianReady      byte = 1
	privateGuardianStarted    byte = 2
	privateGuardianTerminated byte = 3
	privateGuardianComplete   byte = 4
	privateGuardianFailure    byte = 5
	privateGuardianRelease    byte = 1

	// Starting the private helper can include a cold executable load and, on
	// macOS, sandbox initialization. Keep that bounded without treating a
	// normal loaded-machine start as a failed run. Termination has its own
	// tighter bound below so cancellation cannot inherit this window.
	privateGuardianStartupTimeout     = 5 * time.Second
	privateGuardianTerminationTimeout = 2 * time.Second
)

type privateGuardianExit struct {
	code   int
	signal syscall.Signal
}

func privateGuardianExitFromTarget(targetErr error) (privateGuardianExit, error) {
	if targetErr == nil {
		return privateGuardianExit{}, nil
	}
	var exitError *exec.ExitError
	if !errors.As(targetErr, &exitError) {
		return privateGuardianExit{}, fmt.Errorf("runner: wait for generated Python: %w", targetErr)
	}
	status, ok := exitError.Sys().(syscall.WaitStatus)
	if ok && status.Signaled() {
		return privateGuardianExit{signal: status.Signal()}, nil
	}
	if code := exitError.ExitCode(); code >= 0 {
		return privateGuardianExit{code: code}, nil
	}
	return privateGuardianExit{}, errors.New("runner: generated Python exit status is unavailable")
}

type privateGuardianLaunch struct {
	input        io.WriteCloser
	statusReader *os.File
	statusWriter *os.File
	mutex        sync.Mutex
	inputClosed  bool
	writerClosed bool
	readerClosed bool
	inputErr     error
	writerErr    error
	readerErr    error
}

func preparePrivateGuardianLaunch(
	invocation string,
	interpreter string,
	artifact string,
	directory string,
	environment []string,
) (processLaunch, error) {
	guardian, err := newPrivateGuardianLaunch()
	if err != nil {
		return processLaunch{}, err
	}
	executable, err := os.Executable()
	if err != nil {
		return processLaunch{}, guardian.cleanupWithCause(fmt.Errorf("runner: resolve private process guardian: %w", err))
	}
	command := exec.Command(executable, invocation, "--", interpreter, artifact)
	command.Dir = directory
	command.Env = append([]string(nil), environment...)
	command.Stdin = nil
	input, err := command.StdinPipe()
	if err != nil {
		return processLaunch{}, guardian.cleanupWithCause(fmt.Errorf("runner: create private process guardian input: %w", err))
	}
	guardian.input = input
	command.ExtraFiles = []*os.File{guardian.statusWriter}
	return processLaunch{
		command: command,
		newOwner: func(command *exec.Cmd) (ownedProcess, error) {
			return &privateGuardianOwnedProcess{command: command, launch: guardian}, nil
		},
		activate: guardian.activate,
		cleanup:  guardian.cleanup,
	}, nil
}

func newPrivateGuardianLaunch() (*privateGuardianLaunch, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("runner: create private process guardian status pipe: %w", err)
	}
	return &privateGuardianLaunch{statusReader: reader, statusWriter: writer}, nil
}

func privateGuardianStatusFile() (*os.File, error) {
	status := os.NewFile(uintptr(privateGuardianStatusFD), "setta-runner-guardian-status")
	if status == nil {
		return nil, errors.New("runner: private process guardian status pipe is unavailable")
	}
	return status, nil
}

func writePrivateGuardianStatus(status *os.File, value byte) error {
	if status == nil {
		return errors.New("runner: private process guardian status pipe is unavailable")
	}
	count, err := status.Write([]byte{value})
	if err != nil {
		return err
	}
	if count != 1 {
		return io.ErrShortWrite
	}
	return nil
}

func readPrivateGuardianRelease() error {
	var token [1]byte
	if _, err := io.ReadFull(os.Stdin, token[:]); err != nil {
		return fmt.Errorf("runner: read private process guardian release: %w", err)
	}
	if token[0] != privateGuardianRelease {
		return errors.New("runner: private process guardian release token is invalid")
	}
	return nil
}

func closePrivateGuardianOutput() error {
	return errors.Join(os.Stdout.Close(), os.Stderr.Close())
}

func parsePrivateGuardianInvocation(arguments []string, invocation string) (string, string, bool, error) {
	if len(arguments) == 0 || arguments[0] != invocation {
		return "", "", false, nil
	}
	if len(arguments) != 4 || arguments[1] != "--" || arguments[2] == "" || arguments[3] == "" {
		return "", "", true, errors.New("runner: private process guardian requires an interpreter and artifact after --")
	}
	return arguments[2], arguments[3], true, nil
}

func (launch *privateGuardianLaunch) activate() error {
	if launch == nil {
		return errors.New("runner: private process guardian launch is unavailable")
	}
	if err := launch.closeStatusWriter(); err != nil {
		return fmt.Errorf("runner: close private process guardian status writer: %w", err)
	}
	if err := launch.expectStatus(privateGuardianReady); err != nil {
		return err
	}
	if _, err := launch.input.Write([]byte{privateGuardianRelease}); err != nil {
		return fmt.Errorf("runner: release private process guardian: %w", err)
	}
	if err := launch.closeInput(); err != nil {
		return fmt.Errorf("runner: close private process guardian input: %w", err)
	}
	return launch.expectStatus(privateGuardianStarted)
}

func (launch *privateGuardianLaunch) cleanup() error {
	if launch == nil {
		return nil
	}
	return errors.Join(launch.closeInput(), launch.closeStatusWriter(), launch.closeStatusReader())
}

func (launch *privateGuardianLaunch) cleanupWithCause(cause error) error {
	if err := launch.cleanup(); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: clean up private process guardian launch: %w", err))
	}
	return cause
}

func (launch *privateGuardianLaunch) expectStatus(expected byte) error {
	actual, err := launch.readStatusWithin(privateGuardianStartupTimeout)
	if err != nil {
		return err
	}
	if actual == expected {
		return nil
	}
	if actual == privateGuardianFailure {
		return errors.New("runner: private process guardian reported a setup or cleanup failure")
	}
	return fmt.Errorf("runner: private process guardian status %d, want %d", actual, expected)
}

func (launch *privateGuardianLaunch) readStatusWithin(timeout time.Duration) (byte, error) {
	if launch == nil || launch.statusReader == nil {
		return 0, errors.New("runner: private process guardian status reader is unavailable")
	}
	if timeout <= 0 {
		return 0, errors.New("runner: private process guardian status timeout is invalid")
	}
	if err := launch.statusReader.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return 0, fmt.Errorf("runner: set private process guardian status deadline: %w", err)
	}
	defer func() { _ = launch.statusReader.SetReadDeadline(time.Time{}) }()
	var status [1]byte
	if _, err := io.ReadFull(launch.statusReader, status[:]); err != nil {
		return 0, fmt.Errorf("runner: read private process guardian status: %w", err)
	}
	return status[0], nil
}

func (launch *privateGuardianLaunch) closeInput() error {
	launch.mutex.Lock()
	defer launch.mutex.Unlock()
	if launch.inputClosed {
		return launch.inputErr
	}
	launch.inputClosed = true
	if launch.input != nil {
		launch.inputErr = launch.input.Close()
	}
	return launch.inputErr
}

func (launch *privateGuardianLaunch) closeStatusWriter() error {
	launch.mutex.Lock()
	defer launch.mutex.Unlock()
	if launch.writerClosed {
		return launch.writerErr
	}
	launch.writerClosed = true
	if launch.statusWriter != nil {
		launch.writerErr = launch.statusWriter.Close()
	}
	return launch.writerErr
}

func (launch *privateGuardianLaunch) closeStatusReader() error {
	launch.mutex.Lock()
	defer launch.mutex.Unlock()
	if launch.readerClosed {
		return launch.readerErr
	}
	launch.readerClosed = true
	if launch.statusReader != nil {
		launch.readerErr = launch.statusReader.Close()
	}
	return launch.readerErr
}

type privateGuardianOwnedProcess struct {
	command      *exec.Cmd
	launch       *privateGuardianLaunch
	mutex        sync.Mutex
	terminated   bool
	acknowledged bool
	finalized    bool
	finalizeErr  error
}

func (process *privateGuardianOwnedProcess) ownsCommandTermination() bool {
	if process == nil {
		return false
	}
	process.mutex.Lock()
	defer process.mutex.Unlock()
	// The parent may leave the direct guardian alive only after it has
	// acknowledged that its owned tree is gone. If its status path stalls, the
	// caller must retain the direct-process fallback so Run itself remains
	// bounded and reports the containment failure.
	return process.acknowledged
}

func (process *privateGuardianOwnedProcess) terminate() error {
	if process == nil || process.command == nil || process.command.Process == nil || process.launch == nil {
		return errors.New("runner: private process guardian is unavailable")
	}
	process.mutex.Lock()
	defer process.mutex.Unlock()
	if process.terminated {
		return nil
	}
	if err := process.command.Process.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("runner: signal private process guardian: %w", err)
	}
	status, err := process.launch.readStatusWithin(privateGuardianTerminationTimeout)
	if err != nil {
		return process.forceStopAfterTerminationFailure(err)
	}
	switch status {
	case privateGuardianTerminated, privateGuardianComplete:
		process.terminated = true
		process.acknowledged = true
		return nil
	case privateGuardianFailure:
		return process.forceStopAfterTerminationFailure(errors.New("runner: private process guardian failed to terminate its process tree"))
	default:
		return process.forceStopAfterTerminationFailure(fmt.Errorf("runner: private process guardian status %d, want termination completion", status))
	}
}

func (process *privateGuardianOwnedProcess) forceStopAfterTerminationFailure(cause error) error {
	if process == nil || process.command == nil || process.command.Process == nil {
		return cause
	}
	if err := process.command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return errors.Join(cause, fmt.Errorf("runner: force-stop unresponsive private process guardian: %w", err))
	}
	return cause
}

func (process *privateGuardianOwnedProcess) finalize() error {
	if process == nil || process.launch == nil {
		return errors.New("runner: private process guardian is unavailable")
	}
	process.mutex.Lock()
	defer process.mutex.Unlock()
	if process.finalized {
		return process.finalizeErr
	}
	process.finalized = true
	if process.terminated {
		return nil
	}
	status, err := process.launch.readStatusWithin(privateGuardianTerminationTimeout)
	if err != nil {
		process.finalizeErr = err
		return err
	}
	if status == privateGuardianComplete {
		return nil
	}
	if status == privateGuardianFailure {
		process.finalizeErr = errors.New("runner: private process guardian failed to finalize its process tree")
		return process.finalizeErr
	}
	process.finalizeErr = fmt.Errorf("runner: private process guardian status %d, want normal completion", status)
	return process.finalizeErr
}
