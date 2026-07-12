package conversation

import (
	"context"
	"errors"
	"fmt"
)

// ExecuteRouteCommand dispatches one already validated and durably recorded
// conversation-local command through the same production services as direct
// conversation controls. IDs carried by the command remain the IDs of the
// resulting turn, side conversation, or durable child.
func (service *Service) ExecuteRouteCommand(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	decisionID string,
	source ConversationRouteDecisionSource,
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
		return service.queueTurn(
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
		return service.executeRoutedSideConversation(
			ctx,
			workspaceID,
			conversationID,
			source,
			command,
		)
	case ConversationRouteDecisionKindForkConversation:
		return service.executeRoutedForkConversation(
			ctx,
			workspaceID,
			conversationID,
			source,
			command,
		)
	case ConversationRouteDecisionKindAnswerAsNarrator,
		ConversationRouteDecisionKindEscalateToMaster,
		ConversationRouteDecisionKindClarify:
		return ConversationSnapshot{}, fmt.Errorf(
			"conversation route command %s is not an agent command",
			command.Kind,
		)
	default:
		return ConversationSnapshot{}, fmt.Errorf("unsupported conversation route command %q", command.Kind)
	}
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
	source ConversationRouteDecisionSource,
	command ConversationRouteCommand,
) (ConversationSnapshot, error) {
	payload := command.CreateSideConversation
	branchSource, err := routeBranchDecisionSource(source)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	sideConversationID := payload.SideConversationID
	parentPaneID := payload.ParentPaneID
	_, err = service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parentConversationID,
			ParentPaneID:         &parentPaneID,
			SideConversationID:   &sideConversationID,
			Source:               branchSource,
		},
		BranchDecision{
			Kind:                   BranchDecisionKindCreateSideConversation,
			CreateSideConversation: &CreateSideConversationBranchDecision{},
		},
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.SendSideConversationTurn(
		ctx,
		workspaceID,
		parentConversationID,
		payload.SideConversationID,
		payload.Input.Text,
	)
}

func (service *Service) executeRoutedForkConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	source ConversationRouteDecisionSource,
	command ConversationRouteCommand,
) (ConversationSnapshot, error) {
	payload := command.ForkConversation
	branchSource, err := routeBranchDecisionSource(source)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	childConversationID := payload.ChildConversationID
	_, err = service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parentConversationID,
			ChildConversationID:  &childConversationID,
			Source:               branchSource,
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
	return service.sendTurn(
		ctx,
		workspaceID,
		payload.ChildConversationID,
		payload.Input.Text,
		"",
	)
}

func routeBranchDecisionSource(source ConversationRouteDecisionSource) (BranchDecisionSource, error) {
	switch source {
	case ConversationRouteDecisionSourceRouter:
		return BranchDecisionSourceConversationRouter, nil
	case ConversationRouteDecisionSourceExplicit:
		return BranchDecisionSourceExplicit, nil
	default:
		return "", fmt.Errorf("unsupported conversation route decision source %q", source)
	}
}
