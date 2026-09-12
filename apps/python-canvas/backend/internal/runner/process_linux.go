//go:build linux

package runner

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
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

const (
	linuxPrivateGuardianInvocation = "--setta-runner-guardian-linux"
	linuxProcessRoot               = "/proc/self/task"
)

type linuxGuardianReaperOperations struct {
	children   func() ([]int, error)
	kill       func(int, syscall.Signal) error
	waitOne    func() error
	waitNoHang func() (bool, error)
}

type linuxGuardianTargetStartOperations struct {
	openInput    func() (io.ReadCloser, error)
	startCommand func(*exec.Cmd) error
}

type linuxGuardianTargetCleanupOperations struct {
	cleanupCommand func(*exec.Cmd) error
	reapChildren   func() error
}

type linuxGuardianTargetFinishOperations struct {
	reapChildren func() error
}

func init() {
	interpreter, artifact, handled, err := parsePrivateGuardianInvocation(os.Args[1:], linuxPrivateGuardianInvocation)
	if !handled {
		return
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	status, err := privateGuardianStatusFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	defer status.Close()
	result, err := runLinuxPrivateGuardian(interpreter, artifact, status)
	if err != nil {
		_ = writePrivateGuardianStatus(status, privateGuardianFailure)
		fmt.Fprintln(os.Stderr, err)
		os.Exit(125)
	}
	exitLinuxPrivateGuardian(result)
}

func prepareProcessLaunch(interpreter string, artifact string, directory string, environment []string) (processLaunch, error) {
	return preparePrivateGuardianLaunch(
		linuxPrivateGuardianInvocation,
		interpreter,
		artifact,
		directory,
		environment,
	)
}

func configureProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func runLinuxPrivateGuardian(interpreter string, artifact string, status *os.File) (privateGuardianExit, error) {
	if status == nil {
		return privateGuardianExit{}, errors.New("runner: private process guardian status pipe is unavailable")
	}
	syscall.CloseOnExec(int(status.Fd()))
	if err := unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: configure Linux child subreaper: %w", err)
	}
	if err := writePrivateGuardianStatus(status, privateGuardianReady); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: report Linux guardian readiness: %w", err)
	}
	if err := readPrivateGuardianRelease(); err != nil {
		return privateGuardianExit{}, err
	}
	target, err := startLinuxGuardianTarget(interpreter, artifact)
	if err != nil {
		return privateGuardianExit{}, handleLinuxGuardianTargetStart(target, err, abortLinuxGuardianTarget)
	}
	if err := closePrivateGuardianOutput(); err != nil {
		return privateGuardianExit{}, abortLinuxGuardianTarget(target, err)
	}
	if err := writePrivateGuardianStatus(status, privateGuardianStarted); err != nil {
		return privateGuardianExit{}, abortLinuxGuardianTarget(target, fmt.Errorf("runner: report Linux guardian start: %w", err))
	}
	return waitForLinuxGuardianTarget(target, status)
}

func abortLinuxGuardianTarget(command *exec.Cmd, cause error) error {
	return abortLinuxGuardianTargetWithOperations(command, cause, linuxGuardianTargetCleanupOperations{
		cleanupCommand: cleanupStartedCommand,
		reapChildren:   func() error { return reapLinuxGuardianChildren(defaultLinuxGuardianReaperOperations()) },
	})
}

func abortLinuxGuardianTargetWithOperations(command *exec.Cmd, cause error, operations linuxGuardianTargetCleanupOperations) error {
	var cleanup []error
	if operations.cleanupCommand == nil || operations.reapChildren == nil {
		return errors.Join(cause, errors.New("runner: Linux guardian cleanup operations are unavailable"))
	}
	if err := operations.cleanupCommand(command); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: stop generated Python after guardian setup failure: %w", err))
	}
	if err := operations.reapChildren(); err != nil {
		cleanup = append(cleanup, err)
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func startLinuxGuardianTarget(interpreter string, artifact string) (*exec.Cmd, error) {
	return startLinuxGuardianTargetWithOperations(interpreter, artifact, linuxGuardianTargetStartOperations{
		openInput: func() (io.ReadCloser, error) { return os.Open(os.DevNull) },
		startCommand: func(command *exec.Cmd) error {
			return command.Start()
		},
	})
}

func startLinuxGuardianTargetWithOperations(
	interpreter string,
	artifact string,
	operations linuxGuardianTargetStartOperations,
) (*exec.Cmd, error) {
	if operations.openInput == nil || operations.startCommand == nil {
		return nil, errors.New("runner: Linux guardian target start operations are unavailable")
	}
	input, err := operations.openInput()
	if err != nil {
		return nil, fmt.Errorf("runner: open generated Python input: %w", err)
	}
	command := exec.Command(interpreter, artifact)
	command.Stdin = input
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := operations.startCommand(command); err != nil {
		return nil, closeLinuxGuardianTargetInput(input, fmt.Errorf("runner: start generated Python: %w", err))
	}
	if err := input.Close(); err != nil {
		return command, fmt.Errorf("runner: close generated Python input: %w", err)
	}
	return command, nil
}

func closeLinuxGuardianTargetInput(input io.Closer, cause error) error {
	if input == nil {
		return cause
	}
	if err := input.Close(); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: close generated Python input: %w", err))
	}
	return cause
}

func handleLinuxGuardianTargetStart(command *exec.Cmd, cause error, abort func(*exec.Cmd, error) error) error {
	if cause == nil || command == nil {
		return cause
	}
	if abort == nil {
		return errors.Join(cause, errors.New("runner: Linux guardian target abort is unavailable"))
	}
	return abort(command, cause)
}

func waitForLinuxGuardianTarget(command *exec.Cmd, status *os.File) (privateGuardianExit, error) {
	if command == nil || command.Process == nil {
		return privateGuardianExit{}, errors.New("runner: generated Python process is unavailable")
	}
	targetDone := make(chan error, 1)
	go func() { targetDone <- command.Wait() }()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	select {
	case targetErr := <-targetDone:
		return finishLinuxGuardianTarget(targetErr, status)
	case received := <-signals:
		return terminateLinuxGuardianTarget(command, targetDone, status, received)
	}
}

func finishLinuxGuardianTarget(targetErr error, status *os.File) (privateGuardianExit, error) {
	return finishLinuxGuardianTargetWithOperations(targetErr, status, linuxGuardianTargetFinishOperations{
		reapChildren: func() error { return reapLinuxGuardianChildren(defaultLinuxGuardianReaperOperations()) },
	})
}

func finishLinuxGuardianTargetWithOperations(
	targetErr error,
	status *os.File,
	operations linuxGuardianTargetFinishOperations,
) (privateGuardianExit, error) {
	if operations.reapChildren == nil {
		return privateGuardianExit{}, errors.New("runner: Linux guardian target finish operations are unavailable")
	}

	reapErr := operations.reapChildren()
	result, targetStatusErr := privateGuardianExitFromTarget(targetErr)
	if reapErr != nil || targetStatusErr != nil {
		return privateGuardianExit{}, errors.Join(targetStatusErr, reapErr)
	}
	if err := writePrivateGuardianStatus(status, privateGuardianComplete); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: report Linux guardian completion: %w", err)
	}
	return result, nil
}

func terminateLinuxGuardianTarget(
	command *exec.Cmd,
	targetDone <-chan error,
	status *os.File,
	received os.Signal,
) (privateGuardianExit, error) {
	if command == nil || command.Process == nil {
		return privateGuardianExit{}, errors.New("runner: generated Python process is unavailable")
	}
	if err := command.Process.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return privateGuardianExit{}, fmt.Errorf("runner: request generated Python termination: %w", err)
	}
	time.Sleep(processTerminationGrace)
	if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return privateGuardianExit{}, fmt.Errorf("runner: kill generated Python: %w", err)
	}
	<-targetDone
	if err := reapLinuxGuardianChildren(defaultLinuxGuardianReaperOperations()); err != nil {
		return privateGuardianExit{}, err
	}
	if err := writePrivateGuardianStatus(status, privateGuardianTerminated); err != nil {
		return privateGuardianExit{}, fmt.Errorf("runner: report Linux guardian termination: %w", err)
	}
	terminationSignal, ok := received.(syscall.Signal)
	if !ok {
		terminationSignal = syscall.SIGTERM
	}
	return privateGuardianExit{signal: terminationSignal}, nil
}

func exitLinuxPrivateGuardian(result privateGuardianExit) {
	if result.signal != 0 {
		signal.Reset(result.signal)
		_ = syscall.Kill(os.Getpid(), result.signal)
		os.Exit(128 + int(result.signal))
	}
	os.Exit(result.code)
}

func defaultLinuxGuardianReaperOperations() linuxGuardianReaperOperations {
	return linuxGuardianReaperOperations{
		children:   linuxGuardianChildren,
		kill:       syscall.Kill,
		waitOne:    waitForLinuxGuardianChild,
		waitNoHang: waitForLinuxGuardianChildNoHang,
	}
}

func reapLinuxGuardianChildren(operations linuxGuardianReaperOperations) error {
	if operations.children == nil || operations.kill == nil || operations.waitOne == nil || operations.waitNoHang == nil {
		return errors.New("runner: Linux guardian reaper operations are unavailable")
	}
	for {
		done, err := reapLinuxGuardianChildBatch(operations)
		if err != nil {
			return err
		}
		if done {
			return nil
		}
	}
}

func reapLinuxGuardianChildBatch(operations linuxGuardianReaperOperations) (bool, error) {
	children, err := operations.children()
	if err != nil {
		return false, err
	}
	if len(children) == 0 {
		return reapLinuxGuardianWithoutChildren(operations)
	}
	if err := killLinuxGuardianChildren(children, operations.kill); err != nil {
		return false, err
	}
	if err := operations.waitOne(); err != nil && !errors.Is(err, syscall.ECHILD) {
		return false, fmt.Errorf("runner: reap Linux guardian child: %w", err)
	}
	return false, nil
}

func reapLinuxGuardianWithoutChildren(operations linuxGuardianReaperOperations) (bool, error) {
	reaped, err := operations.waitNoHang()
	if errors.Is(err, syscall.ECHILD) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if reaped {
		return false, nil
	}

	return false, nil
}

func killLinuxGuardianChildren(children []int, kill func(int, syscall.Signal) error) error {
	for _, processID := range children {
		if err := kill(processID, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return fmt.Errorf("runner: kill Linux guardian child %d: %w", processID, err)
		}
	}
	return nil
}

func linuxGuardianChildren() ([]int, error) {
	threads, err := os.ReadDir(linuxProcessRoot)
	if err != nil {
		return nil, fmt.Errorf("runner: list Linux guardian threads: %w", err)
	}
	seen := make(map[int]struct{})
	for _, thread := range threads {
		contents, err := os.ReadFile(filepath.Join(linuxProcessRoot, thread.Name(), "children"))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("runner: list Linux guardian children for thread %s: %w", thread.Name(), err)
		}
		for _, value := range strings.Fields(string(contents)) {
			processID, err := strconv.Atoi(value)
			if err != nil || processID < 1 {
				return nil, fmt.Errorf("runner: parse Linux guardian child PID %q", value)
			}
			seen[processID] = struct{}{}
		}
	}
	children := make([]int, 0, len(seen))
	for processID := range seen {
		children = append(children, processID)
	}
	sort.Ints(children)
	return children, nil
}

func waitForLinuxGuardianChild() error {
	var status syscall.WaitStatus
	_, err := syscall.Wait4(-1, &status, 0, nil)
	return err
}

func waitForLinuxGuardianChildNoHang() (bool, error) {
	var status syscall.WaitStatus
	processID, err := syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
	if err != nil {
		return false, err
	}
	return processID > 0, nil
}
