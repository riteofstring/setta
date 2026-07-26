package conversation

import (
	"context"
	"errors"
	"fmt"
)

// ExecuteRouteCommand dispatches one already validated and durably recorded
// conversation-local command through the production conversation services.
// IDs carried by the command remain the IDs of the resulting turn, side
// conversation, or durable child.
//
// The workspace is optional. Delivering work to the conversation itself needs
// no folder; a side conversation or a fork does, because both create durable
// records scoped to one.
func (service *Service) ExecuteRouteCommand(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	decisionID string,
	command ConversationRouteCommand,
) (ConversationSnapshot, error) {
	if err := validateRouteCommandExecution(
		service,
		ctx,
		conversationID,
		decisionID,
		command,
	); err != nil {
		return ConversationSnapshot{}, err
	}

	switch command.Kind {
	case ConversationRouteDecisionKindSendToParent:
		payload := command.SendToParent
		return service.sendTurn(
			ctx,
			workspaceID,
			conversationID,
			payload.AuthoredInput.Text,
			payload.TurnID,
		)
	case ConversationRouteDecisionKindQueueParentTurn:
		payload := command.QueueParentTurn
		return service.queueRoutedTurn(
			ctx,
			workspaceID,
			conversationID,
			payload.AuthoredInput.Text,
			payload.TurnID,
		)
	case ConversationRouteDecisionKindSteerParentTurn:
		payload := command.SteerParentTurn
		return service.steerTurn(
			ctx,
			workspaceID,
			conversationID,
			payload.AuthoredInput.Text,
			payload.TargetTurnID,
			decisionID,
		)
	case ConversationRouteDecisionKindCreateSideConversation:
		boundWorkspaceID, err := requireRoutedBranchWorkspace(conversationID, workspaceID)
		if err != nil {
			return ConversationSnapshot{}, err
		}
		return service.executeRoutedSideConversation(
			ctx,
			boundWorkspaceID,
			conversationID,
			command,
		)
	case ConversationRouteDecisionKindForkConversation:
		boundWorkspaceID, err := requireRoutedBranchWorkspace(conversationID, workspaceID)
		if err != nil {
			return ConversationSnapshot{}, err
		}
		return service.executeRoutedForkConversation(
			ctx,
			boundWorkspaceID,
			conversationID,
			command,
		)
	case ConversationRouteDecisionKindAnswerAsNarrator,
		ConversationRouteDecisionKindClarify:
		return ConversationSnapshot{}, fmt.Errorf(
			"conversation route command %s is not an agent command",
			command.Kind,
		)
	default:
		return ConversationSnapshot{}, fmt.Errorf("unsupported conversation route command %q", command.Kind)
	}
}

// requireRoutedBranchWorkspace resolves the folder a side conversation or fork
// is created inside. Both are workspace-scoped durable records, so an unbound
// conversation is asked for a folder rather than branched without one.
func requireRoutedBranchWorkspace(conversationID string, workspaceID *string) (string, error) {
	if workspaceID == nil {
		return "", &ResourceRequiredError{
			ConversationID: conversationID,
			ResourceKind:   "folder",
		}
	}
	return *workspaceID, nil
}

func validateRouteCommandExecution(
	service *Service,
	ctx context.Context,
	conversationID string,
	decisionID string,
	command ConversationRouteCommand,
) error {
	if service == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return errors.New("conversation route command context is required")
	}
	if err := validateIdentifier("conversation route command decision id", decisionID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation route command conversation id", conversationID); err != nil {
		return err
	}
	return command.Validate()
}

func (service *Service) executeRoutedSideConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	command ConversationRouteCommand,
) (ConversationSnapshot, error) {
	payload := command.CreateSideConversation
	sideConversationID := payload.SideConversationID
	parentSnapshot, err := service.store.ReadSnapshot(ctx, workspaceID, parentConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if _, findErr := findSideConversation(parentSnapshot, sideConversationID); findErr != nil {
		_, err = service.ExecuteBranchDecision(
			ctx,
			workspaceID,
			BranchDecisionExecutionScope{
				ParentConversationID: parentConversationID,
				SideConversationID:   &sideConversationID,
				Source:               BranchDecisionSourceConversationRouter,
			},
			BranchDecision{
				Kind:                   BranchDecisionKindCreateSideConversation,
				CreateSideConversation: &CreateSideConversationBranchDecision{},
			},
		)
		if err != nil {
			return ConversationSnapshot{}, err
		}
	}
	return service.sendSideConversationTurn(
		ctx,
		workspaceID,
		parentConversationID,
		payload.SideConversationID,
		payload.Input.Text,
		payload.TurnID,
	)
}

func (service *Service) executeRoutedForkConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	command ConversationRouteCommand,
) (ConversationSnapshot, error) {
	payload := command.ForkConversation
	childConversationID := payload.ChildConversationID
	childWorkspaceID, readErr := service.store.ReadConversationWorkspaceID(ctx, childConversationID)
	if errors.Is(readErr, ErrConversationNotFound) {
		_, err := service.ExecuteBranchDecision(
			ctx,
			workspaceID,
			BranchDecisionExecutionScope{
				ParentConversationID: parentConversationID,
				ChildConversationID:  &childConversationID,
				Source:               BranchDecisionSourceConversationRouter,
			},
			BranchDecision{
				Kind: BranchDecisionKindForkConversation,
				ForkConversation: &ForkConversationBranchDecision{
					ForkedAtTurnID: payload.ForkedAtTurnID,
					ProposedTitle:  payload.ProposedTitle,
				},
			},
		)
		if err != nil {
			return ConversationSnapshot{}, err
		}
	} else if readErr != nil {
		return ConversationSnapshot{}, readErr
	} else if childWorkspaceID != workspaceID {
		return ConversationSnapshot{}, stateConflict(
			"conversation route fork",
			childConversationID,
			"stored child belongs to a different workspace",
		)
	}
	return service.sendTurn(
		ctx,
		&workspaceID,
		payload.ChildConversationID,
		payload.Input.Text,
		payload.TurnID,
	)
}
