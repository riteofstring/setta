package workspacesession

import (
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/workspace"
)

func TestServicePersistsWorkspaceSessionAcrossRestart(t *testing.T) {
	appStore := newTestStore(t)
	apiRoot := t.TempDir()
	webRoot := t.TempDir()

	service := newTestService(t, appStore, []string{"workspace_api", "workspace_web"}, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
		mustTime(t, "2026-05-29T20:05:00Z"),
	})
	if _, _, err := service.OpenLocalFolder(apiRoot); err != nil {
		t.Fatalf("open api: %v", err)
	}
	if _, _, err := service.OpenLocalFolder(webRoot); err != nil {
		t.Fatalf("open web: %v", err)
	}
	if _, err := service.Reorder([]string{"workspace_web", "workspace_api"}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	if _, err := service.Select("workspace_api"); err != nil {
		t.Fatalf("select api: %v", err)
	}

	restarted, err := NewService(appStore, workspace.NewManager())
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	session := restarted.Session()

	if session.SelectedWorkspaceID != "workspace_api" {
		t.Fatalf("selected after restart = %q, want workspace_api", session.SelectedWorkspaceID)
	}
	assertIDs(t, "active after restart", session.ActiveWorkspaces, []string{"workspace_web", "workspace_api"})
	assertIDs(t, "recent after restart", session.RecentWorkspaces, []string{"workspace_web", "workspace_api"})
}

func TestServiceCloseKeepsWorkspaceInRecents(t *testing.T) {
	appStore := newTestStore(t)
	service := newTestService(t, appStore, []string{"workspace_api"}, []time.Time{mustTime(t, "2026-05-29T20:00:00Z")})
	if _, _, err := service.OpenLocalFolder(t.TempDir()); err != nil {
		t.Fatalf("open api: %v", err)
	}

	session, err := service.Close("workspace_api")
	if err != nil {
		t.Fatalf("close api: %v", err)
	}
	if len(session.ActiveWorkspaces) != 0 {
		t.Fatalf("active = %+v, want none", session.ActiveWorkspaces)
	}
	assertIDs(t, "recent", session.RecentWorkspaces, []string{"workspace_api"})
}

func newTestStore(t *testing.T) *appstate.Store {
	t.Helper()

	store, err := appstate.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	return store
}

func newTestService(t *testing.T, store *appstate.Store, ids []string, times []time.Time) *Service {
	t.Helper()

	idIndex := 0
	timeIndex := 0
	manager := workspace.NewManager(
		workspace.WithIDGenerator(func() (string, error) {
			id := ids[idIndex]
			idIndex++
			return id, nil
		}),
		workspace.WithClock(func() time.Time {
			value := times[timeIndex]
			timeIndex++
			return value
		}),
	)
	service, err := NewService(store, manager)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}
