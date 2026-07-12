package workspacesession

import (
	"os"
	"path/filepath"
	"strings"
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
	apiSummary, _, err := service.OpenLocalFolder(apiRoot)
	if err != nil {
		t.Fatalf("open api: %v", err)
	}
	webSummary, _, err := service.OpenLocalFolder(webRoot)
	if err != nil {
		t.Fatalf("open web: %v", err)
	}
	if _, err := service.Reorder([]string{webSummary.ID, apiSummary.ID}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	if _, err := service.Select(apiSummary.ID); err != nil {
		t.Fatalf("select api: %v", err)
	}

	restartedManager, err := workspace.NewManager(filepath.Dir(appStore.Path()))
	if err != nil {
		t.Fatalf("new restarted manager: %v", err)
	}
	restarted, err := NewService(appStore, restartedManager)
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	session := restarted.Session()

	if session.SelectedWorkspaceID != apiSummary.ID {
		t.Fatalf("selected after restart = %q, want %s", session.SelectedWorkspaceID, apiSummary.ID)
	}
	assertIDs(t, "active after restart", session.ActiveWorkspaces, []string{webSummary.ID, apiSummary.ID})
	assertIDs(t, "recent after restart", session.RecentWorkspaces, []string{webSummary.ID, apiSummary.ID})
}

func TestServiceCloseKeepsWorkspaceInRecents(t *testing.T) {
	appStore := newTestStore(t)
	service := newTestService(t, appStore, []string{"workspace_api"}, []time.Time{mustTime(t, "2026-05-29T20:00:00Z")})
	summary, _, err := service.OpenLocalFolder(t.TempDir())
	if err != nil {
		t.Fatalf("open api: %v", err)
	}

	session, err := service.Close(summary.ID)
	if err != nil {
		t.Fatalf("close api: %v", err)
	}
	if len(session.ActiveWorkspaces) != 0 {
		t.Fatalf("active = %+v, want none", session.ActiveWorkspaces)
	}
	assertIDs(t, "recent", session.RecentWorkspaces, []string{summary.ID})
}

func TestServiceResolveWorkspaceRejectsMissingRoot(t *testing.T) {
	appStore := newTestStore(t)
	service := newTestService(t, appStore, []string{"workspace_api"}, []time.Time{mustTime(t, "2026-05-29T20:00:00Z")})
	rootPath := t.TempDir()
	summary, _, err := service.OpenLocalFolder(rootPath)
	if err != nil {
		t.Fatalf("open api: %v", err)
	}
	if err := os.RemoveAll(rootPath); err != nil {
		t.Fatalf("remove root: %v", err)
	}

	if _, err := service.ResolveWorkspace(summary.ID); err == nil {
		t.Fatal("resolve workspace succeeded, want missing root error")
	}
	refreshed, err := service.RefreshAvailability(summary.ID)
	if err != nil {
		t.Fatalf("refresh workspace availability: %v", err)
	}
	availability, err := refreshed.Availability(summary.ID)
	if err != nil {
		t.Fatalf("read workspace availability: %v", err)
	}
	if availability.Available || !strings.Contains(availability.UnavailableReason, "does not exist") {
		t.Fatalf("availability = %+v, want unavailable missing path", availability)
	}
}

func TestServiceRelocatePreservesWorkspaceAndMakesItAvailable(t *testing.T) {
	appStore := newTestStore(t)
	service := newTestService(t, appStore, nil, []time.Time{
		mustTime(t, "2026-05-29T20:00:00Z"),
		mustTime(t, "2026-05-29T20:05:00Z"),
		mustTime(t, "2026-05-29T20:10:00Z"),
	})
	originalRoot := t.TempDir()
	summary, _, err := service.OpenLocalFolder(originalRoot)
	if err != nil {
		t.Fatalf("open original: %v", err)
	}
	if err := os.RemoveAll(originalRoot); err != nil {
		t.Fatalf("remove original root: %v", err)
	}
	replacementRoot := t.TempDir()

	relocated, session, err := service.Relocate(summary.ID, replacementRoot)
	if err != nil {
		t.Fatalf("relocate workspace: %v", err)
	}
	if relocated.ID != summary.ID || session.SelectedWorkspaceID != summary.ID {
		t.Fatalf("relocated workspace = %+v session = %+v, want stable selected id %s", relocated, session, summary.ID)
	}
	availability, err := session.Availability(summary.ID)
	if err != nil || !availability.Available {
		t.Fatalf("availability = %+v err=%v, want available", availability, err)
	}

	reopened, _, err := service.OpenLocalFolder(replacementRoot)
	if err != nil {
		t.Fatalf("reopen relocated root: %v", err)
	}
	if reopened.ID != summary.ID {
		t.Fatalf("reopened id = %s, want preserved %s", reopened.ID, summary.ID)
	}
}

func TestServiceResolveActiveWorkspaceRejectsClosedRecentWorkspace(t *testing.T) {
	appStore := newTestStore(t)
	service := newTestService(t, appStore, []string{"workspace_api"}, []time.Time{mustTime(t, "2026-05-29T20:00:00Z")})
	summary, _, err := service.OpenLocalFolder(t.TempDir())
	if err != nil {
		t.Fatalf("open api: %v", err)
	}
	if resolved, err := service.ResolveActiveWorkspace(summary.ID); err != nil || resolved.ID != summary.ID {
		t.Fatalf("resolve active workspace = %+v err=%v", resolved, err)
	}
	if _, err := service.Close(summary.ID); err != nil {
		t.Fatalf("close api: %v", err)
	}
	if resolved, err := service.ResolveWorkspace(summary.ID); err != nil || resolved.ID != summary.ID {
		t.Fatalf("resolve recent workspace = %+v err=%v", resolved, err)
	}
	if _, err := service.ResolveActiveWorkspace(summary.ID); err == nil || !strings.Contains(err.Error(), "workspace is not active") {
		t.Fatalf("resolve closed active workspace error = %v", err)
	}
}

func newTestStore(t *testing.T) *appstate.Store {
	t.Helper()

	store, err := appstate.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	return store
}

func newTestService(t *testing.T, store *appstate.Store, _ []string, times []time.Time) *Service {
	t.Helper()

	timeIndex := 0
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			value := times[timeIndex]
			timeIndex++
			return value
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
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
