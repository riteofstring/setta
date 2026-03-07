package terminals

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	goPty "github.com/aymanbagabas/go-pty"
)

const (
	TerminalIDSeparator      = "::"
	defaultHistoryLimitBytes = 64 * 1024
	defaultSubscriberBuffer  = 32
	defaultReadBufferSize    = 4096
	defaultColumns           = 80
	defaultRows              = 24
)

var (
	ErrUnknownSession       = errors.New("terminals: unknown session")
	ErrSessionConflict      = errors.New("terminals: session already exists with different scope or command")
	ErrInputDisabled        = errors.New("terminals: input is disabled for this session")
	ErrServiceClosed        = errors.New("terminals: service is closed")
	ErrInterruptUnsupported = errors.New("terminals: interrupt is unsupported on this platform")
)

type Options struct {
	Logger            *slog.Logger
	HistoryLimitBytes int
	SubscriberBuffer  int
	ReadBufferSize    int
	Shell             []string
	EnvLookup         func(string) (string, bool)
}

type OpenOptions struct {
	ID             string
	ProjectID      string
	ShareSessionID string
	AllowInput     bool
	Command        []string
	Dir            string
	Env            []string
	Columns        int
	Rows           int
}

type SessionInfo struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"projectId"`
	ShareSessionID string    `json:"shareSessionId,omitempty"`
	AllowInput     bool      `json:"allowInput"`
	Columns        int       `json:"columns"`
	Rows           int       `json:"rows"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Attachment struct {
	History []byte
	Output  <-chan []byte

	closeOnce sync.Once
	closeFn   func()
}

func (a *Attachment) Close() {
	if a == nil {
		return
	}
	a.closeOnce.Do(func() {
		if a.closeFn != nil {
			a.closeFn()
		}
	})
}

type Service struct {
	logger           *slog.Logger
	historyLimit     int
	subscriberBuffer int
	readBufferSize   int
	defaultCommand   []string

	mu               sync.RWMutex
	sessions         map[string]*session
	nextAttachmentID uint64
	closed           bool
}

type session struct {
	id             string
	projectID      string
	shareSessionID string
	allowInput     bool
	command        []string
	dir            string
	env            []string
	createdAt      time.Time

	cancel context.CancelFunc
	pty    goPty.Pty
	cmd    *goPty.Cmd

	waitDone    chan struct{}
	cleanupOnce sync.Once

	mu          sync.RWMutex
	columns     int
	rows        int
	history     historyBuffer
	attachments map[string]chan []byte
}

type historyBuffer struct {
	limit  int
	size   int
	chunks [][]byte
}

func New(options Options) (*Service, error) {
	logger := options.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	historyLimit := options.HistoryLimitBytes
	if historyLimit == 0 {
		historyLimit = defaultHistoryLimitBytes
	}
	if historyLimit < 0 {
		return nil, fmt.Errorf("history limit must be non-negative")
	}

	subscriberBuffer := options.SubscriberBuffer
	if subscriberBuffer == 0 {
		subscriberBuffer = defaultSubscriberBuffer
	}
	if subscriberBuffer < 0 {
		return nil, fmt.Errorf("subscriber buffer must be non-negative")
	}

	readBufferSize := options.ReadBufferSize
	if readBufferSize == 0 {
		readBufferSize = defaultReadBufferSize
	}
	if readBufferSize < 1 {
		return nil, fmt.Errorf("read buffer size must be positive")
	}

	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}

	defaultCommand := append([]string(nil), options.Shell...)
	var err error
	if len(defaultCommand) == 0 {
		defaultCommand, err = resolveDefaultCommand(envLookup)
		if err != nil {
			return nil, err
		}
	}

	return &Service{
		logger:           logger,
		historyLimit:     historyLimit,
		subscriberBuffer: subscriberBuffer,
		readBufferSize:   readBufferSize,
		defaultCommand:   defaultCommand,
		sessions:         make(map[string]*session),
	}, nil
}

func BuildTerminalID(sectionID string, shareSessionID string) string {
	sectionID = strings.TrimSpace(sectionID)
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return sectionID
	}
	return shareSessionID + TerminalIDSeparator + sectionID
}

func (s *Service) Open(options OpenOptions) (SessionInfo, bool, error) {
	normalized, err := s.normalizeOpenOptions(options)
	if err != nil {
		return SessionInfo{}, false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return SessionInfo{}, false, ErrServiceClosed
	}

	if existing, ok := s.sessions[normalized.ID]; ok {
		if !existing.matches(normalized) {
			return SessionInfo{}, false, ErrSessionConflict
		}
		return existing.info(), false, nil
	}

	ptyInstance, err := goPty.New()
	if err != nil {
		return SessionInfo{}, false, fmt.Errorf("open pty: %w", err)
	}

	sessionCtx, cancel := context.WithCancel(context.Background())
	cmd := ptyInstance.CommandContext(sessionCtx, normalized.Command[0], normalized.Command[1:]...)
	cmd.Dir = normalized.Dir
	if len(normalized.Env) > 0 {
		cmd.Env = append([]string(nil), normalized.Env...)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		_ = ptyInstance.Close()
		return SessionInfo{}, false, fmt.Errorf("start terminal command: %w", err)
	}
	if err := ptyInstance.Resize(normalized.Columns, normalized.Rows); err != nil {
		cancel()
		_ = ptyInstance.Close()
		return SessionInfo{}, false, fmt.Errorf("resize terminal: %w", err)
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
		cmd:            cmd,
		waitDone:       make(chan struct{}),
		columns:        normalized.Columns,
		rows:           normalized.Rows,
		history: historyBuffer{
			limit: s.historyLimit,
		},
		attachments: make(map[string]chan []byte),
	}

	s.sessions[session.id] = session

	go s.readLoop(session)
	go s.waitLoop(session)

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

	attachmentID := fmt.Sprintf("attachment-%d", atomic.AddUint64(&s.nextAttachmentID, 1))
	output := make(chan []byte, s.subscriberBuffer)

	session.mu.Lock()
	session.attachments[attachmentID] = output
	history := session.history.Bytes()
	session.mu.Unlock()

	return &Attachment{
		History: history,
		Output:  output,
		closeFn: func() {
			s.detach(sessionID, attachmentID)
		},
	}, nil
}

func (s *Service) Write(sessionID string, data []byte) error {
	session, err := s.requireSession(sessionID)
	if err != nil {
		return err
	}
	if len(data) == 0 {
		return nil
	}
	if !session.allowInput {
		return ErrInputDisabled
	}
	if _, err := session.pty.Write(data); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

func (s *Service) Resize(sessionID string, columns int, rows int) error {
	if columns < 1 || rows < 1 {
		return fmt.Errorf("terminal size must be positive")
	}

	session, err := s.requireSession(sessionID)
	if err != nil {
		return err
	}
	if err := session.pty.Resize(columns, rows); err != nil {
		return fmt.Errorf("resize terminal: %w", err)
	}

	session.mu.Lock()
	session.columns = columns
	session.rows = rows
	session.mu.Unlock()
	return nil
}

func (s *Service) Delete(ctx context.Context, sessionID string) error {
	session, err := s.requireSession(sessionID)
	if err != nil {
		return err
	}
	s.cleanupSession(session, true)
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

func (s *Service) detach(sessionID string, attachmentID string) {
	s.mu.RLock()
	session, ok := s.sessions[strings.TrimSpace(sessionID)]
	s.mu.RUnlock()
	if !ok {
		return
	}
	session.removeAttachments([]string{attachmentID})
}

func (s *Service) readLoop(session *session) {
	buffer := make([]byte, s.readBufferSize)
	for {
		n, err := session.pty.Read(buffer)
		if n > 0 {
			session.appendOutput(buffer[:n])
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
	if err := session.cmd.Wait(); err != nil && !isExpectedWaitError(err) {
		s.logger.Debug("terminal process exited with error",
			slog.String("terminal_id", session.id),
			slog.Any("error", err),
		)
	}
	s.cleanupSession(session, false)
}

func (s *Service) cleanupSession(session *session, terminate bool) {
	session.cleanupOnce.Do(func() {
		if terminate {
			session.cancel()
		}

		s.mu.Lock()
		current, ok := s.sessions[session.id]
		if ok && current == session {
			delete(s.sessions, session.id)
		}
		s.mu.Unlock()

		_ = session.pty.Close()
		session.removeAllAttachments()

		s.logger.Debug("terminal session closed",
			slog.String("terminal_id", session.id),
			slog.String("project_id", session.projectID),
			slog.String("share_session_id", session.shareSessionID),
		)
	})
}

func (s *Service) normalizeOpenOptions(options OpenOptions) (OpenOptions, error) {
	options.ID = strings.TrimSpace(options.ID)
	options.ProjectID = strings.TrimSpace(options.ProjectID)
	options.ShareSessionID = strings.TrimSpace(options.ShareSessionID)
	options.Dir = strings.TrimSpace(options.Dir)

	if options.ID == "" {
		return OpenOptions{}, fmt.Errorf("terminal id is required")
	}
	if options.ProjectID == "" {
		return OpenOptions{}, fmt.Errorf("project id is required")
	}
	if options.Columns < 1 {
		options.Columns = defaultColumns
	}
	if options.Rows < 1 {
		options.Rows = defaultRows
	}

	if len(options.Command) == 0 {
		options.Command = append([]string(nil), s.defaultCommand...)
	} else {
		options.Command = append([]string(nil), options.Command...)
	}
	if len(options.Command) == 0 {
		return OpenOptions{}, fmt.Errorf("terminal command is required")
	}

	resolvedCommand, err := resolveCommand(options.Command)
	if err != nil {
		return OpenOptions{}, err
	}
	options.Command = resolvedCommand
	options.Env = append([]string(nil), options.Env...)
	return options, nil
}

func (session *session) info() SessionInfo {
	session.mu.RLock()
	defer session.mu.RUnlock()
	return SessionInfo{
		ID:             session.id,
		ProjectID:      session.projectID,
		ShareSessionID: session.shareSessionID,
		AllowInput:     session.allowInput,
		Columns:        session.columns,
		Rows:           session.rows,
		CreatedAt:      session.createdAt,
	}
}

func (session *session) matches(options OpenOptions) bool {
	if session.projectID != options.ProjectID {
		return false
	}
	if session.shareSessionID != options.ShareSessionID {
		return false
	}
	if session.allowInput != options.AllowInput {
		return false
	}
	if session.dir != options.Dir {
		return false
	}
	if !equalStringSlices(session.command, options.Command) {
		return false
	}
	return equalStringSlices(session.env, options.Env)
}

func (session *session) appendOutput(data []byte) {
	if len(data) == 0 {
		return
	}

	session.mu.Lock()
	session.history.Append(data)
	staleAttachmentIDs := make([]string, 0)
	for attachmentID, output := range session.attachments {
		chunk := append([]byte(nil), data...)
		select {
		case output <- chunk:
		default:
			staleAttachmentIDs = append(staleAttachmentIDs, attachmentID)
		}
	}
	session.mu.Unlock()

	if len(staleAttachmentIDs) > 0 {
		session.removeAttachments(staleAttachmentIDs)
	}
}

func (session *session) removeAttachments(attachmentIDs []string) {
	if len(attachmentIDs) == 0 {
		return
	}

	session.mu.Lock()
	channels := make([]chan []byte, 0, len(attachmentIDs))
	for _, attachmentID := range attachmentIDs {
		output, ok := session.attachments[attachmentID]
		if !ok {
			continue
		}
		delete(session.attachments, attachmentID)
		channels = append(channels, output)
	}
	session.mu.Unlock()

	for _, output := range channels {
		close(output)
	}
}

func (session *session) removeAllAttachments() {
	session.mu.Lock()
	channels := make([]chan []byte, 0, len(session.attachments))
	for attachmentID, output := range session.attachments {
		delete(session.attachments, attachmentID)
		channels = append(channels, output)
	}
	session.mu.Unlock()

	for _, output := range channels {
		close(output)
	}
}

func (h *historyBuffer) Append(data []byte) {
	if len(data) == 0 || h.limit == 0 {
		return
	}

	chunk := append([]byte(nil), data...)
	if len(chunk) > h.limit {
		chunk = append([]byte(nil), chunk[len(chunk)-h.limit:]...)
	}

	h.chunks = append(h.chunks, chunk)
	h.size += len(chunk)
	for h.size > h.limit && len(h.chunks) > 0 {
		h.size -= len(h.chunks[0])
		h.chunks = h.chunks[1:]
	}
}

func (h *historyBuffer) Bytes() []byte {
	if h.size == 0 {
		return nil
	}

	output := make([]byte, 0, h.size)
	for _, chunk := range h.chunks {
		output = append(output, chunk...)
	}
	return output
}

func resolveDefaultCommand(envLookup func(string) (string, bool)) ([]string, error) {
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		if shell, ok := envLookup("COMSPEC"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "powershell.exe", "cmd.exe")
	case "darwin":
		if shell, ok := envLookup("SHELL"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "/bin/zsh", "/bin/bash", "/bin/sh")
	default:
		if shell, ok := envLookup("SHELL"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "/bin/bash", "/bin/sh")
	}

	for _, candidate := range candidates {
		resolved, err := exec.LookPath(strings.TrimSpace(candidate))
		if err == nil {
			return []string{resolved}, nil
		}
	}

	return nil, fmt.Errorf("resolve default terminal command: no supported shell found")
}

func resolveCommand(command []string) ([]string, error) {
	if len(command) == 0 {
		return nil, fmt.Errorf("terminal command is required")
	}
	path, err := exec.LookPath(strings.TrimSpace(command[0]))
	if err != nil {
		return nil, fmt.Errorf("resolve terminal command %q: %w", command[0], err)
	}
	resolved := append([]string{path}, command[1:]...)
	return resolved, nil
}

func equalStringSlices(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func waitForDone(ctx context.Context, done <-chan struct{}) error {
	if ctx == nil {
		<-done
		return nil
	}

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func isExpectedReadError(err error) bool {
	return errors.Is(err, io.EOF) || errors.Is(err, os.ErrClosed)
}

func isExpectedWaitError(err error) bool {
	if err == nil {
		return true
	}
	var exitError *exec.ExitError
	return errors.As(err, &exitError)
}
