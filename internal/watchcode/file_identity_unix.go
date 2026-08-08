//go:build darwin || linux || freebsd || netbsd || openbsd || dragonfly

package watchcode

import (
	"fmt"
	"os"
	"syscall"
)

func fileIdentityKey(path string, info os.FileInfo) (string, error) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat == nil {
		return "", unsupportedFileIdentityError(path)
	}
	return fmt.Sprintf("%d:%d", uint64(stat.Dev), uint64(stat.Ino)), nil
}
