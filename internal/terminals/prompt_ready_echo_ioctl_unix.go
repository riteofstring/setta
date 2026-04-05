//go:build darwin || dragonfly || freebsd || hurd || linux || netbsd || openbsd

package terminals

import "golang.org/x/sys/unix"

func suppressPromptReadyEcho(session *session) (func(), error) {
	if session == nil || session.pty == nil {
		return nil, nil
	}

	var restore func()
	var ioctlErr error
	if err := session.pty.Control(func(fd uintptr) {
		restore, ioctlErr = suppressPromptReadyEchoFD(int(fd))
	}); err != nil {
		return nil, err
	}
	if ioctlErr != nil {
		return nil, ioctlErr
	}
	return restore, nil
}

func suppressPromptReadyEchoFD(fd int) (func(), error) {
	getRequest, setRequest := promptReadyTermiosRequests()
	termios, err := unix.IoctlGetTermios(fd, getRequest)
	if err != nil {
		return nil, err
	}

	original := *termios
	if original.Lflag&unix.ECHO == 0 {
		return nil, nil
	}

	updated := original
	updated.Lflag &^= unix.ECHO
	if err := unix.IoctlSetTermios(fd, setRequest, &updated); err != nil {
		return nil, err
	}

	return func() {
		_ = unix.IoctlSetTermios(fd, setRequest, &original)
	}, nil
}
