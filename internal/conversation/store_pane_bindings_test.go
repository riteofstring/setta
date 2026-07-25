package conversation

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestStoreReplacesWorkspacePaneBindingsAndPreservesFocusHistory(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha", "conversation_beta")

	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{{
			PaneID:         "pane_alpha",
			ConversationID: "conversation_alpha",
			Focused:        true,
		}},
		"2026-07-13T18:00:00Z",
	); err != nil {
		t.Fatalf("replace initial pane bindings: %v", err)
	}
	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{
			{
				PaneID:         "pane_alpha",
				ConversationID: "conversation_alpha",
			},
			{
				PaneID:         "pane_beta",
				ConversationID: "conversation_beta",
				Focused:        true,
			},
		},
		"2026-07-13T18:01:00Z",
	); err != nil {
		t.Fatalf("replace expanded pane bindings: %v", err)
	}

	assertStoredWorkspacePaneBinding(t, store, storedWorkspacePaneBinding{
		paneID:         "pane_alpha",
		conversationID: "conversation_alpha",
		createdAt:      "2026-07-13T18:00:00Z",
		updatedAt:      "2026-07-13T18:01:00Z",
		lastFocusedAt:  sql.NullString{String: "2026-07-13T18:00:00Z", Valid: true},
	})
	assertStoredWorkspacePaneBinding(t, store, storedWorkspacePaneBinding{
		paneID:         "pane_beta",
		conversationID: "conversation_beta",
		createdAt:      "2026-07-13T18:01:00Z",
		updatedAt:      "2026-07-13T18:01:00Z",
		lastFocusedAt:  sql.NullString{String: "2026-07-13T18:01:00Z", Valid: true},
	})

	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{{
			PaneID:         "pane_beta",
			ConversationID: "conversation_beta",
		}},
		"2026-07-13T18:02:00Z",
	); err != nil {
		t.Fatalf("replace reduced pane bindings: %v", err)
	}
	if count := countWorkspacePaneBindings(t, store, "pane_alpha"); count != 0 {
		t.Fatalf("stale pane binding count = %d, want 0", count)
	}
	assertStoredWorkspacePaneBinding(t, store, storedWorkspacePaneBinding{
		paneID:         "pane_beta",
		conversationID: "conversation_beta",
		createdAt:      "2026-07-13T18:01:00Z",
		updatedAt:      "2026-07-13T18:02:00Z",
		lastFocusedAt:  sql.NullString{String: "2026-07-13T18:01:00Z", Valid: true},
	})
}

func TestStoreRejectsWorkspacePaneBindingForAnotherWorkspace(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")

	err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace_other",
		[]WorkspacePaneBinding{{
			PaneID:         "pane_alpha",
			ConversationID: "conversation_alpha",
		}},
		"2026-07-13T18:00:00Z",
	)
	if !IsStateConflict(err) {
		t.Fatalf("replace mismatched pane binding error = %T %v, want state conflict", err, err)
	}
}

func TestStoreRejectsDuplicateConversationPaneBindings(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")

	err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{
			{PaneID: "pane_alpha", ConversationID: "conversation_alpha"},
			{PaneID: "pane_alpha_second", ConversationID: "conversation_alpha"},
		},
		"2026-07-13T18:00:00Z",
	)
	if err == nil || !strings.Contains(err.Error(), "bound to multiple panes") {
		t.Fatalf("duplicate conversation pane binding error = %T %v, want duplicate binding", err, err)
	}
}

func TestStoreRejectsPaneBindingWhenPresentationNarratorStateIsMissing(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-missing-narrator")
	presentation := navigatorTestPresentation(conversation.ID, conversation.UpdatedAt)
	_, err := store.Transact(context.Background(), "seed incomplete presentation activity", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"incomplete-presentation-activity",
			"conversation:"+conversation.ID,
			conversation,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed incomplete presentation activity: %v", err)
	}

	err = store.ReplaceWorkspacePaneBindings(
		context.Background(),
		*conversation.WorkspaceID,
		[]WorkspacePaneBinding{{
			PaneID:         "pane-missing-narrator",
			ConversationID: conversation.ID,
		}},
		"2026-07-13T18:00:00Z",
	)
	if !IsCorruptStateError(err) {
		t.Fatalf("missing narrator state error = %T %v, want CorruptStateError", err, err)
	}
	if count := countWorkspacePaneBindings(t, store, "pane-missing-narrator"); count != 0 {
		t.Fatalf("pane binding count after corrupt activity read = %d, want 0", count)
	}
}

func TestStoreResetsPaneBindingHistoryWhenPaneIsRebound(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha", "conversation_beta")

	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{{
			PaneID:         "pane_reused",
			ConversationID: "conversation_alpha",
			Focused:        true,
		}},
		"2026-07-13T18:00:00Z",
	); err != nil {
		t.Fatalf("replace original pane binding: %v", err)
	}
	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace",
		[]WorkspacePaneBinding{{
			PaneID:         "pane_reused",
			ConversationID: "conversation_beta",
		}},
		"2026-07-13T18:01:00Z",
	); err != nil {
		t.Fatalf("replace rebound pane binding: %v", err)
	}

	assertStoredWorkspacePaneBinding(t, store, storedWorkspacePaneBinding{
		paneID:         "pane_reused",
		conversationID: "conversation_beta",
		createdAt:      "2026-07-13T18:01:00Z",
		updatedAt:      "2026-07-13T18:01:00Z",
		lastFocusedAt:  sql.NullString{},
	})
}

type storedWorkspacePaneBinding struct {
	paneID         string
	conversationID string
	createdAt      string
	updatedAt      string
	lastFocusedAt  sql.NullString
}

func assertStoredWorkspacePaneBinding(
	t *testing.T,
	store *Store,
	want storedWorkspacePaneBinding,
) {
	t.Helper()
	var got storedWorkspacePaneBinding
	err := store.read(context.Background(), "read test workspace pane binding", func(
		ctx context.Context,
		connection *sql.Conn,
	) error {
		return connection.QueryRowContext(ctx, `
SELECT pane_id, conversation_id, created_at, updated_at, last_focused_at
FROM pane_bindings
WHERE pane_id = ?
`, want.paneID).Scan(
			&got.paneID,
			&got.conversationID,
			&got.createdAt,
			&got.updatedAt,
			&got.lastFocusedAt,
		)
	})
	if err != nil {
		t.Fatalf("read pane binding %s: %v", want.paneID, err)
	}
	if got != want {
		t.Fatalf("pane binding = %+v, want %+v", got, want)
	}
}

func countWorkspacePaneBindings(t *testing.T, store *Store, paneID string) int {
	t.Helper()
	var count int
	err := store.read(context.Background(), "count test workspace pane binding", func(
		ctx context.Context,
		connection *sql.Conn,
	) error {
		return connection.QueryRowContext(
			ctx,
			`SELECT COUNT(*) FROM pane_bindings WHERE pane_id = ?`,
			paneID,
		).Scan(&count)
	})
	if err != nil {
		t.Fatalf("count pane binding %s: %v", paneID, err)
	}
	return count
}
