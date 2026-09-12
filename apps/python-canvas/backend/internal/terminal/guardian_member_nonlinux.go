//go:build !windows && !linux

package terminal

import "syscall"

func terminalSnapshotMayBelongToGuardian(
	snapshot terminalProcessSnapshot,
	sessionID int,
	_snapshots []terminalProcessSnapshot,
) bool {
	return !snapshot.hasSessionID || snapshot.sessionID == sessionID
}

func terminalEscapedGuardianMemberMatches(_ int, _ int) (bool, error) {
	return false, nil
}

func signalTerminalSessionMember(
	pid int,
	_sessionID int,
	delivery syscall.Signal,
) error {
	return syscall.Kill(pid, delivery)
}
