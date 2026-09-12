//go:build !windows && !linux

package terminal

func enableTerminalGuardianChildContainment() error { return nil }

func terminalGuardianSurvivorsAreProvisional() bool { return false }

func reapTerminalGuardianChildren(_ int) error { return nil }
