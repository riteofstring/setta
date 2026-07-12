package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

const conversationSubscriptionBuffer = 64

type storeConversationEventSubscription struct {
	cancel context.CancelFunc
	events chan ConversationEvent
	once   sync.Once
}

func (subscription *storeConversationEventSubscription) Events() <-chan ConversationEvent {
	return subscription.events
}

func (subscription *storeConversationEventSubscription) Unsubscribe() {
	if subscription == nil {
		return
	}
	subscription.once.Do(subscription.cancel)
}

func (store *Store) SubscribeEvents(
	cursor ConversationEventCursor,
	workspaceID string,
	conversationID string,
) (ConversationEventSubscription, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if err := cursor.Validate(conversationID); err != nil {
		return nil, err
	}
	snapshot, err := store.ReadSnapshot(context.Background(), workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	subscription := &storeConversationEventSubscription{
		cancel: cancel,
		events: make(chan ConversationEvent, conversationSubscriptionBuffer),
	}
	go store.runConversationEventSubscription(ctx, subscription.events, cursor, snapshot)
	return subscription, nil
}

func (store *Store) runConversationEventSubscription(
	ctx context.Context,
	output chan<- ConversationEvent,
	cursor ConversationEventCursor,
	snapshot ConversationSnapshot,
) {
	defer close(output)
	var ready bool
	cursor, ready = normalizeConversationEventCursor(ctx, output, cursor, snapshot)
	if !ready {
		return
	}
	for {
		wake := store.committedEventWakeChannel()
		events, err := store.ReadCommittedStreamEvents(
			ctx,
			cursor.StreamID,
			cursor.Sequence,
			MaxCommittedEventReadLimit,
		)
		if err != nil {
			return
		}
		if len(events) == 0 {
			if !store.waitForConversationEvents(ctx, wake) {
				return
			}
			continue
		}
		if !sendCommittedConversationEvents(ctx, output, events, snapshot, &cursor) {
			return
		}
	}
}

func normalizeConversationEventCursor(
	ctx context.Context,
	output chan<- ConversationEvent,
	cursor ConversationEventCursor,
	snapshot ConversationSnapshot,
) (ConversationEventCursor, bool) {
	if cursor.Sequence <= snapshot.EventCursor.Sequence {
		return cursor, true
	}
	if !sendConversationEvent(ctx, output, conversationResyncEvent(cursor, snapshot)) {
		return cursor, false
	}
	return snapshot.EventCursor, true
}

func (store *Store) waitForConversationEvents(ctx context.Context, wake <-chan struct{}) bool {
	select {
	case <-ctx.Done():
		return false
	case <-store.closing:
		return false
	case <-wake:
		return true
	}
}

func sendCommittedConversationEvents(
	ctx context.Context,
	output chan<- ConversationEvent,
	events []CommittedEvent,
	snapshot ConversationSnapshot,
	cursor *ConversationEventCursor,
) bool {
	for _, committed := range events {
		event, err := conversationEventFromCommitted(
			committed,
			snapshot.Conversation.WorkspaceID,
			snapshot.Conversation.ID,
		)
		if err != nil || !sendConversationEvent(ctx, output, event) {
			return false
		}
		cursor.Sequence = committed.StreamSequence
	}
	return true
}

func sendConversationEvent(ctx context.Context, output chan<- ConversationEvent, event ConversationEvent) bool {
	select {
	case <-ctx.Done():
		return false
	case output <- event:
		return true
	}
}

func conversationResyncEvent(
	requested ConversationEventCursor,
	snapshot ConversationSnapshot,
) ConversationEvent {
	current := snapshot.EventCursor
	eventID, _ := ConversationEventID(current.StreamID, current.Sequence)
	return ConversationEvent{
		SchemaVersion:  ConversationContractSchemaVersion,
		StreamID:       current.StreamID,
		Sequence:       current.Sequence,
		EventID:        eventID,
		EmittedAt:      snapshot.Conversation.UpdatedAt,
		WorkspaceID:    snapshot.Conversation.WorkspaceID,
		ConversationID: snapshot.Conversation.ID,
		Payload: ConversationResyncRequiredEventPayload{
			Type:              ConversationEventTypeResyncRequired,
			Reason:            "requested cursor is ahead of durable conversation events",
			RequestedStreamID: requested.StreamID,
			RequestedSequence: requested.Sequence,
			CurrentStreamID:   current.StreamID,
			CurrentSequence:   current.Sequence,
		},
	}
}

func conversationEventFromCommitted(
	committed CommittedEvent,
	workspaceID string,
	conversationID string,
) (ConversationEvent, error) {
	payload, err := decodeConversationEventPayload(ConversationEventType(committed.Kind), committed.Payload)
	if err != nil {
		return ConversationEvent{}, err
	}
	eventID, err := ConversationEventID(committed.StreamID, committed.StreamSequence)
	if err != nil {
		return ConversationEvent{}, err
	}
	event := ConversationEvent{
		SchemaVersion:  ConversationContractSchemaVersion,
		StreamID:       committed.StreamID,
		Sequence:       committed.StreamSequence,
		EventID:        eventID,
		EmittedAt:      committed.CommittedAt,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		Payload:        payload,
	}
	if err := event.Validate(); err != nil {
		return ConversationEvent{}, fmt.Errorf("decode committed conversation event %s: %w", committed.ID, err)
	}
	return event, nil
}

func decodeConversationEventPayload(kind ConversationEventType, encoded json.RawMessage) (ConversationEventPayload, error) {
	constructor, ok := conversationEventPayloadConstructors[kind]
	if !ok {
		return nil, fmt.Errorf("unsupported committed conversation event kind %q", kind)
	}
	payload := constructor()
	if err := json.Unmarshal(encoded, payload); err != nil {
		return nil, fmt.Errorf("decode committed conversation event kind %s: %w", kind, err)
	}
	return payload, nil
}

var conversationEventPayloadConstructors = map[ConversationEventType]func() ConversationEventPayload{
	ConversationEventTypeConversationUpdated:        func() ConversationEventPayload { return &ConversationUpdatedEventPayload{} },
	ConversationEventTypeTurnUpdated:                func() ConversationEventPayload { return &ConversationTurnUpdatedEventPayload{} },
	ConversationEventTypeQueueUpdated:               func() ConversationEventPayload { return &ConversationQueueUpdatedEventPayload{} },
	ConversationEventTypeThreadBindingUpdated:       func() ConversationEventPayload { return &ConversationThreadBindingUpdatedEventPayload{} },
	ConversationEventTypeTrajectoryAppended:         func() ConversationEventPayload { return &ConversationTrajectoryAppendedEventPayload{} },
	ConversationEventTypeArtifactCreated:            func() ConversationEventPayload { return &ConversationArtifactCreatedEventPayload{} },
	ConversationEventTypeNarratorStateUpdated:       func() ConversationEventPayload { return &ConversationNarratorStateUpdatedEventPayload{} },
	ConversationEventTypeNarrationCreated:           func() ConversationEventPayload { return &ConversationNarrationCreatedEventPayload{} },
	ConversationEventTypeRoleProfileOverrideUpdated: func() ConversationEventPayload { return &ConversationRoleProfileOverrideUpdatedEventPayload{} },
	ConversationEventTypePresentationProfileUpdated: func() ConversationEventPayload { return &ConversationPresentationProfileUpdatedEventPayload{} },
	ConversationEventTypeBranchCreated:              func() ConversationEventPayload { return &ConversationBranchCreatedEventPayload{} },
	ConversationEventTypeSideConversationUpdated:    func() ConversationEventPayload { return &ConversationSideConversationUpdatedEventPayload{} },
	ConversationEventTypeSideEventAppended:          func() ConversationEventPayload { return &ConversationSideEventAppendedEventPayload{} },
	ConversationEventTypeResyncRequired:             func() ConversationEventPayload { return &ConversationResyncRequiredEventPayload{} },
}
