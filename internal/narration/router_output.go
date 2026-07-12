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

type conversationRouteWireKind struct {
	Kind conversation.ConversationRouteDecisionKind `json:"kind"`
}

type conversationRouteWireAuthoredInput struct {
	Kind          conversation.ConversationRouteDecisionKind `json:"kind"`
	AuthoredInput string                                     `json:"authoredInput"`
}

type conversationRouteWireQuestion struct {
	Kind     conversation.ConversationRouteDecisionKind `json:"kind"`
	Question string                                     `json:"question"`
}

type conversationRouteWireFork struct {
	Kind           conversation.ConversationRouteDecisionKind `json:"kind"`
	AuthoredInput  string                                     `json:"authoredInput"`
	ForkedAtTurnID string                                     `json:"forkedAtTurnId"`
	ProposedTitle  string                                     `json:"proposedTitle"`
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
	variants := make([]any, 0, len(context.AllowedDecisionKinds))
	for _, kind := range context.AllowedDecisionKinds {
		variant, err := conversationRouteDecisionOutputSchema(kind, forkPointIDs)
		if err != nil {
			return nil, err
		}
		variants = append(variants, variant)
	}
	return marshalOutputSchema(strictObjectSchema(map[string]any{
		"decision": map[string]any{"anyOf": variants},
	}))
}

func conversationRouteDecisionOutputSchema(
	kind conversation.ConversationRouteDecisionKind,
	forkPointIDs []string,
) (map[string]any, error) {
	properties := map[string]any{"kind": enumStringSchema(string(kind))}
	switch kind {
	case conversation.ConversationRouteDecisionKindSendToParent,
		conversation.ConversationRouteDecisionKindQueueParentTurn,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
		conversation.ConversationRouteDecisionKindCreateSideConversation,
		conversation.ConversationRouteDecisionKindEscalateToMaster:
		properties["authoredInput"] = boundedStringSchema(conversation.MaxAuthoredInputBytes)
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator:
		properties["question"] = boundedStringSchema(conversation.MaxConversationRouteQuestionBytes)
	case conversation.ConversationRouteDecisionKindForkConversation:
		if len(forkPointIDs) == 0 {
			return nil, errors.New("fork conversation route output schema requires a completed fork point")
		}
		properties["authoredInput"] = boundedStringSchema(conversation.MaxAuthoredInputBytes)
		properties["forkedAtTurnId"] = enumValuesStringSchema(forkPointIDs)
		properties["proposedTitle"] = boundedStringSchema(conversation.MaxConversationTitleBytes)
	case conversation.ConversationRouteDecisionKindClarify:
		properties["question"] = boundedStringSchema(conversation.MaxConversationRouteQuestionBytes)
	default:
		return nil, fmt.Errorf("unsupported conversation route output kind %q", kind)
	}
	return strictObjectSchema(properties), nil
}

func decodeConversationRouteOutput(
	raw json.RawMessage,
	context ConversationRouteContextBundle,
) (conversation.ConversationRouteDecision, error) {
	var envelope conversationRouteWireEnvelope
	if err := decodeConversationRouteWire(raw, &envelope); err != nil {
		return conversation.ConversationRouteDecision{}, err
	}
	var header conversationRouteWireKind
	if err := json.Unmarshal(envelope.Decision, &header); err != nil {
		return conversation.ConversationRouteDecision{}, fmt.Errorf("decode conversation router decision kind: %w", err)
	}
	if !conversationRouteDecisionKindIncluded(context.AllowedDecisionKinds, header.Kind) {
		return conversation.ConversationRouteDecision{}, fmt.Errorf(
			"conversation router returned disallowed decision kind %q",
			header.Kind,
		)
	}
	decision, err := decodeConversationRouteDecision(envelope.Decision, header.Kind)
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
	raw json.RawMessage,
	kind conversation.ConversationRouteDecisionKind,
) (conversation.ConversationRouteDecision, error) {
	switch kind {
	case conversation.ConversationRouteDecisionKindSendToParent,
		conversation.ConversationRouteDecisionKindQueueParentTurn,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
		conversation.ConversationRouteDecisionKindCreateSideConversation,
		conversation.ConversationRouteDecisionKindEscalateToMaster:
		var wire conversationRouteWireAuthoredInput
		if err := decodeConversationRouteWire(raw, &wire); err != nil {
			return conversation.ConversationRouteDecision{}, err
		}
		return conversationRouteAuthoredDecision(kind, conversation.AuthoredInput{Text: wire.AuthoredInput})
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator,
		conversation.ConversationRouteDecisionKindClarify:
		var wire conversationRouteWireQuestion
		if err := decodeConversationRouteWire(raw, &wire); err != nil {
			return conversation.ConversationRouteDecision{}, err
		}
		if kind == conversation.ConversationRouteDecisionKindAnswerAsNarrator {
			return conversation.ConversationRouteDecision{
				Kind:             kind,
				AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteDecision{Question: wire.Question},
			}, nil
		}
		return conversation.ConversationRouteDecision{
			Kind: kind, Clarify: &conversation.ClarifyConversationRouteDecision{Question: wire.Question},
		}, nil
	case conversation.ConversationRouteDecisionKindForkConversation:
		var wire conversationRouteWireFork
		if err := decodeConversationRouteWire(raw, &wire); err != nil {
			return conversation.ConversationRouteDecision{}, err
		}
		return conversation.ConversationRouteDecision{
			Kind: kind,
			ForkConversation: &conversation.ForkConversationRouteDecision{
				ForkedAtTurnID: wire.ForkedAtTurnID,
				Input:          conversation.AuthoredInput{Text: wire.AuthoredInput},
				ProposedTitle:  wire.ProposedTitle,
			},
		}, nil
	default:
		return conversation.ConversationRouteDecision{}, fmt.Errorf("unsupported conversation route output kind %q", kind)
	}
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
