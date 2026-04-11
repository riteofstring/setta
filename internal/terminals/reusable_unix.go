//go:build !windows

package terminals

import "fmt"

func sessionIsReusable(session *session) (bool, error) {
	if session == nil || session.pty == nil {
		return false, nil
	}

	shellProcessGroup := session.pty.ProcessPID()
	if shellProcessGroup <= 0 {
		return false, nil
	}

	foregroundPG, err := foregroundProcessGroup(session.pty)
	if err != nil {
		if isIgnorableInterruptError(err) {
			return false, nil
		}
		return false, fmt.Errorf("resolve foreground process group for terminal %q: %w", session.id, err)
	}
	if foregroundPG <= 0 {
		return false, nil
	}

	return foregroundPG == shellProcessGroup, nil
}
