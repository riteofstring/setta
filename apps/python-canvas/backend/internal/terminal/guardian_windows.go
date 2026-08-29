//go:build windows

package terminal

func RunPrivatePTYGuardian([]string) (bool, error) {
	return false, nil
}
