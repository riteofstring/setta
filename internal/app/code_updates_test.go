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
	"setta/internal/lsp"
	"setta/internal/lspsignature"
	"setta/internal/projectstate"
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

	session, err := lsp.NewCurrentProcessPythonSession(lsp.CurrentProcessPythonSessionOptions{
		WorkspaceRoot: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new current-process python session: %v", err)
	}
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
		LSPSync:            synchronizer,
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
