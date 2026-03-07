package watchcode

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestBuildTrackedFileSnapshotIgnoresDefaultIgnoredDirs(t *testing.T) {
	t.Parallel()

	// Recursive scans should ignore paths under the default ignored directory set.
	workspaceRoot := t.TempDir()
	projectDir := filepath.Join(workspaceRoot, "project")
	ignoredDir := filepath.Join(projectDir, "node_modules")
	if err := os.MkdirAll(ignoredDir, 0o755); err != nil {
		t.Fatalf("mkdir ignored dir: %v", err)
	}
	trackedFile := filepath.Join(projectDir, "tracked.py")
	ignoredFile := filepath.Join(ignoredDir, "ignored.py")
	for _, path := range []string{trackedFile, ignoredFile} {
		if err := os.WriteFile(path, []byte("print('x')\n"), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	snapshot, err := BuildTrackedFileSnapshot(map[string]ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: projectDir, Recursive: true}},
		},
	})
	if err != nil {
		t.Fatalf("build tracked file snapshot: %v", err)
	}

	if len(snapshot.Files) != 1 {
		t.Fatalf("expected one tracked file, got %#v", snapshot.Files)
	}
	if _, ok := snapshot.Files[trackedFile]; !ok {
		t.Fatalf("expected tracked file %q, got %#v", trackedFile, snapshot.Files)
	}
}

func TestDiffTrackedFileSnapshotsDetectsRenameWithoutHeuristics(t *testing.T) {
	t.Parallel()

	// A path change for the same stable file identity should surface as a move event.
	workspaceRoot := t.TempDir()
	watchDir := filepath.Join(workspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	originalPath := filepath.Join(watchDir, "alpha.py")
	renamedPath := filepath.Join(watchDir, "beta.py")
	if err := os.WriteFile(originalPath, []byte("print('alpha')\n"), 0o644); err != nil {
		t.Fatalf("write original file: %v", err)
	}

	configs := map[string]ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: watchDir, Recursive: false}},
		},
	}
	before, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build pre-rename snapshot: %v", err)
	}
	if err := os.Rename(originalPath, renamedPath); err != nil {
		t.Fatalf("rename file: %v", err)
	}
	after, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build post-rename snapshot: %v", err)
	}

	expected := []SnapshotEvent{{
		Type:            EventTypeMoved,
		Path:            originalPath,
		DestinationPath: renamedPath,
	}}
	if got := DiffTrackedFileSnapshots(before, after); !reflect.DeepEqual(got, expected) {
		t.Fatalf("expected rename events %#v, got %#v", expected, got)
	}
}

func TestDiffTrackedFileSnapshotsDetectsCrossConfigMove(t *testing.T) {
	t.Parallel()

	// A move across watched config roots should still surface as one move event.
	workspaceRoot := t.TempDir()
	sourceDir := filepath.Join(workspaceRoot, "source")
	destDir := filepath.Join(workspaceRoot, "dest")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatalf("mkdir dest dir: %v", err)
	}
	sourcePath := filepath.Join(sourceDir, "moved.py")
	destPath := filepath.Join(destDir, "moved.py")
	if err := os.WriteFile(sourcePath, []byte("print('move')\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	configs := map[string]ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: sourceDir, Recursive: false}},
		},
		"project-beta": {
			Enabled: true,
			Folders: []FolderInput{{Path: destDir, Recursive: false}},
		},
	}
	before, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build pre-move snapshot: %v", err)
	}
	if err := os.Rename(sourcePath, destPath); err != nil {
		t.Fatalf("rename across configs: %v", err)
	}
	after, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build post-move snapshot: %v", err)
	}

	expected := []SnapshotEvent{{
		Type:            EventTypeMoved,
		Path:            sourcePath,
		DestinationPath: destPath,
	}}
	if got := DiffTrackedFileSnapshots(before, after); !reflect.DeepEqual(got, expected) {
		t.Fatalf("expected move events %#v, got %#v", expected, got)
	}
}

func TestDiffTrackedFileSnapshotsDetectsRecursiveAdditionsAndModifications(t *testing.T) {
	t.Parallel()

	// Recursive snapshots should see nested file creation and later content changes.
	workspaceRoot := t.TempDir()
	rootDir := filepath.Join(workspaceRoot, "pkg")
	nestedDir := filepath.Join(rootDir, "nested")
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		t.Fatalf("mkdir root dir: %v", err)
	}

	configs := map[string]ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Folders: []FolderInput{{Path: rootDir, Recursive: true}},
		},
	}
	before, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build initial snapshot: %v", err)
	}
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir nested dir: %v", err)
	}
	nestedPath := filepath.Join(nestedDir, "created.py")
	if err := os.WriteFile(nestedPath, []byte("print('created')\n"), 0o644); err != nil {
		t.Fatalf("write nested file: %v", err)
	}
	createdSnapshot, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build created snapshot: %v", err)
	}

	expectedCreate := []SnapshotEvent{{
		Type: EventTypeCreated,
		Path: nestedPath,
	}}
	if got := DiffTrackedFileSnapshots(before, createdSnapshot); !reflect.DeepEqual(got, expectedCreate) {
		t.Fatalf("expected create events %#v, got %#v", expectedCreate, got)
	}

	if err := os.WriteFile(nestedPath, []byte("print('updated')\n"), 0o644); err != nil {
		t.Fatalf("rewrite nested file: %v", err)
	}
	modifiedSnapshot, err := BuildTrackedFileSnapshot(configs)
	if err != nil {
		t.Fatalf("build modified snapshot: %v", err)
	}

	expectedModify := []SnapshotEvent{{
		Type: EventTypeModified,
		Path: nestedPath,
	}}
	if got := DiffTrackedFileSnapshots(createdSnapshot, modifiedSnapshot); !reflect.DeepEqual(got, expectedModify) {
		t.Fatalf("expected modify events %#v, got %#v", expectedModify, got)
	}
}
