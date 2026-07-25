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
) (ConversationSnapshot, error) {
	if err := validateMasterRouteCommandRequest(service, ctx, decisionID, command); err != nil {
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
		return service.executeMasterSideConversation(ctx, command.CreateSideConversation)
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
	return command.Validate()
}

func (service *Service) executeMasterCreateConversation(
	ctx context.Context,
	command *master.MasterCreateConversationRouteCommand,
) (ConversationSnapshot, error) {
	targetWorkspaceID, folderScoped, err := masterRouteCommandFolderWorkspaceScope(command.Target)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	snapshot, err := service.store.ReadSnapshotByID(ctx, command.Target.ConversationID)
	if errors.Is(err, ErrConversationNotFound) {
		if _, err := service.CreateRoutedTopicWithOptionalWorkspace(
			ctx,
			optionalMasterRouteWorkspaceID(targetWorkspaceID, folderScoped),
			command.Target.Title,
			command.Target.ConversationID,
		); err != nil {
			return ConversationSnapshot{}, err
		}
	} else if err != nil {
		return ConversationSnapshot{}, err
	} else if err := validateExistingMasterRouteConversation(snapshot, command.Target, targetWorkspaceID, folderScoped); err != nil {
		return ConversationSnapshot{}, err
	}
	input, err := masterRouteInitialConversationInput(command)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if _, err := service.store.AcceptConversationInput(ctx, input, service.timestamp()); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshotByID(ctx, command.Target.ConversationID)
}

func (service *Service) executeMasterSideConversation(
	ctx context.Context,
	command *master.MasterCreateSideConversationRouteCommand,
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
	workspaceID, ok, err := masterRouteCommandFolderWorkspaceScope(target)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", &ResourceRequiredError{
			ConversationID: target.ConversationID,
			ResourceKind:   "folder",
		}
	}
	return workspaceID, nil
}

func masterRouteCommandFolderWorkspaceScope(
	target master.ConversationPresentationTarget,
) (string, bool, error) {
	if err := target.Validate(); err != nil {
		return "", false, err
	}
	workspaceID, ok := target.ResourceScope.FolderWorkspaceID()
	return workspaceID, ok, nil
}

func optionalMasterRouteWorkspaceID(workspaceID string, ok bool) *string {
	if !ok {
		return nil
	}
	return &workspaceID
}

func validateExistingMasterRouteConversation(
	snapshot ConversationSnapshot,
	target master.ConversationPresentationTarget,
	targetWorkspaceID string,
	folderScoped bool,
) error {
	if snapshot.Conversation.Title != target.Title {
		return stateConflict("master route conversation", target.ConversationID, "stored conversation has a different title")
	}
	if !folderScoped {
		if snapshot.Conversation.WorkspaceID != nil {
			return stateConflict("master route conversation", target.ConversationID, "stored conversation has a folder resource")
		}
		return nil
	}
	if snapshot.Conversation.WorkspaceID == nil || *snapshot.Conversation.WorkspaceID != targetWorkspaceID {
		return stateConflict("master route conversation", target.ConversationID, "stored conversation belongs to another resource scope")
	}
	return nil
}

func masterRouteInitialConversationInput(
	command *master.MasterCreateConversationRouteCommand,
) (ConversationInput, error) {
	modality, err := masterRouteConversationInputModality(command.InitialInputModality)
	if err != nil {
		return ConversationInput{}, err
	}
	input := ConversationInput{
		ID:             command.InitialInputID,
		ConversationID: command.Target.ConversationID,
		Text:           command.InitialInput,
		Modality:       modality,
		SubmittedAt:    command.InitialInputSubmitted,
	}
	return NormalizeConversationInput(input)
}

func masterRouteConversationInputModality(
	modality master.MasterInputModality,
) (ConversationInputModality, error) {
	switch modality {
	case master.MasterInputModalityText:
		return ConversationInputModalityText, nil
	case master.MasterInputModalityVoice:
		return ConversationInputModalityVoice, nil
	default:
		return "", fmt.Errorf("unsupported master route initial input modality %q", modality)
	}
}
