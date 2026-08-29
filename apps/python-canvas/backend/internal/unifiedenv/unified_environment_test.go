// Package unifiedenv exercises the public process boundaries together. Its
// fixture dependency exists only in a temporary project .venv, so a passing
// test proves consumers use the resolved environment instead of ambient
// interpreter selection.
package unifiedenv

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/lsp"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
	"github.com/setta/python-canvas/backend/internal/pythonenv"
	"github.com/setta/python-canvas/backend/internal/runner"
)

func TestProjectVenvDependencyReachesLanguageServerAndNoninteractiveRunner(t *testing.T) {
	workspace := t.TempDir()
	launcher := systemPython(t)
	venvRoot := filepath.Join(workspace, ".venv")
	venvPython := createVenv(t, launcher, venvRoot)
	module := fmt.Sprintf("setta_unified_environment_%d", time.Now().UnixNano())
	writeVenvOnlyModule(t, venvPython, module)
	requireModuleUnavailable(t, launcher, workspace, module)

	projectPath := filepath.Join(workspace, "project.json")
	environment := resolveProjectVenvEnvironment(t, projectPath, launcher)
	if environment.Source() != pythonenv.SelectionSourceProjectVenv {
		t.Fatalf("environment source = %q, want project .venv", environment.Source())
	}
	if got, want := environment.InterpreterPath(), venvPython; got != want {
		t.Fatalf("environment interpreter = %q, want %q", got, want)
	}

	provider, err := lsp.NewBasedpyrightProvider(lsp.BasedpyrightOptions{
		Command:           basedpyrightExecutable(t),
		WorkspaceRoot:     workspace,
		PythonEnvironment: environment,
		RequestTimeout:    20 * time.Second,
		DiagnosticTimeout: 15 * time.Second,
	})
	if err != nil {
		t.Fatalf("start Basedpyright provider: %v", err)
	}
	t.Cleanup(func() {
		if err := provider.Close(); err != nil {
			t.Errorf("close Basedpyright provider: %v", err)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	assertVenvOnlyDiagnostics(t, ctx, provider, workspace, module)
	assertVenvOnlySignature(t, ctx, provider, module)

	runtime, err := runner.New(runner.Options{
		Interpreter:      environment.InterpreterPath(),
		ProjectDirectory: workspace,
		Environment:      environment.ChildEnvironment(),
		DefaultTimeout:   5 * time.Second,
		OutputLimit:      1024,
	})
	if err != nil {
		t.Fatalf("create noninteractive runner: %v", err)
	}
	result, err := runtime.Run(ctx, runner.Program{
		ProjectID: "project:unified-environment",
		Revision:  1,
		Code: fmt.Sprintf(
			"import %s\nprint('__setta_runner__' + %s.identify(7), flush=True)\n",
			module,
			module,
		),
	}, runner.Request{})
	if err != nil {
		t.Fatalf("run venv-only generated program: %v", err)
	}
	if result.Termination != runner.TerminationExited || result.ExitCode == nil || *result.ExitCode != 0 {
		t.Fatalf("runner result = %#v, want successful process exit", result)
	}
	if result.Stdout != "__setta_runner__venv:7\n" || result.Stderr != "" {
		t.Fatalf("runner output = stdout %q stderr %q, want venv-only dependency marker", result.Stdout, result.Stderr)
	}
}

func resolveProjectVenvEnvironment(t *testing.T, projectPath string, launcher string) pythonenv.ResolvedPythonEnvironment {
	t.Helper()
	environment, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    projectPath,
		LauncherPython: launcher,
		InheritedEnvironment: append(os.Environ(),
			"PYTHONHOME=/ambient/python-home",
			"PYTHONPATH=/ambient/python-path",
			"PYTHONEXECUTABLE=/ambient/python",
			"VIRTUAL_ENV=/ambient/venv",
			"SETTA_PYTHON=/ambient/python",
		),
	})
	if err != nil {
		t.Fatalf("resolve project Python environment: %v", err)
	}
	return environment
}

func assertVenvOnlyDiagnostics(
	t *testing.T,
	ctx context.Context,
	provider *lsp.BasedpyrightProvider,
	workspace string,
	module string,
) {
	t.Helper()
	code := fmt.Sprintf("import %s\n%s.identify('wrong')\n", module, module)
	path := filepath.Join(workspace, "generated.py")
	if err := os.WriteFile(path, []byte(code), 0o600); err != nil {
		t.Fatalf("write generated Python document: %v", err)
	}
	result, err := provider.SynchronizeGeneratedDocument(ctx, coordinator.GeneratedDocumentRequest{
		Path:     path,
		Revision: 1,
		Code:     code,
	})
	if err != nil {
		t.Fatalf("collect diagnostics through Basedpyright: %v", err)
	}
	if result.ProviderStatus.Availability != coordinator.ProviderAvailabilityAvailable || result.ProviderStatus.State != coordinator.ProviderLifecycleReady {
		t.Fatalf("Basedpyright provider status = %#v, want ready", result.ProviderStatus)
	}
	var hasArgumentType bool
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == "reportMissingImports" || diagnostic.Code == "reportMissingModuleSource" {
			t.Fatalf("Basedpyright did not resolve project .venv dependency: %#v", result.Diagnostics)
		}
		if diagnostic.Code == "reportArgumentType" {
			hasArgumentType = true
		}
	}
	if !hasArgumentType {
		t.Fatalf("Basedpyright diagnostics = %#v, want type checking from venv-only dependency", result.Diagnostics)
	}
}

func assertVenvOnlySignature(
	t *testing.T,
	ctx context.Context,
	provider *lsp.BasedpyrightProvider,
	module string,
) {
	t.Helper()
	code := fmt.Sprintf("import %s\n%s.identify(", module, module)
	parameters, err := provider.ResolveCallableSignature(ctx, coordinator.SignatureRequest{
		ProjectID:          "project:unified-environment",
		CallableID:         "callable:venv-only",
		AuthoredExpression: module + ".identify",
		Code:               code,
		CallOffset:         len(code),
	})
	if err != nil {
		t.Fatalf("resolve signature through Basedpyright: %v", err)
	}
	if len(parameters) != 2 {
		t.Fatalf("venv-only signature = %#v, want two parameters", parameters)
	}
	assertSignatureParameter(t, parameters[0], "value", aggregate.PassingStylePositionalOrKeyword, "int")
	assertSignatureParameter(t, parameters[1], "label", aggregate.PassingStyleKeywordOnly, "str")
}

func assertSignatureParameter(
	t *testing.T,
	parameter aggregate.ProviderParameter,
	name string,
	style aggregate.PassingStyle,
	annotation string,
) {
	t.Helper()
	if parameter.Name != name || parameter.PassingStyle != style || parameter.TypeAnnotation == nil || *parameter.TypeAnnotation != annotation {
		t.Fatalf("signature parameter = %#v, want %q %q %q", parameter, name, style, annotation)
	}
}

func writeVenvOnlyModule(t *testing.T, interpreter string, module string) {
	t.Helper()
	sitePackages := pythonSitePackages(t, interpreter)
	packageRoot := filepath.Join(sitePackages, module)
	if err := os.MkdirAll(packageRoot, 0o700); err != nil {
		t.Fatalf("create venv-only package directory: %v", err)
	}
	contents := "def identify(value: int, *, label: str = 'venv') -> str:\n    return f'{label}:{value}'\n"
	if err := os.WriteFile(filepath.Join(packageRoot, "__init__.py"), []byte(contents), 0o600); err != nil {
		t.Fatalf("write venv-only package: %v", err)
	}
}

func pythonSitePackages(t *testing.T, interpreter string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, interpreter, "-c", "import site; print(site.getsitepackages()[0])").Output()
	if err != nil {
		t.Fatalf("find venv site-packages: %v", err)
	}
	path := strings.TrimSpace(string(output))
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		t.Fatalf("venv site-packages = %q stat error %v", path, err)
	}
	return path
}

func createVenv(t *testing.T, launcher string, root string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, launcher, "-m", "venv", "--without-pip", root).CombinedOutput()
	if err != nil {
		t.Skipf("create real venv with %q: %v: %s", launcher, err, strings.TrimSpace(string(output)))
	}
	interpreter := filepath.Join(root, "bin", "python")
	if runtime.GOOS == "windows" {
		interpreter = filepath.Join(root, "Scripts", "python.exe")
	}
	if info, err := os.Stat(interpreter); err != nil || !info.Mode().IsRegular() {
		t.Fatalf("project .venv interpreter %q stat error %v", interpreter, err)
	}
	return interpreter
}

func requireModuleUnavailable(t *testing.T, interpreter string, directory string, module string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, interpreter, "-c", "import "+module)
	command.Dir = directory
	command.Env = strippedSelectionEnvironment(os.Environ())
	if output, err := command.CombinedOutput(); err == nil {
		t.Fatalf("launcher Python unexpectedly imports venv-only module %q: %s", module, strings.TrimSpace(string(output)))
	}
}

func strippedSelectionEnvironment(environment []string) []string {
	selectionVariables := map[string]struct{}{
		"PYTHONHOME":          {},
		"PYTHONPATH":          {},
		"PYTHONEXECUTABLE":    {},
		"__PYVENV_LAUNCHER__": {},
		"VIRTUAL_ENV":         {},
		"CONDA_PREFIX":        {},
		"PYENV_VERSION":       {},
		"SETTA_PYTHON":        {},
	}
	prepared := make([]string, 0, len(environment))
	for _, entry := range environment {
		key, _, hasValue := strings.Cut(entry, "=")
		if !hasValue {
			continue
		}
		if _, selectionVariable := selectionVariables[strings.ToUpper(key)]; !selectionVariable {
			prepared = append(prepared, entry)
		}
	}
	return prepared
}

func systemPython(t *testing.T) string {
	t.Helper()
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		absolute, err := filepath.Abs(path)
		if err != nil {
			t.Fatalf("resolve %s path: %v", name, err)
		}
		return absolute
	}
	t.Skip("a Python interpreter is unavailable")
	return ""
}

func basedpyrightExecutable(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	name := "basedpyright-langserver"
	if runtime.GOOS == "windows" {
		name += ".cmd"
	}
	for {
		candidate := filepath.Join(directory, "apps", "python-canvas", "node_modules", ".bin", name)
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
			return candidate
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("find source Basedpyright language server")
		}
		directory = parent
	}
}
