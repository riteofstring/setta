//go:build !windows

package runtime

import "syscall"

type runtimeDiskStatsResult struct {
	AvailableBytes uint64
	TotalBytes     uint64
}

func runtimeDiskStats(path string) (runtimeDiskStatsResult, error) {
	var stats syscall.Statfs_t
	if err := syscall.Statfs(path, &stats); err != nil {
		return runtimeDiskStatsResult{}, err
	}
	return runtimeDiskStatsResult{
		AvailableBytes: uint64(stats.Bavail) * uint64(stats.Bsize),
		TotalBytes:     uint64(stats.Blocks) * uint64(stats.Bsize),
	}, nil
}
