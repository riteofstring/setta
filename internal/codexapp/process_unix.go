//go:build !windows

package codexapp

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

func configureCommandProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func terminateCommandProcess(cmd *exec.Cmd) error {
	return signalCommandProcessGroup(cmd, syscall.SIGTERM)
}

func killCommandProcess(cmd *exec.Cmd) error {
	return signalCommandProcessGroup(cmd, syscall.SIGKILL)
}

func signalCommandProcessGroup(cmd *exec.Cmd, signal syscall.Signal) error {
	if cmd == nil || cmd.Process == nil {
		return os.ErrProcessDone
	}
	if err := syscall.Kill(-cmd.Process.Pid, signal); err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
	return nil
}
