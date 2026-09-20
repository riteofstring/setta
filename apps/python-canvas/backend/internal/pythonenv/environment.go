package pythonenv

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/setta/local-backend/strictjson"
)

const (
	defaultProbeTimeout = 5 * time.Second
	maxProbeOutput      = 16 * 1024
)

var (
	ErrProjectPathRequired    = errors.New("python environment: project path is required")
	ErrProjectDirectory       = errors.New("python environment: project directory is invalid")
	ErrLauncherPythonRequired = errors.New("python environment: launcher Python is required")
	ErrInvalidProjectVenv     = errors.New("python environment: nearest project .venv is invalid")
	ErrInvalidInterpreter     = errors.New("python environment: interpreter is invalid")
	ErrProbeFailed            = errors.New("python environment: interpreter probe failed")
	ErrInvalidProbe           = errors.New("python environment: interpreter probe is invalid")
)

type SelectionSource string

const (
	SelectionSourceProjectVenv SelectionSource = "project_venv"
	SelectionSourceLauncher    SelectionSource = "launcher_python"
)

type Version struct {
	Major int
	Minor int
	Micro int
}

type ResolvedPythonEnvironment struct {
	interpreter      string
	source           SelectionSource
	implementation   string
	version          Version
	prefix           string
	basePrefix       string
	virtualEnvRoot   string
	childEnvironment []string
}

func (environment ResolvedPythonEnvironment) InterpreterPath() string { return environment.interpreter }
func (environment ResolvedPythonEnvironment) Source() SelectionSource { return environment.source }
func (environment ResolvedPythonEnvironment) Implementation() string {
	return environment.implementation
}
func (environment ResolvedPythonEnvironment) Version() Version   { return environment.version }
func (environment ResolvedPythonEnvironment) Prefix() string     { return environment.prefix }
func (environment ResolvedPythonEnvironment) BasePrefix() string { return environment.basePrefix }
func (environment ResolvedPythonEnvironment) VirtualEnvRoot() string {
	return environment.virtualEnvRoot
}

func (environment ResolvedPythonEnvironment) ChildEnvironment() []string {
	return append([]string(nil), environment.childEnvironment...)
}

type Options struct {
	ProjectPath          string
	LauncherPython       string
	InheritedEnvironment []string
	ProbeTimeout         time.Duration
}

func Resolve(ctx context.Context, options Options) (ResolvedPythonEnvironment, error) {
	projectDirectory, err := projectDirectory(options.ProjectPath)
	if err != nil {
		return ResolvedPythonEnvironment{}, err
	}
	interpreter, venvRoot, source, err := selectInterpreter(projectDirectory, options.LauncherPython)
	if err != nil {
		return ResolvedPythonEnvironment{}, err
	}
	inherited := options.InheritedEnvironment
	if inherited == nil {
		inherited = os.Environ()
	}
	probeEnvironment := prepareChildEnvironment(inherited, interpreter, venvRoot)
	probe, err := probeInterpreter(ctx, interpreter, projectDirectory, probeEnvironment, options.ProbeTimeout)
	if err != nil {
		return ResolvedPythonEnvironment{}, err
	}
	venvRoot, err = resolveVirtualEnvRoot(source, venvRoot, probe)
	if err != nil {
		return ResolvedPythonEnvironment{}, err
	}
	prepared := prepareChildEnvironment(inherited, interpreter, venvRoot)

	return ResolvedPythonEnvironment{
		interpreter:      interpreter,
		source:           source,
		implementation:   probe.implementation,
		version:          probe.version,
		prefix:           probe.prefix,
		basePrefix:       probe.basePrefix,
		virtualEnvRoot:   venvRoot,
		childEnvironment: append([]string(nil), prepared...),
	}, nil
}

func selectInterpreter(projectDirectory string, launcherPython string) (string, string, SelectionSource, error) {
	interpreter, venvRoot, foundVenv, err := nearestProjectVenv(projectDirectory)
	if err != nil {
		return "", "", "", err
	}
	if foundVenv {
		return interpreter, venvRoot, SelectionSourceProjectVenv, nil
	}
	interpreter, err = validateInterpreter(launcherPython)
	if err != nil {
		return "", "", "", err
	}
	return interpreter, "", SelectionSourceLauncher, nil
}

func resolveVirtualEnvRoot(source SelectionSource, venvRoot string, probe parsedProbe) (string, error) {
	if source == SelectionSourceProjectVenv {
		if err := validateProjectVenvProbe(venvRoot, probe.prefix); err != nil {
			return "", err
		}
		return venvRoot, nil
	}
	equivalent, err := pathsEquivalent(probe.prefix, probe.basePrefix)
	if err != nil {
		return "", fmt.Errorf("%w: compare launcher prefix: %v", ErrInvalidProbe, err)
	}
	if equivalent {
		return "", nil
	}
	return probe.prefix, nil
}

func validateProjectVenvProbe(venvRoot string, prefix string) error {
	equivalent, err := pathsEquivalent(venvRoot, prefix)
	if err != nil {
		return fmt.Errorf("%w: probe prefix does not resolve to selected .venv: %v", ErrInvalidProjectVenv, err)
	}
	if !equivalent {
		return fmt.Errorf("%w: probe prefix %q does not match selected .venv", ErrInvalidProjectVenv, prefix)
	}
	return nil
}

func projectDirectory(projectPath string) (string, error) {
	projectPath = strings.TrimSpace(projectPath)
	if projectPath == "" {
		return "", ErrProjectPathRequired
	}
	resolvedPath, err := filepath.Abs(projectPath)
	if err != nil {
		return "", fmt.Errorf("%w: resolve project path: %v", ErrProjectDirectory, err)
	}
	directory := filepath.Dir(resolvedPath)
	info, err := os.Stat(directory)
	if err != nil {
		return "", fmt.Errorf("%w: stat %q: %v", ErrProjectDirectory, directory, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: %q is not a directory", ErrProjectDirectory, directory)
	}
	return directory, nil
}

func nearestProjectVenv(projectDirectory string) (interpreter string, venvRoot string, found bool, resultErr error) {
	for directory := projectDirectory; ; directory = filepath.Dir(directory) {
		candidate := filepath.Join(directory, ".venv")
		if _, err := os.Lstat(candidate); err == nil {
			interpreter, err := validateProjectVenv(candidate)
			if err != nil {
				return "", "", false, err
			}
			return interpreter, candidate, true, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", "", false, fmt.Errorf("%w: inspect %q: %v", ErrInvalidProjectVenv, candidate, err)
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return "", "", false, nil
		}
	}
}

func validateProjectVenv(root string) (string, error) {
	info, err := os.Stat(root)
	if err != nil {
		return "", fmt.Errorf("%w: stat %q: %v", ErrInvalidProjectVenv, root, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: %q is not a directory", ErrInvalidProjectVenv, root)
	}
	configuration := filepath.Join(root, "pyvenv.cfg")
	configurationInfo, err := os.Stat(configuration)
	if err != nil {
		return "", fmt.Errorf("%w: missing pyvenv.cfg: %v", ErrInvalidProjectVenv, err)
	}
	if !configurationInfo.Mode().IsRegular() {
		return "", fmt.Errorf("%w: pyvenv.cfg is not a regular file", ErrInvalidProjectVenv)
	}
	interpreter, err := validateInterpreter(filepath.Join(root, venvInterpreterRelativePath()))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidProjectVenv, err)
	}
	return interpreter, nil
}

func venvInterpreterRelativePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join("Scripts", "python.exe")
	}
	return filepath.Join("bin", "python")
}

func validateInterpreter(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", ErrLauncherPythonRequired
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%w: path must be absolute", ErrInvalidInterpreter)
	}
	path = filepath.Clean(path)
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("%w: stat %q: %v", ErrInvalidInterpreter, path, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: %q is not a regular file", ErrInvalidInterpreter, path)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("%w: %q is not executable", ErrInvalidInterpreter, path)
	}
	return path, nil
}

type interpreterProbe struct {
	Implementation *string       `json:"implementation"`
	Version        *probeVersion `json:"version"`
	Prefix         *string       `json:"prefix"`
	BasePrefix     *string       `json:"basePrefix"`
}

type probeVersion struct {
	Major *int `json:"major"`
	Minor *int `json:"minor"`
	Micro *int `json:"micro"`
}

type parsedProbe struct {
	implementation string
	version        Version
	prefix         string
	basePrefix     string
}

func probeInterpreter(ctx context.Context, interpreter string, directory string, environment []string, configuredTimeout time.Duration) (parsedProbe, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	timeout := configuredTimeout
	if timeout <= 0 {
		timeout = defaultProbeTimeout
	}
	probeContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	command := exec.CommandContext(probeContext, interpreter, "-c", `import json, sys
version = sys.version_info
print(json.dumps({"implementation": sys.implementation.name, "version": {"major": version.major, "minor": version.minor, "micro": version.micro}, "prefix": sys.prefix, "basePrefix": sys.base_prefix}, separators=(",", ":")), flush=True)`)
	command.Dir = directory
	command.Env = append([]string(nil), environment...)
	var stdout limitedBuffer
	var stderr limitedBuffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if errors.Is(err, errProbeOutputLimit) {
			return parsedProbe{}, fmt.Errorf("%w: output exceeded %d bytes", ErrProbeFailed, maxProbeOutput)
		}
		if probeContext.Err() != nil {
			return parsedProbe{}, fmt.Errorf("%w: %v", ErrProbeFailed, probeContext.Err())
		}
		return parsedProbe{}, fmt.Errorf("%w: %v", ErrProbeFailed, err)
	}
	return parseProbe(stdout.Bytes())
}

func parseProbe(output []byte) (parsedProbe, error) {
	payload, err := decodeProbe(output)
	if err != nil {
		return parsedProbe{}, err
	}
	return validateProbe(payload)
}

func decodeProbe(output []byte) (interpreterProbe, error) {
	var payload interpreterProbe
	if err := strictjson.Decode(output, &payload); err != nil {
		return interpreterProbe{}, fmt.Errorf("%w: decode JSON: %v", ErrInvalidProbe, err)
	}
	return payload, nil
}

func validateProbe(payload interpreterProbe) (parsedProbe, error) {
	if !hasRequiredProbeFields(payload) {
		return parsedProbe{}, fmt.Errorf("%w: required fields are missing", ErrInvalidProbe)
	}
	implementation := strings.TrimSpace(*payload.Implementation)
	if implementation == "" {
		return parsedProbe{}, fmt.Errorf("%w: implementation is empty", ErrInvalidProbe)
	}
	version, err := validatedProbeVersion(payload.Version)
	if err != nil {
		return parsedProbe{}, err
	}
	prefix, err := absoluteCleanPath(*payload.Prefix)
	if err != nil {
		return parsedProbe{}, fmt.Errorf("%w: prefix: %v", ErrInvalidProbe, err)
	}
	basePrefix, err := absoluteCleanPath(*payload.BasePrefix)
	if err != nil {
		return parsedProbe{}, fmt.Errorf("%w: base prefix: %v", ErrInvalidProbe, err)
	}
	return parsedProbe{
		implementation: implementation,
		version:        version,
		prefix:         prefix,
		basePrefix:     basePrefix,
	}, nil
}

func hasRequiredProbeFields(payload interpreterProbe) bool {
	return payload.Implementation != nil && payload.Version != nil && payload.Prefix != nil && payload.BasePrefix != nil &&
		payload.Version.Major != nil && payload.Version.Minor != nil && payload.Version.Micro != nil
}

func validatedProbeVersion(version *probeVersion) (Version, error) {
	if version.Major == nil || version.Minor == nil || version.Micro == nil ||
		*version.Major < 1 || *version.Minor < 0 || *version.Micro < 0 {
		return Version{}, fmt.Errorf("%w: version is invalid", ErrInvalidProbe)
	}
	return Version{Major: *version.Major, Minor: *version.Minor, Micro: *version.Micro}, nil
}

func absoluteCleanPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" || !filepath.IsAbs(path) {
		return "", errors.New("must be a non-empty absolute path")
	}
	return filepath.Clean(path), nil
}

func pathsEquivalent(left string, right string) (bool, error) {
	leftInfo, err := os.Stat(left)
	if err != nil {
		return false, err
	}
	rightInfo, err := os.Stat(right)
	if err != nil {
		return false, err
	}
	return os.SameFile(leftInfo, rightInfo), nil
}

func prepareChildEnvironment(inherited []string, interpreter string, virtualEnvRoot string) []string {
	pathValue := ""
	prepared := make([]string, 0, len(inherited)+2)
	for _, value := range inherited {
		key, contents, found := strings.Cut(value, "=")
		if !found || key == "" {
			continue
		}
		if environmentKeyEqual(key, "PATH") {
			pathValue = contents
			continue
		}
		if isPythonSelectionVariable(key) {
			continue
		}
		prepared = append(prepared, value)
	}
	interpreterDirectory := filepath.Dir(interpreter)
	if pathValue == "" {
		prepared = append(prepared, "PATH="+interpreterDirectory)
	} else {
		prepared = append(prepared, "PATH="+interpreterDirectory+string(os.PathListSeparator)+pathValue)
	}
	if virtualEnvRoot != "" {
		prepared = append(prepared, "VIRTUAL_ENV="+virtualEnvRoot)
	}
	return prepared
}

func environmentKeyEqual(left string, right string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
}

func isPythonSelectionVariable(key string) bool {
	for _, name := range []string{

		"PYTHONHOME",
		"PYTHONPATH",
		"PYTHONEXECUTABLE",
		"__PYVENV_LAUNCHER__",
		"VIRTUAL_ENV",
		"SETTA_PYTHON",
		"PYENV_VERSION",
		"CONDA_PREFIX",
		"CONDA_DEFAULT_ENV",
		"CONDA_PYTHON_EXE",
	} {
		if environmentKeyEqual(key, name) {
			return true
		}
	}
	return false
}

var errProbeOutputLimit = errors.New("python environment: probe output limit exceeded")

type limitedBuffer struct {
	buffer bytes.Buffer
}

func (buffer *limitedBuffer) Write(value []byte) (int, error) {
	remaining := maxProbeOutput - buffer.buffer.Len()
	if remaining <= 0 {
		return 0, errProbeOutputLimit
	}
	if len(value) > remaining {
		_, _ = buffer.buffer.Write(value[:remaining])
		return remaining, errProbeOutputLimit
	}
	return buffer.buffer.Write(value)
}

func (buffer *limitedBuffer) Bytes() []byte { return buffer.buffer.Bytes() }
