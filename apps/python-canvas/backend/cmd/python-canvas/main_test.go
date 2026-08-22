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
	err := run(
		context.Background(),
		[]string{"--port", "0", "--project", "/tmp/python-canvas/project.json", "--create"},
		func(_ context.Context, port uint16, project string, create bool) error {
			receivedPort = port
			receivedProject = project
			receivedCreate = create
			return nil
		},
	)
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if receivedPort != 0 || receivedProject != "/tmp/python-canvas/project.json" || !receivedCreate {
		t.Fatalf("starter arguments = port %d, project %q, create %t", receivedPort, receivedProject, receivedCreate)
	}
}

func TestRunRejectsImplicitProjectAndInvalidArguments(t *testing.T) {
	for _, arguments := range [][]string{
		nil,
		{"--project", ""},
		{"--project", "/tmp/project.json", "--port", "65536"},
		{"--project", "/tmp/project.json", "unexpected"},
	} {
		err := run(context.Background(), arguments, func(context.Context, uint16, string, bool) error {
			return errors.New("service must not start")
		})
		if err == nil {
			t.Fatalf("run(%q) error = nil", arguments)
		}
	}
}
