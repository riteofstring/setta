//go:build !windows && !darwin && !linux

package runner

import (
	"errors"
	"os/exec"
)

// These platforms do not expose a private process-tree ownership primitive
// comparable to a Windows Job Object, Linux PID namespace, or macOS Seatbelt
// syscall policy. Refuse the run rather than claim that a process group can
// contain a child that creates a new session.
func prepareProcessLaunch(string, string, string, []string) (processLaunch, error) {
	return processLaunch{}, errors.New("runner: POSIX process containment is unavailable on this platform")
}

func configureProcess(*exec.Cmd) {}
