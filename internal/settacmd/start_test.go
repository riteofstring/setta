package settacmd

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

func TestRunDefaultStartDelegatesToServerWithExpectedArgs(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	expectedExecutable := filepath.Join(tempDir, "setta-server")
	var capturedExecutable string
	var capturedArgs []string
	deps := startCommandDependencies{
		resolveCurrentExecutable: func() (string, error) {
			return filepath.Join(tempDir, "setta"), nil
		},
		resolveServerExecutable: func(currentExecutable string, envLookup func(string) (string, bool)) (string, error) {
			return expectedExecutable, nil
		},
		runServer: func(serverExecutable string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
			capturedExecutable = serverExecutable
			capturedArgs = append([]string(nil), args...)
			return nil
		},
		runWithReload: func(string, []string, io.Reader, io.Writer, io.Writer) error {
			t.Fatal("did not expect reload supervisor for non-reload start")
			return nil
		},
	}

	err := runDefaultStartWithDeps(globalFlags{
		host:               "0.0.0.0",
		port:               "61234",
		workspaceRoot:      "/tmp/workspace",
		profile:            "dev",
		profileLookupHome:  "/tmp/.setta-profiles",
		settaHome:          "/tmp/.setta",
		settaFilesLocation: "global",
		runtimeRoot:        "/tmp/runtime",
		logLevel:           "debug",
		noOpen:             true,
	}, nil, io.Discard, io.Discard, func(string) (string, bool) {
		return "", false
	}, tempDir, deps)
	if err != nil {
		t.Fatalf("run default start: %v", err)
	}

	if capturedExecutable != expectedExecutable {
		t.Fatalf("expected server executable %q, got %q", expectedExecutable, capturedExecutable)
	}
	expectedArgs := []string{
		"--mode", "ide",
		"--host", "0.0.0.0",
		"--port", "61234",
		"--no-open",
		"--workspace", "/tmp/workspace",
		"--profile", "dev",
		"--profile-lookup-home", "/tmp/.setta-profiles",
		"--setta-home", "/tmp/.setta",
		"--setta-files-location", "global",
		"--runtime-root", "/tmp/runtime",
		"--log-level", "debug",
	}
	if len(capturedArgs) != len(expectedArgs) {
		t.Fatalf("expected %d args, got %d: %#v", len(expectedArgs), len(capturedArgs), capturedArgs)
	}
	for index, expected := range expectedArgs {
		if capturedArgs[index] != expected {
			t.Fatalf("expected arg %d to be %q, got %q", index, expected, capturedArgs[index])
		}
	}
}

func TestRunDefaultStartReloadDelegatesToReloadSupervisor(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	var capturedRoot string
	var capturedArgs []string
	err := runDefaultStartWithDeps(globalFlags{
		reload:         true,
		host:           "0.0.0.0",
		port:           "61234",
		workspaceRoot:  "/tmp/workspace",
		settaFilesRoot: "/tmp/setta-files",
		logLevel:       "debug",
	}, nil, io.Discard, io.Discard, func(string) (string, bool) {
		return "", false
	}, tempDir, startCommandDependencies{
		runWithReload: func(root string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
			capturedRoot = root
			capturedArgs = append([]string(nil), args...)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("run default start with reload: %v", err)
	}
	if capturedRoot != tempDir {
		t.Fatalf("expected reload root %q, got %q", tempDir, capturedRoot)
	}
	expectedArgs := []string{
		"--mode", "ide",
		"--host", "0.0.0.0",
		"--port", "61234",
		"--workspace", "/tmp/workspace",
		"--setta-files-root", "/tmp/setta-files",
		"--log-level", "debug",
	}
	if len(capturedArgs) != len(expectedArgs) {
		t.Fatalf("expected %d reload args, got %d: %#v", len(expectedArgs), len(capturedArgs), capturedArgs)
	}
	for index, expected := range expectedArgs {
		if capturedArgs[index] != expected {
			t.Fatalf("expected reload arg %d to be %q, got %q", index, expected, capturedArgs[index])
		}
	}
}

func TestRunDefaultStartPropagatesServerExitCode(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	err := runDefaultStartWithDeps(globalFlags{}, nil, io.Discard, io.Discard, func(string) (string, bool) {
		return "", false
	}, tempDir, startCommandDependencies{
		resolveCurrentExecutable: func() (string, error) {
			return filepath.Join(tempDir, "setta"), nil
		},
		resolveServerExecutable: func(currentExecutable string, envLookup func(string) (string, bool)) (string, error) {
			return filepath.Join(tempDir, "setta-server"), nil
		},
		runServer: func(serverExecutable string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
			return &ExitError{Code: 7, Silent: true}
		},
		runWithReload: func(string, []string, io.Reader, io.Writer, io.Writer) error {
			t.Fatal("did not expect reload supervisor")
			return nil
		},
	})
	if err == nil {
		t.Fatal("expected propagated exit code")
	}
	if code := ExitCode(err); code != 7 {
		t.Fatalf("expected exit code 7, got %d", code)
	}
}

func TestRunWithoutCommandUsesDefaultLocalStart(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	argsCapturePath := filepath.Join(tempDir, "args.txt")
	serverExecutable := writeArgumentCaptureExecutable(t, filepath.Join(tempDir, "bin", "setta-server"), argsCapturePath, 0)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run([]string{"--no-open", "--host", "0.0.0.0"}, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    tempDir,
		EnvLookup: func(key string) (string, bool) {
			if key == "SETTA_SERVER_BIN" {
				return serverExecutable, true
			}
			return "", false
		},
	})
	if err != nil {
		t.Fatalf("run default local start: %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
	capturedArgs, err := os.ReadFile(argsCapturePath)
	if err != nil {
		t.Fatalf("read captured args: %v", err)
	}
	if got := string(bytes.TrimSpace(capturedArgs)); got != "--mode ide --host 0.0.0.0 --port 0 --no-open" {
		t.Fatalf("unexpected delegated args %q", got)
	}
}

func TestParseGlobalFlagsSupportsWorkspaceAlias(t *testing.T) {
	t.Parallel()

	parsed, remaining, helpShown, err := parseGlobalFlags(
		[]string{"-w", "/tmp/workspace", "--no-open", "launch", "--json"},
		io.Discard,
		io.Discard,
	)
	if err != nil {
		t.Fatalf("parse global flags: %v", err)
	}
	if helpShown {
		t.Fatal("expected helpShown to be false")
	}
	if parsed.workspaceRoot != "/tmp/workspace" {
		t.Fatalf("expected workspace alias to parse, got %q", parsed.workspaceRoot)
	}
	if !parsed.noOpen {
		t.Fatal("expected no-open to parse")
	}
	if len(remaining) != 2 || remaining[0] != "launch" || remaining[1] != "--json" {
		t.Fatalf("unexpected remaining args %#v", remaining)
	}
}

func writeArgumentCaptureExecutable(t *testing.T, path string, argsCapturePath string, exitCode int) string {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir executable dir: %v", err)
	}
	content := "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"$*\" > " + shellQuoteForScript(argsCapturePath) + "\nexit " + strconv.Itoa(exitCode) + "\n"
	if runtime.GOOS == "windows" {
		path += ".exe"
		content = "@echo off\r\necho %* > \"" + argsCapturePath + "\"\r\nexit /b " + strconv.Itoa(exitCode) + "\r\n"
	}
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write executable: %v", err)
	}
	return path
}

func shellQuoteForScript(path string) string {
	if runtime.GOOS == "windows" {
		return "\"" + path + "\""
	}
	return "'" + path + "'"
}
