package projectstate

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"setta/internal/watchcode"
)

func TestDocumentStoresWatchCodeStateInProviderPluginData(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	expected := WatchCodePluginProjectData{
		Enabled: true,
		Folders: []WatchCodeFolder{{Path: "pkg", Recursive: true}},
		Files:   []string{"pkg/watch_me.py"},
		Registry: map[string]WatchCodeRegistryEntry{
			"pkg.watch_me.existing:function": {
				CallableName:  "existing",
				Kind:          WatchCodeCallableKindFunction,
				SignatureHash: "sig",
				BodyHash:      "body",
				SourcePath:    "/workspace/pkg/watch_me.py",
				SectionIDs:    []string{"section-existing"},
				SectionsCount: 1,
			},
		},
		BaselineByPath: map[string][]string{
			"/workspace/pkg/watch_me.py": {"pkg.watch_me.existing:function"},
		},
	}.Normalized()

	normalized := document
	mustSetTestWatchCodePluginProjectData(t, &normalized, "project-alpha", expected)

	project := normalized.Projects["project-alpha"]
	payload := normalized.PluginData[testWatchCodeProviderPluginID]
	if len(payload) == 0 {
		t.Fatalf("expected watch code plugin data, got %#v", normalized.PluginData)
	}
	var stored WatchCodePluginData
	if err := json.Unmarshal(payload, &stored); err != nil {
		t.Fatalf("decode watch code plugin data: %v", err)
	}
	if !reflect.DeepEqual(stored.Projects["project-alpha"], expected) {
		t.Fatalf("expected stored watch code project data %#v, got %#v", expected, stored.Projects["project-alpha"])
	}

	encodedProject, err := json.Marshal(project)
	if err != nil {
		t.Fatalf("marshal project: %v", err)
	}
	for _, legacyField := range []string{
		"watchCodeEnabled",
		"watchCodeFolders",
		"watchCodeFiles",
		"watchCodeRegistry",
		"watchCodeBaselineByPath",
	} {
		if strings.Contains(string(encodedProject), legacyField) {
			t.Fatalf("did not expect legacy field %q in project JSON %s", legacyField, encodedProject)
		}
	}
}

func TestDocumentLoadsWatchCodeStateFromProviderPluginData(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		PluginData: map[string]RawJSON{
			testWatchCodeProviderPluginID: mustRawJSON(t, `{
				"schemaVersion": 1,
				"projects": {
					"project-alpha": {
						"enabled": true,
						"folders": [{"path": "pkg", "recursive": true}],
						"files": ["pkg/watch_me.py"],
						"registry": {
							"pkg.watch_me.existing:function": {
								"callableName": "existing",
								"kind": "function",
								"signatureHash": "sig",
								"bodyHash": "body",
								"sourcePath": "/workspace/pkg/watch_me.py",
								"sectionIds": ["section-existing"],
								"sectionsCount": 1
							}
						},
						"baselineByPath": {
							"/workspace/pkg/watch_me.py": ["pkg.watch_me.existing:function"]
						}
					}
				}
			}`),
		},
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	normalized := document
	projectData := mustReadTestWatchCodePluginProjectData(t, normalized, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected watch code enabled from plugin data")
	}
	if !reflect.DeepEqual(projectData.Folders, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected watch code folders from plugin data, got %#v", projectData.Folders)
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch_me.py"}) {
		t.Fatalf("expected watch code files from plugin data, got %#v", projectData.Files)
	}
	if got := projectData.BaselineByPath["/workspace/pkg/watch_me.py"]; !reflect.DeepEqual(got, []string{"pkg.watch_me.existing:function"}) {
		t.Fatalf("expected watch code baseline from plugin data, got %#v", projectData.BaselineByPath)
	}
	if entry := projectData.Registry["pkg.watch_me.existing:function"]; entry.CallableName != "existing" {
		t.Fatalf("expected watch code registry from plugin data, got %#v", projectData.Registry)
	}
}

func TestDocumentWatchCodeProjectDataIsProviderKeyed(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		PluginData: map[string]RawJSON{
			testWatchCodeProviderPluginID: mustRawJSON(t, `{
				"schemaVersion": 1,
				"projects": {
					"project-alpha": {
						"enabled": true,
						"folders": [{"path": "pkg", "recursive": true}],
						"files": ["pkg/watch_me.py"],
						"registry": {
							"pkg.watch_me.existing:function": {
								"callableName": "existing",
								"kind": "function",
								"signatureHash": "sig",
								"bodyHash": "body",
								"sourcePath": "/workspace/pkg/watch_me.py"
							}
						},
						"baselineByPath": {
							"/workspace/pkg/watch_me.py": ["pkg.watch_me.existing:function"]
						}
					}
				}
			}`),
		},
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, document, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected first provider to expose watch code state")
	}

	otherProviderData, exists, err := document.WatchCodePluginProjectData("setta-other-watch-code-provider", "project-alpha")
	if err != nil {
		t.Fatalf("read other provider watch code plugin data: %v", err)
	}
	if exists || !otherProviderData.IsEmpty() {
		t.Fatalf("expected missing provider payload to return empty state, got exists=%v data=%#v", exists, otherProviderData)
	}
}

func TestDocumentNormalizedIgnoresLegacyTopLevelWatchCodeFields(t *testing.T) {
	t.Parallel()

	var document Document
	if err := json.Unmarshal([]byte(`{
		"schemaVersion": 1,
		"defaultProjectId": "project-alpha",
		"projects": {
			"project-alpha": {
				"id": "project-alpha",
				"name": "Alpha",
				"watchCodeEnabled": true,
				"watchCodeFolders": [{"path": "pkg", "recursive": true}],
				"watchCodeFiles": ["pkg/watch_me.py"]
			}
		}
	}`), &document); err != nil {
		t.Fatalf("decode document: %v", err)
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}
	project := normalized.Projects["project-alpha"]
	if project.ID != "project-alpha" {
		t.Fatalf("expected project to load without legacy watch code fields, got %#v", project)
	}
	if _, ok := normalized.PluginData[testWatchCodeProviderPluginID]; ok {
		t.Fatalf("did not expect legacy top-level fields to create plugin data, got %#v", normalized.PluginData)
	}
}

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

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watch_me.py"},
	})
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := runtime.SetWatchCodeEnabled(
		context.Background(),
		testWatchCodeProviderPluginID, "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected watch code enabled")
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch_me.py"}) {
		t.Fatalf("expected normalized watch file path, got %#v", projectData.Files)
	}
	expectedBaselineKey := filepath.Clean(watchFile)
	expectedIdentity := "pkg.watch_me.existing:function"
	if !reflect.DeepEqual(projectData.BaselineByPath[expectedBaselineKey], []string{expectedIdentity}) {
		t.Fatalf("expected baseline for %q, got %#v", expectedBaselineKey, projectData.BaselineByPath)
	}
	if len(projectData.Registry) != 0 {
		t.Fatalf("expected empty watch code registry, got %#v", projectData.Registry)
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

	if _, err := runtime.SetWatchCodeEnabled(
		context.Background(),
		testWatchCodeProviderPluginID, "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	snapshot := runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected watch code enabled")
	}
	expectedBaselineKey := filepath.Clean(boundFile)
	expectedIdentity := "sections.main.existing:function"
	if !reflect.DeepEqual(projectData.BaselineByPath[expectedBaselineKey], []string{expectedIdentity}) {
		t.Fatalf("expected bound-code baseline for %q, got %#v", expectedBaselineKey, projectData.BaselineByPath)
	}
	if len(projectData.Registry) != 0 {
		t.Fatalf("expected no retro-created watch code registry entries, got %#v", projectData.Registry)
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
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Enabled: true,
		Files:   []string{"pkg/existing.py"},
		BaselineByPath: map[string][]string{
			existingBaselineKey: {existingIdentity},
		},
	})
	runtime, err := OpenOverlayRuntime(document)
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
		testWatchCodeProviderPluginID,
		"project-alpha",
		nil,
		[]string{"pkg/existing.py", "pkg/new_watch.py"},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code inputs: %v", err)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch code files, got %#v", projectData.Files)
	}
	if !reflect.DeepEqual(projectData.BaselineByPath[existingBaselineKey], []string{existingIdentity}) {
		t.Fatalf("expected existing baseline to stay unchanged, got %#v", projectData.BaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	expectedNewIdentity := "pkg.new_watch.Added:class_init"
	if !reflect.DeepEqual(projectData.BaselineByPath[newBaselineKey], []string{expectedNewIdentity}) {
		t.Fatalf("expected new baseline for %q, got %#v", newBaselineKey, projectData.BaselineByPath)
	}
}

func TestRuntimeSetWatchCodeFoldersPreservesNewerFiles(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := watchCodeInputsFieldMutationDocument(t)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := runtime.SetWatchCodeFiles(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]string{"pkg/newer.py"},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code files: %v", err)
	}
	if _, err := runtime.SetWatchCodeFolders(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]WatchCodeFolder{{Path: "pkg/newer", Recursive: true}},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code folders: %v", err)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Folders, []WatchCodeFolder{{Path: "pkg/newer", Recursive: true}}) {
		t.Fatalf("expected folders update, got %#v", projectData.Folders)
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/newer.py"}) {
		t.Fatalf("expected newer files to remain, got %#v", projectData.Files)
	}
}

func TestRuntimeSetWatchCodeFilesPreservesNewerFolders(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := watchCodeInputsFieldMutationDocument(t)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := runtime.SetWatchCodeFolders(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]WatchCodeFolder{{Path: "pkg/newer", Recursive: true}},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code folders: %v", err)
	}
	if _, err := runtime.SetWatchCodeFiles(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		[]string{"pkg/newer.py"},
		workspaceRoot,
	); err != nil {
		t.Fatalf("set watch code files: %v", err)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Folders, []WatchCodeFolder{{Path: "pkg/newer", Recursive: true}}) {
		t.Fatalf("expected newer folders to remain, got %#v", projectData.Folders)
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/newer.py"}) {
		t.Fatalf("expected files update, got %#v", projectData.Files)
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

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{
			"project/tracked.py",
			"project/custom_state/ignored.py",
			"project/scratch_runtime/ignored.py",
			"project/node_modules/ignored.py",
			"project/runtime/keep.py",
		},
		Folders: []WatchCodeFolder{
			{Path: "project", Recursive: true},
		},
	})
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
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

	if _, err := runtime.SetWatchCodeEnabled(
		context.Background(),
		testWatchCodeProviderPluginID, "project-alpha", true, workspaceRoot); err != nil {
		t.Fatalf("enable watch code: %v", err)
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, runtime.Snapshot().Document, "project-alpha")
	expected := map[string][]string{
		filepath.Clean(trackedFile):     []string{"project.tracked.tracked:function"},
		filepath.Clean(userRuntimeFile): []string{"project.runtime.keep.keep:function"},
	}
	if !reflect.DeepEqual(projectData.BaselineByPath, expected) {
		t.Fatalf("expected only tracked and user runtime baselines %#v, got %#v", expected, projectData.BaselineByPath)
	}
	for _, ignoredPath := range []string{stateRootFile, configuredRuntimeFile, nodeModulesFile} {
		if _, ok := projectData.BaselineByPath[filepath.Clean(ignoredPath)]; ok {
			t.Fatalf("expected ignored path %q to stay out of baseline %#v", ignoredPath, projectData.BaselineByPath)
		}
	}
}

func watchCodeInputsFieldMutationDocument(t *testing.T) Document {
	t.Helper()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Folders: []WatchCodeFolder{{Path: "pkg/old", Recursive: false}},
		Files:   []string{"pkg/old.py"},
	})
	return document
}

func TestIterWatchCodePythonFilesHonorsTraversalModeAndIgnoredRoots(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	topLevelFile := filepath.Join(root, "top.py")
	nestedFile := filepath.Join(root, "nested", "child.py")
	ignoredRoot := filepath.Join(root, "custom_ignored")
	ignoredFile := filepath.Join(ignoredRoot, "ignored.py")
	for path, content := range map[string]string{
		topLevelFile:                     "def top():\n    return 1\n",
		nestedFile:                       "def child():\n    return 2\n",
		ignoredFile:                      "def ignored():\n    return 3\n",
		filepath.Join(root, "README.md"): "# ignored\n",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir parent for %q: %v", path, err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	nonRecursive, err := iterWatchCodePythonFiles(root, false, []string{ignoredRoot})
	if err != nil {
		t.Fatalf("scan top-level watch code files: %v", err)
	}
	sort.Strings(nonRecursive)
	if !reflect.DeepEqual(nonRecursive, []string{topLevelFile}) {
		t.Fatalf("expected only top-level python files, got %#v", nonRecursive)
	}

	recursive, err := iterWatchCodePythonFiles(root, true, []string{ignoredRoot})
	if err != nil {
		t.Fatalf("scan recursive watch code files: %v", err)
	}
	sort.Strings(recursive)
	expectedRecursive := []string{nestedFile, topLevelFile}
	if !reflect.DeepEqual(recursive, expectedRecursive) {
		t.Fatalf("expected recursive python files %#v, got %#v", expectedRecursive, recursive)
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
		testWatchCodeProviderPluginID,
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
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Enabled: true,
		Files:   []string{"pkg/watch.py"},
		Folders: []WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
	})

	configs, err := WatchCodeConfigInputs(document, testWatchCodeProviderPluginID)
	if err != nil {
		t.Fatalf("watch code config inputs: %v", err)
	}
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
	projectData := mustReadTestWatchCodePluginProjectData(t, document, "project-alpha")
	if !projectData.Enabled {
		t.Fatal("expected original project watch code flag to stay enabled")
	}
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) {
		t.Fatalf("expected original watch files to stay unchanged, got %#v", projectData.Files)
	}
	if !reflect.DeepEqual(projectData.Folders, []WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected original watch folders to stay unchanged, got %#v", projectData.Folders)
	}
}
