package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

const testTimeLater = "2026-07-11T20:02:00Z"

func TestTransactRequiresCommittedPublicationAndCannotEscape(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-unpublished")

	_, err := store.Transact(context.Background(), "reject unpublished state", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(conversation)
	})
	if !errors.Is(err, ErrCommittedEventRequired) {
		t.Fatalf("unpublished transaction error = %v, want ErrCommittedEventRequired", err)
	}
	if got := countRows(t, store, "conversations"); got != 0 {
		t.Fatalf("conversation count after unpublished transaction = %d, want 0", got)
	}

	_, err = store.Transact(context.Background(), "reject empty transaction", func(*WriteTransaction) error {
		return nil
	})
	if !errors.Is(err, ErrEmptyWriteTransaction) {
		t.Fatalf("empty transaction error = %v, want ErrEmptyWriteTransaction", err)
	}

	sentinel := errors.New("reject after outbox append")
	_, err = store.Transact(context.Background(), "roll back state and outbox", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		if _, err := transaction.AppendCommittedEvent(transactionTestEventDraft("rollback-event", "conversation:rollback", conversation)); err != nil {
			return err
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("rollback transaction error = %v, want sentinel", err)
	}
	if got := countRows(t, store, "conversations"); got != 0 {
		t.Fatalf("conversation count after explicit rollback = %d, want 0", got)
	}
	if got := countRows(t, store, "committed_events"); got != 0 {
		t.Fatalf("committed event count after explicit rollback = %d, want 0", got)
	}

	var escaped *WriteTransaction
	committed, err := store.Transact(context.Background(), "commit one event", func(transaction *WriteTransaction) error {
		escaped = transaction
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("event-1", "conversation:one", conversation))
		return err
	})
	if err != nil {
		t.Fatalf("commit event: %v", err)
	}
	if len(committed) != 1 {
		t.Fatalf("committed event count = %d, want 1", len(committed))
	}
	if _, err := escaped.AppendCommittedEvent(transactionTestEventDraft("event-after-commit", "conversation:one", conversation)); !errors.Is(err, ErrTransactionClosed) {
		t.Fatalf("escaped transaction error = %v, want ErrTransactionClosed", err)
	}
}

func TestCommittedEventOutboxOrdersAndReplaysPerStream(t *testing.T) {
	store := newTestStore(t, WithReadPoolSize(2))
	payload := map[string]string{"state": "accepted"}
	committed := appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft("event-a1", "conversation:a", payload),
		transactionTestEventDraft("event-b1", "conversation:b", payload),
		transactionTestEventDraft("event-a2", "conversation:a", payload),
	})
	payload["state"] = "mutated-after-commit"
	assertCommittedEventSequences(t, committed, []int64{1, 2, 3}, []int{1, 1, 2})

	replayed, err := store.ReadCommittedEvents(context.Background(), CommittedEventCursor{CommitSequence: 1}, 10)
	if err != nil {
		t.Fatalf("read committed events: %v", err)
	}
	if len(replayed) != 2 || replayed[0].ID != "event-b1" || replayed[1].ID != "event-a2" {
		t.Fatalf("global replay = %#v, want event-b1 then event-a2", replayed)
	}
	var replayedPayload map[string]string
	if err := json.Unmarshal(replayed[0].Payload, &replayedPayload); err != nil {
		t.Fatalf("decode replayed payload: %v", err)
	}
	if replayedPayload["state"] != "accepted" {
		t.Fatalf("replayed payload state = %q, want accepted", replayedPayload["state"])
	}

	streamReplay, err := store.ReadCommittedStreamEvents(context.Background(), "conversation:a", 1, 10)
	if err != nil {
		t.Fatalf("read committed stream: %v", err)
	}
	if len(streamReplay) != 1 || streamReplay[0].ID != "event-a2" || streamReplay[0].StreamSequence != 2 {
		t.Fatalf("stream replay = %#v, want event-a2 at sequence 2", streamReplay)
	}
}

func TestCommittedEventOutboxWakesWithoutPolling(t *testing.T) {
	store := newTestStore(t, WithReadPoolSize(2))
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft("event-a1", "conversation:a", map[string]string{"state": "accepted"}),
		transactionTestEventDraft("event-b1", "conversation:b", map[string]string{"state": "accepted"}),
		transactionTestEventDraft("event-a2", "conversation:a", map[string]string{"state": "accepted"}),
	})
	waitResult := make(chan []CommittedEvent, 1)
	waitError := make(chan error, 1)
	waitStarted := make(chan struct{})
	go func() {
		close(waitStarted)
		events, err := store.WaitForCommittedEvents(
			context.Background(),
			CommittedEventCursor{CommitSequence: 3},
			10,
		)
		if err != nil {
			waitError <- err
			return
		}
		waitResult <- events
	}()
	<-waitStarted
	select {
	case events := <-waitResult:
		t.Fatalf("outbox wait returned before a new commit: %#v", events)
	case err := <-waitError:
		t.Fatalf("outbox wait failed before a new commit: %v", err)
	default:
	}
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft("event-b2", "conversation:b", map[string]string{"state": "working"}),
	})
	select {
	case events := <-waitResult:
		if len(events) != 1 || events[0].ID != "event-b2" || events[0].CommitSequence != 4 {
			t.Fatalf("wait result = %#v, want event-b2 at commit 4", events)
		}
	case err := <-waitError:
		t.Fatalf("outbox wait: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for committed event notification")
	}
}

func TestCommittedEventOutboxReplaysAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft("event-before-restart", "conversation:a", map[string]string{"state": "completed"}),
	})
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	reopened, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	restartedReplay, err := reopened.ReadCommittedEvents(context.Background(), CommittedEventCursor{}, 10)
	if err != nil {
		t.Fatalf("read outbox after restart: %v", err)
	}
	if len(restartedReplay) != 1 || restartedReplay[0].ID != "event-before-restart" {
		t.Fatalf("restart replay = %#v, want the durable pre-restart event", restartedReplay)
	}
}

func TestCommittedEventOutboxRejectsInvalidOrDuplicateRecordsAtomically(t *testing.T) {
	store := newTestStore(t)
	typedNilPayload := (*TopicConversation)(nil)
	tests := []struct {
		name  string
		draft CommittedEventDraft
	}{
		{name: "missing id", draft: transactionTestEventDraft("", "conversation:a", map[string]string{})},
		{name: "missing stream", draft: transactionTestEventDraft("event-1", "", map[string]string{})},
		{name: "missing kind", draft: CommittedEventDraft{ID: "event-1", StreamID: "conversation:a", Payload: map[string]string{}, CommittedAt: testTimeStarted}},
		{name: "nil payload", draft: transactionTestEventDraft("event-1", "conversation:a", nil)},
		{name: "typed nil payload", draft: transactionTestEventDraft("event-1", "conversation:a", typedNilPayload)},
		{name: "non-json payload", draft: transactionTestEventDraft("event-1", "conversation:a", make(chan int))},
		{name: "noncanonical time", draft: CommittedEventDraft{ID: "event-1", StreamID: "conversation:a", Kind: "changed", Payload: map[string]string{}, CommittedAt: "2026-07-11T13:00:00-07:00"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := store.Transact(context.Background(), "reject invalid outbox event", func(transaction *WriteTransaction) error {
				_, err := transaction.AppendCommittedEvent(test.draft)
				return err
			})
			if err == nil {
				t.Fatal("invalid outbox event committed")
			}
		})
	}
	if got := countRows(t, store, "committed_events"); got != 0 {
		t.Fatalf("committed event count after invalid drafts = %d, want 0", got)
	}

	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft("event-existing", "conversation:a", map[string]string{"state": "idle"}),
	})
	_, err := store.Transact(context.Background(), "reject duplicate outbox id", func(transaction *WriteTransaction) error {
		if _, err := transaction.AppendCommittedEvent(transactionTestEventDraft("event-new", "conversation:a", map[string]string{"state": "working"})); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("event-existing", "conversation:a", map[string]string{"state": "failed"}))
		return err
	})
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("duplicate outbox id error = %T %v, want PersistenceError", err, err)
	}
	replayed, err := store.ReadCommittedEvents(context.Background(), CommittedEventCursor{}, 10)
	if err != nil {
		t.Fatalf("read outbox after duplicate rollback: %v", err)
	}
	if len(replayed) != 1 || replayed[0].ID != "event-existing" {
		t.Fatalf("outbox after duplicate rollback = %#v, want only event-existing", replayed)
	}
}

func TestCommittedEventOutboxReadAndWaitBoundsAreTyped(t *testing.T) {
	store := newTestStore(t)
	if _, err := store.ReadCommittedEvents(context.Background(), CommittedEventCursor{CommitSequence: -1}, 1); err == nil {
		t.Fatal("negative outbox cursor was accepted")
	}
	if _, err := store.ReadCommittedEvents(context.Background(), CommittedEventCursor{}, MaxCommittedEventReadLimit+1); err == nil {
		t.Fatal("oversized outbox read was accepted")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := store.WaitForCommittedEvents(cancelled, CommittedEventCursor{}, 1); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled outbox wait error = %v, want context.Canceled", err)
	}
}

func TestTransactionComposesTrajectoryAndNarratorRecordsAtomically(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)

	projectedState := seed.narratorState
	projectedState.ObservedThroughSequence = 1
	projectedState.CurrentFocus = "Persisting the narrator projection."
	projectedState.CurrentFocusRevision = 1
	projectedState.LastInvocationAt = stringPointer(testTimeEnded)
	projectedState.UpdatedAt = testTimeEnded
	narration := transactionMilestoneEvent()
	var persistedNarration NarrationEvent
	_, err := store.Transact(context.Background(), "commit narrator projection", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(
			NarratorStateExpectation{UpdatedAt: testTimeStarted},
			projectedState,
		); err != nil {
			return err
		}
		appended, appendErr := transaction.AppendNarrationEvent(narration)
		if appendErr != nil {
			return appendErr
		}
		persistedNarration = appended
		_, appendErr = transaction.AppendCommittedEvent(transactionTestEventDraft("narration-event", "conversation:conversation-1", persistedNarration))
		return appendErr
	})
	if err != nil {
		t.Fatalf("commit narrator projection: %v", err)
	}
	if persistedNarration.StreamSequence != 1 {
		t.Fatalf("narration stream sequence = %d, want 1", persistedNarration.StreamSequence)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversation.ID, 1, 1)

	staleState := projectedState
	staleState.CheckpointThroughSequence = 1
	staleState.CheckpointText = "Checkpoint through the accepted input."
	staleState.UpdatedAt = testTimeLater
	_, err = store.Transact(context.Background(), "reject stale narrator checkpoint", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(
			NarratorStateExpectation{UpdatedAt: testTimeStarted},
			staleState,
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("stale-checkpoint", "conversation:conversation-1", staleState))
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("stale narrator update error = %T %v, want StateConflictError", err, err)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversation.ID, 1, 1)
}

func TestNarratorCursorAndOutputRollBackWhenPublicationFails(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(
			"duplicate-publication",
			"conversation:"+seed.conversation.ID,
			map[string]string{"state": "seeded"},
		),
	})

	projectedState := seed.narratorState
	projectedState.ObservedThroughSequence = 1
	projectedState.CurrentFocus = "This projection must roll back."
	projectedState.CurrentFocusRevision = 1
	projectedState.LastInvocationAt = stringPointer(testTimeEnded)
	projectedState.UpdatedAt = testTimeEnded

	_, err := store.Transact(context.Background(), "reject duplicate narrator publication", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(
			NarratorStateExpectation{UpdatedAt: testTimeStarted},
			projectedState,
		); err != nil {
			return err
		}
		if _, err := transaction.AppendNarrationEvent(transactionMilestoneEvent()); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(
			transactionTestEventDraft(
				"duplicate-publication",
				"conversation:"+seed.conversation.ID,
				projectedState,
			),
		)
		return err
	})
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("duplicate narrator publication error = %T %v, want PersistenceError", err, err)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversation.ID, 0, 0)
}

func TestConcurrentTransactionalActorsSerializeStateAndPublication(t *testing.T) {
	const actorCount = 48
	store, err := NewStore(
		t.TempDir(),
		WithWriteQueueCapacity(actorCount),
		WithReadPoolSize(3),
	)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := make(chan struct{})
	errorsFound := make(chan error, actorCount)
	var actors sync.WaitGroup
	for actor := range actorCount {
		actors.Add(1)
		go func() {
			defer actors.Done()
			<-start
			conversation := transactionTestConversation(fmt.Sprintf("conversation-actor-%03d", actor))
			_, err := store.Transact(ctx, "commit concurrent conversation actor", func(transaction *WriteTransaction) error {
				if err := transaction.InsertConversation(conversation); err != nil {
					return err
				}
				_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
					"conversation-created-"+conversation.ID,
					"conversation:"+conversation.ID,
					conversation,
				))
				return err
			})
			errorsFound <- err
		}()
	}
	close(start)
	actors.Wait()
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Errorf("concurrent actor transaction: %v", err)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
	if got := countRows(t, store, "conversations"); got != actorCount {
		t.Fatalf("conversation count = %d, want %d", got, actorCount)
	}
	if got := countRows(t, store, "committed_events"); got != actorCount {
		t.Fatalf("committed event count = %d, want %d", got, actorCount)
	}
}

func TestTransactionComposesDurableForkAndBindingAtomically(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	child := transactionTestConversation("conversation-child")
	binding := AgentThreadBinding{
		ConversationID:   child.ID,
		Provider:         ProviderCodex,
		ThreadID:         "provider-thread-child",
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        testTimeEnded,
		ProviderMetadata: map[string]string{"fork": "completed-turn"},
	}
	branch := ConversationBranch{
		ChildConversationID:      child.ID,
		ParentConversationID:     seed.conversation.ID,
		Kind:                     BranchKindFork,
		DecisionSource:           BranchDecisionSourceMaster,
		ForkedAtTurnID:           seed.forkSourceTurn.ID,
		SourceTrajectorySequence: 1,
		ProviderMetadata:         map[string]string{"providerForkThreadId": binding.ThreadID},
		CreatedAt:                testTimeEnded,
	}
	_, err := store.Transact(context.Background(), "create durable fork", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(child); err != nil {
			return err
		}
		if err := transaction.InsertConversationBranch(branch); err != nil {
			return err
		}
		if err := transaction.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("branch-created", "conversation:conversation-child", branch))
		return err
	})
	if err != nil {
		t.Fatalf("create durable fork: %v", err)
	}
	if got := countRows(t, store, "conversation_branches"); got != 1 {
		t.Fatalf("conversation branch count = %d, want 1", got)
	}
	if got := countRows(t, store, "agent_thread_bindings"); got != 1 {
		t.Fatalf("thread binding count = %d, want 1", got)
	}
}

func TestTransactionRejectsForkFromIncompleteParentTurnAtomically(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	child := transactionTestConversation("conversation-incomplete-fork")
	branch := ConversationBranch{
		ChildConversationID:      child.ID,
		ParentConversationID:     seed.conversation.ID,
		Kind:                     BranchKindFork,
		DecisionSource:           BranchDecisionSourceConversationRouter,
		ForkedAtTurnID:           seed.queuedTurn.ID,
		SourceTrajectorySequence: 1,
		ProviderMetadata:         map[string]string{},
		CreatedAt:                testTimeEnded,
	}
	_, err := store.Transact(context.Background(), "reject incomplete durable fork", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(child); err != nil {
			return err
		}
		if err := transaction.InsertConversationBranch(branch); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("invalid-branch", "conversation:"+child.ID, branch))
		return err
	})
	if !IsStateConflict(err) {
		t.Fatalf("incomplete fork error = %T %v, want StateConflictError", err, err)
	}
	if got := countRows(t, store, "conversations"); got != 1 {
		t.Fatalf("conversation count after rejected fork = %d, want only the parent", got)
	}
	if got := countRows(t, store, "conversation_branches"); got != 0 {
		t.Fatalf("branch count after rejected fork = %d, want 0", got)
	}
}

type transactionSeed struct {
	conversation   TopicConversation
	queuedTurn     ConversationTurn
	forkSourceTurn ConversationTurn
	narratorState  NarratorState
}

func seedTransactionConversation(t *testing.T, store *Store) transactionSeed {
	t.Helper()
	seed := transactionSeed{
		conversation:   transactionTestConversation("conversation-1"),
		queuedTurn:     validConversationTurn(TurnStatusQueued),
		forkSourceTurn: validConversationTurn(TurnStatusCompleted),
		narratorState: NarratorState{
			ConversationID: "conversation-1",
			Status:         NarratorStatusReady,
			UpdatedAt:      testTimeStarted,
		},
	}
	seed.queuedTurn.Delivery = TurnDeliveryQueued
	seed.forkSourceTurn.ID = "turn-fork-source"
	queued := QueuedConversationTurn{
		TurnID:         seed.queuedTurn.ID,
		ConversationID: seed.queuedTurn.ConversationID,
		Ordinal:        1,
		QueuedAt:       testTimeStarted,
	}
	presentation := ConversationPresentationProfile{
		ConversationID:          seed.conversation.ID,
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: speechVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               testTimeStarted,
	}
	accepted := transactionAcceptedInputEvent(seed.queuedTurn)
	_, err := store.Transact(context.Background(), "accept queued conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(seed.conversation); err != nil {
			return err
		}
		if err := transaction.InsertTurn(seed.queuedTurn); err != nil {
			return err
		}
		if err := transaction.InsertTurn(seed.forkSourceTurn); err != nil {
			return err
		}
		if err := transaction.InsertQueuedTurn(queued); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(seed.narratorState); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(accepted); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft("accepted-event", "conversation:conversation-1", accepted))
		return err
	})
	if err != nil {
		t.Fatalf("accept queued conversation turn: %v", err)
	}
	assertConversationSequence(t, store, seed.conversation.ID, 1)
	assertTurnOptionalJSONIsNull(t, store, seed.queuedTurn.ID)
	return seed
}

func appendTestOutboxEvents(t *testing.T, store *Store, drafts []CommittedEventDraft) []CommittedEvent {
	t.Helper()
	committed, err := store.Transact(context.Background(), "append test committed events", func(transaction *WriteTransaction) error {
		for _, draft := range drafts {
			if _, err := transaction.AppendCommittedEvent(draft); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("append committed events: %v", err)
	}
	return committed
}

func transactionTestConversation(id string) TopicConversation {
	return TopicConversation{
		ID:          id,
		WorkspaceID: "workspace-1",
		Title:       "Transaction helpers",
		Status:      ConversationStatusIdle,
		CreatedAt:   testTimeStarted,
		UpdatedAt:   testTimeStarted,
	}
}

func transactionTestEventDraft(id string, streamID string, payload any) CommittedEventDraft {
	return CommittedEventDraft{
		ID:          id,
		StreamID:    streamID,
		Kind:        "conversation_state_changed",
		Payload:     payload,
		CommittedAt: testTimeStarted,
	}
}

func transactionAcceptedInputEvent(turn ConversationTurn) TrajectoryEvent {
	return TrajectoryEvent{
		ID:             "trajectory-accepted",
		ConversationID: turn.ConversationID,
		TurnID:         &turn.ID,
		Sequence:       1,
		EmittedAt:      testTimeStarted,
		Kind:           TrajectoryEventUserInputAccepted,
		Actor:          TrajectoryActorUser,
		UserInputAccepted: &TrajectoryUserInputAccepted{
			Input:    turn.AuthoredInput,
			Delivery: turn.Delivery,
		},
	}
}

func transactionMilestoneEvent() NarrationEvent {
	event := baseNarrationEvent(NarrationEventKindMilestone)
	event.StreamSequence = 0
	event.ID = "narration-milestone"
	event.SourceSequenceEnd = 1
	event.Trigger = NarrationTriggerPhaseActivityCompleted
	event.Milestone = &NarrationMilestone{Text: "The transaction boundary is now persisted."}
	return event
}

func assertCommittedEventSequences(t *testing.T, events []CommittedEvent, commits []int64, streams []int) {
	t.Helper()
	if len(events) != len(commits) || len(events) != len(streams) {
		t.Fatalf("committed event count = %d, want %d", len(events), len(commits))
	}
	for index, event := range events {
		if event.CommitSequence != commits[index] || event.StreamSequence != streams[index] {
			t.Errorf(
				"event %d sequences = (%d, %d), want (%d, %d)",
				index,
				event.CommitSequence,
				event.StreamSequence,
				commits[index],
				streams[index],
			)
		}
	}
}

func assertConversationSequence(t *testing.T, store *Store, conversationID string, want int) {
	t.Helper()
	var got int
	err := store.read(context.Background(), "read conversation trajectory sequence", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT last_trajectory_sequence
FROM conversations
WHERE id = ?
`, conversationID).Scan(&got)
	})
	if err != nil {
		t.Fatalf("read conversation trajectory sequence: %v", err)
	}
	if got != want {
		t.Fatalf("conversation trajectory sequence = %d, want %d", got, want)
	}
}

func assertTurnOptionalJSONIsNull(t *testing.T, store *Store, turnID string) {
	t.Helper()
	var resolvedIsNull int
	var failureIsNull int
	err := store.read(context.Background(), "read optional turn json", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `
SELECT resolved_invocation_json IS NULL, error_json IS NULL
FROM conversation_turns
WHERE id = ?
`, turnID).Scan(&resolvedIsNull, &failureIsNull)
	})
	if err != nil {
		t.Fatalf("read optional turn json: %v", err)
	}
	if resolvedIsNull != 1 || failureIsNull != 1 {
		t.Fatalf("optional turn JSON null flags = (%d, %d), want (1, 1)", resolvedIsNull, failureIsNull)
	}
}

func assertNarratorCursorAndEventCount(t *testing.T, store *Store, conversationID string, wantCursor int, wantEvents int) {
	t.Helper()
	var cursor int
	var eventCount int
	err := store.read(context.Background(), "read narrator projection", func(ctx context.Context, reader *sql.Conn) error {
		if err := reader.QueryRowContext(ctx, `
SELECT observed_through_sequence
FROM narrator_state
WHERE conversation_id = ?
`, conversationID).Scan(&cursor); err != nil {
			return err
		}
		return reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM narration_events
WHERE conversation_id = ?
`, conversationID).Scan(&eventCount)
	})
	if err != nil {
		t.Fatalf("read narrator projection: %v", err)
	}
	if cursor != wantCursor || eventCount != wantEvents {
		t.Fatalf("narrator projection = cursor %d, events %d; want cursor %d, events %d", cursor, eventCount, wantCursor, wantEvents)
	}
}
