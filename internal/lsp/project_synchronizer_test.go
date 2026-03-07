package lsp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

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
