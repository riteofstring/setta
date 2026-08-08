package lsp

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/statefs"
)

// Snapshot completions should use a throwaway sibling file, return the live
// completion payload, and clean up the temporary document immediately.
func TestServiceCompleteSnapshotCleansUpTempFileOnSuccess(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	session := newFixtureSession(t, pythonBinary, workspaceRoot)
	service := NewService(session)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := service.Close(context.Background()); err != nil {
			t.Fatalf("close service: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "fixture.py")
	if err := statefs.AtomicWriteFile(referencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write reference file: %v", err)
	}

	result, err := service.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "python",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err != nil {
		t.Fatalf("complete snapshot: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completion result %#v", result.Items)
	}

	assertNoSnapshotTempFiles(t, workspaceRoot, "fixture__*.py")
}

// Timeouts should still close and unlink the temporary snapshot document so a
// hung completion request does not leak files beside the canonical source.
func TestServiceCompleteSnapshotCleansUpTempFileOnTimeout(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	serverScript := writeTestScript(t, `
import json
import sys
import time

def send(payload):
    data = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(data)}\r\n\r\n".encode("utf-8"))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

def read_message():
    headers = {}
    while True:
        line = sys.stdin.buffer.readline()
        if line == b"":
            return None
        if line in {b"\n", b"\r\n"}:
            break
        key, _, value = line.decode("utf-8").partition(":")
        if _ == ":":
            headers[key.lower().strip()] = value.strip()
    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        return None
    return json.loads(body.decode("utf-8"))

while True:
    message = read_message()
    if message is None:
        raise SystemExit(0)
    method = message.get("method")
    message_id = message.get("id")
    if method == "initialize" and message_id is not None:
        send({"jsonrpc": "2.0", "id": message_id, "result": {"capabilities": {"textDocumentSync": 2, "completionProvider": {"triggerCharacters": ["."]}}}})
        continue
    if method == "shutdown" and message_id is not None:
        send({"jsonrpc": "2.0", "id": message_id, "result": None})
        continue
    if method == "exit":
        raise SystemExit(0)
    if method == "textDocument/completion":
        time.sleep(5)
`)
	session, err := NewSession(SessionOptions{
		WorkspaceRoot:  workspaceRoot,
		Command:        pythonBinary,
		Args:           []string{serverScript},
		RequestTimeout: 200 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	service := NewService(session)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer func() {
		if err := service.Close(context.Background()); err != nil {
			t.Fatalf("close service: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "fixture.py")
	if err := statefs.AtomicWriteFile(referencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write reference file: %v", err)
	}

	_, err = service.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "python",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err == nil {
		t.Fatal("expected snapshot completion timeout")
	}
	if !errors.Is(err, ErrRequestTimedOut) {
		t.Fatalf("expected timeout error, got %v", err)
	}

	assertNoSnapshotTempFiles(t, workspaceRoot, "fixture__*.py")
}

func assertNoSnapshotTempFiles(t *testing.T, root string, pattern string) {
	t.Helper()

	matches, err := filepath.Glob(filepath.Join(root, pattern))
	if err != nil {
		t.Fatalf("glob snapshot temp files: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no snapshot temp files, found %v", matches)
	}
}
