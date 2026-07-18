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
		payload := command.SendToAgent
		return service.sendTurn(ctx, payload.Target.WorkspaceID, payload.Target.ConversationID, payload.AuthoredInput, payload.TurnID)
	case master.RouteDecisionKindQueueAgentTurn:
		payload := command.QueueAgentTurn
		return service.queueRoutedTurn(ctx, payload.Target.WorkspaceID, payload.Target.ConversationID, payload.AuthoredInput, payload.TurnID)
	case master.RouteDecisionKindSteerActiveTurn:
		payload := command.SteerActiveTurn
		return service.steerTurn(ctx, payload.Target.WorkspaceID, payload.Target.ConversationID, payload.AuthoredInput, payload.TargetTurnID, decisionID)
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
	workspaceID, err := service.store.ReadConversationWorkspaceID(ctx, command.Target.ConversationID)
	if errors.Is(err, ErrConversationNotFound) {
		if _, err := service.CreateRoutedTopic(ctx, command.Target.WorkspaceID, command.Target.Title, command.Target.ConversationID); err != nil {
			return ConversationSnapshot{}, err
		}
	} else if err != nil {
		return ConversationSnapshot{}, err
	} else if workspaceID != command.Target.WorkspaceID {
		return ConversationSnapshot{}, stateConflict("master route conversation", command.Target.ConversationID, "stored conversation belongs to another workspace")
	}
	return service.sendTurn(ctx, command.Target.WorkspaceID, command.Target.ConversationID, command.InitialInput, command.TurnID)
}

func (service *Service) executeMasterSideConversation(
	ctx context.Context,
	command *master.MasterCreateSideConversationRouteCommand,
	parentPaneID string,
) (ConversationSnapshot, error) {
	parent, err := service.store.ReadSnapshot(ctx, command.Target.WorkspaceID, command.Target.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if _, findErr := findSideConversation(parent, command.SideConversationID); findErr != nil {
		if _, err := service.ExecuteBranchDecision(
			ctx,
			command.Target.WorkspaceID,
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
		command.Target.WorkspaceID,
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
	workspaceID, err := service.store.ReadConversationWorkspaceID(ctx, command.Target.ConversationID)
	if errors.Is(err, ErrConversationNotFound) {
		if _, err := service.ExecuteBranchDecision(
			ctx,
			command.Target.WorkspaceID,
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
	} else if workspaceID != command.Target.WorkspaceID {
		return ConversationSnapshot{}, stateConflict("master route fork", command.Target.ConversationID, "stored child belongs to another workspace")
	}
	return service.sendTurn(ctx, command.Target.WorkspaceID, command.Target.ConversationID, command.Input, command.TurnID)
}
