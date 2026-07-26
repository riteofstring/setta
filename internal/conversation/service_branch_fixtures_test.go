package conversation

import "context"

func (service *Service) sendTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.sendTurn(ctx, &workspaceID, conversationID, text, "")
}

func (service *Service) queueTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.queueTurn(ctx, &workspaceID, conversationID, text, "")
}

func (service *Service) steerTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.steerTurn(ctx, &workspaceID, conversationID, text, "", "")
}

func (service *Service) createDirectorSideConversationForTest(
	ctx context.Context,
	workspaceID string,
	parentConversationID string) (ConversationSnapshot, error) {
	return service.ExecuteBranchDecision(
		ctx,
		&workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parentConversationID,
			Source:               BranchDecisionSourceDirector,
		},
		BranchDecision{
			Kind:                   BranchDecisionKindCreateSideConversation,
			CreateSideConversation: &CreateSideConversationBranchDecision{},
		},
	)
}

// forkDirectorTopicForTest branches through the same entry point the Director's
// execution port calls, so a fork test proves the production path rather than a
// parallel one assembled here.
func (service *Service) forkDirectorTopicForTest(
	ctx context.Context,
	workspaceID *string,
	parentConversationID string,
	forkedAtTurnID string,
	title string,
) (ConversationSnapshot, error) {
	childConversationID, err := service.newID("conversation")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.ForkDirectorWorkstream(ctx, DirectorWorkstreamFork{
		ParentConversationID: parentConversationID,
		ChildConversationID:  childConversationID,
		ForkedAtRunID:        forkedAtTurnID,
		Title:                title,
		WorkspaceID:          workspaceID,
	})
}
