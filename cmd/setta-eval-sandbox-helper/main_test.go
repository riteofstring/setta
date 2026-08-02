package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
)

func TestInspectWorkspaceRecordsDirectoriesFilesAndPermissionModes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.Chmod(root, 0o751); err != nil {
		t.Fatalf("chmod workspace root: %v", err)
	}
	emptyDirectory := filepath.Join(root, "empty")
	if err := os.Mkdir(emptyDirectory, 0o710); err != nil {
		t.Fatalf("create empty directory: %v", err)
	}
	filePath := filepath.Join(root, "fixture.txt")
	contents := []byte("fixture\n")
	if err := os.WriteFile(filePath, contents, 0o640); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if err := os.Chmod(filePath, 0o640); err != nil {
		t.Fatalf("chmod fixture: %v", err)
	}

	actual, err := inspectWorkspace(root)
	if err != nil {
		t.Fatalf("inspectWorkspace() error = %v", err)
	}
	digest := sha256.Sum256(contents)
	want := workspaceEvidence{Entries: []workspaceEntryEvidence{
		{Path: ".", Kind: "directory", Mode: 0o751},
		{Path: "empty", Kind: "directory", Mode: 0o710},
		{
			Path:   "fixture.txt",
			Kind:   "file",
			Mode:   0o640,
			Bytes:  len(contents),
			SHA256: hex.EncodeToString(digest[:]),
		},
	}}
	if !reflect.DeepEqual(actual, want) {
		t.Fatalf("inspectWorkspace() = %#v, want %#v", actual, want)
	}

	if err := os.Chmod(filePath, 0o600); err != nil {
		t.Fatalf("change fixture mode: %v", err)
	}
	modeChanged, err := inspectWorkspace(root)
	if err != nil {
		t.Fatalf("inspect workspace after mode change: %v", err)
	}
	if reflect.DeepEqual(actual, modeChanged) {
		t.Fatal("workspace snapshot ignored a permission-mode change")
	}
}

func TestInspectWorkspaceRejectsNonRegularEntries(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	linkPath := filepath.Join(root, "outside-link")
	if err := os.Symlink(filepath.Join(root, "missing"), linkPath); err != nil {
		t.Fatalf("create symbolic link: %v", err)
	}
	if _, err := inspectWorkspace(root); err == nil || !strings.Contains(err.Error(), "refuses symlink") {
		t.Fatalf("inspectWorkspace() symlink error = %v", err)
	}
	if err := os.Remove(linkPath); err != nil {
		t.Fatalf("remove symbolic link: %v", err)
	}
	fifoPath := filepath.Join(root, "named-pipe")
	if err := syscall.Mkfifo(fifoPath, 0o600); err != nil {
		t.Fatalf("create named pipe: %v", err)
	}
	if _, err := inspectWorkspace(root); err == nil || !strings.Contains(err.Error(), "non-regular") {
		t.Fatalf("inspectWorkspace() named-pipe error = %v", err)
	}
	if _, err := inspectFile(root, "workspace"); err == nil || !strings.Contains(err.Error(), "regular file") {
		t.Fatalf("inspectFile() directory error = %v", err)
	}
}
