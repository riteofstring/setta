package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/pythonenv"
)

func TestServeFallsBackToLauncherPythonAndCreatesProject(t *testing.T) {
	workspace := t.TempDir()
	projectPath := filepath.Join(workspace, "project.json")
	canonicalProject, err := canonicalProjectPath(projectPath)
	if err != nil {
		t.Fatalf("canonicalize project path: %v", err)
	}
	launcher := acceptanceSystemPython(t)
	basedpyright := acceptanceBasedpyright(t)
	webRoot := acceptanceWebRoot(t)
	resolved, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    projectPath,
		LauncherPython: launcher,
	})
	if err != nil {
		t.Fatalf("resolve launcher fallback: %v", err)
	}
	if resolved.Source() != pythonenv.SelectionSourceLauncher || resolved.InterpreterPath() != launcher {
		t.Fatalf("launcher fallback = source %q interpreter %q, want %q", resolved.Source(), resolved.InterpreterPath(), launcher)
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	readinessReader, readinessWriter := io.Pipe()
	result := make(chan error, 1)
	go func() {
		err := serveWithStreams(ctx, serveOptions{
			Port:           0,
			ProjectPath:    projectPath,
			Create:         true,
			LauncherPython: launcher,
			Basedpyright:   basedpyright,
			WebRoot:        webRoot,
			SessionNonce:   "acceptance-nonce-1234",
		}, nil, readinessWriter)
		_ = readinessWriter.CloseWithError(err)
		result <- err
	}()

	var readiness struct {
		Project string `json:"project"`
		URL     string `json:"url"`
	}
	decoded := make(chan error, 1)
	go func() { decoded <- json.NewDecoder(readinessReader).Decode(&readiness) }()
	select {
	case err := <-decoded:
		if err != nil {
			cancel()
			t.Fatalf("read server readiness: %v", err)
		}
	case <-time.After(30 * time.Second):
		cancel()
		t.Fatal("server did not reach readiness through launcher fallback")
	}
	if readiness.Project != canonicalProject || readiness.URL == "" {
		cancel()
		t.Fatalf("server readiness = %#v", readiness)
	}
	if info, err := os.Stat(projectPath); err != nil || !info.Mode().IsRegular() {
		cancel()
		t.Fatalf("project after launcher fallback stat error = %v", err)
	}

	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("stop launcher-fallback server: %v", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("launcher-fallback server did not stop")
	}
}

func TestServeRejectsInvalidNearestVenvBeforeCreatingProject(t *testing.T) {
	workspace := t.TempDir()
	invalidVenv := filepath.Join(workspace, ".venv")
	if err := os.Mkdir(invalidVenv, 0o700); err != nil {
		t.Fatalf("create invalid .venv: %v", err)
	}
	if err := os.WriteFile(filepath.Join(invalidVenv, "pyvenv.cfg"), []byte("home = /missing\n"), 0o600); err != nil {
		t.Fatalf("write invalid .venv configuration: %v", err)
	}
	projectPath := filepath.Join(workspace, "project.json")
	err := serveWithStreams(context.Background(), serveOptions{
		Port:           0,
		ProjectPath:    projectPath,
		Create:         true,
		LauncherPython: acceptanceSystemPython(t),
		Basedpyright:   filepath.Join(workspace, "unused-basedpyright"),
		WebRoot:        acceptanceWebRoot(t),
		SessionNonce:   "acceptance-nonce-1234",
	}, nil, io.Discard)
	if !errors.Is(err, pythonenv.ErrInvalidProjectVenv) {
		t.Fatalf("serve with invalid nearest .venv error = %v, want %v", err, pythonenv.ErrInvalidProjectVenv)
	}
	if _, statErr := os.Stat(projectPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("project exists after invalid .venv startup failure: %v", statErr)
	}
}

func acceptanceSystemPython(t *testing.T) string {
	t.Helper()
	names := []string{"python3", "python"}
	if runtime.GOOS == "windows" {
		names = []string{"python.exe", "python"}
	}
	for _, name := range names {
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

func acceptanceBasedpyright(t *testing.T) string {
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

func acceptanceWebRoot(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "web")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatalf("create web root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html><title>Setta</title>"), 0o600); err != nil {
		t.Fatalf("write web root index: %v", err)
	}
	return root
}
