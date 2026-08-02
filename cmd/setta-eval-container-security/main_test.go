package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"setta/internal/evalharness"
)

func TestRunContainerSecurityHelpDoesNotInvokeRunner(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	called := false
	status := run(
		[]string{"--help"},
		&stdout,
		&stderr,
		func(
			context.Context,
			evalharness.ContainerSecurityConfig,
		) (evalharness.ContainerSecurityOutput, error) {
			called = true
			return evalharness.ContainerSecurityOutput{}, nil
		},
	)
	if status != 0 || called {
		t.Fatalf("run help status/called = %d/%t, want 0/false", status, called)
	}
	if !strings.Contains(stderr.String(), "Usage: setta-eval-container-security") {
		t.Fatalf("help omitted usage: %q", stderr.String())
	}
}

func TestContainerSecurityConfigFromArgsRejectsPositionals(t *testing.T) {
	var stderr bytes.Buffer
	_, _, err := containerSecurityConfigFromArgs([]string{"unexpected"}, &stderr)
	if err == nil {
		t.Fatal("container security CLI accepted a positional argument")
	}
}
