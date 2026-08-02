package conversation

import (
	"context"
	"errors"
)

// ExecuteBranchDecision is the only service entry point that dispatches a
// side/fork decision. The workspace is optional because a fork inherits the
// parent's scope, and a folderless conversation is a first-class one: work that
// needs none of the user's files can be branched the same as work that does. A
// side conversation is the exception — it runs an agent in the user's folder, so
// it cannot start without one.
func (service *Service) ExecuteBranchDecision(
	ctx context.Context,
	workspaceID *string,
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
	if workspaceID != nil {
		if err := validateIdentifier("branch decision workspace id", *workspaceID); err != nil {
			return ConversationSnapshot{}, err
		}
	}
	if err := scope.Validate(decision); err != nil {
		return ConversationSnapshot{}, err
	}

	switch decision.Kind {
	case BranchDecisionKindCreateSideConversation:
		if workspaceID == nil {
			return ConversationSnapshot{}, errors.New(
				"side conversation branch decision requires a workspace",
			)
		}
		return service.executeSideConversationDecision(
			ctx,
			*workspaceID,
			scope.ParentConversationID,
			scope.SideConversationID,
			scope.Source,
		)
	case BranchDecisionKindForkConversation:
		return service.executeBranchDecision(
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
