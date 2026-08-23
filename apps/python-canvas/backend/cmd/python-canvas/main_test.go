package main

import (
	"context"
	"errors"
	"testing"
)

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
