package projectstate

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/watchcode"
)

func TestRuntimeSetWatchCodeEnabledBaselinesExistingDefs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	watchFile := filepath.Join(workspaceRoot, "pkg", "watch_me.py")
	if err := os.MkdirAll(filepath.Dir(watchFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:             "project-alpha",
				Name:           "Alpha",
				WatchCodeFiles: []string{"pkg/watch_me.py"},
			},
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

	if _, err := runtime.SetWatchCodeEnabled(context.Background(), "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if !project.WatchCodeEnabled {
		t.Fatal("expected watch code enabled")
	}
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/watch_me.py"}) {
		t.Fatalf("expected normalized watch file path, got %#v", project.WatchCodeFiles)
	}
	expectedBaselineKey := filepath.Clean(watchFile)
	expectedIdentity := "pkg.watch_me.existing:function"
	if !reflect.DeepEqual(project.WatchCodeBaselineByPath[expectedBaselineKey], []string{expectedIdentity}) {
		t.Fatalf("expected baseline for %q, got %#v", expectedBaselineKey, project.WatchCodeBaselineByPath)
	}
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected empty watch code registry, got %#v", project.WatchCodeRegistry)
	}
}

func TestRuntimeSetWatchCodeEnabledBaselinesBoundPythonCodeSections(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	boundFile := filepath.Join(workspaceRoot, "sections", "main.py")
	if err := os.MkdirAll(filepath.Dir(boundFile), 0o755); err != nil {
		t.Fatalf("mkdir bound file parent: %v", err)
	}
	if err := os.WriteFile(boundFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write bound file: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				Sections: map[string]Section{
					"section-main": {
						ID:               "section-main",
						Name:             "Main",
						VariantIDs:       []string{"variant-main"},
						DefaultVariantID: "variant-main",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"variant-main": {
						ID:     "variant-main",
						ImplID: "impl-main",
					},
				},
				SectionVariantMap: map[string]string{
					"section-main": "variant-main",
				},
				SectionImpls: map[string]SectionImpl{
					"impl-main": {
						ID:      "impl-main",
						Kind:    SectionKindCode,
						Payload: mustRawJSON(t, `{"id":"impl-main","type":"Code","codeLanguage":"python","children":[]}`),
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
							Binding:  &CodeFileBinding{Path: "sections/main.py"},
						},
					},
				},
			},
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

	if _, err := runtime.SetWatchCodeEnabled(context.Background(), "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if !project.WatchCodeEnabled {
		t.Fatal("expected watch code enabled")
	}
	expectedBaselineKey := filepath.Clean(boundFile)
	expectedIdentity := "sections.main.existing:function"
	if !reflect.DeepEqual(project.WatchCodeBaselineByPath[expectedBaselineKey], []string{expectedIdentity}) {
		t.Fatalf("expected bound-code baseline for %q, got %#v", expectedBaselineKey, project.WatchCodeBaselineByPath)
	}
	if len(project.WatchCodeRegistry) != 0 {
		t.Fatalf("expected no retro-created watch code registry entries, got %#v", project.WatchCodeRegistry)
	}
	if len(project.Sections) != 1 {
		t.Fatalf("expected no new callable sections from baseline, got %#v", project.Sections)
	}
}

func TestRuntimeSetWatchCodeInputsBaselinesOnlyNewInputsWhenEnabled(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFile := filepath.Join(workspaceRoot, "pkg", "new_watch.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir existing file parent: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("class Added:\n    def __init__(self, value):\n        self.value = value\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	existingBaselineKey := filepath.Clean(existingFile)
	existingIdentity := "pkg.existing.existing:function"
	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/existing.py"},
				WatchCodeBaselineByPath: map[string][]string{
					existingBaselineKey: []string{existingIdentity},
				},
			},
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

	if _, err := runtime.SetWatchCodeInputs(
		context.Background(),
		"project-alpha",
		nil,
		[]string{"pkg/existing.py", "pkg/new_watch.py"},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code inputs: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch code files, got %#v", project.WatchCodeFiles)
	}
	if !reflect.DeepEqual(project.WatchCodeBaselineByPath[existingBaselineKey], []string{existingIdentity}) {
		t.Fatalf("expected existing baseline to stay unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	expectedNewIdentity := "pkg.new_watch.Added:class_init"
	if !reflect.DeepEqual(project.WatchCodeBaselineByPath[newBaselineKey], []string{expectedNewIdentity}) {
		t.Fatalf("expected new baseline for %q, got %#v", newBaselineKey, project.WatchCodeBaselineByPath)
	}
}

func TestRuntimeSetWatchCodeEnabledBaselineScansIgnoreConfiguredRootsAndExplicitIgnoredFiles(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectDir := filepath.Join(workspaceRoot, "project")
	stateRoot := filepath.Join(projectDir, "custom_state")
	configuredRuntimeRoot := filepath.Join(projectDir, "scratch_runtime")
	userRuntimeDir := filepath.Join(projectDir, "runtime")
	nodeModulesDir := filepath.Join(projectDir, "node_modules")
	if err := os.MkdirAll(stateRoot, 0o755); err != nil {
		t.Fatalf("mkdir state root: %v", err)
	}
	if err := os.MkdirAll(configuredRuntimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.MkdirAll(userRuntimeDir, 0o755); err != nil {
		t.Fatalf("mkdir user runtime dir: %v", err)
	}
	if err := os.MkdirAll(nodeModulesDir, 0o755); err != nil {
		t.Fatalf("mkdir node_modules dir: %v", err)
	}

	trackedFile := filepath.Join(projectDir, "tracked.py")
	userRuntimeFile := filepath.Join(userRuntimeDir, "keep.py")
	stateRootFile := filepath.Join(stateRoot, "ignored.py")
	configuredRuntimeFile := filepath.Join(configuredRuntimeRoot, "ignored.py")
	nodeModulesFile := filepath.Join(nodeModulesDir, "ignored.py")
	for path, content := range map[string]string{
		trackedFile:           "def tracked(value):\n    return value\n",
		userRuntimeFile:       "def keep(value):\n    return value\n",
		stateRootFile:         "def state_ignored(value):\n    return value\n",
		configuredRuntimeFile: "def runtime_ignored(value):\n    return value\n",
		nodeModulesFile:       "def node_ignored(value):\n    return value\n",
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	runtime, err := OpenOverlayRuntimeWithOptions(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				WatchCodeFiles: []string{
					"project/tracked.py",
					"project/custom_state/ignored.py",
					"project/scratch_runtime/ignored.py",
					"project/node_modules/ignored.py",
					"project/runtime/keep.py",
				},
				WatchCodeFolders: []WatchCodeFolder{
					{Path: "project", Recursive: true},
				},
			},
		},
	}, RuntimeOptions{
		WatchCodeIgnoredRoots: []string{stateRoot, configuredRuntimeRoot},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := runtime.SetWatchCodeEnabled(context.Background(), "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	expected := map[string][]string{
		filepath.Clean(trackedFile):     []string{"project.tracked.tracked:function"},
		filepath.Clean(userRuntimeFile): []string{"project.runtime.keep.keep:function"},
	}
	if !reflect.DeepEqual(project.WatchCodeBaselineByPath, expected) {
		t.Fatalf("expected only tracked and user runtime baselines %#v, got %#v", expected, project.WatchCodeBaselineByPath)
	}
	for _, ignoredPath := range []string{stateRootFile, configuredRuntimeFile, nodeModulesFile} {
		if _, ok := project.WatchCodeBaselineByPath[filepath.Clean(ignoredPath)]; ok {
			t.Fatalf("expected ignored path %q to stay out of baseline %#v", ignoredPath, project.WatchCodeBaselineByPath)
		}
	}
}

func TestRuntimeSetWatchCodeInputsRejectsOutsideWorkspace(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	outsideFile := filepath.Join(filepath.Dir(workspaceRoot), "outside_watch.py")
	if err := os.WriteFile(outsideFile, []byte("def outside():\n    return 1\n"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	if _, err := runtime.SetWatchCodeInputs(
		context.Background(),
		"project-alpha",
		nil,
		[]string{outsideFile},
		workspaceRoot,
	); err == nil {
		t.Fatal("expected outside-workspace watch code input to fail")
	}
}

func TestParseWatchCodeBaselineIdentitiesUsesSharedParserSemantics(t *testing.T) {
	t.Parallel()

	// Baseline parsing should reuse the shared watch-code parser for decorated async defs and classes.
	identities, parsed, err := parseWatchCodeBaselineIdentities(`
@decorator
async def beta(flag):
    return flag

@decorator
class Widget:
    pass
`, "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse watch code baseline identities: %v", err)
	}
	if !parsed {
		t.Fatal("expected baseline parser success")
	}
	expected := []string{
		"pkg.watch_me.Widget:class_init",
		"pkg.watch_me.beta:async_function",
	}
	if !reflect.DeepEqual(identities, expected) {
		t.Fatalf("expected identities %#v, got %#v", expected, identities)
	}
}

func TestWatchCodeConfigInputsClonesProjectWatchState(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watch.py"},
				WatchCodeFolders: []WatchCodeFolder{
					{Path: "pkg", Recursive: true},
				},
			},
		},
	}

	configs := WatchCodeConfigInputs(document)
	expected := map[string]watchcode.ConfigInputs{
		"project-alpha": {
			Enabled: true,
			Files:   []string{"pkg/watch.py"},
			Folders: []watchcode.FolderInput{
				{Path: "pkg", Recursive: true},
			},
		},
	}
	if !reflect.DeepEqual(configs, expected) {
		t.Fatalf("expected watch code configs %#v, got %#v", expected, configs)
	}

	configs["project-alpha"] = watchcode.ConfigInputs{
		Enabled: false,
		Files:   []string{"other.py"},
		Folders: []watchcode.FolderInput{{Path: "other", Recursive: false}},
	}
	project := document.Projects["project-alpha"]
	if !project.WatchCodeEnabled {
		t.Fatal("expected original project watch code flag to stay enabled")
	}
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/watch.py"}) {
		t.Fatalf("expected original watch files to stay unchanged, got %#v", project.WatchCodeFiles)
	}
	if !reflect.DeepEqual(project.WatchCodeFolders, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected original watch folders to stay unchanged, got %#v", project.WatchCodeFolders)
	}
}
