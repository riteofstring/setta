package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

type workerHostEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

// The host should reject empty configurations instead of silently accepting a no-op boundary.
func TestNewWorkerHostRequiresService(t *testing.T) {
	t.Parallel()

	host, err := NewWorkerHost(WorkerHostOptions{})
	if host != nil {
		t.Fatal("expected nil host")
	}
	if !errors.Is(err, ErrWorkerHostServiceRequired) {
		t.Fatalf("expected service-required error, got %v", err)
	}
}

// Codegen target registration should require the explicit worker capability before mutating runtime state.
func TestWorkerHostRegisterCodegenTargetRequiresCapability(t *testing.T) {
	t.Parallel()

	registry := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterCodegenTarget(context.Background(), WorkerContext{
		PluginID: "fixture-plugin",
	}, RegisterCodegenTargetRequest{
		Target: &workerCodegenTargetRegistrationPayload{
			ID:        "typescript",
			Name:      "TypeScript",
			Language:  "typescript",
			HandlerID: "typescript",
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// Registration should compose the final target id and default file name before storing the target for later generation.
func TestWorkerHostRegisterCodegenTargetNormalizesRegistration(t *testing.T) {
	t.Parallel()

	registry := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterCodegenTarget(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityRegisterCodegenTarget},
	}, RegisterCodegenTargetRequest{
		Target: &workerCodegenTargetRegistrationPayload{
			ID:        "typescript",
			Name:      "TypeScript",
			Language:  "typescript",
			HandlerID: "handler-ts",
		},
	})
	if err != nil {
		t.Fatalf("register codegen target: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.TargetID != "fixture-plugin:typescript" {
		t.Fatalf("expected composed target id, got %q", registration.TargetID)
	}
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Language != "typescript" {
		t.Fatalf("expected typescript language, got %q", registration.Language)
	}
	if registration.Name != "TypeScript" {
		t.Fatalf("expected TypeScript name, got %q", registration.Name)
	}
	if registration.DefaultFileName != defaultCodegenTargetFileName {
		t.Fatalf("expected default file name %q, got %q", defaultCodegenTargetFileName, registration.DefaultFileName)
	}
	if registration.HandlerID != "handler-ts" {
		t.Fatalf("expected handler-ts, got %q", registration.HandlerID)
	}
}

func newWorkerHostTestDeploymentRuntime(t *testing.T, now *time.Time) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:   "project-a",
				Name: "Project A",
			},
		},
	}
	writeWorkerHostJSON(t, filepath.Join(root, projectstate.MainFileName), document)
	writeWorkerHostJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeWorkerHostJSON(t, filepath.Join(root, "policy.json"), map[string]any{})

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now.UTC()
		},
	})
	if err != nil {
		t.Fatalf("open worker-host deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close worker-host deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func writeWorkerHostJSON(t *testing.T, path string, value any) {
	t.Helper()

	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatalf("mkdir worker-host parent: %v", err)
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal worker-host json: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write worker-host json: %v", err)
	}
}

func newWorkerHostWebsocketServer(t *testing.T, hub *realtime.WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		params := workerHostConnectParamsFromRequest(r)
		connection, err := hub.Connect(r.Context(), conn, params)
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, err.Error())
			return
		}
		defer hub.Disconnect(context.Background(), connection.ID, false)

		for {
			if _, _, err := conn.Read(context.Background()); err != nil {
				return
			}
		}
	})
	return httptest.NewServer(mux)
}

func workerHostConnectParamsFromRequest(r *http.Request) realtime.ConnectParams {
	query := r.URL.Query()
	return realtime.ConnectParams{
		ID:                   query.Get("id"),
		Type:                 realtime.ConnectionType(query.Get("type")),
		ShareSessionID:       query.Get("session"),
		BroadcastConnections: query.Get("broadcast") != "false",
	}
}

func connectWorkerHostListener(t *testing.T, serverURL string, hub *realtime.WebsocketHub, connectionID string, shareSessionID string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws"
	values := url.Values{}
	values.Set("id", connectionID)
	values.Set("type", string(realtime.ConnectionTypeListener))
	values.Set("session", shareSessionID)
	values.Set("broadcast", "false")
	wsURL += "?" + values.Encode()

	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("dial worker-host listener: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(connectionID); ok {
			return conn
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for worker-host listener %q", connectionID)
	return nil
}

func recordWorkerHostBootstrapAndRegistration(
	t *testing.T,
	broadcaster *realtime.ListenerBroadcaster,
	connectionID string,
	projectID string,
	shareSessionID string,
	callbacks map[string]realtime.ListenerCallback,
) {
	t.Helper()

	if err := broadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
	}); err != nil {
		t.Fatalf("record worker-host bootstrap: %v", err)
	}
	if err := broadcaster.Registry().UpsertRegistration(connectionID, projectID, callbacks, shareSessionID); err != nil {
		t.Fatalf("record worker-host registration: %v", err)
	}
}

func readWorkerHostEnvelope(t *testing.T, conn *websocket.Conn) workerHostEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read worker-host websocket message: %v", err)
	}

	var envelope workerHostEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode worker-host websocket envelope: %v", err)
	}
	return envelope
}
