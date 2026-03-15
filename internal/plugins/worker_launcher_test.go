package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// A launcher without a host cannot own nested worker host requests.
func TestNewWorkerLauncherRequiresHost(t *testing.T) {
	t.Parallel()

	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{})
	if launcher != nil {
		t.Fatal("expected nil launcher")
	}
	if !errors.Is(err, ErrWorkerLauncherHostRequired) {
		t.Fatalf("expected host-required error, got %v", err)
	}
}

// The first caller-facing launcher should start, initialize, and register a real worker through the Go host boundary.
func TestWorkerLauncherStartAndRegisterWithPythonWorker(t *testing.T) {
	host, registry := newWorkerRPCTestMCPHost(t)
	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		t.Fatalf("new worker launcher: %v", err)
	}
	spec, _ := newWorkerLauncherTestSpec(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	started, err := launcher.StartAndRegister(ctx, spec)
	if err != nil {
		t.Fatalf("start and register worker: %v", err)
	}
	defer func() {
		if err := started.Close(); err != nil {
			t.Fatalf("close started worker session: %v", err)
		}
	}()

	if started.Handshake.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin handshake, got %q", started.Handshake.PluginID)
	}
	if started.Handshake.PluginVersion != "0.1.0" {
		t.Fatalf("expected version 0.1.0, got %q", started.Handshake.PluginVersion)
	}
	if started.Handshake.BackendPluginAPIVersion != BackendPluginAPIVersion {
		t.Fatalf("expected backend API version %d, got %d", BackendPluginAPIVersion, started.Handshake.BackendPluginAPIVersion)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registered mcp tool, got %#v", registrations)
	}
	if registrations[0].Name != workerRPCTestToolName {
		t.Fatalf("expected %q registration, got %q", workerRPCTestToolName, registrations[0].Name)
	}

	invokeResult, err := started.Session.Call(ctx, "plugin.invoke_mcp_tool", map[string]any{
		"toolName": workerRPCTestToolName,
		"kwargs": map[string]any{
			"value": "gamma",
		},
	})
	if err != nil {
		t.Fatalf("invoke registered mcp tool: %v", err)
	}
	var toolResult struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(invokeResult, &toolResult); err != nil {
		t.Fatalf("decode worker mcp tool result: %v", err)
	}
	if toolResult.Result != "fixture-plugin:gamma" {
		t.Fatalf("expected fixture-plugin:gamma, got %q", toolResult.Result)
	}
}

// Handshake validation should keep worker startup semantics typed and deterministic.
func TestDecodeWorkerHandshakeRejectsInvalidPayloads(t *testing.T) {
	t.Parallel()

	requiredMethods := workerLauncherTestRequiredMethods()
	basePayload := func() map[string]any {
		return map[string]any{
			"pluginId":                "fixture-plugin",
			"pluginVersion":           "0.1.0",
			"backendPluginApiVersion": BackendPluginAPIVersion,
			"supportedRpcMethods":     requiredMethods,
		}
	}
	spec := BackendWorkerSpec{
		PluginID:      "fixture-plugin",
		PluginVersion: "0.1.0",
	}

	testCases := []struct {
		name    string
		mutate  func(map[string]any)
		target  error
		message string
	}{
		{
			name: "plugin id mismatch",
			mutate: func(payload map[string]any) {
				payload["pluginId"] = "other-plugin"
			},
			target:  ErrWorkerHandshakeInvalid,
			message: "plugin id mismatch",
		},
		{
			name: "plugin version mismatch",
			mutate: func(payload map[string]any) {
				payload["pluginVersion"] = "9.9.9"
			},
			target:  ErrWorkerHandshakeInvalid,
			message: "plugin version mismatch",
		},
		{
			name: "api version mismatch",
			mutate: func(payload map[string]any) {
				payload["backendPluginApiVersion"] = 99
			},
			target:  ErrWorkerHandshakeAPIVersionMismatch,
			message: "API version mismatch",
		},
		{
			name: "missing methods",
			mutate: func(payload map[string]any) {
				payload["supportedRpcMethods"] = []string{"plugin.initialize"}
			},
			target:  ErrWorkerHandshakeInvalid,
			message: "missing required methods",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			payload := basePayload()
			testCase.mutate(payload)
			encoded, err := json.Marshal(payload)
			if err != nil {
				t.Fatalf("marshal handshake payload: %v", err)
			}

			_, err = decodeWorkerHandshake(encoded, spec)
			if !errors.Is(err, testCase.target) {
				t.Fatalf("expected %v, got %v", testCase.target, err)
			}
			if !strings.Contains(err.Error(), testCase.message) {
				t.Fatalf("expected %q in %v", testCase.message, err)
			}
		})
	}
}

func newWorkerLauncherTestSpec(t *testing.T) (BackendWorkerSpec, string) {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	backendRoot := filepath.Join(pluginRoot, "backend")
	if err := os.MkdirAll(backendRoot, 0o755); err != nil {
		t.Fatalf("mkdir worker launcher backend root: %v", err)
	}

	entrypoint := filepath.Join(backendRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint()), 0o644); err != nil {
		t.Fatalf("write worker launcher entrypoint: %v", err)
	}

	return BackendWorkerSpec{
		CommandPrefix:         workerRPCTestCommandPrefix(t, repoRoot),
		PluginID:              "fixture-plugin",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            entrypoint,
		ServerMode:            "share",
		EffectiveCapabilities: []string{CapabilityRegisterMCPTools},
		Environment:           workerRPCTestEnv(repoRoot),
		WorkingDirectory:      repoRoot,
	}, pluginRoot
}

func workerLauncherTestRequiredMethods() []string {
	methods := make([]string, 0, len(requiredWorkerHandshakeMethods))
	for method := range requiredWorkerHandshakeMethods {
		methods = append(methods, method)
	}
	sort.Strings(methods)
	return methods
}
