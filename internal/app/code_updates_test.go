package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/boundcode"
	"setta/internal/codegen"
	"setta/internal/lsp"
	"setta/internal/lspsignature"
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

func codeUpdatesTestBasedpyrightSettings(extraPaths []string) map[string]any {
	return codeUpdatesTestPythonSettings(map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"diagnosticSeverityOverrides": map[string]any{
					"reportUnknownVariableType":       "none",
					"reportUnknownMemberType":         "none",
					"reportUnannotatedClassAttribute": "none",
					"reportSelfClsParameterName":      "none",
				},
			},
		},
	}, extraPaths)
}

func newCurrentProcessLSPSession(t *testing.T, workspaceRoot string) *lsp.Session {
	t.Helper()

	pythonBinary := firstpartyplugin.BasedpyrightLangserverCommand(t)
	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: workspaceRoot,
		Command:       pythonBinary,
		Args:          []string{"--stdio"},
		Environment:   os.Environ(),
	})
	if err != nil {
		t.Fatalf("new current-process lsp session: %v", err)
	}
	return session
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
	entry, ok := project.WatchCodeRegistry["watch_code_test.cool_fn:function"]
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

	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		"section-main",
		workspaceRoot,
		nil,
	); err != nil {
		t.Fatalf("seed watch code bound section update: %v", err)
	}
	initialSignatureHash := project.WatchCodeRegistry["pkg.bound.watched:function"].SignatureHash

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
	resolver := &orderingCallableSignatureResolver{syncer: syncer}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:       runtime,
		LSPSync:            syncer,
		CallableSignatures: resolver,
		WorkspaceRoot:      workspaceRoot,
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
	entry := updatedProject.WatchCodeRegistry["pkg.bound.watched:function"]
	if entry.SignatureHash == initialSignatureHash {
		t.Fatalf("expected updated watch code signature hash, got %#v", entry)
	}

	boundSection, ok, err := updatedProject.ResolveWatchCodeBoundSection("section-main", workspaceRoot)
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:       projectRuntime,
		LSPSync:            &syncOnlyBoundSectionSynchronizer{inner: synchronizer},
		CallableSignatures: signatures,
		WorkspaceRoot:      workspaceRoot,
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
	firstProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	firstCoolEntry, ok := firstProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after first update, got %#v", firstProject.WatchCodeRegistry)
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

	updatedProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]

	coolEntry, ok := updatedProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", updatedProject.WatchCodeRegistry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, coolEntry); !equalStrings(got, []string{"a", "b", "c", "d"}) {
		t.Fatalf("expected cool_fn params [a b c d], got %#v", got)
	}

	anotherEntry, ok := updatedProject.WatchCodeRegistry["watch_code_test.another_fn:function"]
	if !ok {
		t.Fatalf("expected another_fn watch code entry, got %#v", updatedProject.WatchCodeRegistry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, anotherEntry); !equalStrings(got, []string{"e", "f", "g"}) {
		t.Fatalf("expected another_fn params [e f g], got %#v", got)
	}
}

func TestCodeUpdateServiceSetCodePopulatesBoundWatchCodeParamsWithoutSignatureResolver(t *testing.T) {
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

	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:  projectRuntime,
		WorkspaceRoot: workspaceRoot,
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

	updatedProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	coolEntry, ok := updatedProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", updatedProject.WatchCodeRegistry)
	}
	if got := watchCodeEntryParamNames(t, updatedProject, coolEntry); !equalStrings(got, []string{"a", "b", "c"}) {
		t.Fatalf("expected cool_fn params [a b c], got %#v", got)
	}

	anotherEntry, ok := updatedProject.WatchCodeRegistry["watch_code_test.another_cool_fn:function"]
	if !ok {
		t.Fatalf("expected another_cool_fn watch code entry, got %#v", updatedProject.WatchCodeRegistry)
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
		projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				project.ID: project,
			},
		},
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
		ProjectState:  projectRuntime,
		WorkspaceRoot: workspaceRoot,
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
	entry, ok := finalProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after recorded typing, got %#v", finalProject.WatchCodeRegistry)
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
	entry, ok := finalProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after recorded typing, got %#v", finalProject.WatchCodeRegistry)
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

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	syncer := &typeCheckingBoundSectionSynchronizer{diagnostics: diagnostics}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:  projectRuntime,
		LSPSync:       syncer,
		WorkspaceRoot: t.TempDir(),
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

	finalProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	entry, ok := finalProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after signature change, got %#v", finalProject.WatchCodeRegistry)
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

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	syncer := &typeCheckingBoundSectionSynchronizer{diagnostics: diagnostics}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:  projectRuntime,
		LSPSync:       syncer,
		WorkspaceRoot: workspaceRoot,
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

	finalProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	entry, ok := finalProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after reload signature change, got %#v", finalProject.WatchCodeRegistry)
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

	entry, ok := finalProject.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after signature-only update, got %#v", finalProject.WatchCodeRegistry)
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

	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		"section-main",
		workspaceRoot,
		nil,
	); err != nil {
		t.Fatalf("seed watch code bound section update: %v", err)
	}
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
		ProjectState:  runtime,
		WorkspaceRoot: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	if err := service.FormatCode(context.Background(), "project-alpha", "section-main"); err != nil {
		t.Fatalf("format bound watch code section: %v", err)
	}

	snapshot := runtime.Snapshot()
	entry, ok := snapshot.Document.Projects["project-alpha"].WatchCodeRegistry["pkg.bound.watched:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry after formatting, got %#v", snapshot.Document.Projects["project-alpha"].WatchCodeRegistry)
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

func watchCodeBoundProject(t *testing.T, bindingPath string, initialCode string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		WatchCodeEnabled: true,
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
		AdditionalSpecs: []lsp.LanguageServerSpec{codeUpdatesTestPythonLanguageServerSpec(t)},
		Settings: func() map[string]any {
			return codeUpdatesTestBasedpyrightSettings([]string{settaFilesRoot})
		},
	})
	if err != nil {
		t.Fatalf("new lsp router: %v", err)
	}
	synchronizer, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		Service:        lspRouter,
		Diagnostics:    diagnostics,
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
		projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				project.ID: project,
			},
		},
		projectstate.RuntimeOptions{
			PythonCodegenSectionReconciler: materializer,
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
		ProjectState:       projectRuntime,
		LSPSync:            synchronizer,
		CallableSignatures: signatures,
		WorkspaceRoot:      workspaceRoot,
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
		AdditionalSpecs: []lsp.LanguageServerSpec{codeUpdatesTestPythonLanguageServerSpec(t)},
		Settings: func() map[string]any {
			return codeUpdatesTestBasedpyrightSettings([]string{settaFilesRoot})
		},
	})
	if err != nil {
		t.Fatalf("new lsp router: %v", err)
	}
	synchronizer, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    workspaceRoot,
		Service:        lspRouter,
		Diagnostics:    diagnostics,
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
	if err := store.Save(context.Background(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}); err != nil {
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
		ProjectState:       projectRuntime,
		LSPSync:            synchronizer,
		CallableSignatures: signatures,
		WorkspaceRoot:      workspaceRoot,
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
	return lsp.BuildBasedpyrightSettingsRoot(settings, extraPaths)
}

func codeUpdatesTestPythonLanguageServerSpec(t *testing.T) lsp.LanguageServerSpec {
	t.Helper()

	settingsKey := "basedpyright"
	return lsp.LanguageServerSpec{
		PluginID:    "setta-basedpyright",
		Name:        "basedpyright",
		LanguageID:  "python",
		Command:     firstpartyplugin.BasedpyrightLangserverCommand(t),
		Args:        []string{"--stdio"},
		SettingsKey: &settingsKey,
	}
}
