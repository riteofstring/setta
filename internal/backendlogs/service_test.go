package backendlogs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/realtime"
)

type testEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

func TestServiceLogAndBroadcastScopesToMatchingShareSession(t *testing.T) {
	t.Parallel()

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newBackendLogTestServer(t, hub)
	defer server.Close()

	frontendA := dialBackendLogClient(t, server.URL, "frontend-a", realtime.ConnectionTypeFrontend, "share-a")
	defer frontendA.CloseNow()
	waitForBackendLogConnection(t, hub, "frontend-a")

	frontendB := dialBackendLogClient(t, server.URL, "frontend-b", realtime.ConnectionTypeFrontend, "share-b")
	defer frontendB.CloseNow()
	waitForBackendLogConnection(t, hub, "frontend-b")

	listenerA := dialBackendLogClient(t, server.URL, "listener-a", realtime.ConnectionTypeListener, "share-a")
	defer listenerA.CloseNow()
	waitForBackendLogConnection(t, hub, "listener-a")

	service, _, err := newTestService(hub, nil)
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}

	if err := service.LogAndBroadcast(context.Background(), LogRequest{
		Message:        "Started command",
		Severity:       SeverityInfo,
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
	}); err != nil {
		t.Fatalf("log and broadcast backend event: %v", err)
	}

	envelope := readBackendLogEnvelope(t, frontendA)
	if envelope.MessageType != MessageTypeBackendLogEvent {
		t.Fatalf("expected backend log event message type, got %q", envelope.MessageType)
	}

	var event Event
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.ID == "" {
		t.Fatal("expected backend log event id")
	}
	if event.ProjectID == nil || *event.ProjectID != "project-a" {
		t.Fatalf("expected backend log event project id project-a, got %#v", event.ProjectID)
	}
	if event.Severity != SeverityInfo {
		t.Fatalf("expected info severity, got %q", event.Severity)
	}
	if event.Message != "Started command" {
		t.Fatalf("expected backend log message Started command, got %q", event.Message)
	}
	if event.Timestamp == "" {
		t.Fatal("expected backend log timestamp")
	}

	assertNoBackendLogMessage(t, frontendB)
	assertNoBackendLogMessage(t, listenerA)
}

func TestServiceLogAndBroadcastHonorsUILogThresholdWhileStillLogging(t *testing.T) {
	t.Parallel()

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newBackendLogTestServer(t, hub)
	defer server.Close()

	frontend := dialBackendLogClient(t, server.URL, "frontend-a", realtime.ConnectionTypeFrontend, "")
	defer frontend.CloseNow()
	waitForBackendLogConnection(t, hub, "frontend-a")

	service, logs, err := newTestService(hub, map[string]string{
		uiLogLevelEnv: "error",
	})
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}

	if err := service.LogAndBroadcast(context.Background(), LogRequest{
		Message:  "Started command",
		Severity: SeverityInfo,
	}); err != nil {
		t.Fatalf("log and broadcast backend event: %v", err)
	}

	assertNoBackendLogMessage(t, frontend)
	if !strings.Contains(logs.String(), "Started command") {
		t.Fatalf("expected server log output to include Started command, got %q", logs.String())
	}
}

func TestServiceLogAndBroadcastDefaultsUILogThresholdToEffectiveLoggerLevel(t *testing.T) {
	t.Parallel()

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newBackendLogTestServer(t, hub)
	defer server.Close()

	frontendSuppressed := dialBackendLogClient(t, server.URL, "frontend-a", realtime.ConnectionTypeFrontend, "")
	waitForBackendLogConnection(t, hub, "frontend-a")

	service, logs, err := newTestServiceWithLoggerLevel(hub, nil, slog.LevelWarn)
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}

	if err := service.LogAndBroadcast(context.Background(), LogRequest{
		Message:  "Suppressed info event",
		Severity: SeverityInfo,
	}); err != nil {
		t.Fatalf("log and broadcast suppressed info event: %v", err)
	}

	assertNoBackendLogMessage(t, frontendSuppressed)
	frontendSuppressed.CloseNow()
	if strings.Contains(logs.String(), "Suppressed info event") {
		t.Fatalf("did not expect warn-level logger to record suppressed info event, got %q", logs.String())
	}

	frontendDelivered := dialBackendLogClient(t, server.URL, "frontend-b", realtime.ConnectionTypeFrontend, "")
	defer frontendDelivered.CloseNow()
	waitForBackendLogConnection(t, hub, "frontend-b")

	if err := service.LogAndBroadcast(context.Background(), LogRequest{
		Message:  "Delivered warning event",
		Severity: SeverityWarning,
	}); err != nil {
		t.Fatalf("log and broadcast delivered warning event: %v", err)
	}

	envelope := readBackendLogEnvelope(t, frontendDelivered)
	if envelope.MessageType != MessageTypeBackendLogEvent {
		t.Fatalf("expected backend log event message type, got %q", envelope.MessageType)
	}

	var event Event
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.Severity != SeverityWarning {
		t.Fatalf("expected warning severity, got %q", event.Severity)
	}
	if event.Message != "Delivered warning event" {
		t.Fatalf("expected warning backend log message, got %q", event.Message)
	}
	if !strings.Contains(logs.String(), "Delivered warning event") {
		t.Fatalf("expected warn-level logger to record delivered warning event, got %q", logs.String())
	}
}

func newTestService(hub *realtime.WebsocketHub, env map[string]string) (*Service, *bytes.Buffer, error) {
	return newTestServiceWithLoggerLevel(hub, env, slog.LevelInfo)
}

func newTestServiceWithLoggerLevel(hub *realtime.WebsocketHub, env map[string]string, level slog.Level) (*Service, *bytes.Buffer, error) {
	buffer := &bytes.Buffer{}
	logger := slog.New(slog.NewJSONHandler(buffer, &slog.HandlerOptions{Level: level}))
	service, err := NewService(ServiceOptions{
		Logger:       logger,
		WebsocketHub: hub,
		EnvLookup: func(key string) (string, bool) {
			if env == nil {
				return "", false
			}
			value, ok := env[key]
			return value, ok
		},
		IDGenerator: func() string {
			return "backend-log-id"
		},
		TimeNow: func() time.Time {
			return time.Date(2026, time.March, 6, 12, 34, 56, 0, time.UTC)
		},
	})
	return service, buffer, err
}

func newBackendLogTestServer(t *testing.T, hub *realtime.WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		connection, err := hub.Connect(r.Context(), conn, realtime.ConnectParams{
			ID:                   r.URL.Query().Get("id"),
			Type:                 realtime.ConnectionType(r.URL.Query().Get("type")),
			ShareSessionID:       r.URL.Query().Get("session"),
			BroadcastConnections: false,
		})
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

func dialBackendLogClient(t *testing.T, serverURL, id string, connectionType realtime.ConnectionType, shareSessionID string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws"
	query := url.Values{}
	query.Set("id", id)
	query.Set("type", string(connectionType))
	if shareSessionID != "" {
		query.Set("session", shareSessionID)
	}
	wsURL += "?" + query.Encode()

	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("dial backend log websocket: %v", err)
	}
	return conn
}

func waitForBackendLogConnection(t *testing.T, hub *realtime.WebsocketHub, connectionID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(connectionID); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for websocket connection %q", connectionID)
}

func readBackendLogEnvelope(t *testing.T, conn *websocket.Conn) testEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read backend log websocket message: %v", err)
	}

	var envelope testEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode backend log websocket envelope: %v", err)
	}
	return envelope
}

func assertNoBackendLogMessage(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()

	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("expected no backend log websocket message")
	}
}
