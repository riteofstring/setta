package pythonenv

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestResolveCurrentProcessInterpreterPrefersSettaPythonOverride(t *testing.T) {
	t.Parallel()

	explicitInterpreter := filepath.Join(t.TempDir(), "python-bin")
	resolved, err := ResolveCurrentProcessInterpreter(func(key string) (string, bool) {
		if key == InterpreterEnv {
			return explicitInterpreter, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve interpreter: %v", err)
	}
	if resolved != explicitInterpreter {
		t.Fatalf("expected %q, got %q", explicitInterpreter, resolved)
	}
}

func TestResolveCurrentProcessInterpreterUsesVirtualEnvFallback(t *testing.T) {
	t.Parallel()

	virtualEnvRoot := filepath.Join(t.TempDir(), "venv")
	resolved, err := ResolveCurrentProcessInterpreter(func(key string) (string, bool) {
		if key == virtualEnvEnv {
			return virtualEnvRoot, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve interpreter from virtualenv: %v", err)
	}

	expected := filepath.Join(virtualEnvRoot, "bin", "python")
	if runtime.GOOS == "windows" {
		expected = filepath.Join(virtualEnvRoot, "Scripts", "python.exe")
	}
	if resolved != expected {
		t.Fatalf("expected %q, got %q", expected, resolved)
	}
}

func TestResolveCurrentProcessInterpreterUsesRepoLocalVirtualEnvFallback(t *testing.T) {
	repoRoot := t.TempDir()
	workspaceRoot := filepath.Join(repoRoot, "internal", "pythonenv")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	pythonPath := filepath.Join(repoRoot, ".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		pythonPath = filepath.Join(repoRoot, ".venv", "Scripts", "python.exe")
	}
	if err := os.MkdirAll(filepath.Dir(pythonPath), 0o755); err != nil {
		t.Fatalf("mkdir virtualenv bin dir: %v", err)
	}
	if err := os.WriteFile(pythonPath, []byte(""), 0o755); err != nil {
		t.Fatalf("write virtualenv interpreter: %v", err)
	}

	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd before chdir: %v", err)
	}
	if err := os.Chdir(workspaceRoot); err != nil {
		t.Fatalf("chdir to workspace root: %v", err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(previousDir); chdirErr != nil {
			t.Fatalf("restore cwd: %v", chdirErr)
		}
	})

	resolved, err := ResolveCurrentProcessInterpreter(func(string) (string, bool) {
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve interpreter from repo-local virtualenv: %v", err)
	}
	currentDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd after chdir: %v", err)
	}
	expected := filepath.Join(filepath.Dir(filepath.Dir(currentDir)), ".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		expected = filepath.Join(filepath.Dir(filepath.Dir(currentDir)), ".venv", "Scripts", "python.exe")
	}
	if resolved != expected {
		t.Fatalf("expected %q, got %q", expected, resolved)
	}
}

func TestResolveRepoLocalVirtualEnvInterpreterSearchesParentDirectories(t *testing.T) {
	t.Parallel()

	repoRoot := t.TempDir()
	workspaceRoot := filepath.Join(repoRoot, "internal", "lsp")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	pythonPath := filepath.Join(repoRoot, ".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		pythonPath = filepath.Join(repoRoot, ".venv", "Scripts", "python.exe")
	}
	if err := os.MkdirAll(filepath.Dir(pythonPath), 0o755); err != nil {
		t.Fatalf("mkdir virtualenv bin dir: %v", err)
	}
	if err := os.WriteFile(pythonPath, []byte(""), 0o755); err != nil {
		t.Fatalf("write virtualenv interpreter: %v", err)
	}

	resolved, ok := resolveRepoLocalVirtualEnvInterpreter(workspaceRoot)
	if !ok {
		t.Fatal("expected repo-local virtualenv interpreter")
	}
	if resolved != pythonPath {
		t.Fatalf("expected %q, got %q", pythonPath, resolved)
	}
}

func TestRuntimeInstalledPackagesReturnsSortedNameVersions(t *testing.T) {
	t.Parallel()

	pythonRuntime, err := NewRuntime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	packages, err := pythonRuntime.InstalledPackages(ctx)
	if err != nil {
		t.Fatalf("inspect installed packages: %v", err)
	}
	if len(packages) == 0 {
		t.Fatal("expected at least one installed package")
	}
	for index, pkg := range packages {
		if !strings.Contains(pkg, "=") {
			t.Fatalf("expected name=version package entry, got %q", pkg)
		}
		parts := strings.SplitN(pkg, "=", 2)
		if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			t.Fatalf("expected non-empty name and version, got %q", pkg)
		}
		if index > 0 && strings.ToLower(packages[index-1]) > strings.ToLower(pkg) {
			t.Fatalf("expected case-insensitive sorted package list, got %#v", packages)
		}
	}
}

func TestRuntimePluginDistributionsReturnsManifestBearingDistributions(t *testing.T) {
	t.Parallel()

	pythonRuntime, err := NewRuntime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	sitePackages := writePluginDistributionFixture(t, "setta-fixture-runtime", "0.1.0")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	distributions, err := pythonRuntime.PluginDistributions(ctx, []string{sitePackages})
	if err != nil {
		t.Fatalf("inspect plugin distributions: %v", err)
	}
	if len(distributions) != 1 {
		t.Fatalf("expected one plugin distribution, got %#v", distributions)
	}
	if distributions[0].Name != "setta-fixture-runtime" {
		t.Fatalf("unexpected distribution name %#v", distributions[0].Name)
	}
	if distributions[0].Version != "0.1.0" {
		t.Fatalf("unexpected distribution version %#v", distributions[0].Version)
	}
	if len(distributions[0].ManifestPaths) != 1 {
		t.Fatalf("expected one manifest path, got %#v", distributions[0].ManifestPaths)
	}
	if !strings.HasSuffix(distributions[0].ManifestPaths[0], filepath.Join("setta_fixture_runtime", "setta.plugin.json")) {
		t.Fatalf("unexpected manifest path %#v", distributions[0].ManifestPaths[0])
	}
}

func writePluginDistributionFixture(t *testing.T, packageName string, version string) string {
	t.Helper()

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	pluginRoot := filepath.Join(sitePackages, strings.ReplaceAll(packageName, "-", "_"))
	manifest := map[string]any{
		"schemaVersion":     1,
		"id":                packageName,
		"name":              "Runtime Fixture",
		"version":           version,
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"frontend": map[string]any{
			"entrypoint": "frontend/dist/index.js",
			"style":      "frontend/dist/index.css",
		},
		"capabilities": []string{"registerPane"},
	}
	writeRuntimeTestFile(t, filepath.Join(pluginRoot, "frontend", "dist", "index.js"), "console.log('runtime fixture')\n")
	writeRuntimeTestFile(t, filepath.Join(pluginRoot, "frontend", "dist", "index.css"), "body {}\n")
	writeRuntimeTestJSON(t, filepath.Join(pluginRoot, "setta.plugin.json"), manifest)

	distInfoRoot := filepath.Join(sitePackages, strings.ReplaceAll(packageName, "-", "_")+"-"+version+".dist-info")
	writeRuntimeTestFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: runtime fixture",
		"",
	}, "\n"))
	writeRuntimeTestFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join([]string{
		filepath.ToSlash(filepath.Join(strings.ReplaceAll(packageName, "-", "_"), "setta.plugin.json")) + ",,",
		filepath.ToSlash(filepath.Join(distInfoRoot[strings.LastIndex(distInfoRoot, string(filepath.Separator))+1:], "METADATA")) + ",,",
		filepath.ToSlash(filepath.Join(distInfoRoot[strings.LastIndex(distInfoRoot, string(filepath.Separator))+1:], "RECORD")) + ",,",
		"",
	}, "\n"))
	return sitePackages
}

func writeRuntimeTestJSON(t *testing.T, path string, payload any) {
	t.Helper()

	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal json %s: %v", path, err)
	}
	writeRuntimeTestFile(t, path, string(append(content, '\n')))
}

func writeRuntimeTestFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
