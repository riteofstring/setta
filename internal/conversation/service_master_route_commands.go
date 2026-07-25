package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/master"
)

// ExecuteMasterRouteCommand dispatches one trusted command that was persisted
// with a validated global route decision. Stable ids make every branch
// replayable across the decision/effect crash boundary.
func (service *Service) ExecuteMasterRouteCommand(
	ctx context.Context,
	decisionID string,
	command master.RouteCommand,
	resolvedPaneID *string,
) (ConversationSnapshot, error) {
	if err := validateMasterRouteCommandRequest(service, ctx, decisionID, command, resolvedPaneID); err != nil {
		return ConversationSnapshot{}, err
	}

	switch command.Kind {
	case master.RouteDecisionKindSendToAgent:
		return service.executeMasterSendToAgent(ctx, command.SendToAgent)
	case master.RouteDecisionKindQueueAgentTurn:
		return service.executeMasterQueueAgentTurn(ctx, command.QueueAgentTurn)
	case master.RouteDecisionKindSteerActiveTurn:
		return service.executeMasterSteerActiveTurn(ctx, decisionID, command.SteerActiveTurn)
	case master.RouteDecisionKindCreateConversation:
		return service.executeMasterCreateConversation(ctx, command.CreateConversation)
	case master.RouteDecisionKindCreateSideConversation:
		return service.executeMasterSideConversation(ctx, command.CreateSideConversation, *resolvedPaneID)
	case master.RouteDecisionKindForkConversation:
		return service.executeMasterForkConversation(ctx, command.ForkConversation)
	case master.RouteDecisionKindAskNarrator,
		master.RouteDecisionKindFocusConversation,
		master.RouteDecisionKindClarify,
		master.RouteDecisionKindAnswerGlobal:
		return ConversationSnapshot{}, fmt.Errorf("master route command %s is not a conversation-agent command", command.Kind)
	default:
		return ConversationSnapshot{}, fmt.Errorf("unsupported master route command %q", command.Kind)
	}
}

func (service *Service) executeMasterSendToAgent(
	ctx context.Context,
	command *master.MasterSendToAgentRouteCommand,
) (ConversationSnapshot, error) {
	workspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.sendTurn(ctx, workspaceID, command.Target.ConversationID, command.AuthoredInput, command.TurnID)
}

func (service *Service) executeMasterQueueAgentTurn(
	ctx context.Context,
	command *master.MasterQueueAgentTurnRouteCommand,
) (ConversationSnapshot, error) {
	workspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.queueRoutedTurn(ctx, workspaceID, command.Target.ConversationID, command.AuthoredInput, command.TurnID)
}

func (service *Service) executeMasterSteerActiveTurn(
	ctx context.Context,
	decisionID string,
	command *master.MasterSteerActiveTurnRouteCommand,
) (ConversationSnapshot, error) {
	workspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.steerTurn(ctx, workspaceID, command.Target.ConversationID, command.AuthoredInput, command.TargetTurnID, decisionID)
}

func validateMasterRouteCommandRequest(
	service *Service,
	ctx context.Context,
	decisionID string,
	command master.RouteCommand,
	resolvedPaneID *string,
) error {
	if service == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return errors.New("master route command context is required")
	}
	if err := validateIdentifier("master route command decision id", decisionID); err != nil {
		return err
	}
	if err := command.Validate(); err != nil {
		return err
	}
	if command.Kind == master.RouteDecisionKindCreateSideConversation {
		return validateMasterSideRoutePane(resolvedPaneID)
	}
	if resolvedPaneID != nil {
		return errors.New("non-side master route command cannot have a resolved pane")
	}
	return nil
}

func validateMasterSideRoutePane(resolvedPaneID *string) error {
	if resolvedPaneID == nil {
		return errors.New("master side route requires a resolved parent pane")
	}
	return validateIdentifier("master side route resolved pane id", *resolvedPaneID)
}

func (service *Service) executeMasterCreateConversation(
	ctx context.Context,
	command *master.MasterCreateConversationRouteCommand,
) (ConversationSnapshot, error) {
	targetWorkspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceID, err := service.store.ReadConversationWorkspaceID(ctx, command.Target.ConversationID)
	if errors.Is(err, ErrConversationNotFound) {
		if _, err := service.CreateRoutedTopic(ctx, targetWorkspaceID, command.Target.Title, command.Target.ConversationID); err != nil {
			return ConversationSnapshot{}, err
		}
	} else if err != nil {
		return ConversationSnapshot{}, err
	} else if workspaceID != targetWorkspaceID {
		return ConversationSnapshot{}, stateConflict("master route conversation", command.Target.ConversationID, "stored conversation belongs to another workspace")
	}
	return service.sendTurn(ctx, targetWorkspaceID, command.Target.ConversationID, command.InitialInput, command.TurnID)
}

func (service *Service) executeMasterSideConversation(
	ctx context.Context,
	command *master.MasterCreateSideConversationRouteCommand,
	parentPaneID string,
) (ConversationSnapshot, error) {
	workspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	parent, err := service.store.ReadSnapshot(ctx, workspaceID, command.Target.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if _, findErr := findSideConversation(parent, command.SideConversationID); findErr != nil {
		if _, err := service.ExecuteBranchDecision(
			ctx,
			workspaceID,
			BranchDecisionExecutionScope{
				ParentConversationID: command.Target.ConversationID,
				ParentPaneID:         &parentPaneID,
				SideConversationID:   &command.SideConversationID,
				Source:               BranchDecisionSourceMaster,
			},
			BranchDecision{
				Kind:                   BranchDecisionKindCreateSideConversation,
				CreateSideConversation: &CreateSideConversationBranchDecision{},
			},
		); err != nil {
			return ConversationSnapshot{}, err
		}
	}
	return service.sendSideConversationTurn(
		ctx,
		workspaceID,
		command.Target.ConversationID,
		command.SideConversationID,
		command.Input,
		command.TurnID,
	)
}

func (service *Service) executeMasterForkConversation(
	ctx context.Context,
	command *master.MasterForkConversationRouteCommand,
) (ConversationSnapshot, error) {
	targetWorkspaceID, err := masterRouteCommandFolderWorkspaceID(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceID, err := service.store.ReadConversationWorkspaceID(ctx, command.Target.ConversationID)
	if errors.Is(err, ErrConversationNotFound) {
		if _, err := service.ExecuteBranchDecision(
			ctx,
			targetWorkspaceID,
			BranchDecisionExecutionScope{
				ParentConversationID: command.ParentConversationID,
				ChildConversationID:  &command.Target.ConversationID,
				Source:               BranchDecisionSourceMaster,
			},
			BranchDecision{
				Kind: BranchDecisionKindForkConversation,
				ForkConversation: &ForkConversationBranchDecision{
					ForkedAtTurnID: command.ForkedAtTurnID,
					ProposedTitle:  command.Target.Title,
				},
			},
		); err != nil {
			return ConversationSnapshot{}, err
		}
	} else if err != nil {
		return ConversationSnapshot{}, err
	} else if workspaceID != targetWorkspaceID {
		return ConversationSnapshot{}, stateConflict("master route fork", command.Target.ConversationID, "stored child belongs to another workspace")
	}
	return service.sendTurn(ctx, targetWorkspaceID, command.Target.ConversationID, command.Input, command.TurnID)
}

func masterRouteCommandFolderWorkspaceID(
	target master.ConversationPresentationTarget,
) (string, error) {
	workspaceID, ok := target.ResourceScope.FolderWorkspaceID()
	if !ok {
		return "", &ResourceRequiredError{
			ConversationID: target.ConversationID,
			ResourceKind:   "folder",
		}
	}
	return workspaceID, nil
}
