package watchcode

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestManagerSyncConfigsBuildsSnapshotsAndMatchesInputs(t *testing.T) {
	t.Parallel()

	// Config sync should normalize absolute watch inputs once and preserve the matching shape.
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
			Files:   []string{"scripts/watch.py"},
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	snapshots := manager.configSnapshots
	snapshot, ok := snapshots["project-alpha"]
	if !ok {
		t.Fatalf("expected project snapshot, got %#v", snapshots)
	}
	expectedSnapshot := ConfigSnapshot{
		Files:        []string{watchFile},
		Folders:      []FolderInput{{Path: pkgDir, Recursive: false}},
		IgnoredRoots: []string{},
	}
	if !reflect.DeepEqual(snapshot, expectedSnapshot) {
		t.Fatalf("expected snapshot %#v, got %#v", expectedSnapshot, snapshot)
	}
	if !matchesTrackedPythonPath(watchFile, snapshot) {
		t.Fatal("expected tracked file to match watch inputs")
	}
	if !matchesTrackedPythonPath(directChild, snapshot) {
		t.Fatal("expected direct folder child to match watch inputs")
	}
	if matchesTrackedPythonPath(nestedChild, snapshot) {
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
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync non-recursive config: %v", err)
	}
	initialSnapshot := manager.configSnapshots["project-alpha"]
	if manager.configSnapshots["project-alpha"].Folders[0].Recursive {
		t.Fatalf("expected initial folder to stay non-recursive, got %#v", initialSnapshot.Folders)
	}
	if matchesTrackedPythonPath(nestedChild, initialSnapshot) {
		t.Fatal("expected nested child to miss non-recursive folder")
	}

	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "pkg", Recursive: true}},
		},
	}); err != nil {
		t.Fatalf("sync recursive config: %v", err)
	}
	recursiveSnapshot := manager.configSnapshots["project-alpha"]
	if !recursiveSnapshot.Folders[0].Recursive {
		t.Fatalf("expected recursive folder snapshot, got %#v", recursiveSnapshot.Folders)
	}
	if !matchesTrackedPythonPath(nestedChild, recursiveSnapshot) {
		t.Fatal("expected nested child to match recursive folder")
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
			Folders: []FolderInput{{Path: "current", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync initial config: %v", err)
	}
	snapshot := manager.configSnapshots["project-alpha"]
	manager.scheduleTrackedFileEvent("project-alpha", snapshot, currentFile, EventTypeModified)
	manager.scheduleTrackedFileEvent("project-alpha", snapshot, currentFile, EventTypeDeleted)
	manager.scheduleMoveForSnapshot("project-alpha", snapshot, currentFile, destinationFile)

	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "other", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync replacement config: %v", err)
	}

	if scans := manager.scheduledScans; len(scans) != 0 {
		t.Fatalf("expected stale scans to clear, got %#v", scans)
	}
	if deletes := manager.scheduledDeletes; len(deletes) != 0 {
		t.Fatalf("expected stale deletes to clear, got %#v", deletes)
	}
	if moves := manager.pendingMoves; len(moves) != 0 {
		t.Fatalf("expected stale pending moves to clear, got %#v", moves)
	}
}

func TestManagerHandleFileEventSchedulesScanForMatchingPythonFiles(t *testing.T) {
	t.Parallel()

	// Create and modify events should schedule non-baseline scans for matching Python inputs only.
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
			Files: []string{"pkg/watch.py"},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(watchFile, EventTypeCreated, ""); err != nil {
		t.Fatalf("handle created event: %v", err)
	}
	if err := manager.HandleFileEvent(watchFile, EventTypeModified, ""); err != nil {
		t.Fatalf("handle modified event: %v", err)
	}

	expectedScans := map[taskKey]bool{{
		ConfigID: "project-alpha",
		Path:     watchFile,
	}: false}
	if !reflect.DeepEqual(manager.scheduledScans, expectedScans) {
		t.Fatalf("expected scans %#v, got %#v", expectedScans, manager.scheduledScans)
	}
}

func TestManagerHandleFileEventIgnoresNonPythonAndIgnoredPaths(t *testing.T) {
	t.Parallel()

	// Non-Python files and ignored directories should not schedule watcher work.
	workspaceRoot := t.TempDir()
	trackedDir := filepath.Join(workspaceRoot, "tracked")
	ignoredDir := filepath.Join(workspaceRoot, "node_modules")
	if err := os.MkdirAll(trackedDir, 0o755); err != nil {
		t.Fatalf("mkdir tracked dir: %v", err)
	}
	if err := os.MkdirAll(ignoredDir, 0o755); err != nil {
		t.Fatalf("mkdir ignored dir: %v", err)
	}
	textFile := filepath.Join(trackedDir, "watch.txt")
	ignoredPython := filepath.Join(ignoredDir, "watch.py")
	for _, path := range []string{textFile, ignoredPython} {
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
			Folders: []FolderInput{{Path: ".", Recursive: true}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(textFile, EventTypeModified, ""); err != nil {
		t.Fatalf("handle non-python event: %v", err)
	}
	if err := manager.HandleFileEvent(ignoredPython, EventTypeModified, ""); err != nil {
		t.Fatalf("handle ignored python event: %v", err)
	}

	if scans := manager.scheduledScans; len(scans) != 0 {
		t.Fatalf("expected no scans for ignored inputs, got %#v", scans)
	}
	if deletes := manager.scheduledDeletes; len(deletes) != 0 {
		t.Fatalf("expected no deletes for ignored inputs, got %#v", deletes)
	}
}

func TestManagerHandleFileEventIgnoresEachDocumentedDefaultDirAndKeepsUserRuntimeFolder(t *testing.T) {
	t.Parallel()

	// Runtime events should ignore the documented dirs while still allowing unrelated runtime-named folders.
	workspaceRoot := t.TempDir()
	runtimeDir := filepath.Join(workspaceRoot, "runtime")
	documentedIgnoredDirs := []string{
		"node_modules",
		".venv",
		"setta_files",
		"__pycache__",
	}
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		t.Fatalf("mkdir runtime dir: %v", err)
	}
	for _, dirName := range documentedIgnoredDirs {
		if err := os.MkdirAll(filepath.Join(workspaceRoot, dirName), 0o755); err != nil {
			t.Fatalf("mkdir ignored dir %q: %v", dirName, err)
		}
	}

	runtimeFile := filepath.Join(runtimeDir, "keep.py")
	if err := os.WriteFile(runtimeFile, []byte("pass\n"), 0o644); err != nil {
		t.Fatalf("write runtime file: %v", err)
	}
	ignoredFiles := make([]string, 0, len(documentedIgnoredDirs))
	for _, dirName := range documentedIgnoredDirs {
		ignoredFile := filepath.Join(workspaceRoot, dirName, "ignored.py")
		if err := os.WriteFile(ignoredFile, []byte("pass\n"), 0o644); err != nil {
			t.Fatalf("write ignored file in %q: %v", dirName, err)
		}
		ignoredFiles = append(ignoredFiles, ignoredFile)
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: ".", Recursive: true}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	for _, ignoredFile := range ignoredFiles {
		if err := manager.HandleFileEvent(ignoredFile, EventTypeModified, ""); err != nil {
			t.Fatalf("handle ignored file event for %q: %v", ignoredFile, err)
		}
	}
	if err := manager.HandleFileEvent(runtimeFile, EventTypeModified, ""); err != nil {
		t.Fatalf("handle runtime file event: %v", err)
	}

	expectedScans := map[taskKey]bool{{
		ConfigID: "project-alpha",
		Path:     runtimeFile,
	}: false}
	if !reflect.DeepEqual(manager.scheduledScans, expectedScans) {
		t.Fatalf("expected only runtime folder event to schedule a scan, got %#v", manager.scheduledScans)
	}
	if deletes := manager.scheduledDeletes; len(deletes) != 0 {
		t.Fatalf("expected no deletes for ignored inputs, got %#v", deletes)
	}
}

func TestManagerHandleFileEventIgnoresConfiguredRootsByResolvedPath(t *testing.T) {
	t.Parallel()

	// Runtime events should ignore configured state/runtime roots without suppressing unrelated runtime-named folders.
	workspaceRoot := t.TempDir()
	stateRoot := filepath.Join(workspaceRoot, "custom_state")
	configuredRuntimeRoot := filepath.Join(workspaceRoot, "scratch_runtime")
	userRuntimeDir := filepath.Join(workspaceRoot, "runtime")
	if err := os.MkdirAll(stateRoot, 0o755); err != nil {
		t.Fatalf("mkdir state root: %v", err)
	}
	if err := os.MkdirAll(configuredRuntimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir configured runtime root: %v", err)
	}
	if err := os.MkdirAll(userRuntimeDir, 0o755); err != nil {
		t.Fatalf("mkdir user runtime dir: %v", err)
	}

	stateRootFile := filepath.Join(stateRoot, "ignored.py")
	configuredRuntimeFile := filepath.Join(configuredRuntimeRoot, "ignored.py")
	userRuntimeFile := filepath.Join(userRuntimeDir, "keep.py")
	for _, path := range []string{stateRootFile, configuredRuntimeFile, userRuntimeFile} {
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
			Folders:      []FolderInput{{Path: ".", Recursive: true}},
			IgnoredRoots: []string{stateRoot, configuredRuntimeRoot},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}
	snapshot := manager.configSnapshots["project-alpha"]

	for _, ignoredFile := range []string{stateRootFile, configuredRuntimeFile} {
		if matchesTrackedPythonPath(ignoredFile, snapshot) {
			t.Fatalf("expected ignored root file %q not to match watch inputs", ignoredFile)
		}
		if err := manager.HandleFileEvent(ignoredFile, EventTypeModified, ""); err != nil {
			t.Fatalf("handle ignored file event for %q: %v", ignoredFile, err)
		}
	}
	if !matchesTrackedPythonPath(userRuntimeFile, snapshot) {
		t.Fatalf("expected unrelated runtime file %q to match watch inputs", userRuntimeFile)
	}
	if err := manager.HandleFileEvent(userRuntimeFile, EventTypeModified, ""); err != nil {
		t.Fatalf("handle user runtime file event: %v", err)
	}

	expectedScans := map[taskKey]bool{{
		ConfigID: "project-alpha",
		Path:     userRuntimeFile,
	}: false}
	if !reflect.DeepEqual(manager.scheduledScans, expectedScans) {
		t.Fatalf("expected only user runtime file to schedule a scan, got %#v", manager.scheduledScans)
	}
	if deletes := manager.scheduledDeletes; len(deletes) != 0 {
		t.Fatalf("expected no deletes for ignored-root inputs, got %#v", deletes)
	}
}

func TestManagerHandleFileEventSchedulesDeleteForTrackedDeletes(t *testing.T) {
	t.Parallel()

	// Delete events should queue deletes for matching configs without creating scan work.
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
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(watchFile, EventTypeDeleted, ""); err != nil {
		t.Fatalf("handle delete event: %v", err)
	}

	expectedDeletes := map[taskKey]struct{}{{
		ConfigID: "project-alpha",
		Path:     watchFile,
	}: {}}
	if !reflect.DeepEqual(manager.scheduledDeletes, expectedDeletes) {
		t.Fatalf("expected deletes %#v, got %#v", expectedDeletes, manager.scheduledDeletes)
	}
	if scans := manager.scheduledScans; len(scans) != 0 {
		t.Fatalf("expected no scans for delete event, got %#v", scans)
	}
}

func TestManagerHandleFileEventSchedulesMoveScanForTrackedDestination(t *testing.T) {
	t.Parallel()

	// A move into a tracked destination should record the pending move and queue a scan, not a delete.
	workspaceRoot := t.TempDir()
	trackedDir := filepath.Join(workspaceRoot, "tracked")
	sourceDir := filepath.Join(workspaceRoot, "source")
	if err := os.MkdirAll(trackedDir, 0o755); err != nil {
		t.Fatalf("mkdir tracked dir: %v", err)
	}
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	sourceFile := filepath.Join(sourceDir, "incoming.py")
	destinationFile := filepath.Join(trackedDir, "incoming.py")
	if err := os.WriteFile(sourceFile, []byte("pass\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(destinationFile, []byte("pass\n"), 0o644); err != nil {
		t.Fatalf("write destination file: %v", err)
	}

	manager, err := NewManager(workspaceRoot)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if err := manager.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "tracked", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(sourceFile, EventTypeMoved, destinationFile); err != nil {
		t.Fatalf("handle moved event: %v", err)
	}

	expectedScans := map[taskKey]bool{{
		ConfigID: "project-alpha",
		Path:     destinationFile,
	}: false}
	if !reflect.DeepEqual(manager.scheduledScans, expectedScans) {
		t.Fatalf("expected scans %#v, got %#v", expectedScans, manager.scheduledScans)
	}
	expectedMoves := map[taskKey]string{{
		ConfigID: "project-alpha",
		Path:     destinationFile,
	}: sourceFile}
	if !reflect.DeepEqual(manager.pendingMoves, expectedMoves) {
		t.Fatalf("expected pending moves %#v, got %#v", expectedMoves, manager.pendingMoves)
	}
	if deletes := manager.scheduledDeletes; len(deletes) != 0 {
		t.Fatalf("expected no deletes for tracked move destination, got %#v", deletes)
	}
}

func TestManagerHandleFileEventSchedulesSourceDeleteWhenMoveLeavesTrackedInputs(t *testing.T) {
	t.Parallel()

	// A move out of tracked inputs should queue a delete for the tracked source config.
	workspaceRoot := t.TempDir()
	trackedDir := filepath.Join(workspaceRoot, "tracked")
	untrackedDir := filepath.Join(workspaceRoot, "untracked")
	if err := os.MkdirAll(trackedDir, 0o755); err != nil {
		t.Fatalf("mkdir tracked dir: %v", err)
	}
	if err := os.MkdirAll(untrackedDir, 0o755); err != nil {
		t.Fatalf("mkdir untracked dir: %v", err)
	}
	sourceFile := filepath.Join(trackedDir, "watched.py")
	destinationFile := filepath.Join(untrackedDir, "watched.py")
	for _, path := range []string{sourceFile, destinationFile} {
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
			Folders: []FolderInput{{Path: "tracked", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(sourceFile, EventTypeMoved, destinationFile); err != nil {
		t.Fatalf("handle moved event: %v", err)
	}

	expectedDeletes := map[taskKey]struct{}{{
		ConfigID: "project-alpha",
		Path:     sourceFile,
	}: {}}
	if !reflect.DeepEqual(manager.scheduledDeletes, expectedDeletes) {
		t.Fatalf("expected deletes %#v, got %#v", expectedDeletes, manager.scheduledDeletes)
	}
	if scans := manager.scheduledScans; len(scans) != 0 {
		t.Fatalf("expected no scans for moved-away file, got %#v", scans)
	}
}

func TestManagerHandleFileEventSplitsMoveAcrossConfigs(t *testing.T) {
	t.Parallel()

	// Cross-config moves should delete from the source config and scan in the destination config.
	workspaceRoot := t.TempDir()
	sourceDir := filepath.Join(workspaceRoot, "source")
	destDir := filepath.Join(workspaceRoot, "dest")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatalf("mkdir dest dir: %v", err)
	}
	sourceFile := filepath.Join(sourceDir, "moved.py")
	destinationFile := filepath.Join(destDir, "moved.py")
	for _, path := range []string{sourceFile, destinationFile} {
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
			Folders: []FolderInput{{Path: "source", Recursive: false}},
		},
		"project-beta": {
			Folders: []FolderInput{{Path: "dest", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := manager.HandleFileEvent(sourceFile, EventTypeMoved, destinationFile); err != nil {
		t.Fatalf("handle moved event: %v", err)
	}

	expectedDeletes := map[taskKey]struct{}{{
		ConfigID: "project-alpha",
		Path:     sourceFile,
	}: {}}
	if !reflect.DeepEqual(manager.scheduledDeletes, expectedDeletes) {
		t.Fatalf("expected deletes %#v, got %#v", expectedDeletes, manager.scheduledDeletes)
	}
	expectedScans := map[taskKey]bool{{
		ConfigID: "project-beta",
		Path:     destinationFile,
	}: false}
	if !reflect.DeepEqual(manager.scheduledScans, expectedScans) {
		t.Fatalf("expected scans %#v, got %#v", expectedScans, manager.scheduledScans)
	}
	expectedMoves := map[taskKey]string{{
		ConfigID: "project-beta",
		Path:     destinationFile,
	}: sourceFile}
	if !reflect.DeepEqual(manager.pendingMoves, expectedMoves) {
		t.Fatalf("expected pending moves %#v, got %#v", expectedMoves, manager.pendingMoves)
	}
}
