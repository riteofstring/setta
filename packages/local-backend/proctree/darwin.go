//go:build darwin

package proctree

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
)

const (
	darwinSandboxExecutable  = "/usr/bin/sandbox-exec"
	darwinContainmentProfile = "(version 1) (deny syscall-unix (syscall-number SYS_setsid) (syscall-number SYS_setpgid)) (allow default)"
)

func ValidateDarwinContainment() error {
	info, err := os.Stat(darwinSandboxExecutable)
	if err != nil {
		return fmt.Errorf("proctree: macOS containment launcher is unavailable: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return errors.New("proctree: macOS containment launcher is unavailable")
	}
	return nil
}

func DarwinCommand(executable string, arguments ...string) (*exec.Cmd, error) {
	if executable == "" {
		return nil, errors.New("proctree: macOS contained executable is required")
	}
	command := exec.Command(executable, arguments...)
	if err := ConfigureDarwinCommand(command); err != nil {
		return nil, err
	}
	return command, nil
}

func ConfigureDarwinCommand(command *exec.Cmd) error {
	if command == nil || command.Path == "" || len(command.Args) == 0 {
		return errors.New("proctree: macOS contained command is required")
	}
	if err := ValidateDarwinContainment(); err != nil {
		return err
	}
	arguments := make([]string, 0, len(command.Args)+3)
	arguments = append(arguments, darwinSandboxExecutable, "-p", darwinContainmentProfile)
	arguments = append(arguments, command.Args...)
	command.Path = darwinSandboxExecutable
	command.Args = arguments
	if err := ConfigureGroup(command); err != nil {
		return err
	}
	return nil
}
