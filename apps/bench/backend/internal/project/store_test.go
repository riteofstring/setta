package project

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/setta/bench/backend/internal/contracts"
)

func TestImportValidationFailureDoesNotMutateProject(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	store, err := Open(root, true)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	before, err := store.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() = %v", err)
	}
	bundleRoot := writeBundle(t, "cases", "https://localhost:4173/project")
	_, err = store.Import(contracts.ImportCandidateRequestV1{ProjectID: before.ID, ExpectedRevision: before.Revision, BundleDirectory: bundleRoot})
	if err == nil {
		t.Fatal("Import() succeeded")
	}
	after, err := store.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() = %v", err)
	}
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("project changed after rejected import\nbefore: %#v\nafter: %#v", before, after)
	}
}

func TestReimportReplacesOwnedBundleAndRetainsHistoricalMaterial(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	store, err := Open(root, true)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	initial, _ := store.Snapshot()
	bundleRoot := writeBundle(t, "canvas-candidate", "https://localhost:4173/project")
	first, err := store.Import(contracts.ImportCandidateRequestV1{ProjectID: initial.ID, ExpectedRevision: initial.Revision, BundleDirectory: bundleRoot})
	if err != nil {
		t.Fatalf("first Import() = %v", err)
	}
	firstPath := importedCandidatePath(t, root, first, "canvas-candidate")
	if _, err := os.Stat(firstPath); err != nil {
		t.Fatalf("first imported material = %v", err)
	}
	if err := os.WriteFile(filepath.Join(bundleRoot, "program.py"), []byte("value = 2\n"), 0o600); err != nil {
		t.Fatalf("update bundle = %v", err)
	}
	second, err := store.Import(contracts.ImportCandidateRequestV1{ProjectID: first.ID, ExpectedRevision: first.Revision, BundleDirectory: bundleRoot})
	if err != nil {
		t.Fatalf("second Import() = %v", err)
	}
	secondPath := importedCandidatePath(t, root, second, "canvas-candidate")
	if firstPath == secondPath {
		t.Fatal("reimport reused mutable material")
	}
	if _, err := os.Stat(filepath.Join(firstPath, "program.py")); err != nil {
		t.Fatalf("historical material was removed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(secondPath, "program.py")); err != nil {
		t.Fatalf("replacement material = %v", err)
	}
}

func TestImportReportsInvalidBenchCandidateID(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	store, err := Open(root, true)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	project, _ := store.Snapshot()
	bundleRoot := writeBundle(t, "candidate with spaces", "https://localhost:4173/project")
	_, err = store.Import(contracts.ImportCandidateRequestV1{ProjectID: project.ID, ExpectedRevision: project.Revision, BundleDirectory: bundleRoot})
	if err == nil || !strings.Contains(err.Error(), "Bench id characters") {
		t.Fatalf("Import() error = %v", err)
	}
}

func TestCopyFileMeasuresTheAdmittedBytes(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	destination := filepath.Join(root, "destination")
	if err := os.WriteFile(source, []byte("12345"), 0o600); err != nil {
		t.Fatalf("write source = %v", err)
	}
	if _, err := copyFile(source, destination, 0o600, 4); err == nil {
		t.Fatal("copyFile() accepted more bytes than its limit")
	}
	if _, err := os.Stat(destination); !os.IsNotExist(err) {
		t.Fatalf("rejected destination still exists: %v", err)
	}
}

func TestCopyFileRejectsSymbolicLink(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	target := filepath.Join(root, "target")
	source := filepath.Join(root, "source")
	if err := os.WriteFile(target, []byte("candidate"), 0o600); err != nil {
		t.Fatalf("write target = %v", err)
	}
	if err := os.Symlink(target, source); err != nil {
		t.Skipf("create symbolic link = %v", err)
	}
	if _, err := copyFile(source, filepath.Join(root, "destination"), 0o600, 64); err == nil {
		t.Fatal("copyFile() followed a symbolic link")
	}
}

func writeBundle(t *testing.T, candidateID string, deepLink string) string {
	t.Helper()
	root := t.TempDir()
	bundle := map[string]any{
		"version":   1,
		"source":    map[string]any{"application": "python-canvas", "projectId": "canvas project", "projectRevision": 7, "callableId": "callable / one", "deepLink": deepLink},
		"candidate": map[string]any{"id": candidateID, "name": "Canvas candidate", "command": map[string]any{"argv": []string{"/usr/bin/python3", "candidate.py"}, "workingDirectory": "."}},
	}
	data, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal bundle = %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "bench-candidate.json"), data, 0o600); err != nil {
		t.Fatalf("write manifest = %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "candidate.py"), []byte("print('candidate')\n"), 0o600); err != nil {
		t.Fatalf("write candidate = %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "program.py"), []byte("value = 1\n"), 0o600); err != nil {
		t.Fatalf("write program = %v", err)
	}
	return root
}

func importedCandidatePath(t *testing.T, root string, project contracts.ProjectV1, id string) string {
	t.Helper()
	for _, candidate := range project.Candidates {
		if candidate.ID == id {
			return filepath.Join(root, filepath.FromSlash(candidate.Command.WorkingDirectory))
		}
	}
	t.Fatalf("candidate %q was not imported", id)
	return ""
}
