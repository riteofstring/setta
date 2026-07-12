package narration

import (
	"errors"
	"fmt"
	"time"

	"setta/internal/conversation"
)

type narratorCallAttemptError struct {
	request CallRequest
	result  CallResult
	cause   error
}

func (err *narratorCallAttemptError) Error() string {
	return err.cause.Error()
}

func (err *narratorCallAttemptError) Unwrap() error {
	return err.cause
}

func successfulNarratorAttempt(
	request CallRequest,
	result CallResult,
	committedAt string,
) (conversation.InvocationAttempt, error) {
	contextAudit, turnID, err := narratorAttemptContext(request, result, committedAt)
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	requested := cloneAttemptRoleProfile(result.Model.RequestedProfile)
	resolved := cloneAttemptResolvedSettings(result.Model.Settings)
	requestID := result.RequestID
	threadID := result.ProviderThreadID
	providerTurnID := result.ProviderTurnID
	attempt := conversation.InvocationAttempt{
		ID:             result.RequestID,
		ConversationID: result.ConversationID,
		TurnID:         turnID,
		CallKind:       narratorAttemptCallKind(result.Kind, result.Trigger),
		Trigger:        narrationTriggerPointer(result.Trigger),
		Generation:     int(result.Generation),
		Context:        contextAudit,
		Requested:      &requested,
		Resolved:       &resolved,
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:  result.InputBytes,
			OutputBytes: result.OutputBytes,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID:  &threadID,
			TurnID:    &providerTurnID,
			RequestID: &requestID,
		},
		StartedAt:        result.StartedAt,
		EndedAt:          result.EndedAt,
		Outcome:          conversation.InvocationAttemptOutcomeCompleted,
		ValidationResult: conversation.InvocationValidationPassed,
		CommitDecision:   conversation.InvocationCommitOutputCommitted,
		Output:           narratorAttemptOutput(result),
	}
	if err := attempt.Validate(); err != nil {
		return conversation.InvocationAttempt{}, fmt.Errorf("build successful narrator attempt: %w", err)
	}
	return attempt, nil
}

func failedNarratorAttempt(
	invocation Invocation,
	cause error,
	failure conversation.Failure,
	endedAt string,
) (conversation.InvocationAttempt, error) {
	request := CallRequest{}
	result := CallResult{}
	var callError *narratorCallAttemptError
	if errors.As(cause, &callError) {
		request = callError.request
		result = callError.result
	}
	contextAudit, turnID, err := failedNarratorAttemptContext(invocation.Request, request)
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	startedAt := invocation.StartedAt
	if result.StartedAt != "" {
		startedAt = result.StartedAt
	}
	endedAt, err = normalizedAttemptEnd(startedAt, endedAt, result.EndedAt)
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	attempt := conversation.InvocationAttempt{
		ID:             invocation.Request.ID,
		ConversationID: invocation.Request.ConversationID,
		TurnID:         turnID,
		CallKind:       narratorRequestCallKind(invocation.Request),
		Trigger:        narrationTriggerPointer(invocation.Request.Trigger),
		Generation:     int(invocation.Generation),
		Context:        contextAudit,
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:  result.InputBytes,
			OutputBytes: result.OutputBytes,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			RequestID: stringPointer(invocation.Request.ID),
		},
		StartedAt:        startedAt,
		EndedAt:          endedAt,
		Outcome:          conversation.InvocationAttemptOutcomeFailed,
		ValidationResult: failedNarratorValidation(cause),
		CommitDecision:   conversation.InvocationCommitFailureCommitted,
		Output:           conversation.InvocationAttemptOutputAudit{},
		Failure:          &failure,
	}
	if result.Model.RequestedProfile.Role != "" {
		requested := cloneAttemptRoleProfile(result.Model.RequestedProfile)
		attempt.Requested = &requested
	}
	if result.Model.Settings.ModelID != "" {
		resolved := cloneAttemptResolvedSettings(result.Model.Settings)
		attempt.Resolved = &resolved
	}
	if result.ProviderThreadID != "" {
		attempt.ProviderReferences.ThreadID = stringPointer(result.ProviderThreadID)
	}
	if result.ProviderTurnID != "" {
		attempt.ProviderReferences.TurnID = stringPointer(result.ProviderTurnID)
	}
	if err := attempt.Validate(); err != nil {
		return conversation.InvocationAttempt{}, fmt.Errorf("build failed narrator attempt: %w", err)
	}
	return attempt, nil
}

func nonCommittedNarratorAttempt(
	completion Completion,
	outcome conversation.InvocationAttemptOutcome,
) (conversation.InvocationAttempt, error) {
	contextAudit, turnID, err := failedNarratorAttemptContext(completion.Request, CallRequest{})
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	endedAt, err := normalizedAttemptEnd(completion.StartedAt, completion.EndedAt, "")
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	attempt := conversation.InvocationAttempt{
		ID:                 completion.Request.ID,
		ConversationID:     completion.Request.ConversationID,
		TurnID:             turnID,
		CallKind:           narratorRequestCallKind(completion.Request),
		Trigger:            narrationTriggerPointer(completion.Request.Trigger),
		Generation:         int(completion.Generation),
		Context:            contextAudit,
		ContextUsage:       conversation.InvocationContextUsage{},
		ProviderReferences: conversation.InvocationProviderReferences{},
		StartedAt:          completion.StartedAt,
		EndedAt:            endedAt,
		Outcome:            outcome,
		ValidationResult:   conversation.InvocationValidationNotRun,
		Output:             conversation.InvocationAttemptOutputAudit{},
	}
	switch outcome {
	case conversation.InvocationAttemptOutcomeCancelled:
		attempt.CommitDecision = conversation.InvocationCommitCancelled
	case conversation.InvocationAttemptOutcomeSuperseded:
		attempt.CommitDecision = conversation.InvocationCommitSuperseded
	case conversation.InvocationAttemptOutcomeStale:
		attempt.CommitDecision = conversation.InvocationCommitRejectedStale
	default:
		return conversation.InvocationAttempt{}, fmt.Errorf("unsupported non-committed narrator outcome %q", outcome)
	}
	if err := attempt.Validate(); err != nil {
		return conversation.InvocationAttempt{}, fmt.Errorf("build non-committed narrator attempt: %w", err)
	}
	return attempt, nil
}

func narratorAttemptContext(
	request CallRequest,
	result CallResult,
	committedAt string,
) (conversation.InvocationAttemptContextAudit, *string, error) {
	switch result.Kind {
	case RequestKindProjection:
		return projectionAttemptContext(*request.Projection, *result.NarratorOutput, committedAt)
	case RequestKindStatus:
		return statusAttemptContext(*request.Status, *result.NarratorOutput, committedAt)
	case RequestKindCheckpoint:
		return checkpointAttemptContext(*request.Checkpoint, *result.CheckpointOutput, committedAt)
	default:
		return conversation.InvocationAttemptContextAudit{}, nil, fmt.Errorf("unsupported narrator attempt kind %q", result.Kind)
	}
}

func projectionAttemptContext(
	bundle ProjectionContextBundle,
	output NarratorCallOutput,
	committedAt string,
) (conversation.InvocationAttemptContextAudit, *string, error) {
	fields, err := projectionOutputFields(output)
	if err != nil {
		return conversation.InvocationAttemptContextAudit{}, nil, err
	}
	post := attemptCursor(bundle.PreCallCursor)
	post.ObservedThroughSequence = fields.observedThrough
	post.CurrentFocusRevision++
	post.UpdatedAt = committedAt
	contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
	contextAudit.Materialized = true
	contextAudit.RequestedThroughSequence = intPointer(bundle.RequestedThroughSequence)
	contextAudit.SourceThroughSequence = bundle.RequestedThroughSequence
	contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{bundle.IncludedRange}
	contextAudit.EvaluationRange = rangePointer(bundle.EvaluationRange)
	contextAudit.RemainingRange = cloneRange(bundle.RemainingUnobservedRange)
	contextAudit.PostCursor = &post
	contextAudit.ProposedObservedThrough = intPointer(fields.observedThrough)
	contextAudit.PriorMilestoneCount = len(bundle.PriorMilestones)
	contextAudit.PriorFinalSummaryCount = len(bundle.PriorFinalSummaries)
	contextAudit.EventCounts = attemptEventCounts(bundle.Trajectory)
	return contextAudit, currentTurnID(bundle.Authoritative), nil
}

func statusAttemptContext(
	bundle StatusContextBundle,
	_ NarratorCallOutput,
	committedAt string,
) (conversation.InvocationAttemptContextAudit, *string, error) {
	post := attemptCursor(bundle.PreCallCursor)
	post.UpdatedAt = committedAt
	contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
	contextAudit.Materialized = true
	contextAudit.SourceThroughSequence = bundle.SourceThroughSequence
	if bundle.IncludedRange != nil {
		contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{*bundle.IncludedRange}
	}
	contextAudit.OmittedStatusOnlyRange = cloneRange(bundle.OmittedTrajectoryRange)
	contextAudit.OmittedUnobservedRange = cloneRange(bundle.OmittedUnobservedRange)
	contextAudit.PostCursor = &post
	contextAudit.PriorFinalSummaryCount = len(bundle.RecentFinalSummaries)
	contextAudit.EventCounts = attemptEventCounts(bundle.LatestEvents)
	return contextAudit, currentTurnID(bundle.Authoritative), nil
}

func checkpointAttemptContext(
	bundle CheckpointContextBundle,
	output CheckpointOutput,
	committedAt string,
) (conversation.InvocationAttemptContextAudit, *string, error) {
	post := attemptCursor(bundle.PreCallCursor)
	post.CheckpointThroughSequence = output.CoveredThroughSequence
	post.UpdatedAt = committedAt
	contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
	contextAudit.Materialized = true
	contextAudit.SourceThroughSequence = bundle.PreCallCursor.ObservedThroughSequence
	contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{bundle.RequestedRange}
	contextAudit.RemainingRange = cloneRange(bundle.RemainingEligibleRange)
	contextAudit.PostCursor = &post
	contextAudit.ProposedCheckpointThrough = intPointer(output.CoveredThroughSequence)
	contextAudit.EventCounts = attemptEventCounts(bundle.Trajectory)
	return contextAudit, currentTurnID(bundle.Authoritative), nil
}

func failedNarratorAttemptContext(
	request Request,
	callRequest CallRequest,
) (conversation.InvocationAttemptContextAudit, *string, error) {
	if callRequest.Projection != nil {
		bundle := *callRequest.Projection
		contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
		contextAudit.Materialized = true
		contextAudit.RequestedThroughSequence = intPointer(bundle.RequestedThroughSequence)
		contextAudit.SourceThroughSequence = bundle.RequestedThroughSequence
		contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{bundle.IncludedRange}
		contextAudit.EvaluationRange = rangePointer(bundle.EvaluationRange)
		contextAudit.RemainingRange = cloneRange(bundle.RemainingUnobservedRange)
		contextAudit.PriorMilestoneCount = len(bundle.PriorMilestones)
		contextAudit.PriorFinalSummaryCount = len(bundle.PriorFinalSummaries)
		contextAudit.EventCounts = attemptEventCounts(bundle.Trajectory)
		return contextAudit, currentTurnID(bundle.Authoritative), nil
	}
	if callRequest.Status != nil {
		bundle := *callRequest.Status
		contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
		contextAudit.Materialized = true
		contextAudit.SourceThroughSequence = bundle.SourceThroughSequence
		if bundle.IncludedRange != nil {
			contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{*bundle.IncludedRange}
		}
		contextAudit.OmittedStatusOnlyRange = cloneRange(bundle.OmittedTrajectoryRange)
		contextAudit.OmittedUnobservedRange = cloneRange(bundle.OmittedUnobservedRange)
		contextAudit.PriorFinalSummaryCount = len(bundle.RecentFinalSummaries)
		contextAudit.EventCounts = attemptEventCounts(bundle.LatestEvents)
		return contextAudit, currentTurnID(bundle.Authoritative), nil
	}
	if callRequest.Checkpoint != nil {
		bundle := *callRequest.Checkpoint
		contextAudit := baseNarratorAttemptContext(bundle.PreCallCursor)
		contextAudit.Materialized = true
		contextAudit.SourceThroughSequence = bundle.PreCallCursor.ObservedThroughSequence
		contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{bundle.RequestedRange}
		contextAudit.RemainingRange = cloneRange(bundle.RemainingEligibleRange)
		contextAudit.EventCounts = attemptEventCounts(bundle.Trajectory)
		return contextAudit, currentTurnID(bundle.Authoritative), nil
	}
	contextAudit := emptyAttemptContext()
	var turnID *string
	switch request.Kind {
	case RequestKindProjection:
		contextAudit.RequestedThroughSequence = intPointer(request.Projection.ThroughSequence)
		contextAudit.SourceThroughSequence = request.Projection.ThroughSequence
		turnID = stringPointer(request.Projection.TurnID)
	case RequestKindStatus:
		turnID = nil
	case RequestKindCheckpoint:
		turnID = cloneString(request.Checkpoint.TurnID)
	default:
		return conversation.InvocationAttemptContextAudit{}, nil, fmt.Errorf("unsupported narrator request kind %q", request.Kind)
	}
	return contextAudit, turnID, nil
}

func baseNarratorAttemptContext(cursor NarratorCursor) conversation.InvocationAttemptContextAudit {
	contextAudit := emptyAttemptContext()
	pre := attemptCursor(cursor)
	contextAudit.PreCursor = &pre
	return contextAudit
}

func emptyAttemptContext() conversation.InvocationAttemptContextAudit {
	return conversation.InvocationAttemptContextAudit{
		IncludedRanges:       []conversation.TrajectorySequenceRange{},
		EventCounts:          []conversation.InvocationAttemptEventCount{},
		AllowedDecisionKinds: []conversation.ConversationRouteDecisionKind{},
	}
}

func attemptCursor(cursor NarratorCursor) conversation.InvocationAttemptCursorAudit {
	return conversation.InvocationAttemptCursorAudit{
		ObservedThroughSequence:   cursor.ObservedThroughSequence,
		CheckpointThroughSequence: cursor.CheckpointThroughSequence,
		CurrentFocusRevision:      cursor.CurrentFocusRevision,
		UpdatedAt:                 cursor.UpdatedAt,
	}
}

func attemptEventCounts(events []conversation.TrajectoryEvent) []conversation.InvocationAttemptEventCount {
	counts := map[conversation.TrajectoryEventKind]int{}
	for _, event := range events {
		counts[event.Kind]++
	}
	result := []conversation.InvocationAttemptEventCount{}
	for _, kind := range conversation.TrajectoryEventKinds() {
		if count := counts[kind]; count > 0 {
			result = append(result, conversation.InvocationAttemptEventCount{Kind: kind, Count: count})
		}
	}
	return result
}

func narratorAttemptOutput(result CallResult) conversation.InvocationAttemptOutputAudit {
	if result.CheckpointOutput != nil {
		kind := string(RequestKindCheckpoint)
		return conversation.InvocationAttemptOutputAudit{
			StructuredKind:         &kind,
			CheckpointSummaryBytes: len(result.CheckpointOutput.HistoricalSummary),
		}
	}
	output := result.NarratorOutput
	kind := string(output.Kind)
	audit := conversation.InvocationAttemptOutputAudit{StructuredKind: &kind}
	switch output.Kind {
	case CallOutputWorkingProjection:
		audit.MilestoneCount = len(output.WorkingProjection.Milestones)
		if output.WorkingProjection.TopicDescriptor != nil {
			audit.TopicDescriptorBytes = len(*output.WorkingProjection.TopicDescriptor)
		}
	case CallOutputTerminalProjection:
		audit.MilestoneCount = len(output.TerminalProjection.Milestones)
		audit.FinalSummaryBytes = len(output.TerminalProjection.FinalSummary)
		if output.TerminalProjection.TopicDescriptor != nil {
			audit.TopicDescriptorBytes = len(*output.TerminalProjection.TopicDescriptor)
		}
	case CallOutputStatusReply:
		audit.StatusReplyBytes = len(output.StatusReply.StatusReply)
	}
	return audit
}

func narratorAttemptCallKind(kind RequestKind, trigger conversation.NarrationTrigger) conversation.InvocationAttemptCallKind {
	if kind == RequestKindProjection && trigger == conversation.NarrationTriggerTurnTerminal {
		return conversation.InvocationAttemptCallTerminal
	}
	switch kind {
	case RequestKindProjection:
		return conversation.InvocationAttemptCallProjection
	case RequestKindStatus:
		return conversation.InvocationAttemptCallStatus
	case RequestKindCheckpoint:
		return conversation.InvocationAttemptCallCheckpoint
	default:
		panic(fmt.Sprintf("validated narrator request has unsupported kind %q", kind))
	}
}

func narratorRequestCallKind(request Request) conversation.InvocationAttemptCallKind {
	return narratorAttemptCallKind(request.Kind, request.Trigger)
}

func failedNarratorValidation(cause error) conversation.InvocationValidationResult {
	kind, classified, _ := classifyTypedFailure(cause)
	if classified && kind == FailureKindProviderOutputInvalid {
		return conversation.InvocationValidationFailed
	}
	return conversation.InvocationValidationNotRun
}

func normalizedAttemptEnd(startedAt string, fallback string, candidate string) (string, error) {
	started, err := time.Parse(time.RFC3339Nano, startedAt)
	if err != nil {
		return "", fmt.Errorf("parse narrator attempt start time: %w", err)
	}
	value := fallback
	if candidate != "" {
		value = candidate
	}
	ended, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return "", fmt.Errorf("parse narrator attempt end time: %w", err)
	}
	if ended.Before(started) {
		ended = started
	}
	return ended.UTC().Format(time.RFC3339Nano), nil
}

func currentTurnID(context AuthoritativeContext) *string {
	if context.CurrentInstructions == nil {
		return nil
	}
	return stringPointer(context.CurrentInstructions.TurnID)
}

func cloneAttemptRoleProfile(value conversation.RoleProfile) conversation.RoleProfile {
	cloned := value
	cloned.ModelSelection.ModelID = cloneString(value.ModelSelection.ModelID)
	cloned.ServiceTier = cloneString(value.ServiceTier)
	cloned.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{}, value.PermissionProfile.ToolAccess.AllowedTools...,
	)
	return cloned
}

func cloneAttemptResolvedSettings(value conversation.ResolvedInvocationSettings) conversation.ResolvedInvocationSettings {
	cloned := value
	cloned.ServiceTier = cloneString(value.ServiceTier)
	cloned.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{}, value.PermissionProfile.ToolAccess.AllowedTools...,
	)
	return cloned
}

func cloneRange(value *conversation.TrajectorySequenceRange) *conversation.TrajectorySequenceRange {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func rangePointer(value conversation.TrajectorySequenceRange) *conversation.TrajectorySequenceRange {
	return cloneRange(&value)
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	return stringPointer(*value)
}

func stringPointer(value string) *string {
	return &value
}

func intPointer(value int) *int {
	return &value
}

func narrationTriggerPointer(value conversation.NarrationTrigger) *conversation.NarrationTrigger {
	return &value
}
