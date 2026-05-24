package wsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/backendlogs"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"

	"github.com/coder/websocket"
)

type routeMessageEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

func TestDecodeFrontendTextMessageParsesCurrentAddressUpdate(t *testing.T) {
	t.Parallel()

	message, err := decodeFrontendTextMessage([]byte(`{"messageType":"CurrentAddressUpdate","content":"/project"}`))
	if err != nil {
		t.Fatalf("decode text frontend message: %v", err)
	}
	if message.MessageType != FrontendMessageTypeCurrentAddressUpdate {
		t.Fatalf("expected current address message type, got %q", message.MessageType)
	}
	if message.CurrentAddress == nil {
		t.Fatal("expected current address payload")
	}
	if message.CurrentAddress.Content != "/project" {
		t.Fatalf("expected /project current address, got %q", message.CurrentAddress.Content)
	}
	if message.BinaryPayload != nil {
		t.Fatalf("expected no binary payload, got %d bytes", len(message.BinaryPayload))
	}
}

func TestDecodeFrontendTextMessageParsesUISettingRevealResult(t *testing.T) {
	t.Parallel()

	message, err := decodeFrontendTextMessage([]byte(`{
		"messageType":"UISettingRevealResult",
		"content":{
			"projectConfigId":"project-a",
			"requestId":"request-1",
			"statuses":[
				{
					"settingId":"core.project.show_param_display_names",
					"status":"revealed",
					"errorCode":null,
					"errorMessage":null
				}
			]
		}
	}`))
	if err != nil {
		t.Fatalf("decode reveal result frontend message: %v", err)
	}
	if message.MessageType != realtime.MessageTypeUISettingRevealResult {
		t.Fatalf("expected reveal result message type, got %q", message.MessageType)
	}
	if message.UISettingRevealResult == nil {
		t.Fatal("expected reveal result payload")
	}
	if message.UISettingRevealResult.RequestID != "request-1" {
		t.Fatalf("expected request-1 request id, got %q", message.UISettingRevealResult.RequestID)
	}
}

func TestDecodeFrontendBinaryMessageParsesDependencyEvent(t *testing.T) {
	t.Parallel()

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeDependencyEvent",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyEvent": map[string]any{
				"dependencyKey": map[string]any{
					"type":      "Section",
					"sectionId": "section-action",
				},
				"payload": map[string]any{
					"type": "Binary",
					"payload": map[string]any{
						"contentId": "bin-1",
					},
				},
				"timestampMs": 123,
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode binary frontend message: %v", err)
	}

	message, err := decodeFrontendBinaryMessage(frame)
	if err != nil {
		t.Fatalf("decode binary frontend message: %v", err)
	}
	if message.MessageType != realtime.MessageTypeRealtimeDependencyEvent {
		t.Fatalf("expected dependency event message type, got %q", message.MessageType)
	}
	if message.RealtimeDependencyEvent == nil {
		t.Fatal("expected dependency event payload")
	}
	if message.RealtimeDependencyEvent.ProjectConfigID != "project-a" {
		t.Fatalf("expected project-a project id, got %q", message.RealtimeDependencyEvent.ProjectConfigID)
	}
	if message.RealtimeDependencyEvent.DependencyEvent.TimestampMS != 123 {
		t.Fatalf("expected timestamp 123, got %d", message.RealtimeDependencyEvent.DependencyEvent.TimestampMS)
	}
	if !bytes.Equal(message.BinaryPayload, []byte("binary-action")) {
		t.Fatalf("expected binary-action payload, got %q", string(message.BinaryPayload))
	}
}

func TestDecodeFrontendBinaryMessageRejectsNonBinaryRealtimeUIChangeValue(t *testing.T) {
	t.Parallel()

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeUIChange",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyKey": map[string]any{
				"type":      "SectionParam",
				"sectionId": "section-a",
				"codeObjId": "param-a",
			},
			"value": map[string]any{
				"type":    "Literal",
				"payload": "value-1",
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode invalid binary realtime ui change: %v", err)
	}

	_, err = decodeFrontendBinaryMessage(frame)
	if err == nil {
		t.Fatal("expected non-binary realtime ui change to fail")
	}
	if !strings.Contains(err.Error(), "Binary value") {
		t.Fatalf("expected binary value validation error, got %v", err)
	}
}

func TestDecodeFrontendBinaryMessageRejectsNonBinaryDependencyEventPayload(t *testing.T) {
	t.Parallel()

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeDependencyEvent",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyEvent": map[string]any{
				"dependencyKey": map[string]any{
					"type":      "Section",
					"sectionId": "section-action",
				},
				"payload": map[string]any{
					"type":    "Literal",
					"payload": "value-1",
				},
				"timestampMs": 123,
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode invalid binary dependency event: %v", err)
	}

	_, err = decodeFrontendBinaryMessage(frame)
	if err == nil {
		t.Fatal("expected non-binary dependency event payload to fail")
	}
	if !strings.Contains(err.Error(), "Binary payload") {
		t.Fatalf("expected binary payload validation error, got %v", err)
	}
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
	if len(connections) != 3 {
		t.Fatalf("expected two frontend connections plus the synthetic server inventory entry, got %d", len(connections))
	}

	projectConnections := 0
	serverConnections := 0
	for _, connection := range connections {
		if connection.CurrentAddress == "/project" {
			projectConnections++
		}
		if connection.Type == realtime.ConnectionTypeServer {
			serverConnections++
		}
	}
	if projectConnections != 1 {
		t.Fatalf("expected one sanitized /project connection, got %d", projectConnections)
	}
	if serverConnections != 1 {
		t.Fatalf("expected one synthetic server connection, got %d in %#v", serverConnections, connections)
	}

	if resolvedID, ok := hub.Registry().ResolveFrontendConnectionID(firstToken, ""); !ok || resolvedID == "" {
		t.Fatalf("expected first frontend identity token to resolve, got %q ok=%t", resolvedID, ok)
	}
}

func TestRegisterRoutesFrontendRejectsLauncherModeBeforeAllocatingFrontendIdentity(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeLauncher)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	var frontendIDCalls atomic.Int32
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeLauncher),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
		}),
		FrontendIDSource: func() (string, error) {
			frontendIDCalls.Add(1)
			return "frontend-launcher", nil
		},
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer conn.CloseNow()

	readCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _, err := conn.Read(readCtx)
	if status := websocket.CloseStatus(err); status != CloseCodeForbidden {
		t.Fatalf("expected forbidden close code %d, got %d", CloseCodeForbidden, status)
	}
	if frontendIDCalls.Load() != 0 {
		t.Fatalf("expected launcher-mode frontend route to reject before frontend id allocation, got %d calls", frontendIDCalls.Load())
	}
	if connections := hub.Connections(realtime.Selection{}); len(connections) != 0 {
		t.Fatalf("expected launcher-mode frontend route to avoid hub registration, got %#v", connections)
	}
}

func TestRegisterRoutesListenerRejectsLauncherModeBeforeBootstrapRegistration(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeLauncher)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeLauncher),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
		}),
	})
	defer server.Close()

	conn := dialRouteConnection(
		t,
		server.URL,
		RouteListenerByID+"?projectId=project-a",
		authHeaderForCookie(t, authService),
		withPathParam("listener-a"),
	)
	defer conn.CloseNow()

	readCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _, err := conn.Read(readCtx)
	if status := websocket.CloseStatus(err); status != CloseCodeForbidden {
		t.Fatalf("expected forbidden close code %d, got %d", CloseCodeForbidden, status)
	}
	if _, ok := broadcaster.Registry().Bootstrap("listener-a"); ok {
		t.Fatal("expected launcher-mode listener route to reject before bootstrap registration")
	}
	if _, ok := broadcaster.Registry().Registration("listener-a"); ok {
		t.Fatal("expected launcher-mode listener route to reject before listener registration")
	}
	if connections := hub.Connections(realtime.Selection{}); len(connections) != 0 {
		t.Fatalf("expected launcher-mode listener route to avoid hub registration, got %#v", connections)
	}
}

func TestRegisterRoutesTerminalRejectsLauncherModeBeforeOpeningSession(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeLauncher)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	terminalService := newRouteTerminalService(t)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeLauncher),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
		}),
		Terminals: terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(
		t,
		server.URL,
		RouteTerminalBySection,
		authHeaderForCookie(t, authService),
		withTerminalPath("project-a", "section-a"),
	)
	defer conn.CloseNow()

	readCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _, err := conn.Read(readCtx)
	if status := websocket.CloseStatus(err); status != CloseCodeForbidden {
		t.Fatalf("expected forbidden close code %d, got %d", CloseCodeForbidden, status)
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected launcher-mode terminal route to reject before terminal session open")
	}
}

func TestRegisterRoutesFrontendConnectAllowsConfiguredDevFrontendOrigin(t *testing.T) {
	t.Setenv("SETTA_DEV_FRONTEND_PORT", "3000")
	t.Setenv("SETTA_DEV_FRONTEND_SCHEME", "http")

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

	headers := authHeaderForCookie(t, authService)
	headers.Set("Origin", "http://127.0.0.1:3000")
	conn := dialRouteConnection(t, server.URL, RouteFrontend, headers)
	defer conn.CloseNow()

	message := readUntilMessageType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	if message.MessageType != realtime.MessageTypeFrontendIdentity {
		t.Fatalf("expected frontend identity for configured dev frontend origin, got %q", message.MessageType)
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

func TestRegisterRoutesFrontendRealtimeUIChangeBroadcastsToMatchingListener(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster:  broadcaster,
			ProjectState: projectRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	ack := readNextMessage(t, listener)
	assertListenerRegisterAck(t, ack, "project-a", "")

	nonMatchingListener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-b"))
	defer nonMatchingListener.CloseNow()
	if err := nonMatchingListener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-b.param-b"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write non-matching listener register message: %v", err)
	}
	nonMatchingAck := readNextMessage(t, nonMatchingListener)
	assertListenerRegisterAck(t, nonMatchingAck, "project-a", "")

	if err := frontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"RealtimeUIChange","content":{"projectConfigId":"project-a","dependencyKey":{"type":"SectionParam","sectionId":"section-a","codeObjId":"param-a"},"value":{"type":"Literal","payload":"value-1"}}}`)); err != nil {
		t.Fatalf("write realtime UI change: %v", err)
	}

	realtimeEvent := readNextMessage(t, listener)
	assertRouteListenerRealtimeEvent(t, realtimeEvent, "project-a", "", 1, "section-a.param-a", `{"type":"Literal","payload":"value-1"}`)

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err := nonMatchingListener.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected no realtime event for non-matching listener, got %v", err)
	}
}

func TestRegisterRoutesFrontendResolvesUISettingRevealResult(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	revealResults := realtime.NewUISettingRevealResultHub()
	if err := revealResults.RegisterRequest("request-1", realtime.RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID:     "frontend-test",
		ExpectedProjectConfigID: "project-a",
		ExpectedSettingIDs:      []string{"core.project.show_param_display_names"},
	}); err != nil {
		t.Fatalf("register reveal request: %v", err)
	}
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:           hub,
		UISettingRevealResults: revealResults,
		ListenerBroadcaster:    broadcaster,
		FrontendIDSource: func() (string, error) {
			return "frontend-test", nil
		},
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer conn.CloseNow()
	_ = readNextMessages(t, conn, 2)

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{
		"messageType":"UISettingRevealResult",
		"content":{
			"projectConfigId":"project-a",
			"requestId":"request-1",
			"statuses":[
				{
					"settingId":"core.project.show_param_display_names",
					"status":"revealed",
					"errorCode":null,
					"errorMessage":null
				}
			]
		}
	}`)); err != nil {
		t.Fatalf("write reveal result: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result, err := revealResults.Wait(ctx, "request-1")
	if err != nil {
		t.Fatalf("wait for reveal result: %v", err)
	}
	if result.RequestID != "request-1" {
		t.Fatalf("expected request-1 request id, got %q", result.RequestID)
	}
}

func TestRegisterRoutesFrontendDisconnectCancelsUISettingRevealRequests(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	revealResults := realtime.NewUISettingRevealResultHub()
	if err := revealResults.RegisterRequest("request-1", realtime.RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID: "frontend-test",
	}); err != nil {
		t.Fatalf("register reveal request: %v", err)
	}
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:           hub,
		UISettingRevealResults: revealResults,
		ListenerBroadcaster:    broadcaster,
		FrontendIDSource: func() (string, error) {
			return "frontend-test", nil
		},
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	_ = readNextMessages(t, conn, 2)
	conn.CloseNow()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := revealResults.Wait(ctx, "request-1")
	if err == nil {
		t.Fatal("expected disconnect to cancel pending reveal request")
	}
	var disconnected *realtime.RevealResultTransportDisconnectedError
	if !errors.As(err, &disconnected) {
		t.Fatalf("expected RevealResultTransportDisconnectedError, got %T", err)
	}
}

func TestRegisterRoutesFrontendRealtimeUIChangeClosesOnUnknownProject(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster:  broadcaster,
			ProjectState: projectRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	if err := frontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"RealtimeUIChange","content":{"projectConfigId":"missing-project","dependencyKey":{"type":"Section","sectionId":"section-a"},"value":{"type":"Literal","payload":"value-1"}}}`)); err != nil {
		t.Fatalf("write realtime UI change: %v", err)
	}

	_, _, err := frontend.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeNotFound {
		t.Fatalf("expected not found close code %d, got %d", CloseCodeNotFound, status)
	}
}

func TestRegisterRoutesFrontendClosesOnInvalidBinaryRealtimeUIChangeValue(t *testing.T) {
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
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeUIChange",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyKey": map[string]any{
				"type":      "SectionParam",
				"sectionId": "section-a",
				"codeObjId": "param-a",
			},
			"value": map[string]any{
				"type":    "Literal",
				"payload": "value-1",
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode invalid binary realtime ui change: %v", err)
	}

	if err := frontend.Write(context.Background(), websocket.MessageBinary, frame); err != nil {
		t.Fatalf("write invalid binary realtime ui change: %v", err)
	}

	_, _, err = frontend.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeBadRequest {
		t.Fatalf("expected bad-request close code %d, got %d", CloseCodeBadRequest, status)
	}
}

func TestRegisterRoutesFrontendClosesOnInvalidBinaryDependencyEventPayload(t *testing.T) {
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
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeDependencyEvent",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyEvent": map[string]any{
				"dependencyKey": map[string]any{
					"type":      "Section",
					"sectionId": "section-action",
				},
				"payload": map[string]any{
					"type":    "Literal",
					"payload": "value-1",
				},
				"timestampMs": 123,
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode invalid binary dependency event: %v", err)
	}

	if err := frontend.Write(context.Background(), websocket.MessageBinary, frame); err != nil {
		t.Fatalf("write invalid binary dependency event: %v", err)
	}

	_, _, err = frontend.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeBadRequest {
		t.Fatalf("expected bad-request close code %d, got %d", CloseCodeBadRequest, status)
	}
}

func TestRegisterRoutesFrontendBinaryRealtimeUIChangeBroadcastsBinaryFrame(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	drawSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Draw", "canvas")
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster:  broadcaster,
			ProjectState: projectRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["`+drawSectionID+`"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	ack := readNextMessage(t, listener)
	assertListenerRegisterAck(t, ack, "project-a", "")

	binaryPayload := []byte("binary-draw-snapshot")
	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeUIChange",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyKey": map[string]any{
				"type":      "Section",
				"sectionId": drawSectionID,
			},
			"value": map[string]any{
				"type": "Binary",
				"payload": map[string]any{
					"contentId":  "bin-1",
					"byteLength": len(binaryPayload),
					"mimeType":   "image/png",
				},
			},
		},
	}, binaryPayload)
	if err != nil {
		t.Fatalf("encode frontend binary realtime ui change: %v", err)
	}
	if err := frontend.Write(context.Background(), websocket.MessageBinary, frame); err != nil {
		t.Fatalf("write binary realtime ui change: %v", err)
	}

	messageType, payload := readNextFrame(t, listener)
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary listener frame, got %d", messageType)
	}
	header, forwardedPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode listener binary frame: %v", err)
	}
	var envelope routeMessageEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode listener binary header: %v", err)
	}
	assertRouteListenerRealtimeEvent(t, envelope, "project-a", "", 1, drawSectionID, `{"type":"Binary","payload":{"contentId":"bin-1","byteLength":20,"mimeType":"image/png"}}`)
	if string(forwardedPayload) != string(binaryPayload) {
		t.Fatalf("expected binary realtime payload %q, got %q", string(binaryPayload), string(forwardedPayload))
	}

	content := decodeRouteListenerRealtimeContent(t, envelope)
	if content.DependencyValues == nil {
		t.Fatal("expected authoritative dependency values on binary realtime event")
	}
	byKey := map[string]string{}
	for _, entry := range content.DependencyValues.Entries {
		byKey[entry.DependencyKey] = entry.RenderedValue
	}
	if got := byKey[drawSectionID]; got != `b'binary-draw-snapshot'` {
		t.Fatalf("expected rendered binary dependency value %q, got %q", `b'binary-draw-snapshot'`, got)
	}
}

func TestRegisterRoutesFrontendBinaryDependencyEventBroadcastsBinaryFrame(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster:  broadcaster,
			ProjectState: projectRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-action"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	ack := readNextMessage(t, listener)
	assertListenerRegisterAck(t, ack, "project-a", "")

	frame, err := realtime.EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeDependencyEvent",
		"content": map[string]any{
			"projectConfigId": "project-a",
			"dependencyEvent": map[string]any{
				"dependencyKey": map[string]any{
					"type":      "Section",
					"sectionId": "section-action",
				},
				"payload": map[string]any{
					"type": "Binary",
					"payload": map[string]any{
						"contentId": "bin-1",
					},
				},
				"timestampMs": 123,
			},
		},
	}, []byte("binary-action"))
	if err != nil {
		t.Fatalf("encode frontend binary dependency event: %v", err)
	}
	if err := frontend.Write(context.Background(), websocket.MessageBinary, frame); err != nil {
		t.Fatalf("write binary dependency event: %v", err)
	}

	messageType, payload := readNextFrame(t, listener)
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary listener frame, got %d", messageType)
	}
	header, binaryPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode listener binary frame: %v", err)
	}
	var envelope routeMessageEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode listener binary header: %v", err)
	}
	assertRouteListenerDependencyEvent(t, envelope, "project-a", "", 1, "section-action", `{"type":"Binary","payload":{"contentId":"bin-1"}}`)
	if string(binaryPayload) != "binary-action" {
		t.Fatalf("expected binary-action payload, got %q", string(binaryPayload))
	}
}

func TestRegisterRoutesFrontendDependencyEventBroadcastsOnlyToMatchingListener(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster:  broadcaster,
			ProjectState: projectRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	matchingListener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer matchingListener.CloseNow()
	if err := matchingListener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-action"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write matching listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, matchingListener), "project-a", "")

	nonMatchingListener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-b"))
	defer nonMatchingListener.CloseNow()
	if err := nonMatchingListener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-other"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write non-matching listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, nonMatchingListener), "project-a", "")

	if err := frontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"RealtimeDependencyEvent","content":{"projectConfigId":"project-a","dependencyEvent":{"dependencyKey":{"type":"Section","sectionId":"section-action"},"payload":{"type":"Literal","payload":"clicked"},"timestampMs":123}}}`)); err != nil {
		t.Fatalf("write dependency event: %v", err)
	}

	dependencyEvent := readNextMessage(t, matchingListener)
	assertRouteListenerDependencyEvent(t, dependencyEvent, "project-a", "", 1, "section-action", `{"type":"Literal","payload":"clicked"}`)

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err := nonMatchingListener.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected no dependency event for non-matching listener, got %v", err)
	}
}

func TestRegisterRoutesShareFrontendDependencyEventScopesToSession(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: deploymentRuntime,
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
			Deployment:  deploymentRuntime,
		}),
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer frontend.CloseNow()
	_ = readNextMessage(t, frontend)

	listenerA := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listenerA.CloseNow()
	if err := listenerA.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-action"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message share-a: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listenerA), "project-a", "share-a")

	listenerB := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-b", nil, withPathParam("listener-b"))
	defer listenerB.CloseNow()
	if err := listenerB.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-action"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message share-b: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listenerB), "project-a", "share-b")

	if err := frontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"RealtimeDependencyEvent","content":{"projectConfigId":"project-a","dependencyEvent":{"dependencyKey":{"type":"Section","sectionId":"section-action"},"payload":{"type":"Literal","payload":"clicked"},"timestampMs":123}}}`)); err != nil {
		t.Fatalf("write share dependency event: %v", err)
	}

	dependencyEvent := readNextMessage(t, listenerA)
	assertRouteListenerDependencyEvent(t, dependencyEvent, "project-a", "share-a", 1, "section-action", `{"type":"Literal","payload":"clicked"}`)

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err := listenerB.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected no message for share-b listener, got %v", err)
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

func TestRegisterRoutesListenerRegisterBroadcastsCoverageSnapshotToFrontendAndClearsOnDisconnect(t *testing.T) {
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

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")
	assertRouteListenerCoverageSnapshot(
		t,
		readUntilMessageType(t, frontend, realtime.MessageTypeListenerCoverageSnapshot, 2),
		"project-a",
		false,
		[]realtime.ListenerCoverageDependency{
			{Type: realtime.DependencyKeyTypeSectionParam, SectionID: "section-a", CodeObjID: "param-a"},
		},
	)

	listener.CloseNow()
	assertRouteListenerCoverageSnapshot(
		t,
		readUntilMessageType(t, frontend, realtime.MessageTypeListenerCoverageSnapshot, 2),
		"project-a",
		false,
		nil,
	)
}

func TestRegisterRoutesShareListenerCoverageBroadcastsOnlyToMatchingSessionFrontend(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: deploymentRuntime,
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	frontendA := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer frontendA.CloseNow()
	_ = readNextMessage(t, frontendA)

	frontendB := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-b", nil)
	defer frontendB.CloseNow()
	_ = readNextMessage(t, frontendB)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write share listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")
	assertRouteListenerCoverageSnapshot(
		t,
		readUntilMessageType(t, frontendA, realtime.MessageTypeListenerCoverageSnapshot, 2),
		"project-a",
		true,
		nil,
	)
	assertNoRouteEnvelopeOfType(t, frontendB, realtime.MessageTypeListenerCoverageSnapshot, 300*time.Millisecond)
}

func TestRegisterRoutesBackendLogsBroadcastOnlyToMatchingSessionFrontend(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: deploymentRuntime,
		},
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	frontendA := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer frontendA.CloseNow()
	_ = readUntilMessageType(t, frontendA, realtime.MessageTypeFrontendIdentity, 2)

	frontendB := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-b", nil)
	defer frontendB.CloseNow()
	_ = readUntilMessageType(t, frontendB, realtime.MessageTypeFrontendIdentity, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write share listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")

	logService, err := backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       observability.NewLogger(0, io.Discard),
		WebsocketHub: hub,
		IDGenerator: func() string {
			return "backend-log-id"
		},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 20, 15, 4, 5, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}

	if err := logService.LogAndBroadcast(context.Background(), backendlogs.LogRequest{
		Message:        "Started command",
		Severity:       backendlogs.SeverityInfo,
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
	}); err != nil {
		t.Fatalf("broadcast backend log event: %v", err)
	}

	envelope := readUntilMessageType(t, frontendA, string(realtime.WebsocketMessageTypeBackendLogEvent), 2)

	var event backendlogs.BackendLogEvent
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.ID != "backend-log-id" {
		t.Fatalf("expected backend log id backend-log-id, got %q", event.ID)
	}
	if event.ProjectID == nil || *event.ProjectID != "project-a" {
		t.Fatalf("expected project-a backend log event, got %#v", event.ProjectID)
	}
	if event.Severity != backendlogs.SeverityInfo {
		t.Fatalf("expected info backend log severity, got %q", event.Severity)
	}
	if event.Message != "Started command" {
		t.Fatalf("expected Started command backend log message, got %q", event.Message)
	}
	if event.Timestamp != "2026-03-20T15:04:05Z" {
		t.Fatalf("expected fixed backend log timestamp, got %q", event.Timestamp)
	}

	assertNoRouteEnvelopeOfType(t, frontendB, string(realtime.WebsocketMessageTypeBackendLogEvent), 300*time.Millisecond)
	assertNoRouteEnvelopeOfType(t, listener, string(realtime.WebsocketMessageTypeBackendLogEvent), 300*time.Millisecond)
}

func TestRegisterRoutesListenerInitBootstrapsProjectByIDAndSendsForceRefresh(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-default",
		Projects: map[string]projectstate.Project{
			"project-default": {
				ID:   "project-default",
				Name: "Default Project",
			},
			"project-target": {
				ID:   "project-target",
				Name: "Target Project",
			},
		},
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-target"}}`)); err != nil {
		t.Fatalf("write listener init by id: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-target", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-target"))
}

func TestRegisterRoutesListenerInitAcceptsTemporaryProjectIDAndTranslatesForceRefresh(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	temporaryIDs := newRouteTemporaryIDs(t)
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
		TemporaryIDs: temporaryIDs,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	sectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
	temporaryProjectID, err := temporaryIDs.EnsureTemporaryID("project-a")
	if err != nil {
		t.Fatalf("ensure temporary project id: %v", err)
	}
	temporarySectionID, err := temporaryIDs.EnsureTemporaryID(sectionID)
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		TemporaryIDs:        temporaryIDs,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-temp"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"`+temporaryProjectID+`","useTemporaryIds":true}}`)); err != nil {
		t.Fatalf("write temporary listener init: %v", err)
	}

	forceRefresh := decodeRouteListenerForceRefreshContent(t, readNextMessage(t, conn))
	if forceRefresh.Snapshot.ProjectConfigID != temporaryProjectID {
		t.Fatalf("expected temporary project id %q, got %q", temporaryProjectID, forceRefresh.Snapshot.ProjectConfigID)
	}
	foundCatalogEntry := false
	for _, entry := range forceRefresh.Snapshot.DependencyCatalog.Entries {
		if entry.DependencyKey != temporarySectionID {
			continue
		}
		foundCatalogEntry = true
		break
	}
	if !foundCatalogEntry {
		t.Fatalf("expected temporary dependency catalog entry for %q, got %#v", temporarySectionID, forceRefresh.Snapshot.DependencyCatalog.Entries)
	}
	foundRenderedValue := false
	for _, entry := range forceRefresh.Snapshot.DependencyValues.Entries {
		if entry.DependencyKey != temporarySectionID {
			continue
		}
		foundRenderedValue = true
		break
	}
	if !foundRenderedValue {
		t.Fatalf("expected temporary dependency value entry for %q, got %#v", temporarySectionID, forceRefresh.Snapshot.DependencyValues.Entries)
	}
}
