package conversation

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// TestDirectorFolderlessWorkstreamStartsWithoutAFolder proves a folderless
// workstream is created rather than refused. It exists and is selectable; only
// running work needs the folder.
func TestDirectorFolderlessWorkstreamStartsWithoutAFolder(t *testing.T) {
	store, service, _, _ := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-director-folderless",
		Title:          "Summarize the release notes",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	if created.Conversation.WorkspaceID != nil || created.Branch != nil {
		t.Fatalf("folderless root workstream = %+v", created.Conversation)
	}
}

// TestDirectorRenamesAndArchivesAFolderlessWorkstream proves both operations
// are addressed by conversation rather than by workspace. Work the user never
// gave a folder still has a name they read and is still work they can finish
// with, so requiring a workspace would leave exactly that work unmanageable.
func TestDirectorRenamesAndArchivesAFolderlessWorkstream(t *testing.T) {
	store, service, _, _ := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-director-folderless",
		Title:          "Untitled",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}

	renamed, err := service.RenameDirectorWorkstream(
		ctx,
		created.Conversation.ID,
		"Release notes",
	)
	if err != nil {
		t.Fatalf("RenameDirectorWorkstream: %v", err)
	}
	if renamed.Conversation.Title != "Release notes" {
		t.Fatalf("renamed conversation = %+v", renamed.Conversation)
	}
	if renamed.Conversation.UpdatedAt <= created.Conversation.UpdatedAt {
		t.Fatalf("rename did not advance updatedAt: %q", renamed.Conversation.UpdatedAt)
	}

	archived, err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ArchiveDirectorWorkstream: %v", err)
	}
	if archived.Conversation.ArchivedAt == nil {
		t.Fatalf("archived conversation = %+v", archived.Conversation)
	}
	// Archiving twice is the state the caller asked for, so it settles rather
	// than conflicting.
	if _, err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID); err != nil {
		t.Fatalf("archiving an archived workstream: %v", err)
	}
	if _, err := service.RenameDirectorWorkstream(ctx, created.Conversation.ID, "Too late"); err == nil {
		t.Fatal("an archived workstream accepted a rename")
	}
}

// TestDirectorRecoveryRestartsTheFailedTurnsOwnInput proves recovery re-delivers
// the work that failed rather than work the Director re-authored, and that it
// refuses a turn that did not fail.
func TestDirectorRecoveryRestartsTheFailedTurnsOwnInput(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.CreateTopicWithOptionalWorkspace(ctx, &workspaceID, "Data import")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	_, err = service.RecoverDirectorTurn(ctx, workspaceID, created.Conversation.ID, "turn-never-ran", "turn-recovered")
	if err == nil {
		t.Fatal("recovering a missing turn was accepted")
	}

	streamID, err := ConversationStreamID(created.Conversation.ID)
	if err != nil {
		t.Fatalf("ConversationStreamID: %v", err)
	}
	// Keep the manufactured history before the harness clock. Recovery accepts a
	// new turn at the current service time; putting the fixture history in the
	// future would make that new turn the row evicted from the bounded snapshot.
	base := time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC)
	for index := 0; index <= MaxSnapshotTurns; index++ {
		status := TurnStatusCancelled
		if index == 0 {
			status = TurnStatusFailed
		}
		turn := validConversationTurn(status)
		turn.ID = fmt.Sprintf("turn-recovery-history-%03d", index)
		turn.ConversationID = created.Conversation.ID
		turn.AuthoredInput.Text = fmt.Sprintf("historical work %03d", index)
		acceptedAt := base.Add(time.Duration(index) * time.Second).Format(time.RFC3339Nano)
		endedAt := base.Add(time.Duration(index)*time.Second + time.Millisecond).Format(time.RFC3339Nano)
		turn.AcceptedAt = acceptedAt
		turn.EndedAt = &endedAt
		if status == TurnStatusFailed {
			turn.StartedAt = nil
			turn.ResolvedInvocation = nil
			turn.ProviderTurnID = nil
		}
		eventID := fmt.Sprintf("event-recovery-history-%03d", index)
		if _, err := store.Transact(ctx, "append recovery history", func(transaction *WriteTransaction) error {
			if err := transaction.InsertTurn(turn); err != nil {
				return err
			}
			_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
				ID:       eventID,
				StreamID: streamID,
				Kind:     string(ConversationEventTypeTurnUpdated),
				Payload: ConversationTurnUpdatedEventPayload{
					Type: ConversationEventTypeTurnUpdated,
					Turn: turn,
				},
				CommittedAt: endedAt,
			})
			return err
		}); err != nil {
			t.Fatalf("append recovery history %d: %v", index, err)
		}
	}
	bounded, err := store.ReadSnapshot(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	if !bounded.Turns.HasEarlier {
		t.Fatal("recovery fixture did not place the failed turn outside the snapshot window")
	}
	for _, turn := range bounded.Turns.Turns {
		if turn.ID == "turn-recovery-history-000" {
			t.Fatal("failed turn unexpectedly remained in the bounded snapshot")
		}
	}
	if _, err := service.RecoverDirectorTurn(
		ctx,
		workspaceID,
		created.Conversation.ID,
		"turn-recovery-history-000",
		"turn-recovered",
	); err != nil {
		t.Fatalf("RecoverDirectorTurn outside snapshot window: %v", err)
	}
	runtime.waitForStart(t, "historical work 000")
}
