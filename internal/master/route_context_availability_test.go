package master

import (
	"testing"

	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestRouteWorkspaceContextsExcludeUnavailableWorkspaces(t *testing.T) {
	session := workspacesession.WorkspaceSession{
		ActiveWorkspaces: []workspace.WorkspaceSummary{
			{ID: "workspace_available", DisplayName: "Available"},
			{ID: "workspace_missing", DisplayName: "Missing"},
		},
		WorkspaceAvailabilities: []workspacesession.WorkspaceAvailability{
			{WorkspaceID: "workspace_available", Available: true},
			{WorkspaceID: "workspace_missing", Available: false, UnavailableReason: "missing"},
		},
	}

	contexts, ids, err := routeWorkspaceContexts(session)
	if err != nil {
		t.Fatalf("route workspace contexts: %v", err)
	}
	if len(contexts) != 1 || contexts[0].WorkspaceID != "workspace_available" {
		t.Fatalf("contexts = %+v, want only available workspace", contexts)
	}
	if len(ids) != 1 || ids[0] != "workspace_available" {
		t.Fatalf("ids = %+v, want only available workspace", ids)
	}
}
