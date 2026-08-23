//go:build darwin

package terminal

import (
	"errors"
	"fmt"
	"os"
)

const (
	terminalGuardianSandboxExecPath = "/usr/bin/sandbox-exec"
	// Seatbelt policies are inherited and cannot be relaxed by descendants.
	// Permit process-group changes used by interactive job control, while deny
	// only session creation so no shell descendant can leave this guardian SID.
	terminalGuardianSandboxProfile = "(version 1) (allow default) (allow syscall-unix (syscall-number SYS_setpgid)) (deny syscall-unix (syscall-number SYS_setsid))"
)

func terminalGuardianProtectedShell(shell []string) ([]string, error) {
	info, err := os.Stat(terminalGuardianSandboxExecPath)
	if err != nil {
		return nil, fmt.Errorf("locate terminal session containment helper: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return nil, errors.New("terminal session containment helper is unavailable")
	}
	arguments := make([]string, 0, len(shell)+4)
	arguments = append(arguments, terminalGuardianSandboxExecPath, "-p", terminalGuardianSandboxProfile, "--")
	return append(arguments, shell...), nil
}
