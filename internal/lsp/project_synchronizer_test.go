package lsp

import (
	"context"
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

func (s *recordingDocumentSyncer) UpsertDocument(context.Context, SyncedDocument) error {
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
