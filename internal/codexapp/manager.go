package codexapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

const (
	jsonRPCErrorInvalidRequest = -32600
	jsonRPCErrorMethodNotFound = -32601
)

type ManagerState string

const (
	ManagerStateStopped    ManagerState = "stopped"
	ManagerStateStarting   ManagerState = "starting"
	ManagerStateReady      ManagerState = "ready"
	ManagerStateRestarting ManagerState = "restarting"
	ManagerStateFailed     ManagerState = "failed"
)

type ManagerConfig struct {
	Process          ProcessConfig
	InitializeParams any
}

type Manager struct {
	config ManagerConfig

	startMu sync.Mutex
	mu      sync.Mutex
	client  *Client
	state   ManagerState
	err     error
	closed  bool

	nextSessionID int
	sessions      map[int]*Session

	notificationHandlers map[string][]NotificationHandler
}

type NotificationHandler func(Message)

type Session struct {
	id      int
	manager *Manager
	events  chan Event

	mu                           sync.Mutex
	once                         sync.Once
	closed                       bool
	threads                      map[string]struct{}
	turnsByThread                map[string]map[string]struct{}
	acceptsUnscopedNotifications bool
	acceptsUnscopedRequests      bool
}

type EventKind string

const (
	EventNotification EventKind = "notification"
	EventRequest      EventKind = "request"
	EventLifecycle    EventKind = "lifecycle"
)

type Event struct {
	Kind    EventKind
	Message Message
	Err     error
}

func NewManager(config ManagerConfig) *Manager {
	return &Manager{
		config:               config,
		state:                ManagerStateStopped,
		sessions:             map[int]*Session{},
		notificationHandlers: map[string][]NotificationHandler{},
	}
}

func (manager *Manager) State() (ManagerState, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.state, manager.err
}

func (manager *Manager) RegisterNotificationHandler(method string, handler NotificationHandler) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.notificationHandlers[method] = append(manager.notificationHandlers[method], handler)
}

func (manager *Manager) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	client, err := manager.ensureStarted(ctx)
	if err != nil {
		return nil, err
	}
	return client.Call(ctx, method, params)
}

func (manager *Manager) Notify(ctx context.Context, method string, params any) error {
	client, err := manager.ensureStarted(ctx)
	if err != nil {
		return err
	}
	return client.Notify(method, params)
}

func (manager *Manager) NewSession(ctx context.Context) (*Session, error) {
	if _, err := manager.ensureStarted(ctx); err != nil {
		return nil, err
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.closed {
		return nil, errors.New("codex app-server manager is closed")
	}
	manager.nextSessionID++
	session := &Session{
		id:            manager.nextSessionID,
		manager:       manager,
		events:        make(chan Event, 256),
		threads:       map[string]struct{}{},
		turnsByThread: map[string]map[string]struct{}{},
	}
	manager.sessions[session.id] = session
	return session, nil
}

func (manager *Manager) Shutdown(context.Context) error {
	manager.mu.Lock()
	manager.closed = true
	client := manager.client
	manager.client = nil
	manager.state = ManagerStateStopped
	manager.err = errors.New("codex app-server manager shut down")
	sessions := manager.sessionSnapshotLocked()
	manager.sessions = map[int]*Session{}
	manager.mu.Unlock()

	if client != nil {
		client.Close()
	}
	for _, session := range sessions {
		session.closeWithEvent(Event{Kind: EventLifecycle, Err: errors.New("codex app-server manager shut down")})
	}
	return nil
}

func (manager *Manager) ensureStarted(ctx context.Context) (*Client, error) {
	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		return nil, errors.New("codex app-server manager is closed")
	}
	if manager.client != nil {
		client := manager.client
		manager.mu.Unlock()
		return client, nil
	}
	manager.mu.Unlock()

	manager.startMu.Lock()
	defer manager.startMu.Unlock()

	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		return nil, errors.New("codex app-server manager is closed")
	}
	if manager.client != nil {
		client := manager.client
		manager.mu.Unlock()
		return client, nil
	}
	if manager.state == ManagerStateFailed {
		manager.state = ManagerStateRestarting
	} else {
		manager.state = ManagerStateStarting
	}
	manager.err = nil
	manager.mu.Unlock()

	client, err := StartProcess(manager.config.Process)
	if err != nil {
		manager.markStartFailed(err)
		return nil, err
	}
	if err := manager.initialize(ctx, client); err != nil {
		client.Close()
		manager.markStartFailed(err)
		return nil, err
	}

	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		client.Close()
		return nil, errors.New("codex app-server manager is closed")
	}
	manager.client = client
	manager.state = ManagerStateReady
	manager.err = nil
	manager.mu.Unlock()

	go manager.dispatchLoop(client)
	return client, nil
}

func (manager *Manager) initialize(ctx context.Context, client *Client) error {
	params := manager.config.InitializeParams
	if params == nil {
		params = map[string]any{}
	}
	if _, err := client.Call(ctx, CodexMethodInitialize, params); err != nil {
		return fmt.Errorf("initialize codex app-server: %w", err)
	}
	if err := client.Notify("initialized", map[string]any{}); err != nil {
		return fmt.Errorf("acknowledge codex app-server initialization: %w", err)
	}
	return nil
}

func (manager *Manager) markStartFailed(err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = ManagerStateFailed
	manager.err = err
}

func (manager *Manager) dispatchLoop(client *Client) {
	for {
		select {
		case message := <-client.Notifications():
			manager.dispatchNotification(message)
		case message := <-client.Requests():
			manager.dispatchRequest(message)
		case <-client.Done():
			manager.dispatchBufferedMessages(client)
			manager.handleClientDone(client)
			return
		}
	}
}

func (manager *Manager) dispatchBufferedMessages(client *Client) {
	for {
		dispatched := false
		select {
		case message := <-client.Notifications():
			manager.dispatchNotification(message)
			dispatched = true
		default:
		}
		select {
		case message := <-client.Requests():
			manager.dispatchRequest(message)
			dispatched = true
		default:
		}
		if !dispatched {
			return
		}
	}
}

func (manager *Manager) dispatchNotification(message Message) {
	manager.mu.Lock()
	handlers := append([]NotificationHandler{}, manager.notificationHandlers[message.Method]...)
	manager.mu.Unlock()
	for _, handler := range handlers {
		handler(message)
	}
	manager.dispatchSessionEvent(Event{Kind: EventNotification, Message: message})
}

func (manager *Manager) dispatchRequest(message Message) {
	matches := manager.matchingSessions(message, EventRequest)
	if len(matches) != 1 {
		if len(matches) == 0 {
			_ = message.RespondError(jsonRPCErrorMethodNotFound, fmt.Sprintf("codex app-server request %s has no owning session", message.Method))
			return
		}
		_ = message.RespondError(jsonRPCErrorInvalidRequest, fmt.Sprintf("codex app-server request %s has multiple owning sessions", message.Method))
		return
	}
	if !matches[0].session.send(Event{Kind: EventRequest, Message: message}) {
		matches[0].session.closeWithEvent(Event{Kind: EventLifecycle, Err: fmt.Errorf("codex app-server session event buffer overflow")})
		_ = message.RespondError(jsonRPCErrorInvalidRequest, fmt.Sprintf("codex app-server request %s owning session is unavailable", message.Method))
	}
}

func (manager *Manager) dispatchSessionEvent(event Event) {
	matches := manager.matchingSessions(event.Message, event.Kind)
	for _, match := range matches {
		if !match.session.send(event) {
			match.session.closeWithEvent(Event{Kind: EventLifecycle, Err: fmt.Errorf("codex app-server session event buffer overflow")})
		}
	}
}

type sessionMatch struct {
	session *Session
	score   int
}

func (manager *Manager) matchingSessions(message Message, kind EventKind) []sessionMatch {
	manager.mu.Lock()
	sessions := manager.sessionSnapshotLocked()
	manager.mu.Unlock()
	scope := messageScopeFor(message)
	return bestSessionMatches(sessions, scope, kind)
}

func bestSessionMatches(sessions []*Session, scope messageScope, kind EventKind) []sessionMatch {
	matches := make([]sessionMatch, 0, len(sessions))
	bestScore := -1
	for _, session := range sessions {
		score, ok := session.matchScore(scope, kind)
		if !ok {
			continue
		}
		if score > bestScore {
			bestScore = score
			matches = matches[:0]
		}
		if score == bestScore {
			matches = append(matches, sessionMatch{session: session, score: score})
		}
	}
	return matches
}

func (manager *Manager) handleClientDone(client *Client) {
	err := client.LifecycleError("codex app-server exited")
	manager.mu.Lock()
	if manager.client != client {
		manager.mu.Unlock()
		return
	}
	manager.client = nil
	if len(manager.sessions) == 0 {
		manager.state = ManagerStateStopped
	} else {
		manager.state = ManagerStateFailed
	}
	manager.err = err
	sessions := manager.sessionSnapshotLocked()
	manager.mu.Unlock()
	for _, session := range sessions {
		if !session.send(Event{Kind: EventLifecycle, Err: err}) {
			session.closeWithEvent(Event{Kind: EventLifecycle, Err: err})
		}
	}
}

func (manager *Manager) sessionSnapshotLocked() []*Session {
	sessions := make([]*Session, 0, len(manager.sessions))
	for _, session := range manager.sessions {
		sessions = append(sessions, session)
	}
	return sessions
}

func (session *Session) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	return session.manager.Call(ctx, method, params)
}

func (session *Session) Notify(ctx context.Context, method string, params any) error {
	return session.manager.Notify(ctx, method, params)
}

func (session *Session) Events() <-chan Event {
	return session.events
}

func (session *Session) OwnThread(threadID string) error {
	if threadID == "" {
		return errors.New("codex app-server session thread ID is required")
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return errors.New("codex app-server session is closed")
	}
	session.threads[threadID] = struct{}{}
	if session.turnsByThread[threadID] == nil {
		session.turnsByThread[threadID] = map[string]struct{}{}
	}
	return nil
}

func (session *Session) OwnTurn(threadID string, turnID string) error {
	if threadID == "" {
		return errors.New("codex app-server session thread ID is required")
	}
	if turnID == "" {
		return errors.New("codex app-server session turn ID is required")
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return errors.New("codex app-server session is closed")
	}
	session.threads[threadID] = struct{}{}
	if session.turnsByThread[threadID] == nil {
		session.turnsByThread[threadID] = map[string]struct{}{}
	}
	session.turnsByThread[threadID][turnID] = struct{}{}
	return nil
}

func (session *Session) AcceptUnscopedNotifications() {
	session.mu.Lock()
	defer session.mu.Unlock()
	session.acceptsUnscopedNotifications = true
}

func (session *Session) AcceptUnscopedRequests() {
	session.mu.Lock()
	defer session.mu.Unlock()
	session.acceptsUnscopedRequests = true
}

func (session *Session) Close() {
	session.once.Do(func() {
		session.manager.mu.Lock()
		delete(session.manager.sessions, session.id)
		session.manager.mu.Unlock()
		session.mu.Lock()
		session.closed = true
		close(session.events)
		session.mu.Unlock()
	})
}

func (session *Session) closeWithEvent(event Event) {
	session.once.Do(func() {
		session.manager.mu.Lock()
		delete(session.manager.sessions, session.id)
		session.manager.mu.Unlock()
		session.mu.Lock()
		select {
		case session.events <- event:
		default:
		}
		session.closed = true
		close(session.events)
		session.mu.Unlock()
	})
}

func (session *Session) send(event Event) bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return false
	}
	select {
	case session.events <- event:
		return true
	default:
		return false
	}
}

type messageScope struct {
	ThreadID string
	TurnID   string
}

func messageScopeFor(message Message) messageScope {
	params := map[string]any{}
	if len(message.Params) > 0 {
		_ = json.Unmarshal(message.Params, &params)
	}
	return messageScope{
		ThreadID: firstString(stringValue(params["threadId"]), nestedString(params["thread"], "id")),
		TurnID:   firstString(stringValue(params["turnId"]), nestedString(params["turn"], "id")),
	}
}

func firstString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func nestedString(value any, key string) string {
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	text, _ := object[key].(string)
	return text
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func (session *Session) matchScore(scope messageScope, kind EventKind) (int, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return 0, false
	}
	if scope.ThreadID == "" {
		switch kind {
		case EventRequest:
			return 0, session.acceptsUnscopedRequests
		case EventNotification:
			return 0, session.acceptsUnscopedNotifications
		default:
			return 0, false
		}
	}
	if _, ok := session.threads[scope.ThreadID]; !ok {
		return 0, false
	}
	if scope.TurnID == "" {
		return 1, true
	}
	turns := session.turnsByThread[scope.ThreadID]
	if _, ok := turns[scope.TurnID]; ok {
		return 2, true
	}
	if len(turns) == 0 || kind == EventNotification {
		return 1, true
	}
	return 0, false
}
