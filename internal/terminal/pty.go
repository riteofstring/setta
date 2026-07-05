package terminal

import (
	"context"
	"errors"
	"os/exec"
)

type Profile struct {
	ID         string
	Name       string
	LaunchMode ProfileLaunchMode
	ShellPath  string
	Args       []string
	Env        map[string]string
	CWD        string
	Term       string
	Cols       int
	Rows       int
}

type PTYStarter interface {
	Start(ctx context.Context, profile Profile) (PTYHandle, error)
}

type PTYHandle interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Resize(cols int, rows int) error
	Terminate() error
	Kill() error
	Close() error
	Wait() error
}

type PTYCloseSafetyAssessor interface {
	CloseSafetyAssessment() TerminalCloseAssessment
}

type UnsupportedPlatformError struct {
	Platform string
}

func (err UnsupportedPlatformError) Error() string {
	return "embedded terminal PTY is unsupported on " + err.Platform
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode()
	}
	return -1
}
