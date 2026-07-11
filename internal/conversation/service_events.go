package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

type eventSubscription struct {
	events chan ConversationEvent
	cancel context.CancelFunc
	once   sync.Once
}

func (subscription *eventSubscription) Events() <-chan ConversationEvent {
	return subscription.events
}

func (subscription *eventSubscription) Unsubscribe() {
	subscription.once.Do(subscription.cancel)
}

func (service *Service) SubscribeEvents(cursor ConversationEventCursor, workspaceID string, conversationID string) (ConversationEventSubscription, error) {
	if err := cursor.Validate(conversationID); err != nil {
		return nil, err
	}
	snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	subscription := &eventSubscription{events: make(chan ConversationEvent, 64), cancel: cancel}
	go service.runEventSubscription(ctx, subscription.events, cursor, snapshot)
	return subscription, nil
}

func (service *Service) runEventSubscription(ctx context.Context, output chan<- ConversationEvent, cursor ConversationEventCursor, snapshot ConversationSnapshot) {
	defer close(output)
	if cursor.Sequence > snapshot.EventCursor.Sequence {
		if !sendConversationEvent(ctx, output, resyncConversationEvent(cursor, snapshot)) {
			return
		}
		cursor.Sequence = snapshot.EventCursor.Sequence
	}
	for {
		wake := service.store.committedEventWakeChannel()
		events, err := service.store.ReadCommittedStreamEvents(ctx, cursor.StreamID, cursor.Sequence, MaxCommittedEventReadLimit)
		if err != nil {
			return
		}
		if len(events) == 0 {
			select {
			case <-ctx.Done():
				return
			case <-service.store.closing:
				return
			case <-wake:
				continue
			}
		}
		for _, committed := range events {
			event, err := conversationEventFromCommitted(snapshot.Conversation, committed)
			if err != nil || !sendConversationEvent(ctx, output, event) {
				return
			}
			cursor.Sequence = committed.StreamSequence
		}
	}
}

func sendConversationEvent(ctx context.Context, output chan<- ConversationEvent, event ConversationEvent) bool {
	select {
	case <-ctx.Done():
		return false
	case output <- event:
		return true
	}
}

func resyncConversationEvent(requested ConversationEventCursor, snapshot ConversationSnapshot) ConversationEvent {
	payload := ConversationResyncRequiredEventPayload{
		Type:              ConversationEventTypeResyncRequired,
		Reason:            "requested cursor is ahead of the durable stream",
		RequestedStreamID: requested.StreamID,
		RequestedSequence: requested.Sequence,
		CurrentStreamID:   snapshot.EventCursor.StreamID,
		CurrentSequence:   snapshot.EventCursor.Sequence,
	}
	return ConversationEvent{
		SchemaVersion: ConversationContractSchemaVersion,
		StreamID:      snapshot.EventCursor.StreamID, Sequence: snapshot.EventCursor.Sequence,
		EventID: conversationEventID(snapshot.EventCursor.StreamID, snapshot.EventCursor.Sequence), EmittedAt: snapshot.Conversation.UpdatedAt,
		WorkspaceID: snapshot.Conversation.WorkspaceID, ConversationID: snapshot.Conversation.ID,
		Payload: payload,
	}
}

func (service *Service) appendCommittedPayload(transaction *WriteTransaction, conversation TopicConversation, payload ConversationEventPayload) error {
	if payload == nil {
		return errors.New("conversation committed payload is required")
	}
	eventID, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	streamID, err := ConversationStreamID(conversation.ID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID: eventID, StreamID: streamID, Kind: string(payload.conversationEventType()),
		Payload: payload, CommittedAt: conversation.UpdatedAt,
	})
	return err
}

func conversationEventFromCommitted(conversation TopicConversation, committed CommittedEvent) (ConversationEvent, error) {
	payload, err := decodeConversationEventPayload(ConversationEventType(committed.Kind), committed.Payload)
	if err != nil {
		return ConversationEvent{}, err
	}
	event := ConversationEvent{
		SchemaVersion: ConversationContractSchemaVersion,
		StreamID:      committed.StreamID, Sequence: committed.StreamSequence,
		EventID: conversationEventID(committed.StreamID, committed.StreamSequence), EmittedAt: committed.CommittedAt,
		WorkspaceID: conversation.WorkspaceID, ConversationID: conversation.ID,
		Payload: payload,
	}
	return event, event.Validate()
}

func conversationEventID(streamID string, sequence int) string {
	eventID, _ := ConversationEventID(streamID, sequence)
	return eventID
}

var conversationEventPayloadFactories = map[ConversationEventType]func() ConversationEventPayload{
	ConversationEventTypeConversationUpdated:          func() ConversationEventPayload { return &ConversationUpdatedEventPayload{} },
	ConversationEventTypeTurnUpdated:                  func() ConversationEventPayload { return &ConversationTurnUpdatedEventPayload{} },
	ConversationEventTypeQueueUpdated:                 func() ConversationEventPayload { return &ConversationQueueUpdatedEventPayload{} },
	ConversationEventTypeThreadBindingUpdated:         func() ConversationEventPayload { return &ConversationThreadBindingUpdatedEventPayload{} },
	ConversationEventTypeTrajectoryAppended:           func() ConversationEventPayload { return &ConversationTrajectoryAppendedEventPayload{} },
	ConversationEventTypeArtifactCreated:              func() ConversationEventPayload { return &ConversationArtifactCreatedEventPayload{} },
	ConversationEventTypeNarratorStateUpdated:         func() ConversationEventPayload { return &ConversationNarratorStateUpdatedEventPayload{} },
	ConversationEventTypeNarrationCreated:             func() ConversationEventPayload { return &ConversationNarrationCreatedEventPayload{} },
	ConversationEventTypeRoleProfileOverrideUpdated:   func() ConversationEventPayload { return &ConversationRoleProfileOverrideUpdatedEventPayload{} },
	ConversationEventTypePresentationProfileUpdated:   func() ConversationEventPayload { return &ConversationPresentationProfileUpdatedEventPayload{} },
	ConversationEventTypeBranchCreated:                func() ConversationEventPayload { return &ConversationBranchCreatedEventPayload{} },
	ConversationEventTypeSideConversationUpdated:      func() ConversationEventPayload { return &ConversationSideConversationUpdatedEventPayload{} },
	ConversationEventTypeSideConversationEventCreated: func() ConversationEventPayload { return &ConversationSideConversationEventCreatedEventPayload{} },
	ConversationEventTypeResyncRequired:               func() ConversationEventPayload { return &ConversationResyncRequiredEventPayload{} },
}

func decodeConversationEventPayload(kind ConversationEventType, raw json.RawMessage) (ConversationEventPayload, error) {
	factory := conversationEventPayloadFactories[kind]
	if factory == nil {
		return nil, fmt.Errorf("unsupported committed conversation event kind %q", kind)
	}
	payload := factory()
	if err := json.Unmarshal(raw, payload); err != nil {
		return nil, fmt.Errorf("decode committed conversation event %s: %w", kind, err)
	}
	return payload, nil
}
