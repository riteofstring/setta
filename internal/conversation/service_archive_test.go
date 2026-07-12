package conversation

import (
	"context"
	"testing"
	"time"

	"setta/internal/conversationindex"
)

func TestServiceArchivesSettledTopicDurablyAndIdempotently(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := service.CreateTopic(ctx, workspaceID, "Archive lifecycle")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	subscription, err := service.SubscribeEvents(
		created.EventCursor,
		workspaceID,
		created.Conversation.ID,
	)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	defer subscription.Unsubscribe()

	archived, err := service.ArchiveTopic(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ArchiveTopic: %v", err)
	}
	assertConversationArchivedAfter(t, archived, created.Conversation.UpdatedAt)
	if archived.EventCursor.Sequence != created.EventCursor.Sequence+1 {
		t.Fatalf(
			"archive cursor sequence = %d, want %d",
			archived.EventCursor.Sequence,
			created.EventCursor.Sequence+1,
		)
	}
	event := readServiceEvent(t, subscription)
	assertArchiveUpdatedEvent(t, event, archived.Conversation.UpdatedAt)

	page, err := service.ListNavigatorPage(ctx, workspaceID, "", nil, MaxNavigatorPageLimit)
	if err != nil {
		t.Fatalf("ListNavigatorPage: %v", err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("archived navigator page = %+v, want empty", page)
	}
	candidates, err := store.RetrieveTopicCandidates(ctx, conversationindex.CandidateRequest{
		WorkspaceIDs: []string{workspaceID},
		Limit:        10,
	})
	if err != nil {
		t.Fatalf("RetrieveTopicCandidates: %v", err)
	}
	if len(candidates) != 0 {
		t.Fatalf("archived topic candidates = %+v, want empty", candidates)
	}

	repeated, err := service.ArchiveTopic(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("repeat ArchiveTopic: %v", err)
	}
	assertRepeatedArchiveUnchanged(t, repeated, archived)
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "new work"); !IsCommandConflict(err) {
		t.Fatalf("archived SendTurn error = %v, want command conflict", err)
	}

	if err := service.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	defer func() { _ = reopened.Close() }()
	reloaded, err := reopened.ReadSnapshot(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot after reload: %v", err)
	}
	assertReloadedArchive(t, reloaded, archived)
}

func assertConversationArchivedAfter(t *testing.T, snapshot ConversationSnapshot, previousUpdatedAt string) {
	t.Helper()
	if snapshot.Conversation.ArchivedAt == nil ||
		*snapshot.Conversation.ArchivedAt != snapshot.Conversation.UpdatedAt ||
		snapshot.Conversation.UpdatedAt <= previousUpdatedAt {
		t.Fatalf("archived conversation = %+v", snapshot.Conversation)
	}
}

func assertArchiveUpdatedEvent(t *testing.T, event ConversationEvent, archivedAt string) {
	t.Helper()
	payload, ok := event.Payload.(*ConversationUpdatedEventPayload)
	if !ok || payload.Conversation.ArchivedAt == nil || *payload.Conversation.ArchivedAt != archivedAt {
		t.Fatalf("archive event payload = %#v", event.Payload)
	}
}

func assertRepeatedArchiveUnchanged(t *testing.T, repeated ConversationSnapshot, archived ConversationSnapshot) {
	t.Helper()
	if repeated.Conversation.ArchivedAt == nil ||
		*repeated.Conversation.ArchivedAt != *archived.Conversation.ArchivedAt ||
		repeated.EventCursor != archived.EventCursor {
		t.Fatalf("repeated archive changed durable state: first=%+v repeated=%+v", archived, repeated)
	}
}

func assertReloadedArchive(t *testing.T, reloaded ConversationSnapshot, archived ConversationSnapshot) {
	t.Helper()
	if reloaded.Conversation.ArchivedAt == nil ||
		*reloaded.Conversation.ArchivedAt != *archived.Conversation.ArchivedAt {
		t.Fatalf("reloaded archive state = %+v", reloaded.Conversation)
	}
}

func TestServiceRejectsArchiveWhilePrimaryWorkIsActive(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := service.CreateTopic(ctx, workspaceID, "Active archive conflict")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")

	if _, err := service.ArchiveTopic(ctx, workspaceID, created.Conversation.ID); !IsCommandConflict(err) {
		t.Fatalf("active ArchiveTopic error = %v, want command conflict", err)
	}
	if _, err := service.StopTurn(ctx, workspaceID, created.Conversation.ID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
	archived, err := service.ArchiveTopic(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ArchiveTopic after stop: %v", err)
	}
	if archived.Conversation.ArchivedAt == nil {
		t.Fatalf("archive after stop did not set archivedAt: %+v", archived.Conversation)
	}
}
