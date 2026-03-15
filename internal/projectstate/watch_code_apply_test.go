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

func TestRuntimeApplyWatchCodeFileUpdateSignatureChangeRefetchesCallableParams(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	initialCallable := mustWatchCodeApplyCallable(
		t,
		"def sorted(iterable):\n    return iterable\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	project.WatchCodeEnabled = true
	project.WatchCodeFiles = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}
	project.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.sorted:function": {
			CallableName:  "sorted",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: initialCallable.SignatureHash,
			BodyHash:      initialCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	project.WatchCodeBaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.sorted:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
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

	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Documentation: "Sort values.",
			Status:        SignatureHelpStatusMatched,
			Params: []CallableParamProposal{
				{
					Name:           "iterable",
					Description:    "Values to sort.",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "list[int]",
				},
				{
					Name:         "reverse",
					DefaultValue: "False",
					Description:  "Descending order flag.",
					PassingStyle: "KEYWORD_ONLY",
				},
			},
		},
	}

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		sourcePath,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply watch code signature change: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected signature change to change project state")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	project = snapshot.Document.Projects["project-alpha"]
	entry := project.WatchCodeRegistry["pkg.watched.sorted:function"]
	if entry.SignatureHash == initialCallable.SignatureHash {
		t.Fatalf("expected signature hash to change, got %#v", entry)
	}

	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID != "callable-2" {
		t.Fatalf("expected current callable id callable-2, got %q", callableID)
	}
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 || children[0] != "param-existing" {
		t.Fatalf("expected refetched callable params, got %#v", children)
	}

	paramPayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", "param-existing")
	if err != nil {
		t.Fatalf("resolve existing param payload: %v", err)
	}
	if got := payloadStringField(paramPayload, "typeAnnotation"); got != "list[int]" {
		t.Fatalf("expected updated param type annotation, got %q", got)
	}

	newParamPayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", children[1])
	if err != nil {
		t.Fatalf("resolve new param payload: %v", err)
	}
	if got := payloadStringField(newParamPayload, "defaultVal"); got != "False" {
		t.Fatalf("expected new param default False, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateSignatureChangeWithoutSignatureContextKeepsParams(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	initialCallable := mustWatchCodeApplyCallable(
		t,
		"def sorted(iterable):\n    return iterable\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	project.WatchCodeEnabled = true
	project.WatchCodeFiles = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}
	project.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.sorted:function": {
			CallableName:  "sorted",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: initialCallable.SignatureHash,
			BodyHash:      initialCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	project.WatchCodeBaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.sorted:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
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

	resolver := &stubCallableSignatureResolver{ok: false}
	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		sourcePath,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply watch code signature change without signature context: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected signature change metadata to change project state")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	project = snapshot.Document.Projects["project-alpha"]
	entry := project.WatchCodeRegistry["pkg.watched.sorted:function"]
	if entry.SignatureHash == initialCallable.SignatureHash {
		t.Fatalf("expected signature hash to change, got %#v", entry)
	}

	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID != "callable-2" {
		t.Fatalf("expected current callable id callable-2, got %q", callableID)
	}
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"param-existing"}) {
		t.Fatalf("expected existing params to stay unchanged, got %#v", got)
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

func TestRuntimeApplyWatchCodeFileDeleteKeepsSectionWithOtherVariants(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)
	project := fixture.Runtime.Snapshot().Document.Projects["project-alpha"]
	betaEntry := project.WatchCodeRegistry["pkg.watched.beta:function"]
	if len(betaEntry.SectionIDs) != 2 ||
		!containsString(betaEntry.SectionIDs, fixture.AlphaSectionID) ||
		!containsString(betaEntry.SectionIDs, fixture.BetaSectionID) {
		t.Fatalf("expected beta registry to include both callable sections, got %#v", betaEntry)
	}

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		fixture.SourcePath,
		"def beta(value):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code delete update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected callable removal update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	if _, ok := project.WatchCodeRegistry["pkg.watched.alpha:function"]; ok {
		t.Fatalf("did not expect alpha registry entry to remain, got %#v", project.WatchCodeRegistry)
	}
	if _, ok := project.Sections[fixture.AlphaSectionID]; !ok {
		t.Fatalf("expected alpha section to remain because another variant still targets beta, got %#v", project.Sections)
	}
	section := project.Sections[fixture.AlphaSectionID]
	if !reflect.DeepEqual(section.VariantIDs, []string{fixture.NewVariantID}) {
		t.Fatalf("expected only the surviving variant to remain, got %#v", section.VariantIDs)
	}
	if project.SectionVariantMap[fixture.AlphaSectionID] != fixture.NewVariantID {
		t.Fatalf(
			"expected active variant to switch to surviving variant %q, got %q",
			fixture.NewVariantID,
			project.SectionVariantMap[fixture.AlphaSectionID],
		)
	}
	payload, err := currentCallablePayloadForWatchCodeTest(project, fixture.AlphaSectionID)
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		t.Fatalf("expected surviving variant callable binding, got %#v", payload)
	}
	if got := project.CodeObjs[callableID].Name; got != betaEntry.CallableName {
		t.Fatalf("expected surviving callable name %q, got %q", betaEntry.CallableName, got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateSignatureChangeRefetchesInactiveMatchingVariant(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)
	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Status:        SignatureHelpStatusMatched,
			Documentation: "Updated beta docs.",
			Params: []CallableParamProposal{
				{
					Name:           "value",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "int",
				},
				{
					Name:         "reverse",
					DefaultValue: "False",
					PassingStyle: "KEYWORD_ONLY",
				},
			},
		},
	}

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		fixture.SourcePath,
		"def alpha(value):\n    return value\n\n\ndef beta(value, reverse=False):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply mixed-variant signature update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected mixed-variant signature update to change project state")
	}
	if resolver.callCount != 2 {
		t.Fatalf("expected resolver calls for both beta-bound sections, got %d", resolver.callCount)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap[fixture.AlphaSectionID]; got != fixture.OriginalVariantID {
		t.Fatalf("expected active alpha variant to remain %q, got %q", fixture.OriginalVariantID, got)
	}

	newVariantPayload, err := effectiveSectionPayload(project, fixture.AlphaSectionID, fixture.NewVariantID)
	if err != nil {
		t.Fatalf("resolve new variant payload: %v", err)
	}
	newVariantCallableID := payloadStringField(newVariantPayload, "callable")
	if newVariantCallableID == "" {
		t.Fatalf("expected beta callable to stay selected on mixed variant, got %#v", newVariantPayload)
	}
	codeObjPayload, _, _, _, err := effectiveCodeObjectPayload(
		project,
		payloadStringMapField(newVariantPayload, "codeObjVariantMap"),
		newVariantCallableID,
	)
	if err != nil {
		t.Fatalf("resolve new variant callable payload: %v", err)
	}
	children := payloadStringArrayField(codeObjPayload, "children")
	if len(children) != 2 {
		t.Fatalf("expected refetched beta params on inactive variant, got %#v", children)
	}
	secondParamPayload, _, _, _, err := effectiveCodeObjectPayload(
		project,
		payloadStringMapField(newVariantPayload, "codeObjVariantMap"),
		children[1],
	)
	if err != nil {
		t.Fatalf("resolve new variant added param payload: %v", err)
	}
	if got := payloadStringField(secondParamPayload, "defaultVal"); got != "False" {
		t.Fatalf("expected inactive beta variant to gain reverse default False, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateRenameUpdatesInactiveMatchingVariant(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		fixture.SourcePath,
		"def alpha(value):\n    return value\n\n\ndef renamed(value):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply mixed-variant rename update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected mixed-variant rename update to change project state")
	}

	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap[fixture.AlphaSectionID]; got != fixture.OriginalVariantID {
		t.Fatalf("expected active alpha variant to remain %q, got %q", fixture.OriginalVariantID, got)
	}
	if _, ok := project.WatchCodeRegistry["pkg.watched.beta:function"]; ok {
		t.Fatalf("did not expect beta identity to remain after rename, got %#v", project.WatchCodeRegistry)
	}
	renamedEntry, ok := project.WatchCodeRegistry["pkg.watched.renamed:function"]
	if !ok {
		t.Fatalf("expected renamed registry entry, got %#v", project.WatchCodeRegistry)
	}
	if len(renamedEntry.SectionIDs) != 2 ||
		!containsString(renamedEntry.SectionIDs, fixture.AlphaSectionID) ||
		!containsString(renamedEntry.SectionIDs, fixture.BetaSectionID) {
		t.Fatalf("expected renamed entry to track both callable sections, got %#v", renamedEntry)
	}

	newVariantPayload, err := effectiveSectionPayload(project, fixture.AlphaSectionID, fixture.NewVariantID)
	if err != nil {
		t.Fatalf("resolve renamed mixed variant payload: %v", err)
	}
	callableID := payloadStringField(newVariantPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected renamed callable to stay selected on mixed variant, got %#v", newVariantPayload)
	}
	if got := project.CodeObjs[callableID].Name; got != "renamed" {
		t.Fatalf("expected inactive beta-bound variant callable name renamed, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveIntoTrackedDestinationFromUntrackedCreatesCallableSection(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "untracked", "incoming.py")
	destinationPath := filepath.Join(workspaceRoot, "pkg", "incoming.py")

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFolders: []WatchCodeFolder{{Path: "pkg", Recursive: false}},
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
		destinationPath,
		"def incoming(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code move-in update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected move-in update to create tracked destination state")
	}

	project := snapshot.Document.Projects["project-alpha"]
	if _, ok := project.WatchCodeBaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect untracked source baseline entry, got %#v", project.WatchCodeBaselineByPath)
	}
	entry, ok := project.WatchCodeRegistry["pkg.incoming.incoming:function"]
	if !ok {
		t.Fatalf("expected destination registry entry, got %#v", project.WatchCodeRegistry)
	}
	if entry.SourcePath != destinationPath {
		t.Fatalf("expected destination source path %q, got %q", destinationPath, entry.SourcePath)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section for moved-in destination, got %#v", entry)
	}
	if _, ok := project.WatchCodeBaselineByPath[destinationPath]; ok {
		t.Fatalf("did not expect move-in creation to seed destination baseline, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveOverExistingDestinationReplacesDestinationState(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "source.py")
	destinationPath := filepath.Join(workspaceRoot, "pkg", "dest.py")

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/source.py", "pkg/dest.py"},
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
		sourcePath,
		"def moved(value):\n    return value\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("seed source watch code file: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected source watch code seed update")
	}

	snapshot, didUpdate, err = runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		destinationPath,
		"def stale(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("seed destination watch code file: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected destination watch code seed update")
	}

	project := snapshot.Document.Projects["project-alpha"]
	sourceEntry := project.WatchCodeRegistry["pkg.source.moved:function"]
	destinationEntry := project.WatchCodeRegistry["pkg.dest.stale:function"]
	sourceSectionID := sourceEntry.SectionIDs[0]
	destinationSectionID := destinationEntry.SectionIDs[0]

	if _, didUpdate, err := runtime.ApplyWatchCodeFileDelete(
		context.Background(),
		"project-alpha",
		destinationPath,
		workspaceRoot,
	); err != nil {
		t.Fatalf("delete overwritten destination state: %v", err)
	} else if !didUpdate {
		t.Fatal("expected destination delete before overwrite move to change state")
	}

	snapshot, didUpdate, err = runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		"project-alpha",
		destinationPath,
		"def moved(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply overwrite move update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected overwrite move update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	if _, ok := project.WatchCodeRegistry["pkg.source.moved:function"]; ok {
		t.Fatalf("did not expect source identity to remain after overwrite move, got %#v", project.WatchCodeRegistry)
	}
	if _, ok := project.WatchCodeRegistry["pkg.dest.stale:function"]; ok {
		t.Fatalf("did not expect stale destination identity to remain after overwrite move, got %#v", project.WatchCodeRegistry)
	}
	entry, ok := project.WatchCodeRegistry["pkg.dest.moved:function"]
	if !ok {
		t.Fatalf("expected moved destination identity, got %#v", project.WatchCodeRegistry)
	}
	if entry.SourcePath != destinationPath {
		t.Fatalf("expected moved destination source path %q, got %q", destinationPath, entry.SourcePath)
	}
	if !reflect.DeepEqual(entry.SectionIDs, []string{sourceSectionID}) {
		t.Fatalf("expected moved callable to reuse source section %q, got %#v", sourceSectionID, entry.SectionIDs)
	}
	if _, ok := project.Sections[destinationSectionID]; ok {
		t.Fatalf("did not expect overwritten destination section %q to remain, got %#v", destinationSectionID, project.Sections)
	}
	if got := project.WatchCodeBaselineByPath[destinationPath]; !reflect.DeepEqual(got, []string{"pkg.dest.moved:function"}) {
		t.Fatalf("expected moved destination baseline %#v, got %#v", []string{"pkg.dest.moved:function"}, got)
	}
	if _, ok := project.WatchCodeBaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect source baseline after overwrite move, got %#v", project.WatchCodeBaselineByPath)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "from pkg.dest import moved\n" {
		t.Fatalf("expected moved destination import prefix, got %q", target.GenCodePrefix)
	}
}

type mixedWatchCodeVariantFixture struct {
	Runtime           *Runtime
	WorkspaceRoot     string
	SourcePath        string
	AlphaSectionID    string
	BetaSectionID     string
	OriginalVariantID string
	NewVariantID      string
}

func seedMixedWatchCodeVariantFixture(t *testing.T) mixedWatchCodeVariantFixture {
	t.Helper()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watched.py"},
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
		sourcePath,
		"def alpha(value):\n    return value\n\n\ndef beta(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply initial watch code update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected initial watch code update to create callable sections")
	}

	project := snapshot.Document.Projects["project-alpha"]
	alphaEntry, ok := project.WatchCodeRegistry["pkg.watched.alpha:function"]
	if !ok {
		t.Fatalf("expected alpha registry entry, got %#v", project.WatchCodeRegistry)
	}
	betaEntry, ok := project.WatchCodeRegistry["pkg.watched.beta:function"]
	if !ok {
		t.Fatalf("expected beta registry entry, got %#v", project.WatchCodeRegistry)
	}
	alphaSectionID := alphaEntry.SectionIDs[0]
	betaSectionID := betaEntry.SectionIDs[0]
	originalVariantID := project.SectionVariantMap[alphaSectionID]

	_, createResult, err := runtime.CreateNewSectionVariant(
		context.Background(),
		"project-alpha",
		CreateNewSectionVariantInput{SectionID: alphaSectionID},
	)
	if err != nil {
		t.Fatalf("create new section variant: %v", err)
	}
	newVariantID := createResult.VariantID

	if _, err := runtime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		newVariantID,
	); err != nil {
		t.Fatalf("set active variant to new variant: %v", err)
	}

	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Status: SignatureHelpStatusMatched,
			Params: []CallableParamProposal{
				{
					Name:           "value",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "int",
				},
			},
		},
	}
	snapshot, setCallableResponse, err := runtime.SetCallable(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		betaEntry.CallableName,
		false,
		resolver,
	)
	if err != nil {
		t.Fatalf("set beta callable on new variant: %v", err)
	}
	if setCallableResponse.CallableID == nil {
		t.Fatal("expected beta callable to be selected on the new variant")
	}

	project = snapshot.Document.Projects["project-alpha"]
	newVariantPayload, err := effectiveSectionPayload(project, alphaSectionID, newVariantID)
	if err != nil {
		t.Fatalf("resolve new mixed variant payload: %v", err)
	}
	callableID := payloadStringField(newVariantPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected beta callable binding on mixed variant, got %#v", newVariantPayload)
	}
	if got := project.CodeObjs[callableID].Name; got != betaEntry.CallableName {
		t.Fatalf("expected mixed variant callable name %q, got %q", betaEntry.CallableName, got)
	}

	if _, err := runtime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		originalVariantID,
	); err != nil {
		t.Fatalf("restore original active variant: %v", err)
	}

	return mixedWatchCodeVariantFixture{
		Runtime:           runtime,
		WorkspaceRoot:     workspaceRoot,
		SourcePath:        sourcePath,
		AlphaSectionID:    alphaSectionID,
		BetaSectionID:     betaSectionID,
		OriginalVariantID: originalVariantID,
		NewVariantID:      newVariantID,
	}
}

func currentCallablePayloadForWatchCodeTest(project Project, sectionID string) (map[string]any, error) {
	return project.currentCallableSectionPayload(sectionID)
}
