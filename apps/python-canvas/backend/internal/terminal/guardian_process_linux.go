//go:build linux

package terminal

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

const linuxProcessRoot = "/proc"

type linuxTerminalProcessSnapshot struct {
	terminalProcessSnapshot
	startTime uint64
}

func terminalProcessSnapshots() ([]terminalProcessSnapshot, error) {
	linuxSnapshots, err := linuxTerminalProcessSnapshots()
	return terminalProcessSnapshotsFromLinux(linuxSnapshots), err
}

func linuxTerminalProcessSnapshots() ([]linuxTerminalProcessSnapshot, error) {
	entries, err := os.ReadDir(linuxProcessRoot)
	if err != nil {
		return nil, err
	}
	snapshots := make([]linuxTerminalProcessSnapshot, 0, len(entries))
	var result error
	for _, entry := range entries {
		if !terminalProcessName(entry.Name()) {
			continue
		}
		pid, parseErr := parseTerminalProcessNumber(entry.Name(), false)
		if parseErr != nil {
			continue
		}
		contents, readErr := os.ReadFile(filepath.Join(linuxProcessRoot, entry.Name(), "stat"))
		if readErr != nil {
			if errors.Is(readErr, os.ErrNotExist) {
				continue
			}
			result = errors.Join(result, fmt.Errorf("read process %d stat: %w", pid, readErr))
			continue
		}
		snapshot, parseErr := parseLinuxTerminalProcessStat(contents)
		if parseErr != nil {
			result = errors.Join(result, fmt.Errorf("parse process %d stat: %w", pid, parseErr))
			continue
		}
		if snapshot.pid != pid {
			result = errors.Join(result, fmt.Errorf("process %d stat reported PID %d", pid, snapshot.pid))
			continue
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, result
}

func terminalProcessSnapshotsFromLinux(source []linuxTerminalProcessSnapshot) []terminalProcessSnapshot {
	if source == nil {
		return nil
	}
	snapshots := make([]terminalProcessSnapshot, 0, len(source))
	for _, snapshot := range source {
		snapshots = append(snapshots, snapshot.terminalProcessSnapshot)
	}
	return snapshots
}

func parseLinuxTerminalProcessStat(contents []byte) (linuxTerminalProcessSnapshot, error) {
	value := strings.TrimSpace(string(contents))
	firstSpace := strings.IndexByte(value, ' ')
	if firstSpace < 1 || firstSpace+1 >= len(value) || value[firstSpace+1] != '(' {
		return linuxTerminalProcessSnapshot{}, errors.New("missing process name delimiter")
	}
	pid, err := parseTerminalProcessNumber(value[:firstSpace], false)
	if err != nil {
		return linuxTerminalProcessSnapshot{}, fmt.Errorf("parse PID: %w", err)
	}
	lastParenthesis := strings.LastIndex(value, ")")
	if lastParenthesis <= firstSpace+1 {
		return linuxTerminalProcessSnapshot{}, errors.New("missing process name terminator")
	}
	fields := strings.Fields(value[lastParenthesis+1:])

	if len(fields) < 20 {
		return linuxTerminalProcessSnapshot{}, errors.New("missing process state fields")
	}
	if len(fields[0]) != 1 {
		return linuxTerminalProcessSnapshot{}, errors.New("invalid process state")
	}
	parentPID, err := parseTerminalProcessNumber(fields[1], true)
	if err != nil {
		return linuxTerminalProcessSnapshot{}, fmt.Errorf("parse parent PID: %w", err)
	}
	sessionID, err := parseTerminalProcessNumber(fields[3], true)
	if err != nil {
		return linuxTerminalProcessSnapshot{}, fmt.Errorf("parse session ID: %w", err)
	}
	startTime, err := strconv.ParseUint(fields[19], 10, 64)
	if err != nil {
		return linuxTerminalProcessSnapshot{}, fmt.Errorf("parse process start time: %w", err)
	}
	return linuxTerminalProcessSnapshot{
		terminalProcessSnapshot: terminalProcessSnapshot{
			pid:          pid,
			parentPID:    parentPID,
			sessionID:    sessionID,
			hasSessionID: true,
			zombie:       fields[0] == "Z",
		},
		startTime: startTime,
	}, nil
}

func terminalProcessName(value string) bool {
	if value == "" {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func terminalSnapshotMayBelongToGuardian(
	snapshot terminalProcessSnapshot,
	sessionID int,
	snapshots []terminalProcessSnapshot,
) bool {
	if snapshot.hasSessionID && snapshot.sessionID == sessionID {
		return true
	}
	return terminalSnapshotDescendsFrom(snapshot.pid, sessionID, snapshots)
}

func terminalEscapedGuardianMemberMatches(pid int, guardianPID int) (bool, error) {
	snapshots, err := terminalProcessSnapshots()
	if err != nil {
		return false, err
	}
	return terminalSnapshotDescendsFrom(pid, guardianPID, snapshots), nil
}

func terminalSnapshotDescendsFrom(
	pid int,
	ancestorPID int,
	snapshots []terminalProcessSnapshot,
) bool {
	byPID := make(map[int]terminalProcessSnapshot, len(snapshots))
	for _, snapshot := range snapshots {
		byPID[snapshot.pid] = snapshot
	}
	current, ok := byPID[pid]
	if !ok {
		return false
	}
	visited := map[int]struct{}{pid: {}}
	for {
		if current.parentPID == ancestorPID {
			return true
		}
		if _, duplicate := visited[current.parentPID]; duplicate {
			return false
		}
		visited[current.parentPID] = struct{}{}
		parent, ok := byPID[current.parentPID]
		if !ok {
			return false
		}
		current = parent
	}
}

func signalTerminalSessionMember(
	pid int,
	sessionID int,
	delivery syscall.Signal,
) error {
	before, err := terminalLinuxSignalTarget(pid, sessionID)
	if err != nil || before == nil {
		return err
	}
	process, available, err := openTerminalProcessPIDFD(pid)
	if err != nil || !available {
		return err
	}
	defer unix.Close(process)
	return signalVerifiedTerminalProcessPIDFD(process, pid, sessionID, delivery, before.startTime)
}

func openTerminalProcessPIDFD(pid int) (int, bool, error) {
	process, err := unix.PidfdOpen(pid, 0)
	if err == nil {
		return process, true, nil
	}
	if errors.Is(err, unix.ESRCH) || terminalPIDFDUnavailable(err) {

		return 0, false, nil
	}
	return 0, false, fmt.Errorf("open terminal process pidfd: %w", err)
}

func signalVerifiedTerminalProcessPIDFD(
	process int,
	pid int,
	sessionID int,
	delivery syscall.Signal,
	startTime uint64,
) error {
	after, err := terminalLinuxSignalTarget(pid, sessionID)
	if err != nil || after == nil || startTime != after.startTime {
		return err
	}
	if err := unix.PidfdSendSignal(process, unix.Signal(delivery), nil, 0); err != nil {
		if errors.Is(err, unix.ESRCH) || terminalPIDFDUnavailable(err) {
			return nil
		}
		return err
	}
	return nil
}

func terminalPIDFDUnavailable(err error) bool { return errors.Is(err, unix.ENOSYS) }

func terminalLinuxSignalTarget(
	pid int,
	sessionID int,
) (*linuxTerminalProcessSnapshot, error) {
	linuxSnapshots, err := linuxTerminalProcessSnapshots()
	if err != nil {
		return nil, err
	}
	snapshots := terminalProcessSnapshotsFromLinux(linuxSnapshots)
	var target linuxTerminalProcessSnapshot
	found := false
	for _, snapshot := range linuxSnapshots {
		if snapshot.pid == pid {
			target = snapshot
			found = true
			break
		}
	}
	if !found || target.zombie || !terminalSnapshotMayBelongToGuardian(target.terminalProcessSnapshot, sessionID, snapshots) {
		return nil, nil
	}
	actualSessionID, err := unix.Getsid(pid)
	if err != nil {
		if errors.Is(err, unix.ESRCH) {
			return nil, nil
		}
		return nil, err
	}
	if actualSessionID != sessionID && !terminalSnapshotDescendsFrom(pid, sessionID, snapshots) {
		return nil, nil
	}
	return &target, nil
}
