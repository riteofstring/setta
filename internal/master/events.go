package master

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"setta/internal/conversation"
	"setta/internal/conversationindex"
)

type EventSubscription interface {
	Events() <-chan Event
	Unsubscribe()
}

type eventSubscription struct {
	events chan Event
	cancel context.CancelFunc
	once   sync.Once
}

func (subscription *eventSubscription) Events() <-chan Event {
	return subscription.events
}

func (subscription *eventSubscription) Unsubscribe() {
	subscription.once.Do(subscription.cancel)
}

func (service *Service) SubscribeEvents(cursor int) (EventSubscription, error) {
	if cursor < 0 {
		return nil, errors.New("master event cursor must be non-negative")
	}
	ctx, cancel := context.WithCancel(context.Background())
	subscription := &eventSubscription{events: make(chan Event, 64), cancel: cancel}
	go service.runEventSubscription(ctx, subscription.events, cursor)
	return subscription, nil
}

func (service *Service) runEventSubscription(ctx context.Context, output chan<- Event, cursor int) {
	defer close(output)
	for {
		events, err := service.store.WaitForCommittedStreamEvents(ctx, masterStreamID(""), cursor, conversation.MaxCommittedEventReadLimit)
		if err != nil {
			return
		}
		for _, committed := range events {
			event, err := eventFromCommitted(committed)
			if err != nil {
				return
			}
			select {
			case <-ctx.Done():
				return
			case output <- event:
				cursor = event.Sequence
			}
		}
	}
}

func eventFromCommitted(committed conversation.CommittedEvent) (Event, error) {
	payload, err := decodeEventPayload(MasterEventType(committed.Kind), committed.Payload)
	if err != nil {
		return Event{}, err
	}
	return Event{
		SchemaVersion: MasterContractSchemaVersion, StreamID: committed.StreamID,
		Sequence: committed.StreamSequence, EventID: committed.ID,
		EmittedAt: committed.CommittedAt, Payload: payload,
	}, nil
}

func decodeEventPayload(kind MasterEventType, raw json.RawMessage) (EventPayload, error) {
	switch kind {
	case EventTypeSessionUpdated:
		var payload SessionUpdatedPayload
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, err
		}
		return payload, nil
	case EventTypeRouteCommitted:
		return decodeRouteCommittedPayload(raw)
	case EventTypePresentationIntent:
		return decodePresentationIntentPayload(raw)
	case EventTypeReply:
		var payload ReplyPayload
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, err
		}
		return payload, nil
	default:
		return nil, fmt.Errorf("unsupported committed master event %q", kind)
	}
}

type rawInteraction struct {
	Sequence           int                                `json:"sequence"`
	ID                 string                             `json:"id"`
	Input              Input                              `json:"input"`
	Candidates         []conversationindex.TopicCandidate `json:"candidates"`
	Decision           json.RawMessage                    `json:"decision"`
	Command            *CommandResult                     `json:"command"`
	ResolvedInvocation conversation.ResolvedInvocation    `json:"resolvedInvocation"`
	Outcome            string                             `json:"outcome"`
	Error              *conversation.Failure              `json:"error"`
	CreatedAt          string                             `json:"createdAt"`
}

func decodeRouteCommittedPayload(raw json.RawMessage) (EventPayload, error) {
	var envelope struct {
		Type        MasterEventType `json:"type"`
		Interaction rawInteraction  `json:"interaction"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	decision, err := decodeRouteDecision(string(envelope.Interaction.Decision))
	if err != nil {
		return nil, err
	}
	interaction := Interaction{
		Sequence: envelope.Interaction.Sequence, ID: envelope.Interaction.ID,
		Input: envelope.Interaction.Input, Candidates: envelope.Interaction.Candidates,
		Decision: decision, Command: envelope.Interaction.Command,
		ResolvedInvocation: envelope.Interaction.ResolvedInvocation,
		Outcome:            envelope.Interaction.Outcome, Error: envelope.Interaction.Error,
		CreatedAt: envelope.Interaction.CreatedAt,
	}
	return RouteCommittedPayload{Type: envelope.Type, Interaction: interaction}, nil
}

func decodePresentationIntentPayload(raw json.RawMessage) (EventPayload, error) {
	var envelope struct {
		Type   MasterEventType `json:"type"`
		Intent json.RawMessage `json:"intent"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	intent, err := decodePresentationIntent(envelope.Intent)
	if err != nil {
		return nil, err
	}
	return PresentationIntentPayload{Type: envelope.Type, Intent: intent}, nil
}

func decodePresentationIntent(raw json.RawMessage) (PresentationIntent, error) {
	var envelope struct {
		Type MasterPresentationIntentType `json:"type"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	switch envelope.Type {
	case PresentationIntentFocusExisting:
		var intent FocusExistingPaneIntent
		if err := json.Unmarshal(raw, &intent); err != nil {
			return nil, err
		}
		return intent, nil
	case PresentationIntentOpenConversation:
		var intent OpenConversationPaneIntent
		if err := json.Unmarshal(raw, &intent); err != nil {
			return nil, err
		}
		return intent, nil
	case PresentationIntentOpenSide:
		var intent OpenSideConversationIntent
		if err := json.Unmarshal(raw, &intent); err != nil {
			return nil, err
		}
		return intent, nil
	case PresentationIntentShowReply:
		var intent ShowMasterReplyIntent
		if err := json.Unmarshal(raw, &intent); err != nil {
			return nil, err
		}
		return intent, nil
	default:
		return nil, fmt.Errorf("unsupported master presentation intent %q", envelope.Type)
	}
}
