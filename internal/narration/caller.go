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

type FreshStructuredCallProvider interface {
	RunFreshStructuredCall(
		context.Context,
		agent.FreshStructuredCallRequest,
	) (agent.FreshStructuredCallResult, error)
}

var _ FreshStructuredCallProvider = (*agent.Runtime)(nil)

// CallRequest is a discriminated context envelope for one narrator provider
// invocation. Exactly one context branch is present. Status and checkpoint
// triggers are carried in their bundles just like projection triggers, so no
// string inference is needed at the provider boundary.
type CallRequest struct {
	ID            string
	Generation    uint64
	WorkspaceRoot string
	Projection    *ProjectionContextBundle
	Status        *StatusContextBundle
	Checkpoint    *CheckpointContextBundle
}

type CallResult struct {
	RequestID        string
	Generation       uint64
	Kind             RequestKind
	Trigger          conversation.NarrationTrigger
	ConversationID   string
	Model            ModelResolution
	ProviderThreadID string
	ProviderTurnID   string
	InputBytes       int
	OutputBytes      int
	StructuredOutput json.RawMessage
	NarratorOutput   *NarratorCallOutput
	CheckpointOutput *CheckpointOutput
	StartedAt        string
	EndedAt          string
}

type Caller struct {
	models   *ModelResolver
	provider FreshStructuredCallProvider
	now      func() time.Time
}

type CallerOption func(*Caller) error

func WithCallerClock(now func() time.Time) CallerOption {
	return func(caller *Caller) error {
		if now == nil {
			return errors.New("narrator caller clock is required")
		}
		caller.now = now
		return nil
	}
}

func NewCaller(
	models *ModelResolver,
	provider FreshStructuredCallProvider,
	options ...CallerOption,
) (*Caller, error) {
	if models == nil {
		return nil, errors.New("narrator caller model resolver is required")
	}
	if provider == nil {
		return nil, errors.New("narrator caller structured provider is required")
	}
	caller := &Caller{models: models, provider: provider, now: time.Now}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("narrator caller option must not be nil")
		}
		if err := option(caller); err != nil {
			return nil, err
		}
	}
	return caller, nil
}

func (caller *Caller) Call(ctx context.Context, request CallRequest) (CallResult, error) {
	if err := validateCaller(caller, ctx); err != nil {
		return CallResult{}, err
	}
	prepared, err := prepareCallRequest(request)
	if err != nil {
		return CallResult{}, err
	}
	result := preparedCallResult(request, prepared)
	result.StartedAt = caller.timestamp()
	resolution, err := caller.resolveModel(ctx, prepared)
	result.Model = cloneModelResolution(resolution)
	if err != nil {
		return result, err
	}
	providerResult, err := caller.runProviderCall(ctx, request, prepared, resolution)
	if err != nil {
		return result, err
	}
	result.ProviderThreadID = providerResult.ProviderThreadID
	result.ProviderTurnID = providerResult.ProviderTurnID
	result.OutputBytes = len(providerResult.Output)
	result.StructuredOutput = append(json.RawMessage{}, providerResult.Output...)
	result.EndedAt, err = caller.timestampAfter(result.StartedAt)
	if err != nil {
		return result, err
	}
	if err := validateIdentifier("narrator provider thread id", result.ProviderThreadID); err != nil {
		return result, err
	}
	if err := validateIdentifier("narrator provider turn id", result.ProviderTurnID); err != nil {
		return result, err
	}
	if err := decodeCallOutput(&result, prepared, providerResult.Output); err != nil {
		return result, err
	}
	return result, nil
}

func validateCaller(caller *Caller, ctx context.Context) error {
	if caller == nil || caller.models == nil || caller.provider == nil || caller.now == nil {
		return errors.New("narrator caller is required")
	}
	if ctx == nil {
		return errors.New("narrator call context is required")
	}
	return ctx.Err()
}

func (caller *Caller) timestamp() string {
	return caller.now().UTC().Format(time.RFC3339Nano)
}

func (caller *Caller) timestampAfter(previous string) (string, error) {
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return "", fmt.Errorf("parse narrator call start time: %w", err)
	}
	candidate := caller.now().UTC()
	if !candidate.After(previousTime) {
		candidate = previousTime.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

func (caller *Caller) resolveModel(
	ctx context.Context,
	prepared preparedCallRequest,
) (ModelResolution, error) {
	resolution, err := caller.models.Resolve(ctx, prepared.workspaceID, prepared.conversationID)
	if err != nil {
		return ModelResolution{}, err
	}
	if prepared.inputBytes > resolution.RequestedProfile.ContextBudget.MaxInputBytes {
		return resolution, fmt.Errorf(
			"narrator %s context has %d bytes, resolved role budget allows %d",
			prepared.kind,
			prepared.inputBytes,
			resolution.RequestedProfile.ContextBudget.MaxInputBytes,
		)
	}
	return resolution, nil
}

func (caller *Caller) runProviderCall(
	ctx context.Context,
	request CallRequest,
	prepared preparedCallRequest,
	resolution ModelResolution,
) (agent.FreshStructuredCallResult, error) {
	providerRequest := agent.FreshStructuredCallRequest{
		ID:                    request.ID,
		WorkspaceRoot:         request.WorkspaceRoot,
		Invocation:            resolvedProviderInvocation(resolution),
		DeveloperInstructions: prepared.instructions,
		Input:                 append(json.RawMessage{}, prepared.input...),
		OutputSchema:          append(json.RawMessage{}, prepared.outputSchema...),
	}
	if err := providerRequest.Validate(); err != nil {
		return agent.FreshStructuredCallResult{}, fmt.Errorf("validate narrator %s provider call: %w", prepared.kind, err)
	}
	result, err := caller.provider.RunFreshStructuredCall(ctx, providerRequest)
	if err != nil {
		return agent.FreshStructuredCallResult{}, fmt.Errorf(
			"run narrator %s call for conversation %s: %w",
			prepared.kind,
			prepared.conversationID,
			err,
		)
	}
	return result, nil
}

func preparedCallResult(
	request CallRequest,
	prepared preparedCallRequest,
) CallResult {
	return CallResult{
		RequestID:      request.ID,
		Generation:     request.Generation,
		Kind:           prepared.kind,
		Trigger:        prepared.trigger,
		ConversationID: prepared.conversationID,
		InputBytes:     prepared.inputBytes,
	}
}

func resolvedProviderInvocation(resolution ModelResolution) agent.Invocation {
	return agent.Invocation{
		Model:           resolution.Settings.ModelID,
		ReasoningEffort: string(resolution.Settings.ReasoningEffort),
		ServiceTier:     cloneOptionalString(resolution.Settings.ServiceTier),
		PermissionMode:  resolution.Invocation.PermissionMode,
		ApprovalMode:    resolution.Invocation.ApprovalMode,
	}
}

func cloneModelResolution(resolution ModelResolution) ModelResolution {
	cloned := resolution
	cloned.RequestedProfile.ModelSelection.ModelID = cloneOptionalString(resolution.RequestedProfile.ModelSelection.ModelID)
	cloned.RequestedProfile.ServiceTier = cloneOptionalString(resolution.RequestedProfile.ServiceTier)
	cloned.RequestedProfile.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		resolution.RequestedProfile.PermissionProfile.ToolAccess.AllowedTools...,
	)
	cloned.Invocation.ServiceTier = cloneOptionalString(resolution.Invocation.ServiceTier)
	cloned.Settings.ServiceTier = cloneOptionalString(resolution.Settings.ServiceTier)
	cloned.Settings.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		resolution.Settings.PermissionProfile.ToolAccess.AllowedTools...,
	)
	return cloned
}

type preparedCallRequest struct {
	kind           RequestKind
	trigger        conversation.NarrationTrigger
	conversationID string
	workspaceID    string
	input          json.RawMessage
	inputBytes     int
	outputSchema   json.RawMessage
	instructions   string
	projection     ProjectionContextBundle
	status         StatusContextBundle
	checkpoint     CheckpointContextBundle
}

func prepareCallRequest(request CallRequest) (preparedCallRequest, error) {
	if err := validateIdentifier("narrator call id", request.ID); err != nil {
		return preparedCallRequest{}, err
	}
	if request.Generation == 0 {
		return preparedCallRequest{}, errors.New("narrator call generation must be positive")
	}
	if strings.TrimSpace(request.WorkspaceRoot) == "" || !filepath.IsAbs(request.WorkspaceRoot) {
		return preparedCallRequest{}, fmt.Errorf("narrator call workspace root must be absolute: %s", request.WorkspaceRoot)
	}
	branches := 0
	for _, present := range []bool{request.Projection != nil, request.Status != nil, request.Checkpoint != nil} {
		if present {
			branches++
		}
	}
	if branches != 1 {
		return preparedCallRequest{}, fmt.Errorf("narrator call has %d context branches, want exactly one", branches)
	}
	if request.Projection != nil {
		return prepareProjectionCall(*request.Projection)
	}
	if request.Status != nil {
		return prepareStatusCall(*request.Status)
	}
	return prepareCheckpointCall(*request.Checkpoint)
}

func prepareProjectionCall(context ProjectionContextBundle) (preparedCallRequest, error) {
	frozen, input, err := freezeCallContext(context, context.InputBytes, "projection")
	if err != nil {
		return preparedCallRequest{}, err
	}
	frozen.InputBytes = context.InputBytes
	if frozen.Kind != ContextKindProjection || !isProjectionTrigger(frozen.Trigger) {
		return preparedCallRequest{}, fmt.Errorf("narrator projection call has kind/trigger %q/%q", frozen.Kind, frozen.Trigger)
	}
	if frozen.RequestedChannel != projectionChannel(frozen.Trigger) {
		return preparedCallRequest{}, fmt.Errorf(
			"narrator projection trigger %s does not match channel %s",
			frozen.Trigger,
			frozen.RequestedChannel,
		)
	}
	if err := frozen.ValidateObservedAdvance(frozen.EvaluationRange.End); err != nil {
		return preparedCallRequest{}, err
	}
	schema, err := projectionOutputSchema(frozen)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(frozen.Authoritative, RequestKindProjection)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = frozen.Trigger
	prepared.input = input
	prepared.inputBytes = frozen.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = projectionInstructions(frozen.RequestedChannel)
	prepared.projection = frozen
	return prepared, nil
}

func prepareStatusCall(context StatusContextBundle) (preparedCallRequest, error) {
	frozen, input, err := freezeCallContext(context, context.InputBytes, "status")
	if err != nil {
		return preparedCallRequest{}, err
	}
	frozen.InputBytes = context.InputBytes
	if frozen.Kind != ContextKindStatus || frozen.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
		return preparedCallRequest{}, fmt.Errorf("narrator status call has kind/trigger %q/%q", frozen.Kind, frozen.Trigger)
	}
	if strings.TrimSpace(frozen.Question) == "" || strings.TrimSpace(frozen.Question) != frozen.Question {
		return preparedCallRequest{}, errors.New("narrator status call question is required without surrounding whitespace")
	}
	if frozen.SourceThroughSequence < 0 {
		return preparedCallRequest{}, errors.New("narrator status source sequence must be non-negative")
	}
	schema, err := statusOutputSchema(frozen)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(frozen.Authoritative, RequestKindStatus)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = frozen.Trigger
	prepared.input = input
	prepared.inputBytes = frozen.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = statusInstructions()
	prepared.status = frozen
	return prepared, nil
}

func prepareCheckpointCall(context CheckpointContextBundle) (preparedCallRequest, error) {
	frozen, input, err := freezeCallContext(context, context.InputBytes, "checkpoint")
	if err != nil {
		return preparedCallRequest{}, err
	}
	frozen.InputBytes = context.InputBytes
	if err := validateCheckpointBundle(frozen); err != nil {
		return preparedCallRequest{}, err
	}
	schema, err := checkpointOutputSchema(frozen)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(frozen.Authoritative, RequestKindCheckpoint)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = frozen.Trigger
	prepared.input = input
	prepared.inputBytes = frozen.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = checkpointInstructions()
	prepared.checkpoint = frozen
	return prepared, nil
}

func preparedContextIdentity(
	authoritative AuthoritativeContext,
	kind RequestKind,
) (preparedCallRequest, error) {
	conversationID := authoritative.Conversation.ConversationID
	workspaceID := authoritative.Conversation.WorkspaceID
	if err := validateIdentifier("narrator call conversation id", conversationID); err != nil {
		return preparedCallRequest{}, err
	}
	if err := validateIdentifier("narrator call workspace id", workspaceID); err != nil {
		return preparedCallRequest{}, err
	}
	return preparedCallRequest{
		kind:           kind,
		conversationID: conversationID,
		workspaceID:    workspaceID,
	}, nil
}

func encodeCallContext(value any, recordedBytes int) (json.RawMessage, error) {
	if recordedBytes <= 0 {
		return nil, errors.New("narrator call context byte count must be positive")
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode narrator call context: %w", err)
	}
	if len(encoded) != recordedBytes {
		return nil, fmt.Errorf(
			"narrator call context encoded as %d bytes, materialized bundle recorded %d",
			len(encoded),
			recordedBytes,
		)
	}
	return json.RawMessage(encoded), nil
}

func freezeCallContext[T any](value T, recordedBytes int, label string) (T, json.RawMessage, error) {
	input, err := encodeCallContext(value, recordedBytes)
	if err != nil {
		var zero T
		return zero, nil, err
	}
	var frozen T
	if err := json.Unmarshal(input, &frozen); err != nil {
		var zero T
		return zero, nil, fmt.Errorf("freeze narrator %s call context: %w", label, err)
	}
	return frozen, input, nil
}

func decodeCallOutput(result *CallResult, prepared preparedCallRequest, raw json.RawMessage) error {
	switch result.Kind {
	case RequestKindProjection:
		output, err := decodeProjectionOutput(raw, prepared.projection)
		if err != nil {
			return fmt.Errorf("validate narrator projection output: %w", err)
		}
		result.NarratorOutput = &output
	case RequestKindStatus:
		output, err := decodeStatusOutput(raw, prepared.status)
		if err != nil {
			return fmt.Errorf("validate narrator status output: %w", err)
		}
		result.NarratorOutput = &output
	case RequestKindCheckpoint:
		output, err := decodeCheckpointOutput(raw, prepared.checkpoint)
		if err != nil {
			return fmt.Errorf("validate narrator checkpoint output: %w", err)
		}
		result.CheckpointOutput = &output
	default:
		return fmt.Errorf("decode narrator output for unsupported call kind %q", result.Kind)
	}
	return nil
}

func projectionInstructions(channel ProjectionChannel) string {
	lines := []string{
		"Act as Setta's narrator projector. Use only the supplied authoritative context JSON.",
		"Current objective, constraints, and accepted steering override historical checkpoint text.",
		"Keep currentFocus concise and voice-ready. Emit only sparse phase-change milestones; an empty milestones array is valid.",
		"Never repeat an exact prior active-turn milestone supplied in the context. Do not infer phases from keywords or command names.",
	}
	if channel == ProjectionChannelTerminal {
		lines = append(lines, "Return the terminal projection with exactly one bounded finalSummary for this turn.")
	} else {
		lines = append(lines, "Return the working projection only; do not invent a final summary or status reply.")
	}
	return strings.Join(lines, "\n")
}

func statusInstructions() string {
	return strings.Join([]string{
		"Act as Setta's narrator status responder. Use only the supplied read-only status context JSON.",
		"Answer the exact question from authoritative current state and explicitly represented trajectory ranges.",
		"Return one concise voice-ready status reply. Do not emit projection fields or claim to advance a cursor.",
	}, "\n")
}

func checkpointInstructions() string {
	return strings.Join([]string{
		"Act as Setta's historical narrator checkpoint compactor. Use only the supplied checkpoint context JSON.",
		"Summarize exactly the requested contiguous already-observed range together with the prior historical checkpoint.",
		"Current objective, constraints, and steering are authoritative context only and must not be redefined by the historical summary.",
		"Return only the exact coveredThroughSequence and a non-empty bounded historicalSummary.",
	}, "\n")
}
