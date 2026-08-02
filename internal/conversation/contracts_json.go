package conversation

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/jsonio"
)

// DecodeConversationEvent decodes the current conversation event wire shape.
// ConversationEvent cannot rely on encoding/json directly because its payload
// is an exhaustive interface union; the payload discriminator remains owned by
// this package rather than by each HTTP consumer.
func DecodeConversationEvent(data []byte) (ConversationEvent, error) {
	if len(data) == 0 {
		return ConversationEvent{}, errors.New("conversation event JSON is required")
	}
	var envelope conversationEventJSON
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &envelope); err != nil {
		return ConversationEvent{}, fmt.Errorf("decode conversation event envelope: %w", err)
	}
	payload, err := decodeConversationEventWirePayload(envelope.Payload)
	if err != nil {
		return ConversationEvent{}, err
	}
	event := ConversationEvent{
		SchemaVersion:  envelope.SchemaVersion,
		StreamID:       envelope.StreamID,
		Sequence:       envelope.Sequence,
		EventID:        envelope.EventID,
		EmittedAt:      envelope.EmittedAt,
		WorkspaceID:    envelope.WorkspaceID,
		ConversationID: envelope.ConversationID,
		Payload:        payload,
	}
	if err := event.Validate(); err != nil {
		return ConversationEvent{}, fmt.Errorf("validate conversation event: %w", err)
	}
	return event, nil
}

type conversationEventJSON struct {
	SchemaVersion  int             `json:"schemaVersion"`
	StreamID       string          `json:"streamId"`
	Sequence       int             `json:"sequence"`
	EventID        string          `json:"eventId"`
	EmittedAt      string          `json:"emittedAt"`
	WorkspaceID    *string         `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	Payload        json.RawMessage `json:"payload"`
}

func decodeConversationEventWirePayload(encoded json.RawMessage) (ConversationEventPayload, error) {
	if len(encoded) == 0 || bytes.Equal(bytes.TrimSpace(encoded), []byte("null")) {
		return nil, errors.New("conversation event payload is required")
	}
	var discriminator struct {
		Type ConversationEventType `json:"type"`
	}
	if err := json.Unmarshal(encoded, &discriminator); err != nil {
		return nil, fmt.Errorf("decode conversation event payload discriminator: %w", err)
	}
	constructor, ok := conversationEventPayloadConstructors[discriminator.Type]
	if !ok {
		return nil, fmt.Errorf("unsupported conversation event payload type %q", discriminator.Type)
	}
	payload := constructor()
	if err := jsonio.DecodeSingle(bytes.NewReader(encoded), payload); err != nil {
		return nil, fmt.Errorf("decode conversation event payload %s: %w", discriminator.Type, err)
	}
	return payload, nil
}
