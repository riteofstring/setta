package terminals

import (
	"log/slog"
)

func (s *Service) readLoop(session *session) {
	buffer := make([]byte, s.readBufferSize)
	for {
		n, err := session.pty.Read(buffer)
		if n > 0 {
			chunk, promptReady := session.captureOutput(buffer[:n])
			session.appendOutput(chunk)
			if promptReady {
				session.markPromptReady()
			}
		}
		if err == nil {
			continue
		}
		if !isExpectedReadError(err) {
			s.logger.Debug("terminal read loop ended",
				slog.String("terminal_id", session.id),
				slog.Any("error", err),
			)
		}
		s.cleanupSession(session, false)
		return
	}
}

func (s *Service) waitLoop(session *session) {
	defer close(session.waitDone)
	if err := session.pty.Wait(); err != nil && !isExpectedWaitError(err) {
		s.logger.Debug("terminal process exited with error",
			slog.String("terminal_id", session.id),
			slog.Any("error", err),
		)
	}
}

func (s *Service) cleanupSession(session *session, terminate bool) {
	session.cleanupOnce.Do(func() {
		if terminate {
			session.cancel()
		}
		session.markPromptReady()
		session.markExited()

		if terminate {
			s.removeSessionIfCurrent(session)
		}

		_ = session.pty.Close()
		session.removeAllAttachments()

		s.logger.Debug("terminal session closed",
			slog.String("terminal_id", session.id),
			slog.String("project_id", session.projectID),
			slog.String("share_session_id", session.shareSessionID),
		)
	})
}

func (s *Service) removeSessionIfCurrent(session *session) {
	if session == nil {
		return
	}

	s.mu.Lock()
	current, ok := s.sessions[session.id]
	if ok && current == session {
		delete(s.sessions, session.id)
	}
	s.mu.Unlock()
}
