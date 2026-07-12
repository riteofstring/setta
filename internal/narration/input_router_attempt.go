package narration

import (
	"errors"
	"fmt"

	"setta/internal/conversation"
)

type conversationRouteAttemptState struct {
	bundle *ConversationRouteContextBundle
	audit  *conversation.ConversationRouteContextAudit
	call   *ConversationRouteCallResult
}

type conversationRouteAttemptError struct {
	state conversationRouteAttemptState
	cause error
}

func (err *conversationRouteAttemptError) Error() string {
	return err.cause.Error()
}

func (err *conversationRouteAttemptError) Unwrap() error {
	return err.cause
}

func conversationRouteSuccessfulAttempt(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	audit conversation.ConversationRouteContextAudit,
	call ConversationRouteCallResult,
) conversation.InvocationAttempt {
	requested := cloneAttemptRoleProfile(call.Model.RequestedProfile)
	resolved := cloneAttemptResolvedSettings(call.Model.Settings)
	requestID := call.RequestID
	threadID := call.ProviderThreadID
	turnID := call.ProviderTurnID
	decisionKind := string(call.Decision.Kind)
	return conversation.InvocationAttempt{
		ID:             call.RequestID,
		ConversationID: work.Input.Input.ConversationID,
		TurnID:         conversationRouteCurrentTurnID(bundle),
		CallKind:       conversation.InvocationAttemptCallInputRoute,
		Generation:     work.RoutingAttempt,
		Context:        conversationRouteInvocationContext(work, bundle, audit),
		Requested:      &requested,
		Resolved:       &resolved,
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:            call.InputBytes,
			EstimatedInputTokens:  call.InputTokens,
			OutputBytes:           call.OutputBytes,
			EstimatedOutputTokens: call.OutputTokens,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID:  &threadID,
			TurnID:    &turnID,
			RequestID: &requestID,
		},
		StartedAt:        call.StartedAt,
		EndedAt:          call.EndedAt,
		Outcome:          conversation.InvocationAttemptOutcomeCompleted,
		ValidationResult: conversation.InvocationValidationPassed,
		CommitDecision:   conversation.InvocationCommitOutputCommitted,
		Output: conversation.InvocationAttemptOutputAudit{
			StructuredKind: &decisionKind,
		},
	}
}

func conversationRouteFailedAttempt(
	work conversation.ConversationInputRoutingWork,
	cause error,
	failure conversation.Failure,
	failedAt string,
) (conversation.InvocationAttempt, error) {
	state := conversationRouteAttemptStateFromError(cause)
	call := conversationRouteTerminalCall(state.call)
	startedAt := conversationRouteAttemptStartedAt(work.RoutingStartedAt, call.StartedAt)
	endedAt, err := normalizedAttemptEnd(startedAt, failedAt, call.EndedAt)
	if err != nil {
		return conversation.InvocationAttempt{}, err
	}
	attempt := conversation.InvocationAttempt{
		ID:             failedConversationRouteAttemptID(work, call),
		ConversationID: work.Input.Input.ConversationID,
		CallKind:       conversation.InvocationAttemptCallInputRoute,
		Generation:     work.RoutingAttempt,
		Context:        emptyAttemptContext(),
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:            call.InputBytes,
			EstimatedInputTokens:  call.InputTokens,
			OutputBytes:           call.OutputBytes,
			EstimatedOutputTokens: call.OutputTokens,
		},
		StartedAt:        startedAt,
		EndedAt:          endedAt,
		Outcome:          conversation.InvocationAttemptOutcomeFailed,
		ValidationResult: conversationRouteFailureValidation(call),
		CommitDecision:   conversation.InvocationCommitFailureCommitted,
		Failure:          &failure,
	}
	rootInputID := work.Input.Input.ID
	attempt.Context.InputID = &rootInputID
	attempt.Context.ClarificationInputID = conversationRouteClarificationInputID(work)
	applyFailedConversationRouteContext(&attempt, work, state)
	applyFailedConversationRouteModel(&attempt, call)
	applyFailedConversationRouteResult(&attempt, call)
	if err := attempt.Validate(); err != nil {
		return conversation.InvocationAttempt{}, fmt.Errorf("build failed conversation-router invocation attempt: %w", err)
	}
	return attempt, nil
}

func conversationRouteAttemptStateFromError(cause error) conversationRouteAttemptState {
	var attemptError *conversationRouteAttemptError
	if errors.As(cause, &attemptError) {
		return attemptError.state
	}
	return conversationRouteAttemptState{}
}

func conversationRouteTerminalCall(call *ConversationRouteCallResult) ConversationRouteCallResult {
	if call == nil {
		return ConversationRouteCallResult{}
	}
	return *call
}

func failedConversationRouteAttemptID(
	work conversation.ConversationInputRoutingWork,
	call ConversationRouteCallResult,
) string {
	if call.RequestID != "" {
		return call.RequestID
	}
	return conversationRouteAttemptID(work)
}

func conversationRouteAttemptStartedAt(fallback string, callStartedAt string) string {
	if callStartedAt != "" {
		return callStartedAt
	}
	return fallback
}

func applyFailedConversationRouteContext(
	attempt *conversation.InvocationAttempt,
	work conversation.ConversationInputRoutingWork,
	state conversationRouteAttemptState,
) {
	if state.bundle != nil && state.audit != nil {
		attempt.Context = conversationRouteInvocationContext(work, *state.bundle, *state.audit)
		attempt.TurnID = conversationRouteCurrentTurnID(*state.bundle)
	}
}

func applyFailedConversationRouteModel(
	attempt *conversation.InvocationAttempt,
	call ConversationRouteCallResult,
) {
	if call.Model.RequestedProfile.Role != "" {
		requested := cloneAttemptRoleProfile(call.Model.RequestedProfile)
		attempt.Requested = &requested
	}
	if call.Model.Settings.ModelID != "" {
		resolved := cloneAttemptResolvedSettings(call.Model.Settings)
		attempt.Resolved = &resolved
	}
}

func applyFailedConversationRouteResult(
	attempt *conversation.InvocationAttempt,
	call ConversationRouteCallResult,
) {
	if call.RequestID != "" {
		attempt.ProviderReferences.RequestID = stringPointer(call.RequestID)
	}
	if call.ProviderThreadID != "" {
		attempt.ProviderReferences.ThreadID = stringPointer(call.ProviderThreadID)
	}
	if call.ProviderTurnID != "" {
		attempt.ProviderReferences.TurnID = stringPointer(call.ProviderTurnID)
	}
	if call.Decision.Kind != "" {
		kind := string(call.Decision.Kind)
		attempt.Output.StructuredKind = &kind
	}
}

func conversationRouteInvocationContext(
	work conversation.ConversationInputRoutingWork,
	bundle ConversationRouteContextBundle,
	audit conversation.ConversationRouteContextAudit,
) conversation.InvocationAttemptContextAudit {
	contextAudit := emptyAttemptContext()
	contextAudit.Materialized = true
	inputID := work.Input.Input.ID
	contextAudit.InputID = &inputID
	contextAudit.ClarificationInputID = conversationRouteClarificationInputID(work)
	contextAudit.SourceThroughSequence = audit.LatestTrajectorySequence
	contextAudit.AvailableRange = cloneRange(audit.AvailableTrajectoryRange)
	if audit.IncludedTrajectoryRange != nil {
		contextAudit.IncludedRanges = []conversation.TrajectorySequenceRange{*audit.IncludedTrajectoryRange}
	}
	contextAudit.PriorRouteDecisionCount = audit.PriorRouteDecisionCount
	contextAudit.PriorMilestoneCount = audit.PriorNarrationCount
	contextAudit.ValidCompletedForkPointCount = audit.ValidCompletedForkPointCount
	contextAudit.EventCounts = attemptEventCounts(bundle.Trajectory)
	contextAudit.AllowedDecisionKinds = append(
		[]conversation.ConversationRouteDecisionKind{},
		audit.AllowedDecisionKinds...,
	)
	return contextAudit
}

func conversationRouteCurrentTurnID(bundle ConversationRouteContextBundle) *string {
	if bundle.Authoritative.CurrentInstructions == nil {
		return nil
	}
	return stringPointer(bundle.Authoritative.CurrentInstructions.TurnID)
}

func conversationRouteFailureValidation(call ConversationRouteCallResult) conversation.InvocationValidationResult {
	if call.Decision.Kind != "" {
		return conversation.InvocationValidationPassed
	}
	if len(call.StructuredOutput) > 0 {
		return conversation.InvocationValidationFailed
	}
	return conversation.InvocationValidationNotRun
}

func conversationRouteAttemptID(work conversation.ConversationInputRoutingWork) string {
	return fmt.Sprintf("conversation-route-attempt:%s:%d", conversationRouteActiveInputID(work), work.RoutingAttempt)
}

func conversationRouteAttemptEventID(work conversation.ConversationInputRoutingWork) string {
	return "conversation-invocation-attempted:" + conversationRouteAttemptID(work)
}
