package main

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
)

func TestBuildBootstrapURLsRewritesWildcardHosts(t *testing.T) {
	t.Parallel()

	fragment, plain, err := buildBootstrapURLs("0.0.0.0", 61234, "tok")
	if err != nil {
		t.Fatalf("build bootstrap urls: %v", err)
	}
	if fragment != "http://127.0.0.1:61234/__setta__/bootstrap#token=tok" {
		t.Fatalf("unexpected fragment url %q", fragment)
	}
	if plain != "http://127.0.0.1:61234/__setta__/bootstrap" {
		t.Fatalf("unexpected plain url %q", plain)
	}
}

func TestRenderLocalStartupMessageRemoteSession(t *testing.T) {
	t.Parallel()

	message := renderLocalStartupMessage(
		auth.SessionMetadata{
			ID:                     "session-1",
			WorkspacePathCanonical: "/tmp/my project",
			Host:                   "127.0.0.1",
			Port:                   61234,
		},
		"/tmp/my project",
		"http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
		"http://127.0.0.1:61234/__setta__/bootstrap",
		"tok",
		false,
		true,
	)

	if !strings.Contains(message, "Setta running (session session-1)") {
		t.Fatalf("expected session heading, got %q", message)
	}
	if !strings.Contains(message, "Bind: 127.0.0.1:61234 (remote only)") {
		t.Fatalf("expected remote-only bind hint, got %q", message)
	}
	if !strings.Contains(message, "setta connect <user@host> --workspace '/tmp/my project' --session session-1") {
		t.Fatalf("expected quoted connect command, got %q", message)
	}
	if !strings.Contains(message, "LOCAL_PORT=61000") {
		t.Fatalf("expected manual tunnel instructions, got %q", message)
	}
}

func TestEmitLocalStartupOutputFallsBackWhenBrowserOpenFails(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := emitLocalStartupOutput(
		config.Config{
			Paths: config.Paths{
				WorkspaceRoot: "/tmp/workspace",
			},
		},
		&localProcessSession{
			metadata: auth.SessionMetadata{
				ID:                     "session-1",
				WorkspacePathCanonical: "/tmp/workspace",
				Host:                   "127.0.0.1",
				Port:                   61234,
			},
			secret: []byte("secret"),
		},
		false,
		&stdout,
		&stderr,
		localStartupDependencies{
			now: func() time.Time {
				return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
			},
			mintBootstrapToken: func(string, []byte, time.Time) (string, error) {
				return "tok", nil
			},
			openBrowser: func(string) error {
				return startupAssertiveError("browser missing")
			},
			envLookup: func(string) (string, bool) {
				return "", false
			},
			stdinIsTTY: func() bool {
				return true
			},
			hasGUI: func(func(string) (string, bool)) bool {
				return true
			},
		},
	)
	if err != nil {
		t.Fatalf("emit local startup output: %v", err)
	}
	if !strings.Contains(stderr.String(), "Failed to open browser automatically. Open manually: http://127.0.0.1:61234/__setta__/bootstrap#token=tok (browser missing)") {
		t.Fatalf("expected browser fallback stderr, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Bootstrap URL (recommended):") {
		t.Fatalf("expected manual bootstrap info, got %q", stdout.String())
	}
	if strings.Contains(stdout.String(), "Opening browser to:") {
		t.Fatalf("expected manual fallback output, got %q", stdout.String())
	}
}

func TestShouldAutoOpenLocalStartRejectsSSHSession(t *testing.T) {
	t.Parallel()

	autoOpen := shouldAutoOpenLocalStart(
		false,
		func(key string) (string, bool) {
			if key == "SSH_CONNECTION" {
				return "1", true
			}
			return "", false
		},
		func() bool {
			return true
		},
		func(func(string) (string, bool)) bool {
			return true
		},
	)
	if autoOpen {
		t.Fatal("expected ssh session to disable auto-open")
	}
}

type startupAssertiveError string

func (e startupAssertiveError) Error() string {
	return string(e)
}
