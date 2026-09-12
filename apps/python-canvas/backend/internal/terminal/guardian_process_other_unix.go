//go:build !windows && !linux && !darwin

package terminal

import (
	"fmt"
	"strings"
)

func terminalProcessSnapshots() ([]terminalProcessSnapshot, error) {
	output, err := terminalProcessStatusOutput("-axo", "pid=,ppid=")
	if err != nil {
		return nil, err
	}
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
			return nil, err
		}
		parentPID, err := parseTerminalProcessNumber(fields[1], true)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, terminalProcessSnapshot{pid: pid, parentPID: parentPID})
	}
	return snapshots, nil
}
