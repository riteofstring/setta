package conversation

import (
	"context"
	"testing"
)

func TestServiceExecutesAIAuthoredSideAndForkThroughOneValidatedBoundary(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Executor parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, parent.Conversation.ID, "foundation"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "foundation")
	completed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})

	forked, err := service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parent.Conversation.ID,
			Source:               BranchDecisionSourceConversationRouter,
		},
		BranchDecision{
			Kind: BranchDecisionKindForkConversation,
			ForkConversation: &ForkConversationBranchDecision{
				ForkedAtTurnID: latestSnapshotTurn(completed).ID,
				ProposedTitle:  "Router-authored fork",
			},
		},
	)
	if err != nil {
		t.Fatalf("ExecuteBranchDecision fork: %v", err)
	}
	if forked.Branch == nil || forked.Branch.DecisionSource != BranchDecisionSourceConversationRouter {
		t.Fatalf("routed fork audit = %+v", forked.Branch)
	}

	sided, err := service.ExecuteBranchDecision(
		ctx,
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: parent.Conversation.ID,
			Source:               BranchDecisionSourceConversationRouter,
		},
		BranchDecision{
			Kind:                   BranchDecisionKindCreateSideConversation,
			CreateSideConversation: &CreateSideConversationBranchDecision{},
		},
	)
	if err != nil {
		t.Fatalf("ExecuteBranchDecision side: %v", err)
	}
	side := requireOnlySideConversation(t, sided)
	if side.DecisionSource != BranchDecisionSourceConversationRouter {
		t.Fatalf("local side audit = %+v", side)
	}
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		side.ID,
	); err != nil {
		t.Fatalf("DisposeSideConversation: %v", err)
	}
}

func TestServiceRejectsMalformedBranchDecisionBeforeProviderExecution(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	_, err := service.ExecuteBranchDecision(
		context.Background(),
		workspaceID,
		BranchDecisionExecutionScope{
			ParentConversationID: "conversation-missing",
			Source:               BranchDecisionSourceConversationRouter,
		},
		BranchDecision{Kind: BranchDecisionKindCreateSideConversation},
	)
	if err == nil {
		t.Fatal("ExecuteBranchDecision accepted malformed side decision")
	}
	if durable, sides := runtime.durableForkRequests(), runtime.sideForkRequests(); len(durable) != 0 || len(sides) != 0 {
		t.Fatalf("malformed decision reached provider: durable=%+v sides=%+v", durable, sides)
	}
}
