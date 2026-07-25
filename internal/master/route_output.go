package master

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"setta/internal/jsonio"
)

type routeWireEnvelope struct {
	Decision json.RawMessage `json:"decision"`
}

type routeWireHeader struct {
	Kind RouteDecisionKind `json:"kind"`
}

type routeWireConversationInput struct {
	Kind           RouteDecisionKind `json:"kind"`
	ConversationID string            `json:"conversationId"`
	AuthoredInput  string            `json:"authoredInput"`
}

type routeWireConversationQuestion struct {
	Kind           RouteDecisionKind `json:"kind"`
	ConversationID string            `json:"conversationId"`
	Question       string            `json:"question"`
}

type routeWireConversation struct {
	Kind           RouteDecisionKind `json:"kind"`
	ConversationID string            `json:"conversationId"`
}

type routeWireCreateConversation struct {
	Kind          RouteDecisionKind  `json:"kind"`
	ResourceScope RouteResourceScope `json:"resourceScope"`
	InitialInput  string             `json:"initialInput"`
	ProposedTitle string             `json:"proposedTitle"`
}

type routeWireParentInput struct {
	Kind                 RouteDecisionKind `json:"kind"`
	ParentConversationID string            `json:"parentConversationId"`
	Input                string            `json:"input"`
}

type routeWireFork struct {
	Kind                 RouteDecisionKind `json:"kind"`
	ParentConversationID string            `json:"parentConversationId"`
	ForkedAtTurnID       string            `json:"forkedAtTurnId"`
	Input                string            `json:"input"`
}

type routeWireText struct {
	Kind RouteDecisionKind `json:"kind"`
	Text string            `json:"text"`
}

type routeWireQuestion struct {
	Kind     RouteDecisionKind `json:"kind"`
	Question string            `json:"question"`
}

func routeOutputSchema(context RouteContextBundle) (json.RawMessage, error) {
	if err := context.Validate(); err != nil {
		return nil, err
	}
	variants := make([]any, 0, len(context.AllowedDecisionKinds))
	for _, kind := range context.AllowedDecisionKinds {
		if kind == RouteDecisionKindCreateConversation {
			createVariants, err := routeCreateConversationOutputSchemas(context.OpenWorkspaces)
			if err != nil {
				return nil, err
			}
			variants = append(variants, createVariants...)
			continue
		}
		if kind == RouteDecisionKindForkConversation {
			forkVariants, err := routeForkDecisionOutputSchemas(context.ConversationTargets)
			if err != nil {
				return nil, err
			}
			variants = append(variants, forkVariants...)
			continue
		}
		variant, err := routeDecisionOutputSchema(context, kind)
		if err != nil {
			return nil, err
		}
		variants = append(variants, variant)
	}
	return marshalRouteSchema(routeStrictObject(map[string]any{
		"decision": map[string]any{
			"description": "Classify the request as exactly one authorized Setta route decision. The output is data, not an application action. Never encode a refusal or apology when an authorized branch resolves the request.",
			"anyOf":       variants,
		},
	}))
}

func routeDecisionOutputSchema(
	context RouteContextBundle,
	kind RouteDecisionKind,
) (map[string]any, error) {
	properties := map[string]any{"kind": routeEnumSchema(string(kind))}
	if err := populateRouteDecisionOutputProperties(context, kind, properties); err != nil {
		return nil, err
	}
	variant := routeStrictObject(properties)
	variant["description"] = routeDecisionSchemaDescription(kind)
	return variant, nil
}

func populateRouteDecisionOutputProperties(
	context RouteContextBundle,
	kind RouteDecisionKind,
	properties map[string]any,
) error {
	if isConversationRouteDecisionKind(kind) {
		return populateConversationRouteOutputProperties(context, kind, properties)
	}
	return populateGlobalRouteOutputProperties(context, kind, properties)
}

func populateConversationRouteOutputProperties(
	context RouteContextBundle,
	kind RouteDecisionKind,
	properties map[string]any,
) error {
	switch kind {
	case RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn:
		ids := routeTargetIDsForKind(context.ConversationTargets, kind)
		if len(ids) == 0 {
			return fmt.Errorf("master route output %s has no authorized target", kind)
		}
		properties["conversationId"] = routeStringEnumSchema(ids)
		properties["authoredInput"] = routeBoundedStringSchema(MaxRouteAuthoredInputBytes)
	case RouteDecisionKindAskNarrator:
		ids := routeTargetIDsForKind(context.ConversationTargets, kind)
		if len(ids) == 0 {
			return errors.New("master route narrator output has no authorized target")
		}
		properties["conversationId"] = routeStringEnumSchema(ids)
		properties["question"] = routeBoundedStringSchema(MaxRouteQuestionBytes)
	case RouteDecisionKindFocusConversation:
		ids := routeTargetIDsForKind(context.ConversationTargets, kind)
		if len(ids) == 0 {
			return errors.New("master route focus output has no authorized target")
		}
		properties["conversationId"] = routeStringEnumSchema(ids)
	default:
		return fmt.Errorf("unsupported conversation master route output kind %q", kind)
	}
	return nil
}

func populateGlobalRouteOutputProperties(
	context RouteContextBundle,
	kind RouteDecisionKind,
	properties map[string]any,
) error {
	switch kind {
	case RouteDecisionKindCreateConversation:
		properties["resourceScope"] = routeResourceScopeOutputSchema(FolderlessRouteResourceScope())
		properties["initialInput"] = routeBoundedStringSchema(MaxRouteAuthoredInputBytes)
		properties["proposedTitle"] = routeBoundedStringSchema(MaxRouteConversationTitle)
	case RouteDecisionKindCreateSideConversation:
		ids := routeTargetIDsForKind(context.ConversationTargets, kind)
		if len(ids) == 0 {
			return errors.New("master route side output has no authorized parent")
		}
		properties["parentConversationId"] = routeStringEnumSchema(ids)
		properties["input"] = routeBoundedStringSchema(MaxRouteAuthoredInputBytes)
	case RouteDecisionKindClarify:
		properties["question"] = routeBoundedStringSchema(MaxRouteQuestionBytes)
	case RouteDecisionKindAnswerGlobal:
		properties["text"] = routeBoundedStringSchema(MaxRouteAnswerBytes)
	default:
		return fmt.Errorf("unsupported master route output kind %q", kind)
	}
	return nil
}

func routeCreateConversationOutputSchemas(workspaces []RouteWorkspaceContext) ([]any, error) {
	scopes := make([]RouteResourceScope, 0, len(workspaces)+1)
	scopes = append(scopes, FolderlessRouteResourceScope())
	for _, workspace := range workspaces {
		scopes = append(scopes, FolderRouteResourceScope(workspace.WorkspaceID, workspace.WorkspaceName))
	}
	variants := make([]any, 0, len(scopes))
	for _, scope := range scopes {
		if err := scope.Validate(); err != nil {
			return nil, err
		}
		variant := routeStrictObject(map[string]any{
			"kind":          routeEnumSchema(string(RouteDecisionKindCreateConversation)),
			"resourceScope": routeResourceScopeOutputSchema(scope),
			"initialInput":  routeBoundedStringSchema(MaxRouteAuthoredInputBytes),
			"proposedTitle": routeBoundedStringSchema(MaxRouteConversationTitle),
		})
		variant["description"] = routeDecisionSchemaDescription(RouteDecisionKindCreateConversation)
		variants = append(variants, variant)
	}
	return variants, nil
}

func routeResourceScopeOutputSchema(scope RouteResourceScope) map[string]any {
	switch scope.Kind {
	case RouteResourceScopeKindFolderless:
		return routeStrictObject(map[string]any{
			"kind": routeEnumSchema(string(RouteResourceScopeKindFolderless)),
		})
	case RouteResourceScopeKindFolder:
		return routeStrictObject(map[string]any{
			"kind": routeEnumSchema(string(RouteResourceScopeKindFolder)),
			"folder": routeStrictObject(map[string]any{
				"workspaceId":   routeEnumSchema(scope.Folder.WorkspaceID),
				"workspaceName": routeEnumSchema(scope.Folder.WorkspaceName),
			}),
		})
	default:
		panic(fmt.Sprintf("unsupported master route resource scope kind %q", scope.Kind))
	}
}

func routeForkDecisionOutputSchemas(targets []RouteConversationTarget) ([]any, error) {
	variants := make([]any, 0)
	for _, target := range targets {
		if !slices.Contains(target.AllowedDecisionKinds, RouteDecisionKindForkConversation) {
			continue
		}
		turnIDs := make([]string, len(target.CompletedForkPoints))
		for index, point := range target.CompletedForkPoints {
			turnIDs[index] = point.TurnID
		}
		if len(turnIDs) == 0 {
			return nil, fmt.Errorf("master route fork target %s has no completed turn", target.ConversationID)
		}
		variant := routeStrictObject(map[string]any{
			"kind":                 routeEnumSchema(string(RouteDecisionKindForkConversation)),
			"parentConversationId": routeEnumSchema(target.ConversationID),
			"forkedAtTurnId":       routeStringEnumSchema(turnIDs),
			"input":                routeBoundedStringSchema(MaxRouteAuthoredInputBytes),
		})
		variant["description"] = routeDecisionSchemaDescription(RouteDecisionKindForkConversation)
		variants = append(variants, variant)
	}
	if len(variants) == 0 {
		return nil, errors.New("master route fork output has no authorized parent")
	}
	return variants, nil
}

func routeDecisionSchemaDescription(kind RouteDecisionKind) string {
	switch kind {
	case RouteDecisionKindSendToAgent:
		return "Classify intent to start new work on one supplied non-active topic conversation."
	case RouteDecisionKindQueueAgentTurn:
		return "Classify intent to preserve one supplied active turn and queue authored work after it."
	case RouteDecisionKindSteerActiveTurn:
		return "Classify intent to change one supplied active turn with the authored input."
	case RouteDecisionKindAskNarrator:
		return "Classify intent to ask one supplied topic narrator for a compact status answer."
	case RouteDecisionKindFocusConversation:
		return "Classify intent to focus, show, open, or bring up one supplied existing conversation; selecting this label does not manipulate renderer state."
	case RouteDecisionKindCreateConversation:
		return "Classify intent to create a new durable topic conversation with folderless scope or one supplied active folder resource scope."
	case RouteDecisionKindCreateSideConversation:
		return "Classify intent to create an ephemeral tangent under one supplied parent conversation."
	case RouteDecisionKindForkConversation:
		return "Classify intent to create a durable fork from one supplied parent and one completed turn authorized for that same parent."
	case RouteDecisionKindClarify:
		return "Ask one necessary routing clarification when target or action intent is genuinely ambiguous."
	case RouteDecisionKindAnswerGlobal:
		return "Answer an app-global conversational question that requires no topic operation; never use this branch for a refusal or apology."
	default:
		panic(fmt.Sprintf("unsupported master route schema description kind %q", kind))
	}
}

func decodeRouteOutput(raw json.RawMessage, context RouteContextBundle) (RouteDecision, error) {
	var envelope routeWireEnvelope
	if err := decodeRouteWire(raw, &envelope); err != nil {
		return RouteDecision{}, err
	}
	var header routeWireHeader
	if err := json.Unmarshal(envelope.Decision, &header); err != nil {
		return RouteDecision{}, fmt.Errorf("decode master route decision kind: %w", err)
	}
	if !slices.Contains(context.AllowedDecisionKinds, header.Kind) {
		return RouteDecision{}, fmt.Errorf("master returned disallowed route decision %q", header.Kind)
	}
	decision, err := decodeRouteDecision(envelope.Decision, header.Kind)
	if err != nil {
		return RouteDecision{}, err
	}
	if err := contextDecisionAudit(context).ValidateDecision(decision); err != nil {
		return RouteDecision{}, fmt.Errorf("validate master route decision authority: %w", err)
	}
	return decision, nil
}

func decodeRouteDecision(raw json.RawMessage, kind RouteDecisionKind) (RouteDecision, error) {
	if isAgentWorkRouteDecisionKind(kind) {
		return decodeAgentWorkRouteDecision(raw, kind)
	}
	if isConversationRouteDecisionKind(kind) {
		return decodeConversationPresentationRouteDecision(raw, kind)
	}
	if isCreationRouteDecisionKind(kind) {
		return decodeCreationRouteDecision(raw, kind)
	}
	return decodeGlobalTextRouteDecision(raw, kind)
}

func decodeAgentWorkRouteDecision(raw json.RawMessage, kind RouteDecisionKind) (RouteDecision, error) {
	var wire routeWireConversationInput
	if err := decodeRouteWire(raw, &wire); err != nil {
		return RouteDecision{}, err
	}
	return routeConversationInputDecision(kind, wire.ConversationID, wire.AuthoredInput)
}

func decodeConversationPresentationRouteDecision(
	raw json.RawMessage,
	kind RouteDecisionKind,
) (RouteDecision, error) {
	switch kind {
	case RouteDecisionKindAskNarrator:
		var wire routeWireConversationQuestion
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, AskNarrator: &MasterAskNarratorRouteDecision{
			ConversationID: wire.ConversationID, Question: wire.Question,
		}}, nil
	case RouteDecisionKindFocusConversation:
		var wire routeWireConversation
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, FocusConversation: &MasterFocusConversationRouteDecision{
			ConversationID: wire.ConversationID,
		}}, nil
	default:
		return RouteDecision{}, fmt.Errorf("unsupported conversation master route output kind %q", kind)
	}
}

func isCreationRouteDecisionKind(kind RouteDecisionKind) bool {
	switch kind {
	case RouteDecisionKindCreateConversation,
		RouteDecisionKindCreateSideConversation,
		RouteDecisionKindForkConversation:
		return true
	default:
		return false
	}
}

func decodeCreationRouteDecision(raw json.RawMessage, kind RouteDecisionKind) (RouteDecision, error) {
	switch kind {
	case RouteDecisionKindCreateConversation:
		var wire routeWireCreateConversation
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, CreateConversation: &MasterCreateConversationRouteDecision{
			ResourceScope: wire.ResourceScope, InitialInput: wire.InitialInput, ProposedTitle: wire.ProposedTitle,
		}}, nil
	case RouteDecisionKindCreateSideConversation:
		var wire routeWireParentInput
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, CreateSideConversation: &MasterCreateSideConversationRouteDecision{
			ParentConversationID: wire.ParentConversationID, Input: wire.Input,
		}}, nil
	case RouteDecisionKindForkConversation:
		var wire routeWireFork
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, ForkConversation: &MasterForkConversationRouteDecision{
			ParentConversationID: wire.ParentConversationID,
			ForkedAtTurnID:       wire.ForkedAtTurnID,
			Input:                wire.Input,
		}}, nil
	default:
		return RouteDecision{}, fmt.Errorf("unsupported creation master route output kind %q", kind)
	}
}

func decodeGlobalTextRouteDecision(raw json.RawMessage, kind RouteDecisionKind) (RouteDecision, error) {
	switch kind {
	case RouteDecisionKindClarify:
		var wire routeWireQuestion
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, Clarify: &MasterClarifyRouteDecision{Question: wire.Question}}, nil
	case RouteDecisionKindAnswerGlobal:
		var wire routeWireText
		if err := decodeRouteWire(raw, &wire); err != nil {
			return RouteDecision{}, err
		}
		return RouteDecision{Kind: kind, AnswerGlobal: &MasterAnswerGlobalRouteDecision{Text: wire.Text}}, nil
	default:
		return RouteDecision{}, fmt.Errorf("unsupported master route output kind %q", kind)
	}
}

func routeConversationInputDecision(
	kind RouteDecisionKind,
	conversationID string,
	input string,
) (RouteDecision, error) {
	switch kind {
	case RouteDecisionKindSendToAgent:
		return RouteDecision{Kind: kind, SendToAgent: &MasterSendToAgentRouteDecision{
			ConversationID: conversationID, AuthoredInput: input,
		}}, nil
	case RouteDecisionKindQueueAgentTurn:
		return RouteDecision{Kind: kind, QueueAgentTurn: &MasterQueueAgentTurnRouteDecision{
			ConversationID: conversationID, AuthoredInput: input,
		}}, nil
	case RouteDecisionKindSteerActiveTurn:
		return RouteDecision{Kind: kind, SteerActiveTurn: &MasterSteerActiveTurnRouteDecision{
			ConversationID: conversationID, AuthoredInput: input,
		}}, nil
	default:
		return RouteDecision{}, fmt.Errorf("master route decision %s does not carry conversation input", kind)
	}
}

func routeTargetIDsForKind(
	targets []RouteConversationTarget,
	kind RouteDecisionKind,
) []string {
	ids := make([]string, 0, len(targets))
	for _, target := range targets {
		if slices.Contains(target.AllowedDecisionKinds, kind) {
			ids = append(ids, target.ConversationID)
		}
	}
	return ids
}

func contextDecisionAudit(context RouteContextBundle) RouteContextAudit {
	return routeContextAuditForBundle(context)
}

func decodeRouteWire(raw json.RawMessage, target any) error {
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), target); err != nil {
		return fmt.Errorf("decode master route output: %w", err)
	}
	return nil
}

func marshalRouteSchema(schema map[string]any) (json.RawMessage, error) {
	raw, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("encode master route output schema: %w", err)
	}
	return raw, nil
}

func routeStrictObject(properties map[string]any) map[string]any {
	required := make([]string, 0, len(properties))
	for name := range properties {
		required = append(required, name)
	}
	slices.Sort(required)
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}
}

func routeEnumSchema(value string) map[string]any {
	return map[string]any{"type": "string", "enum": []string{value}}
}

func routeStringEnumSchema(values []string) map[string]any {
	return map[string]any{"type": "string", "enum": append([]string{}, values...)}
}

func routeBoundedStringSchema(maximum int) map[string]any {
	return map[string]any{"type": "string", "minLength": 1, "maxLength": maximum}
}

func routeInstructions() string {
	return `Use only the supplied master_route JSON and return exactly one decision matching the output schema.

Treat focused and originating ids as hints only. Candidate cards and conversationTargets are the bounded authoritative routing set. Use only allowedDecisionKinds and the exact target, resource scope, and completed fork ids supplied. Never invent ids, resource bindings, provider references, endpoint names, renderer commands, tool calls, or filesystem operations.

Classify the user's requested intent; the returned decision is typed data and is not itself an application action or proposal. Do not refuse a valid classification merely because you cannot execute its possible later effect. In particular, focus_conversation labels intent to focus an existing supplied conversation and is not a renderer command. Choose it when the user explicitly asks to focus, show, open, or bring up one matching authorized conversation. Never use answer_global as a refusal or apology for an authorized classification; choose clarify if no supplied capability can resolve the request.

Choose send_to_agent only for an available non-active target. queue_agent_turn preserves an active turn; steer_active_turn changes it. Choose create_conversation with folderless resourceScope for a new app-level topic unless the user explicitly asks to bind the new topic to one supplied open folder. If that distinction or the intended target is genuinely ambiguous, choose clarify. Use answer_global only for an app-global conversational answer that requires no topic operation.`
}
