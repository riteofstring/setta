package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/realtime"
)

type workerRPCTestProcess struct {
	client *WorkerRPCClient
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stderr *bytes.Buffer
}

// The Go transport should drive a real Python worker and deliver nested listener events through the Go host boundary.
func TestWorkerRPCClientCallWithPythonWorkerDeliversListenerDependencyEvents(t *testing.T) {
	now := time.Date(2026, 3, 6, 13, 0, 0, 0, time.UTC)
	deploymentRuntime := newWorkerHostTestDeploymentRuntime(t, &now)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	before, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session")
	}
	now = now.Add(2 * time.Minute)

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
			Deployment:  deploymentRuntime,
		}),
		Deployment: deploymentRuntime,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	server := newWorkerHostWebsocketServer(t, hub)
	defer server.Close()

	listener := connectWorkerHostListener(t, server.URL, hub, "listener-worker-rpc", "share-a")
	defer listener.CloseNow()
	recordWorkerHostBootstrapAndRegistration(t, broadcaster, "listener-worker-rpc", "project-a", "share-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-action", "section-second"},
			DependencyMode: realtime.ListenerDependencyModeRealtimeOnly,
		},
	})

	process := newWorkerRPCTestProcess(t, workerRPCTestProcessOptions{
		Host:           host,
		ShareSessionID: "share-a",
	})
	defer process.Close(t)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	initializeResult, err := process.client.Call(ctx, "plugin.initialize", nil)
	if err != nil {
		t.Fatalf("initialize worker: %v\nstderr:\n%s", err, process.stderr.String())
	}
	var handshake struct {
		PluginID string `json:"pluginId"`
	}
	if err := json.Unmarshal(initializeResult, &handshake); err != nil {
		t.Fatalf("decode initialize result: %v", err)
	}
	if handshake.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin handshake, got %q", handshake.PluginID)
	}

	registerResult, err := process.client.Call(ctx, "plugin.register", nil)
	if err != nil {
		t.Fatalf("register worker: %v\nstderr:\n%s", err, process.stderr.String())
	}
	var registerAck struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(registerResult, &registerAck); err != nil {
		t.Fatalf("decode register result: %v", err)
	}
	if !registerAck.OK {
		t.Fatalf("expected ok register response, got %s", string(registerResult))
	}

	after, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session after register")
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Fatalf("expected worker RPC register to advance last-seen time from %v to after %v", before.LastSeenAt, after.LastSeenAt)
	}

	envelope := readWorkerHostEnvelope(t, listener)
	if envelope.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content realtime.ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.ProjectConfigID != "project-a" {
		t.Fatalf("expected project-a content, got %q", content.ProjectConfigID)
	}
	if content.ShareSessionID != "share-a" {
		t.Fatalf("expected share-a content, got %q", content.ShareSessionID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.DependencyEvents) != 2 {
		t.Fatalf("expected 2 dependency events, got %d", len(content.DependencyEvents))
	}
	if content.DependencyEvents[0].DependencyKey != "section-action" {
		t.Fatalf("expected first dependency key section-action, got %q", content.DependencyEvents[0].DependencyKey)
	}
	if content.DependencyEvents[1].DependencyKey != "section-second" {
		t.Fatalf("expected second dependency key section-second, got %q", content.DependencyEvents[1].DependencyKey)
	}
	if string(content.DependencyEvents[0].Payload) != `{"type":"Literal","payload":"clicked"}` {
		t.Fatalf("expected first payload to round-trip, got %s", string(content.DependencyEvents[0].Payload))
	}
	if string(content.DependencyEvents[1].Payload) != `{"type":"Literal","payload":"second"}` {
		t.Fatalf("expected second payload to round-trip, got %s", string(content.DependencyEvents[1].Payload))
	}
}

// Nested host failures should surface back through the worker as a typed Go RPC error.
func TestWorkerRPCClientCallWithPythonWorkerPropagatesNestedHostError(t *testing.T) {
	now := time.Date(2026, 3, 6, 13, 0, 0, 0, time.UTC)
	deploymentRuntime := newWorkerHostTestDeploymentRuntime(t, &now)
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{}),
			Deployment:  deploymentRuntime,
		}),
		Deployment: deploymentRuntime,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	process := newWorkerRPCTestProcess(t, workerRPCTestProcessOptions{
		Host: host,
	})
	defer process.Close(t)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := process.client.Call(ctx, "plugin.initialize", nil); err != nil {
		t.Fatalf("initialize worker: %v\nstderr:\n%s", err, process.stderr.String())
	}

	_, err = process.client.Call(ctx, "plugin.register", nil)
	if err == nil {
		t.Fatal("expected register error")
	}

	var rpcErr *WorkerRPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected worker RPC error, got %T: %v", err, err)
	}
	if rpcErr.Code != workerRPCListenerEmitFailedCode {
		t.Fatalf("expected %q error code, got %q", workerRPCListenerEmitFailedCode, rpcErr.Code)
	}
	if !strings.Contains(rpcErr.Message, ErrWorkerHostShareSessionRequired.Error()) {
		t.Fatalf("expected share-session-required message, got %q", rpcErr.Message)
	}
}

// The client should reject worker responses that do not match the active request id.
func TestWorkerRPCClientCallRejectsResponseIDMismatch(t *testing.T) {
	host := newWorkerRPCTestHost(t)
	client, err := NewWorkerRPCClient(WorkerRPCClientOptions{
		Reader: strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":999,\"result\":{\"ok\":true}}\n"),
		Writer: &bytes.Buffer{},
		Host:   host,
	})
	if err != nil {
		t.Fatalf("new worker RPC client: %v", err)
	}

	_, err = client.Call(context.Background(), "plugin.initialize", nil)
	if !errors.Is(err, ErrWorkerRPCResponseIDMismatch) {
		t.Fatalf("expected response-id-mismatch error, got %v", err)
	}
}

// The client should distinguish missing-result responses from malformed worker error payloads.
func TestWorkerRPCClientCallRejectsInvalidResponseContracts(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		payload string
		target  error
	}{
		{
			name:    "missing result",
			payload: "{\"jsonrpc\":\"2.0\",\"id\":1000}\n",
			target:  ErrWorkerRPCResponseMissingResult,
		},
		{
			name:    "invalid error payload",
			payload: "{\"jsonrpc\":\"2.0\",\"id\":1000,\"error\":{\"code\":123,\"message\":null}}\n",
			target:  ErrWorkerRPCResponseInvalidError,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			host := newWorkerRPCTestHost(t)
			client, err := NewWorkerRPCClient(WorkerRPCClientOptions{
				Reader: strings.NewReader(testCase.payload),
				Writer: &bytes.Buffer{},
				Host:   host,
			})
			if err != nil {
				t.Fatalf("new worker RPC client: %v", err)
			}

			_, err = client.Call(context.Background(), "plugin.initialize", nil)
			if !errors.Is(err, testCase.target) {
				t.Fatalf("expected %v, got %v", testCase.target, err)
			}
		})
	}
}

type workerRPCTestProcessOptions struct {
	Host           *WorkerHost
	ShareSessionID string
}

func newWorkerRPCTestProcess(t *testing.T, options workerRPCTestProcessOptions) *workerRPCTestProcess {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint(options.ShareSessionID)), 0o644); err != nil {
		t.Fatalf("write worker RPC test entrypoint: %v", err)
	}

	command := append(workerRPCTestCommandPrefix(t, repoRoot),
		"--plugin-id",
		"fixture-plugin",
		"--plugin-version",
		"0.1.0",
		"--plugin-root",
		pluginRoot,
		"--entrypoint",
		entrypoint,
	)
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Dir = repoRoot
	cmd.Env = workerRPCTestEnv(repoRoot)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatalf("worker RPC stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("worker RPC stdout pipe: %v", err)
	}
	stderr := &bytes.Buffer{}
	cmd.Stderr = stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start worker RPC process: %v", err)
	}

	client, err := NewWorkerRPCClient(WorkerRPCClientOptions{
		Reader: stdout,
		Writer: stdin,
		Host:   options.Host,
		Worker: WorkerContext{
			PluginID:              "fixture-plugin",
			EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
		},
	})
	if err != nil {
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		t.Fatalf("new worker RPC client: %v", err)
	}

	return &workerRPCTestProcess{
		client: client,
		cmd:    cmd,
		stdin:  stdin,
		stderr: stderr,
	}
}

func (p *workerRPCTestProcess) Close(t *testing.T) {
	t.Helper()

	if p == nil || p.cmd == nil {
		return
	}
	if p.stdin != nil {
		_ = p.stdin.Close()
	}

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- p.cmd.Wait()
	}()

	select {
	case err := <-waitDone:
		if err != nil {
			t.Fatalf("wait for worker RPC process: %v\nstderr:\n%s", err, p.stderr.String())
		}
	case <-time.After(2 * time.Second):
		if p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
		}
		err := <-waitDone
		t.Fatalf("worker RPC process did not exit cleanly: %v\nstderr:\n%s", err, p.stderr.String())
	}
}

func newWorkerRPCTestHost(t *testing.T) *WorkerHost {
	t.Helper()

	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{}),
		}),
	})
	if err != nil {
		t.Fatalf("new worker RPC test host: %v", err)
	}
	return host
}

func workerRPCTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve worker RPC test file path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func workerRPCTestPythonBinary(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
		"python3",
		"python",
	}
	for _, candidate := range candidates {
		if strings.Contains(candidate, string(filepath.Separator)) {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			continue
		}
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}

	t.Fatalf("python interpreter not found under %s", repoRoot)
	return ""
}

func workerRPCTestCommandPrefix(t *testing.T, repoRoot string) []string {
	t.Helper()

	return []string{
		workerRPCTestPythonBinary(t, repoRoot),
		"-m",
		"setta.plugins.worker",
	}
}

func workerRPCTestEnv(repoRoot string) []string {
	backendPath := filepath.Join(repoRoot, "backend")
	env := os.Environ()
	pythonPathSet := false

	for index, entry := range env {
		if !strings.HasPrefix(entry, "PYTHONPATH=") {
			continue
		}
		current := strings.TrimPrefix(entry, "PYTHONPATH=")
		if current == "" {
			env[index] = "PYTHONPATH=" + backendPath
		} else {
			env[index] = "PYTHONPATH=" + backendPath + string(os.PathListSeparator) + current
		}
		pythonPathSet = true
		break
	}

	if !pythonPathSet {
		env = append(env, "PYTHONPATH="+backendPath)
	}
	env = append(env, "PYTHONUNBUFFERED=1")
	return env
}

func workerRPCTestEntrypoint(shareSessionID string) string {
	shareArgument := ""
	if strings.TrimSpace(shareSessionID) != "" {
		shareArgument = fmt.Sprintf(",\n        share_session_id=%q", strings.TrimSpace(shareSessionID))
	}

	return strings.Join([]string{
		"def register(plugin):",
		"    plugin.emit_listener_dependency_event(",
		"        project_config_id='project-a',",
		"        dependency_events=[",
		"            {",
		"                'dependencyKey': {'type': 'Section', 'sectionId': 'section-action'},",
		"                'payload': {'type': 'Literal', 'payload': 'clicked'},",
		"                'timestampMs': 123,",
		"            },",
		"            {",
		"                'dependencyKey': {'type': 'Section', 'sectionId': 'section-second'},",
		"                'payload': {'type': 'Literal', 'payload': 'second'},",
		"                'timestampMs': 124,",
		"            },",
		"        ]" + shareArgument + ",",
		"    )",
		"",
	}, "\n")
}
