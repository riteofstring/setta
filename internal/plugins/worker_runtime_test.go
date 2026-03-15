package plugins

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The app-owned runtime boundary should honor an explicit worker interpreter and prepend any explicit Python source root.
func TestCurrentProcessWorkerRuntimeProviderUsesExplicitPythonAndPrependsPythonPath(t *testing.T) {
	repoRoot := workerRPCTestRepoRoot(t)
	pythonBinary := workerRPCTestPythonBinary(t, repoRoot)
	backendRoot := filepath.Join(repoRoot, "backend")

	provider, err := NewCurrentProcessWorkerRuntimeProvider(CurrentProcessWorkerRuntimeProviderOptions{
		LookupEnv: func(key string) (string, bool) {
			switch key {
			case pluginWorkerPythonEnv:
				return pythonBinary, true
			case pluginWorkerPythonPathEnv:
				return backendRoot, true
			default:
				return "", false
			}
		},
		Environ: func() []string {
			return []string{
				"PATH=" + os.Getenv("PATH"),
				"PYTHONPATH=existing-path",
			}
		},
	})
	if err != nil {
		t.Fatalf("new provider: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	runtime, err := provider.ResolveWorkerRuntime(ctx)
	if err != nil {
		t.Fatalf("resolve worker runtime: %v", err)
	}
	expectedPrefix := []string{pythonBinary, "-m", "setta.plugins.worker"}
	if !reflect.DeepEqual(runtime.CommandPrefix, expectedPrefix) {
		t.Fatalf("expected command prefix %#v, got %#v", expectedPrefix, runtime.CommandPrefix)
	}

	pythonPath := ""
	for _, entry := range runtime.Environment {
		if !strings.HasPrefix(entry, "PYTHONPATH=") {
			continue
		}
		pythonPath = strings.TrimPrefix(entry, "PYTHONPATH=")
		break
	}
	if pythonPath == "" {
		t.Fatal("expected PYTHONPATH in worker environment")
	}
	expectedPythonPath := backendRoot + string(os.PathListSeparator) + "existing-path"
	if pythonPath != expectedPythonPath {
		t.Fatalf("expected PYTHONPATH %q, got %q", expectedPythonPath, pythonPath)
	}
}

// Falling back to the active virtualenv should provide a concrete interpreter path without requiring an extra explicit env var.
func TestCurrentProcessWorkerRuntimeProviderUsesVirtualEnvFallback(t *testing.T) {
	repoRoot := workerRPCTestRepoRoot(t)
	virtualEnvRoot := filepath.Join(repoRoot, ".venv")

	provider, err := NewCurrentProcessWorkerRuntimeProvider(CurrentProcessWorkerRuntimeProviderOptions{
		LookupEnv: func(key string) (string, bool) {
			if key == virtualEnvEnv {
				return virtualEnvRoot, true
			}
			if key == pluginWorkerPythonPathEnv {
				return filepath.Join(repoRoot, "backend"), true
			}
			return "", false
		},
		Environ: func() []string {
			return []string{"PATH=" + os.Getenv("PATH")}
		},
	})
	if err != nil {
		t.Fatalf("new provider: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	runtime, err := provider.ResolveWorkerRuntime(ctx)
	if err != nil {
		t.Fatalf("resolve worker runtime: %v", err)
	}

	expectedBinary := filepath.Join(virtualEnvRoot, "bin", "python")
	expectedPrefix := []string{expectedBinary, "-m", "setta.plugins.worker"}
	if !reflect.DeepEqual(runtime.CommandPrefix, expectedPrefix) {
		t.Fatalf("expected command prefix %#v, got %#v", expectedPrefix, runtime.CommandPrefix)
	}
}

// Missing explicit inputs should fail loudly instead of silently guessing a Python interpreter from PATH.
func TestCurrentProcessWorkerRuntimeProviderRequiresExplicitRuntimeInput(t *testing.T) {
	provider, err := NewCurrentProcessWorkerRuntimeProvider(CurrentProcessWorkerRuntimeProviderOptions{
		LookupEnv: func(string) (string, bool) {
			return "", false
		},
		Environ: func() []string {
			return []string{"PATH=" + os.Getenv("PATH")}
		},
	})
	if err != nil {
		t.Fatalf("new provider: %v", err)
	}

	_, err = provider.ResolveWorkerRuntime(context.Background())
	if !errors.Is(err, ErrWorkerRuntimePythonUnavailable) {
		t.Fatalf("expected python unavailable error, got %v", err)
	}
}
