//go:build windows

package launcher

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

func configureStartedProcessTree(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

func killStartedProcessTree(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	pid := cmd.Process.Pid
	if pid <= 0 {
		return nil
	}
	taskkill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid))
	if output, err := taskkill.CombinedOutput(); err != nil {
		if killErr := cmd.Process.Kill(); killErr == nil {
			return nil
		}
		return fmt.Errorf("taskkill process tree for pid %d: %w: %s", pid, err, strings.TrimSpace(string(output)))
	}
	return nil
}
