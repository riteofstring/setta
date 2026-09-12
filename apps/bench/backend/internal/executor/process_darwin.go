//go:build darwin

package executor

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

const (
	darwinSandbox = "/usr/bin/sandbox-exec"
	darwinProfile = "(version 1) (deny syscall-unix (syscall-number SYS_setsid) (syscall-number SYS_setpgid)) (allow default)"
)

type darwinProcess struct {
	group int
	once  sync.Once
	err   error
}

func startOwned(candidate *exec.Cmd) (*exec.Cmd, ownedProcess, error) {
	entry, err := os.Stat(darwinSandbox)
	if err != nil || !entry.Mode().IsRegular() {
		return nil, nil, errors.New("executor: macOS containment launcher is unavailable")
	}
	arguments := append([]string{"-p", darwinProfile, candidate.Path}, candidate.Args[1:]...)
	command := exec.Command(darwinSandbox, arguments...)
	copyCommand(command, candidate)
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		return nil, nil, fmt.Errorf("executor: start contained candidate: %w", err)
	}
	if command.Process == nil || command.Process.Pid < 1 {
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		_ = command.Wait()
		return nil, nil, errors.New("executor: candidate process is unavailable")
	}
	owner := &darwinProcess{group: command.Process.Pid}
	group, err := syscall.Getpgid(owner.group)
	if err != nil || group != owner.group {
		_ = owner.Terminate()
		_ = command.Wait()
		return nil, nil, errors.New("executor: macOS process group ownership failed")
	}
	return command, owner, nil
}

func (process *darwinProcess) Terminate() error {
	return process.stop()
}

func (process *darwinProcess) Finalize() error {
	return process.stop()
}

func (process *darwinProcess) stop() error {
	if process == nil || process.group < 1 {
		return errors.New("executor: macOS process group is unavailable")
	}
	process.once.Do(func() {
		termErr := syscall.Kill(-process.group, syscall.SIGTERM)
		if errors.Is(termErr, syscall.ESRCH) {
			termErr = nil
		}
		if termErr == nil {
			time.Sleep(100 * time.Millisecond)
		}
		killErr := syscall.Kill(-process.group, syscall.SIGKILL)
		if errors.Is(killErr, syscall.ESRCH) {
			killErr = nil
		}
		process.err = errors.Join(termErr, killErr)
	})
	return process.err
}
