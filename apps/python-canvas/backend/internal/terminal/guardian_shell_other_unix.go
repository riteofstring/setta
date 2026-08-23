//go:build !windows && !darwin

package terminal

func terminalGuardianProtectedShell(shell []string) ([]string, error) {
	return append([]string(nil), shell...), nil
}
