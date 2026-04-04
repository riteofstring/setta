//go:build darwin || dragonfly || freebsd || netbsd || openbsd

package terminals

import "golang.org/x/sys/unix"

func promptReadyTermiosRequests() (uint, uint) {
	return unix.TIOCGETA, unix.TIOCSETA
}
