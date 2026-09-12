//go:build darwin

package terminal

import "testing"

func TestParseDarwinTerminalProcessStatusRequiresNumericPIDAndParentPID(t *testing.T) {
	snapshots, err := parseDarwinTerminalProcessStatus([]byte("  42  7\n  8  0\n"))
	if err != nil {
		t.Fatalf("parse process status: %v", err)
	}
	if len(snapshots) != 2 || snapshots[0].pid != 42 || snapshots[0].parentPID != 7 || snapshots[0].hasSessionID || snapshots[1].pid != 8 || snapshots[1].parentPID != 0 {
		t.Fatalf("snapshots = %#v", snapshots)
	}
	for _, contents := range [][]byte{
		[]byte("42\n"),
		[]byte("not-a-pid 7\n"),
		[]byte("42 -7\n"),
		[]byte("42 7 extra\n"),
	} {
		if _, err := parseDarwinTerminalProcessStatus(contents); err == nil {
			t.Fatalf("parse process status %q error = nil", contents)
		}
	}
}
