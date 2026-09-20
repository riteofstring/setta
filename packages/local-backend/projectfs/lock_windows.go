//go:build windows

package projectfs

import (
	"errors"
	"os"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	lockFileFailImmediately = 0x00000001
	lockFileExclusive       = 0x00000002
	lockViolation           = syscall.Errno(33)
)

var (
	kernel32UnlockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("UnlockFileEx")
	kernel32LockFileEx   = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")
)

func tryLockFile(file *os.File) (bool, error) {
	overlapped := &syscall.Overlapped{}
	result, _, err := kernel32LockFileEx.Call(file.Fd(), lockFileExclusive|lockFileFailImmediately, 0, 1, 0, uintptr(unsafe.Pointer(overlapped)))
	runtime.KeepAlive(file)
	if result != 0 {
		return true, nil
	}
	if errors.Is(err, lockViolation) {
		return false, nil
	}
	return false, fileLockCallError(result, err)
}

func unlockFile(file *os.File) error {
	overlapped := &syscall.Overlapped{}
	result, _, err := kernel32UnlockFileEx.Call(file.Fd(), 0, 1, 0, uintptr(unsafe.Pointer(overlapped)))
	runtime.KeepAlive(file)
	return fileLockCallError(result, err)
}

func fileLockCallError(result uintptr, err error) error {
	if result != 0 {
		return nil
	}
	if err == syscall.Errno(0) {
		return syscall.EINVAL
	}
	return err
}
