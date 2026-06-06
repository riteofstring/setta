//go:build darwin || linux || freebsd || netbsd || openbsd

package backendconn

import "syscall"

func ProcessAlive(pid int) (bool, bool) {
	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM, true
}
