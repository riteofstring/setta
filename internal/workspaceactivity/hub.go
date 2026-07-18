package workspaceactivity

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	defaultEventBufferSize      = 512
	defaultSubscriberBufferSize = 128
)

type EventHub struct {
	bufferSize       int
	now              func() time.Time
	subscriberBuffer int

	mu           sync.Mutex
	closed       bool
	nextRevision int
	nextSequence int
	retained     []WorkspaceActivityEvent
	streamID     string
	subscribers  map[chan WorkspaceActivityEvent]string
}

type EventHubOption func(*EventHub)

type EventSubscription struct {
	Events <-chan WorkspaceActivityEvent

	hub     *EventHub
	channel chan WorkspaceActivityEvent
}

type EventHubState struct {
	StreamID string
	Sequence int
	Revision int
}

func NewEventHub(streamID string, options ...EventHubOption) (*EventHub, error) {
	if streamID == "" {
		return nil, errors.New("workspace activity stream id is required")
	}
	hub := &EventHub{
		bufferSize:       defaultEventBufferSize,
		now:              time.Now,
		nextRevision:     1,
		nextSequence:     1,
		subscriberBuffer: defaultSubscriberBufferSize,
		streamID:         streamID,
		subscribers:      map[chan WorkspaceActivityEvent]string{},
	}
	for _, option := range options {
		option(hub)
	}
	return hub, nil
}

func WithEventClock(now func() time.Time) EventHubOption {
	return func(hub *EventHub) {
		hub.now = now
	}
}

func WithEventBufferSize(size int) EventHubOption {
	return func(hub *EventHub) {
		hub.bufferSize = size
	}
}

func (hub *EventHub) State() EventHubState {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return EventHubState{
		Revision: hub.nextRevision - 1,
		Sequence: hub.nextSequence - 1,
		StreamID: hub.streamID,
	}
}

func (hub *EventHub) PublishUpsert(record WorkspaceActivityRecord) (WorkspaceActivityEvent, error) {
	if hub == nil {
		return WorkspaceActivityEvent{}, errors.New("workspace activity event hub is required")
	}
	if record.ActivityID == "" {
		return WorkspaceActivityEvent{}, errors.New("workspace activity id is required")
	}
	if record.WorkspaceID == "" {
		return WorkspaceActivityEvent{}, errors.New("workspace activity workspace id is required")
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return WorkspaceActivityEvent{}, errors.New("workspace activity event hub is closed")
	}
	revision := hub.nextRevision
	hub.nextRevision += 1
	record.Revision = revision
	event := hub.nextEventLocked(record.WorkspaceID, revision, EventTypeDelta, &WorkspaceActivityDelta{
		Activity:   &record,
		ActivityID: record.ActivityID,
		Kind:       DeltaKindUpsert,
	}, nil)
	hub.retainLocked(event)
	hub.broadcastLocked(event)
	return event, nil
}

func (hub *EventHub) Subscribe(cursor EventCursor, workspaceID string) (*EventSubscription, error) {
	if hub == nil {
		return nil, errors.New("workspace activity event hub is required")
	}
	if err := validateEventCursor(cursor); err != nil {
		return nil, err
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		channel := make(chan WorkspaceActivityEvent)
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}

	replay := hub.replayAfterLocked(cursor, workspaceID)
	if hub.requiresResyncLocked(cursor) {
		replay = []WorkspaceActivityEvent{hub.resyncRequiredEventLocked(cursor, workspaceID)}
	}

	channel := make(chan WorkspaceActivityEvent, len(replay)+hub.subscriberBuffer)
	for _, event := range replay {
		channel <- event
	}
	hub.subscribers[channel] = workspaceID
	return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
}

func (subscription *EventSubscription) Unsubscribe() {
	if subscription == nil || subscription.hub == nil {
		return
	}
	subscription.hub.mu.Lock()
	defer subscription.hub.mu.Unlock()

	if _, ok := subscription.hub.subscribers[subscription.channel]; !ok {
		return
	}
	delete(subscription.hub.subscribers, subscription.channel)
	close(subscription.channel)
}

func (hub *EventHub) Close() {
	if hub == nil {
		return
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return
	}
	hub.closed = true
	for channel := range hub.subscribers {
		close(channel)
		delete(hub.subscribers, channel)
	}
}

func validateEventCursor(cursor EventCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("workspace activity event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("workspace activity stream id is required for non-zero event sequence")
	}
	return nil
}

func (hub *EventHub) nextEventLocked(workspaceID string, revision int, eventType WorkspaceActivityEventType, delta *WorkspaceActivityDelta, resync *WorkspaceActivityResyncRequired) WorkspaceActivityEvent {
	sequence := hub.nextSequence
	hub.nextSequence += 1
	return WorkspaceActivityEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       fmt.Sprintf("%s:%d", hub.streamID, sequence),
		Type:          eventType,
		EmittedAt:     timestamp(hub.now()),
		WorkspaceID:   workspaceID,
		Revision:      revision,
		Delta:         delta,
		Resync:        resync,
	}
}

func (hub *EventHub) resyncRequiredEventLocked(cursor EventCursor, workspaceID string) WorkspaceActivityEvent {
	currentSequence := hub.nextSequence - 1
	currentRevision := hub.nextRevision - 1
	earliestSequence := 0
	if len(hub.retained) > 0 {
		earliestSequence = hub.retained[0].Sequence
	}
	return hub.nextEventLocked(workspaceID, currentRevision, EventTypeResyncRequired, nil, &WorkspaceActivityResyncRequired{
		CurrentRevision:   currentRevision,
		CurrentSequence:   currentSequence,
		CurrentStreamID:   hub.streamID,
		EarliestSequence:  earliestSequence,
		Reason:            "workspace activity replay is no longer available",
		RequestedSequence: cursor.Sequence,
		RequestedStreamID: cursor.StreamID,
	})
}

func (hub *EventHub) retainLocked(event WorkspaceActivityEvent) {
	if event.Type != EventTypeDelta {
		return
	}
	if hub.bufferSize <= 0 {
		hub.retained = nil
		return
	}
	hub.retained = append(hub.retained, event)
	if len(hub.retained) > hub.bufferSize {
		hub.retained = append([]WorkspaceActivityEvent{}, hub.retained[len(hub.retained)-hub.bufferSize:]...)
	}
}

func (hub *EventHub) replayAfterLocked(cursor EventCursor, workspaceID string) []WorkspaceActivityEvent {
	replay := []WorkspaceActivityEvent{}
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return replay
	}
	for _, event := range hub.retained {
		if event.Sequence > cursor.Sequence && eventMatchesWorkspace(event, workspaceID) {
			replay = append(replay, event)
		}
	}
	return replay
}

func (hub *EventHub) requiresResyncLocked(cursor EventCursor) bool {
	currentSequence := hub.nextSequence - 1
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return true
	}
	if cursor.Sequence == 0 && len(hub.retained) == 0 {
		return false
	}
	if cursor.Sequence > currentSequence {
		return true
	}
	if len(hub.retained) == 0 {
		return cursor.Sequence < currentSequence
	}
	return cursor.Sequence < hub.retained[0].Sequence-1
}

func (hub *EventHub) broadcastLocked(event WorkspaceActivityEvent) {
	for channel, workspaceID := range hub.subscribers {
		if !eventMatchesWorkspace(event, workspaceID) {
			continue
		}
		select {
		case channel <- event:
		default:
			close(channel)
			delete(hub.subscribers, channel)
		}
	}
}

func eventMatchesWorkspace(event WorkspaceActivityEvent, workspaceID string) bool {
	return workspaceID == "" || event.WorkspaceID == workspaceID
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
