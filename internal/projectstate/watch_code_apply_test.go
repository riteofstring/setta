package projectstate

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/watchcode"
)

func TestRuntimeApplyWatchCodeFileUpdateRenamesMovedRegistryIdentityWithinConfig(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "source.py")
	destPath := filepath.Join(workspaceRoot, "pkg", "dest.py")
	sourceIdentity := "pkg.source.watched:function"
	destIdentity := "pkg.dest.watched:function"
	callable := mustWatchCodeApplyCallable(
		t,
		"def watched(value):\n    return value\n",
		"pkg/source.py",
	)

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFolders: []WatchCodeFolder{{Path: "pkg", Recursive: false}},
				WatchCodeRegistry: map[string]WatchCodeRegistryEntry{
					sourceIdentity: {
						CallableName:  "pkg.source.watched",
						Kind:          WatchCodeCallableKindFunction,
						SignatureHash: callable.SignatureHash,
						BodyHash:      callable.BodyHash,
						SourcePath:    sourcePath,
						SectionIDs:    []string{"section-a"},
						SectionsCount: 1,
					},
				},
				WatchCodeBaselineByPath: map[string][]string{
					sourcePath: {sourceIdentity},
				},
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		destPath,
		"def watched(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("apply watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected move update to change project state")
	}

	project := snapshot.Document.Projects["project-alpha"]
	if _, ok := project.WatchCodeBaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect source baseline to remain after move, got %#v", project.WatchCodeBaselineByPath)
	}
	if got := project.WatchCodeBaselineByPath[destPath]; !reflect.DeepEqual(got, []string{destIdentity}) {
		t.Fatalf("expected destination baseline %#v, got %#v", []string{destIdentity}, got)
	}
	if _, ok := project.WatchCodeRegistry[sourceIdentity]; ok {
		t.Fatalf("did not expect source identity to remain in registry %#v", project.WatchCodeRegistry)
	}
	entry, ok := project.WatchCodeRegistry[destIdentity]
	if !ok {
		t.Fatalf("expected moved identity in registry, got %#v", project.WatchCodeRegistry)
	}
	if entry.SourcePath != destPath {
		t.Fatalf("expected moved entry source path %q, got %q", destPath, entry.SourcePath)
	}
	if !reflect.DeepEqual(entry.SectionIDs, []string{"section-a"}) {
		t.Fatalf("expected moved entry section ids to stay unchanged, got %#v", entry.SectionIDs)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveAcrossConfigsCreatesPlaceholderRegistryEntry(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "source", "moved.py")
	destPath := filepath.Join(workspaceRoot, "dest", "moved.py")
	sourceIdentity := "source.moved.moved:function"
	destIdentity := "dest.moved.moved:function"

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFolders: []WatchCodeFolder{{Path: "source", Recursive: false}},
				WatchCodeRegistry: map[string]WatchCodeRegistryEntry{
					sourceIdentity: {
						CallableName:  "source.moved.moved",
						Kind:          WatchCodeCallableKindFunction,
						SignatureHash: "source-signature",
						BodyHash:      "source-body",
						SourcePath:    sourcePath,
						SectionIDs:    []string{"section-a"},
						SectionsCount: 1,
					},
				},
				WatchCodeBaselineByPath: map[string][]string{
					sourcePath: {sourceIdentity},
				},
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
			"project-beta": {
				ID:               "project-beta",
				Name:             "Beta",
				WatchCodeEnabled: true,
				WatchCodeFolders: []WatchCodeFolder{{Path: "dest", Recursive: false}},
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, didUpdate, err := runtime.ApplyWatchCodeFileDelete(
		context.Background(),
		"project-alpha",
		sourcePath,
		workspaceRoot,
	); err != nil {
		t.Fatalf("apply watch code file delete: %v", err)
	} else if !didUpdate {
		t.Fatal("expected source delete to clear tracked state")
	}

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-beta",
		destPath,
		"def moved(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("apply destination watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected destination update to create a placeholder registry entry")
	}

	sourceProject := snapshot.Document.Projects["project-alpha"]
	if len(sourceProject.WatchCodeRegistry) != 0 {
		t.Fatalf("expected source registry to be cleared, got %#v", sourceProject.WatchCodeRegistry)
	}
	if len(sourceProject.WatchCodeBaselineByPath) != 0 {
		t.Fatalf("expected source baseline to be cleared, got %#v", sourceProject.WatchCodeBaselineByPath)
	}

	destProject := snapshot.Document.Projects["project-beta"]
	entry, ok := destProject.WatchCodeRegistry[destIdentity]
	if !ok {
		t.Fatalf("expected destination registry entry %#v, got %#v", destIdentity, destProject.WatchCodeRegistry)
	}
	if entry.SourcePath != destPath {
		t.Fatalf("expected destination source path %q, got %q", destPath, entry.SourcePath)
	}
	if len(entry.SectionIDs) != 0 || entry.SectionsCount != 0 {
		t.Fatalf("expected placeholder registry entry with no sections, got %#v", entry)
	}
}

func mustWatchCodeApplyCallable(t *testing.T, code string, relativePath string) watchcode.CallableInfo {
	t.Helper()

	callables, parsed, err := watchcode.ParsePythonCallables(code, relativePath)
	if err != nil {
		t.Fatalf("parse watch code callable: %v", err)
	}
	if !parsed {
		t.Fatalf("expected parser success for %q", relativePath)
	}
	if len(callables) != 1 {
		t.Fatalf("expected exactly one callable for %q, got %#v", relativePath, callables)
	}
	return callables[0]
}

func TestRuntimeApplyWatchCodeFileDeleteClearsRegistryAndBaseline(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	identity := "pkg.watched.added:function"

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watched.py"},
				WatchCodeRegistry: map[string]WatchCodeRegistryEntry{
					identity: {
						CallableName:  "pkg.watched.added",
						Kind:          WatchCodeCallableKindFunction,
						SignatureHash: "signature",
						BodyHash:      "body",
						SourcePath:    sourcePath,
					},
				},
				WatchCodeBaselineByPath: map[string][]string{
					sourcePath: {identity},
				},
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileDelete(
		context.Background(),
		"project-alpha",
		sourcePath,
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("apply watch code file delete: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected delete to change project state")
	}

	project := snapshot.Document.Projects["project-alpha"]
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected registry to be empty after delete, got %#v", project.WatchCodeRegistry)
	}
	if len(project.WatchCodeBaselineByPath) != 0 {
		t.Fatalf("expected baseline to be empty after delete, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateSyntaxErrorPreservesProjectState(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	identity := "pkg.watched.watched:function"
	initialDocument := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watched.py"},
				WatchCodeRegistry: map[string]WatchCodeRegistryEntry{
					identity: {
						CallableName:  "pkg.watched.watched",
						Kind:          WatchCodeCallableKindFunction,
						SignatureHash: "signature",
						BodyHash:      "body",
						SourcePath:    sourcePath,
						SectionIDs:    []string{"section-a"},
						SectionsCount: 1,
					},
				},
				WatchCodeBaselineByPath: map[string][]string{
					sourcePath: {identity},
				},
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	runtime, err := OpenOverlayRuntime(initialDocument)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	initialSnapshot := runtime.Snapshot()
	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		sourcePath,
		"def watched(",
		false,
		"",
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("apply invalid watch code file update: %v", err)
	}
	if didUpdate {
		t.Fatal("did not expect syntax error update to mutate project state")
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected revision %d to stay unchanged, got %d", initialSnapshot.Revision, snapshot.Revision)
	}
	if !reflect.DeepEqual(snapshot.Document, initialSnapshot.Document) {
		t.Fatalf("expected syntax error update to preserve document, got %#v", snapshot.Document)
	}
}
