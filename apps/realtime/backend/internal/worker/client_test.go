package worker

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

const fixtureWorkerEnvironment = "SETTA_REALTIME_GO_FIXTURE_WORKER"

func TestPythonBootstrapConformsForReturnsStreamsErrorsCancellationAndLogs(t *testing.T) {
	projectRoot := t.TempDir()
	entrypoint := `import asyncio
import sys
import time

def ordinary(value):
    print("ordinary stdout", flush=True)
    print("ordinary stderr", file=sys.stderr, flush=True)
    return {"value": value + 1}

def stream(limit):
    for value in range(limit):
        yield {"value": value}

async def async_stream(limit):
    for value in range(limit):
        await asyncio.sleep(0)
        yield {"value": value}

def fail():
    raise RuntimeError("fixture failure")

def cancellable():
    value = 0
    while True:
        time.sleep(0.01)
        yield {"value": value}
        value += 1

handlers = {
    "ordinary": ordinary,
    "stream": stream,
    "async_stream": async_stream,
    "fail": fail,
    "cancellable": cancellable,
}
`
	writeFixtureEntrypoint(t, projectRoot, entrypoint)
	runtime := startPythonFixture(t)
	initializeFixture(t, runtime.client, projectRoot, []string{"async_stream", "cancellable", "fail", "ordinary", "stream"})

	ordinary := fixtureInvokeParams("ordinary-return", 1, "ordinary", map[string]json.RawMessage{"value": json.RawMessage(`41`)})
	result, err := runtime.client.Invoke(testContext(t), ordinary)
	if err != nil {
		t.Fatalf("Invoke(ordinary) error = %v", err)
	}
	if got := string(result.Outputs["value"]); got != "42" || result.Error != nil {
		t.Fatalf("ordinary result = %#v", result)
	}

	stream := fixtureInvokeParams("generator-stream", 2, "stream", map[string]json.RawMessage{"limit": json.RawMessage(`3`)})
	result, updates := invokeAndCollectUpdates(t, runtime.client, stream, 3)
	if result.Error != nil || len(result.Outputs) != 0 {
		t.Fatalf("generator result = %#v", result)
	}
	assertUpdateValues(t, updates, []string{"0", "1", "2"})

	asyncStream := fixtureInvokeParams("async-generator-stream", 3, "async_stream", map[string]json.RawMessage{"limit": json.RawMessage(`2`)})
	result, updates = invokeAndCollectUpdates(t, runtime.client, asyncStream, 2)
	if result.Error != nil || len(result.Outputs) != 0 {
		t.Fatalf("async generator result = %#v", result)
	}
	assertUpdateValues(t, updates, []string{"0", "1"})

	failure := fixtureInvokeParams("handler-failure", 4, "fail", map[string]json.RawMessage{})
	result, err = runtime.client.Invoke(testContext(t), failure)
	if err != nil {
		t.Fatalf("Invoke(fail) error = %v", err)
	}
	if result.Error == nil || result.Error.Code != "handler_error" || !strings.Contains(result.Error.Message, "fixture failure") {
		t.Fatalf("handler failure result = %#v", result)
	}

	cancellable := fixtureInvokeParams("cancel-generator", 5, "cancellable", map[string]json.RawMessage{})
	invocation, err := runtime.client.StartInvoke(cancellable)
	if err != nil {
		t.Fatalf("StartInvoke(cancellable) error = %v", err)
	}
	firstUpdate := readUpdate(t, runtime.client.Updates())
	if firstUpdate.Identity.InvocationID != cancellable.Identity.InvocationID {
		t.Fatalf("cancel update identity = %#v", firstUpdate.Identity)
	}
	if err := invocation.Cancel(); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	result, err = invocation.Await(testContext(t))
	if err != nil {
		t.Fatalf("Await(cancellable) error = %v", err)
	}
	if result.Error == nil || result.Error.Code != "cancelled" {
		t.Fatalf("cancel result = %#v", result)
	}

	assertFixtureLogs(t, runtime)
}

func assertFixtureLogs(t *testing.T, runtime *fixtureRuntime) {
	t.Helper()
	runtime.shutdown(t)
	stdout, stdoutTruncated := runtime.stdout.Snapshot()
	stderr, stderrTruncated := runtime.stderr.Snapshot()
	if stdoutTruncated || !strings.Contains(stdout, "ordinary stdout") {
		t.Fatalf("stdout log = %q, truncated %t", stdout, stdoutTruncated)
	}
	if stderrTruncated || !strings.Contains(stderr, "ordinary stderr") || !strings.Contains(stderr, "fixture failure") {
		t.Fatalf("stderr log = %q, truncated %t", stderr, stderrTruncated)
	}
}

func TestPythonBootstrapCrashFailsThePendingInvocation(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `import os

def crash():
    os._exit(23)

handlers = {"crash": crash}
`)
	runtime := startPythonFixture(t)
	initializeFixture(t, runtime.client, projectRoot, []string{"crash"})
	_, err := runtime.client.Invoke(testContext(t), fixtureInvokeParams("worker-crash", 1, "crash", map[string]json.RawMessage{}))
	if err == nil || !errors.Is(err, io.EOF) {
		t.Fatalf("Invoke(crash) error = %v, want stream EOF", err)
	}
	if err := runtime.wait(); err == nil {
		t.Fatal("crashed worker exited successfully")
	}
	if runtime.command.ProcessState.ExitCode() != 23 {
		t.Fatalf("crashed worker exit code = %d", runtime.command.ProcessState.ExitCode())
	}
}

func TestPythonBootstrapReportsEntrypointLoadFailure(t *testing.T) {
	projectRoot := t.TempDir()
	writeFixtureEntrypoint(t, projectRoot, `raise RuntimeError("load fixture failure")
`)
	runtime := startPythonFixture(t)
	result, err := runtime.client.Initialize(testContext(t), contracts.InitializeParams{
		ProtocolVersion: contracts.WorkerProtocolVersion,
		ProjectRoot:     projectRoot,
		Entrypoint:      "app.py",
	})
	if err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if result.LoadError == nil || result.LoadError.Code != "load_error" || !strings.Contains(result.LoadError.Message, "load fixture failure") || len(result.Handlers) != 0 {
		t.Fatalf("load failure result = %#v", result)
	}
	runtime.shutdown(t)
}

func TestGoFixtureWorkerPassesTheLanguageNeutralContract(t *testing.T) {
	command := exec.Command(os.Args[0], "-test.run=^TestGoFixtureWorkerProcess$")
	command.Env = append(os.Environ(), fixtureWorkerEnvironment+"=1")
	runtime := startFixtureCommand(t, command)
	projectRoot := t.TempDir()
	initializeFixture(t, runtime.client, projectRoot, []string{"echo"})
	params := fixtureInvokeParams("go-fixture", 1, "echo", map[string]json.RawMessage{"value": json.RawMessage(`{"portable":true}`)})
	result, updates := invokeAndCollectUpdates(t, runtime.client, params, 1)
	if result.Error != nil || string(result.Outputs["value"]) != `{"portable":true}` {
		t.Fatalf("Go fixture result = %#v", result)
	}
	assertUpdateValues(t, updates, []string{`{"portable":true}`})
	runtime.shutdown(t)
}

func TestGoFixtureWorkerProcess(t *testing.T) {
	if os.Getenv(fixtureWorkerEnvironment) != "1" {
		return
	}
	input := os.NewFile(3, "setta-fixture-input")
	output := os.NewFile(4, "setta-fixture-output")
	framer, err := NewFramer(input, output, DefaultMaximumFrameBytes)
	if err != nil {
		t.Fatalf("NewFramer() error = %v", err)
	}
	for {
		payload, err := framer.Read()
		if err != nil {
			t.Fatalf("Read() error = %v", err)
		}
		message, err := decodeWireMessage(payload)
		if err != nil {
			t.Fatalf("decodeWireMessage() error = %v", err)
		}
		switch message.Method {
		case InitializeMethod:
			writeFixtureMessage(t, framer, wireMessage{
				JSONRPC: "2.0",
				ID:      message.ID,
				Result:  mustJSON(t, contracts.InitializeResult{ProtocolVersion: 1, RuntimeKind: "fixture", Handlers: []string{"echo"}}),
			})
		case InvokeMethod:
			var params contracts.InvokeParams
			if err := contracts.DecodeStrict(message.Params, &params); err != nil {
				t.Fatalf("decode invoke params: %v", err)
			}
			outputs := map[string]json.RawMessage{"value": params.Arguments["value"]}
			writeFixtureMessage(t, framer, wireMessage{
				JSONRPC: "2.0",
				Method:  UpdateMethod,
				Params: mustJSON(t, contracts.RuntimeUpdate{
					Identity: params.Identity, Outputs: outputs, Artifacts: []contracts.WorkerArtifact{},
				}),
			})
			writeFixtureMessage(t, framer, wireMessage{
				JSONRPC: "2.0",
				ID:      message.ID,
				Result:  mustJSON(t, contracts.InvokeResult{Outputs: outputs}),
			})
		case ShutdownMethod:
			writeFixtureMessage(t, framer, wireMessage{JSONRPC: "2.0", ID: message.ID, Result: json.RawMessage("null")})
			return
		default:
			t.Fatalf("unexpected fixture method %q", message.Method)
		}
	}
}

type fixtureRuntime struct {
	command *exec.Cmd
	client  *Client
	input   *os.File
	output  *os.File
	stdout  *BoundedLog
	stderr  *BoundedLog
	waited  bool
}

func startPythonFixture(t *testing.T) *fixtureRuntime {
	t.Helper()
	interpreter, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is required for worker bootstrap coverage")
	}
	bootstrap, err := filepath.Abs(filepath.Join("..", "..", "bootstrap", "setta_worker.py"))
	if err != nil {
		t.Fatalf("resolve bootstrap: %v", err)
	}
	return startFixtureCommand(t, exec.Command(interpreter, "-I", "-S", bootstrap))
}

func startFixtureCommand(t *testing.T, command *exec.Cmd) *fixtureRuntime {
	t.Helper()
	workerInput, hostOutput, err := os.Pipe()
	if err != nil {
		t.Fatalf("create worker input pipe: %v", err)
	}
	hostInput, workerOutput, err := os.Pipe()
	if err != nil {
		_ = workerInput.Close()
		_ = hostOutput.Close()
		t.Fatalf("create worker output pipe: %v", err)
	}
	stdout, err := NewBoundedLog(1 << 20)
	if err != nil {
		t.Fatalf("NewBoundedLog(stdout) error = %v", err)
	}
	stderr, err := NewBoundedLog(1 << 20)
	if err != nil {
		t.Fatalf("NewBoundedLog(stderr) error = %v", err)
	}
	if command.Env == nil {
		command.Env = os.Environ()
	}
	command.ExtraFiles = []*os.File{workerInput, workerOutput}
	command.Env = append(command.Env, InputFDEnvironment+"=3", OutputFDEnvironment+"=4")
	command.Stdout = stdout
	command.Stderr = stderr
	if err := command.Start(); err != nil {
		_ = workerInput.Close()
		_ = hostOutput.Close()
		_ = hostInput.Close()
		_ = workerOutput.Close()
		t.Fatalf("start fixture worker: %v", err)
	}
	_ = workerInput.Close()
	_ = workerOutput.Close()
	client, err := NewClient(hostInput, hostOutput, DefaultMaximumFrameBytes)
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("NewClient() error = %v", err)
	}
	runtime := &fixtureRuntime{command: command, client: client, input: hostInput, output: hostOutput, stdout: stdout, stderr: stderr}
	t.Cleanup(func() {
		_ = runtime.client.Close()
		_ = runtime.input.Close()
		_ = runtime.output.Close()
		if !runtime.waited && runtime.command.Process != nil {
			_ = runtime.command.Process.Kill()
			_ = runtime.command.Wait()
		}
	})
	return runtime
}

func (runtime *fixtureRuntime) shutdown(t *testing.T) {
	t.Helper()
	if err := runtime.client.Shutdown(testContext(t)); err != nil {
		stderr, _ := runtime.stderr.Snapshot()
		t.Fatalf("Shutdown() error = %v; stderr = %q", err, stderr)
	}
	if err := runtime.wait(); err != nil {
		t.Fatalf("worker wait error = %v", err)
	}
}

func (runtime *fixtureRuntime) wait() error {
	if runtime.waited {
		return nil
	}
	runtime.waited = true
	return runtime.command.Wait()
}

func initializeFixture(t *testing.T, client *Client, projectRoot string, wantHandlers []string) {
	t.Helper()
	result, err := client.Initialize(testContext(t), contracts.InitializeParams{
		ProtocolVersion: contracts.WorkerProtocolVersion,
		ProjectRoot:     projectRoot,
		Entrypoint:      "app.py",
	})
	if err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if result.ProtocolVersion != contracts.WorkerProtocolVersion || result.LoadError != nil || !slices.Equal(result.Handlers, wantHandlers) {
		t.Fatalf("initialize result = %#v", result)
	}
}

func fixtureInvokeParams(invocationID string, sequence uint64, handler string, arguments map[string]json.RawMessage) contracts.InvokeParams {
	return contracts.InvokeParams{
		Identity: contracts.InvocationIdentity{
			SessionID: "session-fixture", BindingID: "binding-fixture", InvocationID: invocationID, Sequence: sequence,
		},
		Handler: handler, Arguments: arguments, Content: []contracts.ContentReference{},
	}
}

func invokeAndCollectUpdates(t *testing.T, client *Client, params contracts.InvokeParams, count int) (contracts.InvokeResult, []contracts.RuntimeUpdate) {
	t.Helper()
	invocation, err := client.StartInvoke(params)
	if err != nil {
		t.Fatalf("StartInvoke(%s) error = %v", params.Handler, err)
	}
	result, err := invocation.Await(testContext(t))
	if err != nil {
		t.Fatalf("Await(%s) error = %v", params.Handler, err)
	}
	updates := make([]contracts.RuntimeUpdate, 0, count)
	for range count {
		updates = append(updates, readUpdate(t, client.Updates()))
	}
	return result, updates
}

func readUpdate(t *testing.T, updates <-chan contracts.RuntimeUpdate) contracts.RuntimeUpdate {
	t.Helper()
	select {
	case update, open := <-updates:
		if !open {
			t.Fatal("worker update stream closed")
		}
		return update
	case <-time.After(3 * time.Second):
		t.Fatal("worker update timed out")
		return contracts.RuntimeUpdate{}
	}
}

func assertUpdateValues(t *testing.T, updates []contracts.RuntimeUpdate, want []string) {
	t.Helper()
	got := make([]string, 0, len(updates))
	for _, update := range updates {
		got = append(got, string(update.Outputs["value"]))
	}
	if !slices.Equal(got, want) {
		t.Fatalf("update values = %q, want %q", got, want)
	}
}

func writeFixtureEntrypoint(t *testing.T, root string, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, "app.py"), []byte(content), 0o600); err != nil {
		t.Fatalf("write fixture entrypoint: %v", err)
	}
}

func writeFixtureMessage(t *testing.T, framer *Framer, message wireMessage) {
	t.Helper()
	if err := framer.Write(mustJSON(t, message)); err != nil {
		t.Fatalf("write fixture message: %v", err)
	}
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal fixture JSON: %v", err)
	}
	return encoded
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}
