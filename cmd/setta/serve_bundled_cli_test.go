package main

import (
	"context"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
	"time"
)

func TestStartServeRequiresBundledSettaCLIFromOwnExecutableDirectory(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.executablePath = func() (string, error) {
		return filepath.Join(t.TempDir(), bundledSettaCLITestExecutableName()), nil
	}

	_, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, deps)
	if err == nil || !strings.Contains(err.Error(), "bundled setta CLI executable is missing") {
		t.Fatalf("start serve error = %v, want missing bundled CLI error", err)
	}
}

func TestStartServeUsesOwnExecutableDirectoryForBundledSettaCLI(t *testing.T) {
	appDataDir := t.TempDir()
	executablePath := createBundledSettaCLITestExecutable(t)
	deps := testDeps()
	deps.executablePath = func() (string, error) {
		return executablePath, nil
	}

	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, deps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})
}

func createBundledSettaCLITestExecutable(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), bundledSettaCLITestExecutableName())
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write bundled setta CLI fixture: %v", err)
	}
	return path
}

func bundledSettaCLITestExecutableName() string {
	if goruntime.GOOS == "windows" {
		return "setta.exe"
	}
	return "setta"
}
