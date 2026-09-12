//go:build !windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

const (
	terminalGuardianInvocation       = "--setta-terminal-guardian"
	terminalGuardianLifetimeFD       = 3
	terminalGuardianTerminationGrace = 100 * time.Millisecond
	terminalGuardianReapTimeout      = time.Second
	terminalProcessSnapshotTimeout   = 250 * time.Millisecond
	terminalProcessStatusPath        = "/bin/ps"
)

type terminalProcessSnapshot struct {
	pid          int
	parentPID    int
	sessionID    int
	hasSessionID bool
	zombie       bool
}

type terminalSessionOperations struct {
	members func(sessionID int) ([]int, error)
	verify  func(pid int, sessionID int) (bool, error)
	signal  func(pid int, sessionID int, signal syscall.Signal) error
	sleep   func(time.Duration)
}

func RunPrivatePTYGuardian(arguments []string) (bool, error) {
	shell, handled, err := parseTerminalGuardianInvocation(arguments)
	if !handled || err != nil {
		return handled, err
	}
	lifetime := os.NewFile(uintptr(terminalGuardianLifetimeFD), "terminal-guardian-lifetime")
	if lifetime == nil {
		return true, errors.New("terminal guardian lifetime pipe is unavailable")
	}
	defer lifetime.Close()
	return true, runTerminalGuardian(shell, lifetime, defaultTerminalSessionOperations())
}

func terminalGuardianArguments(shell []string) ([]string, error) {
	if err := validateTerminalGuardianShell(shell); err != nil {
		return nil, err
	}
	arguments := make([]string, 0, len(shell)+2)
	arguments = append(arguments, terminalGuardianInvocation, "--")
	arguments = append(arguments, shell...)
	return arguments, nil
}

func parseTerminalGuardianInvocation(arguments []string) ([]string, bool, error) {
	if len(arguments) == 0 || arguments[0] != terminalGuardianInvocation {
		return nil, false, nil
	}
	if len(arguments) < 3 || arguments[1] != "--" {
		return nil, true, errors.New("terminal guardian requires a shell after --")
	}
	shell := append([]string(nil), arguments[2:]...)
	if err := validateTerminalGuardianShell(shell); err != nil {
		return nil, true, err
	}
	return shell, true, nil
}

func validateTerminalGuardianShell(shell []string) error {
	if len(shell) == 0 || strings.TrimSpace(shell[0]) == "" {
		return errors.New("terminal guardian shell is required")
	}
	for _, argument := range shell {
		if strings.ContainsRune(argument, '\x00') {
			return errors.New("terminal guardian shell contains a NUL byte")
		}
	}
	return nil
}

func runTerminalGuardian(shell []string, lifetime *os.File, operations terminalSessionOperations) error {
	if err := validateTerminalGuardianShell(shell); err != nil {
		return err
	}
	if err := enableTerminalGuardianChildContainment(); err != nil {
		return fmt.Errorf("establish terminal child containment: %w", err)
	}
	sessionID, guardianPID, err := terminalGuardianSession(lifetime)
	if err != nil {
		return err
	}
	command, shellDone, shellWait, err := startTerminalGuardianShell(shell)
	if err != nil {
		return err
	}
	lifetimeDone := terminalGuardianLifetimeDone(lifetime)
	waitForTerminalGuardianTermination(shellDone, lifetimeDone)
	return cleanupAndReapTerminalGuardian(sessionID, guardianPID, command, shellDone, shellWait, operations)
}

func terminalGuardianSession(lifetime *os.File) (int, int, error) {
	if lifetime == nil {
		return 0, 0, errors.New("terminal guardian lifetime pipe is required")
	}

	syscall.CloseOnExec(int(lifetime.Fd()))
	guardianPID := os.Getpid()
	sessionID, err := unix.Getsid(0)
	if err != nil {
		return 0, 0, fmt.Errorf("resolve terminal guardian session: %w", err)
	}
	if sessionID != guardianPID {
		return 0, 0, errors.New("terminal guardian is not the terminal session leader")
	}
	return sessionID, guardianPID, nil
}

func startTerminalGuardianShell(shell []string) (*exec.Cmd, <-chan struct{}, <-chan error, error) {
	protectedShell, err := terminalGuardianProtectedShell(shell)
	if err != nil {
		return nil, nil, nil, err
	}
	command := exec.Command(protectedShell[0], protectedShell[1:]...)

	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr

	command.SysProcAttr = &syscall.SysProcAttr{Foreground: true, Ctty: 0}
	if err := command.Start(); err != nil {
		return nil, nil, nil, fmt.Errorf("start terminal shell: %w", err)
	}

	shellDone := make(chan struct{})
	shellWait := make(chan error, 1)
	go func() {
		shellWait <- command.Wait()
		close(shellDone)
	}()
	return command, shellDone, shellWait, nil
}

func terminalGuardianLifetimeDone(lifetime *os.File) <-chan struct{} {
	lifetimeDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, lifetime)
		close(lifetimeDone)
	}()
	return lifetimeDone
}

func waitForTerminalGuardianTermination(shellDone <-chan struct{}, lifetimeDone <-chan struct{}) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGHUP, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case <-shellDone:
	case <-lifetimeDone:
	case <-signals:
	}
}

func cleanupAndReapTerminalGuardian(
	sessionID int,
	guardianPID int,
	command *exec.Cmd,
	shellDone <-chan struct{},
	shellWait <-chan error,
	operations terminalSessionOperations,
) error {
	cleanupErr := cleanupTerminalSessionWithSurvivors(
		sessionID,
		guardianPID,
		operations,
		terminalGuardianSurvivorsAreProvisional(),
	)
	cleanupErr = errors.Join(cleanupErr, killTerminalShellIfRunning(command, shellDone))
	reapErr := reapTerminalShell(shellDone, shellWait)
	if reapErr != nil {
		return errors.Join(cleanupErr, reapErr)
	}

	return errors.Join(cleanupErr, reapTerminalGuardianChildren(guardianPID))
}

func killTerminalShellIfRunning(command *exec.Cmd, shellDone <-chan struct{}) error {
	if shellExited(shellDone) || command == nil || command.Process == nil {
		return nil
	}

	if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("kill terminal shell: %w", err)
	}
	return nil
}

func reapTerminalShell(shellDone <-chan struct{}, shellWait <-chan error) error {
	if !waitForTerminalShell(shellDone, terminalGuardianReapTimeout) {
		return errors.New("terminal guardian timed out reaping shell")
	}
	if err := <-shellWait; err != nil {
		var exitError *exec.ExitError

		if !errors.As(err, &exitError) {
			return fmt.Errorf("reap terminal shell: %w", err)
		}
	}
	return nil
}

func shellExited(done <-chan struct{}) bool {
	select {
	case <-done:
		return true
	default:
		return false
	}
}

func waitForTerminalShell(done <-chan struct{}, timeout time.Duration) bool {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		return false
	}
}

func defaultTerminalSessionOperations() terminalSessionOperations {
	return terminalSessionOperations{
		members: terminalSessionMembers,
		verify:  terminalSessionMemberMatches,
		signal:  signalTerminalSessionMember,
		sleep:   time.Sleep,
	}
}

func cleanupTerminalSession(sessionID int, guardianPID int, operations terminalSessionOperations) error {
	return cleanupTerminalSessionWithSurvivors(sessionID, guardianPID, operations, false)
}

func cleanupTerminalSessionWithSurvivors(
	sessionID int,
	guardianPID int,
	operations terminalSessionOperations,
	provisionalSurvivors bool,
) error {
	if sessionID < 1 || guardianPID < 1 {
		return errors.New("terminal guardian session identity is invalid")
	}
	if operations.members == nil || operations.verify == nil || operations.signal == nil {
		return errors.New("terminal guardian process operations are incomplete")
	}
	return terminateTerminalSession(sessionID, guardianPID, operations, provisionalSurvivors)
}

func terminateTerminalSession(
	sessionID int,
	guardianPID int,
	operations terminalSessionOperations,
	provisionalSurvivors bool,
) error {
	var result error
	result = errors.Join(result, signalTerminalSessionMembers(sessionID, guardianPID, syscall.SIGTERM, operations))
	pauseTerminalSessionCleanup(operations)
	result = errors.Join(result, signalTerminalSessionMembers(sessionID, guardianPID, syscall.SIGKILL, operations))
	pauseTerminalSessionCleanup(operations)
	return verifyTerminalSessionCleanup(sessionID, guardianPID, result, operations, provisionalSurvivors)
}

func pauseTerminalSessionCleanup(operations terminalSessionOperations) {
	if operations.sleep != nil {
		operations.sleep(terminalGuardianTerminationGrace)
	}
}

func verifyTerminalSessionCleanup(
	sessionID int,
	guardianPID int,
	result error,
	operations terminalSessionOperations,
	provisionalSurvivors bool,
) error {
	survivors, err := verifiedTerminalSessionMembers(sessionID, guardianPID, operations)
	if err != nil {
		result = errors.Join(result, err)
	}
	if len(survivors) == 0 {
		return result
	}

	return errors.Join(
		result,
		finalizeTerminalSessionCleanup(sessionID, guardianPID, survivors, operations, provisionalSurvivors),
	)
}

func finalizeTerminalSessionCleanup(
	sessionID int,
	guardianPID int,
	survivors []int,
	operations terminalSessionOperations,
	provisionalSurvivors bool,
) error {
	result := signalVerifiedTerminalSessionMembers(sessionID, guardianPID, survivors, syscall.SIGKILL, operations)
	pauseTerminalSessionCleanup(operations)
	finalSurvivors, finalErr := verifiedTerminalSessionMembers(sessionID, guardianPID, operations)
	if finalErr != nil {
		result = errors.Join(result, finalErr)
	}
	if len(finalSurvivors) != 0 && !provisionalSurvivors {
		result = errors.Join(result, fmt.Errorf("terminal session survivors after final SIGKILL: %v", finalSurvivors))
	}
	return result
}

func signalTerminalSessionMembers(
	sessionID int,
	guardianPID int,
	signal syscall.Signal,
	operations terminalSessionOperations,
) error {
	members, err := operations.members(sessionID)
	var result error
	if err != nil {
		result = errors.Join(result, fmt.Errorf("list terminal session members: %w", err))
	}
	sort.Ints(members)
	for _, pid := range members {
		if pid < 1 || pid == guardianPID {
			continue
		}
		matches, err := operations.verify(pid, sessionID)
		if err != nil {
			result = errors.Join(result, fmt.Errorf("verify terminal session member %d: %w", pid, err))
			continue
		}
		if !matches {
			continue
		}
		if err := operations.signal(pid, sessionID, signal); err != nil && !errors.Is(err, syscall.ESRCH) {
			result = errors.Join(result, fmt.Errorf("signal terminal session member %d: %w", pid, err))
		}
	}
	return result
}

func signalVerifiedTerminalSessionMembers(
	sessionID int,
	guardianPID int,
	members []int,
	signal syscall.Signal,
	operations terminalSessionOperations,
) error {
	members = append([]int(nil), members...)
	sort.Ints(members)
	var result error
	for _, pid := range members {
		if pid < 1 || pid == guardianPID {
			continue
		}
		matches, err := operations.verify(pid, sessionID)
		if err != nil {
			result = errors.Join(result, fmt.Errorf("verify terminal session member %d: %w", pid, err))
			continue
		}
		if !matches {
			continue
		}
		if err := operations.signal(pid, sessionID, signal); err != nil && !errors.Is(err, syscall.ESRCH) {
			result = errors.Join(result, fmt.Errorf("signal terminal session member %d: %w", pid, err))
		}
	}
	return result
}

func terminalSessionMembers(sessionID int) ([]int, error) {
	if sessionID < 1 {
		return nil, errors.New("terminal session ID is invalid")
	}
	snapshots, snapshotErr := terminalProcessSnapshots()
	seen := make(map[int]struct{})
	var result error
	if snapshotErr != nil {
		result = errors.Join(result, fmt.Errorf("snapshot terminal processes: %w", snapshotErr))
	}
	for _, snapshot := range snapshots {
		if snapshot.zombie {
			continue
		}
		if !terminalSnapshotMayBelongToGuardian(snapshot, sessionID, snapshots) {
			continue
		}
		matches, verifyErr := terminalSessionMemberMatches(snapshot.pid, sessionID)
		if verifyErr != nil {
			result = errors.Join(result, fmt.Errorf("verify terminal session snapshot member %d: %w", snapshot.pid, verifyErr))
			continue
		}
		if matches {
			seen[snapshot.pid] = struct{}{}
		}
	}
	members := make([]int, 0, len(seen))
	for pid := range seen {
		members = append(members, pid)
	}
	sort.Ints(members)
	return members, result
}

func terminalSessionMemberMatches(pid int, sessionID int) (bool, error) {
	if pid < 1 || sessionID < 1 {
		return false, nil
	}
	actualSessionID, err := unix.Getsid(pid)
	if err != nil {
		if errors.Is(err, unix.ESRCH) {
			return false, nil
		}
		return false, err
	}
	if actualSessionID == sessionID {
		return true, nil
	}
	return terminalEscapedGuardianMemberMatches(pid, sessionID)
}

func verifiedTerminalSessionMembers(
	sessionID int,
	guardianPID int,
	operations terminalSessionOperations,
) ([]int, error) {
	members, err := operations.members(sessionID)
	var result error
	if err != nil {
		result = errors.Join(result, fmt.Errorf("list terminal session members: %w", err))
	}
	sort.Ints(members)
	survivors := make([]int, 0, len(members))
	for _, pid := range members {
		if pid < 1 || pid == guardianPID {
			continue
		}
		matches, verifyErr := operations.verify(pid, sessionID)
		if verifyErr != nil {
			result = errors.Join(result, fmt.Errorf("verify terminal session member %d: %w", pid, verifyErr))
			continue
		}
		if matches {
			survivors = append(survivors, pid)
		}
	}
	return survivors, result
}

func parseTerminalProcessNumber(value string, allowZero bool) (int, error) {
	if value == "" {
		return 0, errors.New("must not be empty")
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0, errors.New("must be decimal")
		}
	}
	parsed, err := strconv.ParseInt(value, 10, 0)
	if err != nil || parsed < 0 || (!allowZero && parsed == 0) {
		return 0, errors.New("must be a nonnegative integer")
	}
	return int(parsed), nil
}

func terminalProcessStatusOutput(arguments ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), terminalProcessSnapshotTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, terminalProcessStatusPath, arguments...).Output()
	if ctx.Err() != nil {
		return output, fmt.Errorf("terminal process status timed out after %s: %w", terminalProcessSnapshotTimeout, ctx.Err())
	}
	return output, err
}
