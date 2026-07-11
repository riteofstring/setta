package conversation

import (
	"context"
	"testing"

	"setta/internal/workspaceui/conversationpalette"
)

func TestListNavigatorPageUsesStableKeysetPaginationAndSearch(t *testing.T) {
	store := newTestStore(t)
	insertNavigatorConversation(t, store, navigatorTestConversation(
		"conversation-alpha",
		"Alpha build",
		"frontend navigation",
		"2026-07-11T20:03:00Z",
	), true)
	insertNavigatorConversation(t, store, navigatorTestConversation(
		"conversation-beta",
		"Beta build",
		"backend contracts",
		"2026-07-11T20:03:00Z",
	), true)
	insertNavigatorConversation(t, store, navigatorTestConversation(
		"conversation-gamma",
		"Gamma review",
		"renderer tests",
		"2026-07-11T20:02:00Z",
	), true)
	archived := navigatorTestConversation(
		"conversation-archived",
		"Archived topic",
		"not navigable",
		"2026-07-11T20:04:00Z",
	)
	archivedAt := archived.UpdatedAt
	archived.ArchivedAt = &archivedAt
	insertNavigatorConversation(t, store, archived, true)

	first, err := store.ListNavigatorPage(context.Background(), "workspace-1", "", nil, 2)
	if err != nil {
		t.Fatalf("list first navigator page: %v", err)
	}
	assertNavigatorConversationIDs(t, first.Items, []string{"conversation-alpha", "conversation-beta"})
	if first.NextCursor == nil || first.NextCursor.ConversationID != "conversation-beta" {
		t.Fatalf("first page cursor = %+v, want conversation-beta", first.NextCursor)
	}

	second, err := store.ListNavigatorPage(
		context.Background(),
		"workspace-1",
		"",
		first.NextCursor,
		2,
	)
	if err != nil {
		t.Fatalf("list second navigator page: %v", err)
	}
	assertNavigatorConversationIDs(t, second.Items, []string{"conversation-gamma"})
	if second.NextCursor != nil {
		t.Fatalf("second page cursor = %+v, want nil", second.NextCursor)
	}

	searched, err := store.ListNavigatorPage(
		context.Background(),
		"workspace-1",
		"  CONTRACTS  ",
		nil,
		10,
	)
	if err != nil {
		t.Fatalf("search navigator page: %v", err)
	}
	assertNavigatorConversationIDs(t, searched.Items, []string{"conversation-beta"})
}

func TestListNavigatorPageOrdersCanonicalTimestampsByInstant(t *testing.T) {
	store := newTestStore(t)
	for _, conversation := range []TopicConversation{
		navigatorTestConversation(
			"conversation-whole-second",
			"Whole second",
			"",
			"2026-07-11T20:03:00Z",
		),
		navigatorTestConversation(
			"conversation-one-tenth",
			"One tenth",
			"",
			"2026-07-11T20:03:00.1Z",
		),
		navigatorTestConversation(
			"conversation-eleven-hundredths",
			"Eleven hundredths",
			"",
			"2026-07-11T20:03:00.11Z",
		),
	} {
		insertNavigatorConversation(t, store, conversation, true)
	}

	first, err := store.ListNavigatorPage(context.Background(), "workspace-1", "", nil, 2)
	if err != nil {
		t.Fatalf("list fractional navigator page: %v", err)
	}
	assertNavigatorConversationIDs(t, first.Items, []string{
		"conversation-eleven-hundredths",
		"conversation-one-tenth",
	})
	if first.NextCursor == nil {
		t.Fatal("fractional navigator first page cursor is nil")
	}
	second, err := store.ListNavigatorPage(
		context.Background(),
		"workspace-1",
		"",
		first.NextCursor,
		2,
	)
	if err != nil {
		t.Fatalf("list fractional navigator second page: %v", err)
	}
	assertNavigatorConversationIDs(t, second.Items, []string{"conversation-whole-second"})
}

func TestListNavigatorPageReturnsForkLineageAndPresentationIdentity(t *testing.T) {
	store := newTestStore(t)
	parent := navigatorTestConversation(
		"conversation-parent",
		"Parent topic",
		"",
		"2026-07-11T20:02:00Z",
	)
	child := navigatorTestConversation(
		"conversation-child",
		"Child topic",
		"",
		"2026-07-11T20:03:00Z",
	)
	sourceTurn := validConversationTurn(TurnStatusCompleted)
	sourceTurn.ID = "turn-fork-source"
	sourceTurn.ConversationID = parent.ID
	branch := ConversationBranch{
		ChildConversationID:      child.ID,
		ParentConversationID:     parent.ID,
		Kind:                     BranchKindFork,
		ForkedAtTurnID:           sourceTurn.ID,
		SourceTrajectorySequence: 0,
		ProviderMetadata:         map[string]string{"provider": "codex"},
		CreatedAt:                child.CreatedAt,
	}

	_, err := store.Transact(context.Background(), "seed navigator fork", func(transaction *WriteTransaction) error {
		for _, conversation := range []TopicConversation{parent, child} {
			if err := transaction.InsertConversation(conversation); err != nil {
				return err
			}
			if err := transaction.UpsertConversationPresentationProfile(
				navigatorTestPresentation(conversation.ID, conversation.UpdatedAt),
			); err != nil {
				return err
			}
		}
		if err := transaction.InsertTurn(sourceTurn); err != nil {
			return err
		}
		if err := transaction.InsertConversationBranch(branch); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"navigator-fork-seeded",
			"conversation:"+child.ID,
			branch,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed navigator fork: %v", err)
	}

	page, err := store.ListNavigatorPage(context.Background(), "workspace-1", "Child", nil, 10)
	if err != nil {
		t.Fatalf("list navigator fork: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("navigator fork items = %+v, want one", page.Items)
	}
	item := page.Items[0]
	if item.Branch == nil || item.Branch.ParentConversationID != parent.ID {
		t.Fatalf("navigator branch = %+v, want parent %s", item.Branch, parent.ID)
	}
	if item.PresentationProfile.ResolvedPaletteID != conversationpalette.ConversationPaletteSky {
		t.Fatalf("navigator palette = %q, want sky", item.PresentationProfile.ResolvedPaletteID)
	}
}

func TestListNavigatorPageRejectsConversationWithoutPresentationProfile(t *testing.T) {
	store := newTestStore(t)
	insertNavigatorConversation(t, store, navigatorTestConversation(
		"conversation-missing-profile",
		"Broken topic",
		"",
		"2026-07-11T20:02:00Z",
	), false)

	_, err := store.ListNavigatorPage(context.Background(), "workspace-1", "", nil, 10)
	if !IsCorruptStateError(err) {
		t.Fatalf("missing presentation profile error = %v, want corrupt state", err)
	}
}

func insertNavigatorConversation(
	t *testing.T,
	store *Store,
	conversation TopicConversation,
	includePresentation bool,
) {
	t.Helper()
	_, err := store.Transact(context.Background(), "seed navigator conversation", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		if includePresentation {
			if err := transaction.UpsertConversationPresentationProfile(
				navigatorTestPresentation(conversation.ID, conversation.UpdatedAt),
			); err != nil {
				return err
			}
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"navigator-seeded:"+conversation.ID,
			"conversation:"+conversation.ID,
			conversation,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed navigator conversation %s: %v", conversation.ID, err)
	}
}

func navigatorTestConversation(id string, title string, descriptor string, updatedAt string) TopicConversation {
	return TopicConversation{
		ID:              id,
		WorkspaceID:     "workspace-1",
		Title:           title,
		TopicDescriptor: descriptor,
		Status:          ConversationStatusIdle,
		CreatedAt:       testTimeStarted,
		UpdatedAt:       updatedAt,
	}
}

func navigatorTestPresentation(conversationID string, updatedAt string) ConversationPresentationProfile {
	return ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  PresentationSelectionAutoDistinct,
		ResolvedNarratorVoiceID: stringPointer("alloy"),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               updatedAt,
	}
}

func assertNavigatorConversationIDs(t *testing.T, items []NavigatorItem, want []string) {
	t.Helper()
	got := make([]string, len(items))
	for index, item := range items {
		got[index] = item.Conversation.ID
	}
	if len(got) != len(want) {
		t.Fatalf("navigator ids = %v, want %v", got, want)
	}
	for index := range got {
		if got[index] != want[index] {
			t.Fatalf("navigator ids = %v, want %v", got, want)
		}
	}
}
