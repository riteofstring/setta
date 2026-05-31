package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"time"
)

const (
	EventSchemaVersion = 1

	EventTypeMessageCreated      = "chat.message.created"
	EventTypeMessageQueued       = "chat.message.queued"
	EventTypeMessageSteeringSent = "chat.message.steering_sent"
	EventTypeAssistantTextDelta  = "chat.assistant_text_delta"
	EventTypeMessageUpdated      = "chat.message.updated"
	EventTypeRunUpdated          = "chat.run.updated"
	EventTypeRunItemCreated      = "chat.run_item.created"
	EventTypeRunItemUpdated      = "chat.run_item.updated"
	EventTypeRunItemOutputDelta  = "chat.run_item_output.delta"
	EventTypeQueueUpdated        = "chat.queue.updated"
	EventTypeConversationUpdated = "chat.conversation.updated"
	EventTypeResyncRequired      = "chat.resync_required"
	EventTypeDiagnosticCreated   = "diagnostic.created"
	EventTypeCodexAccountChanged = "codex.account.changed"
)

const (
	defaultEventBufferSize      = 512
	defaultSubscriberBufferSize = 128
)

type EventContractSchema struct {
	Events []EventContract
}

type EventContract struct {
	Name    string
	Type    string
	Payload reflect.Type
}

type Event struct {
	SchemaVersion  int             `json:"schemaVersion"`
	StreamID       string          `json:"streamId"`
	Sequence       int             `json:"sequence"`
	EventID        string          `json:"eventId"`
	Type           string          `json:"type"`
	EmittedAt      string          `json:"emittedAt"`
	WorkspaceID    string          `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	RunID          string          `json:"runId"`
	Payload        json.RawMessage `json:"payload"`
}

type EventCursor struct {
	StreamID string
	Sequence int
}

type EventDraft struct {
	Type           string
	WorkspaceID    string
	ConversationID string
	RunID          string
	Payload        any
}

type MessageCreatedPayload struct {
	Message ChatMessage `json:"message"`
}

type MessageQueuedPayload struct {
	Message ChatMessage `json:"message"`
	Run     Run         `json:"run"`
}

type MessageSteeringSentPayload struct {
	Message ChatMessage `json:"message"`
	Run     Run         `json:"run"`
}

type AssistantTextDeltaPayload struct {
	MessageID string `json:"messageId"`
	PartID    string `json:"partId"`
	Delta     string `json:"delta"`
	UpdatedAt string `json:"updatedAt"`
}

type MessageUpdatedPayload struct {
	Message ChatMessage `json:"message"`
}

type RunUpdatedPayload struct {
	Run Run `json:"run"`
}

type RunItemCreatedPayload struct {
	Item RunItem `json:"item"`
}

type RunItemUpdatedPayload struct {
	Item RunItem `json:"item"`
}

type RunItemOutputDeltaPayload struct {
	Output RunItemOutput `json:"output"`
}

type QueueUpdatedPayload struct {
	Queue QueueState `json:"queue"`
}

type ConversationUpdatedPayload struct {
	Item ConversationListItem `json:"item"`
}

type ResyncRequiredPayload struct {
	Reason            string `json:"reason"`
	RequestedStreamID string `json:"requestedStreamId"`
	RequestedSequence int    `json:"requestedSequence"`
	CurrentStreamID   string `json:"currentStreamId"`
	CurrentSequence   int    `json:"currentSequence"`
	EarliestSequence  int    `json:"earliestSequence"`
}

type DiagnosticCreatedPayload struct {
	Diagnostic Diagnostic `json:"diagnostic"`
}

type CodexAccountChangedPayload struct {
	Reason string `json:"reason"`
}

type EventHub struct {
	bufferSize       int
	now              func() time.Time
	subscriberBuffer int

	mu           sync.Mutex
	closed       bool
	nextSequence int
	retained     []Event
	streamID     string
	subscribers  map[chan Event]struct{}
}

type EventHubOption func(*EventHub)

type EventSubscription struct {
	Events <-chan Event

	hub     *EventHub
	channel chan Event
}

func EventContracts() EventContractSchema {
	return EventContractSchema{
		Events: []EventContract{
			{Name: "ChatMessageCreatedEvent", Type: EventTypeMessageCreated, Payload: reflect.TypeFor[MessageCreatedPayload]()},
			{Name: "ChatMessageQueuedEvent", Type: EventTypeMessageQueued, Payload: reflect.TypeFor[MessageQueuedPayload]()},
			{Name: "ChatMessageSteeringSentEvent", Type: EventTypeMessageSteeringSent, Payload: reflect.TypeFor[MessageSteeringSentPayload]()},
			{Name: "ChatAssistantTextDeltaEvent", Type: EventTypeAssistantTextDelta, Payload: reflect.TypeFor[AssistantTextDeltaPayload]()},
			{Name: "ChatMessageUpdatedEvent", Type: EventTypeMessageUpdated, Payload: reflect.TypeFor[MessageUpdatedPayload]()},
			{Name: "ChatRunUpdatedEvent", Type: EventTypeRunUpdated, Payload: reflect.TypeFor[RunUpdatedPayload]()},
			{Name: "ChatRunItemCreatedEvent", Type: EventTypeRunItemCreated, Payload: reflect.TypeFor[RunItemCreatedPayload]()},
			{Name: "ChatRunItemUpdatedEvent", Type: EventTypeRunItemUpdated, Payload: reflect.TypeFor[RunItemUpdatedPayload]()},
			{Name: "ChatRunItemOutputDeltaEvent", Type: EventTypeRunItemOutputDelta, Payload: reflect.TypeFor[RunItemOutputDeltaPayload]()},
			{Name: "ChatQueueUpdatedEvent", Type: EventTypeQueueUpdated, Payload: reflect.TypeFor[QueueUpdatedPayload]()},
			{Name: "ChatConversationUpdatedEvent", Type: EventTypeConversationUpdated, Payload: reflect.TypeFor[ConversationUpdatedPayload]()},
			{Name: "ChatResyncRequiredEvent", Type: EventTypeResyncRequired, Payload: reflect.TypeFor[ResyncRequiredPayload]()},
			{Name: "DiagnosticCreatedEvent", Type: EventTypeDiagnosticCreated, Payload: reflect.TypeFor[DiagnosticCreatedPayload]()},
			{Name: "CodexAccountChangedEvent", Type: EventTypeCodexAccountChanged, Payload: reflect.TypeFor[CodexAccountChangedPayload]()},
		},
	}
}

func NewEventHub(streamID string, options ...EventHubOption) (*EventHub, error) {
	if streamID == "" {
		return nil, errors.New("event stream id is required")
	}
	hub := &EventHub{
		bufferSize:       defaultEventBufferSize,
		now:              time.Now,
		nextSequence:     1,
		subscriberBuffer: defaultSubscriberBufferSize,
		streamID:         streamID,
		subscribers:      map[chan Event]struct{}{},
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

func NewMessageCreatedEvent(workspaceID string, conversationID string, runID string, message ChatMessage) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        MessageCreatedPayload{Message: message},
		RunID:          runID,
		Type:           EventTypeMessageCreated,
		WorkspaceID:    workspaceID,
	}
}

func NewCodexAccountChangedEvent(reason string) EventDraft {
	return EventDraft{
		Payload: CodexAccountChangedPayload{Reason: reason},
		Type:    EventTypeCodexAccountChanged,
	}
}

func NewMessageQueuedEvent(workspaceID string, conversationID string, runID string, message ChatMessage, run Run) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        MessageQueuedPayload{Message: message, Run: run},
		RunID:          runID,
		Type:           EventTypeMessageQueued,
		WorkspaceID:    workspaceID,
	}
}

func NewMessageSteeringSentEvent(workspaceID string, conversationID string, runID string, message ChatMessage, run Run) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        MessageSteeringSentPayload{Message: message, Run: run},
		RunID:          runID,
		Type:           EventTypeMessageSteeringSent,
		WorkspaceID:    workspaceID,
	}
}

func NewAssistantTextDeltaEvent(workspaceID string, conversationID string, runID string, messageID string, partID string, delta string, updatedAt string) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload: AssistantTextDeltaPayload{
			Delta:     delta,
			MessageID: messageID,
			PartID:    partID,
			UpdatedAt: updatedAt,
		},
		RunID:       runID,
		Type:        EventTypeAssistantTextDelta,
		WorkspaceID: workspaceID,
	}
}

func NewMessageUpdatedEvent(workspaceID string, conversationID string, runID string, message ChatMessage) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        MessageUpdatedPayload{Message: message},
		RunID:          runID,
		Type:           EventTypeMessageUpdated,
		WorkspaceID:    workspaceID,
	}
}

func NewRunUpdatedEvent(run Run) EventDraft {
	return EventDraft{
		ConversationID: run.ConversationID,
		Payload:        RunUpdatedPayload{Run: run},
		RunID:          run.ID,
		Type:           EventTypeRunUpdated,
		WorkspaceID:    run.WorkspaceID,
	}
}

func NewRunItemCreatedEvent(item RunItem) EventDraft {
	return EventDraft{
		ConversationID: item.ConversationID,
		Payload:        RunItemCreatedPayload{Item: item},
		RunID:          item.RunID,
		Type:           EventTypeRunItemCreated,
		WorkspaceID:    item.WorkspaceID,
	}
}

func NewRunItemUpdatedEvent(item RunItem) EventDraft {
	return EventDraft{
		ConversationID: item.ConversationID,
		Payload:        RunItemUpdatedPayload{Item: item},
		RunID:          item.RunID,
		Type:           EventTypeRunItemUpdated,
		WorkspaceID:    item.WorkspaceID,
	}
}

func NewRunItemOutputDeltaEvent(workspaceID string, conversationID string, runID string, output RunItemOutput) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        RunItemOutputDeltaPayload{Output: output},
		RunID:          runID,
		Type:           EventTypeRunItemOutputDelta,
		WorkspaceID:    workspaceID,
	}
}

func NewQueueUpdatedEvent(workspaceID string, conversationID string, runID string, queue QueueState) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        QueueUpdatedPayload{Queue: queue},
		RunID:          runID,
		Type:           EventTypeQueueUpdated,
		WorkspaceID:    workspaceID,
	}
}

func NewConversationUpdatedEvent(workspaceID string, conversationID string, runID string, item ConversationListItem) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        ConversationUpdatedPayload{Item: item},
		RunID:          runID,
		Type:           EventTypeConversationUpdated,
		WorkspaceID:    workspaceID,
	}
}

func NewDiagnosticCreatedEvent(diagnostic Diagnostic) EventDraft {
	return EventDraft{
		ConversationID: diagnostic.ConversationID,
		Payload:        DiagnosticCreatedPayload{Diagnostic: diagnostic},
		RunID:          diagnostic.RunID,
		Type:           EventTypeDiagnosticCreated,
		WorkspaceID:    diagnostic.WorkspaceID,
	}
}

func (hub *EventHub) Publish(draft EventDraft) (Event, error) {
	if hub == nil {
		return Event{}, errors.New("event hub is required")
	}
	if err := validateEventDraft(draft); err != nil {
		return Event{}, err
	}
	payload, err := json.Marshal(draft.Payload)
	if err != nil {
		return Event{}, fmt.Errorf("marshal %s payload: %w", draft.Type, err)
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return Event{}, errors.New("event hub is closed")
	}
	event := hub.nextEventLocked(draft, payload)
	hub.retainLocked(event)
	hub.broadcastLocked(event)
	return event, nil
}

func (hub *EventHub) Subscribe(cursor EventCursor) (*EventSubscription, error) {
	if hub == nil {
		return nil, errors.New("event hub is required")
	}
	if cursor.Sequence < 0 {
		return nil, fmt.Errorf("event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return nil, errors.New("event stream id is required for non-zero event sequence")
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		channel := make(chan Event)
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}

	replay := hub.replayAfterLocked(cursor)
	if hub.requiresResyncLocked(cursor) {
		event, err := hub.resyncRequiredEventLocked(cursor)
		if err != nil {
			return nil, err
		}
		replay = []Event{event}
	}

	bufferSize := len(replay) + hub.subscriberBuffer
	channel := make(chan Event, bufferSize)
	for _, event := range replay {
		channel <- event
	}
	hub.subscribers[channel] = struct{}{}
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

func validateEventDraft(draft EventDraft) error {
	expected, ok := eventPayloadTypes()[draft.Type]
	if !ok {
		return fmt.Errorf("unsupported chat event type %s", draft.Type)
	}
	if draft.Payload == nil {
		return fmt.Errorf("%s payload is required", draft.Type)
	}
	actual := reflect.TypeOf(draft.Payload)
	if actual != expected {
		return fmt.Errorf("%s payload type = %s, want %s", draft.Type, actual, expected)
	}
	return nil
}

func eventPayloadTypes() map[string]reflect.Type {
	contracts := EventContracts()
	payloads := make(map[string]reflect.Type, len(contracts.Events))
	for _, contract := range contracts.Events {
		payloads[contract.Type] = contract.Payload
	}
	return payloads
}

func (hub *EventHub) nextEventLocked(draft EventDraft, payload []byte) Event {
	sequence := hub.nextSequence
	hub.nextSequence += 1
	return Event{
		SchemaVersion:  EventSchemaVersion,
		StreamID:       hub.streamID,
		Sequence:       sequence,
		EventID:        eventID(hub.streamID, sequence),
		Type:           draft.Type,
		EmittedAt:      timestamp(hub.now()),
		WorkspaceID:    draft.WorkspaceID,
		ConversationID: draft.ConversationID,
		RunID:          draft.RunID,
		Payload:        append(json.RawMessage{}, payload...),
	}
}

func (hub *EventHub) retainLocked(event Event) {
	if hub.bufferSize <= 0 {
		hub.retained = nil
		return
	}
	hub.retained = append(hub.retained, event)
	if len(hub.retained) > hub.bufferSize {
		hub.retained = append([]Event{}, hub.retained[len(hub.retained)-hub.bufferSize:]...)
	}
}

func (hub *EventHub) broadcastLocked(event Event) {
	for channel := range hub.subscribers {
		select {
		case channel <- event:
		default:
			close(channel)
			delete(hub.subscribers, channel)
		}
	}
}

func (hub *EventHub) replayAfterLocked(cursor EventCursor) []Event {
	replay := []Event{}
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

func (hub *EventHub) resyncRequiredEventLocked(cursor EventCursor) (Event, error) {
	earliestSequence := 0
	if len(hub.retained) > 0 {
		earliestSequence = hub.retained[0].Sequence
	}
	currentSequence := hub.nextSequence - 1
	payload, err := json.Marshal(ResyncRequiredPayload{
		CurrentStreamID:   hub.streamID,
		CurrentSequence:   currentSequence,
		Reason:            "event replay is no longer available",
		RequestedStreamID: cursor.StreamID,
		RequestedSequence: cursor.Sequence,
		EarliestSequence:  earliestSequence,
	})
	if err != nil {
		return Event{}, fmt.Errorf("marshal resync required payload: %w", err)
	}
	return Event{
		SchemaVersion: EventSchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      currentSequence,
		EventID:       eventID(hub.streamID, currentSequence),
		Type:          EventTypeResyncRequired,
		EmittedAt:     timestamp(hub.now()),
		Payload:       append(json.RawMessage{}, payload...),
	}, nil
}

func eventID(streamID string, sequence int) string {
	return fmt.Sprintf("%s:%d", streamID, sequence)
}
