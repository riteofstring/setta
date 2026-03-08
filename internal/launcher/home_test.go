package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestHomeServiceRecentWorkspaceRoundtrip(t *testing.T) {
	baseRoot := t.TempDir()
	allowedRoot := filepath.Join(baseRoot, "allowed")
	t.Setenv(launcherAllowedRootsEnv, allowedRoot)
	settaHome := filepath.Join(baseRoot, ".setta")
	workspaceRoot := filepath.Join(allowedRoot, "workspace-a")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	currentTime := time.Unix(100, 0).UTC()
	service := NewHomeService(HomeServiceOptions{
		EnvLookup: os.LookupEnv,
		Now: func() time.Time {
			return currentTime
		},
	})

	added, err := service.AddRecentWorkspace(settaHome, workspaceRoot, nil)
	if err != nil {
		t.Fatalf("add recent workspace: %v", err)
	}
	resolvedWorkspaceRoot, err := resolvePathLoose(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}
	if len(added) != 1 {
		t.Fatalf("expected one recent workspace entry, got %#v", added)
	}
	if added[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", resolvedWorkspaceRoot, added[0].WorkspaceRoot)
	}
	if added[0].Pinned {
		t.Fatalf("expected workspace to start unpinned, got %#v", added[0])
	}
	if added[0].LastUsedAt != 100 {
		t.Fatalf("expected last used timestamp 100, got %#v", added[0])
	}

	pinnedEntries, err := service.SetRecentWorkspacePinned(settaHome, workspaceRoot, true)
	if err != nil {
		t.Fatalf("pin recent workspace: %v", err)
	}
	if len(pinnedEntries) != 1 || !pinnedEntries[0].Pinned {
		t.Fatalf("expected pinned recent workspace entry, got %#v", pinnedEntries)
	}
	if pinnedEntries[0].LastUsedAt != 100 {
		t.Fatalf("expected pin update to preserve timestamp 100, got %#v", pinnedEntries[0])
	}

	loaded, err := service.LoadRecentWorkspaces(settaHome)
	if err != nil {
		t.Fatalf("load recent workspaces: %v", err)
	}
	if !reflect.DeepEqual(loaded, pinnedEntries) {
		t.Fatalf("expected loaded recent workspaces %#v, got %#v", pinnedEntries, loaded)
	}

	removed, err := service.RemoveRecentWorkspace(settaHome, workspaceRoot)
	if err != nil {
		t.Fatalf("remove recent workspace: %v", err)
	}
	if len(removed) != 0 {
		t.Fatalf("expected recent workspaces to be empty, got %#v", removed)
	}
}

func TestHomeServiceLoadRecentWorkspacesPrunesOutsideAllowedRoots(t *testing.T) {
	allowedRoot := filepath.Join(t.TempDir(), "allowed")
	blockedRoot := filepath.Join(t.TempDir(), "blocked")
	settaHome := filepath.Join(t.TempDir(), ".setta")
	allowedWorkspace := filepath.Join(allowedRoot, "workspace-ok")
	blockedWorkspace := filepath.Join(blockedRoot, "workspace-stale")
	for _, path := range []string{allowedWorkspace, blockedWorkspace} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir workspace path %q: %v", path, err)
		}
	}

	t.Setenv(launcherAllowedRootsEnv, allowedRoot)
	service := NewHomeService(HomeServiceOptions{
		EnvLookup: os.LookupEnv,
		Now: func() time.Time {
			return time.Unix(100, 0).UTC()
		},
	})

	recentPath := recentWorkspacesPath(settaHome)
	if err := os.MkdirAll(filepath.Dir(recentPath), 0o755); err != nil {
		t.Fatalf("mkdir recent workspaces dir: %v", err)
	}
	if err := os.WriteFile(recentPath, []byte(`[
  {"workspaceRoot":"`+blockedWorkspace+`","pinned":true,"lastUsedAt":9},
  {"workspaceRoot":"`+allowedWorkspace+`","pinned":false,"lastUsedAt":4}
]`), 0o644); err != nil {
		t.Fatalf("write recent workspaces file: %v", err)
	}

	loaded, err := service.LoadRecentWorkspaces(settaHome)
	if err != nil {
		t.Fatalf("load recent workspaces: %v", err)
	}
	resolvedAllowedWorkspace, err := resolvePathLoose(allowedWorkspace)
	if err != nil {
		t.Fatalf("resolve allowed workspace: %v", err)
	}
	expected := []RecentWorkspaceEntry{{
		WorkspaceRoot: resolvedAllowedWorkspace,
		Pinned:        false,
		LastUsedAt:    4,
	}}
	if !reflect.DeepEqual(loaded, expected) {
		t.Fatalf("expected pruned recent workspaces %#v, got %#v", expected, loaded)
	}

	content, err := os.ReadFile(recentPath)
	if err != nil {
		t.Fatalf("read pruned recent workspaces file: %v", err)
	}
	var persisted []RecentWorkspaceEntry
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode pruned recent workspaces file: %v", err)
	}
	if !reflect.DeepEqual(persisted, expected) {
		t.Fatalf("expected persisted recent workspaces %#v, got %#v", expected, persisted)
	}
}

func TestHomeServiceListDirectoryFiltersEscapesBeforeApplyingEntryCapAndSupportsPagination(t *testing.T) {
	allowedRoot := filepath.Join(t.TempDir(), "allowed")
	listedDirectory := filepath.Join(allowedRoot, "listed")
	outsideRoot := filepath.Join(t.TempDir(), "outside")
	for _, path := range []string{listedDirectory, outsideRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir path %q: %v", path, err)
		}
	}

	t.Setenv(launcherAllowedRootsEnv, allowedRoot)
	service := NewHomeService(HomeServiceOptions{
		EnvLookup:           os.LookupEnv,
		MaxDirectoryEntries: 3,
	})

	for _, escapedName := range []string{"a-escape", "b-escape", "c-escape"} {
		target := filepath.Join(outsideRoot, escapedName)
		if err := os.MkdirAll(target, 0o755); err != nil {
			t.Fatalf("mkdir escaped target %q: %v", target, err)
		}
		if err := os.Symlink(target, filepath.Join(listedDirectory, escapedName)); err != nil {
			t.Fatalf("create escaped symlink %q: %v", escapedName, err)
		}
	}
	for _, validName := range []string{"z-valid-1", "z-valid-2", "z-valid-3", "z-valid-4"} {
		if err := os.MkdirAll(filepath.Join(listedDirectory, validName), 0o755); err != nil {
			t.Fatalf("mkdir valid directory %q: %v", validName, err)
		}
	}

	firstPath := listedDirectory
	firstPageSize := 3
	firstPage, err := service.ListDirectory(ListDirectoryInput{
		Path:     &firstPath,
		PageSize: &firstPageSize,
	})
	if err != nil {
		t.Fatalf("list first directory page: %v", err)
	}
	if got := []string{firstPage.Entries[0].Name, firstPage.Entries[1].Name, firstPage.Entries[2].Name}; !reflect.DeepEqual(got, []string{"z-valid-1", "z-valid-2", "z-valid-3"}) {
		t.Fatalf("expected filtered first page entries, got %#v", got)
	}
	if !firstPage.HasMore || firstPage.NextCursor == nil {
		t.Fatalf("expected first page to advertise continuation, got %#v", firstPage)
	}

	secondPage, err := service.ListDirectory(ListDirectoryInput{
		Path:     &firstPath,
		PageSize: &firstPageSize,
		Cursor:   firstPage.NextCursor,
	})
	if err != nil {
		t.Fatalf("list second directory page: %v", err)
	}
	if len(secondPage.Entries) != 1 || secondPage.Entries[0].Name != "z-valid-4" {
		t.Fatalf("expected second page to contain final valid entry, got %#v", secondPage.Entries)
	}
}

func TestHomeServiceListDirectoryReportsExplicitTruncationWhenScanBudgetReached(t *testing.T) {
	allowedRoot := filepath.Join(t.TempDir(), "allowed")
	listedDirectory := filepath.Join(allowedRoot, "listed")
	if err := os.MkdirAll(listedDirectory, 0o755); err != nil {
		t.Fatalf("mkdir listed directory: %v", err)
	}
	for _, name := range []string{"alpha", "beta", "gamma", "delta"} {
		if err := os.MkdirAll(filepath.Join(listedDirectory, name), 0o755); err != nil {
			t.Fatalf("mkdir scan entry %q: %v", name, err)
		}
	}

	t.Setenv(launcherAllowedRootsEnv, allowedRoot)
	service := NewHomeService(HomeServiceOptions{
		EnvLookup:               os.LookupEnv,
		MaxDirectoryScanEntries: 3,
	})

	path := listedDirectory
	pageSize := 2
	cursor := "3"
	listing, err := service.ListDirectory(ListDirectoryInput{
		Path:     &path,
		PageSize: &pageSize,
		Cursor:   &cursor,
	})
	if err != nil {
		t.Fatalf("list truncated directory page: %v", err)
	}
	if len(listing.Entries) != 0 {
		t.Fatalf("expected truncated page to have no entries beyond scan budget, got %#v", listing.Entries)
	}
	if listing.HasMore {
		t.Fatalf("expected truncated page to suppress continuation, got %#v", listing)
	}
	if listing.NextCursor != nil {
		t.Fatalf("expected no continuation cursor on truncated page, got %#v", listing.NextCursor)
	}
	if !listing.Truncated {
		t.Fatalf("expected truncated listing flag, got %#v", listing)
	}
}
