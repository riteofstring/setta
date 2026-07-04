//go:build !windows

package codexapp

import "syscall"

func defaultFileDescriptorLimitOperations() fileDescriptorLimitOperations {
	return fileDescriptorLimitOperations{
		get: currentFileDescriptorLimit,
		setSoft: func(soft uint64) error {
			var limit syscall.Rlimit
			if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &limit); err != nil {
				return err
			}
			limit.Cur = platformFileDescriptorSoftLimit(soft)
			return syscall.Setrlimit(syscall.RLIMIT_NOFILE, &limit)
		},
	}
}

func currentFileDescriptorLimit() (fileDescriptorLimit, error) {
	var limit syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &limit); err != nil {
		return fileDescriptorLimit{}, err
	}
	return fileDescriptorLimit{Soft: limit.Cur, Hard: limit.Max}, nil
}
