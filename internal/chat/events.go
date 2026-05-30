package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"sync"
	"time"
)

const (
	EventSchemaVersion = 1

	EventTypeMessageCreated      = "chat.message.created"
	EventTypeAssistantTextDelta  = "chat.assistant_text_delta"
	EventTypeMessageUpdated      = "chat.message.updated"
	EventTypeRunUpdated          = "chat.run.updated"
	EventTypeConversationUpdated = "chat.conversation.updated"
	EventTypeResyncRequired      = "chat.resync_required"
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
	Sequence       int             `json:"sequence"`
	EventID        string          `json:"eventId"`
	Type           string          `json:"type"`
	EmittedAt      string          `json:"emittedAt"`
	WorkspaceID    string          `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	RunID          string          `json:"runId"`
	Payload        json.RawMessage `json:"payload"`
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

type ConversationUpdatedPayload struct {
	Item ConversationListItem `json:"item"`
}

type ResyncRequiredPayload struct {
	Reason            string `json:"reason"`
	RequestedSequence int    `json:"requestedSequence"`
	EarliestSequence  int    `json:"earliestSequence"`
	CurrentSequence   int    `json:"currentSequence"`
}

type EventHub struct {
	bufferSize       int
	newID            func(int) string
	now              func() time.Time
	subscriberBuffer int

	mu           sync.Mutex
	closed       bool
	nextSequence int
	retained     []Event
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
			{Name: "ChatAssistantTextDeltaEvent", Type: EventTypeAssistantTextDelta, Payload: reflect.TypeFor[AssistantTextDeltaPayload]()},
			{Name: "ChatMessageUpdatedEvent", Type: EventTypeMessageUpdated, Payload: reflect.TypeFor[MessageUpdatedPayload]()},
			{Name: "ChatRunUpdatedEvent", Type: EventTypeRunUpdated, Payload: reflect.TypeFor[RunUpdatedPayload]()},
			{Name: "ChatConversationUpdatedEvent", Type: EventTypeConversationUpdated, Payload: reflect.TypeFor[ConversationUpdatedPayload]()},
			{Name: "ChatResyncRequiredEvent", Type: EventTypeResyncRequired, Payload: reflect.TypeFor[ResyncRequiredPayload]()},
		},
	}
}

func NewEventHub(options ...EventHubOption) *EventHub {
	hub := &EventHub{
		bufferSize:       defaultEventBufferSize,
		newID:            strconv.Itoa,
		now:              time.Now,
		nextSequence:     1,
		subscriberBuffer: defaultSubscriberBufferSize,
		subscribers:      map[chan Event]struct{}{},
	}
	for _, option := range options {
		option(hub)
	}
	return hub
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

func WithEventIDGenerator(newID func(int) string) EventHubOption {
	return func(hub *EventHub) {
		hub.newID = newID
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

func NewConversationUpdatedEvent(workspaceID string, conversationID string, runID string, item ConversationListItem) EventDraft {
	return EventDraft{
		ConversationID: conversationID,
		Payload:        ConversationUpdatedPayload{Item: item},
		RunID:          runID,
		Type:           EventTypeConversationUpdated,
		WorkspaceID:    workspaceID,
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

func (hub *EventHub) Subscribe(afterSequence int) (*EventSubscription, error) {
	if hub == nil {
		return nil, errors.New("event hub is required")
	}
	if afterSequence < 0 {
		return nil, fmt.Errorf("event sequence must be non-negative: %d", afterSequence)
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		channel := make(chan Event)
		close(channel)
		return &EventSubscription{Events: channel, hub: hub, channel: channel}, nil
	}

	replay := hub.replayAfterLocked(afterSequence)
	if hub.requiresResyncLocked(afterSequence) {
		event, err := hub.resyncRequiredEventLocked(afterSequence)
		if err != nil {
			return nil, err
		}
		hub.retainLocked(event)
		hub.broadcastLocked(event)
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
		Sequence:       sequence,
		EventID:        hub.newID(sequence),
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

func (hub *EventHub) replayAfterLocked(afterSequence int) []Event {
	replay := []Event{}
	for _, event := range hub.retained {
		if event.Sequence > afterSequence {
			replay = append(replay, event)
		}
	}
	return replay
}

func (hub *EventHub) requiresResyncLocked(afterSequence int) bool {
	currentSequence := hub.nextSequence - 1
	if afterSequence == 0 && len(hub.retained) == 0 {
		return false
	}
	if afterSequence > currentSequence {
		return true
	}
	if len(hub.retained) == 0 {
		return afterSequence < currentSequence
	}
	return afterSequence < hub.retained[0].Sequence-1
}

func (hub *EventHub) resyncRequiredEventLocked(requestedSequence int) (Event, error) {
	earliestSequence := 0
	if len(hub.retained) > 0 {
		earliestSequence = hub.retained[0].Sequence
	}
	currentSequence := hub.nextSequence - 1
	payload, err := json.Marshal(ResyncRequiredPayload{
		Reason:            "event replay is no longer available",
		RequestedSequence: requestedSequence,
		EarliestSequence:  earliestSequence,
		CurrentSequence:   currentSequence,
	})
	if err != nil {
		return Event{}, fmt.Errorf("marshal resync required payload: %w", err)
	}
	return hub.nextEventLocked(EventDraft{
		Payload: ResyncRequiredPayload{},
		Type:    EventTypeResyncRequired,
	}, payload), nil
}
