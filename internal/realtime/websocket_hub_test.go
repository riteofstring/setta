package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type hubMessageEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

type hubNotificationContent struct {
	Message string `json:"message"`
}

type hubNotificationMessage struct {
	MessageType string                 `json:"messageType"`
	Content     hubNotificationContent `json:"content"`
}

func TestWebsocketHubBroadcastJSONFiltersTargetsBySessionAndType(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	frontendB := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-b",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-b",
		"broadcast": "false",
	})
	defer frontendB.CloseNow()
	waitForHubConnection(t, hub, "frontend-b")

	listenerA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "listener-a",
		"type":      string(ConnectionTypeListener),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer listenerA.CloseNow()
	waitForHubConnection(t, hub, "listener-a")

	delivered, err := hub.BroadcastJSON(context.Background(), hubNotificationMessage{
		MessageType: "Notification",
		Content: hubNotificationContent{
			Message: "Hello share",
		},
	}, Selection{
		Type:           ConnectionTypeFrontend,
		ShareSessionID: "session-a",
	})
	if err != nil {
		t.Fatalf("broadcast notification: %v", err)
	}
	if delivered != 1 {
		t.Fatalf("expected one delivered notification, got %d", delivered)
	}

	messageA := readEnvelope(t, frontendA)
	if messageA.MessageType != "Notification" {
		t.Fatalf("expected notification message type, got %q", messageA.MessageType)
	}

	var notification hubNotificationContent
	if err := json.Unmarshal(messageA.Content, &notification); err != nil {
		t.Fatalf("decode notification content: %v", err)
	}
	if notification.Message != "Hello share" {
		t.Fatalf("expected notification message Hello share, got %q", notification.Message)
	}
}

func TestWebsocketHubBroadcastConnectionsIncludesSessionIDsAndRedactedAddress(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	frontendB := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-b",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-b",
		"broadcast": "false",
	})
	defer frontendB.CloseNow()
	waitForHubConnection(t, hub, "frontend-b")

	if err := hub.UpdateCurrentAddress(
		context.Background(),
		"frontend-a",
		"/project#setta-ws-affinity=tab-secret",
		false,
	); err != nil {
		t.Fatalf("update current address: %v", err)
	}

	delivered, err := hub.BroadcastConnections(context.Background())
	if err != nil {
		t.Fatalf("broadcast connections: %v", err)
	}
	if delivered != 2 {
		t.Fatalf("expected two delivered connection broadcasts, got %d", delivered)
	}

	inventoryEnvelope := readEnvelope(t, frontendA)
	if inventoryEnvelope.MessageType != MessageTypeAllConnections {
		t.Fatalf("expected connection inventory message type, got %q", inventoryEnvelope.MessageType)
	}

	var connections []Connection
	if err := json.Unmarshal(inventoryEnvelope.Content, &connections); err != nil {
		t.Fatalf("decode connection inventory: %v", err)
	}
	if len(connections) != 3 {
		t.Fatalf("expected two frontend connections plus the synthetic server inventory entry, got %d", len(connections))
	}

	byID := make(map[string]Connection, len(connections))
	for _, connection := range connections {
		byID[connection.ID] = connection
	}

	if byID["frontend-a"].ShareSessionID != "session-a" {
		t.Fatalf("expected frontend-a session id session-a, got %q", byID["frontend-a"].ShareSessionID)
	}
	if byID["frontend-b"].ShareSessionID != "session-b" {
		t.Fatalf("expected frontend-b session id session-b, got %q", byID["frontend-b"].ShareSessionID)
	}
	if byID["frontend-a"].CurrentAddress != "/project" {
		t.Fatalf("expected sanitized current address /project, got %q", byID["frontend-a"].CurrentAddress)
	}
	if byID["main"].Type != ConnectionTypeServer {
		t.Fatalf("expected synthetic server inventory entry, got %#v", byID["main"])
	}
}

func TestWebsocketHubSendFrontendIdentityPublishesServerOwnedAffinityToken(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	if err := hub.SendFrontendIdentity(context.Background(), "frontend-a"); err != nil {
		t.Fatalf("send frontend identity: %v", err)
	}

	envelope := readEnvelope(t, frontendA)
	if envelope.MessageType != MessageTypeFrontendIdentity {
		t.Fatalf("expected frontend identity message type, got %q", envelope.MessageType)
	}

	var identity FrontendIdentityContent
	if err := json.Unmarshal(envelope.Content, &identity); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if identity.FrontendAffinityToken == "" {
		t.Fatal("expected frontend affinity token")
	}
	if identity.FrontendAffinityToken == "frontend-a" {
		t.Fatalf("expected server-owned affinity token, got connection id %q", identity.FrontendAffinityToken)
	}
	if resolvedID, ok := hub.Registry().ResolveFrontendConnectionID(identity.FrontendAffinityToken, "session-a"); !ok || resolvedID != "frontend-a" {
		t.Fatalf("expected affinity token to resolve to frontend-a, got %q ok=%t", resolvedID, ok)
	}
}

func TestWebsocketHubConnectCanSkipAndEnableConnectionBroadcasts(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	frontendB := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-b",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-b",
		"broadcast": "false",
	})
	defer frontendB.CloseNow()
	waitForHubConnection(t, hub, "frontend-b")

	frontendC := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-c",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-c",
		"broadcast": "true",
	})
	defer frontendC.CloseNow()
	waitForHubConnection(t, hub, "frontend-c")

	for _, conn := range []*websocket.Conn{frontendA, frontendB, frontendC} {
		envelope := readEnvelope(t, conn)
		if envelope.MessageType != MessageTypeAllConnections {
			t.Fatalf("expected connection inventory message type, got %q", envelope.MessageType)
		}
		var connections []Connection
		if err := json.Unmarshal(envelope.Content, &connections); err != nil {
			t.Fatalf("decode connection inventory: %v", err)
		}
		if len(connections) != 4 {
			t.Fatalf("expected three frontend connections plus the synthetic server inventory entry, got %d", len(connections))
		}
	}
}

func TestWebsocketHubDisconnectBroadcastsUpdatedInventory(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server := newWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	frontendB := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-b",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-b",
		"broadcast": "false",
	})
	defer frontendB.CloseNow()
	waitForHubConnection(t, hub, "frontend-b")

	if removed := hub.Disconnect(context.Background(), "frontend-b", true); !removed {
		t.Fatal("expected disconnect to remove frontend-b")
	}

	envelope := readEnvelope(t, frontendA)
	if envelope.MessageType != MessageTypeAllConnections {
		t.Fatalf("expected connection inventory message type, got %q", envelope.MessageType)
	}

	var connections []Connection
	if err := json.Unmarshal(envelope.Content, &connections); err != nil {
		t.Fatalf("decode connection inventory: %v", err)
	}
	if len(connections) != 2 {
		t.Fatalf("expected one frontend plus the synthetic server inventory entry after disconnect, got %#v", connections)
	}
	if connections[0].ID != "frontend-a" || connections[1].ID != "main" || connections[1].Type != ConnectionTypeServer {
		t.Fatalf("expected frontend-a and synthetic server after disconnect, got %#v", connections)
	}
}

func TestWebsocketHubSendJSONReturnsFalseAndCleansClosedConnection(t *testing.T) {
	t.Parallel()

	hub := NewWebsocketHub(WebsocketHubOptions{})
	server, holdConnection := newHeldWebsocketHubTestServer(t, hub)
	defer server.Close()

	frontendA := dialWebsocketHubClient(t, server.URL, map[string]string{
		"id":        "frontend-a",
		"type":      string(ConnectionTypeFrontend),
		"session":   "session-a",
		"broadcast": "false",
	})
	defer frontendA.CloseNow()
	waitForHubConnection(t, hub, "frontend-a")

	liveConnection, ok := hub.liveConnection("frontend-a")
	if !ok {
		t.Fatal("expected live websocket connection for frontend-a")
	}
	liveConnection.conn.CloseNow()

	delivered, err := hub.SendJSON(context.Background(), hubNotificationMessage{
		MessageType: "Notification",
		Content: hubNotificationContent{
			Message: "after-close",
		},
	}, "frontend-a")
	if err != nil {
		t.Fatalf("send notification after close: %v", err)
	}
	if delivered {
		t.Fatal("expected delivery to fail after the websocket closed")
	}
	if _, ok := hub.Connection("frontend-a"); ok {
		t.Fatal("expected closed connection to be removed from the hub")
	}

	close(holdConnection)
}

func newWebsocketHubTestServer(t *testing.T, hub *WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		params := connectParamsFromRequest(r)
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

func newHeldWebsocketHubTestServer(t *testing.T, hub *WebsocketHub) (*httptest.Server, chan struct{}) {
	t.Helper()

	holdConnection := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		params := connectParamsFromRequest(r)
		connection, err := hub.Connect(r.Context(), conn, params)
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, err.Error())
			return
		}
		defer hub.Disconnect(context.Background(), connection.ID, false)

		<-holdConnection
	})
	return httptest.NewServer(mux), holdConnection
}

func connectParamsFromRequest(r *http.Request) ConnectParams {
	query := r.URL.Query()
	return ConnectParams{
		ID:                   query.Get("id"),
		Type:                 ConnectionType(query.Get("type")),
		ShareSessionID:       query.Get("session"),
		BroadcastConnections: query.Get("broadcast") != "false",
	}
}

func dialWebsocketHubClient(t *testing.T, serverURL string, query map[string]string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws"
	values := url.Values{}
	for key, value := range query {
		values.Set(key, value)
	}
	if encoded := values.Encode(); encoded != "" {
		wsURL += "?" + encoded
	}

	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket hub client: %v", err)
	}
	return conn
}

func waitForHubConnection(t *testing.T, hub *WebsocketHub, connectionID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(connectionID); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for hub connection %q", connectionID)
}

func readEnvelope(t *testing.T, conn *websocket.Conn) hubMessageEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket message: %v", err)
	}

	var envelope hubMessageEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode websocket envelope: %v", err)
	}
	return envelope
}
