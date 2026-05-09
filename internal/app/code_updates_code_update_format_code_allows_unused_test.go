package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"setta/internal/codegen"
	"setta/internal/lsp"
	"setta/internal/lspsignature"
	"setta/internal/projectstate"
)

func TestCodeUpdateServiceFormatCodeAllowsUnusedArgs(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := codeUpdateTestProject(t, projectstate.CodeFileAccessModeReadWrite)
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState: runtime,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if _, err := runtime.SetCode(context.Background(), "project-alpha", "section-main", "def foo(a):\n    return 1\n"); err != nil {
		t.Fatalf("seed unused-arg code: %v", err)
	}
	if err := service.FormatCode(context.Background(), "project-alpha", "section-main"); err != nil {
		t.Fatalf("format code with unused args: %v", err)
	}

	target, err := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve formatted code section: %v", err)
	}
	if !strings.Contains(target.Code, "def foo(a):") {
		t.Fatalf("expected unused args to be preserved, got %q", target.Code)
	}
}

func TestCodeUpdateServiceFormatCodeRejectsInvalidPythonCodeWithSanitizedDetail(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := codeUpdateTestProject(t, projectstate.CodeFileAccessModeReadWrite)
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState: runtime,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if _, err := runtime.SetCode(context.Background(), "project-alpha", "section-main", "def broken("); err != nil {
		t.Fatalf("seed invalid code: %v", err)
	}
	err = service.FormatCode(context.Background(), "project-alpha", "section-main")
	if !projectstate.IsFormatCodeError(err) {
		t.Fatalf("expected format-code error, got %v", err)
	}
	if err.Error() == "" {
		t.Fatal("expected invalid python formatting error detail")
	}
	if strings.Contains(err.Error(), "\x1b") {
		t.Fatalf("expected stripped ansi escapes, got %q", err.Error())
	}

	target, resolveErr := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if resolveErr != nil {
		t.Fatalf("resolve code section after invalid format failure: %v", resolveErr)
	}
	if target.Code != "def broken(" {
		t.Fatalf("expected invalid code to stay unchanged, got %q", target.Code)
	}
}

func TestCodeUpdateServiceFormatCodeRejectsInvalidGeneratedPrefixWithSanitizedDetail(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := generatedPythonFormatProject(t, "def broken(", "y=2\n")
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState: runtime,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	err = service.FormatCode(context.Background(), "project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if !projectstate.IsFormatCodeError(err) {
		t.Fatalf("expected format-code error, got %v", err)
	}
	if !strings.Contains(err.Error(), "Gen code prefix:") {
		t.Fatalf("expected gen code prefix detail, got %q", err.Error())
	}
	if strings.Contains(err.Error(), "\x1b") {
		t.Fatalf("expected stripped ansi escapes, got %q", err.Error())
	}

	target, resolveErr := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if resolveErr != nil {
		t.Fatalf("resolve generated target after invalid prefix failure: %v", resolveErr)
	}
	if target.GenCodePrefix != "def broken(" || target.GenCodeSuffix != "y=2\n" {
		t.Fatalf("expected generated python target to stay unchanged, got prefix=%q suffix=%q", target.GenCodePrefix, target.GenCodeSuffix)
	}
}

func TestCodeUpdateServiceFormatCodeRejectsInvalidGeneratedSuffixWithSanitizedDetail(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := generatedPythonFormatProject(t, "x = 1\n", "def broken(")
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState: runtime,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	err = service.FormatCode(context.Background(), "project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if !projectstate.IsFormatCodeError(err) {
		t.Fatalf("expected format-code error, got %v", err)
	}
	if !strings.Contains(err.Error(), "Gen code suffix:") {
		t.Fatalf("expected gen code suffix detail, got %q", err.Error())
	}
	if strings.Contains(err.Error(), "\x1b") {
		t.Fatalf("expected stripped ansi escapes, got %q", err.Error())
	}

	target, resolveErr := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if resolveErr != nil {
		t.Fatalf("resolve generated target after invalid suffix failure: %v", resolveErr)
	}
	if target.GenCodePrefix != "x = 1\n" || target.GenCodeSuffix != "def broken(" {
		t.Fatalf("expected generated python target to stay unchanged, got prefix=%q suffix=%q", target.GenCodePrefix, target.GenCodeSuffix)
	}
}

func TestCodeUpdateServiceFormatCodeAllowsUndefinedSymbolsInGeneratedPython(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := generatedPythonFormatProject(t, "state = SettaState()\n", "state = SettaState()\n")
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState: runtime,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.FormatCode(context.Background(), "project-alpha", projectstate.GeneratedPythonCodeSectionID); err != nil {
		t.Fatalf("format generated python with unresolved symbols: %v", err)
	}

	target, resolveErr := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if resolveErr != nil {
		t.Fatalf("resolve generated target after formatting: %v", resolveErr)
	}
	if !strings.Contains(target.GenCodePrefix, "SettaState") || !strings.Contains(target.GenCodeSuffix, "SettaState") {
		t.Fatalf("expected unresolved SettaState symbols to be preserved, got prefix=%q suffix=%q", target.GenCodePrefix, target.GenCodeSuffix)
	}
}

func watchCodeBoundReloadProject(t *testing.T) projectstate.Project {
	t.Helper()

	return watchCodeBoundProject(t, "pkg/bound.py", "def watched(value):\n    return value\n")
}

func watchCodeRootBoundProject(t *testing.T, bindingPath string) projectstate.Project {
	t.Helper()

	return watchCodeBoundProject(t, bindingPath, "")
}

func watchCodeConfiguredProjectData() projectstate.WatchCodePluginProjectData {
	return projectstate.WatchCodePluginProjectData{
		Files: []string{"watch_code_test.py", "pkg/bound.py"},
	}.Normalized()
}

func watchCodeTestDocument(
	t *testing.T,
	project projectstate.Project,
	projectData projectstate.WatchCodePluginProjectData,
) projectstate.Document {
	t.Helper()

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
	setAppWatchCodePluginProjectData(t, &document, project.ID, projectData)
	return document
}

func watchCodeBoundProject(t *testing.T, bindingPath string, initialCode string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python"}`),
			},
		},
		SectionVariantMap: map[string]string{
			"section-main": "variant-main",
		},
		Sections: map[string]projectstate.Section{
			"section-main": {
				ID:               "section-main",
				Name:             "Main",
				VariantIDs:       []string{"variant-main"},
				DefaultVariantID: "variant-main",
				UnsharedKeys:     []string{"code"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"variant-main": {
				ID:               "variant-main",
				ImplID:           "impl-main",
				NonPresetImplIDs: []string{"impl-main"},
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"impl-main": {
				ID:   "impl-main",
				Kind: projectstate.SectionKindCode,
				Payload: projectstate.RawJSON(`{
					"id":"impl-main",
					"type":"Code",
					"code":` + strconv.Quote(initialCode) + `,
					"codeLanguage":"python",
					"children":[]
				}`),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       bindingPath,
						AccessMode: projectstate.CodeFileAccessModeReadWrite,
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize watch code bound reload project: %v", err)
	}
	return project
}

type boundWatchCodeDiagnosticsHarness struct {
	projectRuntime  *projectstate.Runtime
	service         *codeUpdateService
	materializer    *codegen.PythonMaterializer
	synchronizer    *lsp.ProjectSynchronizer
	diagnostics     *projectstate.LSPDiagnosticsRegistry
	workspaceRoot   string
	settaFilesRoot  string
	latestProjectID string
}

func openBoundWatchCodeDiagnosticsHarness(t *testing.T) *boundWatchCodeDiagnosticsHarness {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	lspRouter, err := lsp.NewRouter(lsp.RouterOptions{
		WorkspaceRoot:   workspaceRoot,
		Environ:         os.Environ,
		AdditionalSpecs: []lsp.LanguageServerSpec{appTestPythonLanguageServerSpec(t)},
	})
	if err != nil {
		t.Fatalf("new lsp router: %v", err)
	}
	synchronizer, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		Service:        lspRouter,
		Diagnostics:    diagnostics,
		WatchCodeProviderPluginID: func() (string, bool) {
			return testAppWatchCodeProviderPluginID, true
		},
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	signatures, err := lspsignature.NewService(lspsignature.ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		LSPService:     lspRouter,
	})
	if err != nil {
		t.Fatalf("new lsp signature service: %v", err)
	}

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(
		watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()),
		projectstate.RuntimeOptions{
			PythonCodegenSectionReconciler: materializer,
			WatchCodeProviderPluginID: func() (string, bool) {
				return testAppWatchCodeProviderPluginID, true
			},
		},
	)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}

	t.Cleanup(func() {
		if err := lspRouter.Close(context.Background()); err != nil {
			t.Fatalf("close lsp router: %v", err)
		}
	})
	t.Cleanup(func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close project synchronizer: %v", err)
		}
	})
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               synchronizer,
		CallableSignatures:    signatures,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	harness := &boundWatchCodeDiagnosticsHarness{
		projectRuntime:  projectRuntime,
		service:         service,
		materializer:    materializer,
		synchronizer:    synchronizer,
		diagnostics:     diagnostics,
		workspaceRoot:   workspaceRoot,
		settaFilesRoot:  settaFilesRoot,
		latestProjectID: "project-alpha",
	}
	harness.materializeSnapshot(t, context.Background())
	return harness
}

func openPersistedBoundWatchCodeDiagnosticsHarness(t *testing.T) *boundWatchCodeDiagnosticsHarness {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	lspRouter, err := lsp.NewRouter(lsp.RouterOptions{
		WorkspaceRoot:   workspaceRoot,
		Environ:         os.Environ,
		AdditionalSpecs: []lsp.LanguageServerSpec{appTestPythonLanguageServerSpec(t)},
	})
	if err != nil {
		t.Fatalf("new lsp router: %v", err)
	}
	synchronizer, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		Service:        lspRouter,
		Diagnostics:    diagnostics,
		WatchCodeProviderPluginID: func() (string, bool) {
			return testAppWatchCodeProviderPluginID, true
		},
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	signatures, err := lspsignature.NewService(lspsignature.ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		LSPService:     lspRouter,
	})
	if err != nil {
		t.Fatalf("new lsp signature service: %v", err)
	}

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	store, err := projectstate.NewStore(filepath.Join(settaFilesRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), watchCodeTestDocument(t, project, watchCodeConfiguredProjectData())); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{
		BeforeSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
			return projectstate.SaveJSONSourceFiles(snapshot.Document, workspaceRoot)
		},
		AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
			if err := materializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
				return err
			}
			if err := synchronizer.MaterializeDocument(ctx, snapshot.Document); err != nil {
				return err
			}
			return diagnostics.PruneDocument(snapshot.Document)
		},
		PythonCodegenSectionReconciler: materializer,
		WatchCodeProviderPluginID: func() (string, bool) {
			return testAppWatchCodeProviderPluginID, true
		},
	})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}

	t.Cleanup(func() {
		if err := lspRouter.Close(context.Background()); err != nil {
			t.Fatalf("close lsp router: %v", err)
		}
	})
	t.Cleanup(func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close project synchronizer: %v", err)
		}
	})
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := projectRuntime.Save(context.Background()); err != nil {
		t.Fatalf("seed persisted runtime materialization: %v", err)
	}

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               synchronizer,
		CallableSignatures:    signatures,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	return &boundWatchCodeDiagnosticsHarness{
		projectRuntime:  projectRuntime,
		service:         service,
		materializer:    materializer,
		synchronizer:    synchronizer,
		diagnostics:     diagnostics,
		workspaceRoot:   workspaceRoot,
		settaFilesRoot:  settaFilesRoot,
		latestProjectID: "project-alpha",
	}
}

func (h *boundWatchCodeDiagnosticsHarness) applyRecordedStates(
	t *testing.T,
	ctx context.Context,
	states []string,
) projectstate.Snapshot {
	t.Helper()

	for _, state := range states {
		if err := h.service.SetCode(ctx, "project-alpha", "section-main", state); err != nil {
			t.Fatalf("set recorded watch-code state %q: %v", state, err)
		}
		h.materializeSnapshot(t, ctx)
	}
	return h.projectRuntime.Snapshot()
}

func (h *boundWatchCodeDiagnosticsHarness) materializeSnapshot(t *testing.T, ctx context.Context) {
	t.Helper()

	snapshot := h.projectRuntime.Snapshot()
	if err := h.materializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		t.Fatalf("materialize python generated document: %v", err)
	}
	if err := h.synchronizer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		t.Fatalf("materialize lsp document set: %v", err)
	}
}

func testCodeUpdateGeneratedPythonSectionReconciler() projectstate.PythonCodegenSectionReconciler {
	return projectstate.PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *projectstate.Project) error {
		if project == nil {
			return projectstate.ErrProjectNotFound
		}
		if err := project.ReconcilePythonGeneratedBindings(); err != nil {
			return err
		}

		config, ok, err := project.PythonCodegenTarget()
		if err != nil || !ok {
			return err
		}

		payload := map[string]any{
			"id":   projectstate.GeneratedPythonCodeImplID,
			"type": "GenPythonCode",
			"code": config.GenCodePrefix + config.GenCodeSuffix,
		}
		if project.GeneratedCodeBinding != nil {
			payload["codeFileBinding"] = map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			}
		}
		encodedPayload, err := json.Marshal(payload)
		if err != nil {
			return err
		}

		if project.SectionVariantMap == nil {
			project.SectionVariantMap = map[string]string{}
		}
		project.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID] = projectstate.GeneratedPythonCodeVariantID

		if project.Sections == nil {
			project.Sections = map[string]projectstate.Section{}
		}
		project.Sections[projectstate.GeneratedPythonCodeSectionID] = projectstate.Section{
			ID:               projectstate.GeneratedPythonCodeSectionID,
			Name:             projectstate.GeneratedPythonCodeSectionName,
			VariantIDs:       []string{projectstate.GeneratedPythonCodeVariantID},
			DefaultVariantID: projectstate.GeneratedPythonCodeVariantID,
		}

		if project.SectionVariants == nil {
			project.SectionVariants = map[string]projectstate.SectionVariant{}
		}
		project.SectionVariants[projectstate.GeneratedPythonCodeVariantID] = projectstate.SectionVariant{
			ID:     projectstate.GeneratedPythonCodeVariantID,
			ImplID: projectstate.GeneratedPythonCodeImplID,
		}

		if project.SectionImpls == nil {
			project.SectionImpls = map[string]projectstate.SectionImpl{}
		}
		project.SectionImpls[projectstate.GeneratedPythonCodeImplID] = projectstate.SectionImpl{
			ID:      projectstate.GeneratedPythonCodeImplID,
			Kind:    projectstate.SectionKindGenerated,
			Payload: projectstate.RawJSON(encodedPayload),
			Generated: &projectstate.GeneratedSectionImpl{
				Kind: projectstate.GeneratedSectionKindPythonCode,
			},
		}

		if project.TopLevelSections == nil {
			project.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
		}
		project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID] = projectstate.TopLevelSectionLayout{}
		if !containsStringValue(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID) {
			project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID)
		}

		return nil
	})
}

func generatedSectionCode(t *testing.T, project projectstate.Project) string {
	t.Helper()

	impl, ok := project.SectionImpls[projectstate.GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl, got %#v", project.SectionImpls)
	}
	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode generated python payload: %v", err)
	}
	code, ok := payload["code"].(string)
	if !ok {
		t.Fatalf("expected generated python code string, got %#v", payload["code"])
	}
	return code
}

func containsStringValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func watchCodeEntryParamMessagesByName(
	t *testing.T,
	project projectstate.Project,
	entry projectstate.WatchCodeRegistryEntry,
	payload projectstate.LSPDiagnosticsPayload,
) map[string][]string {
	t.Helper()

	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one watch code section for %#v", entry)
	}
	sectionID := entry.SectionIDs[0]
	sectionErrors := payload.GenCode.Errors[sectionID]
	callableID := ""
	for codeObjID, codeObj := range project.CodeObjs {
		if strings.TrimSpace(codeObj.Name) != strings.TrimSpace(entry.CallableName) {
			continue
		}
		if _, _, _, _, err := project.ResolveSectionCodeObject(sectionID, codeObjID); err == nil {
			callableID = codeObjID
			break
		}
	}
	if callableID == "" {
		t.Fatalf("expected callable %q in section %q", entry.CallableName, sectionID)
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, callableID)
	if err != nil {
		t.Fatalf("resolve callable payload for %q: %v", entry.CallableName, err)
	}
	rawChildren, ok := callablePayload["children"].([]any)
	if !ok {
		t.Fatalf("expected callable children array for %q, got %#v", entry.CallableName, callablePayload["children"])
	}

	output := make(map[string][]string, len(rawChildren))
	for _, rawChildID := range rawChildren {
		childID, ok := rawChildID.(string)
		if !ok {
			t.Fatalf("expected callable child id string, got %#v", rawChildID)
		}
		codeObj, ok := project.CodeObjs[childID]
		if !ok {
			t.Fatalf("expected param code object %q for callable %q", childID, entry.CallableName)
		}
		output[codeObj.Name] = append([]string(nil), sectionErrors.Params[childID]...)
	}
	return output
}

func generatedDiagnosticsContain(payload projectstate.LSPDiagnosticsPayload, fragment string) bool {
	if strings.TrimSpace(fragment) == "" {
		return false
	}
	for _, sectionErrors := range payload.GenCode.Errors {
		for _, message := range sectionErrors.Callable {
			if strings.Contains(message, fragment) {
				return true
			}
		}
		for _, paramMessages := range sectionErrors.Params {
			for _, message := range paramMessages {
				if strings.Contains(message, fragment) {
					return true
				}
			}
		}
	}
	for _, diagnostic := range payload.UnmappedGenCode {
		if strings.Contains(diagnostic.Message, fragment) {
			return true
		}
	}
	return false
}

func watchCodeEntryParamIDsByName(
	project projectstate.Project,
	entry projectstate.WatchCodeRegistryEntry,
) map[string]string {
	if len(entry.SectionIDs) != 1 {
		return map[string]string{}
	}
	sectionID := entry.SectionIDs[0]
	callableID := ""
	for codeObjID, codeObj := range project.CodeObjs {
		if strings.TrimSpace(codeObj.Name) != strings.TrimSpace(entry.CallableName) {
			continue
		}
		if _, _, _, _, err := project.ResolveSectionCodeObject(sectionID, codeObjID); err == nil {
			callableID = codeObjID
			break
		}
	}
	if callableID == "" {
		return map[string]string{}
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, callableID)
	if err != nil {
		return map[string]string{}
	}
	rawChildren, ok := callablePayload["children"].([]any)
	if !ok {
		return map[string]string{}
	}

	output := make(map[string]string, len(rawChildren))
	for _, rawChildID := range rawChildren {
		childID, ok := rawChildID.(string)
		if !ok {
			continue
		}
		codeObj, ok := project.CodeObjs[childID]
		if !ok {
			continue
		}
		output[codeObj.Name] = childID
	}
	return output
}

func watchCodeEntryParamNames(
	t *testing.T,
	project projectstate.Project,
	entry projectstate.WatchCodeRegistryEntry,
) []string {
	t.Helper()

	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one watch code section for %#v", entry)
	}
	sectionID := entry.SectionIDs[0]
	callableID := ""
	for codeObjID, codeObj := range project.CodeObjs {
		if strings.TrimSpace(codeObj.Name) != strings.TrimSpace(entry.CallableName) {
			continue
		}
		if _, _, _, _, err := project.ResolveSectionCodeObject(sectionID, codeObjID); err == nil {
			callableID = codeObjID
			break
		}
	}
	if callableID == "" {
		t.Fatalf("expected callable %q in section %q", entry.CallableName, sectionID)
	}

	callablePayload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, callableID)
	if err != nil {
		t.Fatalf("resolve callable payload for %q: %v", entry.CallableName, err)
	}
	rawChildren, ok := callablePayload["children"].([]any)
	if !ok {
		t.Fatalf("expected callable children array for %q, got %#v", entry.CallableName, callablePayload["children"])
	}

	names := make([]string, 0, len(rawChildren))
	for _, rawChildID := range rawChildren {
		childID, ok := rawChildID.(string)
		if !ok {
			t.Fatalf("expected callable child id string, got %#v", rawChildID)
		}
		codeObj, ok := project.CodeObjs[childID]
		if !ok {
			t.Fatalf("expected param code object %q for callable %q", childID, entry.CallableName)
		}
		names = append(names, codeObj.Name)
	}
	return names
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func codeUpdateTestProject(t *testing.T, accessMode projectstate.CodeFileAccessMode) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"section-main": "variant-main",
		},
		Sections: map[string]projectstate.Section{
			"section-main": {
				ID:               "section-main",
				Name:             "Main",
				VariantIDs:       []string{"variant-main"},
				DefaultVariantID: "variant-main",
				UnsharedKeys:     []string{"code"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"variant-main": {
				ID:               "variant-main",
				ImplID:           "impl-main",
				NonPresetImplIDs: []string{"impl-main"},
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"impl-main": {
				ID:   "impl-main",
				Kind: projectstate.SectionKindCode,
				Payload: projectstate.RawJSON(`{
					"id":"impl-main",
					"type":"Code",
					"code":"x=1\n",
					"codeLanguage":"python",
					"children":[]
				}`),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       "pkg/bound.py",
						AccessMode: accessMode,
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code update test project: %v", err)
	}
	return project
}

func generatedPythonFormatProject(t *testing.T, prefix string, suffix string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python","genCodePrefix":` + strconv.Quote(prefix) + `,"genCodeSuffix":` + strconv.Quote(suffix) + `}`),
			},
		},
		SectionVariantMap: map[string]string{
			projectstate.GeneratedPythonCodeSectionID: projectstate.GeneratedPythonCodeVariantID,
		},
		Sections: map[string]projectstate.Section{
			projectstate.GeneratedPythonCodeSectionID: {
				ID:               projectstate.GeneratedPythonCodeSectionID,
				Name:             projectstate.GeneratedPythonCodeSectionName,
				VariantIDs:       []string{projectstate.GeneratedPythonCodeVariantID},
				DefaultVariantID: projectstate.GeneratedPythonCodeVariantID,
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			projectstate.GeneratedPythonCodeVariantID: {
				ID:     projectstate.GeneratedPythonCodeVariantID,
				ImplID: projectstate.GeneratedPythonCodeImplID,
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			projectstate.GeneratedPythonCodeImplID: {
				ID:   projectstate.GeneratedPythonCodeImplID,
				Kind: projectstate.SectionKindGenerated,
				Payload: projectstate.RawJSON(`{
					"id":"gen-python-impl",
					"type":"GenPythonCode"
				}`),
				Generated: &projectstate.GeneratedSectionImpl{
					Kind: projectstate.GeneratedSectionKindPythonCode,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize generated python format project: %v", err)
	}
	return project
}

func addRepoVenvRuffToPath(t *testing.T) {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve code_updates_test.go path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	venvBin := filepath.Join(repoRoot, ".venv", "bin")
	if _, err := os.Stat(filepath.Join(venvBin, "ruff")); err != nil {
		t.Fatalf("stat repo ruff binary: %v", err)
	}
	t.Setenv("PATH", venvBin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func codeUpdatesTestPythonSettings(settings map[string]any, extraPaths []string) map[string]any {
	branch := codeUpdatesTestPythonSettingsBranch(settings)
	mergedExtraPaths := mergeCodeUpdatesPythonExtraPaths(branch, extraPaths)
	if len(mergedExtraPaths) != 0 {
		analysis, ok := branch["analysis"].(map[string]any)
		if !ok {
			analysis = map[string]any{}
			branch["analysis"] = analysis
		}
		analysis["extraPaths"] = codeUpdatesStringSliceToAnySlice(mergedExtraPaths)
	}
	if len(branch) == 0 {
		return nil
	}
	return map[string]any{"basedpyright": branch}
}

func codeUpdatesTestPythonSettingsBranch(settings map[string]any) map[string]any {
	if settings == nil {
		return map[string]any{}
	}
	languageServer, ok := settings["languageServer"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	basedpyrightSettings, ok := languageServer["basedpyright"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloneCodeUpdatesSettingsMap(basedpyrightSettings)
}

func mergeCodeUpdatesPythonExtraPaths(branch map[string]any, extraPaths []string) []string {
	merged := make([]string, 0, len(extraPaths))
	seen := map[string]struct{}{}

	if analysis, ok := branch["analysis"].(map[string]any); ok {
		if existing, ok := analysis["extraPaths"].([]any); ok {
			for _, rawPath := range existing {
				path, ok := rawPath.(string)
				if !ok {
					continue
				}
				normalizedPath := strings.TrimSpace(path)
				if normalizedPath == "" {
					continue
				}
				normalizedPath = filepath.Clean(normalizedPath)
				if _, ok := seen[normalizedPath]; ok {
					continue
				}
				seen[normalizedPath] = struct{}{}
				merged = append(merged, normalizedPath)
			}
		}
	}

	for _, rawPath := range extraPaths {
		normalizedPath := strings.TrimSpace(rawPath)
		if normalizedPath == "" {
			continue
		}
		normalizedPath = filepath.Clean(normalizedPath)
		if _, ok := seen[normalizedPath]; ok {
			continue
		}
		seen[normalizedPath] = struct{}{}
		merged = append(merged, normalizedPath)
	}
	return merged
}

func codeUpdatesStringSliceToAnySlice(values []string) []any {
	if len(values) == 0 {
		return nil
	}
	converted := make([]any, len(values))
	for index, value := range values {
		converted[index] = value
	}
	return converted
}

func cloneCodeUpdatesSettingsMap(values map[string]any) map[string]any {
	if values == nil {
		return map[string]any{}
	}
	payload, err := json.Marshal(values)
	if err != nil {
		return map[string]any{}
	}
	var cloned map[string]any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return map[string]any{}
	}
	return cloned
}
