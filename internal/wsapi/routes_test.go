package wsapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/realtime"
)

type routeMessageEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

func TestRegisterRoutesFrontendConnectSendsIdentityAndRebroadcastsCurrentAddress(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	firstFrontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer firstFrontend.CloseNow()
	firstMessages := readNextMessages(t, firstFrontend, 2)
	firstIdentity := requireMessageType(t, firstMessages, realtime.MessageTypeFrontendIdentity)
	firstToken := decodeFrontendIdentityToken(t, firstIdentity.Content)

	secondFrontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer secondFrontend.CloseNow()
	secondMessages := readNextMessages(t, secondFrontend, 2)
	_ = requireMessageType(t, secondMessages, realtime.MessageTypeFrontendIdentity)

	rebroadcast := readNextMessage(t, firstFrontend)
	if rebroadcast.MessageType != realtime.MessageTypeAllConnections {
		t.Fatalf("expected rebroadcast inventory after second connect, got %q", rebroadcast.MessageType)
	}

	if err := firstFrontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"CurrentAddressUpdate","content":"/project#setta-ws-affinity=tab-secret"}`)); err != nil {
		t.Fatalf("write current address update: %v", err)
	}

	inventory := readUntilMessageType(t, secondFrontend, realtime.MessageTypeAllConnections, 2)
	connections := decodeConnections(t, inventory.Content)
	if len(connections) != 2 {
		t.Fatalf("expected two frontend connections in inventory, got %d", len(connections))
	}

	projectConnections := 0
	for _, connection := range connections {
		if connection.CurrentAddress == "/project" {
			projectConnections++
		}
	}
	if projectConnections != 1 {
		t.Fatalf("expected one sanitized /project connection, got %d", projectConnections)
	}

	if resolvedID, ok := hub.Registry().ResolveFrontendConnectionID(firstToken, ""); !ok || resolvedID == "" {
		t.Fatalf("expected first frontend identity token to resolve, got %q ok=%t", resolvedID, ok)
	}
}

func TestRegisterRoutesShareFrontendTouchesSessionOnConnectAndMessage(t *testing.T) {
	t.Parallel()

	store := newTestShareSessionStore("share-a")
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: store,
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer conn.CloseNow()

	message := readNextMessage(t, conn)
	if message.MessageType != realtime.MessageTypeFrontendIdentity {
		t.Fatalf("expected frontend identity in share mode, got %q", message.MessageType)
	}
	if store.touched["share-a"] != 1 {
		t.Fatalf("expected touch count 1 after connect, got %d", store.touched["share-a"])
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"CurrentAddressUpdate","content":"/share-page"}`)); err != nil {
		t.Fatalf("write current address update: %v", err)
	}

	waitForCondition(t, func() bool {
		return store.touched["share-a"] >= 2
	})
	if store.touched["share-a"] != 2 {
		t.Fatalf("expected touch count 2 after message, got %d", store.touched["share-a"])
	}
}

func TestRegisterRoutesListenerRecordsBootstrapAndCleansUpOnDisconnect(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	waitForCondition(t, func() bool {
		targets := broadcaster.Registry().BootstrapConnectionIDs("project-a", "")
		return len(targets) == 1 && targets[0] == "listener-a"
	})
	if _, ok := hub.Connection("listener-a"); !ok {
		t.Fatal("expected listener websocket connection to be registered")
	}

	conn.CloseNow()
	waitForCondition(t, func() bool {
		return len(broadcaster.Registry().BootstrapConnectionIDs("project-a", "")) == 0
	})
	if _, ok := hub.Connection("listener-a"); ok {
		t.Fatal("expected listener websocket connection to be removed after disconnect")
	}
}

func newRouteServer(t *testing.T, deps RouteDependencies) *httptest.Server {
	t.Helper()

	router := chi.NewRouter()
	if err := RegisterRoutes(router, deps); err != nil {
		t.Fatalf("register ws routes: %v", err)
	}
	return httptest.NewServer(router)
}

type dialOption func(path string) string

func withPathParam(listenerID string) dialOption {
	return func(path string) string {
		return strings.Replace(path, "{listenerID}", listenerID, 1)
	}
}

func dialRouteConnection(t *testing.T, serverURL string, path string, headers http.Header, options ...dialOption) *websocket.Conn {
	t.Helper()

	for _, option := range options {
		path = option(path)
	}
	conn, _, err := websocket.Dial(context.Background(), websocketURL(serverURL, path), &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial route websocket: %v", err)
	}
	return conn
}

func authHeaderForCookie(t *testing.T, authService *auth.Service) http.Header {
	t.Helper()

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	return http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}
}

func readNextMessages(t *testing.T, conn *websocket.Conn, count int) []routeMessageEnvelope {
	t.Helper()

	messages := make([]routeMessageEnvelope, 0, count)
	for range count {
		messages = append(messages, readNextMessage(t, conn))
	}
	return messages
}

func readNextMessage(t *testing.T, conn *websocket.Conn) routeMessageEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket message: %v", err)
	}

	var message routeMessageEnvelope
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("decode websocket message: %v", err)
	}
	return message
}

func readUntilMessageType(t *testing.T, conn *websocket.Conn, messageType string, maxReads int) routeMessageEnvelope {
	t.Helper()

	for range maxReads {
		message := readNextMessage(t, conn)
		if message.MessageType == messageType {
			return message
		}
	}
	t.Fatalf("did not receive message type %q within %d reads", messageType, maxReads)
	return routeMessageEnvelope{}
}

func requireMessageType(t *testing.T, messages []routeMessageEnvelope, messageType string) routeMessageEnvelope {
	t.Helper()

	for _, message := range messages {
		if message.MessageType == messageType {
			return message
		}
	}
	t.Fatalf("missing message type %q in %#v", messageType, messages)
	return routeMessageEnvelope{}
}

func decodeFrontendIdentityToken(t *testing.T, raw json.RawMessage) string {
	t.Helper()

	var content realtime.FrontendIdentityContent
	if err := json.Unmarshal(raw, &content); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if strings.TrimSpace(content.FrontendAffinityToken) == "" {
		t.Fatal("expected frontend affinity token")
	}
	return content.FrontendAffinityToken
}

func decodeConnections(t *testing.T, raw json.RawMessage) []realtime.Connection {
	t.Helper()

	var connections []realtime.Connection
	if err := json.Unmarshal(raw, &connections); err != nil {
		t.Fatalf("decode connections payload: %v", err)
	}
	return connections
}

func waitForCondition(t *testing.T, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition did not become true before timeout")
}
