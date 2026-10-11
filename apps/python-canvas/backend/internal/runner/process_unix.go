//go:build !windows

package runner

import (
	"errors"
	"fmt"
	"os/exec"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

type posixOwnedProcess struct {
	group *proctree.Group
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
			return newPOSIXOwnedProcess(command)
		}
	}
	owner, err := newOwner(command)
	if err == nil {
		return owner, nil
	}
	return nil, cleanupStartedProcessError(err, command)
}

func newPOSIXOwnedProcess(command *exec.Cmd) (*posixOwnedProcess, error) {
	if command == nil || command.Process == nil {
		return nil, errors.New("runner: generated Python process is unavailable")
	}
	group, err := proctree.NewGroup(command.Process.Pid)
	if err != nil {
		return nil, err
	}
	return &posixOwnedProcess{group: group}, nil
}

func (process *posixOwnedProcess) terminate() error {
	if process == nil {
		return errors.New("runner: generated Python process owner is unavailable")
	}
	if process.group == nil {
		return errors.New("runner: generated Python process group is unavailable")
	}
	if err := process.group.RequestTermination(); err != nil {
		return fmt.Errorf("runner: request generated Python process-tree termination: %w", err)
	}
	return nil
}

func (process *posixOwnedProcess) finalize() error {
	if process == nil {
		return errors.New("runner: generated Python process owner is unavailable")
	}
	if process.group == nil {
		return errors.New("runner: generated Python process group is unavailable")
	}
	if err := process.group.Close(); err != nil {
		return fmt.Errorf("runner: finalize generated Python process tree: %w", err)
	}
	return nil
}

func cleanupStartedProcessError(cause error, command *exec.Cmd) error {
	if err := cleanupStartedCommand(command); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: stop partially started generated Python: %w", err))
	}
	return cause
}
