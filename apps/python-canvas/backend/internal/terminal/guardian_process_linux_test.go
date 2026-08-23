//go:build linux

package terminal

import "testing"

func TestParseLinuxTerminalProcessStatUsesNumericSessionIDAfterCommandName(t *testing.T) {
	snapshot, err := parseLinuxTerminalProcessStat([]byte("42 (shell ) with ) S 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25"))
	if err != nil {
		t.Fatalf("parse process stat: %v", err)
	}
	if snapshot.pid != 42 || snapshot.parentPID != 7 || snapshot.sessionID != 9 || !snapshot.hasSessionID || snapshot.startTime != 25 {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	for _, contents := range [][]byte{
		[]byte("42 shell S 7 8 9"),
		[]byte("42 (shell) S -7 8 9"),
		[]byte("42 (shell) S 7 8 sid"),
		[]byte("42 (shell) S 7"),
	} {
		if _, err := parseLinuxTerminalProcessStat(contents); err == nil {
			t.Fatalf("parse process stat %q error = nil", contents)
		}
	}
}

func TestParseLinuxTerminalProcessStatMarksZombiesForReapingRatherThanResignal(t *testing.T) {
	snapshot, err := parseLinuxTerminalProcessStat([]byte("42 (exited child) Z 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25"))
	if err != nil {
		t.Fatalf("parse process stat: %v", err)
	}
	if !snapshot.zombie {
		t.Fatalf("snapshot = %#v, want zombie", snapshot)
	}
}
