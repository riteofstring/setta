package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/realtime"
)

// Session startup should reject missing worker metadata before spawning a subprocess.
func TestStartWorkerSessionRequiresFields(t *testing.T) {
	host := newWorkerRPCTestHost(t)
	baseOptions := WorkerSessionOptions{
		CommandPrefix:         []string{"python3", "-m", "setta.plugins.worker"},
		PluginID:              "fixture-plugin",
		PluginVersion:         "0.1.0",
		PluginRoot:            "/tmp/plugin-root",
		Entrypoint:            "/tmp/plugin-root/entrypoint.py",
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
		Host:                  host,
	}

	testCases := []struct {
		name   string
		mutate func(*WorkerSessionOptions)
		target error
	}{
		{
			name: "command prefix",
			mutate: func(options *WorkerSessionOptions) {
				options.CommandPrefix = nil
			},
			target: ErrWorkerSessionCommandPrefixRequired,
		},
		{
			name: "plugin id",
			mutate: func(options *WorkerSessionOptions) {
				options.PluginID = ""
			},
			target: ErrWorkerSessionPluginIDRequired,
		},
		{
			name: "plugin version",
			mutate: func(options *WorkerSessionOptions) {
				options.PluginVersion = ""
			},
			target: ErrWorkerSessionPluginVersionRequired,
		},
		{
			name: "plugin root",
			mutate: func(options *WorkerSessionOptions) {
				options.PluginRoot = ""
			},
			target: ErrWorkerSessionPluginRootRequired,
		},
		{
			name: "entrypoint",
			mutate: func(options *WorkerSessionOptions) {
				options.Entrypoint = ""
			},
			target: ErrWorkerSessionEntrypointRequired,
		},
		{
			name: "host",
			mutate: func(options *WorkerSessionOptions) {
				options.Host = nil
			},
			target: ErrWorkerRPCHostRequired,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			options := baseOptions
			testCase.mutate(&options)

			session, err := StartWorkerSession(options)
			if session != nil {
				t.Fatal("expected nil session")
			}
			if !errors.Is(err, testCase.target) {
				t.Fatalf("expected %v, got %v", testCase.target, err)
			}
		})
	}
}

// A real worker session should initialize, register through the Go host boundary, and close cleanly.
func TestWorkerSessionInitializeRegisterShutdownAndClose(t *testing.T) {
	now := time.Date(2026, 3, 6, 14, 0, 0, 0, time.UTC)
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

	listener := connectWorkerHostListener(t, server.URL, hub, "listener-worker-session", "share-a")
	defer listener.CloseNow()
	recordWorkerHostBootstrapAndRegistration(t, broadcaster, "listener-worker-session", "project-a", "share-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-action", "section-second"},
			DependencyMode: realtime.ListenerDependencyModeRealtimeOnly,
		},
	})

	options := newWorkerSessionTestOptions(t, host, "share-a")
	session, err := StartWorkerSession(options)
	if err != nil {
		t.Fatalf("start worker session: %v", err)
	}
	closed := false
	defer func() {
		if !closed {
			_ = session.Close()
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	initializeResult, err := session.Initialize(ctx)
	if err != nil {
		t.Fatalf("initialize worker session: %v\nstderr:\n%s", err, session.Stderr())
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

	registerResult, err := session.Register(ctx)
	if err != nil {
		t.Fatalf("register worker session: %v\nstderr:\n%s", err, session.Stderr())
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

	envelope := readWorkerHostEnvelope(t, listener)
	if envelope.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content realtime.ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.DependencyEvents) != 2 {
		t.Fatalf("expected 2 dependency events, got %d", len(content.DependencyEvents))
	}

	after, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session after register")
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Fatalf("expected worker session register to advance last-seen time from %v to after %v", before.LastSeenAt, after.LastSeenAt)
	}

	if err := session.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown worker session: %v\nstderr:\n%s", err, session.Stderr())
	}
	if err := session.Close(); err != nil {
		t.Fatalf("close worker session: %v\nstderr:\n%s", err, session.Stderr())
	}
	closed = true

	_, err = session.Register(ctx)
	if !errors.Is(err, ErrWorkerSessionClosed) {
		t.Fatalf("expected closed-session error, got %v", err)
	}
}

func newWorkerSessionTestOptions(t *testing.T, host *WorkerHost, shareSessionID string) WorkerSessionOptions {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint(shareSessionID)), 0o644); err != nil {
		t.Fatalf("write worker session entrypoint: %v", err)
	}

	return WorkerSessionOptions{
		CommandPrefix:         workerRPCTestCommandPrefix(t, repoRoot),
		PluginID:              "fixture-plugin",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            entrypoint,
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
		Environment:           workerRPCTestEnv(repoRoot),
		WorkingDirectory:      repoRoot,
		Host:                  host,
	}
}
