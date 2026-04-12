//go:build linux || hurd

package terminals

import "golang.org/x/sys/unix"

func promptReadyTermiosRequests() (uint, uint) {
	return unix.TCGETS, unix.TCSETS
}
