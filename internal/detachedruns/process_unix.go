//go:build !windows

package detachedruns

import (
	"os/exec"
	"syscall"
)

func newShellCommand(command string) (*exec.Cmd, error) {
	cmd := exec.Command("/bin/sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd, nil
}

func terminateProcess(cmd *exec.Cmd) error {
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
}

func killProcess(cmd *exec.Cmd) error {
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
