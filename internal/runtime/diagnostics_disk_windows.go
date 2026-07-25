//go:build windows

package runtime

import "errors"

type runtimeDiskStatsResult struct {
	AvailableBytes uint64
	TotalBytes     uint64
}

func runtimeDiskStats(string) (runtimeDiskStatsResult, error) {
	return runtimeDiskStatsResult{}, errors.New("runtime disk diagnostics are unsupported on Windows")
}
