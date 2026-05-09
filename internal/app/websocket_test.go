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

	"setta/internal/agentruns"
	"setta/internal/artifacts"
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
