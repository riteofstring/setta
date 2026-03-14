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

	"setta/internal/realtime"
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
	now := time.Date(2026, 3, 6, 15, 0, 0, 0, time.UTC)
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
	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		t.Fatalf("new worker launcher: %v", err)
	}

	server := newWorkerHostWebsocketServer(t, hub)
	defer server.Close()

	listener := connectWorkerHostListener(t, server.URL, hub, "listener-worker-launcher", "share-a")
	defer listener.CloseNow()
	recordWorkerHostBootstrapAndRegistration(t, broadcaster, "listener-worker-launcher", "project-a", "share-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-action", "section-second"},
			DependencyMode: realtime.ListenerDependencyModeRealtimeOnly,
		},
	})

	spec, _ := newWorkerLauncherTestSpec(t, "share-a")
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

	after, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session after register")
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Fatalf("expected worker launcher register to advance last-seen time from %v to after %v", before.LastSeenAt, after.LastSeenAt)
	}
}

// Launch-time handshake validation should reject live worker API mismatches before a caller sees a started session.
func TestWorkerLauncherStartRejectsHandshakeAPIVersionMismatch(t *testing.T) {
	host := newWorkerRPCTestHost(t)
	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		t.Fatalf("new worker launcher: %v", err)
	}

	spec, pluginRoot := newWorkerLauncherTestSpec(t, "")
	overridePath := filepath.Join(pluginRoot, "backend", "handshake.override.json")
	if err := os.WriteFile(overridePath, []byte("{\n  \"backendPluginApiVersion\": 99\n}\n"), 0o644); err != nil {
		t.Fatalf("write handshake override: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	started, err := launcher.Start(ctx, spec)
	if started != nil {
		t.Fatal("expected nil started session")
	}
	if !errors.Is(err, ErrWorkerHandshakeAPIVersionMismatch) {
		t.Fatalf("expected backend API version mismatch, got %v", err)
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

func newWorkerLauncherTestSpec(t *testing.T, shareSessionID string) (BackendWorkerSpec, string) {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	backendRoot := filepath.Join(pluginRoot, "backend")
	if err := os.MkdirAll(backendRoot, 0o755); err != nil {
		t.Fatalf("mkdir worker launcher backend root: %v", err)
	}

	entrypoint := filepath.Join(backendRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint(shareSessionID)), 0o644); err != nil {
		t.Fatalf("write worker launcher entrypoint: %v", err)
	}

	return BackendWorkerSpec{
		PythonBinary:          workerRPCTestPythonBinary(t, repoRoot),
		PluginID:              "fixture-plugin",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            entrypoint,
		ServerMode:            "share",
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
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
