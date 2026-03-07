package codegen

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/plugins"
	"setta/internal/projectstate"
)

// The first Go-owned materializer should invoke a real backend worker and write plugin outputs under the deterministic project code root.
func TestPluginMaterializerMaterializeProjectWithPythonWorker(t *testing.T) {
	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		WorkerSpecs: pluginCodegenSpecResolverFunc(func(_ context.Context, targetID string) (plugins.BackendWorkerSpec, error) {
			if targetID != "setta-fixture-backend-codegen:typescript" {
				return plugins.BackendWorkerSpec{}, errors.New("unexpected target id")
			}
			return newBackendCodegenWorkerSpec(t), nil
		}),
	})
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(t, "Plugin Codegen")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := materializer.MaterializeProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("materialize project: %v", err)
	}

	outputPath := filepath.Join(
		pluginCodegenOutputRoot(settaFilesRoot, "Plugin Codegen"),
		pluginCodegenTargetDirName("setta-fixture-backend-codegen:typescript"),
		"setta_gen.ts",
	)
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read materialized output: %v", err)
	}
	if string(content) != "export class PluginState {\n  readonly projectName = 'Plugin Codegen';\n}\n" {
		t.Fatalf("unexpected output content: %q", string(content))
	}
}

// Re-materialization should remove stale files and stale target directories instead of leaving previous outputs behind.
func TestPluginMaterializerMaterializeProjectPrunesStaleOutputs(t *testing.T) {
	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		WorkerSpecs: pluginCodegenSpecResolverFunc(func(_ context.Context, targetID string) (plugins.BackendWorkerSpec, error) {
			if targetID != "setta-fixture-backend-codegen:typescript" {
				return plugins.BackendWorkerSpec{}, errors.New("unexpected target id")
			}
			return newBackendCodegenWorkerSpec(t), nil
		}),
	})
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}

	document := pluginMaterializerTestDocument(t, "Plugin Codegen")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := materializer.MaterializeProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("first materialize project: %v", err)
	}

	outputRoot := pluginCodegenOutputRoot(settaFilesRoot, "Plugin Codegen")
	targetRoot := filepath.Join(outputRoot, pluginCodegenTargetDirName("setta-fixture-backend-codegen:typescript"))
	staleFile := filepath.Join(targetRoot, "stale.ts")
	if err := os.WriteFile(staleFile, []byte("// stale\n"), 0o644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}
	staleDir := filepath.Join(outputRoot, "stale_target")
	if err := os.MkdirAll(staleDir, 0o755); err != nil {
		t.Fatalf("mkdir stale dir: %v", err)
	}

	if err := materializer.MaterializeProject(ctx, document, "project-alpha"); err != nil {
		t.Fatalf("second materialize project: %v", err)
	}

	if _, err := os.Stat(staleFile); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale file removal, got %v", err)
	}
	if _, err := os.Stat(staleDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale dir removal, got %v", err)
	}
}

// Invalid plugin target payload shapes should fail before any worker startup happens.
func TestPluginMaterializerRejectsInvalidTargetPayload(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		WorkerSpecs: pluginCodegenSpecResolverFunc(func(context.Context, string) (plugins.BackendWorkerSpec, error) {
			t.Fatal("worker spec resolver should not be called")
			return plugins.BackendWorkerSpec{}, nil
		}),
	})
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}

	testCases := []struct {
		name    string
		payload json.RawMessage
		target  error
		message string
	}{
		{
			name:    "non object payload",
			payload: json.RawMessage(`[]`),
			target:  ErrPluginCodegenTargetPayloadInvalid,
			message: "decode",
		},
		{
			name:    "language mismatch",
			payload: json.RawMessage(`{"language":"other-plugin:target"}`),
			target:  ErrPluginCodegenTargetLanguageMismatch,
			message: "other-plugin:target",
		},
		{
			name:    "invalid options payload",
			payload: json.RawMessage(`{"language":"setta-fixture-backend-codegen:typescript","options":[]}`),
			target:  ErrPluginCodegenTargetOptionsInvalid,
			message: "options",
		},
		{
			name:    "unsupported field",
			payload: json.RawMessage(`{"language":"setta-fixture-backend-codegen:typescript","extra":true}`),
			target:  ErrPluginCodegenTargetPayloadInvalid,
			message: "unsupported field",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document := projectstate.Document{
				SchemaVersion:    projectstate.CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]projectstate.Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: "Plugin Codegen",
						CodegenTargets: []projectstate.ProjectCodegenTarget{
							{
								Language: "setta-fixture-backend-codegen:typescript",
								Payload:  append(json.RawMessage(nil), testCase.payload...),
							},
						},
					},
				},
			}

			err := materializer.MaterializeProject(context.Background(), document, "project-alpha")
			if !errors.Is(err, testCase.target) {
				t.Fatalf("expected %v, got %v", testCase.target, err)
			}
			if !strings.Contains(err.Error(), testCase.message) {
				t.Fatalf("expected %q in %v", testCase.message, err)
			}
		})
	}
}

// Removing plugin codegen targets should remove the previous output root instead of leaving stale generated files behind.
func TestPluginMaterializerRemovesOutputRootWhenNoPluginTargetsRemain(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	outputRoot := pluginCodegenOutputRoot(settaFilesRoot, "Plugin Codegen")
	if err := os.MkdirAll(outputRoot, 0o755); err != nil {
		t.Fatalf("mkdir output root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outputRoot, "stale.txt"), []byte("stale\n"), 0o644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}

	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		WorkerSpecs: pluginCodegenSpecResolverFunc(func(context.Context, string) (plugins.BackendWorkerSpec, error) {
			t.Fatal("worker spec resolver should not be called")
			return plugins.BackendWorkerSpec{}, nil
		}),
	})
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Plugin Codegen",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
			},
		},
	}
	if err := materializer.MaterializeProject(context.Background(), document, "project-alpha"); err != nil {
		t.Fatalf("materialize project with no plugin targets: %v", err)
	}

	if _, err := os.Stat(outputRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected output root removal, got %v", err)
	}
}

// Document-level materialization should refresh all current projects and prune stale plugin roots left behind by removed or renamed projects.
func TestPluginMaterializerMaterializeDocumentPrunesStaleProjectRoots(t *testing.T) {
	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	materializer, err := NewPluginMaterializer(PluginMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		WorkerSpecs: pluginCodegenSpecResolverFunc(func(_ context.Context, targetID string) (plugins.BackendWorkerSpec, error) {
			if targetID != "setta-fixture-backend-codegen:typescript" {
				return plugins.BackendWorkerSpec{}, errors.New("unexpected target id")
			}
			return newBackendCodegenWorkerSpec(t), nil
		}),
	})
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}

	staleRoot := pluginCodegenOutputRoot(settaFilesRoot, "Removed Project")
	if err := os.MkdirAll(staleRoot, 0o755); err != nil {
		t.Fatalf("mkdir stale root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleRoot, "stale.txt"), []byte("stale\n"), 0o644); err != nil {
		t.Fatalf("write stale root file: %v", err)
	}

	document := pluginMaterializerTestDocument(t, "Plugin Codegen")
	document.Projects["project-beta"] = projectstate.Project{
		ID:   "project-beta",
		Name: "Plain Project",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := materializer.MaterializeDocument(ctx, document); err != nil {
		t.Fatalf("materialize document: %v", err)
	}

	currentOutput := filepath.Join(
		pluginCodegenOutputRoot(settaFilesRoot, "Plugin Codegen"),
		pluginCodegenTargetDirName("setta-fixture-backend-codegen:typescript"),
		"setta_gen.ts",
	)
	if _, err := os.Stat(currentOutput); err != nil {
		t.Fatalf("expected current plugin output: %v", err)
	}

	plainProjectRoot := pluginCodegenOutputRoot(settaFilesRoot, "Plain Project")
	if _, err := os.Stat(plainProjectRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected plain project root removal, got %v", err)
	}
	if _, err := os.Stat(staleRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected stale project root removal, got %v", err)
	}
}

type pluginCodegenSpecResolverFunc func(context.Context, string) (plugins.BackendWorkerSpec, error)

func (f pluginCodegenSpecResolverFunc) ResolvePluginCodegenWorkerSpec(ctx context.Context, targetID string) (plugins.BackendWorkerSpec, error) {
	return f(ctx, targetID)
}

func pluginMaterializerTestDocument(t *testing.T, projectName string) projectstate.Document {
	t.Helper()

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: projectName,
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: "setta-fixture-backend-codegen:typescript",
						Payload: mustPluginCodegenJSON(t, map[string]any{
							"language": "setta-fixture-backend-codegen:typescript",
							"options": map[string]any{
								"className": "PluginState",
							},
						}),
					},
				},
			},
		},
	}
}

func mustPluginCodegenJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal plugin codegen json: %v", err)
	}
	return payload
}

func newBackendCodegenWorkerSpec(t *testing.T) plugins.BackendWorkerSpec {
	t.Helper()

	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(mustCallerFile(t)), "..", ".."))
	pluginRoot := copyBackendCodegenFixture(t, repoRoot)
	return plugins.BackendWorkerSpec{
		PythonBinary:          workerPythonBinary(t, repoRoot),
		PluginID:              "setta-fixture-backend-codegen",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            filepath.Join(pluginRoot, "backend", "entrypoint.py"),
		ServerMode:            "launcher",
		EffectiveCapabilities: []string{plugins.CapabilityRegisterCodegenTarget},
		Environment:           workerEnv(repoRoot),
		WorkingDirectory:      repoRoot,
	}
}

func mustCallerFile(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(1)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return file
}

func copyBackendCodegenFixture(t *testing.T, repoRoot string) string {
	t.Helper()

	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend-codegen")
	targetRoot := filepath.Join(t.TempDir(), "backend-codegen")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	return targetRoot
}

func copyBackendCodegenFixtureDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyBackendCodegenFixtureDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func workerPythonBinary(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
		"python3",
		"python",
	}
	for _, candidate := range candidates {
		if strings.Contains(candidate, string(filepath.Separator)) {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			continue
		}
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}

	t.Fatalf("python interpreter not found under %s", repoRoot)
	return ""
}

func workerEnv(repoRoot string) []string {
	backendPath := filepath.Join(repoRoot, "backend")
	env := os.Environ()
	pythonPathSet := false

	for index, entry := range env {
		if !strings.HasPrefix(entry, "PYTHONPATH=") {
			continue
		}
		current := strings.TrimPrefix(entry, "PYTHONPATH=")
		if current == "" {
			env[index] = "PYTHONPATH=" + backendPath
		} else {
			env[index] = "PYTHONPATH=" + backendPath + string(os.PathListSeparator) + current
		}
		pythonPathSet = true
		break
	}

	if !pythonPathSet {
		env = append(env, "PYTHONPATH="+backendPath)
	}
	env = append(env, "PYTHONUNBUFFERED=1")
	return env
}
