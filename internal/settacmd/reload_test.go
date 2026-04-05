package settacmd

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestResolveReloadSourceCheckoutRootWalksUpToRepoRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeReloadTestFile(t, filepath.Join(root, "go.mod"), "module setta\n")
	writeReloadTestFile(t, filepath.Join(root, "scripts", "go.sh"), "#!/usr/bin/env bash\n")
	writeReloadTestFile(t, filepath.Join(root, "cmd", "setta", "main.go"), "package main\n")
	writeReloadTestFile(t, filepath.Join(root, "cmd", "setta-server", "main.go"), "package main\n")

	nested := filepath.Join(root, "internal", "settacmd")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("mkdir nested root: %v", err)
	}

	resolved, err := resolveReloadSourceCheckoutRoot(nested)
	if err != nil {
		t.Fatalf("resolve reload root: %v", err)
	}
	if resolved != root {
		t.Fatalf("expected reload root %q, got %q", root, resolved)
	}
}

func TestBuildReloadRestartArgsAddsNoOpenOnce(t *testing.T) {
	t.Parallel()

	args := buildReloadRestartArgs([]string{"--mode", "ide", "--host", "127.0.0.1"})
	expected := []string{"--mode", "ide", "--host", "127.0.0.1", "--no-open"}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d: %#v", len(expected), len(args), args)
	}
	for index, want := range expected {
		if args[index] != want {
			t.Fatalf("expected arg %d to be %q, got %q", index, want, args[index])
		}
	}

	preserved := buildReloadRestartArgs([]string{"--mode", "ide", "--no-open"})
	if len(preserved) != 3 {
		t.Fatalf("expected --no-open to be preserved once, got %#v", preserved)
	}
}

func TestRunReloadLoopRestartsServerOnChange(t *testing.T) {
	t.Parallel()

	poller := &fakeReloadPoller{
		events: make(chan struct{}, 1),
		errs:   make(chan error, 1),
	}
	poller.events <- struct{}{}

	firstProcess := newFakeReloadProcess()
	secondProcess := newFakeReloadProcess()
	secondProcess.finish(nil)

	var buildCalls int
	var startArgs [][]string
	err := runReloadLoopWithDeps("/repo", []string{"--mode", "ide"}, nil, io.Discard, io.Discard, reloadLoopDependencies{
		resolveCheckoutRoot: func(root string) (string, error) {
			return root, nil
		},
		newPoller: func(string, time.Duration) (reloadPoller, error) {
			return poller, nil
		},
		buildServerBinary: func(string) (string, error) {
			buildCalls++
			if buildCalls == 1 {
				return "/tmp/server-1", nil
			}
			return "/tmp/server-2", nil
		},
		startBinary: func(binaryPath string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) (reloadProcess, error) {
			startArgs = append(startArgs, append([]string(nil), args...))
			if binaryPath == "/tmp/server-1" {
				return firstProcess, nil
			}
			return secondProcess, nil
		},
		cleanupBinary: func(string) error {
			return nil
		},
		notifyContext: func(parent context.Context, signals ...os.Signal) (context.Context, context.CancelFunc) {
			return context.WithCancel(parent)
		},
		pollInterval: 10 * time.Millisecond,
		stopTimeout:  10 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("run reload loop: %v", err)
	}
	if !firstProcess.stopped {
		t.Fatal("expected first process to stop during restart")
	}
	if buildCalls != 2 {
		t.Fatalf("expected two reload builds, got %d", buildCalls)
	}
	if len(startArgs) != 2 {
		t.Fatalf("expected two process starts, got %#v", startArgs)
	}
	if len(startArgs[0]) != 2 || startArgs[0][0] != "--mode" || startArgs[0][1] != "ide" {
		t.Fatalf("unexpected initial start args %#v", startArgs[0])
	}
	if len(startArgs[1]) != 3 || startArgs[1][2] != "--no-open" {
		t.Fatalf("expected restart args to append --no-open, got %#v", startArgs[1])
	}
}

type fakeReloadPoller struct {
	events chan struct{}
	errs   chan error
}

func (p *fakeReloadPoller) Events() <-chan struct{} {
	return p.events
}

func (p *fakeReloadPoller) Errs() <-chan error {
	return p.errs
}

func (p *fakeReloadPoller) Close() error {
	close(p.events)
	close(p.errs)
	return nil
}

type fakeReloadProcess struct {
	done    chan error
	stopped bool
}

func newFakeReloadProcess() *fakeReloadProcess {
	return &fakeReloadProcess{done: make(chan error, 1)}
}

func (p *fakeReloadProcess) Done() <-chan error {
	return p.done
}

func (p *fakeReloadProcess) Stop(time.Duration) error {
	p.stopped = true
	p.finish(nil)
	return nil
}

func (p *fakeReloadProcess) finish(err error) {
	select {
	case p.done <- err:
	default:
	}
}

func writeReloadTestFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write reload test file %s: %v", path, err)
	}
}
