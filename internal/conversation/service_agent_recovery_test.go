package conversation

import (
	"context"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestRecoverAgentTurnsInterruptsActiveProviderAndPromotesQueue(t *testing.T) {
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
	if controls := restartedRuntime.controlsSent(); len(controls) != 1 || controls[0] != *first.ProviderTurnID+":provider-interrupt" {
		t.Fatalf("recovery provider controls = %v", controls)
	}
	targets, err := store.ListAgentTurnRecoveryTargets(ctx)
	if err != nil || len(targets) != 0 {
		t.Fatalf("agent recovery targets after completion = %+v, %v", targets, err)
	}
}

func TestRecoverAgentTurnsPersistsProviderLookupFailure(t *testing.T) {
	store, original, originalRuntime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := original.CreateTopic(ctx, workspaceID, "Missing provider recovery")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := original.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	originalRuntime.waitForStart(t, "hold")
	assertServiceSnapshot(t, original, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})

	restartedRuntime := newServiceTestAgentRuntime()
	restarted, err := NewService(store, original.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService after crash: %v", err)
	}
	cleanupRecoveryServices(t, store, restarted, original)

	if err := restarted.RecoverAgentTurns(ctx); err != nil {
		t.Fatalf("RecoverAgentTurns: %v", err)
	}
	failed := assertServiceSnapshot(t, restarted, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusFailed
	})
	turn := latestSnapshotTurn(failed)
	if turn.Error == nil || turn.Error.Code != "agent_runtime_failed" || !turn.Error.Retryable ||
		!strings.Contains(turn.Error.Message, "reconcile provider turn after restart") {
		t.Fatalf("durable recovery failure = %+v", turn.Error)
	}
}

func cloneServiceTestAgentRuntimeForRestart(
	original *serviceTestAgentRuntime,
) *serviceTestAgentRuntime {
	restarted := newServiceTestAgentRuntime()
	original.mu.Lock()
	defer original.mu.Unlock()
	restarted.threads = original.threads
	restarted.turns = original.turns
	for id, thread := range original.providerThreads {
		thread.Turns = append([]agent.ThreadTurn{}, thread.Turns...)
		restarted.providerThreads[id] = thread
	}
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
			if event.TurnInterrupted.Reason != TurnInterruptionReconciliation {
				t.Fatalf("recovered interruption reason = %s, want reconciliation", event.TurnInterrupted.Reason)
			}
			return
		}
	}
	t.Fatalf("reconciliation interruption was not recorded: %+v", snapshot.Trajectory.Events)
}
