//go:build windows

package durable

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	windowsMoveReplaceExisting = 0x1
	windowsMoveWriteThrough    = 0x8
)

var windowsMoveFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func replaceFile(source string, destination string) error {
	sourcePointer, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	destinationPointer, err := syscall.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	result, _, callErr := windowsMoveFileEx.Call(uintptr(unsafe.Pointer(sourcePointer)), uintptr(unsafe.Pointer(destinationPointer)), windowsMoveReplaceExisting|windowsMoveWriteThrough)
	if result == 0 {
		return fmt.Errorf("MoveFileExW: %w", callErr)
	}
	return nil
}
