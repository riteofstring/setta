package pythonenv

import (
	"context"
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
		switch key {
		case InterpreterEnv:
			return explicitInterpreter, true
		case LegacyLSPPythonEnv:
			return "python3", true
		default:
			return "", false
		}
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
