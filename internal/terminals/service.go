package terminals

import (
	"bytes"
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
)

const (
	TerminalIDSeparator      = "::"
	defaultHistoryLimitBytes = 64 * 1024
	defaultSubscriberBuffer  = 32
	defaultReadBufferSize    = 4096
	defaultColumns           = 80
	defaultRows              = 24
	defaultPromptReadyWait   = 5 * time.Second
	runCommandEchoColumns    = 512
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

type ptySession interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Resize(columns int, rows int) error
	Close() error
	Wait() error
	ProcessPID() int
	Control(fn func(fd uintptr)) error
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
	pty    ptySession

	waitDone    chan struct{}
	cleanupOnce sync.Once

	mu          sync.RWMutex
	columns     int
	rows        int
	exited      bool
	history     historyBuffer
	attachments map[string]chan []byte

	managedDefaultShell           bool
	attachedOnce                  bool
	preAttachBackendRunNormalized bool
	initialSizeSynced             bool
	pendingRunCommands            [][]byte

	promptReadyOnce                  sync.Once
	promptReadyStart                 sync.Once
	promptReady                      chan struct{}
	promptReadyMarker                string
	promptReadyBuffer                []byte
	promptReadyActive                bool
	promptReadyAwaitingVisibleOutput bool
	pendingPromptInput               bool
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

func (session *session) isExited() bool {
	session.mu.RLock()
	defer session.mu.RUnlock()
	return session.exited
}

func (session *session) markExited() {
	session.mu.Lock()
	session.exited = true
	session.mu.Unlock()
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

func buildPromptReadyMarker(id uint64) string {
	return "SETTA_CLEAR_CMD"
}

func buildPromptReadyCommand(marker string) []byte {
	return []byte(fmt.Sprintf("alias %s='clear'\n%s\n", marker, marker))
}

func (s *Service) bootstrapPromptReady(session *session) {
	if session == nil || session.promptReadyMarker == "" {
		return
	}
	session.setPromptReadyActive(true)
	if err := s.writeToSession(session, buildPromptReadyCommand(session.promptReadyMarker), false); err != nil {
		session.markPromptReady()
		return
	}

	go func() {
		timer := time.NewTimer(defaultPromptReadyWait)
		defer timer.Stop()
		<-timer.C
		session.appendOutput(session.flushPromptReadyBuffer())
		session.markPromptReady()
	}()
}

func (s *Service) ensurePromptReady(session *session) {
	if session == nil || session.promptReadyMarker == "" {
		return
	}
	session.promptReadyStart.Do(func() {
		s.bootstrapPromptReady(session)
	})
}

func (s *Service) expandRunCommandEchoWidth(session *session, commandLen int) (func(), error) {
	session.mu.RLock()
	rows := session.rows
	columns := session.columns
	session.mu.RUnlock()

	if rows < 1 || columns < 1 || columns >= runCommandEchoColumns || commandLen < columns {
		return nil, nil
	}

	if err := session.pty.Resize(runCommandEchoColumns, rows); err != nil {
		return nil, fmt.Errorf("resize terminal for command echo: %w", err)
	}

	return func() {
		session.mu.RLock()
		restoreRows := session.rows
		restoreColumns := session.columns
		session.mu.RUnlock()
		if restoreRows < 1 || restoreColumns < 1 {
			return
		}
		_ = session.pty.Resize(restoreColumns, restoreRows)
	}, nil
}

func (session *session) captureOutput(data []byte) ([]byte, bool) {
	if session == nil || len(data) == 0 {
		return nil, false
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.promptReadyAwaitingVisibleOutput {
		session.promptReadyAwaitingVisibleOutput = false
		return append([]byte(nil), data...), true
	}

	if session.promptReadyMarker == "" || !session.promptReadyActive {
		return append([]byte(nil), data...), false
	}

	session.promptReadyBuffer = append(session.promptReadyBuffer, data...)
	bufferLimit := session.history.limit
	if bufferLimit <= 0 {
		bufferLimit = defaultHistoryLimitBytes
	}
	if len(session.promptReadyBuffer) > bufferLimit {
		start := len(session.promptReadyBuffer) - bufferLimit
		session.promptReadyBuffer = append([]byte(nil), session.promptReadyBuffer[start:]...)
	}

	outputStart, ok := findPromptReadyLineEndRawOffset(session.promptReadyBuffer, session.promptReadyMarker)
	if !ok {
		return nil, false
	}

	output := append([]byte(nil), session.promptReadyBuffer[outputStart:]...)
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyBuffer = nil
	if len(output) == 0 {
		session.promptReadyAwaitingVisibleOutput = true
		return nil, false
	}
	return output, true
}

func (session *session) flushPromptReadyBuffer() []byte {
	if session == nil {
		return nil
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.promptReadyMarker == "" || !session.promptReadyActive || len(session.promptReadyBuffer) == 0 {
		session.promptReadyMarker = ""
		session.promptReadyActive = false
		session.promptReadyBuffer = nil
		return nil
	}

	buffer := append([]byte(nil), session.promptReadyBuffer...)
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyBuffer = nil
	return buffer
}

func (session *session) markPromptReady() {
	if session == nil {
		return
	}
	session.promptReadyOnce.Do(func() {
		session.clearPromptReadyState()
		close(session.promptReady)
	})
}

func (session *session) waitForPromptReady() error {
	if session == nil || session.promptReady == nil {
		return nil
	}
	<-session.promptReady
	return nil
}

func shellPrintfOctal(value string) string {
	var builder strings.Builder
	for index := 0; index < len(value); index++ {
		fmt.Fprintf(&builder, "\\%03o", value[index])
	}
	return builder.String()
}

func findPromptReadyLineEndRawOffset(raw []byte, marker string) (int, bool) {
	if len(raw) == 0 || marker == "" {
		return 0, false
	}
	if offset, ok := findPromptReadyLineEndRawOffsetDirect(raw, marker); ok {
		return offset, true
	}

	normalized, offsets := normalizeTerminalSearchBuffer(raw)
	markerIndex := bytes.LastIndex(normalized, []byte(marker))
	if markerIndex < 0 {
		return 0, false
	}

	lineEnd := bytes.IndexByte(normalized[markerIndex:], '\n')
	if lineEnd < 0 {
		return 0, false
	}
	return offsets[markerIndex+lineEnd], true
}

func findPromptReadyLineEndRawOffsetDirect(raw []byte, marker string) (int, bool) {
	markerIndex := bytes.LastIndex(raw, []byte(marker))
	if markerIndex < 0 {
		return 0, false
	}
	for index := markerIndex + len(marker); index < len(raw); index++ {
		if raw[index] == '\n' {
			return index + 1, true
		}
	}
	return 0, false
}

func normalizeTerminalSearchBuffer(raw []byte) ([]byte, []int) {
	normalized := make([]byte, 0, len(raw))
	offsets := make([]int, 0, len(raw))

	for index := 0; index < len(raw); index++ {
		current := raw[index]
		if current == 0x1b {
			if index+1 >= len(raw) {
				break
			}
			switch raw[index+1] {
			case '[':
				index += 2
				for index < len(raw) {
					if raw[index] >= 0x40 && raw[index] <= 0x7e {
						break
					}
					index++
				}
			case ']':
				index += 2
				for index < len(raw) {
					if raw[index] == 0x07 {
						break
					}
					if raw[index] == 0x1b && index+1 < len(raw) && raw[index+1] == '\\' {
						index++
						break
					}
					index++
				}
			default:
				index++
			}
			continue
		}
		if current == '\b' {
			if len(normalized) > 0 {
				normalized = normalized[:len(normalized)-1]
				offsets = offsets[:len(offsets)-1]
			}
			continue
		}
		if current == '\r' {
			continue
		}
		if current < 0x20 && current != '\n' && current != '\t' {
			continue
		}
		normalized = append(normalized, current)
		offsets = append(offsets, index+1)
	}

	return normalized, offsets
}

func (session *session) clearPromptReadyState() {
	session.mu.Lock()
	session.promptReadyMarker = ""
	session.promptReadyActive = false
	session.promptReadyAwaitingVisibleOutput = false
	session.promptReadyBuffer = nil
	session.mu.Unlock()
}

func (session *session) setPromptReadyActive(active bool) {
	session.mu.Lock()
	session.promptReadyActive = active
	session.mu.Unlock()
}

func (session *session) setPendingPromptInput(pending bool) {
	session.mu.Lock()
	session.pendingPromptInput = pending
	session.mu.Unlock()
}

func (session *session) takePendingPromptInput() bool {
	session.mu.Lock()
	pending := session.pendingPromptInput
	session.pendingPromptInput = false
	session.mu.Unlock()
	return pending
}

func (session *session) consumePreAttachBackendRunNormalization() bool {
	session.mu.Lock()
	defer session.mu.Unlock()

	if !session.managedDefaultShell || session.attachedOnce || session.preAttachBackendRunNormalized {
		return false
	}
	session.preAttachBackendRunNormalized = true
	return true
}

func (session *session) enqueueRunCommandUntilInitialResize(data []byte) bool {
	session.mu.Lock()
	defer session.mu.Unlock()

	if !session.managedDefaultShell || session.initialSizeSynced {
		return false
	}
	commandCopy := append([]byte(nil), data...)
	session.pendingRunCommands = append(session.pendingRunCommands, commandCopy)
	return true
}

func (session *session) applyResize(columns int, rows int) [][]byte {
	session.mu.Lock()
	defer session.mu.Unlock()

	session.columns = columns
	session.rows = rows
	if session.initialSizeSynced {
		return nil
	}
	session.initialSizeSynced = true
	if len(session.pendingRunCommands) == 0 {
		return nil
	}
	pending := append([][]byte(nil), session.pendingRunCommands...)
	session.pendingRunCommands = nil
	return pending
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
