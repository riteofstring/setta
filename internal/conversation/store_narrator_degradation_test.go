package conversation

import (
	"context"
	"reflect"
	"testing"
)

const (
	narratorDegradedTime = "2026-07-11T20:02:30Z"
	narratorRetryTime    = "2026-07-11T20:03:30Z"
)

func TestCommitNarratorDegradationPreservesLastValidProjectionAndPublishesState(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before, err := store.ReadNarratorState(context.Background(), seed.conversationID)
	if err != nil {
		t.Fatalf("read narrator state before degradation: %v", err)
	}
	request := narratorDegradationCommit(seed.conversationID, before, "narrator-degraded-event")
	committed, err := store.CommitNarratorDegradation(context.Background(), request)
	if err != nil {
		t.Fatalf("commit narrator degradation: %v", err)
	}

	assertNarratorDegradationPreservedProjection(t, before, committed)
	if committed.Status != NarratorStatusDegraded || committed.Degradation == nil ||
		!reflect.DeepEqual(*committed.Degradation, request.Degradation) ||
		committed.LastInvocationAt == nil || *committed.LastInvocationAt != narratorDegradedTime ||
		committed.UpdatedAt != narratorDegradedTime {
		t.Fatalf("committed narrator degradation = %+v", committed)
	}

	after, err := store.ReadNarratorState(context.Background(), seed.conversationID)
	if err != nil {
		t.Fatalf("read narrator state after degradation: %v", err)
	}
	if !reflect.DeepEqual(after, committed) {
		t.Fatalf("persisted narrator state = %+v, want %+v", after, committed)
	}
	assertNarratorDegradationDidNotChangeAgent(t, store, seed.turnID)
	assertNarratorDegradationPublication(t, store, seed.conversationID, request.CommittedEventID, committed)
}

func TestCommitNarratorDegradationIsOptimisticAndAtomic(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)

	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(
			"duplicate-narrator-degradation-event",
			"conversation:"+seed.conversationID,
			map[string]string{"state": "existing"},
		),
	})
	rollback := narratorDegradationCommit(
		seed.conversationID,
		before,
		"duplicate-narrator-degradation-event",
	)
	_, err := store.CommitNarratorDegradation(context.Background(), rollback)
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("duplicate degradation publication error = %T %v, want PersistenceError", err, err)
	}
	if after := readTestNarratorState(t, store, seed.conversationID); !reflect.DeepEqual(after, before) {
		t.Fatalf("narrator state changed after publication rollback:\nbefore = %+v\nafter = %+v", before, after)
	}

	first := narratorDegradationCommit(seed.conversationID, before, "narrator-degradation-first")
	committed, err := store.CommitNarratorDegradation(context.Background(), first)
	if err != nil {
		t.Fatalf("commit first narrator degradation: %v", err)
	}
	stale := narratorDegradationCommit(seed.conversationID, before, "narrator-degradation-stale")
	stale.Degradation.DegradedAt = narratorRetryTime
	stale.CommittedAt = narratorRetryTime
	_, err = store.CommitNarratorDegradation(context.Background(), stale)
	if !IsStateConflict(err) {
		t.Fatalf("stale degradation error = %T %v, want StateConflictError", err, err)
	}
	if after := readTestNarratorState(t, store, seed.conversationID); !reflect.DeepEqual(after, committed) {
		t.Fatalf("stale degradation changed narrator state:\ncommitted = %+v\nafter = %+v", committed, after)
	}
}

func TestSuccessfulNarratorRetryClearsDegradation(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)
	degraded, err := store.CommitNarratorDegradation(
		context.Background(),
		narratorDegradationCommit(seed.conversationID, before, "narrator-degradation-before-retry"),
	)
	if err != nil {
		t.Fatalf("commit narrator degradation before retry: %v", err)
	}

	retry := narratorWorkingCommit(seed)
	retry.Expected = narratorExpectation(degraded)
	retry.CommittedAt = narratorRetryTime
	recovered, err := store.CommitNarratorProjection(context.Background(), retry)
	if err != nil {
		t.Fatalf("commit successful narrator retry: %v", err)
	}
	if recovered.State.Status != NarratorStatusReady || recovered.State.Degradation != nil ||
		recovered.State.ObservedThroughSequence != 8 ||
		recovered.State.CurrentFocus != "Persisting validated narrator output." ||
		recovered.State.LastInvocationAt == nil || *recovered.State.LastInvocationAt != narratorRetryTime {
		t.Fatalf("recovered narrator state = %+v", recovered.State)
	}
}

func TestSuccessfulCheckpointRetryClearsDegradation(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)
	degraded, err := store.CommitNarratorDegradation(
		context.Background(),
		narratorDegradationCommit(seed.conversationID, before, "checkpoint-degradation-before-retry"),
	)
	if err != nil {
		t.Fatalf("commit checkpoint degradation before retry: %v", err)
	}
	recovered, err := store.CommitNarratorCheckpoint(context.Background(), NarratorCheckpointCommit{
		ConversationID:         seed.conversationID,
		Expected:               narratorExpectation(degraded),
		CoveredThroughSequence: 4,
		HistoricalSummary:      "The successful checkpoint retry compacted the observed prefix.",
		CommittedEventID:       "checkpoint-retry-recovered",
		CommittedAt:            narratorRetryTime,
	})
	if err != nil {
		t.Fatalf("commit successful checkpoint retry: %v", err)
	}
	if recovered.Status != NarratorStatusReady || recovered.Degradation != nil ||
		recovered.CheckpointThroughSequence != 4 ||
		recovered.ObservedThroughSequence != degraded.ObservedThroughSequence ||
		recovered.CurrentFocus != degraded.CurrentFocus {
		t.Fatalf("checkpoint-recovered narrator state = %+v", recovered)
	}
}

func TestSuccessfulStatusAfterFailureClearsDegradationWithoutAdvancingCursor(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)
	degraded, err := store.CommitNarratorDegradation(
		context.Background(),
		narratorDegradationCommit(seed.conversationID, before, "status-degradation-before-recovery"),
	)
	if err != nil {
		t.Fatalf("commit status degradation before recovery: %v", err)
	}
	status := narratorStatusCommit(seed, degraded)
	status.CommittedAt = narratorRetryTime
	recovered, err := store.CommitNarratorStatus(context.Background(), status)
	if err != nil {
		t.Fatalf("commit successful status after failure: %v", err)
	}
	if recovered.State.Status != NarratorStatusReady || recovered.State.Degradation != nil ||
		recovered.State.ObservedThroughSequence != degraded.ObservedThroughSequence ||
		recovered.State.CheckpointThroughSequence != degraded.CheckpointThroughSequence ||
		recovered.State.CurrentFocus != degraded.CurrentFocus ||
		recovered.Event.Kind != NarrationEventKindStatusReply {
		t.Fatalf("status-recovered narrator result = %+v", recovered)
	}
}

func TestNarratorDegradationCommitValidationRejectsInvalidTimeline(t *testing.T) {
	state := NarratorState{
		ConversationID:            "conversation",
		ObservedThroughSequence:   3,
		CheckpointThroughSequence: 2,
		CurrentFocusRevision:      1,
		UpdatedAt:                 narratorDegradedTime,
	}
	request := narratorDegradationCommit(state.ConversationID, state, "narrator-degradation")
	request.Degradation.DegradedAt = testTimeStarted
	if err := request.Validate(); err == nil {
		t.Fatal("degradation accepted a failed-at time before the expected narrator version")
	}
	request.Degradation.DegradedAt = narratorRetryTime
	request.CommittedAt = narratorDegradedTime
	if err := request.Validate(); err == nil {
		t.Fatal("degradation accepted a commit time before the failed attempt")
	}
	if _, err := (*Store)(nil).ReadNarratorState(context.Background(), state.ConversationID); err == nil {
		t.Fatal("nil store accepted narrator state read")
	}
	if _, err := (*Store)(nil).CommitNarratorDegradation(context.Background(), request); err == nil {
		t.Fatal("nil store accepted narrator degradation commit")
	}
}

func narratorDegradationCommit(
	conversationID string,
	state NarratorState,
	eventID string,
) NarratorDegradationCommit {
	return NarratorDegradationCommit{
		ConversationID: conversationID,
		Expected:       narratorExpectation(state),
		Degradation: NarratorDegradation{
			Code:                "provider_unavailable",
			Message:             "Narration is temporarily unavailable.",
			Retryable:           true,
			DiagnosticReference: "narrator-diagnostic-1",
			DegradedAt:          narratorDegradedTime,
		},
		CommittedEventID: eventID,
		CommittedAt:      narratorDegradedTime,
	}
}

func assertNarratorDegradationPreservedProjection(
	t *testing.T,
	before NarratorState,
	after NarratorState,
) {
	t.Helper()
	if after.ObservedThroughSequence != before.ObservedThroughSequence ||
		after.CheckpointThroughSequence != before.CheckpointThroughSequence ||
		after.CheckpointText != before.CheckpointText ||
		after.CurrentFocus != before.CurrentFocus ||
		after.CurrentFocusRevision != before.CurrentFocusRevision ||
		after.TopicDescriptor != before.TopicDescriptor {
		t.Fatalf("degradation changed the last valid projection:\nbefore = %+v\nafter = %+v", before, after)
	}
}

func assertNarratorDegradationDidNotChangeAgent(t *testing.T, store *Store, turnID string) {
	t.Helper()
	turn := readNarratorOutputTurn(t, store, turnID)
	if turn.Status != TurnStatusRunning || turn.Error != nil || turn.ResolvedInvocation == nil ||
		turn.ResolvedInvocation.Outcome != InvocationOutcomeRunning {
		t.Fatalf("narrator degradation changed primary agent turn = %+v", turn)
	}
}

func assertNarratorDegradationPublication(
	t *testing.T,
	store *Store,
	conversationID string,
	eventID string,
	want NarratorState,
) {
	t.Helper()
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		streamID,
		0,
		MaxCommittedEventReadLimit,
	)
	if err != nil {
		t.Fatalf("read degradation publication: %v", err)
	}
	last := events[len(events)-1]
	if last.ID != eventID || last.Kind != string(ConversationEventTypeNarratorStateUpdated) {
		t.Fatalf("degradation publication = %+v", last)
	}
	decoded, err := conversationEventFromCommitted(last, "workspace-1", conversationID)
	if err != nil {
		t.Fatalf("decode degradation publication: %v", err)
	}
	payload, ok := decoded.Payload.(*ConversationNarratorStateUpdatedEventPayload)
	if !ok || payload == nil || !reflect.DeepEqual(payload.State, want) {
		t.Fatalf("degradation event payload = %T %+v, want %+v", decoded.Payload, decoded.Payload, want)
	}
}
