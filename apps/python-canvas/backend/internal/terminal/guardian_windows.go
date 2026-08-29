//go:build windows

package terminal

// RunPrivatePTYGuardian is unavailable on Windows, where ConPTY's Job Object
// remains the authoritative terminal lifetime boundary.
func RunPrivatePTYGuardian([]string) (bool, error) {
	return false, nil
}
