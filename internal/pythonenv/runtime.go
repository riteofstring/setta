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
	LegacyLSPPythonEnv   = "SETTA_LSP_PYTHON"
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
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}

	for _, envVar := range []string{InterpreterEnv, LegacyLSPPythonEnv} {
		if explicit, ok := lookupEnv(envVar); ok && strings.TrimSpace(explicit) != "" {
			return resolveBinary(strings.TrimSpace(explicit))
		}
	}

	if virtualEnv, ok := lookupEnv(virtualEnvEnv); ok && strings.TrimSpace(virtualEnv) != "" {
		virtualEnvRoot, err := statefs.NormalizePath(strings.TrimSpace(virtualEnv), "")
		if err != nil {
			return "", fmt.Errorf("pythonenv: resolve virtualenv: %w", err)
		}
		pythonPath := filepath.Join(virtualEnvRoot, "bin", "python")
		if runtime.GOOS == "windows" {
			pythonPath = filepath.Join(virtualEnvRoot, "Scripts", "python.exe")
		}
		return resolveBinary(pythonPath)
	}

	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved, nil
		}
	}

	return "", fmt.Errorf(
		"%w; set %s or %s or activate a virtualenv",
		ErrInterpreterUnavailable,
		InterpreterEnv,
		LegacyLSPPythonEnv,
	)
}

func (r *Runtime) InterpreterPath() string {
	if r == nil {
		return ""
	}
	return r.interpreter
}

func (r *Runtime) InstalledPackages(ctx context.Context) ([]string, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}

	command := exec.CommandContext(ctx, r.interpreter, "-c", installedPackagesCmd)
	if r.environ != nil {
		command.Env = append([]string(nil), r.environ()...)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		stderrOutput := strings.TrimSpace(stderr.String())
		if stderrOutput != "" {
			return nil, fmt.Errorf("pythonenv: inspect installed packages: %w: %s", err, stderrOutput)
		}
		return nil, fmt.Errorf("pythonenv: inspect installed packages: %w", err)
	}

	var payload struct {
		Packages []string `json:"packages"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPackagesOutput, err)
	}

	packages := make([]string, 0, len(payload.Packages))
	for _, entry := range payload.Packages {
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			continue
		}
		packages = append(packages, trimmed)
	}
	slices.SortStableFunc(packages, func(left string, right string) int {
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
	return packages, nil
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
