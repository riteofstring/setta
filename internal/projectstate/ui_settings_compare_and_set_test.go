package projectstate

import (
	"context"
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
