package conversation

import (
	"errors"
	"fmt"
	"reflect"
)

func validateSuccessfulConversationRouteAttempt(commit ConversationRouteDecisionCommit) error {
	attempt := commit.InvocationAttempt
	if err := attempt.Validate(); err != nil {
		return fmt.Errorf("conversation-router invocation attempt: %w", err)
	}
	if err := validateConversationRouteResolvedAttempt(attempt, commit); err != nil {
		return err
	}
	if err := validateConversationRouteContextAttempt(attempt, commit); err != nil {
		return err
	}
	return validateInvocationAttemptCommitTime(attempt, commit.DecidedAt)
}

func validateConversationRouteResolvedAttempt(
	attempt InvocationAttempt,
	commit ConversationRouteDecisionCommit,
) error {
	invocation := commit.ResolvedInvocation
	if !invocationAttemptChecksPass(
		attempt.CallKind == InvocationAttemptCallInputRoute,
		attempt.ConversationID == commit.ConversationID,
		attempt.Generation == commit.RoutingAttempt,
		attempt.Trigger == nil,
		attempt.Outcome == InvocationAttemptOutcomeCompleted,
		attempt.CommitDecision == InvocationCommitOutputCommitted,
		attempt.Requested != nil,
		attempt.Resolved != nil,
		resolvedInvocationEndedAtMatches(attempt, invocation),
	) {
		return errors.New("conversation-router invocation attempt does not match resolved invocation")
	}
	if !invocationAttemptChecksPass(
		reflect.DeepEqual(*attempt.Requested, invocation.Requested),
		reflect.DeepEqual(*attempt.Resolved, invocation.Resolved),
		attempt.ContextUsage == invocation.ContextUsage,
		reflect.DeepEqual(attempt.ProviderReferences, invocation.ProviderReferences),
		attempt.StartedAt == invocation.StartedAt,
	) {
		return errors.New("conversation-router invocation attempt does not match resolved invocation")
	}
	return nil
}

func validateConversationRouteContextAttempt(
	attempt InvocationAttempt,
	commit ConversationRouteDecisionCommit,
) error {
	contextAudit := commit.RouterContext
	decisionKind := string(commit.Decision.Kind)
	includedRanges := []TrajectorySequenceRange{}
	if contextAudit.IncludedTrajectoryRange != nil {
		includedRanges = append(includedRanges, *contextAudit.IncludedTrajectoryRange)
	}
	if !invocationAttemptChecksPass(
		attempt.Context.Materialized,
		invocationAttemptStringEquals(attempt.Context.InputID, commit.InputID),
		equalOptionalString(attempt.Context.ClarificationInputID, commit.ClarificationInputID),
		attempt.Context.SourceThroughSequence == contextAudit.LatestTrajectorySequence,
		reflect.DeepEqual(attempt.Context.AvailableRange, contextAudit.AvailableTrajectoryRange),
		reflect.DeepEqual(attempt.Context.IncludedRanges, includedRanges),
		attempt.Context.PriorMilestoneCount == contextAudit.PriorNarrationCount,
		attempt.Context.PriorRouteDecisionCount == contextAudit.PriorRouteDecisionCount,
		attempt.Context.ValidCompletedForkPointCount == contextAudit.ValidCompletedForkPointCount,
		reflect.DeepEqual(attempt.Context.AllowedDecisionKinds, contextAudit.AllowedDecisionKinds),
		invocationAttemptStringEquals(attempt.Output.StructuredKind, decisionKind),
	) {
		return errors.New("conversation-router invocation attempt does not match router context")
	}
	return nil
}

func validateFailedConversationRouteAttempt(
	attempt InvocationAttempt,
	conversationID string,
	inputID string,
	clarificationInputID *string,
	routingAttempt int,
	failure Failure,
	committedAt string,
) error {
	if err := attempt.Validate(); err != nil {
		return fmt.Errorf("conversation-router invocation attempt: %w", err)
	}
	if !invocationAttemptChecksPass(
		attempt.ConversationID == conversationID,
		attempt.CallKind == InvocationAttemptCallInputRoute,
		attempt.Generation == routingAttempt,
		attempt.Outcome == InvocationAttemptOutcomeFailed,
		attempt.CommitDecision == InvocationCommitFailureCommitted,
		invocationAttemptFailureEquals(attempt.Failure, failure),
		invocationAttemptStringEquals(attempt.Context.InputID, inputID),
		equalOptionalString(attempt.Context.ClarificationInputID, clarificationInputID),
	) {
		return errors.New("conversation-router failed invocation attempt does not match routing failure")
	}
	return validateInvocationAttemptCommitTime(attempt, committedAt)
}

func resolvedInvocationEndedAtMatches(attempt InvocationAttempt, invocation ResolvedInvocation) bool {
	return invocation.EndedAt != nil && attempt.EndedAt == *invocation.EndedAt
}

func invocationAttemptStringEquals(actual *string, want string) bool {
	return actual != nil && *actual == want
}

func invocationAttemptFailureEquals(actual *Failure, want Failure) bool {
	return actual != nil && reflect.DeepEqual(*actual, want)
}

func validateFailedConversationInputAttempt(state ConversationInputState) error {
	return validateFailedConversationRouteAttempt(
		*state.InvocationAttempt,
		state.Input.ConversationID,
		conversationRouteRootInputID(state.Input),
		conversationRouteStateClarificationInputID(state.Input),
		state.RoutingAttempt,
		*state.Failure,
		state.InvocationAttempt.EndedAt,
	)
}

func conversationRouteRootInputID(input ConversationInput) string {
	if input.ReplyToInputID != nil {
		return *input.ReplyToInputID
	}
	return input.ID
}

func conversationRouteStateClarificationInputID(input ConversationInput) *string {
	if input.ReplyToInputID == nil {
		return nil
	}
	id := input.ID
	return &id
}

func validateConversationRouteDecisionAudit(
	clarificationInputID *string,
	decisionKind ConversationRouteDecisionKind,
	routerContext ConversationRouteContextAudit,
	resolvedInvocation ResolvedInvocation,
) error {
	return validateRouterConversationRouteDecisionAudit(
		clarificationInputID,
		decisionKind,
		routerContext,
		resolvedInvocation,
	)
}

func validateRouterConversationRouteDecisionAudit(
	clarificationInputID *string,
	decisionKind ConversationRouteDecisionKind,
	routerContext ConversationRouteContextAudit,
	resolvedInvocation ResolvedInvocation,
) error {
	if err := routerContext.Validate(); err != nil {
		return err
	}
	if (clarificationInputID != nil) != (routerContext.ClarificationInputSequence != nil) {
		return errors.New("conversation-router clarification audit does not match the decision envelope")
	}
	if !conversationRouteDecisionKindIncluded(routerContext.AllowedDecisionKinds, decisionKind) {
		return fmt.Errorf("conversation-router decision %s was not allowed by its context", decisionKind)
	}
	if err := resolvedInvocation.Validate(); err != nil {
		return fmt.Errorf("conversation-router resolved invocation: %w", err)
	}
	if resolvedInvocation.Role != RoleNarrator || resolvedInvocation.Outcome != InvocationOutcomeSucceeded {
		return errors.New("conversation-router decision requires a successful narrator invocation")
	}
	return validateConversationRouterInvocationAudit(resolvedInvocation)
}

func validateConversationRouterInvocationAudit(invocation ResolvedInvocation) error {
	expectedPermission := DefaultNarratorRoleProfile().PermissionProfile
	if !equalConversationRouterPermission(invocation.Requested.PermissionProfile, expectedPermission) ||
		!equalConversationRouterPermission(invocation.Resolved.PermissionProfile, expectedPermission) {
		return errors.New("conversation-router invocation must use the restricted narrator permission profile")
	}
	if invocation.ContextUsage.InputBytes <= 0 || invocation.ContextUsage.OutputBytes <= 0 {
		return errors.New("conversation-router invocation must record positive input and output byte usage")
	}
	if invocation.ProviderReferences.ThreadID == nil ||
		invocation.ProviderReferences.TurnID == nil ||
		invocation.ProviderReferences.RequestID == nil {
		return errors.New("conversation-router invocation must record provider thread, turn, and request references")
	}
	return nil
}

func equalConversationRouterPermission(left PermissionProfile, right PermissionProfile) bool {
	return left.ApprovalPolicy == right.ApprovalPolicy &&
		left.ProviderPermissionProfile == right.ProviderPermissionProfile &&
		left.ToolAccess.Mode == right.ToolAccess.Mode &&
		len(left.ToolAccess.AllowedTools) == 0 && len(right.ToolAccess.AllowedTools) == 0 &&
		left.WorkspaceMutation == right.WorkspaceMutation &&
		left.Approvals == right.Approvals
}

func (audit ConversationRouteContextAudit) Validate() error {
	if err := validateConversationRouteAuditIdentity(audit); err != nil {
		return err
	}
	if err := validateConversationRouteAuditRanges(audit); err != nil {
		return err
	}
	return validateConversationRouteAuditAllowedKinds(audit.AllowedDecisionKinds)
}

func validateConversationRouteAuditIdentity(audit ConversationRouteContextAudit) error {
	if audit.InputSequence <= 0 {
		return errors.New("conversation route context input sequence must be positive")
	}
	if audit.ClarificationInputSequence != nil && *audit.ClarificationInputSequence <= audit.InputSequence {
		return errors.New("conversation route clarification sequence must follow the routed input")
	}
	if audit.LatestTrajectorySequence < 0 || audit.PriorNarrationCount < 0 ||
		audit.PriorRouteDecisionCount < 0 || audit.ValidCompletedForkPointCount < 0 {
		return errors.New("conversation route context counts must be non-negative")
	}
	return nil
}

func validateConversationRouteAuditRanges(audit ConversationRouteContextAudit) error {
	if err := validateConversationRouteAuditRange(
		"available",
		audit.AvailableTrajectoryRange,
		audit.LatestTrajectorySequence,
	); err != nil {
		return err
	}
	if err := validateConversationRouteAuditRange(
		"included",
		audit.IncludedTrajectoryRange,
		audit.LatestTrajectorySequence,
	); err != nil {
		return err
	}
	if audit.IncludedTrajectoryRange != nil && audit.AvailableTrajectoryRange == nil {
		return errors.New("conversation route context includes trajectory without an available range")
	}
	if audit.IncludedTrajectoryRange != nil &&
		(audit.IncludedTrajectoryRange.Start < audit.AvailableTrajectoryRange.Start ||
			audit.IncludedTrajectoryRange.End > audit.AvailableTrajectoryRange.End) {
		return errors.New("conversation route included trajectory exceeds its available range")
	}
	return nil
}

func validateConversationRouteAuditAllowedKinds(kinds []ConversationRouteDecisionKind) error {
	if kinds == nil || len(kinds) == 0 {
		return errors.New("conversation route context allowed decision kinds must be a non-empty array")
	}
	seen := map[ConversationRouteDecisionKind]bool{}
	for _, kind := range kinds {
		if seen[kind] {
			return fmt.Errorf("conversation route context repeats allowed decision kind %s", kind)
		}
		seen[kind] = true
		if !validConversationRouteDecisionKind(kind) {
			return fmt.Errorf("conversation route context contains unsupported decision kind %q", kind)
		}
	}
	return nil
}

func validateConversationRouteAuditRange(label string, value *TrajectorySequenceRange, latest int) error {
	if value == nil {
		return nil
	}
	if err := value.Validate(); err != nil {
		return fmt.Errorf("conversation route %s trajectory range: %w", label, err)
	}
	if value.End > latest {
		return fmt.Errorf("conversation route %s trajectory range exceeds latest sequence", label)
	}
	return nil
}

func validConversationRouteDecisionKind(kind ConversationRouteDecisionKind) bool {
	switch kind {
	case ConversationRouteDecisionKindSendToParent,
		ConversationRouteDecisionKindQueueParentTurn,
		ConversationRouteDecisionKindSteerParentTurn,
		ConversationRouteDecisionKindAnswerAsNarrator,
		ConversationRouteDecisionKindCreateSideConversation,
		ConversationRouteDecisionKindForkConversation,
		ConversationRouteDecisionKindEscalateToMaster,
		ConversationRouteDecisionKindClarify:
		return true
	default:
		return false
	}
}

func conversationRouteDecisionKindIncluded(
	kinds []ConversationRouteDecisionKind,
	want ConversationRouteDecisionKind,
) bool {
	for _, kind := range kinds {
		if kind == want {
			return true
		}
	}
	return false
}
