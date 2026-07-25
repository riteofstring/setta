package conversation

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestTransactionRejectsNonzeroInitialTrajectoryCursor(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-gapped")
	conversation.LastTrajectorySequence = 4

	_, err := store.Transact(context.Background(), "reject gapped conversation", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("gapped-conversation", "conversation:"+conversation.ID, conversation),
		)
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "trajectory sequence must start at zero") {
		t.Fatalf("nonzero initial trajectory error = %v, want zero-cursor validation", err)
	}
	if got := countRows(t, store, "conversations"); got != 0 {
		t.Fatalf("conversation count after rejected cursor = %d, want 0", got)
	}
}

func TestTransactionReportsMissingConversationUpdateAsStateConflict(t *testing.T) {
	store := newTestStore(t)
	missing := transactionTestConversation("conversation-missing")
	missing.UpdatedAt = testTimeEnded

	_, err := store.Transact(context.Background(), "update missing conversation", func(transaction *WriteTransaction) error {
		return transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              testTimeStarted,
				LastTrajectorySequence: 0,
			},
			missing,
		)
	})
	if !IsStateConflict(err) {
		t.Fatalf("missing conversation update error = %T %v, want StateConflictError", err, err)
	}
}

func TestTransactionRejectsTurnResurrectionAndQueueMutationAfterPromotion(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)

	resurrected := validConversationTurn(TurnStatusRunning)
	resurrected.ID = seed.forkSourceTurn.ID
	_, err := store.Transact(context.Background(), "reject terminal turn resurrection", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusCompleted, resurrected); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("turn-resurrected", "conversation:"+seed.conversation.ID, resurrected),
		)
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("terminal turn resurrection error = %T %v, want StateConflictError", err, err)
	}

	promoted := validConversationTurn(TurnStatusRunning)
	promoted.ID = seed.queuedTurn.ID
	promoted.Delivery = TurnDeliveryQueued
	reordered := QueuedConversationTurn{
		TurnID:         promoted.ID,
		ConversationID: promoted.ConversationID,
		Ordinal:        2,
		QueuedAt:       testTimeEnded,
	}
	_, err = store.Transact(context.Background(), "reject promoted queue mutation", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusQueued, promoted); err != nil {
			return err
		}
		if err := transaction.UpdateQueuedTurn(1, reordered); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("promoted-queue-mutated", "conversation:"+seed.conversation.ID, reordered),
		)
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("promoted queue mutation error = %T %v, want StateConflictError", err, err)
	}
	assertTurnStatusAndQueueOrdinal(t, store, seed.queuedTurn.ID, TurnStatusQueued, 1)
}

func TestTransactionPromotesQueuedTurnAndRemovesQueueAtomically(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	promoted := validConversationTurn(TurnStatusRunning)
	promoted.ID = seed.queuedTurn.ID
	promoted.Delivery = TurnDeliveryQueued
	projection := seed.conversation
	projection.Status = ConversationStatusWorking
	projection.UpdatedAt = testTimeEnded
	projection.LastTrajectorySequence = 1
	promotionEvent := TrajectoryEvent{
		ID:             "trajectory-promoted",
		ConversationID: seed.conversation.ID,
		TurnID:         &promoted.ID,
		Sequence:       2,
		EmittedAt:      testTimeEnded,
		Kind:           TrajectoryEventTurnPromoted,
		Actor:          TrajectoryActorSystem,
		TurnPromoted:   &TrajectoryTurnPromoted{FormerQueueOrdinal: 1},
	}

	_, err := store.Transact(context.Background(), "promote queued turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{UpdatedAt: testTimeStarted, LastTrajectorySequence: 1},
			projection,
		); err != nil {
			return err
		}
		if err := transaction.UpdateTurn(TurnStatusQueued, promoted); err != nil {
			return err
		}
		if err := transaction.DeleteQueuedTurn(promoted.ID, promoted.ConversationID, 1); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(promotionEvent); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("turn-promoted", "conversation:"+seed.conversation.ID, promotionEvent),
		)
		return err
	})
	if err != nil {
		t.Fatalf("promote queued turn: %v", err)
	}
	assertTurnStatusAndQueueCount(t, store, promoted.ID, TurnStatusRunning, 0)
	assertConversationSequence(t, store, seed.conversation.ID, 2)
}

func TestTransactionRejectsCrossWorkspaceFork(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	child := transactionTestConversation("conversation-cross-workspace")
	child.WorkspaceID = stringPointer("workspace-2")
	branch := ConversationBranch{
		ChildConversationID:      child.ID,
		ParentConversationID:     seed.conversation.ID,
		Kind:                     BranchKindFork,
		DecisionSource:           BranchDecisionSourceDirector,
		ForkedAtTurnID:           seed.forkSourceTurn.ID,
		SourceTrajectorySequence: 1,
		ProviderMetadata:         map[string]string{"providerForkThreadId": "provider-thread-child"},
		CreatedAt:                testTimeEnded,
	}

	_, err := store.Transact(context.Background(), "reject cross-workspace fork", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(child); err != nil {
			return err
		}
		if err := transaction.InsertConversationBranch(branch); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("cross-workspace-fork", "conversation:"+child.ID, branch),
		)
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("cross-workspace fork error = %T %v, want StateConflictError", err, err)
	}
	if got := countRows(t, store, "conversations"); got != 1 {
		t.Fatalf("conversation count after rejected fork = %d, want only parent", got)
	}
}

func TestTransactionRejectsFailedSideConversationResurrection(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	failed := SideConversation{
		ID:                          "side-failed",
		ParentConversationID:        seed.conversation.ID,
		ParentStatus:                seed.conversation.Status,
		DecisionSource:              BranchDecisionSourceConversationRouter,
		SourceProviderThreadID:      "provider-thread-parent",
		SourceTrajectorySequence:    1,
		Status:                      SideConversationStatusFailed,
		ResolvedSideAgentInvocation: validInvocation(RoleSideAgent, InvocationOutcomeFailed),
		CreatedAt:                   testTimeStarted,
		UpdatedAt:                   testTimeEnded,
		Failure:                     failurePointer(testFailure()),
	}
	failed.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = nil
	_, err := store.Transact(context.Background(), "persist failed side conversation", func(transaction *WriteTransaction) error {
		if err := transaction.InsertSideConversation(failed); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("side-failed", "conversation:"+seed.conversation.ID, failed),
		)
		return err
	})
	if err != nil {
		t.Fatalf("persist failed side conversation: %v", err)
	}

	resurrected := failed
	resurrected.ProviderThreadID = stringPointer("provider-thread-side")
	resurrected.Status = SideConversationStatusActive
	resurrected.ResolvedSideAgentInvocation = validInvocation(RoleSideAgent, InvocationOutcomeRunning)
	resurrected.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = stringPointer("provider-thread-side")
	resurrected.UpdatedAt = testTimeLater
	resurrected.Failure = nil
	_, err = store.Transact(context.Background(), "reject failed side resurrection", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateSideConversation(
			SideConversationExpectation{Status: failed.Status, UpdatedAt: failed.UpdatedAt},
			resurrected,
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("side-resurrected", "conversation:"+seed.conversation.ID, resurrected),
		)
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("failed side resurrection error = %T %v, want StateConflictError", err, err)
	}
	assertSideConversationStatus(t, store, failed.ID, SideConversationStatusFailed)
}

func TestTransactionRejectsNarratorTextRewriteWithoutCursorRevision(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	projected := seed.narratorState
	projected.ObservedThroughSequence = 1
	projected.CurrentFocus = "Reviewing the durable trajectory."
	projected.CurrentFocusRevision = 1
	projected.CurrentFocusSourceSequence = 1
	projected.LastInvocationAt = stringPointer(testTimeEnded)
	projected.UpdatedAt = testTimeEnded
	_, err := store.Transact(context.Background(), "persist narrator focus", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(
			NarratorStateExpectation{UpdatedAt: testTimeStarted},
			projected,
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("narrator-focus", "conversation:"+seed.conversation.ID, projected),
		)
		return err
	})
	if err != nil {
		t.Fatalf("persist narrator focus: %v", err)
	}

	rewritten := projected
	rewritten.CurrentFocus = "Silently replaced focus."
	rewritten.UpdatedAt = testTimeLater
	_, err = store.Transact(context.Background(), "reject unversioned narrator rewrite", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(
			NarratorStateExpectation{
				ObservedThroughSequence:   1,
				CheckpointThroughSequence: 0,
				CurrentFocusRevision:      1,
				UpdatedAt:                 testTimeEnded,
			},
			rewritten,
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft("narrator-focus-rewritten", "conversation:"+seed.conversation.ID, rewritten),
		)
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("unversioned narrator rewrite error = %T %v, want StateConflictError", err, err)
	}
	assertNarratorFocus(t, store, seed.conversation.ID, projected.CurrentFocus, 1)
}

func assertTurnStatusAndQueueOrdinal(
	t *testing.T,
	store *Store,
	turnID string,
	wantStatus TurnStatus,
	wantOrdinal int,
) {
	t.Helper()
	var status TurnStatus
	var ordinal int
	err := store.read(context.Background(), "read turn and queue state", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT conversation_turns.status, conversation_queue.ordinal
FROM conversation_turns
JOIN conversation_queue ON conversation_queue.turn_id = conversation_turns.id
WHERE conversation_turns.id = ?
`, turnID).Scan(&status, &ordinal)
	})
	if err != nil {
		t.Fatalf("read turn and queue state: %v", err)
	}
	if status != wantStatus || ordinal != wantOrdinal {
		t.Fatalf("turn queue state = (%s, %d), want (%s, %d)", status, ordinal, wantStatus, wantOrdinal)
	}
}

func assertTurnStatusAndQueueCount(
	t *testing.T,
	store *Store,
	turnID string,
	wantStatus TurnStatus,
	wantQueueCount int,
) {
	t.Helper()
	var status TurnStatus
	var queueCount int
	err := store.read(context.Background(), "read promoted turn state", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT status, (
  SELECT COUNT(*)
  FROM conversation_queue
  WHERE conversation_queue.turn_id = conversation_turns.id
)
FROM conversation_turns
WHERE id = ?
`, turnID).Scan(&status, &queueCount)
	})
	if err != nil {
		t.Fatalf("read promoted turn state: %v", err)
	}
	if status != wantStatus || queueCount != wantQueueCount {
		t.Fatalf(
			"promoted turn state = (%s, queue count %d), want (%s, queue count %d)",
			status,
			queueCount,
			wantStatus,
			wantQueueCount,
		)
	}
}

func assertSideConversationStatus(
	t *testing.T,
	store *Store,
	sideConversationID string,
	want SideConversationStatus,
) {
	t.Helper()
	var got SideConversationStatus
	err := store.read(context.Background(), "read side conversation status", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT status
FROM side_conversations
WHERE id = ?
`, sideConversationID).Scan(&got)
	})
	if err != nil {
		t.Fatalf("read side conversation status: %v", err)
	}
	if got != want {
		t.Fatalf("side conversation status = %s, want %s", got, want)
	}
}

func assertNarratorFocus(t *testing.T, store *Store, conversationID string, want string, wantRevision int) {
	t.Helper()
	var focus string
	var revision int
	err := store.read(context.Background(), "read narrator focus", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT current_focus, current_focus_revision
FROM narrator_state
WHERE conversation_id = ?
`, conversationID).Scan(&focus, &revision)
	})
	if err != nil {
		t.Fatalf("read narrator focus: %v", err)
	}
	if focus != want || revision != wantRevision {
		t.Fatalf("narrator focus = (%q, %d), want (%q, %d)", focus, revision, want, wantRevision)
	}
}
