package projectstate

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRuntimeCompareAndSetShowParamDisplayNamesWritesWhenExpectedMatches(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	expectedOldValue := false
	initialSnapshot := runtime.Snapshot()
	snapshot, result, err := runtime.CompareAndSetShowParamDisplayNames(
		context.Background(),
		"project-alpha",
		true,
		&expectedOldValue,
	)
	if err != nil {
		t.Fatalf("CompareAndSetShowParamDisplayNames returned error: %v", err)
	}
	if snapshot.Revision != initialSnapshot.Revision+1 {
		t.Fatalf("expected revision %d after CAS write, got %d", initialSnapshot.Revision+1, snapshot.Revision)
	}
	if result.OldValue {
		t.Fatalf("expected old value false, got %#v", result.OldValue)
	}
	if !result.NewValue {
		t.Fatalf("expected new value true, got %#v", result.NewValue)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after CAS write: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after CAS write")
	}
}

func TestRuntimeCompareAndSetShowParamDisplayNamesRejectsStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	expectedOldValue := true
	snapshot, _, err := runtime.CompareAndSetShowParamDisplayNames(
		context.Background(),
		"project-alpha",
		true,
		&expectedOldValue,
	)
	if !IsExpectedOldValueMismatchError(err) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %v", err)
	}
	if !strings.Contains(err.Error(), "core.project.show_param_display_names changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %q", err.Error())
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected revision %d after CAS mismatch, got %d", initialSnapshot.Revision, snapshot.Revision)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after CAS mismatch: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames to remain false after CAS mismatch")
	}
}

func TestRuntimeCompareAndSetShowParamDisplayNamesNoopIsSideEffectFree(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": layoutPresentationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	snapshot, result, err := runtime.CompareAndSetShowParamDisplayNames(
		context.Background(),
		"project-alpha",
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("CompareAndSetShowParamDisplayNames no-op returned error: %v", err)
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected no-op revision %d, got %d", initialSnapshot.Revision, snapshot.Revision)
	}
	if result.OldValue || result.NewValue {
		t.Fatalf("expected false old/new values for no-op, got %#v", result)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after show-param no-op: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames to remain false after no-op")
	}
}

func TestRuntimeCompareAndSetProjectNameRejectsStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	if _, err := runtime.SetProjectName(context.Background(), "project-alpha", "Alpha Concurrent"); err != nil {
		t.Fatalf("seed concurrent project rename: %v", err)
	}

	expectedOldValue := "Alpha"
	snapshot, _, err := runtime.CompareAndSetProjectName(
		context.Background(),
		"project-alpha",
		"Alpha",
		&expectedOldValue,
	)
	if !IsExpectedOldValueMismatchError(err) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %v", err)
	}
	if !strings.Contains(err.Error(), "core.project.name changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %q", err.Error())
	}
	if snapshot.Revision != initialSnapshot.Revision+1 {
		t.Fatalf("expected revision %d after stale project-name CAS mismatch, got %d", initialSnapshot.Revision+1, snapshot.Revision)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after project-name CAS mismatch: %v", err)
	}
	if project.Name != "Alpha Concurrent" {
		t.Fatalf("expected concurrent project rename to remain, got %q", project.Name)
	}
}

func TestRuntimeCompareAndSetPythonCodegenEnabledRejectsStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	if _, err := runtime.SetProjectCodegenTargets(
		context.Background(),
		"project-alpha",
		[]ProjectCodegenTarget{{Language: string(CodeLanguagePython)}},
		nil,
		PythonCodegenSectionReconcilerFunc(func(context.Context, *Project) error { return nil }),
	); err != nil {
		t.Fatalf("seed concurrent python codegen enablement: %v", err)
	}

	expectedOldValue := false
	snapshot, _, err := runtime.CompareAndSetPythonCodegenEnabled(
		context.Background(),
		"project-alpha",
		false,
		&expectedOldValue,
		nil,
		nil,
	)
	if !IsExpectedOldValueMismatchError(err) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %v", err)
	}
	if !strings.Contains(err.Error(), "core.run_instructions.python_codegen_enabled changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %q", err.Error())
	}
	if snapshot.Revision != initialSnapshot.Revision+1 {
		t.Fatalf("expected revision %d after stale python-codegen CAS mismatch, got %d", initialSnapshot.Revision+1, snapshot.Revision)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after python-codegen CAS mismatch: %v", err)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected concurrent python codegen enablement to remain after CAS mismatch")
	}
}

func TestRuntimeCompareAndSetWatchCodeNoopsAreSideEffectFree(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir existing file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}

	existingBaselineKey := filepath.Clean(existingFile)
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Enabled: true,
		Folders: []WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
		Files: []string{"pkg/existing.py"},
		BaselineByPath: map[string][]string{
			existingBaselineKey: {"pkg.existing.existing:function"},
		},
	})
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	expectedEnabled := true
	enabledSnapshot, enabledResult, err := runtime.CompareAndSetWatchCodeEnabled(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		true,
		workspaceRoot,
		&expectedEnabled,
	)
	if err != nil {
		t.Fatalf("CompareAndSetWatchCodeEnabled returned error: %v", err)
	}
	if enabledSnapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected enabled no-op revision %d, got %d", initialSnapshot.Revision, enabledSnapshot.Revision)
	}
	if !enabledResult.OldValue || !enabledResult.NewValue {
		t.Fatalf("expected enabled old/new true, got %#v", enabledResult)
	}

	foldersSnapshot, foldersResult, err := runtime.CompareAndSetWatchCodeFolders(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]WatchCodeFolder{
			{Path: "pkg", Recursive: true},
			{Path: " pkg ", Recursive: true},
		},
		workspaceRoot,
		[]WatchCodeFolder{{Path: "pkg", Recursive: true}},
	)
	if err != nil {
		t.Fatalf("CompareAndSetWatchCodeFolders returned error: %v", err)
	}
	if foldersSnapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected folders no-op revision %d, got %d", initialSnapshot.Revision, foldersSnapshot.Revision)
	}
	if !reflect.DeepEqual(foldersResult.OldValue, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected old folders unchanged, got %#v", foldersResult.OldValue)
	}
	if !reflect.DeepEqual(foldersResult.NewValue, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected new folders unchanged, got %#v", foldersResult.NewValue)
	}

	filesSnapshot, filesResult, err := runtime.CompareAndSetWatchCodeFiles(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]string{"pkg/existing.py", " pkg/existing.py ", ""},
		workspaceRoot,
		[]string{"pkg/existing.py"},
	)
	if err != nil {
		t.Fatalf("CompareAndSetWatchCodeFiles returned error: %v", err)
	}
	if filesSnapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected files no-op revision %d, got %d", initialSnapshot.Revision, filesSnapshot.Revision)
	}
	if !reflect.DeepEqual(filesResult.OldValue, []string{"pkg/existing.py"}) {
		t.Fatalf("expected old files unchanged, got %#v", filesResult.OldValue)
	}
	if !reflect.DeepEqual(filesResult.NewValue, []string{"pkg/existing.py"}) {
		t.Fatalf("expected new files unchanged, got %#v", filesResult.NewValue)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected watch code to remain enabled after CAS no-ops")
	}
	if !reflect.DeepEqual(projectData.Folders, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected watch code folders unchanged, got %#v", projectData.Folders)
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/existing.py"}) {
		t.Fatalf("expected watch code files unchanged, got %#v", projectData.Files)
	}
	if got := projectData.BaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected watch code baseline unchanged, got %#v", projectData.BaselineByPath)
	}
}

func TestRuntimeCompareAndSetWatchCodeFilesWritesAndBaselinesNewInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFile := filepath.Join(workspaceRoot, "pkg", "new_watch.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir existing file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("class Added:\n    def __init__(self, value):\n        self.value = value\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	existingBaselineKey := filepath.Clean(existingFile)
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Enabled: true,
		Files:   []string{"pkg/existing.py"},
		BaselineByPath: map[string][]string{
			existingBaselineKey: {"pkg.existing.existing:function"},
		},
	})
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	snapshot, result, err := runtime.CompareAndSetWatchCodeFiles(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]string{"pkg/existing.py", "pkg/new_watch.py"},
		workspaceRoot,
		[]string{"pkg/existing.py"},
	)
	if err != nil {
		t.Fatalf("CompareAndSetWatchCodeFiles returned error: %v", err)
	}
	if snapshot.Revision != initialSnapshot.Revision+1 {
		t.Fatalf("expected revision %d after CAS watch-file write, got %d", initialSnapshot.Revision+1, snapshot.Revision)
	}
	if !reflect.DeepEqual(result.OldValue, []string{"pkg/existing.py"}) {
		t.Fatalf("expected old files [pkg/existing.py], got %#v", result.OldValue)
	}
	if !reflect.DeepEqual(result.NewValue, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected new files [pkg/existing.py pkg/new_watch.py], got %#v", result.NewValue)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch code files, got %#v", projectData.Files)
	}
	if got := projectData.BaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline unchanged, got %#v", projectData.BaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	if got := projectData.BaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.new_watch.Added:class_init"}) {
		t.Fatalf("expected new watch-file baseline, got %#v", projectData.BaselineByPath)
	}
}
