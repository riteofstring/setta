//go:build linux

package terminal

import (
	"errors"
	"slices"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestTerminalGuardianSubreaperFallbackKillsThenReapsDirectChildren(t *testing.T) {
	guardianPID := 500
	snapshots := [][]terminalProcessSnapshot{
		{{pid: 501, parentPID: guardianPID}},
		{{pid: 501, parentPID: guardianPID, zombie: true}},
	}
	snapshotCall := 0
	waitCalls := 0
	var killed []int
	now := time.Unix(0, 0)
	err := reapTerminalGuardianChildrenWithOperations(guardianPID, terminalGuardianChildOperations{
		snapshots: func() ([]terminalProcessSnapshot, error) {
			index := snapshotCall
			if index >= len(snapshots) {
				index = len(snapshots) - 1
			}
			snapshotCall++
			return snapshots[index], nil
		},
		kill: func(pid int, delivery syscall.Signal) error {
			if delivery != syscall.SIGKILL {
				t.Fatalf("fallback signal = %v, want SIGKILL", delivery)
			}
			killed = append(killed, pid)
			return nil
		},
		wait: func() (int, error) {
			waitCalls++
			if waitCalls == 1 {
				return 0, nil
			}
			return 0, unix.ECHILD
		},
		now:   func() time.Time { return now },
		sleep: func(time.Duration) {},
	})
	if err != nil {
		t.Fatalf("reap terminal guardian children: %v", err)
	}
	if !slices.Equal(killed, []int{501}) {
		t.Fatalf("fallback killed PIDs = %v, want [501]", killed)
	}
}

func TestTerminalPIDFDUnavailableOnlyDefersENOSYS(t *testing.T) {
	if !terminalPIDFDUnavailable(unix.ENOSYS) {
		t.Fatal("ENOSYS did not select the Linux subreaper fallback")
	}
	if terminalPIDFDUnavailable(errors.New("permission denied")) {
		t.Fatal("non-ENOSYS pidfd error selected the Linux subreaper fallback")
	}
}
