package lsp

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

type recordingDocumentSyncer struct {
	synced     map[string]SyncedDocument
	refreshed  map[string]SyncedDocument
	upserted   []SyncedDocument
	closeCalls int
}

func (s *recordingDocumentSyncer) SyncDocuments(_ context.Context, documents map[string]SyncedDocument) error {
	s.synced = cloneSyncedDocuments(documents)
	return nil
}

func (s *recordingDocumentSyncer) RefreshDocuments(_ context.Context, documents map[string]SyncedDocument) error {
	s.refreshed = cloneSyncedDocuments(documents)
	return nil
}

func (s *recordingDocumentSyncer) UpsertDocument(_ context.Context, document SyncedDocument) error {
	s.upserted = append(s.upserted, document)
	return nil
}

func (s *recordingDocumentSyncer) Close(context.Context) error {
	s.closeCalls += 1
	return nil
}

// The project synchronizer should write active Python code sections to their
// canonical bindings, include generated Python outputs, and push the resulting
// document set through the live LSP service.
func TestProjectSynchronizerMaterializeDocument(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	pythonBinary := resolveTestPythonBinary(t)
	session := newFixtureSession(t, pythonBinary, settaFilesRoot)
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        NewService(session),
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, sectionPath, generatedPath, metadataPath := lspTestDocument(t, settaFilesRoot)
	if err := statefs.AtomicWriteFile(generatedPath, []byte("class SettaState:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write generated code: %v", err)
	}
	if err := statefs.AtomicWriteFile(metadataPath, []byte("METADATA = {}\n"), 0o644); err != nil {
		t.Fatalf("write generated metadata: %v", err)
	}

	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize document: %v", err)
	}

	sectionCode, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read section code file: %v", err)
	}
	if string(sectionCode) != "print('runner')\n" {
		t.Fatalf("unexpected section code content %q", string(sectionCode))
	}

	if _, err := os.Stat(generatedPath); err != nil {
		t.Fatalf("generated code file missing: %v", err)
	}
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("generated metadata file missing: %v", err)
	}
}

func TestProjectSynchronizerTypeCheckProjectLogsDebugSummary(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	document, sectionPath, generatedPath, metadataPath := lspTestDocument(t, settaFilesRoot)
	if err := statefs.AtomicWriteFile(sectionPath, []byte("print('runner')\n"), 0o644); err != nil {
		t.Fatalf("write section code: %v", err)
	}
	if err := statefs.AtomicWriteFile(generatedPath, []byte("class SettaState:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write generated code: %v", err)
	}
	if err := statefs.AtomicWriteFile(metadataPath, []byte("METADATA = {}\n"), 0o644); err != nil {
		t.Fatalf("write generated metadata: %v", err)
	}

	var buffer bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug}))
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        &recordingDocumentSyncer{},
		Logger:         logger,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	if err := synchronizer.TypeCheckProject(context.Background(), document, "project-alpha"); err != nil {
		t.Fatalf("typecheck project: %v", err)
	}

	output := buffer.String()
	if !strings.Contains(output, `"trace_event":"lsp_project_typecheck_refresh"`) {
		t.Fatalf("expected typecheck refresh trace event in log output, got %q", output)
	}
	if !strings.Contains(output, `"project_id":"project-alpha"`) {
		t.Fatalf("expected project id in log output, got %q", output)
	}
	if !strings.Contains(output, sectionPath) {
		t.Fatalf("expected section path in log output, got %q", output)
	}
}

// File-backed Python sections should keep their on-disk source when the
// current project snapshot carries only binding metadata.
func TestProjectSynchronizerPreservesDiskBackedPythonSectionContent(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	pythonBinary := resolveTestPythonBinary(t)
	session := newFixtureSession(t, pythonBinary, settaFilesRoot)
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        NewService(session),
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, sectionPath := lspDiskBackedTestDocument(t, settaFilesRoot)
	if err := statefs.AtomicWriteFile(sectionPath, []byte("print('from disk')\n"), 0o644); err != nil {
		t.Fatalf("write disk-backed section file: %v", err)
	}

	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize document: %v", err)
	}

	sectionCode, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read section code file: %v", err)
	}
	if string(sectionCode) != "print('from disk')\n" {
		t.Fatalf("unexpected disk-backed section code content %q", string(sectionCode))
	}
}

// Bound watch-code edits must refresh both the workspace file and the
// setta_files mirror so snapshot-based signature help does not import a stale
// shadow module from setta_files.
func TestProjectSynchronizerSyncWatchCodeBoundSectionKeepsSettaFilesMirrorFreshForSignatureHelp(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(workspaceRoot, "watch_code_test.py")
	staleMirrorPath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	if err := statefs.AtomicWriteFile(staleMirrorPath, []byte("def cool_fn():\n    return 0\n"), 0o644); err != nil {
		t.Fatalf("write stale setta_files mirror: %v", err)
	}

	session, err := NewCurrentProcessPythonSession(CurrentProcessPythonSessionOptions{
		WorkspaceRoot: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new current-process python session: %v", err)
	}
	service := NewService(session)
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        service,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	if err := synchronizer.SyncWatchCodeBoundSection(ctx, projectstate.WatchCodeBoundSection{
		ProjectID:    "project-alpha",
		SectionID:    "section-main",
		RelativePath: "watch_code_test.py",
		SourcePath:   sourcePath,
		Code:         "def cool_fn(a, b, c):\n    return a + b + c\n",
	}); err != nil {
		t.Fatalf("sync watch code bound section: %v", err)
	}

	signatureHelp, err := service.SignatureHelpSnapshot(ctx, SnapshotSignatureHelpRequest{
		ReferencePath: filepath.Join(settaFilesRoot, "code", "sections", "Alpha", "setta_gen.py"),
		LanguageID:    "python",
		Content:       "from watch_code_test import cool_fn\nvalue = cool_fn(\n",
		Line:          1,
		Character:     len("value = cool_fn("),
	})
	if err != nil {
		t.Fatalf("signature help snapshot: %v", err)
	}
	if len(signatureHelp.Signatures) != 1 {
		t.Fatalf("expected one signature, got %#v", signatureHelp.Signatures)
	}
	if got := signatureHelp.Signatures[0].Label; !strings.Contains(got, "a") || !strings.Contains(got, "b") || !strings.Contains(got, "c") {
		t.Fatalf("expected live cool_fn(a, b, c) signature, got %q", got)
	}
	if len(signatureHelp.Signatures[0].Parameters) != 3 {
		t.Fatalf("expected three params from fresh mirror, got %#v", signatureHelp.Signatures[0].Parameters)
	}
}

// Bound watch-code imports also need a real on-disk shadow file under
// setta_files; basedpyright does not reliably resolve a purely in-memory module
// import for signature help when the bound source does not exist on disk.
func TestProjectSynchronizerSyncWatchCodeBoundSectionMaterializesMirrorForNewBoundModule(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(workspaceRoot, "watch_code_test.py")
	mirrorPath := filepath.Join(settaFilesRoot, "watch_code_test.py")

	session, err := NewCurrentProcessPythonSession(CurrentProcessPythonSessionOptions{
		WorkspaceRoot: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new current-process python session: %v", err)
	}
	service := NewService(session)
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        service,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	content := "def cool_fn(a, b, c):\n    return a + b + c\n"
	if err := synchronizer.SyncWatchCodeBoundSection(ctx, projectstate.WatchCodeBoundSection{
		ProjectID:    "project-alpha",
		SectionID:    "section-main",
		RelativePath: "watch_code_test.py",
		SourcePath:   sourcePath,
		Code:         content,
	}); err != nil {
		t.Fatalf("sync watch code bound section: %v", err)
	}

	mirrorBytes, err := os.ReadFile(mirrorPath)
	if err != nil {
		t.Fatalf("read materialized mirror: %v", err)
	}
	if string(mirrorBytes) != content {
		t.Fatalf("expected materialized mirror content %q, got %q", content, string(mirrorBytes))
	}

	signatureHelp, err := service.SignatureHelpSnapshot(ctx, SnapshotSignatureHelpRequest{
		ReferencePath: filepath.Join(settaFilesRoot, "code", "sections", "Alpha", "setta_gen.py"),
		LanguageID:    "python",
		Content:       "from watch_code_test import cool_fn\nvalue = cool_fn(\n",
		Line:          1,
		Character:     len("value = cool_fn("),
	})
	if err != nil {
		t.Fatalf("signature help snapshot: %v", err)
	}
	if len(signatureHelp.Signatures) != 1 {
		t.Fatalf("expected one signature, got %#v", signatureHelp.Signatures)
	}
	if len(signatureHelp.Signatures[0].Parameters) != 3 {
		t.Fatalf("expected three params from materialized mirror, got %#v", signatureHelp.Signatures[0].Parameters)
	}
}

// The synchronizer should upsert both the live workspace path and the
// setta_files mirror, and the mirror should retain a diagnostics callback.
func TestProjectSynchronizerSyncWatchCodeBoundSectionUpsertsWorkspaceAndMirror(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Diagnostics:    projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watch_code_test.py")
	if err := synchronizer.SyncWatchCodeBoundSection(context.Background(), projectstate.WatchCodeBoundSection{
		ProjectID:    "project-alpha",
		SectionID:    "section-main",
		RelativePath: "pkg/watch_code_test.py",
		SourcePath:   sourcePath,
		Code:         "def cool_fn(a, b, c):\n    return a + b + c\n",
		IgnoreState: projectstate.CodeSectionDiagnosticsIgnoreState{
			Muted: true,
		},
	}); err != nil {
		t.Fatalf("sync watch code bound section: %v", err)
	}

	if len(syncer.upserted) != 2 {
		t.Fatalf("expected two upserts, got %#v", syncer.upserted)
	}
	if syncer.upserted[0].Path != sourcePath {
		t.Fatalf("expected workspace upsert first, got %#v", syncer.upserted)
	}
	expectedMirrorPath := filepath.Join(settaFilesRoot, "pkg", "watch_code_test.py")
	if syncer.upserted[1].Path != expectedMirrorPath {
		t.Fatalf("expected mirror upsert path %q, got %#v", expectedMirrorPath, syncer.upserted)
	}
	if syncer.upserted[1].Callback == nil {
		t.Fatal("expected mirror upsert to keep a diagnostics callback")
	}
}

// Non-runnable code sections should still materialize to their canonical files
// so the shared synchronizer path can track and type-check them like other
// bound code sections.
func TestProjectSynchronizerMaterializesNonRunnableCodeSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, sectionPath := lspNonRunnableCodeDocument(t, settaFilesRoot)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize non-runnable code document: %v", err)
	}

	sectionCode, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read non-runnable code file: %v", err)
	}
	if string(sectionCode) != "{\"ok\": true}\n" {
		t.Fatalf("unexpected non-runnable code content %q", string(sectionCode))
	}

	tracked, ok := syncer.synced[sectionPath]
	if !ok {
		t.Fatalf("expected tracked non-runnable document at %q, got %#v", sectionPath, syncer.synced)
	}
	if tracked.LanguageID != "json" {
		t.Fatalf("expected tracked languageID json, got %q", tracked.LanguageID)
	}
}

// Code-section callbacks must refresh even when the canonical file content is
// unchanged so later publishes honor newly-muted or newly-suppressed state.
func TestProjectSynchronizerRefreshesCodeSectionDiagnosticsCallbackWithoutContentChanges(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, sectionPath := lspCodeSectionDiagnosticsDocument(t, settaFilesRoot, false)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize code-section diagnostics document: %v", err)
	}

	sectionCode, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read code section file: %v", err)
	}
	params := buildGeneratedPublishDiagnostics(
		t,
		sectionPath,
		string(sectionCode),
		"runner",
		"Bad code",
		"reportFoo",
	)
	version := 1
	params.Version = &version

	tracked, ok := syncer.synced[sectionPath]
	if !ok {
		t.Fatalf("expected tracked code section at %q, got %#v", sectionPath, syncer.synced)
	}
	firstCallback := tracked.Callback
	if firstCallback == nil {
		t.Fatal("expected code section diagnostics callback")
	}
	firstCallback(params)

	initial := diagnostics.Snapshot("project-alpha")
	if len(initial.CodeSections["runner"]) != 1 {
		t.Fatalf("expected initial section diagnostics, got %#v", initial.CodeSections)
	}

	ignoredDocument, ignoredSectionPath := lspCodeSectionDiagnosticsDocument(t, settaFilesRoot, true)
	if ignoredSectionPath != sectionPath {
		t.Fatalf("expected stable section path, got %q then %q", sectionPath, ignoredSectionPath)
	}
	if err := synchronizer.MaterializeDocument(ctx, ignoredDocument); err != nil {
		t.Fatalf("rematerialize ignored code-section diagnostics document: %v", err)
	}

	refreshedTracked, ok := syncer.synced[sectionPath]
	if !ok {
		t.Fatalf("expected refreshed tracked code section at %q, got %#v", sectionPath, syncer.synced)
	}
	refreshedCallback := refreshedTracked.Callback
	if refreshedCallback == nil {
		t.Fatal("expected refreshed code section diagnostics callback")
	}
	refreshedCallback(params)

	filtered := diagnostics.Snapshot("project-alpha")
	if len(filtered.CodeSections) != 0 {
		t.Fatalf("expected refreshed callback to apply section ignore policy, got %#v", filtered.CodeSections)
	}
}

// Code-section diagnostics callbacks should still forward versioned publishes
// into the registry when no ignore policy removes them.
func TestProjectSynchronizerCodeSectionDiagnosticsCallbackUpdatesVersionedPublishes(t *testing.T) {
	t.Parallel()

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer := &ProjectSynchronizer{diagnostics: diagnostics}
	callback := synchronizer.codeSectionDiagnosticsCallback(
		"project-alpha",
		"runner",
		projectstate.CodeSectionDiagnosticsIgnoreState{},
	)
	if callback == nil {
		t.Fatal("expected code section diagnostics callback")
	}

	version := 1
	params := PublishDiagnosticsParams{
		URI:     "file:///tmp/runner.py",
		Version: &version,
		Diagnostics: []Diagnostic{{
			Message:  "Bad code",
			Severity: 1,
			Source:   "pyright",
			Code:     "reportFoo",
		}},
	}
	callback(params)

	snapshot := diagnostics.Snapshot("project-alpha")
	stored := snapshot.CodeSections["runner"]
	if len(stored) != 1 {
		t.Fatalf("expected versioned publish to update diagnostics, got %#v", snapshot.CodeSections)
	}
	if stored[0].Message != "Bad code" {
		t.Fatalf("expected diagnostic message %q, got %#v", "Bad code", stored[0])
	}
	if code, ok := stored[0].Code.(string); !ok || code != "reportFoo" {
		t.Fatalf("expected diagnostic code %q, got %#v", "reportFoo", stored[0].Code)
	}
	if stored[0].URI == nil || *stored[0].URI != "file:///tmp/runner.py" {
		t.Fatalf("expected diagnostic URI %q, got %#v", "file:///tmp/runner.py", stored[0].URI)
	}
}

// Code-section diagnostics should ignore versionless publishes instead of
// treating them as the latest live snapshot.
func TestProjectSynchronizerIgnoresVersionlessCodeSectionDiagnosticsPublishes(t *testing.T) {
	t.Parallel()

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer := &ProjectSynchronizer{diagnostics: diagnostics}
	callback := synchronizer.codeSectionDiagnosticsCallback(
		"project-alpha",
		"runner",
		projectstate.CodeSectionDiagnosticsIgnoreState{},
	)
	if callback == nil {
		t.Fatal("expected code section diagnostics callback")
	}

	callback(PublishDiagnosticsParams{
		URI: "file:///tmp/runner.py",
		Diagnostics: []Diagnostic{{
			Message:  "Bad code",
			Severity: 1,
			Source:   "pyright",
			Code:     "reportFoo",
		}},
	})

	snapshot := diagnostics.Snapshot("project-alpha")
	if len(snapshot.CodeSections) != 0 {
		t.Fatalf("expected versionless publish to be ignored, got %#v", snapshot.CodeSections)
	}
}

// Generated-code callbacks must refresh even when the rendered Python file is
// unchanged so updated ignore policies take effect without forcing content
// churn in the tracked LSP document set.
func TestProjectSynchronizerRefreshesGeneratedDiagnosticsCallbackWithoutContentChanges(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, generatedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, true, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize generated diagnostics document: %v", err)
	}

	generatedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read generated code file: %v", err)
	}
	params := buildGeneratedPublishDiagnostics(t, generatedPath, string(generatedCode), "unknown_symbol", "unknown_symbol is not defined", "reportUndefinedVariable")

	tracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	firstCallback := tracked.Callback
	if firstCallback == nil {
		t.Fatal("expected generated code diagnostics callback")
	}
	firstCallback(params)

	initial := diagnostics.Snapshot("project-alpha")
	if initial.GenCode.Errors["section-1"].Params["param-1"][0] != "unknown_symbol is not defined" {
		t.Fatalf("expected mapped generated param error, got %#v", initial.GenCode.Errors)
	}

	ignoredDocument, ignoredGeneratedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, true, true)
	if ignoredGeneratedPath != generatedPath {
		t.Fatalf("expected stable generated path, got %q then %q", generatedPath, ignoredGeneratedPath)
	}
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, ignoredDocument)
	ignoredGeneratedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read ignored generated code file: %v", err)
	}
	if string(ignoredGeneratedCode) != string(generatedCode) {
		t.Fatalf("expected ignore-only update to keep generated code stable:\nold:\n%s\nnew:\n%s", string(generatedCode), string(ignoredGeneratedCode))
	}
	if err := synchronizer.MaterializeDocument(ctx, ignoredDocument); err != nil {
		t.Fatalf("rematerialize ignored generated diagnostics document: %v", err)
	}

	refreshedTracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected refreshed tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	refreshedCallback := refreshedTracked.Callback
	if refreshedCallback == nil {
		t.Fatal("expected refreshed generated code diagnostics callback")
	}
	refreshedCallback(params)

	filtered := diagnostics.Snapshot("project-alpha")
	if len(filtered.GenCode.Errors) != 0 {
		t.Fatalf("expected refreshed callback to apply ignore policy, got %#v", filtered.GenCode.Errors)
	}
	if len(filtered.UnmappedGenCode) != 0 {
		t.Fatalf("expected no unmapped diagnostics after ignored callback, got %#v", filtered.UnmappedGenCode)
	}
}

// Generated diagnostics should remain visible after prefix/suffix-only
// materialization changes until the next LSP publish replaces them.
func TestProjectSynchronizerMaterializeDocumentKeepsGeneratedDiagnosticsAcrossPrefixAndSuffixChangesUntilNextPublish(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	assertSnapshot := func(snapshot projectstate.LSPDiagnosticsPayload) {
		errors := snapshot.GenCode.Errors["section-1"].Params["param-1"]
		if len(errors) != 1 || errors[0] != "unknown_symbol is not defined" {
			t.Fatalf("expected mapped generated diagnostics to survive, got %#v", snapshot.GenCode.Errors)
		}
		if len(snapshot.UnmappedGenCode) != 1 || snapshot.UnmappedGenCode[0].Message != "SettaState is not defined" {
			t.Fatalf("expected unmapped generated diagnostics to survive, got %#v", snapshot.UnmappedGenCode)
		}
	}

	document, generatedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, false, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize generated diagnostics document: %v", err)
	}

	generatedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read generated code file: %v", err)
	}
	params := buildGeneratedPublishDiagnostics(
		t,
		generatedPath,
		string(generatedCode),
		"unknown_symbol",
		"unknown_symbol is not defined",
		"reportUndefinedVariable",
	)
	unmapped := buildGeneratedPublishDiagnostics(
		t,
		generatedPath,
		string(generatedCode),
		"SettaState",
		"SettaState is not defined",
		"reportUndefinedVariable",
	)
	params.Diagnostics = append(params.Diagnostics, unmapped.Diagnostics[0])

	tracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	if tracked.Callback == nil {
		t.Fatal("expected generated code diagnostics callback")
	}
	tracked.Callback(params)
	assertSnapshot(diagnostics.Snapshot("project-alpha"))

	previousGeneratedCode := string(generatedCode)
	updates := []struct {
		name  string
		apply func(*projectstate.Document) error
	}{
		{
			name: "prefix edit 1",
			apply: func(document *projectstate.Document) error {
				return document.SetGenCodePrefix("project-alpha", "import m\n")
			},
		},
		{
			name: "prefix edit 2",
			apply: func(document *projectstate.Document) error {
				return document.SetGenCodePrefix("project-alpha", "import ma\n")
			},
		},
		{
			name: "prefix edit 3",
			apply: func(document *projectstate.Document) error {
				return document.SetGenCodePrefix("project-alpha", "import math\n")
			},
		},
		{
			name: "suffix edit",
			apply: func(document *projectstate.Document) error {
				return document.SetGenCodeSuffix("project-alpha", projectstate.DefaultPythonCodegenSuffix+"\n# end")
			},
		},
	}

	for _, update := range updates {
		document = document.Clone()
		if err := update.apply(&document); err != nil {
			t.Fatalf("%s: %v", update.name, err)
		}
		materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
		updatedGeneratedCode, err := os.ReadFile(generatedPath)
		if err != nil {
			t.Fatalf("%s read generated code file: %v", update.name, err)
		}
		if string(updatedGeneratedCode) == previousGeneratedCode {
			t.Fatalf("%s should change generated code content", update.name)
		}
		if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
			t.Fatalf("%s rematerialize generated diagnostics document: %v", update.name, err)
		}
		assertSnapshot(diagnostics.Snapshot("project-alpha"))
		previousGeneratedCode = string(updatedGeneratedCode)
	}
}

// A callable section should auto-refetch only after its generated undefined
// symbol diagnostic clears without another callable-level error replacing it.
func TestProjectSynchronizerAutoRefetchesResolvedUndefinedCallableSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	var resolvedEvents [][]string
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
		OnCallableSymbolsResolved: func(_ context.Context, projectID string, sectionIDs []string) {
			if projectID != "project-alpha" {
				t.Fatalf("unexpected project id %q", projectID)
			}
			resolvedEvents = append(resolvedEvents, append([]string(nil), sectionIDs...))
		},
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, generatedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, false, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize generated diagnostics document: %v", err)
	}

	generatedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read generated code file: %v", err)
	}
	tracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	callback := tracked.Callback
	if callback == nil {
		t.Fatal("expected generated code diagnostics callback")
	}

	callback(buildGeneratedPublishDiagnostics(
		t,
		generatedPath,
		string(generatedCode),
		"MissingFunc",
		"MissingFunc is not defined",
		"reportUndefinedVariable",
	))
	if len(resolvedEvents) != 0 {
		t.Fatalf("expected no auto-refetch while callable is still undefined, got %#v", resolvedEvents)
	}

	uri, err := pathToURI(generatedPath)
	if err != nil {
		t.Fatalf("path to uri: %v", err)
	}
	callback(PublishDiagnosticsParams{URI: uri})

	if !reflect.DeepEqual(resolvedEvents, [][]string{{"section-1"}}) {
		t.Fatalf("unexpected resolved-section refetch events %#v", resolvedEvents)
	}
}

// Callable mismatch refetch should trigger once when the mismatch first
// appears, then stay quiet for duplicate publishes until the state changes.
func TestProjectSynchronizerAutoRefetchesNewCallableMismatchesOnce(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	var mismatchEvents [][]string
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
		OnCallableSignatureMismatch: func(_ context.Context, projectID string, sectionIDs []string) {
			if projectID != "project-alpha" {
				t.Fatalf("unexpected project id %q", projectID)
			}
			mismatchEvents = append(mismatchEvents, append([]string(nil), sectionIDs...))
		},
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, generatedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, false, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize generated diagnostics document: %v", err)
	}

	generatedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read generated code file: %v", err)
	}
	tracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	callback := tracked.Callback
	if callback == nil {
		t.Fatal("expected generated code diagnostics callback")
	}
	params := buildGeneratedPublishDiagnostics(
		t,
		generatedPath,
		string(generatedCode),
		"MissingFunc",
		`Argument missing for parameter "param"`,
		"reportCallIssue",
	)

	callback(params)
	callback(params)

	if !reflect.DeepEqual(mismatchEvents, [][]string{{"section-1"}}) {
		t.Fatalf("unexpected mismatch refetch events %#v", mismatchEvents)
	}
}

// Re-materializing project documents should keep the previously-seen mismatch
// set so duplicate mismatch publishes do not re-trigger auto-refetch on every
// ordinary document refresh.
func TestProjectSynchronizerMaterializeDocumentPreservesCallableMismatchSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	var mismatchEvents [][]string
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
		OnCallableSignatureMismatch: func(_ context.Context, projectID string, sectionIDs []string) {
			if projectID != "project-alpha" {
				t.Fatalf("unexpected project id %q", projectID)
			}
			mismatchEvents = append(mismatchEvents, append([]string(nil), sectionIDs...))
		},
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, generatedPath, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, false, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize generated diagnostics document: %v", err)
	}

	generatedCode, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatalf("read generated code file: %v", err)
	}
	params := buildGeneratedPublishDiagnostics(
		t,
		generatedPath,
		string(generatedCode),
		"MissingFunc",
		`Argument missing for parameter "param"`,
		"reportCallIssue",
	)

	tracked, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected tracked generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	if tracked.Callback == nil {
		t.Fatal("expected generated code diagnostics callback")
	}
	tracked.Callback(params)

	if !reflect.DeepEqual(mismatchEvents, [][]string{{"section-1"}}) {
		t.Fatalf("unexpected initial mismatch refetch events %#v", mismatchEvents)
	}

	if err := synchronizer.MaterializeDocument(ctx, document.Clone()); err != nil {
		t.Fatalf("rematerialize generated diagnostics document: %v", err)
	}

	rematerialized, ok := syncer.synced[generatedPath]
	if !ok {
		t.Fatalf("expected rematerialized generated document at %q, got %#v", generatedPath, syncer.synced)
	}
	if rematerialized.Callback == nil {
		t.Fatal("expected rematerialized generated code diagnostics callback")
	}
	rematerialized.Callback(params)

	if !reflect.DeepEqual(mismatchEvents, [][]string{{"section-1"}}) {
		t.Fatalf("expected mismatch state to survive rematerialization, got %#v", mismatchEvents)
	}
}

// Turning metadata generation off should clear stale metadata diagnostics when
// the generated metadata document disappears from the tracked LSP set.
func TestProjectSynchronizerClearsGeneratedMetadataDiagnosticsWhenMetadataDisabled(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	pythonBinary := resolveTestPythonBinary(t)
	session := newFixtureSession(t, pythonBinary, settaFilesRoot)
	service := NewService(session)
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        service,
		Diagnostics:    diagnostics,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, _, metadataPath := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, true, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)
	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize metadata diagnostics document: %v", err)
	}

	metadataCallback := service.tracked[metadataPath].Callback
	if metadataCallback == nil {
		t.Fatal("expected generated metadata diagnostics callback")
	}
	metadataCallback(buildGeneratedPublishDiagnostics(t, metadataPath, "META = {}\n", "META", "Metadata issue", "reportGeneralTypeIssues"))

	initial := diagnostics.Snapshot("project-alpha")
	if len(initial.UnmappedGenCode) != 1 {
		t.Fatalf("expected metadata unmapped diagnostic, got %#v", initial.UnmappedGenCode)
	}

	documentWithoutMetadata, _, _ := lspGeneratedDiagnosticsDocument(t, settaFilesRoot, false, false)
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, documentWithoutMetadata)
	if err := synchronizer.MaterializeDocument(ctx, documentWithoutMetadata); err != nil {
		t.Fatalf("materialize document without metadata: %v", err)
	}

	if _, ok := service.tracked[metadataPath]; ok {
		t.Fatalf("expected metadata document to be removed from tracked set")
	}
	cleared := diagnostics.Snapshot("project-alpha")
	if len(cleared.UnmappedGenCode) != 0 {
		t.Fatalf("expected metadata diagnostics to clear, got %#v", cleared.UnmappedGenCode)
	}
}

// Manual type-check should refresh the target project's tracked LSP documents
// without replacing the whole tracked set.
func TestProjectSynchronizerTypeCheckProjectRefreshesProjectDocuments(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	document, sectionPath, generatedPath, metadataPath := lspTestDocument(t, settaFilesRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)

	if err := synchronizer.TypeCheckProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("type check project: %v", err)
	}

	if syncer.synced != nil {
		t.Fatalf("expected type check to use refresh, got sync %#v", syncer.synced)
	}
	if len(syncer.refreshed) != 3 {
		t.Fatalf("expected refreshed project documents, got %#v", syncer.refreshed)
	}
	if _, ok := syncer.refreshed[sectionPath]; !ok {
		t.Fatalf("expected section path %q in refresh set", sectionPath)
	}
	if _, ok := syncer.refreshed[generatedPath]; !ok {
		t.Fatalf("expected generated path %q in refresh set", generatedPath)
	}
	if _, ok := syncer.refreshed[metadataPath]; !ok {
		t.Fatalf("expected metadata path %q in refresh set", metadataPath)
	}
}

// Manual type-check should still refresh Python documents when no Python
// codegen target exists, while skipping unsupported non-LSP sections such as
// Bash on the live router-backed service path.
func TestProjectSynchronizerTypeCheckProjectRefreshesPythonSectionsWithoutCodegen(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	router := newFixturePythonRouter(t, settaFilesRoot, nil, nil)
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        router,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := synchronizer.Close(context.Background()); err != nil {
			t.Fatalf("close synchronizer: %v", err)
		}
	}()

	document, pythonPath, bashPath := lspTypeCheckWithoutCodegenDocument(t, settaFilesRoot)
	if err := synchronizer.TypeCheckProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("type check project without codegen: %v", err)
	}

	pythonService, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok {
		t.Fatal("expected python service to be configured")
	}
	if _, ok := pythonService.tracked[pythonPath]; !ok {
		t.Fatalf("expected python document %q in tracked set %#v", pythonPath, pythonService.tracked)
	}
	if len(pythonService.tracked) != 1 {
		t.Fatalf("expected only one tracked python document, got %#v", pythonService.tracked)
	}
	if _, ok := pythonService.tracked[bashPath]; ok {
		t.Fatalf("did not expect bash document %q in tracked python service %#v", bashPath, pythonService.tracked)
	}

	if _, ok, err := router.serviceForLanguage("bash"); err != nil {
		t.Fatalf("resolve bash service: %v", err)
	} else if ok {
		t.Fatal("did not expect bash language service to be configured")
	}
}

// Manual type-check should preserve the source no-op contract for unknown
// project ids instead of surfacing a typed not-found error.
func TestProjectSynchronizerTypeCheckProjectIgnoresUnknownProject(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	document, _, _, _ := lspTestDocument(t, settaFilesRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := synchronizer.TypeCheckProject(ctx, document, "project-missing"); err != nil {
		t.Fatalf("type check unknown project: %v", err)
	}
	if syncer.synced != nil {
		t.Fatalf("expected no full sync for unknown project, got %#v", syncer.synced)
	}
	if syncer.refreshed != nil {
		t.Fatalf("expected no refresh for unknown project, got %#v", syncer.refreshed)
	}
}

// Non-Python/plugin-language code sections should materialize through the same
// project snapshot path as Python sections and update the shared diagnostics
// registry through the stored callback.
func TestProjectSynchronizerRoutesPluginLanguageDiagnosticsThroughProjectSnapshot(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		Service:        syncer,
		Diagnostics:    diagnostics,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	document, sectionPath := lspPluginLanguageDiagnosticsDocument(t, settaFilesRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := synchronizer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize plugin-language diagnostics document: %v", err)
	}

	tracked, ok := syncer.synced[sectionPath]
	if !ok {
		t.Fatalf("expected tracked plugin-language document at %q, got %#v", sectionPath, syncer.synced)
	}
	if tracked.LanguageID != "typescript" {
		t.Fatalf("expected tracked languageID typescript, got %q", tracked.LanguageID)
	}
	if tracked.Callback == nil {
		t.Fatal("expected plugin-language diagnostics callback")
	}

	version := 1
	uri, err := pathToURI(sectionPath)
	if err != nil {
		t.Fatalf("path to uri: %v", err)
	}
	tracked.Callback(PublishDiagnosticsParams{
		URI:     uri,
		Version: &version,
		Diagnostics: []Diagnostic{{
			Message:  "Fixture TypeScript diagnostic",
			Severity: 1,
			Source:   "fixture-ts-lsp",
			Code:     "fixture-ts",
			Range: Range{
				Start: Position{Line: 0, Character: 0},
				End:   Position{Line: 0, Character: 5},
			},
		}},
	})

	snapshot := diagnostics.Snapshot("project-alpha")
	stored := snapshot.CodeSections["typescript-runner"]
	if len(stored) != 1 {
		t.Fatalf("expected one plugin-language diagnostic, got %#v", snapshot.CodeSections)
	}
	if stored[0].Message != "Fixture TypeScript diagnostic" || stored[0].Code != "fixture-ts" {
		t.Fatalf("unexpected stored plugin-language diagnostics %#v", stored)
	}
}

// Manual type-check should refresh only the requested project's tracked
// documents while still including plugin-language code sections alongside the
// project's Python and generated Python documents.
func TestProjectSynchronizerTypeCheckProjectRefreshesPluginAndGeneratedDocumentsWithoutOtherProjects(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	document, paths := lspTypeCheckPluginLanguageDocument(t, settaFilesRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)

	if err := synchronizer.TypeCheckProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("type check project: %v", err)
	}

	if syncer.synced != nil {
		t.Fatalf("expected type check to use refresh, got sync %#v", syncer.synced)
	}
	if len(syncer.refreshed) != 4 {
		t.Fatalf("expected four refreshed target-project documents, got %#v", syncer.refreshed)
	}
	for _, path := range []string{
		paths.alphaPython,
		paths.alphaTypeScript,
		paths.alphaGenerated,
		paths.alphaMetadata,
	} {
		if _, ok := syncer.refreshed[path]; !ok {
			t.Fatalf("expected target project refresh to include %q, got %#v", path, syncer.refreshed)
		}
	}
	if syncer.refreshed[paths.alphaTypeScript].LanguageID != "typescript" {
		t.Fatalf("expected plugin-language refresh to keep typescript language id, got %#v", syncer.refreshed[paths.alphaTypeScript])
	}
	if _, ok := syncer.refreshed[paths.bravoPython]; ok {
		t.Fatalf("did not expect unrelated project path %q in refresh set %#v", paths.bravoPython, syncer.refreshed)
	}
}

// Manual restart should close existing sessions before re-materializing the
// current tracked document set.
func TestProjectSynchronizerRestartClosesBeforeRematerializing(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtimeRoot := t.TempDir()
	syncer := &recordingDocumentSyncer{}
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		Service:        syncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}

	document, sectionPath, generatedPath, metadataPath := lspTestDocument(t, settaFilesRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	materializePythonGeneratedFiles(t, ctx, settaFilesRoot, runtimeRoot, document)

	if err := synchronizer.Restart(ctx, document); err != nil {
		t.Fatalf("restart synchronizer: %v", err)
	}

	if syncer.closeCalls != 1 {
		t.Fatalf("expected one close call before restart, got %d", syncer.closeCalls)
	}
	if len(syncer.synced) != 3 {
		t.Fatalf("expected rematerialized sync set, got %#v", syncer.synced)
	}
	if _, ok := syncer.synced[sectionPath]; !ok {
		t.Fatalf("expected section path %q in rematerialized set", sectionPath)
	}
	if _, ok := syncer.synced[generatedPath]; !ok {
		t.Fatalf("expected generated path %q in rematerialized set", generatedPath)
	}
	if _, ok := syncer.synced[metadataPath]; !ok {
		t.Fatalf("expected metadata path %q in rematerialized set", metadataPath)
	}
}

func lspTestDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, string, string, string) {
	t.Helper()

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: "python",
				Payload: projectstate.RawJSON(`{
					"language":"python",
					"generateMetadata":true
				}`),
			},
		},
		SectionVariantMap: map[string]string{
			"runner": "runner-variant",
		},
		Sections: map[string]projectstate.Section{
			"runner": {
				ID:               "runner",
				Name:             "Runner",
				VariantIDs:       []string{"runner-variant"},
				DefaultVariantID: "runner-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"runner-variant": {ID: "runner-variant", ImplID: "runner-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"runner-impl": {
				ID:   "runner-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
				},
				Payload: projectstate.RawJSON(`{
					"id":"runner-impl",
					"type":"Code",
					"code":"print('runner')\n",
					"codeLanguage":"python",
					"children":[]
				}`),
			},
		},
	}
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize test document: %v", err)
	}

	project = document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected normalized runner binding")
	}

	sectionPath := filepath.Join(settaFilesRoot, filepath.FromSlash(impl.Code.Binding.Path))
	generatedPath := filepath.Join(settaFilesRoot, filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath(project.Name)))
	metadataPath := filepath.Join(settaFilesRoot, filepath.FromSlash(projectstate.GeneratedPythonMetadataRelativePath(project.Name)))
	return document, sectionPath, generatedPath, metadataPath
}

func lspDiskBackedTestDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, string) {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Demo Project",
				SectionVariantMap: map[string]string{
					"runner": "runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"runner": {
						ID:               "runner",
						Name:             "Runner",
						VariantIDs:       []string{"runner-variant"},
						DefaultVariantID: "runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"runner-variant": {ID: "runner-variant", ImplID: "runner-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"runner-impl": {
						ID:   "runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize disk-backed test document: %v", err)
	}

	sectionPath := filepath.Join(settaFilesRoot, "code", "run.py")
	return document, sectionPath
}

func lspTypeCheckWithoutCodegenDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, string, string) {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Type Check Project",
				SectionVariantMap: map[string]string{
					"python-runner": "python-runner-variant",
					"bash-runner":   "bash-runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"python-runner": {
						ID:               "python-runner",
						Name:             "Python Runner",
						VariantIDs:       []string{"python-runner-variant"},
						DefaultVariantID: "python-runner-variant",
					},
					"bash-runner": {
						ID:               "bash-runner",
						Name:             "Bash Runner",
						VariantIDs:       []string{"bash-runner-variant"},
						DefaultVariantID: "bash-runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"python-runner-variant": {ID: "python-runner-variant", ImplID: "python-runner-impl"},
					"bash-runner-variant":   {ID: "bash-runner-variant", ImplID: "bash-runner-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"python-runner-impl": {
						ID:   "python-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/type-check.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"python-runner-impl",
							"type":"Code",
							"code":"print('python')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
					"bash-runner-impl": {
						ID:   "bash-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguageBash,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/type-check.sh",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"bash-runner-impl",
							"type":"Code",
							"code":"echo bash\n",
							"codeLanguage":"bash",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize type-check without codegen document: %v", err)
	}

	return document,
		filepath.Join(settaFilesRoot, "code", "type-check.py"),
		filepath.Join(settaFilesRoot, "code", "type-check.sh")
}

func lspPluginLanguageDiagnosticsDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, string) {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Plugin Diagnostics Project",
				SectionVariantMap: map[string]string{
					"typescript-runner": "typescript-runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"typescript-runner": {
						ID:               "typescript-runner",
						Name:             "TypeScript Runner",
						VariantIDs:       []string{"typescript-runner-variant"},
						DefaultVariantID: "typescript-runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"typescript-runner-variant": {ID: "typescript-runner-variant", ImplID: "typescript-runner-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"typescript-runner-impl": {
						ID:   "typescript-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguage("typescript"),
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/plugin-typescript.ts",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"typescript-runner-impl",
							"type":"Code",
							"code":"const value: string = 'hi';\n",
							"codeLanguage":"typescript",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize plugin-language diagnostics document: %v", err)
	}

	return document, filepath.Join(settaFilesRoot, "code", "plugin-typescript.ts")
}

func lspNonRunnableCodeDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, string) {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Non Runnable Project",
				SectionVariantMap: map[string]string{
					"config-section": "config-variant",
				},
				Sections: map[string]projectstate.Section{
					"config-section": {
						ID:               "config-section",
						Name:             "Config",
						VariantIDs:       []string{"config-variant"},
						DefaultVariantID: "config-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"config-variant": {ID: "config-variant", ImplID: "config-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"config-impl": {
						ID:   "config-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguage("json"),
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/config.json",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"config-impl",
							"type":"Code",
							"code":"{\"ok\": true}\n",
							"codeLanguage":"json",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize non-runnable code document: %v", err)
	}

	return document, filepath.Join(settaFilesRoot, "code", "config.json")
}

type lspTypeCheckPluginLanguagePaths struct {
	alphaPython     string
	alphaTypeScript string
	alphaGenerated  string
	alphaMetadata   string
	bravoPython     string
}

func lspTypeCheckPluginLanguageDocument(t *testing.T, settaFilesRoot string) (projectstate.Document, lspTypeCheckPluginLanguagePaths) {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha Project",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: "python",
						Payload: projectstate.RawJSON(`{
							"language":"python",
							"generateMetadata":true
						}`),
					},
				},
				SectionVariantMap: map[string]string{
					"python-runner":     "python-runner-variant",
					"typescript-runner": "typescript-runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"python-runner": {
						ID:               "python-runner",
						Name:             "Python Runner",
						VariantIDs:       []string{"python-runner-variant"},
						DefaultVariantID: "python-runner-variant",
					},
					"typescript-runner": {
						ID:               "typescript-runner",
						Name:             "TypeScript Runner",
						VariantIDs:       []string{"typescript-runner-variant"},
						DefaultVariantID: "typescript-runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"python-runner-variant":     {ID: "python-runner-variant", ImplID: "python-runner-impl"},
					"typescript-runner-variant": {ID: "typescript-runner-variant", ImplID: "typescript-runner-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"python-runner-impl": {
						ID:   "python-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/alpha-runner.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"python-runner-impl",
							"type":"Code",
							"code":"print('alpha')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
					"typescript-runner-impl": {
						ID:   "typescript-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguage("typescript"),
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/alpha-runner.ts",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"typescript-runner-impl",
							"type":"Code",
							"code":"const value: string = 'alpha';\n",
							"codeLanguage":"typescript",
							"children":[]
						}`),
					},
				},
			},
			"project-bravo": {
				ID:   "project-bravo",
				Name: "Bravo Project",
				SectionVariantMap: map[string]string{
					"python-runner": "python-runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"python-runner": {
						ID:               "python-runner",
						Name:             "Python Runner",
						VariantIDs:       []string{"python-runner-variant"},
						DefaultVariantID: "python-runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"python-runner-variant": {ID: "python-runner-variant", ImplID: "python-runner-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"python-runner-impl": {
						ID:   "python-runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/bravo-runner.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"python-runner-impl",
							"type":"Code",
							"code":"print('bravo')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize type-check plugin-language document: %v", err)
	}

	return document, lspTypeCheckPluginLanguagePaths{
		alphaPython:     filepath.Join(settaFilesRoot, "code", "alpha-runner.py"),
		alphaTypeScript: filepath.Join(settaFilesRoot, "code", "alpha-runner.ts"),
		alphaGenerated: filepath.Join(
			settaFilesRoot,
			filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath("Alpha Project")),
		),
		alphaMetadata: filepath.Join(
			settaFilesRoot,
			filepath.FromSlash(projectstate.GeneratedPythonMetadataRelativePath("Alpha Project")),
		),
		bravoPython: filepath.Join(settaFilesRoot, "code", "bravo-runner.py"),
	}
}

func lspCodeSectionDiagnosticsDocument(
	t *testing.T,
	settaFilesRoot string,
	suppressDiagnostics bool,
) (projectstate.Document, string) {
	t.Helper()

	ignoreState := `{"muted":false,"suppressedCodes":[]}`
	if suppressDiagnostics {
		ignoreState = `{"muted":false,"suppressedCodes":["reportFoo"]}`
	}

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Diagnostics Project",
				SectionVariantMap: map[string]string{
					"runner": "runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"runner": {
						ID:               "runner",
						Name:             "Runner",
						VariantIDs:       []string{"runner-variant"},
						DefaultVariantID: "runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"runner-variant": {
						ID:       "runner-variant",
						ImplID:   "runner-impl",
						Modifier: projectstate.RawJSON(`{"diagnosticsIgnoreState":` + ignoreState + `}`),
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"runner-impl": {
						ID:   "runner-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/runner.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
						Payload: projectstate.RawJSON(`{
							"id":"runner-impl",
							"type":"Code",
							"code":"print('runner')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code-section diagnostics document: %v", err)
	}

	return document, filepath.Join(settaFilesRoot, "code", "runner.py")
}

func lspGeneratedDiagnosticsDocument(
	t *testing.T,
	settaFilesRoot string,
	generateMetadata bool,
	ignoreParamError bool,
) (projectstate.Document, string, string) {
	t.Helper()

	generateMetadataJSON := "false"
	if generateMetadata {
		generateMetadataJSON = "true"
	}
	ignoreTypeErrors := `{"callable":false,"params":{}}`
	if ignoreParamError {
		ignoreTypeErrors = `{"callable":false,"params":{"param-1":true}}`
	}

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Diagnostics Project",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: "python",
						Payload: projectstate.RawJSON(`{
							"language":"python",
							"generateMetadata":` + generateMetadataJSON + `
						}`),
					},
				},
				TopLevelSectionIDs: []string{"section-1"},
				SectionVariantMap: map[string]string{
					"section-1": "section-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Section",
						VariantIDs:       []string{"section-variant-1"},
						DefaultVariantID: "section-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-variant-1": {
						ID:     "section-variant-1",
						ImplID: "section-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-impl-1": {
						ID:   "section-impl-1",
						Kind: projectstate.SectionKind("callable"),
						Payload: projectstate.RawJSON(`{
							"id":"section-impl-1",
							"type":"Callable",
							"callable":"callable-1",
							"ignoreTypeErrors":` + ignoreTypeErrors + `,
							"codeObjVariantMap":{
								"callable-1":"callable-variant-1",
								"param-1":"param-variant-1"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"callable-1": {
						ID:               "callable-1",
						Name:             "MissingFunc",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
					"param-1": {
						ID:               "param-1",
						Name:             "param",
						VariantIDs:       []string{"param-variant-1"},
						DefaultVariantID: "param-variant-1",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-impl-1",
					},
					"param-variant-1": {
						ID:     "param-variant-1",
						ImplID: "param-impl-1",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"callable-impl-1": {
						ID:      "callable-impl-1",
						Type:    "CodeCallable",
						Payload: projectstate.RawJSON(`{"id":"callable-impl-1","type":"CodeCallable","children":["param-1"]}`),
					},
					"param-impl-1": {
						ID:      "param-impl-1",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-impl-1","type":"CodeParam","value":"unknown_symbol","passingStyle":"DEFAULT"}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize generated diagnostics document: %v", err)
	}

	project := document.Projects["project-alpha"]
	generatedPath := filepath.Join(settaFilesRoot, filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath(project.Name)))
	metadataPath := filepath.Join(settaFilesRoot, filepath.FromSlash(projectstate.GeneratedPythonMetadataRelativePath(project.Name)))
	return document, generatedPath, metadataPath
}

func materializePythonGeneratedFiles(
	t *testing.T,
	ctx context.Context,
	settaFilesRoot string,
	runtimeRoot string,
	document projectstate.Document,
) {
	t.Helper()

	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}
	if err := materializer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize python generated files: %v", err)
	}
}

func buildGeneratedPublishDiagnostics(
	t *testing.T,
	path string,
	content string,
	fragment string,
	message string,
	code string,
) PublishDiagnosticsParams {
	t.Helper()

	start := strings.Index(content, fragment)
	if start < 0 {
		t.Fatalf("expected fragment %q in content:\n%s", fragment, content)
	}
	end := start + len(fragment)
	startLine, startCharacter := lspPositionToLineCol(content, start)
	endLine, endCharacter := lspPositionToLineCol(content, end)
	uri, err := pathToURI(path)
	if err != nil {
		t.Fatalf("path to uri: %v", err)
	}
	return PublishDiagnosticsParams{
		URI: uri,
		Diagnostics: []Diagnostic{
			{
				Message:  message,
				Severity: 1,
				Source:   "pyright",
				Code:     code,
				Range: Range{
					Start: Position{Line: startLine, Character: startCharacter},
					End:   Position{Line: endLine, Character: endCharacter},
				},
			},
		},
	}
}

func lspPositionToLineCol(code string, position int) (int, int) {
	if position <= 0 {
		return 0, 0
	}

	line := 0
	character := 0
	for index, char := range code {
		if index >= position {
			return line, character
		}
		if char == '\n' {
			line++
			character = 0
			continue
		}
		character++
	}
	return line, character
}
