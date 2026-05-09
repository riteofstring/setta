package projectstate

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
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
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Folders = []WatchCodeFolder{{Path: "pkg", Recursive: false}}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.source import watched\n"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
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
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {sourceIdentity},
	}
	callableCodeObj := project.CodeObjs["callable-1"]
	callableCodeObj.Name = "watched"
	project.CodeObjs["callable-1"] = callableCodeObj

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		WatchCodeProviderPluginID: func() (string, bool) {
			return testWatchCodeProviderPluginID, true
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
		testWatchCodeProviderPluginID,
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

	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if _, ok := projectData.BaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect source baseline to remain after move, got %#v", projectData.BaselineByPath)
	}
	if got := projectData.BaselineByPath[destPath]; !reflect.DeepEqual(got, []string{destIdentity}) {
		t.Fatalf("expected destination baseline %#v, got %#v", []string{destIdentity}, got)
	}
	if _, ok := projectData.Registry[sourceIdentity]; ok {
		t.Fatalf("did not expect source identity to remain in registry %#v", projectData.Registry)
	}
	entry, ok := projectData.Registry[destIdentity]
	if !ok {
		t.Fatalf("expected moved identity in registry, got %#v", projectData.Registry)
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

	document := newWatchCodeMoveAcrossConfigsDocument(t, sourceIdentity, sourcePath)
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		WatchCodeProviderPluginID: func() (string, bool) {
			return testWatchCodeProviderPluginID, true
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
		testWatchCodeProviderPluginID,
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
		testWatchCodeProviderPluginID,
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

	assertWatchCodeMoveSourceCleared(t, snapshot.Document)
	assertWatchCodeMoveDestinationBackfilled(t, snapshot, destIdentity, destPath)
}

func newWatchCodeMoveAcrossConfigsDocument(t *testing.T, sourceIdentity string, sourcePath string) Document {
	t.Helper()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": newWatchCodeMoveConfigProject("project-alpha", "Alpha"),
			"project-beta":  newWatchCodeMoveConfigProject("project-beta", "Beta"),
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Folders: []WatchCodeFolder{{Path: "source", Recursive: false}},
		Registry: map[string]WatchCodeRegistryEntry{
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
		BaselineByPath: map[string][]string{
			sourcePath: {sourceIdentity},
		},
	})
	mustSetTestWatchCodePluginProjectData(t, &document, "project-beta", WatchCodePluginProjectData{
		Folders: []WatchCodeFolder{{Path: "dest", Recursive: false}},
	})
	return document
}

func newWatchCodeMoveConfigProject(id string, name string) Project {
	return Project{
		ID:   id,
		Name: name,
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python"}`),
			},
		},
	}
}

func assertWatchCodeMoveSourceCleared(t *testing.T, document Document) {
	t.Helper()

	sourceProjectData := mustReadTestWatchCodePluginProjectData(t, document, "project-alpha")
	if len(sourceProjectData.Registry) != 0 {
		t.Fatalf("expected source registry to be cleared, got %#v", sourceProjectData.Registry)
	}
	if len(sourceProjectData.BaselineByPath) != 0 {
		t.Fatalf("expected source baseline to be cleared, got %#v", sourceProjectData.BaselineByPath)
	}
}

func assertWatchCodeMoveDestinationBackfilled(t *testing.T, snapshot Snapshot, destIdentity string, destPath string) {
	t.Helper()

	destProject := snapshot.Document.Projects["project-beta"]
	destProjectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-beta")
	entry, ok := destProjectData.Registry[destIdentity]
	if !ok {
		t.Fatalf("expected destination registry entry %#v, got %#v", destIdentity, destProjectData.Registry)
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
	size, ok := sectionPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected created watch-code callable size object, got %#v", sectionPayload["size"])
	}
	if size["width"] != 250.0 || size["height"] != 150.0 {
		t.Fatalf("expected created watch-code callable default size {250 150}, got %#v", size)
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

func TestRuntimeApplyWatchCodeFileUpdateReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	defaultWindowing := DefaultProjectChatWindowingState()
	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python"}`),
			},
		},
		ProjectChatWindowing: &defaultWindowing,
	}
	projectData := WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
	}

	structuralReconciler := testRuntimeStructuralMutationPythonGeneratedSectionReconciler()
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		PythonCodegenSectionReconciler: PythonCodegenSectionReconcilerFunc(func(ctx context.Context, project *Project) error {
			if err := structuralReconciler.ReconcileProjectPythonGeneratedSections(ctx, project); err != nil {
				return err
			}
			if project == nil {
				return ErrProjectNotFound
			}
			target, ok, err := project.PythonCodegenTarget()
			if err != nil {
				return err
			}
			if !ok {
				return nil
			}
			payload, err := marshalProjectObject(map[string]any{
				"id":   GeneratedPythonCodeImplID,
				"type": "GenPythonCode",
				"code": target.GenCodePrefix,
			})
			if err != nil {
				return err
			}
			impl := project.SectionImpls[GeneratedPythonCodeImplID]
			impl.Payload = payload
			project.SectionImpls[GeneratedPythonCodeImplID] = impl
			return nil
		}),
	})
	if err != nil {
		t.Fatalf("open overlay runtime with generated reconciler: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def watched(value):\n    return value\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected watch code update to mutate project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after watch code update, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `from pkg.watched import watched`) {
		t.Fatalf("expected generated python payload to include watch-code import, got %q", string(impl.Payload))
	}
}

func TestProjectApplyWatchCodeFileUpdatePlacesCreatedCallableSectionWithoutOverlap(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourceRelativePath := "watch_code_test.py"
	sourcePath := filepath.Join(workspaceRoot, sourceRelativePath)

	project := watchCodeCallableLayoutProject()
	projectData := WatchCodePluginProjectData{
		Files:    []string{sourceRelativePath},
		Registry: map[string]WatchCodeRegistryEntry{},
	}

	didUpdate, err := project.ApplyWatchCodeFileUpdate(
		context.Background(),
		&projectData,
		sourcePath,
		"def watched(value):\n    return value\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code file update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected watch code update to create a callable section")
	}
	assertCreatedWatchCodeCallableSectionWithoutOverlap(t, project, projectData)
}

func watchCodeCallableLayoutProject() Project {
	return Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python"}`),
			},
		},
		Sections: map[string]Section{
			GeneratedPythonCodeSectionID: {
				ID:               GeneratedPythonCodeSectionID,
				Name:             "Generated Python",
				VariantIDs:       []string{GeneratedPythonCodeVariantID},
				DefaultVariantID: GeneratedPythonCodeVariantID,
			},
		},
		SectionVariants: map[string]SectionVariant{
			GeneratedPythonCodeVariantID: {
				ID:     GeneratedPythonCodeVariantID,
				Name:   "Generated Python",
				ImplID: GeneratedPythonCodeImplID,
			},
		},
		SectionImpls: map[string]SectionImpl{
			GeneratedPythonCodeImplID: {
				ID:   GeneratedPythonCodeImplID,
				Kind: SectionKindGenerated,
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   GeneratedPythonCodeImplID,
					"type": "GenPythonCode",
					"size": map[string]any{
						"width":  500.0,
						"height": 150.0,
					},
				}),
				Generated: &GeneratedSectionImpl{Kind: GeneratedSectionKindPythonCode},
			},
		},
		SectionVariantMap: map[string]string{
			GeneratedPythonCodeSectionID: GeneratedPythonCodeVariantID,
		},
		TopLevelSectionIDs: []string{GeneratedPythonCodeSectionID},
		TopLevelSections: map[string]TopLevelSectionLayout{
			GeneratedPythonCodeSectionID: {X: 0, Y: 0},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				VisibilityBySectionID: map[string]bool{
					GeneratedPythonCodeSectionID: true,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					GeneratedPythonCodeSectionID: {X: 0, Y: 0},
				},
			},
		},
	}
}

func assertCreatedWatchCodeCallableSectionWithoutOverlap(t *testing.T, project Project, projectData WatchCodePluginProjectData) {
	t.Helper()

	entry, ok := projectData.Registry["watch_code_test.watched:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one created callable section, got %#v", entry)
	}
	sectionID := entry.SectionIDs[0]
	assertCreatedWatchCodeCallableSection(t, project, sectionID)
	layout := assertCreatedWatchCodeCallableLayout(t, project, sectionID)
	assertCreatedWatchCodeCallableDoesNotOverlap(t, project, sectionID, layout)
}

func assertCreatedWatchCodeCallableSection(t *testing.T, project Project, sectionID string) Section {
	t.Helper()

	section, ok := project.Sections[sectionID]
	if !ok {
		t.Fatalf("expected created section, got %#v", project.Sections)
	}
	if strings.TrimSpace(section.Name) == "" {
		t.Fatalf("expected created callable section name, got %#v", section)
	}
	if section.Name == "Callable" {
		t.Fatalf("expected created callable section to use standard random naming, got %#v", section)
	}
	if formatError := sectionNameFormatError(section.Name); formatError != "" {
		t.Fatalf("expected created callable section name to remain valid, got %q with error %q", section.Name, formatError)
	}
	return section
}

func assertCreatedWatchCodeCallableLayout(t *testing.T, project Project, sectionID string) TopLevelSectionLayout {
	t.Helper()

	layout, ok := project.TopLevelSections[sectionID]
	if !ok {
		t.Fatalf("expected created section layout, got %#v", project.TopLevelSections)
	}
	if layout.X == 0 && layout.Y == 0 {
		t.Fatalf("expected created callable section to avoid origin overlap, got %#v", layout)
	}

	activeViewMode := project.ViewModes["focus"]
	if !activeViewMode.VisibilityBySectionID[sectionID] {
		t.Fatalf("expected created callable section to be visible in active view mode, got %#v", activeViewMode.VisibilityBySectionID)
	}
	viewModeLayout, ok := activeViewMode.TopLevelSections[sectionID]
	if !ok {
		t.Fatalf("expected active view mode layout for created callable section, got %#v", activeViewMode.TopLevelSections)
	}
	if viewModeLayout.X != layout.X || viewModeLayout.Y != layout.Y {
		t.Fatalf("expected project and view-mode layouts to match, got %#v vs %#v", layout, viewModeLayout)
	}
	return layout
}

func assertCreatedWatchCodeCallableDoesNotOverlap(t *testing.T, project Project, sectionID string, layout TopLevelSectionLayout) {
	t.Helper()

	payload, err := currentCallablePayloadForWatchCodeTest(project, sectionID)
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		t.Fatalf("expected created callable size payload, got %#v", payload)
	}
	width, ok := size["width"].(float64)
	if !ok {
		t.Fatalf("expected callable width float64, got %#v", size["width"])
	}
	height, ok := size["height"].(float64)
	if !ok {
		t.Fatalf("expected callable height float64, got %#v", size["height"])
	}

	createdRect := createTopLevelSectionLayoutRect{
		X: layout.X,
		Y: layout.Y,
		W: width,
		H: height,
	}
	generatedRect := createTopLevelSectionLayoutRect{
		X: 0,
		Y: 0,
		W: 500,
		H: 150,
	}
	if createTopLevelSectionRectsIntersect(createdRect, generatedRect) {
		t.Fatalf("expected created callable section not to overlap generated python section, got created=%#v existing=%#v", createdRect, generatedRect)
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

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
		Registry: map[string]WatchCodeRegistryEntry{
			identity: {
				CallableName:  "pkg.watched.added",
				Kind:          WatchCodeCallableKindFunction,
				SignatureHash: "signature",
				BodyHash:      "body",
				SourcePath:    sourcePath,
			},
		},
		BaselineByPath: map[string][]string{
			sourcePath: {identity},
		},
	})
	runtime, err := OpenOverlayRuntime(document)
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
		testWatchCodeProviderPluginID,
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

	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if len(projectData.Registry) != 0 {
		t.Fatalf("expected registry to be empty after delete, got %#v", projectData.Registry)
	}
	if len(projectData.BaselineByPath) != 0 {
		t.Fatalf("expected baseline to be empty after delete, got %#v", projectData.BaselineByPath)
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
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &initialDocument, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
		Registry: map[string]WatchCodeRegistryEntry{
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
		BaselineByPath: map[string][]string{
			sourcePath: {identity},
		},
	})
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
		testWatchCodeProviderPluginID,
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
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Files = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
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
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.sorted:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntime(document)
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
		testWatchCodeProviderPluginID,
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
	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry := projectData.Registry["pkg.watched.sorted:function"]
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

func TestRuntimeApplyWatchCodeFileUpdateInitialAdditionRefetchesCallableParams(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
	})
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		WatchCodeProviderPluginID: func() (string, bool) {
			return testWatchCodeProviderPluginID, true
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
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply initial watch code update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected initial watch code update to create and bind a callable section")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["pkg.watched.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one created callable section, got %#v", entry)
	}

	project := snapshot.Document.Projects["project-alpha"]
	sectionID := entry.SectionIDs[0]
	payload, err := currentCallablePayloadForWatchCodeTest(project, sectionID)
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		t.Fatalf("expected created callable binding, got %#v", payload)
	}

	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 {
		t.Fatalf("expected initial watch code binding to create params, got %#v", children)
	}
	if got := project.CodeObjs[children[0]].Name; got != "iterable" {
		t.Fatalf("expected first param iterable, got %q", got)
	}
	if got := project.CodeObjs[children[1]].Name; got != "reverse" {
		t.Fatalf("expected second param reverse, got %q", got)
	}

	iterablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, children[0])
	if err != nil {
		t.Fatalf("resolve iterable param payload: %v", err)
	}
	if got := payloadStringField(iterablePayload, "typeAnnotation"); got != "list[int]" {
		t.Fatalf("expected iterable param type annotation list[int], got %q", got)
	}

	reversePayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, children[1])
	if err != nil {
		t.Fatalf("resolve reverse param payload: %v", err)
	}
	if got := payloadStringField(reversePayload, "defaultVal"); got != "False" {
		t.Fatalf("expected reverse param default False, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateInitialAdditionUsesParsedParamsWhenSignatureResolverNoMatch(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
	})
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		WatchCodeProviderPluginID: func() (string, bool) {
			return testWatchCodeProviderPluginID, true
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
			Status: SignatureHelpStatusNoMatch,
		},
	}

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def added(alpha: int, beta='fallback'):\n    return alpha\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply initial watch code update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected initial watch code update to create and bind a callable section")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["pkg.watched.added:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one created callable section, got %#v", entry)
	}

	project := snapshot.Document.Projects["project-alpha"]
	sectionID := entry.SectionIDs[0]
	payload, err := currentCallablePayloadForWatchCodeTest(project, sectionID)
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		t.Fatalf("expected created callable binding, got %#v", payload)
	}

	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 {
		t.Fatalf("expected parsed watch code params, got %#v", children)
	}
	if got := project.CodeObjs[children[0]].Name; got != "alpha" {
		t.Fatalf("expected first param alpha, got %q", got)
	}
	if got := project.CodeObjs[children[1]].Name; got != "beta" {
		t.Fatalf("expected second param beta, got %q", got)
	}

	alphaPayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, children[0])
	if err != nil {
		t.Fatalf("resolve alpha param payload: %v", err)
	}
	if got := payloadStringField(alphaPayload, "typeAnnotation"); got != "int" {
		t.Fatalf("expected alpha param type annotation int, got %q", got)
	}

	betaPayload, _, _, _, err := project.resolveCurrentCodeObjectContext(sectionID, children[1])
	if err != nil {
		t.Fatalf("resolve beta param payload: %v", err)
	}
	if got := payloadStringField(betaPayload, "defaultVal"); got != "'fallback'" {
		t.Fatalf("expected beta param default fallback, got %q", got)
	}
}
