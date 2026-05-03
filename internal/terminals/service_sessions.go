package terminals

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync/atomic"
	"time"
)

func (s *Service) Open(options OpenOptions) (SessionInfo, bool, error) {
	sizeExplicitlyProvided := options.Columns > 0 && options.Rows > 0
	normalized, err := s.normalizeOpenOptions(options)
	if err != nil {
		return SessionInfo{}, false, err
	}
	usesDefaultCommand := equalStringSlices(normalized.Command, s.defaultCommand)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return SessionInfo{}, false, ErrServiceClosed
	}

	if existing, ok := s.sessions[normalized.ID]; ok {
		if existing.isExited() {
			delete(s.sessions, normalized.ID)
		} else if !existing.matches(normalized) {
			return SessionInfo{}, false, ErrSessionConflict
		} else {
			return existing.info(), false, nil
		}
	}

	sessionCtx, cancel := context.WithCancel(context.Background())
	ptyInstance, err := openPTYSession(sessionCtx, normalized)
	if err != nil {
		cancel()
		return SessionInfo{}, false, err
	}

	promptReady := make(chan struct{})
	promptReadyMarker := ""
	if usesDefaultCommand {
		promptReadyMarker = buildPromptReadyMarker(atomic.AddUint64(&s.nextAttachmentID, 1))
	}

	session := &session{
		id:             normalized.ID,
		projectID:      normalized.ProjectID,
		shareSessionID: normalized.ShareSessionID,
		allowInput:     normalized.AllowInput,
		command:        append([]string(nil), normalized.Command...),
		dir:            normalized.Dir,
		env:            append([]string(nil), normalized.Env...),
		createdAt:      time.Now().UTC(),
		cancel:         cancel,
		pty:            ptyInstance,
		waitDone:       make(chan struct{}),
		columns:        normalized.Columns,
		rows:           normalized.Rows,
		history: historyBuffer{
			limit: s.historyLimit,
		},
		attachments:         make(map[string]chan []byte),
		managedDefaultShell: usesDefaultCommand,
		initialSizeSynced:   !usesDefaultCommand || sizeExplicitlyProvided,
		promptReady:         promptReady,
		promptReadyMarker:   promptReadyMarker,
	}
	s.sessions[session.id] = session

	go s.readLoop(session)
	go s.waitLoop(session)
	if session.promptReadyMarker == "" {
		session.markPromptReady()
	}

	s.logger.Debug("terminal session opened",
		slog.String("terminal_id", session.id),
		slog.String("project_id", session.projectID),
		slog.String("share_session_id", session.shareSessionID),
	)

	return session.info(), true, nil
}

func (s *Service) Session(sessionID string) (SessionInfo, bool) {
	s.mu.RLock()
	session, ok := s.sessions[strings.TrimSpace(sessionID)]
	s.mu.RUnlock()
	if !ok {
		return SessionInfo{}, false
	}
	return session.info(), true
}

func (s *Service) ReusableSession(sessionID string) bool {
	if s == nil {
		return false
	}

	session, err := s.requireSession(sessionID)
	if err != nil {
		return false
	}
	if session.isExited() {
		return false
	}

	reusable, err := sessionIsReusable(session)
	if err != nil {
		s.logger.Debug("terminal reusable check failed",
			slog.String("terminal_id", session.id),
			slog.Any("error", err),
		)
		return false
	}
	return reusable
}

func (s *Service) List(projectID string, shareSessionID string) []SessionInfo {
	projectID = strings.TrimSpace(projectID)
	shareSessionID = strings.TrimSpace(shareSessionID)

	s.mu.RLock()
	sessions := make([]SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		if projectID != "" && session.projectID != projectID {
			continue
		}
		if session.shareSessionID != shareSessionID {
			continue
		}
		sessions = append(sessions, session.info())
	}
	s.mu.RUnlock()

	sort.Slice(sessions, func(i int, j int) bool {
		return sessions[i].ID < sessions[j].ID
	})
	return sessions
}

func (s *Service) Attach(sessionID string) (*Attachment, error) {
	s.mu.RLock()
	session, ok := s.sessions[strings.TrimSpace(sessionID)]
	s.mu.RUnlock()
	if !ok {
		return nil, ErrUnknownSession
	}

	session.mu.Lock()
	history := session.history.Bytes()
	session.attachedOnce = true
	if session.exited {
		session.mu.Unlock()
		output := make(chan []byte)
		close(output)
		return &Attachment{
			History: history,
			Output:  output,
		}, nil
	}
	attachmentID := fmt.Sprintf("attachment-%d", atomic.AddUint64(&s.nextAttachmentID, 1))
	output := make(chan []byte, s.subscriberBuffer)
	session.attachments[attachmentID] = output
	session.mu.Unlock()

	return &Attachment{
		History: history,
		Output:  output,
		closeFn: func() {
			s.detach(sessionID, attachmentID)
		},
	}, nil
}

func (s *Service) History(sessionID string) (string, error) {
	session, err := s.requireSession(sessionID)
	if err != nil {
		return "", err
	}

	session.mu.RLock()
	defer session.mu.RUnlock()
	return string(session.history.Bytes()), nil
}

func (s *Service) Write(sessionID string, data []byte) error {
	session, err := s.requireLiveSession(sessionID)
	if err != nil {
		return err
	}
	if err := s.writeToSession(session, data, true); err != nil {
		return err
	}
	session.setPendingPromptInput(true)
	return nil
}

func (s *Service) RunCommand(sessionID string, data []byte) error {
	session, err := s.requireLiveSession(sessionID)
	if err != nil {
		return err
	}
	if session.enqueueRunCommandUntilInitialResize(data) {
		return nil
	}
	s.ensurePromptReady(session)
	if err := session.waitForPromptReady(); err != nil {
		return err
	}
	return s.runCommand(session, data)
}

func (s *Service) writeToSession(session *session, data []byte, requireInput bool) error {
	if len(data) == 0 {
		return nil
	}
	if requireInput && !session.allowInput {
		return ErrInputDisabled
	}
	if _, err := session.pty.Write(data); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

func (s *Service) runCommand(session *session, data []byte) error {
	if len(data) == 0 {
		return nil
	}

	restore, err := s.expandRunCommandEchoWidth(session, len(data))
	if err != nil {
		return err
	}
	if restore != nil {
		defer restore()
	}

	command := make([]byte, 0, len(data)+1)
	if session.takePendingPromptInput() {
		command = append(command, 0x15)
	}
	if session.consumePreAttachBackendRunNormalization() {
		command = append(command, '\f')
	}
	command = append(command, data...)
	return s.writeToSession(session, command, false)
}

func (s *Service) Resize(sessionID string, columns int, rows int) error {
	if columns < 1 || rows < 1 {
		return fmt.Errorf("terminal size must be positive")
	}

	session, err := s.requireLiveSession(sessionID)
	if err != nil {
		return err
	}
	if err := session.pty.Resize(columns, rows); err != nil {
		return fmt.Errorf("resize terminal: %w", err)
	}

	pendingCommands := session.applyResize(columns, rows)
	if len(pendingCommands) > 0 {
		s.ensurePromptReady(session)
		if err := session.waitForPromptReady(); err != nil {
			return err
		}
	}
	for _, command := range pendingCommands {
		if err := s.runCommand(session, command); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Delete(ctx context.Context, sessionID string) error {
	session, err := s.requireSession(sessionID)
	if err != nil {
		return err
	}
	s.cleanupSession(session, true)
	s.removeSessionIfCurrent(session)
	return waitForDone(ctx, session.waitDone)
}

func (s *Service) InterruptProject(projectID string, shareSessionID string) (int, error) {
	projectID = strings.TrimSpace(projectID)
	shareSessionID = strings.TrimSpace(shareSessionID)
	if projectID == "" {
		return 0, fmt.Errorf("project id is required")
	}

	s.mu.RLock()
	sessions := make([]*session, 0, len(s.sessions))
	for _, session := range s.sessions {
		if session.projectID != projectID {
			continue
		}
		if session.shareSessionID != shareSessionID {
			continue
		}
		sessions = append(sessions, session)
	}
	s.mu.RUnlock()

	interruptedCount := 0
	var err error
	for _, session := range sessions {
		if session.isExited() {
			continue
		}
		interrupted, interruptErr := interruptTerminalSession(session)
		if interruptErr != nil {
			err = errors.Join(err, interruptErr)
			continue
		}
		if !interrupted {
			continue
		}
		interruptedCount++
		s.logger.Debug("terminal session interrupted",
			slog.String("terminal_id", session.id),
			slog.String("project_id", session.projectID),
			slog.String("share_session_id", session.shareSessionID),
		)
	}

	return interruptedCount, err
}

func (s *Service) DeleteShareSession(ctx context.Context, shareSessionID string) error {
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return fmt.Errorf("share session id is required")
	}

	s.mu.RLock()
	var sessions []*session
	for _, session := range s.sessions {
		if session.shareSessionID == shareSessionID {
			sessions = append(sessions, session)
		}
	}
	s.mu.RUnlock()

	var err error
	for _, session := range sessions {
		s.cleanupSession(session, true)
		s.removeSessionIfCurrent(session)
		err = errors.Join(err, waitForDone(ctx, session.waitDone))
	}
	return err
}

func (s *Service) Close(ctx context.Context) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	sessions := make([]*session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.mu.Unlock()

	var err error
	for _, session := range sessions {
		s.cleanupSession(session, true)
		s.removeSessionIfCurrent(session)
		err = errors.Join(err, waitForDone(ctx, session.waitDone))
	}
	return err
}

func (s *Service) requireSession(sessionID string) (*session, error) {
	s.mu.RLock()
	session, ok := s.sessions[strings.TrimSpace(sessionID)]
	s.mu.RUnlock()
	if !ok {
		return nil, ErrUnknownSession
	}
	return session, nil
}

func (s *Service) requireLiveSession(sessionID string) (*session, error) {
	session, err := s.requireSession(sessionID)
	if err != nil {
		return nil, err
	}
	if session.isExited() {
		return nil, ErrUnknownSession
	}
	return session, nil
}

func (s *Service) detach(sessionID string, attachmentID string) {
	s.mu.RLock()
	session, ok := s.sessions[strings.TrimSpace(sessionID)]
	s.mu.RUnlock()
	if !ok {
		return
	}
	session.removeAttachments([]string{attachmentID})
}
