//go:build !windows && !darwin && !linux

package runner

import (
	"errors"
	"os/exec"
)

func prepareProcessLaunch(string, string, string, []string) (processLaunch, error) {
	return processLaunch{}, errors.New("runner: POSIX process containment is unavailable on this platform")
}

func configureProcess(*exec.Cmd) {}
