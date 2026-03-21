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
	if session == nil || session.pty == nil {
		return false, nil
	}

	shellProcessGroup := session.pty.ProcessPID()
	if shellProcessGroup <= 0 {
		return false, nil
	}

	foregroundPG, err := foregroundProcessGroup(session.pty)
	if err != nil {
		if isIgnorableInterruptError(err) {
			return false, nil
		}
		return false, fmt.Errorf("interrupt terminal %q: resolve foreground process group: %w", session.id, err)
	}
	if foregroundPG > 0 && foregroundPG != shellProcessGroup {
		deadline := time.Now().Add(interruptSettleWindow)
		for time.Now().Before(deadline) {
			time.Sleep(interruptPollInterval)

			foregroundPG, err = foregroundProcessGroup(session.pty)
			if err != nil {
				if isIgnorableInterruptError(err) {
					return false, nil
				}
				return false, fmt.Errorf("interrupt terminal %q: resolve foreground process group: %w", session.id, err)
			}
			if foregroundPG <= 0 || foregroundPG == shellProcessGroup {
				return false, nil
			}
		}
	}
	if foregroundPG <= 0 || foregroundPG == shellProcessGroup {
		return false, nil
	}

	if err := unix.Kill(-foregroundPG, unix.SIGINT); err != nil {
		if errors.Is(err, unix.ESRCH) {
			return false, nil
		}
		return false, fmt.Errorf("interrupt terminal %q: send SIGINT to process group %d: %w", session.id, foregroundPG, err)
	}

	return true, nil
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
