package verifier

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestResultDerivesPassFromChecks(t *testing.T) {
	result := NewResult("straightforward-task", []Check{
		{ID: "build", Passed: true, Detail: "Build passed."},
		{ID: "tests", Passed: false, Detail: "Tests failed."},
	}, []string{"src/server.ts"})
	if result.Passed {
		t.Fatal("result passed despite a failed check")
	}
	if err := result.Validate(); err != nil {
		t.Fatalf("validate result: %v", err)
	}

	var output bytes.Buffer
	if err := WriteResult(&output, result); err != nil {
		t.Fatalf("write result: %v", err)
	}
	if !strings.Contains(output.String(), `"passed":false`) {
		t.Fatalf("result output = %s", output.String())
	}
}

func TestWorkspaceSnapshotTracksBytesAndExecutableMode(t *testing.T) {
	baselineRoot := t.TempDir()
	actualRoot := t.TempDir()
	writeVerifierTestFile(t, baselineRoot, "src/server.ts", "baseline\n", 0o600)
	writeVerifierTestFile(t, baselineRoot, "README.md", "same\n", 0o600)
	writeVerifierTestFile(t, actualRoot, "src/server.ts", "changed\n", 0o600)
	writeVerifierTestFile(t, actualRoot, "README.md", "same\n", 0o700)
	writeVerifierTestFile(t, actualRoot, "dist/generated.js", "ignored\n", 0o600)

	options := SnapshotOptions{IgnoredDirectoryNames: []string{"dist"}}
	baseline, err := ReadWorkspace(baselineRoot, options)
	if err != nil {
		t.Fatalf("snapshot baseline: %v", err)
	}
	actual, err := ReadWorkspace(actualRoot, options)
	if err != nil {
		t.Fatalf("snapshot actual: %v", err)
	}
	changed := ChangedFiles(baseline, actual)
	want := []string{"README.md", "src/server.ts"}
	if !reflect.DeepEqual(changed, want) {
		t.Fatalf("changed files = %#v, want %#v", changed, want)
	}
}

func TestWorkspaceSnapshotRejectsSymlinks(t *testing.T) {
	root := t.TempDir()
	if err := os.Symlink("missing", filepath.Join(root, "escape")); err != nil {
		t.Fatalf("create symlink: %v", err)
	}
	if _, err := ReadWorkspace(root, SnapshotOptions{}); err == nil || !strings.Contains(err.Error(), "symbolic link") {
		t.Fatalf("symlink error = %v", err)
	}
}

func writeVerifierTestFile(t *testing.T, root string, relative string, content string, mode os.FileMode) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create parent directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatalf("write fixture file: %v", err)
	}
}
