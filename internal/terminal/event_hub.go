package terminal

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const terminalSubscriberBuffer = 4096

type EventSubscription struct {
	Events chan TerminalEvent
	hub    *eventHub
	id     int
	once   sync.Once
}

type eventHub struct {
	clock       func() time.Time
	closed      bool
	mu          sync.Mutex
	nextID      int
	sequence    int
	streamID    string
	subscribers map[int]chan TerminalEvent
}

func newEventHub(clock func() time.Time) (*eventHub, error) {
	streamID, err := newSessionID()
	if err != nil {
		return nil, err
	}
	return &eventHub{
		clock:       clock,
		streamID:    streamID,
		subscribers: map[int]chan TerminalEvent{},
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
	hub.nextID += 1
	events := make(chan TerminalEvent, terminalSubscriberBuffer)
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

func (hub *eventHub) eventForSession(
	terminalSession *session,
	eventType TerminalEventType,
	payload TerminalEventPayload,
) TerminalEvent {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.sequence += 1
	sequence := hub.sequence
	eventID := fmt.Sprintf("%s:%d", hub.streamID, sequence)
	return TerminalEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       eventID,
		Type:          eventType,
		EmittedAt:     hub.clock().UTC().Format(time.RFC3339Nano),
		WorkspaceID:   terminalSession.workspaceID,
		PaneID:        terminalSession.paneID,
		SessionID:     terminalSession.id,
		Payload:       payload,
	}
}

func (hub *eventHub) publish(event TerminalEvent) {
	hub.mu.Lock()
	subscribers := make([]chan TerminalEvent, 0, len(hub.subscribers))
	for _, events := range hub.subscribers {
		subscribers = append(subscribers, events)
	}
	hub.mu.Unlock()
	for _, events := range subscribers {
		select {
		case events <- event:
		default:
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
