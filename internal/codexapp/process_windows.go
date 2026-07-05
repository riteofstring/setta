//go:build windows

package codexapp

import (
	"os"
	"os/exec"
)

func configureCommandProcessGroup(*exec.Cmd) {}

func terminateCommandProcess(cmd *exec.Cmd) error {
	return killCommandProcess(cmd)
}

func killCommandProcess(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return os.ErrProcessDone
	}
	return cmd.Process.Kill()
}
