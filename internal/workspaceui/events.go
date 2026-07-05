package workspaceui

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	EventSchemaVersion          = 1
	defaultEventBufferSize      = 512
	defaultSubscriberBufferSize = 128
)

type WorkspaceUIEventType string

const (
	WorkspaceUIEventTypeLayoutUpdated  WorkspaceUIEventType = "workspace_ui.layout_updated"
	WorkspaceUIEventTypeResyncRequired WorkspaceUIEventType = "workspace_ui.resync_required"
)

type EventCursor struct {
	StreamID string
	Sequence int
}

type WorkspaceUIEvent struct {
	SchemaVersion int                        `json:"schemaVersion"`
	StreamID      string                     `json:"streamId"`
	Sequence      int                        `json:"sequence"`
	EventID       string                     `json:"eventId"`
	Type          WorkspaceUIEventType       `json:"type"`
	EmittedAt     string                     `json:"emittedAt"`
	WorkspaceID   string                     `json:"workspaceId"`
	Revision      int                        `json:"revision"`
	Layout        *WorkspaceUILayout         `json:"layout"`
	Resync        *WorkspaceUIResyncRequired `json:"resync"`
}

type WorkspaceUIResyncRequired struct {
	CurrentRevision   int    `json:"currentRevision"`
	CurrentSequence   int    `json:"currentSequence"`
	CurrentStreamID   string `json:"currentStreamId"`
	EarliestSequence  int    `json:"earliestSequence"`
	Reason            string `json:"reason"`
	RequestedSequence int    `json:"requestedSequence"`
	RequestedStreamID string `json:"requestedStreamId"`
}

type EventHub struct {
	bufferSize       int
	now              func() time.Time
	subscriberBuffer int

	mu                         sync.Mutex
	closed                     bool
	currentRevisionByWorkspace map[string]int
	currentSequenceByWorkspace map[string]int
	evictedSequenceByWorkspace map[string]int
	nextSequence               int
	retained                   []WorkspaceUIEvent
	streamID                   string
	subscribers                map[chan WorkspaceUIEvent]string
}

type EventHubOption func(*EventHub)

type EventSubscription struct {
	Events <-chan WorkspaceUIEvent

	hub     *EventHub
	channel chan WorkspaceUIEvent
}

func NewEventHub(streamID string, options ...EventHubOption) (*EventHub, error) {
	if streamID == "" {
		return nil, errors.New("workspace UI stream id is required")
	}
	hub := &EventHub{
		bufferSize:                 defaultEventBufferSize,
		currentRevisionByWorkspace: map[string]int{},
		currentSequenceByWorkspace: map[string]int{},
		evictedSequenceByWorkspace: map[string]int{},
		nextSequence:               1,
		now:                        time.Now,
		streamID:                   streamID,
		subscriberBuffer:           defaultSubscriberBufferSize,
		subscribers:                map[chan WorkspaceUIEvent]string{},
	}
	for _, option := range options {
		option(hub)
	}
	if hub.now == nil {
		return nil, errors.New("workspace UI event clock is required")
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

func (hub *EventHub) PublishLayout(layout WorkspaceUILayout) (WorkspaceUIEvent, error) {
	if hub == nil {
		return WorkspaceUIEvent{}, errors.New("workspace UI event hub is required")
	}
	if layout.WorkspaceID == "" {
		return WorkspaceUIEvent{}, errors.New("workspace UI event workspace id is required")
	}
	if layout.Revision <= 0 {
		return WorkspaceUIEvent{}, fmt.Errorf("workspace UI event revision must be positive: %d", layout.Revision)
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return WorkspaceUIEvent{}, errors.New("workspace UI event hub is closed")
	}
	event := hub.nextLayoutEventLocked(layout)
	hub.currentRevisionByWorkspace[layout.WorkspaceID] = layout.Revision
	hub.currentSequenceByWorkspace[layout.WorkspaceID] = event.Sequence
	hub.retainLocked(event)
	hub.broadcastLocked(event)
	return cloneWorkspaceUIEvent(event), nil
}

func (hub *EventHub) Subscribe(cursor EventCursor, workspaceID string) (*EventSubscription, error) {
	if hub == nil {
		return nil, errors.New("workspace UI event hub is required")
	}
	if workspaceID == "" {
		return nil, errors.New("workspace UI event workspace id is required")
	}
	if err := validateEventCursor(cursor); err != nil {
		return nil, err
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		channel := make(chan WorkspaceUIEvent)
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}

	replay := hub.replayAfterLocked(cursor, workspaceID)
	if hub.requiresResyncLocked(cursor, workspaceID) {
		replay = []WorkspaceUIEvent{hub.resyncRequiredEventLocked(cursor, workspaceID)}
	}

	channel := make(chan WorkspaceUIEvent, len(replay)+hub.subscriberBuffer)
	for _, event := range replay {
		channel <- cloneWorkspaceUIEvent(event)
	}
	hub.subscribers[channel] = workspaceID
	return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
}

func (hub *EventHub) recordWorkspaceRevision(workspaceID string, revision int) error {
	if hub == nil {
		return errors.New("workspace UI event hub is required")
	}
	if workspaceID == "" {
		return errors.New("workspace UI event workspace id is required")
	}
	if revision <= 0 {
		return fmt.Errorf("workspace UI event revision must be positive: %d", revision)
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed || revision <= hub.currentRevisionByWorkspace[workspaceID] {
		return nil
	}
	hub.currentRevisionByWorkspace[workspaceID] = revision
	return nil
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
		return fmt.Errorf("workspace UI event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("workspace UI stream id is required for non-zero event sequence")
	}
	return nil
}

func (hub *EventHub) nextLayoutEventLocked(layout WorkspaceUILayout) WorkspaceUIEvent {
	nextLayout := cloneWorkspaceUILayout(layout)
	sequence := hub.nextSequence
	hub.nextSequence += 1
	return WorkspaceUIEvent{
		SchemaVersion: EventSchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       fmt.Sprintf("%s:%d", hub.streamID, sequence),
		Type:          WorkspaceUIEventTypeLayoutUpdated,
		EmittedAt:     timestamp(hub.now()),
		WorkspaceID:   layout.WorkspaceID,
		Revision:      layout.Revision,
		Layout:        &nextLayout,
		Resync:        nil,
	}
}

func (hub *EventHub) resyncRequiredEventLocked(cursor EventCursor, workspaceID string) WorkspaceUIEvent {
	currentSequence := hub.nextSequence - 1
	currentRevision := hub.currentRevisionByWorkspace[workspaceID]
	earliestSequence := hub.earliestRetainedSequenceLocked(workspaceID)
	sequence := hub.nextSequence
	hub.nextSequence += 1
	return WorkspaceUIEvent{
		SchemaVersion: EventSchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       fmt.Sprintf("%s:%d", hub.streamID, sequence),
		Type:          WorkspaceUIEventTypeResyncRequired,
		EmittedAt:     timestamp(hub.now()),
		WorkspaceID:   workspaceID,
		Revision:      currentRevision,
		Layout:        nil,
		Resync: &WorkspaceUIResyncRequired{
			CurrentRevision:   currentRevision,
			CurrentSequence:   currentSequence,
			CurrentStreamID:   hub.streamID,
			EarliestSequence:  earliestSequence,
			Reason:            "workspace UI layout replay is no longer available",
			RequestedSequence: cursor.Sequence,
			RequestedStreamID: cursor.StreamID,
		},
	}
}

func (hub *EventHub) retainLocked(event WorkspaceUIEvent) {
	if event.Type != WorkspaceUIEventTypeLayoutUpdated {
		return
	}
	if hub.bufferSize <= 0 {
		hub.evictedSequenceByWorkspace[event.WorkspaceID] = event.Sequence
		hub.retained = nil
		return
	}
	hub.retained = append(hub.retained, cloneWorkspaceUIEvent(event))
	if len(hub.retained) > hub.bufferSize {
		removeCount := len(hub.retained) - hub.bufferSize
		for _, removed := range hub.retained[:removeCount] {
			hub.evictedSequenceByWorkspace[removed.WorkspaceID] = removed.Sequence
		}
		hub.retained = append([]WorkspaceUIEvent{}, hub.retained[removeCount:]...)
	}
}

func (hub *EventHub) replayAfterLocked(cursor EventCursor, workspaceID string) []WorkspaceUIEvent {
	replay := []WorkspaceUIEvent{}
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return replay
	}
	for _, event := range hub.retained {
		if event.Sequence > cursor.Sequence && event.WorkspaceID == workspaceID {
			replay = append(replay, cloneWorkspaceUIEvent(event))
		}
	}
	return replay
}

func (hub *EventHub) earliestRetainedSequenceLocked(workspaceID string) int {
	for _, event := range hub.retained {
		if event.WorkspaceID == workspaceID {
			return event.Sequence
		}
	}
	return 0
}

func (hub *EventHub) requiresResyncLocked(cursor EventCursor, workspaceID string) bool {
	currentSequence := hub.nextSequence - 1
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return true
	}
	if cursor.Sequence > currentSequence {
		return true
	}
	currentWorkspaceSequence := hub.currentSequenceByWorkspace[workspaceID]
	if currentWorkspaceSequence == 0 || cursor.Sequence >= currentWorkspaceSequence {
		return false
	}
	return cursor.Sequence < hub.evictedSequenceByWorkspace[workspaceID]
}

func (hub *EventHub) broadcastLocked(event WorkspaceUIEvent) {
	for channel, workspaceID := range hub.subscribers {
		if event.WorkspaceID != workspaceID {
			continue
		}
		select {
		case channel <- cloneWorkspaceUIEvent(event):
		default:
			close(channel)
			delete(hub.subscribers, channel)
		}
	}
}

func cloneWorkspaceUIEvent(event WorkspaceUIEvent) WorkspaceUIEvent {
	cloned := event
	if event.Layout != nil {
		layout := cloneWorkspaceUILayout(*event.Layout)
		cloned.Layout = &layout
	}
	if event.Resync != nil {
		resync := *event.Resync
		cloned.Resync = &resync
	}
	return cloned
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
