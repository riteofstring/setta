package wsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"
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
	if message.RealtimeDependencyEvent.ProjectID != "project-a" {
		t.Fatalf("expected project-a project id, got %q", message.RealtimeDependencyEvent.ProjectID)
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

	if err := frontend.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"RealtimeUIChange","content":{"projectConfigId":"project-a","dependencyKey":{"type":"SectionParam","sectionId":"section-a","codeObjId":"param-a"},"value":{"type":"Literal","payload":"value-1"}}}`)); err != nil {
		t.Fatalf("write realtime UI change: %v", err)
	}

	realtimeEvent := readNextMessage(t, listener)
	assertRouteListenerRealtimeEvent(t, realtimeEvent, "project-a", "", 1, `{"type":"Literal","payload":"value-1"}`)
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
	assertRouteListenerDependencyEvent(t, envelope, "project-a", "", 1, `{"type":"Binary","payload":{"contentId":"bin-1"}}`)
	if string(binaryPayload) != "binary-action" {
		t.Fatalf("expected binary-action payload, got %q", string(binaryPayload))
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
	assertRouteListenerDependencyEvent(t, dependencyEvent, "project-a", "share-a", 1, `{"type":"Literal","payload":"clicked"}`)

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

func TestRegisterRoutesListenerRegistersCallbacksAndReceivesRealtimeMessages(t *testing.T) {
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
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a","section-action"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}

	ack := readNextMessage(t, conn)
	assertListenerRegisterAck(t, ack, "project-a", "")

	sequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), realtime.EmitRealtimeDeltasParams{
		ProjectID: "project-a",
		Deltas: []realtime.ListenerRealtimeDelta{
			{
				Dependency: "section-a.param-a",
				Value:      json.RawMessage(`"value-1"`),
			},
		},
	})
	if err != nil {
		t.Fatalf("emit realtime deltas: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected realtime delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	realtimeEvent := readNextMessage(t, conn)
	assertRouteListenerRealtimeEvent(t, realtimeEvent, "project-a", "", 1, `"value-1"`)

	sequence, delivered, err = broadcaster.EmitDependencyEvents(context.Background(), realtime.EmitDependencyEventsParams{
		ProjectID: "project-a",
		DependencyEvents: []realtime.ListenerDependencyEvent{
			{
				DependencyKey: "section-action",
				Payload:       json.RawMessage(`{"clicked":true}`),
				TimestampMS:   456,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit dependency events: %v", err)
	}
	if sequence != 2 || delivered != 1 {
		t.Fatalf("expected dependency event delivery (sequence=2 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	dependencyEvent := readNextMessage(t, conn)
	assertRouteListenerDependencyEvent(t, dependencyEvent, "project-a", "", 2, `{"clicked":true}`)
}

func TestRegisterRoutesListenerClosesOnInvalidRegistration(t *testing.T) {
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
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"unsupported"}}}}`)); err != nil {
		t.Fatalf("write invalid listener register message: %v", err)
	}

	_, _, err := conn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeBadRequest {
		t.Fatalf("expected bad-request close code %d, got %d", CloseCodeBadRequest, status)
	}
}

func TestRegisterRoutesTerminalConnectSendsReadyHistoryAndStreamsInput(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	authService := newTestAuthService(t, config.ModeIDE)
	terminalService := newRouteTerminalService(t)
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    readyQuietCatCommand(t, "history line"),
	})
	seedRouteTerminalHistory(t, terminalService, terminals.BuildTerminalID("section-a", ""), "history line")

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
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection, authHeaderForCookie(t, authService), withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	ready := readNextRawFrame(t, conn)
	if ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}
	history := readNextRawFrame(t, conn)
	if !strings.Contains(history, "history line") {
		t.Fatalf("expected terminal history replay, got %q", history)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte("route line\n")); err != nil {
		t.Fatalf("write terminal input: %v", err)
	}
	output := readUntilRawFrameContains(t, conn, "route line", 4)
	if !strings.Contains(output, "route line") {
		t.Fatalf("expected terminal output to include route input, got %q", output)
	}
}

func TestRegisterRoutesTerminalReconnectReplaysBufferedHistoryAfterDisconnect(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	authService := newTestAuthService(t, config.ModeIDE)
	terminalService := newRouteTerminalService(t)
	terminalID := terminals.BuildTerminalID("section-a", "")
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:         terminalID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    readyQuietCatCommand(t, "initial history"),
	})
	seedRouteTerminalHistory(t, terminalService, terminalID, "initial history")

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
		Terminals:           terminalService,
	})
	defer server.Close()

	// Go no longer waits for prompt readiness during websocket connect. The
	// equivalent lifecycle regression is that a disconnected terminal route can
	// later reattach and replay buffered output written while no websocket is
	// attached.
	first := dialRouteConnection(t, server.URL, RouteTerminalBySection, authHeaderForCookie(t, authService), withTerminalPath("project-a", "section-a"))
	if ready := readNextRawFrame(t, first); ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}
	firstHistory := readNextRawFrame(t, first)
	if !strings.Contains(firstHistory, "initial history") {
		t.Fatalf("expected initial terminal history replay, got %q", firstHistory)
	}
	if err := first.Close(websocket.StatusNormalClosure, ""); err != nil {
		t.Fatalf("close first terminal websocket: %v", err)
	}

	if err := terminalService.Write(terminalID, []byte("after disconnect\n")); err != nil {
		t.Fatalf("write buffered terminal output after disconnect: %v", err)
	}
	waitForCondition(t, func() bool {
		history, err := terminalService.History(terminalID)
		if err != nil {
			return false
		}
		return strings.Contains(history, "after disconnect")
	})

	second := dialRouteConnection(t, server.URL, RouteTerminalBySection, authHeaderForCookie(t, authService), withTerminalPath("project-a", "section-a"))
	defer second.CloseNow()

	if ready := readNextRawFrame(t, second); ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker on reconnect, got %q", ready)
	}
	replayedHistory := readNextRawFrame(t, second)
	if !strings.Contains(replayedHistory, "initial history") || !strings.Contains(replayedHistory, "after disconnect") {
		t.Fatalf("expected reattached history replay to include buffered disconnected output, got %q", replayedHistory)
	}

	if err := second.Write(context.Background(), websocket.MessageText, []byte("reattached line\n")); err != nil {
		t.Fatalf("write terminal input after reconnect: %v", err)
	}
	output := readUntilRawFrameContains(t, second, "reattached line", 4)
	if !strings.Contains(output, "reattached line") {
		t.Fatalf("expected terminal output after reconnect, got %q", output)
	}
}

func TestRegisterRoutesTerminalResizeMessageResizesPTY(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	authService := newTestAuthService(t, config.ModeIDE)
	terminalService := newRouteTerminalService(t)
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    resizeProbeCommand(t),
	})
	seedRouteTerminalHistory(t, terminalService, terminals.BuildTerminalID("section-a", ""), "ready")

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
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection, authHeaderForCookie(t, authService), withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	_ = readNextRawFrame(t, conn)
	_ = readNextRawFrame(t, conn)

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":24,"cols":80}`)); err != nil {
		t.Fatalf("write terminal resize message: %v", err)
	}
	if err := conn.Write(context.Background(), websocket.MessageText, []byte("size\n")); err != nil {
		t.Fatalf("write terminal probe input: %v", err)
	}

	output := readUntilRawFrameContains(t, conn, "24 80", 6)
	if !strings.Contains(output, "24 80") {
		t.Fatalf("expected resized PTY output, got %q", output)
	}

	// The resize route path must update the stored session dimensions, not only
	// the PTY-visible size reported by the shell probe.
	info, ok := terminalService.Session(terminals.BuildTerminalID("section-a", ""))
	if !ok {
		t.Fatal("expected terminal session to still exist after resize")
	}
	if info.Rows != 24 || info.Columns != 80 {
		t.Fatalf("expected stored route terminal size 80x24, got %dx%d", info.Columns, info.Rows)
	}
}

func TestRegisterRoutesTerminalClosesOnInvalidResizePayload(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	authService := newTestAuthService(t, config.ModeIDE)
	terminalService := newRouteTerminalService(t)
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietCatCommand(t),
	})

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
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection, authHeaderForCookie(t, authService), withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	_ = readNextRawFrame(t, conn)

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":0,"cols":80}`)); err != nil {
		t.Fatalf("write invalid terminal resize message: %v", err)
	}

	_, _, err := conn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeBadRequest {
		t.Fatalf("expected bad-request close code %d, got %d", CloseCodeBadRequest, status)
	}
}

func TestRegisterRoutesTerminalRequiresFullIDE(t *testing.T) {
	t.Parallel()

	store := newTestShareSessionStore("share-a")
	terminalService := newRouteTerminalService(t)
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
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection+"?shareSessionId=share-a", nil, withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	_, _, err := conn.Read(context.Background())
	if status := websocket.CloseStatus(err); status != CloseCodeForbidden {
		t.Fatalf("expected forbidden close code %d, got %d", CloseCodeForbidden, status)
	}
}

func newRouteServer(t *testing.T, deps RouteDependencies) *httptest.Server {
	t.Helper()

	if deps.Terminals == nil {
		deps.Terminals = newRouteTerminalService(t)
	}
	if deps.ListenerProducer == nil {
		deps.ListenerProducer = realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: deps.ListenerBroadcaster,
		})
	}
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

func withTerminalPath(projectID string, sectionID string) dialOption {
	return func(path string) string {
		path = strings.Replace(path, "{projectID}", projectID, 1)
		path = strings.Replace(path, "{sectionID}", sectionID, 1)
		return path
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

func newRouteProjectRuntime(t *testing.T, projectID string) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]projectstate.Project{
			projectID: {
				ID:   projectID,
				Name: strings.ToUpper(projectID),
			},
		},
	})
	if err != nil {
		t.Fatalf("open route project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close route project runtime: %v", err)
		}
	})
	return runtime
}

func newRouteDeploymentRuntime(t *testing.T, mode config.Mode) *deployments.Runtime {
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
	writeRouteDeploymentJSON(t, filepath.Join(root, projectstate.MainFileName), document)

	deploymentType := "share"
	if mode == config.ModeApp {
		deploymentType = "app"
	}
	writeRouteDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeRouteDeploymentJSON(t, filepath.Join(root, "policy.json"), map[string]any{})

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
		},
		IDGenerator: func() string {
			return "generated-share"
		},
	})
	if err != nil {
		t.Fatalf("open route deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close route deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func writeRouteDeploymentJSON(t *testing.T, path string, value any) {
	t.Helper()

	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatalf("mkdir route deployment parent: %v", err)
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal route deployment json: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write route deployment json: %v", err)
	}
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

	_, payload := readNextFrame(t, conn)

	var message routeMessageEnvelope
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("decode websocket message: %v", err)
	}
	return message
}

func readNextFrame(t *testing.T, conn *websocket.Conn) (websocket.MessageType, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket message: %v", err)
	}
	return messageType, payload
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

func readNextRawFrame(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket frame: %v", err)
	}
	return string(payload)
}

func readUntilRawFrameContains(t *testing.T, conn *websocket.Conn, needle string, maxReads int) string {
	t.Helper()

	buffer := bytes.NewBuffer(nil)
	for range maxReads {
		frame := readNextRawFrame(t, conn)
		buffer.WriteString(frame)
		if strings.Contains(buffer.String(), needle) {
			return buffer.String()
		}
	}

	t.Fatalf("did not receive terminal output containing %q within %d reads; collected output: %q", needle, maxReads, buffer.String())
	return ""
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

func newRouteTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}

	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(shutdownCtx); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	return service
}

func openRouteTerminalForTest(t *testing.T, service *terminals.Service, options terminals.OpenOptions) {
	t.Helper()

	if _, created, err := service.Open(options); err != nil {
		t.Fatalf("open route terminal %q: %v", options.ID, err)
	} else if !created {
		t.Fatalf("expected terminal %q to be created", options.ID)
	}
}

func seedRouteTerminalHistory(t *testing.T, service *terminals.Service, terminalID string, needle string) {
	t.Helper()

	attachment, err := service.Attach(terminalID)
	if err != nil {
		t.Fatalf("attach route terminal %q: %v", terminalID, err)
	}
	defer attachment.Close()

	if len(attachment.History) > 0 && strings.Contains(string(attachment.History), needle) {
		return
	}

	_ = readUntilAttachmentContains(t, attachment, needle)
}

func readUntilAttachmentContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := bytes.NewBuffer(nil)
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func quietCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func readyQuietCatCommand(t *testing.T, initialLine string) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf '" + initialLine + "\\n'; cat"}
}

func resizeProbeCommand(t *testing.T) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf 'ready\\n'; while IFS= read -r line; do if [ \"$line\" = size ]; then stty size; fi; done"}
}

func requireCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func skipIfPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}

func assertListenerRegisterAck(t *testing.T, message routeMessageEnvelope, projectID string, shareSessionID string) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", message.MessageType)
	}

	var content realtime.ListenerRegisterAckContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener register ack: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if len(content.Callbacks) != 1 {
		t.Fatalf("expected 1 callback ack, got %d", len(content.Callbacks))
	}
	if status := content.Callbacks["cb-a"].Status; status != "accepted" {
		t.Fatalf("expected callback status accepted, got %q", status)
	}
}

func assertRouteListenerRealtimeEvent(t *testing.T, message routeMessageEnvelope, projectID string, shareSessionID string, sequence uint64, expectedValue string) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", message.MessageType)
	}

	var content realtime.ListenerRealtimeEventContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.Deltas) != 1 {
		t.Fatalf("expected 1 delta, got %d", len(content.Deltas))
	}
	if compactJSON(t, content.Deltas[0].Value) != compactJSONString(t, expectedValue) {
		t.Fatalf("expected delta value %s, got %s", expectedValue, string(content.Deltas[0].Value))
	}
}

func assertRouteListenerDependencyEvent(t *testing.T, message routeMessageEnvelope, projectID string, shareSessionID string, sequence uint64, expectedPayload string) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", message.MessageType)
	}

	var content realtime.ListenerDependencyEventContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.DependencyEvents) != 1 {
		t.Fatalf("expected 1 dependency event, got %d", len(content.DependencyEvents))
	}
	if canonicalJSON(t, content.DependencyEvents[0].Payload) != canonicalJSONString(t, expectedPayload) {
		t.Fatalf("expected dependency payload %s, got %s", expectedPayload, string(content.DependencyEvents[0].Payload))
	}
}

func canonicalJSONString(t *testing.T, value string) string {
	t.Helper()
	return canonicalJSON(t, []byte(value))
}

func compactJSONString(t *testing.T, value string) string {
	t.Helper()
	return canonicalJSONString(t, value)
}

func canonicalJSON(t *testing.T, value []byte) string {
	t.Helper()

	var decoded any
	if err := json.Unmarshal(value, &decoded); err != nil {
		t.Fatalf("decode json %q: %v", string(value), err)
	}
	encoded, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-encode json %q: %v", string(value), err)
	}
	return string(encoded)
}

func compactJSON(t *testing.T, value []byte) string {
	t.Helper()
	return canonicalJSON(t, value)
}
