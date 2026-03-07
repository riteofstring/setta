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

func TestManagerScheduleScanKeepsBroaderNonBaselineRequests(t *testing.T) {
	t.Parallel()

	// Re-scheduling the same scan should retain a non-baseline request once one has been queued.
	workspaceRoot := t.TempDir()
	watchDir := filepath.Join(workspaceRoot, "pkg")
	watchFile := filepath.Join(watchDir, "watch.py")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("pass\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Files:   []string{"pkg/watch.py"},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}
	if err := manager.ScheduleScan("project-alpha", watchFile, true); err != nil {
		t.Fatalf("schedule baseline scan: %v", err)
	}
	if err := manager.ScheduleScan("project-alpha", watchFile, false); err != nil {
		t.Fatalf("schedule full scan: %v", err)
	}
	if err := manager.ScheduleScan("project-alpha", watchFile, true); err != nil {
		t.Fatalf("schedule later baseline scan: %v", err)
	}

	expected := []ScanRequest{{
		ConfigID:     "project-alpha",
		Path:         watchFile,
		BaselineOnly: false,
	}}
	if !reflect.DeepEqual(manager.ScheduledScans(), expected) {
		t.Fatalf("expected scheduled scans %#v, got %#v", expected, manager.ScheduledScans())
	}
}

func TestManagerSyncConfigsDropsStaleScheduledState(t *testing.T) {
	t.Parallel()

	// Config re-sync should clear scheduled scans, deletes, and moves that no longer match enabled inputs.
	workspaceRoot := t.TempDir()
	currentDir := filepath.Join(workspaceRoot, "current")
	otherDir := filepath.Join(workspaceRoot, "other")
	if err := os.MkdirAll(currentDir, 0o755); err != nil {
		t.Fatalf("mkdir current dir: %v", err)
	}
	if err := os.MkdirAll(otherDir, 0o755); err != nil {
		t.Fatalf("mkdir other dir: %v", err)
	}
	currentFile := filepath.Join(currentDir, "watch.py")
	destinationFile := filepath.Join(currentDir, "moved.py")
	for _, path := range []string{currentFile, destinationFile} {
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
			Folders: []FolderInput{{Path: "current", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync initial config: %v", err)
	}
	if err := manager.ScheduleScan("project-alpha", currentFile, false); err != nil {
		t.Fatalf("schedule scan: %v", err)
	}
	if err := manager.ScheduleDelete("project-alpha", currentFile); err != nil {
		t.Fatalf("schedule delete: %v", err)
	}
	if err := manager.RecordPendingMove("project-alpha", destinationFile, currentFile); err != nil {
		t.Fatalf("record pending move: %v", err)
	}

	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: "other", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync replacement config: %v", err)
	}

	if scans := manager.ScheduledScans(); len(scans) != 0 {
		t.Fatalf("expected stale scans to clear, got %#v", scans)
	}
	if deletes := manager.ScheduledDeletes(); len(deletes) != 0 {
		t.Fatalf("expected stale deletes to clear, got %#v", deletes)
	}
	if moves := manager.PendingMoves(); len(moves) != 0 {
		t.Fatalf("expected stale pending moves to clear, got %#v", moves)
	}
}

func TestManagerScheduleDeleteAndMoveIgnoreUnmatchedInputs(t *testing.T) {
	t.Parallel()

	// Scheduling helpers should ignore paths that no longer belong to enabled watch inputs.
	workspaceRoot := t.TempDir()
	trackedDir := filepath.Join(workspaceRoot, "tracked")
	untrackedDir := filepath.Join(workspaceRoot, "untracked")
	if err := os.MkdirAll(trackedDir, 0o755); err != nil {
		t.Fatalf("mkdir tracked dir: %v", err)
	}
	if err := os.MkdirAll(untrackedDir, 0o755); err != nil {
		t.Fatalf("mkdir untracked dir: %v", err)
	}
	trackedFile := filepath.Join(trackedDir, "watch.py")
	untrackedFile := filepath.Join(untrackedDir, "watch.py")
	for _, path := range []string{trackedFile, untrackedFile} {
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
			Folders: []FolderInput{{Path: "tracked", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}
	if err := manager.ScheduleDelete("project-alpha", untrackedFile); err != nil {
		t.Fatalf("schedule unmatched delete: %v", err)
	}
	if err := manager.RecordPendingMove("project-alpha", untrackedFile, trackedFile); err != nil {
		t.Fatalf("record unmatched pending move: %v", err)
	}

	if deletes := manager.ScheduledDeletes(); len(deletes) != 0 {
		t.Fatalf("expected no deletes for unmatched path, got %#v", deletes)
	}
	if moves := manager.PendingMoves(); len(moves) != 0 {
		t.Fatalf("expected no pending moves for unmatched destination, got %#v", moves)
	}
}
