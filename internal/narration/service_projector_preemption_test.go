package narration

import (
	"context"
	"testing"
	"time"

	"setta/internal/conversation"
)

func TestServiceTerminalProjectionPreemptsActiveProgress(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedFailedTerminalProjectorConversation(t, store)
	progressStarted := make(chan struct{})
	releaseProgress := make(chan struct{})
	progressReturned := make(chan struct{})
	progressReleased := false
	releaseProgressOnce := func() {
		if progressReleased {
			return
		}
		progressReleased = true
		close(releaseProgress)
	}
	defer releaseProgressOnce()
	provider := &projectorTestAgentRuntime{
		blockFirstProjection:     true,
		emitProjectionMilestones: true,
		firstCallStarted:         progressStarted,
		releaseFirstCall:         releaseProgress,
		firstCallReturned:        progressReturned,
	}
	service := newProjectorTestService(t, store, provider, WithServiceProgressWait(
		func(ctx context.Context, _ time.Duration) error {
			return ctx.Err()
		},
	))

	progress := conversation.TrajectoryEvent{
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       14,
		Kind:           conversation.TrajectoryEventAgentPublicTextDelta,
	}
	service.submitProjection(
		conversationID,
		ProjectionOperation{
			WorkspaceID:     "workspace-status-service",
			TurnID:          turnID,
			ThroughSequence: progress.Sequence,
			SemanticEvents: []conversation.NarratorSemanticEvent{
				projectorProgressSemantic(conversationID, turnID, progress.Sequence),
			},
		},
		conversation.NarrationTriggerProgressWindowElapsed,
	)
	select {
	case <-progressStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for active progress projection")
	}

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, turnID, terminal))

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	if milestone := latestNarrationOfKind(snapshot, conversation.NarrationEventKindMilestone); milestone != nil {
		t.Fatalf("preempted progress milestone committed before release: %+v", milestone)
	}
	calls := provider.snapshotCalls()
	if len(calls) < 2 ||
		calls[0].requestedChannel != ProjectionChannelWorking ||
		calls[1].requestedChannel != ProjectionChannelTerminal {
		t.Fatalf("terminal did not preempt active progress call: %+v", calls)
	}
	releaseProgressOnce()
	select {
	case <-progressReturned:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for preempted progress provider to return")
	}
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot after progress release: %v", err)
	}
	if milestone := latestNarrationOfKind(snapshot, conversation.NarrationEventKindMilestone); milestone != nil {
		t.Fatalf("preempted progress milestone committed after release: %+v", milestone)
	}
}
