//go:build windows

package runner

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

type windowsOwnedProcess struct {
	job    *proctree.Job
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
	command := launch.command
	if command == nil {
		return nil, errors.New("runner: generated Python command is required")
	}
	job, err := proctree.NewJob()
	if err != nil {
		return nil, fmt.Errorf("runner: create generated Python process owner: %w", err)
	}
	if err := command.Start(); err != nil {
		return nil, errors.Join(fmt.Errorf("runner: start generated Python: %w", err), job.Close(), cleanupStartedCommand(command))
	}
	if command.Process == nil || command.Process.Pid < 1 {
		return nil, cleanupWindowsOwnedProcessStart(errors.New("runner: generated Python process is unavailable"), command, job)
	}
	if err := job.Assign(command.Process.Pid); err != nil {
		return nil, cleanupWindowsOwnedProcessStart(fmt.Errorf("runner: assign generated Python process owner: %w", err), command, job)
	}
	return &windowsOwnedProcess{job: job}, nil
}

func cleanupWindowsOwnedProcessStart(cause error, command *exec.Cmd, job *proctree.Job) error {
	var cleanup []error
	if err := job.Close(); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: close generated Python process owner: %w", err))
	}
	if err := cleanupStartedCommand(command); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: stop partially started generated Python: %w", err))
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func configureProcess(*exec.Cmd) {}

func (process *windowsOwnedProcess) terminate() error {
	return process.closeJob()
}

func (process *windowsOwnedProcess) finalize() error {
	return process.closeJob()
}

func (process *windowsOwnedProcess) closeJob() error {
	if process == nil || process.job == nil {
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
