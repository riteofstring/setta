package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/transcriptionprofiles"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

type appRouteEnvelope struct {
	MessageType realtime.ListenerMessageType `json:"messageType"`
	Content     json.RawMessage              `json:"content"`
}

type appTestCallableSignatureResolver struct {
	result    projectstate.CallableSignatureResult
	ok        bool
	err       error
	callCount int
}

func (s *appTestCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	s.callCount++
	return s.result, s.ok, s.err
}

func TestAppServesFrontendWebsocketRoute(t *testing.T) {
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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	var identity realtime.FrontendIdentityContent
	foundIdentity := false
	for range 2 {
		message := readAppRouteEnvelope(t, conn)
		if message.MessageType != realtime.MessageTypeFrontendIdentity {
			continue
		}
		if err := json.Unmarshal(message.Content, &identity); err != nil {
			t.Fatalf("decode frontend identity content: %v", err)
		}
		foundIdentity = true
		break
	}
	if !foundIdentity {
		t.Fatal("expected frontend identity message from app websocket route")
	}
	if strings.TrimSpace(identity.FrontendAffinityToken) == "" {
		t.Fatal("expected non-empty frontend affinity token")
	}
}

func TestAppServesFrontendWebsocketRouteForConfiguredDevFrontendOrigin(t *testing.T) {
	t.Setenv("SETTA_DEV_FRONTEND_PORT", "3000")
	t.Setenv("SETTA_DEV_FRONTEND_SCHEME", "http")

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			"Origin": []string{"http://127.0.0.1:3000"},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route with dev frontend origin: %v", err)
	}
	defer conn.CloseNow()

	identity := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	var payload realtime.FrontendIdentityContent
	if err := json.Unmarshal(identity.Content, &payload); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if strings.TrimSpace(payload.FrontendAffinityToken) == "" {
		t.Fatal("expected non-empty frontend affinity token")
	}
}

func TestAppFrontendWebsocketSendsInitialNameValidationErrors(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	writeAppJSONBytes(
		t,
		filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.MainFileName),
		appNameValidationTestDocument(t),
	)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNameValidationErrors, 3)
	assertAppNameValidationPayloadOmitsViewModeErrors(t, envelope.Content)
	payload := decodeAppNameValidationErrors(t, envelope.Content)
	if payload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha validation payload, got %#v", payload)
	}
	if len(payload.ProjectErrors) != 1 || payload.ProjectErrors[0] != "Project name cannot include path separators." {
		t.Fatalf("unexpected project name validation payload: %#v", payload.ProjectErrors)
	}
	if got := payload.SectionErrors["section-a"]; len(got) != 1 || got[0] != "Section name cannot include path separators." {
		t.Fatalf("unexpected section name validation payload: %#v", payload.SectionErrors)
	}
}

func TestAppSaveBroadcastsNameValidationErrors(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	writeAppJSONBytes(
		t,
		filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.MainFileName),
		appNameValidationTestDocument(t),
	)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNameValidationErrors, 3)

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNameValidationErrors, 2)
	assertAppNameValidationPayloadOmitsViewModeErrors(t, envelope.Content)
	payload := decodeAppNameValidationErrors(t, envelope.Content)
	if payload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha validation payload after save, got %#v", payload)
	}
	if got := payload.SectionErrors["section-a"]; len(got) != 1 || got[0] != "Section name cannot include path separators." {
		t.Fatalf("unexpected section name validation payload after save: %#v", payload.SectionErrors)
	}
}

func TestAppFrontendWebsocketBroadcastsCompletedWorkflowRunUpdate(t *testing.T) {
	// The real IDE app should broadcast the updated parent workflow run over the
	// frontend websocket when the child chat completes, so workflow UI state can
	// merge the update without a follow-up poll.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")
	t.Cleanup(func() {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			_ = os.RemoveAll(cfg.Paths.WorkspaceRoot)
			if _, err := os.Stat(cfg.Paths.WorkspaceRoot); errors.Is(err, os.ErrNotExist) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Workflow child\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":13,\"completion_tokens\":2,\"total_tokens\":15}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   provider.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{{
		ID:               "engine-managed",
		Name:             "Managed Engine",
		EngineType:       agentruns.EngineTypeSettaLLM,
		SettaLLMConfigID: &managedConfigID,
	}}); err != nil {
		t.Fatalf("write engine config: %v", err)
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

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appManagedWorkflowTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed workflow project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartStateMachineRun,
		strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
	)
	if err != nil {
		t.Fatalf("new start workflow request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start workflow run: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected workflow start 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started workflow run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", started)
	}

	updated := readAppRouteAgentRunUpdate(t, conn, started.ID, agentruns.RunStatusCompleted, 20)
	if got := updated.Inputs["runType"]; got != "state_machine" {
		t.Fatalf("expected workflow run update payload, got %#v", updated.Inputs)
	}
	if got := appTestStringList(updated.Outputs["reachedEndSectionIds"]); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected completed workflow run payload to reach end-section, got %#v", updated.Outputs["reachedEndSectionIds"])
	}
	if !appTestHasRunEventType(updated, "child_run_completed") || !appTestHasRunEventType(updated, "run_completed") {
		t.Fatalf("expected child completion and run completion events in websocket update, got %#v", updated.Events)
	}
}

func TestAppSaveSettingsBroadcastsUpdateSettings(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	// Saving settings should update the runtime snapshot and notify connected frontends.
	document := app.SettingsState().Snapshot().Document
	document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"

	requestBody, err := json.Marshal(httpapi.SaveSettingsRequest{Settings: document})
	if err != nil {
		t.Fatalf("marshal save settings request: %v", err)
	}
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSaveSettings,
		strings.NewReader(string(requestBody)),
	)
	if err != nil {
		t.Fatalf("new save settings request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post save settings: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateSettings, 4)
	var websocketPayload settingsstate.Document
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket settings payload: %v", err)
	}
	if got := websocketPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected websocket renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := app.SettingsState().Snapshot().Document["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected runtime renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
}

func TestAppSetLanguageServerSelectionBroadcastsUpdatePluginRuntime(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	selectedPluginID := "setta-fixture-backend"
	requestBody, err := json.Marshal(httpapi.SetLanguageServerSelectionRequest{
		Language: "fixturedsl",
		PluginID: &selectedPluginID,
	})
	if err != nil {
		t.Fatalf("marshal set language server selection request: %v", err)
	}
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetLanguageServerSelection,
		strings.NewReader(string(requestBody)),
	)
	if err != nil {
		t.Fatalf("new set language server selection request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set language server selection: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdatePluginRuntime, 6)
	var websocketPayload plugins.PluginRuntimeResponse
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket plugin runtime payload: %v", err)
	}
	selection := mustFindAppLanguageServerSelectionStatus(t, websocketPayload.Status.LanguageServerSelections, "fixturedsl")
	if selection.Status != plugins.LanguageServerSelectionStatusPendingRestart {
		t.Fatalf("expected pending restart selection status, got %#v", selection)
	}
	if !selection.RestartRequired {
		t.Fatalf("expected restart required selection status, got %#v", selection)
	}
	if selection.SelectedPluginID == nil || *selection.SelectedPluginID != "setta-fixture-backend" {
		t.Fatalf("expected selected plugin setta-fixture-backend, got %#v", selection.SelectedPluginID)
	}
}

func TestAppRestartLanguageServerBroadcastsUpdatePluginRuntime(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	response := restartAppLanguageServer(t, server.URL, authCookie)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdatePluginRuntime, 4)
	var websocketPayload plugins.PluginRuntimeResponse
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket plugin runtime payload: %v", err)
	}
	selection := mustFindAppLanguageServerSelectionStatus(t, websocketPayload.Status.LanguageServerSelections, "fixturedsl")
	if selection.Status != plugins.LanguageServerSelectionStatusActive {
		t.Fatalf("expected active selection status after restart, got %#v", selection)
	}
	if selection.RestartRequired {
		t.Fatalf("expected restart requirement to clear after restart, got %#v", selection)
	}
	if selection.AppliedPluginID == nil || *selection.AppliedPluginID != "setta-fixture-backend" {
		t.Fatalf("expected applied plugin setta-fixture-backend, got %#v", selection.AppliedPluginID)
	}
}

func TestAppPromptTemplateMutationsBroadcastPromptTemplatesUpdated(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	postPromptTemplate := func(path string, body string) *http.Response {
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new prompt template request %s: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post prompt template request %s: %v", path, err)
		}
		return response
	}

	createResponse := postPromptTemplate(httpapi.RouteCreatePromptTemplate, `{"name":"Greeting","template":"Hello {{ name }}"}`)
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected create prompt template 200, got %d with body %q", createResponse.StatusCode, string(body))
	}
	var created prompttemplates.Template
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode created prompt template: %v", err)
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypePromptTemplatesUpdated, 4)
	var createPayload struct {
		Templates []prompttemplates.Template `json:"templates"`
	}
	if err := json.Unmarshal(createEnvelope.Content, &createPayload); err != nil {
		t.Fatalf("decode create websocket payload: %v", err)
	}
	if len(createPayload.Templates) != 1 || createPayload.Templates[0].ID != created.ID {
		t.Fatalf("expected created prompt template snapshot, got %#v", createPayload.Templates)
	}

	updateResponse := postPromptTemplate(
		httpapi.RouteUpdatePromptTemplate,
		`{"template":{"id":"`+created.ID+`","name":"Greeting v2","template":"Updated {{ name }}","format":"Jinja"}}`,
	)
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected update prompt template 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypePromptTemplatesUpdated, 4)
	var updatePayload struct {
		Templates []prompttemplates.Template `json:"templates"`
	}
	if err := json.Unmarshal(updateEnvelope.Content, &updatePayload); err != nil {
		t.Fatalf("decode update websocket payload: %v", err)
	}
	if len(updatePayload.Templates) != 1 || updatePayload.Templates[0].Name != "Greeting v2" || updatePayload.Templates[0].Template != "Updated {{ name }}" {
		t.Fatalf("expected updated prompt template snapshot, got %#v", updatePayload.Templates)
	}

	deleteResponse := postPromptTemplate(httpapi.RouteDeletePromptTemplate, `{"templateId":"`+created.ID+`"}`)
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete prompt template 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypePromptTemplatesUpdated, 4)
	var deletePayload struct {
		Templates []prompttemplates.Template `json:"templates"`
	}
	if err := json.Unmarshal(deleteEnvelope.Content, &deletePayload); err != nil {
		t.Fatalf("decode delete websocket payload: %v", err)
	}
	if len(deletePayload.Templates) != 0 {
		t.Fatalf("expected empty prompt template snapshot after delete, got %#v", deletePayload.Templates)
	}
}

func TestAppPromptTemplateWatcherBroadcastsFileChangesAndParseFailures(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	promptsDir := filepath.Join(cfg.Paths.SettaFilesRoot, prompttemplates.DirName)
	if err := os.MkdirAll(promptsDir, 0o755); err != nil {
		t.Fatalf("mkdir prompts dir: %v", err)
	}
	templatePath := filepath.Join(promptsDir, "template-1.json")
	if err := os.WriteFile(templatePath, []byte("{\n  \"id\": \"template-1\",\n  \"name\": \"Greeting\",\n  \"template\": \"Hello {{ name }}\",\n  \"format\": \"Jinja\",\n  \"inputSchema\": {},\n  \"metadata\": {}\n}\n"), 0o644); err != nil {
		t.Fatalf("write prompt template file: %v", err)
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypePromptTemplatesUpdated, 6)
	var updatePayload struct {
		Templates []prompttemplates.Template `json:"templates"`
	}
	if err := json.Unmarshal(updateEnvelope.Content, &updatePayload); err != nil {
		t.Fatalf("decode watcher prompt template payload: %v", err)
	}
	if len(updatePayload.Templates) != 1 || updatePayload.Templates[0].ID != "template-1" {
		t.Fatalf("expected watcher to broadcast full prompt template snapshot, got %#v", updatePayload.Templates)
	}

	if err := os.WriteFile(templatePath, []byte("{ invalid json\n"), 0o644); err != nil {
		t.Fatalf("write invalid prompt template file: %v", err)
	}

	logEnvelope := readAppRouteEnvelopeUntilType(
		t,
		conn,
		realtime.ListenerMessageType(realtime.WebsocketMessageTypeBackendLogEvent),
		6,
	)
	var event backendlogs.BackendLogEvent
	if err := json.Unmarshal(logEnvelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.Message != "Failed to parse prompt templates; keeping previous prompts" {
		t.Fatalf("expected prompt parse failure log, got %#v", event)
	}
	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypePromptTemplatesUpdated, 250*time.Millisecond)
}

func TestAppArtifactWatcherBroadcastsImageFileChanges(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 8000
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

	watchedID := "artifacts/watched-image.png"
	watchedPath := filepath.Join(cfg.Paths.SettaFilesRoot, filepath.FromSlash(watchedID))
	if err := os.MkdirAll(filepath.Dir(watchedPath), 0o755); err != nil {
		t.Fatalf("mkdir watched artifact parent: %v", err)
	}
	if err := os.WriteFile(watchedPath, []byte("seed-image"), 0o644); err != nil {
		t.Fatalf("write watched artifact: %v", err)
	}
	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = artifactWatcherTestProject(t, watchedID)
		return document, nil
	}); err != nil {
		t.Fatalf("seed artifact watcher project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	if err := os.WriteFile(watchedPath, []byte("updated-image"), 0o644); err != nil {
		t.Fatalf("rewrite watched artifact: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateArtifacts, 2)
	var content realtime.UpdateArtifactsContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode update artifacts payload: %v", err)
	}
	if content.UpdateType != "update" || len(content.Artifacts) != 1 {
		t.Fatalf("unexpected update artifacts payload %#v", content)
	}

	artifactJSON, err := json.Marshal(content.Artifacts[0])
	if err != nil {
		t.Fatalf("re-encode watched image artifact: %v", err)
	}
	var imageArtifact artifacts.ImageArtifact
	if err := json.Unmarshal(artifactJSON, &imageArtifact); err != nil {
		t.Fatalf("decode watched image artifact: %v", err)
	}
	if imageArtifact.ID != watchedID {
		t.Fatalf("expected watched image id %q, got %#v", watchedID, imageArtifact)
	}

	payload, err := app.binaryStore.ReadBytes(imageArtifact.Value.ContentID)
	if err != nil {
		t.Fatalf("read watched image bytes from binary store: %v", err)
	}
	if string(payload) != "updated-image" {
		t.Fatalf("expected updated image bytes, got %q", string(payload))
	}
}

func TestAppSaveLLMConfigBroadcastsLLMUpdates(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := os.WriteFile(
		llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
		[]byte("ANTHROPIC_API_KEY=managed-secret\nSETTA_MANAGED_LLM_API_KEY_NAMES=[\"ANTHROPIC_API_KEY\"]\n"),
		0o644,
	); err != nil {
		t.Fatalf("seed managed api keys: %v", err)
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	payload, err := json.Marshal(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "anthropic-main",
	})
	if err != nil {
		t.Fatalf("marshal llm config request: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLLMConfig, strings.NewReader(string(payload)))
	if err != nil {
		t.Fatalf("new llm config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm config: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	configEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMConfigUpdated, 4)
	var configPayload llmconfig.AllConfigs
	if err := json.Unmarshal(configEnvelope.Content, &configPayload); err != nil {
		t.Fatalf("decode llm config websocket payload: %v", err)
	}
	if configPayload.DefaultConfigID != "anthropic-main" {
		t.Fatalf("expected websocket default config id anthropic-main, got %#v", configPayload)
	}

	apiKeysEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var apiKeysPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(apiKeysEnvelope.Content, &apiKeysPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if got := apiKeysPayload.APIKeys["ANTHROPIC_API_KEY"]; got != "managed-secret" {
		t.Fatalf("expected managed api key refresh after config save, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.Revision <= 0 {
		t.Fatalf("expected positive managed api key revision, got %#v", apiKeysPayload)
	}
}

func TestAppSaveLLMConfigBroadcastsCorruptManagedAPIKeySnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := os.MkdirAll(cfg.Paths.WorkspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	if err := os.WriteFile(
		llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
		[]byte("ANTHROPIC_API_KEY=managed-secret\nSETTA_MANAGED_LLM_API_KEY_NAMES=not-json\n"),
		0o644,
	); err != nil {
		t.Fatalf("seed corrupt managed api keys: %v", err)
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	payload, err := json.Marshal(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "anthropic-main",
	})
	if err != nil {
		t.Fatalf("marshal llm config request: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLLMConfig, strings.NewReader(string(payload)))
	if err != nil {
		t.Fatalf("new llm config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm config: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	apiKeysEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var apiKeysPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(apiKeysEnvelope.Content, &apiKeysPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if !apiKeysPayload.Corrupt {
		t.Fatalf("expected corrupt websocket snapshot, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.ErrorCode == nil || *apiKeysPayload.ErrorCode != llmconfig.ManagedAPIKeysCorruptErrorCode {
		t.Fatalf("expected corrupt error code, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.Message == nil || *apiKeysPayload.Message != "Managed API key index in .env is not valid JSON." {
		t.Fatalf("expected corrupt message to survive websocket broadcast, got %#v", apiKeysPayload)
	}
	if len(apiKeysPayload.APIKeys) != 0 || apiKeysPayload.Revision != 0 {
		t.Fatalf("expected corrupt websocket snapshot to fail closed, got %#v", apiKeysPayload)
	}
}

func TestAppSaveLLMConfigBroadcastsUnavailableManagedAPIKeySnapshot(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	if err := os.WriteFile(filepath.Join(cfg.Paths.RuntimeRoot, "file_locks"), []byte("occupied"), 0o644); err != nil {
		t.Fatalf("occupy managed api key lock root: %v", err)
	}

	payload, err := json.Marshal(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "anthropic-main",
	})
	if err != nil {
		t.Fatalf("marshal llm config request: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLLMConfig, strings.NewReader(string(payload)))
	if err != nil {
		t.Fatalf("new llm config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm config: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	apiKeysEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var apiKeysPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(apiKeysEnvelope.Content, &apiKeysPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if apiKeysPayload.Corrupt {
		t.Fatalf("expected unavailable websocket snapshot without corrupt flag, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.ErrorCode == nil || *apiKeysPayload.ErrorCode != llmconfig.ManagedAPIKeysUnavailableErrorCode {
		t.Fatalf("expected unavailable error code, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.Message == nil || !strings.Contains(*apiKeysPayload.Message, "Failed creating .env API key store lock directory:") {
		t.Fatalf("expected unavailable read failure message to survive websocket broadcast, got %#v", apiKeysPayload)
	}
	if len(apiKeysPayload.APIKeys) != 0 || apiKeysPayload.Revision != 0 {
		t.Fatalf("expected unavailable websocket snapshot to fail closed, got %#v", apiKeysPayload)
	}
}

func TestAppSetLLMAPIKeysBroadcastsRevisionedSnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "openai-main",
	}); err != nil {
		t.Fatalf("seed llm config: %v", err)
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"saved-secret"},"expectedRevision":0}`),
	)
	if err != nil {
		t.Fatalf("new llm api keys request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm api keys: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	var routePayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.NewDecoder(response.Body).Decode(&routePayload); err != nil {
		t.Fatalf("decode llm api keys response: %v", err)
	}
	if routePayload.Revision <= 0 {
		t.Fatalf("expected positive revision, got %#v", routePayload)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var websocketPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if got := websocketPayload.APIKeys["OPENAI_API_KEY"]; got != "saved-secret" {
		t.Fatalf("expected saved secret in websocket payload, got %#v", websocketPayload)
	}
	if websocketPayload.Revision != routePayload.Revision {
		t.Fatalf("expected websocket revision %d, got %#v", routePayload.Revision, websocketPayload)
	}
}

func TestAppSetLLMAPIKeysRevisionConflictDoesNotBroadcastSnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "openai-main",
	}); err != nil {
		t.Fatalf("seed llm config: %v", err)
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	firstRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"saved-secret"},"expectedRevision":0}`),
	)
	if err != nil {
		t.Fatalf("new initial llm api keys request: %v", err)
	}
	firstRequest.Header.Set("Content-Type", "application/json")
	firstRequest.AddCookie(authCookie)

	firstResponse, err := http.DefaultClient.Do(firstRequest)
	if err != nil {
		t.Fatalf("post initial llm api keys: %v", err)
	}
	defer firstResponse.Body.Close()
	if firstResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(firstResponse.Body)
		t.Fatalf("expected initial 200, got %d with body %q", firstResponse.StatusCode, string(body))
	}
	var firstPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.NewDecoder(firstResponse.Body).Decode(&firstPayload); err != nil {
		t.Fatalf("decode initial llm api keys response: %v", err)
	}
	if firstPayload.Revision <= 0 {
		t.Fatalf("expected positive initial revision, got %#v", firstPayload)
	}

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)

	staleRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"stale-secret"},"expectedRevision":0}`),
	)
	if err != nil {
		t.Fatalf("new stale llm api keys request: %v", err)
	}
	staleRequest.Header.Set("Content-Type", "application/json")
	staleRequest.AddCookie(authCookie)

	staleResponse, err := http.DefaultClient.Do(staleRequest)
	if err != nil {
		t.Fatalf("post stale llm api keys: %v", err)
	}
	defer staleResponse.Body.Close()
	if staleResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(staleResponse.Body)
		t.Fatalf("expected 409, got %d with body %q", staleResponse.StatusCode, string(body))
	}
	var conflictPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.NewDecoder(staleResponse.Body).Decode(&conflictPayload); err != nil {
		t.Fatalf("decode stale llm api keys response: %v", err)
	}
	if conflictPayload.ErrorCode == nil || *conflictPayload.ErrorCode != llmconfig.ManagedAPIKeysRevisionConflictErrorCode {
		t.Fatalf("expected revision conflict error code, got %#v", conflictPayload)
	}
	if conflictPayload.Revision != firstPayload.Revision {
		t.Fatalf("expected stale write to preserve revision %d, got %#v", firstPayload.Revision, conflictPayload)
	}

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 500*time.Millisecond)
}

func TestAppExternalAgentConfigMutationsBroadcastSnapshotUpdates(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateExternalAgentConfig,
		strings.NewReader(`{"name":"Codex","toolType":"codex","runMode":"app_server"}`),
	)
	if err != nil {
		t.Fatalf("new create external agent config request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post create external agent config: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", createResponse.StatusCode, string(body))
	}
	var created externalagentconfigs.Config
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode create external agent config response: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("expected created external agent config id, got %#v", created)
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeExternalAgentConfigsUpdated, 4)
	var createdSnapshot realtime.ExternalAgentConfigsUpdatedContent
	if err := json.Unmarshal(createEnvelope.Content, &createdSnapshot); err != nil {
		t.Fatalf("decode external agent config websocket create payload: %v", err)
	}
	if len(createdSnapshot.Configs) != 1 {
		t.Fatalf("expected one external agent config after create, got %#v", createdSnapshot.Configs)
	}
	if createdSnapshot.Configs[0].ID != created.ID {
		t.Fatalf("expected created external agent config id %q in websocket payload, got %#v", created.ID, createdSnapshot.Configs)
	}

	updateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpdateExternalAgentConfig,
		strings.NewReader(`{"config":{"id":"`+created.ID+`","name":"Codex Updated","toolType":"codex","runMode":"app_server","settingsAllowSettaEdits":true,"workingDirStrategy":"project_root"}}`),
	)
	if err != nil {
		t.Fatalf("new update external agent config request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.AddCookie(authCookie)

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("post update external agent config: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeExternalAgentConfigsUpdated, 4)
	var updatedSnapshot realtime.ExternalAgentConfigsUpdatedContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatedSnapshot); err != nil {
		t.Fatalf("decode external agent config websocket update payload: %v", err)
	}
	if len(updatedSnapshot.Configs) != 1 {
		t.Fatalf("expected one external agent config after update, got %#v", updatedSnapshot.Configs)
	}
	if updatedSnapshot.Configs[0].Name != "Codex Updated" {
		t.Fatalf("expected updated external agent config name, got %#v", updatedSnapshot.Configs[0])
	}

	deleteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteExternalAgentConfig,
		strings.NewReader(`{"configId":"`+created.ID+`"}`),
	)
	if err != nil {
		t.Fatalf("new delete external agent config request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("post delete external agent config: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeExternalAgentConfigsUpdated, 4)
	var deletedSnapshot realtime.ExternalAgentConfigsUpdatedContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deletedSnapshot); err != nil {
		t.Fatalf("decode external agent config websocket delete payload: %v", err)
	}
	if len(deletedSnapshot.Configs) != 0 {
		t.Fatalf("expected empty external agent config list after delete, got %#v", deletedSnapshot.Configs)
	}
}

func TestAppEngineConfigMutationsBroadcastSnapshotUpdates(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateEngineConfig,
		strings.NewReader(`{"name":"Codex","engineType":"external_agent","externalAgentConfigId":"external-codex"}`),
	)
	if err != nil {
		t.Fatalf("new create engine config request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post create engine config: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", createResponse.StatusCode, string(body))
	}
	var created agentruns.EngineConfig
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode create engine config response: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("expected created engine config id, got %#v", created)
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeEngineConfigsUpdated, 4)
	var createdSnapshot realtime.EngineConfigsUpdatedContent
	if err := json.Unmarshal(createEnvelope.Content, &createdSnapshot); err != nil {
		t.Fatalf("decode engine config websocket create payload: %v", err)
	}
	if len(createdSnapshot.Configs) != 1 {
		t.Fatalf("expected one engine config after create, got %#v", createdSnapshot.Configs)
	}
	if createdSnapshot.Configs[0].ID != created.ID {
		t.Fatalf("expected created engine config id %q in websocket payload, got %#v", created.ID, createdSnapshot.Configs)
	}
	if createdSnapshot.Configs[0].RuntimeSupport == nil || !createdSnapshot.Configs[0].RuntimeSupport.Thinking {
		t.Fatalf("expected external-agent runtime support in websocket payload, got %#v", createdSnapshot.Configs[0])
	}

	updateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpdateEngineConfig,
		strings.NewReader(`{"config":{"id":"`+created.ID+`","name":"Codex Updated","engineType":"external_agent","externalAgentConfigId":"external-codex-updated"}}`),
	)
	if err != nil {
		t.Fatalf("new update engine config request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.AddCookie(authCookie)

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("post update engine config: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeEngineConfigsUpdated, 4)
	var updatedSnapshot realtime.EngineConfigsUpdatedContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatedSnapshot); err != nil {
		t.Fatalf("decode engine config websocket update payload: %v", err)
	}
	if len(updatedSnapshot.Configs) != 1 {
		t.Fatalf("expected one engine config after update, got %#v", updatedSnapshot.Configs)
	}
	if updatedSnapshot.Configs[0].Name != "Codex Updated" {
		t.Fatalf("expected updated engine config name, got %#v", updatedSnapshot.Configs[0])
	}
	if updatedSnapshot.Configs[0].ExternalAgentConfigID == nil || *updatedSnapshot.Configs[0].ExternalAgentConfigID != "external-codex-updated" {
		t.Fatalf("expected updated external agent config id, got %#v", updatedSnapshot.Configs[0])
	}

	deleteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteEngineConfig,
		strings.NewReader(`{"configId":"`+created.ID+`"}`),
	)
	if err != nil {
		t.Fatalf("new delete engine config request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("post delete engine config: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeEngineConfigsUpdated, 4)
	var deletedSnapshot realtime.EngineConfigsUpdatedContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deletedSnapshot); err != nil {
		t.Fatalf("decode engine config websocket delete payload: %v", err)
	}
	if len(deletedSnapshot.Configs) != 0 {
		t.Fatalf("expected empty engine config list after delete, got %#v", deletedSnapshot.Configs)
	}
}

func TestAppTranscriptionProfileMutationsBroadcastTranscriptionProfilesUpdated(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:       "openai-file",
				Model:    "whisper-1",
				Provider: "openai",
			},
			"openai-realtime": {
				ID:       "openai-realtime",
				Model:    "gpt-4o-transcribe",
				Provider: "openai",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("seed llm config: %v", err)
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateTranscriptionProfile,
		strings.NewReader(`{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200}`),
	)
	if err != nil {
		t.Fatalf("new create transcription profile request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post create transcription profile: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", createResponse.StatusCode, string(body))
	}
	var created transcriptionprofiles.Profile
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode create transcription profile response: %v", err)
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeTranscriptionProfilesUpdated, 4)
	var createdSnapshot realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(createEnvelope.Content, &createdSnapshot); err != nil {
		t.Fatalf("decode transcription profile websocket create payload: %v", err)
	}
	if len(createdSnapshot.Profiles) != 1 {
		t.Fatalf("expected one transcription profile after create, got %#v", createdSnapshot.Profiles)
	}
	if createdSnapshot.Profiles[0].ID != created.ID {
		t.Fatalf("expected created transcription profile id %q in websocket payload, got %#v", created.ID, createdSnapshot.Profiles)
	}

	updateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpdateTranscriptionProfile,
		strings.NewReader(`{"profile":{"id":"`+created.ID+`","name":"Realtime v2","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1600}}`),
	)
	if err != nil {
		t.Fatalf("new update transcription profile request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.AddCookie(authCookie)

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("post update transcription profile: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeTranscriptionProfilesUpdated, 4)
	var updatedSnapshot realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatedSnapshot); err != nil {
		t.Fatalf("decode transcription profile websocket update payload: %v", err)
	}
	if len(updatedSnapshot.Profiles) != 1 {
		t.Fatalf("expected one transcription profile after update, got %#v", updatedSnapshot.Profiles)
	}
	if updatedSnapshot.Profiles[0].Name != "Realtime v2" {
		t.Fatalf("expected updated transcription profile name, got %#v", updatedSnapshot.Profiles[0])
	}

	deleteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteTranscriptionProfile,
		strings.NewReader(`{"profileId":"`+created.ID+`"}`),
	)
	if err != nil {
		t.Fatalf("new delete transcription profile request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("post delete transcription profile: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeTranscriptionProfilesUpdated, 4)
	var deletedSnapshot realtime.TranscriptionProfilesUpdatedContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deletedSnapshot); err != nil {
		t.Fatalf("decode transcription profile websocket delete payload: %v", err)
	}
	if len(deletedSnapshot.Profiles) != 0 {
		t.Fatalf("expected empty transcription profile snapshot after delete, got %#v", deletedSnapshot.Profiles)
	}
}

func TestAppAgentProfileMutationsBroadcastAgentProfilesUpdated(t *testing.T) {
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateAgentProfile,
		strings.NewReader(`{"name":"Planner","description":"Planning profile","systemPrompt":"Plan tasks","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-1","toolAllowlist":["tool.a"],"memoryScope":"workspace"}`),
	)
	if err != nil {
		t.Fatalf("new create agent profile request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post create agent profile: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", createResponse.StatusCode, string(body))
	}
	var created agentprofiles.Profile
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode create agent profile response: %v", err)
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAgentProfilesUpdated, 4)
	var createdSnapshot realtime.AgentProfilesUpdatedContent
	if err := json.Unmarshal(createEnvelope.Content, &createdSnapshot); err != nil {
		t.Fatalf("decode agent profile websocket create payload: %v", err)
	}
	if len(createdSnapshot.Profiles) != 1 {
		t.Fatalf("expected one agent profile after create, got %#v", createdSnapshot.Profiles)
	}
	if createdSnapshot.Profiles[0].ID != created.ID {
		t.Fatalf("expected created agent profile id %q in websocket payload, got %#v", created.ID, createdSnapshot.Profiles)
	}

	updateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpdateAgentProfile,
		strings.NewReader(`{"profile":{"id":"`+created.ID+`","name":"Planner v2","description":"Updated profile","systemPrompt":"Plan better","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-2","toolAllowlist":["tool.b"],"memoryScope":"project"}}`),
	)
	if err != nil {
		t.Fatalf("new update agent profile request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.AddCookie(authCookie)

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("post update agent profile: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAgentProfilesUpdated, 4)
	var updatedSnapshot realtime.AgentProfilesUpdatedContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatedSnapshot); err != nil {
		t.Fatalf("decode agent profile websocket update payload: %v", err)
	}
	if len(updatedSnapshot.Profiles) != 1 {
		t.Fatalf("expected one agent profile after update, got %#v", updatedSnapshot.Profiles)
	}
	if updatedSnapshot.Profiles[0].Name != "Planner v2" {
		t.Fatalf("expected updated agent profile name, got %#v", updatedSnapshot.Profiles[0])
	}

	deleteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteAgentProfile,
		strings.NewReader(`{"profileId":"`+created.ID+`"}`),
	)
	if err != nil {
		t.Fatalf("new delete agent profile request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("post delete agent profile: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAgentProfilesUpdated, 4)
	var deletedSnapshot realtime.AgentProfilesUpdatedContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deletedSnapshot); err != nil {
		t.Fatalf("decode agent profile websocket delete payload: %v", err)
	}
	if len(deletedSnapshot.Profiles) != 0 {
		t.Fatalf("expected empty agent profile snapshot after delete, got %#v", deletedSnapshot.Profiles)
	}
}

func TestAppSaveSettingsProjectMaterializesLiveSettings(t *testing.T) {
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

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"] = false
		return document, nil
	}); err != nil {
		t.Fatalf("seed live settings runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	if _, err := app.ProjectStates().Settings().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		return appSettingsProjectMaterializerTestDocument(
			t,
			filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
		), nil
	}); err != nil {
		t.Fatalf("save settings project runtime: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateSettings, 4)
	var websocketPayload settingsstate.Document
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket settings payload: %v", err)
	}
	if got := websocketPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected websocket renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := websocketPayload["backend"].(map[string]any)["autosave"]; got != false {
		t.Fatalf("expected websocket autosave false, got %#v", got)
	}
	if got := websocketPayload["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected websocket mismatch-refetch false to survive materialization, got %#v", got)
	}

	runtimeDocument := app.SettingsState().Snapshot().Document
	if got := runtimeDocument["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"]; got != float64(222) {
		t.Fatalf("expected runtime terminal height 222, got %#v", got)
	}
	if got := runtimeDocument["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected runtime mismatch-refetch false to survive materialization, got %#v", got)
	}

	content, err := os.ReadFile(filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName))
	if err != nil {
		t.Fatalf("read persisted settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode persisted settings file: %v", err)
	}
	if got := persisted["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := persisted["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected persisted mismatch-refetch false to survive materialization, got %#v", got)
	}
}

func TestAppBroadcastsAndHydratesLSPDiagnostics(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
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

	seedAppLSPCodeSectionProjectWithSource(t, app, "__fixture_error__\n")
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save lsp diagnostics project: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLSPDiagnostics, 4)
	var websocketPayload projectstate.LSPDiagnosticsPayload
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket diagnostics payload: %v", err)
	}
	assertAppLSPDiagnosticsPayload(t, websocketPayload)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new diagnostics request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post latest diagnostics: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var routePayload projectstate.LSPDiagnosticsPayload
	if err := json.NewDecoder(response.Body).Decode(&routePayload); err != nil {
		t.Fatalf("decode route diagnostics payload: %v", err)
	}
	assertAppLSPDiagnosticsPayload(t, routePayload)
}

func appSettingsProjectMaterializerTestDocument(t *testing.T, sharedSettingsPath string) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]projectstate.Project{
			"settings-home": {
				ID:   "settings-home",
				Name: "Settings Home",
				TopLevelSectionIDs: []string{
					"backend-section",
					"terminal-section",
				},
				SectionVariantMap: map[string]string{
					"backend-section":  "backend-variant",
					"terminal-section": "terminal-variant",
				},
				Sections: map[string]projectstate.Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
					"terminal-section": {
						ID:               "terminal-section",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"backend-variant": {
						ID:     "backend-variant",
						Name:   sharedSettingsPath,
						ImplID: "backend-impl",
					},
					"terminal-variant": {
						ID:     "terminal-variant",
						Name:   sharedSettingsPath,
						ImplID: "terminal-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"backend-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["backend"],
							"topLevelParamId":"backend-root",
							"codeObjVariantMap":{
								"backend-root":"backend-root-variant",
								"rename-setting":"rename-setting-variant",
								"autosave-setting":"autosave-setting-variant"
							}
						}`),
					},
					"terminal-impl": {
						ID:   "terminal-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"terminal-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["terminalSectionDefault"],
							"topLevelParamId":"terminal-root",
							"codeObjVariantMap":{
								"terminal-root":"terminal-root-variant",
								"size-setting":"size-setting-variant",
								"height-setting":"height-setting-variant"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"rename-setting": {
						ID:               "rename-setting",
						Name:             "renameRefactorMode",
						VariantIDs:       []string{"rename-setting-variant"},
						DefaultVariantID: "rename-setting-variant",
					},
					"autosave-setting": {
						ID:               "autosave-setting",
						Name:             "autosave",
						VariantIDs:       []string{"autosave-setting-variant"},
						DefaultVariantID: "autosave-setting-variant",
					},
					"terminal-root": {
						ID:               "terminal-root",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-root-variant"},
						DefaultVariantID: "terminal-root-variant",
					},
					"size-setting": {
						ID:               "size-setting",
						Name:             "size",
						VariantIDs:       []string{"size-setting-variant"},
						DefaultVariantID: "size-setting-variant",
					},
					"height-setting": {
						ID:               "height-setting",
						Name:             "height",
						VariantIDs:       []string{"height-setting-variant"},
						DefaultVariantID: "height-setting-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"backend-root-variant": {
						ID:     "backend-root-variant",
						ImplID: "backend-root-impl",
					},
					"rename-setting-variant": {
						ID:     "rename-setting-variant",
						ImplID: "rename-setting-impl",
					},
					"autosave-setting-variant": {
						ID:     "autosave-setting-variant",
						ImplID: "autosave-setting-impl",
					},
					"terminal-root-variant": {
						ID:     "terminal-root-variant",
						ImplID: "terminal-root-impl",
					},
					"size-setting-variant": {
						ID:     "size-setting-variant",
						ImplID: "size-setting-impl",
					},
					"height-setting-variant": {
						ID:     "height-setting-variant",
						ImplID: "height-setting-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"backend-root-impl": {
						ID:   "backend-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"backend-root-impl",
							"type":"NestedParam",
							"children":["rename-setting","autosave-setting"]
						}`),
					},
					"rename-setting-impl": {
						ID:   "rename-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"rename-setting-impl",
							"type":"TextParam",
							"value":"ALWAYS_RENAME"
						}`),
					},
					"autosave-setting-impl": {
						ID:   "autosave-setting-impl",
						Type: "SwitchParam",
						Payload: projectstate.RawJSON(`{
							"id":"autosave-setting-impl",
							"type":"SwitchParam",
							"value":"false"
						}`),
					},
					"terminal-root-impl": {
						ID:   "terminal-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"terminal-root-impl",
							"type":"NestedParam",
							"children":["size-setting"]
						}`),
					},
					"size-setting-impl": {
						ID:   "size-setting-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"size-setting-impl",
							"type":"NestedParam",
							"children":["height-setting"]
						}`),
					},
					"height-setting-impl": {
						ID:   "height-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"height-setting-impl",
							"type":"TextParam",
							"value":"222"
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize settings project document: %v", err)
	}
	return document
}

func TestAppBroadcastsDedupedWatchCodeSignatureWarnings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
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

	// Seed a project that is already in view-edit mode so the route has to
	// persist the exit and push the updated project state back to the frontend.
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Folders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
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

	watchFile := filepath.Join(watchDir, "missing.py")
	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write initial watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.missing.MissingFunc:function"]
		return ok && len(entry.SectionIDs) == 1 && entry.SectionsCount == 1
	})

	initialSnapshot := app.ProjectStates().Main().Snapshot()
	initialProjectData := readAppWatchCodePluginProjectData(t, initialSnapshot.Document, "project-alpha")
	initialHash := initialProjectData.Registry["pkg.missing.MissingFunc:function"].SignatureHash

	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value, extra):\n    return value + extra\n"), 0o644); err != nil {
		t.Fatalf("write signature-change watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.missing.MissingFunc:function"]
		return ok && entry.SignatureHash != initialHash
	})

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNotification, 6)
	var notification realtime.NotificationContent
	if err := json.Unmarshal(envelope.Content, &notification); err != nil {
		t.Fatalf("decode notification content: %v", err)
	}
	if notification.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha warning notification, got %#v", notification)
	}
	if notification.Type != realtime.NotificationTypeWarning {
		t.Fatalf("expected warning notification type, got %#v", notification)
	}
	if notification.Message != "Watch Code could not resolve params for MissingFunc. Verify the module import path or add imports in gen code prefix." {
		t.Fatalf("unexpected warning notification %#v", notification)
	}
	if !notification.Temporary {
		t.Fatalf("expected temporary warning notification, got %#v", notification)
	}
	if notification.Timestamp == "" {
		t.Fatalf("expected warning notification timestamp, got %#v", notification)
	}

	secondSnapshot := app.ProjectStates().Main().Snapshot()
	secondProjectData := readAppWatchCodePluginProjectData(t, secondSnapshot.Document, "project-alpha")
	secondHash := secondProjectData.Registry["pkg.missing.MissingFunc:function"].SignatureHash

	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value, extra, third):\n    return value + extra + third\n"), 0o644); err != nil {
		t.Fatalf("write repeated signature-change watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.missing.MissingFunc:function"]
		return ok && entry.SignatureHash != secondHash
	})

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeNotification, 750*time.Millisecond)
}

func TestAppWatchCodeFileUpdatesBroadcastProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
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
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Folders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
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

	watchFile := filepath.Join(watchDir, "created.py")
	if err := os.WriteFile(watchFile, []byte("def created(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.created.created:function"]
		return ok && len(entry.SectionIDs) == 1 && entry.SectionsCount == 1
	})

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var createContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(createEnvelope.Content, &createContent); err != nil {
		t.Fatalf("decode create project state update content: %v", err)
	}
	if createContent.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha create state update, got %q", createContent.ProjectState.ProjectConfig.ID)
	}
	createWatchCodeData := mustAppWebsocketWatchCodeProjectData(t, createContent.ProjectState.PluginData)
	createEntry, ok := createWatchCodeData.Registry["pkg.created.created:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry in websocket update, got %#v", createWatchCodeData.Registry)
	}
	if len(createEntry.SectionIDs) != 1 {
		t.Fatalf("expected one created section id in websocket update, got %#v", createEntry)
	}
	createdSectionID := createEntry.SectionIDs[0]
	if _, ok := createContent.ProjectState.Sections[createdSectionID]; !ok {
		t.Fatalf("expected created section %q in websocket update, got %#v", createdSectionID, createContent.ProjectState.Sections)
	}

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		return len(projectData.Registry) == 0
	})

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var deleteContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deleteContent); err != nil {
		t.Fatalf("decode delete project state update content: %v", err)
	}
	if deleteContent.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha delete state update, got %q", deleteContent.ProjectState.ProjectConfig.ID)
	}
	deleteWatchCodeData := mustAppWebsocketWatchCodeProjectData(t, deleteContent.ProjectState.PluginData)
	if len(deleteWatchCodeData.Registry) != 0 {
		t.Fatalf("expected empty watch code registry after delete, got %#v", deleteWatchCodeData.Registry)
	}
	if _, ok := deleteContent.ProjectState.Sections[createdSectionID]; ok {
		t.Fatalf("expected deleted watch code section %q to be absent, got %#v", createdSectionID, deleteContent.ProjectState.Sections[createdSectionID])
	}
}

func TestAppSetSectionNameRouteBroadcastsRenamePromptAndProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
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

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = renameRefactorServiceTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed rename refactor project: %v", err)
	}
	if _, err := app.SettingsState().Mutate(func(document settingsstate.Document) (settingsstate.Document, error) {
		next := renameRefactorSettingsDocument(t, projectstate.RenameRefactorModeAlwaysAsk)
		return next, nil
	}); err != nil {
		t.Fatalf("seed rename refactor settings: %v", err)
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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetSectionName,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source","name":"Renamed Section","frontendOpId":"rename-op-1"}`),
	)
	if err != nil {
		t.Fatalf("new set section name request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set section name: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var (
		foundProjectUpdate bool
		foundRenamePrompt  bool
	)
	for range 6 {
		envelope := readAppRouteEnvelope(t, conn)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			var content realtime.ProjectStateUpdateContent
			if err := json.Unmarshal(envelope.Content, &content); err != nil {
				t.Fatalf("decode project state update content: %v", err)
			}
			if content.ProjectState.ProjectConfig.ID != "project-alpha" {
				t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
			}
			completedRenameOp := false
			for _, completedOpID := range content.CompletedOpIDs {
				if completedOpID == "rename-op-1" {
					completedRenameOp = true
					break
				}
			}
			if !completedRenameOp {
				t.Fatalf("expected completed rename op in websocket project update, got %#v", content.CompletedOpIDs)
			}
			foundProjectUpdate = true
		case realtime.MessageTypeReturnRenameRefactorResults:
			var content realtime.RenameRefactorBroadcastContent
			if err := json.Unmarshal(envelope.Content, &content); err != nil {
				t.Fatalf("decode rename refactor content: %v", err)
			}
			if content.ProjectConfigID != "project-alpha" {
				t.Fatalf("expected project-alpha rename prompt, got %q", content.ProjectConfigID)
			}
			if content.FrontendOpID != "rename-op-1" {
				t.Fatalf("expected rename-op-1 prompt, got %q", content.FrontendOpID)
			}
			if content.RenameMode != projectstate.RenameRefactorModeAlwaysAsk {
				t.Fatalf("expected ALWAYS_ASK rename mode, got %q", content.RenameMode)
			}
			if len(content.ChangedNodeValues) != 1 {
				t.Fatalf("expected one changed node value, got %#v", content.ChangedNodeValues)
			}
			if content.ChangedNodeValues[0].NewValue != "state.Renamed_Section + state.Renamed_Section" {
				t.Fatalf("unexpected rename prompt new value %q", content.ChangedNodeValues[0].NewValue)
			}
			foundRenamePrompt = true
		}
		if foundProjectUpdate && foundRenamePrompt {
			break
		}
	}
	if !foundProjectUpdate {
		t.Fatal("expected websocket project state update after section rename")
	}
	if !foundRenamePrompt {
		t.Fatal("expected websocket rename prompt after section rename")
	}
}

func TestAppSetStateMachineSectionSettingsRouteBroadcastsProjectStateUpdate(t *testing.T) {
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
		document.Projects["project-alpha"] = websocketStateMachineTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed workflow project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetStateMachineSectionSettings,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"gate-section","machineGroupId":"workflow-a","label":"Decision","gateType":"XOR","frontendOpId":"workflow-section-op"}`),
	)
	if err != nil {
		t.Fatalf("new set state machine section settings request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set state machine section settings: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	// The overview pane does not apply a local optimistic patch for this toggle,
	// so the websocket update is what clears the stale eye/hide affordances live.
	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	completedWorkflowOp := false
	for _, completedOpID := range content.CompletedOpIDs {
		if completedOpID == "workflow-section-op" {
			completedWorkflowOp = true
			break
		}
	}
	if !completedWorkflowOp {
		t.Fatalf("expected completed workflow op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after successful workflow update, got %#v", content.PendingOpIDs)
	}
}

func TestAppChildSectionIncrementerRoutesBroadcastProjectStateUpdate(t *testing.T) {
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

	project, listRootID := websocketIncrementerTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed incrementer project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateChildSectionsViaIncrementer,
		strings.NewReader(`{"projectConfigId":"project-alpha","calledBy":"`+listRootID+`","implType":"Callable","numChildren":1,"frontendOpId":"incrementer-op-create"}`),
	)
	if err != nil {
		t.Fatalf("new incrementer create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post incrementer create: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected 200 from incrementer create, got %d with body %q", createResponse.StatusCode, string(body))
	}

	createEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var createContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(createEnvelope.Content, &createContent); err != nil {
		t.Fatalf("decode incrementer create project state update: %v", err)
	}
	if createContent.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", createContent.ProjectState.ProjectConfig.ID)
	}
	createCompleted := false
	for _, completedOpID := range createContent.CompletedOpIDs {
		if completedOpID == "incrementer-op-create" {
			createCompleted = true
			break
		}
	}
	if !createCompleted {
		t.Fatalf("expected completed incrementer create op in websocket update, got %#v", createContent.CompletedOpIDs)
	}
	childCountAfterCreate := 0
	for _, parent := range createContent.ProjectState.ParentSectionMap {
		if parent != nil && *parent == listRootID {
			childCountAfterCreate++
		}
	}
	if childCountAfterCreate != 1 {
		t.Fatalf("expected one live child after incrementer create, got %d in %#v", childCountAfterCreate, createContent.ProjectState.ParentSectionMap)
	}

	deleteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteChildSectionsViaDecrementer,
		strings.NewReader(`{"projectConfigId":"project-alpha","calledBy":"`+listRootID+`","numChildren":1,"frontendOpId":"incrementer-op-delete"}`),
	)
	if err != nil {
		t.Fatalf("new incrementer delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("post incrementer delete: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected 200 from incrementer delete, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var deleteContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deleteContent); err != nil {
		t.Fatalf("decode incrementer delete project state update: %v", err)
	}
	deleteCompleted := false
	for _, completedOpID := range deleteContent.CompletedOpIDs {
		if completedOpID == "incrementer-op-delete" {
			deleteCompleted = true
			break
		}
	}
	if !deleteCompleted {
		t.Fatalf("expected completed incrementer delete op in websocket update, got %#v", deleteContent.CompletedOpIDs)
	}
	childCountAfterDelete := 0
	for _, parent := range deleteContent.ProjectState.ParentSectionMap {
		if parent != nil && *parent == listRootID {
			childCountAfterDelete++
		}
	}
	if childCountAfterDelete != 0 {
		t.Fatalf("expected no live children after incrementer delete, got %d in %#v", childCountAfterDelete, deleteContent.ProjectState.ParentSectionMap)
	}
	listRootVariantID, ok := project.SectionVariantMap[listRootID]
	if !ok {
		t.Fatalf("expected list root variant for %q", listRootID)
	}
	listRootVariant, ok := project.SectionVariants[listRootVariantID]
	if !ok {
		t.Fatalf("expected list root variant %q", listRootVariantID)
	}
	listRootPayload, ok := deleteContent.ProjectState.SectionImpls[listRootVariant.ImplID]
	if !ok {
		t.Fatalf("expected list root impl payload %q after delete", listRootVariant.ImplID)
	}
	var listRootPayloadObject map[string]any
	if err := json.Unmarshal(listRootPayload, &listRootPayloadObject); err != nil {
		t.Fatalf("decode list root payload after delete: %v", err)
	}
	children, ok := listRootPayloadObject["children"].([]any)
	if !ok {
		t.Fatalf("expected list root children array after delete, got %#v", listRootPayloadObject["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected list root children to be empty after delete, got %#v", children)
	}
}

func TestAppCreateTopLevelSectionRouteBroadcastsProjectStateUpdate(t *testing.T) {
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

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                   "project-alpha",
			Name:                 "Alpha",
			ProjectChatWindowing: &defaultWindowing,
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Callable","frontendOpId":"create-top-level-op"}`),
	)
	if err != nil {
		t.Fatalf("new create top-level section request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post create top-level section: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200 from create top-level section, got %d with body %q", response.StatusCode, string(body))
	}

	var createResult projectstate.CreateTopLevelSectionResult
	if err := json.NewDecoder(response.Body).Decode(&createResult); err != nil {
		t.Fatalf("decode create top-level section response: %v", err)
	}
	if strings.TrimSpace(createResult.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", createResult)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if _, ok := content.ProjectState.Sections[createResult.SectionID]; !ok {
		t.Fatalf("expected websocket update to include created section %q", createResult.SectionID)
	}
	completedCreateOp := false
	for _, completedOpID := range content.CompletedOpIDs {
		if completedOpID == "create-top-level-op" {
			completedCreateOp = true
			break
		}
	}
	if !completedCreateOp {
		t.Fatalf("expected completed create op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after create, got %#v", content.PendingOpIDs)
	}
}

func TestAppDeleteSectionsRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["allowed-callable-section"],"frontendOpId":"delete-section-op"}`),
	)
	if err != nil {
		t.Fatalf("new delete sections request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post delete sections: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if _, ok := content.ProjectState.Sections["allowed-callable-section"]; ok {
		t.Fatalf("expected websocket update to remove deleted section, got %#v", content.ProjectState.Sections["allowed-callable-section"])
	}
	if _, ok := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]; ok {
		t.Fatalf("expected websocket update to remove deleted section variant mapping, got %#v", content.ProjectState.ProjectConfig.SectionVariantMap)
	}
	if !containsAppString(content.CompletedOpIDs, "delete-section-op") {
		t.Fatalf("expected completed delete-section-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after delete, got %#v", content.PendingOpIDs)
	}
}

func TestAppSetCodeRouteBroadcastsProjectStateUpdateForWatchCodeBoundSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n","frontendOpId":"set-code-op"}`),
	)
	if err != nil {
		t.Fatalf("new set code request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-code-op") {
		t.Fatalf("expected completed set-code-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after set code, got %#v", content.PendingOpIDs)
	}
	watchCodeData := mustAppWebsocketWatchCodeProjectData(t, content.ProjectState.PluginData)
	entry, ok := watchCodeData.Registry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected websocket update to include derived watch code entry, got %#v", watchCodeData.Registry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected websocket update to include one callable section binding, got %#v", entry)
	}
}

func mustAppWebsocketWatchCodeProjectData(
	t *testing.T,
	pluginData map[string]projectstate.RawJSON,
) projectstate.WatchCodePluginProjectData {
	t.Helper()

	payload, ok := pluginData[testAppWatchCodeProviderPluginID]
	if !ok {
		t.Fatalf("expected websocket update to include %q plugin data, got %#v", testAppWatchCodeProviderPluginID, pluginData)
	}
	var projectData projectstate.WatchCodePluginProjectData
	if err := json.Unmarshal(payload, &projectData); err != nil {
		t.Fatalf("decode watch code project plugin data: %v", err)
	}
	return projectData.Normalized()
}

func TestAppMoveSectionsRouteBroadcastsProjectStateUpdate(t *testing.T) {
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

	project, dictSectionID, listSectionID := websocketMoveSectionsTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed move sections project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteMoveSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["`+listSectionID+`"],"newParentId":"`+dictSectionID+`","newIndex":0,"frontendOpId":"move-sections-op"}`),
	)
	if err != nil {
		t.Fatalf("new move sections request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post move sections: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "move-sections-op") {
		t.Fatalf("expected completed move-sections-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after move, got %#v", content.PendingOpIDs)
	}
	if parent := content.ProjectState.ParentSectionMap[listSectionID]; parent == nil || *parent != dictSectionID {
		t.Fatalf("expected moved list parent %q, got %#v", dictSectionID, parent)
	}

	dictVariantID := content.ProjectState.ProjectConfig.SectionVariantMap[dictSectionID]
	dictImplID := content.ProjectState.SectionVariants[dictVariantID].Impl
	var dictPayload struct {
		Children []string `json:"children"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[dictImplID], &dictPayload); err != nil {
		t.Fatalf("decode dict impl payload: %v", err)
	}
	if len(dictPayload.Children) != 1 || dictPayload.Children[0] != listSectionID {
		t.Fatalf("expected moved list child in websocket update, got %#v", dictPayload.Children)
	}
}

func TestAppCreateNewSectionVariantRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateNewSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","frontendOpId":"create-section-variant-op"}`),
	)
	if err != nil {
		t.Fatalf("new create section variant request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post create section variant: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "create-section-variant-op") {
		t.Fatalf("expected completed create-section-variant-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	sectionCore := content.ProjectState.Sections["allowed-callable-section"]
	if len(sectionCore.Variants) < 2 {
		t.Fatalf("expected allowed-callable-section to gain a variant, got %#v", sectionCore.Variants)
	}
	activeVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]
	if activeVariantID == "" {
		t.Fatal("expected active variant after section variant creation")
	}
	if got := content.ProjectState.SectionVariants[activeVariantID].Name; got == "" {
		t.Fatal("expected created section variant name in websocket update")
	}
}

func TestAppSetSectionVariantRouteBroadcastsProjectStateUpdate(t *testing.T) {
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
		document.Projects["project-alpha"] = websocketSetSectionVariantCodegenProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed section variant codegen project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","variantId":"callable-variant-2","frontendOpId":"set-section-variant-op"}`),
	)
	if err != nil {
		t.Fatalf("new set section variant request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set section variant: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-section-variant-op") {
		t.Fatalf("expected completed set-section-variant-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if got := content.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]; got != "callable-variant-2" {
		t.Fatalf("expected websocket update to select callable-variant-2, got %q", got)
	}
	generatedSectionID := content.ProjectState.SingletonSections.GenPythonCode
	if generatedSectionID == nil || *generatedSectionID == "" {
		t.Fatalf("expected generated python singleton in websocket update, got %#v", content.ProjectState.SingletonSections)
	}
	generatedVariantID := content.ProjectState.ProjectConfig.SectionVariantMap[*generatedSectionID]
	if generatedVariantID == "" {
		t.Fatalf("expected generated python variant mapping for %q", *generatedSectionID)
	}
	generatedImplID := content.ProjectState.SectionVariants[generatedVariantID].Impl
	payload := string(content.ProjectState.SectionImpls[generatedImplID])
	if !strings.Contains(payload, `sorted(`) {
		t.Fatalf("expected websocket update to include regenerated python for sorted variant, got %q", payload)
	}
}

func TestAppToggleIsEditingViewModeRouteBroadcastsProjectStateUpdate(t *testing.T) {
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
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                "project-alpha",
			Name:              "Alpha",
			ActiveViewModeID:  "focus",
			IsEditingViewMode: true,
			Sections:          map[string]projectstate.Section{"section-a": {ID: "section-a", Name: "Section A"}},
			TopLevelSections:  map[string]projectstate.TopLevelSectionLayout{},
			WindowSpaces:      map[string]projectstate.WindowSpaceConfig{},
			ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
				InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
				Order:         []string{},
			},
			ViewModes: map[string]projectstate.ViewMode{
				"focus": {
					ID:                    "focus",
					Name:                  "Focus",
					SortIndex:             0,
					VisibilityBySectionID: map[string]bool{"section-a": true},
					TopLevelSections:      map[string]projectstate.TopLevelSectionLayout{},
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed view mode project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteToggleIsEditingViewMode,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"toggle-view-mode-op"}`),
	)
	if err != nil {
		t.Fatalf("new toggle view mode request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post toggle view mode: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if content.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected websocket update to leave project outside view editing mode")
	}
	completedToggleOp := false
	for _, completedOpID := range content.CompletedOpIDs {
		if completedOpID == "toggle-view-mode-op" {
			completedToggleOp = true
			break
		}
	}
	if !completedToggleOp {
		t.Fatalf("expected completed toggle op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after toggle, got %#v", content.PendingOpIDs)
	}

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	if project.IsEditingViewMode {
		t.Fatal("expected persisted project state to exit view editing mode")
	}
}

func TestAppSetCallableRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","callableName":"sorted","refetchParams":false,"frontendOpId":"set-callable-op"}`),
	)
	if err != nil {
		t.Fatalf("new set callable request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set callable: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-callable-op") {
		t.Fatalf("expected completed set-callable-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	callableVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]
	callableImplID := content.ProjectState.SectionVariants[callableVariantID].Impl
	var payload struct {
		Callable string `json:"callable"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[callableImplID], &payload); err != nil {
		t.Fatalf("decode callable section impl payload: %v", err)
	}
	if payload.Callable != "allowed-callable-2" {
		t.Fatalf("expected websocket update to select allowed-callable-2, got %#v", payload)
	}
}

func TestAppChangeParamImplRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteChangeParamImpl,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","selectedId":"SliderParam","frontendOpId":"change-param-impl-op"}`),
	)
	if err != nil {
		t.Fatalf("new change param impl request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post change param impl: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "change-param-impl-op") {
		t.Fatalf("expected completed change-param-impl-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	paramVariant := content.ProjectState.CodeObjVariants["allowed-param-variant"]
	if !containsAppString(paramVariant.NonPresetImpls, paramVariant.Impl) {
		t.Fatalf(
			"expected current impl %q to be selectable in nonPresetImpls, got %#v",
			paramVariant.Impl,
			paramVariant.NonPresetImpls,
		)
	}
	var payload struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(content.ProjectState.CodeObjImpls[paramVariant.Impl], &payload); err != nil {
		t.Fatalf("decode changed param impl payload: %v", err)
	}
	if payload.Type != "SliderParam" {
		t.Fatalf("expected websocket update to switch param impl to SliderParam, got %#v", payload)
	}
}

func TestAppSetTextBlockTextRouteBroadcastsProjectStateUpdate(t *testing.T) {
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

	project, textSectionID := websocketTextBlockTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed text block project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetTextBlockText,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"`+textSectionID+`","text":"hello from websocket text block","frontendOpId":"set-text-block-op"}`),
	)
	if err != nil {
		t.Fatalf("new set text block text request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set text block text: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-text-block-op") {
		t.Fatalf("expected completed set-text-block-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	var payload struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(content.ProjectState.Sections[textSectionID].SharedModifier, &payload); err != nil {
		t.Fatalf("decode text block shared modifier payload: %v", err)
	}
	if payload.Text != "hello from websocket text block" {
		t.Fatalf("expected websocket update to include edited text, got %#v", payload)
	}
}

// LSP-driven callable auto-refetches are backend-owned mutations, so the app
// must explicitly rebroadcast the updated project graph back to connected IDE
// frontends when missing imports later become valid.
func TestAppCallableAutoRefetchBroadcastsProjectStateUpdate(t *testing.T) {
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

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appCallableAutoRefetchProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed callable auto-refetch project state: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	resolver := &appTestCallableSignatureResolver{
		ok: true,
		result: projectstate.CallableSignatureResult{
			Status: projectstate.SignatureHelpStatusMatched,
			Params: []projectstate.CallableParamProposal{
				{
					Name:           "x",
					TypeAnnotation: "SupportsFloat",
					PassingStyle:   "POSITIONAL_ONLY",
				},
			},
		},
	}
	if err := refetchCallableParamsAndBroadcast(
		context.Background(),
		app.ProjectStates().Main(),
		app.websocketHub,
		"project-alpha",
		[]string{"callable-section"},
		resolver,
	); err != nil {
		t.Fatalf("refetch callable params and broadcast: %v", err)
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if len(content.CompletedOpIDs) != 0 {
		t.Fatalf("expected no completed op ids for auto-refetch broadcast, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids for auto-refetch broadcast, got %#v", content.PendingOpIDs)
	}

	callableVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]
	callableSectionImplID := content.ProjectState.SectionVariants[callableVariantID].Impl
	var sectionPayload struct {
		Callable          string            `json:"callable"`
		CodeObjVariantMap map[string]string `json:"codeObjVariantMap"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[callableSectionImplID], &sectionPayload); err != nil {
		t.Fatalf("decode callable section impl payload: %v", err)
	}
	if sectionPayload.Callable == "" {
		t.Fatalf("expected callable section to remain bound after auto-refetch, got %#v", sectionPayload)
	}
	if got := content.ProjectState.CodeObjs[sectionPayload.Callable].Name; got != "math.sqrt" {
		t.Fatalf("expected auto-refetched callable name math.sqrt, got %q", got)
	}
	if _, ok := sectionPayload.CodeObjVariantMap[sectionPayload.Callable]; !ok {
		t.Fatalf("expected callable variant mapping for %q, got %#v", sectionPayload.Callable, sectionPayload.CodeObjVariantMap)
	}

	shownParams, ok := content.ProjectState.ShownParamIDs[callableVariantID]
	if !ok {
		t.Fatalf("expected shown params for callable variant %q, got %#v", callableVariantID, content.ProjectState.ShownParamIDs)
	}
	if len(shownParams.Pinned.TopLevelParamIDs) != 0 {
		t.Fatalf("expected no pinned auto-refetched params, got %#v", shownParams.Pinned.TopLevelParamIDs)
	}
	if len(shownParams.Unpinned.TopLevelParamIDs) != 1 {
		t.Fatalf("expected one unpinned auto-refetched param, got %#v", shownParams.Unpinned.TopLevelParamIDs)
	}

	paramID := shownParams.Unpinned.TopLevelParamIDs[0]
	if got := content.ProjectState.CodeObjs[paramID].Name; got != "x" {
		t.Fatalf("expected auto-refetched param name x, got %q", got)
	}
	paramVariantID := content.ProjectState.CodeObjs[paramID].DefaultVariant
	if paramVariantID == nil {
		t.Fatalf("expected auto-refetched param %q to have a default variant", paramID)
	}
	paramImplID := content.ProjectState.CodeObjVariants[*paramVariantID].Impl
	var paramPayload struct {
		TypeAnnotation string `json:"typeAnnotation"`
	}
	if err := json.Unmarshal(content.ProjectState.CodeObjImpls[paramImplID], &paramPayload); err != nil {
		t.Fatalf("decode auto-refetched param impl payload: %v", err)
	}
	if paramPayload.TypeAnnotation != "SupportsFloat" {
		t.Fatalf("expected auto-refetched param type annotation SupportsFloat, got %q", paramPayload.TypeAnnotation)
	}
}

func TestAppSetParamEnteredValueRouteBroadcastsProjectParamUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetParamEnteredValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"99","frontendOpId":"set-param-op"}`),
	)
	if err != nil {
		t.Fatalf("new set param entered value request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set param entered value: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectParam, 4)
	var content realtime.ProjectParamUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project param update content: %v", err)
	}
	if content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha param update, got %q", content.ProjectConfigID)
	}
	if content.SectionID != "allowed-params-section" {
		t.Fatalf("expected allowed-params-section update, got %q", content.SectionID)
	}
	if content.ParamInfoID != "allowed-param" {
		t.Fatalf("expected allowed-param update, got %q", content.ParamInfoID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-param-op") {
		t.Fatalf("expected completed set-param-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	if content.CodeObj.ID != "allowed-param" {
		t.Fatalf("expected code object allowed-param, got %#v", content.CodeObj)
	}
	if content.CodeObjVariant.ID != "allowed-param-variant" {
		t.Fatalf("expected code object variant allowed-param-variant, got %#v", content.CodeObjVariant)
	}
	var payload struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(content.CodeObjImpl, &payload); err != nil {
		t.Fatalf("decode param impl payload: %v", err)
	}
	if payload.Value != "99" {
		t.Fatalf("expected websocket update to include updated param value, got %#v", payload)
	}
}

func websocketIncrementerTestProject(t *testing.T) (projectstate.Project, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	result, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{ImplType: "ListRoot"},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create list root project fixture: %v", err)
	}
	return project, result.SectionID
}

func websocketMoveSectionsTestProject(t *testing.T) (projectstate.Project, string, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	dictName := "Settings"
	listName := "Items"

	dictResult, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "Dict",
			Name:     &dictName,
			Position: &projectstate.Position{X: 240, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create dict project fixture: %v", err)
	}

	listResult, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "ListRoot",
			Name:     &listName,
			Position: &projectstate.Position{X: 40, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create list project fixture: %v", err)
	}

	return project, dictResult.SectionID, listResult.SectionID
}

func websocketTextBlockTestProject(t *testing.T) (projectstate.Project, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	textName := "Notes"
	result, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "TextBlock",
			Name:     &textName,
			Position: &projectstate.Position{X: 40, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create text block project fixture: %v", err)
	}

	return project, result.SectionID
}

func TestAppServesTerminalWebsocketRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}
}

func websocketStateMachineTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"gate-section",
		},
		SectionVariantMap: map[string]string{
			"gate-section": "gate-variant",
		},
		Sections: map[string]projectstate.Section{
			"gate-section": {
				ID:               "gate-section",
				Name:             "Gate Section",
				VariantIDs:       []string{"gate-variant"},
				DefaultVariantID: "gate-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"gate-variant": {
				ID:     "gate-variant",
				ImplID: "gate-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"gate-impl": {
				ID:   "gate-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: websocketStateMachineTestRawJSON(t, map[string]any{
					"id":             "gate-impl",
					"type":           "StateMachineGate",
					"machineGroupId": "workflow-a",
					"label":          "Gate",
					"gateType":       string(projectstate.StateMachineGateTypeAND),
					"ui": map[string]any{
						"showDetails": false,
					},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow test project: %v", err)
	}
	return project
}

func websocketStateMachineTestRawJSON(t *testing.T, payload map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow test payload: %v", err)
	}
	return projectstate.RawJSON(raw)
}

func appNameValidationTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				ActiveViewModeID: "focus",
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"section-a": {X: 0, Y: 0},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID:   "focus",
						Name: "Focus",
						TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
							"section-a": {X: 0, Y: 0},
						},
						VisibilityBySectionID: map[string]bool{
							"section-a": true,
						},
					},
				},
				SectionVariantMap: map[string]string{
					"section-a": "section-a-variant",
				},
				Sections: map[string]projectstate.Section{
					"section-a": {
						ID:               "section-a",
						Name:             "Section A",
						VariantIDs:       []string{"section-a-variant"},
						DefaultVariantID: "section-a-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-a-variant": {
						ID:     "section-a-variant",
						ImplID: "section-a-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-a-impl": {
						ID:      "section-a-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: websocketStateMachineTestRawJSON(t, map[string]any{"id": "section-a-impl", "type": "TextBlock"}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize app name validation test document: %v", err)
	}

	project := document.Projects["project-alpha"]
	project.Name = "bad/name"
	section := project.Sections["section-a"]
	section.Name = "bad/name"
	project.Sections[section.ID] = section
	viewMode := project.ViewModes[project.ActiveViewModeID]
	viewMode.Name = "bad/name"
	project.ViewModes[viewMode.ID] = viewMode
	document.Projects[project.ID] = project
	return document
}

func decodeAppNameValidationErrors(t *testing.T, raw json.RawMessage) projectstate.NameValidationErrors {
	t.Helper()

	var payload projectstate.NameValidationErrors
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode name validation errors payload: %v", err)
	}
	return payload
}

func assertAppNameValidationPayloadOmitsViewModeErrors(t *testing.T, raw json.RawMessage) {
	t.Helper()

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode raw name validation payload: %v", err)
	}
	if _, ok := payload["viewModeErrors"]; ok {
		t.Fatalf("expected name validation payload to omit viewModeErrors, got %s", string(raw))
	}
}

func TestAppServesTerminalWebsocketReconnectAndReplaysBufferedHistory(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

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

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
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

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1)
	headers := http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}

	first, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial first terminal websocket route: %v", err)
	}

	if frame := readAppRawFrame(t, first); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := first.Write(context.Background(), websocket.MessageText, []byte("first app line\n")); err != nil {
		t.Fatalf("write first terminal input: %v", err)
	}
	if output := readAppRawFrameUntilContains(t, first, "first app line", 4); !strings.Contains(output, "first app line") {
		t.Fatalf("expected terminal output to include first app line, got %q", output)
	}
	if err := first.Close(websocket.StatusNormalClosure, ""); err != nil {
		t.Fatalf("close first terminal websocket: %v", err)
	}

	if err := app.Terminals().Write(sessionID, []byte("after disconnect\n")); err != nil {
		t.Fatalf("write buffered app terminal output after disconnect: %v", err)
	}
	waitForCondition(t, func() bool {
		history, err := app.Terminals().History(sessionID)
		if err != nil {
			return false
		}
		return strings.Contains(history, "after disconnect")
	})

	second, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial second terminal websocket route: %v", err)
	}
	defer second.CloseNow()

	if frame := readAppRawFrame(t, second); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker on reconnect, got %q", frame)
	}
	replayedHistory := readAppRawFrame(t, second)
	if !strings.Contains(replayedHistory, "first app line") || !strings.Contains(replayedHistory, "after disconnect") {
		t.Fatalf("expected reattached app terminal history to include buffered output, got %q", replayedHistory)
	}
}

func TestAppServesTerminalWebsocketResizeUpdatesStoredSessionDimensions(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

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

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":31,"cols":97}`)); err != nil {
		t.Fatalf("write app terminal resize message: %v", err)
	}

	waitForCondition(t, func() bool {
		info, ok := app.Terminals().Session(sessionID)
		return ok && info.Rows == 31 && info.Columns == 97
	})

	info, ok := app.Terminals().Session(sessionID)
	if !ok {
		t.Fatal("expected app terminal session to exist after resize")
	}
	if info.Rows != 31 || info.Columns != 97 {
		t.Fatalf("expected stored app terminal size 97x31, got %dx%d", info.Columns, info.Rows)
	}
}

func prepareCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func readAppRouteEnvelope(t *testing.T, conn *websocket.Conn) appRouteEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket message: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode app websocket message: %v", err)
	}
	return envelope
}

func artifactWatcherTestProject(t *testing.T, imagePath string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"image-section": "image-variant",
		},
		Sections: map[string]projectstate.Section{
			"image-section": {
				ID:               "image-section",
				Name:             "Image",
				VariantIDs:       []string{"image-variant"},
				DefaultVariantID: "image-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"image-variant": {
				ID:     "image-variant",
				ImplID: "image-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"image-impl": {
				ID:   "image-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{
					"id":        "image-impl",
					"type":      "Image",
					"imagePath": imagePath,
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize artifact watcher test project: %v", err)
	}
	return project
}

func readAppBinaryEnvelope(t *testing.T, conn *websocket.Conn) (appRouteEnvelope, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary websocket frame, got %d", messageType)
	}

	header, binaryPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode app binary frame: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode app binary envelope: %v", err)
	}
	return envelope, binaryPayload
}

func readAppRouteEnvelopeUntilType(t *testing.T, conn *websocket.Conn, messageType realtime.ListenerMessageType, maxReads int) appRouteEnvelope {
	t.Helper()

	for range maxReads {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType == messageType {
			return envelope
		}
	}
	t.Fatalf("did not receive app websocket message type %q within %d reads", messageType, maxReads)
	return appRouteEnvelope{}
}

func readAppRouteAgentRunUpdate(
	t *testing.T,
	conn *websocket.Conn,
	runID string,
	status agentruns.RunStatus,
	maxReads int,
) agentruns.Run {
	t.Helper()

	for range maxReads {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType != realtime.MessageTypeAgentRunUpdated {
			continue
		}

		var run agentruns.Run
		if err := json.Unmarshal(envelope.Content, &run); err != nil {
			t.Fatalf("decode agent run update payload: %v", err)
		}
		if run.ID != runID || run.Status != status {
			continue
		}
		return run
	}

	t.Fatalf("did not receive workflow run update %q with status %q within %d reads", runID, status, maxReads)
	return agentruns.Run{}
}

func assertNoAppRouteEnvelopeOfType(t *testing.T, conn *websocket.Conn, messageType realtime.ListenerMessageType, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), remaining)
		_, payload, err := conn.Read(ctx)
		cancel()
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return
			}
			t.Fatalf("read app websocket message: %v", err)
		}

		var envelope appRouteEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode app websocket message: %v", err)
		}
		if envelope.MessageType == messageType {
			t.Fatalf("did not expect app websocket message type %q within %s", messageType, timeout)
		}
	}
}

func readAppRawFrame(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	return string(payload)
}

func readAppRawFrameUntilContains(t *testing.T, conn *websocket.Conn, needle string, maxReads int) string {
	t.Helper()

	buffer := strings.Builder{}
	for range maxReads {
		frame := readAppRawFrame(t, conn)
		buffer.WriteString(frame)
		if strings.Contains(buffer.String(), needle) {
			return buffer.String()
		}
	}

	t.Fatalf("did not receive app terminal output containing %q within %d reads; collected output: %q", needle, maxReads, buffer.String())
	return ""
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

func assertAppLSPDiagnosticsPayload(t *testing.T, payload projectstate.LSPDiagnosticsPayload) {
	t.Helper()

	if payload.ProjectID != "project-alpha" {
		t.Fatalf("unexpected diagnostics project id %q", payload.ProjectID)
	}
	sectionDiagnostics := payload.CodeSections["runner"]
	if len(sectionDiagnostics) != 1 {
		t.Fatalf("expected one runner diagnostic, got %#v", payload.CodeSections)
	}
	if sectionDiagnostics[0].Message != "Fixture TypeScript diagnostic" {
		t.Fatalf("unexpected diagnostic message %q", sectionDiagnostics[0].Message)
	}
	if sectionDiagnostics[0].Code != "fixture-ts" {
		t.Fatalf("unexpected diagnostic code %#v", sectionDiagnostics[0].Code)
	}
}

func canonicalAppJSONValue(t *testing.T, value any) string {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json value %#v: %v", value, err)
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode json %q: %v", string(encoded), err)
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-encode json %q: %v", string(encoded), err)
	}
	return string(normalized)
}

func appCallableAutoRefetchProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"callable-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 40, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Call Section",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-variant-a"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "math.sqrt",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable auto-refetch project: %v", err)
	}
	return project
}

func websocketSetSectionVariantCodegenProject(t *testing.T) projectstate.Project {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{
			"callable-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 40, Y: 40},
		},
		WindowSpaces: map[string]projectstate.WindowSpaceConfig{},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		ProjectChatWindowing: &defaultWindowing,
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant-1", "callable-variant-2"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
			"callable-variant-2": {
				ID:     "callable-variant-2",
				ImplID: "callable-impl-2",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":null,
					"codeObjVariantMap":{}
				}`),
			},
			"callable-impl-2": {
				ID:   "callable-impl-2",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-2",
					"type":"Callable",
					"callable":"callable-2",
					"codeObjVariantMap":{
						"callable-2":"callable-code-variant-2"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-code-variant-2"},
				DefaultVariantID: "callable-code-variant-2",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-code-variant-2": {
				ID:     "callable-code-variant-2",
				ImplID: "callable-code-impl-2",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-code-impl-2": {
				ID:      "callable-code-impl-2",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-code-impl-2","type":"CodeCallable","children":[]}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section variant codegen project: %v", err)
	}
	return project
}
