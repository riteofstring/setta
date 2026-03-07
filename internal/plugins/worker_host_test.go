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

// Host requests without the emitListenerEvents capability should fail before delivery.
func TestWorkerHostEmitListenerDependencyEventsRequiresCapability(t *testing.T) {
	t.Parallel()

	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{}),
		}),
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{}, EmitListenerDependencyEventsRequest{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability error, got %v", err)
	}
}

// Deployment-mode worker traffic should require an explicit share session id.
func TestWorkerHostEmitListenerDependencyEventsRequiresShareSessionInDeployment(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
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

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
	}, EmitListenerDependencyEventsRequest{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostShareSessionRequired) {
		t.Fatalf("expected share-session-required error, got %v", err)
	}
}

// Successful deployment-mode worker events should touch the session and deliver one batched listener message.
func TestWorkerHostEmitListenerDependencyEventsTouchesSessionAndDeliversBatch(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
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

	listener := connectWorkerHostListener(t, server.URL, hub, "listener-a", "share-a")
	defer listener.CloseNow()
	recordWorkerHostBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "share-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-action", "section-second"},
			DependencyMode: realtime.ListenerDependencyModeRealtimeOnly,
		},
	})

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
	}, EmitListenerDependencyEventsRequest{
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-second"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"second"}`),
				TimestampMS:   124,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit listener dependency events: %v", err)
	}

	after, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session after emit")
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Fatalf("expected worker host emit to advance last-seen time from %v to after %v", before.LastSeenAt, after.LastSeenAt)
	}

	envelope := readWorkerHostEnvelope(t, listener)
	if envelope.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content realtime.ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.ProjectID != "project-a" {
		t.Fatalf("expected project-a content, got %q", content.ProjectID)
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
