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
)

type workerRPCTestProcess struct {
	client *WorkerRPCClient
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stderr *bytes.Buffer
}

// The Go transport should drive a real Python worker, capture MCP registration, and invoke the retained worker tool.
func TestWorkerRPCClientCallWithPythonWorkerRegistersMCPTool(t *testing.T) {
	host, registry := newWorkerRPCTestMCPHost(t)
	process := newWorkerRPCTestProcess(t, workerRPCTestProcessOptions{Host: host})
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

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registered mcp tool, got %#v", registrations)
	}
	registration := registrations[0]
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin registration, got %q", registration.PluginID)
	}
	if registration.Name != workerRPCTestToolName {
		t.Fatalf("expected %q tool registration, got %q", workerRPCTestToolName, registration.Name)
	}
	if registration.Metadata.AccessType != "read" {
		t.Fatalf("expected read access type, got %#v", registration.Metadata.AccessType)
	}

	invokeResult, err := process.client.Call(ctx, "plugin.invoke_mcp_tool", map[string]any{
		"toolName": workerRPCTestToolName,
		"kwargs": map[string]any{
			"value": "alpha",
		},
	})
	if err != nil {
		t.Fatalf("invoke worker mcp tool: %v\nstderr:\n%s", err, process.stderr.String())
	}
	var toolResult struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(invokeResult, &toolResult); err != nil {
		t.Fatalf("decode worker mcp tool result: %v", err)
	}
	if toolResult.Result != "fixture-plugin:alpha" {
		t.Fatalf("expected fixture-plugin:alpha, got %q", toolResult.Result)
	}
}

// Nested host failures should surface back through the worker as a typed Go RPC error.
func TestWorkerRPCClientCallWithPythonWorkerPropagatesNestedHostError(t *testing.T) {
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: NewCodegenTargetRegistry(),
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
	if rpcErr.Code != workerRPCRegisterFailedCode {
		t.Fatalf("expected %q error code, got %q", workerRPCRegisterFailedCode, rpcErr.Code)
	}
	if !strings.Contains(rpcErr.Message, ErrWorkerHostMCPToolRegistrarRequired.Error()) {
		t.Fatalf("expected mcp-tool-registrar-required message, got %q", rpcErr.Message)
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
	Host *WorkerHost
}

func newWorkerRPCTestProcess(t *testing.T, options workerRPCTestProcessOptions) *workerRPCTestProcess {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint()), 0o644); err != nil {
		t.Fatalf("write worker RPC test entrypoint: %v", err)
	}

	command := append(workerRPCTestCommandPrefix(t, repoRoot),
		"--plugin-id",
		"fixture-plugin",
		"--plugin-version",
		"0.1.0",
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
			EffectiveCapabilities: []string{CapabilityRegisterMCPTools},
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

const workerRPCTestToolName = "fixture_echo"

func newWorkerRPCTestMCPHost(t *testing.T) (*WorkerHost, *MCPToolRegistry) {
	t.Helper()

	registry := NewMCPToolRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		MCPToolRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker RPC test host: %v", err)
	}
	return host, registry
}

func newWorkerRPCTestHost(t *testing.T) *WorkerHost {
	t.Helper()

	host, _ := newWorkerRPCTestMCPHost(t)
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

func workerRPCTestEntrypoint() string {
	return strings.Join([]string{
		"def register(plugin):",
		"    def fixture_echo(*, value: str) -> str:",
		"        return f\"{plugin.plugin_id}:{value}\"",
		"",
		"    plugin.register_mcp_tool(",
		"        fixture_echo,",
		fmt.Sprintf("        name=%q,", workerRPCTestToolName),
		"        annotations={'accessType': 'read'},",
		"    )",
		"",
	}, "\n")
}
