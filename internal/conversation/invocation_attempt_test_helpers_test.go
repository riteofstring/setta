package conversation

import (
	"fmt"

	"setta/internal/master"
)

func testSuccessfulInvocationAttempt(
	id string,
	conversationID string,
	turnID *string,
	callKind InvocationAttemptCallKind,
	trigger *NarrationTrigger,
	generation int,
	invocation ResolvedInvocation,
) InvocationAttempt {
	requested := cloneRoleProfile(invocation.Requested)
	resolved := cloneResolvedInvocationSettings(invocation.Resolved)
	attempt := InvocationAttempt{
		ID:             id,
		ConversationID: conversationID,
		TurnID:         cloneStringPointer(turnID),
		CallKind:       callKind,
		Trigger:        trigger,
		Generation:     generation,
		Context: InvocationAttemptContextAudit{
			IncludedRanges:       []TrajectorySequenceRange{},
			EventCounts:          []InvocationAttemptEventCount{},
			AllowedDecisionKinds: []ConversationRouteDecisionKind{},
		},
		Requested:          &requested,
		Resolved:           &resolved,
		ContextUsage:       invocation.ContextUsage,
		ProviderReferences: cloneInvocationProviderReferences(invocation.ProviderReferences),
		StartedAt:          invocation.StartedAt,
		EndedAt:            *invocation.EndedAt,
		Outcome:            InvocationAttemptOutcomeCompleted,
		ValidationResult:   InvocationValidationPassed,
		CommitDecision:     InvocationCommitOutputCommitted,
		Output:             InvocationAttemptOutputAudit{},
	}
	return attempt
}

func withTestConversationRouteAttempt(
	commit ConversationRouteDecisionCommit,
) ConversationRouteDecisionCommit {
	inputID := commit.InputID
	attempt := testSuccessfulInvocationAttempt(
		"attempt-"+commit.ID,
		commit.ConversationID,
		nil,
		InvocationAttemptCallInputRoute,
		nil,
		commit.RoutingAttempt,
		commit.ResolvedInvocation,
	)
	attempt.Context.Materialized = true
	attempt.Context.InputID = &inputID
	attempt.Context.ClarificationInputID = cloneStringPointer(commit.ClarificationInputID)
	attempt.Context.SourceThroughSequence = commit.RouterContext.LatestTrajectorySequence
	attempt.Context.AvailableRange = cloneTrajectorySequenceRange(commit.RouterContext.AvailableTrajectoryRange)
	if commit.RouterContext.IncludedTrajectoryRange != nil {
		attempt.Context.IncludedRanges = []TrajectorySequenceRange{*commit.RouterContext.IncludedTrajectoryRange}
	}
	attempt.Context.PriorMilestoneCount = commit.RouterContext.PriorNarrationCount
	attempt.Context.PriorRouteDecisionCount = commit.RouterContext.PriorRouteDecisionCount
	attempt.Context.ValidCompletedForkPointCount = commit.RouterContext.ValidCompletedForkPointCount
	attempt.Context.AllowedDecisionKinds = append(
		[]ConversationRouteDecisionKind{},
		commit.RouterContext.AllowedDecisionKinds...,
	)
	kind := string(commit.Decision.Kind)
	attempt.Output.StructuredKind = &kind
	commit.InvocationAttempt = attempt
	commit.InvocationAttemptCommittedID = "attempt-event-" + commit.ID
	return commit
}

func withTestNarratorProjectionAttempt(
	commit NarratorProjectionCommit,
	generation int,
) NarratorProjectionCommit {
	trigger := commit.Trigger
	callKind := InvocationAttemptCallProjection
	if trigger == NarrationTriggerTurnTerminal {
		callKind = InvocationAttemptCallTerminal
	}
	attempt := testSuccessfulInvocationAttempt(
		fmt.Sprintf("projection-attempt-%d-%s", generation, commit.TurnID),
		commit.ConversationID,
		&commit.TurnID,
		callKind,
		&trigger,
		generation,
		commit.ResolvedInvocation,
	)
	attempt.Context.Materialized = true
	observedThrough := commit.ObservedThroughSequence
	attempt.Context.ProposedObservedThrough = &observedThrough
	structuredKind := "working_projection"
	if callKind == InvocationAttemptCallTerminal {
		structuredKind = "terminal_projection"
	}
	attempt.Output.StructuredKind = &structuredKind
	attempt.Output.MilestoneCount = len(commit.Milestones)
	attempt.Output.FinalSummaryBytes = narrationTextCommitBytes(commit.FinalSummary)
	attempt.Output.TopicDescriptorBytes = narrationTextCommitBytes(commit.TopicDescriptor)
	commit.InvocationAttempt = attempt
	commit.InvocationAttemptCommittedID = fmt.Sprintf("projection-attempt-event-%d-%s", generation, commit.TurnID)
	return commit
}

func withTestNarratorStatusAttempt(
	commit NarratorStatusCommit,
	generation int,
) NarratorStatusCommit {
	trigger := NarrationTriggerExplicitStatusRequested
	commit.InvocationAttempt = testSuccessfulInvocationAttempt(
		fmt.Sprintf("status-attempt-%d-%s", generation, commit.ConversationID),
		commit.ConversationID,
		commit.TurnID,
		InvocationAttemptCallStatus,
		&trigger,
		generation,
		commit.ResolvedInvocation,
	)
	commit.InvocationAttempt.Context.Materialized = true
	commit.InvocationAttempt.Context.SourceThroughSequence = commit.SourceThroughSequence
	structuredKind := "status_reply"
	commit.InvocationAttempt.Output.StructuredKind = &structuredKind
	commit.InvocationAttempt.Output.StatusReplyBytes = len(commit.Reply.Text)
	commit.InvocationAttemptCommittedID = fmt.Sprintf("status-attempt-event-%d-%s", generation, commit.ConversationID)
	return commit
}

func withTestNarratorCheckpointAttempt(
	commit NarratorCheckpointCommit,
	generation int,
) NarratorCheckpointCommit {
	trigger := NarrationTriggerCheckpointWindowExceeded
	invocation := validInvocation(RoleNarrator, InvocationOutcomeSucceeded)
	commit.ResolvedInvocation = invocation
	attempt := testSuccessfulInvocationAttempt(
		fmt.Sprintf("checkpoint-attempt-%d-%s", generation, commit.ConversationID),
		commit.ConversationID,
		nil,
		InvocationAttemptCallCheckpoint,
		&trigger,
		generation,
		invocation,
	)
	attempt.Context.Materialized = true
	coveredThrough := commit.CoveredThroughSequence
	attempt.Context.ProposedCheckpointThrough = &coveredThrough
	structuredKind := "checkpoint"
	attempt.Output.StructuredKind = &structuredKind
	attempt.Output.CheckpointSummaryBytes = len(commit.HistoricalSummary)
	commit.InvocationAttempt = attempt
	commit.InvocationAttemptCommittedID = fmt.Sprintf("checkpoint-attempt-event-%d-%s", generation, commit.CommittedEventID)
	return commit
}

func withTestNarratorDegradationAttempt(
	commit NarratorDegradationCommit,
	generation int,
) NarratorDegradationCommit {
	trigger := NarrationTriggerProgressWindowElapsed
	failure := Failure{
		Code:                commit.Degradation.Code,
		Message:             commit.Degradation.Message,
		Retryable:           commit.Degradation.Retryable,
		DiagnosticReference: commit.Degradation.DiagnosticReference,
	}
	attempt := InvocationAttempt{
		ID:             fmt.Sprintf("degradation-attempt-%d-%s", generation, commit.ConversationID),
		ConversationID: commit.ConversationID,
		CallKind:       InvocationAttemptCallProjection,
		Trigger:        &trigger,
		Generation:     generation,
		Context: InvocationAttemptContextAudit{
			IncludedRanges:       []TrajectorySequenceRange{},
			EventCounts:          []InvocationAttemptEventCount{},
			AllowedDecisionKinds: []ConversationRouteDecisionKind{},
		},
		ContextUsage:     InvocationContextUsage{},
		StartedAt:        commit.Expected.UpdatedAt,
		EndedAt:          commit.Degradation.DegradedAt,
		Outcome:          InvocationAttemptOutcomeFailed,
		ValidationResult: InvocationValidationNotRun,
		CommitDecision:   InvocationCommitFailureCommitted,
		Output:           InvocationAttemptOutputAudit{},
		Failure:          &failure,
	}
	commit.InvocationAttempt = attempt
	commit.InvocationAttemptCommittedID = fmt.Sprintf("degradation-attempt-event-%d-%s", generation, commit.CommittedEventID)
	return commit
}

func withTestConversationRoutingFailureAttempt(
	failure ConversationInputRoutingFailure,
) ConversationInputRoutingFailure {
	inputID := failure.InputID
	attempt := InvocationAttempt{
		ID:             fmt.Sprintf("route-failure-attempt-%s-%d", failure.InputID, failure.RoutingAttempt),
		ConversationID: failure.ConversationID,
		CallKind:       InvocationAttemptCallInputRoute,
		Generation:     failure.RoutingAttempt,
		Context: InvocationAttemptContextAudit{
			InputID:              &inputID,
			ClarificationInputID: cloneStringPointer(failure.ClarificationInputID),
			IncludedRanges:       []TrajectorySequenceRange{},
			EventCounts:          []InvocationAttemptEventCount{},
			AllowedDecisionKinds: []ConversationRouteDecisionKind{},
		},
		ContextUsage:     InvocationContextUsage{},
		StartedAt:        failure.FailedAt,
		EndedAt:          failure.FailedAt,
		Outcome:          InvocationAttemptOutcomeFailed,
		ValidationResult: InvocationValidationNotRun,
		CommitDecision:   InvocationCommitFailureCommitted,
		Output:           InvocationAttemptOutputAudit{},
		Failure:          cloneFailurePointer(&failure.Failure),
	}
	failure.InvocationAttempt = attempt
	failure.InvocationAttemptCommittedID = fmt.Sprintf("route-failure-attempt-event-%s-%d", failure.InputID, failure.RoutingAttempt)
	return failure
}

func withTestMasterRouteAttempt(commit master.RouteDecisionCommit) master.RouteDecisionCommit {
	sessionID := commit.MasterSessionID
	contextAudit := commit.Context
	configuration := commit.ResolvedInvocation.Configuration
	requestID := commit.ResolvedInvocation.ProviderRequestID
	threadID := commit.ResolvedInvocation.ProviderThreadID
	turnID := commit.ResolvedInvocation.ProviderTurnID
	decisionKind := commit.Decision.Kind
	commit.InvocationAttempt = master.RouteInvocationAttempt{
		ID:                    requestID,
		CallKind:              master.RouteInvocationCallRoute,
		MasterSessionID:       &sessionID,
		InputID:               commit.InputID,
		RoutingAttempt:        commit.RoutingAttempt,
		Context:               &contextAudit,
		Configuration:         &configuration,
		ProviderRequestID:     &requestID,
		ProviderThreadID:      &threadID,
		ProviderTurnID:        &turnID,
		InputBytes:            commit.ResolvedInvocation.InputBytes,
		EstimatedInputTokens:  commit.ResolvedInvocation.EstimatedInputTokens,
		OutputBytes:           commit.ResolvedInvocation.OutputBytes,
		EstimatedOutputTokens: commit.ResolvedInvocation.EstimatedOutputTokens,
		StartedAt:             commit.ResolvedInvocation.StartedAt,
		EndedAt:               commit.ResolvedInvocation.EndedAt,
		DecisionKind:          &decisionKind,
		ValidationResult:      master.RouteInvocationValidationPassed,
		CommitDecision:        master.RouteInvocationCommitOutput,
		Outcome:               master.RouteInvocationOutcomeCompleted,
	}
	return commit
}

func withTestMasterRoutingFailureAttempt(
	failure master.InputRoutingFailure,
	startedAt string,
) master.InputRoutingFailure {
	routeFailure := failure.Failure
	failure.InvocationAttempt = master.RouteInvocationAttempt{
		ID:               fmt.Sprintf("master-route-failure-attempt-%s-%d", failure.InputID, failure.RoutingAttempt),
		CallKind:         master.RouteInvocationCallRoute,
		InputID:          failure.InputID,
		RoutingAttempt:   failure.RoutingAttempt,
		StartedAt:        startedAt,
		EndedAt:          failure.FailedAt,
		ValidationResult: master.RouteInvocationValidationNotRun,
		CommitDecision:   master.RouteInvocationCommitFailure,
		Outcome:          master.RouteInvocationOutcomeFailed,
		Failure:          &routeFailure,
	}
	return failure
}

func testMasterRoutingCancellationAttempt(
	work master.InputRoutingWork,
	cancelledAt string,
) master.RouteInvocationAttempt {
	return master.RouteInvocationAttempt{
		ID:               fmt.Sprintf("master-route-cancel-attempt-%s-%d", work.Input.Input.ID, work.RoutingAttempt),
		CallKind:         master.RouteInvocationCallRoute,
		InputID:          work.Input.Input.ID,
		RoutingAttempt:   work.RoutingAttempt,
		StartedAt:        work.RoutingStartedAt,
		EndedAt:          cancelledAt,
		ValidationResult: master.RouteInvocationValidationNotRun,
		CommitDecision:   master.RouteInvocationCommitCancel,
		Outcome:          master.RouteInvocationOutcomeCancelled,
	}
}
