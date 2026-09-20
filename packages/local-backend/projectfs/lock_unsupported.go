//go:build !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !windows

package projectfs

import (
	"errors"
	"os"
)

func tryLockFile(file *os.File) (bool, error) {
	return false, errors.New("projectfs: advisory locks are unsupported on this platform")
}

func unlockFile(file *os.File) error {
	return errors.New("projectfs: advisory locks are unsupported on this platform")
}
