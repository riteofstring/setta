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
	"setta/internal/realtime"

	"github.com/coder/websocket"
)

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
