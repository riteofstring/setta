//go:build !windows

package terminals

import (
	"errors"
	"fmt"
	"os"

	goPty "github.com/aymanbagabas/go-pty"
	"golang.org/x/sys/unix"
)

func interruptTerminalSession(session *session) (bool, error) {
	if session == nil || session.cmd == nil || session.cmd.Process == nil {
		return false, nil
	}

	shellProcessGroup := session.cmd.Process.Pid
	if shellProcessGroup <= 0 {
		return false, nil
	}

	foregroundProcessGroup, err := foregroundProcessGroup(session.pty)
	if err != nil {
		if isIgnorableInterruptError(err) {
			return false, nil
		}
		return false, fmt.Errorf("interrupt terminal %q: resolve foreground process group: %w", session.id, err)
	}
	if foregroundProcessGroup <= 0 || foregroundProcessGroup == shellProcessGroup {
		return false, nil
	}

	if err := unix.Kill(-foregroundProcessGroup, unix.SIGINT); err != nil {
		if errors.Is(err, unix.ESRCH) {
			return false, nil
		}
		return false, fmt.Errorf("interrupt terminal %q: send SIGINT to process group %d: %w", session.id, foregroundProcessGroup, err)
	}

	return true, nil
}

func foregroundProcessGroup(ptyInstance goPty.Pty) (int, error) {
	unixPty, ok := ptyInstance.(goPty.UnixPty)
	if !ok {
		return 0, ErrInterruptUnsupported
	}

	processGroup := 0
	var ioctlErr error
	if err := unixPty.Control(func(fd uintptr) {
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
