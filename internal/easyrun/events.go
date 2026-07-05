package easyrun

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	EasyRunEventStreamID        = "easyrun_events"
	defaultEventBufferSize      = 512
	defaultSubscriberBufferSize = 128
)

type EventDraft struct {
	Type        EasyRunEventType
	WorkspaceID string
	EasyRunID   string

	Run       *EasyRun
	Highlight *EasyHighlight
	Artifact  *EasyArtifact
}

type EventHub struct {
	bufferSize       int
	now              func() time.Time
	subscriberBuffer int

	mu           sync.Mutex
	closed       bool
	nextSequence int
	retained     []EasyRunEvent
	streamID     string
	subscribers  map[chan EasyRunEvent]struct{}
}

type EventHubOption func(*EventHub)

type EventSubscription struct {
	Events <-chan EasyRunEvent

	hub     *EventHub
	channel chan EasyRunEvent
}

func NewEventHub(streamID string, options ...EventHubOption) (*EventHub, error) {
	if streamID == "" {
		return nil, errors.New("easy-run event stream id is required")
	}
	hub := &EventHub{
		bufferSize:       defaultEventBufferSize,
		now:              time.Now,
		nextSequence:     1,
		subscriberBuffer: defaultSubscriberBufferSize,
		streamID:         streamID,
		subscribers:      map[chan EasyRunEvent]struct{}{},
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

func NewRunUpdatedEvent(run EasyRun) EventDraft {
	return EventDraft{
		EasyRunID:   run.ID,
		Run:         &run,
		Type:        EasyRunEventTypeRunUpdated,
		WorkspaceID: run.WorkspaceID,
	}
}

func NewHighlightCreatedEvent(workspaceID string, highlight EasyHighlight) EventDraft {
	return EventDraft{
		EasyRunID:   highlight.EasyRunID,
		Highlight:   &highlight,
		Type:        EasyRunEventTypeHighlightCreated,
		WorkspaceID: workspaceID,
	}
}

func NewArtifactCreatedEvent(workspaceID string, artifact EasyArtifact) EventDraft {
	return EventDraft{
		Artifact:    &artifact,
		EasyRunID:   artifact.EasyRunID,
		Type:        EasyRunEventTypeArtifactCreated,
		WorkspaceID: workspaceID,
	}
}

func (hub *EventHub) Publish(draft EventDraft) (EasyRunEvent, error) {
	if hub == nil {
		return EasyRunEvent{}, errors.New("easy-run event hub is required")
	}
	if err := validateEventDraft(draft); err != nil {
		return EasyRunEvent{}, err
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return EasyRunEvent{}, errors.New("easy-run event hub is closed")
	}
	event := hub.nextEventLocked(draft)
	hub.retainLocked(event)
	hub.broadcastLocked(event)
	return event, nil
}

func (hub *EventHub) Subscribe(cursor EasyRunEventCursor) (*EventSubscription, error) {
	if hub == nil {
		return nil, errors.New("easy-run event hub is required")
	}
	if err := validateEventCursor(cursor); err != nil {
		return nil, err
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		channel := make(chan EasyRunEvent)
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}

	replay := hub.replayAfterLocked(cursor)
	if hub.requiresResyncLocked(cursor) {
		replay = []EasyRunEvent{hub.resyncRequiredEventLocked(cursor)}
	}

	channel := make(chan EasyRunEvent, len(replay)+hub.subscriberBuffer)
	for _, event := range replay {
		channel <- event
	}
	hub.subscribers[channel] = struct{}{}
	return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
}

func (hub *EventHub) Cursor() EasyRunEventCursor {
	if hub == nil {
		return EasyRunEventCursor{}
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return EasyRunEventCursor{
		Sequence: hub.nextSequence - 1,
		StreamID: hub.streamID,
	}
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

func validateEventDraft(draft EventDraft) error {
	if !validValue(draft.Type, easyRunEventTypeValues) || draft.Type == EasyRunEventTypeResyncRequired {
		return fmt.Errorf("unsupported easy-run event type %s", draft.Type)
	}
	if err := validateWorkspaceID(draft.WorkspaceID); err != nil {
		return err
	}
	if err := validateEasyRunID(draft.EasyRunID); err != nil {
		return err
	}
	if err := validateEventPayloadCount(draft); err != nil {
		return err
	}
	return validateEventDraftPayload(draft)
}

func validateEventPayloadCount(draft EventDraft) error {
	populated := 0
	if draft.Run != nil {
		populated++
	}
	if draft.Highlight != nil {
		populated++
	}
	if draft.Artifact != nil {
		populated++
	}
	if populated != 1 {
		return fmt.Errorf("easy-run event %s must populate exactly one payload, found %d", draft.Type, populated)
	}
	return nil
}

func validateEventDraftPayload(draft EventDraft) error {
	switch draft.Type {
	case EasyRunEventTypeRunUpdated:
		return validateRunUpdatedDraft(draft)
	case EasyRunEventTypeHighlightCreated:
		return validateHighlightCreatedDraft(draft)
	case EasyRunEventTypeArtifactCreated:
		return validateArtifactCreatedDraft(draft)
	}
	return nil
}

func validateRunUpdatedDraft(draft EventDraft) error {
	if draft.Run == nil {
		return errors.New("easy-run run.updated event run payload is required")
	}
	if draft.Run.ID != draft.EasyRunID || draft.Run.WorkspaceID != draft.WorkspaceID {
		return errors.New("easy-run run.updated payload ownership does not match event")
	}
	return nil
}

func validateHighlightCreatedDraft(draft EventDraft) error {
	if draft.Highlight == nil {
		return errors.New("easy-run highlight.created event highlight payload is required")
	}
	if draft.Highlight.EasyRunID != draft.EasyRunID {
		return errors.New("easy-run highlight.created payload ownership does not match event")
	}
	return nil
}

func validateArtifactCreatedDraft(draft EventDraft) error {
	if draft.Artifact == nil {
		return errors.New("easy-run artifact.created event artifact payload is required")
	}
	if draft.Artifact.EasyRunID != draft.EasyRunID {
		return errors.New("easy-run artifact.created payload ownership does not match event")
	}
	return nil
}

func (hub *EventHub) nextEventLocked(draft EventDraft) EasyRunEvent {
	sequence := hub.nextSequence
	hub.nextSequence += 1
	event := EasyRunEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      sequence,
		EventID:       eventID(hub.streamID, sequence),
		Type:          draft.Type,
		EmittedAt:     timestamp(hub.now()),
		WorkspaceID:   draft.WorkspaceID,
		EasyRunID:     draft.EasyRunID,
	}
	switch draft.Type {
	case EasyRunEventTypeRunUpdated:
		event.RunUpdated = &EasyRunUpdatedPayload{Run: *draft.Run}
	case EasyRunEventTypeHighlightCreated:
		event.HighlightCreated = &EasyHighlightCreatedPayload{Highlight: *draft.Highlight}
	case EasyRunEventTypeArtifactCreated:
		event.ArtifactCreated = &EasyArtifactCreatedPayload{Artifact: *draft.Artifact}
	}
	return event
}

func (hub *EventHub) retainLocked(event EasyRunEvent) {
	if hub.bufferSize <= 0 {
		hub.retained = nil
		return
	}
	hub.retained = append(hub.retained, event)
	if len(hub.retained) > hub.bufferSize {
		hub.retained = append([]EasyRunEvent{}, hub.retained[len(hub.retained)-hub.bufferSize:]...)
	}
}

func (hub *EventHub) broadcastLocked(event EasyRunEvent) {
	for channel := range hub.subscribers {
		select {
		case channel <- event:
		default:
			close(channel)
			delete(hub.subscribers, channel)
		}
	}
}

func (hub *EventHub) replayAfterLocked(cursor EasyRunEventCursor) []EasyRunEvent {
	replay := []EasyRunEvent{}
	if cursor.StreamID != "" && cursor.StreamID != hub.streamID {
		return replay
	}
	for _, event := range hub.retained {
		if event.Sequence > cursor.Sequence {
			replay = append(replay, event)
		}
	}
	return replay
}

func (hub *EventHub) requiresResyncLocked(cursor EasyRunEventCursor) bool {
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

func (hub *EventHub) resyncRequiredEventLocked(cursor EasyRunEventCursor) EasyRunEvent {
	earliestSequence := 0
	if len(hub.retained) > 0 {
		earliestSequence = hub.retained[0].Sequence
	}
	currentSequence := hub.nextSequence - 1
	return EasyRunEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      currentSequence,
		EventID:       eventID(hub.streamID, currentSequence),
		Type:          EasyRunEventTypeResyncRequired,
		EmittedAt:     timestamp(hub.now()),
		ResyncRequired: &EasyRunResyncRequired{
			CurrentSequence:   currentSequence,
			CurrentStreamID:   hub.streamID,
			EarliestSequence:  earliestSequence,
			Reason:            "event replay is no longer available",
			RequestedSequence: cursor.Sequence,
			RequestedStreamID: cursor.StreamID,
		},
	}
}

func eventID(streamID string, sequence int) string {
	return fmt.Sprintf("%s:%d", streamID, sequence)
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
