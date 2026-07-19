package conversation

import (
	"context"
	"testing"
)

func TestNarratorInvocationStartMarksRunningAndTargetsTerminalRecovery(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	appendTerminalNarratorSource(t, store, seed)

	if targets, err := store.ListNarratorTerminalRecoveryTargets(context.Background()); err != nil {
		t.Fatalf("ListNarratorTerminalRecoveryTargets before running: %v", err)
	} else if len(targets) != 0 {
		t.Fatalf("recovery targets before running marker = %+v", targets)
	}

	state, err := store.ReadNarratorState(context.Background(), seed.conversationID)
	if err != nil {
		t.Fatalf("ReadNarratorState: %v", err)
	}
	committed, err := store.CommitNarratorInvocationStarted(context.Background(), NarratorInvocationStartedCommit{
		ConversationID:   seed.conversationID,
		Expected:         narratorExpectation(state),
		CommittedEventID: "narrator-started-for-recovery",
		StartedAt:        narratorTerminalTime,
	})
	if err != nil {
		t.Fatalf("CommitNarratorInvocationStarted: %v", err)
	}
	if committed.Status != NarratorStatusRunning ||
		committed.ObservedThroughSequence != state.ObservedThroughSequence ||
		committed.CheckpointThroughSequence != state.CheckpointThroughSequence ||
		committed.CurrentFocusRevision != state.CurrentFocusRevision ||
		committed.LastInvocationAt == nil ||
		*committed.LastInvocationAt != narratorTerminalTime {
		t.Fatalf("started narrator state = %+v, before = %+v", committed, state)
	}

	targets, err := store.ListNarratorTerminalRecoveryTargets(context.Background())
	if err != nil {
		t.Fatalf("ListNarratorTerminalRecoveryTargets after running: %v", err)
	}
	if len(targets) != 1 {
		t.Fatalf("recovery targets = %+v", targets)
	}
	if target := targets[0]; target.ConversationID != seed.conversationID ||
		target.TurnID != seed.turnID ||
		target.TerminalSequence != 11 {
		t.Fatalf("recovery target = %+v", target)
	}
}

func TestNarratorTerminalRecoveryIgnoresCompletedFinalSummaries(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	appendTerminalNarratorSource(t, store, seed)
	state, err := store.ReadNarratorState(context.Background(), seed.conversationID)
	if err != nil {
		t.Fatalf("ReadNarratorState: %v", err)
	}
	running, err := store.CommitNarratorInvocationStarted(context.Background(), NarratorInvocationStartedCommit{
		ConversationID:   seed.conversationID,
		Expected:         narratorExpectation(state),
		CommittedEventID: "narrator-started-before-final",
		StartedAt:        narratorTerminalTime,
	})
	if err != nil {
		t.Fatalf("CommitNarratorInvocationStarted: %v", err)
	}
	request := narratorTerminalCommit(seed, running)
	request.CommittedAt = narratorTerminalFinalizationTime
	if _, err := store.CommitNarratorProjection(context.Background(), request); err != nil {
		t.Fatalf("CommitNarratorProjection: %v", err)
	}

	targets, err := store.ListNarratorTerminalRecoveryTargets(context.Background())
	if err != nil {
		t.Fatalf("ListNarratorTerminalRecoveryTargets: %v", err)
	}
	if len(targets) != 0 {
		t.Fatalf("recovery targets after final summary = %+v", targets)
	}
}

func TestNarratorTerminalRecoveryIncludesObservedTerminalFinalization(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	appendTerminalNarratorSource(t, store, seed)
	state, err := store.ReadNarratorState(context.Background(), seed.conversationID)
	if err != nil {
		t.Fatalf("ReadNarratorState: %v", err)
	}
	caughtUp := markNarratorOutputStateCaughtUp(t, store, seed.conversationID, state, 11)
	if _, err := store.CommitNarratorInvocationStarted(context.Background(), NarratorInvocationStartedCommit{
		ConversationID:   seed.conversationID,
		Expected:         narratorExpectation(caughtUp),
		CommittedEventID: "narrator-started-for-terminal-finalization-recovery",
		StartedAt:        narratorTerminalFinalizationTime,
	}); err != nil {
		t.Fatalf("CommitNarratorInvocationStarted: %v", err)
	}

	targets, err := store.ListNarratorTerminalRecoveryTargets(context.Background())
	if err != nil {
		t.Fatalf("ListNarratorTerminalRecoveryTargets: %v", err)
	}
	if len(targets) != 1 {
		t.Fatalf("recovery targets = %+v", targets)
	}
	if target := targets[0]; target.ConversationID != seed.conversationID ||
		target.TurnID != seed.turnID ||
		target.TerminalSequence != 11 {
		t.Fatalf("observed terminal recovery target = %+v", target)
	}
}
