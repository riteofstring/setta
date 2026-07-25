package director

import (
	"testing"

	"setta/internal/conversation"
)

func TestDirectorRecordsRejectBackwardsTimestamps(t *testing.T) {
	resolvedAt := "2026-07-24T11:59:59Z"
	approval := ApprovalRequest{
		ID:             "approval-1",
		WorkstreamID:   testParentWorkstream,
		Kind:           conversation.TrajectoryApprovalKindCommand,
		Status:         ApprovalStatusApproved,
		PublicSummary:  "Run the release command",
		Questions:      []conversation.TrajectoryApprovalQuestion{},
		SourceEventIDs: []string{"event-1"},
		RequestedAt:    "2026-07-24T12:00:00Z",
		ResolvedAt:     &resolvedAt,
	}
	if err := ValidateApprovalRequest(approval); err == nil {
		t.Fatal("an approval resolved before it was requested")
	}

	resource := ResourceRequest{
		ID:             "resource-1",
		WorkstreamID:   testParentWorkstream,
		Kind:           WorkstreamResourceKindFolder,
		Status:         ResourceRequestStatusCancelled,
		PublicSummary:  "Choose a folder",
		SourceEventIDs: []string{"event-1"},
		RequestedAt:    "2026-07-24T12:00:00Z",
		ResolvedAt:     &resolvedAt,
	}
	if err := ValidateResourceRequest(resource); err == nil {
		t.Fatal("a resource request resolved before it was requested")
	}

	artifact := WorkstreamArtifact{
		ID:             "artifact-1",
		WorkstreamID:   testParentWorkstream,
		ConversationID: "conversation-1",
		WorkspaceID:    "workspace-1",
		Kind:           conversation.ArtifactKindMarkdown,
		Status:         ArtifactStatusAvailable,
		Title:          "Release notes",
		SourceEventIDs: []string{"event-1"},
		CreatedAt:      "2026-07-24T12:00:00Z",
		UpdatedAt:      "2026-07-24T11:59:59Z",
	}
	if err := ValidateWorkstreamArtifact(artifact); err == nil {
		t.Fatal("an artifact updated before it was created")
	}

	workstream := testWorkstream(testParentWorkstream)
	workstream.UpdatedAt = "2026-07-24T11:59:59Z"
	if err := ValidateWorkstream(workstream); err == nil {
		t.Fatal("a workstream updated before it was created")
	}
}
