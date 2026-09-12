//go:build darwin

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

const (
	darwinSandboxExecutable = "/usr/bin/sandbox-exec"

	darwinProcessContainmentProfile = "(version 1) (deny syscall-unix (syscall-number SYS_setsid) (syscall-number SYS_setpgid)) (allow default)"
)

func prepareProcessLaunch(interpreter string, artifact string, directory string, environment []string) (processLaunch, error) {
	if err := validateDarwinContainmentLauncher(); err != nil {
		return processLaunch{}, err
	}
	return preparePrivateGuardianLaunch(
		darwinPrivateGuardianInvocation,
		interpreter,
		artifact,
		directory,
		environment,
	)
}

func validateDarwinContainmentLauncher() error {
	info, err := os.Stat(darwinSandboxExecutable)
	if err != nil {
		return fmt.Errorf("runner: macOS process containment launcher is unavailable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("runner: macOS process containment launcher %q is not a regular file", darwinSandboxExecutable)
	}
	return nil
}

func configureProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
