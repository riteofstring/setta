//go:build !windows && !linux

package terminal

// POSIX exposes no portable subreaper equivalent. The guardian keeps the
// verified SID boundary on these platforms; platform-specific containment is
// deliberately not guessed from process names or polling.
func enableTerminalGuardianChildContainment() error { return nil }

func terminalGuardianSurvivorsAreProvisional() bool { return false }

func reapTerminalGuardianChildren(_ int) error { return nil }
