//go:build !windows

package terminals

import (
	"errors"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"time"
)

const (
	interruptSettleWindow = 50 * time.Millisecond
	interruptPollInterval = 5 * time.Millisecond
)

func interruptTerminalSession(session *session) (bool, error) {
	foregroundPG, err := resolveInterruptTargetProcessGroup(session)
	if err != nil || foregroundPG <= 0 {
		return false, err
	}
	if err := sendInterruptSignal(session.id, foregroundPG); err != nil {
		return false, err
	}
	return true, nil
}

func resolveInterruptTargetProcessGroup(session *session) (int, error) {
	shellProcessGroup := interruptShellProcessGroup(session)
	if shellProcessGroup <= 0 {
		return 0, nil
	}

	foregroundPG, err := resolveInterruptForegroundProcessGroup(session)
	if err != nil {
		return 0, err
	}
	return waitForInterruptTargetProcessGroup(session, shellProcessGroup, foregroundPG)
}

func interruptShellProcessGroup(session *session) int {
	if session == nil || session.pty == nil {
		return 0
	}
	return session.pty.ProcessPID()
}

func resolveInterruptForegroundProcessGroup(session *session) (int, error) {
	foregroundPG, err := foregroundProcessGroup(session.pty)
	if err == nil {
		return foregroundPG, nil
	}
	if isIgnorableInterruptError(err) {
		return 0, nil
	}
	return 0, fmt.Errorf("interrupt terminal %q: resolve foreground process group: %w", session.id, err)
}

func waitForInterruptTargetProcessGroup(session *session, shellProcessGroup int, foregroundPG int) (int, error) {
	if foregroundPG <= 0 || foregroundPG == shellProcessGroup {
		return 0, nil
	}

	deadline := time.Now().Add(interruptSettleWindow)
	for time.Now().Before(deadline) {
		time.Sleep(interruptPollInterval)

		nextForegroundPG, err := resolveInterruptForegroundProcessGroup(session)
		if err != nil {
			return 0, err
		}
		if nextForegroundPG <= 0 || nextForegroundPG == shellProcessGroup {
			return 0, nil
		}
		foregroundPG = nextForegroundPG
	}

	return foregroundPG, nil
}

func sendInterruptSignal(sessionID string, foregroundPG int) error {
	if err := unix.Kill(-foregroundPG, unix.SIGINT); err != nil {
		if errors.Is(err, unix.ESRCH) {
			return nil
		}
		return fmt.Errorf("interrupt terminal %q: send SIGINT to process group %d: %w", sessionID, foregroundPG, err)
	}
	return nil
}

func foregroundProcessGroup(ptyInstance ptySession) (int, error) {
	if ptyInstance == nil {
		return 0, ErrInterruptUnsupported
	}

	processGroup := 0
	var ioctlErr error
	if err := ptyInstance.Control(func(fd uintptr) {
		processGroup, ioctlErr = unix.IoctlGetInt(int(fd), unix.TIOCGPGRP)
	}); err != nil {
		return 0, err
	}
	if ioctlErr != nil {
		return 0, ioctlErr
	}
	return processGroup, nil
}

func isIgnorableInterruptError(err error) bool {
	return errors.Is(err, os.ErrClosed) ||
		errors.Is(err, unix.EBADF) ||
		errors.Is(err, unix.ENOTTY) ||
		errors.Is(err, unix.EIO)
}
