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
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
)

func TestAppSaveProjectsPythonCodeSectionFilesForLSP(t *testing.T) {
	cfg := testConfig(t)
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

	seedAppLSPCodeSectionProject(t, app)

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save lsp code section project: %v", err)
	}

	sectionPath := filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "runner.py")
	content, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read canonical lsp section file: %v", err)
	}
	if string(content) != "print('runner')\n" {
		t.Fatalf("unexpected canonical lsp section content %q", string(content))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner after save: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected normalized runner binding after save")
	}
	if impl.Code.Binding.Path != "code/sections/alpha/runner.py" {
		t.Fatalf("unexpected runner binding path %q", impl.Code.Binding.Path)
	}
}

func TestAppShutdownStopsRuntime(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	stopped := make(chan struct{})
	app.Runtime().Go("wait", func(ctx context.Context) error {
		defer close(stopped)
		<-ctx.Done()
		return nil
	})

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := app.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("runtime task did not stop")
	}
}

func TestAppWiresSeparateProjectStateRuntimes(t *testing.T) {
	t.Parallel()

	cfg := testConfig(t)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	projectStates := app.ProjectStates()
	if projectStates == nil {
		t.Fatal("expected project state registry")
	}
	if app.Terminals() == nil {
		t.Fatal("expected terminal service")
	}

	paths := projectStates.Paths()
	if paths.Main != filepath.Join(cfg.Paths.SettaFilesRoot, "project.json") {
		t.Fatalf("expected main project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "project.json"), paths.Main)
	}
	if paths.Settings != filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json") {
		t.Fatalf("expected settings project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json"), paths.Settings)
	}
	settingsProject, err := projectStates.Settings().Snapshot().Document.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("expected bootstrapped settings project runtime: %v", err)
	}
	if settingsProject.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected bootstrapped settings project name %q, got %q", settingsstate.SettingsProjectName, settingsProject.Name)
	}

	if _, err := projectStates.Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}
	if _, err := projectStates.Settings().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["settings-home"] = projectstate.Project{
			ID:   "settings-home",
			Name: "Settings Home",
		}
		document.DefaultProjectID = "settings-home"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings runtime: %v", err)
	}

	mainSnapshot, err := projectStates.Main().Save(context.Background())
	if err != nil {
		t.Fatalf("save main runtime: %v", err)
	}
	settingsSnapshot, err := projectStates.Settings().Save(context.Background())
	if err != nil {
		t.Fatalf("save settings runtime: %v", err)
	}

	if mainSnapshot.Revision != 2 {
		t.Fatalf("expected main revision 2, got %d", mainSnapshot.Revision)
	}
	if settingsSnapshot.Revision != 3 {
		t.Fatalf("expected settings revision 3 after bootstrap and mutation, got %d", settingsSnapshot.Revision)
	}
	if _, ok := settingsSnapshot.Document.Projects["project-alpha"]; ok {
		t.Fatal("did not expect main project in settings runtime")
	}
}

func TestAppWiresManagedAgentRunFoundationInIDEMode(t *testing.T) {
	t.Parallel()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 8000

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.agentRuns == nil {
		t.Fatal("expected managed agent run service")
	}
	if app.agentRuns.Disabled() {
		t.Fatal("expected managed agent run service to be wired")
	}
	if app.agentRuntime == nil {
		t.Fatal("expected managed agent run runtime")
	}
	if app.agentRuntime.Disabled() {
		t.Fatal("expected managed agent run runtime to be wired")
	}
	if app.runChains == nil {
		t.Fatal("expected run-chain runtime")
	}
	if app.runChains.Disabled() {
		t.Fatal("expected run-chain runtime to stay available through the external-agent step boundary")
	}
}

func TestAppServesManagedAgentRunRoutesWithManagedExecutor(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	provider := newAppTestManagedChatSSEProvider(t,
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Managed agent\"}}]}\n\n",
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n",
		"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":2,\"total_tokens\":10}}\n\n",
		"data: [DONE]\n\n",
	)
	defer provider.Close()
	saveAppManagedLLMEngineConfig(t, cfg, provider.URL)
	saveAppManagedAgentProfile(t, cfg, "profile-alpha", "engine-managed")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppManagedAgentProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	startResponse := postAppManagedWorkflowRoute(
		t,
		server.URL,
		authCookie,
		httpapi.RouteStartAgentRun,
		`{"profileId":"profile-alpha","inputs":{"allowUnscoped":true,"prompt":"Plan this task."}}`,
		"start managed agent run",
	)
	defer startResponse.Body.Close()
	started := decodeAppRunResponse(t, startResponse, "started run")
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running managed run, got %#v", started)
	}

	loaded := waitForAppAgentRunStatus(t, server.URL, authCookie, started.ID, agentruns.RunStatusCompleted)
	if _, err := app.agentRuntime.WaitForRun(context.Background(), started.ID); err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}

	messages, ok := loaded.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected prompt and assistant outputs, got %#v", loaded.Outputs["messages"])
	}
	if message, ok := messages[1].(map[string]any); !ok || appTestMessageText(message) != "Managed agent reply" {
		t.Fatalf("unexpected managed agent output %#v", loaded.Outputs["messages"])
	}
}

func newAppTestManagedChatSSEProvider(t *testing.T, chunks ...string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		for _, chunk := range chunks {
			_, _ = io.WriteString(w, chunk)
			flusher.Flush()
		}
	}))
}

func saveAppManagedLLMEngineConfig(t *testing.T, cfg config.Config, providerURL string) {
	t.Helper()
	configPath := llmconfig.Path(cfg.Paths.SettaFilesRoot)
	allConfigs, err := llmconfig.Load(configPath, llmconfig.LoadOptions{})
	if err != nil {
		t.Fatalf("load llm config defaults: %v", err)
	}
	allConfigs.Configs["primary"] = llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "openai",
		BaseURL:   providerURL + "/v1",
		APIKeyEnv: "OPENAI_API_KEY",
	}
	if err := llmconfig.Save(configPath, allConfigs); err != nil {
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
}

func saveAppManagedAgentProfile(t *testing.T, cfg config.Config, profileID string, engineConfigID string) {
	t.Helper()
	profileStore, err := agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	if err := profileStore.Write([]agentprofiles.Profile{
		{
			ID:             profileID,
			Name:           "Alpha",
			EngineConfigID: &engineConfigID,
		},
	}); err != nil {
		t.Fatalf("write agent profile: %v", err)
	}
}

func seedAppManagedAgentProject(t *testing.T, app *App) {
	t.Helper()
	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}
}

func decodeAppRunResponse(t *testing.T, response *http.Response, label string) agentruns.Run {
	t.Helper()
	var run agentruns.Run
	if err := json.NewDecoder(response.Body).Decode(&run); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	return run
}

func waitForAppAgentRunStatus(t *testing.T, serverURL string, authCookie *http.Cookie, runID string, status agentruns.RunStatus) agentruns.Run {
	t.Helper()
	var loaded agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		response := postAppManagedWorkflowRoute(
			t,
			serverURL,
			authCookie,
			httpapi.RouteGetAgentRun,
			`{"runId":"`+runID+`"}`,
			"get managed run",
		)
		defer response.Body.Close()
		loaded = decodeAppRunResponse(t, response, "managed run")
		return loaded.Status == status
	})
	return loaded
}

func TestAppServesStateMachineRunRoutesWithManagedChatExecutor(t *testing.T) {
	// The real IDE app should be able to start a workflow run, dispatch the
	// child managed chat through the Go executor, and mark the parent workflow
	// completed when the child finishes.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	provider, providerRequests := newAppManagedWorkflowProvider(t)
	defer provider.Close()
	saveAppManagedWorkflowConfig(t, cfg, provider.URL)

	app := newAppManagedWorkflowApp(t, cfg)
	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	started := startAppManagedWorkflowRun(t, server.URL, authCookie)
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", started)
	}
	assertAppManagedWorkflowChildRun(t, app, started)

	parentByID := waitForAppManagedWorkflowParentRun(t, server.URL, authCookie, started.ID)
	if parentByID.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run, got %#v", parentByID)
	}

	latest := waitForAppManagedWorkflowLatestRun(t, server.URL, authCookie, started.ID)
	assertAppManagedWorkflowLatestRun(t, latest)
	assertAppManagedWorkflowProviderRequest(t, providerRequests)
}

type appManagedWorkflowProviderRequest struct {
	Path          string
	Authorization string
	Body          map[string]any
}

func newAppManagedWorkflowProvider(t *testing.T) (*httptest.Server, <-chan appManagedWorkflowProviderRequest) {
	t.Helper()

	providerRequests := make(chan appManagedWorkflowProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case providerRequests <- appManagedWorkflowProviderRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}:
		default:
		}
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
	return provider, providerRequests
}

func saveAppManagedWorkflowConfig(t *testing.T, cfg config.Config, providerURL string) {
	t.Helper()

	saveAppTestLLMConfigs(
		t,
		cfg,
		map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   providerURL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		map[string]llmconfig.ServerConfig{},
	)

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
}

func newAppManagedWorkflowApp(t *testing.T, cfg config.Config) *App {
	t.Helper()

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
	return app
}

func startAppManagedWorkflowRun(t *testing.T, serverURL string, authCookie *http.Cookie) agentruns.Run {
	t.Helper()

	response := postAppManagedWorkflowRoute(t, serverURL, authCookie, httpapi.RouteStartStateMachineRun, `{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`, "workflow start")
	defer response.Body.Close()
	var started agentruns.Run
	if err := json.NewDecoder(response.Body).Decode(&started); err != nil {
		t.Fatalf("decode started workflow run: %v", err)
	}
	return started
}

func assertAppManagedWorkflowChildRun(t *testing.T, app *App, started agentruns.Run) {
	t.Helper()

	childRunIDs := appTestStringList(started.Outputs["childRunIds"])
	if len(childRunIDs) != 1 || strings.TrimSpace(childRunIDs[0]) == "" {
		t.Fatalf("expected one child run id, got %#v", started.Outputs["childRunIds"])
	}
	childRun, err := app.agentRuntime.WaitForRun(context.Background(), childRunIDs[0])
	if err != nil {
		t.Fatalf("wait for child run completion: %v", err)
	}
	if childRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed child run, got %#v", childRun)
	}
	if got := appTestMessageTextMapList(childRun.Outputs["messages"]); len(got) != 2 || appTestMessageText(got[1]) != "Workflow child reply" {
		t.Fatalf("unexpected child run messages %#v", childRun.Outputs["messages"])
	}
}

func waitForAppManagedWorkflowParentRun(t *testing.T, serverURL string, authCookie *http.Cookie, runID string) agentruns.Run {
	t.Helper()

	var parentByID agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		parentByID = getAppManagedWorkflowRunByID(t, serverURL, authCookie, runID)
		return parentByID.Status == agentruns.RunStatusCompleted || parentByID.Status == agentruns.RunStatusFailed
	})
	return parentByID
}

func getAppManagedWorkflowRunByID(t *testing.T, serverURL string, authCookie *http.Cookie, runID string) agentruns.Run {
	t.Helper()

	response := postAppManagedWorkflowRoute(t, serverURL, authCookie, httpapi.RouteGetAgentRun, `{"runId":"`+runID+`"}`, "get parent run")
	defer response.Body.Close()
	var run agentruns.Run
	if err := json.NewDecoder(response.Body).Decode(&run); err != nil {
		t.Fatalf("decode parent run by id: %v", err)
	}
	return run
}

func waitForAppManagedWorkflowLatestRun(t *testing.T, serverURL string, authCookie *http.Cookie, runID string) agentruns.Run {
	t.Helper()

	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		latest = getAppManagedWorkflowLatestRun(t, serverURL, authCookie)
		return latest.ID == runID && latest.Status == agentruns.RunStatusCompleted
	})
	return latest
}

func getAppManagedWorkflowLatestRun(t *testing.T, serverURL string, authCookie *http.Cookie) agentruns.Run {
	t.Helper()

	response := postAppManagedWorkflowRoute(t, serverURL, authCookie, httpapi.RouteGetStateMachineRun, `{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`, "workflow get")
	defer response.Body.Close()
	var latest agentruns.Run
	if err := json.NewDecoder(response.Body).Decode(&latest); err != nil {
		t.Fatalf("decode latest workflow run: %v", err)
	}
	return latest
}

func assertAppManagedWorkflowLatestRun(t *testing.T, latest agentruns.Run) {
	t.Helper()

	if latest.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed workflow run, got %#v", latest)
	}
	if !appTestHasRunEventType(latest, "run_completed") {
		t.Fatalf("expected workflow run_completed event, got %#v", latest.Events)
	}
	if got := appTestStringList(latest.Outputs["reachedEndSectionIds"]); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected workflow to reach end-section, got %#v", latest.Outputs["reachedEndSectionIds"])
	}
}

func assertAppManagedWorkflowProviderRequest(t *testing.T, providerRequests <-chan appManagedWorkflowProviderRequest) {
	t.Helper()

	select {
	case request := <-providerRequests:
		if request.Path != "/v1/chat/completions" {
			t.Fatalf("expected OpenAI chat-completions request, got %q", request.Path)
		}
		if request.Authorization != "Bearer secret" {
			t.Fatalf("expected provider authorization header, got %q", request.Authorization)
		}
		if request.Body["model"] != "gpt-4o-mini" {
			t.Fatalf("expected provider model gpt-4o-mini, got %#v", request.Body["model"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow provider request")
	}
}

func postAppManagedWorkflowRoute(t *testing.T, serverURL string, authCookie *http.Cookie, route string, body string, label string) *http.Response {
	t.Helper()
	return postAppRouteOKWithClient(t, http.DefaultClient, serverURL, authCookie, route, body, label)
}

func postAppRouteOKWithClient(t *testing.T, client *http.Client, serverURL string, authCookie *http.Cookie, route string, body string, label string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", label, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		t.Fatalf("expected %s 200, got %d with body %q", label, response.StatusCode, string(responseBody))
	}
	return response
}

func getAppRouteOK(t *testing.T, serverURL string, authCookie *http.Cookie, route string, label string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, serverURL+"/api"+route, nil)
	if err != nil {
		t.Fatalf("new %s request: %v", label, err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		t.Fatalf("expected %s 200, got %d with body %q", label, response.StatusCode, string(responseBody))
	}
	return response
}

func newAppBlockingManagedWorkflowProvider(
	t *testing.T,
	providerStarted chan<- struct{},
	providerCancelled chan<- struct{},
	releaseProvider <-chan struct{},
) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case providerStarted <- struct{}{}:
		default:
		}
		select {
		case <-r.Context().Done():
			select {
			case providerCancelled <- struct{}{}:
			default:
			}
			return
		case <-releaseProvider:
		}
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
}

func waitForAppSignal(t *testing.T, signal <-chan struct{}, label string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
	}
}

func waitForAppWorkflowRunStatus(t *testing.T, serverURL string, authCookie *http.Cookie, status agentruns.RunStatus) agentruns.Run {
	t.Helper()
	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		response := postAppManagedWorkflowRoute(
			t,
			serverURL,
			authCookie,
			httpapi.RouteGetStateMachineRun,
			`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`,
			"workflow get",
		)
		defer response.Body.Close()
		latest = decodeAppRunResponse(t, response, "latest workflow run")
		return latest.Status == status
	})
	return latest
}

func TestAppStopsStateMachineRunWhileManagedChildIsStillStreaming(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerStarted := make(chan struct{}, 1)
	providerCancelled := make(chan struct{}, 1)
	releaseProvider := make(chan struct{})
	provider := newAppBlockingManagedWorkflowProvider(t, providerStarted, providerCancelled, releaseProvider)
	defer provider.Close()
	defer close(releaseProvider)

	saveAppManagedLLMEngineConfig(t, cfg, provider.URL)

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
	startResponse := postAppManagedWorkflowRoute(
		t,
		server.URL,
		authCookie,
		httpapi.RouteStartStateMachineRun,
		`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`,
		"workflow start",
	)
	defer startResponse.Body.Close()

	waitForAppSignal(t, providerStarted, "workflow child provider request")

	stopResponse := postAppRouteOKWithClient(
		t,
		&http.Client{Timeout: 2 * time.Second},
		server.URL,
		authCookie,
		httpapi.RouteStopStateMachineRun,
		`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`,
		"workflow stop",
	)
	defer stopResponse.Body.Close()

	waitForAppSignal(t, providerCancelled, "workflow child provider cancellation")

	latest := waitForAppWorkflowRunStatus(t, server.URL, authCookie, agentruns.RunStatusCancelled)
	if latest.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled workflow run, got %#v", latest)
	}
	if !appTestHasRunEventType(latest, "run_cancelled") {
		t.Fatalf("expected workflow run_cancelled event, got %#v", latest.Events)
	}
}

func TestAppServesRunChainRoutesAndPersistedReadback(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

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

	startResponse := postAppManagedWorkflowRoute(
		t,
		server.URL,
		authCookie,
		httpapi.RouteStartRunChain,
		`{"spec":{"id":"chain-alpha","name":"Chain Alpha","steps":[]}}`,
		"start run chain",
	)
	defer startResponse.Body.Close()
	started := decodeAppRunResponse(t, startResponse, "started run chain")
	if strings.TrimSpace(started.ID) == "" {
		t.Fatalf("expected run id, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := app.runChains.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for run chain completion: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run chain, got %#v", completed)
	}

	getResponse := postAppManagedWorkflowRoute(
		t,
		server.URL,
		authCookie,
		httpapi.RouteGetAgentRun,
		`{"runId":"`+started.ID+`"}`,
		"get agent run",
	)
	defer getResponse.Body.Close()
	fetched := decodeAppRunResponse(t, getResponse, "fetched run")
	if fetched.ID != started.ID || fetched.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed fetched run %q, got %#v", started.ID, fetched)
	}

	listResponse := getAppRouteOK(t, server.URL, authCookie, httpapi.RouteGetAgentRuns, "get agent runs")
	defer listResponse.Body.Close()

	var runs []agentruns.Run
	if err := json.NewDecoder(listResponse.Body).Decode(&runs); err != nil {
		t.Fatalf("decode runs list: %v", err)
	}
	if len(runs) != 1 || runs[0].ID != started.ID {
		t.Fatalf("expected one run %q in list, got %#v", started.ID, runs)
	}

	stopResponse := postAppManagedWorkflowRoute(
		t,
		server.URL,
		authCookie,
		httpapi.RouteStopRunChain,
		`{"runId":"`+started.ID+`"}`,
		"stop run chain",
	)
	defer stopResponse.Body.Close()
	stopped := decodeAppRunResponse(t, stopResponse, "stopped run chain")
	if stopped.ID != started.ID || stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed stopped run %q, got %#v", started.ID, stopped)
	}
}

func TestAppServesDeleteTerminalsRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post delete terminals: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if _, ok := app.Terminals().Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected terminal session to be deleted")
	}
}

func TestAppServesInterruptTerminalProcessesRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
		Command:    interactiveAppTestBashCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	}

	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	prepareAppInterruptShell(t, app.Terminals(), sessionID, attachment)
	scriptPath := writeAppInterruptibleScript(t)
	startAppInterruptibleForegroundJob(t, app.Terminals(), sessionID, attachment, scriptPath)

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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post interrupt terminal processes: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload httpapi.InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted session, got %#v", payload)
	}

	output := waitForAppTestOutputContains(t, app.Terminals(), sessionID, attachment, "CHILD_EXIT:130")
	if !strings.Contains(output, "CHILD_INTERRUPTED") {
		t.Fatalf("expected terminal to report interrupt, got %q", output)
	}
}

func TestAppServesRunCodeRoute(t *testing.T) {
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
	linkAppBackendCodegenFixture(t, server.URL, authCookie)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(impl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeSaveDoesNotMaterializePluginCodegenOutputs(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_PLUGIN_RUN_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
			},
			SectionVariantMap: map[string]string{
				"code-section": "code-bash-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-bash-variant"},
					DefaultVariantID: "code-bash-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-bash-variant": {
					ID:     "code-bash-variant",
					ImplID: "code-bash-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-bash-impl": {
					ID:   "code-bash-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguageBash,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.sh",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
			},
		}
		project.CodegenTargets = []projectstate.ProjectCodegenTarget{
			{
				Language: "setta-fixture-backend-codegen:typescript",
				Payload: mustAppJSON(t, map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options": map[string]any{
						"className": "AppPluginState",
					},
				}),
			},
		}
		document.Projects["project-alpha"] = project
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	outputRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen")
	if _, err := os.Stat(outputRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected no plugin codegen output before run save, got %v", err)
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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
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

	matches, err := filepath.Glob(filepath.Join(outputRoot, "*", "fixture_state.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no plugin codegen output after run save, got %v", matches)
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(impl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_PLUGIN_RUN_OK")
	if !strings.Contains(output, "APP_PLUGIN_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}
