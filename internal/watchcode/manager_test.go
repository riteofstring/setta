package watchcode

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestManagerSyncConfigsBuildsSnapshotsAndMatchesInputs(t *testing.T) {
	t.Parallel()

	// Config sync should normalize absolute watch inputs once and reuse them for matching.
	workspaceRoot := t.TempDir()
	scriptsDir := filepath.Join(workspaceRoot, "scripts")
	pkgDir := filepath.Join(workspaceRoot, "pkg")
	nestedDir := filepath.Join(pkgDir, "nested")
	if err := os.MkdirAll(scriptsDir, 0o755); err != nil {
		t.Fatalf("mkdir scripts dir: %v", err)
	}
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir nested dir: %v", err)
	}
	watchFile := filepath.Join(scriptsDir, "watch.py")
	directChild := filepath.Join(pkgDir, "child.py")
	nestedChild := filepath.Join(nestedDir, "child.py")
	for _, path := range []string{watchFile, directChild, nestedChild} {
		if err := os.WriteFile(path, []byte("pass\n"), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Files:   []string{"scripts/watch.py"},
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	snapshots := manager.ConfigSnapshots()
	snapshot, ok := snapshots["project-alpha"]
	if !ok {
		t.Fatalf("expected project snapshot, got %#v", snapshots)
	}
	expectedSnapshot := ConfigSnapshot{
		Enabled: true,
		Files:   []string{watchFile},
		Folders: []FolderInput{{Path: pkgDir, Recursive: false}},
	}
	if !reflect.DeepEqual(snapshot, expectedSnapshot) {
		t.Fatalf("expected snapshot %#v, got %#v", expectedSnapshot, snapshot)
	}
	expectedDesired := map[string]bool{
		scriptsDir: false,
		pkgDir:     false,
	}
	if !reflect.DeepEqual(manager.DesiredWatchDirs(), expectedDesired) {
		t.Fatalf("expected desired watch dirs %#v, got %#v", expectedDesired, manager.DesiredWatchDirs())
	}
	if !reflect.DeepEqual(manager.WatchedDirs(), expectedDesired) {
		t.Fatalf("expected watched dirs %#v, got %#v", expectedDesired, manager.WatchedDirs())
	}
	if manager.PathMatchesWatchInputs("project-alpha", watchFile) != true {
		t.Fatal("expected tracked file to match watch inputs")
	}
	if manager.PathMatchesWatchInputs("project-alpha", directChild) != true {
		t.Fatal("expected direct folder child to match watch inputs")
	}
	if manager.PathMatchesWatchInputs("project-alpha", nestedChild) {
		t.Fatal("expected nested child to miss non-recursive folder inputs")
	}
}

func TestManagerSyncConfigsUpgradesRecursiveFolders(t *testing.T) {
	t.Parallel()

	// Re-syncing the same folder with recursive=true should upgrade the stored watch dir mode.
	workspaceRoot := t.TempDir()
	pkgDir := filepath.Join(workspaceRoot, "pkg")
	nestedDir := filepath.Join(pkgDir, "nested")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir nested dir: %v", err)
	}
	nestedChild := filepath.Join(nestedDir, "child.py")
	if err := os.WriteFile(nestedChild, []byte("pass\n"), 0o644); err != nil {
		t.Fatalf("write nested child: %v", err)
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync non-recursive config: %v", err)
	}
	if recursive := manager.WatchedDirs()[pkgDir]; recursive {
		t.Fatalf("expected initial watch dir to stay non-recursive, got %#v", manager.WatchedDirs())
	}
	if manager.PathMatchesWatchInputs("project-alpha", nestedChild) {
		t.Fatal("expected nested child to miss non-recursive folder")
	}

	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: "pkg", Recursive: true}},
		},
	}); err != nil {
		t.Fatalf("sync recursive config: %v", err)
	}
	if recursive := manager.WatchedDirs()[pkgDir]; !recursive {
		t.Fatalf("expected recursive watch dir, got %#v", manager.WatchedDirs())
	}
	if !manager.PathMatchesWatchInputs("project-alpha", nestedChild) {
		t.Fatal("expected nested child to match recursive folder")
	}
}

func TestManagerSyncConfigsUsesExistingAncestorForMissingDirs(t *testing.T) {
	t.Parallel()

	// Missing watch dirs should watch the nearest existing ancestor until the target directory appears.
	workspaceRoot := t.TempDir()
	missingDir := filepath.Join(workspaceRoot, "future", "watch_root")
	existingAncestor := filepath.Join(workspaceRoot, "future")
	if err := os.MkdirAll(existingAncestor, 0o755); err != nil {
		t.Fatalf("mkdir existing ancestor: %v", err)
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: "future/watch_root", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if !reflect.DeepEqual(manager.PendingDirs(), []string{missingDir}) {
		t.Fatalf("expected pending dir %q, got %#v", missingDir, manager.PendingDirs())
	}
	if !reflect.DeepEqual(manager.WatchedDirs(), map[string]bool{existingAncestor: false}) {
		t.Fatalf("expected ancestor watch dir, got %#v", manager.WatchedDirs())
	}

	if err := os.MkdirAll(missingDir, 0o755); err != nil {
		t.Fatalf("mkdir missing dir: %v", err)
	}
	if err := manager.HandleDirectoryCreated(missingDir); err != nil {
		t.Fatalf("handle directory created: %v", err)
	}

	if pending := manager.PendingDirs(); len(pending) != 0 {
		t.Fatalf("expected no pending dirs after creation, got %#v", pending)
	}
	if !reflect.DeepEqual(manager.WatchedDirs(), map[string]bool{missingDir: false}) {
		t.Fatalf("expected new watch dir after creation, got %#v", manager.WatchedDirs())
	}
}
