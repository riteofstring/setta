//go:build windows

package terminals

func interruptTerminalSession(*session) (bool, error) {
	return false, ErrInterruptUnsupported
}
