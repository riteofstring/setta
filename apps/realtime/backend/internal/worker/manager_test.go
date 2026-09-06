package worker

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

type memoryContentOpener struct {
	reference contracts.ContentReference
	content   []byte
}

func (opener memoryContentOpener) Open(reference contracts.ContentReference) (io.ReadCloser, error) {
	if reference != opener.reference {
		return nil, errors.New("content not found")
	}
	return io.NopCloser(bytes.NewReader(opener.content)), nil
}

func TestManagerStagesContentStreamsArtifactsAndIsolatesLogs(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `import os
import sys

def inspect(blob):
    print("manager stdout", flush=True)
    print("manager stderr", file=sys.stderr, flush=True)
    with open(blob["path"], "rb") as source:
        content = source.read()
    artifact = "artifact-source.txt"
    with open(artifact, "wb") as target:
        target.write(content.upper())
    yield {
        "outputs": {"size": len(content)},
        "progress": 1,
        "message": "ready",
        "artifacts": [{"name": "document", "mediaType": "text/plain", "path": artifact}],
    }

handlers = {"inspect": inspect}
`)
	content := []byte("portable content")
	digest := sha256.Sum256(content)
	identity := contracts.InvocationIdentity{SessionID: "session-manager", BindingID: "binding-manager", InvocationID: "invocation-manager", Sequence: 1}
	reference := contracts.ContentReference{ID: "content-manager", MediaType: "text/plain", ByteLength: int64(len(content)), SHA256: hex.EncodeToString(digest[:]), InvocationID: identity.InvocationID}
	manager := newFixtureManager(t, Options{ContentOpener: memoryContentOpener{reference: reference, content: content}})
	initializeManager(t, manager, projectRoot, []string{"inspect"})
	argument, err := json.Marshal(reference)
	if err != nil {
		t.Fatalf("marshal content reference: %v", err)
	}
	result, err := manager.Invoke(testContext(t), contracts.InvokeParams{Identity: identity, Handler: "inspect", Arguments: map[string]json.RawMessage{"blob": argument}, Content: []contracts.ContentReference{reference}})
	if err != nil {
		t.Fatalf("Invoke(inspect) error = %v", err)
	}
	if result.Error != nil || len(result.Outputs) != 0 {
		t.Fatalf("Invoke(inspect) result = %#v", result)
	}
	update := readUpdate(t, manager.Updates())
	if update.Message != "ready" || update.Progress == nil || *update.Progress != 1 || string(update.Outputs["size"]) != strconv.Itoa(len(content)) || len(update.Artifacts) != 1 {
		t.Fatalf("artifact update = %#v", update)
	}
	if filepath.IsAbs(update.Artifacts[0].Path) || !strings.HasPrefix(update.Artifacts[0].Path, "artifacts"+string(filepath.Separator)) {
		t.Fatalf("staged artifact path = %q", update.Artifacts[0].Path)
	}
	artifact, err := manager.OpenArtifact(identity, update.Artifacts[0].Path)
	if err != nil {
		t.Fatalf("OpenArtifact() error = %v", err)
	}
	artifactContent, err := io.ReadAll(artifact)
	closeErr := artifact.Close()
	if err != nil || closeErr != nil || string(artifactContent) != strings.ToUpper(string(content)) {
		t.Fatalf("artifact content = %q, read error %v, close error %v", artifactContent, err, closeErr)
	}
	if _, err := manager.OpenArtifact(identity, "../artifact.txt"); err == nil {
		t.Fatal("OpenArtifact() accepted traversal")
	}
	wantLogs := map[string]string{"stdout": "manager stdout", "stderr": "manager stderr"}
	for len(wantLogs) > 0 {
		select {
		case entry := <-manager.Logs():
			if wanted, exists := wantLogs[entry.Stream]; exists && strings.Contains(entry.Text, wanted) {
				delete(wantLogs, entry.Stream)
			}
		case <-time.After(3 * time.Second):
			t.Fatalf("runtime logs missing %v", wantLogs)
		}
	}
}

func TestManagerHardReplacesCrashedWorker(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `import os

def pid():
    return {"value": os.getpid()}

def crash():
    os._exit(23)

handlers = {"crash": crash, "pid": pid}
`)
	manager := newFixtureManager(t, Options{})
	initializeManager(t, manager, projectRoot, []string{"crash", "pid"})
	first := invokeManager(t, manager, "first-pid", 1, "pid")
	firstPID := string(first.Outputs["value"])
	_, err := manager.Invoke(testContext(t), fixtureInvokeParams("crash", 2, "crash", map[string]json.RawMessage{}))
	if err == nil {
		t.Fatal("Invoke(crash) succeeded")
	}
	second := invokeManager(t, manager, "second-pid", 3, "pid")
	if secondPID := string(second.Outputs["value"]); secondPID == firstPID {
		t.Fatalf("replacement pid = %s, want different from %s", secondPID, firstPID)
	}
}

func TestManagerSelectsNearestProjectVirtualEnvironment(t *testing.T) {
	launcher := fixturePython(t)
	workspace := t.TempDir()
	virtualEnvironment := filepath.Join(workspace, ".venv")
	command := exec.Command(launcher, "-m", "venv", "--without-pip", virtualEnvironment)
	if output, err := command.CombinedOutput(); err != nil {
		t.Skipf("create fixture virtual environment: %v: %s", err, output)
	}
	projectRoot := filepath.Join(workspace, "nested", "project")
	if err := os.MkdirAll(projectRoot, 0o700); err != nil {
		t.Fatalf("create nested project: %v", err)
	}
	writeFixtureEntrypoint(t, projectRoot, `import sys

def environment():
    return {"prefix": sys.prefix}

handlers = {"environment": environment}
`)
	manager := newFixtureManagerWithPython(t, Options{}, launcher)
	initializeManager(t, manager, projectRoot, []string{"environment"})
	result := invokeManager(t, manager, "environment", 1, "environment")
	var prefix string
	if err := json.Unmarshal(result.Outputs["prefix"], &prefix); err != nil {
		t.Fatalf("decode environment prefix: %v", err)
	}
	left, err := os.Stat(prefix)
	if err != nil {
		t.Fatalf("stat selected prefix: %v", err)
	}
	right, err := os.Stat(virtualEnvironment)
	if err != nil || !os.SameFile(left, right) {
		t.Fatalf("selected prefix = %q, want %q", prefix, virtualEnvironment)
	}
}

func TestManagerBoundsInitializationAndCanReloadAfterFailure(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `import time

def startup():
    time.sleep(5)

handlers = {}
`)
	manager := newFixtureManager(t, Options{InitializeTimeout: 150 * time.Millisecond, ShutdownTimeout: 250 * time.Millisecond})
	started := time.Now()
	_, err := manager.Reload(context.Background(), projectRoot, contracts.RuntimeDeclaration{Kind: "python", Entrypoint: "app.py"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Reload() error = %v, want deadline", err)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("bounded initialization took %v", elapsed)
	}
	writeFixtureEntrypoint(t, projectRoot, `handlers = {}`+"\n")
	initializeManager(t, manager, projectRoot, []string{})
}

func TestManagerBoundsShutdownHook(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `import time

def shutdown():
    time.sleep(5)

handlers = {}
`)
	manager := newFixtureManager(t, Options{ShutdownTimeout: 150 * time.Millisecond})
	initializeManager(t, manager, projectRoot, []string{})
	started := time.Now()
	if err := manager.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("bounded shutdown took %v", elapsed)
	}
}

func TestManagerRejectsMismatchedStagedContent(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `def inspect(blob):
    return {"value": blob["path"]}

handlers = {"inspect": inspect}
`)
	identity := contracts.InvocationIdentity{SessionID: "session-content", BindingID: "binding-content", InvocationID: "invocation-content", Sequence: 1}
	digest := sha256.Sum256([]byte("expected"))
	reference := contracts.ContentReference{ID: "content-mismatch", MediaType: "text/plain", ByteLength: 8, SHA256: hex.EncodeToString(digest[:]), InvocationID: identity.InvocationID}
	manager := newFixtureManager(t, Options{ContentOpener: memoryContentOpener{reference: reference, content: []byte("different")}})
	initializeManager(t, manager, projectRoot, []string{"inspect"})
	argument, err := json.Marshal(reference)
	if err != nil {
		t.Fatalf("marshal reference: %v", err)
	}
	_, err = manager.Invoke(testContext(t), contracts.InvokeParams{Identity: identity, Handler: "inspect", Arguments: map[string]json.RawMessage{"blob": argument}, Content: []contracts.ContentReference{reference}})
	if err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("Invoke() error = %v", err)
	}
}

func newFixtureManager(t *testing.T, options Options) *Manager {
	t.Helper()
	return newFixtureManagerWithPython(t, options, fixturePython(t))
}

func newFixtureManagerWithPython(t *testing.T, options Options, python string) *Manager {
	t.Helper()
	options.LauncherPython = python
	options.StagingRoot = t.TempDir()
	if options.InitializeTimeout == 0 {
		options.InitializeTimeout = 3 * time.Second
	}
	if options.InvokeTimeout == 0 {
		options.InvokeTimeout = 750 * time.Millisecond
	}
	if options.ShutdownTimeout == 0 {
		options.ShutdownTimeout = time.Second
	}
	manager, err := NewManager(options)
	if err != nil {
		t.Fatalf("NewManager() error = %v", err)
	}
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})
	return manager
}

func fixturePython(t *testing.T) string {
	t.Helper()
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is required for worker manager coverage")
	}
	python, err = filepath.Abs(python)
	if err != nil {
		t.Fatalf("resolve python3: %v", err)
	}
	return python
}

func initializeManager(t *testing.T, manager *Manager, projectRoot string, handlers []string) {
	t.Helper()
	result, err := manager.Reload(testContext(t), projectRoot, contracts.RuntimeDeclaration{Kind: "python", Entrypoint: "app.py"})
	if err != nil {
		t.Fatalf("Reload() error = %v; logs = %#v", err, manager.LogSnapshot())
	}
	if result.LoadError != nil || strings.Join(result.Handlers, ",") != strings.Join(handlers, ",") {
		t.Fatalf("Reload() result = %#v", result)
	}
}

func invokeManager(t *testing.T, manager *Manager, invocationID string, sequence uint64, handler string) contracts.InvokeResult {
	t.Helper()
	result, err := manager.Invoke(testContext(t), fixtureInvokeParams(invocationID, sequence, handler, map[string]json.RawMessage{}))
	if err != nil {
		t.Fatalf("Invoke(%s) error = %v; logs = %#v", handler, err, manager.LogSnapshot())
	}
	if result.Error != nil {
		t.Fatalf("Invoke(%s) result = %#v", handler, result)
	}
	return result
}

func TestManagerCloseIsIdempotent(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `handlers = {}`+"\n")
	manager := newFixtureManager(t, Options{})
	initializeManager(t, manager, projectRoot, []string{})
	if err := manager.Close(); err != nil {
		t.Fatalf("first Close() error = %v", err)
	}
	if err := manager.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
	if _, err := manager.Reload(context.Background(), projectRoot, contracts.RuntimeDeclaration{Kind: "python", Entrypoint: "app.py"}); !errors.Is(err, ErrManagerClosed) {
		t.Fatalf("Reload() after close error = %v", err)
	}
}
