//go:build !windows

package durable

import (
	"fmt"
	"os"
)

func SyncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("durable: open directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("durable: sync directory: %w", err)
	}
	return nil
}
