package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"
)

func TestStoreAcceptsConversationInputIdempotentlyWithCommittedEvent(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_alpha")
	input.Modality = ConversationInputModalityVoice

	accepted, err := store.AcceptConversationInput(
		context.Background(),
		input,
		"2026-07-12T18:00:01Z",
	)
	if err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}
	if accepted.Sequence != 1 || accepted.Status != ConversationInputStatusAccepted ||
		!EqualConversationInputs(accepted.Input, input) {
		t.Fatalf("accepted input = %+v", accepted)
	}

	duplicate, err := store.AcceptConversationInput(
		context.Background(),
		input,
		"2026-07-12T18:00:09Z",
	)
	if err != nil {
		t.Fatalf("duplicate AcceptConversationInput: %v", err)
	}
	if duplicate.AcceptedAt != accepted.AcceptedAt || duplicate.Sequence != accepted.Sequence {
		t.Fatalf("duplicate = %+v, want original %+v", duplicate, accepted)
	}
	if got := countRows(t, store, "conversation_inputs"); got != 1 {
		t.Fatalf("conversation input rows = %d, want 1", got)
	}

	assertConversationInputAcceptedEvent(t, store, input, accepted)

	stored, found, err := store.ReadConversationInput(context.Background(), input.ID)
	if err != nil {
		t.Fatalf("ReadConversationInput: %v", err)
	}
	if !found {
		t.Fatalf("stored input = %+v found=%v", stored, found)
	}
}

func assertConversationInputAcceptedEvent(
	t *testing.T,
	store *Store,
	input ConversationInput,
	accepted AcceptedConversationInput,
) {
	t.Helper()
	streamID, err := ConversationInputStreamID(input.ConversationID)
	if err != nil {
		t.Fatalf("ConversationInputStreamID: %v", err)
	}
	events, err := store.ReadCommittedStreamEvents(context.Background(), streamID, 0, 10)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != 1 || events[0].Kind != ConversationInputAcceptedEventKind {
		t.Fatalf("events = %+v, want one accepted event", events)
	}
	wantEventID, err := ConversationInputAcceptedEventID(input.ID)
	if err != nil {
		t.Fatalf("ConversationInputAcceptedEventID: %v", err)
	}
	if events[0].ID != wantEventID || events[0].CommittedAt != accepted.AcceptedAt {
		t.Fatalf("accepted event = %+v", events[0])
	}
	var eventPayload AcceptedConversationInput
	if err := json.Unmarshal(events[0].Payload, &eventPayload); err != nil {
		t.Fatalf("decode accepted event: %v", err)
	}
	if err := eventPayload.Validate(); err != nil ||
		!EqualConversationInputs(eventPayload.Input, accepted.Input) {
		t.Fatalf("accepted event payload = %+v validation=%v", eventPayload, err)
	}
}

func TestStoreRejectsChangedConversationInputIdempotencyKey(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha", "conversation_beta")
	input := validConversationInput("input_conflict")
	if _, err := store.AcceptConversationInput(context.Background(), input, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*ConversationInput)
	}{
		{name: "text", mutate: func(input *ConversationInput) { input.Text = "Changed request" }},
		{name: "conversation", mutate: func(input *ConversationInput) { input.ConversationID = "conversation_beta" }},
		{name: "modality", mutate: func(input *ConversationInput) { input.Modality = ConversationInputModalityVoice }},
		{name: "submitted timestamp", mutate: func(input *ConversationInput) { input.SubmittedAt = "2026-07-12T18:00:02Z" }},
		{name: "reply target", mutate: func(input *ConversationInput) { replyID := "input_reply"; input.ReplyToInputID = &replyID }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			changed := cloneConversationInput(input)
			test.mutate(&changed)
			_, err := store.AcceptConversationInput(context.Background(), changed, "2026-07-12T18:00:02Z")
			if !IsConversationInputConflict(err) {
				t.Fatalf("changed duplicate error = %T %v, want ConversationInputConflictError", err, err)
			}
		})
	}
	if got := countRows(t, store, "conversation_inputs"); got != 1 {
		t.Fatalf("conversation input rows = %d, want 1", got)
	}
}

func TestStoreSerializesConcurrentDuplicateConversationInputAcceptance(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_concurrent")
	const callers = 24
	results := make(chan error, callers)
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			accepted, err := store.AcceptConversationInput(
				context.Background(),
				input,
				"2026-07-12T18:00:01Z",
			)
			if err == nil && accepted.Sequence != 1 {
				err = errors.New("duplicate acceptance returned a different sequence")
			}
			results <- err
		}()
	}
	wait.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("concurrent acceptance: %v", err)
		}
	}
	if got := countRows(t, store, "conversation_inputs"); got != 1 {
		t.Fatalf("conversation input rows = %d, want 1", got)
	}
	streamID, _ := ConversationInputStreamID(input.ConversationID)
	events, err := store.ReadCommittedStreamEvents(context.Background(), streamID, 0, 10)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("committed input events = %d, want 1", len(events))
	}
}

func TestStoreValidatesConversationInputTargetsAtomically(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha", "conversation_beta")
	parent := validConversationInput("input_parent")
	if _, err := store.AcceptConversationInput(context.Background(), parent, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("accept parent input: %v", err)
	}
	if _, err := store.writer.ExecContext(
		context.Background(),
		`UPDATE conversation_inputs SET status = ?, routing_attempt = 1 WHERE id = ?`,
		ConversationInputStatusAwaitingClarification,
		parent.ID,
	); err != nil {
		t.Fatalf("mark parent awaiting clarification: %v", err)
	}
	child := validConversationInput("input_child")
	child.ReplyToInputID = &parent.ID
	if _, err := store.AcceptConversationInput(context.Background(), child, "2026-07-12T18:00:02Z"); err != nil {
		t.Fatalf("accept linked input: %v", err)
	}

	missingConversation := validConversationInput("input_missing_conversation")
	missingConversation.ConversationID = "conversation_missing"
	if _, err := store.AcceptConversationInput(
		context.Background(),
		missingConversation,
		"2026-07-12T18:00:03Z",
	); !IsConversationNotFound(err) {
		t.Fatalf("missing conversation error = %T %v, want ErrConversationNotFound", err, err)
	}
	missingReplyID := "input_missing"
	missingReply := validConversationInput("input_missing_reply")
	missingReply.ReplyToInputID = &missingReplyID
	if _, err := store.AcceptConversationInput(
		context.Background(),
		missingReply,
		"2026-07-12T18:00:04Z",
	); !IsStateConflict(err) {
		t.Fatalf("missing reply error = %T %v, want StateConflictError", err, err)
	}
	crossConversation := validConversationInput("input_cross_conversation")
	crossConversation.ConversationID = "conversation_beta"
	crossConversation.ReplyToInputID = &parent.ID
	if _, err := store.AcceptConversationInput(
		context.Background(),
		crossConversation,
		"2026-07-12T18:00:05Z",
	); !IsStateConflict(err) {
		t.Fatalf("cross-conversation reply error = %T %v, want StateConflictError", err, err)
	}

	if got := countRows(t, store, "conversation_inputs"); got != 2 {
		t.Fatalf("conversation input rows = %d, want parent and child only", got)
	}
	if got := countRows(t, store, "committed_events"); got != 2 {
		t.Fatalf("committed input events = %d, want parent and child only", got)
	}
}

func TestStoreRollsBackConversationInputWhenCommittedEventFails(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_event_collision")
	eventID, err := ConversationInputAcceptedEventID(input.ID)
	if err != nil {
		t.Fatalf("ConversationInputAcceptedEventID: %v", err)
	}
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(eventID, "test:collision", map[string]string{"state": "existing"}),
	})

	if _, err := store.AcceptConversationInput(
		context.Background(),
		input,
		"2026-07-12T18:00:01Z",
	); err == nil {
		t.Fatal("AcceptConversationInput succeeded despite committed event collision")
	}
	if got := countRows(t, store, "conversation_inputs"); got != 0 {
		t.Fatalf("conversation input rows after event failure = %d, want 0", got)
	}
	if got := countRows(t, store, "committed_events"); got != 1 {
		t.Fatalf("committed events after event failure = %d, want preexisting event", got)
	}
}

func TestStoreReplaysConversationInputAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_restart")
	accepted, err := store.AcceptConversationInput(context.Background(), input, "2026-07-12T18:00:01Z")
	if err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	stored, found, err := reopened.ReadConversationInput(context.Background(), input.ID)
	if err != nil {
		t.Fatalf("ReadConversationInput after restart: %v", err)
	}
	if !found || stored.Sequence != accepted.Sequence || stored.AcceptedAt != accepted.AcceptedAt {
		t.Fatalf("restarted input = %+v found=%v, want %+v", stored, found, accepted)
	}
	duplicate, err := reopened.AcceptConversationInput(context.Background(), input, "2026-07-12T18:01:00Z")
	if err != nil {
		t.Fatalf("retry after restart: %v", err)
	}
	if duplicate.AcceptedAt != accepted.AcceptedAt || duplicate.Sequence != accepted.Sequence {
		t.Fatalf("retry after restart = %+v, want %+v", duplicate, accepted)
	}
	if got := countRows(t, reopened, "committed_events"); got != 1 {
		t.Fatalf("committed events after restart retry = %d, want 1", got)
	}
}

func TestStoreClassifiesMalformedConversationInputAsCorruptState(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_corrupt")
	if _, err := store.AcceptConversationInput(context.Background(), input, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}
	if _, err := store.writer.ExecContext(
		context.Background(),
		`UPDATE conversation_inputs SET input_text = '' WHERE id = ?`,
		input.ID,
	); err != nil {
		t.Fatalf("corrupt conversation input: %v", err)
	}
	_, _, err := store.ReadConversationInput(context.Background(), input.ID)
	if !IsCorruptStateError(err) {
		t.Fatalf("ReadConversationInput error = %T %v, want CorruptStateError", err, err)
	}
}

func seedConversationInputTargets(t *testing.T, store *Store, conversationIDs ...string) {
	t.Helper()
	err := store.write(context.Background(), "seed conversation input targets", func(ctx context.Context, tx *sql.Tx) error {
		for _, conversationID := range conversationIDs {
			if err := insertTestConversation(ctx, tx, conversationID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("seed conversation input targets: %v", err)
	}
}
