package lsp

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

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

// Code-section callbacks must refresh even when the canonical file content is
// unchanged so later publishes honor newly-muted or newly-suppressed state.
func TestProjectSynchronizerRefreshesCodeSectionDiagnosticsCallbackWithoutContentChanges(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	pythonBinary := resolveTestPythonBinary(t)
	session := newFixtureSession(t, pythonBinary, settaFilesRoot)
	service := NewService(session)
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	synchronizer, err := NewProjectSynchronizer(ProjectSynchronizerOptions{
		SettaFilesRoot: settaFilesRoot,
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

	firstCallback := service.tracked[sectionPath].Callback
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

	refreshedCallback := service.tracked[sectionPath].Callback
	if refreshedCallback == nil {
		t.Fatal("expected refreshed code section diagnostics callback")
	}
	refreshedCallback(params)

	filtered := diagnostics.Snapshot("project-alpha")
	if len(filtered.CodeSections) != 0 {
		t.Fatalf("expected refreshed callback to apply section ignore policy, got %#v", filtered.CodeSections)
	}
}

// Generated-code callbacks must refresh even when the rendered Python file is
// unchanged so updated ignore policies take effect without forcing content
// churn in the tracked LSP document set.
func TestProjectSynchronizerRefreshesGeneratedDiagnosticsCallbackWithoutContentChanges(t *testing.T) {
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

	firstCallback := service.tracked[generatedPath].Callback
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

	refreshedCallback := service.tracked[generatedPath].Callback
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
