//go:build !windows

package runner

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const processTerminationGrace = 100 * time.Millisecond

type posixOwnedProcess struct {
	groupID int
	kill    func(int, syscall.Signal) error
	sleep   func(time.Duration)
}

type posixProcessOperations struct {
	kill           func(int, syscall.Signal) error
	sleep          func(time.Duration)
	currentProcess func() int
	currentGroup   func() int
}

func startOwnedProcess(launch processLaunch) (ownedProcess, error) {
	command := launch.command
	if command == nil {
		return nil, errors.New("runner: generated Python command is required")
	}
	configureProcess(command)
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("runner: start generated Python: %w", err)
	}
	newOwner := launch.newOwner
	if newOwner == nil {
		newOwner = func(command *exec.Cmd) (ownedProcess, error) {
			return newPOSIXOwnedProcess(command, defaultPOSIXProcessOperations())
		}
	}
	owner, err := newOwner(command)
	if err == nil {
		return owner, nil
	}
	return nil, cleanupStartedProcessError(err, command)
}

func defaultPOSIXProcessOperations() posixProcessOperations {
	return posixProcessOperations{
		kill:           syscall.Kill,
		sleep:          time.Sleep,
		currentProcess: os.Getpid,
		currentGroup:   syscall.Getpgrp,
	}
}

func newPOSIXOwnedProcess(command *exec.Cmd, operations posixProcessOperations) (*posixOwnedProcess, error) {
	if command == nil || command.Process == nil {
		return nil, errors.New("runner: generated Python process is unavailable")
	}
	return newPOSIXOwnedProcessForPID(command.Process.Pid, operations)
}

func newPOSIXOwnedProcessForPID(processID int, operations posixProcessOperations) (*posixOwnedProcess, error) {
	if err := validateOwnedProcessGroup(processID, operations); err != nil {
		return nil, err
	}
	return &posixOwnedProcess{
		groupID: processID,
		kill:    operations.kill,
		sleep:   operations.sleep,
	}, nil
}

func validateOwnedProcessGroup(groupID int, operations posixProcessOperations) error {
	if groupID < 1 {
		return errors.New("runner: generated Python process group is invalid")
	}
	if operations.currentProcess == nil || operations.currentGroup == nil || operations.kill == nil || operations.sleep == nil {
		return errors.New("runner: POSIX process operations are unavailable")
	}
	if groupID == operations.currentProcess() || groupID == operations.currentGroup() {
		return errors.New("runner: generated Python process group is unsafe")
	}
	return nil
}

func (process *posixOwnedProcess) terminate() error {
	if process == nil {
		return errors.New("runner: generated Python process owner is unavailable")
	}
	return requestPOSIXProcessGroupTermination(process.groupID, process.kill)
}

func (process *posixOwnedProcess) finalize() error {
	if process == nil {
		return errors.New("runner: generated Python process owner is unavailable")
	}
	return terminatePOSIXProcessGroup(process.groupID, process.kill, process.sleep)
}

func requestPOSIXProcessGroupTermination(groupID int, kill func(int, syscall.Signal) error) error {
	if groupID < 1 || kill == nil {
		return errors.New("runner: generated Python process group is unavailable")
	}
	if err := kill(-groupID, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("runner: terminate process group %d: %w", groupID, err)
	}
	return nil
}

func terminatePOSIXProcessGroup(groupID int, kill func(int, syscall.Signal) error, sleep func(time.Duration)) error {
	if groupID < 1 || kill == nil || sleep == nil {
		return errors.New("runner: generated Python process group is unavailable")
	}
	termErr := kill(-groupID, syscall.SIGTERM)
	if errors.Is(termErr, syscall.ESRCH) {
		return nil
	}
	if termErr == nil {
		sleep(processTerminationGrace)
	}
	killErr := kill(-groupID, syscall.SIGKILL)
	if errors.Is(killErr, syscall.ESRCH) {
		killErr = nil
	}
	if termErr == nil && killErr == nil {
		return nil
	}
	return fmt.Errorf("runner: terminate process group %d: %w", groupID, errors.Join(termErr, killErr))
}

func cleanupStartedProcessError(cause error, command *exec.Cmd) error {
	if err := cleanupStartedCommand(command); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: stop partially started generated Python: %w", err))
	}
	return cause
}
