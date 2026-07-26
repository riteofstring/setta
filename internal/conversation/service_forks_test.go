package conversation

import (
	"context"
	"strings"
	"testing"
)

func TestServiceCreatesIndependentBranchFromCompletedTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Parent topic")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "parent foundation"); err != nil {
		t.Fatalf("SendTurn parent foundation: %v", err)
	}
	runtime.waitForStart(t, "parent foundation")
	completed := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	sourceTurn := latestSnapshotTurn(completed)
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "hold"); err != nil {
		t.Fatalf("SendTurn active parent: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})

	startsBeforeBranch := len(runtime.startThreadRequests())
	child, err := service.forkRouterTopicForTest(
		ctx,
		workspaceID,
		parentID,
		sourceTurn.ID,
		"Durable child")

	if err != nil {
		t.Fatalf("ForkTopic: %v", err)
	}
	assertBranchSnapshot(t, child, working, sourceTurn)
	if starts := runtime.startThreadRequests(); len(starts) != startsBeforeBranch {
		t.Fatalf("creating a branch reached the provider: %+v", starts[startsBeforeBranch:])
	}

	if _, err := service.sendTestTurn(ctx, workspaceID, child.Conversation.ID, "child work"); err != nil {
		t.Fatalf("SendTurn child: %v", err)
	}
	runtime.waitForStart(t, "child work")
	assertServiceSnapshot(t, service, workspaceID, child.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Turns.Turns) == 1 && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	parentStillWorking := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	if len(parentStillWorking.Turns.Turns) != 2 {
		t.Fatalf("parent turns changed after child work: %+v", parentStillWorking.Turns)
	}
	requests := runtime.turnRequests()
	childRequest := requests[len(requests)-1]
	parentRequest := requests[len(requests)-2]
	if childRequest.ConversationID != child.Conversation.ID ||
		childRequest.ProviderThreadID == parentRequest.ProviderThreadID {
		t.Fatalf("child turn request = %+v, want its own carrier", childRequest)
	}
	assertBranchCarrierReplay(t, runtime, childRequest.ProviderThreadID, sourceTurn, "hold")

	if _, err := service.steerTestTurn(ctx, workspaceID, parentID, "finish parent"); err != nil {
		t.Fatalf("SteerTurn parent: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})

	page, err := service.ListNavigatorPage(ctx, workspaceID, "", nil, 10)
	if err != nil {
		t.Fatalf("ListNavigatorPage: %v", err)
	}
	foundChild := false
	for _, item := range page.Items {
		if item.Conversation.ID == child.Conversation.ID {
			foundChild = item.Branch != nil && item.Branch.ParentConversationID == parentID
		}
	}
	if !foundChild {
		t.Fatalf("branch child missing lineage in navigator: %+v", page.Items)
	}
}

func TestServiceRejectsIncompleteBranchWithoutTouchingTheProvider(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Incomplete parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, parent.Conversation.ID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	working := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	startsBeforeBranch := len(runtime.startThreadRequests())
	_, err = service.forkRouterTopicForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		latestSnapshotTurn(working).ID,
		"Rejected child")

	if !IsCommandConflict(err) {
		t.Fatalf("ForkTopic running turn error = %T %v, want conflict", err, err)
	}
	if starts := runtime.startThreadRequests(); len(starts) != startsBeforeBranch {
		t.Fatalf("invalid branch reached provider: %+v", starts[startsBeforeBranch:])
	}
	if _, err := service.StopTurn(ctx, workspaceID, parent.Conversation.ID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func assertBranchSnapshot(
	t *testing.T,
	child ConversationSnapshot,
	parent ConversationSnapshot,
	sourceTurn ConversationTurn,
) {
	t.Helper()
	if child.Conversation.Status != ConversationStatusIdle || len(child.Turns.Turns) != 0 {
		t.Fatalf("branch execution state = %+v", child)
	}
	branch := child.Branch
	if branch == nil ||
		branch.ChildConversationID != child.Conversation.ID ||
		branch.ParentConversationID != parent.Conversation.ID ||
		branch.ForkedAtTurnID != sourceTurn.ID ||
		branch.SourceTrajectorySequence != turnTrajectoryBoundary(parent, sourceTurn.ID) ||
		branch.DecisionSource != BranchDecisionSourceConversationRouter {
		t.Fatalf("branch lineage = %+v", branch)
	}
	if child.NarratorState.ConversationID != child.Conversation.ID ||
		child.PresentationProfile.ConversationID != child.Conversation.ID {
		t.Fatalf("branch child-owned state drifted: %+v", child)
	}
}

// assertBranchCarrierReplay proves the child inherits the parent through Setta's
// own record rather than provider history: the replay carries the parent turn
// the branch was cut at, and stops there.
func assertBranchCarrierReplay(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	childThreadID string,
	sourceTurn ConversationTurn,
	afterBoundary string,
) {
	t.Helper()
	replayed := ""
	for _, injection := range runtime.injectedThreadItems() {
		if injection.threadID != childThreadID {
			continue
		}
		for _, item := range injection.items {
			replayed += item.Text + "\n"
		}
	}
	if !strings.Contains(replayed, sourceTurn.AuthoredInput.Text) {
		t.Fatalf("branch carrier replay omitted the source turn: %q", replayed)
	}
	if strings.Contains(replayed, afterBoundary) {
		t.Fatalf("branch carrier replay crossed the boundary into %q: %q", afterBoundary, replayed)
	}
}

func turnTrajectoryBoundary(snapshot ConversationSnapshot, turnID string) int {
	sequence := 0
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID != nil && *event.TurnID == turnID && event.Sequence > sequence {
			sequence = event.Sequence
		}
	}
	return sequence
}
