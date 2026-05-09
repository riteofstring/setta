package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/artifacts"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"

	"github.com/coder/websocket"
)

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

func TestRegisterRoutesListenerRegisterAckIncludesEveryCallbackStatus(t *testing.T) {
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

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Default Project"}}`)); err != nil {
		t.Fatalf("write listener init before register: %v", err)
	}
	assertRouteListenerForceRefresh(t, readNextMessage(t, conn), "project-default", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-default"))

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"},"cb-b":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener register with multiple callbacks: %v", err)
	}

	assertListenerRegisterAckCallbacks(t, readNextMessage(t, conn), "project-default", "", map[string]string{
		"cb-a": "accepted",
		"cb-b": "accepted",
	})
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

func TestRegisterRoutesListenerFrontendEmitUpdatesChatSectionState(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	chatSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Chat", "chat")
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

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", chatSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":{"messages":[{"role":"user","content":"hello"}],"inputText":"draft","waitingForResponse":true,"toolCallArguments":{"tool-1":"args"},"branches":{}}}}}`)); err != nil {
		t.Fatalf("write listener frontend emit chat update: %v", err)
	}

	assertRouteProjectStateUpdate(
		t,
		readUntilMessageType(t, frontend, realtime.MessageTypeUpdateFrontendProjectState, 4),
		"project-a",
	)

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after listener chat emit: %v", err)
	}
	section, variant, _, err := project.ResolveSection(chatSectionID)
	if err != nil {
		t.Fatalf("resolve chat section after listener emit: %v", err)
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload after listener chat emit: %v", err)
	}
	messages, ok := payload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one chat message, got %#v", payload["messages"])
	}
	if payload["inputText"] != "draft" {
		t.Fatalf("expected updated chat inputText, got %#v", payload["inputText"])
	}
	if payload["waitingForResponse"] != true {
		t.Fatalf("expected waitingForResponse=true, got %#v", payload["waitingForResponse"])
	}
}

func TestRegisterRoutesListenerFrontendEmitUpdatesPluginSectionData(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	pluginSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Plugin", "plugin")
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

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", pluginSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":{"answer":42}}}}`)); err != nil {
		t.Fatalf("write listener frontend emit plugin update: %v", err)
	}

	assertRouteProjectStateUpdate(
		t,
		readUntilMessageType(t, frontend, realtime.MessageTypeUpdateFrontendProjectState, 4),
		"project-a",
	)

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project after listener plugin emit: %v", err)
	}
	section, variant, _, err := project.ResolveSection(pluginSectionID)
	if err != nil {
		t.Fatalf("resolve plugin section after listener emit: %v", err)
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective payload after listener plugin emit: %v", err)
	}
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin data payload, got %#v", payload["data"])
	}
	if got := data["answer"]; got != float64(42) {
		t.Fatalf("expected plugin data answer=42, got %#v", got)
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

	// The listener client refuses to emit before registration; the
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
	// that the Python client enforces locally.
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

func TestRegisterRoutesListenerFrontendEmitRejectsUnsupportedWritableSectionTarget(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	drawSectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Draw", "draw")
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

	dependencyName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", drawSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":"updated"}}}`)); err != nil {
		t.Fatalf("write listener frontend emit unsupported dependency: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_unsupported_dependency", map[string]any{
		"dependencyName": dependencyName,
		"reason":         "dependency does not expose a writable value",
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

func TestRegisterRoutesListenerFrontendEmitBroadcastsImageArtifactUpdates(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	artifactService, artifactsRoot, binaryStore := newRouteArtifactServiceWithStore(t)
	imageRef, err := binaryStore.StoreBytes([]byte("listener-image"), "image/png", false)
	if err != nil {
		t.Fatalf("store listener image payload: %v", err)
	}
	imageValue, err := json.Marshal(imageRef)
	if err != nil {
		t.Fatalf("marshal listener image payload: %v", err)
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

	frontend := dialRouteConnection(t, server.URL, RouteFrontend, authHeaderForCookie(t, authService))
	defer frontend.CloseNow()
	_ = readNextMessages(t, frontend, 2)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a", authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "")

	artifactPath := filepath.Join(artifactsRoot, "image.png")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"Image","id":"`+artifactPath+`","value":`+string(imageValue)+`}]}}`)); err != nil {
		t.Fatalf("write listener frontend emit image artifact update: %v", err)
	}

	assertRouteArtifactUpdate(t, readUntilMessageType(t, frontend, realtime.MessageTypeUpdateArtifacts, 4), "update", "artifacts/image.png", "Image")

	loaded, err := artifactService.LoadCachedImages(context.Background(), artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load image after listener emit: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil {
		t.Fatalf("expected listener image artifact update to persist, got %#v", loaded)
	}
	payload, err := binaryStore.ReadBytes(loaded[0].Value.ContentID)
	if err != nil {
		t.Fatalf("read listener image bytes after emit: %v", err)
	}
	if string(payload) != "listener-image" {
		t.Fatalf("expected listener image bytes, got %q", string(payload))
	}
}

func TestRegisterRoutesListenerFrontendEmitBroadcastsChartArtifactUpdates(t *testing.T) {
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

	artifactPath := filepath.Join(artifactsRoot, "chart.csv")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"ChartData","id":"`+artifactPath+`","value":{"x":[1,3],"label":["alpha",""]}}]}}`)); err != nil {
		t.Fatalf("write listener frontend emit chart artifact update: %v", err)
	}

	assertRouteArtifactUpdate(t, readUntilMessageType(t, frontend, realtime.MessageTypeUpdateArtifacts, 4), "update", "artifacts/chart.csv", "ChartData")

	loaded, err := artifactService.LoadCachedChartData(context.Background(), artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load chart after listener emit: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil {
		t.Fatalf("expected listener chart artifact update to persist, got %#v", loaded)
	}
	if got := loaded[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("expected listener chart x values, got %#v", got)
	}
}

func TestRegisterRoutesShareListenerFrontendEmitScopesDependencyUpdatesToSession(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newRouteDeploymentRuntime(t, config.ModeShare)
	textSectionID := createRouteTopLevelSection(t, deploymentRuntime.Base(), "project-a", "TextBlock", "note")
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
		Deployment:          deploymentRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	frontendA := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-a", nil)
	defer frontendA.CloseNow()
	_ = readUntilMessageType(t, frontendA, realtime.MessageTypeFrontendIdentity, 3)

	frontendB := dialRouteConnection(t, server.URL, RouteFrontend+"?shareSessionId=share-b", nil)
	defer frontendB.CloseNow()
	_ = readUntilMessageType(t, frontendB, realtime.MessageTypeFrontendIdentity, 3)

	listener := dialRouteConnection(t, server.URL, RouteListenerByID+"?projectId=project-a&shareSessionId=share-a", nil, withPathParam("listener-a"))
	defer listener.CloseNow()

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":[],"dependencyMode":"refresh_only"}}}}`)); err != nil {
		t.Fatalf("write share listener register message: %v", err)
	}
	assertListenerRegisterAck(t, readNextMessage(t, listener), "project-a", "share-a")

	dependencyName := routeListenerDependencyName(t, deploymentRuntime.Base().Snapshot().Document, "project-a", textSectionID, "")
	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"`+dependencyName+`":"updated from share listener"}}}`)); err != nil {
		t.Fatalf("write share listener frontend emit dependency update: %v", err)
	}

	assertRouteProjectStateUpdate(
		t,
		readUntilMessageType(t, frontendA, realtime.MessageTypeUpdateFrontendProjectState, 4),
		"project-a",
	)
	assertNoRouteEnvelopeOfType(t, frontendB, realtime.MessageTypeUpdateFrontendProjectState, 300*time.Millisecond)

	overlayA, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("overlay for share-a: %v", err)
	}
	projectA, err := overlayA.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project in share-a overlay after listener emit: %v", err)
	}
	sectionA, variantA, _, err := projectA.ResolveSection(textSectionID)
	if err != nil {
		t.Fatalf("resolve share-a section after listener emit: %v", err)
	}
	payloadA, err := projectA.EffectiveSectionPayload(sectionA.ID, variantA.ID)
	if err != nil {
		t.Fatalf("effective share-a payload after listener emit: %v", err)
	}
	if payloadA["text"] != "updated from share listener" {
		t.Fatalf("expected share-a payload text to update, got %#v", payloadA["text"])
	}

	overlayB, err := deploymentRuntime.Overlay("share-b")
	if err != nil {
		t.Fatalf("overlay for share-b: %v", err)
	}
	projectB, err := overlayB.Snapshot().Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project in share-b overlay after listener emit: %v", err)
	}
	sectionB, variantB, _, err := projectB.ResolveSection(textSectionID)
	if err != nil {
		t.Fatalf("resolve share-b section after listener emit: %v", err)
	}
	payloadB, err := projectB.EffectiveSectionPayload(sectionB.ID, variantB.ID)
	if err != nil {
		t.Fatalf("effective share-b payload after listener emit: %v", err)
	}
	if payloadB["text"] == "updated from share listener" {
		t.Fatalf("expected share-b payload to remain unchanged, got %#v", payloadB["text"])
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err = listener.Read(readCtx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected share listener frontend emit success to stay silent, got %v", err)
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

func TestRegisterRoutesShareListenerFrontendEmitRejectsDeletedSession(t *testing.T) {
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

	if err := deploymentRuntime.DeleteSession("share-a"); err != nil {
		t.Fatalf("delete share session before listener emit: %v", err)
	}

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","dependencyValues":{"Section":"value"}}}`)); err != nil {
		t.Fatalf("write share listener frontend emit after session deletion: %v", err)
	}

	readUntilCloseStatus(t, listener, CloseCodeNotFound)
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

	if err := listener.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerFrontendEmit","content":{"projectConfigId":"project-a","artifactUpdates":[{"type":"Unsupported","id":"artifacts/unsupported.bin","value":{"payload":true}}]}}`)); err != nil {
		t.Fatalf("write listener unsupported artifact update: %v", err)
	}

	assertRouteListenerError(t, readNextMessage(t, listener), "listener_emit_unsupported_artifact_update", map[string]any{
		"path": "artifacts/unsupported.bin",
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
	if message.MessageType != string(realtime.MessageTypeListenerError) {
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
