package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/boundcode"
	"setta/internal/lsp"
	"setta/internal/lspsignature"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/testutil/firstpartyplugin"
)

type stubBoundSectionSynchronizer struct {
	calls  []projectstate.WatchCodeBoundSection
	synced bool
}

func (s *stubBoundSectionSynchronizer) SyncWatchCodeBoundSection(
	_ context.Context,
	section projectstate.WatchCodeBoundSection,
) error {
	s.calls = append(s.calls, section)
	s.synced = true
	return nil
}

type orderingCallableSignatureResolver struct {
	syncer    *stubBoundSectionSynchronizer
	callCount int
}

type typeCheckingBoundSectionSynchronizer struct {
	diagnostics *projectstate.LSPDiagnosticsRegistry
}

type syncOnlyBoundSectionSynchronizer struct {
	inner boundSectionSynchronizer
}

func activeWatchCodeCapabilityStateForTest() *watchCodeCapabilityState {
	state := newWatchCodeCapabilityState()
	state.Set(plugins.PluginWatchCodeCapabilities{
		PluginID:      testAppWatchCodeProviderPluginID,
		PluginEnabled: true,
		Python:        true,
	})
	return state
}

func newCurrentProcessLSPSession(t *testing.T, workspaceRoot string) *lsp.Session {
	t.Helper()

	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: workspaceRoot,
		Command:       appTestPythonLanguageServerSpec(t).Command,
		Args:          []string{"--stdio"},
		Environment:   os.Environ(),
	})
	if err != nil {
		t.Fatalf("new current-process lsp session: %v", err)
	}
	return session
}

func appTestPythonLanguageServerSpec(t *testing.T) lsp.LanguageServerSpec {
	t.Helper()

	return lsp.LanguageServerSpec{
		Name:       "basedpyright",
		LanguageID: "python",
		Command:    firstpartyplugin.BasedpyrightLangserverCommand(t),
		Args:       []string{"--stdio"},
	}
}

func (s *orderingCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	s.callCount++
	if s.syncer == nil || !s.syncer.synced {
		return projectstate.CallableSignatureResult{}, false, fmt.Errorf("signature resolver ran before bound section LSP sync")
	}
	return projectstate.CallableSignatureResult{
		Status: projectstate.SignatureHelpStatusMatched,
		Params: []projectstate.CallableParamProposal{
			{Name: "value", PassingStyle: "POSITIONAL_ONLY"},
			{Name: "extra", PassingStyle: "POSITIONAL_ONLY"},
		},
	}, true, nil
}

func (s *typeCheckingBoundSectionSynchronizer) SyncWatchCodeBoundSection(
	_ context.Context,
	_ projectstate.WatchCodeBoundSection,
) error {
	return nil
}

func (s *typeCheckingBoundSectionSynchronizer) TypeCheckProject(
	_ context.Context,
	document projectstate.Document,
	projectID string,
) error {
	if s == nil || s.diagnostics == nil {
		return nil
	}

	project, ok := document.Projects[projectID]
	if !ok {
		return nil
	}
	projectData, _, err := document.WatchCodePluginProjectData(testAppWatchCodeProviderPluginID, projectID)
	if err != nil {
		return err
	}
	entry, ok := projectData.Registry["watch_code_test.cool_fn:function"]
	if !ok || len(entry.SectionIDs) != 1 {
		s.diagnostics.UpdateGeneratedDocument(
			projectID,
			projectstate.GeneratedDiagnosticsDocumentCode,
			projectstate.ProjectConfigDiagnostics{
				ProjectID: projectID,
				Errors:    map[string]projectstate.SectionTypeErrors{},
				IsGenCode: true,
			},
			nil,
		)
		return nil
	}

	sectionID := entry.SectionIDs[0]
	paramIDsByName := watchCodeEntryParamIDsByName(project, entry)
	paramErrors := map[string][]string{}
	for _, paramName := range []string{"a", "b", "c"} {
		paramID, ok := paramIDsByName[paramName]
		if !ok {
			continue
		}
		paramErrors[paramID] = []string{fmt.Sprintf("Arguments missing for parameter %q", paramName)}
	}

	errors := map[string]projectstate.SectionTypeErrors{}
	if len(paramErrors) > 0 {
		errors[sectionID] = projectstate.SectionTypeErrors{
			Params: paramErrors,
		}
	}

	s.diagnostics.UpdateGeneratedDocument(
		projectID,
		projectstate.GeneratedDiagnosticsDocumentCode,
		projectstate.ProjectConfigDiagnostics{
			ProjectID: projectID,
			Errors:    errors,
			IsGenCode: true,
		},
		nil,
	)
	return nil
}

func (s *syncOnlyBoundSectionSynchronizer) SyncWatchCodeBoundSection(
	ctx context.Context,
	section projectstate.WatchCodeBoundSection,
) error {
	if s == nil || s.inner == nil {
		return nil
	}
	return s.inner.SyncWatchCodeBoundSection(ctx, section)
}

// External bound-file reloads must reuse the same LSP-before-Watch-Code path as
// inline edits so signature refetch sees the newly synced source of truth.
func TestCodeUpdateServiceReloadBoundCodeFileSyncsLSPBeforeWatchCodeApply(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeBoundReloadProject(t)
	projectData := projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/bound.py"},
	}.Normalized()

	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		&projectData,
		"section-main",
		workspaceRoot,
		nil,
	); err != nil {
		t.Fatalf("seed watch code bound section update: %v", err)
	}
	initialSignatureHash := projectData.Registry["pkg.bound.watched:function"].SignatureHash

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	syncer := &stubBoundSectionSynchronizer{}
	resolver := &orderingCallableSignatureResolver{syncer: syncer}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          runtime,
		LSPSync:               syncer,
		CallableSignatures:    resolver,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	updatedSource := "def watched(value, extra):\n    return value + extra\n"
	if err := service.ReloadBoundCodeFile(context.Background(), updatedSource, []boundcode.Binding{
		{ProjectID: "project-alpha", SectionID: "section-main"},
	}); err != nil {
		t.Fatalf("reload bound code file: %v", err)
	}

	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}
	if len(syncer.calls) != 1 {
		t.Fatalf("expected one LSP sync call, got %#v", syncer.calls)
	}
	if syncer.calls[0].Code != updatedSource {
		t.Fatalf("expected synced source %q, got %q", updatedSource, syncer.calls[0].Code)
	}

	snapshot := runtime.Snapshot()
	updatedProject := snapshot.Document.Projects["project-alpha"]
	updatedProjectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry := updatedProjectData.Registry["pkg.bound.watched:function"]
	if entry.SignatureHash == initialSignatureHash {
		t.Fatalf("expected updated watch code signature hash, got %#v", entry)
	}

	boundSection, ok, err := updatedProject.ResolveWatchCodeBoundSection(updatedProjectData, "section-main", workspaceRoot)
	if err != nil {
		t.Fatalf("resolve updated bound section: %v", err)
	}
	if !ok {
		t.Fatal("expected updated bound section to stay watch-code eligible")
	}
	if boundSection.Code != updatedSource {
		t.Fatalf("expected updated bound section source %q, got %q", updatedSource, boundSection.Code)
	}
}

func TestCodeUpdateServiceReloadBoundCodeFileSkipsWatchCodeApplyWithoutProvider(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeBoundReloadProject(t)
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

	syncer := &stubBoundSectionSynchronizer{}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          runtime,
		LSPSync:               syncer,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: newWatchCodeCapabilityState(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	updatedSource := "def watched(value, extra):\n    return value + extra\n"
	if err := service.ReloadBoundCodeFile(context.Background(), updatedSource, []boundcode.Binding{
		{ProjectID: "project-alpha", SectionID: "section-main"},
	}); err != nil {
		t.Fatalf("reload bound code file: %v", err)
	}

	target, err := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve reloaded bound section: %v", err)
	}
	if target.Code != updatedSource {
		t.Fatalf("expected bound section code to update without provider, got %q", target.Code)
	}
	project = runtime.Snapshot().Document.Projects["project-alpha"]
	projectData := readAppWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if len(projectData.Registry) != 0 || len(projectData.BaselineByPath) != 0 {
		t.Fatalf("expected watch code state to remain inert without provider, got registry %#v baseline %#v", projectData.Registry, projectData.BaselineByPath)
	}
	if len(syncer.calls) != 0 {
		t.Fatalf("did not expect LSP sync without provider, got %#v", syncer.calls)
	}
}

func TestCodeUpdateServiceSetCodeResolvesParamsForSecondWatchCodeCallable(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir setta_files root: %v", err)
	}

	session := newCurrentProcessLSPSession(t, workspaceRoot)
	t.Cleanup(func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close lsp session: %v", err)
		}
	})

	lspService := lsp.NewService(session)
	synchronizer, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        lspService,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}
	signatures, err := lspsignature.NewService(lspsignature.ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		LSPService:     lspService,
	})
	if err != nil {
		t.Fatalf("new lsp signature service: %v", err)
	}

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntime(watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               &syncOnlyBoundSectionSynchronizer{inner: synchronizer},
		CallableSignatures:    signatures,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	firstSource := "def cool_fn(a, b, c):\n    return a + b + c\n"
	if err := service.SetCode(ctx, "project-alpha", "section-main", firstSource); err != nil {
		t.Fatalf("set first watch-code source: %v", err)
	}
	firstSnapshot := projectRuntime.Snapshot()
	firstProject := firstSnapshot.Document.Projects["project-alpha"]
	firstProjectData := readAppWatchCodePluginProjectData(t, firstSnapshot.Document, "project-alpha")
	firstCoolEntry, ok := firstProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after first update, got %#v", firstProjectData.Registry)
	}
	firstTarget, ok, err := firstProject.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("resolve python codegen target after first update: %v", err)
	}
	if !ok {
		t.Fatal("expected python codegen target after first update")
	}
	if !strings.Contains(firstTarget.GenCodePrefix, "from watch_code_test import cool_fn") {
		t.Fatalf("expected cool_fn import in gen code prefix, got %q", firstTarget.GenCodePrefix)
	}
	directSignature, err := lspService.SignatureHelpSnapshot(ctx, lsp.SnapshotSignatureHelpRequest{
		ReferencePath: filepath.Join(settaFilesRoot, projectstate.GeneratedPythonCodeRelativePath(firstProject.Name)),
		LanguageID:    "python",
		Content:       "from watch_code_test import cool_fn\nvalue = cool_fn(\n",
		Line:          1,
		Character:     len("value = cool_fn("),
	})
	if err != nil {
		t.Fatalf("direct signature help snapshot after first update: %v", err)
	}
	if len(directSignature.Signatures) != 1 {
		t.Fatalf("expected direct signature help match after first update, got %#v", directSignature)
	}
	firstSignature, signatureOK, err := signatures.ResolveCallableSignature(
		ctx,
		firstProject,
		firstCoolEntry.SectionIDs[0],
		firstCoolEntry.CallableName,
	)
	if err != nil {
		t.Fatalf("resolve cool_fn signature from updated project: %v", err)
	}
	if !signatureOK {
		t.Fatal("expected cool_fn signature request to be available after first update")
	}
	if firstSignature.Status != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected cool_fn signature to match after first update, got %#v", firstSignature)
	}
	if got := watchCodeEntryParamNames(t, firstProject, firstCoolEntry); !equalStrings(got, []string{"a", "b", "c"}) {
		t.Fatalf("expected cool_fn params [a b c] after first update, got %#v", got)
	}

	secondSource := "def cool_fn(a, b, c, d):\n    print('hello')\n\n\ndef another_fn(e, f, g):\n    pass\n"
	if err := service.SetCode(ctx, "project-alpha", "section-main", secondSource); err != nil {
		t.Fatalf("set second watch-code source: %v", err)
	}

	updatedSnapshot := projectRuntime.Snapshot()
	updatedProject := updatedSnapshot.Document.Projects["project-alpha"]
	updatedProjectData := readAppWatchCodePluginProjectData(t, updatedSnapshot.Document, "project-alpha")

	coolEntry, ok := updatedProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", updatedProjectData.Registry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, coolEntry); !equalStrings(got, []string{"a", "b", "c", "d"}) {
		t.Fatalf("expected cool_fn params [a b c d], got %#v", got)
	}

	anotherEntry, ok := updatedProjectData.Registry["watch_code_test.another_fn:function"]
	if !ok {
		t.Fatalf("expected another_fn watch code entry, got %#v", updatedProjectData.Registry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, anotherEntry); !equalStrings(got, []string{"e", "f", "g"}) {
		t.Fatalf("expected another_fn params [e f g], got %#v", got)
	}
}

func TestCodeUpdateServiceSetCodeSkipsWatchCodeApplyWithoutProvider(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
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
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	syncer := &stubBoundSectionSynchronizer{}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               syncer,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: newWatchCodeCapabilityState(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	updatedSource := "def cool_fn(a, b, c):\n    return a + b + c\n"
	if err := service.SetCode(context.Background(), "project-alpha", "section-main", updatedSource); err != nil {
		t.Fatalf("set bound watch-code source without provider: %v", err)
	}

	target, err := projectRuntime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve updated bound section: %v", err)
	}
	if target.Code != updatedSource {
		t.Fatalf("expected section code to update without provider, got %q", target.Code)
	}
	updatedProjectData := readAppWatchCodePluginProjectData(t, projectRuntime.Snapshot().Document, "project-alpha")
	if len(updatedProjectData.Registry) != 0 || len(updatedProjectData.BaselineByPath) != 0 {
		t.Fatalf("expected watch code state to remain inert without provider, got registry %#v baseline %#v", updatedProjectData.Registry, updatedProjectData.BaselineByPath)
	}
	if len(syncer.calls) != 0 {
		t.Fatalf("did not expect LSP sync without provider, got %#v", syncer.calls)
	}
}

func TestCodeUpdateServiceSetCodePopulatesBoundWatchCodeParamsWithoutSignatureResolver(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntime(watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	ctx := context.Background()
	recordedStates := []string{
		"def cool_fn",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c): pass\n",
		"def cool_fn(a,b,c): pass\n\ndef another_cool_fn",
		"def cool_fn(a,b,c): pass\n\ndef another_cool_fn(e,f,g)",
		"def cool_fn(a,b,c): pass\n\ndef another_cool_fn(e,f,g):",
		"def cool_fn(a,b,c): pass\n\ndef another_cool_fn(e,f,g): pass\n",
	}
	for _, state := range recordedStates {
		if err := service.SetCode(ctx, "project-alpha", "section-main", state); err != nil {
			t.Fatalf("set recorded watch-code state %q: %v", state, err)
		}
	}

	updatedSnapshot := projectRuntime.Snapshot()
	updatedProject := updatedSnapshot.Document.Projects["project-alpha"]
	updatedProjectData := readAppWatchCodePluginProjectData(t, updatedSnapshot.Document, "project-alpha")
	coolEntry, ok := updatedProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", updatedProjectData.Registry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, coolEntry); !equalStrings(got, []string{"a", "b", "c"}) {
		t.Fatalf("expected cool_fn params [a b c], got %#v", got)
	}

	anotherEntry, ok := updatedProjectData.Registry["watch_code_test.another_cool_fn:function"]
	if !ok {
		t.Fatalf("expected another_cool_fn watch code entry, got %#v", updatedProjectData.Registry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, anotherEntry); !equalStrings(got, []string{"e", "f", "g"}) {
		t.Fatalf("expected another_cool_fn params [e f g], got %#v", got)
	}
}

func TestCodeUpdateServiceSetCodeReconcilesGeneratedPythonSectionForBoundWatchCode(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(
		watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()),
		projectstate.RuntimeOptions{
			PythonCodegenSectionReconciler: testCodeUpdateGeneratedPythonSectionReconciler(),
		},
	)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.SetCode(context.Background(), "project-alpha", "section-main", "def cool_fn(a, b, c):\n    return a + b + c\n"); err != nil {
		t.Fatalf("set bound watch-code source: %v", err)
	}

	updatedProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if _, ok := updatedProject.Sections[projectstate.GeneratedPythonCodeSectionID]; !ok {
		t.Fatalf("expected reconciled generated python section, got %#v", updatedProject.Sections)
	}
	generatedCode := generatedSectionCode(t, updatedProject)
	if !strings.Contains(generatedCode, "from watch_code_test import cool_fn") {
		t.Fatalf("expected generated python import for cool_fn, got %q", generatedCode)
	}
}

func TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallable(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	harness := openPersistedBoundWatchCodeDiagnosticsHarness(t)
	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c): p",
		"def cool_fn(a,b,c): pa",
		"def cool_fn(a,b,c): pas",
		"def cool_fn(a,b,c): pass\n",
	}

	finalSnapshot := harness.applyRecordedStates(t, ctx, recordedStates)
	finalProject := finalSnapshot.Document.Projects["project-alpha"]
	finalProjectData := readAppWatchCodePluginProjectData(t, finalSnapshot.Document, "project-alpha")
	entry, ok := finalProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after recorded typing, got %#v", finalProjectData.Registry)
	}
	sectionID := entry.SectionIDs[0]

	waitForAppCondition(t, 10*time.Second, func() bool {
		payload := harness.diagnostics.Snapshot("project-alpha")
		sectionErrors, ok := payload.GenCode.Errors[sectionID]
		if ok && len(sectionErrors.Params) > 0 {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	payload := harness.diagnostics.Snapshot("project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, finalProject, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q, got payload %#v", paramName, payload.GenCode.Errors)
		}
	}
}

func TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallableWithoutRematerialize(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	harness := openBoundWatchCodeDiagnosticsHarness(t)
	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c): print(\"dog\")\n",
	}
	for _, state := range recordedStates {
		if err := harness.service.SetCode(ctx, "project-alpha", "section-main", state); err != nil {
			t.Fatalf("set recorded watch-code state %q: %v", state, err)
		}
	}

	finalSnapshot := harness.projectRuntime.Snapshot()
	finalProject := finalSnapshot.Document.Projects["project-alpha"]
	finalProjectData := readAppWatchCodePluginProjectData(t, finalSnapshot.Document, "project-alpha")
	entry, ok := finalProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after recorded typing, got %#v", finalProjectData.Registry)
	}
	sectionID := entry.SectionIDs[0]

	waitForAppCondition(t, 10*time.Second, func() bool {
		payload := harness.diagnostics.Snapshot("project-alpha")
		sectionErrors, ok := payload.GenCode.Errors[sectionID]
		if ok && len(sectionErrors.Params) > 0 {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	payload := harness.diagnostics.Snapshot("project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, finalProject, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q without rematerialize, got payload %#v", paramName, payload.GenCode.Errors)
		}
	}
}

func TestCodeUpdateServiceSetCodeDoesNotLeaveGeneratedImportErrorForBoundWatchCodeModule(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	harness := openBoundWatchCodeDiagnosticsHarness(t)
	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c): pass\n",
	}

	harness.applyRecordedStates(t, ctx, recordedStates)
	waitForAppCondition(t, 10*time.Second, func() bool {
		payload := harness.diagnostics.Snapshot("project-alpha")
		return generatedDiagnosticsContain(payload, "watch_code_test") || len(payload.UnmappedGenCode) > 0 || len(payload.GenCode.Errors) > 0
	})

	payload := harness.diagnostics.Snapshot("project-alpha")
	if generatedDiagnosticsContain(payload, "watch_code_test") {
		t.Fatalf("did not expect generated python diagnostics to keep unresolved watch_code_test import, got %#v", payload)
	}
}

func TestCodeUpdateServiceSetCodeRefreshesProjectDiagnosticsAfterBoundWatchCodeSignatureChange(t *testing.T) {
	t.Parallel()

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntime(watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	syncer := &typeCheckingBoundSectionSynchronizer{diagnostics: diagnostics}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               syncer,
		WorkspaceRoot:         t.TempDir(),
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.SetCode(context.Background(), "project-alpha", "section-main", "def cool_fn():\n    print(\"hello\")\n"); err != nil {
		t.Fatalf("set initial bound watch-code source: %v", err)
	}
	if err := service.SetCode(context.Background(), "project-alpha", "section-main", "def cool_fn(a, b, c):\n    print(\"hello\")\n"); err != nil {
		t.Fatalf("set updated bound watch-code source: %v", err)
	}

	finalSnapshot := projectRuntime.Snapshot()
	finalProject := finalSnapshot.Document.Projects["project-alpha"]
	finalProjectData := readAppWatchCodePluginProjectData(t, finalSnapshot.Document, "project-alpha")
	entry, ok := finalProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after signature change, got %#v", finalProjectData.Registry)
	}

	payload := diagnostics.Snapshot("project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, finalProject, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected refreshed generated diagnostics for %q after bound watch-code signature change, got %#v", paramName, payload.GenCode.Errors)
		}
	}
}

func TestCodeUpdateServiceReloadBoundCodeFileRefreshesProjectDiagnosticsAfterBoundWatchCodeSignatureChange(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	projectRuntime, err := projectstate.OpenOverlayRuntime(watchCodeTestDocument(t, project, watchCodeConfiguredProjectData()))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	syncer := &typeCheckingBoundSectionSynchronizer{diagnostics: diagnostics}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          projectRuntime,
		LSPSync:               syncer,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.ReloadBoundCodeFile(context.Background(), "def cool_fn():\n    print(\"hello\")\n", []boundcode.Binding{
		{ProjectID: "project-alpha", SectionID: "section-main"},
	}); err != nil {
		t.Fatalf("reload initial bound watch-code source: %v", err)
	}
	if err := service.ReloadBoundCodeFile(context.Background(), "def cool_fn(a, b, c):\n    print(\"hello\")\n", []boundcode.Binding{
		{ProjectID: "project-alpha", SectionID: "section-main"},
	}); err != nil {
		t.Fatalf("reload updated bound watch-code source: %v", err)
	}

	finalSnapshot := projectRuntime.Snapshot()
	finalProject := finalSnapshot.Document.Projects["project-alpha"]
	finalProjectData := readAppWatchCodePluginProjectData(t, finalSnapshot.Document, "project-alpha")
	entry, ok := finalProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after reload signature change, got %#v", finalProjectData.Registry)
	}

	payload := diagnostics.Snapshot("project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, finalProject, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected refreshed generated diagnostics for %q after reload signature change, got %#v", paramName, payload.GenCode.Errors)
		}
	}
}

func TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsWhenWatchCodeSignatureChangesWithoutGeneratedCodeDiff(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	harness := openBoundWatchCodeDiagnosticsHarness(t)
	initialSource := "def cool_fn():\n    print(\"hello\")\n"
	if err := harness.service.SetCode(ctx, "project-alpha", "section-main", initialSource); err != nil {
		t.Fatalf("set initial bound watch-code source: %v", err)
	}
	harness.materializeSnapshot(t, ctx)

	initialProject := harness.projectRuntime.Snapshot().Document.Projects["project-alpha"]
	initialGeneratedPath := filepath.Join(harness.settaFilesRoot, projectstate.GeneratedPythonCodeRelativePath(initialProject.Name))
	initialGeneratedCode, err := os.ReadFile(initialGeneratedPath)
	if err != nil {
		t.Fatalf("read initial generated python: %v", err)
	}

	updatedSource := "def cool_fn(a, b, c):\n    print(\"hello\")\n"
	if err := harness.service.SetCode(ctx, "project-alpha", "section-main", updatedSource); err != nil {
		t.Fatalf("set updated bound watch-code source: %v", err)
	}
	harness.materializeSnapshot(t, ctx)

	finalSnapshot := harness.projectRuntime.Snapshot()
	finalProject := finalSnapshot.Document.Projects["project-alpha"]
	finalGeneratedPath := filepath.Join(harness.settaFilesRoot, projectstate.GeneratedPythonCodeRelativePath(finalProject.Name))
	finalGeneratedCode, err := os.ReadFile(finalGeneratedPath)
	if err != nil {
		t.Fatalf("read updated generated python: %v", err)
	}
	if string(initialGeneratedCode) != string(finalGeneratedCode) {
		t.Fatalf("expected generated python to stay text-identical across signature-only update:\nold:\n%s\nnew:\n%s", string(initialGeneratedCode), string(finalGeneratedCode))
	}

	finalProjectData := readAppWatchCodePluginProjectData(t, finalSnapshot.Document, "project-alpha")
	entry, ok := finalProjectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after signature-only update, got %#v", finalProjectData.Registry)
	}
	sectionID := entry.SectionIDs[0]

	waitForAppCondition(t, 5*time.Second, func() bool {
		payload := harness.diagnostics.Snapshot("project-alpha")
		sectionErrors, ok := payload.GenCode.Errors[sectionID]
		return ok && len(sectionErrors.Params) > 0
	})

	payload := harness.diagnostics.Snapshot("project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, finalProject, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q after signature-only update, got payload %#v", paramName, payload.GenCode.Errors)
		}
	}
}

func TestCodeUpdateServiceFormatCodeFormatsPythonSection(t *testing.T) {
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

	if err := service.FormatCode(context.Background(), "project-alpha", "section-main"); err != nil {
		t.Fatalf("format code: %v", err)
	}

	target, err := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve formatted code section: %v", err)
	}
	if strings.TrimSpace(target.Code) != "x = 1" {
		t.Fatalf("expected formatted python code, got %q", target.Code)
	}
}

func TestCodeUpdateServiceFormatCodeRejectsReadOnlyBinding(t *testing.T) {
	t.Parallel()

	project := codeUpdateTestProject(t, projectstate.CodeFileAccessModeReadOnly)
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

	err = service.FormatCode(context.Background(), "project-alpha", "section-main")
	if !errors.Is(err, projectstate.ErrCodeSectionReadOnly) {
		t.Fatalf("expected read-only error, got %v", err)
	}

	target, err := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve code section after read-only failure: %v", err)
	}
	if target.Code != "x=1\n" {
		t.Fatalf("expected unchanged read-only code, got %q", target.Code)
	}
}

func TestCodeUpdateServiceFormatCodeFormatsGeneratedPythonTarget(t *testing.T) {
	addRepoVenvRuffToPath(t)

	project := generatedPythonFormatProject(t, "x=1\n", "y=2\n")

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
		t.Fatalf("format generated python code: %v", err)
	}

	target, err := runtime.Snapshot().Document.ResolveFormatCodeTarget("project-alpha", projectstate.GeneratedPythonCodeSectionID)
	if err != nil {
		t.Fatalf("resolve formatted generated python target: %v", err)
	}
	if strings.TrimSpace(target.GenCodePrefix) != "x = 1" {
		t.Fatalf("expected formatted gen code prefix, got %q", target.GenCodePrefix)
	}
	if strings.TrimSpace(target.GenCodeSuffix) != "y = 2" {
		t.Fatalf("expected formatted gen code suffix, got %q", target.GenCodeSuffix)
	}
}

func TestCodeUpdateServiceFormatCodeUpdatesWatchCodeRegistry(t *testing.T) {
	addRepoVenvRuffToPath(t)

	workspaceRoot := t.TempDir()
	project := watchCodeBoundReloadProject(t)
	if _, err := project.SetBoundCodeSectionContent("section-main", "def watched( value, extra ):\n    return value + extra\n"); err != nil {
		t.Fatalf("seed unformatted bound code content: %v", err)
	}

	projectData := watchCodeConfiguredProjectData()
	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		&projectData,
		"section-main",
		workspaceRoot,
		nil,
	); err != nil {
		t.Fatalf("seed watch code bound section update: %v", err)
	}
	runtime, err := projectstate.OpenOverlayRuntime(watchCodeTestDocument(t, project, projectData))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          runtime,
		WorkspaceRoot:         workspaceRoot,
		WatchCodeCapabilities: activeWatchCodeCapabilityStateForTest(),
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.FormatCode(context.Background(), "project-alpha", "section-main"); err != nil {
		t.Fatalf("format bound watch code section: %v", err)
	}

	snapshot := runtime.Snapshot()
	projectData = readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["pkg.bound.watched:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry after formatting, got %#v", projectData.Registry)
	}
	if entry.CallableName != "watched" {
		t.Fatalf("expected watch code callable name watched, got %#v", entry)
	}

	target, err := snapshot.Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve formatted bound section: %v", err)
	}
	if !strings.Contains(target.Code, "def watched(value, extra):") {
		t.Fatalf("expected formatted bound code, got %q", target.Code)
	}
}
