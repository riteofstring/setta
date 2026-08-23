package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/setta/python-canvas/backend/internal/cli"
)

func TestRunCommandDispatchesCLIBeforeServerFlagParsing(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	started := false
	exitCode := runCommand(
		context.Background(),
		[]string{"schema"},
		func(context.Context, uint16, string, bool, string) error {
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
		func(context.Context, uint16, string, bool, string) error {
			started = true
			return errors.New("server must not start")
		},
		cli.Options{Stdout: &stdout, Stderr: &stderr},
	)
	if exitCode != 0 || started || stderr.Len() != 0 {
		t.Fatalf("root help = exit %d started %t stderr %q", exitCode, started, stderr.String())
	}
	if stdout.Len() == 0 {
		t.Fatal("root help did not write stdout")
	}
}

func TestRunCommandKeepsSubcommandHelpWithTheSubcommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := runCommand(
		context.Background(),
		[]string{"snapshot", "--help"},
		func(context.Context, uint16, string, bool, string) error {
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
		func(context.Context, uint16, string, bool, string) error {
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

func TestRunRequiresAndForwardsAnExplicitProjectLifecycle(t *testing.T) {
	var receivedPort uint16
	var receivedProject string
	var receivedCreate bool
	var receivedOrigin string
	err := run(
		context.Background(),
		[]string{"--port", "0", "--project", "/tmp/python-canvas/project.json", "--create", "--app-origin", "http://127.0.0.1:5173"},
		func(_ context.Context, port uint16, project string, create bool, origin string) error {
			receivedPort = port
			receivedProject = project
			receivedCreate = create
			receivedOrigin = origin
			return nil
		},
	)
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if receivedPort != 0 || receivedProject != "/tmp/python-canvas/project.json" || !receivedCreate {
		t.Fatalf("starter arguments = port %d, project %q, create %t", receivedPort, receivedProject, receivedCreate)
	}
	if receivedOrigin != "http://127.0.0.1:5173" {
		t.Fatalf("starter app origin = %q", receivedOrigin)
	}
}

func TestRunRejectsImplicitProjectAndInvalidArguments(t *testing.T) {
	for _, arguments := range [][]string{
		nil,
		{"--project", ""},
		{"--project", "/tmp/project.json", "--port", "65536", "--app-origin", "http://127.0.0.1:5173"},
		{"--project", "/tmp/project.json", "unexpected", "--app-origin", "http://127.0.0.1:5173"},
		{"--project", "/tmp/project.json"},
		{"--project", "/tmp/project.json", "--app-origin", " "},
		{"--project", "/tmp/project.json", "--app-origin", "http://127.0.0.1:5173", "--app-origin", "http://127.0.0.1:4173"},
	} {
		err := run(context.Background(), arguments, func(context.Context, uint16, string, bool, string) error {
			return errors.New("service must not start")
		})
		if err == nil {
			t.Fatalf("run(%q) error = nil", arguments)
		}
	}
}
