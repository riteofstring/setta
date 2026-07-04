package terminal

import (
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

const (
	terminalReplayEventLimit = 8192
	terminalSubscriberBuffer = 4096
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
	outputBytes int
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
	hub.trimExpiredLocked(buffer, hub.clock().UTC())
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
	events := []TerminalEvent{event}
	truncated := hub.storeEventLocked(terminalSession, event, now)
	events = append(events, truncated...)
	return events
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

func (hub *eventHub) storeEventLocked(
	terminalSession *session,
	event TerminalEvent,
	now time.Time,
) []TerminalEvent {
	buffer := hub.bufferForSessionLocked(event.SessionID)
	droppedBytes, droppedChunks := hub.trimExpiredLocked(buffer, now)
	buffer.events = append(buffer.events, retainedTerminalEvent{emittedAt: now, event: event})
	if event.Type == TerminalEventOutput {
		buffer.outputBytes += event.Payload.ByteCount
	}
	overflowBytes, overflowChunks := hub.trimOverflowLocked(buffer)
	droppedBytes += overflowBytes
	droppedChunks += overflowChunks
	if droppedChunks == 0 {
		return nil
	}
	message := fmt.Sprintf("terminal output buffer truncated; dropped %d chunks", droppedChunks)
	truncated := hub.eventForSessionLocked(
		terminalSession,
		TerminalEventBufferTruncated,
		TerminalEventPayload{
			ByteCount:     droppedBytes,
			DroppedBytes:  droppedBytes,
			DroppedChunks: droppedChunks,
			Status:        terminalSession.status,
			CWD:           terminalSession.cwd,
			Cols:          terminalSession.cols,
			Rows:          terminalSession.rows,
			ExitCode:      terminalSession.exitCode,
			Message:       message,
		},
		now,
	)
	buffer.events = append(buffer.events, retainedTerminalEvent{emittedAt: now, event: truncated})
	return []TerminalEvent{truncated}
}

func (hub *eventHub) bufferForSessionLocked(sessionID string) *terminalSessionEventBuffer {
	buffer := hub.sessionBuffers[sessionID]
	if buffer == nil {
		buffer = &terminalSessionEventBuffer{}
		hub.sessionBuffers[sessionID] = buffer
	}
	return buffer
}

func (hub *eventHub) trimExpiredAllLocked(now time.Time) {
	for sessionID, buffer := range hub.sessionBuffers {
		hub.trimExpiredLocked(buffer, now)
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
	count := 0
	for count < len(buffer.events) && buffer.events[count].emittedAt.Before(cutoff) {
		count += 1
	}
	return hub.dropOldestLocked(buffer, count)
}

func (hub *eventHub) trimOverflowLocked(buffer *terminalSessionEventBuffer) (int, int) {
	droppedBytes := 0
	droppedChunks := 0
	for buffer.outputBytes > hub.outputBufferBytesPerSession || len(buffer.events) > terminalReplayEventLimit {
		bytes, chunks := hub.dropOldestLocked(buffer, 1)
		droppedBytes += bytes
		droppedChunks += chunks
		if len(buffer.events) == 0 {
			break
		}
	}
	return droppedBytes, droppedChunks
}

func (hub *eventHub) dropOldestLocked(buffer *terminalSessionEventBuffer, count int) (int, int) {
	if count <= 0 {
		return 0, 0
	}
	if count > len(buffer.events) {
		count = len(buffer.events)
	}
	droppedBytes := 0
	droppedChunks := 0
	for _, retained := range buffer.events[:count] {
		if retained.event.Type != TerminalEventOutput {
			continue
		}
		droppedBytes += retained.event.Payload.ByteCount
		droppedChunks += 1
		buffer.outputBytes -= retained.event.Payload.ByteCount
	}
	buffer.events = append(buffer.events[:0], buffer.events[count:]...)
	if buffer.outputBytes < 0 {
		buffer.outputBytes = 0
	}
	return droppedBytes, droppedChunks
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
