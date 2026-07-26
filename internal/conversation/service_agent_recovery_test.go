package conversation

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestUnexpectedTurnEndPersistsTypedAdmissionFailure(t *testing.T) {
	turn := ConversationTurn{Status: TurnStatusRunning}
	trajectory := TrajectoryEvent{}

	status := applyUnexpectedTurnOutcome(
		&turn,
		&trajectory,
		"",
		testConversationTurnAdmissionFailure{},
		"2026-07-25T12:00:00Z",
	)

	if status != ConversationStatusFailed || turn.Error == nil ||
		turn.Error.Code != "runtime_disk_pressure" || !turn.Error.Retryable ||
		trajectory.TurnFailed == nil ||
		trajectory.TurnFailed.Failure.Code != "runtime_disk_pressure" {
		t.Fatalf(
			"typed admission failure = status %s, turn %+v, trajectory %+v",
			status,
			turn,
			trajectory,
		)
	}
}

type testConversationTurnAdmissionFailure struct{}

func (testConversationTurnAdmissionFailure) Error() string {
	return "runtime storage is full"
}

func (testConversationTurnAdmissionFailure) TurnAdmissionFailure() (string, bool) {
	return "runtime_disk_pressure", true
}

func TestRecoverAgentTurnsInterruptsRestartedUnboundRunAndPromotesQueue(t *testing.T) {
	appDataDir := t.TempDir()
	store, original, originalRuntime, _ := newConversationServiceTestHarness(t, appDataDir)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := original.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-unbound-crash-recovery",
		Title:          "Unbound crash recovery",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := original.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"hold",
		"turn-unbound-before-restart",
	); err != nil {
		t.Fatalf("SendDirectorTurn: %v", err)
	}
	originalRuntime.waitForStart(t, "hold")
	if _, err := original.QueueDirectorTurn(
		ctx,
		nil,
		conversationID,
		"after unbound crash",
		"turn-unbound-after-restart",
	); err != nil {
		t.Fatalf("QueueDirectorTurn: %v", err)
	}
	running := assertServiceSnapshotByID(t, ctx, original, conversationID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Queue) == 1
	})
	first, err := findConversationTurn(running, "turn-unbound-before-restart")
	if err != nil || first.Status != TurnStatusRunning || first.ProviderTurnID == nil {
		t.Fatalf("pre-crash unbound turn = %+v, %v", first, err)
	}

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)
	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	restartedRuntime.waitForStart(t, "after unbound crash")
	recovered := assertServiceSnapshotByID(t, ctx, restarted, conversationID, func(snapshot ConversationSnapshot) bool {
		if len(snapshot.Queue) != 0 || snapshot.Conversation.Status != ConversationStatusIdle {
			return false
		}
		firstTurn, firstErr := findConversationTurn(snapshot, "turn-unbound-before-restart")
		nextTurn, nextErr := findConversationTurn(snapshot, "turn-unbound-after-restart")
		return firstErr == nil && nextErr == nil &&
			firstTurn.Status == TurnStatusCancelled &&
			nextTurn.Status == TurnStatusCompleted
	})
	assertRecoveredTurnInterruption(t, recovered, first.ID)
	if len(recovered.Artifacts.Artifacts) != 0 {
		t.Fatalf("unbound restart published private files: %+v", recovered.Artifacts.Artifacts)
	}
	requests := restartedRuntime.turnRequests()
	privateRoot := filepath.Join(appDataDir, unboundWorkingDirectoryName)
	if len(requests) != 1 || !strings.HasPrefix(requests[0].WorkspaceRoot, privateRoot) {
		t.Fatalf("restarted unbound provider requests = %+v, want root under %q", requests, privateRoot)
	}
	if controls := restartedRuntime.controlsSent(); len(controls) != 0 {
		t.Fatalf("unbound recovery reached the provider for a dead carrier: %v", controls)
	}
}

func TestRecoverAgentTurnsInterruptsRestartedRunAndPromotesQueue(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := original.CreateTopic(ctx, workspaceID, "Crash recovery")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := original.sendTestTurn(ctx, workspaceID, conversationID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	originalRuntime.waitForStart(t, "hold")
	if _, err := original.queueTestTurn(ctx, workspaceID, conversationID, "after crash"); err != nil {
		t.Fatalf("QueueTurn: %v", err)
	}
	running := assertServiceSnapshot(t, original, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusQueued && len(snapshot.Queue) == 1
	})
	first := running.Turns.Turns[0]
	if first.Status != TurnStatusRunning || first.ProviderTurnID == nil {
		t.Fatalf("pre-crash running turn = %+v", first)
	}

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)

	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	restartedRuntime.waitForStart(t, "after crash")
	recovered := assertServiceSnapshot(t, restarted, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Turns.Turns) == 2 &&
			snapshot.Turns.Turns[0].Status == TurnStatusCancelled &&
			snapshot.Turns.Turns[1].Status == TurnStatusCompleted &&
			len(snapshot.Queue) == 0
	})
	if recovered.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("recovered conversation status = %s, want idle", recovered.Conversation.Status)
	}
	assertRecoveredTurnInterruption(t, recovered, first.ID)
	// The carrier died with the previous process, so recovery has nothing to
	// interrupt at the provider and must not pretend otherwise.
	if controls := restartedRuntime.controlsSent(); len(controls) != 0 {
		t.Fatalf("recovery reached the provider for a dead carrier: %v", controls)
	}
	targets, err := store.listRestartedAgentTurns(ctx)
	if err != nil || len(targets) != 0 {
		t.Fatalf("restarted agent turns after completion = %+v, %v", targets, err)
	}
}

func TestRecoverAgentTurnsCancelsApprovalsOwnedByDeadRun(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := original.CreateTopic(ctx, workspaceID, "Restart approval recovery")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := original.sendTestTurn(ctx, workspaceID, conversationID, "approval"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	originalRuntime.waitForStart(t, "approval")
	waiting := assertServiceSnapshot(t, original, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	turn := latestSnapshotTurn(waiting)
	approvalID := latestPendingApprovalID(waiting)
	if approvalID == "" {
		t.Fatal("running turn published no pending approval")
	}

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)
	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}

	recovered := assertServiceSnapshot(t, restarted, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
	if pending := pendingApprovalsForTurn(recovered, turn.ID); len(pending) != 0 {
		t.Fatalf("restart left dead-run approvals pending: %+v", pending)
	}
	resolutionSequence := 0
	terminalSequence := 0
	for _, event := range recovered.Trajectory.Events {
		if event.TurnID == nil || *event.TurnID != turn.ID {
			continue
		}
		if event.ApprovalResolved != nil &&
			event.ApprovalResolved.Resolution.ApprovalID == approvalID {
			if event.Actor != TrajectoryActorSystem ||
				event.ApprovalResolved.Resolution.Decision != TrajectoryApprovalDecisionCancelled {
				t.Fatalf("restart approval resolution = %+v", event)
			}
			resolutionSequence = event.Sequence
		}
		if event.TurnInterrupted != nil &&
			event.TurnInterrupted.Reason == TurnInterruptionRuntimeRestarted {
			terminalSequence = event.Sequence
		}
	}
	if resolutionSequence == 0 || terminalSequence <= resolutionSequence {
		t.Fatalf(
			"restart approval/terminal sequences = %d/%d, want cancellation before terminal",
			resolutionSequence,
			terminalSequence,
		)
	}
	if controls := restartedRuntime.controlsSent(); len(controls) != 0 {
		t.Fatalf("approval recovery reached the provider for a dead carrier: %v", controls)
	}
}

func TestRecoverAgentTurnsInterruptsAcceptedTurnThatNeverStarted(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := original.CreateTopic(ctx, workspaceID, "Unlinked provider recovery")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	scope, err := original.resolveExecutionScope(created.Conversation.ID, &workspaceID)
	if err != nil {
		t.Fatalf("resolveExecutionScope: %v", err)
	}
	accepted, err := original.acceptTurn(
		ctx,
		created,
		scope,
		"provider acceptance is ambiguous",
		TurnDeliveryNormal,
		0,
		"turn_unlinked_recovery",
	)
	if err != nil {
		t.Fatalf("acceptTurn: %v", err)
	}
	if accepted.Status != TurnStatusQueued || accepted.ProviderTurnID != nil {
		t.Fatalf("accepted unlinked turn = %+v", accepted)
	}

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)

	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	recovered := assertServiceSnapshot(t, restarted, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
	turn := latestSnapshotTurn(recovered)
	if recovered.Conversation.Status != ConversationStatusIdle || turn.ID != accepted.ID ||
		turn.ProviderTurnID != nil || turn.StartedAt != nil || turn.Error != nil {
		t.Fatalf("recovered unstarted turn = %+v, conversation = %+v", turn, recovered.Conversation)
	}
	assertRecoveredTurnInterruption(t, recovered, accepted.ID)
	if requests := restartedRuntime.turnRequests(); len(requests) != 0 {
		t.Fatalf("input accepted before the restart was replayed: %+v", requests)
	}
}

func TestRecoverAgentTurnsPromotesQueueWithoutRunningTurn(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := original.CreateTopic(ctx, workspaceID, "Stranded queue recovery")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	scope, err := original.resolveExecutionScope(created.Conversation.ID, &workspaceID)
	if err != nil {
		t.Fatalf("resolveExecutionScope: %v", err)
	}
	accepted, err := original.acceptTurn(
		ctx,
		created,
		scope,
		"promote after terminal crash",
		TurnDeliveryQueued,
		1,
		"turn_stranded_queue_recovery",
	)
	if err != nil {
		t.Fatalf("acceptTurn: %v", err)
	}
	if accepted.Status != TurnStatusQueued {
		t.Fatalf("accepted queued turn = %+v", accepted)
	}

	restartedRuntime := cloneServiceTestAgentRuntimeForRestart(originalRuntime)
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)

	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	restartedRuntime.waitForStart(t, "promote after terminal crash")
	recovered := assertServiceSnapshot(t, restarted, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted && len(snapshot.Queue) == 0
	})
	turn := latestSnapshotTurn(recovered)
	if recovered.Conversation.Status != ConversationStatusIdle || turn.ID != accepted.ID ||
		turn.Delivery != TurnDeliveryQueued {
		t.Fatalf("recovered queued turn = %+v, conversation = %+v", turn, recovered.Conversation)
	}
}

// cloneServiceTestAgentRuntimeForRestart is the provider as the next process
// finds it. The id counters continue so a fresh carrier is never mistaken for an
// old one, and the threads the dead process opened are gone: an ephemeral
// carrier does not outlive the process that started it, so any attempt to run on
// one fails the way the real provider would.
func cloneServiceTestAgentRuntimeForRestart(
	original *serviceTestAgentRuntime,
) *serviceTestAgentRuntime {
	restarted := newServiceTestAgentRuntime()
	original.mu.Lock()
	defer original.mu.Unlock()
	restarted.threads = original.threads
	restarted.turns = original.turns
	return restarted
}

func cleanupRecoveryServices(t *testing.T, store *Store, services ...*Service) {
	t.Helper()
	t.Cleanup(func() {
		for _, service := range services {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := service.Shutdown(shutdownCtx); err != nil {
				t.Errorf("Shutdown: %v", err)
			}
			shutdownCancel()
		}
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
}

func assertRecoveredTurnInterruption(
	t *testing.T,
	snapshot ConversationSnapshot,
	turnID string,
) {
	t.Helper()
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID != nil && *event.TurnID == turnID && event.TurnInterrupted != nil {
			if event.TurnInterrupted.Reason != TurnInterruptionRuntimeRestarted {
				t.Fatalf("recovered interruption reason = %s, want runtime_restarted", event.TurnInterrupted.Reason)
			}
			return
		}
	}
	t.Fatalf("restart interruption was not recorded: %+v", snapshot.Trajectory.Events)
}
