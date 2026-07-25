package conversation

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestSideConversationTurnEventsStayIsolatedWhileParentContinues(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parentID, side, parentSequence, parentArtifacts := startWorkingParentWithSide(
		t,
		ctx,
		service,
		runtime,
		workspaceID,
	)
	assertIsolatedSideAnswer(t, ctx, service, runtime, workspaceID, parentID, side, parentSequence, parentArtifacts)
	assertSideDisposalPreservesParent(t, ctx, service, workspaceID, parentID, side)
	assertParentContinuesAfterSide(t, ctx, service, runtime, workspaceID, parentID, side)
}

func TestSideConversationSnapshotRetainsOpenSideOverDisposedHistory(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Long-lived open side")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-long-lived")

	if err != nil {
		t.Fatalf("CreateSideConversation long-lived: %v", err)
	}
	longLived := requireOnlySideConversation(t, created)

	for index := 0; index < MaxSnapshotSideConversations+3; index++ {
		history, createErr := service.createRouterSideConversationForTest(
			ctx,
			workspaceID,
			parent.Conversation.ID,
			"pane-history")

		if createErr != nil {
			t.Fatalf("CreateSideConversation history %d: %v", index, createErr)
		}
		var current SideConversation
		for _, candidate := range history.SideConversations {
			if candidate.ParentPaneID == "pane-history" && candidate.DisposedAt == nil {
				current = candidate
			}
		}
		if current.ID == "" {
			t.Fatalf("history side %d is unavailable: %+v", index, history.SideConversations)
		}
		if _, disposeErr := service.DisposeSideConversation(
			ctx,
			workspaceID,
			parent.Conversation.ID,
			"pane-history",
			current.ID,
		); disposeErr != nil {
			t.Fatalf("DisposeSideConversation history %d: %v", index, disposeErr)
		}
	}

	snapshot, err := service.ReadSnapshot(ctx, workspaceID, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	if len(snapshot.SideConversations) != MaxSnapshotSideConversations ||
		!containsSideConversation(snapshot.SideConversations, longLived.ID) {
		t.Fatalf("bounded side snapshot discarded its open side: %+v", snapshot.SideConversations)
	}
	if _, err := service.SendSideConversationTurn(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		longLived.ID,
		"still addressable",
	); err != nil {
		t.Fatalf("SendSideConversationTurn long-lived: %v", err)
	}
	runtime.waitForStart(t, "still addressable")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(current ConversationSnapshot) bool {
		side, findErr := findSideConversation(current, longLived.ID)
		return findErr == nil && side.ActiveTurnID == nil &&
			containsSideEventKind(current.SideEvents.Events, longLived.ID, TrajectoryEventTurnCompleted)
	})
}

func startWorkingParentWithSide(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
) (string, SideConversation, int, int) {
	t.Helper()
	parent, err := service.CreateTopic(ctx, workspaceID, "Concurrent parent and side")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "hold"); err != nil {
		t.Fatalf("SendTurn parent hold: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-lifecycle")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if side.ParentStatus != ConversationStatusWorking || side.SourceProviderThreadID != working.ThreadBinding.ThreadID {
		t.Fatalf("side parent projection/source = %+v", side)
	}
	return parentID, side, created.Conversation.LastTrajectorySequence, len(created.Artifacts.Artifacts)
}

func assertIsolatedSideAnswer(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	parentID string,
	side SideConversation,
	parentSequence int,
	parentArtifacts int,
) {
	t.Helper()
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parentID, side.ID, "side answer"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "side answer")
	answered := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveTurnID == nil &&
			containsSideEventKind(snapshot.SideEvents.Events, side.ID, TrajectoryEventTurnCompleted)
	})
	current, err := findSideConversation(answered, side.ID)
	if err != nil {
		t.Fatalf("find side: %v", err)
	}
	if current.Status != SideConversationStatusActive || current.ParentStatus != ConversationStatusWorking {
		t.Fatalf("answered side = %+v", current)
	}
	if answered.Conversation.LastTrajectorySequence != parentSequence ||
		len(answered.Artifacts.Artifacts) != parentArtifacts {
		t.Fatalf("side output contaminated parent execution: before sequence/artifacts=%d/%d after=%d/%d",
			parentSequence,
			parentArtifacts,
			answered.Conversation.LastTrajectorySequence,
			len(answered.Artifacts.Artifacts),
		)
	}
	for _, event := range answered.SideEvents.Events {
		if event.SideConversationID == side.ID && event.Event.ConversationID != side.ID {
			t.Fatalf("side event escaped side scope: %+v", event)
		}
	}
	if !containsSideEventKind(answered.SideEvents.Events, side.ID, TrajectoryEventAgentMessageCompleted) {
		t.Fatalf("side answer event missing: %+v", answered.SideEvents.Events)
	}
}

func assertSideDisposalPreservesParent(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	parentID string,
	side SideConversation,
) {
	t.Helper()
	if _, err := service.DisposeSideConversation(ctx, workspaceID, parentID, "pane-lifecycle", side.ID); err != nil {
		t.Fatalf("DisposeSideConversation: %v", err)
	}
	disposed := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ := findSideConversation(disposed, side.ID)
	if current.Status != SideConversationStatusDisposing || current.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeCancelled {
		t.Fatalf("disposed side = %+v", current)
	}
	if disposed.Conversation.Status != ConversationStatusWorking || latestSnapshotTurn(disposed).Status != TurnStatusRunning {
		t.Fatalf("side disposal changed active parent: %+v", disposed.Conversation)
	}
}

func assertParentContinuesAfterSide(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	parentID string,
	side SideConversation,
) {
	t.Helper()
	if _, err := service.steerTestTurn(ctx, workspaceID, parentID, "finish parent"); err != nil {
		t.Fatalf("SteerTurn parent: %v", err)
	}
	finished := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	current, _ := findSideConversation(finished, side.ID)
	if current.ParentStatus != ConversationStatusIdle {
		t.Fatalf("side parent status after parent completion = %s", current.ParentStatus)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "parent after side"); err != nil {
		t.Fatalf("SendTurn parent after side: %v", err)
	}
	runtime.waitForStart(t, "parent after side")
	assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).AuthoredInput.Text == "parent after side" &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
}

func TestSideConversationDisposalFailureIsDurableAndRetryable(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Retry side cleanup")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-retry")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	runtime.mu.Lock()
	runtime.unsubscribeErr = errors.New("scripted unsubscribe failure")
	runtime.mu.Unlock()
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-retry",
		side.ID,
	); err == nil {
		t.Fatal("DisposeSideConversation succeeded despite unsubscribe failure")
	}
	failed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.Status == SideConversationStatusFailed
	})
	current, _ := findSideConversation(failed, side.ID)
	if current.Failure == nil || current.Failure.Code != "side_disposal_failed" || current.DisposedAt != nil {
		t.Fatalf("failed side cleanup = %+v", current)
	}

	runtime.mu.Lock()
	runtime.unsubscribeErr = nil
	runtime.mu.Unlock()
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-retry",
		side.ID,
	); err != nil {
		t.Fatalf("retry DisposeSideConversation: %v", err)
	}
	retried := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ = findSideConversation(retried, side.ID)
	if current.Status != SideConversationStatusFailed || current.Failure == nil {
		t.Fatalf("retry erased cleanup audit = %+v", current)
	}
}

func TestSideConversationUnexpectedRuntimeFailureRetainsProviderCleanupIdentity(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Failed side attachment")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-runtime-failure")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		side.ID,
		"mismatched provider scope",
	); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "mismatched provider scope")
	failed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.Status == SideConversationStatusFailed
	})
	current, _ := findSideConversation(failed, side.ID)
	if current.Failure == nil || current.Failure.Code != "side_turn_runtime_failed" {
		t.Fatalf("side runtime failure = %+v", current)
	}
	if current.ActiveTurnID == nil || current.ActiveProviderTurnID == nil {
		t.Fatalf("side runtime failure discarded provider cleanup identity: %+v", current)
	}
	if containsSideEventKind(failed.SideEvents.Events, side.ID, TrajectoryEventTurnFailed) {
		t.Fatalf("uncertain provider outcome was recorded as terminal: %+v", failed.SideEvents.Events)
	}
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-runtime-failure",
		side.ID,
	); err != nil {
		t.Fatalf("DisposeSideConversation failed side: %v", err)
	}
	disposed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ = findSideConversation(disposed, side.ID)
	if current.ActiveTurnID != nil || current.ActiveProviderTurnID != nil ||
		!containsSideEventKind(disposed.SideEvents.Events, side.ID, TrajectoryEventTurnInterrupted) {
		t.Fatalf("failed side cleanup did not confirm interruption: side=%+v events=%+v", current, disposed.SideEvents.Events)
	}
}

func TestSideConversationDisposalInterruptsItsActiveTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Interrupt active side")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-active")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "hold"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveProviderTurnID != nil
	})
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-active",
		side.ID,
	); err != nil {
		t.Fatalf("DisposeSideConversation: %v", err)
	}
	disposed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil &&
			containsSideEventKind(snapshot.SideEvents.Events, side.ID, TrajectoryEventTurnInterrupted)
	})
	current, _ := findSideConversation(disposed, side.ID)
	if current.ActiveTurnID != nil || current.ActiveProviderTurnID != nil {
		t.Fatalf("disposed side retained active provider state: %+v", current)
	}
}

func TestSideConversationDisposalTrustsDurableTerminalOverRacingInterruptRejection(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	service.agent = &terminalThenRejectSideInterruptRuntime{
		serviceTestAgentRuntime: runtime,
		err:                     errors.New("provider turn already terminated"),
	}
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Terminal race side")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-terminal-race")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "hold"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveProviderTurnID != nil
	})
	setProviderInterruptError(runtime, errors.New("second provider interrupt rejected"))
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-terminal-race",
		side.ID,
	); err != nil {
		t.Fatalf("DisposeSideConversation after durable terminal: %v", err)
	}
	disposed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ := findSideConversation(disposed, side.ID)
	if current.Status != SideConversationStatusDisposing || current.Failure != nil ||
		current.ActiveTurnID != nil || current.ActiveProviderTurnID != nil {
		t.Fatalf("durably completed side disposal = %+v", current)
	}
}

type terminalThenRejectSideInterruptRuntime struct {
	*serviceTestAgentRuntime
	err error
}

func (runtime *terminalThenRejectSideInterruptRuntime) InterruptTurn(
	ctx context.Context,
	request agent.TurnControlRequest,
) error {
	if err := runtime.serviceTestAgentRuntime.InterruptTurn(ctx, request); err != nil {
		return err
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		runtime.mu.Lock()
		thread := runtime.providerThreads[request.ProviderThreadID]
		status := ""
		for _, turn := range thread.Turns {
			if turn.ID == request.ProviderTurnID {
				status = turn.Status
				break
			}
		}
		runtime.mu.Unlock()
		if status == "interrupted" {
			return runtime.err
		}
		if time.Now().After(deadline) {
			return errors.New("timed out waiting for durable provider terminal state")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestSideConversationModelReroutePersistsAcrossTurnsAndDisposal(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Rerouted side model")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-reroute")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "side reroute"); err != nil {
		t.Fatalf("SendSideConversationTurn reroute: %v", err)
	}
	runtime.waitForStart(t, "side reroute")
	rerouted := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveTurnID == nil &&
			len(current.ResolvedSideAgentInvocation.ModelReroutes) == 1
	})
	current, _ := findSideConversation(rerouted, side.ID)
	if currentSideAgentModel(current) != "gpt-5.4-mini" ||
		!containsSideEventKind(rerouted.SideEvents.Events, side.ID, TrajectoryEventModelRerouted) {
		t.Fatalf("rerouted side = %+v, events = %+v", current, rerouted.SideEvents.Events)
	}
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "after side reroute"); err != nil {
		t.Fatalf("SendSideConversationTurn after reroute: %v", err)
	}
	runtime.waitForStart(t, "after side reroute")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveTurnID == nil
	})
	requests := runtime.turnRequests()
	if len(requests) < 2 || requests[len(requests)-1].Invocation.Model != "gpt-5.4-mini" {
		t.Fatalf("side turn requests after reroute = %+v", requests)
	}
	if _, err := service.DisposeSideConversation(ctx, workspaceID, parent.Conversation.ID, "pane-reroute", side.ID); err != nil {
		t.Fatalf("DisposeSideConversation after reroute: %v", err)
	}
}

func TestRecoverSideConversationsDisposesInterruptedEphemeralChildren(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	parent, err := service.CreateTopic(context.Background(), workspaceID, "Restart side cleanup")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(
		context.Background(),
		workspaceID,
		parent.Conversation.ID,
		"pane-restart")

	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}
	runtime.mu.Lock()
	delete(runtime.providerThreads, *side.ProviderThreadID)
	runtime.mu.Unlock()

	restarted, err := NewService(
		store,
		service.workspaces,
		runtime,
		WithServiceClock(func() time.Time { return time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC) }),
	)
	if err != nil {
		t.Fatalf("NewService restarted: %v", err)
	}
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if err := restarted.RecoverSideConversations(context.Background()); err != nil {
		t.Fatalf("RecoverSideConversations: %v", err)
	}
	recovered := assertServiceSnapshot(t, restarted, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ := findSideConversation(recovered, side.ID)
	if current.Status != SideConversationStatusDisposing || current.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeCancelled {
		t.Fatalf("recovered side = %+v", current)
	}
	unsubscribed := runtime.unsubscribedThreads()
	if len(unsubscribed) == 0 || unsubscribed[len(unsubscribed)-1] != *side.ProviderThreadID {
		t.Fatalf("recovery unsubscribe log = %+v", unsubscribed)
	}
}

func TestRecoverSideConversationsPersistsCleanupFailureAndRetries(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	parent, err := service.CreateTopic(context.Background(), workspaceID, "Restart side cleanup failure")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(
		context.Background(),
		workspaceID,
		parent.Conversation.ID,
		"pane-restart-failure")

	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}

	runtime.mu.Lock()
	runtime.unsubscribeErr = errors.New("scripted restart unsubscribe failure")
	runtime.mu.Unlock()
	restarted, err := NewService(store, service.workspaces, runtime)
	if err != nil {
		t.Fatalf("NewService restarted: %v", err)
	}
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if err := restarted.RecoverSideConversations(context.Background()); err != nil {
		t.Fatalf("RecoverSideConversations should persist provider failure without aborting: %v", err)
	}
	failed := assertServiceSnapshot(t, restarted, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.Status == SideConversationStatusFailed
	})
	current, _ := findSideConversation(failed, side.ID)
	if current.Failure == nil || current.Failure.Code != "side_restart_cleanup_failed" || current.DisposedAt != nil {
		t.Fatalf("restart cleanup failure = %+v", current)
	}

	runtime.mu.Lock()
	runtime.unsubscribeErr = nil
	runtime.mu.Unlock()
	if err := restarted.RecoverSideConversations(context.Background()); err != nil {
		t.Fatalf("retry RecoverSideConversations: %v", err)
	}
	retried := assertServiceSnapshot(t, restarted, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ = findSideConversation(retried, side.ID)
	if current.Status != SideConversationStatusFailed || current.Failure == nil {
		t.Fatalf("restart cleanup retry erased failure audit = %+v", current)
	}
}

func TestRecoverSideConversationsRetainsActiveProviderIdentityAcrossCleanupRetry(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx := context.Background()
	parentID, sideID, activeTurnID, providerTurnID := startActiveSideBeforeRestart(
		t, ctx, service, runtime, workspaceID,
	)
	shutdownWithProviderIdentity(t, ctx, store, service, workspaceID, parentID, sideID, activeTurnID, providerTurnID)
	setProviderInterruptError(runtime, errors.New("scripted provider interrupt failure"))
	restarted := newSideRecoveryService(t, store, service, runtime)
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if err := restarted.RecoverSideConversations(ctx); err != nil {
		t.Fatalf("RecoverSideConversations should persist cleanup failure: %v", err)
	}
	failed := waitForSideStatus(t, restarted, workspaceID, parentID, sideID, SideConversationStatusFailed)
	requireSideProviderIdentity(t, failed, sideID, activeTurnID, providerTurnID, "failed cleanup")

	setProviderInterruptError(runtime, nil)
	if err := restarted.RecoverSideConversations(ctx); err != nil {
		t.Fatalf("retry RecoverSideConversations: %v", err)
	}
	retried := assertServiceSnapshot(t, restarted, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, sideID)
		return findErr == nil && current.DisposedAt != nil
	})
	requireFinalizedProviderCleanup(t, retried, sideID)
	requireProviderInterruptControl(t, runtime, providerTurnID)
}

func startActiveSideBeforeRestart(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
) (string, string, string, string) {
	t.Helper()
	parent, err := service.CreateTopic(ctx, workspaceID, "Restart active side cleanup retry")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-active-retry")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "hold"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	active := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.ActiveTurnID != nil && current.ActiveProviderTurnID != nil
	})
	current, _ := findSideConversation(active, side.ID)
	return parent.Conversation.ID, side.ID, *current.ActiveTurnID, *current.ActiveProviderTurnID
}

func shutdownWithProviderIdentity(
	t *testing.T,
	ctx context.Context,
	store *Store,
	service *Service,
	workspaceID string,
	parentID string,
	sideID string,
	activeTurnID string,
	providerTurnID string,
) {
	t.Helper()
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}
	persisted, err := store.ReadSnapshot(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("ReadSnapshot after shutdown: %v", err)
	}
	requireSideProviderIdentity(t, persisted, sideID, activeTurnID, providerTurnID, "shutdown")
}

func requireSideProviderIdentity(
	t *testing.T,
	snapshot ConversationSnapshot,
	sideID string,
	activeTurnID string,
	providerTurnID string,
	stage string,
) {
	t.Helper()
	current, err := findSideConversation(snapshot, sideID)
	if err != nil {
		t.Fatalf("%s side: %v", stage, err)
	}
	if current.ActiveTurnID == nil || *current.ActiveTurnID != activeTurnID {
		t.Fatalf("%s discarded active turn identity: %+v", stage, current)
	}
	if current.ActiveProviderTurnID == nil || *current.ActiveProviderTurnID != providerTurnID {
		t.Fatalf("%s discarded provider turn identity: %+v", stage, current)
	}
}

func setProviderInterruptError(runtime *serviceTestAgentRuntime, err error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.interruptProviderErr = err
}

func newSideRecoveryService(
	t *testing.T,
	store *Store,
	previous *Service,
	runtime *serviceTestAgentRuntime,
) *Service {
	t.Helper()
	restarted, err := NewService(
		store,
		previous.workspaces,
		runtime,
		WithServiceClock(func() time.Time { return time.Date(2026, 7, 13, 13, 0, 0, 0, time.UTC) }),
	)
	if err != nil {
		t.Fatalf("NewService restarted: %v", err)
	}
	return restarted
}

func waitForSideStatus(
	t *testing.T,
	service *Service,
	workspaceID string,
	parentID string,
	sideID string,
	status SideConversationStatus,
) ConversationSnapshot {
	t.Helper()
	return assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, sideID)
		return findErr == nil && current.Status == status
	})
}

func requireFinalizedProviderCleanup(t *testing.T, snapshot ConversationSnapshot, sideID string) {
	t.Helper()
	current, err := findSideConversation(snapshot, sideID)
	if err != nil {
		t.Fatalf("find finalized side: %v", err)
	}
	if current.ActiveTurnID != nil || current.ActiveProviderTurnID != nil {
		t.Fatalf("retried cleanup retained provider identity: %+v", current)
	}
	if !containsSideEventKind(snapshot.SideEvents.Events, sideID, TrajectoryEventTurnInterrupted) {
		t.Fatalf("retried cleanup did not confirm interruption: %+v", snapshot.SideEvents.Events)
	}
}

func requireProviderInterruptControl(t *testing.T, runtime *serviceTestAgentRuntime, providerTurnID string) {
	t.Helper()
	controls := runtime.controlsSent()
	if len(controls) == 0 || controls[len(controls)-1] != providerTurnID+":provider-interrupt" {
		t.Fatalf("provider cleanup controls = %+v", controls)
	}
}

func containsSideEventKind(
	events []SideConversationEvent,
	sideConversationID string,
	kind TrajectoryEventKind,
) bool {
	for _, event := range events {
		if event.SideConversationID == sideConversationID && event.Event.Kind == kind {
			return true
		}
	}
	return false
}
