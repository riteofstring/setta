package conversation

import (
	"context"
	"errors"
	"strings"
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Long-lived open side")
	for index := 0; index < MaxSnapshotSideConversations+3; index++ {
		history, createErr := service.createDirectorSideConversationForTest(
			ctx,
			workspaceID,
			parent.Conversation.ID)

		if createErr != nil {
			t.Fatalf("CreateSideConversation history %d: %v", index, createErr)
		}
		current := requireOpenSideConversation(t, history)
		if _, disposeErr := service.DisposeSideConversation(
			ctx,
			workspaceID,
			parent.Conversation.ID,
			current.ID,
		); disposeErr != nil {
			t.Fatalf("DisposeSideConversation history %d: %v", index, disposeErr)
		}
	}
	created, err := service.createDirectorSideConversationForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID)

	if err != nil {
		t.Fatalf("CreateSideConversation long-lived: %v", err)
	}
	longLived := requireOpenSideConversation(t, created)

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
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if side.ParentStatus != ConversationStatusWorking ||
		side.SourceTrajectorySequence < working.Conversation.LastTrajectorySequence {
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
	if _, err := service.DisposeSideConversation(ctx, workspaceID, parentID, side.ID); err != nil {
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Retry side cleanup")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	carrier, live := service.carriers.Lookup(side.ID)
	if !live {
		t.Fatalf("active side has no carrier: %+v", side)
	}
	runtime.mu.Lock()
	runtime.unsubscribeErr = errors.New("scripted unsubscribe failure")
	runtime.mu.Unlock()
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
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
	if current.Failure.Message != sideDisposalFailureMessage ||
		strings.Contains(current.Failure.Message, carrier.ThreadID) ||
		strings.Contains(current.Failure.Message, "scripted unsubscribe failure") {
		t.Fatalf("failed side cleanup exposed provider diagnostics: %+v", current.Failure)
	}

	runtime.mu.Lock()
	runtime.unsubscribeErr = nil
	runtime.mu.Unlock()
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Failed side attachment")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
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
	if current.Failure == nil ||
		current.Failure.Code != "side_turn_runtime_failed" ||
		current.Failure.Message != "This work stopped unexpectedly. Try again." {
		t.Fatalf("side runtime failure = %+v", current)
	}
	if current.ActiveTurnID == nil || current.DisposedAt != nil {
		t.Fatalf("side runtime failure settled a turn whose outcome is unknown: %+v", current)
	}
	if containsSideEventKind(failed.SideEvents.Events, side.ID, TrajectoryEventTurnFailed) {
		t.Fatalf("uncertain provider outcome was recorded as terminal: %+v", failed.SideEvents.Events)
	}
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		side.ID,
	); err != nil {
		t.Fatalf("DisposeSideConversation failed side: %v", err)
	}
	disposed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, _ = findSideConversation(disposed, side.ID)
	if current.ActiveTurnID != nil ||
		!containsSideEventKind(disposed.SideEvents.Events, side.ID, TrajectoryEventTurnInterrupted) {
		t.Fatalf("failed side cleanup did not confirm interruption: side=%+v events=%+v", current, disposed.SideEvents.Events)
	}
}

func TestSideConversationPersistsTypedAdmissionFailure(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent := createLinkedParentForSideTest(
		t,
		ctx,
		service,
		runtime,
		workspaceID,
		"Side admission failure",
	)
	created, err := service.createDirectorSideConversationForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID,
	)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		side.ID,
		"admission failure",
	); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "admission failure")
	failed := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, side.ID)
		return findErr == nil && current.Status == SideConversationStatusFailed
	})
	current, _ := findSideConversation(failed, side.ID)
	if current.Failure == nil ||
		current.Failure.Code != "runtime_disk_pressure" ||
		!current.Failure.Retryable {
		t.Fatalf("side admission failure = %+v", current)
	}
}

func TestSideConversationDisposalInterruptsItsActiveTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Interrupt active side")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "hold"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return containsSideEventKind(snapshot.SideEvents.Events, side.ID, TrajectoryEventTurnStarted)
	})
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
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
	if current.ActiveTurnID != nil {
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Terminal race side")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	if _, err := service.SendSideConversationTurn(ctx, workspaceID, parent.Conversation.ID, side.ID, "hold"); err != nil {
		t.Fatalf("SendSideConversationTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return containsSideEventKind(snapshot.SideEvents.Events, side.ID, TrajectoryEventTurnStarted)
	})
	setProviderInterruptError(runtime, errors.New("second provider interrupt rejected"))
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
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
		current.ActiveTurnID != nil {
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Rerouted side model")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
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
	if _, err := service.DisposeSideConversation(ctx, workspaceID, parent.Conversation.ID, side.ID); err != nil {
		t.Fatalf("DisposeSideConversation after reroute: %v", err)
	}
}

func TestRecoverSideConversationsDisposesInterruptedEphemeralChildren(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	parent := createLinkedParentForSideTest(t, context.Background(), service, runtime, workspaceID, "Restart side cleanup")
	created, err := service.createDirectorSideConversationForTest(
		context.Background(),
		workspaceID,
		parent.Conversation.ID)

	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}
	unsubscribedBeforeRecovery := len(runtime.unsubscribedThreads())

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
	// The side's carrier was ephemeral and died with the previous process, so
	// recovery closes the Setta record and talks to no provider at all.
	if unsubscribed := runtime.unsubscribedThreads(); len(unsubscribed) != unsubscribedBeforeRecovery {
		t.Fatalf("recovery reached the provider for a dead side carrier: %+v", unsubscribed[unsubscribedBeforeRecovery:])
	}
}

func TestRecoverSideConversationsDisposesPreparationInterruptedByRestart(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx := context.Background()
	parent := createLinkedParentForSideTest(
		t,
		ctx,
		service,
		runtime,
		workspaceID,
		"Restart preparing side cleanup",
	)
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		t.Fatalf("ResolveActiveWorkspace: %v", err)
	}
	profile, resolved, invocation, err := service.resolveSideAgentInvocation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
	)
	if err != nil {
		t.Fatalf("resolveSideAgentInvocation: %v", err)
	}
	prepared, err := service.persistPreparingSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		workspaceSummary.RootPath,
		profile,
		resolved,
		invocation,
		nil,
		BranchDecisionSourceDirector,
	)
	if err != nil {
		t.Fatalf("persistPreparingSideConversation: %v", err)
	}
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}
	providerCallsBeforeRecovery := len(runtime.unsubscribedThreads())

	restarted := newSideRecoveryService(t, store, service, runtime)
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if err := restarted.RecoverSideConversations(ctx); err != nil {
		t.Fatalf("RecoverSideConversations: %v", err)
	}
	recovered := assertServiceSnapshot(t, restarted, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, prepared.side.ID)
		return findErr == nil && current.DisposedAt != nil
	})
	current, err := findSideConversation(recovered, prepared.side.ID)
	if err != nil {
		t.Fatalf("find recovered side: %v", err)
	}
	if current.Status != SideConversationStatusFailed ||
		current.Failure == nil ||
		current.Failure.Code != "side_restart_interrupted" ||
		current.Failure.Message != sideRestartInterruptionFailureMessage ||
		current.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeFailed {
		t.Fatalf("recovered preparing side = %+v", current)
	}
	open, err := store.hasOpenSideConversationForParent(ctx, parent.Conversation.ID)
	if err != nil {
		t.Fatalf("hasOpenSideConversationForParent: %v", err)
	}
	if open {
		t.Fatal("one restart left the interrupted side preparation open")
	}
	if providerCalls := runtime.unsubscribedThreads(); len(providerCalls) != providerCallsBeforeRecovery {
		t.Fatalf("preparing-side recovery reached a provider carrier: %+v", providerCalls[providerCallsBeforeRecovery:])
	}
}

// A side turn that was still running when the process died has no provider left
// to answer it. Recovery ends it as a Setta interruption instead of leaving an
// active turn nobody can reach.
func TestRecoverSideConversationsInterruptsRunningSideTurnAfterRestart(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx := context.Background()
	parentID, sideID, activeTurnID := startActiveSideBeforeRestart(
		t, ctx, service, runtime, workspaceID,
	)
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown first service: %v", err)
	}
	controlsBeforeRecovery := len(runtime.controlsSent())
	restarted := newSideRecoveryService(t, store, service, runtime)
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if err := restarted.RecoverSideConversations(ctx); err != nil {
		t.Fatalf("RecoverSideConversations: %v", err)
	}
	recovered := assertServiceSnapshot(t, restarted, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		current, findErr := findSideConversation(snapshot, sideID)
		return findErr == nil && current.DisposedAt != nil
	})
	requireFinalizedSideRecovery(t, recovered, sideID)
	if controls := runtime.controlsSent(); len(controls) != controlsBeforeRecovery {
		t.Fatalf("recovery interrupted side turn %s on a dead carrier: %+v", activeTurnID, controls[controlsBeforeRecovery:])
	}
}

func startActiveSideBeforeRestart(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
) (string, string, string) {
	t.Helper()
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Restart active side cleanup retry")
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
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
		return findErr == nil && current.ActiveTurnID != nil &&
			containsSideEventKind(snapshot.SideEvents.Events, side.ID, TrajectoryEventTurnStarted)
	})
	current, _ := findSideConversation(active, side.ID)
	return parent.Conversation.ID, side.ID, *current.ActiveTurnID
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

func requireFinalizedSideRecovery(t *testing.T, snapshot ConversationSnapshot, sideID string) {
	t.Helper()
	current, err := findSideConversation(snapshot, sideID)
	if err != nil {
		t.Fatalf("find finalized side: %v", err)
	}
	if current.ActiveTurnID != nil {
		t.Fatalf("recovered side retained an active turn: %+v", current)
	}
	if !containsSideEventKind(snapshot.SideEvents.Events, sideID, TrajectoryEventTurnInterrupted) {
		t.Fatalf("recovered side did not record the interruption: %+v", snapshot.SideEvents.Events)
	}
}

func setProviderInterruptError(runtime *serviceTestAgentRuntime, err error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.interruptProviderErr = err
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
