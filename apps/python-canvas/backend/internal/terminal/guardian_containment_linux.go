//go:build linux

package terminal

import (
	"errors"
	"fmt"
	"sort"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

// enableTerminalGuardianChildContainment makes the long-lived PTY guardian the
// reaper for an orphaned shell descendant. A descendant can create its own
// SID with setsid(), but Linux still reparents it to this subreaper when the
// shell exits, so cleanup can retain the same containment boundary.
func enableTerminalGuardianChildContainment() error {
	return unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0)
}

func terminalGuardianSurvivorsAreProvisional() bool { return true }

type terminalGuardianChildOperations struct {
	snapshots func() ([]terminalProcessSnapshot, error)
	kill      func(int, syscall.Signal) error
	wait      func() (int, error)
	now       func() time.Time
	sleep     func(time.Duration)
}

type terminalGuardianReapWaitState uint8

const (
	terminalGuardianContinueReaping terminalGuardianReapWaitState = iota
	terminalGuardianResnapshotChildren
	terminalGuardianChildrenReaped
)

func defaultTerminalGuardianChildOperations() terminalGuardianChildOperations {
	return terminalGuardianChildOperations{
		snapshots: terminalProcessSnapshots,
		kill:      syscall.Kill,
		wait: func() (int, error) {
			var status unix.WaitStatus
			return unix.Wait4(-1, &status, unix.WNOHANG, nil)
		},
		now:   time.Now,
		sleep: time.Sleep,
	}
}

// reapTerminalGuardianChildren is the kernel-independent Linux fallback once
// exec.Cmd.Wait has reaped the directly owned shell. PR_SET_CHILD_SUBREAPER
// has adopted every remaining shell descendant into this guardian's direct
// child tree. A direct child PID cannot be reused until this guardian reaps
// it, so SIGKILL followed by wait4 is safe even on kernels without pidfd_open.
func reapTerminalGuardianChildren(guardianPID int) error {
	return reapTerminalGuardianChildrenWithOperations(
		guardianPID,
		defaultTerminalGuardianChildOperations(),
	)
}

func reapTerminalGuardianChildrenWithOperations(
	guardianPID int,
	operations terminalGuardianChildOperations,
) error {
	if err := validateTerminalGuardianChildOperations(guardianPID, operations); err != nil {
		return err
	}
	deadline := operations.now().Add(terminalGuardianReapTimeout)
	var result error
	for {
		children, err := terminalGuardianChildrenForReaping(guardianPID, operations.snapshots)
		if err != nil {
			return errors.Join(result, err)
		}
		result = errors.Join(result, killTerminalGuardianChildren(children, operations.kill))
		done, err := drainTerminalGuardianChildren(operations, deadline)
		if err != nil {
			return errors.Join(result, err)
		}
		if done {
			return result
		}
	}
}

func validateTerminalGuardianChildOperations(guardianPID int, operations terminalGuardianChildOperations) error {
	if guardianPID < 1 || operations.snapshots == nil || operations.kill == nil || operations.wait == nil || operations.now == nil || operations.sleep == nil {
		return errors.New("terminal guardian child cleanup operations are incomplete")
	}
	return nil
}

func terminalGuardianChildrenForReaping(
	guardianPID int,
	snapshots func() ([]terminalProcessSnapshot, error),
) ([]int, error) {
	values, err := snapshots()
	if err != nil {
		return nil, fmt.Errorf("snapshot adopted terminal children: %w", err)
	}
	return terminalGuardianDirectChildren(guardianPID, values), nil
}

func killTerminalGuardianChildren(children []int, kill func(int, syscall.Signal) error) error {
	var result error
	for _, pid := range children {
		if err := kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			result = errors.Join(result, fmt.Errorf("kill adopted terminal child %d: %w", pid, err))
		}
	}
	return result
}

func drainTerminalGuardianChildren(
	operations terminalGuardianChildOperations,
	deadline time.Time,
) (bool, error) {
	for {
		state, err := nextTerminalGuardianReapWaitState(operations, deadline)
		if err != nil {
			return false, err
		}
		switch state {
		case terminalGuardianContinueReaping:
			continue
		case terminalGuardianResnapshotChildren:
			return false, nil
		case terminalGuardianChildrenReaped:
			return true, nil
		default:
			return false, errors.New("terminal guardian returned an invalid reap wait state")
		}
	}
}

func nextTerminalGuardianReapWaitState(
	operations terminalGuardianChildOperations,
	deadline time.Time,
) (terminalGuardianReapWaitState, error) {
	pid, err := operations.wait()
	if errors.Is(err, unix.ECHILD) {
		return terminalGuardianChildrenReaped, nil
	}
	if errors.Is(err, unix.EINTR) {
		return terminalGuardianContinueReaping, nil
	}
	if err != nil {
		return terminalGuardianContinueReaping, fmt.Errorf("reap adopted terminal child: %w", err)
	}
	return terminalGuardianReapWaitStateForPID(pid, operations, deadline)
}

func terminalGuardianReapWaitStateForPID(
	pid int,
	operations terminalGuardianChildOperations,
	deadline time.Time,
) (terminalGuardianReapWaitState, error) {
	if pid > 0 {
		return terminalGuardianContinueReaping, nil
	}
	if pid != 0 {
		return terminalGuardianContinueReaping, fmt.Errorf("reap adopted terminal child returned invalid PID %d", pid)
	}
	if !operations.now().Before(deadline) {
		return terminalGuardianContinueReaping, errors.New("terminal guardian timed out reaping adopted children")
	}
	operations.sleep(10 * time.Millisecond)
	return terminalGuardianResnapshotChildren, nil
}

func terminalGuardianDirectChildren(guardianPID int, snapshots []terminalProcessSnapshot) []int {
	children := make([]int, 0)
	for _, snapshot := range snapshots {
		if snapshot.pid < 1 || snapshot.pid == guardianPID || snapshot.parentPID != guardianPID || snapshot.zombie {
			continue
		}
		children = append(children, snapshot.pid)
	}
	sort.Ints(children)
	return children
}
