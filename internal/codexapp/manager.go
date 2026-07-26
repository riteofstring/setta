package codexapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	jsonRPCErrorInvalidRequest   = -32600
	jsonRPCErrorMethodNotFound   = -32601
	jsonRPCErrorServerOverloaded = -32050
	maxSessionLagMarkersPerFlush = 1
	sessionEventBufferSize       = 256
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

	startMu    sync.Mutex
	mu         sync.Mutex
	client     *Client
	state      ManagerState
	err        error
	closed     bool
	generation uint64

	nextSessionID int
	sessions      map[int]*Session

	notificationHandlers map[string][]NotificationHandler
	requestHandlers      map[string][]RequestHandler
}

type NotificationHandler func(Message)
type RequestHandler func(Message)

type Session struct {
	id      int
	manager *Manager
	events  chan Event
	done    chan struct{}

	sendMu        sync.RWMutex
	mu            sync.Mutex
	once          sync.Once
	closed        bool
	terminalErr   error
	threads       map[string]struct{}
	turnsByThread map[string]map[string]struct{}
	pendingLag    map[sessionLagKey]*pendingSessionLag
	highWaterMark int
}

type EventKind string

const (
	EventNotification EventKind = "notification"
	EventRequest      EventKind = "request"
	EventLifecycle    EventKind = "lifecycle"
	EventLag          EventKind = "lag"
)

type EventClass string

const (
	EventClassLosslessNotification   EventClass = "lossless_notification"
	EventClassBestEffortNotification EventClass = "best_effort_notification"
	EventClassServerRequest          EventClass = "server_request"
	EventClassLifecycle              EventClass = "lifecycle"
)

type Event struct {
	Class   EventClass
	Kind    EventKind
	Lag     *LagEvent
	Message Message
	Err     error
}

type LagEvent struct {
	EventClass        EventClass
	Method            string
	RunID             string
	ThreadID          string
	TurnID            string
	ProviderItemID    string
	ProviderProcessID string
	Stream            string
	SkippedCount      int
	QueueDepth        int
	QueueHighWater    int
	FirstSkippedAt    string
	LastSkippedAt     string
}

type sessionLagKey struct {
	class             EventClass
	method            string
	runID             string
	threadID          string
	turnID            string
	providerItemID    string
	providerProcessID string
	stream            string
}

type pendingSessionLag struct {
	count          int
	queueDepth     int
	queueHighWater int
	first          time.Time
	last           time.Time
}

func NewManager(config ManagerConfig) *Manager {
	return &Manager{
		config:               config,
		state:                ManagerStateStopped,
		sessions:             map[int]*Session{},
		notificationHandlers: map[string][]NotificationHandler{},
		requestHandlers:      map[string][]RequestHandler{},
	}
}

func (manager *Manager) RegisterNotificationHandler(method string, handler NotificationHandler) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.notificationHandlers[method] = append(manager.notificationHandlers[method], handler)
}

func (manager *Manager) RegisterRequestHandler(method string, handler RequestHandler) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.requestHandlers[method] = append(manager.requestHandlers[method], handler)
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
		events:        make(chan Event, sessionEventBufferSize),
		done:          make(chan struct{}),
		threads:       map[string]struct{}{},
		turnsByThread: map[string]map[string]struct{}{},
		pendingLag:    map[sessionLagKey]*pendingSessionLag{},
	}
	manager.sessions[session.id] = session
	return session, nil
}

func (manager *Manager) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("shutdown context is required")
	}
	manager.mu.Lock()
	manager.closed = true
	client := manager.client
	manager.client = nil
	manager.state = ManagerStateStopped
	manager.err = errors.New("codex app-server manager shut down")
	sessions := manager.sessionSnapshotLocked()
	manager.sessions = map[int]*Session{}
	manager.mu.Unlock()

	var shutdownErr error
	if client != nil {
		shutdownErr = client.shutdown(ctx)
	}
	for _, session := range sessions {
		session.closeWithEvent(Event{Class: EventClassLifecycle, Kind: EventLifecycle, Err: errors.New("codex app-server manager shut down")})
	}
	return shutdownErr
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
	manager.generation++
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
			manager.dispatchNotificationWithCancel(message, client.Done())
		case message := <-client.Requests():
			manager.dispatchRequest(message)
		case <-client.Done():
			manager.drainClientNotifications(client)
			manager.handleClientDone(client)
			return
		}
	}
}

func (manager *Manager) drainClientNotifications(client *Client) {
	for {
		select {
		case message := <-client.Notifications():
			manager.dispatchNotification(message)
		default:
			return
		}
	}
}

func (manager *Manager) dispatchNotification(message Message) {
	manager.dispatchNotificationWithCancel(message, nil)
}

func (manager *Manager) dispatchNotificationWithCancel(message Message, cancel <-chan struct{}) {
	manager.mu.Lock()
	handlers := append([]NotificationHandler{}, manager.notificationHandlers[message.Method]...)
	manager.mu.Unlock()
	for _, handler := range handlers {
		handler(message)
	}
	class := classifyNotification(message)
	manager.dispatchSessionEvent(Event{Class: class, Kind: EventNotification, Message: message}, cancel)
}

func (manager *Manager) dispatchRequest(message Message) {
	manager.mu.Lock()
	handlers := append([]RequestHandler{}, manager.requestHandlers[message.Method]...)
	manager.mu.Unlock()
	for _, handler := range handlers {
		handler(message)
		return
	}
	matches := manager.matchingSessions(message, EventRequest)
	if len(matches) != 1 {
		if len(matches) == 0 {
			_ = message.RespondError(jsonRPCErrorMethodNotFound, fmt.Sprintf("codex app-server request %s has no owning session", message.Method))
			return
		}
		_ = message.RespondError(jsonRPCErrorInvalidRequest, fmt.Sprintf("codex app-server request %s has multiple owning sessions", message.Method))
		return
	}
	if !matches[0].session.sendRequest(Event{Class: EventClassServerRequest, Kind: EventRequest, Message: message}) {
		_ = message.RespondError(jsonRPCErrorServerOverloaded, fmt.Sprintf("codex app-server request %s owning session is overloaded", message.Method))
	}
}

func (manager *Manager) dispatchSessionEvent(event Event, cancel <-chan struct{}) {
	matches := manager.matchingSessions(event.Message, event.Kind)
	for _, match := range matches {
		switch event.Class {
		case EventClassBestEffortNotification:
			match.session.sendBestEffort(event)
		case EventClassLosslessNotification:
			_ = match.session.sendLossless(event, cancel)
		default:
			_ = match.session.sendLossless(event, cancel)
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
	manager.generation++
	if len(manager.sessions) == 0 {
		manager.state = ManagerStateStopped
	} else {
		manager.state = ManagerStateFailed
	}
	manager.err = err
	sessions := manager.sessionSnapshotLocked()
	manager.mu.Unlock()
	for _, session := range sessions {
		event := Event{Class: EventClassLifecycle, Kind: EventLifecycle, Err: err}
		if !session.sendLifecycle(event) {
			session.deliverLifecycleAsync(event)
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
	return session.ownThread(threadID, nil)
}

func (session *Session) OwnThreadWithActivation(threadID string, activate func() error) error {
	return session.ownThread(threadID, activate)
}

func (session *Session) ownThread(threadID string, activate func() error) error {
	if threadID == "" {
		return errors.New("codex app-server session thread ID is required")
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if err := session.unavailableErrorLocked(); err != nil {
		return err
	}
	if activate != nil {
		if err := activate(); err != nil {
			return err
		}
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
	if err := session.unavailableErrorLocked(); err != nil {
		return err
	}
	session.threads[threadID] = struct{}{}
	if session.turnsByThread[threadID] == nil {
		session.turnsByThread[threadID] = map[string]struct{}{}
	}
	session.turnsByThread[threadID][turnID] = struct{}{}
	return nil
}

func (session *Session) Close() {
	session.once.Do(func() {
		close(session.done)
		session.manager.mu.Lock()
		delete(session.manager.sessions, session.id)
		session.manager.mu.Unlock()
		session.sendMu.Lock()
		defer session.sendMu.Unlock()
		session.mu.Lock()
		session.closed = true
		close(session.events)
		session.mu.Unlock()
	})
}

func (session *Session) closeWithEvent(event Event) {
	session.once.Do(func() {
		close(session.done)
		session.manager.mu.Lock()
		delete(session.manager.sessions, session.id)
		session.manager.mu.Unlock()
		session.sendMu.Lock()
		defer session.sendMu.Unlock()
		session.mu.Lock()
		if event.Class == "" {
			event.Class = EventClassLifecycle
		}
		if event.Err != nil {
			session.terminalErr = event.Err
		}
		select {
		case session.events <- event:
		default:
		}
		session.closed = true
		close(session.events)
		session.mu.Unlock()
	})
}

func (session *Session) sendLifecycle(event Event) bool {
	event = normalizeLifecycleEvent(event)
	session.setLifecycleError(event)
	session.flushLagMarkers(0)
	return session.sendNonblocking(event)
}

func (session *Session) setLifecycleError(event Event) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return
	}
	if event.Err != nil {
		session.terminalErr = event.Err
	}
}

func (session *Session) deliverLifecycleAsync(event Event) {
	event = normalizeLifecycleEvent(event)
	go func() {
		session.setLifecycleError(event)
		if !session.flushLagMarkersBlocking(nil) {
			return
		}
		_ = session.sendBlocking(event, nil)
	}()
}

func normalizeLifecycleEvent(event Event) Event {
	if event.Class == "" {
		event.Class = EventClassLifecycle
	}
	return event
}

func (session *Session) sendRequest(event Event) bool {
	session.flushLagMarkers(maxSessionLagMarkersPerFlush)
	return session.sendNonblocking(event)
}

func (session *Session) sendBestEffort(event Event) {
	session.flushLagMarkers(0)
	if session.sendNonblocking(event) {
		return
	}
	session.recordBestEffortLag(event)
}

func (session *Session) sendLossless(event Event, cancel <-chan struct{}) bool {
	if !session.flushLagMarkersBlocking(cancel) {
		return false
	}
	return session.sendBlocking(event, cancel)
}

func (session *Session) flushLagMarkersBlocking(cancel <-chan struct{}) bool {
	for session.flushLagMarkers(0) {
		if !session.sendLagMarkerBlocking(cancel) {
			return false
		}
	}
	return true
}

func (session *Session) sendNonblocking(event Event) bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return false
	}
	select {
	case session.events <- event:
		session.recordHighWaterMarkLocked()
		return true
	default:
		return false
	}
}

func (session *Session) sendBlocking(event Event, cancel <-chan struct{}) (delivered bool) {
	session.sendMu.RLock()
	defer session.sendMu.RUnlock()
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return false
	}
	events := session.events
	done := session.done
	session.mu.Unlock()

	defer func() {
		if recover() != nil {
			delivered = false
		}
		if delivered {
			session.mu.Lock()
			session.recordHighWaterMarkLocked()
			session.mu.Unlock()
		}
	}()

	select {
	case events <- event:
		return true
	case <-done:
		return false
	case <-cancel:
		return false
	}
}

func (session *Session) recordBestEffortLag(event Event) {
	scope := messageScopeFor(event.Message)
	key := sessionLagKey{
		class:             event.Class,
		method:            event.Message.Method,
		runID:             scope.RunID,
		threadID:          scope.ThreadID,
		turnID:            scope.TurnID,
		providerItemID:    scope.ProviderItemID,
		providerProcessID: scope.ProviderProcessID,
		stream:            scope.Stream,
	}
	now := time.Now().UTC()
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return
	}
	queueDepth := len(session.events)
	session.recordHighWaterMarkLocked()
	lag := session.pendingLag[key]
	if lag == nil {
		lag = &pendingSessionLag{first: now}
		session.pendingLag[key] = lag
	}
	lag.count++
	if queueDepth > lag.queueDepth {
		lag.queueDepth = queueDepth
	}
	if session.highWaterMark > lag.queueHighWater {
		lag.queueHighWater = session.highWaterMark
	}
	lag.last = now
}

func (session *Session) flushLagMarkers(limit int) bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed || len(session.pendingLag) == 0 {
		return false
	}
	sent := 0
	for key, lag := range session.pendingLag {
		if limit > 0 && sent >= limit {
			return false
		}
		event := lagEventFrom(key, *lag)
		select {
		case session.events <- event:
			delete(session.pendingLag, key)
			session.recordHighWaterMarkLocked()
			sent++
		default:
			return true
		}
	}
	return false
}

func (session *Session) sendLagMarkerBlocking(cancel <-chan struct{}) bool {
	key, lag, event, ok := session.takePendingLagMarker()
	if !ok {
		return true
	}
	if session.sendBlocking(event, cancel) {
		return true
	}
	session.restorePendingLag(key, lag)
	return false
}

func (session *Session) takePendingLagMarker() (sessionLagKey, pendingSessionLag, Event, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed || len(session.pendingLag) == 0 {
		return sessionLagKey{}, pendingSessionLag{}, Event{}, false
	}
	for key, lag := range session.pendingLag {
		copied := *lag
		delete(session.pendingLag, key)
		return key, copied, lagEventFrom(key, copied), true
	}
	return sessionLagKey{}, pendingSessionLag{}, Event{}, false
}

func (session *Session) restorePendingLag(key sessionLagKey, lag pendingSessionLag) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return
	}
	existing := session.pendingLag[key]
	if existing == nil {
		copied := lag
		session.pendingLag[key] = &copied
		return
	}
	existing.count += lag.count
	if existing.first.IsZero() || (!lag.first.IsZero() && lag.first.Before(existing.first)) {
		existing.first = lag.first
	}
	if lag.last.After(existing.last) {
		existing.last = lag.last
	}
	if lag.queueDepth > existing.queueDepth {
		existing.queueDepth = lag.queueDepth
	}
	if lag.queueHighWater > existing.queueHighWater {
		existing.queueHighWater = lag.queueHighWater
	}
}

func lagEventFrom(key sessionLagKey, lag pendingSessionLag) Event {
	return Event{
		Class: EventClassBestEffortNotification,
		Kind:  EventLag,
		Lag: &LagEvent{
			EventClass:        key.class,
			Method:            key.method,
			RunID:             key.runID,
			ThreadID:          key.threadID,
			TurnID:            key.turnID,
			ProviderItemID:    key.providerItemID,
			ProviderProcessID: key.providerProcessID,
			Stream:            key.stream,
			SkippedCount:      lag.count,
			QueueDepth:        lag.queueDepth,
			QueueHighWater:    lag.queueHighWater,
			FirstSkippedAt:    formatLagTime(lag.first),
			LastSkippedAt:     formatLagTime(lag.last),
		},
	}
}

func formatLagTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339Nano)
}

func (session *Session) recordHighWaterMarkLocked() {
	if depth := len(session.events); depth > session.highWaterMark {
		session.highWaterMark = depth
	}
}

func (session *Session) unavailableErrorLocked() error {
	if session.closed {
		if session.terminalErr != nil {
			return fmt.Errorf("codex app-server session is closed: %w", session.terminalErr)
		}
		return errors.New("codex app-server session is closed")
	}
	return nil
}

func (session *Session) CloseError() error {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.unavailableErrorLocked()
}

func classifyMessage(message Message) EventClass {
	if message.Method != "" && message.ID != nil {
		return EventClassServerRequest
	}
	if message.Method == "" {
		return ""
	}
	return classifyNotification(message)
}

func classifyNotification(message Message) EventClass {
	switch message.Method {
	case CodexNotificationCommandExecOutputDelta,
		CodexNotificationItemCommandExecutionOutputDelta,
		CodexNotificationProcessOutputDelta:
		return EventClassBestEffortNotification
	default:
		return EventClassLosslessNotification
	}
}

type messageScope struct {
	RunID             string
	ThreadID          string
	TurnID            string
	ProviderItemID    string
	ProviderProcessID string
	Stream            string
}

func messageScopeFor(message Message) messageScope {
	if scope, ok := typedMessageScopeFor(message); ok {
		return scope
	}
	params := map[string]any{}
	if len(message.Params) > 0 {
		_ = json.Unmarshal(message.Params, &params)
	}
	return messageScope{
		RunID:             stringValue(params["runId"]),
		ThreadID:          firstString(stringValue(params["threadId"]), nestedString(params["thread"], "id")),
		TurnID:            firstString(stringValue(params["turnId"]), nestedString(params["turn"], "id")),
		ProviderItemID:    firstString(stringValue(params["itemId"]), nestedString(params["item"], "id")),
		ProviderProcessID: firstString(stringValue(params["processId"]), stringValue(params["processHandle"]), nestedString(params["item"], "processId")),
		Stream:            stringValue(params["stream"]),
	}
}

func typedMessageScopeFor(message Message) (messageScope, bool) {
	switch message.Method {
	case CodexNotificationItemCommandExecutionOutputDelta:
		params, err := DecodeCommandExecutionOutputDeltaNotification(message.Params)
		if err != nil {
			return messageScope{}, false
		}
		return messageScope{
			ThreadID:       params.ThreadID,
			TurnID:         params.TurnID,
			ProviderItemID: params.ItemId,
		}, true
	case CodexNotificationCommandExecOutputDelta:
		params, err := DecodeCommandExecOutputDeltaNotification(message.Params)
		if err != nil {
			return messageScope{}, false
		}
		return messageScope{
			ProviderItemID:    "command_exec_" + params.ProcessId,
			ProviderProcessID: params.ProcessId,
			Stream:            string(params.Stream),
		}, true
	case CodexNotificationProcessOutputDelta:
		params, err := DecodeProcessOutputDeltaNotification(message.Params)
		if err != nil {
			return messageScope{}, false
		}
		return messageScope{
			ProviderItemID:    "process_" + params.ProcessHandle,
			ProviderProcessID: params.ProcessHandle,
			Stream:            string(params.Stream),
		}, true
	default:
		return messageScope{}, false
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
		return 0, false
	}
	return session.matchThreadScore(scope, kind)
}

func (session *Session) matchThreadScore(scope messageScope, kind EventKind) (int, bool) {
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
