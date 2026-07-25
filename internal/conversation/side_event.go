package conversation

import "fmt"

// SideConversationEvent wraps the existing exhaustive trajectory contract in
// a separate durable ledger. The nested event is scoped to the side ID, never
// to the parent conversation, so it cannot enter the parent's trajectory or
// narrator inputs.
type SideConversationEvent struct {
	StreamSequence       int             `json:"streamSequence"`
	ParentConversationID string          `json:"parentConversationId"`
	SideConversationID   string          `json:"sideConversationId"`
	Event                TrajectoryEvent `json:"event"`
}

func (event SideConversationEvent) Validate() error {
	if event.StreamSequence <= 0 {
		return fmt.Errorf("side conversation event stream sequence must be positive")
	}
	if err := validateIdentifier("side conversation event side id", event.SideConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("side conversation event parent id", event.ParentConversationID); err != nil {
		return err
	}
	if err := event.Event.Validate(); err != nil {
		return err
	}
	if event.Event.ConversationID != event.SideConversationID {
		return fmt.Errorf("side conversation event %s is scoped to %q, want %q", event.Event.ID, event.Event.ConversationID, event.SideConversationID)
	}
	return nil
}

type ConversationSideEventWindow struct {
	Events     []SideConversationEvent `json:"events"`
	HasEarlier bool                    `json:"hasEarlier"`
	Limit      int                     `json:"limit"`
}

func validateSnapshotSideEvents(
	window ConversationSideEventWindow,
	sides []SideConversation,
	conversationID string,
) error {
	if err := validateSideEventWindowShape(window); err != nil {
		return err
	}
	sideSequences := make(map[string]int, len(sides))
	for _, side := range sides {
		sideSequences[side.ID] = side.LastEventSequence
	}
	previousStreamSequence := 0
	for _, event := range window.Events {
		if err := validateSnapshotSideEvent(event, conversationID, sideSequences, previousStreamSequence); err != nil {
			return err
		}
		previousStreamSequence = event.StreamSequence
	}
	return nil
}

func validateSideEventWindowShape(window ConversationSideEventWindow) error {
	if window.Events == nil {
		return fmt.Errorf("conversation snapshot side events must be an array, not null")
	}
	if window.Limit != MaxSnapshotSideEvents {
		return fmt.Errorf("conversation snapshot side event limit must be %d", MaxSnapshotSideEvents)
	}
	if len(window.Events) > MaxSnapshotSideEvents {
		return fmt.Errorf("conversation snapshot side event window exceeds %d records", MaxSnapshotSideEvents)
	}
	if window.HasEarlier && len(window.Events) == 0 {
		return fmt.Errorf("conversation snapshot side event window cannot report earlier records while empty")
	}
	return nil
}

func validateSnapshotSideEvent(
	event SideConversationEvent,
	conversationID string,
	sideSequences map[string]int,
	previousStreamSequence int,
) error {
	if err := event.Validate(); err != nil {
		return err
	}
	if event.ParentConversationID != conversationID {
		return fmt.Errorf("snapshot side event %s belongs to parent %q, want %q", event.Event.ID, event.ParentConversationID, conversationID)
	}
	lastSequence, ok := sideSequences[event.SideConversationID]
	if !ok {
		return fmt.Errorf("snapshot side event %s has no included side conversation", event.Event.ID)
	}
	if event.Event.Sequence > lastSequence {
		return fmt.Errorf("snapshot side event %s exceeds side sequence %d", event.Event.ID, lastSequence)
	}
	if previousStreamSequence != 0 && event.StreamSequence <= previousStreamSequence {
		return fmt.Errorf("conversation snapshot side events are not strictly ordered")
	}
	return nil
}

func (payload ConversationSideEventAppendedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeSideEventAppended
}

func (payload ConversationSideEventAppendedEventPayload) validateConversationEventPayload(_ string, conversationID string) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Event.Validate(); err != nil {
		return err
	}
	return validateEventPayloadOwner("conversation.side_event.appended", payload.Event.ParentConversationID, conversationID)
}
