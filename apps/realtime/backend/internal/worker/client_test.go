package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
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
	if got := string(result.Outputs["value"]); got != "42" || result.UpdateCount != 0 || result.Error != nil {
		t.Fatalf("ordinary result = %#v", result)
	}

	stream := fixtureInvokeParams("generator-stream", 2, "stream", map[string]json.RawMessage{"limit": json.RawMessage(`3`)})
	result, updates := invokeAndCollectUpdates(t, runtime.client, stream, 3)
	if result.Error != nil || len(result.Outputs) != 0 || result.UpdateCount != 3 {
		t.Fatalf("generator result = %#v", result)
	}
	assertUpdateValues(t, updates, []string{"0", "1", "2"})

	asyncStream := fixtureInvokeParams("async-generator-stream", 3, "async_stream", map[string]json.RawMessage{"limit": json.RawMessage(`2`)})
	result, updates = invokeAndCollectUpdates(t, runtime.client, asyncStream, 2)
	if result.Error != nil || len(result.Outputs) != 0 || result.UpdateCount != 2 {
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

	assertPythonFixtureCancellation(t, runtime.client)

	assertFixtureLogs(t, runtime)
}

func assertPythonFixtureCancellation(t *testing.T, client *Client) {
	t.Helper()
	cancellable := fixtureInvokeParams("cancel-generator", 5, "cancellable", map[string]json.RawMessage{})
	invocation, err := client.StartInvoke(cancellable)
	if err != nil {
		t.Fatalf("StartInvoke(cancellable) error = %v", err)
	}
	firstUpdate := readUpdate(t, client.Updates())
	if firstUpdate.Identity.InvocationID != cancellable.Identity.InvocationID {
		t.Fatalf("cancel update identity = %#v", firstUpdate.Identity)
	}
	if err := invocation.Cancel(); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	result, err := invocation.Await(testContext(t))
	if err != nil {
		t.Fatalf("Await(cancellable) error = %v", err)
	}
	if result.Error == nil || result.Error.Code != "cancelled" {
		t.Fatalf("cancel result = %#v", result)
	}
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

func TestPythonBootstrapLoadsCurrentEntrypointWhenBytecodeMetadataMatches(t *testing.T) {
	projectRoot := t.TempDir()
	entrypoint := filepath.Join(projectRoot, "app.py")
	staleSource := "def value():\n    return 7\n\nhandlers = {\"value\": value}\n"
	currentSource := "def value():\n    return 1\n\nhandlers = {\"value\": value}\n"
	if len(staleSource) != len(currentSource) {
		t.Fatal("fixture sources differ in size")
	}
	writeFixtureEntrypoint(t, projectRoot, staleSource)
	modified := time.Unix(1_700_000_000, 0)
	if err := os.Chtimes(entrypoint, modified, modified); err != nil {
		t.Fatalf("set stale source timestamp: %v", err)
	}
	interpreter, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is required for worker bootstrap coverage")
	}
	compile := exec.Command(
		interpreter,
		"-I",
		"-S",
		"-c",
		"import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True, invalidation_mode=py_compile.PycInvalidationMode.TIMESTAMP)",
		entrypoint,
	)
	if output, err := compile.CombinedOutput(); err != nil {
		t.Fatalf("compile stale bytecode: %v: %s", err, output)
	}
	writeFixtureEntrypoint(t, projectRoot, currentSource)
	if err := os.Chtimes(entrypoint, modified, modified); err != nil {
		t.Fatalf("restore source timestamp: %v", err)
	}
	runtime := startPythonFixture(t)
	initializeFixture(t, runtime.client, projectRoot, []string{"value"})
	result, err := runtime.client.Invoke(
		testContext(t),
		fixtureInvokeParams("current-source", 1, "value", map[string]json.RawMessage{}),
	)
	if err != nil {
		t.Fatalf("Invoke(value) error = %v", err)
	}
	if result.Error != nil || string(result.Outputs["value"]) != "1" {
		t.Fatalf("current source result = %#v", result)
	}
	runtime.shutdown(t)
}

func TestGoFixtureWorkerPassesTheLanguageNeutralContract(t *testing.T) {
	command := exec.Command(os.Args[0], "-test.run=^TestGoFixtureWorkerProcess$")
	command.Env = append(os.Environ(), fixtureWorkerEnvironment+"=1")
	runtime := startFixtureCommand(t, command)
	projectRoot := t.TempDir()
	initializeFixture(t, runtime.client, projectRoot, []string{"cancel", "crash", "echo", "fail", "logs", "stream"})
	params := fixtureInvokeParams("go-return", 1, "echo", map[string]json.RawMessage{"value": json.RawMessage(`{"portable":true}`)})
	result, err := runtime.client.Invoke(testContext(t), params)
	if err != nil || result.Error != nil || string(result.Outputs["value"]) != `{"portable":true}` {
		t.Fatalf("Go fixture result = %#v, error = %v", result, err)
	}
	stream := fixtureInvokeParams("go-stream", 2, "stream", map[string]json.RawMessage{})
	result, updates := invokeAndCollectUpdates(t, runtime.client, stream, 2)
	if result.Error != nil || len(result.Outputs) != 0 {
		t.Fatalf("Go fixture stream result = %#v", result)
	}
	assertUpdateValues(t, updates, []string{"0", "1"})
	result, err = runtime.client.Invoke(testContext(t), fixtureInvokeParams("go-error", 3, "fail", map[string]json.RawMessage{}))
	if err != nil || result.Error == nil || result.Error.Code != "handler_error" {
		t.Fatalf("Go fixture error result = %#v, error = %v", result, err)
	}
	invocation, err := runtime.client.StartInvoke(fixtureInvokeParams("go-cancel", 4, "cancel", map[string]json.RawMessage{}))
	if err != nil {
		t.Fatalf("StartInvoke(cancel) error = %v", err)
	}
	readUpdate(t, runtime.client.Updates())
	if err := invocation.Cancel(); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	result, err = invocation.Await(testContext(t))
	if err != nil || result.Error == nil || result.Error.Code != "cancelled" {
		t.Fatalf("Go fixture cancel result = %#v, error = %v", result, err)
	}
	result, err = runtime.client.Invoke(testContext(t), fixtureInvokeParams("go-logs", 5, "logs", map[string]json.RawMessage{}))
	if err != nil || result.Error != nil {
		t.Fatalf("Go fixture log result = %#v, error = %v", result, err)
	}
	runtime.shutdown(t)
	stdout, _ := runtime.stdout.Snapshot()
	stderr, _ := runtime.stderr.Snapshot()
	if !strings.Contains(stdout, "go fixture stdout") || !strings.Contains(stderr, "go fixture stderr") {
		t.Fatalf("Go fixture logs = %q, %q", stdout, stderr)
	}
}

func TestGoFixtureWorkerCrashFailsThePendingInvocation(t *testing.T) {
	command := exec.Command(os.Args[0], "-test.run=^TestGoFixtureWorkerProcess$")
	command.Env = append(os.Environ(), fixtureWorkerEnvironment+"=1")
	runtime := startFixtureCommand(t, command)
	initializeFixture(t, runtime.client, t.TempDir(), []string{"cancel", "crash", "echo", "fail", "logs", "stream"})
	_, err := runtime.client.Invoke(testContext(t), fixtureInvokeParams("go-crash", 1, "crash", map[string]json.RawMessage{}))
	if err == nil || !errors.Is(err, io.EOF) {
		t.Fatalf("Invoke(crash) error = %v, want stream EOF", err)
	}
	if err := runtime.wait(); err == nil || runtime.command.ProcessState.ExitCode() != 23 {
		t.Fatalf("Go fixture crash state = %#v, error = %v", runtime.command.ProcessState, err)
	}
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
	state := goFixtureState{}
	for {
		payload, err := framer.Read()
		if err != nil {
			t.Fatalf("Read() error = %v", err)
		}
		message, err := decodeWireMessage(payload)
		if err != nil {
			t.Fatalf("decodeWireMessage() error = %v", err)
		}
		if state.handle(t, framer, message) {
			return
		}
	}
}

type goFixtureState struct {
	pendingID json.RawMessage
}

func (state *goFixtureState) handle(t *testing.T, framer *Framer, message wireMessage) bool {
	t.Helper()
	switch message.Method {
	case InitializeMethod:
		result := contracts.InitializeResult{ProtocolVersion: contracts.WorkerProtocolVersion, RuntimeKind: "fixture", Handlers: []string{"cancel", "crash", "echo", "fail", "logs", "stream"}}
		writeFixtureMessage(t, framer, wireMessage{JSONRPC: "2.0", ID: message.ID, Result: mustJSON(t, result)})
	case InvokeMethod:
		state.invoke(t, framer, message)
	case CancelMethod:
		state.cancel(t, framer, message)
	case ShutdownMethod:
		writeFixtureMessage(t, framer, wireMessage{JSONRPC: "2.0", ID: message.ID, Result: json.RawMessage("null")})
		return true
	default:
		t.Fatalf("unexpected fixture method %q", message.Method)
	}
	return false
}

func (state *goFixtureState) invoke(t *testing.T, framer *Framer, message wireMessage) {
	t.Helper()
	var params contracts.InvokeParams
	if err := contracts.DecodeStrict(message.Params, &params); err != nil {
		t.Fatalf("decode invoke params: %v", err)
	}
	switch params.Handler {
	case "echo":
		state.respond(t, framer, message.ID, contracts.InvokeResult{Outputs: map[string]json.RawMessage{"value": params.Arguments["value"]}, UpdateCount: 0})
	case "stream":
		state.update(t, framer, params.Identity, "0", 1)
		state.update(t, framer, params.Identity, "1", 2)
		state.respond(t, framer, message.ID, contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, UpdateCount: 2})
	case "fail":
		state.respond(t, framer, message.ID, contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, UpdateCount: 0, Error: &contracts.StructuredError{Code: "handler_error", Message: "fixture failure"}})
	case "cancel":
		state.pendingID = append(json.RawMessage(nil), message.ID...)
		state.update(t, framer, params.Identity, "0", 1)
	case "logs":
		_, _ = fmt.Fprintln(os.Stdout, "go fixture stdout")
		_, _ = fmt.Fprintln(os.Stderr, "go fixture stderr")
		state.respond(t, framer, message.ID, contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, UpdateCount: 0})
	case "crash":
		os.Exit(23)
	default:
		t.Fatalf("unexpected fixture handler %q", params.Handler)
	}
}

func (state *goFixtureState) cancel(t *testing.T, framer *Framer, message wireMessage) {
	t.Helper()
	var params struct {
		ID uint64 `json:"id"`
	}
	if err := contracts.DecodeStrict(message.Params, &params); err != nil {
		t.Fatalf("decode cancel params: %v", err)
	}
	if string(state.pendingID) != strconv.FormatUint(params.ID, 10) {
		t.Fatalf("cancel request id = %d, pending = %s", params.ID, state.pendingID)
	}
	result := contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, UpdateCount: 1, Error: &contracts.StructuredError{Code: "cancelled", Message: "cancelled"}}
	state.respond(t, framer, state.pendingID, result)
	state.pendingID = nil
}

func (state *goFixtureState) update(t *testing.T, framer *Framer, identity contracts.InvocationIdentity, value string, sequence uint64) {
	t.Helper()
	update := contracts.RuntimeUpdate{Identity: identity, UpdateSequence: sequence, Outputs: map[string]json.RawMessage{"value": json.RawMessage(value)}, Artifacts: []contracts.WorkerArtifact{}}
	writeFixtureMessage(t, framer, wireMessage{JSONRPC: "2.0", Method: UpdateMethod, Params: mustJSON(t, update)})
}

func (state *goFixtureState) respond(t *testing.T, framer *Framer, id json.RawMessage, result contracts.InvokeResult) {
	t.Helper()
	writeFixtureMessage(t, framer, wireMessage{JSONRPC: "2.0", ID: id, Result: mustJSON(t, result)})
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
			SessionID: "session-fixture", RunID: "run-" + invocationID, BindingID: "binding-fixture", InvocationID: invocationID, Sequence: sequence,
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
	for index, update := range updates {
		if update.UpdateSequence != uint64(index+1) {
			t.Fatalf("update sequence = %d, want %d", update.UpdateSequence, index+1)
		}
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
