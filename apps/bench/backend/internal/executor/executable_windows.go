//go:build windows

package executor

import "os"

func platformExecutable(os.FileMode) bool {
	return true
}
