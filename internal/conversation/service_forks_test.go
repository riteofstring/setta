package conversation

import (
	"context"
	"fmt"
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
	child, err := service.forkDirectorTopicForTest(
		ctx,
		&workspaceID,
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

func TestServiceNestedBranchCarrierReplaysFullSettaAncestry(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	ancestor, err := service.CreateTopic(ctx, workspaceID, "Ancestor")
	if err != nil {
		t.Fatalf("CreateTopic ancestor: %v", err)
	}
	if _, err := service.sendTestTurn(
		ctx,
		workspaceID,
		ancestor.Conversation.ID,
		"ancestor foundation",
	); err != nil {
		t.Fatalf("SendTurn ancestor: %v", err)
	}
	runtime.waitForStart(t, "ancestor foundation")
	ancestor = assertServiceSnapshot(t, service, workspaceID, ancestor.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	child, err := service.forkDirectorTopicForTest(
		ctx,
		&workspaceID,
		ancestor.Conversation.ID,
		latestSnapshotTurn(ancestor).ID,
		"Child",
	)
	if err != nil {
		t.Fatalf("ForkTopic child: %v", err)
	}
	if _, err := service.sendTestTurn(
		ctx,
		workspaceID,
		child.Conversation.ID,
		"child foundation",
	); err != nil {
		t.Fatalf("SendTurn child: %v", err)
	}
	runtime.waitForStart(t, "child foundation")
	child = assertServiceSnapshot(t, service, workspaceID, child.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	grandchild, err := service.forkDirectorTopicForTest(
		ctx,
		&workspaceID,
		child.Conversation.ID,
		latestSnapshotTurn(child).ID,
		"Grandchild",
	)
	if err != nil {
		t.Fatalf("ForkTopic grandchild: %v", err)
	}
	if _, err := service.sendTestTurn(
		ctx,
		workspaceID,
		grandchild.Conversation.ID,
		"grandchild work",
	); err != nil {
		t.Fatalf("SendTurn grandchild: %v", err)
	}
	runtime.waitForStart(t, "grandchild work")
	assertServiceSnapshot(t, service, workspaceID, grandchild.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})

	requests := runtime.turnRequests()
	replayed := carrierReplayText(runtime, requests[len(requests)-1].ProviderThreadID)
	for _, inherited := range []string{"ancestor foundation", "child foundation"} {
		if !strings.Contains(replayed, inherited) {
			t.Fatalf("nested branch replay omitted %q: %q", inherited, replayed)
		}
	}
}

func TestServiceBranchReplaysSourceOutsideParentSnapshotWindow(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Long parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"aged branch source",
	); err != nil {
		t.Fatalf("SendTurn source: %v", err)
	}
	runtime.waitForStart(t, "aged branch source")
	parent = assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	sourceTurn := latestSnapshotTurn(parent)

	for index := 0; index < MaxSnapshotTurns; index++ {
		text := fmt.Sprintf("newer parent turn %d", index+1)
		if _, err := service.sendTestTurn(ctx, workspaceID, parent.Conversation.ID, text); err != nil {
			t.Fatalf("SendTurn newer %d: %v", index+1, err)
		}
		runtime.waitForStart(t, text)
		assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
			return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
		})
	}
	parent = assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Turns.HasEarlier
	})
	for _, turn := range parent.Turns.Turns {
		if turn.ID == sourceTurn.ID {
			t.Fatalf("source turn %s did not age out of the parent snapshot", sourceTurn.ID)
		}
	}

	child, err := service.forkDirectorTopicForTest(
		ctx,
		&workspaceID,
		parent.Conversation.ID,
		sourceTurn.ID,
		"Old-boundary child",
	)
	if err != nil {
		t.Fatalf("ForkTopic aged source: %v", err)
	}
	if _, err := service.sendTestTurn(
		ctx,
		workspaceID,
		child.Conversation.ID,
		"aged-source child work",
	); err != nil {
		t.Fatalf("SendTurn child: %v", err)
	}
	runtime.waitForStart(t, "aged-source child work")
	assertServiceSnapshot(t, service, workspaceID, child.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	requests := runtime.turnRequests()
	replayed := carrierReplayText(runtime, requests[len(requests)-1].ProviderThreadID)
	if !strings.Contains(replayed, sourceTurn.AuthoredInput.Text) {
		t.Fatalf("aged branch replay omitted source turn: %q", replayed)
	}
	if strings.Contains(replayed, "newer parent turn 1") {
		t.Fatalf("aged branch replay crossed its source boundary: %q", replayed)
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
	_, err = service.forkDirectorTopicForTest(
		ctx,
		&workspaceID,
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
		branch.DecisionSource != BranchDecisionSourceDirector {
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
	replayed := carrierReplayText(runtime, childThreadID)
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

// TestServiceBranchesAFolderlessConversation proves a fork inherits the
// parent's scope rather than requiring one. A folderless conversation is a
// first-class conversation everywhere else, so a branch of one is too: it stays
// folderless, keeps the parent's history, and is readable without a workspace.
func TestServiceBranchesAFolderlessConversation(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopicWithOptionalWorkspace(ctx, nil, "Folderless parent")
	if err != nil {
		t.Fatalf("CreateTopicWithOptionalWorkspace: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.sendTurn(ctx, nil, parentID, "folderless foundation", ""); err != nil {
		t.Fatalf("send folderless turn: %v", err)
	}
	runtime.waitForStart(t, "folderless foundation")
	completed := assertServiceSnapshotByID(t, ctx, service, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	sourceTurn := latestSnapshotTurn(completed)

	child, err := service.forkDirectorTopicForTest(ctx, nil, parentID, sourceTurn.ID, "Folderless child")
	if err != nil {
		t.Fatalf("fork a folderless conversation: %v", err)
	}
	assertBranchSnapshot(t, child, completed, sourceTurn)
	if child.Conversation.WorkspaceID != nil {
		t.Fatalf("folderless fork bound a folder: %v", *child.Conversation.WorkspaceID)
	}
	// The child is scoped the way the parent was, so a workspace-scoped read
	// must not find it.
	if _, err := service.ReadSnapshot(ctx, workspaceID, child.Conversation.ID); !IsConversationNotFound(err) {
		t.Fatalf("workspace-scoped read of a folderless fork = %T %v, want conversation not found", err, err)
	}
}
