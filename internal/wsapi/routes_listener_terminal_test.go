package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/terminals"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

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

func TestRegisterRoutesShareListenerFrontendEmitRejectsWhenDeploymentPolicyDisallowsParamChanges(t *testing.T) {
	t.Parallel()

	deploymentPolicy := deployments.DefaultPolicy()
	deploymentPolicy.AllowParamChanges = false
	deploymentRuntime := newRouteDeploymentRuntimeWithPolicy(t, config.ModeShare, deploymentPolicy)
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
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
			Deployment:  deploymentRuntime,
		}),
	})
	defer server.Close()

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"Section":"value"}}}`)); err != nil {
		t.Fatalf("write share listener frontend emit under disallowed policy: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_failed", map[string]any{
		"message": "Deployment policy disallows listener updates.",
	})

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("overlay for share session: %v", err)
	}
	project, err := overlay.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after blocked listener emit: %v", err)
	}
	if len(project.Sections) != 0 {
		t.Fatalf("expected blocked listener emit to leave deployment overlay unchanged, got %#v", project.Sections)
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

func TestRegisterRoutesTerminalResizeFlushesDeferredDefaultShellRun(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	authService := newTestAuthService(t, config.ModeIDE)
	terminalService := newRouteTerminalService(t)
	terminalID := terminals.BuildTerminalID("section-a", "")
	defaultShellEnv := append([]string(nil), os.Environ()...)
	defaultShellEnv = append(defaultShellEnv, "BASH_SILENCE_DEPRECATION_WARNING=1")
	openRouteTerminalForTest(t, terminalService, terminals.OpenOptions{
		ID:         terminalID,
		ProjectID:  "project-a",
		AllowInput: true,
		Env:        defaultShellEnv,
	})
	if err := terminalService.RunCommand(terminalID, []byte("printf 'ROUTE_DEFER_OK\\n'\n")); err != nil {
		t.Fatalf("queue deferred route command: %v", err)
	}

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

	if ready := readNextRawFrame(t, conn); ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}
	history := readNextRawFrame(t, conn)
	if strings.Contains(history, "ROUTE_DEFER_OK") {
		t.Fatalf("did not expect deferred command output before initial resize, got %q", history)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":24,"cols":80}`)); err != nil {
		t.Fatalf("write terminal resize message: %v", err)
	}

	output := readUntilRawFrameContains(t, conn, "ROUTE_DEFER_OK", 6)
	if !strings.Contains(output, "ROUTE_DEFER_OK") {
		t.Fatalf("expected deferred route output after initial resize, got %q", output)
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

	readUntilCloseStatus(t, conn, CloseCodeBadRequest)
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

func TestRegisterRoutesDeploymentTerminalActivityTouchesShareSession(t *testing.T) {
	t.Parallel()
	skipIfPTYUnsupported(t)

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newRouteDeploymentRuntimeWithPolicyAndNow(t, config.ModeApp, deployments.DefaultAppPolicy(), func() time.Time {
		return now
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	session, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected share session to exist")
	}
	if session.LastSeenAt != now {
		t.Fatalf("expected initial session last-seen time %v, got %v", now, session.LastSeenAt)
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

	if ready := readNextRawFrame(t, conn); ready != TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", ready)
	}
	if history := readNextRawFrame(t, conn); !strings.Contains(history, "deployment history") {
		t.Fatalf("expected deployment terminal history replay, got %q", history)
	}

	now = now.Add(1 * time.Minute)
	if err := conn.Write(context.Background(), websocket.MessageText, []byte("blocked input\n")); err != nil {
		t.Fatalf("write deployment terminal input: %v", err)
	}

	waitForCondition(t, func() bool {
		touched, ok := deploymentRuntime.Session("share-a")
		return ok && touched.LastSeenAt == now
	})

	touched, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected touched share session to remain available")
	}
	if touched.LastSeenAt != now {
		t.Fatalf("expected terminal activity to touch share session at %v, got %v", now, touched.LastSeenAt)
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
