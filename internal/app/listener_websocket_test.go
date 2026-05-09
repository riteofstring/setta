package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/listenersnapshot"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

func TestAppServesListenerForceRefreshRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.SchemaVersion = projectstate.CurrentSchemaVersion
		document.DefaultProjectID = "project-alpha"
		if document.Projects == nil {
			document.Projects = map[string]projectstate.Project{}
		}
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed listener project state: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		targets := app.listeners.Registry().BootstrapConnectionIDs("project-alpha", "")
		if len(targets) == 1 && targets[0] == "listener-a" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if targets := app.listeners.Registry().BootstrapConnectionIDs("project-alpha", ""); len(targets) != 1 || targets[0] != "listener-a" {
		t.Fatalf("expected listener bootstrap for project-alpha, got %#v", targets)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteForceRefreshListener,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new force refresh request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post listener force refresh: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	var content realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener force refresh content: %v", err)
	}
	if content.Snapshot.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha force refresh, got %q", content.Snapshot.ProjectConfigID)
	}
}

func TestAppServesListenerCoverageRoute(t *testing.T) {
	// The real app stack should serve listener coverage from the Go registry
	// after a listener registers callbacks over the websocket route.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"},"cb-b":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener registration: %v", err)
	}

	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetListenerCoverage,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new listener coverage request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post listener coverage: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload realtime.ListenerCoverageSnapshot
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode listener coverage payload: %v", err)
	}
	if payload.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha snapshot, got %q", payload.ProjectID)
	}
	if !payload.HasRealtimeWildcard {
		t.Fatal("expected realtime wildcard from empty dependency registration")
	}
	if len(payload.Dependencies) != 1 {
		t.Fatalf("expected 1 explicit dependency, got %#v", payload.Dependencies)
	}
	if payload.Dependencies[0] != (realtime.ListenerCoverageDependency{Type: realtime.DependencyKeyTypeSectionParam, SectionID: "section-a", CodeObjID: "param-a"}) {
		t.Fatalf("unexpected coverage dependency %#v", payload.Dependencies[0])
	}
}

func TestAppListenerWebsocketDispatchesBuiltInListenerEndpoint(t *testing.T) {
	// The real IDE app should route manifest-backed built-in listener endpoints
	// through the Go listener websocket without falling back to /pythonScript/{id}.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	initEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)
	var initContent realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(initEnvelope.Content, &initContent); err != nil {
		t.Fatalf("decode listener force refresh content: %v", err)
	}
	if initContent.Snapshot.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected listener init to resolve project-alpha, got %#v", initContent)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-set","endpointName":"route_set_chat_section_chat_id","payload":{"sectionId":"chat-section","chatId":"chat-2"}}}`)); err != nil {
		t.Fatalf("write listener set-chat endpoint call: %v", err)
	}
	setEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var setContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(setEnvelope.Content, &setContent); err != nil {
		t.Fatalf("decode listener set-chat result: %v", err)
	}
	if setContent.ProjectConfigID != "project-alpha" || setContent.CallID != "call-set" || !setContent.OK || setContent.Result != nil {
		t.Fatalf("unexpected set-chat listener result %#v", setContent)
	}

	chatID, err := app.ProjectStates().Main().ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("read chat section chat id: %v", err)
	}
	if chatID == nil || *chatID != "chat-2" {
		t.Fatalf("expected chat id chat-2 after listener endpoint call, got %#v", chatID)
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	if err := runStore.Save(agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-2",
		"projectConfigId": "project-alpha",
	}, time.Unix(100, 0).UTC())); err != nil {
		t.Fatalf("save managed chat run: %v", err)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-get","endpointName":"route_get_chat_section_chat_id","payload":{"sectionId":"chat-section"}}}`)); err != nil {
		t.Fatalf("write listener get-chat endpoint call: %v", err)
	}
	getEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var getContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(getEnvelope.Content, &getContent); err != nil {
		t.Fatalf("decode listener get-chat result: %v", err)
	}
	if getContent.ProjectConfigID != "project-alpha" || getContent.CallID != "call-get" || !getContent.OK {
		t.Fatalf("unexpected get-chat listener result %#v", getContent)
	}
	if resolvedChatID, ok := getContent.Result.(string); !ok || resolvedChatID != "chat-2" {
		t.Fatalf("expected get-chat listener result chat-2, got %#v", getContent.Result)
	}
}

func TestAppListenerWebsocketDispatchesPluginListenerEndpoint(t *testing.T) {
	// The real IDE app should invoke registered plugin listener endpoints over the Go listener websocket path.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")

	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read backend plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode backend plugin manifest: %v", err)
	}
	manifest["capabilities"] = []string{"registerListenerEndpoint"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode backend plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write backend plugin manifest: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	currentSession, ok := app.Auth().CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-plugin", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	initEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)
	var initContent realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(initEnvelope.Content, &initContent); err != nil {
		t.Fatalf("decode listener init content: %v", err)
	}
	if initContent.Snapshot.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha listener init, got %#v", initContent)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-plugin","endpointName":"route_backend_fixture_ping","payload":{"value":"pong"}}}`)); err != nil {
		t.Fatalf("write plugin listener endpoint call: %v", err)
	}
	resultEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var resultContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(resultEnvelope.Content, &resultContent); err != nil {
		t.Fatalf("decode plugin listener result: %v", err)
	}
	if resultContent.ProjectConfigID != "project-alpha" || resultContent.CallID != "call-plugin" || !resultContent.OK {
		t.Fatalf("unexpected plugin listener result %#v", resultContent)
	}

	resultPayload, ok := resultContent.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected plugin listener result payload map, got %#v", resultContent.Result)
	}
	if resultPayload["endpointName"] != "route_backend_fixture_ping" || resultPayload["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected plugin listener payload %#v", resultPayload)
	}
	if resultPayload["sessionId"] != currentSession.Metadata.ID || resultPayload["hasAuth"] != true {
		t.Fatalf("unexpected plugin listener auth payload %#v", resultPayload)
	}
	payload, ok := resultPayload["payload"].(map[string]any)
	if !ok || payload["value"] != "pong" || payload["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected plugin listener result payload %#v", resultPayload["payload"])
	}
}

func TestAppListenerWebsocketDispatchesScriptableChatBuiltIns(t *testing.T) {
	// The Go listener websocket should own the scriptable chat history surface
	// needed by the Python chat_toolkit client.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-history", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	_ = readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-create","endpointName":"route_create_chat","payload":{"firstMessage":{"id":"user-1","role":"user","content":[{"type":"text","text":"Hello listener history"}]}}}}`)); err != nil {
		t.Fatalf("write listener create-chat endpoint call: %v", err)
	}
	createEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var createContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(createEnvelope.Content, &createContent); err != nil {
		t.Fatalf("decode listener create-chat result: %v", err)
	}
	if createContent.ProjectConfigID != "project-alpha" || createContent.CallID != "call-create" || !createContent.OK {
		t.Fatalf("unexpected create-chat listener result %#v", createContent)
	}
	createdChat, ok := createContent.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected created chat payload map, got %#v", createContent.Result)
	}
	chatID, ok := createdChat["id"].(string)
	if !ok || strings.TrimSpace(chatID) == "" {
		t.Fatalf("expected created chat id, got %#v", createdChat)
	}
	if createdChat["name"] != "Hello listener history" {
		t.Fatalf("expected created chat name to derive from first message, got %#v", createdChat["name"])
	}
	llmConfigPayload, ok := createdChat["llmConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected llmConfig payload map, got %#v", createdChat["llmConfig"])
	}
	if llmConfigPayload["id"] != "scriptable" {
		t.Fatalf("expected scriptable llm config id, got %#v", llmConfigPayload["id"])
	}
	if createdChat["projectConfigId"] != "project-alpha" {
		t.Fatalf("expected listener create-chat to persist projectConfigId project-alpha, got %#v", createdChat["projectConfigId"])
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-append","endpointName":"route_append_chat_messages","payload":{"chatId":"`+chatID+`","messages":[{"id":"assistant-1","role":"assistant","content":[{"type":"text","text":"Reply"}]}]}}}`)); err != nil {
		t.Fatalf("write listener append-chat endpoint call: %v", err)
	}
	appendEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var appendContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(appendEnvelope.Content, &appendContent); err != nil {
		t.Fatalf("decode listener append-chat result: %v", err)
	}
	if appendContent.ProjectConfigID != "project-alpha" || appendContent.CallID != "call-append" || !appendContent.OK {
		t.Fatalf("unexpected append-chat listener result %#v", appendContent)
	}
	appendedChat, ok := appendContent.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected appended chat payload map, got %#v", appendContent.Result)
	}
	messages, ok := appendedChat["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected two chat messages after append, got %#v", appendedChat["messages"])
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-system","endpointName":"route_set_chat_system_prompt","payload":{"chatId":"`+chatID+`","systemPrompt":"System prompt"}}}`)); err != nil {
		t.Fatalf("write listener set-system-prompt endpoint call: %v", err)
	}
	systemEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var systemContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(systemEnvelope.Content, &systemContent); err != nil {
		t.Fatalf("decode listener set-system-prompt result: %v", err)
	}
	systemChat, ok := systemContent.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected system prompt chat payload map, got %#v", systemContent.Result)
	}
	if systemChat["systemPrompt"] != "System prompt" {
		t.Fatalf("expected system prompt round-trip, got %#v", systemChat["systemPrompt"])
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-metadata","endpointName":"route_get_all_chat_metadata","payload":{}}}`)); err != nil {
		t.Fatalf("write listener get-all-chat-metadata endpoint call: %v", err)
	}
	metadataEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var metadataContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataContent); err != nil {
		t.Fatalf("decode listener metadata result: %v", err)
	}
	metadataEntries, ok := metadataContent.Result.([]any)
	if !ok || len(metadataEntries) != 1 {
		t.Fatalf("expected one metadata entry, got %#v", metadataContent.Result)
	}
	metadataEntry, ok := metadataEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata entry payload map, got %#v", metadataEntries[0])
	}
	if metadataEntry["id"] != chatID {
		t.Fatalf("expected metadata id %q, got %#v", chatID, metadataEntry["id"])
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-delete","endpointName":"route_delete_chat","payload":{"chatId":"`+chatID+`"}}}`)); err != nil {
		t.Fatalf("write listener delete-chat endpoint call: %v", err)
	}
	deleteEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var deleteContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deleteContent); err != nil {
		t.Fatalf("decode listener delete-chat result: %v", err)
	}
	if deleteContent.ProjectConfigID != "project-alpha" || deleteContent.CallID != "call-delete" || !deleteContent.OK {
		t.Fatalf("unexpected delete-chat listener result %#v", deleteContent)
	}
	if deleteContent.Result != nil {
		t.Fatalf("expected delete-chat listener result to be null, got %#v", deleteContent.Result)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-metadata-after-delete","endpointName":"route_get_all_chat_metadata","payload":{}}}`)); err != nil {
		t.Fatalf("write listener metadata-after-delete endpoint call: %v", err)
	}
	metadataAfterDeleteEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var metadataAfterDeleteContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(metadataAfterDeleteEnvelope.Content, &metadataAfterDeleteContent); err != nil {
		t.Fatalf("decode listener metadata-after-delete result: %v", err)
	}
	metadataAfterDelete, ok := metadataAfterDeleteContent.Result.([]any)
	if !ok {
		t.Fatalf("expected metadata-after-delete payload slice, got %#v", metadataAfterDeleteContent.Result)
	}
	if len(metadataAfterDelete) != 0 {
		t.Fatalf("expected no chat metadata after delete, got %#v", metadataAfterDelete)
	}
}

func TestAppListenerWebsocketRunsScriptableChatMCPTools(t *testing.T) {
	// The listener chat-toolkit tool runner should execute through the real Go
	// listener route and the app's internal MCP client.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareCurrentSession(t, cfg)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	serverURL := "http://" + listener.Addr().String()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:           "primary",
				Model:        "gpt-4o-mini",
				Provider:     "openai",
				APIKeyEnv:    "OPENAI_API_KEY",
				MCPServerIDs: []string{mcpx.DefaultServerID},
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: llmconfig.TransportStreamableHTTP,
				URL:       serverURL + "/mcp",
			},
		},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("shutdown http server: %v", err)
		}
		err := <-serverErrors
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("serve app: %v", err)
		}
	})

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	authCookie := newAppTestAuthCookie(t, app)
	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(serverURL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-tools", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	_ = readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-create","endpointName":"route_create_chat","payload":{"engineConfigId":"engine-managed","firstMessage":{"id":"user-1","role":"user","content":[{"type":"text","text":"Hello tool chat"}]}}}}`)); err != nil {
		t.Fatalf("write listener create-chat endpoint call: %v", err)
	}
	createEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var createContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(createEnvelope.Content, &createContent); err != nil {
		t.Fatalf("decode listener create-chat result: %v", err)
	}
	if createContent.ProjectConfigID != "project-alpha" || createContent.CallID != "call-create" || !createContent.OK {
		t.Fatalf("unexpected create-chat listener result %#v", createContent)
	}
	createdChat := mustStructuredMapValue(t, createContent.Result)
	chatID, ok := createdChat["id"].(string)
	if !ok || strings.TrimSpace(chatID) == "" {
		t.Fatalf("expected created chat id, got %#v", createdChat)
	}
	if createdChat["projectConfigId"] != "project-alpha" {
		t.Fatalf("expected created chat projectConfigId project-alpha, got %#v", createdChat["projectConfigId"])
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-tools","endpointName":"route_run_mcp_tools","payload":{"chatId":"`+chatID+`","sectionId":"chat-section","toolCalls":[{"id":"tool-call-1","type":"function","function":{"name":"mcp__setta__list_mcp_tools","arguments":{}}}]}}}`)); err != nil {
		t.Fatalf("write listener run-tools endpoint call: %v", err)
	}
	toolsEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var toolsContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(toolsEnvelope.Content, &toolsContent); err != nil {
		t.Fatalf("decode listener run-tools result: %v", err)
	}
	if toolsContent.ProjectConfigID != "project-alpha" || toolsContent.CallID != "call-tools" || !toolsContent.OK {
		t.Fatalf("unexpected run-tools listener result %#v", toolsContent)
	}
	toolResults, ok := toolsContent.Result.([]any)
	if !ok || len(toolResults) != 1 {
		t.Fatalf("expected one tool result message, got %#v", toolsContent.Result)
	}
	toolMessage := mustStructuredMapValue(t, toolResults[0])
	if toolMessage["tool_name"] != "setta__list_mcp_tools" || toolMessage["is_error"] != false {
		t.Fatalf("expected successful setta tool result, got %#v", toolMessage)
	}
	resultPayload := mustStructuredMapValue(t, toolMessage["result"])
	structured := mustStructuredMapValue(t, resultPayload["structuredContent"])
	rawTools, ok := structured["tools"].([]any)
	if !ok {
		t.Fatalf("expected structured tool list, got %#v", structured["tools"])
	}
	if !containsStructuredStringValue(rawTools, "list_mcp_tools") {
		t.Fatalf("expected list_mcp_tools in tool catalog, got %#v", rawTools)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-tools-invalid-affinity","endpointName":"route_run_mcp_tools","payload":{"chatId":"`+chatID+`","sectionId":"chat-section","frontendAffinityToken":"   ","toolCalls":[{"id":"tool-call-2","type":"function","function":{"name":"mcp__setta__list_mcp_tools","arguments":{}}}]}}}`)); err != nil {
		t.Fatalf("write listener run-tools invalid-affinity endpoint call: %v", err)
	}
	invalidAffinityEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var invalidAffinityContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(invalidAffinityEnvelope.Content, &invalidAffinityContent); err != nil {
		t.Fatalf("decode listener run-tools invalid-affinity result: %v", err)
	}
	if invalidAffinityContent.ProjectConfigID != "project-alpha" || invalidAffinityContent.CallID != "call-tools-invalid-affinity" || invalidAffinityContent.OK {
		t.Fatalf("unexpected invalid-affinity listener result %#v", invalidAffinityContent)
	}
	if invalidAffinityContent.Error != "listener_call_failed" {
		t.Fatalf("expected listener_call_failed for blank frontend affinity token, got %#v", invalidAffinityContent)
	}
	if invalidAffinityContent.Details["message"] != "frontendAffinityToken must be a non-empty string when provided" {
		t.Fatalf("expected blank frontend affinity validation message, got %#v", invalidAffinityContent.Details)
	}
}

func TestAppListenerWebsocketSetChatSectionStateTriggersAuthoritativeForceRefresh(t *testing.T) {
	// Listener chat-section state writes should be followed by an authoritative
	// force-refresh so Python listeners do not have to rely on local heuristic
	// patching alone.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-chat-refresh", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	_ = readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	setChatStatePayload, err := json.Marshal(map[string]any{
		"messageType": "ListenerRouterEndpointCall",
		"content": map[string]any{
			"projectConfigId": "project-alpha",
			"callId":          "call-set-chat-state",
			"endpointName":    "route_set_chat_section_state",
			"payload": map[string]any{
				"sectionId": "chat-section",
				"state": map[string]any{
					"messages": []any{
						map[string]any{
							"id":      "message-1",
							"type":    "user",
							"content": "hello",
						},
					},
					"inputText":          "Draft input",
					"waitingForResponse": true,
					"toolCallArguments": map[string]any{
						"tool-call-1": "{\"query\":\"hello\"}",
					},
					"activeBranchId": "branch-1",
					"branches": map[string]any{
						"branch-1": map[string]any{
							"messages": []any{
								map[string]any{
									"id":   "message-1",
									"type": "user",
								},
							},
							"createdAt":           42,
							"parentBranchId":      "root-branch",
							"branchFromMessageId": "message-1",
						},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal listener set-chat-section-state payload: %v", err)
	}
	if err := listenerConn.Write(context.Background(), websocket.MessageText, setChatStatePayload); err != nil {
		t.Fatalf("write listener set-chat-section-state endpoint call: %v", err)
	}

	resultEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var resultContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(resultEnvelope.Content, &resultContent); err != nil {
		t.Fatalf("decode listener result content: %v", err)
	}
	if resultContent.ProjectConfigID != "project-alpha" || resultContent.CallID != "call-set-chat-state" || !resultContent.OK || resultContent.Result != nil {
		t.Fatalf("unexpected set-chat-section-state listener result %#v", resultContent)
	}

	forceRefreshEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)
	var forceRefreshContent realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(forceRefreshEnvelope.Content, &forceRefreshContent); err != nil {
		t.Fatalf("decode listener force-refresh content: %v", err)
	}
	if forceRefreshContent.Snapshot.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected force refresh for project-alpha, got %#v", forceRefreshContent)
	}
	if forceRefreshContent.CallID != "call-set-chat-state" {
		t.Fatalf("expected force refresh call id call-set-chat-state, got %#v", forceRefreshContent)
	}

	expectedSnapshot, err := listenersnapshot.BuildListenerSnapshotPayload(
		app.ProjectStates().Main().Snapshot().Document,
		"project-alpha",
	)
	if err != nil {
		t.Fatalf("build expected listener snapshot: %v", err)
	}
	if canonicalAppJSONValue(t, forceRefreshContent.Snapshot) != canonicalAppJSONValue(t, expectedSnapshot) {
		t.Fatalf(
			"expected authoritative listener snapshot %s, got %s",
			canonicalAppJSONValue(t, expectedSnapshot),
			canonicalAppJSONValue(t, forceRefreshContent.Snapshot),
		)
	}
}

func TestAppListenerWebsocketEmitsChatStreamDeltaToFrontend(t *testing.T) {
	// The listener chat stream endpoint should publish frontend streaming updates
	// over the Go websocket hub instead of relying on the Python listener path.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	frontendConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend,
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer frontendConn.CloseNow()
	_ = readAppRouteEnvelopeUntilType(t, frontendConn, realtime.MessageTypeFrontendIdentity, 2)

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-stream", 1),
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha"}}`)); err != nil {
		t.Fatalf("write listener init message: %v", err)
	}
	_ = readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}
	_ = readAppRouteEnvelopeUntilType(t, frontendConn, realtime.MessageTypeListenerCoverageSnapshot, 2)

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"project-alpha","callId":"call-stream","endpointName":"route_emit_chat_stream_delta","payload":{"chatId":"chat-1","sectionId":"chat-section","chunk":{"type":"message_stop","message_id":"assistant-1"}}}}`)); err != nil {
		t.Fatalf("write listener emit-chat-stream-delta endpoint call: %v", err)
	}
	streamEnvelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerRouterResult, 1)
	var streamContent realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(streamEnvelope.Content, &streamContent); err != nil {
		t.Fatalf("decode listener stream result: %v", err)
	}
	if streamContent.ProjectConfigID != "project-alpha" || streamContent.CallID != "call-stream" || !streamContent.OK || streamContent.Result != nil {
		t.Fatalf("unexpected stream listener result %#v", streamContent)
	}

	frontendEnvelope := readAppRouteEnvelopeUntilType(t, frontendConn, realtime.MessageTypeLLMStreamingResponse, 2)
	var frontendContent realtime.LLMStreamingResponseContent
	if err := json.Unmarshal(frontendEnvelope.Content, &frontendContent); err != nil {
		t.Fatalf("decode frontend streaming response: %v", err)
	}
	if frontendContent.ChatID != "chat-1" {
		t.Fatalf("expected streamed chat id chat-1, got %#v", frontendContent)
	}
	if frontendContent.SectionID == nil || *frontendContent.SectionID != "chat-section" {
		t.Fatalf("expected streamed section id chat-section, got %#v", frontendContent.SectionID)
	}
	if frontendContent.ProjectConfigID == nil || *frontendContent.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected streamed project config id project-alpha, got %#v", frontendContent.ProjectConfigID)
	}
	chunk, ok := frontendContent.Chunk.(map[string]any)
	if !ok {
		t.Fatalf("expected streamed chunk payload map, got %#v", frontendContent.Chunk)
	}
	if chunk["type"] != "message_stop" || chunk["message_id"] != "assistant-1" {
		t.Fatalf("unexpected streamed chunk %#v", chunk)
	}
}

func TestAppRunCodeDrawSnapshotsBroadcastBinaryListenerRealtimeEvent(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	authCookie := &http.Cookie{
		Name:  cookieName,
		Value: token,
	}

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["draw-section"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}

	ack := readAppRouteEnvelope(t, listenerConn)
	if ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	uploadBody, uploadContentType := buildAppBinaryUploadBody(t, []byte("listener-snapshot"), "")
	uploadRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteBinaryUpload, uploadBody)
	if err != nil {
		t.Fatalf("new binary upload request: %v", err)
	}
	uploadRequest.Header.Set("Content-Type", uploadContentType)
	uploadRequest.AddCookie(authCookie)

	uploadResponse, err := http.DefaultClient.Do(uploadRequest)
	if err != nil {
		t.Fatalf("post binary upload: %v", err)
	}
	defer uploadResponse.Body.Close()
	if uploadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uploadResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", uploadResponse.StatusCode, string(body))
	}

	var ref binarypayload.ContentRef
	if err := json.NewDecoder(uploadResponse.Body).Decode(&ref); err != nil {
		t.Fatalf("decode binary upload response: %v", err)
	}

	runRequestBody, err := json.Marshal(httpapi.RunCodeRequest{
		ProjectID:       "project-alpha",
		SectionID:       "code-section",
		RunSnapshotMode: "never",
		DrawSnapshotsBySectionID: map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	})
	if err != nil {
		t.Fatalf("marshal run code request: %v", err)
	}

	runRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(string(runRequestBody)))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	runRequest.Header.Set("Content-Type", "application/json")
	runRequest.AddCookie(authCookie)

	runResponse, err := http.DefaultClient.Do(runRequest)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer runResponse.Body.Close()
	if runResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", runResponse.StatusCode, string(body))
	}

	envelope, payload := readAppBinaryEnvelope(t, listenerConn)
	if envelope.MessageType != realtime.MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", envelope.MessageType)
	}
	if string(payload) != "listener-snapshot" {
		t.Fatalf("expected listener snapshot payload, got %q", string(payload))
	}

	var content realtime.ListenerRealtimeEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event content: %v", err)
	}
	if content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha event, got %q", content.ProjectConfigID)
	}
	if content.ShareSessionID != "" {
		t.Fatalf("expected empty share session id, got %q", content.ShareSessionID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.Deltas) != 1 {
		t.Fatalf("expected 1 delta, got %d", len(content.Deltas))
	}
	if content.Deltas[0].Dependency != "draw-section" {
		t.Fatalf("expected draw-section dependency, got %q", content.Deltas[0].Dependency)
	}

	var value struct {
		Type    realtime.DependencyValueType `json:"type"`
		Payload binarypayload.ContentRef     `json:"payload"`
	}
	if err := json.Unmarshal(content.Deltas[0].Value, &value); err != nil {
		t.Fatalf("decode binary dependency value: %v", err)
	}
	if value.Type != realtime.DependencyValueTypeBinary {
		t.Fatalf("expected binary dependency value type, got %q", value.Type)
	}
	if value.Payload != ref {
		t.Fatalf("expected binary ref %#v, got %#v", ref, value.Payload)
	}

	if _, err := app.binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected draw snapshot payload to be deleted after broadcast, got %v", err)
	}
}

func TestAppRunCodeBroadcastsBackendLogEvent(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(
		t,
		conn,
		realtime.ListenerMessageType(realtime.WebsocketMessageTypeBackendLogEvent),
		4,
	)

	var event backendlogs.BackendLogEvent
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.ID == "" {
		t.Fatal("expected backend log event id")
	}
	if event.ProjectID == nil || *event.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha backend log event, got %#v", event.ProjectID)
	}
	if event.Severity != backendlogs.SeverityInfo {
		t.Fatalf("expected info backend log severity, got %q", event.Severity)
	}
	if event.Message != "Started command" {
		t.Fatalf("expected Started command backend log message, got %q", event.Message)
	}
	if event.Timestamp == "" {
		t.Fatal("expected backend log timestamp")
	}
}
