package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

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
}

type Caller struct {
	models   *ModelResolver
	provider FreshStructuredCallProvider
}

func NewCaller(models *ModelResolver, provider FreshStructuredCallProvider) (*Caller, error) {
	if models == nil {
		return nil, errors.New("narrator caller model resolver is required")
	}
	if provider == nil {
		return nil, errors.New("narrator caller structured provider is required")
	}
	return &Caller{models: models, provider: provider}, nil
}

func (caller *Caller) Call(ctx context.Context, request CallRequest) (CallResult, error) {
	if err := validateCaller(caller, ctx); err != nil {
		return CallResult{}, err
	}
	prepared, err := prepareCallRequest(request)
	if err != nil {
		return CallResult{}, err
	}
	resolution, err := caller.resolveModel(ctx, prepared)
	if err != nil {
		return CallResult{}, err
	}
	providerResult, err := caller.runProviderCall(ctx, request, prepared, resolution)
	if err != nil {
		return CallResult{}, err
	}
	result, err := newCallResult(request, prepared, resolution, providerResult)
	if err != nil {
		return CallResult{}, err
	}
	if err := decodeCallOutput(&result, request, providerResult.Output); err != nil {
		return CallResult{}, err
	}
	return result, nil
}

func validateCaller(caller *Caller, ctx context.Context) error {
	if caller == nil || caller.models == nil || caller.provider == nil {
		return errors.New("narrator caller is required")
	}
	if ctx == nil {
		return errors.New("narrator call context is required")
	}
	return ctx.Err()
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
		return ModelResolution{}, fmt.Errorf(
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
	invocation := resolution.Invocation
	invocation.ServiceTier = cloneOptionalString(resolution.Invocation.ServiceTier)
	result, err := caller.provider.RunFreshStructuredCall(ctx, agent.FreshStructuredCallRequest{
		ID:                    request.ID,
		WorkspaceRoot:         request.WorkspaceRoot,
		Invocation:            invocation,
		DeveloperInstructions: prepared.instructions,
		Input:                 append(json.RawMessage{}, prepared.input...),
		OutputSchema:          append(json.RawMessage{}, prepared.outputSchema...),
	})
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

func newCallResult(
	request CallRequest,
	prepared preparedCallRequest,
	resolution ModelResolution,
	providerResult agent.FreshStructuredCallResult,
) (CallResult, error) {
	if err := validateIdentifier("narrator provider thread id", providerResult.ProviderThreadID); err != nil {
		return CallResult{}, err
	}
	if err := validateIdentifier("narrator provider turn id", providerResult.ProviderTurnID); err != nil {
		return CallResult{}, err
	}
	return CallResult{
		RequestID:        request.ID,
		Generation:       request.Generation,
		Kind:             prepared.kind,
		Trigger:          prepared.trigger,
		ConversationID:   prepared.conversationID,
		Model:            resolution,
		ProviderThreadID: providerResult.ProviderThreadID,
		ProviderTurnID:   providerResult.ProviderTurnID,
		InputBytes:       prepared.inputBytes,
		OutputBytes:      len(providerResult.Output),
		StructuredOutput: append(json.RawMessage{}, providerResult.Output...),
	}, nil
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
	if context.Kind != ContextKindProjection || !isProjectionTrigger(context.Trigger) {
		return preparedCallRequest{}, fmt.Errorf("narrator projection call has kind/trigger %q/%q", context.Kind, context.Trigger)
	}
	if context.RequestedChannel != projectionChannel(context.Trigger) {
		return preparedCallRequest{}, fmt.Errorf(
			"narrator projection trigger %s does not match channel %s",
			context.Trigger,
			context.RequestedChannel,
		)
	}
	if err := context.ValidateObservedAdvance(context.EvaluationRange.End); err != nil {
		return preparedCallRequest{}, err
	}
	schema, err := projectionOutputSchema(context)
	if err != nil {
		return preparedCallRequest{}, err
	}
	input, err := encodeCallContext(context, context.InputBytes)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(context.Authoritative, RequestKindProjection)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = context.Trigger
	prepared.input = input
	prepared.inputBytes = context.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = projectionInstructions(context.RequestedChannel)
	return prepared, nil
}

func prepareStatusCall(context StatusContextBundle) (preparedCallRequest, error) {
	if context.Kind != ContextKindStatus || context.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
		return preparedCallRequest{}, fmt.Errorf("narrator status call has kind/trigger %q/%q", context.Kind, context.Trigger)
	}
	if strings.TrimSpace(context.Question) == "" || strings.TrimSpace(context.Question) != context.Question {
		return preparedCallRequest{}, errors.New("narrator status call question is required without surrounding whitespace")
	}
	if context.SourceThroughSequence < 0 {
		return preparedCallRequest{}, errors.New("narrator status source sequence must be non-negative")
	}
	schema, err := statusOutputSchema(context)
	if err != nil {
		return preparedCallRequest{}, err
	}
	input, err := encodeCallContext(context, context.InputBytes)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(context.Authoritative, RequestKindStatus)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = context.Trigger
	prepared.input = input
	prepared.inputBytes = context.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = statusInstructions()
	return prepared, nil
}

func prepareCheckpointCall(context CheckpointContextBundle) (preparedCallRequest, error) {
	if err := validateCheckpointBundle(context); err != nil {
		return preparedCallRequest{}, err
	}
	schema, err := checkpointOutputSchema(context)
	if err != nil {
		return preparedCallRequest{}, err
	}
	input, err := encodeCallContext(context, context.InputBytes)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared, err := preparedContextIdentity(context.Authoritative, RequestKindCheckpoint)
	if err != nil {
		return preparedCallRequest{}, err
	}
	prepared.trigger = context.Trigger
	prepared.input = input
	prepared.inputBytes = context.InputBytes
	prepared.outputSchema = schema
	prepared.instructions = checkpointInstructions()
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

func decodeCallOutput(result *CallResult, request CallRequest, raw json.RawMessage) error {
	switch result.Kind {
	case RequestKindProjection:
		output, err := decodeProjectionOutput(raw, *request.Projection)
		if err != nil {
			return fmt.Errorf("validate narrator projection output: %w", err)
		}
		result.NarratorOutput = &output
	case RequestKindStatus:
		output, err := decodeStatusOutput(raw, *request.Status)
		if err != nil {
			return fmt.Errorf("validate narrator status output: %w", err)
		}
		result.NarratorOutput = &output
	case RequestKindCheckpoint:
		output, err := decodeCheckpointOutput(raw, *request.Checkpoint)
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
