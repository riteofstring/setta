package pythonenv

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResolveUsesNearestRealProjectVenvAndPreparesImmutableEnvironment(t *testing.T) {
	launcher := testLauncherPython(t)
	workspace := t.TempDir()
	outerVenv := filepath.Join(workspace, ".venv")
	nearVenv := filepath.Join(workspace, "nested", ".venv")
	createVenv(t, launcher, outerVenv)
	createVenv(t, launcher, nearVenv)
	projectDirectory := filepath.Join(workspace, "nested", "project")
	if err := os.MkdirAll(projectDirectory, 0o700); err != nil {
		t.Fatalf("create project directory: %v", err)
	}

	resolved, err := Resolve(context.Background(), Options{
		ProjectPath:    filepath.Join(projectDirectory, "project.json"),
		LauncherPython: launcher,
		InheritedEnvironment: []string{
			"PATH=/ambient/bin",
			"VIRTUAL_ENV=/ambient/venv",
			"SETTA_PYTHON=/ambient/python",
			"PYTHONPATH=/ambient/imports",
			"PYTHONUTF8=1",
			"PYTHONWARNINGS=default",
		},
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	wantInterpreter := filepath.Join(nearVenv, venvInterpreterRelativePath())
	if resolved.Source() != SelectionSourceProjectVenv || resolved.InterpreterPath() != wantInterpreter {
		t.Fatalf("resolved environment = source %q interpreter %q, want nearest venv %q", resolved.Source(), resolved.InterpreterPath(), wantInterpreter)
	}
	if resolved.VirtualEnvRoot() != nearVenv {
		t.Fatalf("virtual environment root = %q, want %q", resolved.VirtualEnvRoot(), nearVenv)
	}
	if resolved.Implementation() == "" || resolved.Version().Major < 3 {
		t.Fatalf("interpreter probe = implementation %q version %#v", resolved.Implementation(), resolved.Version())
	}
	childEnvironment := resolved.ChildEnvironment()
	if got := environmentValue(t, childEnvironment, "PATH"); got != filepath.Dir(wantInterpreter)+string(os.PathListSeparator)+"/ambient/bin" {
		t.Fatalf("prepared PATH = %q", got)
	}
	if got := environmentValue(t, childEnvironment, "VIRTUAL_ENV"); got != nearVenv {
		t.Fatalf("prepared VIRTUAL_ENV = %q, want %q", got, nearVenv)
	}
	for _, removed := range []string{"SETTA_PYTHON", "PYTHONPATH"} {
		if _, found := optionalEnvironmentValue(childEnvironment, removed); found {
			t.Fatalf("prepared environment retained %s", removed)
		}
	}
	for _, preserved := range []string{"PYTHONUTF8", "PYTHONWARNINGS"} {
		if _, found := optionalEnvironmentValue(childEnvironment, preserved); !found {
			t.Fatalf("prepared environment removed ordinary Python behavior %s", preserved)
		}
	}

	childEnvironment[0] = "MUTATED=value"
	if got := resolved.ChildEnvironment()[0]; got == "MUTATED=value" {
		t.Fatal("ChildEnvironment() exposed mutable result state")
	}
}

func TestResolveFallsBackOnlyToExplicitLauncherPython(t *testing.T) {
	launcher := testLauncherPython(t)
	projectDirectory := t.TempDir()
	resolved, err := Resolve(context.Background(), Options{
		ProjectPath:          filepath.Join(projectDirectory, "project.json"),
		LauncherPython:       launcher,
		InheritedEnvironment: []string{"PATH=/ambient/bin", "VIRTUAL_ENV=/ambient/venv"},
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if resolved.Source() != SelectionSourceLauncher || resolved.InterpreterPath() != launcher {
		t.Fatalf("resolved environment = source %q interpreter %q, want explicit launcher %q", resolved.Source(), resolved.InterpreterPath(), launcher)
	}
	if resolved.VirtualEnvRoot() == "" {
		if _, found := optionalEnvironmentValue(resolved.ChildEnvironment(), "VIRTUAL_ENV"); found {
			t.Fatal("base launcher inherited VIRTUAL_ENV")
		}
	}
}

func TestResolveRejectsInvalidNearestVenvWithoutFallingBack(t *testing.T) {
	launcher := testLauncherPython(t)
	workspace := t.TempDir()
	createVenv(t, launcher, filepath.Join(workspace, ".venv"))
	projectDirectory := filepath.Join(workspace, "nested", "project")
	invalidVenv := filepath.Join(workspace, "nested", ".venv")
	if err := os.MkdirAll(invalidVenv, 0o700); err != nil {
		t.Fatalf("create invalid .venv: %v", err)
	}
	if err := os.WriteFile(filepath.Join(invalidVenv, "pyvenv.cfg"), []byte("home = /missing\n"), 0o600); err != nil {
		t.Fatalf("write invalid pyvenv.cfg: %v", err)
	}
	if err := os.MkdirAll(projectDirectory, 0o700); err != nil {
		t.Fatalf("create project directory: %v", err)
	}

	_, err := Resolve(context.Background(), Options{
		ProjectPath:    filepath.Join(projectDirectory, "project.json"),
		LauncherPython: launcher,
	})
	if !errors.Is(err, ErrInvalidProjectVenv) {
		t.Fatalf("Resolve() error = %v, want invalid nearest venv", err)
	}
}

func TestResolveRequiresExplicitLauncherWhenNoProjectVenvExists(t *testing.T) {
	_, err := Resolve(context.Background(), Options{ProjectPath: filepath.Join(t.TempDir(), "project.json")})
	if !errors.Is(err, ErrLauncherPythonRequired) {
		t.Fatalf("Resolve() error = %v, want launcher Python requirement", err)
	}
}

func TestParseProbeRejectsUnknownAndTrailingJSON(t *testing.T) {
	valid := `{"implementation":"cpython","version":{"major":3,"minor":14,"micro":0},"prefix":"/tmp/prefix","basePrefix":"/tmp/base"}`
	for _, output := range []string{
		`{"unexpected":true}`,
		valid + valid,
		`{"implementation":"cpython","version":{"major":3},"prefix":"/tmp/prefix","basePrefix":"/tmp/base"}`,
		`{"implementation":"","version":{"major":3,"minor":14,"micro":0},"prefix":"/tmp/prefix","basePrefix":"/tmp/base"}`,
	} {
		if _, err := parseProbe([]byte(output)); !errors.Is(err, ErrInvalidProbe) {
			t.Fatalf("parseProbe(%q) error = %v, want strict invalid probe", output, err)
		}
	}
}

func TestPrepareChildEnvironmentRemovesOnlySelectionVariables(t *testing.T) {
	interpreter := filepath.Join(t.TempDir(), "python")
	prepared := prepareChildEnvironment([]string{
		"PATH=/ambient/bin",
		"PYTHONHOME=/ambient/home",
		"PYTHONPATH=/ambient/imports",
		"PYTHONEXECUTABLE=/ambient/python",
		"__PYVENV_LAUNCHER__=/ambient/python",
		"PYTHONUTF8=1",
		"PYTHONWARNINGS=default",
		"CONDA_PREFIX=/ambient/conda",
		"PYENV_VERSION=3.14",
		"SETTA_PYTHON=/ambient/python",
		"VIRTUAL_ENV=/ambient/venv",
	}, interpreter, "/selected/venv")
	for _, key := range []string{
		"PYTHONHOME",
		"PYTHONPATH",
		"PYTHONEXECUTABLE",
		"__PYVENV_LAUNCHER__",
		"CONDA_PREFIX",
		"PYENV_VERSION",
		"SETTA_PYTHON",
	} {
		if _, found := optionalEnvironmentValue(prepared, key); found {
			t.Fatalf("prepared environment retained %q", key)
		}
	}
	for _, key := range []string{"PYTHONUTF8", "PYTHONWARNINGS"} {
		if _, found := optionalEnvironmentValue(prepared, key); !found {
			t.Fatalf("prepared environment removed %q", key)
		}
	}
	if got := environmentValue(t, prepared, "PATH"); got != filepath.Dir(interpreter)+string(os.PathListSeparator)+"/ambient/bin" {
		t.Fatalf("prepared PATH = %q", got)
	}
	if got := environmentValue(t, prepared, "VIRTUAL_ENV"); got != "/selected/venv" {
		t.Fatalf("prepared VIRTUAL_ENV = %q", got)
	}
}

func testLauncherPython(t *testing.T) string {
	t.Helper()
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		resolved, err := filepath.Abs(path)
		if err != nil {
			t.Fatalf("resolve %s path: %v", name, err)
		}
		return resolved
	}
	t.Skip("a Python interpreter is unavailable")
	return ""
}

func createVenv(t *testing.T, launcher string, root string) {
	t.Helper()
	context, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(context, launcher, "-m", "venv", "--without-pip", root).CombinedOutput()
	if err != nil {
		t.Skipf("create real venv with %q: %v: %s", launcher, err, strings.TrimSpace(string(output)))
	}
	if _, err := os.Stat(filepath.Join(root, venvInterpreterRelativePath())); err != nil {
		t.Fatalf("real venv interpreter: %v", err)
	}
}

func environmentValue(t *testing.T, environment []string, key string) string {
	t.Helper()
	value, found := optionalEnvironmentValue(environment, key)
	if !found {
		t.Fatalf("environment lacks %q: %q", key, environment)
	}
	return value
}

func optionalEnvironmentValue(environment []string, key string) (string, bool) {
	for _, entry := range environment {
		candidate, value, found := strings.Cut(entry, "=")
		if found && environmentKeyEqual(candidate, key) {
			return value, true
		}
	}
	return "", false
}
