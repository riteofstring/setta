//go:build !darwin && !linux && !windows

package executor

import (
	"errors"
	"os/exec"
)

func startOwned(*exec.Cmd) (*exec.Cmd, ownedProcess, error) {
	return nil, nil, errors.New("executor: process containment is unsupported on this platform")
}
