//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package proctree

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

const TerminationGrace = 100 * time.Millisecond

type groupOperations struct {
	kill           func(int, syscall.Signal) error
	group          func(int) (int, error)
	currentProcess func() int
	currentGroup   func() int
	sleep          func(time.Duration)
}

type Group struct {
	id         int
	operations groupOperations
	mutex      sync.Mutex
	requested  bool
	requestErr error
	closed     bool
	closeErr   error
}

func ConfigureGroup(command *exec.Cmd) error {
	if command == nil {
		return errors.New("proctree: command is required")
	}
	if command.SysProcAttr == nil {
		command.SysProcAttr = &syscall.SysProcAttr{}
	}
	command.SysProcAttr.Setpgid = true
	return nil
}

func NewGroup(processID int) (*Group, error) {
	return newGroup(processID, groupOperations{
		kill:           syscall.Kill,
		group:          syscall.Getpgid,
		currentProcess: os.Getpid,
		currentGroup:   syscall.Getpgrp,
		sleep:          time.Sleep,
	})
}

func newGroup(processID int, operations groupOperations) (*Group, error) {
	if processID < 1 {
		return nil, errors.New("proctree: process group is invalid")
	}
	if operations.kill == nil || operations.group == nil || operations.currentProcess == nil || operations.currentGroup == nil || operations.sleep == nil {
		return nil, errors.New("proctree: process group operations are unavailable")
	}
	if processID == operations.currentProcess() || processID == operations.currentGroup() {
		return nil, errors.New("proctree: process group is unsafe")
	}
	return &Group{id: processID, operations: operations}, nil
}

func (group *Group) ID() int {
	if group == nil {
		return 0
	}
	return group.id
}

func (group *Group) VerifyLeader() error {
	if group == nil {
		return errors.New("proctree: process group is unavailable")
	}
	actual, err := group.operations.group(group.id)
	if err != nil {
		return fmt.Errorf("proctree: verify process group %d: %w", group.id, err)
	}
	if actual != group.id {
		return fmt.Errorf("proctree: process group changed from %d to %d", group.id, actual)
	}
	return nil
}

func (group *Group) RequestTermination() error {
	if group == nil {
		return errors.New("proctree: process group is unavailable")
	}
	group.mutex.Lock()
	defer group.mutex.Unlock()
	if group.closed {
		return group.closeErr
	}
	if group.requested {
		return group.requestErr
	}
	group.requested = true
	group.requestErr = group.signal(syscall.SIGTERM)
	return group.requestErr
}

func (group *Group) Close() error {
	if group == nil {
		return errors.New("proctree: process group is unavailable")
	}
	group.mutex.Lock()
	defer group.mutex.Unlock()
	if group.closed {
		return group.closeErr
	}
	group.closed = true
	termErr := group.signal(syscall.SIGTERM)
	if termErr == nil {
		group.operations.sleep(TerminationGrace)
	}
	killErr := group.signal(syscall.SIGKILL)
	group.closeErr = errors.Join(termErr, killErr)
	return group.closeErr
}

func (group *Group) signal(delivery syscall.Signal) error {
	actual, err := group.operations.group(group.id)
	if err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("proctree: verify process group %d: %w", group.id, err)
	}
	if err == nil && actual != group.id {
		return fmt.Errorf("proctree: process group changed from %d to %d", group.id, actual)
	}
	if err := group.operations.kill(-group.id, delivery); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("proctree: signal process group %d: %w", group.id, err)
	}
	return nil
}
