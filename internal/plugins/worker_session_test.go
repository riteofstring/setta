package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
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
		EffectiveCapabilities: []string{CapabilityRegisterCodegenTarget},
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
	host, registry := newWorkerRPCTestCodegenHost(t)
	options := newWorkerSessionTestOptions(t, host)
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

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registered codegen target, got %#v", registrations)
	}
	if registrations[0].TargetID != "fixture-plugin:"+workerRPCTestCodegenTargetID {
		t.Fatalf("unexpected target id %q", registrations[0].TargetID)
	}

	invokeResult, err := session.Call(ctx, "plugin.invoke_codegen_target", map[string]any{
		"handlerId":    workerRPCTestCodegenTargetID,
		"projectState": map[string]any{"projectConfig": map[string]any{"name": "FixtureProject"}},
		"targetOptions": map[string]any{
			"className": "WorkerSessionFixture",
		},
	})
	if err != nil {
		t.Fatalf("invoke registered codegen target: %v\nstderr:\n%s", err, session.Stderr())
	}
	var codegenResult struct {
		Files []struct {
			RelativePath string `json:"relativePath"`
			Content      string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(invokeResult, &codegenResult); err != nil {
		t.Fatalf("decode worker codegen result: %v", err)
	}
	if len(codegenResult.Files) != 1 {
		t.Fatalf("expected 1 generated file, got %#v", codegenResult.Files)
	}
	if codegenResult.Files[0].RelativePath != "fixture.ts" {
		t.Fatalf("unexpected generated file %#v", codegenResult.Files[0])
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

func newWorkerSessionTestOptions(t *testing.T, host *WorkerHost) WorkerSessionOptions {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := t.TempDir()
	entrypoint := filepath.Join(pluginRoot, "entrypoint.py")
	if err := os.WriteFile(entrypoint, []byte(workerRPCTestEntrypoint()), 0o644); err != nil {
		t.Fatalf("write worker session entrypoint: %v", err)
	}

	return WorkerSessionOptions{
		CommandPrefix:         workerRPCTestCommandPrefix(t, repoRoot),
		PluginID:              "fixture-plugin",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            entrypoint,
		EffectiveCapabilities: []string{CapabilityRegisterCodegenTarget},
		Environment:           workerRPCTestEnv(repoRoot),
		WorkingDirectory:      repoRoot,
		Host:                  host,
	}
}
