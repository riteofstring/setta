package codegen

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/codegencontracts"
	"setta/internal/projectstate"
)

func TestPluginMaterializerMaterializeDocumentWritesCanonicalPluginOutputs(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "./nested//setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("materialize plugin outputs: %v", err)
	}

	outputPath := filepath.Join(
		pluginCodegenOutputRoot(settaFilesRoot, "Alpha"),
		pluginCodegenTargetDirName("stub-plugin:target-a"),
		"nested",
		"setta_gen.ts",
	)
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read plugin output: %v", err)
	}
	if string(content) != "export const value = 'first'\n" {
		t.Fatalf("unexpected plugin output %q", string(content))
	}
}

func TestPluginMaterializerRejectsAbsoluteAndEscapingOutputPaths(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		relativePath string
	}{
		{name: "absolute", relativePath: "C:/outside.ts"},
		{name: "escape", relativePath: "../outside.ts"},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
			generator := newStubPluginCodegenGenerator()
			generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
				DefaultFileName:   "fixture_state.ts",
				ImplementationKey: "impl-a",
			}
			generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
				{RelativePath: testCase.relativePath, Content: "export const value = 'bad'\n"},
			}

			materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
				SettaFilesRoot: settaFilesRoot,
				Generator:      generator,
			})
			if err != nil {
				t.Fatalf("new plugin materializer: %v", err)
			}

			document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
			err = materializer.MaterializeDocument(context.Background(), document)
			if err == nil {
				t.Fatal("expected plugin output path rejection")
			}
			if testCase.name == "absolute" && !strings.Contains(err.Error(), "cannot be absolute") {
				t.Fatalf("expected absolute path rejection, got %v", err)
			}
			if testCase.name == "escape" && !strings.Contains(err.Error(), "cannot escape target root") {
				t.Fatalf("expected escape rejection, got %v", err)
			}
		})
	}
}

func TestPluginMaterializerSkipsUnchangedOutputs(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}
	if calls := generator.calls["stub-plugin:target-a"]; calls != 1 {
		t.Fatalf("expected one generation call, got %d", calls)
	}
}

func TestPluginMaterializerRegeneratesMissingOutput(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}
	outputPath := filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"), "setta_gen.ts")
	if err := os.Remove(outputPath); err != nil {
		t.Fatalf("remove plugin output: %v", err)
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}
	if calls := generator.calls["stub-plugin:target-a"]; calls != 2 {
		t.Fatalf("expected regeneration after missing output, got %d calls", calls)
	}
	if _, err := os.Stat(outputPath); err != nil {
		t.Fatalf("expected regenerated output, got %v", err)
	}
}

func TestPluginMaterializerRegeneratesModifiedOutput(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}
	outputPath := filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"), "setta_gen.ts")
	if err := os.WriteFile(outputPath, []byte("// modified externally\n"), 0o644); err != nil {
		t.Fatalf("modify plugin output: %v", err)
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}
	if calls := generator.calls["stub-plugin:target-a"]; calls != 2 {
		t.Fatalf("expected regeneration after modified output, got %d calls", calls)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read regenerated output: %v", err)
	}
	if string(content) != "export const value = 'first'\n" {
		t.Fatalf("unexpected regenerated output %q", string(content))
	}
}

func TestPluginMaterializerRegeneratesWhenExtraOutputExists(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}
	stalePath := filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"), "stale-extra.ts")
	if err := os.WriteFile(stalePath, []byte("// stale\n"), 0o644); err != nil {
		t.Fatalf("write stale output: %v", err)
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}
	if calls := generator.calls["stub-plugin:target-a"]; calls != 2 {
		t.Fatalf("expected regeneration after stale output, got %d calls", calls)
	}
	if _, err := os.Stat(stalePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale output removal, got %v", err)
	}
}

func TestPluginMaterializerRegeneratesWhenImplementationKeyChanges(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'first'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}

	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-b",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "setta_gen.ts", Content: "export const value = 'second'\n"},
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}
	if calls := generator.calls["stub-plugin:target-a"]; calls != 2 {
		t.Fatalf("expected regeneration after implementation change, got %d calls", calls)
	}
	content, err := os.ReadFile(filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"), "setta_gen.ts"))
	if err != nil {
		t.Fatalf("read regenerated output: %v", err)
	}
	if string(content) != "export const value = 'second'\n" {
		t.Fatalf("unexpected regenerated output %q", string(content))
	}
}

func TestPluginMaterializerTransitionsFileOutputToDirectoryOutput(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "nested", Content: "export const mode = 'file'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}

	targetRoot := filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"))
	filePath := filepath.Join(targetRoot, "nested")
	if info, err := os.Stat(filePath); err != nil || !info.Mode().IsRegular() {
		t.Fatalf("expected initial file output, info=%#v err=%v", info, err)
	}

	// A later generation can legitimately turn the same output path into a
	// directory; the materializer must remove the old file before writing the
	// nested child output.
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-b",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "nested/setta_gen.ts", Content: "export const mode = 'dir'\n"},
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}

	dirInfo, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("stat transitioned dir path: %v", err)
	}
	if !dirInfo.IsDir() {
		t.Fatalf("expected file output path to become a directory, got %#v", dirInfo.Mode())
	}
	content, err := os.ReadFile(filepath.Join(filePath, "setta_gen.ts"))
	if err != nil {
		t.Fatalf("read nested output: %v", err)
	}
	if string(content) != "export const mode = 'dir'\n" {
		t.Fatalf("unexpected nested output %q", string(content))
	}
}

func TestPluginMaterializerTransitionsDirectoryOutputToFileOutput(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	generator := newStubPluginCodegenGenerator()
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-a",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "nested/setta_gen.ts", Content: "export const mode = 'dir'\n"},
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		Generator:      generator,
	})
	if err != nil {
		t.Fatalf("new plugin materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(pluginMaterializerTestProject(t, "Alpha", "stub-plugin:target-a", `{"language":"stub-plugin:target-a"}`))
	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("first materialize: %v", err)
	}

	targetRoot := filepath.Join(pluginCodegenOutputRoot(settaFilesRoot, "Alpha"), pluginCodegenTargetDirName("stub-plugin:target-a"))
	dirPath := filepath.Join(targetRoot, "nested")
	if info, err := os.Stat(dirPath); err != nil || !info.IsDir() {
		t.Fatalf("expected initial directory output, info=%#v err=%v", info, err)
	}

	// The inverse transition must remove the stale directory tree before
	// rewriting the output path as a file.
	generator.resolved["stub-plugin:target-a"] = codegencontracts.PluginTargetResolution{
		DefaultFileName:   "fixture_state.ts",
		ImplementationKey: "impl-b",
	}
	generator.generated["stub-plugin:target-a"] = []codegencontracts.PluginGeneratedFile{
		{RelativePath: "nested", Content: "export const mode = 'file'\n"},
	}

	if err := materializer.MaterializeDocument(context.Background(), document); err != nil {
		t.Fatalf("second materialize: %v", err)
	}

	fileInfo, err := os.Stat(dirPath)
	if err != nil {
		t.Fatalf("stat transitioned file path: %v", err)
	}
	if !fileInfo.Mode().IsRegular() {
		t.Fatalf("expected directory output path to become a file, got %#v", fileInfo.Mode())
	}
	content, err := os.ReadFile(dirPath)
	if err != nil {
		t.Fatalf("read transitioned file output: %v", err)
	}
	if string(content) != "export const mode = 'file'\n" {
		t.Fatalf("unexpected transitioned file output %q", string(content))
	}
}

type stubPluginCodegenGenerator struct {
	resolved  map[string]codegencontracts.PluginTargetResolution
	generated map[string][]codegencontracts.PluginGeneratedFile
	calls     map[string]int
}

func newStubPluginCodegenGenerator() *stubPluginCodegenGenerator {
	return &stubPluginCodegenGenerator{
		resolved:  map[string]codegencontracts.PluginTargetResolution{},
		generated: map[string][]codegencontracts.PluginGeneratedFile{},
		calls:     map[string]int{},
	}
}

func (s *stubPluginCodegenGenerator) ResolvePluginCodegenTarget(
	_ context.Context,
	language string,
) (codegencontracts.PluginTargetResolution, bool, error) {
	resolved, ok := s.resolved[language]
	return resolved, ok, nil
}

func (s *stubPluginCodegenGenerator) GeneratePluginCodegenTarget(
	_ context.Context,
	language string,
	_ map[string]any,
	_ map[string]any,
) ([]codegencontracts.PluginGeneratedFile, error) {
	s.calls[language]++
	files := s.generated[language]
	cloned := make([]codegencontracts.PluginGeneratedFile, len(files))
	copy(cloned, files)
	return cloned, nil
}

func pluginMaterializerTestDocument(project projectstate.Project) projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: project.ID,
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func pluginMaterializerTestProject(
	t *testing.T,
	name string,
	language string,
	rawPayload string,
) projectstate.Project {
	t.Helper()

	return projectstate.Project{
		ID:   "project-alpha",
		Name: name,
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: language,
				Payload:  mustRawJSON(t, rawPayload),
			},
		},
	}
}
