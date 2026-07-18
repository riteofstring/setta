package conversation

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestStoreRecoversAndCompletesCommittedConversationRouteCommands(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	seedConversationInputTargets(t, store, "conversation_replay")
	input := validConversationInput("input_replay")
	input.ConversationID = "conversation_replay"
	acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
	work := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		input.Text,
	)
	commit := validConversationRouteDecisionCommit("decision_replay", decision, command)
	commit.ConversationID = input.ConversationID
	commit.InputID = input.ID
	commit.RoutingAttempt = work.RoutingAttempt
	commit.DecidedAt = "2026-07-12T18:00:03Z"
	record, err := store.CommitConversationRouteDecision(context.Background(), commit)
	if err != nil {
		t.Fatalf("CommitConversationRouteDecision: %v", err)
	}
	assertPendingConversationRouteCommand(t, store, record.ID)
	assertPendingConversationRouteRecovery(t, store, input.ConversationID, true)

	if err := store.Close(); err != nil {
		t.Fatalf("close initial store: %v", err)
	}
	store, err = NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	assertPendingConversationRouteCommand(t, store, record.ID)
	blockedCtx, cancelBlocked := context.WithTimeout(context.Background(), 20*time.Millisecond)
	_, waitErr := store.WaitForConversationInputRoutingState(
		blockedCtx,
		"workspace",
		input.ConversationID,
		input.ID,
	)
	cancelBlocked()
	if !errors.Is(waitErr, context.DeadlineExceeded) {
		t.Fatalf("route settlement before command completion = %v, want deadline", waitErr)
	}
	type waitResult struct {
		state ConversationInputRoutingState
		err   error
	}
	waited := make(chan waitResult, 1)
	go func() {
		state, waitErr := store.WaitForConversationInputRoutingState(
			context.Background(),
			"workspace",
			input.ConversationID,
			input.ID,
		)
		waited <- waitResult{state: state, err: waitErr}
	}()
	if err := store.CompleteConversationRouteCommand(
		context.Background(),
		record.ID,
		"2026-07-12T18:00:04Z",
	); err != nil {
		t.Fatalf("CompleteConversationRouteCommand: %v", err)
	}
	select {
	case result := <-waited:
		if result.err != nil || result.state.Input.Status != ConversationInputStatusDispatched {
			t.Fatalf("route settlement = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("route settlement was not woken by command completion")
	}
	if err := store.CompleteConversationRouteCommand(
		context.Background(),
		record.ID,
		"2026-07-12T18:00:05Z",
	); err != nil {
		t.Fatalf("idempotent CompleteConversationRouteCommand: %v", err)
	}
	if pending, found, err := store.ReadNextPendingConversationRouteCommand(
		context.Background(),
		input.ConversationID,
	); err != nil || found {
		t.Fatalf("completed pending command = %+v found=%v err=%v", pending, found, err)
	}
	assertPendingConversationRouteRecovery(t, store, input.ConversationID, false)
}

func assertPendingConversationRouteCommand(t *testing.T, store *Store, decisionID string) {
	t.Helper()
	record, found, err := store.ReadNextPendingConversationRouteCommand(
		context.Background(),
		"conversation_replay",
	)
	if err != nil || !found || record.ID != decisionID {
		t.Fatalf("pending route command = %+v found=%v err=%v", record, found, err)
	}
}

func assertPendingConversationRouteRecovery(
	t *testing.T,
	store *Store,
	conversationID string,
	want bool,
) {
	t.Helper()
	conversationIDs, err := store.ListPendingConversationRouteInputs(context.Background())
	if err != nil {
		t.Fatalf("ListPendingConversationRouteInputs: %v", err)
	}
	found := false
	for _, candidate := range conversationIDs {
		found = found || candidate == conversationID
	}
	if found != want {
		t.Fatalf("pending route recovery conversations = %v, want %s present=%v", conversationIDs, conversationID, want)
	}
}
