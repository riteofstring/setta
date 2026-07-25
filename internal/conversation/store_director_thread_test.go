package conversation

import (
	"context"
	"encoding/json"
	"testing"
)

func directorThreadRecordFixture(threadID string) DirectorThreadRecord {
	return DirectorThreadRecord{
		Provider:  ProviderCodex,
		ThreadID:  threadID,
		Model:     "gpt-test",
		StartedAt: "2026-07-25T12:00:00Z",
	}
}

func directorEntryFixture(
	id string,
	kind DirectorConversationEntryKind,
	turnID string,
) DirectorConversationEntry {
	entry := DirectorConversationEntry{
		ID:         id,
		Kind:       kind,
		TurnID:     turnID,
		RecordedAt: "2026-07-25T12:00:01Z",
	}
	switch kind {
	case DirectorConversationUserTurn, DirectorConversationAssistantText:
		entry.Text = &DirectorConversationText{Text: string(kind) + " text"}
	default:
		entry.Tool = &DirectorConversationToolActivity{
			Tool:      "create_workstream",
			Payload:   json.RawMessage(`{"title":"Parser rewrite"}`),
			Succeeded: kind == DirectorConversationToolReceipt,
		}
	}
	return entry
}

// TestDirectorThreadBindingIsReplacedNotAccumulated proves the app profile has
// exactly one Director conversation: rebinding names the provider thread
// carrying it now rather than adding a second one.
func TestDirectorThreadBindingIsReplacedNotAccumulated(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if _, found, err := store.ReadDirectorThread(ctx); err != nil || found {
		t.Fatalf("ReadDirectorThread before binding = %v, %v", found, err)
	}
	if err := store.BindDirectorThread(ctx, directorThreadRecordFixture("thread-1")); err != nil {
		t.Fatalf("BindDirectorThread: %v", err)
	}
	if err := store.BindDirectorThread(ctx, directorThreadRecordFixture("thread-2")); err != nil {
		t.Fatalf("BindDirectorThread again: %v", err)
	}

	record, found, err := store.ReadDirectorThread(ctx)
	if err != nil || !found {
		t.Fatalf("ReadDirectorThread = %v, %v", found, err)
	}
	if record.ThreadID != "thread-2" {
		t.Fatalf("director thread binding = %+v", record)
	}
	if got := countRows(t, store, "director_thread"); got != 1 {
		t.Fatalf("director_thread rows = %d, want 1", got)
	}
}

// TestDirectorConversationReadsTheMostRecentEntriesInOrder proves the history a
// new provider thread is re-established from is the newest slice of the
// conversation, oldest first.
func TestDirectorConversationReadsTheMostRecentEntriesInOrder(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.AppendDirectorConversation(ctx, []DirectorConversationEntry{
		directorEntryFixture("entry-1", DirectorConversationUserTurn, "turn-1"),
		directorEntryFixture("entry-2", DirectorConversationToolCall, "turn-1"),
		directorEntryFixture("entry-3", DirectorConversationToolReceipt, "turn-1"),
		directorEntryFixture("entry-4", DirectorConversationAssistantText, "turn-1"),
	}); err != nil {
		t.Fatalf("AppendDirectorConversation: %v", err)
	}

	recent, err := store.ReadRecentDirectorConversation(ctx, 3)
	if err != nil {
		t.Fatalf("ReadRecentDirectorConversation: %v", err)
	}
	if len(recent) != 3 {
		t.Fatalf("recent director conversation = %+v", recent)
	}
	for index, id := range []string{"entry-2", "entry-3", "entry-4"} {
		if recent[index].ID != id {
			t.Fatalf("recent[%d] = %s, want %s", index, recent[index].ID, id)
		}
	}
	if recent[0].Tool == nil || recent[0].Tool.Succeeded {
		t.Fatalf("a tool call decoded as %+v", recent[0].Tool)
	}
	if recent[1].Tool == nil || !recent[1].Tool.Succeeded {
		t.Fatalf("a tool receipt decoded as %+v", recent[1].Tool)
	}
	if recent[2].Text == nil || recent[2].Text.Text == "" {
		t.Fatalf("an assistant reply decoded as %+v", recent[2].Text)
	}
}

// TestDirectorConversationRejectsMismatchedPayloads proves a durable entry can
// only carry the payload its kind owns.
func TestDirectorConversationRejectsMismatchedPayloads(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	mismatched := directorEntryFixture("entry-1", DirectorConversationUserTurn, "turn-1")
	mismatched.Tool = &DirectorConversationToolActivity{
		Tool:    "create_workstream",
		Payload: json.RawMessage(`{}`),
	}
	if err := store.AppendDirectorConversation(ctx, []DirectorConversationEntry{mismatched}); err == nil {
		t.Fatal("an entry carrying two payloads was made durable")
	}

	claimed := directorEntryFixture("entry-2", DirectorConversationToolCall, "turn-1")
	claimed.Tool.Succeeded = true
	if err := store.AppendDirectorConversation(ctx, []DirectorConversationEntry{claimed}); err == nil {
		t.Fatal("a tool call reported a result it had not produced")
	}

	recent, err := store.ReadRecentDirectorConversation(ctx, 10)
	if err != nil {
		t.Fatalf("ReadRecentDirectorConversation: %v", err)
	}
	if len(recent) != 0 {
		t.Fatalf("rejected entries were made durable: %+v", recent)
	}
}
