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
	"setta/internal/artifacts"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/shareartifacts"
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
	if forceRefresh.ProjectConfigID != temporaryProjectID {
		t.Fatalf("expected temporary project id %q, got %q", temporaryProjectID, forceRefresh.ProjectConfigID)
	}
	var projectState struct {
		ProjectConfig struct {
			ID string `json:"id"`
		} `json:"projectConfig"`
	}
	if err := json.Unmarshal(forceRefresh.ProjectState, &projectState); err != nil {
		t.Fatalf("decode temporary force refresh project state: %v", err)
	}
	if projectState.ProjectConfig.ID != temporaryProjectID {
		t.Fatalf("expected temporary project state id %q, got %q", temporaryProjectID, projectState.ProjectConfig.ID)
	}
	foundCatalogEntry := false
	for _, entry := range forceRefresh.DependencyCatalog.Entries {
		if entry.DependencyKey != temporarySectionID {
			continue
		}
		foundCatalogEntry = true
		break
	}
	if !foundCatalogEntry {
		t.Fatalf("expected temporary dependency catalog entry for %q, got %#v", temporarySectionID, forceRefresh.DependencyCatalog.Entries)
	}
	foundRenderedValue := false
	for _, entry := range forceRefresh.DependencyValues.Entries {
		if entry.DependencyKey != temporarySectionID {
			continue
		}
		foundRenderedValue = true
		break
	}
	if !foundRenderedValue {
		t.Fatalf("expected temporary dependency value entry for %q, got %#v", temporarySectionID, forceRefresh.DependencyValues.Entries)
	}
}

func TestRegisterRoutesListenerInitIncludesDependencyCatalog(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	sectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
	if _, err := projectRuntime.SetTextBlockText(context.Background(), "project-a", sectionID, "Hello from Go"); err != nil {
		t.Fatalf("set text block text: %v", err)
	}
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write listener init: %v", err)
	}

	content := decodeRouteListenerForceRefreshContent(t, readNextMessage(t, conn))
	if content.DependencyCatalog == nil {
		t.Fatal("expected dependency catalog in listener bootstrap force refresh")
	}
	expectedName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", sectionID, "")
	foundCatalog := false
	for _, entry := range content.DependencyCatalog.Entries {
		if entry.DependencyKey != sectionID {
			continue
		}
		if entry.FullPathName != expectedName {
			t.Fatalf("expected dependency name %q, got %q", expectedName, entry.FullPathName)
		}
		foundCatalog = true
		break
	}
	if !foundCatalog {
		t.Fatalf("expected dependency catalog to include section %q", sectionID)
	}

	if content.DependencyValues == nil {
		t.Fatal("expected dependency values in listener bootstrap force refresh")
	}
	for _, entry := range content.DependencyValues.Entries {
		if entry.DependencyKey != sectionID {
			continue
		}
		if entry.RenderedValue != "'Hello from Go'" {
			t.Fatalf("expected rendered dependency value %q, got %q", "'Hello from Go'", entry.RenderedValue)
		}
		return
	}

	t.Fatalf("expected dependency values to include section %q", sectionID)
}

func TestRegisterRoutesListenerInitResolvesProjectNameAndSendsForceRefresh(t *testing.T) {
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
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha Project",
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha Project"}}`)); err != nil {
		t.Fatalf("write listener init by name: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-alpha", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-alpha"))
}

func TestRegisterRoutesListenerInitFallsBackToDefaultProject(t *testing.T) {
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
			"project-secondary": {
				ID:   "project-secondary",
				Name: "Secondary Project",
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{}}`)); err != nil {
		t.Fatalf("write listener init without target: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-default", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-default"))
}

func TestRegisterRoutesShareListenerInitUsesSessionScope(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
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
		Deployment:          deploymentRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID+"?shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{}}`)); err != nil {
		t.Fatalf("write deployment listener init: %v", err)
	}

	snapshot, err := deploymentRuntime.SessionSnapshot("share-a")
	if err != nil {
		t.Fatalf("load share session snapshot: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-a", "share-a", routeProjectStatePayload(t, snapshot.Document, "project-a"))
}

func TestRegisterRoutesListenerInitMissingProjectSendsListenerError(t *testing.T) {
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
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Missing Project"}}`)); err != nil {
		t.Fatalf("write listener init missing project: %v", err)
	}

	listenerError := readNextMessage(t, conn)
	assertRouteListenerError(t, listenerError, "project_state_unavailable", map[string]any{
		"projectName": "Missing Project",
	})
	assertRouteListenerErrorMissingDetailKey(t, listenerError, "message")
}

func TestRegisterRoutesListenerInitMissingProjectIDSendsListenerError(t *testing.T) {
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
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-missing"}}`)); err != nil {
		t.Fatalf("write listener init missing project id: %v", err)
	}

	// Explicit missing project ids must fail with the same listener error shape
	// as the source bootstrap transport rather than silently defaulting.
	listenerError := readNextMessage(t, conn)
	assertRouteListenerError(t, listenerError, "project_state_unavailable", map[string]any{
		"projectConfigId": "project-missing",
	})
	assertRouteListenerErrorMissingDetailKey(t, listenerError, "message")
}

func TestRegisterRoutesListenerRegisterAckUsesBootstrappedProjectAfterInit(t *testing.T) {
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Target Project"}}`)); err != nil {
		t.Fatalf("write listener init before register: %v", err)
	}
	assertRouteListenerForceRefresh(t, readNextMessage(t, conn), "project-target", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-target"))

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register after init: %v", err)
	}

	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-target", "")
}

func TestRegisterRoutesListenerRegisterAndLiveMessagesUseTemporaryIDs(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	temporaryIDs := newRouteTemporaryIDs(t)
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
		TemporaryIDs: temporaryIDs,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	dictSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Dict", "inputs")
	_, addParamResult, err := projectRuntime.AddKwarg(context.Background(), "project-a", dictSectionID)
	if err != nil {
		t.Fatalf("add dict param: %v", err)
	}
	temporaryProjectID, err := temporaryIDs.EnsureTemporaryID("project-a")
	if err != nil {
		t.Fatalf("ensure temporary project id: %v", err)
	}
	temporarySectionID, err := temporaryIDs.EnsureTemporaryID(dictSectionID)
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}
	temporaryCodeObjID, err := temporaryIDs.EnsureTemporaryID(addParamResult.CodeObjID)
	if err != nil {
		t.Fatalf("ensure temporary code object id: %v", err)
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
	_ = readNextMessage(t, conn)

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"projectConfigId":"`+temporaryProjectID+`","callbacks":{"cb-a":{"dependencies":[{"type":"SectionParam","sectionId":"`+temporarySectionID+`","codeObjId":"`+temporaryCodeObjID+`"},{"type":"Section","sectionId":"`+temporarySectionID+`"}],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write temporary listener register: %v", err)
	}

	assertListenerRegisterAck(t, readNextMessage(t, conn), temporaryProjectID, "")

	sequence, delivered, err := broadcaster.EmitRealtimeDeltas(context.Background(), realtime.EmitRealtimeDeltasParams{
		ProjectID: "project-a",
		Deltas: []realtime.ListenerRealtimeDelta{
			{
				Dependency: dictSectionID + "." + addParamResult.CodeObjID,
				Value:      json.RawMessage(`"value-1"`),
			},
		},
		DependencyValues: &realtime.ListenerRenderedDependencyValues{
			Entries: []realtime.ListenerRenderedDependencyValue{
				{
					DependencyKey: dictSectionID + "." + addParamResult.CodeObjID,
					RenderedValue: "'value-1'",
				},
				{
					DependencyKey: dictSectionID,
					RenderedValue: "{'value': 'value-1'}",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("emit temporary realtime delta: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected one translated realtime delivery, got sequence=%d delivered=%d", sequence, delivered)
	}
	realtimeEvent := readNextMessage(t, conn)
	assertRouteListenerRealtimeEvent(
		t,
		realtimeEvent,
		temporaryProjectID,
		"",
		1,
		temporarySectionID+"."+temporaryCodeObjID,
		`"value-1"`,
	)
	content := decodeRouteListenerRealtimeContent(t, realtimeEvent)
	if content.DependencyValues == nil {
		t.Fatal("expected translated dependency values on temporary realtime event")
	}
	translatedValues := map[string]string{}
	for _, entry := range content.DependencyValues.Entries {
		translatedValues[entry.DependencyKey] = entry.RenderedValue
	}
	if got := translatedValues[temporarySectionID+"."+temporaryCodeObjID]; got != "'value-1'" {
		t.Fatalf("expected temporary child dependency value %q, got %q", "'value-1'", got)
	}
	if got := translatedValues[temporarySectionID]; got != "{'value': 'value-1'}" {
		t.Fatalf("expected temporary parent dependency value %q, got %q", "{'value': 'value-1'}", got)
	}

	sequence, delivered, err = broadcaster.EmitDependencyEvents(context.Background(), realtime.EmitDependencyEventsParams{
		ProjectID: "project-a",
		DependencyEvents: []realtime.ListenerDependencyEvent{
			{
				DependencyKey: dictSectionID,
				Payload:       json.RawMessage(`{"clicked":true}`),
				TimestampMS:   456,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit temporary dependency event: %v", err)
	}
	if sequence != 2 || delivered != 1 {
		t.Fatalf("expected one translated dependency delivery, got sequence=%d delivered=%d", sequence, delivered)
	}
	assertRouteListenerDependencyEvent(
		t,
		readNextMessage(t, conn),
		temporaryProjectID,
		"",
		2,
		temporarySectionID,
		`{"clicked":true}`,
	)
}

func TestRegisterRoutesListenerAcceptsPythonRegisterPayloadAndEmitsStructuredDependencyKeys(t *testing.T) {
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
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write python-style listener init: %v", err)
	}
	assertRouteListenerForceRefresh(t, readNextMessage(t, conn), "project-a", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-a"))

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"projectConfigId":"project-a","callbacks":{"cb-a":{"dependencies":[{"type":"SectionParam","sectionId":"section-a","codeObjId":"param-a"},{"type":"Section","sectionId":"section-action"}],"dependencyMode":"realtime_only","debounceMs":25,"throttleMs":50,"runOnRefresh":true}}}}`)); err != nil {
		t.Fatalf("write python-style listener register: %v", err)
	}

	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

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
		t.Fatalf("emit realtime deltas for python-style listener: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected realtime delivery (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}
	assertRouteListenerRealtimeEvent(t, readNextMessage(t, conn), "project-a", "", 1, "section-a.param-a", `"value-1"`)

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
		t.Fatalf("emit dependency events for python-style listener: %v", err)
	}
	if sequence != 2 || delivered != 1 {
		t.Fatalf("expected dependency event delivery (sequence=2 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}
	assertRouteListenerDependencyEvent(t, readNextMessage(t, conn), "project-a", "", 2, "section-action", `{"clicked":true}`)
}

func TestRegisterRoutesListenerRealtimeUsesDependencyClosureAndDependencyValues(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	dictSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Dict", "inputs")
	_, addParamResult, err := projectRuntime.AddKwarg(context.Background(), "project-a", dictSectionID)
	if err != nil {
		t.Fatalf("add dict param: %v", err)
	}
	if _, err := projectRuntime.SetCodeObjectName(context.Background(), "project-a", addParamResult.CodeObjID, "count"); err != nil {
		t.Fatalf("rename dict param for listener graph visibility: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-a", dictSectionID, addParamResult.CodeObjID, "1"); err != nil {
		t.Fatalf("seed dict param value: %v", err)
	}
	producer := realtime.NewListenerProducer(realtime.ListenerProducerOptions{
		Broadcaster:  broadcaster,
		ProjectState: projectRuntime,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		ListenerProducer:    producer,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-parent"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"projectConfigId":"project-a","callbacks":{"cb-a":{"dependencies":[{"type":"Section","sectionId":"`+dictSectionID+`"}],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write parent-only listener register: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

	sequence, delivered, err := producer.EmitUIChange(context.Background(), realtime.EmitUIChangeParams{
		ProjectID: "project-a",
		DependencyKey: json.RawMessage(`{
			"type":"SectionParam",
			"sectionId":"` + dictSectionID + `",
			"codeObjId":"` + addParamResult.CodeObjID + `"
		}`),
		Value: json.RawMessage(`{"type":"Literal","payload":"updated from producer"}`),
	})
	if err != nil {
		t.Fatalf("emit ui change through listener producer: %v", err)
	}
	if sequence != 1 || delivered != 1 {
		t.Fatalf("expected parent listener delivery via dependency closure (sequence=1 delivered=1), got sequence=%d delivered=%d", sequence, delivered)
	}

	realtimeEvent := readNextMessage(t, conn)
	assertRouteListenerRealtimeEvent(
		t,
		realtimeEvent,
		"project-a",
		"",
		1,
		dictSectionID+"."+addParamResult.CodeObjID,
		`{"type":"Literal","payload":"updated from producer"}`,
	)

	content := decodeRouteListenerRealtimeContent(t, realtimeEvent)
	if content.DependencyValues == nil {
		t.Fatal("expected authoritative dependency values on listener realtime event")
	}

	renderedValues := map[string]string{}
	for _, entry := range content.DependencyValues.Entries {
		renderedValues[entry.DependencyKey] = entry.RenderedValue
	}
	if got := renderedValues[dictSectionID+"."+addParamResult.CodeObjID]; got != "updated from producer" {
		t.Fatalf("expected child dependency rendered value %q, got %q", "updated from producer", got)
	}
	parentValue, ok := renderedValues[dictSectionID]
	if !ok {
		t.Fatalf("expected parent dependency value for %q, got %#v", dictSectionID, renderedValues)
	}
	if !strings.Contains(parentValue, "updated from producer") {
		t.Fatalf("expected parent dependency value to include updated child value, got %q", parentValue)
	}
}

func TestRegisterRoutesListenerFrontendEmitUpdatesProjectStateAndBroadcastsFrontend(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	textSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
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

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", textSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":"updated from listener"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit: %v", err)
	}

	update := readUntilMessageType(t, frontend, realtime.MessageTypeUpdateFrontendProjectState, 4)
	assertRouteProjectStateUpdate(t, update, "project-a")

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after listener emit: %v", err)
	}
	section, variant, _, err := project.ResolveSection(textSectionID)
	if err != nil {
		t.Fatalf("resolve text section after listener emit: %v", err)
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload after listener emit: %v", err)
	}
	if payload["text"] != "updated from listener" {
		t.Fatalf("expected updated text block payload, got %#v", payload)
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err = listener.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected listener frontend emit success to stay silent, got %v", err)
	}
}

func TestRegisterRoutesListenerFrontendEmitAcceptsTemporaryProjectID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	temporaryIDs := newRouteTemporaryIDs(t)
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
		TemporaryIDs: temporaryIDs,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	textSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
	temporaryProjectID, err := temporaryIDs.EnsureTemporaryID("project-a")
	if err != nil {
		t.Fatalf("ensure temporary project id: %v", err)
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

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-temp"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"`+temporaryProjectID+`","useTemporaryIds":true}}`)); err != nil {
		t.Fatalf("write temporary listener init: %v", err)
	}
	_ = readNextMessage(t, listener)

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write temporary listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), temporaryProjectID, "")

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", textSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"`+temporaryProjectID+`","dependencyValues":{"`+dependencyName+`":"updated from temporary listener"}}}`)); err != nil {
		t.Fatalf("write temporary listener frontend emit: %v", err)
	}

	update := readUntilMessageType(t, frontend, realtime.MessageTypeUpdateFrontendProjectState, 4)
	assertRouteProjectStateUpdate(t, update, "project-a")

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after temporary listener emit: %v", err)
	}
	section, variant, _, err := project.ResolveSection(textSectionID)
	if err != nil {
		t.Fatalf("resolve text section after temporary listener emit: %v", err)
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload after temporary listener emit: %v", err)
	}
	if payload["text"] != "updated from temporary listener" {
		t.Fatalf("expected updated text block payload, got %#v", payload)
	}
}

func TestRegisterRoutesListenerFrontendEmitRejectsUnregisteredSocket(t *testing.T) {
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

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"Section":"value"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit without registration: %v", err)
	}

	// The retained listener caller refuses to emit before registration; the
	// transport must also fail closed if a raw websocket skips that precondition.
	assertRouteListenerError(t, readNextMessage(t, listener), "listener_not_registered", map[string]any{
		"websocketId": "listener-a",
	})
}

func TestRegisterRoutesListenerFrontendEmitUpdatesSectionParamValue(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	dictSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Dict", "inputs")
	_, addParamResult, err := projectRuntime.AddKwarg(context.Background(), "project-a", dictSectionID)
	if err != nil {
		t.Fatalf("add dict param: %v", err)
	}
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

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", dictSectionID, addParamResult.CodeObjID)
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":"hello"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit param update: %v", err)
	}

	assertRouteProjectStateUpdate(
		t,
		readUntilMessageType(t, frontend, realtime.MessageTypeUpdateFrontendProjectState, 4),
		"project-a",
	)

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after listener param emit: %v", err)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject(dictSectionID, addParamResult.CodeObjID)
	if err != nil {
		t.Fatalf("resolve updated section param: %v", err)
	}
	if payload["value"] != "hello" {
		t.Fatalf("expected updated section param value, got %#v", payload["value"])
	}
}

func TestRegisterRoutesListenerFrontendEmitRejectsProjectMismatch(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
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

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-b","dependencyValues":{"Section":"value"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit project mismatch: %v", err)
	}

	// Frontend emits are scoped to the registered project and must reject
	// mismatched project ids before any mutation work begins.
	assertRouteListenerError(t, readNextMessage(t, listener), "project_config_mismatch", map[string]any{
		"expectedProjectConfigId": "project-a",
		"receivedProjectConfigId": "project-b",
	})
}

func TestRegisterRoutesListenerFrontendEmitReportsMissingProjectState(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	textSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
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

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", textSectionID, "")
	if _, err := projectRuntime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		delete(document.Projects, "project-a")
		document.DefaultProjectID = ""
		return document, nil
	}); err != nil {
		t.Fatalf("remove project before listener emit: %v", err)
	}

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":"hello"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit after project removal: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "project_state_unavailable", map[string]any{
		"message": "'project-a'",
	})
}

func TestRegisterRoutesListenerFrontendEmitRejectsEmptyPayload(t *testing.T) {
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
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write listener frontend emit empty payload: %v", err)
	}

	// Raw websocket callers must still provide the same non-empty emit payload
	// that the retained Python client enforces locally.
	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_invalid_payload", map[string]any{
		"message": "listener emits require dependencyValues or artifactUpdates",
	})
}

func TestRegisterRoutesListenerFrontendEmitRejectsUnknownDependency(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
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

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"MissingDependency":"value"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit unknown dependency: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_unknown_dependency", map[string]any{
		"dependencyName": "MissingDependency",
	})
}

func TestRegisterRoutesListenerFrontendEmitRejectsInvalidDependencyValue(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	textSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
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

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", textSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":{"unexpected":true}}}}`)); err != nil {
		t.Fatalf("write listener frontend emit invalid dependency value: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_invalid_value", map[string]any{
		"dependencyName": dependencyName,
		"expectedType":   "Literal",
	})
}

func TestRegisterRoutesListenerFrontendEmitBroadcastsArtifactUpdates(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, artifactsRoot := newRouteArtifactService(t)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		Artifacts:           artifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	artifactPath := filepath.Join(artifactsRoot, "stroke.json")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"BrushStroke","id":"`+artifactPath+`","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}]}}`)); err != nil {
		t.Fatalf("write listener frontend emit artifact update: %v", err)
	}

	assertRouteArtifactUpdate(t, readUntilMessageType(t, frontend, realtime.MessageTypeUpdateArtifacts, 4), "update", "artifacts/stroke.json", "BrushStroke")

	loaded, err := artifactService.LoadCachedBrushStrokes(context.Background(), artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load brush stroke after listener emit: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil || !strings.Contains(string(loaded[0].Value), "#000000") {
		t.Fatalf("expected listener artifact update to persist brush stroke, got %#v", loaded)
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err = listener.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected artifact-only listener emit success to stay silent, got %v", err)
	}
}

func TestRegisterRoutesShareListenerFrontendEmitScopesArtifactUpdatesToSession(t *testing.T) {
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
	shareArtifactService, artifactsRoot := newRouteShareArtifactService(t, deploymentRuntime, hub)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: deploymentRuntime,
		},
		Deployment:          deploymentRuntime,
		ShareArtifacts:      shareArtifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	frontendA := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer frontendA.CloseNow()
	_ = readNextMessage(t, frontendA)

	frontendB := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-b", nil)
	defer frontendB.CloseNow()
	_ = readUntilMessageType(t, frontendB, realtime.MessageTypeFrontendIdentity, 3)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write share listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")

	artifactPath := filepath.Join(artifactsRoot, "stroke.json")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"BrushStroke","id":"`+artifactPath+`","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}]}}`)); err != nil {
		t.Fatalf("write share listener artifact update: %v", err)
	}

	assertRouteArtifactUpdate(t, readUntilMessageType(t, frontendA, realtime.MessageTypeUpdateArtifacts, 4), "update", "artifacts/stroke.json", "BrushStroke")
	assertNoRouteEnvelopeOfType(t, frontendB, realtime.MessageTypeUpdateArtifacts, 300*time.Millisecond)

	loadedA, err := shareArtifactService.LoadCachedBrushStrokes(context.Background(), "share-a", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load share-a brush stroke after listener emit: %v", err)
	}
	if len(loadedA) != 1 || loadedA[0] == nil || !strings.Contains(string(loadedA[0].Value), "#000000") {
		t.Fatalf("expected share-a listener overlay artifact, got %#v", loadedA)
	}

	loadedB, err := shareArtifactService.LoadCachedBrushStrokes(context.Background(), "share-b", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load share-b brush stroke after listener emit: %v", err)
	}
	if len(loadedB) != 1 || loadedB[0] != nil {
		t.Fatalf("expected share-b overlay miss after listener emit, got %#v", loadedB)
	}
}

func TestRegisterRoutesListenerFrontendEmitRejectsBlankArtifactPath(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, _ := newRouteArtifactService(t)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		Artifacts:           artifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"BrushStroke","id":"   ","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}]}}`)); err != nil {
		t.Fatalf("write listener blank artifact path update: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_invalid_artifact_update", map[string]any{
		"path":    "   ",
		"message": "artifact path must be a non-empty string",
	})
}

func TestRegisterRoutesListenerFrontendEmitRejectsInvalidArtifactUpdate(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, _ := newRouteArtifactService(t)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		Artifacts:           artifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"BrushStroke","id":"artifacts/stroke.json","value":["invalid"]}]}}`)); err != nil {
		t.Fatalf("write listener invalid artifact update: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_invalid_artifact_update", map[string]any{
		"path": "artifacts/stroke.json",
	})
}

func TestRegisterRoutesListenerFrontendEmitRejectsUnsupportedArtifactUpdate(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, _ := newRouteArtifactService(t)
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		Artifacts:           artifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"Image","id":"artifacts/image.png","value":{"contentId":"missing","byteLength":1,"mimeType":"image/png"}}]}}`)); err != nil {
		t.Fatalf("write listener unsupported artifact update: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_unsupported_artifact_update", map[string]any{
		"path": "artifacts/image.png",
	})
}

func TestRegisterRoutesListenerFrontendEmitReportsArtifactManagerFailure(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, artifactsRoot := newRouteArtifactService(t)
	if err := os.RemoveAll(artifactsRoot); err != nil {
		t.Fatalf("remove artifacts root: %v", err)
	}
	if err := os.WriteFile(artifactsRoot, []byte("blocked"), 0o644); err != nil {
		t.Fatalf("replace artifacts root with file: %v", err)
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		Artifacts:           artifactService,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"BrushStroke","id":"artifacts/stroke.json","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}]}}`)); err != nil {
		t.Fatalf("write listener artifact update with manager failure: %v", err)
	}

	message := readNextMessage(t, listener)
	if message.MessageType != realtime.MessageTypeListenerError {
		t.Fatalf("expected listener error, got %q", message.MessageType)
	}
	var content realtime.ListenerErrorContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener error: %v", err)
	}
	if content.Error != "listener_emit_artifact_update_failed" {
		t.Fatalf("expected listener_emit_artifact_update_failed, got %q", content.Error)
	}
	rawMessage, ok := content.Details["message"].(string)
	if !ok {
		t.Fatalf("expected string listener error message, got %#v", content.Details["message"])
	}
	if !strings.Contains(rawMessage, "stroke.json") {
		t.Fatalf("expected artifact manager failure detail, got %q", rawMessage)
	}
}

func TestRegisterRoutesShareListenerFrontendEmitRejectsMissingShareSessionContext(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
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
		Deployment:          deploymentRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write share listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")

	broadcaster.RemoveConnection("listener-a")
	if err := broadcaster.Registry().UpsertRegistration("listener-a", "project-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{},
			DependencyMode: "refresh_only",
		},
	}, ""); err != nil {
		t.Fatalf("strip share session from listener registration: %v", err)
	}

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"Section":"value"}}}`)); err != nil {
		t.Fatalf("write share listener frontend emit without share session context: %v", err)
	}

	// Deployment listeners must keep the registration's share-session scope so
	// emit mutations cannot bleed across sessions.
	assertRouteListenerError(t, readNextMessage(t, listener), "share_session_missing", map[string]any{
		"websocketId": "listener-a",
	})
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
	assertRouteListenerRealtimeEvent(t, realtimeEvent, "project-a", "", 1, "section-a.param-a", `"value-1"`)

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
	assertRouteListenerDependencyEvent(t, dependencyEvent, "project-a", "", 2, "section-action", `{"clicked":true}`)
}

func TestRegisterRoutesListenerEndpointCallRequiresRegistration(t *testing.T) {
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-a","callId":"call-1","endpointName":"fixture_listener_endpoint","payload":{}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call: %v", err)
	}

	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: "project-a",
		CallID:          "call-1",
		OK:              false,
		Error:           "listener_not_registered",
	}, map[string]any{
		"websocketId": "listener-a",
	})
}

func TestRegisterRoutesListenerEndpointCallDispatchesBuiltInEndpoint(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	builtInInvoker := &routeBuiltInListenerEndpointInvoker{
		invoke: func(info ConnectionInfo, endpointName string, payload map[string]any) (any, bool, error) {
			return map[string]any{
				"handledBy":       "built-in",
				"endpointName":    endpointName,
				"projectConfigId": payload["projectConfigId"],
				"sessionId":       info.Auth.SessionID,
			}, true, nil
		},
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:           hub,
		ListenerBroadcaster:    broadcaster,
		BuiltInListenerInvoker: builtInInvoker,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-a","callId":"call-built-in","endpointName":"route_get_chat_section_chat_id","payload":{"sectionId":"fixture-section"}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call: %v", err)
	}

	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: "project-a",
		CallID:          "call-built-in",
		OK:              true,
		Result: map[string]any{
			"handledBy":       "built-in",
			"endpointName":    "route_get_chat_section_chat_id",
			"projectConfigId": "project-a",
			"sessionId":       "abc123",
		},
	}, nil)

	if len(builtInInvoker.calls) != 1 {
		t.Fatalf("expected one built-in listener endpoint call, got %#v", builtInInvoker.calls)
	}
	if builtInInvoker.calls[0].sessionID != "abc123" || !builtInInvoker.calls[0].hasAuth {
		t.Fatalf("expected auth session to reach built-in invoker, got %#v", builtInInvoker.calls[0])
	}
	if builtInInvoker.calls[0].payload["projectConfigId"] != "project-a" || builtInInvoker.calls[0].payload["sectionId"] != "fixture-section" {
		t.Fatalf("unexpected built-in payload %#v", builtInInvoker.calls[0].payload)
	}
}

func TestRegisterRoutesListenerEndpointCallAcceptsTemporaryProjectID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	temporaryIDs := newRouteTemporaryIDs(t)
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
		TemporaryIDs: temporaryIDs,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	builtInInvoker := &routeBuiltInListenerEndpointInvoker{
		invoke: func(info ConnectionInfo, endpointName string, payload map[string]any) (any, bool, error) {
			return map[string]any{
				"handledBy":       "built-in",
				"endpointName":    endpointName,
				"projectConfigId": payload["projectConfigId"],
			}, true, nil
		},
	}
	temporaryProjectID, err := temporaryIDs.EnsureTemporaryID("project-a")
	if err != nil {
		t.Fatalf("ensure temporary project id: %v", err)
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:           projectRuntime,
		WebsocketHub:           hub,
		ListenerBroadcaster:    broadcaster,
		BuiltInListenerInvoker: builtInInvoker,
		TemporaryIDs:           temporaryIDs,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-temp"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"`+temporaryProjectID+`","useTemporaryIds":true}}`)); err != nil {
		t.Fatalf("write temporary listener init: %v", err)
	}
	_ = readNextMessage(t, conn)

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write temporary listener register: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), temporaryProjectID, "")

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"`+temporaryProjectID+`","callId":"call-temp","endpointName":"route_get_chat_section_chat_id","payload":{}}}`)); err != nil {
		t.Fatalf("write temporary listener router endpoint call: %v", err)
	}

	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: temporaryProjectID,
		CallID:          "call-temp",
		OK:              true,
		Result: map[string]any{
			"handledBy":       "built-in",
			"endpointName":    "route_get_chat_section_chat_id",
			"projectConfigId": "project-a",
		},
	}, nil)

	if len(builtInInvoker.calls) != 1 {
		t.Fatalf("expected one temporary built-in listener endpoint call, got %#v", builtInInvoker.calls)
	}
	if builtInInvoker.calls[0].payload["projectConfigId"] != "project-a" {
		t.Fatalf("expected canonical project id in built-in payload, got %#v", builtInInvoker.calls[0].payload)
	}
}

func TestRegisterRoutesListenerEndpointCallRejectsPayloadProjectMismatch(t *testing.T) {
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-a","callId":"call-3","endpointName":"fixture_listener_endpoint","payload":{"projectConfigId":"project-b"}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call: %v", err)
	}

	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: "project-a",
		CallID:          "call-3",
		OK:              false,
		Error:           "project_config_mismatch",
	}, map[string]any{
		"expectedProjectConfigId": "project-a",
		"receivedProjectConfigId": "project-b",
	})
}

func TestRegisterRoutesListenerEndpointCallReturnsUnknownEndpointError(t *testing.T) {
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-a","callId":"call-4","endpointName":"missing_listener_endpoint","payload":{}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call: %v", err)
	}

	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: "project-a",
		CallID:          "call-4",
		OK:              false,
		Error:           "listener_call_failed",
	}, map[string]any{
		"message": "unknown listener endpoint: missing_listener_endpoint",
	})
}

func TestRegisterRoutesListenerEndpointCallRejectsEmptyEndpointName(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	builtInInvoker := &routeBuiltInListenerEndpointInvoker{
		invoke: func(info ConnectionInfo, endpointName string, payload map[string]any) (any, bool, error) {
			return map[string]any{"unexpected": true}, true, nil
		},
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		WebsocketHub:           hub,
		ListenerBroadcaster:    broadcaster,
		BuiltInListenerInvoker: builtInInvoker,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, conn), "project-a", "")

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-a","callId":"call-empty","endpointName":"   ","payload":{}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call with empty endpoint: %v", err)
	}

	// Empty endpoint names must fail closed before any built-in or plugin
	// dispatch is attempted.
	result := readNextMessage(t, conn)
	assertListenerRouterEndpointResult(t, result, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: "project-a",
		CallID:          "call-empty",
		OK:              false,
		Error:           "listener_call_invalid_operation",
	}, map[string]any{
		"message": "endpointName must be non-empty",
	})
	if len(builtInInvoker.calls) != 0 {
		t.Fatalf("expected no built-in dispatch for empty endpoint name, got %#v", builtInInvoker.calls)
	}
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

func TestRegisterRoutesTerminalRejectsDeploymentWhenRunPolicyDisabled(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	terminalService := newRouteTerminalService(t)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeShare),
			ShareSessions: deploymentRuntime,
		},
		Deployment:          deploymentRuntime,
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
	assertWebsocketCloseReasonEmpty(t, err)
}

func TestRegisterRoutesDeploymentTerminalConnectsReadOnlySession(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeApp)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	terminalService := newRouteTerminalService(t)
	terminalID := terminals.BuildTerminalID("section-a", "share-a")
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:             terminalID,
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		AllowInput:     false,
		Command:        readyQuietCatCommand(t, "deployment history"),
	})
	seedRouteTerminalHistory(t, terminalService, terminalID, "deployment history")

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeApp),
			ShareSessions: deploymentRuntime,
		},
		Deployment:          deploymentRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection+"?shareSessionId=share-a", nil, withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	ready := readNextRawFrame(t, conn)
	if ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}
	history := readNextRawFrame(t, conn)
	if !strings.Contains(history, "deployment history") {
		t.Fatalf("expected deployment terminal history replay, got %q", history)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte("blocked input\n")); err != nil {
		t.Fatalf("write deployment terminal input: %v", err)
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err := conn.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deployment terminal websocket to remain open after blocked input, got %v", err)
	}

	info, ok := terminalService.Session(terminalID)
	if !ok {
		t.Fatal("expected deployment terminal session to remain available")
	}
	if info.AllowInput {
		t.Fatal("expected deployment terminal session to remain read-only")
	}
}

func TestRegisterRoutesDeploymentTerminalAutoOpensReadOnlySession(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeApp)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	terminalService := newRouteTerminalService(t)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			ModePolicy:    modes.NewPolicy(config.ModeApp),
			ShareSessions: deploymentRuntime,
		},
		Deployment:          deploymentRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
		Terminals:           terminalService,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteTerminalBySection+"?shareSessionId=share-a", nil, withTerminalPath("project-a", "section-a"))
	defer conn.CloseNow()

	if ready := readNextRawFrame(t, conn); ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}

	info, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "share-a"))
	if !ok {
		t.Fatal("expected deployment websocket attach to open a terminal session")
	}
	if info.ProjectID != "project-a" {
		t.Fatalf("expected auto-opened deployment terminal project id project-a, got %q", info.ProjectID)
	}
	if info.ShareSessionID != "share-a" {
		t.Fatalf("expected auto-opened deployment share session share-a, got %q", info.ShareSessionID)
	}
	if info.AllowInput {
		t.Fatal("expected auto-opened deployment terminal to disable input")
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

type routeBuiltInListenerEndpointCall struct {
	endpointName   string
	payload        map[string]any
	hasAuth        bool
	sessionID      string
	shareSessionID string
}

type routeBuiltInListenerEndpointInvoker struct {
	calls  []routeBuiltInListenerEndpointCall
	invoke func(ConnectionInfo, string, map[string]any) (any, bool, error)
}

func (s *routeBuiltInListenerEndpointInvoker) InvokeBuiltInListenerEndpoint(
	_ context.Context,
	info ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if s == nil {
		return nil, false, nil
	}
	s.calls = append(s.calls, routeBuiltInListenerEndpointCall{
		endpointName:   endpointName,
		payload:        cloneRouteListenerPayload(payload),
		hasAuth:        info.HasAuth,
		sessionID:      info.Auth.SessionID,
		shareSessionID: info.Modes.ShareSessionID,
	})
	if s.invoke == nil {
		return nil, false, nil
	}
	return s.invoke(info, endpointName, payload)
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

	return newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]projectstate.Project{
			projectID: {
				ID:   projectID,
				Name: strings.ToUpper(projectID),
			},
		},
	})
}

func newRouteProjectRuntimeWithDocument(t *testing.T, document projectstate.Document) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(document)
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

func newRouteTemporaryIDs(t *testing.T) *mcpx.TemporaryIDStore {
	t.Helper()

	store, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(t.TempDir()))
	if err != nil {
		t.Fatalf("open temporary id store: %v", err)
	}
	return store
}

func createRouteTopLevelSection(
	t *testing.T,
	runtime *projectstate.Runtime,
	projectID string,
	implType string,
	name string,
) string {
	t.Helper()

	input := projectstate.CreateTopLevelSectionInput{
		ImplType: implType,
	}
	if strings.TrimSpace(name) != "" {
		input.Name = &name
	}
	_, result, err := runtime.CreateTopLevelSection(
		context.Background(),
		projectID,
		input,
		projectstate.StructuralMutationSettings{},
	)
	if err != nil {
		t.Fatalf("create top-level section %q for project %q: %v", implType, projectID, err)
	}
	return result.SectionID
}

func routeListenerDependencyName(
	t *testing.T,
	document projectstate.Document,
	projectID string,
	sectionID string,
	codeObjID string,
) string {
	t.Helper()

	project, err := document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("project %q for dependency lookup: %v", projectID, err)
	}
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		t.Fatalf("listener dependency export for project %q: %v", projectID, err)
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build listener dependency graph for project %q: %v", projectID, err)
	}

	var key codegen.PythonDependencyKey
	if strings.TrimSpace(codeObjID) == "" {
		key = codegen.PythonSectionDependencyKey(sectionID)
	} else {
		key = codegen.PythonCodeObjectDependencyKey(sectionID, codeObjID)
	}
	node, ok := graph.Node(key)
	if !ok {
		t.Fatalf("dependency node not found for section=%q codeObj=%q", sectionID, codeObjID)
	}
	return node.Base().FullPathName
}

func routeProjectStatePayload(t *testing.T, document projectstate.Document, projectID string) json.RawMessage {
	t.Helper()

	view, err := projectview.SingleConfigByProjectID(document, projectID)
	if err != nil {
		t.Fatalf("build route project state payload: %v", err)
	}
	payload, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal route project state payload: %v", err)
	}
	return payload
}

func newRouteArtifactService(t *testing.T) (*artifacts.Service, string) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir route workspace root: %v", err)
	}
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir route artifacts root: %v", err)
	}
	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new route binary store: %v", err)
	}
	service, err := artifacts.NewService(artifacts.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		ArtifactsRoot:  artifactsRoot,
		BinaryStore:    binaryStore,
	})
	if err != nil {
		t.Fatalf("new route artifact service: %v", err)
	}
	return service, artifactsRoot
}

func newRouteShareArtifactService(
	t *testing.T,
	deploymentRuntime *deployments.Runtime,
	hub *realtime.WebsocketHub,
) (*shareartifacts.Service, string) {
	t.Helper()

	binaryStore, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new route share binary store: %v", err)
	}
	service, err := shareartifacts.NewService(shareartifacts.ServiceOptions{
		Deployment:   deploymentRuntime,
		BinaryStore:  binaryStore,
		WebsocketHub: hub,
	})
	if err != nil {
		t.Fatalf("new route share artifact service: %v", err)
	}
	return service, deploymentRuntime.Paths().ArtifactsRoot
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
	policy := deployments.DefaultPolicy()
	if mode == config.ModeApp {
		deploymentType = "app"
		policy = deployments.DefaultAppPolicy()
	}
	writeRouteDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeRouteDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)

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

func assertNoRouteEnvelopeOfType(t *testing.T, conn *websocket.Conn, messageType string, timeout time.Duration) {
	t.Helper()

	readCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	for {
		_, payload, err := conn.Read(readCtx)
		if errors.Is(err, context.DeadlineExceeded) {
			return
		}
		if err != nil {
			t.Fatalf("read websocket frame while waiting for no %q messages: %v", messageType, err)
		}

		var message routeMessageEnvelope
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatalf("decode websocket frame while waiting for no %q messages: %v", messageType, err)
		}
		if message.MessageType == messageType {
			t.Fatalf("expected no message type %q within %v, got %#v", messageType, timeout, message)
		}
	}
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
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
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

func assertRouteListenerCoverageSnapshot(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	hasRealtimeWildcard bool,
	dependencies []realtime.ListenerCoverageDependency,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerCoverageSnapshot {
		t.Fatalf("expected listener coverage snapshot, got %q", message.MessageType)
	}

	var content realtime.ListenerCoverageSnapshot
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener coverage snapshot: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.HasRealtimeWildcard != hasRealtimeWildcard {
		t.Fatalf("expected realtime wildcard %t, got %#v", hasRealtimeWildcard, content)
	}
	if len(content.Dependencies) != len(dependencies) {
		t.Fatalf("expected %d coverage dependencies, got %#v", len(dependencies), content.Dependencies)
	}
	for index, expected := range dependencies {
		if content.Dependencies[index] != expected {
			t.Fatalf("expected coverage dependency %#v at index %d, got %#v", expected, index, content.Dependencies[index])
		}
	}
}

func assertRouteListenerForceRefresh(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	expectedProjectState json.RawMessage,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerForceRefresh {
		t.Fatalf("expected listener force refresh, got %q", message.MessageType)
	}

	content := decodeRouteListenerForceRefreshContent(t, message)
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if canonicalJSON(t, content.ProjectState) != canonicalJSON(t, expectedProjectState) {
		t.Fatalf("expected project state %s, got %s", string(expectedProjectState), string(content.ProjectState))
	}
}

func decodeRouteListenerForceRefreshContent(
	t *testing.T,
	message routeMessageEnvelope,
) realtime.ListenerForceRefreshContent {
	t.Helper()

	var content realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener force refresh: %v", err)
	}
	return content
}

func decodeRouteListenerRealtimeContent(
	t *testing.T,
	message routeMessageEnvelope,
) realtime.ListenerRealtimeEventContent {
	t.Helper()

	var content realtime.ListenerRealtimeEventContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event: %v", err)
	}
	return content
}

func assertRouteListenerError(
	t *testing.T,
	message routeMessageEnvelope,
	expectedError string,
	expectedDetailsSubset map[string]any,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerError {
		t.Fatalf("expected listener error, got %q", message.MessageType)
	}

	var content realtime.ListenerErrorContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener error: %v", err)
	}
	if content.Error != expectedError {
		t.Fatalf("expected error %q, got %q", expectedError, content.Error)
	}
	for key, expectedValue := range expectedDetailsSubset {
		actualValue, ok := content.Details[key]
		if !ok {
			t.Fatalf("expected listener error details to include %q", key)
		}
		if canonicalValueJSON(t, actualValue) != canonicalValueJSON(t, expectedValue) {
			t.Fatalf("expected detail %q=%#v, got %#v", key, expectedValue, actualValue)
		}
	}
}

func assertRouteListenerErrorMissingDetailKey(
	t *testing.T,
	message routeMessageEnvelope,
	detailKey string,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerError {
		t.Fatalf("expected listener error, got %q", message.MessageType)
	}

	var content realtime.ListenerErrorContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener error: %v", err)
	}
	if _, ok := content.Details[detailKey]; ok {
		t.Fatalf("expected listener error details to omit %q, got %#v", detailKey, content.Details)
	}
}

func assertRouteProjectStateUpdate(t *testing.T, message routeMessageEnvelope, projectID string) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeUpdateFrontendProjectState {
		t.Fatalf("expected project state update, got %q", message.MessageType)
	}

	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode project state update: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != projectID {
		t.Fatalf("expected project state update for %q, got %q", projectID, content.ProjectState.ProjectConfig.ID)
	}
}

func assertRouteArtifactUpdate(
	t *testing.T,
	message routeMessageEnvelope,
	updateType string,
	artifactID string,
	artifactType string,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeUpdateArtifacts {
		t.Fatalf("expected update artifacts message, got %q", message.MessageType)
	}

	var content realtime.UpdateArtifactsContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode update artifacts content: %v", err)
	}
	if content.UpdateType != updateType {
		t.Fatalf("expected update type %q, got %q", updateType, content.UpdateType)
	}
	if len(content.Artifacts) != 1 {
		t.Fatalf("expected 1 artifact update, got %#v", content.Artifacts)
	}
	artifact, ok := content.Artifacts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected artifact object, got %#v", content.Artifacts[0])
	}
	if artifact["id"] != artifactID {
		t.Fatalf("expected artifact id %q, got %#v", artifactID, artifact["id"])
	}
	if artifact["type"] != artifactType {
		t.Fatalf("expected artifact type %q, got %#v", artifactType, artifact["type"])
	}
}

func assertRouteListenerRealtimeEvent(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedDependency string,
	expectedValue string,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", message.MessageType)
	}

	var content struct {
		ProjectConfigID string `json:"projectConfigId"`
		ShareSessionID  string `json:"shareSessionId,omitempty"`
		Deltas          []struct {
			Dependency json.RawMessage `json:"dependency"`
			Value      json.RawMessage `json:"value"`
		} `json:"deltas"`
		Sequence uint64 `json:"sequence"`
	}
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event: %v", err)
	}
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
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
	assertStructuredDependencyKeyPayload(t, content.Deltas[0].Dependency, expectedDependency, "delta dependency")
	if compactJSON(t, content.Deltas[0].Value) != compactJSONString(t, expectedValue) {
		t.Fatalf("expected delta value %s, got %s", expectedValue, string(content.Deltas[0].Value))
	}
}

func assertRouteListenerDependencyEvent(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedDependency string,
	expectedPayload string,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", message.MessageType)
	}

	var content struct {
		ProjectConfigID  string `json:"projectConfigId"`
		ShareSessionID   string `json:"shareSessionId,omitempty"`
		DependencyEvents []struct {
			DependencyKey json.RawMessage `json:"dependencyKey"`
			Payload       json.RawMessage `json:"payload,omitempty"`
			TimestampMS   int64           `json:"timestampMs"`
		} `json:"dependencyEvents"`
		Sequence uint64 `json:"sequence"`
	}
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event: %v", err)
	}
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
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
	assertStructuredDependencyKeyPayload(t, content.DependencyEvents[0].DependencyKey, expectedDependency, "dependency event key")
	if canonicalJSON(t, content.DependencyEvents[0].Payload) != canonicalJSONString(t, expectedPayload) {
		t.Fatalf("expected dependency payload %s, got %s", expectedPayload, string(content.DependencyEvents[0].Payload))
	}
}

func assertStructuredDependencyKeyPayload(
	t *testing.T,
	raw json.RawMessage,
	expectedCanonical string,
	label string,
) {
	t.Helper()

	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "\"") {
		t.Fatalf("expected %s to be a structured dependency key object, got %s", label, trimmed)
	}

	canonical, err := realtime.CanonicalDependencyKey(raw)
	if err != nil {
		t.Fatalf("decode %s dependency key: %v", label, err)
	}
	if canonical != expectedCanonical {
		t.Fatalf("expected %s canonical key %q, got %q", label, expectedCanonical, canonical)
	}
}

func assertListenerRouterEndpointResult(
	t *testing.T,
	message routeMessageEnvelope,
	expected realtime.ListenerRouterEndpointResultContent,
	expectedDetails map[string]any,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerRouterResult {
		t.Fatalf("expected listener router endpoint result, got %q", message.MessageType)
	}

	var content realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener router endpoint result: %v", err)
	}
	if content.ProjectConfigID != expected.ProjectConfigID {
		t.Fatalf("expected project config id %q, got %q", expected.ProjectConfigID, content.ProjectConfigID)
	}
	if content.CallID != expected.CallID {
		t.Fatalf("expected call id %q, got %q", expected.CallID, content.CallID)
	}
	if content.OK != expected.OK {
		t.Fatalf("expected ok=%t, got %t", expected.OK, content.OK)
	}
	if content.Error != expected.Error {
		t.Fatalf("expected error %q, got %q", expected.Error, content.Error)
	}
	if expectedDetails == nil {
		expectedDetails = map[string]any{}
	}
	if content.Details == nil {
		content.Details = map[string]any{}
	}
	if canonicalValueJSON(t, content.Result) != canonicalValueJSON(t, expected.Result) {
		t.Fatalf("expected result %#v, got %#v", expected.Result, content.Result)
	}
	if canonicalValueJSON(t, content.Details) != canonicalValueJSON(t, expectedDetails) {
		t.Fatalf("expected details %#v, got %#v", expectedDetails, content.Details)
	}
}

func canonicalValueJSON(t *testing.T, value any) string {
	t.Helper()

	if value == nil {
		return "null"
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json value %#v: %v", value, err)
	}
	return canonicalJSON(t, encoded)
}

func cloneRouteListenerPayload(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}

	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
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
