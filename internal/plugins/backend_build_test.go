package plugins

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestBuildGoBackendExecutableReturnsPackagedExecutableEntrypoint(t *testing.T) {
	t.Parallel()

	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "backend", packagedBackendTestFileName())
	if err := os.MkdirAll(filepath.Dir(entrypoint), 0o755); err != nil {
		t.Fatalf("mkdir backend dir: %v", err)
	}
	if err := os.WriteFile(entrypoint, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write packaged backend executable: %v", err)
	}

	executablePath, err := BuildGoBackendExecutable(pluginRoot, PluginManifest{
		ID: "setta-basedpyright",
		Backend: &PluginBackendManifest{
			Entrypoint: filepath.ToSlash(filepath.Join("backend", packagedBackendTestFileName())),
		},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("build packaged backend executable: %v", err)
	}
	if executablePath != entrypoint {
		t.Fatalf("expected packaged backend path %q, got %q", entrypoint, executablePath)
	}
}

func TestBuildGoBackendExecutableRejectsNonExecutablePackagedEntrypoint(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("executable bit is not enforced on windows")
	}

	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "backend", "plugin-backend")
	if err := os.MkdirAll(filepath.Dir(entrypoint), 0o755); err != nil {
		t.Fatalf("mkdir backend dir: %v", err)
	}
	if err := os.WriteFile(entrypoint, []byte("not executable\n"), 0o644); err != nil {
		t.Fatalf("write packaged backend executable: %v", err)
	}

	_, err := BuildGoBackendExecutable(pluginRoot, PluginManifest{
		ID: "setta-basedpyright",
		Backend: &PluginBackendManifest{
			Entrypoint: "backend/plugin-backend",
		},
	}, t.TempDir())
	if err == nil {
		t.Fatal("expected non-executable packaged backend to fail")
	}

	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeBackendBuildFailed {
		t.Fatalf("expected backend build failed error code, got %#v", serviceErr.Code)
	}
}

func TestBuildGoBackendExecutableHonorsGoCommandNameOverridesOnPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path-based shell shims are unix-specific")
	}

	for _, envVar := range []string{"GO", "SETTA_GO_BIN"} {
		t.Run(envVar, func(t *testing.T) {
			pluginRoot := t.TempDir()
			entrypoint := filepath.Join(pluginRoot, "backend", "main.go")
			if err := os.MkdirAll(filepath.Dir(entrypoint), 0o755); err != nil {
				t.Fatalf("mkdir backend dir: %v", err)
			}
			if err := os.WriteFile(entrypoint, []byte("package main\n\nfunc main() {}\n"), 0o644); err != nil {
				t.Fatalf("write backend source: %v", err)
			}

			binDir := t.TempDir()
			fakeGo := filepath.Join(binDir, "go-custom")
			if err := os.WriteFile(fakeGo, []byte("#!/bin/sh\nset -eu\noutput=\"\"\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = \"-o\" ]; then\n    output=\"$2\"\n    shift 2\n    continue\n  fi\n  shift\ndone\nif [ -z \"$output\" ]; then\n  echo missing -o >&2\n  exit 1\nfi\n: > \"$output\"\n"), 0o755); err != nil {
				t.Fatalf("write fake go binary: %v", err)
			}

			t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
			t.Setenv("GO", "")
			t.Setenv("SETTA_GO_BIN", "")
			t.Setenv(envVar, "go-custom")

			executablePath, err := BuildGoBackendExecutable(pluginRoot, PluginManifest{
				ID: "setta-basedpyright",
				Backend: &PluginBackendManifest{
					Entrypoint: "backend/main.go",
				},
			}, t.TempDir())
			if err != nil {
				t.Fatalf("build go backend executable: %v", err)
			}
			if _, err := os.Stat(executablePath); err != nil {
				t.Fatalf("expected fake go binary to create output executable: %v", err)
			}
		})
	}
}

func packagedBackendTestFileName() string {
	if runtime.GOOS == "windows" {
		return "plugin-backend.exe"
	}
	return "plugin-backend"
}
