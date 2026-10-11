//go:build !windows && !darwin && !linux

package runner

import (
	"fmt"
	"os/exec"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

func prepareProcessLaunch(string, string, string, []string) (processLaunch, error) {
	return processLaunch{}, fmt.Errorf("runner: POSIX process containment is unavailable on this platform: %w", proctree.ErrUnsupported)
}

func configureProcess(*exec.Cmd) {}
