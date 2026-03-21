package lsp

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/statefs"
)

// The fixture server exercises the full stdio flow we need for Slice 1:
// initialize, didOpen/didChange diagnostics, completion, and shutdown.
func TestSessionFixtureServerDiagnosticsAndCompletion(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	session := newFixtureSession(t, pythonBinary, workspaceRoot)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close session: %v", err)
		}
	}()

	diagnosticsCh := make(chan PublishDiagnosticsParams, 4)
	documentPath := filepath.Join(workspaceRoot, "fixture.ts")
	if err := statefs.AtomicWriteFile(documentPath, []byte("const value = __fixture_error__;\n"), 0o644); err != nil {
		t.Fatalf("seed fixture document: %v", err)
	}

	if err := session.OpenDocument(ctx, documentPath, "fixturedsl", "const value = __fixture_error__;\n", func(params PublishDiagnosticsParams) {
		diagnosticsCh <- params
	}); err != nil {
		t.Fatalf("open document: %v", err)
	}

	firstDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if len(firstDiagnostics.Diagnostics) != 1 {
		t.Fatalf("expected one diagnostic, got %#v", firstDiagnostics.Diagnostics)
	}
	if firstDiagnostics.Diagnostics[0].Code != "fixture-ts" {
		t.Fatalf("expected diagnostic code fixture-ts, got %#v", firstDiagnostics.Diagnostics[0].Code)
	}
	if firstDiagnostics.Diagnostics[0].Message != "Fixture TypeScript diagnostic" {
		t.Fatalf("unexpected diagnostic message %q", firstDiagnostics.Diagnostics[0].Message)
	}

	completion, err := session.Completion(ctx, documentPath, 0, 2)
	if err != nil {
		t.Fatalf("completion: %v", err)
	}
	if len(completion.Items) != 1 {
		t.Fatalf("expected one completion item, got %#v", completion.Items)
	}
	if completion.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completion label %q", completion.Items[0].Label)
	}

	if err := session.UpdateDocument(ctx, documentPath, "const value = 1;\n"); err != nil {
		t.Fatalf("update document: %v", err)
	}

	secondDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if len(secondDiagnostics.Diagnostics) != 0 {
		t.Fatalf("expected diagnostics to clear after update, got %#v", secondDiagnostics.Diagnostics)
	}

	if err := session.CloseDocument(documentPath); err != nil {
		t.Fatalf("close document: %v", err)
	}
}

func TestSessionStartFailsWhenCommandMissing(t *testing.T) {
	t.Parallel()

	session, err := NewSession(SessionOptions{
		WorkspaceRoot: t.TempDir(),
		Command:       "setta-missing-language-server-bin",
		Args:          []string{"--stdio"},
	})
	if err != nil {
		t.Fatalf("new session: %v", err)
	}

	err = session.Start(context.Background())
	if err == nil {
		t.Fatal("expected missing command to fail on session start")
	}
	if !strings.Contains(err.Error(), "start process") {
		t.Fatalf("expected start-process error, got %v", err)
	}
}

// Signature-help requests share the same stdio/session boundary as completion,
// so the fixture server should prove that we frame and decode the request.
func TestSessionFixtureServerSignatureHelp(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	session := newFixtureSession(t, pythonBinary, workspaceRoot)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close session: %v", err)
		}
	}()

	documentPath := filepath.Join(workspaceRoot, "fixture.py")
	content := "value = sorted(\n"
	if err := statefs.AtomicWriteFile(documentPath, []byte(content), 0o644); err != nil {
		t.Fatalf("seed fixture document: %v", err)
	}
	if err := session.OpenDocument(ctx, documentPath, "python", content, nil); err != nil {
		t.Fatalf("open document: %v", err)
	}

	signatureHelp, err := session.SignatureHelp(ctx, documentPath, 0, len("value = sorted("))
	if err != nil {
		t.Fatalf("signature help: %v", err)
	}
	if len(signatureHelp.Signatures) != 1 {
		t.Fatalf("expected one signature, got %#v", signatureHelp.Signatures)
	}
	if signatureHelp.Signatures[0].Label != "sorted(iterable, /, *, key=None, reverse=False)" {
		t.Fatalf("unexpected signature label %q", signatureHelp.Signatures[0].Label)
	}
	if len(signatureHelp.Signatures[0].Parameters) != 5 {
		t.Fatalf("expected five parameters, got %#v", signatureHelp.Signatures[0].Parameters)
	}
}

// Request timeouts must fail cleanly so a hung language server does not wedge
// later slices that depend on completion and diagnostics calls.
func TestSessionCompletionTimeout(t *testing.T) {
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close session: %v", err)
		}
	}()

	documentPath := filepath.Join(workspaceRoot, "fixture.ts")
	if err := statefs.AtomicWriteFile(documentPath, []byte("const value = 1;\n"), 0o644); err != nil {
		t.Fatalf("seed fixture document: %v", err)
	}
	if err := session.OpenDocument(ctx, documentPath, "fixturedsl", "const value = 1;\n", nil); err != nil {
		t.Fatalf("open document: %v", err)
	}

	_, err = session.Completion(ctx, documentPath, 0, 1)
	if err == nil {
		t.Fatal("expected completion timeout")
	}
	if !errors.Is(err, ErrRequestTimedOut) {
		t.Fatalf("expected timeout error, got %v", err)
	}
}

// Close must send shutdown/exit before sealing the session so app cleanup does
// not fall back to the slow kill timeout for every LSP-backed test.
func TestSessionCloseDeliversShutdownAndExit(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	shutdownMarker := filepath.Join(t.TempDir(), "shutdown.txt")
	exitMarker := filepath.Join(t.TempDir(), "exit.txt")
	serverScript := writeTestScript(t, `
import json
import pathlib
import sys

shutdown_marker = pathlib.Path(sys.argv[1])
exit_marker = pathlib.Path(sys.argv[2])

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
        send({"jsonrpc": "2.0", "id": message_id, "result": {"capabilities": {"textDocumentSync": 2}}})
        continue
    if method == "shutdown" and message_id is not None:
        shutdown_marker.write_text("shutdown\n")
        send({"jsonrpc": "2.0", "id": message_id, "result": None})
        continue
    if method == "exit":
        exit_marker.write_text("exit\n")
        raise SystemExit(0)
`)
	session, err := NewSession(SessionOptions{
		WorkspaceRoot: workspaceRoot,
		Command:       pythonBinary,
		Args:          []string{serverScript, shutdownMarker, exitMarker},
	})
	if err != nil {
		t.Fatalf("new session: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := session.Start(ctx); err != nil {
		t.Fatalf("start session: %v", err)
	}

	start := time.Now()
	if err := session.Close(context.Background()); err != nil {
		t.Fatalf("close session: %v", err)
	}
	if elapsed := time.Since(start); elapsed >= time.Second {
		t.Fatalf("expected graceful close before fallback timeout, took %s", elapsed)
	}

	if _, err := os.Stat(shutdownMarker); err != nil {
		t.Fatalf("expected shutdown marker, got %v", err)
	}
	if _, err := os.Stat(exitMarker); err != nil {
		t.Fatalf("expected exit marker, got %v", err)
	}
}

// Shared LSP sessions should outlive the request context that first started
// them so later save/completion routes can reuse the same process.
func TestSessionStartDoesNotTieProcessLifetimeToStartContext(t *testing.T) {
	t.Parallel()

	pythonBinary := resolveTestPythonBinary(t)
	workspaceRoot := t.TempDir()
	session := newFixtureSession(t, pythonBinary, workspaceRoot)

	startCtx, cancelStart := context.WithCancel(context.Background())
	if err := session.Start(startCtx); err != nil {
		t.Fatalf("start session: %v", err)
	}
	cancelStart()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	defer func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close session: %v", err)
		}
	}()

	documentPath := filepath.Join(workspaceRoot, "survives.ts")
	if err := statefs.AtomicWriteFile(documentPath, []byte("fixture.\n"), 0o644); err != nil {
		t.Fatalf("seed fixture document: %v", err)
	}
	if err := session.OpenDocument(ctx, documentPath, "fixturedsl", "fixture.\n", nil); err != nil {
		t.Fatalf("open document after start-context cancellation: %v", err)
	}

	completion, err := session.Completion(ctx, documentPath, 0, len("fixture."))
	if err != nil {
		t.Fatalf("completion after start-context cancellation: %v", err)
	}
	if len(completion.Items) != 1 || completion.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completion payload %#v", completion.Items)
	}
}

// The sync service is the app-facing layer for later save-hook wiring, so it
// should deterministically open, update, and close the tracked document set.
func TestServiceSyncDocuments(t *testing.T) {
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

	documentPath := filepath.Join(workspaceRoot, "service.ts")
	diagnosticsCh := make(chan PublishDiagnosticsParams, 4)
	firstContent := "const value = __fixture_error__;\n"
	if err := statefs.AtomicWriteFile(documentPath, []byte(firstContent), 0o644); err != nil {
		t.Fatalf("seed service document: %v", err)
	}

	if err := service.SyncDocuments(ctx, map[string]SyncedDocument{
		documentPath: {
			Path:       documentPath,
			LanguageID: "fixturedsl",
			Content:    firstContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("first sync: %v", err)
	}

	firstDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if len(firstDiagnostics.Diagnostics) != 1 {
		t.Fatalf("expected first sync diagnostic, got %#v", firstDiagnostics.Diagnostics)
	}

	secondContent := "const value = 1;\n"
	if err := service.SyncDocuments(ctx, map[string]SyncedDocument{
		documentPath: {
			Path:       documentPath,
			LanguageID: "fixturedsl",
			Content:    secondContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	secondDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if len(secondDiagnostics.Diagnostics) != 0 {
		t.Fatalf("expected cleared diagnostics after update, got %#v", secondDiagnostics.Diagnostics)
	}

	if err := service.SyncDocuments(ctx, map[string]SyncedDocument{}); err != nil {
		t.Fatalf("clear sync: %v", err)
	}
}

// Re-syncing an unchanged document should still refresh the diagnostics
// callback so generated-code mapping can follow policy changes without forcing
// a synthetic content edit.
func TestServiceSyncDocumentsRefreshesDiagnosticsCallbackWithoutContentChanges(t *testing.T) {
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

	documentPath := filepath.Join(workspaceRoot, "service.ts")
	documentContent := "const value = 1;\n"
	if err := statefs.AtomicWriteFile(documentPath, []byte(documentContent), 0o644); err != nil {
		t.Fatalf("seed service document: %v", err)
	}

	firstCh := make(chan PublishDiagnosticsParams, 1)
	secondCh := make(chan PublishDiagnosticsParams, 1)
	if err := service.SyncDocuments(ctx, map[string]SyncedDocument{
		documentPath: {
			Path:       documentPath,
			LanguageID: "fixturedsl",
			Content:    documentContent,
			Callback: func(params PublishDiagnosticsParams) {
				firstCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("first sync: %v", err)
	}
	initialDiagnostics := waitForDiagnostics(t, firstCh)
	if len(initialDiagnostics.Diagnostics) != 0 {
		t.Fatalf("expected clean initial diagnostics, got %#v", initialDiagnostics.Diagnostics)
	}

	if err := service.SyncDocuments(ctx, map[string]SyncedDocument{
		documentPath: {
			Path:       documentPath,
			LanguageID: "fixturedsl",
			Content:    documentContent,
			Callback: func(params PublishDiagnosticsParams) {
				secondCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	uri, err := pathToURI(documentPath)
	if err != nil {
		t.Fatalf("path to uri: %v", err)
	}
	params, err := json.Marshal(PublishDiagnosticsParams{
		URI: uri,
		Diagnostics: []Diagnostic{
			{
				Message: "Fixture TypeScript diagnostic",
				Code:    "fixture-ts",
				Range: Range{
					Start: Position{Line: 0, Character: 0},
					End:   Position{Line: 0, Character: 1},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal publish diagnostics params: %v", err)
	}

	session.dispatchEnvelope(rpcEnvelope{
		Method: "textDocument/publishDiagnostics",
		Params: params,
	})

	select {
	case <-firstCh:
		t.Fatal("expected stale callback to be replaced")
	case delivered := <-secondCh:
		if len(delivered.Diagnostics) != 1 {
			t.Fatalf("expected refreshed callback diagnostics, got %#v", delivered.Diagnostics)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for refreshed diagnostics callback")
	}
}

func newFixtureSession(t *testing.T, pythonBinary string, workspaceRoot string) *Session {
	t.Helper()

	fixtureServerPath := filepath.Join(
		repoRoot(t),
		"tests",
		"fixtures",
		"lsp",
		"mini_language_server.py",
	)
	session, err := NewSession(SessionOptions{
		WorkspaceRoot: workspaceRoot,
		Command:       pythonBinary,
		Args:          []string{fixtureServerPath},
	})
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	return session
}

func waitForDiagnostics(t *testing.T, diagnosticsCh <-chan PublishDiagnosticsParams) PublishDiagnosticsParams {
	t.Helper()

	select {
	case params := <-diagnosticsCh:
		return params
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for diagnostics")
		return PublishDiagnosticsParams{}
	}
}

func resolveTestPythonBinary(t *testing.T) string {
	t.Helper()

	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}
	t.Fatal("python binary not found in PATH")
	return ""
}

func writeTestScript(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "server.py")
	if err := os.WriteFile(path, []byte(strings.TrimSpace(content)+"\n"), 0o644); err != nil {
		t.Fatalf("write test script: %v", err)
	}
	return path
}

func repoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}
