package narration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"reflect"
	"time"

	"setta/internal/conversation"
)

type NarratorOutputStore interface {
	CommitNarratorProjection(
		context.Context,
		conversation.NarratorProjectionCommit,
	) (conversation.NarratorProjectionCommitResult, error)
	CommitNarratorStatus(
		context.Context,
		conversation.NarratorStatusCommit,
	) (conversation.NarratorStatusCommitResult, error)
	CommitNarratorCheckpoint(
		context.Context,
		conversation.NarratorCheckpointCommit,
	) (conversation.NarratorState, error)
}

var _ NarratorOutputStore = (*conversation.Store)(nil)

type OutputCommitterOption func(*OutputCommitter) error

type OutputCommitter struct {
	store NarratorOutputStore
	newID func(string) (string, error)
}

func WithOutputCommitterIDGenerator(generator func(string) (string, error)) OutputCommitterOption {
	return func(committer *OutputCommitter) error {
		if generator == nil {
			return errors.New("narrator output id generator is required")
		}
		committer.newID = generator
		return nil
	}
}

func NewOutputCommitter(
	store NarratorOutputStore,
	options ...OutputCommitterOption,
) (*OutputCommitter, error) {
	if store == nil {
		return nil, errors.New("narrator output store is required")
	}
	committer := &OutputCommitter{store: store, newID: randomOutputID}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("narrator output committer option must not be nil")
		}
		if err := option(committer); err != nil {
			return nil, err
		}
	}
	return committer, nil
}

// Prepare freezes and revalidates a successful structured call before
// returning the bounded store mutation that the per-conversation actor may
// commit while this invocation generation is still eligible.
func (committer *OutputCommitter) Prepare(
	request CallRequest,
	result CallResult,
) (PreparedCommit, error) {
	if err := committer.validate(); err != nil {
		return nil, err
	}
	prepared, err := prepareWitnessedCallRequest(request, result)
	if err != nil {
		return nil, err
	}
	frozen, err := freezeSuccessfulCallResult(request, prepared, result)
	if err != nil {
		return nil, err
	}
	invocation, err := committer.successfulInvocation(frozen)
	if err != nil {
		return nil, err
	}
	switch prepared.kind {
	case RequestKindProjection:
		return committer.prepareProjection(prepared.projection, frozen, invocation)
	case RequestKindStatus:
		return committer.prepareStatus(prepared.status, frozen, invocation)
	case RequestKindCheckpoint:
		return committer.prepareCheckpoint(prepared.checkpoint, frozen, invocation)
	default:
		return nil, fmt.Errorf("prepare narrator output for unsupported kind %q", prepared.kind)
	}
}

func (committer *OutputCommitter) validate() error {
	if committer == nil || committer.store == nil || committer.newID == nil {
		return errors.New("narrator output committer is required")
	}
	return nil
}

func prepareWitnessedCallRequest(
	request CallRequest,
	result CallResult,
) (preparedCallRequest, error) {
	prepared, err := prepareCallRequest(request)
	if err != nil {
		return preparedCallRequest{}, err
	}
	if err := validateSuccessfulCallWitness(request, prepared, result); err != nil {
		return preparedCallRequest{}, err
	}
	return prepared, nil
}

func freezeSuccessfulCallResult(
	request CallRequest,
	prepared preparedCallRequest,
	result CallResult,
) (CallResult, error) {
	if err := validateSuccessfulCallResultEnvelope(request, prepared, result); err != nil {
		return CallResult{}, err
	}
	if err := validateSuccessfulCallResultCompletion(result); err != nil {
		return CallResult{}, err
	}
	frozen := freezeCallResultValue(result)
	if err := decodeCallOutput(&frozen, prepared, frozen.StructuredOutput); err != nil {
		return CallResult{}, err
	}
	if !sameDecodedCallOutput(result, frozen) {
		return CallResult{}, errors.New("narrator call result decoded output does not match its structured output")
	}
	return frozen, nil
}

func validateSuccessfulCallResultEnvelope(
	request CallRequest,
	prepared preparedCallRequest,
	result CallResult,
) error {
	if result.RequestID != request.ID || result.Generation != request.Generation {
		return errors.New("narrator call result does not match request identity or generation")
	}
	if result.Kind != prepared.kind || result.Trigger != prepared.trigger ||
		result.ConversationID != prepared.conversationID {
		return errors.New("narrator call result does not match its typed context")
	}
	if result.InputBytes != prepared.inputBytes {
		return fmt.Errorf(
			"narrator call result input bytes %d do not match prepared context %d",
			result.InputBytes,
			prepared.inputBytes,
		)
	}
	if result.OutputBytes <= 0 || result.OutputBytes != len(result.StructuredOutput) {
		return errors.New("narrator call result output byte count does not match structured output")
	}
	return nil
}

func validateSuccessfulCallResultCompletion(result CallResult) error {
	if err := validateCallResultTimeline(result); err != nil {
		return err
	}
	if err := validateIdentifier("narrator provider thread id", result.ProviderThreadID); err != nil {
		return err
	}
	return validateIdentifier("narrator provider turn id", result.ProviderTurnID)
}

func freezeCallResultValue(result CallResult) CallResult {
	frozen := result
	frozen.Model = cloneModelResolution(result.Model)
	frozen.StructuredOutput = append([]byte{}, result.StructuredOutput...)
	frozen.NarratorOutput = nil
	frozen.CheckpointOutput = nil
	frozen.witness = nil
	return frozen
}

func sameDecodedCallOutput(left CallResult, right CallResult) bool {
	return reflect.DeepEqual(left.NarratorOutput, right.NarratorOutput) &&
		reflect.DeepEqual(left.CheckpointOutput, right.CheckpointOutput)
}

func validateCallResultTimeline(result CallResult) error {
	startedAt, err := canonicalNarratorTime("narrator call startedAt", result.StartedAt)
	if err != nil {
		return err
	}
	endedAt, err := canonicalNarratorTime("narrator call endedAt", result.EndedAt)
	if err != nil {
		return err
	}
	if endedAt.Before(startedAt) {
		return errors.New("narrator call endedAt precedes startedAt")
	}
	return nil
}

func (committer *OutputCommitter) successfulInvocation(
	result CallResult,
) (conversation.ResolvedInvocation, error) {
	id, err := committer.newID("narrator_invocation")
	if err != nil {
		return conversation.ResolvedInvocation{}, err
	}
	endedAt := result.EndedAt
	requestID := result.RequestID
	threadID := result.ProviderThreadID
	turnID := result.ProviderTurnID
	invocation := conversation.ResolvedInvocation{
		ID:        id,
		Role:      conversation.RoleNarrator,
		Provider:  conversation.ProviderCodex,
		Requested: result.Model.RequestedProfile,
		Resolved:  result.Model.Settings,
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:  result.InputBytes,
			OutputBytes: result.OutputBytes,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID:  &threadID,
			TurnID:    &turnID,
			RequestID: &requestID,
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     result.StartedAt,
		EndedAt:       &endedAt,
		Outcome:       conversation.InvocationOutcomeSucceeded,
	}
	if err := invocation.Validate(); err != nil {
		return conversation.ResolvedInvocation{}, fmt.Errorf("build successful narrator invocation: %w", err)
	}
	return invocation, nil
}

func (committer *OutputCommitter) prepareProjection(
	bundle ProjectionContextBundle,
	result CallResult,
	invocation conversation.ResolvedInvocation,
) (PreparedCommit, error) {
	output, err := projectionOutputFields(*result.NarratorOutput)
	if err != nil {
		return nil, err
	}
	request, err := committer.newProjectionCommitEnvelope(bundle, result, invocation, output)
	if err != nil {
		return nil, err
	}
	if err := committer.addProjectionTextCommits(&request, output); err != nil {
		return nil, err
	}
	if err := committer.addSuccessfulAttempt(
		&request.InvocationAttempt,
		&request.InvocationAttemptCommittedID,
		CallRequest{Projection: &bundle},
		result,
		request.CommittedAt,
	); err != nil {
		return nil, err
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	frozen := cloneProjectionCommit(request)
	return func(ctx context.Context) error {
		_, err := committer.store.CommitNarratorProjection(ctx, frozen)
		return err
	}, nil
}

type projectionCommitOutput struct {
	observedThrough int
	currentFocus    string
	milestones      []string
	finalSummary    *string
	topicDescriptor *string
}

func (committer *OutputCommitter) newProjectionCommitEnvelope(
	bundle ProjectionContextBundle,
	result CallResult,
	invocation conversation.ResolvedInvocation,
	output projectionCommitOutput,
) (conversation.NarratorProjectionCommit, error) {
	committedAt, err := outputCommitTimestamp(bundle.PreCallCursor.UpdatedAt, result.EndedAt)
	if err != nil {
		return conversation.NarratorProjectionCommit{}, err
	}
	turnID, err := projectionTurnID(bundle)
	if err != nil {
		return conversation.NarratorProjectionCommit{}, err
	}
	stateCommittedID, err := committer.newID("conversation_event")
	if err != nil {
		return conversation.NarratorProjectionCommit{}, err
	}
	return conversation.NarratorProjectionCommit{
		ConversationID:           result.ConversationID,
		TurnID:                   turnID,
		Expected:                 narratorStateExpectation(bundle.PreCallCursor),
		ObservedThroughSequence:  output.observedThrough,
		CurrentFocus:             output.currentFocus,
		Milestones:               []conversation.NarrationTextCommit{},
		Trigger:                  result.Trigger,
		ResolvedInvocation:       invocation,
		NarratorStateCommittedID: stateCommittedID,
		CommittedAt:              committedAt,
	}, nil
}

func (committer *OutputCommitter) addProjectionTextCommits(
	request *conversation.NarratorProjectionCommit,
	output projectionCommitOutput,
) error {
	milestones, err := committer.textCommits("narration_milestone", output.milestones)
	if err != nil {
		return err
	}
	finalSummary, err := committer.optionalTextCommit("narration_final_summary", output.finalSummary)
	if err != nil {
		return err
	}
	topicDescriptor, conversationEventID, err := committer.topicDescriptorCommit(output.topicDescriptor)
	if err != nil {
		return err
	}
	request.Milestones = milestones
	request.FinalSummary = finalSummary
	request.TopicDescriptor = topicDescriptor
	request.ConversationCommittedID = conversationEventID
	return nil
}

func (committer *OutputCommitter) textCommits(
	prefix string,
	values []string,
) ([]conversation.NarrationTextCommit, error) {
	result := make([]conversation.NarrationTextCommit, 0, len(values))
	for _, value := range values {
		identity, err := committer.textCommit(prefix, value)
		if err != nil {
			return nil, err
		}
		result = append(result, identity)
	}
	return result, nil
}

func (committer *OutputCommitter) optionalTextCommit(
	prefix string,
	value *string,
) (*conversation.NarrationTextCommit, error) {
	if value == nil {
		return nil, nil
	}
	identity, err := committer.textCommit(prefix, *value)
	if err != nil {
		return nil, err
	}
	return &identity, nil
}

func (committer *OutputCommitter) topicDescriptorCommit(
	value *string,
) (*conversation.NarrationTextCommit, *string, error) {
	identity, err := committer.optionalTextCommit("narration_topic_descriptor", value)
	if err != nil || identity == nil {
		return identity, nil, err
	}
	conversationEventID, err := committer.newID("conversation_event")
	if err != nil {
		return nil, nil, err
	}
	return identity, &conversationEventID, nil
}

func (committer *OutputCommitter) prepareStatus(
	bundle StatusContextBundle,
	result CallResult,
	invocation conversation.ResolvedInvocation,
) (PreparedCommit, error) {
	committedAt, err := outputCommitTimestamp(bundle.PreCallCursor.UpdatedAt, result.EndedAt)
	if err != nil {
		return nil, err
	}
	reply, err := committer.textCommit("narration_status_reply", result.NarratorOutput.StatusReply.StatusReply)
	if err != nil {
		return nil, err
	}
	stateCommittedID, err := committer.newID("conversation_event")
	if err != nil {
		return nil, err
	}
	request := conversation.NarratorStatusCommit{
		ConversationID:           result.ConversationID,
		TurnID:                   statusTurnID(bundle),
		Expected:                 narratorStateExpectation(bundle.PreCallCursor),
		SourceSequenceStart:      statusSourceStart(bundle),
		SourceThroughSequence:    bundle.SourceThroughSequence,
		Question:                 bundle.Question,
		Reply:                    reply,
		ResolvedInvocation:       invocation,
		NarratorStateCommittedID: stateCommittedID,
		CommittedAt:              committedAt,
	}
	if err := committer.addSuccessfulAttempt(
		&request.InvocationAttempt,
		&request.InvocationAttemptCommittedID,
		CallRequest{Status: &bundle},
		result,
		request.CommittedAt,
	); err != nil {
		return nil, err
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	frozen := cloneStatusCommit(request)
	return func(ctx context.Context) error {
		_, err := committer.store.CommitNarratorStatus(ctx, frozen)
		return err
	}, nil
}

func (committer *OutputCommitter) prepareCheckpoint(
	bundle CheckpointContextBundle,
	result CallResult,
	invocation conversation.ResolvedInvocation,
) (PreparedCommit, error) {
	committedAt, err := outputCommitTimestamp(bundle.PreCallCursor.UpdatedAt, result.EndedAt)
	if err != nil {
		return nil, err
	}
	committedEventID, err := committer.newID("conversation_event")
	if err != nil {
		return nil, err
	}
	request := conversation.NarratorCheckpointCommit{
		ConversationID:         result.ConversationID,
		Expected:               narratorStateExpectation(bundle.PreCallCursor),
		CoveredThroughSequence: result.CheckpointOutput.CoveredThroughSequence,
		HistoricalSummary:      result.CheckpointOutput.HistoricalSummary,
		CommittedEventID:       committedEventID,
		ResolvedInvocation:     invocation,
		CommittedAt:            committedAt,
	}
	if err := committer.addSuccessfulAttempt(
		&request.InvocationAttempt,
		&request.InvocationAttemptCommittedID,
		CallRequest{Checkpoint: &bundle},
		result,
		request.CommittedAt,
	); err != nil {
		return nil, err
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	return func(ctx context.Context) error {
		_, err := committer.store.CommitNarratorCheckpoint(ctx, request)
		return err
	}, nil
}

func (committer *OutputCommitter) addSuccessfulAttempt(
	target *conversation.InvocationAttempt,
	committedEventID *string,
	request CallRequest,
	result CallResult,
	committedAt string,
) error {
	attempt, err := successfulNarratorAttempt(request, result, committedAt)
	if err != nil {
		return err
	}
	eventID, err := committer.newID("conversation_event")
	if err != nil {
		return err
	}
	*target = attempt
	*committedEventID = eventID
	return nil
}

func projectionOutputFields(
	output NarratorCallOutput,
) (projectionCommitOutput, error) {
	switch output.Kind {
	case CallOutputWorkingProjection:
		value := output.WorkingProjection
		return projectionCommitOutput{
			observedThrough: value.ObservedThroughSequence,
			currentFocus:    value.CurrentFocus,
			milestones:      append([]string{}, value.Milestones...),
			topicDescriptor: cloneOptionalString(value.TopicDescriptor),
		}, nil
	case CallOutputTerminalProjection:
		value := output.TerminalProjection
		finalSummary := value.FinalSummary
		return projectionCommitOutput{
			observedThrough: value.ObservedThroughSequence,
			currentFocus:    value.CurrentFocus,
			milestones:      append([]string{}, value.Milestones...),
			finalSummary:    &finalSummary,
			topicDescriptor: cloneOptionalString(value.TopicDescriptor),
		}, nil
	default:
		return projectionCommitOutput{}, fmt.Errorf("narrator projection output has kind %q", output.Kind)
	}
}

func projectionTurnID(context ProjectionContextBundle) (string, error) {
	if context.Authoritative.CurrentInstructions == nil {
		return "", errors.New("narrator projection context has no current turn")
	}
	turnID := context.Authoritative.CurrentInstructions.TurnID
	if err := validateIdentifier("narrator projection turn id", turnID); err != nil {
		return "", err
	}
	return turnID, nil
}

func statusTurnID(context StatusContextBundle) *string {
	if context.Authoritative.CurrentInstructions == nil {
		return nil
	}
	turnID := context.Authoritative.CurrentInstructions.TurnID
	return &turnID
}

func statusSourceStart(context StatusContextBundle) int {
	if context.IncludedRange == nil {
		return 0
	}
	return context.IncludedRange.Start
}

func narratorStateExpectation(cursor NarratorCursor) conversation.NarratorStateExpectation {
	return conversation.NarratorStateExpectation{
		ObservedThroughSequence:   cursor.ObservedThroughSequence,
		CheckpointThroughSequence: cursor.CheckpointThroughSequence,
		CurrentFocusRevision:      cursor.CurrentFocusRevision,
		UpdatedAt:                 cursor.UpdatedAt,
	}
}

func (committer *OutputCommitter) textCommit(
	prefix string,
	value string,
) (conversation.NarrationTextCommit, error) {
	narrationID, err := committer.newID(prefix)
	if err != nil {
		return conversation.NarrationTextCommit{}, err
	}
	committedID, err := committer.newID("conversation_event")
	if err != nil {
		return conversation.NarrationTextCommit{}, err
	}
	return conversation.NarrationTextCommit{
		NarrationEventID: narrationID,
		CommittedEventID: committedID,
		Text:             value,
	}, nil
}

func cloneProjectionCommit(
	request conversation.NarratorProjectionCommit,
) conversation.NarratorProjectionCommit {
	cloned := request
	cloned.Milestones = append([]conversation.NarrationTextCommit{}, request.Milestones...)
	cloned.FinalSummary = cloneTextCommit(request.FinalSummary)
	cloned.TopicDescriptor = cloneTextCommit(request.TopicDescriptor)
	cloned.ConversationCommittedID = cloneOptionalString(request.ConversationCommittedID)
	cloned.ResolvedInvocation = cloneResolvedInvocation(request.ResolvedInvocation)
	cloned.InvocationAttempt = cloneNarratorInvocationAttempt(request.InvocationAttempt)
	return cloned
}

func cloneStatusCommit(request conversation.NarratorStatusCommit) conversation.NarratorStatusCommit {
	cloned := request
	cloned.TurnID = cloneOptionalString(request.TurnID)
	cloned.ResolvedInvocation = cloneResolvedInvocation(request.ResolvedInvocation)
	cloned.InvocationAttempt = cloneNarratorInvocationAttempt(request.InvocationAttempt)
	return cloned
}

func cloneNarratorInvocationAttempt(value conversation.InvocationAttempt) conversation.InvocationAttempt {
	cloned := value
	cloned.TurnID = cloneOptionalString(value.TurnID)
	if value.Trigger != nil {
		trigger := *value.Trigger
		cloned.Trigger = &trigger
	}
	cloned.Context.InputID = cloneOptionalString(value.Context.InputID)
	cloned.Context.ClarificationInputID = cloneOptionalString(value.Context.ClarificationInputID)
	if value.Context.RequestedThroughSequence != nil {
		sequence := *value.Context.RequestedThroughSequence
		cloned.Context.RequestedThroughSequence = &sequence
	}
	cloned.Context.AvailableRange = cloneAttemptRange(value.Context.AvailableRange)
	cloned.Context.IncludedRanges = append([]conversation.TrajectorySequenceRange{}, value.Context.IncludedRanges...)
	cloned.Context.EvaluationRange = cloneAttemptRange(value.Context.EvaluationRange)
	cloned.Context.RemainingRange = cloneAttemptRange(value.Context.RemainingRange)
	cloned.Context.OmittedStatusOnlyRange = cloneAttemptRange(value.Context.OmittedStatusOnlyRange)
	cloned.Context.OmittedUnobservedRange = cloneAttemptRange(value.Context.OmittedUnobservedRange)
	cloned.Context.PreCursor = cloneAttemptCursor(value.Context.PreCursor)
	cloned.Context.PostCursor = cloneAttemptCursor(value.Context.PostCursor)
	cloned.Context.ProposedObservedThrough = cloneAttemptInt(value.Context.ProposedObservedThrough)
	cloned.Context.ProposedCheckpointThrough = cloneAttemptInt(value.Context.ProposedCheckpointThrough)
	cloned.Context.EventCounts = append([]conversation.InvocationAttemptEventCount{}, value.Context.EventCounts...)
	cloned.Context.AllowedDecisionKinds = append(
		[]conversation.ConversationRouteDecisionKind{}, value.Context.AllowedDecisionKinds...,
	)
	if value.Requested != nil {
		requested := cloneAttemptRoleProfile(*value.Requested)
		cloned.Requested = &requested
	}
	if value.Resolved != nil {
		resolved := cloneAttemptResolvedSettings(*value.Resolved)
		cloned.Resolved = &resolved
	}
	cloned.ProviderReferences.ThreadID = cloneOptionalString(value.ProviderReferences.ThreadID)
	cloned.ProviderReferences.TurnID = cloneOptionalString(value.ProviderReferences.TurnID)
	cloned.ProviderReferences.RequestID = cloneOptionalString(value.ProviderReferences.RequestID)
	cloned.ProviderReferences.ResponseID = cloneOptionalString(value.ProviderReferences.ResponseID)
	cloned.Output.StructuredKind = cloneOptionalString(value.Output.StructuredKind)
	if value.Failure != nil {
		failure := *value.Failure
		cloned.Failure = &failure
	}
	return cloned
}

func cloneAttemptRange(value *conversation.TrajectorySequenceRange) *conversation.TrajectorySequenceRange {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAttemptCursor(value *conversation.InvocationAttemptCursorAudit) *conversation.InvocationAttemptCursorAudit {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAttemptInt(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneTextCommit(value *conversation.NarrationTextCommit) *conversation.NarrationTextCommit {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneResolvedInvocation(value conversation.ResolvedInvocation) conversation.ResolvedInvocation {
	cloned := value
	cloned.Requested.ModelSelection.ModelID = cloneOptionalString(value.Requested.ModelSelection.ModelID)
	cloned.Requested.ServiceTier = cloneOptionalString(value.Requested.ServiceTier)
	cloned.Requested.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		value.Requested.PermissionProfile.ToolAccess.AllowedTools...,
	)
	cloned.Resolved.ServiceTier = cloneOptionalString(value.Resolved.ServiceTier)
	cloned.Resolved.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		value.Resolved.PermissionProfile.ToolAccess.AllowedTools...,
	)
	cloned.ProviderReferences.ThreadID = cloneOptionalString(value.ProviderReferences.ThreadID)
	cloned.ProviderReferences.TurnID = cloneOptionalString(value.ProviderReferences.TurnID)
	cloned.ProviderReferences.RequestID = cloneOptionalString(value.ProviderReferences.RequestID)
	cloned.ProviderReferences.ResponseID = cloneOptionalString(value.ProviderReferences.ResponseID)
	cloned.ModelReroutes = append([]conversation.InvocationModelReroute{}, value.ModelReroutes...)
	cloned.EndedAt = cloneOptionalString(value.EndedAt)
	return cloned
}

func outputCommitTimestamp(previous string, candidate string) (string, error) {
	previousTime, err := canonicalNarratorTime("narrator previous updatedAt", previous)
	if err != nil {
		return "", err
	}
	candidateTime, err := canonicalNarratorTime("narrator invocation endedAt", candidate)
	if err != nil {
		return "", err
	}
	if !candidateTime.After(previousTime) {
		candidateTime = previousTime.Add(time.Nanosecond)
	}
	return candidateTime.UTC().Format(time.RFC3339Nano), nil
}

func canonicalNarratorTime(label string, value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	if parsed.UTC().Format(time.RFC3339Nano) != value {
		return time.Time{}, fmt.Errorf("%s must be a canonical UTC RFC3339 timestamp", label)
	}
	return parsed, nil
}

func randomOutputID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}
