//go:build darwin

package codexapp

import "syscall"

func platformFileDescriptorSoftLimit(soft uint64) uint64 {
	maxFilesPerProcess, err := syscall.SysctlUint32("kern.maxfilesperproc")
	if err != nil {
		return soft
	}
	if soft > uint64(maxFilesPerProcess) {
		return uint64(maxFilesPerProcess)
	}
	return soft
}
