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

	project := callableTestProject(t)
	project.WatchCodeEnabled = true
	project.WatchCodeFolders = []WatchCodeFolder{{Path: "pkg", Recursive: false}}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.source import watched\n"}`),
		},
	}
	project.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{
		sourceIdentity: {
			CallableName:  "watched",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: callable.SignatureHash,
			BodyHash:      callable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	project.WatchCodeBaselineByPath = map[string][]string{
		sourcePath: {sourceIdentity},
	}
	callableCodeObj := project.CodeObjs["callable-1"]
	callableCodeObj.Name = "watched"
	project.CodeObjs["callable-1"] = callableCodeObj

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
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
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected move update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
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
	if !reflect.DeepEqual(entry.SectionIDs, []string{"callable-section"}) {
		t.Fatalf("expected moved entry section ids to stay unchanged, got %#v", entry.SectionIDs)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveAcrossConfigsBackfillsCallableSection(t *testing.T) {
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
		nil,
	)
	if err != nil {
		t.Fatalf("apply destination watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected destination update to backfill a callable section")
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
	if entry.CallableName != "moved" {
		t.Fatalf("expected destination callable name moved, got %#v", entry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected destination registry entry with one section, got %#v", entry)
	}
	sectionPayload, err := currentCallablePayloadForWatchCodeTest(destProject, entry.SectionIDs[0])
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected moved section callable binding, got %#v", sectionPayload)
	}
	if got := destProject.CodeObjs[callableID].Name; got != "moved" {
		t.Fatalf("expected moved callable object name moved, got %q", got)
	}
	target, ok, err := destProject.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected destination python target")
	}
	if target.GenCodePrefix != "from dest.moved import moved\n" {
		t.Fatalf("expected destination import prefix to be updated, got %q", target.GenCodePrefix)
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
		nil,
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

func TestRuntimeApplyWatchCodeFileUpdateRenamePreservesSectionIDsAndParams(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	originalCallable := mustWatchCodeApplyCallable(
		t,
		"def original(value):\n    return value + 1\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	project.WatchCodeEnabled = true
	project.WatchCodeFiles = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.watched import original\n"}`),
		},
	}
	project.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.original:function": {
			CallableName:  "original",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: originalCallable.SignatureHash,
			BodyHash:      originalCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	project.WatchCodeBaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.original:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
	}
	callable := project.CodeObjs["callable-2"]
	callable.Name = "original"
	project.CodeObjs["callable-2"] = callable

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
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
		sourcePath,
		"def renamed(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code rename: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected rename update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	if _, ok := project.WatchCodeRegistry["pkg.watched.original:function"]; ok {
		t.Fatalf("did not expect original identity to remain: %#v", project.WatchCodeRegistry)
	}
	entry, ok := project.WatchCodeRegistry["pkg.watched.renamed:function"]
	if !ok {
		t.Fatalf("expected renamed identity in registry, got %#v", project.WatchCodeRegistry)
	}
	if !reflect.DeepEqual(entry.SectionIDs, []string{"callable-section"}) {
		t.Fatalf("expected renamed section ids to stay unchanged, got %#v", entry.SectionIDs)
	}
	callable = project.CodeObjs["callable-2"]
	if callable.Name != "renamed" {
		t.Fatalf("expected callable object name renamed, got %#v", callable)
	}
	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", payloadStringField(payload, "callable"))
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"param-existing"}) {
		t.Fatalf("expected param ids to stay unchanged, got %#v", got)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "from pkg.watched import renamed\n" {
		t.Fatalf("expected renamed import prefix, got %q", target.GenCodePrefix)
	}
}

func TestRuntimeApplyWatchCodeFileDeleteRemovesCallableSectionAndCodeObjects(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	project := callableTestProject(t)
	project.WatchCodeEnabled = true
	project.WatchCodeFiles = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.watched import existing_callable\n"}`),
		},
	}
	project.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.existing_callable:function": {
			CallableName:  "existing_callable",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: "signature",
			BodyHash:      "body",
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	project.WatchCodeBaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.existing_callable:function"},
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
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
		t.Fatalf("apply watch code delete: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected delete update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected empty watch code registry, got %#v", project.WatchCodeRegistry)
	}
	if len(project.WatchCodeBaselineByPath) != 0 {
		t.Fatalf("expected empty baseline, got %#v", project.WatchCodeBaselineByPath)
	}
	if _, ok := project.Sections["callable-section"]; ok {
		t.Fatalf("did not expect callable section to remain, got %#v", project.Sections)
	}
	if _, ok := project.CodeObjs["callable-1"]; ok {
		t.Fatalf("did not expect callable code object to remain, got %#v", project.CodeObjs)
	}
	if _, ok := project.CodeObjs["param-existing"]; ok {
		t.Fatalf("did not expect callable param to remain, got %#v", project.CodeObjs)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "" {
		t.Fatalf("expected watch code import prefix to be removed, got %q", target.GenCodePrefix)
	}
}

func currentCallablePayloadForWatchCodeTest(project Project, sectionID string) (map[string]any, error) {
	return project.currentCallableSectionPayload(sectionID)
}
