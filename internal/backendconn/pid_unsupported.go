//go:build !darwin && !linux && !freebsd && !netbsd && !openbsd

package backendconn

func ProcessAlive(_ int) (bool, bool) {
	return false, false
}
