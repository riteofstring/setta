package runtime

import (
	"testing"

	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestAvailableDirectorWorkspacesExcludesUnreachableFolders(t *testing.T) {
	session := workspacesession.WorkspaceSession{
		ActiveWorkspaces: []workspace.WorkspaceSummary{
			{ID: "workspace-available", DisplayName: "Available", RootPath: "/tmp/available"},
			{ID: "workspace-missing", DisplayName: "Missing", RootPath: "/tmp/missing"},
		},
		WorkspaceAvailabilities: []workspacesession.WorkspaceAvailability{
			{WorkspaceID: "workspace-available", Available: true},
			{WorkspaceID: "workspace-missing", Available: false, UnavailableReason: "folder is missing"},
		},
	}

	summaries, err := availableDirectorWorkspaces(session)
	if err != nil {
		t.Fatalf("availableDirectorWorkspaces: %v", err)
	}
	if len(summaries) != 1 || summaries[0].ID != "workspace-available" {
		t.Fatalf("available workspaces = %+v", summaries)
	}
}
