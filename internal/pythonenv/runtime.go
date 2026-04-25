package pythonenv

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"setta/internal/statefs"
)

const (
	InterpreterEnv       = "SETTA_PYTHON"
	virtualEnvEnv        = "VIRTUAL_ENV"
	installedPackagesCmd = `
import importlib.metadata
import json

packages = []
for dist in importlib.metadata.distributions():
    name = (dist.metadata.get("Name") or "").strip()
    version = (dist.version or "").strip()
    if not name or not version:
        continue
    packages.append(f"{name}={version}")
packages.sort(key=str.lower)
print(json.dumps({"packages": packages}))
`
	pluginDistributionsCmd = `
import importlib.metadata
import json
import pathlib
import sys

search_paths = json.loads(sys.argv[1])
kwargs = {}
if search_paths is not None:
    kwargs["path"] = search_paths

distributions = []
for dist in importlib.metadata.distributions(**kwargs):
    files = dist.files
    if files is None:
        continue
    manifest_paths = []
    for file in files:
        path_value = pathlib.Path(str(file))
        if path_value.name != "setta.plugin.json":
            continue
        manifest_paths.append(str(pathlib.Path(dist.locate_file(file)).resolve(strict=False)))
    if not manifest_paths:
        continue
    manifest_paths.sort(key=str.lower)
    name = (dist.metadata.get("Name") or "").strip()
    version = (dist.version or "").strip()
    distributions.append(
        {
            "name": name,
            "version": version,
            "manifestPaths": manifest_paths,
        }
    )

distributions.sort(key=lambda item: ((item["name"] or "").lower(), (item["version"] or "").lower(), item["manifestPaths"]))
print(json.dumps({"distributions": distributions}))
`
)

var (
	ErrInterpreterUnavailable = errors.New("pythonenv: python runtime unavailable")
	ErrInvalidPackagesOutput  = errors.New("pythonenv: invalid installed-packages response")
	ErrRuntimeRequired        = errors.New("pythonenv: runtime is required")
)

type RuntimeOptions struct {
	LookupEnv func(string) (string, bool)
	Environ   func() []string
}

type Runtime struct {
	interpreter string
	environ     func() []string
}

type PluginDistribution struct {
	Name          string   `json:"name"`
	Version       string   `json:"version"`
	ManifestPaths []string `json:"manifestPaths"`
}

func NewRuntime(options RuntimeOptions) (*Runtime, error) {
	lookupEnv := options.LookupEnv
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}
	environ := options.Environ
	if environ == nil {
		environ = os.Environ
	}

	interpreter, err := ResolveCurrentProcessInterpreter(lookupEnv)
	if err != nil {
		return nil, err
	}

	return &Runtime{
		interpreter: interpreter,
		environ:     environ,
	}, nil
}

func ResolveCurrentProcessInterpreter(lookupEnv func(string) (string, bool)) (string, error) {
	lookupEnv = defaultLookupEnv(lookupEnv)
	if interpreter, err := resolveConfiguredInterpreter(lookupEnv); interpreter != "" || err != nil {
		return interpreter, err
	}
	if interpreter, ok := resolveCurrentDirectoryInterpreter(); ok {
		return interpreter, nil
	}
	if interpreter, ok := resolvePathInterpreter(); ok {
		return interpreter, nil
	}
	return "", interpreterUnavailableError()
}

func resolveRepoLocalVirtualEnvInterpreter(startDir string) (string, bool) {
	normalizedDir, err := statefs.NormalizePath(startDir, "")
	if err != nil {
		return "", false
	}

	pythonRelativePath := virtualEnvInterpreterRelativePath(".venv")

	currentDir := normalizedDir
	for {
		candidate := filepath.Join(currentDir, pythonRelativePath)
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return candidate, true
		}
		parentDir := filepath.Dir(currentDir)
		if parentDir == currentDir {
			return "", false
		}
		currentDir = parentDir
	}
}

func (r *Runtime) InterpreterPath() string {
	if r == nil {
		return ""
	}
	return r.interpreter
}

func (r *Runtime) Environ() []string {
	if r == nil || r.environ == nil {
		return nil
	}
	return append([]string(nil), r.environ()...)
}

func (r *Runtime) InstalledPackages(ctx context.Context) ([]string, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}

	stdout, err := r.runJSONCommand(ctx, "inspect installed packages", installedPackagesCmd)
	if err != nil {
		return nil, err
	}

	var payload struct {
		Packages []string `json:"packages"`
	}
	if err := json.Unmarshal(stdout, &payload); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPackagesOutput, err)
	}

	packages := trimNonEmptyStrings(payload.Packages)
	sortCaseInsensitiveStrings(packages)
	return packages, nil
}

func (r *Runtime) PluginDistributions(ctx context.Context, searchPaths []string) ([]PluginDistribution, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}

	encodedSearchPaths, err := encodePluginDistributionSearchPaths(searchPaths)
	if err != nil {
		return nil, err
	}

	stdout, err := r.runJSONCommand(ctx, "inspect plugin distributions", pluginDistributionsCmd, string(encodedSearchPaths))
	if err != nil {
		return nil, err
	}

	return decodePluginDistributions(stdout)
}

func encodePluginDistributionSearchPaths(searchPaths []string) ([]byte, error) {
	if len(searchPaths) == 0 {
		return []byte("null"), nil
	}
	encodedSearchPaths, err := json.Marshal(trimNonEmptyStrings(searchPaths))
	if err != nil {
		return nil, fmt.Errorf("pythonenv: encode plugin distribution search paths: %w", err)
	}
	return encodedSearchPaths, nil
}

func decodePluginDistributions(stdout []byte) ([]PluginDistribution, error) {
	var payload struct {
		Distributions []PluginDistribution `json:"distributions"`
	}
	if err := json.Unmarshal(stdout, &payload); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPackagesOutput, err)
	}

	distributions := make([]PluginDistribution, 0, len(payload.Distributions))
	for _, distribution := range payload.Distributions {
		distributions = append(distributions, PluginDistribution{
			Name:          strings.TrimSpace(distribution.Name),
			Version:       strings.TrimSpace(distribution.Version),
			ManifestPaths: trimNonEmptyStrings(distribution.ManifestPaths),
		})
	}
	return distributions, nil
}

func (r *Runtime) runJSONCommand(ctx context.Context, action string, script string, args ...string) ([]byte, error) {
	commandArgs := append([]string{"-c", script}, args...)
	command := exec.CommandContext(r.interpreterCommandContext(ctx), r.interpreter, commandArgs...)
	if r.environ != nil {
		command.Env = append([]string(nil), r.environ()...)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return nil, formatPythonCommandError(action, err, stderr.String())
	}
	return stdout.Bytes(), nil
}

func formatPythonCommandError(action string, err error, stderrOutput string) error {
	trimmedStderr := strings.TrimSpace(stderrOutput)
	if trimmedStderr != "" {
		return fmt.Errorf("pythonenv: %s: %w: %s", action, err, trimmedStderr)
	}
	return fmt.Errorf("pythonenv: %s: %w", action, err)
}

func trimNonEmptyStrings(values []string) []string {
	trimmedValues := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		trimmedValues = append(trimmedValues, trimmed)
	}
	return trimmedValues
}

func sortCaseInsensitiveStrings(values []string) {
	slices.SortStableFunc(values, func(left string, right string) int {
		leftLower := strings.ToLower(left)
		rightLower := strings.ToLower(right)
		switch {
		case leftLower < rightLower:
			return -1
		case leftLower > rightLower:
			return 1
		default:
			return 0
		}
	})
}

func (r *Runtime) interpreterCommandContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func defaultLookupEnv(lookupEnv func(string) (string, bool)) func(string) (string, bool) {
	if lookupEnv == nil {
		return os.LookupEnv
	}
	return lookupEnv
}

func resolveConfiguredInterpreter(lookupEnv func(string) (string, bool)) (string, error) {
	for _, resolver := range []struct {
		key     string
		resolve func(string) (string, error)
	}{
		{key: InterpreterEnv, resolve: resolveBinary},
		{key: virtualEnvEnv, resolve: resolveVirtualEnvInterpreter},
	} {
		interpreter, err, ok := resolveEnvInterpreter(lookupEnv, resolver.key, resolver.resolve)
		if ok || err != nil {
			return interpreter, err
		}
	}
	return "", nil
}

func resolveEnvInterpreter(
	lookupEnv func(string) (string, bool),
	key string,
	resolve func(string) (string, error),
) (string, error, bool) {
	value, ok := lookupEnv(key)
	if !ok {
		return "", nil, false
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil, false
	}
	resolved, err := resolve(trimmed)
	if err != nil {
		return "", err, true
	}
	return resolved, nil, true
}

func resolveVirtualEnvInterpreter(virtualEnvRoot string) (string, error) {
	normalizedRoot, err := statefs.NormalizePath(virtualEnvRoot, "")
	if err != nil {
		return "", fmt.Errorf("pythonenv: resolve virtualenv: %w", err)
	}
	return resolveBinary(virtualEnvInterpreterRelativePath(normalizedRoot))
}

func resolveCurrentDirectoryInterpreter() (string, bool) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", false
	}
	return resolveRepoLocalVirtualEnvInterpreter(cwd)
}

func resolvePathInterpreter() (string, bool) {
	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved, true
		}
	}
	return "", false
}

func interpreterUnavailableError() error {
	return fmt.Errorf("%w; set %s or activate a virtualenv", ErrInterpreterUnavailable, InterpreterEnv)
}

func virtualEnvInterpreterRelativePath(virtualEnvRoot string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(virtualEnvRoot, "Scripts", "python.exe")
	}
	return filepath.Join(virtualEnvRoot, "bin", "python")
}

func resolveBinary(candidate string) (string, error) {
	if strings.Contains(candidate, string(filepath.Separator)) {
		return statefs.NormalizePath(candidate, "")
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("pythonenv: resolve command %q: %w", candidate, err)
	}
	return resolved, nil
}
