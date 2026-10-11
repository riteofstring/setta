//go:build !darwin && !linux && !windows

package worker

import (
	"fmt"
	"io"
	"os"
	"os/exec"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

func startContainedWorker(string, string, string, []string, *os.File, *os.File, io.Writer, io.Writer) (*exec.Cmd, ownedProcess, error) {
	return nil, nil, fmt.Errorf("worker: process containment is unsupported on this platform: %w", proctree.ErrUnsupported)
}
