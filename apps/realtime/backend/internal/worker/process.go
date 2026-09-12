package worker

import (
	"io"
	"os"
	"os/exec"
)

type ownedProcess interface {
	terminate() error
	finalize() error
}

type processStart struct {
	interpreter string
	bootstrap   string
	directory   string
	environment []string
	input       *os.File
	output      *os.File
	stdout      io.Writer
	stderr      io.Writer
}

func workerCommand(start processStart, executable string, arguments ...string) *exec.Cmd {
	command := exec.Command(executable, arguments...)
	command.Dir = start.directory
	command.Env = append([]string(nil), start.environment...)
	command.Stdout = start.stdout
	command.Stderr = start.stderr
	return command
}
