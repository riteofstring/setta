package conversation

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// TestDirectorChildWorkstreamRecordsParentageWithoutHistory proves the Director
// can delegate to a durable child that is not a fork. A fork carries one
// completed parent run forward; a delegated child starts its own work, so it
// records parentage and no fork point.
func TestDirectorChildWorkstreamRecordsParentageWithoutHistory(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	parent, err := service.CreateTopicWithOptionalWorkspace(ctx, &workspaceID, "Ship the release")
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	child, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID:       "conversation-director-child",
		Title:                "Update the changelog",
		WorkspaceID:          &workspaceID,
		ParentConversationID: parent.Conversation.ID,
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	if child.Branch == nil {
		t.Fatal("a delegated child has no durable parentage")
	}
	if child.Branch.Kind != BranchKindChild ||
		child.Branch.ParentConversationID != parent.Conversation.ID ||
		child.Branch.DecisionSource != BranchDecisionSourceDirector {
		t.Fatalf("child branch = %+v", child.Branch)
	}
	if child.Branch.ForkedAtTurnID != "" {
		t.Fatalf("a delegated child carries fork point %q", child.Branch.ForkedAtTurnID)
	}

	reloaded, err := store.ReadSnapshot(ctx, workspaceID, "conversation-director-child")
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	if reloaded.Branch == nil || reloaded.Branch.Kind != BranchKindChild {
		t.Fatalf("reloaded child branch = %+v", reloaded.Branch)
	}
	page, err := service.ListNavigatorPage(ctx, workspaceID, "Update the changelog", nil, 10)
	if err != nil {
		t.Fatalf("ListNavigatorPage: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Branch == nil ||
		page.Items[0].Branch.Kind != BranchKindChild {
		t.Fatalf("navigator child lineage = %+v", page.Items)
	}
	if _, err := service.SendDirectorTurn(
		ctx,
		workspaceID,
		child.Conversation.ID,
		"first delegated work",
		"turn-director-child-first",
	); err != nil {
		t.Fatalf("SendDirectorTurn: %v", err)
	}
	runtime.waitForStart(t, "first delegated work")
}

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

	_, err = service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID:       "conversation-director-folderless-fork",
		Title:                "Forked draft",
		ParentConversationID: "conversation-director-folderless",
		ForkedAtTurnID:       "turn-missing",
	})
	var resourceRequired *ResourceRequiredError
	if !errors.As(err, &resourceRequired) || resourceRequired.ResourceKind != "folder" {
		t.Fatalf("folderless fork error = %T %v, want folder ResourceRequiredError", err, err)
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

	if err := service.RenameDirectorWorkstream(ctx, created.Conversation.ID, "Release notes"); err != nil {
		t.Fatalf("RenameDirectorWorkstream: %v", err)
	}
	renamed, err := store.ReadSnapshotByID(ctx, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshotByID: %v", err)
	}
	if renamed.Conversation.Title != "Release notes" {
		t.Fatalf("renamed conversation = %+v", renamed.Conversation)
	}
	if renamed.Conversation.UpdatedAt <= created.Conversation.UpdatedAt {
		t.Fatalf("rename did not advance updatedAt: %q", renamed.Conversation.UpdatedAt)
	}

	if err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID); err != nil {
		t.Fatalf("ArchiveDirectorWorkstream: %v", err)
	}
	archived, err := store.ReadSnapshotByID(ctx, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshotByID after archive: %v", err)
	}
	if archived.Conversation.ArchivedAt == nil {
		t.Fatalf("archived conversation = %+v", archived.Conversation)
	}
	// Archiving twice is the state the caller asked for, so it settles rather
	// than conflicting.
	if err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID); err != nil {
		t.Fatalf("archiving an archived workstream: %v", err)
	}
	if err := service.RenameDirectorWorkstream(ctx, created.Conversation.ID, "Too late"); err == nil {
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
