package terminal

import (
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

const (
	terminalReplayEventLimit        = 8192
	terminalReplayTailBytesPerCell  = 4
	terminalReplayTailChunksMinimum = 8
	terminalReplayPersistInterval   = 100 * time.Millisecond
	terminalSubscriberBuffer        = 4096
)

type EventSubscription struct {
	Events chan TerminalEvent
	hub    *eventHub
	id     int
	once   sync.Once
}

type eventHub struct {
	clock                       func() time.Time
	closed                      bool
	mu                          sync.Mutex
	nextID                      int
	outputBufferBytesPerSession int
	persistTimer                *time.Timer
	recoveryErr                 error
	replayRetention             time.Duration
	restoredHistorical          bool
	store                       *replayStore
	sequence                    int
	sessionBuffers              map[string]*terminalSessionEventBuffer
	streamID                    string
	subscribers                 map[int]chan TerminalEvent
}

type eventHubConfig struct {
	AppDataDir                  string
	HistoricalRestore           bool
	OutputBufferBytesPerSession int
	ReplayFileBytes             int
	ReplayRetention             time.Duration
}

type terminalSessionEventBuffer struct {
	events      []retainedTerminalEvent
	cols        int
	createdAt   time.Time
	cwd         string
	exitCode    int
	outputBytes int
	paneID      string
	profileID   string
	rows        int
	sessionID   string
	status      SessionStatus
	updatedAt   time.Time
	workspaceID string
}

type retainedTerminalEvent struct {
	emittedAt time.Time
	event     TerminalEvent
}

func newEventHub(clock func() time.Time, config eventHubConfig) (*eventHub, error) {
	store, err := newReplayStore(config.AppDataDir, config.ReplayFileBytes)
	if err != nil {
		return nil, err
	}
	state, recoveryErr := store.load()
	streamID := state.StreamID
	if streamID == "" {
		streamID, err = newSessionID()
		if err != nil {
			return nil, err
		}
	}
	hub := &eventHub{
		clock:                       clock,
		outputBufferBytesPerSession: config.OutputBufferBytesPerSession,
		recoveryErr:                 recoveryErr,
		replayRetention:             config.ReplayRetention,
		store:                       store,
		sequence:                    state.Sequence,
		sessionBuffers:              replayBuffersFromState(state),
		streamID:                    streamID,
		subscribers:                 map[int]chan TerminalEvent{},
	}
	hub.trimExpiredAllLocked(clock().UTC())
	if config.HistoricalRestore {
		hub.markRestoredStateHistoricalLocked(clock().UTC())
	}
	hub.persistLocked()
	return hub, nil
}

func (hub *eventHub) subscribe(cursor EventCursor) (*EventSubscription, error) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return nil, errors.New("terminal event stream is closed")
	}
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return nil, fmt.Errorf("terminal event stream id is no longer available: %s", cursor.StreamID)
	}
	if cursor.Sequence > hub.sequence {
		restoredSequence := hub.sequence
		return nil, fmt.Errorf(
			"terminal event cursor is ahead of restored stream: cursor=%d current=%d",
			cursor.Sequence,
			restoredSequence,
		)
	}
	hub.trimExpiredAllLocked(hub.clock().UTC())
	replay := hub.replayEventsLocked(cursor.Sequence)
	hub.nextID += 1
	events := make(chan TerminalEvent, terminalSubscriberBuffer+len(replay))
	for _, event := range replay {
		events <- event
	}
	hub.subscribers[hub.nextID] = events
	return &EventSubscription{
		Events: events,
		hub:    hub,
		id:     hub.nextID,
	}, nil
}

func (subscription *EventSubscription) Unsubscribe() {
	subscription.once.Do(func() {
		subscription.hub.unsubscribe(subscription.id)
	})
}

func (hub *eventHub) unsubscribe(id int) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	events := hub.subscribers[id]
	if events == nil {
		return
	}
	delete(hub.subscribers, id)
	close(events)
}

func (hub *eventHub) publishForSession(
	terminalSession *session,
	eventType TerminalEventType,
	payload TerminalEventPayload,
) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	events := hub.recordEventLocked(terminalSession, eventType, payload)
	for _, event := range events {
		hub.sendLocked(event)
	}
}

func (hub *eventHub) persistSession(terminalSession *session) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	hub.bufferForSessionLocked(terminalSession)
	hub.flushScheduledPersistLocked()
}

func (hub *eventHub) publishReplayForSession(sessionID string) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	buffer := hub.sessionBuffers[sessionID]
	if buffer == nil {
		return
	}
	now := hub.clock().UTC()
	droppedBytes, droppedChunks := hub.trimExpiredLocked(buffer, now)
	hub.storeReplayTruncationLocked(buffer, droppedBytes, droppedChunks, now)
	hub.flushScheduledPersistLocked()
	buffer = hub.sessionBuffers[sessionID]
	if buffer == nil {
		return
	}
	for _, retained := range buffer.events {
		if retained.event.Type != TerminalEventOutput && retained.event.Type != TerminalEventBufferTruncated {
			continue
		}
		replay := hub.cloneEventLocked(retained.event, hub.clock().UTC())
		hub.sendLocked(replay)
	}
	hub.persistLocked()
}

func (hub *eventHub) recordEventLocked(
	terminalSession *session,
	eventType TerminalEventType,
	payload TerminalEventPayload,
) []TerminalEvent {
	now := hub.clock().UTC()
	event := hub.eventForSessionLocked(terminalSession, eventType, payload, now)
	hub.storeEventLocked(terminalSession, event, now)
	return []TerminalEvent{event}
}

func (hub *eventHub) eventForSessionLocked(
	terminalSession *session,
	eventType TerminalEventType,
	payload TerminalEventPayload,
	now time.Time,
) TerminalEvent {
	hub.sequence += 1
	sequence := hub.sequence
	eventID := fmt.Sprintf("%s:%d", hub.streamID, sequence)
	return TerminalEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       eventID,
		Type:          eventType,
		EmittedAt:     now.Format(time.RFC3339Nano),
		WorkspaceID:   terminalSession.workspaceID,
		PaneID:        terminalSession.paneID,
		SessionID:     terminalSession.id,
		Payload:       payload,
	}
}

func (hub *eventHub) cloneEventLocked(event TerminalEvent, now time.Time) TerminalEvent {
	hub.sequence += 1
	sequence := hub.sequence
	event.StreamID = hub.streamID
	event.Sequence = sequence
	event.EventID = fmt.Sprintf("%s:%d", hub.streamID, sequence)
	event.EmittedAt = now.Format(time.RFC3339Nano)
	return event
}

func (hub *eventHub) eventForBufferLocked(
	buffer *terminalSessionEventBuffer,
	eventType TerminalEventType,
	payload TerminalEventPayload,
	now time.Time,
) TerminalEvent {
	hub.sequence += 1
	sequence := hub.sequence
	eventID := fmt.Sprintf("%s:%d", hub.streamID, sequence)
	return TerminalEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       eventID,
		Type:          eventType,
		EmittedAt:     now.Format(time.RFC3339Nano),
		WorkspaceID:   buffer.workspaceID,
		PaneID:        buffer.paneID,
		SessionID:     buffer.sessionID,
		Payload:       payload,
	}
}

func (hub *eventHub) storeEventLocked(
	terminalSession *session,
	event TerminalEvent,
	now time.Time,
) {
	buffer := hub.bufferForSessionLocked(terminalSession)
	droppedBytes, droppedChunks := hub.trimExpiredLocked(buffer, now)
	buffer.events = append(buffer.events, retainedTerminalEvent{emittedAt: now, event: event})
	if event.Type == TerminalEventOutput {
		buffer.outputBytes += event.Payload.ByteCount
	}
	overflowBytes, overflowChunks := hub.trimOverflowLocked(buffer)
	droppedBytes += overflowBytes
	droppedChunks += overflowChunks
	hub.storeReplayTruncationLocked(buffer, droppedBytes, droppedChunks, now)
	if event.Type == TerminalEventOutput {
		hub.schedulePersistLocked()
	} else {
		hub.flushScheduledPersistLocked()
	}
}

func (hub *eventHub) storeReplayTruncationLocked(
	buffer *terminalSessionEventBuffer,
	droppedBytes int,
	droppedChunks int,
	now time.Time,
) {
	if droppedChunks == 0 {
		return
	}
	truncated := hub.eventForBufferLocked(
		buffer,
		TerminalEventBufferTruncated,
		TerminalEventPayload{
			ByteCount:     droppedBytes,
			DroppedBytes:  droppedBytes,
			DroppedChunks: droppedChunks,
			Status:        buffer.status,
			CWD:           buffer.cwd,
			Cols:          buffer.cols,
			Rows:          buffer.rows,
			ExitCode:      buffer.exitCode,
			Message:       terminalReplayHistoryTruncatedMessage(droppedChunks),
		},
		now,
	)
	buffer.events = append(buffer.events, retainedTerminalEvent{emittedAt: now, event: truncated})
}

func (hub *eventHub) bufferForSessionLocked(terminalSession *session) *terminalSessionEventBuffer {
	buffer := hub.sessionBuffers[terminalSession.id]
	if buffer == nil {
		buffer = &terminalSessionEventBuffer{}
		hub.sessionBuffers[terminalSession.id] = buffer
	}
	buffer.cols = terminalSession.cols
	buffer.createdAt = terminalSession.createdAt
	buffer.cwd = terminalSession.cwd
	buffer.exitCode = terminalSession.exitCode
	buffer.paneID = terminalSession.paneID
	buffer.profileID = terminalSession.profileID
	buffer.rows = terminalSession.rows
	buffer.sessionID = terminalSession.id
	buffer.status = terminalSession.status
	buffer.updatedAt = terminalSession.updatedAt
	buffer.workspaceID = terminalSession.workspaceID
	return buffer
}

func (hub *eventHub) recoveredSessions() []recoveredTerminalSession {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	sessions := make([]recoveredTerminalSession, 0, len(hub.sessionBuffers))
	for _, buffer := range hub.sessionBuffers {
		if buffer.status == SessionStatusClosed {
			continue
		}
		sessions = append(sessions, recoveredTerminalSession{
			Cols:        buffer.cols,
			CreatedAt:   buffer.createdAt,
			CWD:         buffer.cwd,
			ExitCode:    buffer.exitCode,
			Message:     terminalSessionMessage(buffer),
			PaneID:      buffer.paneID,
			ProfileID:   buffer.profileID,
			Rows:        buffer.rows,
			SessionID:   buffer.sessionID,
			Status:      buffer.status,
			UpdatedAt:   buffer.updatedAt,
			WorkspaceID: buffer.workspaceID,
		})
	}
	sort.Slice(sessions, func(left int, right int) bool {
		return sessions[left].SessionID < sessions[right].SessionID
	})
	return sessions
}

func terminalSessionMessage(buffer *terminalSessionEventBuffer) string {
	for index := len(buffer.events) - 1; index >= 0; index-- {
		if buffer.events[index].event.Payload.Message != "" {
			return buffer.events[index].event.Payload.Message
		}
	}
	return ""
}

func (hub *eventHub) recoveryError() error {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return hub.recoveryErr
}

func (hub *eventHub) restoredStateHistorical() bool {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return hub.restoredHistorical
}

func (hub *eventHub) markRestoredStateHistoricalLocked(now time.Time) {
	if hub.restoredHistorical {
		return
	}
	hub.restoredHistorical = true
	for _, buffer := range hub.sessionBuffers {
		if buffer.status != SessionStatusRunning && buffer.status != SessionStatusStarting {
			continue
		}
		buffer.status = SessionStatusError
		buffer.updatedAt = now
		historical := hub.eventForBufferLocked(
			buffer,
			TerminalEventError,
			TerminalEventPayload{
				Status:  buffer.status,
				CWD:     buffer.cwd,
				Cols:    buffer.cols,
				Rows:    buffer.rows,
				Message: terminalSessionInterruptedByCheckpointRestoreMessage,
			},
			now,
		)
		buffer.events = append(buffer.events, retainedTerminalEvent{emittedAt: now, event: historical})
	}
	hub.flushScheduledPersistLocked()
}

func (hub *eventHub) persistLocked() {
	if hub.store == nil {
		return
	}
	state, err := hub.store.save(replayStateFromHub(hub))
	if err != nil {
		if hub.recoveryErr == nil {
			hub.recoveryErr = err
		}
		return
	}
	hub.sequence = state.Sequence
	hub.sessionBuffers = replayBuffersFromState(state)
}

func (hub *eventHub) schedulePersistLocked() {
	if hub.persistTimer != nil {
		return
	}
	hub.persistTimer = time.AfterFunc(terminalReplayPersistInterval, func() {
		hub.mu.Lock()
		defer hub.mu.Unlock()
		hub.persistTimer = nil
		hub.persistLocked()
	})
}

func (hub *eventHub) flushScheduledPersistLocked() {
	if hub.persistTimer != nil {
		hub.persistTimer.Stop()
		hub.persistTimer = nil
	}
	hub.persistLocked()
}

func (hub *eventHub) trimExpiredAllLocked(now time.Time) {
	for sessionID, buffer := range hub.sessionBuffers {
		droppedBytes, droppedChunks := hub.trimExpiredLocked(buffer, now)
		hub.storeReplayTruncationLocked(buffer, droppedBytes, droppedChunks, now)
		if len(buffer.events) == 0 {
			delete(hub.sessionBuffers, sessionID)
		}
	}
}

func (hub *eventHub) trimExpiredLocked(
	buffer *terminalSessionEventBuffer,
	now time.Time,
) (int, int) {
	if hub.replayRetention <= 0 || len(buffer.events) == 0 {
		return 0, 0
	}
	cutoff := now.Add(-hub.replayRetention)
	droppedBytes := 0
	droppedChunks := 0
	for len(buffer.events) > 0 && buffer.events[0].emittedAt.Before(cutoff) {
		bytes, chunks, dropped := hub.dropOldestIfReplayTailRetainedLocked(buffer)
		if !dropped {
			break
		}
		droppedBytes += bytes
		droppedChunks += chunks
	}
	return droppedBytes, droppedChunks
}

func (hub *eventHub) trimOverflowLocked(buffer *terminalSessionEventBuffer) (int, int) {
	droppedBytes := 0
	droppedChunks := 0
	for buffer.outputBytes > hub.outputBufferBytesPerSession || len(buffer.events) > terminalReplayEventLimit {
		bytes, chunks, dropped := hub.dropOldestIfReplayTailRetainedLocked(buffer)
		if !dropped {
			break
		}
		droppedBytes += bytes
		droppedChunks += chunks
		if len(buffer.events) == 0 {
			break
		}
	}
	return droppedBytes, droppedChunks
}

func (hub *eventHub) dropOldestIfReplayTailRetainedLocked(
	buffer *terminalSessionEventBuffer,
) (int, int, bool) {
	if len(buffer.events) == 0 {
		return 0, 0, false
	}
	retained := buffer.events[0]
	if retained.event.Type == TerminalEventOutput && !hub.canDropOutputLocked(buffer, retained.event.Payload.ByteCount) {
		return 0, 0, false
	}
	droppedBytes := 0
	droppedChunks := 0
	if retained.event.Type == TerminalEventOutput {
		droppedBytes += retained.event.Payload.ByteCount
		droppedChunks += 1
		buffer.outputBytes -= retained.event.Payload.ByteCount
	}
	buffer.events = append(buffer.events[:0], buffer.events[1:]...)
	if buffer.outputBytes < 0 {
		buffer.outputBytes = 0
	}
	return droppedBytes, droppedChunks, true
}

func (hub *eventHub) canDropOutputLocked(buffer *terminalSessionEventBuffer, byteCount int) bool {
	if buffer.status != SessionStatusRunning {
		return true
	}
	outputChunks := hub.outputChunkCountLocked(buffer)
	if outputChunks <= terminalReplayTailChunksMinimum {
		return false
	}
	return buffer.outputBytes-byteCount >= hub.replayTailByteFloorLocked(buffer)
}

func (hub *eventHub) outputChunkCountLocked(buffer *terminalSessionEventBuffer) int {
	outputChunks := 0
	for _, retained := range buffer.events {
		if retained.event.Type == TerminalEventOutput {
			outputChunks += 1
		}
	}
	return outputChunks
}

func (hub *eventHub) replayTailByteFloorLocked(buffer *terminalSessionEventBuffer) int {
	cols := buffer.cols
	if cols <= 0 {
		cols = DefaultCols
	}
	rows := buffer.rows
	if rows <= 0 {
		rows = DefaultRows
	}
	return cols * rows * terminalReplayTailBytesPerCell
}

func (hub *eventHub) replayEventsLocked(afterSequence int) []TerminalEvent {
	replay := []TerminalEvent{}
	for _, buffer := range hub.sessionBuffers {
		for _, retained := range buffer.events {
			if retained.event.Sequence > afterSequence {
				replay = append(replay, retained.event)
			}
		}
	}
	sort.Slice(replay, func(left int, right int) bool {
		return replay[left].Sequence < replay[right].Sequence
	})
	return replay
}

func terminalReplayHistoryTruncatedMessage(droppedChunks int) string {
	chunkLabel := "chunks"
	if droppedChunks == 1 {
		chunkLabel = "chunk"
	}
	return fmt.Sprintf(
		"terminal replay history truncated; %d output %s unavailable",
		droppedChunks,
		chunkLabel,
	)
}

func (hub *eventHub) sendLocked(event TerminalEvent) {
	for id, events := range hub.subscribers {
		select {
		case events <- event:
		default:
			delete(hub.subscribers, id)
			close(events)
		}
	}
}

func (hub *eventHub) close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return
	}
	hub.closed = true
	hub.flushScheduledPersistLocked()
	for id, events := range hub.subscribers {
		delete(hub.subscribers, id)
		close(events)
	}
}
