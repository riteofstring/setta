//go:build darwin || linux

package executor

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/setta/bench/backend/internal/contracts"
)

func TestExecutePublishesProgressBeforeCandidateExit(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	script := writeScript(t, root, "progress.sh", `#!/bin/sh
IFS= read -r request
printf '%s\n' '{"type":"progress","progress":0.5,"message":"Halfway"}'
sleep 0.3
printf '%s\n' '{"type":"result","output":{"ok":true},"observations":[],"artifacts":[]}'
`)
	progress := make(chan string, 1)
	done := make(chan Result, 1)
	go func() {
		done <- Execute(context.Background(), executionRequest(root, script, func(_ float64, message string) { progress <- message }))
	}()
	select {
	case message := <-progress:
		if message != "Halfway" {
			t.Fatalf("progress message = %q", message)
		}
	case result := <-done:
		t.Fatalf("Execute() completed before progress: status=%s error=%+v", result.Status, result.Error)
	case <-time.After(2 * time.Second):
		t.Fatal("progress was not published")
	}
	select {
	case result := <-done:
		t.Fatalf("Execute() completed before delayed result: %#v", result)
	default:
	}
	select {
	case result := <-done:
		if result.Status != "succeeded" || result.Error != nil || string(result.Output) != `{"ok":true}` {
			t.Fatalf("Execute() status=%s output=%s error=%+v stderr=%q", result.Status, result.Output, result.Error, result.Stderr)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Execute() did not complete")
	}
}

func TestExecuteCancellationContainsSetsidTermIgnoringDescendant(t *testing.T) {
	t.Parallel()
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is unavailable")
	}
	root := t.TempDir()
	pidPath := filepath.Join(root, "descendant.pid")
	script := writeScript(t, root, "escape.sh", `#!/bin/sh
"$1" -c 'import os,signal,sys,time
try:
 os.setsid()
except OSError:
 pass
signal.signal(signal.SIGTERM, signal.SIG_IGN)
with open(sys.argv[1], "w") as target:
 target.write(str(os.getpid()))
 target.flush()
time.sleep(60)' "$2" &
while [ ! -s "$2" ]; do sleep 0.01; done
sleep 60
`)
	ctx, cancel := context.WithCancel(context.Background())
	request := executionRequest(root, script, nil)
	request.Candidate.Command.Argv = []string{script, python, pidPath}
	done := make(chan Result, 1)
	go func() { done <- Execute(ctx, request) }()
	processID := waitForPIDOrResult(t, pidPath, done)
	cancel()
	select {
	case result := <-done:
		if result.Status != "canceled" || result.Error == nil || result.Error.Code != "execution_canceled" {
			t.Fatalf("Execute() = %#v", result)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("Execute() did not return after cancellation")
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		err := syscall.Kill(processID, 0)
		if errors.Is(err, syscall.ESRCH) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("descendant %d survived cancellation: %v", processID, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestPreflightRejectsNonExecutableRegularFile(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := filepath.Join(root, "candidate")
	if err := os.WriteFile(path, []byte("candidate"), 0o600); err != nil {
		t.Fatalf("write candidate = %v", err)
	}
	err := Preflight(root, contracts.CandidateV1{ID: "candidate", Name: "Candidate", Command: contracts.CommandV1{Argv: []string{path}, WorkingDirectory: "."}})
	if err == nil {
		t.Fatal("Preflight() accepted a non-executable file")
	}
}

func executionRequest(root string, script string, progress ProgressFunc) Request {
	return Request{
		ProjectRoot: root,
		RunID:       "run-test",
		Case: contracts.CaseV1{
			ID: "case-one", Name: "Case one", Input: json.RawMessage(`{"value":1}`), Expected: json.RawMessage("null"),
		},
		Candidate: contracts.CandidateV1{
			ID: "candidate", Name: "Candidate", Command: contracts.CommandV1{Argv: []string{script}, WorkingDirectory: "."},
		},
		OutputDirectory: filepath.Join(root, "output"),
		Timeout:         5 * time.Second,
		Progress:        progress,
	}
}

func writeScript(t *testing.T, root string, name string, content string) string {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
		t.Fatalf("write script = %v", err)
	}
	return path
}

func waitForPIDOrResult(t *testing.T, path string, done <-chan Result) int {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		select {
		case result := <-done:
			t.Fatalf("Execute() completed before descendant started: status=%s error=%+v", result.Status, result.Error)
		default:
		}
		data, err := os.ReadFile(path)
		if err == nil {
			value, parseErr := strconv.Atoi(strings.TrimSpace(string(data)))
			if parseErr == nil && value > 0 {
				return value
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("read descendant PID: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
