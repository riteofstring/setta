package workspacesession

import (
	"testing"

	"setta/internal/appstate"
	"setta/internal/workspace"
)

func TestOpenAddsActiveWorkspaceSelectsItAndSortsRecent(t *testing.T) {
	session := WorkspaceSession{}
	api := summary("workspace_api", "2026-05-29T20:00:00Z")
	web := summary("workspace_web", "2026-05-29T20:05:00Z")

	if err := session.Open(api); err != nil {
		t.Fatalf("open api: %v", err)
	}
	if err := session.Open(web); err != nil {
		t.Fatalf("open web: %v", err)
	}

	if session.SelectedWorkspaceID != "workspace_web" {
		t.Fatalf("selected = %q, want workspace_web", session.SelectedWorkspaceID)
	}
	assertIDs(t, "active", session.ActiveWorkspaces, []string{"workspace_api", "workspace_web"})
	assertIDs(t, "recent", session.RecentWorkspaces, []string{"workspace_web", "workspace_api"})
}

func TestOpeningActiveWorkspacePreservesOrderAndUpdatesRecent(t *testing.T) {
	session := WorkspaceSession{}
	if err := session.Open(summary("workspace_api", "2026-05-29T20:00:00Z")); err != nil {
		t.Fatalf("open api: %v", err)
	}
	if err := session.Open(summary("workspace_web", "2026-05-29T20:05:00Z")); err != nil {
		t.Fatalf("open web: %v", err)
	}
	if err := session.Open(summary("workspace_api", "2026-05-29T20:10:00Z")); err != nil {
		t.Fatalf("reopen api: %v", err)
	}

	assertIDs(t, "active", session.ActiveWorkspaces, []string{"workspace_api", "workspace_web"})
	assertIDs(t, "recent", session.RecentWorkspaces, []string{"workspace_api", "workspace_web"})
	if session.SelectedWorkspaceID != "workspace_api" {
		t.Fatalf("selected = %q, want workspace_api", session.SelectedWorkspaceID)
	}
}

func TestSelectRequiresActiveWorkspace(t *testing.T) {
	session := WorkspaceSession{ActiveWorkspaces: []workspace.WorkspaceSummary{
		summary("workspace_api", "2026-05-29T20:00:00Z"),
	}}

	if err := session.Select("workspace_api"); err != nil {
		t.Fatalf("select active: %v", err)
	}
	if session.SelectedWorkspaceID != "workspace_api" {
		t.Fatalf("selected = %q, want workspace_api", session.SelectedWorkspaceID)
	}
	if err := session.Select("workspace_web"); err == nil {
		t.Fatal("select inactive succeeded, want error")
	}
}

func TestCloseSelectedWorkspaceChoosesDeterministicNeighbor(t *testing.T) {
	session := WorkspaceSession{
		SelectedWorkspaceID: "workspace_web",
		ActiveWorkspaces: []workspace.WorkspaceSummary{
			summary("workspace_api", "2026-05-29T20:00:00Z"),
			summary("workspace_web", "2026-05-29T20:05:00Z"),
			summary("workspace_docs", "2026-05-29T20:10:00Z"),
		},
	}

	if err := session.Close("workspace_web"); err != nil {
		t.Fatalf("close selected middle: %v", err)
	}
	if session.SelectedWorkspaceID != "workspace_docs" {
		t.Fatalf("selected = %q, want next workspace", session.SelectedWorkspaceID)
	}
	assertIDs(t, "active", session.ActiveWorkspaces, []string{"workspace_api", "workspace_docs"})

	if err := session.Close("workspace_docs"); err != nil {
		t.Fatalf("close selected tail: %v", err)
	}
	if session.SelectedWorkspaceID != "workspace_api" {
		t.Fatalf("selected = %q, want previous workspace", session.SelectedWorkspaceID)
	}

	if err := session.Close("workspace_api"); err != nil {
		t.Fatalf("close last selected: %v", err)
	}
	if session.SelectedWorkspaceID != "" {
		t.Fatalf("selected = %q, want empty", session.SelectedWorkspaceID)
	}
}

func TestCloseUnselectedWorkspaceLeavesSelection(t *testing.T) {
	session := WorkspaceSession{
		SelectedWorkspaceID: "workspace_web",
		ActiveWorkspaces: []workspace.WorkspaceSummary{
			summary("workspace_api", "2026-05-29T20:00:00Z"),
			summary("workspace_web", "2026-05-29T20:05:00Z"),
		},
	}

	if err := session.Close("workspace_api"); err != nil {
		t.Fatalf("close unselected: %v", err)
	}
	if session.SelectedWorkspaceID != "workspace_web" {
		t.Fatalf("selected = %q, want workspace_web", session.SelectedWorkspaceID)
	}
}

func TestReorderActiveWorkspaces(t *testing.T) {
	session := WorkspaceSession{
		SelectedWorkspaceID: "workspace_web",
		ActiveWorkspaces: []workspace.WorkspaceSummary{
			summary("workspace_api", "2026-05-29T20:00:00Z"),
			summary("workspace_web", "2026-05-29T20:05:00Z"),
			summary("workspace_docs", "2026-05-29T20:10:00Z"),
		},
	}

	if err := session.Reorder([]string{"workspace_docs", "workspace_api", "workspace_web"}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	assertIDs(t, "active", session.ActiveWorkspaces, []string{"workspace_docs", "workspace_api", "workspace_web"})
	if session.SelectedWorkspaceID != "workspace_web" {
		t.Fatalf("selected = %q, want unchanged selected", session.SelectedWorkspaceID)
	}
}

func TestReorderRejectsInvalidIDs(t *testing.T) {
	tests := map[string][]string{
		"duplicate": []string{"workspace_api", "workspace_api"},
		"inactive":  []string{"workspace_api", "workspace_docs"},
		"missing":   []string{"workspace_api"},
	}

	for name, ids := range tests {
		t.Run(name, func(t *testing.T) {
			session := WorkspaceSession{ActiveWorkspaces: []workspace.WorkspaceSummary{
				summary("workspace_api", "2026-05-29T20:00:00Z"),
				summary("workspace_web", "2026-05-29T20:05:00Z"),
			}}
			if err := session.Reorder(ids); err == nil {
				t.Fatal("reorder succeeded, want error")
			}
		})
	}
}

func TestFromAppStateRestoresActiveOrderSelectedWorkspaceAndSortedRecents(t *testing.T) {
	state := appstate.State{
		SchemaVersion:       appstate.SchemaVersion,
		SelectedWorkspaceID: "workspace_web",
		ActiveWorkspaceIDs:  []string{"workspace_api", "workspace_web"},
		RecentWorkspaces: []workspace.WorkspaceSummary{
			summary("workspace_api", "2026-05-29T20:00:00Z"),
			summary("workspace_web", "2026-05-29T20:05:00Z"),
			summary("workspace_docs", "2026-05-29T20:10:00Z"),
		},
	}

	session, err := FromAppState(state)
	if err != nil {
		t.Fatalf("from app state: %v", err)
	}

	if session.SelectedWorkspaceID != "workspace_web" {
		t.Fatalf("selected = %q, want workspace_web", session.SelectedWorkspaceID)
	}
	assertIDs(t, "active", session.ActiveWorkspaces, []string{"workspace_api", "workspace_web"})
	assertIDs(t, "recent", session.RecentWorkspaces, []string{"workspace_docs", "workspace_web", "workspace_api"})

	persisted := session.AppState()
	if persisted.SelectedWorkspaceID != "workspace_web" {
		t.Fatalf("persisted selected = %q, want workspace_web", persisted.SelectedWorkspaceID)
	}
	if got := persisted.ActiveWorkspaceIDs; len(got) != 2 || got[0] != "workspace_api" || got[1] != "workspace_web" {
		t.Fatalf("persisted active ids = %#v", got)
	}
}

func TestRemoveRecentRejectsActiveWorkspace(t *testing.T) {
	session := WorkspaceSession{
		ActiveWorkspaces: []workspace.WorkspaceSummary{summary("workspace_api", "2026-05-29T20:00:00Z")},
		RecentWorkspaces: []workspace.WorkspaceSummary{summary("workspace_api", "2026-05-29T20:00:00Z")},
	}

	if err := session.RemoveRecent("workspace_api"); err == nil {
		t.Fatal("remove active recent succeeded, want error")
	}
}

func summary(id string, lastOpenedAt string) workspace.WorkspaceSummary {
	return workspace.WorkspaceSummary{
		ID:           id,
		RootPath:     "/tmp/" + id,
		DisplayName:  id,
		LastOpenedAt: lastOpenedAt,
	}
}

func assertIDs(t *testing.T, label string, summaries []workspace.WorkspaceSummary, want []string) {
	t.Helper()

	if len(summaries) != len(want) {
		t.Fatalf("%s ids length = %d, want %d: %+v", label, len(summaries), len(want), summaries)
	}
	for index, summary := range summaries {
		if summary.ID != want[index] {
			t.Fatalf("%s id[%d] = %q, want %q", label, index, summary.ID, want[index])
		}
	}
}
