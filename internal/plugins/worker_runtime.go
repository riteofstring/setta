package plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"setta/internal/statefs"
)

const (
	pluginWorkerPythonEnv     = "SETTA_PLUGIN_WORKER_PYTHON"
	pluginWorkerPythonPathEnv = "SETTA_PLUGIN_WORKER_PYTHONPATH"
	virtualEnvEnv             = "VIRTUAL_ENV"
)

var (
	ErrWorkerRuntimePythonUnavailable = errors.New("plugins: worker runtime python is unavailable")
	ErrWorkerRuntimeProbeFailed       = errors.New("plugins: worker runtime command failed validation")
	ErrWorkerRuntimeCommandRequired   = errors.New("plugins: worker runtime command prefix is required")
)

type WorkerRuntime struct {
	CommandPrefix    []string
	Environment      []string
	WorkingDirectory string
}

type WorkerRuntimeProvider interface {
	ResolveWorkerRuntime(context.Context) (WorkerRuntime, error)
}

type WorkerRuntimeProviderFunc func(context.Context) (WorkerRuntime, error)

func (f WorkerRuntimeProviderFunc) ResolveWorkerRuntime(ctx context.Context) (WorkerRuntime, error) {
	return f(ctx)
}

type CurrentProcessWorkerRuntimeProviderOptions struct {
	LookupEnv        func(string) (string, bool)
	Environ          func() []string
	WorkingDirectory string
}

type CurrentProcessWorkerRuntimeProvider struct {
	lookupEnv        func(string) (string, bool)
	environ          func() []string
	workingDirectory string

	mu     sync.Mutex
	cached *WorkerRuntime
}

func NewCurrentProcessWorkerRuntimeProvider(options CurrentProcessWorkerRuntimeProviderOptions) (*CurrentProcessWorkerRuntimeProvider, error) {
	lookupEnv := options.LookupEnv
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}
	environ := options.Environ
	if environ == nil {
		environ = os.Environ
	}

	workingDirectory := ""
	if strings.TrimSpace(options.WorkingDirectory) != "" {
		resolved, err := statefs.NormalizePath(options.WorkingDirectory, "")
		if err != nil {
			return nil, fmt.Errorf("resolve worker runtime working directory: %w", err)
		}
		workingDirectory = resolved
	}

	return &CurrentProcessWorkerRuntimeProvider{
		lookupEnv:        lookupEnv,
		environ:          environ,
		workingDirectory: workingDirectory,
	}, nil
}

func (p *CurrentProcessWorkerRuntimeProvider) ResolveWorkerRuntime(ctx context.Context) (WorkerRuntime, error) {
	if p == nil {
		return WorkerRuntime{}, ErrWorkerRuntimePythonUnavailable
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return WorkerRuntime{}, err
	}

	p.mu.Lock()
	if p.cached != nil {
		cached := cloneWorkerRuntime(*p.cached)
		p.mu.Unlock()
		return cached, nil
	}
	p.mu.Unlock()

	pythonBinary, err := p.resolvePythonBinary()
	if err != nil {
		return WorkerRuntime{}, err
	}

	environment := append([]string(nil), p.environ()...)
	if pythonPathRoot, ok := p.lookupEnv(pluginWorkerPythonPathEnv); ok && strings.TrimSpace(pythonPathRoot) != "" {
		environment = prependEnvironmentValue(environment, "PYTHONPATH", strings.TrimSpace(pythonPathRoot), string(os.PathListSeparator))
	}

	runtime := WorkerRuntime{
		CommandPrefix:    []string{pythonBinary, "-m", "setta.plugins.worker"},
		Environment:      environment,
		WorkingDirectory: p.workingDirectory,
	}
	if err := validateWorkerRuntime(ctx, runtime); err != nil {
		return WorkerRuntime{}, err
	}

	p.mu.Lock()
	p.cached = &WorkerRuntime{
		CommandPrefix:    append([]string(nil), runtime.CommandPrefix...),
		Environment:      append([]string(nil), runtime.Environment...),
		WorkingDirectory: runtime.WorkingDirectory,
	}
	p.mu.Unlock()

	return cloneWorkerRuntime(runtime), nil
}

func (p *CurrentProcessWorkerRuntimeProvider) resolvePythonBinary() (string, error) {
	if explicit, ok := p.lookupEnv(pluginWorkerPythonEnv); ok && strings.TrimSpace(explicit) != "" {
		return resolveWorkerRuntimeBinary(strings.TrimSpace(explicit))
	}

	virtualEnv, ok := p.lookupEnv(virtualEnvEnv)
	if !ok || strings.TrimSpace(virtualEnv) == "" {
		return "", fmt.Errorf("%w: set %s or activate a virtualenv before using plugin codegen", ErrWorkerRuntimePythonUnavailable, pluginWorkerPythonEnv)
	}

	virtualEnvRoot, err := statefs.NormalizePath(strings.TrimSpace(virtualEnv), "")
	if err != nil {
		return "", fmt.Errorf("%w: resolve %s: %v", ErrWorkerRuntimePythonUnavailable, virtualEnvEnv, err)
	}

	pythonPath := filepath.Join(virtualEnvRoot, "bin", "python")
	if runtime.GOOS == "windows" {
		pythonPath = filepath.Join(virtualEnvRoot, "Scripts", "python.exe")
	}
	info, err := os.Stat(pythonPath)
	if err != nil {
		return "", fmt.Errorf("%w: stat %s: %v", ErrWorkerRuntimePythonUnavailable, pythonPath, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("%w: %s is a directory", ErrWorkerRuntimePythonUnavailable, pythonPath)
	}
	return pythonPath, nil
}

func resolveWorkerRuntimeBinary(candidate string) (string, error) {
	if strings.Contains(candidate, string(filepath.Separator)) {
		resolved, err := statefs.NormalizePath(candidate, "")
		if err != nil {
			return "", fmt.Errorf("%w: resolve %s: %v", ErrWorkerRuntimePythonUnavailable, candidate, err)
		}
		info, err := os.Stat(resolved)
		if err != nil {
			return "", fmt.Errorf("%w: stat %s: %v", ErrWorkerRuntimePythonUnavailable, resolved, err)
		}
		if info.IsDir() {
			return "", fmt.Errorf("%w: %s is a directory", ErrWorkerRuntimePythonUnavailable, resolved)
		}
		return resolved, nil
	}

	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrWorkerRuntimePythonUnavailable, candidate)
	}
	return resolved, nil
}

func validateWorkerRuntime(ctx context.Context, runtime WorkerRuntime) error {
	commandPrefix, err := normalizeWorkerCommandPrefix(runtime.CommandPrefix)
	if err != nil {
		return err
	}

	args := append(append([]string(nil), commandPrefix[1:]...), "--probe")
	cmd := exec.CommandContext(ctx, commandPrefix[0], args...)
	if len(runtime.Environment) > 0 {
		cmd.Env = append([]string(nil), runtime.Environment...)
	}
	if strings.TrimSpace(runtime.WorkingDirectory) != "" {
		cmd.Dir = runtime.WorkingDirectory
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			return fmt.Errorf("%w: %v", ErrWorkerRuntimeProbeFailed, err)
		}
		return fmt.Errorf("%w: %s", ErrWorkerRuntimeProbeFailed, message)
	}
	return nil
}

func normalizeWorkerCommandPrefix(commandPrefix []string) ([]string, error) {
	normalized := make([]string, 0, len(commandPrefix))
	for _, part := range commandPrefix {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return nil, ErrWorkerRuntimeCommandRequired
	}
	return normalized, nil
}

func prependEnvironmentValue(environment []string, key string, prefix string, separator string) []string {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return append([]string(nil), environment...)
	}

	updated := append([]string(nil), environment...)
	prefixKey := key + "="
	for index, entry := range updated {
		if !strings.HasPrefix(entry, prefixKey) {
			continue
		}
		current := strings.TrimPrefix(entry, prefixKey)
		if current == "" {
			updated[index] = prefixKey + prefix
		} else {
			updated[index] = prefixKey + prefix + separator + current
		}
		return updated
	}

	return append(updated, prefixKey+prefix)
}

func cloneWorkerRuntime(runtime WorkerRuntime) WorkerRuntime {
	return WorkerRuntime{
		CommandPrefix:    append([]string(nil), runtime.CommandPrefix...),
		Environment:      append([]string(nil), runtime.Environment...),
		WorkingDirectory: runtime.WorkingDirectory,
	}
}
