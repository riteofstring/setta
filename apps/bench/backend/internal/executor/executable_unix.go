//go:build !windows

package executor

import "os"

func platformExecutable(mode os.FileMode) bool {
	return mode.Perm()&0o111 != 0
}
