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
	seedTopicIndexPaneBinding(t, store, seed.conversation)

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
	if card.OpenPaneCount != 1 || len(card.OpenPaneIDs) != 1 || card.OpenPaneIDs[0] != "pane-index-a" {
		t.Fatalf("single pane projection = ids=%+v count=%d", card.OpenPaneIDs, card.OpenPaneCount)
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

func TestTopicIndexUsesRoutedTurnIdentityAndPreservesRepeatedRequests(t *testing.T) {
	store := newTestStore(t)
	conversation := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-request-identity",
		"workspace-a",
		"Request identity",
		"explicit routed turn correlation",
		"2026-07-13T18:00:00Z",
	)
	input := validConversationInput("input-topic-index-identity")
	input.ConversationID = conversation.ID
	input.Text = "Investigate the original comet request."
	input.SubmittedAt = "2026-07-13T18:00:01Z"
	accepted, err := store.AcceptConversationInput(context.Background(), input, "2026-07-13T18:00:02Z")
	if err != nil {
		t.Fatalf("AcceptConversationInput: %v", err)
	}
	work, found, err := store.ClaimNextConversationInput(
		context.Background(),
		conversation.ID,
		"2026-07-13T18:00:03Z",
	)
	if err != nil || !found {
		t.Fatalf("ClaimNextConversationInput: found=%v err=%v", found, err)
	}
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		"Agent-normalized nebula objective.",
	)
	commit := validConversationRouteDecisionCommit("decision-topic-index-identity", decision, command)
	commit.ConversationID = conversation.ID
	commit.InputID = input.ID
	commit.RouterContext.InputSequence = accepted.Sequence
	commit.RoutingAttempt = work.RoutingAttempt
	commit.DecidedAt = "2026-07-13T18:00:04Z"
	if _, err := store.CommitConversationRouteDecision(context.Background(), commit); err != nil {
		t.Fatalf("CommitConversationRouteDecision: %v", err)
	}

	appendTopicIndexTurns(t, store, conversation.ID, []ConversationTurn{
		topicIndexQueuedTurn(
			command.SendToParent.TurnID,
			conversation.ID,
			command.SendToParent.AuthoredInput.Text,
			"2026-07-13T18:00:05Z",
		),
		topicIndexQueuedTurn(
			"turn-topic-index-repeat-a",
			conversation.ID,
			"Repeat this exact solar request.",
			"2026-07-13T18:00:06Z",
		),
		topicIndexQueuedTurn(
			"turn-topic-index-repeat-b",
			conversation.ID,
			"Repeat this exact solar request.",
			"2026-07-13T18:00:07Z",
		),
	})

	rewrittenMatches := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		Query:        "nebula",
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(rewrittenMatches) != 0 {
		t.Fatalf("routed agent rewrite leaked into recent user requests: %+v", rewrittenMatches)
	}
	recent := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(recent) != 1 {
		t.Fatalf("recent candidates = %+v, want one", recent)
	}
	requests := recent[0].Card.RecentUserRequests
	if len(requests) != 3 ||
		requests[0].Text != "Repeat this exact solar request." ||
		requests[1].Text != "Repeat this exact solar request." ||
		requests[2].Text != input.Text {
		t.Fatalf("recent user requests = %+v", requests)
	}
}

func TestTopicIndexReportsSingleOpenPane(t *testing.T) {
	store := newTestStore(t)
	conversation := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-pane-order",
		"workspace-a",
		"Pane order",
		"fractional timestamp ordering",
		"2026-07-13T18:00:00Z",
	)
	if err := store.write(context.Background(), "seed focused topic index pane", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO pane_bindings (
  pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
) VALUES (?, ?, ?, ?, ?, ?)
`, "pane-focused", conversation.WorkspaceID, conversation.ID, testTimeStarted, "2026-07-13T18:01:00.1Z", "2026-07-13T18:01:00.1Z")
		return err
	}); err != nil {
		t.Fatalf("seed focused topic index pane: %v", err)
	}

	candidates := retrieveTopicCandidates(t, store, conversationindex.CandidateRequest{
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if len(candidates) != 1 {
		t.Fatalf("pane candidates = %+v, want one", candidates)
	}
	card := candidates[0].Card
	if card.OpenPaneCount != 1 || len(card.OpenPaneIDs) != 1 ||
		card.OpenPaneIDs[0] != "pane-focused" {
		t.Fatalf("single focused pane projection = ids=%+v count=%d", card.OpenPaneIDs, card.OpenPaneCount)
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

func TestTopicIndexRetrievalReportsMalformedProjection(t *testing.T) {
	store := newTestStore(t)
	conversation := seedTopicIndexConversation(
		t,
		store,
		"conversation-index-corrupt",
		"workspace-a",
		"Corrupt projection",
		"typed corruption reporting",
		"2026-07-13T18:00:00Z",
	)
	if err := store.write(context.Background(), "corrupt topic index card", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE topic_index_documents SET title = '' WHERE conversation_id = ?`, conversation.ID)
		return err
	}); err != nil {
		t.Fatalf("corrupt topic index card: %v", err)
	}
	_, err := store.RetrieveTopicCandidates(context.Background(), conversationindex.CandidateRequest{
		WorkspaceIDs: []string{},
		Limit:        5,
	})
	if !IsCorruptStateError(err) {
		t.Fatalf("malformed topic index error = %T %v, want CorruptStateError", err, err)
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

func appendTopicIndexTurns(
	t *testing.T,
	store *Store,
	conversationID string,
	turns []ConversationTurn,
) {
	t.Helper()
	_, err := store.Transact(context.Background(), "append indexed turns", func(transaction *WriteTransaction) error {
		for _, turn := range turns {
			if err := transaction.InsertTurn(turn); err != nil {
				return err
			}
		}
		_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          "indexed-turns-created:" + conversationID,
			StreamID:    "conversation:" + conversationID,
			Kind:        "conversation.turns_created",
			Payload:     turns,
			CommittedAt: "2026-07-13T18:00:08Z",
		})
		return err
	})
	if err != nil {
		t.Fatalf("append indexed turns: %v", err)
	}
}

func topicIndexQueuedTurn(
	turnID string,
	conversationID string,
	text string,
	acceptedAt string,
) ConversationTurn {
	turn := validConversationTurn(TurnStatusQueued)
	turn.ID = turnID
	turn.ConversationID = conversationID
	turn.AuthoredInput.Text = text
	turn.AcceptedAt = acceptedAt
	return turn
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

func seedTopicIndexPaneBinding(
	t *testing.T,
	store *Store,
	conversation TopicConversation,
) {
	t.Helper()
	if err := store.write(context.Background(), "seed topic index pane binding", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO pane_bindings (
  pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
) VALUES (?, ?, ?, ?, ?, ?)
`, "pane-index-a", conversation.WorkspaceID, conversation.ID, testTimeStarted, testTimeStarted, testTimeStarted)
		return err
	}); err != nil {
		t.Fatalf("seed topic index pane binding: %v", err)
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
