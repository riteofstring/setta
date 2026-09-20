//go:build linux

package proctree

import (
	"errors"
	"fmt"
	"syscall"
	"testing"
	"time"
)

func TestLinuxOwnerKillsAndReapsAdoptedChildrenUntilECHILD(t *testing.T) {
	snapshots := [][]int{{41, 42}, {43}, {}}
	nextSnapshot := 0
	var killed []int
	waits := []struct {
		pid int
		err error
	}{
		{pid: 41},
		{pid: 0},
		{pid: 42},
		{pid: 0},
		{err: syscall.ECHILD},
	}
	nextWait := 0
	now := time.Unix(1, 0)
	err := terminateAndReapLinuxChildren(time.Second, linuxOwnerOperations{
		children: func() ([]int, error) {
			if nextSnapshot >= len(snapshots) {
				return nil, errors.New("unexpected child snapshot")
			}
			children := snapshots[nextSnapshot]
			nextSnapshot++
			return children, nil
		},
		kill: func(processID int, delivery syscall.Signal) error {
			if delivery != syscall.SIGKILL {
				t.Fatalf("signal = %s", delivery)
			}
			killed = append(killed, processID)
			return nil
		},
		wait: func() (int, error) {
			if nextWait >= len(waits) {
				return -1, errors.New("unexpected wait")
			}
			result := waits[nextWait]
			nextWait++
			return result.pid, result.err
		},
		now: func() time.Time { return now },
		sleep: func(duration time.Duration) {
			now = now.Add(duration)
		},
	})
	if err != nil {
		t.Fatalf("terminateAndReapLinuxChildren() error = %v", err)
	}
	if got, want := fmt.Sprint(killed), "[41 42 43]"; got != want {
		t.Fatalf("killed children = %s, want %s", got, want)
	}
}

func TestLinuxOwnerBoundsCleanupAndReportsKillFailure(t *testing.T) {
	now := time.Unix(1, 0)
	killErr := errors.New("kill denied")
	err := terminateAndReapLinuxChildren(10*time.Millisecond, linuxOwnerOperations{
		children: func() ([]int, error) { return []int{41}, nil },
		kill:     func(int, syscall.Signal) error { return killErr },
		wait:     func() (int, error) { return 0, nil },
		now:      func() time.Time { return now },
		sleep:    func(duration time.Duration) { now = now.Add(duration) },
	})
	if !errors.Is(err, killErr) || err == nil {
		t.Fatalf("terminateAndReapLinuxChildren() error = %v", err)
	}
}

func TestLinuxOwnerCloseIsIdempotent(t *testing.T) {
	owner := &LinuxOwner{timeout: time.Second, closed: true, err: syscall.EPERM}
	if err := owner.Close(); !errors.Is(err, syscall.EPERM) {
		t.Fatalf("Close() error = %v", err)
	}
}
