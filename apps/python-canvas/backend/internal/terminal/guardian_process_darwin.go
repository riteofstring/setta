//go:build darwin

package terminal

import (
	"fmt"
	"strings"
)

// macOS may report sess= as zero for visible processes. Snapshot only fixed
// numeric PID/PPID records here; unix.Getsid is the session authority.
func terminalProcessSnapshots() ([]terminalProcessSnapshot, error) {
	output, err := terminalProcessStatusOutput("-axo", "pid=,ppid=")
	if err != nil {
		return nil, err
	}
	return parseDarwinTerminalProcessStatus(output)
}

func parseDarwinTerminalProcessStatus(output []byte) ([]terminalProcessSnapshot, error) {
	lines := strings.Split(string(output), "\n")
	snapshots := make([]terminalProcessSnapshot, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 {
			return nil, fmt.Errorf("terminal process record %q must contain PID and parent PID", line)
		}
		pid, err := parseTerminalProcessNumber(fields[0], false)
		if err != nil {
			return nil, fmt.Errorf("parse terminal process PID %q: %w", fields[0], err)
		}
		parentPID, err := parseTerminalProcessNumber(fields[1], true)
		if err != nil {
			return nil, fmt.Errorf("parse terminal process parent PID %q: %w", fields[1], err)
		}
		snapshots = append(snapshots, terminalProcessSnapshot{pid: pid, parentPID: parentPID})
	}
	return snapshots, nil
}
