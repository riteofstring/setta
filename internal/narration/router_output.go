package narration

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/jsonio"
)

type conversationRouteWireEnvelope struct {
	Decision json.RawMessage `json:"decision"`
}

type conversationRouteWireDecision struct {
	Kind           conversation.ConversationRouteDecisionKind `json:"kind"`
	AuthoredInput  json.RawMessage                            `json:"authoredInput"`
	Question       json.RawMessage                            `json:"question"`
	ForkedAtTurnID json.RawMessage                            `json:"forkedAtTurnId"`
	ProposedTitle  json.RawMessage                            `json:"proposedTitle"`
}

type decodedConversationRouteWireDecision struct {
	authoredInput  *string
	question       *string
	forkedAtTurnID *string
	proposedTitle  *string
}

func conversationRouteOutputSchema(
	context ConversationRouteContextBundle,
) (json.RawMessage, error) {
	if context.Kind != ConversationRouteContextKind || len(context.AllowedDecisionKinds) == 0 {
		return nil, errors.New("conversation router output schema requires allowed input-route context")
	}
	forkPointIDs := make([]string, 0, len(context.ValidCompletedForkPoints))
	for _, point := range context.ValidCompletedForkPoints {
		forkPointIDs = append(forkPointIDs, point.TurnID)
	}
	allowedKinds := make([]string, 0, len(context.AllowedDecisionKinds))
	for _, kind := range context.AllowedDecisionKinds {
		allowedKinds = append(allowedKinds, string(kind))
	}
	forkPointSchema := map[string]any{"type": "null"}
	if len(forkPointIDs) > 0 {
		forkPointSchema = nullableConversationRouteSchema(
			enumValuesStringSchema(forkPointIDs),
			"For fork_conversation, select one supplied completed parent turn id; otherwise null.",
		)
	}
	return marshalOutputSchema(strictObjectSchema(map[string]any{
		"decision": strictObjectSchema(map[string]any{
			"kind": describedConversationRouteSchema(
				enumValuesStringSchema(allowedKinds),
				conversationRouteKindSchemaDescription,
			),
			"authoredInput": nullableConversationRouteSchema(
				boundedStringSchema(conversation.MaxAuthoredInputBytes),
				"For a parent, side, fork, or master route, copy the applicable user request; otherwise null. Never return placeholder text.",
			),
			"question": nullableConversationRouteSchema(
				boundedStringSchema(conversation.MaxConversationRouteQuestionBytes),
				"For answer_as_narrator, copy the user's status question; for clarify, ask one necessary routing question; otherwise null.",
			),
			"forkedAtTurnId": forkPointSchema,
			"proposedTitle": nullableConversationRouteSchema(
				boundedStringSchema(conversation.MaxConversationTitleBytes),
				"For fork_conversation, provide a concise durable child title; otherwise null.",
			),
		}),
	}))
}

func describedConversationRouteSchema(schema map[string]any, description string) map[string]any {
	schema["description"] = description
	return schema
}

func nullableConversationRouteSchema(schema map[string]any, description string) map[string]any {
	return map[string]any{
		"anyOf":       []any{schema, map[string]any{"type": "null"}},
		"description": description,
	}
}

const conversationRouteKindSchemaDescription = "Select exactly one allowed routing label. send_to_parent starts actionable topic work while idle or requests a folder resource for folderless filesystem work; queue_parent_turn preserves distinct follow-up work until the active turn completes; steer_parent_turn changes the active turn; answer_as_narrator delegates an existing status or trajectory question, or ordinary folderless non-filesystem chat; create_side_conversation isolates a bounded pane tangent; fork_conversation creates an explicitly durable child topic; escalate_to_master delegates an unrelated app-global request; clarify asks only for materially missing routing intent."

func decodeConversationRouteOutput(
	raw json.RawMessage,
	context ConversationRouteContextBundle,
) (conversation.ConversationRouteDecision, error) {
	var envelope conversationRouteWireEnvelope
	if err := decodeConversationRouteWire(raw, &envelope); err != nil {
		return conversation.ConversationRouteDecision{}, err
	}
	var wire conversationRouteWireDecision
	if err := decodeConversationRouteWire(envelope.Decision, &wire); err != nil {
		return conversation.ConversationRouteDecision{}, err
	}
	if !conversationRouteDecisionKindIncluded(context.AllowedDecisionKinds, wire.Kind) {
		return conversation.ConversationRouteDecision{}, fmt.Errorf(
			"conversation router returned disallowed decision kind %q",
			wire.Kind,
		)
	}
	decision, err := decodeConversationRouteDecision(wire)
	if err != nil {
		return conversation.ConversationRouteDecision{}, err
	}
	if err := decision.Validate(); err != nil {
		return conversation.ConversationRouteDecision{}, fmt.Errorf("validate conversation router decision: %w", err)
	}
	if decision.Kind == conversation.ConversationRouteDecisionKindForkConversation &&
		!conversationRouteForkPointIncluded(context.ValidCompletedForkPoints, decision.ForkConversation.ForkedAtTurnID) {
		return conversation.ConversationRouteDecision{}, errors.New("conversation router selected an unavailable completed fork point")
	}
	return decision, nil
}

func decodeConversationRouteDecision(
	wire conversationRouteWireDecision,
) (conversation.ConversationRouteDecision, error) {
	fields, err := decodeConversationRouteWireFields(wire)
	if err != nil {
		return conversation.ConversationRouteDecision{}, err
	}
	switch wire.Kind {
	case conversation.ConversationRouteDecisionKindSendToParent,
		conversation.ConversationRouteDecisionKindQueueParentTurn,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
		conversation.ConversationRouteDecisionKindCreateSideConversation,
		conversation.ConversationRouteDecisionKindEscalateToMaster:
		return decodeConversationRouteAuthoredDecision(wire.Kind, fields)
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator,
		conversation.ConversationRouteDecisionKindClarify:
		return decodeConversationRouteQuestionDecision(wire.Kind, fields)
	case conversation.ConversationRouteDecisionKindForkConversation:
		return decodeConversationRouteForkDecision(wire.Kind, fields)
	default:
		return conversation.ConversationRouteDecision{}, fmt.Errorf("unsupported conversation route output kind %q", wire.Kind)
	}
}

func decodeConversationRouteWireFields(
	wire conversationRouteWireDecision,
) (decodedConversationRouteWireDecision, error) {
	authoredInput, err := decodeNullableConversationRouteString(wire.AuthoredInput, "authoredInput")
	if err != nil {
		return decodedConversationRouteWireDecision{}, err
	}
	question, err := decodeNullableConversationRouteString(wire.Question, "question")
	if err != nil {
		return decodedConversationRouteWireDecision{}, err
	}
	forkedAtTurnID, err := decodeNullableConversationRouteString(wire.ForkedAtTurnID, "forkedAtTurnId")
	if err != nil {
		return decodedConversationRouteWireDecision{}, err
	}
	proposedTitle, err := decodeNullableConversationRouteString(wire.ProposedTitle, "proposedTitle")
	if err != nil {
		return decodedConversationRouteWireDecision{}, err
	}
	return decodedConversationRouteWireDecision{
		authoredInput:  authoredInput,
		question:       question,
		forkedAtTurnID: forkedAtTurnID,
		proposedTitle:  proposedTitle,
	}, nil
}

func (fields decodedConversationRouteWireDecision) matches(
	authoredInput bool,
	question bool,
	forkedAtTurnID bool,
	proposedTitle bool,
) bool {
	return (fields.authoredInput != nil) == authoredInput &&
		(fields.question != nil) == question &&
		(fields.forkedAtTurnID != nil) == forkedAtTurnID &&
		(fields.proposedTitle != nil) == proposedTitle
}

func decodeConversationRouteAuthoredDecision(
	kind conversation.ConversationRouteDecisionKind,
	fields decodedConversationRouteWireDecision,
) (conversation.ConversationRouteDecision, error) {
	if !fields.matches(true, false, false, false) {
		return conversation.ConversationRouteDecision{}, fmt.Errorf("conversation route %s has invalid payload fields", kind)
	}
	return conversationRouteAuthoredDecision(kind, conversation.AuthoredInput{Text: *fields.authoredInput})
}

func decodeConversationRouteQuestionDecision(
	kind conversation.ConversationRouteDecisionKind,
	fields decodedConversationRouteWireDecision,
) (conversation.ConversationRouteDecision, error) {
	if !fields.matches(false, true, false, false) {
		return conversation.ConversationRouteDecision{}, fmt.Errorf("conversation route %s has invalid payload fields", kind)
	}
	if kind == conversation.ConversationRouteDecisionKindAnswerAsNarrator {
		return conversation.ConversationRouteDecision{
			Kind:             kind,
			AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteDecision{Question: *fields.question},
		}, nil
	}
	return conversation.ConversationRouteDecision{
		Kind: kind, Clarify: &conversation.ClarifyConversationRouteDecision{Question: *fields.question},
	}, nil
}

func decodeConversationRouteForkDecision(
	kind conversation.ConversationRouteDecisionKind,
	fields decodedConversationRouteWireDecision,
) (conversation.ConversationRouteDecision, error) {
	if !fields.matches(true, false, true, true) {
		return conversation.ConversationRouteDecision{}, fmt.Errorf("conversation route %s has invalid payload fields", kind)
	}
	return conversation.ConversationRouteDecision{
		Kind: kind,
		ForkConversation: &conversation.ForkConversationRouteDecision{
			ForkedAtTurnID: *fields.forkedAtTurnID,
			Input:          conversation.AuthoredInput{Text: *fields.authoredInput},
			ProposedTitle:  *fields.proposedTitle,
		},
	}, nil
}

func decodeNullableConversationRouteString(raw json.RawMessage, field string) (*string, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("conversation router output field %s is required", field)
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode conversation router output field %s: %w", field, err)
	}
	return &value, nil
}

func conversationRouteAuthoredDecision(
	kind conversation.ConversationRouteDecisionKind,
	input conversation.AuthoredInput,
) (conversation.ConversationRouteDecision, error) {
	switch kind {
	case conversation.ConversationRouteDecisionKindSendToParent:
		return conversation.ConversationRouteDecision{
			Kind: kind, SendToParent: &conversation.SendToParentConversationRouteDecision{AuthoredInput: input},
		}, nil
	case conversation.ConversationRouteDecisionKindQueueParentTurn:
		return conversation.ConversationRouteDecision{
			Kind: kind, QueueParentTurn: &conversation.QueueParentTurnConversationRouteDecision{AuthoredInput: input},
		}, nil
	case conversation.ConversationRouteDecisionKindSteerParentTurn:
		return conversation.ConversationRouteDecision{
			Kind: kind, SteerParentTurn: &conversation.SteerParentTurnConversationRouteDecision{AuthoredInput: input},
		}, nil
	case conversation.ConversationRouteDecisionKindCreateSideConversation:
		return conversation.ConversationRouteDecision{
			Kind: kind, CreateSideConversation: &conversation.CreateSideConversationRouteDecision{Input: input},
		}, nil
	case conversation.ConversationRouteDecisionKindEscalateToMaster:
		return conversation.ConversationRouteDecision{
			Kind: kind, EscalateToMaster: &conversation.EscalateToMasterConversationRouteDecision{Input: input},
		}, nil
	default:
		return conversation.ConversationRouteDecision{}, fmt.Errorf("conversation route kind %q does not carry authored input", kind)
	}
}

func decodeConversationRouteWire(raw json.RawMessage, target any) error {
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), target); err != nil {
		return fmt.Errorf("decode conversation router output: %w", err)
	}
	return nil
}

func conversationRouteDecisionKindIncluded(
	kinds []conversation.ConversationRouteDecisionKind,
	want conversation.ConversationRouteDecisionKind,
) bool {
	for _, kind := range kinds {
		if kind == want {
			return true
		}
	}
	return false
}

func conversationRouteForkPointIncluded(
	points []conversation.ConversationRouterForkPoint,
	want string,
) bool {
	for _, point := range points {
		if point.TurnID == want {
			return true
		}
	}
	return false
}

func enumValuesStringSchema(values []string) map[string]any {
	return map[string]any{"type": "string", "enum": values}
}
