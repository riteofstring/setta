package master

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

func routePrompt(input Input, context CandidateContext) (string, []byte, error) {
	payload := struct {
		Input   Input            `json:"input"`
		Context CandidateContext `json:"context"`
	}{Input: input, Context: context}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}
	schema, err := json.Marshal(routeDecisionSchema())
	if err != nil {
		return "", nil, err
	}
	prompt := "Choose exactly one typed Setta route decision. Candidate retrieval is bounded but authoritative for existing-topic targets. Ask a clarification when the supplied context does not support one unambiguous action. Do not call tools or access the filesystem.\n" + string(encoded)
	return prompt, schema, nil
}

func decodeRouteDecision(raw string) (RouteDecision, error) {
	var envelope struct {
		Type MasterRouteDecisionType `json:"type"`
	}
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		return nil, fmt.Errorf("decode master route discriminator: %w", err)
	}
	var target RouteDecision
	switch envelope.Type {
	case RouteDecisionSendToAgent:
		target = SendToAgentDecision{}
	case RouteDecisionAskNarrator:
		target = AskNarratorDecision{}
	case RouteDecisionFocusConversation:
		target = FocusConversationDecision{}
	case RouteDecisionCreateConversation:
		target = CreateConversationDecision{}
	case RouteDecisionCreateSideConversation:
		target = CreateSideConversationDecision{}
	case RouteDecisionForkConversation:
		target = ForkConversationDecision{}
	case RouteDecisionClarify:
		target = ClarifyDecision{}
	case RouteDecisionAnswerGlobal:
		target = AnswerGlobalDecision{}
	default:
		return nil, fmt.Errorf("unsupported master route decision type %q", envelope.Type)
	}
	decoded, err := decodeStrictRoute([]byte(raw), target)
	if err != nil {
		return nil, err
	}
	if err := ValidateRouteDecision(decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func decodeStrictRoute(raw []byte, target RouteDecision) (RouteDecision, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	switch target.(type) {
	case SendToAgentDecision:
		var value SendToAgentDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case AskNarratorDecision:
		var value AskNarratorDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case FocusConversationDecision:
		var value FocusConversationDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case CreateConversationDecision:
		var value CreateConversationDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case CreateSideConversationDecision:
		var value CreateSideConversationDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case ForkConversationDecision:
		var value ForkConversationDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case ClarifyDecision:
		var value ClarifyDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	case AnswerGlobalDecision:
		var value AnswerGlobalDecision
		if err := decodeSingle(decoder, &value); err != nil {
			return nil, err
		}
		return value, nil
	default:
		return nil, fmt.Errorf("unsupported route decode target %T", target)
	}
}

func decodeSingle(decoder *json.Decoder, target any) error {
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("master route output contains more than one JSON value")
		}
		return err
	}
	return nil
}

func routeDecisionSchema() map[string]any {
	input := objectSchema([]string{"text"}, map[string]any{
		"text": map[string]any{"type": "string", "minLength": 1},
	})
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"oneOf": []any{
			objectSchema([]string{"type", "conversationId", "authoredInput"}, map[string]any{
				"type": constantSchema(RouteDecisionSendToAgent), "conversationId": identifierSchema(), "authoredInput": input,
			}),
			objectSchema([]string{"type", "conversationId", "question"}, map[string]any{
				"type": constantSchema(RouteDecisionAskNarrator), "conversationId": identifierSchema(), "question": textSchema(),
			}),
			objectSchema([]string{"type", "conversationId"}, map[string]any{
				"type": constantSchema(RouteDecisionFocusConversation), "conversationId": identifierSchema(),
			}),
			objectSchema([]string{"type", "workspaceId", "initialInput", "proposedTitle"}, map[string]any{
				"type": constantSchema(RouteDecisionCreateConversation), "workspaceId": identifierSchema(), "initialInput": input, "proposedTitle": textSchema(),
			}),
			objectSchema([]string{"type", "parentConversationId", "input"}, map[string]any{
				"type": constantSchema(RouteDecisionCreateSideConversation), "parentConversationId": identifierSchema(), "input": input,
			}),
			objectSchema([]string{"type", "parentConversationId", "forkedAtTurnId", "input"}, map[string]any{
				"type": constantSchema(RouteDecisionForkConversation), "parentConversationId": identifierSchema(), "forkedAtTurnId": identifierSchema(), "input": input,
			}),
			objectSchema([]string{"type", "question"}, map[string]any{
				"type": constantSchema(RouteDecisionClarify), "question": textSchema(),
			}),
			objectSchema([]string{"type", "text"}, map[string]any{
				"type": constantSchema(RouteDecisionAnswerGlobal), "text": textSchema(),
			}),
		},
	}
}

func objectSchema(required []string, properties map[string]any) map[string]any {
	return map[string]any{
		"type": "object", "additionalProperties": false,
		"required": required, "properties": properties,
	}
}

func constantSchema(value MasterRouteDecisionType) map[string]any {
	return map[string]any{"const": string(value)}
}

func identifierSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 1}
}

func textSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 1}
}
