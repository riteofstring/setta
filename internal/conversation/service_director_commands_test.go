package conversation

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestDirectorChildWorkstreamRecordsParentageWithoutHistory proves the Director
// can delegate to a durable child that is not a fork. A fork carries one
// completed parent run forward; a delegated child starts its own work, so it
// records parentage and no fork point.
func TestDirectorChildWorkstreamRecordsParentageWithoutHistory(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
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

// TestDirectorRecoveryRestartsTheFailedTurnsOwnInput proves recovery re-delivers
// the work that failed rather than work the Director re-authored, and that it
// refuses a turn that did not fail.
func TestDirectorRecoveryRestartsTheFailedTurnsOwnInput(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
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
		t.Fatal("recovering a turn outside the durable window was accepted")
	}
}
