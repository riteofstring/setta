package codegen

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

// Save-hook materialization should write authoritative Python code and metadata files under the canonical generated root.
func TestPythonMaterializerMaterializeProjectWritesCodeAndMetadata(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := NewPythonMaterializer(PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	project := singleSectionProject(
		t,
		"Greeting",
		mustRawJSON(t, `{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`),
		mustRawJSON(t, `{"language":"python","generateMetadata":true}`),
		nil,
	)
	document := pythonMaterializerTestDocument(project)

	if err := materializer.MaterializeProject(context.Background(), document, "project-alpha"); err != nil {
		t.Fatalf("materialize project: %v", err)
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(settaFilesRoot, project.Name)
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)

	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated code: %v", err)
	}
	if !strings.Contains(string(code), "from . import setta_gen_meta") {
		t.Fatalf("expected metadata import in generated code:\n%s", string(code))
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected section assignment in generated code:\n%s", string(code))
	}
	if !strings.Contains(string(code), "state.__state__ = setta_gen_meta.meta") {
		t.Fatalf("expected metadata assignment in generated code:\n%s", string(code))
	}

	meta, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("read generated metadata: %v", err)
	}
	if !strings.Contains(string(meta), "class SettaGenMetadata:") {
		t.Fatalf("expected metadata dataclass output:\n%s", string(meta))
	}
	if !strings.Contains(string(meta), "fullPathName='Greeting'") {
		t.Fatalf("expected section metadata output:\n%s", string(meta))
	}
}

// Route-time reconciliation should create authoritative generated singleton sections and remove metadata when the target disables it.
func TestPythonMaterializerReconcileProjectPythonGeneratedSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := NewPythonMaterializer(PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	project := singleSectionProject(
		t,
		"Greeting",
		mustRawJSON(t, `{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`),
		mustRawJSON(t, `{"language":"python","genCodePrefix":"import math","generateMetadata":true}`),
		nil,
	)
	project.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{
		"section-1": {X: 10, Y: 20},
	}
	project.ViewModes = map[string]projectstate.ViewMode{
		"focus": {
			ID: "focus",
		},
	}

	if err := materializer.ReconcileProjectPythonGeneratedSections(context.Background(), &project); err != nil {
		t.Fatalf("reconcile generated python sections: %v", err)
	}

	if project.GeneratedCodeBinding == nil || project.GeneratedCodeBinding.Path != "code/sections/alpha/setta_gen.py" {
		t.Fatalf("expected generated code binding, got %#v", project.GeneratedCodeBinding)
	}
	if project.GeneratedMetadataBinding == nil || project.GeneratedMetadataBinding.Path != "code/sections/alpha/setta_gen_meta.py" {
		t.Fatalf("expected generated metadata binding, got %#v", project.GeneratedMetadataBinding)
	}
	if !strings.Contains(string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload), `"type":"GenPythonCode"`) {
		t.Fatalf("expected generated python impl payload, got %q", string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload))
	}
	if !strings.Contains(string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload), `class SettaState:`) {
		t.Fatalf("expected generated body in payload, got %q", string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload))
	}
	if strings.Contains(string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload), `import math`) {
		t.Fatalf("expected generated body only in payload, got %q", string(project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload))
	}
	assertGeneratedSectionPayloadChildrenEmpty(
		t,
		project.SectionImpls[projectstate.GeneratedPythonCodeImplID].Payload,
	)
	assertGeneratedSectionPayloadChildrenEmpty(
		t,
		project.SectionImpls[projectstate.GeneratedPythonMetadataImplID].Payload,
	)
	if !project.ViewModes["focus"].VisibilityBySectionID[projectstate.GeneratedPythonMetadataSectionID] {
		t.Fatal("expected metadata section visibility in view mode")
	}

	project.CodegenTargets[0].Payload = mustRawJSON(t, `{"language":"python","generateMetadata":false}`)
	if err := materializer.ReconcileProjectPythonGeneratedSections(context.Background(), &project); err != nil {
		t.Fatalf("reconcile generated python sections without metadata: %v", err)
	}
	if project.GeneratedMetadataBinding != nil {
		t.Fatalf("expected generated metadata binding removal, got %#v", project.GeneratedMetadataBinding)
	}
	if _, ok := project.Sections[projectstate.GeneratedPythonMetadataSectionID]; ok {
		t.Fatal("expected generated metadata section removal")
	}
}

// Runtime password secrets should flow into generated code through the real password store instead of test-only injection.
func TestPythonMaterializerMaterializeProjectReadsRuntimePasswordStore(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	passwordStoreDir := filepath.Join(runtimeRoot, "secrets")
	if err := os.MkdirAll(passwordStoreDir, 0o755); err != nil {
		t.Fatalf("mkdir password store dir: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(passwordStoreDir, pythonPasswordStoreFileName),
		[]byte("{\n  \"param-secret-impl-1\": \"top-secret\"\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write password store: %v", err)
	}

	materializer, err := NewPythonMaterializer(PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	document := pythonMaterializerTestDocument(pythonPasswordMaterializerProject(t))
	if err := materializer.MaterializeProject(context.Background(), document, "project-alpha"); err != nil {
		t.Fatalf("materialize project: %v", err)
	}

	codePath := filepath.Join(
		projectstate.ProjectCodeSectionsRoot(settaFilesRoot, "Alpha"),
		projectstate.GeneratedPythonCodeFileName,
	)
	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated code: %v", err)
	}
	if !strings.Contains(string(code), "from setta.code_gen.python import value_helpers as _setta_value_helpers") {
		t.Fatalf("expected helper import in generated code:\n%s", string(code))
	}
	if !strings.Contains(string(code), "_setta_value_helpers.read_password_value('param-secret-impl-1')") {
		t.Fatalf("expected password helper call in generated code:\n%s", string(code))
	}
}

// Disabling metadata should remove stale metadata files but keep the generated code file current.
func TestPythonMaterializerMaterializeProjectRemovesStaleMetadataWhenDisabled(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := NewPythonMaterializer(PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	project := singleSectionProject(
		t,
		"Greeting",
		mustRawJSON(t, `{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`),
		nil,
		nil,
	)
	document := pythonMaterializerTestDocument(project)
	projectRoot := projectstate.ProjectCodeSectionsRoot(settaFilesRoot, project.Name)
	if err := os.MkdirAll(projectRoot, 0o755); err != nil {
		t.Fatalf("mkdir project root: %v", err)
	}
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)
	if err := os.WriteFile(metaPath, []byte("stale meta\n"), 0o644); err != nil {
		t.Fatalf("write stale metadata file: %v", err)
	}

	if err := materializer.MaterializeProject(context.Background(), document, "project-alpha"); err != nil {
		t.Fatalf("materialize project: %v", err)
	}

	if _, err := os.Stat(metaPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale metadata removal, got %v", err)
	}
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	if _, err := os.Stat(codePath); err != nil {
		t.Fatalf("expected generated code file, got %v", err)
	}
}

// Stale document-level pruning should only remove canonical Python outputs, leaving unrelated files in shared project roots untouched.
func TestPythonMaterializerMaterializeDocumentPrunesOnlyPythonOutputs(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := NewPythonMaterializer(PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	staleRoot := projectstate.ProjectCodeSectionsRoot(settaFilesRoot, "Removed Project")
	if err := os.MkdirAll(filepath.Join(staleRoot, "plugin_codegen", "keep"), 0o755); err != nil {
		t.Fatalf("mkdir stale root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleRoot, projectstate.GeneratedPythonCodeFileName), []byte("stale code\n"), 0o644); err != nil {
		t.Fatalf("write stale generated code: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleRoot, projectstate.GeneratedPythonMetadataFileName), []byte("stale meta\n"), 0o644); err != nil {
		t.Fatalf("write stale generated metadata: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleRoot, "manual.py"), []byte("keep me\n"), 0o644); err != nil {
		t.Fatalf("write manual file: %v", err)
	}
	pluginOutput := filepath.Join(staleRoot, "plugin_codegen", "keep", "setta_gen.ts")
	if err := os.WriteFile(pluginOutput, []byte("keep plugin\n"), 0o644); err != nil {
		t.Fatalf("write plugin output: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects:      map[string]projectstate.Project{},
	}
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("materialize document: %v", err)
	}

	if _, err := os.Stat(filepath.Join(staleRoot, projectstate.GeneratedPythonCodeFileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale code removal, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(staleRoot, projectstate.GeneratedPythonMetadataFileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale metadata removal, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(staleRoot, "manual.py")); err != nil {
		t.Fatalf("expected unrelated file preservation, got %v", err)
	}
	if _, err := os.Stat(pluginOutput); err != nil {
		t.Fatalf("expected plugin output preservation, got %v", err)
	}
}

func pythonMaterializerTestDocument(project projectstate.Project) projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: project.ID,
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func assertGeneratedSectionPayloadChildrenEmpty(
	t *testing.T,
	payload projectstate.RawJSON,
) {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode generated section payload: %v", err)
	}
	children, ok := decoded["children"].([]any)
	if !ok {
		t.Fatalf("expected generated section payload children array, got %#v", decoded["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected generated section payload children to be empty, got %#v", children)
	}
	size, ok := decoded["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated section payload size object, got %#v", decoded["size"])
	}
	if size["width"] != 500.0 || size["height"] != 150.0 {
		t.Fatalf("expected generated section payload size 500x150, got %#v", size)
	}
}

func pythonPasswordMaterializerProject(t *testing.T) projectstate.Project {
	t.Helper()

	return projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Passwords",
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
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"Callable",
						"callable":"callable-root",
						"codeObjVariantMap":{
							"callable-root":"callable-variant-1",
							"param-secret":"param-secret-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "my_callable",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
			},
			"param-secret": {
				ID:               "param-secret",
				Name:             "api_key",
				VariantIDs:       []string{"param-secret-variant-1"},
				DefaultVariantID: "param-secret-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
			"param-secret-variant-1": {
				ID:     "param-secret-variant-1",
				ImplID: "param-secret-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-1": {
				ID: "callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-impl-1","type":"CodeCallable","children":["param-secret"]}`,
				),
			},
			"param-secret-impl-1": {
				ID: "param-secret-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"param-secret-impl-1","type":"PasswordParam","value":"ignored"}`,
				),
			},
		},
	}
}
