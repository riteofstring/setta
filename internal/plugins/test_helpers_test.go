package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

const (
	pluginFixturePythonEnv    = "SETTA_PLUGIN_FIXTURE_PYTHON"
	pluginFixtureLSPScriptEnv = "SETTA_PLUGIN_FIXTURE_LSP_SCRIPT"
)

type filesystemPluginScope string

const (
	filesystemPluginScopeWorkspace  filesystemPluginScope = filesystemPluginScope(PluginScopeWorkspace)
	filesystemPluginScopeSettaFiles filesystemPluginScope = filesystemPluginScope(PluginScopeSettaFiles)
	filesystemPluginScopeGlobal     filesystemPluginScope = filesystemPluginScope(PluginScopeGlobal)
)

type filesystemResolverTestRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

func newFilesystemResolverTestRoots(t *testing.T) filesystemResolverTestRoots {
	t.Helper()

	baseRoot := t.TempDir()
	roots := filesystemResolverTestRoots{
		workspaceRoot:  filepath.Join(baseRoot, "workspace"),
		settaFilesRoot: filepath.Join(baseRoot, "setta_files"),
		settaHome:      filepath.Join(baseRoot, ".setta"),
	}
	for _, root := range []string{roots.workspaceRoot, roots.settaFilesRoot, roots.settaHome} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatalf("mkdir test root %s: %v", root, err)
		}
	}
	return roots
}

func copyPluginFixtureToScope(t *testing.T, roots filesystemResolverTestRoots, scope filesystemPluginScope, fixtureName string) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	manifestPayload, err := os.ReadFile(filepath.Join(sourceRoot, "setta.plugin.json"))
	if err != nil {
		t.Fatalf("read fixture manifest: %v", err)
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode fixture manifest: %v", err)
	}

	targetRoot := filepath.Join(pluginScopeRoot(roots, scope), manifest.ID)
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	return targetRoot
}

func pluginScopeRoot(roots filesystemResolverTestRoots, scope filesystemPluginScope) string {
	switch scope {
	case filesystemPluginScopeWorkspace:
		return filepath.Join(roots.workspaceRoot, ".setta_plugins")
	case filesystemPluginScopeSettaFiles:
		return filepath.Join(roots.settaFilesRoot, "plugins")
	default:
		return filepath.Join(roots.settaHome, "plugins")
	}
}

func rewritePluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)
	writeJSONFile(t, manifestPath, manifest)
}

func writeJSONFile(t *testing.T, path string, payload any) {
	t.Helper()

	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json %s: %v", path, err)
	}
	content = append(content, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent %s: %v", path, err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write json %s: %v", path, err)
	}
}

func workerRPCTestRepoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}

func copyBackendCodegenFixtureDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir target root %s: %v", targetRoot, err)
	}

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture source root %s: %v", sourceRoot, err)
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())
		if entry.IsDir() {
			copyBackendCodegenFixtureDir(t, sourcePath, targetPath)
			continue
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, 0o644); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func preparePluginLanguageServerFixture(t *testing.T) (string, string) {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pythonCandidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, pythonPath := range pythonCandidates {
		if _, err := os.Stat(pythonPath); err == nil {
			scriptPath := filepath.Join(repoRoot, "tests", "fixtures", "lsp", "mini_language_server.py")
			t.Setenv(pluginFixturePythonEnv, pythonPath)
			t.Setenv(pluginFixtureLSPScriptEnv, scriptPath)
			return pythonPath, scriptPath
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return "", ""
}
