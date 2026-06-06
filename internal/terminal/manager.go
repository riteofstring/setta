package terminal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"setta/internal/workspace"
)

const (
	DefaultCols     = 80
	DefaultRows     = 24
	MaxCols         = 500
	MaxRows         = 200
	MaxInputBytes   = 1 << 20
	readBufferBytes = 16 * 1024
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type ManagerConfig struct {
	WorkspaceResolver WorkspaceResolver
	PTY               PTYStarter
	Clock             func() time.Time
}

type Manager struct {
	clock             func() time.Time
	eventHub          *eventHub
	mu                sync.Mutex
	pty               PTYStarter
	sessionByID       map[string]*session
	sessionByPane     map[workspacePaneKey]string
	workspaceResolver WorkspaceResolver
}

type session struct {
	cols        int
	createdAt   time.Time
	cwd         string
	exitCode    int
	handle      PTYHandle
	id          string
	message     string
	paneID      string
	profileID   string
	rows        int
	status      SessionStatus
	updatedAt   time.Time
	workspaceID string
}

type workspacePaneKey struct {
	paneID      string
	workspaceID string
}

func NewManager(config ManagerConfig) (*Manager, error) {
	if config.WorkspaceResolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	ptyStarter := config.PTY
	if ptyStarter == nil {
		ptyStarter = NewSystemPTYStarter()
	}
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	eventHub, err := newEventHub(clock)
	if err != nil {
		return nil, err
	}
	return &Manager{
		clock:             clock,
		eventHub:          eventHub,
		pty:               ptyStarter,
		sessionByID:       map[string]*session{},
		sessionByPane:     map[workspacePaneKey]string{},
		workspaceResolver: config.WorkspaceResolver,
	}, nil
}

func (manager *Manager) Create(
	ctx context.Context,
	workspaceID string,
	paneID string,
	profileID string,
	cwd string,
	cols int,
	rows int,
) (SessionSummary, error) {
	if err := validateAttachment(workspaceID, paneID); err != nil {
		return SessionSummary{}, err
	}
	if err := validateDimensions(cols, rows); err != nil {
		return SessionSummary{}, err
	}
	key := workspacePaneKey{workspaceID: workspaceID, paneID: paneID}
	if summary, ok := manager.attachedSessionSummary(key); ok {
		return summary, nil
	}
	resolvedCWD, err := manager.resolveCWD(workspaceID, cwd)
	if err != nil {
		return SessionSummary{}, err
	}
	profile := defaultProfile(profileID, resolvedCWD, cols, rows)
	handle, err := manager.pty.Start(ctx, profile)
	if err != nil {
		return SessionSummary{}, fmt.Errorf("start terminal session: %w", err)
	}
	id, err := newSessionID()
	if err != nil {
		_ = handle.Close()
		return SessionSummary{}, err
	}
	now := manager.clock().UTC()
	terminalSession := &session{
		cols:        cols,
		createdAt:   now,
		cwd:         resolvedCWD,
		handle:      handle,
		id:          id,
		paneID:      paneID,
		profileID:   profile.ID,
		rows:        rows,
		status:      SessionStatusRunning,
		updatedAt:   now,
		workspaceID: workspaceID,
	}
	manager.mu.Lock()
	manager.sessionByID[id] = terminalSession
	manager.sessionByPane[key] = id
	summary := terminalSession.summary()
	manager.mu.Unlock()

	manager.publishLifecycle(terminalSession, TerminalEventStarted, "")
	go manager.readLoop(id, handle)
	go manager.waitLoop(id, handle)
	return summary, nil
}

func (manager *Manager) Attach(
	_ context.Context,
	workspaceID string,
	paneID string,
) (SessionSummary, error) {
	if err := validateAttachment(workspaceID, paneID); err != nil {
		return SessionSummary{}, err
	}
	if summary, ok := manager.attachedSessionSummary(workspacePaneKey{workspaceID: workspaceID, paneID: paneID}); ok {
		return summary, nil
	}
	return SessionSummary{}, fmt.Errorf("terminal session not found for workspace %s pane %s", workspaceID, paneID)
}

func (manager *Manager) WriteInput(_ context.Context, sessionID string, data []byte) (int, error) {
	if sessionID == "" {
		return 0, errors.New("session id is required")
	}
	if len(data) == 0 {
		return 0, nil
	}
	if len(data) > MaxInputBytes {
		return 0, fmt.Errorf("terminal input exceeds %d bytes", MaxInputBytes)
	}
	terminalSession, err := manager.runningSession(sessionID)
	if err != nil {
		return 0, err
	}
	written, err := terminalSession.handle.Write(data)
	if err != nil {
		return written, fmt.Errorf("write terminal input: %w", err)
	}
	return written, nil
}

func (manager *Manager) Resize(
	_ context.Context,
	sessionID string,
	cols int,
	rows int,
) (SessionSummary, error) {
	if sessionID == "" {
		return SessionSummary{}, errors.New("session id is required")
	}
	if err := validateDimensions(cols, rows); err != nil {
		return SessionSummary{}, err
	}
	terminalSession, err := manager.runningSession(sessionID)
	if err != nil {
		return SessionSummary{}, err
	}
	if err := terminalSession.handle.Resize(cols, rows); err != nil {
		return SessionSummary{}, fmt.Errorf("resize terminal session: %w", err)
	}
	manager.mu.Lock()
	terminalSession.cols = cols
	terminalSession.rows = rows
	terminalSession.updatedAt = manager.clock().UTC()
	summary := terminalSession.summary()
	manager.mu.Unlock()
	return summary, nil
}

func (manager *Manager) Close(
	_ context.Context,
	sessionID string,
	mode CloseMode,
) (SessionSummary, error) {
	if sessionID == "" {
		return SessionSummary{}, errors.New("session id is required")
	}
	if err := validateCloseMode(mode); err != nil {
		return SessionSummary{}, err
	}
	terminalSession, err := manager.sessionForClose(sessionID)
	if err != nil {
		return SessionSummary{}, err
	}
	switch mode {
	case CloseModeTerminate:
		err = terminalSession.handle.Terminate()
	case CloseModeKill:
		err = terminalSession.handle.Kill()
	default:
		panic("validated terminal close mode was not exhaustive")
	}
	if err != nil && !errors.Is(err, os.ErrProcessDone) {
		return SessionSummary{}, fmt.Errorf("close terminal session: %w", err)
	}
	manager.mu.Lock()
	terminalSession.status = SessionStatusClosed
	terminalSession.message = string(mode)
	terminalSession.updatedAt = manager.clock().UTC()
	summary := terminalSession.summary()
	manager.removeSessionLocked(terminalSession)
	manager.mu.Unlock()
	_ = terminalSession.handle.Close()
	manager.publishLifecycle(terminalSession, TerminalEventClosed, string(mode))
	return summary, nil
}

func (manager *Manager) SubscribeEvents(cursor EventCursor) (*EventSubscription, error) {
	return manager.eventHub.subscribe(cursor)
}

func (manager *Manager) CloseEvents() {
	manager.eventHub.close()
}

func (manager *Manager) Shutdown(ctx context.Context) error {
	manager.mu.Lock()
	sessions := make([]*session, 0, len(manager.sessionByID))
	for _, terminalSession := range manager.sessionByID {
		sessions = append(sessions, terminalSession)
	}
	manager.mu.Unlock()

	var shutdownErr error
	for _, terminalSession := range sessions {
		if err := terminalSession.handle.Terminate(); err != nil && shutdownErr == nil && !errors.Is(err, os.ErrProcessDone) {
			shutdownErr = err
		}
	}
	done := make(chan struct{})
	go func() {
		for _, terminalSession := range sessions {
			_ = terminalSession.handle.Close()
		}
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		if shutdownErr == nil {
			shutdownErr = ctx.Err()
		}
	}
	manager.CloseEvents()
	return shutdownErr
}

func (manager *Manager) attachedSessionSummary(key workspacePaneKey) (SessionSummary, bool) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	sessionID, ok := manager.sessionByPane[key]
	if !ok {
		return SessionSummary{}, false
	}
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		delete(manager.sessionByPane, key)
		return SessionSummary{}, false
	}
	return terminalSession.summary(), true
}

func (manager *Manager) resolveCWD(workspaceID string, override string) (string, error) {
	if override != "" {
		return validateCWD(override)
	}
	summary, err := manager.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return validateCWD(summary.RootPath)
}

func (manager *Manager) runningSession(sessionID string) (*session, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		return nil, fmt.Errorf("terminal session not found: %s", sessionID)
	}
	if terminalSession.status != SessionStatusRunning && terminalSession.status != SessionStatusStarting {
		return nil, fmt.Errorf("terminal session %s is not running: %s", sessionID, terminalSession.status)
	}
	return terminalSession, nil
}

func (manager *Manager) sessionForClose(sessionID string) (*session, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		return nil, fmt.Errorf("terminal session not found: %s", sessionID)
	}
	return terminalSession, nil
}

func (manager *Manager) readLoop(sessionID string, handle PTYHandle) {
	buffer := make([]byte, readBufferBytes)
	for {
		count, err := handle.Read(buffer)
		if count > 0 {
			manager.publishOutput(sessionID, buffer[:count])
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				manager.markSessionError(sessionID, err)
			}
			return
		}
	}
}

func (manager *Manager) waitLoop(sessionID string, handle PTYHandle) {
	err := handle.Wait()
	if err == nil {
		manager.markSessionExited(sessionID, 0, "")
		return
	}
	manager.markSessionExited(sessionID, exitCode(err), err.Error())
}

func (manager *Manager) publishOutput(sessionID string, data []byte) {
	manager.mu.Lock()
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil {
		manager.mu.Unlock()
		return
	}
	event := manager.eventHub.eventForSession(
		terminalSession,
		TerminalEventOutput,
		TerminalEventPayload{
			DataBase64: base64.StdEncoding.EncodeToString(data),
			ByteCount:  len(data),
			Status:     terminalSession.status,
			CWD:        terminalSession.cwd,
			Cols:       terminalSession.cols,
			Rows:       terminalSession.rows,
		},
	)
	manager.mu.Unlock()
	manager.eventHub.publish(event)
}

func (manager *Manager) publishLifecycle(terminalSession *session, eventType TerminalEventType, message string) {
	manager.mu.Lock()
	current := manager.sessionByID[terminalSession.id]
	if current == nil {
		current = terminalSession
	}
	event := manager.eventHub.eventForSession(
		current,
		eventType,
		TerminalEventPayload{
			Status:   current.status,
			CWD:      current.cwd,
			Cols:     current.cols,
			Rows:     current.rows,
			ExitCode: current.exitCode,
			Message:  message,
		},
	)
	manager.mu.Unlock()
	manager.eventHub.publish(event)
}

func (manager *Manager) markSessionError(sessionID string, err error) {
	manager.mu.Lock()
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil || terminalSession.status == SessionStatusClosed {
		manager.mu.Unlock()
		return
	}
	terminalSession.status = SessionStatusError
	terminalSession.message = err.Error()
	terminalSession.updatedAt = manager.clock().UTC()
	event := manager.eventHub.eventForSession(
		terminalSession,
		TerminalEventError,
		TerminalEventPayload{
			Status:  terminalSession.status,
			CWD:     terminalSession.cwd,
			Cols:    terminalSession.cols,
			Rows:    terminalSession.rows,
			Message: err.Error(),
		},
	)
	manager.removeSessionLocked(terminalSession)
	manager.mu.Unlock()
	manager.eventHub.publish(event)
}

func (manager *Manager) markSessionExited(sessionID string, code int, message string) {
	manager.mu.Lock()
	terminalSession := manager.sessionByID[sessionID]
	if terminalSession == nil || terminalSession.status == SessionStatusClosed {
		manager.mu.Unlock()
		return
	}
	terminalSession.status = SessionStatusExited
	terminalSession.exitCode = code
	terminalSession.message = message
	terminalSession.updatedAt = manager.clock().UTC()
	event := manager.eventHub.eventForSession(
		terminalSession,
		TerminalEventExited,
		TerminalEventPayload{
			Status:   terminalSession.status,
			CWD:      terminalSession.cwd,
			Cols:     terminalSession.cols,
			Rows:     terminalSession.rows,
			ExitCode: code,
			Message:  message,
		},
	)
	manager.removeSessionLocked(terminalSession)
	manager.mu.Unlock()
	manager.eventHub.publish(event)
}

func (manager *Manager) removeSessionLocked(terminalSession *session) {
	delete(manager.sessionByID, terminalSession.id)
	delete(manager.sessionByPane, workspacePaneKey{
		workspaceID: terminalSession.workspaceID,
		paneID:      terminalSession.paneID,
	})
}

func (terminalSession *session) summary() SessionSummary {
	return SessionSummary{
		ID:          terminalSession.id,
		WorkspaceID: terminalSession.workspaceID,
		PaneID:      terminalSession.paneID,
		ProfileID:   terminalSession.profileID,
		CWD:         terminalSession.cwd,
		Cols:        terminalSession.cols,
		Rows:        terminalSession.rows,
		Status:      terminalSession.status,
		CreatedAt:   terminalSession.createdAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt:   terminalSession.updatedAt.UTC().Format(time.RFC3339Nano),
		ExitCode:    terminalSession.exitCode,
		Message:     terminalSession.message,
	}
}

func validateAttachment(workspaceID string, paneID string) error {
	if workspaceID == "" {
		return errors.New("workspace id is required")
	}
	if paneID == "" {
		return errors.New("pane id is required")
	}
	return nil
}

func validateDimensions(cols int, rows int) error {
	if cols <= 0 || cols > MaxCols {
		return fmt.Errorf("terminal cols must be between 1 and %d: %d", MaxCols, cols)
	}
	if rows <= 0 || rows > MaxRows {
		return fmt.Errorf("terminal rows must be between 1 and %d: %d", MaxRows, rows)
	}
	return nil
}

func validateCloseMode(mode CloseMode) error {
	switch mode {
	case CloseModeTerminate, CloseModeKill:
		return nil
	default:
		return fmt.Errorf("unsupported terminal close mode: %s", mode)
	}
}

func validateCWD(cwd string) (string, error) {
	if cwd == "" {
		return "", errors.New("cwd is required")
	}
	if !filepath.IsAbs(cwd) {
		return "", fmt.Errorf("cwd must be absolute: %s", cwd)
	}
	cleaned := filepath.Clean(cwd)
	resolved, err := filepath.EvalSymlinks(cleaned)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("cwd does not exist: %s", cleaned)
		}
		return "", fmt.Errorf("resolve cwd %s: %w", cleaned, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("read cwd %s: %w", resolved, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("cwd is not a directory: %s", resolved)
	}
	return filepath.Clean(resolved), nil
}

func defaultProfile(profileID string, cwd string, cols int, rows int) Profile {
	id := strings.TrimSpace(profileID)
	if id == "" {
		id = DefaultProfileID
	}
	return Profile{
		ID:        id,
		Name:      "Default",
		ShellPath: "",
		Args:      []string{},
		Env:       map[string]string{},
		CWD:       cwd,
		Term:      DefaultTerm,
		Cols:      cols,
		Rows:      rows,
	}
}

func newSessionID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate terminal session id: %w", err)
	}
	return "terminal_" + hex.EncodeToString(bytes[:]), nil
}
