package conversation

import "context"

func (service *Service) sendTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.sendTurn(ctx, workspaceID, conversationID, text, "")
}

func (service *Service) queueTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.queueTurn(ctx, workspaceID, conversationID, text, "")
}

func (service *Service) steerTestTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.steerTurn(ctx, workspaceID, conversationID, text, "", "")
}

func (service *Service) createRouterSideConversationForTest(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	parentPaneID string,
) (ConversationSnapshot, error) {
	return service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parentConversationID,
			ParentPaneID:         &parentPaneID,
			Source:               BranchDecisionSourceConversationRouter,
		},
		BranchDecision{
			Kind:                   BranchDecisionKindCreateSideConversation,
			CreateSideConversation: &CreateSideConversationBranchDecision{},
		},
	)
}

func (service *Service) forkRouterTopicForTest(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	forkedAtTurnID string,
	title string,
) (ConversationSnapshot, error) {
	return service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parentConversationID,
			Source:               BranchDecisionSourceConversationRouter,
		},
		BranchDecision{
			Kind: BranchDecisionKindForkConversation,
			ForkConversation: &ForkConversationBranchDecision{
				ForkedAtTurnID: forkedAtTurnID,
				ProposedTitle:  title,
			},
		},
	)
}
