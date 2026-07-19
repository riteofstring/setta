package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
)

type ConversationRouteCallResult struct {
	RequestID        string
	ConversationID   string
	Model            ModelResolution
	ProviderThreadID string
	ProviderTurnID   string
	InputBytes       int
	OutputBytes      int
	StructuredOutput json.RawMessage
	Decision         conversation.ConversationRouteDecision
	StartedAt        string
	EndedAt          string
}

type ConversationRouteCaller struct {
	models   *ModelResolver
	provider FreshStructuredCallProvider
	now      func() time.Time
}

func NewConversationRouteCaller(
	models *ModelResolver,
	provider FreshStructuredCallProvider,
) (*ConversationRouteCaller, error) {
	if models == nil {
		return nil, errors.New("conversation router model resolver is required")
	}
	if provider == nil {
		return nil, errors.New("conversation router structured provider is required")
	}
	return &ConversationRouteCaller{models: models, provider: provider, now: time.Now}, nil
}

func (caller *ConversationRouteCaller) Call(
	ctx context.Context,
	requestID string,
	workspaceRoot string,
	contextBundle ConversationRouteContextBundle,
) (ConversationRouteCallResult, error) {
	if err := validateConversationRouteCall(caller, ctx, requestID, workspaceRoot); err != nil {
		return ConversationRouteCallResult{}, err
	}
	input, err := freezeConversationRouteContext(contextBundle)
	if err != nil {
		return ConversationRouteCallResult{}, NewAttemptFailure(FailureKindInternal, err)
	}
	result := ConversationRouteCallResult{
		RequestID:      requestID,
		ConversationID: contextBundle.Authoritative.Conversation.ConversationID,
		InputBytes:     len(input),
		StartedAt:      caller.timestamp(),
	}
	resolution, err := caller.models.Resolve(
		ctx,
		contextBundle.Authoritative.Conversation.WorkspaceID,
		result.ConversationID,
	)
	result.Model = cloneModelResolution(resolution)
	if err != nil {
		return result, narratorModelResolutionFailure(ctx, err)
	}
	if result.InputBytes > resolution.RequestedProfile.ContextBudget.MaxInputBytes {
		return result, NewAttemptFailure(FailureKindContextBudgetExceeded, &ContextBudgetError{
			Kind:          ContextKind("input_route"),
			MaxInputBytes: resolution.RequestedProfile.ContextBudget.MaxInputBytes,
			RequiredBytes: result.InputBytes,
			Reason:        "the frozen local-routing context exceeds the freshly resolved narrator budget",
		})
	}
	schema, err := conversationRouteOutputSchema(contextBundle)
	if err != nil {
		return result, NewAttemptFailure(FailureKindInternal, err)
	}
	providerRequest := agent.FreshStructuredCallRequest{
		ID:                    requestID,
		WorkspaceRoot:         workspaceRoot,
		Invocation:            resolvedProviderInvocation(resolution),
		DeveloperInstructions: conversationRouteInstructions(),
		Input:                 input,
		OutputSchema:          schema,
	}
	if err := providerRequest.Validate(); err != nil {
		return result, NewAttemptFailure(
			FailureKindInternal,
			fmt.Errorf("validate conversation router provider call: %w", err),
		)
	}
	providerResult, err := caller.provider.RunFreshStructuredCall(ctx, providerRequest)
	if err != nil {
		return result, narratorCallFailure(
			ctx,
			FailureKindProviderUnavailable,
			fmt.Errorf("run conversation router call for %s: %w", result.ConversationID, err),
		)
	}
	completed, err := caller.completeConversationRouteCall(result, providerResult, contextBundle)
	if err == nil || !conversationRouteProviderOutputInvalid(err) {
		return completed, err
	}
	return caller.repairConversationRouteCall(ctx, providerRequest, completed, err, contextBundle)
}

func validateConversationRouteCall(
	caller *ConversationRouteCaller,
	ctx context.Context,
	requestID string,
	workspaceRoot string,
) error {
	if caller == nil || caller.models == nil || caller.provider == nil || caller.now == nil {
		return NewAttemptFailure(FailureKindInternal, errors.New("conversation router caller is required"))
	}
	if ctx == nil {
		return NewAttemptFailure(FailureKindInternal, errors.New("conversation router call context is required"))
	}
	if err := validateIdentifier("conversation router request id", requestID); err != nil {
		return NewAttemptFailure(FailureKindInternal, err)
	}
	if strings.TrimSpace(workspaceRoot) == "" || !filepath.IsAbs(workspaceRoot) {
		return NewAttemptFailure(
			FailureKindStateUnavailable,
			fmt.Errorf("conversation router workspace root must be absolute: %s", workspaceRoot),
		)
	}
	return nil
}

func (caller *ConversationRouteCaller) completeConversationRouteCall(
	result ConversationRouteCallResult,
	providerResult agent.FreshStructuredCallResult,
	contextBundle ConversationRouteContextBundle,
) (ConversationRouteCallResult, error) {
	result.ProviderThreadID = providerResult.ProviderThreadID
	result.ProviderTurnID = providerResult.ProviderTurnID
	result.OutputBytes = len(providerResult.Output)
	result.StructuredOutput = append(json.RawMessage{}, providerResult.Output...)
	endedAt, err := caller.timestampAfter(result.StartedAt)
	if err != nil {
		return result, NewAttemptFailure(FailureKindInternal, err)
	}
	result.EndedAt = endedAt
	if err := validateIdentifier("conversation router provider thread id", result.ProviderThreadID); err != nil {
		return result, NewAttemptFailure(FailureKindProviderOutputInvalid, err)
	}
	if err := validateIdentifier("conversation router provider turn id", result.ProviderTurnID); err != nil {
		return result, NewAttemptFailure(FailureKindProviderOutputInvalid, err)
	}
	decision, err := decodeConversationRouteOutput(providerResult.Output, contextBundle)
	if err != nil {
		return result, NewAttemptFailure(FailureKindProviderOutputInvalid, err)
	}
	result.Decision = decision
	return result, nil
}

func (caller *ConversationRouteCaller) repairConversationRouteCall(
	ctx context.Context,
	original agent.FreshStructuredCallRequest,
	previous ConversationRouteCallResult,
	validationErr error,
	contextBundle ConversationRouteContextBundle,
) (ConversationRouteCallResult, error) {
	repairID, err := conversationRouteRepairRequestID(original.ID)
	if err != nil {
		return previous, NewAttemptFailure(FailureKindInternal, err)
	}
	repairRequest := original
	repairRequest.ID = repairID
	repairRequest.DeveloperInstructions = conversationRouteRepairInstructions(validationErr)
	if err := repairRequest.Validate(); err != nil {
		return previous, NewAttemptFailure(
			FailureKindInternal,
			fmt.Errorf("validate conversation router repair provider call: %w", err),
		)
	}
	repair := previous
	repair.RequestID = repairID
	repair.ProviderThreadID = ""
	repair.ProviderTurnID = ""
	repair.OutputBytes = 0
	repair.StructuredOutput = nil
	repair.Decision = conversation.ConversationRouteDecision{}
	repair.StartedAt, err = caller.timestampAfter(previous.EndedAt)
	if err != nil {
		return previous, NewAttemptFailure(FailureKindInternal, err)
	}
	providerResult, err := caller.provider.RunFreshStructuredCall(ctx, repairRequest)
	if err != nil {
		return repair, narratorCallFailure(
			ctx,
			FailureKindProviderUnavailable,
			fmt.Errorf("repair conversation router call for %s: %w", repair.ConversationID, err),
		)
	}
	return caller.completeConversationRouteCall(repair, providerResult, contextBundle)
}

func conversationRouteRepairRequestID(requestID string) (string, error) {
	repairID := requestID + "_repair"
	if err := validateIdentifier("conversation router repair request id", repairID); err != nil {
		return "", err
	}
	return repairID, nil
}

func conversationRouteRepairInstructions(validationErr error) string {
	return conversationRouteInstructions() + "\n\n" + strings.Join([]string{
		"The previous routing decision was rejected by Setta's validator.",
		"Validation error: " + validationErr.Error(),
		"Return a fresh decision that satisfies the strict schema and the supplied allowedDecisionKinds exactly.",
	}, "\n")
}

func conversationRouteProviderOutputInvalid(err error) bool {
	var failure *AttemptFailure
	return errors.As(err, &failure) && failure.Kind == FailureKindProviderOutputInvalid
}

func freezeConversationRouteContext(
	contextBundle ConversationRouteContextBundle,
) (json.RawMessage, error) {
	encoded, err := json.Marshal(contextBundle)
	if err != nil {
		return nil, fmt.Errorf("encode conversation router call context: %w", err)
	}
	if len(encoded) != contextBundle.InputBytes {
		return nil, fmt.Errorf(
			"conversation router context encoded as %d bytes, materializer recorded %d",
			len(encoded),
			contextBundle.InputBytes,
		)
	}
	var frozen ConversationRouteContextBundle
	if err := json.Unmarshal(encoded, &frozen); err != nil {
		return nil, fmt.Errorf("freeze conversation router call context: %w", err)
	}
	return json.RawMessage(encoded), nil
}

func (caller *ConversationRouteCaller) timestamp() string {
	return caller.now().UTC().Format(time.RFC3339Nano)
}

func (caller *ConversationRouteCaller) timestampAfter(previous string) (string, error) {
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return "", fmt.Errorf("parse conversation router call start time: %w", err)
	}
	candidate := caller.now().UTC()
	if !candidate.After(previousTime) {
		candidate = previousTime.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

func conversationRouteInstructions() string {
	return strings.Join([]string{
		"Act only as Setta's conversation-local intent classifier and router. Use only the supplied authoritative input_route context JSON. Do not answer the user or perform a routed effect yourself.",
		"Return exactly one decision object whose kind is an allowedDecisionKinds value. Populate only the fields required by that strict schema branch.",
		"Classify the user's requested intent. The returned decision is typed data and is not itself an application action. Do not refuse, answer, or choose another branch merely because this restricted router cannot execute the later effect; Setta separately validates and executes authorized decisions.",
		"Route any actionable request that continues this topic to the parent agent: use send_to_parent when idle, and during active work distinguish queue_parent_turn from steer_parent_turn using the user's meaning. Actionable requests include implementation, edits, file or workspace operations, investigation, and requested deliverables. When queue versus steer is materially ambiguous, choose clarify if it is allowed.",
		"Use answer_as_narrator only to delegate a direct status or trajectory question to Setta's separate narrator projector. Never use it for a command, requested action, new task, workspace operation, or deliverable, even when the user also asks for a verbal confirmation. Use create_side_conversation for a bounded tangent tied to the originating pane, and fork_conversation for an explicitly durable child topic at one supplied completed fork point.",
		"Use escalate_to_master only when the input is unrelated to this topic and requires app-global routing. You cannot search, name, focus, or dispatch to another conversation.",
		"Preserve the user's intent in authoredInput. Do not invent provider ids, pane ids, endpoint names, filesystem operations, shell commands, tools, renderer commands, or global targets.",
		"If the context includes a clarification exchange, resolve one final non-clarify decision from the original input, question, and reply.",
	}, "\n")
}
