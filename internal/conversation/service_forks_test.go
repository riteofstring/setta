package conversation

import (
	"context"
	"errors"
	"testing"

	"setta/internal/agent"
)

func TestServiceCreatesIndependentDurableForkFromCompletedTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Parent topic")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.SendTurn(ctx, workspaceID, parentID, "parent foundation"); err != nil {
		t.Fatalf("SendTurn parent foundation: %v", err)
	}
	runtime.waitForStart(t, "parent foundation")
	completed := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	sourceTurn := latestSnapshotTurn(completed)
	if _, err := service.SendTurn(ctx, workspaceID, parentID, "hold"); err != nil {
		t.Fatalf("SendTurn active parent: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})

	child, err := service.ForkTopic(
		ctx,
		workspaceID,
		parentID,
		sourceTurn.ID,
		"Durable child",
	)
	if err != nil {
		t.Fatalf("ForkTopic: %v", err)
	}
	assertDurableForkSnapshot(t, child, working, sourceTurn)
	assertDurableForkProviderRequest(t, runtime, completed, sourceTurn)

	if _, err := service.SendTurn(ctx, workspaceID, child.Conversation.ID, "child work"); err != nil {
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
	if childRequest.ConversationID != child.Conversation.ID ||
		childRequest.ProviderThreadID != child.ThreadBinding.ThreadID {
		t.Fatalf("child turn request = %+v, want child conversation and forked thread", childRequest)
	}
	if _, err := service.SteerTurn(ctx, workspaceID, parentID, "finish parent"); err != nil {
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
		t.Fatalf("durable child missing lineage in navigator: %+v", page.Items)
	}
}

func TestServiceRejectsIncompleteDurableForkBeforeProviderCall(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Incomplete parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.SendTurn(ctx, workspaceID, parent.Conversation.ID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	working := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	_, err = service.ForkTopic(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		latestSnapshotTurn(working).ID,
		"Rejected child",
	)
	if !IsCommandConflict(err) {
		t.Fatalf("ForkTopic running turn error = %T %v, want conflict", err, err)
	}
	if requests := runtime.durableForkRequests(); len(requests) != 0 {
		t.Fatalf("invalid fork reached provider: %+v", requests)
	}
	if _, err := service.StopTurn(ctx, workspaceID, parent.Conversation.ID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func TestServiceRejectsMismatchedProviderForkLineageWithoutPersistingChild(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Provider lineage")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.SendTurn(ctx, workspaceID, parent.Conversation.ID, "foundation"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "foundation")
	completed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	wrongParent := "provider-thread-other"
	providerFork := agentThreadForForkTest("provider-thread-invalid", wrongParent)
	runtime.forkResponse = &providerFork
	_, err = service.ForkTopic(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		latestSnapshotTurn(completed).ID,
		"Invalid child",
	)
	if err == nil {
		t.Fatalf("ForkTopic mismatched provider lineage error = %v", err)
	}
	page, listErr := service.ListNavigatorPage(ctx, workspaceID, "", nil, 10)
	if listErr != nil {
		t.Fatalf("ListNavigatorPage: %v", listErr)
	}
	if len(page.Items) != 1 || page.Items[0].Conversation.ID != parent.Conversation.ID {
		t.Fatalf("mismatched provider fork persisted a child: %+v", page.Items)
	}
	if unsubscribed := runtime.unsubscribedThreads(); len(unsubscribed) != 1 || unsubscribed[0] != providerFork.ID {
		t.Fatalf("mismatched provider fork cleanup = %v", unsubscribed)
	}
}

func TestServiceDoesNotPersistChildWhenProviderForkFails(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Provider failure")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.SendTurn(ctx, workspaceID, parent.Conversation.ID, "foundation"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "foundation")
	completed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	runtime.forkErr = errors.New("scripted provider fork failure")
	_, err = service.ForkTopic(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		latestSnapshotTurn(completed).ID,
		"Missing child",
	)
	if err == nil || err.Error() != "scripted provider fork failure" {
		t.Fatalf("ForkTopic provider failure = %v", err)
	}
	page, listErr := service.ListNavigatorPage(ctx, workspaceID, "", nil, 10)
	if listErr != nil {
		t.Fatalf("ListNavigatorPage: %v", listErr)
	}
	if len(page.Items) != 1 || page.Items[0].Conversation.ID != parent.Conversation.ID {
		t.Fatalf("failed provider fork persisted a child: %+v", page.Items)
	}
}

func assertDurableForkSnapshot(
	t *testing.T,
	child ConversationSnapshot,
	parent ConversationSnapshot,
	sourceTurn ConversationTurn,
) {
	t.Helper()
	if child.Conversation.Status != ConversationStatusIdle || len(child.Turns.Turns) != 0 {
		t.Fatalf("durable fork execution state = %+v", child)
	}
	if child.ThreadBinding == nil || child.ThreadBinding.ThreadID == parent.ThreadBinding.ThreadID {
		t.Fatalf("durable fork binding = %+v, parent = %+v", child.ThreadBinding, parent.ThreadBinding)
	}
	branch := child.Branch
	if branch == nil ||
		branch.ChildConversationID != child.Conversation.ID ||
		branch.ParentConversationID != parent.Conversation.ID ||
		branch.ForkedAtTurnID != sourceTurn.ID ||
		branch.SourceTrajectorySequence != turnTrajectoryBoundary(parent, sourceTurn.ID) ||
		branch.ProviderMetadata[branchMetadataDecisionSource] != branchDecisionSourceExplicit ||
		branch.ProviderMetadata[branchMetadataProviderForkThreadID] != child.ThreadBinding.ThreadID {
		t.Fatalf("durable fork lineage = %+v", branch)
	}
	if child.NarratorState.ConversationID != child.Conversation.ID ||
		child.PresentationProfile.ConversationID != child.Conversation.ID {
		t.Fatalf("durable fork child-owned state drifted: %+v", child)
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

func assertDurableForkProviderRequest(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	parent ConversationSnapshot,
	sourceTurn ConversationTurn,
) {
	t.Helper()
	requests := runtime.durableForkRequests()
	if len(requests) != 1 {
		t.Fatalf("durable fork requests = %+v, want one", requests)
	}
	request := requests[0]
	if request.ParentThreadID != parent.ThreadBinding.ThreadID ||
		request.LastTurnID == nil ||
		sourceTurn.ProviderTurnID == nil ||
		*request.LastTurnID != *sourceTurn.ProviderTurnID ||
		request.Ephemeral {
		t.Fatalf("durable fork provider request = %+v", request)
	}
}

func agentThreadForForkTest(id string, parentID string) agent.Thread {
	return agent.Thread{
		ID:           id,
		SessionID:    "session-" + id,
		Model:        "gpt-5.6-sol",
		ForkedFromID: &parentID,
	}
}
