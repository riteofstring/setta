package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/cli"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/pythonenv"
)

func TestRunCommandDispatchesCLIBeforePrivateServerParsing(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"schema"},
		func(context.Context, serveOptions) error {
			started = true
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 0 {
		t.Fatalf("schema exit code = %d; stderr = %s", exitCode, stderr.String())
	}
	if started {
		t.Fatal("server started for schema command")
	}
	if stdout.Len() == 0 || stderr.Len() != 0 {
		t.Fatalf("schema output stdout %q stderr %q", stdout.String(), stderr.String())
	}
}

func TestRunCommandWritesRootHelpToStdoutWithoutStartingTheServer(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"--help"},
		func(context.Context, serveOptions) error {
			started = true
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 0 || started || stderr.Len() != 0 {
		t.Fatalf("root help = exit %d started %t stderr %q", exitCode, started, stderr.String())
	}
	if stdout.String() != "Usage: python-canvas {schema|snapshot|apply|run} ...\n" {
		t.Fatalf("root help stdout = %q", stdout.String())
	}
}

func TestRunCommandKeepsSubcommandHelpWithTheSubcommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := runCommand(
		context.Background(),
		[]string{"snapshot", "--help"},
		func(context.Context, serveOptions) error {
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 0 || stderr.Len() != 0 {
		t.Fatalf("snapshot help = exit %d stderr %q", exitCode, stderr.String())
	}
	if stdout.String() != "Usage: python-canvas snapshot [--url URL] [--wait-diagnostics] [--timeout DURATION] [--pretty]\n" {
		t.Fatalf("snapshot help stdout = %q", stdout.String())
	}
}

func TestRunCommandRoutesUnknownPositionalCommandToCLI(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"snapshott"},
		func(context.Context, serveOptions) error {
			started = true
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 2 || started || stdout.Len() != 0 {
		t.Fatalf("unknown CLI command = exit %d started %t stdout %q", exitCode, started, stdout.String())
	}
	var document struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(stderr.Bytes(), &document); err != nil {
		t.Fatalf("decode CLI error: %v; stderr = %q", err, stderr.String())
	}
	if document.Error.Code != "invalid_command" {
		t.Fatalf("unknown CLI command error code = %q", document.Error.Code)
	}
}

func TestRunCommandRejectsTerminalGuardianHelperFromPublicCLI(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"--setta-terminal-guardian", "--", "/bin/sh"},
		func(context.Context, serveOptions) error {
			started = true
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 2 || started || stdout.Len() != 0 {
		t.Fatalf("guardian helper public invocation = exit %d started %t stdout %q", exitCode, started, stdout.String())
	}
	var document struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(stderr.Bytes(), &document); err != nil {
		t.Fatalf("decode CLI error: %v; stderr = %q", err, stderr.String())
	}
	if document.Error.Code != "invalid_command" {
		t.Fatalf("guardian helper public error code = %q", document.Error.Code)
	}
}

func TestRunRejectsTheRetiredImplicitServerInvocation(t *testing.T) {
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"--project", "/tmp/project.json"},
		func(context.Context, serveOptions) error {
			started = true
			return nil
		},
		cli.Options{Stderr: &stderr},
	)
	if exitCode != 2 || started {
		t.Fatalf("implicit server invocation = exit %d started %t stderr %q", exitCode, started, stderr.String())
	}
}

func TestRunRequiresAndForwardsTheExactPrivateServeInvocation(t *testing.T) {
	arguments := privateServeArguments("/tmp/python-canvas/project.json")
	arguments = append(arguments, "--create")
	var received serveOptions
	err := run(
		context.Background(),
		arguments,
		func(_ context.Context, options serveOptions) error {
			received = options
			return nil
		},
	)
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if received.Port != 0 || received.ProjectPath != "/tmp/python-canvas/project.json" || !received.Create {
		t.Fatalf("starter arguments = %#v", received)
	}
	if received.LauncherPython != "/runtime/python" || received.Basedpyright != "/runtime/basedpyright" || received.WebRoot != "/runtime/web" || received.SessionNonce != "nonce-with-enough-length" || !received.SupervisedStdin {
		t.Fatalf("starter options = %#v", received)
	}
}

func TestRunRejectsMissingAndLegacyPrivateServeArguments(t *testing.T) {
	for _, arguments := range [][]string{
		nil,
		{"--project", "/tmp/project.json"},
		{"serve"},
		{"serve", "--project", "/tmp/project.json"},
		append(privateServeArguments("/tmp/project.json"), "unexpected"),
		append(privateServeArguments("/tmp/project.json"), "--app-origin", "http://127.0.0.1:5173"),
		append(privateServeArguments("/tmp/project.json"), "--port", "65536"),
		append(privateServeArguments("/tmp/project.json"), "--supervised-stdin=false"),
		append(privateServeArguments("/tmp/project.json"), "--project", "/tmp/again.json"),
	} {
		err := run(context.Background(), arguments, func(context.Context, serveOptions) error {
			return errors.New("service must not start")
		})
		if err == nil {
			t.Fatalf("run(%q) error = nil", arguments)
		}
	}
}

func TestServeResolvesPythonBeforeCreatingTheProject(t *testing.T) {
	directory := t.TempDir()
	projectPath := filepath.Join(directory, "project.json")
	webRoot := writeWebRoot(t)
	err := serveWithStreams(context.Background(), serveOptions{
		Port:         0,
		ProjectPath:  projectPath,
		Basedpyright: "/runtime/basedpyright",
		WebRoot:      webRoot,
		SessionNonce: "nonce-with-enough-length",
	}, nil, io.Discard)
	if !errors.Is(err, pythonenv.ErrLauncherPythonRequired) {
		t.Fatalf("serve() error = %v, want startup Python selection failure", err)
	}
	if _, statErr := os.Stat(projectPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("project path after failed startup = %v, want no project creation", statErr)
	}
}

func TestCanonicalProjectPathResolvesExistingParentSymlinks(t *testing.T) {
	realDirectory := t.TempDir()
	aliasRoot := t.TempDir()
	alias := filepath.Join(aliasRoot, "workspace")
	if err := os.Symlink(realDirectory, alias); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	got, err := canonicalProjectPath(filepath.Join(alias, "project.json"))
	if err != nil {
		t.Fatalf("canonicalProjectPath() error = %v", err)
	}
	resolvedDirectory, err := filepath.EvalSymlinks(realDirectory)
	if err != nil {
		t.Fatalf("resolve real directory symlinks: %v", err)
	}
	want := filepath.Join(resolvedDirectory, "project.json")
	if got != want {
		t.Fatalf("canonical project path = %q, want %q", got, want)
	}
}

func TestReadinessHasTheExactSupervisorShapeAndOneLine(t *testing.T) {
	var output bytes.Buffer
	if err := writeReadiness(&output, "/tmp/project.json", "nonce-with-enough-length", "http://127.0.0.1:43210"); err != nil {
		t.Fatalf("writeReadiness() error = %v", err)
	}
	lines := bytes.Split(output.Bytes(), []byte("\n"))
	if len(lines) != 2 || len(lines[0]) == 0 || len(lines[1]) != 0 {
		t.Fatalf("readiness lines = %q", output.String())
	}
	var document map[string]string
	if err := json.Unmarshal(lines[0], &document); err != nil {
		t.Fatalf("decode readiness: %v", err)
	}
	if len(document) != 4 || document["app"] != "python-canvas" || document["nonce"] != "nonce-with-enough-length" || document["project"] != "/tmp/project.json" || document["url"] != "http://127.0.0.1:43210" {
		t.Fatalf("readiness document = %#v", document)
	}
}

func TestCancelWhenStdinClosesCancelsTheServiceContext(t *testing.T) {
	reader, writer := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cancelWhenStdinCloses(ctx, reader, cancel)
	if err := writer.Close(); err != nil {
		t.Fatalf("close supervised stdin: %v", err)
	}
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("stdin EOF did not cancel the service context")
	}
}

func privateServeArguments(projectPath string) []string {
	return []string{
		"serve",
		"--port", "0",
		"--project", projectPath,
		"--launcher-python", "/runtime/python",
		"--basedpyright", "/runtime/basedpyright",
		"--web-root", "/runtime/web",
		"--session-nonce", "nonce-with-enough-length",
		"--supervised-stdin",
	}
}

func writeWebRoot(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "web")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatalf("make web root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html><title>Setta</title>"), 0o600); err != nil {
		t.Fatalf("write web index: %v", err)
	}
	return root
}
