//go:build !windows && !darwin && !linux && !freebsd && !netbsd && !openbsd && !dragonfly

package watchcode

import "os"

func fileIdentityKey(path string, _ os.FileInfo) (string, error) {
	return "", unsupportedFileIdentityError(path)
}
