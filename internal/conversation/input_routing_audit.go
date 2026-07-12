package conversation

import (
	"errors"
	"fmt"
)

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
