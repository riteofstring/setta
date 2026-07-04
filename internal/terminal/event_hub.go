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
	replayRetention             time.Duration
	sequence                    int
	sessionBuffers              map[string]*terminalSessionEventBuffer
	streamID                    string
	subscribers                 map[int]chan TerminalEvent
}

type eventHubConfig struct {
	OutputBufferBytesPerSession int
	ReplayRetention             time.Duration
}

type terminalSessionEventBuffer struct {
	events      []retainedTerminalEvent
	cols        int
	cwd         string
	exitCode    int
	outputBytes int
	paneID      string
	rows        int
	sessionID   string
	status      SessionStatus
	workspaceID string
}

type retainedTerminalEvent struct {
	emittedAt time.Time
	event     TerminalEvent
}

func newEventHub(clock func() time.Time, config eventHubConfig) (*eventHub, error) {
	streamID, err := newSessionID()
	if err != nil {
		return nil, err
	}
	return &eventHub{
		clock:                       clock,
		outputBufferBytesPerSession: config.OutputBufferBytesPerSession,
		replayRetention:             config.ReplayRetention,
		sessionBuffers:              map[string]*terminalSessionEventBuffer{},
		streamID:                    streamID,
		subscribers:                 map[int]chan TerminalEvent{},
	}, nil
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
	for _, retained := range buffer.events {
		if retained.event.Type != TerminalEventOutput && retained.event.Type != TerminalEventBufferTruncated {
			continue
		}
		replay := hub.cloneEventLocked(retained.event, hub.clock().UTC())
		hub.sendLocked(replay)
	}
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
	buffer.cwd = terminalSession.cwd
	buffer.exitCode = terminalSession.exitCode
	buffer.paneID = terminalSession.paneID
	buffer.rows = terminalSession.rows
	buffer.sessionID = terminalSession.id
	buffer.status = terminalSession.status
	buffer.workspaceID = terminalSession.workspaceID
	return buffer
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
	for id, events := range hub.subscribers {
		delete(hub.subscribers, id)
		close(events)
	}
}
