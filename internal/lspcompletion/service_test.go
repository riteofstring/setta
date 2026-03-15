package lspcompletion

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/lsp"
	"setta/internal/projectstate"
)

// Code-area completion should run through the shared snapshot path, return the
// live completion payload, and leave no temp files behind.
func TestServiceCodeAreaCompletionReturnsFixtureCompletion(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtime := completionTestRuntime(t)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	}()

	service := newFixtureCompletionService(t, settaFilesRoot, "", 0)
	defer func() {
		closer, ok := service.lspService.(interface{ Close(context.Context) error })
		if !ok {
			t.Fatal("expected completion lsp service to expose Close")
		}
		if err := closer.Close(context.Background()); err != nil {
			t.Fatalf("close lsp service: %v", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	completions, err := service.CodeAreaCompletion(
		ctx,
		runtime,
		"project-alpha",
		"code-section",
		"fixture.",
		8,
	)
	if err != nil {
		t.Fatalf("code area completion: %v", err)
	}
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completions %#v", completions)
	}

	assertNoCompletionTempFiles(t, filepath.Join(settaFilesRoot, "code", "sections", "Alpha"), "editor__*.py")
}

// Completion requests should read a runtime snapshot and then wait on the LSP
// independently, leaving later runtime mutations free to proceed.
func TestServiceTextFieldCompletionDoesNotBlockRuntimeMutation(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	runtime := completionTestRuntime(t)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	}()

	completionStartedPath := filepath.Join(t.TempDir(), "completion-started")
	service := newBlockingCompletionService(t, settaFilesRoot, "", completionStartedPath, 400)
	defer func() {
		closer, ok := service.lspService.(interface{ Close(context.Context) error })
		if !ok {
			t.Fatal("expected blocking completion lsp service to expose Close")
		}
		if err := closer.Close(context.Background()); err != nil {
			t.Fatalf("close lsp service: %v", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	completionErrCh := make(chan error, 1)
	go func() {
		completions, err := service.TextFieldCompletion(
			ctx,
			runtime,
			"project-alpha",
			"callable-section",
			"param-1",
			"fixture.",
			8,
		)
		if err != nil {
			completionErrCh <- err
			return
		}
		if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
			completionErrCh <- errUnexpectedCompletions(completions)
			return
		}
		completionErrCh <- nil
	}()

	waitForCompletionStart(t, completionStartedPath, completionErrCh)
	select {
	case err := <-completionErrCh:
		t.Fatalf("completion returned before runtime mutation check: %v", err)
	default:
	}

	mutationStartedAt := time.Now()
	_, err := runtime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.Name = "Alpha Renamed"
		document.Projects["project-alpha"] = project
		return document, nil
	})
	if err != nil {
		t.Fatalf("runtime mutate: %v", err)
	}
	if elapsed := time.Since(mutationStartedAt); elapsed > 200*time.Millisecond {
		t.Fatalf("expected runtime mutate to complete before delayed completion, took %s", elapsed)
	}

	select {
	case err := <-completionErrCh:
		if err != nil {
			t.Fatalf("completion failed: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for delayed completion")
	}
}

func completionTestRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	project := completionTestProject(t)
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: project.ID,
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	return runtime
}

func newFixtureCompletionService(
	t *testing.T,
	settaFilesRoot string,
	runtimeRoot string,
	delayMS int,
) *Service {
	t.Helper()

	pythonBinary := resolveFixturePythonBinary(t)
	fixtureServerPath := filepath.Join(
		repoRoot(t),
		"tests",
		"fixtures",
		"lsp",
		"mini_language_server.py",
	)
	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: settaFilesRoot,
		Command:       pythonBinary,
		Args:          []string{fixtureServerPath},
		Environment:   append(os.Environ(), "FIXTURE_COMPLETION_DELAY_MS="+itoa(delayMS)),
	})
	if err != nil {
		t.Fatalf("new lsp session: %v", err)
	}
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		LSPService:     lsp.NewService(session),
	})
	if err != nil {
		t.Fatalf("new completion service: %v", err)
	}
	return service
}

func newBlockingCompletionService(
	t *testing.T,
	settaFilesRoot string,
	runtimeRoot string,
	completionStartedPath string,
	delayMS int,
) *Service {
	t.Helper()

	pythonBinary := resolveFixturePythonBinary(t)
	serverScriptPath := writeBlockingCompletionServerScript(t)
	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: settaFilesRoot,
		Command:       pythonBinary,
		Args:          []string{serverScriptPath},
		Environment: append(
			os.Environ(),
			"COMPLETION_STARTED_PATH="+completionStartedPath,
			"COMPLETION_DELAY_MS="+itoa(delayMS),
		),
	})
	if err != nil {
		t.Fatalf("new blocking lsp session: %v", err)
	}
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
		LSPService:     lsp.NewService(session),
	})
	if err != nil {
		t.Fatalf("new blocking completion service: %v", err)
	}
	return service
}

func resolveFixturePythonBinary(t *testing.T) string {
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

func repoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}

func writeBlockingCompletionServerScript(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "blocking_completion_server.py")
	content := `
import json
import os
import sys
import time

COMPLETION_STARTED_PATH = os.environ["COMPLETION_STARTED_PATH"]
COMPLETION_DELAY_MS = int(os.environ.get("COMPLETION_DELAY_MS", "0"))

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
    if method == "textDocument/completion" and message_id is not None:
        with open(COMPLETION_STARTED_PATH, "w", encoding="utf-8") as handle:
            handle.write("started")
        if COMPLETION_DELAY_MS > 0:
            time.sleep(COMPLETION_DELAY_MS / 1000)
        send({"jsonrpc": "2.0", "id": message_id, "result": {"isIncomplete": False, "items": [{"label": "fixtureCompletion", "kind": 6, "insertText": "fixtureCompletion"}]}})
        continue
`
	if err := os.WriteFile(path, []byte(strings.TrimSpace(content)+"\n"), 0o644); err != nil {
		t.Fatalf("write blocking completion server: %v", err)
	}
	return path
}

func waitForCompletionStart(t *testing.T, completionStartedPath string, completionErrCh <-chan error) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(completionStartedPath); err == nil {
			return
		}
		select {
		case err := <-completionErrCh:
			t.Fatalf("completion failed before overlap check: %v", err)
		default:
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for completion request marker at %s", completionStartedPath)
}

func assertNoCompletionTempFiles(t *testing.T, root string, pattern string) {
	t.Helper()

	matches, err := filepath.Glob(filepath.Join(root, pattern))
	if err != nil {
		t.Fatalf("glob completion temp files: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no completion temp files, found %v", matches)
	}
}

func errUnexpectedCompletions(completions []CodeMirrorCompletion) error {
	return fmt.Errorf("unexpected completions %#v", completions)
}

func itoa(value int) string {
	return strconv.Itoa(value)
}
