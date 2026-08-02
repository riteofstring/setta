package narration

import (
	"context"
	"testing"

	"setta/internal/conversation"
)

func TestServiceRecoversInterruptedObservedTerminalProjection(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedFailedTerminalProjectorConversation(t, store)
	markNarratorCaughtUpAtTerminal(t, store, conversationID, terminal.Sequence)
	state, err := store.ReadNarratorState(context.Background(), conversationID)
	if err != nil {
		t.Fatalf("ReadNarratorState: %v", err)
	}
	if _, err := store.CommitNarratorInvocationStarted(context.Background(), conversation.NarratorInvocationStartedCommit{
		ConversationID:   conversationID,
		Expected:         projectorNarratorExpectation(state),
		CommittedEventID: "recovered-observed-terminal-start-marker",
		StartedAt:        "2026-07-12T12:01:30Z",
	}); err != nil {
		t.Fatalf("CommitNarratorInvocationStarted: %v", err)
	}
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider)

	if err := service.RecoverTerminalProjections(context.Background()); err != nil {
		t.Fatalf("RecoverTerminalProjections: %v", err)
	}

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.Status == conversation.NarratorStatusReady &&
			current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	calls := provider.snapshotCalls()
	if len(calls) != 1 || calls[0].requestedChannel != ProjectionChannelTerminal ||
		calls[0].preCallObserved != terminal.Sequence ||
		calls[0].evaluationStart != terminal.Sequence ||
		calls[0].evaluationEnd != terminal.Sequence {
		t.Fatalf("observed terminal recovery calls = %+v", calls)
	}
}
