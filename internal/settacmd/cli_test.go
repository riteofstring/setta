package settacmd

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"setta/internal/settacli"
)

func TestRunVersionPrintsVersion(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run([]string{"version"}, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    t.TempDir(),
	})
	if err != nil {
		t.Fatalf("run version: %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
	output := strings.TrimSpace(stdout.String())
	if !strings.HasPrefix(output, "setta version ") {
		t.Fatalf("expected setta version output, got %q", output)
	}
}

func TestRunDelegatesToolsToSettacli(t *testing.T) {
	t.Parallel()

	actualStdout, actualStderr, actualErr := runSettaCommand(t, "tools")
	if actualErr != nil {
		t.Fatalf("run setta tools: %v", actualErr)
	}

	var expectedStdout bytes.Buffer
	var expectedStderr bytes.Buffer
	expectedErr := settacli.Run([]string{"tools"}, settacli.RunOptions{
		Stdout: &expectedStdout,
		Stderr: &expectedStderr,
		CWD:    t.TempDir(),
		Now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		EnvLookup: func(string) (string, bool) { return "", false },
	})
	if expectedErr != nil {
		t.Fatalf("run settacli tools: %v", expectedErr)
	}

	if actualStdout != expectedStdout.String() {
		t.Fatalf("expected delegated stdout %q, got %q", expectedStdout.String(), actualStdout)
	}
	if actualStderr != expectedStderr.String() {
		t.Fatalf("expected delegated stderr %q, got %q", expectedStderr.String(), actualStderr)
	}
}

func TestRunRejectsUnknownCommand(t *testing.T) {
	t.Parallel()

	_, _, err := runSettaCommand(t, "unknown-command")
	if err == nil {
		t.Fatal("expected error for unknown command")
	}
	if got := DisplayError(err); !strings.Contains(got, `unknown command "unknown-command"`) {
		t.Fatalf("unexpected error message %q", got)
	}
}

func runSettaCommand(t *testing.T, args ...string) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    t.TempDir(),
		Now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		EnvLookup: func(string) (string, bool) { return "", false },
	})
	return stdout.String(), stderr.String(), err
}
