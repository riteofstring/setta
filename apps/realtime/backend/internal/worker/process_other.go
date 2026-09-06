//go:build !darwin && !linux && !windows

package worker

import (
	"errors"
	"io"
	"os"
	"os/exec"
)

func startContainedWorker(string, string, string, []string, *os.File, *os.File, io.Writer, io.Writer) (*exec.Cmd, ownedProcess, error) {
	return nil, nil, errors.New("worker: process containment is unsupported on this platform")
}
