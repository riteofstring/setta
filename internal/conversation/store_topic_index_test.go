package conversation

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"setta/internal/conversationindex"
)

func TestTopicIndexProjectionRollsBackWithAuthoritativeConversation(t *testing.T) {
	store := newTestStore(t)
	conversation := TopicConversation{
		ID:              "conversation-index-rollback",
		WorkspaceID:     "workspace-a",
		Title:           "Rollback topic card",
		TopicDescriptor: "atomic projection",
		Status:          ConversationStatusIdle,
		CreatedAt:       "2026-07-13T18:00:00Z",
		UpdatedAt:       "2026-07-13T18:00:00Z",
	}
	_, err := store.Transact(context.Background(), "reject unpublished indexed topic", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(conversation)
	})
	if !errors.Is(err, ErrCommittedEventRequired) {
		t.Fatalf("unpublished indexed topic error = %v, want ErrCommittedEventRequired", err)
	}
	for _, table := range []string{"conversations", "topic_index_documents", "topic_index_search"} {
		if got := countRows(t, store, table); got != 0 {
			t.Fatalf("%s rows after rollback = %d, want 0", table, got)
		}
	}
}

func TestTopicIndexSearchesAuthoritativeConversationInputsAndNarration(t *testing.T) {
	store := newTestStore(t)
	seed := seedTransactionConversation(t, store)
	input := validConversationInput("input_topic_index")
	input.ConversationID = seed.conversation.ID
	input.Text = strings.Repeat("context ", conversationindex.MaxTopicCardExcerptCharacters) + "nebula routing request"
	input.SubmittedAt = "2026-07-12T18:00:00Z"
	if _, err := store.AcceptConversationInput(context.Background(), input, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}
	appendTopicIndexFinalSummary(t, store, seed, "The aurora release is complete and verified.")
	seedTopicIndexPaneBindings(t, store, seed.conversation, conversationindex.MaxOpenPaneIDs+2)

	requestMatches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "nebula",
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(requestMatches) != 1 {
		t.Fatalf("request matches = %+v, want one", requestMatches)
	}
	card := requestMatches[0].Card
	if len(card.RecentUserRequests) == 0 || !card.RecentUserRequests[0].Truncated ||
		len([]rune(card.RecentUserRequests[0].Text)) != conversationindex.MaxTopicCardExcerptCharacters {
		t.Fatalf("bounded recent requests = %+v", card.RecentUserRequests)
	}
	if card.OpenPaneCount != conversationindex.MaxOpenPaneIDs+2 || len(card.OpenPaneIDs) != conversationindex.MaxOpenPaneIDs {
		t.Fatalf("bounded pane projection = ids=%+v count=%d", card.OpenPaneIDs, card.OpenPaneCount)
	}

	summaryMatches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "aurora",
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(summaryMatches) != 1 || len(summaryMatches[0].Card.RecentFinalSummaries) != 1 ||
		summaryMatches[0].Card.RecentFinalSummaries[0].Text != "The aurora release is complete and verified." {
		t.Fatalf("summary matches = %+v", summaryMatches)
	}
	if summaryMatches[0].LexicalRank == nil {
		t.Fatal("full-text result has no lexical rank")
	}
}

func TestTopicIndexBoundsGlobalRetrievalWithWorkspaceAndRecencyFilters(t *testing.T) {
	store := newTestStore(t)
	older := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-older",
		"workspace-a",
		"Shared retrieval topic",
		"global candidate",
		"2026-07-13T18:00:00Z",
	)
	newer := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-newer",
		"workspace-b",
		"Shared retrieval topic",
		"global candidate",
		"2026-07-13T18:02:00Z",
	)
	archived := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-archived",
		"workspace-b",
		"Shared retrieval topic",
		"global candidate",
		"2026-07-13T18:03:00Z",
	)
	archivedAt := "2026-07-13T18:04:00Z"
	archived.ArchivedAt = &archivedAt
	archived.UpdatedAt = archivedAt
	updateTopicIndexConversation(t, store, archived, "archive-indexed-topic")

	recent := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		WorkspaceIDs: []string{},
		Limit:        1,
	})
	if len(recent) != 1 || recent[0].Card.ConversationID != newer.ID || recent[0].LexicalRank != nil {
		t.Fatalf("bounded recent candidates = %+v", recent)
	}

	workspaceMatches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "retrieval",
		WorkspaceIDs: []string{older.WorkspaceID},
		Limit:        5,
	})
	if len(workspaceMatches) != 1 || workspaceMatches[0].Card.ConversationID != older.ID {
		t.Fatalf("workspace matches = %+v", workspaceMatches)
	}

	updatedSince := "2026-07-13T18:01:00Z"
	recentMatches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "retrieval",
		WorkspaceIDs: []string{},
		UpdatedSince: &updatedSince,
		Limit:        5,
	})
	if len(recentMatches) != 1 || recentMatches[0].Card.ConversationID != newer.ID {
		t.Fatalf("recency matches = %+v", recentMatches)
	}

	punctuationOnly := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "...///",
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(punctuationOnly) != 0 {
		t.Fatalf("punctuation-only matches = %+v, want none", punctuationOnly)
	}
}

func TestTopicIndexReconciliationRestoresDerivedProjection(t *testing.T) {
	store := newTestStore(t)
	conversation := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-reconcile",
		"workspace-a",
		"Original lighthouse topic",
		"navigation",
		"2026-07-13T18:00:00Z",
	)
	if err := store.write(context.Background(), "corrupt derived topic index", func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE topic_index_documents SET title = 'stale projection' WHERE conversation_id = ?`, conversation.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM topic_index_search WHERE conversation_id = ?`, conversation.ID)
		return err
	}); err != nil {
		t.Fatalf("corrupt derived topic index: %v", err)
	}
	if err := store.ReconcileTopicIndex(context.Background()); err != nil {
		t.Fatalf("ReconcileTopicIndex: %v", err)
	}
	matches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "lighthouse",
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(matches) != 1 || matches[0].Card.Title != conversation.Title {
		t.Fatalf("reconciled matches = %+v", matches)
	}
}

func seedTopicIndexConversation(
	t *testing.T,
	store *Store,
	conversationID string,
	workspaceID string,
	title string,
	descriptor string,
	updatedAt string,
) TopicConversation {
	t.Helper()
	conversation := TopicConversation{
		ID:              conversationID,
		WorkspaceID:     workspaceID,
		Title:           title,
		TopicDescriptor: descriptor,
		Status:          ConversationStatusIdle,
		CreatedAt:       "2026-07-13T17:00:00Z",
		UpdatedAt:       updatedAt,
	}
	_, err := store.Transact(context.Background(), "seed indexed topic", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          "indexed-topic-created:" + conversationID,
			StreamID:    "conversation:" + conversationID,
			Kind:        "conversation.updated",
			Payload:     conversation,
			CommittedAt: updatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed indexed topic %s: %v", conversationID, err)
	}
	return conversation
}

func updateTopicIndexConversation(
	t *testing.T,
	store *Store,
	conversation TopicConversation,
	eventID string,
) {
	t.Helper()
	var previousUpdatedAt string
	if err := store.read(context.Background(), "read indexed topic update version", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `SELECT updated_at FROM conversations WHERE id = ?`, conversation.ID).Scan(&previousUpdatedAt)
	}); err != nil {
		t.Fatalf("read indexed topic update version: %v", err)
	}
	_, err := store.Transact(context.Background(), "update indexed topic", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(ConversationExpectation{
			UpdatedAt:              previousUpdatedAt,
			LastTrajectorySequence: conversation.LastTrajectorySequence,
		}, conversation); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          eventID,
			StreamID:    "conversation:" + conversation.ID,
			Kind:        "conversation.updated",
			Payload:     conversation,
			CommittedAt: conversation.UpdatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("update indexed topic: %v", err)
	}
}

func appendTopicIndexFinalSummary(
	t *testing.T,
	store *Store,
	seed transactionSeed,
	text string,
) {
	t.Helper()
	event := baseNarrationEvent(NarrationEventKindFinalSummary)
	event.StreamSequence = 0
	event.ID = "narration-topic-index-final"
	event.ConversationID = seed.conversation.ID
	event.TurnID = &seed.forkSourceTurn.ID
	event.SourceSequenceStart = 1
	event.SourceSequenceEnd = 1
	event.Trigger = NarrationTriggerTurnTerminal
	event.FinalSummary = &NarrationFinalSummary{Text: text}
	event.CreatedAt = "2026-07-12T18:00:02Z"
	_, err := store.Transact(context.Background(), "append indexed final summary", func(transaction *WriteTransaction) error {
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          "indexed-final-summary-created",
			StreamID:    "conversation:" + seed.conversation.ID,
			Kind:        "narration.created",
			Payload:     appended,
			CommittedAt: event.CreatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("append indexed final summary: %v", err)
	}
}

func seedTopicIndexPaneBindings(
	t *testing.T,
	store *Store,
	conversation TopicConversation,
	count int,
) {
	t.Helper()
	if err := store.write(context.Background(), "seed topic index pane bindings", func(ctx context.Context, tx *sql.Tx) error {
		for index := range count {
			paneID := "pane-index-" + string(rune('a'+index))
			if _, err := tx.ExecContext(ctx, `
INSERT INTO pane_bindings (
  pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
) VALUES (?, ?, ?, ?, ?, ?)
`, paneID, conversation.WorkspaceID, conversation.ID, testTimeStarted, testTimeStarted, testTimeStarted); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("seed topic index pane bindings: %v", err)
	}
}

func retrieveTopicCandidates(
	t *testing.T,
	store *Store,
	request conversationindex.CandidateRequest,
) []conversationindex.StoredCandidate {
	t.Helper()
	candidates, err := store.RetrieveTopicCandidates(context.Background(), request)
	if err != nil {
		t.Fatalf("RetrieveTopicCandidates(%+v): %v", request, err)
	}
	return candidates
}
