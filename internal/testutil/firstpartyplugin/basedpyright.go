package firstpartyplugin

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"

	toml "github.com/pelletier/go-toml/v2"

	"setta/internal/pythonenv"
)

type basedpyrightPyproject struct {
	Project struct {
		Dependencies []string `toml:"dependencies"`
	} `toml:"project"`
}

var basedpyrightRuntime struct {
	once    sync.Once
	python  string
	command string
	err     error
}

func BasedpyrightPython(t testing.TB) string {
	t.Helper()

	ensureBasedpyrightRuntime()
	if basedpyrightRuntime.err != nil {
		t.Fatalf("prepare first-party basedpyright test runtime: %v", basedpyrightRuntime.err)
	}
	return basedpyrightRuntime.python
}

func BasedpyrightLangserverCommand(t testing.TB) string {
	t.Helper()

	ensureBasedpyrightRuntime()
	if basedpyrightRuntime.err != nil {
		t.Fatalf("prepare first-party basedpyright test runtime: %v", basedpyrightRuntime.err)
	}
	return basedpyrightRuntime.command
}

func ensureBasedpyrightRuntime() {
	basedpyrightRuntime.once.Do(func() {
		basedpyrightRuntime.python, basedpyrightRuntime.command, basedpyrightRuntime.err = prepareBasedpyrightRuntime()
	})
}

func prepareBasedpyrightRuntime() (string, string, error) {
	bootstrapPython, err := pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
	if err != nil {
		return "", "", fmt.Errorf("resolve bootstrap python interpreter: %w", err)
	}

	dependency, err := firstPartyBasedpyrightDependency()
	if err != nil {
		return "", "", err
	}

	venvRoot, err := os.MkdirTemp("", "setta-basedpyright-test-env-")
	if err != nil {
		return "", "", fmt.Errorf("create basedpyright test env root: %w", err)
	}

	if err := runCommand(bootstrapPython, "-m", "venv", venvRoot); err != nil {
		return "", "", fmt.Errorf("create basedpyright test env: %w", err)
	}

	pythonPath := filepath.Join(venvRoot, "bin", "python")
	commandPath := filepath.Join(venvRoot, "bin", "basedpyright-langserver")
	if runtime.GOOS == "windows" {
		pythonPath = filepath.Join(venvRoot, "Scripts", "python.exe")
		commandPath = filepath.Join(venvRoot, "Scripts", "basedpyright-langserver.exe")
	}

	if err := runCommand(pythonPath, "-m", "pip", "install", "--disable-pip-version-check", dependency); err != nil {
		return "", "", fmt.Errorf("install %s into basedpyright test env: %w", dependency, err)
	}
	if _, err := os.Stat(commandPath); err != nil {
		return "", "", fmt.Errorf("resolve basedpyright language server command %q: %w", commandPath, err)
	}
	return pythonPath, commandPath, nil
}

func firstPartyBasedpyrightDependency() (string, error) {
	pyprojectPath := filepath.Join(repoRoot(), "plugins", "setta-basedpyright", "pyproject.toml")
	content, err := os.ReadFile(pyprojectPath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", pyprojectPath, err)
	}

	var payload basedpyrightPyproject
	if err := toml.Unmarshal(content, &payload); err != nil {
		return "", fmt.Errorf("decode %s: %w", pyprojectPath, err)
	}
	dependencies := payload.Project.Dependencies
	if len(dependencies) != 1 {
		return "", fmt.Errorf("expected one first-party basedpyright dependency in %s, got %#v", pyprojectPath, dependencies)
	}
	dependency := strings.TrimSpace(dependencies[0])
	if dependency == "" {
		return "", fmt.Errorf("expected non-empty first-party basedpyright dependency in %s", pyprojectPath)
	}
	return dependency, nil
}

func RepoPython(t testing.TB) string {
	t.Helper()

	repoRoot := repoRoot()
	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	if runtime.GOOS == "windows" {
		candidates = append(candidates, filepath.Join(repoRoot, ".venv", "Scripts", "python.exe"))
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}

func BuildBasedpyrightPluginWheel(t testing.TB, artifactDir string) string {
	t.Helper()

	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir wheel artifact dir: %v", err)
	}

	pluginRoot := filepath.Join(repoRoot(), "plugins", "setta-basedpyright")
	pythonPath := RepoPython(t)
	if err := runCommandInDir(pluginRoot, pythonPath, "-m", "build", "--wheel", "--outdir", artifactDir); err != nil {
		t.Fatalf("build setta-basedpyright wheel: %v", err)
	}

	wheelPaths, err := filepath.Glob(filepath.Join(artifactDir, "setta_basedpyright-*.whl"))
	if err != nil {
		t.Fatalf("glob basedpyright wheel: %v", err)
	}
	slices.Sort(wheelPaths)
	if len(wheelPaths) != 1 {
		t.Fatalf("expected one built setta-basedpyright wheel, got %#v", wheelPaths)
	}
	return wheelPaths[0]
}

func InstallBasedpyrightPluginWheel(t testing.TB, sitePackages string) string {
	t.Helper()

	if err := os.MkdirAll(sitePackages, 0o755); err != nil {
		t.Fatalf("mkdir site-packages dir: %v", err)
	}

	wheelPath := BuildBasedpyrightPluginWheel(t, t.TempDir())
	pythonPath := RepoPython(t)
	if err := runCommand(pythonPath, "-m", "pip", "install", "--no-deps", "--target", sitePackages, wheelPath); err != nil {
		t.Fatalf("install setta-basedpyright wheel: %v", err)
	}
	return filepath.Join(sitePackages, "setta_basedpyright")
}

func repoRoot() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		panic("resolve first-party plugin test helper path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func runCommand(command string, args ...string) error {
	return runCommandInDir("", command, args...)
}

func runCommandInDir(dir string, command string, args ...string) error {
	cmd := exec.Command(command, args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), "PIP_DISABLE_PIP_VERSION_CHECK=1", "PIP_NO_INPUT=1")

	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Run(); err != nil {
		trimmedOutput := strings.TrimSpace(output.String())
		if trimmedOutput == "" {
			return fmt.Errorf("%s %s: %w", command, strings.Join(args, " "), err)
		}
		return fmt.Errorf("%s %s: %w: %s", command, strings.Join(args, " "), err, trimmedOutput)
	}
	return nil
}
