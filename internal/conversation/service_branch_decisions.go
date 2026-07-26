package conversation

import (
	"context"
	"errors"
)

// ExecuteBranchDecision is the only service entry point that dispatches a
// side/fork decision. Constrained routing actors supply different trusted
// sources but share the same validation and provider-reference resolution.
func (service *Service) ExecuteBranchDecision(
	ctx context.Context,
	workspaceID string,
	scope BranchDecisionExecutionScope,
	decision BranchDecision,
) (ConversationSnapshot, error) {
	if service == nil {
		return ConversationSnapshot{}, errors.New("conversation service is required")
	}
	if ctx == nil {
		return ConversationSnapshot{}, errors.New("branch decision context is required")
	}
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("branch decision workspace id", workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := scope.Validate(decision); err != nil {
		return ConversationSnapshot{}, err
	}

	switch decision.Kind {
	case BranchDecisionKindCreateSideConversation:
		return service.executeSideConversationDecision(
			ctx,
			workspaceID,
			scope.ParentConversationID,
			*scope.ParentPaneID,
			scope.SideConversationID,
			scope.Source,
		)
	case BranchDecisionKindForkConversation:
		return service.executeDurableForkDecision(
			ctx,
			workspaceID,
			scope.ParentConversationID,
			decision.ForkConversation.ForkedAtTurnID,
			decision.ForkConversation.ProposedTitle,
			scope.ChildConversationID,
			scope.Source,
		)
	default:
		return ConversationSnapshot{}, errors.New("validated branch decision has unsupported kind")
	}
}

func (service *Service) branchConversationID(
	requested *string,
	generatedPrefix string,
	validationLabel string,
) (string, error) {
	if requested == nil {
		return service.newID(generatedPrefix)
	}
	if err := validateIdentifier(validationLabel, *requested); err != nil {
		return "", err
	}
	return *requested, nil
}
