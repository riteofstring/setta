//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd

package reviewstate

import (
	"os"
	"syscall"
)

func lockFile(file *os.File) error {
	for {
		err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX)
		if err != syscall.EINTR {
			return err
		}
	}
}

func unlockFile(file *os.File) error {
	for {
		err := syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
		if err != syscall.EINTR {
			return err
		}
	}
}
