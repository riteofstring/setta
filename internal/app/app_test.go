package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/watchcode"
)

func TestAppServesFoundationRoutes(t *testing.T) {
	t.Parallel()

	cfg := config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         "/tmp/workspace",
			SettaHome:             "/tmp/.setta",
			ProfileLookupHome:     "/tmp/.setta",
			SettaFilesRoot:        "/tmp/workspace/setta_files",
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           "/tmp/workspace/setta_files/runtime",
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: "/tmp/.setta/setta_files",
			AutoMode:             config.AutoModeCreateLocal,
		},
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	response, err := http.Get(server.URL + "/api/runtimeInfo")
	if err != nil {
		t.Fatalf("get runtime info: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	var payload httpapi.RuntimeInfo
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode runtime info: %v", err)
	}
	if payload.Mode != "launcher" {
		t.Fatalf("expected mode launcher, got %q", payload.Mode)
	}
	if payload.Paths.SettaFilesLocation != "local" {
		t.Fatalf("expected local files location, got %q", payload.Paths.SettaFilesLocation)
	}
}

func TestAppServesStatusMetaRoutes(t *testing.T) {
	// These live frontend reads should all resolve from the real app stack in IDE mode.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	cookie := newAppTestAuthCookie(t, app)

	for _, testCase := range []struct {
		name string
		path string
	}{
		{name: "backend init status", path: "/api" + httpapi.RouteGetBackendInitStatus},
		{name: "auth refresh status", path: "/api" + httpapi.RouteGetAuthRefreshStatus},
		{name: "setta home info", path: "/api" + httpapi.RouteGetSettaHomeInfo},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodGet, server.URL+testCase.path, nil)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			request.AddCookie(cookie)

			response, err := http.DefaultClient.Do(request)
			if err != nil {
				t.Fatalf("get %s: %v", testCase.name, err)
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(response.Body)
				t.Fatalf("expected %s 200, got %d with body %q", testCase.name, response.StatusCode, string(body))
			}
		})
	}
}

func TestAppServesManagedChatHydrateAndStopRoutes(t *testing.T) {
	// The real IDE app should hydrate persisted managed chats and stop the latest
	// running managed run through the Go-owned route stack.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
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

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-app-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages": []any{
			map[string]any{
				"id":   "user-app",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello app"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 16, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-app",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello app"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-app",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Partial app reply"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
		"usage": map[string]any{
			"promptTokens":     11,
			"completionTokens": 2,
			"totalTokens":      13,
		},
	}
	if err := runStore.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	hydrateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMChat,
		strings.NewReader(`{"chatId":"chat-app-managed","projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new hydrate request: %v", err)
	}
	hydrateRequest.Header.Set("Content-Type", "application/json")
	hydrateRequest.AddCookie(authCookie)

	hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
	if err != nil {
		t.Fatalf("hydrate managed chat: %v", err)
	}
	defer hydrateResponse.Body.Close()
	if hydrateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(hydrateResponse.Body)
		t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
	}

	var hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
		LLMConfig          *struct {
			ID string `json:"id"`
		} `json:"llmConfig"`
	}
	if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratePayload); err != nil {
		t.Fatalf("decode hydrate payload: %v", err)
	}
	if len(hydratePayload.Messages) != 2 {
		t.Fatalf("expected hydrated managed chat messages, got %#v", hydratePayload.Messages)
	}
	if !hydratePayload.WaitingForResponse {
		t.Fatalf("expected running managed chat hydration, got %#v", hydratePayload)
	}
	if hydratePayload.LLMConfig == nil || hydratePayload.LLMConfig.ID != "primary" {
		t.Fatalf("expected primary llm config, got %#v", hydratePayload.LLMConfig)
	}

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"chat-app-managed"}`),
	)
	if err != nil {
		t.Fatalf("new stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped bool    `json:"alreadyStopped"`
		StoppedRunID   *string `json:"stoppedRunId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || *stopPayload.StoppedRunID != run.ID {
		t.Fatalf("expected stopped run id %q, got %#v", run.ID, stopPayload.StoppedRunID)
	}
}

func TestAppServesManagedChatSendAsUnavailableWithoutExecutor(t *testing.T) {
	// The real IDE app should route managed /getLLMResponse requests into the Go
	// owner and surface an explicit 503 until a managed executor is wired.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
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

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusServiceUnavailable {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 503, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		Error struct {
			Code   string `json:"code"`
			Detail string `json:"detail"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode send error payload: %v", err)
	}
	if payload.Error.Code != "agent_runner_unavailable" {
		t.Fatalf("expected agent_runner_unavailable, got %#v", payload)
	}
}

func TestAppServesAppGenSkillRoutes(t *testing.T) {
	// The real app should serve the skills browser routes from the Go-owned filesystem owner.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	fakeHome := filepath.Join(filepath.Dir(cfg.Paths.WorkspaceRoot), "home")
	if err := os.MkdirAll(fakeHome, 0o755); err != nil {
		t.Fatalf("mkdir fake home: %v", err)
	}
	t.Setenv("HOME", fakeHome)
	t.Setenv("AGENTS_HOME", "")
	t.Setenv("CODEX_HOME", "")
	t.Setenv("XDG_CONFIG_HOME", "")

	skillDocPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".agents", "skills", "ui-layout", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(skillDocPath), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(skillDocPath, []byte("# UI Layout\n\nCreate dense dashboard layouts.\n"), 0o644); err != nil {
		t.Fatalf("write skill doc: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	listRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAppGenSkills, nil)
	if err != nil {
		t.Fatalf("new list request: %v", err)
	}
	listRequest.AddCookie(authCookie)
	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("list app gen skills: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected list 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var listPayload struct {
		Skills []struct {
			SkillID string `json:"skillId"`
		} `json:"skills"`
		CustomSkillCreateRootPath *string `json:"customSkillCreateRootPath"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode list payload: %v", err)
	}
	if len(listPayload.Skills) != 1 || listPayload.Skills[0].SkillID != "workspace_agents_skills::ui-layout" {
		t.Fatalf("unexpected list payload %#v", listPayload)
	}
	expectedCreateRoot := filepath.Join(fakeHome, ".agents", "skills")
	if listPayload.CustomSkillCreateRootPath == nil || *listPayload.CustomSkillCreateRootPath != expectedCreateRoot {
		t.Fatalf("unexpected create root %#v", listPayload.CustomSkillCreateRootPath)
	}

	contentRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetAppGenSkillContent, strings.NewReader(`{"skillId":"workspace_agents_skills::ui-layout"}`))
	if err != nil {
		t.Fatalf("new content request: %v", err)
	}
	contentRequest.Header.Set("Content-Type", "application/json")
	contentRequest.AddCookie(authCookie)
	contentResponse, err := http.DefaultClient.Do(contentRequest)
	if err != nil {
		t.Fatalf("read app gen skill content: %v", err)
	}
	defer contentResponse.Body.Close()
	if contentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(contentResponse.Body)
		t.Fatalf("expected content 200, got %d with body %q", contentResponse.StatusCode, string(body))
	}

	var contentPayload struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(contentResponse.Body).Decode(&contentPayload); err != nil {
		t.Fatalf("decode content payload: %v", err)
	}
	if !strings.Contains(contentPayload.Content, "Create dense dashboard layouts.") {
		t.Fatalf("unexpected content payload %#v", contentPayload)
	}

	upsertRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpsertAppGenCustomSkill,
		strings.NewReader(`{"skillId":null,"relativePath":"route-created","content":"# route-created\n\nBody.\n"}`),
	)
	if err != nil {
		t.Fatalf("new upsert request: %v", err)
	}
	upsertRequest.Header.Set("Content-Type", "application/json")
	upsertRequest.AddCookie(authCookie)
	upsertResponse, err := http.DefaultClient.Do(upsertRequest)
	if err != nil {
		t.Fatalf("upsert app gen skill: %v", err)
	}
	defer upsertResponse.Body.Close()
	if upsertResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(upsertResponse.Body)
		t.Fatalf("expected upsert 200, got %d with body %q", upsertResponse.StatusCode, string(body))
	}

	var upsertPayload struct {
		SkillID      string `json:"skillId"`
		SkillDocPath string `json:"skillDocPath"`
		Created      bool   `json:"created"`
	}
	if err := json.NewDecoder(upsertResponse.Body).Decode(&upsertPayload); err != nil {
		t.Fatalf("decode upsert payload: %v", err)
	}
	expectedSkillDocPath := filepath.Join(fakeHome, ".agents", "skills", "route-created", "SKILL.md")
	if upsertPayload.SkillID != "user_agents_skills::route-created" || !upsertPayload.Created || upsertPayload.SkillDocPath != expectedSkillDocPath {
		t.Fatalf("unexpected upsert payload %#v", upsertPayload)
	}
	content, err := os.ReadFile(expectedSkillDocPath)
	if err != nil {
		t.Fatalf("read created skill doc: %v", err)
	}
	if string(content) != "# route-created\n\nBody.\n" {
		t.Fatalf("unexpected created skill doc content %q", string(content))
	}
}

func TestAppServesPluginRuntimeAndFrontendAssets(t *testing.T) {
	// The real app should serve plugin runtime hydration plus declared frontend assets from Go.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "full")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-full", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)
	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		List struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
			} `json:"plugins"`
		} `json:"list"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.List.Plugins) != 1 || runtimePayload.List.Plugins[0].PluginID != "setta-fixture-full" {
		t.Fatalf("unexpected plugin runtime payload %#v", runtimePayload.List.Plugins)
	}

	assetResponse, err := http.Get(server.URL + "/plugins/setta-fixture-full/frontend/src/index.js")
	if err != nil {
		t.Fatalf("get plugin asset: %v", err)
	}
	defer assetResponse.Body.Close()
	if assetResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(assetResponse.Body)
		t.Fatalf("expected plugin asset 200, got %d with body %q", assetResponse.StatusCode, string(body))
	}
	assetBody, err := io.ReadAll(assetResponse.Body)
	if err != nil {
		t.Fatalf("read plugin asset body: %v", err)
	}
	if !strings.Contains(string(assetBody), "register(") {
		t.Fatalf("expected frontend asset payload, got %q", string(assetBody))
	}
}

func TestAppPluginLanguageServerRoutesDiagnosticsAndCompletion(t *testing.T) {
	// The real app should route plugin-defined code sections through the worker-backed
	// language-server registration runtime for completion and diagnostics.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend-language-server-e2e")

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	postJSON := func(path string, body any, responseBody any) {
		t.Helper()

		requestBody := mustAppJSON(t, body)
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, bytes.NewReader(requestBody))
		if err != nil {
			t.Fatalf("new request %s: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			payload, _ := io.ReadAll(response.Body)
			t.Fatalf("expected %s 200, got %d with body %q", path, response.StatusCode, string(payload))
		}
		if responseBody == nil {
			return
		}
		if err := json.NewDecoder(response.Body).Decode(responseBody); err != nil {
			t.Fatalf("decode %s response: %v", path, err)
		}
	}

	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}
	settingsDocument["fixtureDslLanguageServer"] = map[string]any{
		"analysis": map[string]any{
			"emitDiagnostics": true,
		},
	}
	postJSON(httpapi.RouteSaveSettings, httpapi.SaveSettingsRequest{
		Settings: settingsDocument,
	}, nil)

	var createResponse projectstate.CreateTopLevelSectionResult
	postJSON(httpapi.RouteCreateTopLevelSection, map[string]any{
		"projectConfigId": "project-alpha",
		"implType":        "Code",
		"implOverrides": map[string]any{
			"type":         "Code",
			"codeLanguage": "fixturedsl",
		},
	}, &createResponse)
	if createResponse.SectionID == "" {
		t.Fatalf("expected created section id, got %#v", createResponse)
	}

	postJSON(httpapi.RouteSetCode, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       createResponse.SectionID,
		"code":            "const value = __fixture_error__;\n",
	}, nil)

	var completions []struct {
		Label string `json:"label"`
		Type  string `json:"type"`
	}
	postJSON(httpapi.RouteCodeAreaCompletion, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       createResponse.SectionID,
		"fullText":        "fixture.",
		"position":        8,
	}, &completions)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected plugin code area completions %#v", completions)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		var diagnostics projectstate.LSPDiagnosticsPayload
		postJSON(httpapi.RouteGetLatestLSPDiagnostics, map[string]any{
			"projectConfigId": "project-alpha",
		}, &diagnostics)
		sectionDiagnostics := diagnostics.CodeSections[createResponse.SectionID]
		if len(sectionDiagnostics) == 1 && sectionDiagnostics[0].Message == "Fixture TypeScript diagnostic" {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for plugin language-server diagnostics, last payload %#v", diagnostics.CodeSections)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestAppLinkRefreshesPluginLanguageServerRouter(t *testing.T) {
	// Linking a plugin language server after app startup should refresh the live
	// LSP router so completion and diagnostics work without restarting the app.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend-language-server-e2e")
	localPluginRoot := filepath.Join(t.TempDir(), "backend-language-server-e2e")
	copyAppTestDir(t, sourceRoot, localPluginRoot)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	postJSON := func(path string, body any, responseBody any) {
		t.Helper()

		requestBody := mustAppJSON(t, body)
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, bytes.NewReader(requestBody))
		if err != nil {
			t.Fatalf("new request %s: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			payload, _ := io.ReadAll(response.Body)
			t.Fatalf("expected %s 200, got %d with body %q", path, response.StatusCode, string(payload))
		}
		if responseBody == nil {
			return
		}
		if err := json.NewDecoder(response.Body).Decode(responseBody); err != nil {
			t.Fatalf("decode %s response: %v", path, err)
		}
	}

	var linkPayload struct {
		PluginID         string `json:"pluginId"`
		State            string `json:"state"`
		RestartRequired  bool   `json:"restartRequired"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
	}
	postJSON(httpapi.RoutePluginsLink, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           false,
	}, &linkPayload)
	if linkPayload.PluginID != "setta-fixture-backend-language-server-e2e" {
		t.Fatalf("unexpected link payload %#v", linkPayload)
	}
	if linkPayload.State != "active" || linkPayload.RestartRequired {
		t.Fatalf("expected live language-server link payload, got %#v", linkPayload)
	}
	if linkPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace link scope, got %#v", linkPayload)
	}

	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}
	settingsDocument["fixtureDslLanguageServer"] = map[string]any{
		"analysis": map[string]any{
			"emitDiagnostics": true,
		},
	}
	postJSON(httpapi.RouteSaveSettings, httpapi.SaveSettingsRequest{
		Settings: settingsDocument,
	}, nil)

	var createResponse projectstate.CreateTopLevelSectionResult
	postJSON(httpapi.RouteCreateTopLevelSection, map[string]any{
		"projectConfigId": "project-alpha",
		"implType":        "Code",
		"implOverrides": map[string]any{
			"type":         "Code",
			"codeLanguage": "fixturedsl",
		},
	}, &createResponse)
	if createResponse.SectionID == "" {
		t.Fatalf("expected created section id, got %#v", createResponse)
	}

	postJSON(httpapi.RouteSetCode, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       createResponse.SectionID,
		"code":            "const value = __fixture_error__;\n",
	}, nil)

	var completions []struct {
		Label string `json:"label"`
		Type  string `json:"type"`
	}
	postJSON(httpapi.RouteCodeAreaCompletion, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       createResponse.SectionID,
		"fullText":        "fixture.",
		"position":        8,
	}, &completions)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected plugin code area completions after link %#v", completions)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		var diagnostics projectstate.LSPDiagnosticsPayload
		postJSON(httpapi.RouteGetLatestLSPDiagnostics, map[string]any{
			"projectConfigId": "project-alpha",
		}, &diagnostics)
		sectionDiagnostics := diagnostics.CodeSections[createResponse.SectionID]
		if len(sectionDiagnostics) == 1 && sectionDiagnostics[0].Message == "Fixture TypeScript diagnostic" {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for linked plugin diagnostics, last payload %#v", diagnostics.CodeSections)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestSnapshotAppLanguageServerSpecsIncludesPluginRegistration(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppPluginWorkerRuntime(t)
	installAppPluginFixture(t, cfg, "backend-language-server-e2e", "setta-fixture-backend-language-server-e2e")

	runtimeProvider, err := plugins.NewCurrentProcessWorkerRuntimeProvider(plugins.CurrentProcessWorkerRuntimeProviderOptions{})
	if err != nil {
		t.Fatalf("new worker runtime provider: %v", err)
	}
	backendRegistrations, err := plugins.NewBackendRegistrationLoader(plugins.BackendRegistrationLoaderOptions{
		RuntimeProvider: runtimeProvider,
		ServerMode:      config.ModeIDE,
	})
	if err != nil {
		t.Fatalf("new backend registration loader: %v", err)
	}
	store, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		SettaHome:      cfg.Paths.SettaHome,
	})
	if err != nil {
		t.Fatalf("new plugin store: %v", err)
	}
	discovery, err := plugins.NewDiscoveryService(plugins.DiscoveryServiceOptions{
		Store:      store,
		ServerMode: config.ModeIDE,
	})
	if err != nil {
		t.Fatalf("new discovery service: %v", err)
	}

	specs, err := snapshotAppLanguageServerSpecs(discovery, backendRegistrations)
	if err != nil {
		t.Fatalf("snapshot app language-server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one plugin language-server spec, got %#v", specs)
	}
	if specs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected fixturedsl language id, got %#v", specs[0])
	}
}

func TestAppLinksPluginRoutesAndServesRuntime(t *testing.T) {
	// The real app should expose local plugin linking through the shared Go plugin service.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	repoRoot := appTestRepoRoot(t)
	localPluginRoot := filepath.Join(t.TempDir(), "frontend")
	copyAppTestDir(t, filepath.Join(repoRoot, "tests", "fixtures", "plugins", "frontend"), localPluginRoot)
	manifestPath := filepath.Join(localPluginRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	linkRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RoutePluginsLink,
		bytes.NewReader(mustAppJSON(t, map[string]any{
			"localPluginRoot": localPluginRoot,
			"scope":           "workspace",
			"enable":          true,
			"force":           false,
		})),
	)
	if err != nil {
		t.Fatalf("new plugin link request: %v", err)
	}
	linkRequest.Header.Set("Content-Type", "application/json")
	linkRequest.AddCookie(authCookie)

	linkResponse, err := http.DefaultClient.Do(linkRequest)
	if err != nil {
		t.Fatalf("post plugin link: %v", err)
	}
	defer linkResponse.Body.Close()
	if linkResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(linkResponse.Body)
		t.Fatalf("expected plugin link 200, got %d with body %q", linkResponse.StatusCode, string(body))
	}

	var linkPayload struct {
		PluginID         string `json:"pluginId"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
		TrustStatus      string `json:"trustStatus"`
		TrustWarning     string `json:"trustWarning"`
		State            string `json:"state"`
	}
	if err := json.NewDecoder(linkResponse.Body).Decode(&linkPayload); err != nil {
		t.Fatalf("decode plugin link payload: %v", err)
	}
	if linkPayload.PluginID != "setta-fixture-frontend" || linkPayload.State != "active" {
		t.Fatalf("unexpected plugin link payload %#v", linkPayload)
	}
	if linkPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", linkPayload.SourceScopeLabel)
	}
	if linkPayload.TrustStatus != "unverified" || linkPayload.TrustWarning != "Source is unverified. Install only from trusted owners." {
		t.Fatalf("unexpected plugin link trust payload %#v", linkPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after link: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload after link: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one linked plugin in runtime payload, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected plugin runtime payload after link %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppServesPluginBackendRoutes(t *testing.T) {
	// The real app should start route-owning backend plugins at startup and proxy authenticated backend route traffic.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend-language-server-e2e")

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	queryRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/api/plugins/setta-fixture-backend-language-server-e2e/payload/echo-query?alpha=one&repeated=a&repeated=b",
		nil,
	)
	if err != nil {
		t.Fatalf("new backend route query request: %v", err)
	}
	queryRequest.AddCookie(authCookie)
	queryResponse, err := http.DefaultClient.Do(queryRequest)
	if err != nil {
		t.Fatalf("get backend route query response: %v", err)
	}
	defer queryResponse.Body.Close()
	if queryResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(queryResponse.Body)
		t.Fatalf("expected backend route query 200, got %d with body %q", queryResponse.StatusCode, string(body))
	}

	var queryPayload struct {
		Alpha          string   `json:"alpha"`
		Repeated       []string `json:"repeated"`
		RepeatedIsList bool     `json:"repeatedIsList"`
	}
	if err := json.NewDecoder(queryResponse.Body).Decode(&queryPayload); err != nil {
		t.Fatalf("decode backend route query payload: %v", err)
	}
	if queryPayload.Alpha != "one" || len(queryPayload.Repeated) != 2 || queryPayload.Repeated[0] != "a" || queryPayload.Repeated[1] != "b" || !queryPayload.RepeatedIsList {
		t.Fatalf("unexpected backend route query payload %#v", queryPayload)
	}

	contentTypeRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/api/plugins/setta-fixture-backend-language-server-e2e/payload/echo-header-only-content-type",
		nil,
	)
	if err != nil {
		t.Fatalf("new backend route custom content-type request: %v", err)
	}
	contentTypeRequest.AddCookie(authCookie)
	contentTypeResponse, err := http.DefaultClient.Do(contentTypeRequest)
	if err != nil {
		t.Fatalf("get backend route custom content-type response: %v", err)
	}
	defer contentTypeResponse.Body.Close()
	if contentTypeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(contentTypeResponse.Body)
		t.Fatalf("expected backend route custom content-type 200, got %d with body %q", contentTypeResponse.StatusCode, string(body))
	}
	if contentTypeResponse.Header.Get("Content-Type") != "application/x-custom" {
		t.Fatalf("expected application/x-custom content type, got %q", contentTypeResponse.Header.Get("Content-Type"))
	}
	contentTypeBody, err := io.ReadAll(contentTypeResponse.Body)
	if err != nil {
		t.Fatalf("read backend route custom content-type body: %v", err)
	}
	if strings.TrimSpace(string(contentTypeBody)) != "ok" {
		t.Fatalf("expected backend route custom content-type body ok, got %q", string(contentTypeBody))
	}
}

func TestAppServesPluginBackendProjectStateAndListenerRoutes(t *testing.T) {
	// The real app should let backend fixture routes read live project state and emit listener events through the Go worker host.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")
	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "fixture-project",
		Projects: map[string]projectstate.Project{
			"fixture-project": {
				ID:   "fixture-project",
				Name: "Fixture Project",
			},
		},
	}); err != nil {
		t.Fatalf("save app project document: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	projectStateRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/api/plugins/setta-fixture-backend/project-state-summary?projectConfigId=fixture-project",
		nil,
	)
	if err != nil {
		t.Fatalf("new project-state request: %v", err)
	}
	projectStateRequest.AddCookie(authCookie)
	projectStateResponse, err := http.DefaultClient.Do(projectStateRequest)
	if err != nil {
		t.Fatalf("get project-state response: %v", err)
	}
	defer projectStateResponse.Body.Close()
	if projectStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(projectStateResponse.Body)
		t.Fatalf("expected project-state route 200, got %d with body %q", projectStateResponse.StatusCode, string(body))
	}

	var projectStatePayload struct {
		View         string `json:"view"`
		ProjectState struct {
			ProjectConfig struct {
				ID string `json:"id"`
			} `json:"projectConfig"`
		} `json:"projectState"`
	}
	if err := json.NewDecoder(projectStateResponse.Body).Decode(&projectStatePayload); err != nil {
		t.Fatalf("decode project-state payload: %v", err)
	}
	if projectStatePayload.View != "summary" || projectStatePayload.ProjectState.ProjectConfig.ID != "fixture-project" {
		t.Fatalf("unexpected project-state payload %#v", projectStatePayload)
	}

	emitRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api/plugins/setta-fixture-backend/emit-listener",
		strings.NewReader(`{"projectConfigId":"fixture-project","sectionId":"fixture-section","payload":"hello","timestampMs":123}`),
	)
	if err != nil {
		t.Fatalf("new emit-listener request: %v", err)
	}
	emitRequest.Header.Set("Content-Type", "application/json")
	emitRequest.AddCookie(authCookie)
	emitResponse, err := http.DefaultClient.Do(emitRequest)
	if err != nil {
		t.Fatalf("post emit-listener response: %v", err)
	}
	defer emitResponse.Body.Close()
	if emitResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(emitResponse.Body)
		t.Fatalf("expected emit-listener route 200, got %d with body %q", emitResponse.StatusCode, string(body))
	}

	var emitPayload struct {
		Emitted         bool   `json:"emitted"`
		ProjectConfigID string `json:"projectConfigId"`
	}
	if err := json.NewDecoder(emitResponse.Body).Decode(&emitPayload); err != nil {
		t.Fatalf("decode emit-listener payload: %v", err)
	}
	if !emitPayload.Emitted || emitPayload.ProjectConfigID != "fixture-project" {
		t.Fatalf("unexpected emit-listener payload %#v", emitPayload)
	}
}

func TestAppServesPluginBackendStaticAssets(t *testing.T) {
	// The real app should start static-dir-owning backend plugins at startup and serve authenticated plugin-static assets.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend-static-router")

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	staticRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/plugin-static/setta-fixture-backend-static-router/fixture/hello.txt",
		nil,
	)
	if err != nil {
		t.Fatalf("new backend static request: %v", err)
	}
	staticRequest.AddCookie(authCookie)
	staticResponse, err := http.DefaultClient.Do(staticRequest)
	if err != nil {
		t.Fatalf("get backend static response: %v", err)
	}
	defer staticResponse.Body.Close()
	if staticResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(staticResponse.Body)
		t.Fatalf("expected backend static 200, got %d with body %q", staticResponse.StatusCode, string(body))
	}
	staticBody, err := io.ReadAll(staticResponse.Body)
	if err != nil {
		t.Fatalf("read backend static body: %v", err)
	}
	if strings.TrimSpace(string(staticBody)) != "fixture static payload" {
		t.Fatalf("unexpected backend static body %q", string(staticBody))
	}
}

func TestAppServesPluginRuntimeWithBackendRegistrations(t *testing.T) {
	// The real app should surface worker-backed backend language-server, external-agent, and codegen registrations through plugin runtime.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	installAppPluginFixture(t, cfg, "backend-language-server", "setta-fixture-backend-language-server")
	installAppPluginFixture(t, cfg, "backend-external-agent", "setta-fixture-backend-external-agent")
	installAppBackendCodegenFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID                  string `json:"pluginId"`
				State                     string `json:"state"`
				RegisteredLanguageServers []struct {
					Name        string   `json:"name"`
					Language    string   `json:"language"`
					Command     string   `json:"command"`
					Args        []string `json:"args"`
					SettingsKey *string  `json:"settingsKey"`
				} `json:"registeredLanguageServers"`
				RegisteredExternalAgentAdapters []struct {
					AdapterID       string   `json:"adapterId"`
					PluginID        string   `json:"pluginId"`
					Name            string   `json:"name"`
					RunModes        []string `json:"runModes"`
					Command         string   `json:"command"`
					Args            []string `json:"args"`
					EnvVarWhitelist []string `json:"envVarWhitelist"`
					DefaultModel    *string  `json:"defaultModel"`
				} `json:"registeredExternalAgentAdapters"`
				RegisteredCodegenTargets []struct {
					TargetID        string `json:"targetId"`
					PluginID        string `json:"pluginId"`
					Language        string `json:"language"`
					Name            string `json:"name"`
					DefaultFileName string `json:"defaultFileName"`
				} `json:"registeredCodegenTargets"`
				Errors []struct {
					Code string `json:"code"`
				} `json:"errors"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 3 {
		t.Fatalf("expected three plugins in runtime status payload, got %#v", runtimePayload.Status.Plugins)
	}

	findEntry := func(pluginID string) struct {
		PluginID                  string `json:"pluginId"`
		State                     string `json:"state"`
		RegisteredLanguageServers []struct {
			Name        string   `json:"name"`
			Language    string   `json:"language"`
			Command     string   `json:"command"`
			Args        []string `json:"args"`
			SettingsKey *string  `json:"settingsKey"`
		} `json:"registeredLanguageServers"`
		RegisteredExternalAgentAdapters []struct {
			AdapterID       string   `json:"adapterId"`
			PluginID        string   `json:"pluginId"`
			Name            string   `json:"name"`
			RunModes        []string `json:"runModes"`
			Command         string   `json:"command"`
			Args            []string `json:"args"`
			EnvVarWhitelist []string `json:"envVarWhitelist"`
			DefaultModel    *string  `json:"defaultModel"`
		} `json:"registeredExternalAgentAdapters"`
		RegisteredCodegenTargets []struct {
			TargetID        string `json:"targetId"`
			PluginID        string `json:"pluginId"`
			Language        string `json:"language"`
			Name            string `json:"name"`
			DefaultFileName string `json:"defaultFileName"`
		} `json:"registeredCodegenTargets"`
		Errors []struct {
			Code string `json:"code"`
		} `json:"errors"`
	} {
		t.Helper()
		for _, entry := range runtimePayload.Status.Plugins {
			if entry.PluginID == pluginID {
				return entry
			}
		}
		t.Fatalf("expected runtime entry for %q", pluginID)
		return struct {
			PluginID                  string `json:"pluginId"`
			State                     string `json:"state"`
			RegisteredLanguageServers []struct {
				Name        string   `json:"name"`
				Language    string   `json:"language"`
				Command     string   `json:"command"`
				Args        []string `json:"args"`
				SettingsKey *string  `json:"settingsKey"`
			} `json:"registeredLanguageServers"`
			RegisteredExternalAgentAdapters []struct {
				AdapterID       string   `json:"adapterId"`
				PluginID        string   `json:"pluginId"`
				Name            string   `json:"name"`
				RunModes        []string `json:"runModes"`
				Command         string   `json:"command"`
				Args            []string `json:"args"`
				EnvVarWhitelist []string `json:"envVarWhitelist"`
				DefaultModel    *string  `json:"defaultModel"`
			} `json:"registeredExternalAgentAdapters"`
			RegisteredCodegenTargets []struct {
				TargetID        string `json:"targetId"`
				PluginID        string `json:"pluginId"`
				Language        string `json:"language"`
				Name            string `json:"name"`
				DefaultFileName string `json:"defaultFileName"`
			} `json:"registeredCodegenTargets"`
			Errors []struct {
				Code string `json:"code"`
			} `json:"errors"`
		}{}
	}

	languageServerEntry := findEntry("setta-fixture-backend-language-server")
	if languageServerEntry.State != "active" {
		t.Fatalf("unexpected language-server runtime status entry %#v", languageServerEntry)
	}
	if len(languageServerEntry.RegisteredLanguageServers) != 1 {
		t.Fatalf("expected one backend language-server registration, got %#v", languageServerEntry.RegisteredLanguageServers)
	}
	languageServer := languageServerEntry.RegisteredLanguageServers[0]
	if languageServer.Name != "setta-fixture-backend-language-server:typescript" || languageServer.Language != "typescript" {
		t.Fatalf("unexpected backend language-server registration payload %#v", languageServer)
	}
	if languageServer.Command == "" || len(languageServer.Args) != 1 || languageServer.Args[0] != "--stdio" {
		t.Fatalf("unexpected backend language-server command payload %#v", languageServer)
	}
	if languageServer.SettingsKey == nil || *languageServer.SettingsKey != "typescriptLanguageServer" {
		t.Fatalf("unexpected backend language-server settings key %#v", languageServer.SettingsKey)
	}

	externalAgentEntry := findEntry("setta-fixture-backend-external-agent")
	if externalAgentEntry.State != "active" {
		t.Fatalf("unexpected external-agent runtime status entry %#v", externalAgentEntry)
	}
	if len(externalAgentEntry.RegisteredExternalAgentAdapters) != 1 {
		t.Fatalf("expected one backend external-agent registration, got %#v", externalAgentEntry.RegisteredExternalAgentAdapters)
	}
	externalAgent := externalAgentEntry.RegisteredExternalAgentAdapters[0]
	if externalAgent.AdapterID != "setta-fixture-backend-external-agent:fixture-agent" {
		t.Fatalf("unexpected backend external-agent adapter id %#v", externalAgent.AdapterID)
	}
	if externalAgent.PluginID != "setta-fixture-backend-external-agent" || externalAgent.Name != "Fixture External Agent" {
		t.Fatalf("unexpected backend external-agent registration payload %#v", externalAgent)
	}
	if len(externalAgent.RunModes) != 1 || externalAgent.RunModes[0] != "sdk" {
		t.Fatalf("unexpected backend external-agent run modes %#v", externalAgent.RunModes)
	}
	if externalAgent.Command == "" || len(externalAgent.Args) != 1 {
		t.Fatalf("unexpected backend external-agent command payload %#v", externalAgent)
	}
	if len(externalAgent.EnvVarWhitelist) != 1 || externalAgent.EnvVarWhitelist[0] != "FIXTURE_EXTERNAL_AGENT_TOKEN" {
		t.Fatalf("unexpected backend external-agent env whitelist %#v", externalAgent.EnvVarWhitelist)
	}
	if externalAgent.DefaultModel == nil || *externalAgent.DefaultModel != "fixture-model" {
		t.Fatalf("unexpected backend external-agent default model %#v", externalAgent.DefaultModel)
	}

	statusEntry := findEntry("setta-fixture-backend-codegen")
	if len(statusEntry.RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected one backend codegen registration, got %#v", statusEntry.RegisteredCodegenTargets)
	}
	registration := statusEntry.RegisteredCodegenTargets[0]
	if registration.TargetID != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected backend codegen target id, got %#v", registration.TargetID)
	}
	if registration.PluginID != "setta-fixture-backend-codegen" || registration.Language != "typescript" {
		t.Fatalf("unexpected backend codegen registration payload %#v", registration)
	}
	if registration.Name != "TypeScript" || registration.DefaultFileName != "setta_gen.ts" {
		t.Fatalf("unexpected backend codegen registration details %#v", registration)
	}
	if len(statusEntry.Errors) != 0 {
		t.Fatalf("expected no backend codegen registration errors, got %#v", statusEntry.Errors)
	}
}

func TestAppWritesPluginConfigAndUpdatesRuntime(t *testing.T) {
	// The real app should accept plugin config writes and reflect them in subsequent runtime reads.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "full")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-full", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	configRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RoutePluginsConfig,
		strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":true,"label":"app-write"}}`),
	)
	if err != nil {
		t.Fatalf("new plugin config request: %v", err)
	}
	configRequest.Header.Set("Content-Type", "application/json")
	configRequest.AddCookie(authCookie)

	configResponse, err := http.DefaultClient.Do(configRequest)
	if err != nil {
		t.Fatalf("post plugin config: %v", err)
	}
	defer configResponse.Body.Close()
	if configResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(configResponse.Body)
		t.Fatalf("expected plugin config 200, got %d with body %q", configResponse.StatusCode, string(body))
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after config write: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		List struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				Config   struct {
					CurrentConfig map[string]any `json:"currentConfig"`
				} `json:"config"`
			} `json:"plugins"`
		} `json:"list"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.List.Plugins) != 1 {
		t.Fatalf("expected one plugin after config write, got %#v", runtimePayload.List.Plugins)
	}
	if got := runtimePayload.List.Plugins[0].Config.CurrentConfig["label"]; got != "app-write" {
		t.Fatalf("expected runtime config label app-write, got %#v", got)
	}
}

func TestAppHandlesPluginRescanEnableAndDisableRoutes(t *testing.T) {
	// The real app should wire rescan plus enable/disable plugin lifecycle routes through the shared Go service.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "frontend")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-frontend", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	requestPluginLifecycle := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	rescanResponse := requestPluginLifecycle(httpapi.RoutePluginsRescan, "")
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugin rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	var initialRescan struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanResponse.Body).Decode(&initialRescan); err != nil {
		t.Fatalf("decode initial rescan payload: %v", err)
	}
	if initialRescan.InstalledPlugins != 1 || initialRescan.ActivePlugins != 1 {
		t.Fatalf("unexpected initial rescan payload %#v", initialRescan)
	}

	disableResponse := requestPluginLifecycle(httpapi.RoutePluginsDisable, `{"pluginId":"setta-fixture-frontend"}`)
	defer disableResponse.Body.Close()
	if disableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(disableResponse.Body)
		t.Fatalf("expected plugin disable 200, got %d with body %q", disableResponse.StatusCode, string(body))
	}

	var disabledPayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(disableResponse.Body).Decode(&disabledPayload); err != nil {
		t.Fatalf("decode disable payload: %v", err)
	}
	if disabledPayload.State != "disabled" || disabledPayload.RestartRequired {
		t.Fatalf("unexpected disable payload %#v", disabledPayload)
	}

	rescanAfterDisableResponse := requestPluginLifecycle(httpapi.RoutePluginsRescan, "")
	defer rescanAfterDisableResponse.Body.Close()
	if rescanAfterDisableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanAfterDisableResponse.Body)
		t.Fatalf("expected plugin rescan after disable 200, got %d with body %q", rescanAfterDisableResponse.StatusCode, string(body))
	}

	var rescanAfterDisable struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanAfterDisableResponse.Body).Decode(&rescanAfterDisable); err != nil {
		t.Fatalf("decode post-disable rescan payload: %v", err)
	}
	if rescanAfterDisable.InstalledPlugins != 1 || rescanAfterDisable.ActivePlugins != 0 {
		t.Fatalf("unexpected post-disable rescan payload %#v", rescanAfterDisable)
	}

	enableResponse := requestPluginLifecycle(httpapi.RoutePluginsEnable, `{"pluginId":"setta-fixture-frontend"}`)
	defer enableResponse.Body.Close()
	if enableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(enableResponse.Body)
		t.Fatalf("expected plugin enable 200, got %d with body %q", enableResponse.StatusCode, string(body))
	}

	var enabledPayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(enableResponse.Body).Decode(&enabledPayload); err != nil {
		t.Fatalf("decode enable payload: %v", err)
	}
	if enabledPayload.State != "active" || enabledPayload.RestartRequired {
		t.Fatalf("unexpected enable payload %#v", enabledPayload)
	}
}

func TestAppInstallsAndUninstallsPluginRoutes(t *testing.T) {
	// The real app should wire install and uninstall plugin routes through the production candidate-provider boundary.
	sourceSpec := configureAppLocalPyPIFixture(t, "frontend", "setta-fixture-frontend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	var installPayload struct {
		PluginID         string `json:"pluginId"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
		TrustStatus      string `json:"trustStatus"`
		State            string `json:"state"`
	}
	if err := json.NewDecoder(installResponse.Body).Decode(&installPayload); err != nil {
		t.Fatalf("decode install payload: %v", err)
	}
	if installPayload.PluginID != "setta-fixture-frontend" || installPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("unexpected install payload %#v", installPayload)
	}
	if installPayload.TrustStatus != "unverified" || installPayload.State != "active" {
		t.Fatalf("unexpected install trust/state payload %#v", installPayload)
	}

	uninstallResponse := postPluginMutation(httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}

	var uninstallPayload struct {
		PluginID         string `json:"pluginId"`
		RemovedFromScope string `json:"removedFromScope"`
	}
	if err := json.NewDecoder(uninstallResponse.Body).Decode(&uninstallPayload); err != nil {
		t.Fatalf("decode uninstall payload: %v", err)
	}
	if uninstallPayload.PluginID != "setta-fixture-frontend" || uninstallPayload.RemovedFromScope != "workspace" {
		t.Fatalf("unexpected uninstall payload %#v", uninstallPayload)
	}

	rescanResponse := postPluginMutation(httpapi.RoutePluginsRescan, `{}`)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugin rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	var rescanPayload struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanResponse.Body).Decode(&rescanPayload); err != nil {
		t.Fatalf("decode rescan payload: %v", err)
	}
	if rescanPayload.InstalledPlugins != 0 || rescanPayload.ActivePlugins != 0 {
		t.Fatalf("unexpected post-uninstall rescan payload %#v", rescanPayload)
	}
}

func TestAppUpdatesAndRollsBackPluginRoutes(t *testing.T) {
	// The real app should wire update and rollback plugin routes through install metadata and the production candidate-provider boundary.
	artifactDir := t.TempDir()
	buildAppLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")
	buildAppLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.2.0")
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	updateResponse := postPluginMutation(httpapi.RoutePluginsUpdate, `{"pluginId":"setta-fixture-frontend","scope":"workspace","to":"0.2.0"}`)
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected plugin update 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	var updatePayload struct {
		PluginID        string `json:"pluginId"`
		FromVersion     string `json:"fromVersion"`
		ToVersion       string `json:"toVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(updateResponse.Body).Decode(&updatePayload); err != nil {
		t.Fatalf("decode update payload: %v", err)
	}
	if updatePayload.PluginID != "setta-fixture-frontend" || updatePayload.FromVersion != "0.1.0" || updatePayload.ToVersion != "0.2.0" || updatePayload.RestartRequired {
		t.Fatalf("unexpected update payload %#v", updatePayload)
	}

	rollbackResponse := postPluginMutation(httpapi.RoutePluginsRollback, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer rollbackResponse.Body.Close()
	if rollbackResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rollbackResponse.Body)
		t.Fatalf("expected plugin rollback 200, got %d with body %q", rollbackResponse.StatusCode, string(body))
	}

	var rollbackPayload struct {
		PluginID        string `json:"pluginId"`
		RestoredVersion string `json:"restoredVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(rollbackResponse.Body).Decode(&rollbackPayload); err != nil {
		t.Fatalf("decode rollback payload: %v", err)
	}
	if rollbackPayload.PluginID != "setta-fixture-frontend" || rollbackPayload.RestoredVersion != "0.1.0" || rollbackPayload.RestartRequired {
		t.Fatalf("unexpected rollback payload %#v", rollbackPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after rollback: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string  `json:"pluginId"`
				Version  string  `json:"version"`
				Shadowed *string `json:"shadowedBySourcePath"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin after rollback, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].Version != "0.1.0" {
		t.Fatalf("unexpected runtime payload after rollback %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppWritesAndAppliesPluginLockRoutes(t *testing.T) {
	// The real app should expose plugin lockfile write/apply routes over the shared Go plugin service.
	sourceSpec := configureAppLocalPyPIFixture(t, "frontend", "setta-fixture-frontend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	lockWriteResponse := postPluginMutation(httpapi.RoutePluginsLockWrite, "")
	defer lockWriteResponse.Body.Close()
	if lockWriteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockWriteResponse.Body)
		t.Fatalf("expected lock write 200, got %d with body %q", lockWriteResponse.StatusCode, string(body))
	}

	var lockWritePayload struct {
		LockfilePath string `json:"lockfilePath"`
		PluginCount  int    `json:"pluginCount"`
	}
	if err := json.NewDecoder(lockWriteResponse.Body).Decode(&lockWritePayload); err != nil {
		t.Fatalf("decode lock write payload: %v", err)
	}
	if lockWritePayload.PluginCount != 1 || lockWritePayload.LockfilePath == "" {
		t.Fatalf("unexpected lock write payload %#v", lockWritePayload)
	}

	uninstallResponse := postPluginMutation(httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}

	lockApplyCheckResponse := postPluginMutation(httpapi.RoutePluginsLockApply, `{"check":true}`)
	defer lockApplyCheckResponse.Body.Close()
	if lockApplyCheckResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockApplyCheckResponse.Body)
		t.Fatalf("expected lock apply check 200, got %d with body %q", lockApplyCheckResponse.StatusCode, string(body))
	}

	var lockApplyCheckPayload struct {
		PlannedChanges []string `json:"plannedChanges"`
		Applied        bool     `json:"applied"`
	}
	if err := json.NewDecoder(lockApplyCheckResponse.Body).Decode(&lockApplyCheckPayload); err != nil {
		t.Fatalf("decode lock apply check payload: %v", err)
	}
	if lockApplyCheckPayload.Applied {
		t.Fatalf("expected check-only lock apply payload, got %#v", lockApplyCheckPayload)
	}
	if len(lockApplyCheckPayload.PlannedChanges) != 1 || !strings.Contains(lockApplyCheckPayload.PlannedChanges[0], "install setta-fixture-frontend in workspace") {
		t.Fatalf("unexpected lock apply check payload %#v", lockApplyCheckPayload)
	}

	lockApplyResponse := postPluginMutation(httpapi.RoutePluginsLockApply, `{"check":false}`)
	defer lockApplyResponse.Body.Close()
	if lockApplyResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockApplyResponse.Body)
		t.Fatalf("expected lock apply 200, got %d with body %q", lockApplyResponse.StatusCode, string(body))
	}

	var lockApplyPayload struct {
		Applied bool `json:"applied"`
	}
	if err := json.NewDecoder(lockApplyResponse.Body).Decode(&lockApplyPayload); err != nil {
		t.Fatalf("decode lock apply payload: %v", err)
	}
	if !lockApplyPayload.Applied {
		t.Fatalf("expected applied lock payload, got %#v", lockApplyPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after lock apply: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode runtime payload after lock apply: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin after lock apply, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected runtime payload after lock apply %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppRefreshesPluginBackendRuntimeAfterLifecycleMutations(t *testing.T) {
	// The real IDE app should hot-refresh backend route ownership after install,
	// disable, enable, and uninstall instead of leaving backend plugins in
	// pending_restart until manual restart.
	sourceSpec := configureAppLocalPyPIFixture(t, "backend", "setta-fixture-backend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	doRequest := func(method string, path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s %s request: %v", method, path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return response
	}
	readRuntimeState := func() *string {
		t.Helper()

		response := doRequest(http.MethodGet, "/api"+httpapi.RoutePluginsRuntime, "")
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
		}

		var payload struct {
			Status struct {
				Plugins []struct {
					PluginID string `json:"pluginId"`
					State    string `json:"state"`
				} `json:"plugins"`
			} `json:"status"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatalf("decode plugin runtime payload: %v", err)
		}
		for _, entry := range payload.Status.Plugins {
			if entry.PluginID == "setta-fixture-backend" {
				return &entry.State
			}
		}
		return nil
	}
	readHealth := func() *http.Response {
		t.Helper()
		return doRequest(http.MethodGet, "/api/plugins/setta-fixture-backend/health", "")
	}

	initialHealth := readHealth()
	defer initialHealth.Body.Close()
	if initialHealth.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(initialHealth.Body)
		t.Fatalf("expected backend route to be unavailable before install, got %d with body %q", initialHealth.StatusCode, string(body))
	}

	installResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected backend install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	var installPayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(installResponse.Body).Decode(&installPayload); err != nil {
		t.Fatalf("decode backend install payload: %v", err)
	}
	if installPayload.State != "active" || installPayload.RestartRequired {
		t.Fatalf("expected backend install to be live immediately, got %#v", installPayload)
	}
	if state := readRuntimeState(); state == nil || *state != "active" {
		t.Fatalf("expected runtime state active after install, got %#v", state)
	}

	healthResponse := readHealth()
	defer healthResponse.Body.Close()
	if healthResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(healthResponse.Body)
		t.Fatalf("expected backend route 200 after install, got %d with body %q", healthResponse.StatusCode, string(body))
	}

	disableResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsDisable, `{"pluginId":"setta-fixture-backend"}`)
	defer disableResponse.Body.Close()
	if disableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(disableResponse.Body)
		t.Fatalf("expected backend disable 200, got %d with body %q", disableResponse.StatusCode, string(body))
	}

	var disablePayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(disableResponse.Body).Decode(&disablePayload); err != nil {
		t.Fatalf("decode backend disable payload: %v", err)
	}
	if disablePayload.State != "disabled" || disablePayload.RestartRequired {
		t.Fatalf("expected backend disable to be live immediately, got %#v", disablePayload)
	}
	if state := readRuntimeState(); state == nil || *state != "disabled" {
		t.Fatalf("expected runtime state disabled after disable, got %#v", state)
	}

	disabledHealth := readHealth()
	defer disabledHealth.Body.Close()
	if disabledHealth.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(disabledHealth.Body)
		t.Fatalf("expected backend route 404 after disable, got %d with body %q", disabledHealth.StatusCode, string(body))
	}

	enableResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsEnable, `{"pluginId":"setta-fixture-backend"}`)
	defer enableResponse.Body.Close()
	if enableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(enableResponse.Body)
		t.Fatalf("expected backend enable 200, got %d with body %q", enableResponse.StatusCode, string(body))
	}

	var enablePayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(enableResponse.Body).Decode(&enablePayload); err != nil {
		t.Fatalf("decode backend enable payload: %v", err)
	}
	if enablePayload.State != "active" || enablePayload.RestartRequired {
		t.Fatalf("expected backend enable to be live immediately, got %#v", enablePayload)
	}

	enabledHealth := readHealth()
	defer enabledHealth.Body.Close()
	if enabledHealth.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(enabledHealth.Body)
		t.Fatalf("expected backend route 200 after enable, got %d with body %q", enabledHealth.StatusCode, string(body))
	}

	uninstallResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-backend","scope":"workspace"}`)
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected backend uninstall 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}

	var uninstallPayload struct {
		RestartRequired bool `json:"restartRequired"`
	}
	if err := json.NewDecoder(uninstallResponse.Body).Decode(&uninstallPayload); err != nil {
		t.Fatalf("decode backend uninstall payload: %v", err)
	}
	if uninstallPayload.RestartRequired {
		t.Fatalf("expected backend uninstall to refresh immediately, got %#v", uninstallPayload)
	}
	if state := readRuntimeState(); state != nil {
		t.Fatalf("expected backend plugin to disappear from runtime after uninstall, got %#v", *state)
	}

	uninstalledHealth := readHealth()
	defer uninstalledHealth.Body.Close()
	if uninstalledHealth.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(uninstalledHealth.Body)
		t.Fatalf("expected backend route 404 after uninstall, got %d with body %q", uninstalledHealth.StatusCode, string(body))
	}
}

func TestAppRescanRefreshesPluginBackendRuntime(t *testing.T) {
	// The real IDE app should rebuild backend route and static-dir ownership on
	// rescan when plugin files appear or disappear after startup.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	doRequest := func(method string, path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s %s request: %v", method, path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return response
	}

	initialRoute := doRequest(http.MethodGet, "/api/plugins/setta-fixture-backend-static-router/info", "")
	defer initialRoute.Body.Close()
	if initialRoute.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(initialRoute.Body)
		t.Fatalf("expected backend route 404 before rescan install, got %d with body %q", initialRoute.StatusCode, string(body))
	}

	installAppPluginFixture(t, cfg, "backend-static-router", "setta-fixture-backend-static-router")

	firstRescan := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsRescan, `{}`)
	defer firstRescan.Body.Close()
	if firstRescan.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(firstRescan.Body)
		t.Fatalf("expected rescan 200 after fixture install, got %d with body %q", firstRescan.StatusCode, string(body))
	}

	routeResponse := doRequest(http.MethodGet, "/api/plugins/setta-fixture-backend-static-router/info", "")
	defer routeResponse.Body.Close()
	if routeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(routeResponse.Body)
		t.Fatalf("expected backend route 200 after rescan install, got %d with body %q", routeResponse.StatusCode, string(body))
	}

	staticResponse := doRequest(http.MethodGet, "/plugin-static/setta-fixture-backend-static-router/fixture/hello.txt", "")
	defer staticResponse.Body.Close()
	if staticResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(staticResponse.Body)
		t.Fatalf("expected backend static 200 after rescan install, got %d with body %q", staticResponse.StatusCode, string(body))
	}

	if err := os.RemoveAll(filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend-static-router")); err != nil {
		t.Fatalf("remove backend static fixture: %v", err)
	}

	secondRescan := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsRescan, `{}`)
	defer secondRescan.Body.Close()
	if secondRescan.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(secondRescan.Body)
		t.Fatalf("expected rescan 200 after fixture removal, got %d with body %q", secondRescan.StatusCode, string(body))
	}

	removedRoute := doRequest(http.MethodGet, "/api/plugins/setta-fixture-backend-static-router/info", "")
	defer removedRoute.Body.Close()
	if removedRoute.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(removedRoute.Body)
		t.Fatalf("expected backend route 404 after rescan removal, got %d with body %q", removedRoute.StatusCode, string(body))
	}

	removedStatic := doRequest(http.MethodGet, "/plugin-static/setta-fixture-backend-static-router/fixture/hello.txt", "")
	defer removedStatic.Body.Close()
	if removedStatic.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(removedStatic.Body)
		t.Fatalf("expected backend static 404 after rescan removal, got %d with body %q", removedStatic.StatusCode, string(body))
	}
}

func TestAppServesManualPluginRestartRoute(t *testing.T) {
	// The real app should expose the plugin restart route and stay manual-only without a restart hook.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsRestart, nil)
	if err != nil {
		t.Fatalf("new plugin restart request: %v", err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugin restart: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin restart 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		Accepted bool    `json:"accepted"`
		Mode     string  `json:"mode"`
		Command  *string `json:"command"`
		Reason   *string `json:"reason"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin restart payload: %v", err)
	}
	if payload.Accepted {
		t.Fatalf("expected manual restart payload, got %#v", payload)
	}
	if payload.Mode != "manual" {
		t.Fatalf("expected manual restart mode, got %#v", payload.Mode)
	}
	if payload.Command == nil || *payload.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", payload.Command)
	}
	if payload.Reason == nil || *payload.Reason != "Programmatic restart is not available in this runtime." {
		t.Fatalf("unexpected manual restart reason %#v", payload.Reason)
	}
}

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
	if settingsSnapshot.Revision != 2 {
		t.Fatalf("expected settings revision 2, got %d", settingsSnapshot.Revision)
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

	if app.AgentRuns() == nil {
		t.Fatal("expected managed agent run service")
	}
	if !app.AgentRuns().Disabled() {
		t.Fatal("expected managed agent run service to be disabled before an executor is wired")
	}
	if app.ManagedAgentRuntime() == nil {
		t.Fatal("expected managed agent run runtime")
	}
	if !app.ManagedAgentRuntime().Disabled() {
		t.Fatal("expected managed agent run runtime to be disabled before an executor is wired")
	}
	if app.RunChainRuntime() == nil {
		t.Fatal("expected run-chain runtime")
	}
	if app.RunChainRuntime().Disabled() {
		t.Fatal("expected run-chain runtime to stay available through the external-agent step boundary")
	}
}

func TestAppServesManagedAgentRunRoutesAsUnavailableWithoutExecutor(t *testing.T) {
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	requests := []struct {
		path string
		body string
	}{
		{
			path: httpapi.RouteStartAgentRun,
			body: `{"profileId":"profile-alpha","inputs":{"allowUnscoped":true}}`,
		},
		{
			path: httpapi.RouteStopAgentRun,
			body: `{"runId":"run-alpha"}`,
		},
	}

	for _, tc := range requests {
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+tc.path, strings.NewReader(tc.body))
		if err != nil {
			t.Fatalf("new request for %s: %v", tc.path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", tc.path, err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("expected 503 for %s, got %d with body %q", tc.path, response.StatusCode, string(body))
		}
		if !strings.Contains(string(body), `"code":"managed_agent_run_unavailable"`) {
			t.Fatalf("expected managed_agent_run_unavailable for %s, got %q", tc.path, string(body))
		}
	}
}

func TestAppServesRunChainRoutesAndPersistedReadback(t *testing.T) {
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	startRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteStartRunChain, strings.NewReader(`{"spec":{"id":"chain-alpha","name":"Chain Alpha","steps":[]}}`))
	if err != nil {
		t.Fatalf("new start run chain request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("post start run chain: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started run chain: %v", err)
	}
	if strings.TrimSpace(started.ID) == "" {
		t.Fatalf("expected run id, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := app.RunChainRuntime().WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for run chain completion: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run chain, got %#v", completed)
	}

	getRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetAgentRun, strings.NewReader(`{"runId":"`+started.ID+`"}`))
	if err != nil {
		t.Fatalf("new get agent run request: %v", err)
	}
	getRequest.Header.Set("Content-Type", "application/json")
	getRequest.AddCookie(authCookie)

	getResponse, err := http.DefaultClient.Do(getRequest)
	if err != nil {
		t.Fatalf("post get agent run: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", getResponse.StatusCode, string(body))
	}

	var fetched agentruns.Run
	if err := json.NewDecoder(getResponse.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched run: %v", err)
	}
	if fetched.ID != started.ID || fetched.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed fetched run %q, got %#v", started.ID, fetched)
	}

	listRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAgentRuns, nil)
	if err != nil {
		t.Fatalf("new get agent runs request: %v", err)
	}
	listRequest.AddCookie(authCookie)

	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("get agent runs: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var runs []agentruns.Run
	if err := json.NewDecoder(listResponse.Body).Decode(&runs); err != nil {
		t.Fatalf("decode runs list: %v", err)
	}
	if len(runs) != 1 || runs[0].ID != started.ID {
		t.Fatalf("expected one run %q in list, got %#v", started.ID, runs)
	}

	stopRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteStopRunChain, strings.NewReader(`{"runId":"`+started.ID+`"}`))
	if err != nil {
		t.Fatalf("new stop run chain request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("post stop run chain: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopped agentruns.Run
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopped); err != nil {
		t.Fatalf("decode stopped run chain: %v", err)
	}
	if stopped.ID != started.ID || stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed stopped run %q, got %#v", started.ID, stopped)
	}
}

func TestAppIDEStartupSyncsWatchCodeServiceFromSavedProjectState(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watch.py"},
				WatchCodeFolders: []projectstate.WatchCodeFolder{
					{Path: "pkg", Recursive: true},
				},
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
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

	if app.watchCode == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	expected := map[string]watchcode.ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Files: []string{
				filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "watch.py"),
			},
			Folders: []watchcode.FolderInput{
				{Path: filepath.Join(cfg.Paths.WorkspaceRoot, "pkg"), Recursive: true},
			},
		},
	}
	if !reflect.DeepEqual(app.watchCode.ConfigSnapshots(), expected) {
		t.Fatalf("expected synced watch code config snapshots %#v, got %#v", expected, app.watchCode.ConfigSnapshots())
	}
}

func TestAppMainRuntimeSaveSyncsWatchCodeServiceConfigs(t *testing.T) {
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

	if app.watchCode == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFiles:   []string{"pkg/watch.py"},
			WatchCodeFolders: []projectstate.WatchCodeFolder{
				{Path: "pkg/nested", Recursive: false},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save main runtime: %v", err)
	}

	expected := map[string]watchcode.ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Files: []string{
				filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "watch.py"),
			},
			Folders: []watchcode.FolderInput{
				{Path: filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "nested"), Recursive: false},
			},
		},
	}
	if !reflect.DeepEqual(app.watchCode.ConfigSnapshots(), expected) {
		t.Fatalf("expected watch code configs after save %#v, got %#v", expected, app.watchCode.ConfigSnapshots())
	}
}

func TestAppWatchCodeRuntimeAppliesFileCreateAndDeleteCallbacks(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFolders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
	}

	watchFile := filepath.Join(watchDir, "created.py")
	if err := os.WriteFile(watchFile, []byte("def created(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.created.created:function"]
		if !ok || entry.SourcePath != watchFile || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, _, impl, err := project.ResolveSection(entry.SectionIDs[0])
		if err != nil {
			return false
		}
		if string(impl.Kind) != "callable" {
			return false
		}
		return true
	})

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		return len(project.WatchCodeRegistry) == 0 && len(project.WatchCodeBaselineByPath) == 0
	})
}

func TestAppSetCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
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

	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	entry, ok := project.WatchCodeRegistry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", project.WatchCodeRegistry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}

	callableSectionID := entry.SectionIDs[0]
	_, _, impl, err := project.ResolveSection(callableSectionID)
	if err != nil {
		t.Fatalf("resolve callable section: %v", err)
	}
	if impl.Kind != projectstate.SectionKind("callable") {
		t.Fatalf("expected callable section impl, got %q", impl.Kind)
	}

	codeObjNames := map[string]struct{}{}
	for _, codeObj := range project.CodeObjs {
		codeObjNames[codeObj.Name] = struct{}{}
	}
	if _, ok := codeObjNames["sorted"]; !ok {
		t.Fatalf("expected callable code object after setCode route, got %#v", codeObjNames)
	}
}

func TestAppFormatCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
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

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before route format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post format code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after formatCode route: %v", err)
	}
	entry, ok := project.WatchCodeRegistry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", project.WatchCodeRegistry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}

	payload := mustDecodedProjectPayloadValue(t, project.SectionImpls["impl-main"].Payload)
	if got := payload["code"]; got != "def sorted(iterable):\n    return iterable\n" {
		t.Fatalf("expected formatted code payload, got %#v", got)
	}
}

func TestAppBoundCodeFileRuntimeAppliesWatchCodeReloads(t *testing.T) {
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

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code bound project: %v", err)
	}
	time.Sleep(400 * time.Millisecond)

	boundPath := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(boundPath), 0o755); err != nil {
		t.Fatalf("mkdir bound file parent: %v", err)
	}
	updatedSource := "def existing(value):\n    return value\n\n\ndef external_added(value):\n    return value\n"
	if err := os.WriteFile(boundPath, []byte(updatedSource), 0o644); err != nil {
		t.Fatalf("write bound file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.bound.external_added:function"]
		if !ok || len(entry.SectionIDs) != 1 {
			return false
		}
		boundSection, ok, err := project.ResolveWatchCodeBoundSection("section-main", cfg.Paths.WorkspaceRoot)
		if err != nil || !ok {
			return false
		}
		return boundSection.Code == updatedSource
	})
}

func TestAppLauncherDoesNotStartWatchCodeService(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCode != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}
}

func TestAppServesDeleteTerminalsRoute(t *testing.T) {
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

	output := waitForAppTestOutputContains(t, attachment, "CHILD_EXIT:130")
	if !strings.Contains(output, "CHILD_INTERRUPTED") {
		t.Fatalf("expected terminal to report interrupt, got %q", output)
	}
}

func TestAppServesRunCodeRoute(t *testing.T) {
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
	output := waitForAppTestOutputContains(t, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeSaveMaterializesPluginCodegenOutputs(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	installAppBackendCodegenFixture(t, cfg)
	seedAppRunCodeProject(t, app, cfg, "print('APP_PLUGIN_RUN_OK')\n")

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
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

	matches, err := filepath.Glob(filepath.Join(outputRoot, "*", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one plugin codegen output, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read plugin codegen output: %v", err)
	}
	expected := "export class AppPluginState {\n  readonly projectName = 'Alpha';\n}\n"
	if string(content) != expected {
		t.Fatalf("unexpected plugin codegen output: %q", string(content))
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
	output := waitForAppTestOutputContains(t, attachment, "APP_PLUGIN_RUN_OK")
	if !strings.Contains(output, "APP_PLUGIN_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppMainRuntimeSaveMaterializesPluginCodegenOutputs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	installAppBackendCodegenFixture(t, cfg)
	seedAppRunCodeProject(t, app, cfg, "print('APP_SAVE_OK')\n")

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.CodegenTargets = []projectstate.ProjectCodegenTarget{
			{
				Language: "setta-fixture-backend-codegen:typescript",
				Payload: mustAppJSON(t, map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options": map[string]any{
						"className": "DirectSaveState",
					},
				}),
			},
		}
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one plugin codegen output, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read plugin codegen output: %v", err)
	}
	expected := "export class DirectSaveState {\n  readonly projectName = 'Alpha';\n}\n"
	if string(content) != expected {
		t.Fatalf("unexpected plugin codegen output: %q", string(content))
	}
}

func TestAppMainRuntimeSaveMaterializesPythonCodegenOutputs(t *testing.T) {
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

	seedAppPythonCodegenProject(t, app)

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(cfg.Paths.SettaFilesRoot, "Alpha")
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)

	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	if !strings.Contains(string(code), "from . import setta_gen_meta") {
		t.Fatalf("expected metadata import in generated code:\n%s", string(code))
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected generated section assignment:\n%s", string(code))
	}

	meta, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("read generated python metadata: %v", err)
	}
	if !strings.Contains(string(meta), "class SettaGenMetadata:") {
		t.Fatalf("expected generated python metadata:\n%s", string(meta))
	}
}

func TestAppServesSetProjectConfigCodegenTargetsRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	installAppBackendCodegenFixture(t, cfg)

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

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets, strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"RouteState"}}]}`))
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
		t.Fatalf("post codegen targets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectview.SingleConfig
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project state response: %v", err)
	}
	if payload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectConfig.ID)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one codegen target in response, got %d", len(payload.ProjectConfig.CodegenTargets))
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one plugin codegen output, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read plugin codegen output: %v", err)
	}
	expected := "export class RouteState {\n  readonly projectName = 'Alpha';\n}\n"
	if string(content) != expected {
		t.Fatalf("unexpected plugin codegen output: %q", string(content))
	}
}

func TestAppLinkedPluginCodegenTargetsWorkWithoutRestart(t *testing.T) {
	// Linking a plugin-backed codegen target after startup should not require a
	// separate app-owned hot-refresh path before the target can be selected.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)

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

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend-codegen")
	localPluginRoot := filepath.Join(t.TempDir(), "backend-codegen")
	copyAppTestDir(t, sourceRoot, localPluginRoot)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	postJSON := func(path string, body any, responseBody any) {
		t.Helper()

		requestBody := mustAppJSON(t, body)
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, bytes.NewReader(requestBody))
		if err != nil {
			t.Fatalf("new request %s: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			payload, _ := io.ReadAll(response.Body)
			t.Fatalf("expected %s 200, got %d with body %q", path, response.StatusCode, string(payload))
		}
		if responseBody == nil {
			return
		}
		if err := json.NewDecoder(response.Body).Decode(responseBody); err != nil {
			t.Fatalf("decode %s response: %v", path, err)
		}
	}
	getRuntime := func() struct {
		Status struct {
			Plugins []struct {
				PluginID                 string `json:"pluginId"`
				RegisteredCodegenTargets []struct {
					TargetID string `json:"targetId"`
				} `json:"registeredCodegenTargets"`
			} `json:"plugins"`
		} `json:"status"`
	} {
		t.Helper()

		request, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
		if err != nil {
			t.Fatalf("new plugin runtime request: %v", err)
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("get plugin runtime: %v", err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
		}

		var payload struct {
			Status struct {
				Plugins []struct {
					PluginID                 string `json:"pluginId"`
					RegisteredCodegenTargets []struct {
						TargetID string `json:"targetId"`
					} `json:"registeredCodegenTargets"`
				} `json:"plugins"`
			} `json:"status"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatalf("decode plugin runtime payload: %v", err)
		}
		return payload
	}

	postJSON(httpapi.RoutePluginsLink, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	}, nil)

	runtimePayload := getRuntime()
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one linked plugin in runtime payload, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-backend-codegen" {
		t.Fatalf("unexpected linked plugin runtime payload %#v", runtimePayload.Status.Plugins[0])
	}
	if len(runtimePayload.Status.Plugins[0].RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected one linked plugin codegen target, got %#v", runtimePayload.Status.Plugins[0].RegisteredCodegenTargets)
	}
	if runtimePayload.Status.Plugins[0].RegisteredCodegenTargets[0].TargetID != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("unexpected linked plugin codegen registration %#v", runtimePayload.Status.Plugins[0].RegisteredCodegenTargets[0])
	}

	var payload projectview.SingleConfig
	postJSON(httpapi.RouteSetProjectConfigCodegenTargets, map[string]any{
		"projectConfigId": "project-alpha",
		"codegenTargets": []map[string]any{
			{
				"language": "setta-fixture-backend-codegen:typescript",
				"options": map[string]any{
					"className": "LinkedState",
				},
			},
		},
	}, &payload)

	if payload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectConfig.ID)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one codegen target in response, got %d", len(payload.ProjectConfig.CodegenTargets))
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob linked plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one linked plugin codegen output, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read linked plugin codegen output: %v", err)
	}
	expected := "export class LinkedState {\n  readonly projectName = 'Alpha';\n}\n"
	if string(content) != expected {
		t.Fatalf("unexpected linked plugin codegen output: %q", string(content))
	}
}

func TestAppServesSetProjectConfigCodegenTargetsRouteForPython(t *testing.T) {
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

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                 "project-alpha",
			Name:               "Alpha",
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
			ViewModes: map[string]projectstate.ViewMode{
				"focus": {
					ID: "focus",
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","generateMetadata":true}]}`),
	)
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
		t.Fatalf("post codegen targets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectview.SingleConfig
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project state response: %v", err)
	}
	if payload.SingletonSections.GenPythonCode == nil || *payload.SingletonSections.GenPythonCode != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton, got %#v", payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata == nil || *payload.SingletonSections.GenPythonMetadata != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton, got %#v", payload.SingletonSections.GenPythonMetadata)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	if !strings.Contains(string(payload.SectionImpls[codeImplID]), `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body in response payload, got %q", string(payload.SectionImpls[codeImplID]))
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(cfg.Paths.SettaFilesRoot, "Alpha")
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)
	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected generated python code file:\n%s", string(code))
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("expected generated python metadata file, got %v", err)
	}
}

func TestAppServesRunCodeRouteWithDrawSnapshots(t *testing.T) {
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

	uploadBody, uploadContentType := buildAppBinaryUploadBody(t, []byte("snapshot-bytes"), "false")
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

	runRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, bytes.NewReader(runRequestBody))
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

	drawSnapshotPath, err := projectstate.BuildDrawSnapshotPath("draw-section", filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts"))
	if err != nil {
		t.Fatalf("build draw snapshot path: %v", err)
	}
	written, err := os.ReadFile(drawSnapshotPath)
	if err != nil {
		t.Fatalf("read draw snapshot path: %v", err)
	}
	if string(written) != "snapshot-bytes" {
		t.Fatalf("expected draw snapshot bytes, got %q", string(written))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, drawImpl, err := project.ResolveSection("draw-section")
	if err != nil {
		t.Fatalf("resolve draw section: %v", err)
	}
	if drawImpl.Draw == nil {
		t.Fatal("expected draw impl")
	}
	if drawImpl.Draw.RenderedImagePath != drawSnapshotPath {
		t.Fatalf("expected rendered image path %q, got %q", drawSnapshotPath, drawImpl.Draw.RenderedImagePath)
	}

	if _, err := app.BinaryStore().ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected binary payload to be deleted, got %v", err)
	}

	_, _, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if codeImpl.Code == nil || codeImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(codeImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppServesRunCodeRouteWithSectionVariantOverrides(t *testing.T) {
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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
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

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["code-section"]; got != "code-python-variant" {
		t.Fatalf("expected active section variant to stay code-python-variant, got %q", got)
	}

	_, _, pythonImpl, err := project.ResolveSectionWithVariant("code-section", "code-python-variant")
	if err != nil {
		t.Fatalf("resolve python variant: %v", err)
	}
	if pythonImpl.Code == nil {
		t.Fatal("expected python code impl")
	}
	if pythonImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("did not expect python variant to gain an attached terminal, got %q", pythonImpl.Code.AttachedTerminalSectionID)
	}

	_, _, bashImpl, err := project.ResolveSectionWithVariant("code-section", "code-bash-variant")
	if err != nil {
		t.Fatalf("resolve bash variant: %v", err)
	}
	if bashImpl.Code == nil || bashImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected bash override variant to gain an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(bashImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, attachment, "APP_BASH_OK")
	if !strings.Contains(output, "APP_BASH_OK") {
		t.Fatalf("expected bash override output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeRouteRejectsUnsupportedCLIID(t *testing.T) {
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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`))
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
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if !strings.Contains(string(body), `"code":"unsupported_run_code_cli"`) {
		t.Fatalf("expected unsupported_run_code_cli error, got %q", string(body))
	}
}

func testConfig(t *testing.T) config.Config {
	t.Helper()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	return config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         workspaceRoot,
			SettaHome:             settaHome,
			ProfileLookupHome:     settaHome,
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           filepath.Join(settaFilesRoot, "runtime"),
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
}

func newAppTestAuthCookie(t *testing.T, app *App) *http.Cookie {
	t.Helper()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	return &http.Cookie{
		Name:  cookieName,
		Value: token,
	}
}

func saveAppMainProjectDocument(t *testing.T, cfg config.Config, document projectstate.Document) error {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	return store.Save(context.Background(), document)
}

func waitForAppWatchCodeProject(t *testing.T, app *App, projectID string, predicate func(projectstate.Project) bool) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		project, ok := snapshot.Document.Projects[projectID]
		if ok && predicate(project) {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for watch code project state for %q; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func seedAppRunCodeProject(t *testing.T, app *App, cfg config.Config, source string) {
	t.Helper()

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(source), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
				"helper-section",
				"draw-section",
			},
			SectionVariantMap: map[string]string{
				"code-section":   "code-python-variant",
				"helper-section": "helper-variant",
				"draw-section":   "draw-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
					DefaultVariantID: "code-python-variant",
				},
				"helper-section": {
					ID:               "helper-section",
					Name:             "Helper",
					VariantIDs:       []string{"helper-variant"},
					DefaultVariantID: "helper-variant",
				},
				"draw-section": {
					ID:               "draw-section",
					Name:             "Canvas",
					VariantIDs:       []string{"draw-variant"},
					DefaultVariantID: "draw-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-python-variant": {
					ID:     "code-python-variant",
					ImplID: "code-python-impl",
				},
				"code-bash-variant": {
					ID:     "code-bash-variant",
					ImplID: "code-bash-impl",
				},
				"helper-variant": {
					ID:     "helper-variant",
					ImplID: "helper-impl",
				},
				"draw-variant": {
					ID:     "draw-variant",
					ImplID: "draw-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-python-impl": {
					ID:   "code-python-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
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
				"helper-impl": {
					ID:   "helper-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/helper.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"draw-impl": {
					ID:   "draw-impl",
					Kind: projectstate.SectionKindDraw,
					Draw: &projectstate.DrawSectionImpl{},
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}
}

func seedAppLSPCodeSectionProject(t *testing.T, app *App) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithSource(t, app, "print('runner')\n")
}

func seedAppLSPCodeSectionProjectWithSource(t *testing.T, app *App, source string) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"runner": "runner-variant",
			},
			Sections: map[string]projectstate.Section{
				"runner": {
					ID:               "runner",
					Name:             "Runner",
					VariantIDs:       []string{"runner-variant"},
					DefaultVariantID: "runner-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"runner-variant": {
					ID:     "runner-variant",
					ImplID: "runner-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"runner-impl": {
					ID:   "runner-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":           "runner-impl",
						"type":         "Code",
						"code":         source,
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate lsp code section project: %v", err)
	}
}

func seedAppPythonCodegenProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                    "project-alpha",
			Name:                  "Alpha",
			EntryCodeBlockID:      "section-1",
			ShowParamDisplayNames: true,
			PreviewImgColor:       "#112233",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload: mustAppJSON(t, map[string]any{
						"language":         string(projectstate.CodeLanguagePython),
						"generateMetadata": true,
					}),
				},
			},
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					Name:   "Greeting Variant",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
}

func seedAppWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "pkg/bound.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "def existing(value):\n    return value\n",
						"codeFileBinding": map[string]any{
							"path":        "pkg/bound.py",
							"access_mode": "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate watch code bound section project: %v", err)
	}
}

func prepareAppLSPFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_LSP_COMMAND", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_LSP_ARGS",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"plugins",
			"backend-language-server-e2e",
			"backend",
			"mini_language_server.py",
		),
	)
}

func prepareAppCurrentSession(t *testing.T, cfg config.Config) {
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

func buildAppBinaryUploadBody(t *testing.T, payload []byte, durable string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fileWriter, err := writer.CreateFormFile("file", "snapshot.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("durable", durable); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	return body, writer.FormDataContentType()
}

func mustAppJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal app test json: %v", err)
	}
	return payload
}

func quietAppTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireAppTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveAppTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireAppTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func attachAppTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func prepareAppInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForAppTestOutputContains(t, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeAppInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startAppInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteApp(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForAppTestOutputContains(t, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
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
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
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

func shellSingleQuoteApp(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func requireAppTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func prepareAppPluginWorkerRuntime(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PLUGIN_WORKER_PYTHON", appTestWorkerPython(t, repoRoot))
	t.Setenv("SETTA_PLUGIN_WORKER_PYTHONPATH", filepath.Join(repoRoot, "backend"))
}

func installAppBackendCodegenFixture(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend-codegen", "setta-fixture-backend-codegen")
}

func installAppPluginFixture(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func appTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app test file")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func appTestWorkerPython(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}

func copyAppTestDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyAppTestDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func skipIfAppTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
