package lsp

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/setta/python-canvas/backend/internal/pythonenv"
)

func TestNewBasedpyrightProviderInjectsResolvedPythonBeforeDocumentSync(t *testing.T) {
	workspaceRoot := t.TempDir()
	python := lspTestPython(t)
	environment, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    filepath.Join(workspaceRoot, "project.json"),
		LauncherPython: python,
	})
	if err != nil {
		t.Fatalf("resolve Python environment: %v", err)
	}
	command := filepath.Join(t.TempDir(), "basedpyright-langserver")
	if err := os.WriteFile(command, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("write Basedpyright command: %v", err)
	}

	provider, err := NewBasedpyrightProvider(BasedpyrightOptions{
		Command:           command,
		WorkspaceRoot:     workspaceRoot,
		PythonEnvironment: environment,
	})
	if err != nil {
		t.Fatalf("NewBasedpyrightProvider() error = %v", err)
	}
	t.Cleanup(func() {
		if err := provider.Close(); err != nil {
			t.Errorf("BasedpyrightProvider.Close() error = %v", err)
		}
	})
	if got := provider.session.options.Environment; !sameStrings(got, environment.ChildEnvironment()) {
		t.Fatalf("session environment = %q, want resolved child environment %q", got, environment.ChildEnvironment())
	}
	pythonSettings, ok := provider.session.options.Configuration["python"].(map[string]any)
	if !ok {
		t.Fatalf("session configuration = %#v, want Python settings", provider.session.options.Configuration)
	}
	if got, _ := pythonSettings["pythonPath"].(string); got != environment.InterpreterPath() {
		t.Fatalf("configured Python = %q, want %q", got, environment.InterpreterPath())
	}
}

func TestNewBasedpyrightProviderRequiresResolvedEnvironment(t *testing.T) {
	command := filepath.Join(t.TempDir(), "basedpyright-langserver")
	if err := os.WriteFile(command, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("write Basedpyright command: %v", err)
	}
	_, err := NewBasedpyrightProvider(BasedpyrightOptions{
		Command:       command,
		WorkspaceRoot: t.TempDir(),
	})
	if !errors.Is(err, ErrPythonEnvironmentRequired) {
		t.Fatalf("NewBasedpyrightProvider() error = %v, want resolved Python environment", err)
	}
}

func TestResolveBasedpyrightExecutableRejectsAmbientOrNonExecutableCommand(t *testing.T) {
	for _, command := range []string{"", "basedpyright-langserver"} {
		_, err := ResolveBasedpyrightExecutable(command)
		if err == nil {
			t.Fatalf("ResolveBasedpyrightExecutable(%q) succeeded", command)
		}
	}
	nonExecutable := filepath.Join(t.TempDir(), "basedpyright-langserver")
	if err := os.WriteFile(nonExecutable, []byte("server"), 0o600); err != nil {
		t.Fatalf("write non-executable command: %v", err)
	}
	_, err := ResolveBasedpyrightExecutable(nonExecutable)
	if !errors.Is(err, ErrInvalidBasedpyrightCommand) {
		t.Fatalf("ResolveBasedpyrightExecutable() error = %v, want invalid explicit command", err)
	}
}

func lspTestPython(t *testing.T) string {
	t.Helper()
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		path, err = filepath.Abs(path)
		if err != nil {
			t.Fatalf("resolve %s path: %v", name, err)
		}
		return path
	}
	t.Skip("a Python interpreter is unavailable")
	return ""
}

func sameStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
