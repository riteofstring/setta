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
			"openai-whisper-1": {
				ID:       "openai-whisper-1",
				Model:    "whisper-1",
				Provider: "openai",
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

	started := startAppWorkflowRunViaRoute(t, server.URL, authCookie)

	updated := readAppRouteAgentRunUpdate(t, conn, started.ID, agentruns.RunStatusCompleted, 20)
	assertCompletedWorkflowRunUpdate(t, updated)
}

func startAppWorkflowRunViaRoute(t *testing.T, serverURL string, authCookie *http.Cookie) agentruns.Run {
	t.Helper()

	startRequest, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStartStateMachineRun,
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
	return started
}

func assertCompletedWorkflowRunUpdate(t *testing.T, updated agentruns.Run) {
	t.Helper()

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
	harness := newAppWebsocketMutationHarness(t, cfg)

	createResponse := postAppRouteJSONOK(t, harness, httpapi.RouteCreateExternalAgentConfig, `{"name":"Codex","toolType":"codex","runMode":"app_server"}`)
	created := decodeAppJSONResponse[externalagentconfigs.Config](t, createResponse, "create external agent config")
	if created.ID == "" {
		t.Fatalf("expected created external agent config id, got %#v", created)
	}

	createdSnapshot := readAppMutationContent[realtime.ExternalAgentConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeExternalAgentConfigsUpdated, "external agent config create")
	_ = mustFindExternalAgentConfigSnapshotEntry(t, createdSnapshot.Configs, created.ID)

	updateResponse := postAppRouteJSONOK(t, harness, httpapi.RouteUpdateExternalAgentConfig, `{"config":{"id":"`+created.ID+`","name":"Codex Updated","toolType":"codex","runMode":"app_server","settingsAllowSettaEdits":true,"workingDirStrategy":"project_root"}}`)
	updateResponse.Body.Close()

	updatedSnapshot := readAppMutationContent[realtime.ExternalAgentConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeExternalAgentConfigsUpdated, "external agent config update")
	updatedEntry := mustFindExternalAgentConfigSnapshotEntry(t, updatedSnapshot.Configs, created.ID)
	if updatedEntry.Name != "Codex Updated" {
		t.Fatalf("expected updated external agent config name, got %#v", updatedEntry)
	}

	deleteResponse := postAppRouteJSONOK(t, harness, httpapi.RouteDeleteExternalAgentConfig, `{"configId":"`+created.ID+`"}`)
	deleteResponse.Body.Close()

	deletedSnapshot := readAppMutationContent[realtime.ExternalAgentConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeExternalAgentConfigsUpdated, "external agent config delete")
	if hasExternalAgentConfigSnapshotEntry(deletedSnapshot.Configs, created.ID) {
		t.Fatalf("expected deleted external agent config %q to be absent, got %#v", created.ID, deletedSnapshot.Configs)
	}
}
