package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	appsubsystemprovider "setta/internal/testutil/appsubsystemprovider"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/watchcodecontracts"
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

func TestAppServesDocstringToMarkdownRoute(t *testing.T) {
	// The text-block markdown toggle should hit the real IDE app route instead of
	// falling back to the Python helper.
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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDocstringToMarkdown,
		strings.NewReader(`{"docstring":"just text"}`),
	)
	if err != nil {
		t.Fatalf("new docstring request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post docstring route: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected docstring route 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload string
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode docstring payload: %v", err)
	}
	if payload != "just text" {
		t.Fatalf("unexpected docstring route payload %q", payload)
	}
}

func TestAppServesAppDefinitionRoutes(t *testing.T) {
	// The app-config pane should load catalog/read/write/validate through the
	// real IDE app route stack without falling back to Python.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, firstpartyplugin.AppSubsystemPluginID)

	assertAppDefinitionRoutesServe(t, cfg)
}

func TestAppServesAppDefinitionRoutesWithUnknownIDPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppFixturePlugin(t, cfg, "app-subsystem-unknown-id")
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

	assertAppDefinitionRoutesServe(t, cfg)
}

func TestAppServesAppDefinitionRoutesWithUnknownIDPackageManagerPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installAppPackageManagerFixturePlugin(t, sitePackages, "app-subsystem-unknown-id")
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

	assertAppDefinitionRoutesServe(t, cfg)
}

func assertAppDefinitionRoutesServe(t *testing.T, cfg config.Config) {
	t.Helper()

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

	catalogRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAppCatalog, nil)
	if err != nil {
		t.Fatalf("new app catalog request: %v", err)
	}
	catalogRequest.AddCookie(authCookie)
	catalogResponse, err := http.DefaultClient.Do(catalogRequest)
	if err != nil {
		t.Fatalf("get app catalog: %v", err)
	}
	defer catalogResponse.Body.Close()
	if catalogResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(catalogResponse.Body)
		t.Fatalf("expected app catalog 200, got %d with body %q", catalogResponse.StatusCode, string(body))
	}

	setRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}},"theme":{"mode":"dark"}}`),
	)
	if err != nil {
		t.Fatalf("new set app definition request: %v", err)
	}
	setRequest.Header.Set("Content-Type", "application/json")
	setRequest.AddCookie(authCookie)
	setResponse, err := http.DefaultClient.Do(setRequest)
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
	defer setResponse.Body.Close()
	if setResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(setResponse.Body)
		t.Fatalf("expected set app definition 200, got %d with body %q", setResponse.StatusCode, string(body))
	}

	getRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetAppDefinition,
		strings.NewReader(`{}`),
	)
	if err != nil {
		t.Fatalf("new get app definition request: %v", err)
	}
	getRequest.Header.Set("Content-Type", "application/json")
	getRequest.AddCookie(authCookie)
	getResponse, err := http.DefaultClient.Do(getRequest)
	if err != nil {
		t.Fatalf("get app definition: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected get app definition 200, got %d with body %q", getResponse.StatusCode, string(body))
	}

	validateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteValidateAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}}}`),
	)
	if err != nil {
		t.Fatalf("new validate app definition request: %v", err)
	}
	validateRequest.Header.Set("Content-Type", "application/json")
	validateRequest.AddCookie(authCookie)
	validateResponse, err := http.DefaultClient.Do(validateRequest)
	if err != nil {
		t.Fatalf("validate app definition: %v", err)
	}
	defer validateResponse.Body.Close()
	if validateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(validateResponse.Body)
		t.Fatalf("expected validate app definition 200, got %d with body %q", validateResponse.StatusCode, string(body))
	}
}

func TestAppServesAppGenSkillRoutes(t *testing.T) {
	// The real app should serve the skills browser routes from the Go-owned filesystem owner.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, firstpartyplugin.AppSubsystemPluginID)

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

func TestAppServesPluginBackendRoutesAndStaticDirs(t *testing.T) {
	// The real IDE app should route backend plugin HTTP registrations through the Go root handler while keeping static dirs public.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
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
	manifest["capabilities"] = []string{"registerRouter", "registerStaticDir"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode backend plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write backend plugin manifest: %v", err)
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

	unauthorizedRouteResponse, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatalf("get unauthorized backend route: %v", err)
	}
	defer unauthorizedRouteResponse.Body.Close()
	if unauthorizedRouteResponse.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(unauthorizedRouteResponse.Body)
		t.Fatalf("expected unauthorized backend route 401, got %d with body %q", unauthorizedRouteResponse.StatusCode, string(body))
	}

	staticResponse, err := http.Get(server.URL + "/static/fixture.txt")
	if err != nil {
		t.Fatalf("get backend static dir asset: %v", err)
	}
	defer staticResponse.Body.Close()
	if staticResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(staticResponse.Body)
		t.Fatalf("expected backend static asset 200, got %d with body %q", staticResponse.StatusCode, string(body))
	}
	staticBody, err := io.ReadAll(staticResponse.Body)
	if err != nil {
		t.Fatalf("read backend static asset body: %v", err)
	}
	if strings.TrimSpace(string(staticBody)) != "backend static fixture" {
		t.Fatalf("unexpected backend static asset body %q", string(staticBody))
	}

	authCookie := newAppTestAuthCookie(t, app)

	healthRequest, err := http.NewRequest(http.MethodGet, server.URL+"/health", nil)
	if err != nil {
		t.Fatalf("new backend health request: %v", err)
	}
	healthRequest.AddCookie(authCookie)
	healthResponse, err := http.DefaultClient.Do(healthRequest)
	if err != nil {
		t.Fatalf("get authorized backend route: %v", err)
	}
	defer healthResponse.Body.Close()
	if healthResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(healthResponse.Body)
		t.Fatalf("expected backend health 200, got %d with body %q", healthResponse.StatusCode, string(body))
	}
	var healthPayload map[string]any
	if err := json.NewDecoder(healthResponse.Body).Decode(&healthPayload); err != nil {
		t.Fatalf("decode backend health payload: %v", err)
	}
	if healthPayload["hasAuth"] != true {
		t.Fatalf("expected auth context in backend health payload, got %#v", healthPayload)
	}

	createRequest, err := http.NewRequest(http.MethodPost, server.URL+"/items?view=app", strings.NewReader(`{"name":"app-item"}`))
	if err != nil {
		t.Fatalf("new backend create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)
	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post backend route: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected backend create 201, got %d with body %q", createResponse.StatusCode, string(body))
	}
	if createResponse.Header.Get("X-Plugin") != "backend-fixture" {
		t.Fatalf("expected plugin response header, got %#v", createResponse.Header)
	}
	var createPayload map[string]any
	if err := json.NewDecoder(createResponse.Body).Decode(&createPayload); err != nil {
		t.Fatalf("decode backend create payload: %v", err)
	}
	if createPayload["rawQuery"] != "view=app" || createPayload["contentType"] != "application/json" {
		t.Fatalf("unexpected backend create payload %#v", createPayload)
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

func TestAppServesProgrammaticPluginRestartRouteInIDE(t *testing.T) {
	// The real IDE app should wire plugin restart into the live backend-runtime refresh path.
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
	if !payload.Accepted {
		t.Fatalf("expected accepted restart payload, got %#v", payload)
	}
	if payload.Mode != "programmatic" {
		t.Fatalf("expected programmatic restart mode, got %#v", payload.Mode)
	}
	if payload.Command != nil {
		t.Fatalf("expected accepted restart to omit fallback command, got %#v", payload.Command)
	}
	if payload.Reason != nil {
		t.Fatalf("expected accepted restart to omit fallback reason, got %#v", payload.Reason)
	}
}

func TestAppPluginRuntimeReportsProgrammaticRestartCapabilityInIDE(t *testing.T) {
	// The plugins runtime payload consumed by the overview pane should expose
	// programmatic restart capability in the real IDE app.
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
		List struct {
			ServerMode        string `json:"serverMode"`
			RestartCapability struct {
				Mode    string  `json:"mode"`
				Command *string `json:"command"`
				Reason  *string `json:"reason"`
			} `json:"restartCapability"`
		} `json:"list"`
		Status struct {
			ServerMode        string `json:"serverMode"`
			RestartCapability struct {
				Mode    string  `json:"mode"`
				Command *string `json:"command"`
				Reason  *string `json:"reason"`
			} `json:"restartCapability"`
		} `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if payload.List.ServerMode != "ide" || payload.Status.ServerMode != "ide" {
		t.Fatalf("expected ide runtime payload, got list=%q status=%q", payload.List.ServerMode, payload.Status.ServerMode)
	}
	if payload.List.RestartCapability.Mode != "programmatic" {
		t.Fatalf("expected programmatic list restart capability, got %#v", payload.List.RestartCapability)
	}
	if payload.Status.RestartCapability.Mode != "programmatic" {
		t.Fatalf("expected programmatic status restart capability, got %#v", payload.Status.RestartCapability)
	}
	if payload.List.RestartCapability.Command != nil || payload.List.RestartCapability.Reason != nil {
		t.Fatalf("expected list restart capability without fallback payload, got %#v", payload.List.RestartCapability)
	}
	if payload.Status.RestartCapability.Command != nil || payload.Status.RestartCapability.Reason != nil {
		t.Fatalf("expected status restart capability without fallback payload, got %#v", payload.Status.RestartCapability)
	}
}

func TestAppPluginRestartClearsPendingBackendPluginState(t *testing.T) {
	// Process start and programmatic restart should both rebuild backend plugin runtime
	// and clear persisted pending_restart markers.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")
	if err := os.WriteFile(
		filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"),
		[]byte(`{"pendingRestartBackendPluginIds":["setta-fixture-backend"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
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
	doRequest := func(method string, path string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(method, server.URL+path, nil)
		if err != nil {
			t.Fatalf("new %s %s request: %v", method, path, err)
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return response
	}
	readPluginState := func() string {
		t.Helper()

		response := doRequest(http.MethodGet, "/api"+httpapi.RoutePluginsRuntime)
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
				return entry.State
			}
		}
		t.Fatal("expected backend plugin runtime entry")
		return ""
	}

	if state := readPluginState(); state != "active" {
		t.Fatalf("expected backend plugin to be active after process start, got %q", state)
	}
	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected process start to clear pending restart ids, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}

	if err := os.WriteFile(
		filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"),
		[]byte(`{"pendingRestartBackendPluginIds":["setta-fixture-backend"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write pending restart plugin state after startup: %v", err)
	}
	rescanResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsRescan)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugin rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}
	if state := readPluginState(); state != "pending_restart" {
		t.Fatalf("expected backend plugin to be pending_restart before restart, got %q", state)
	}

	restartResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsRestart)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected plugin restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Accepted bool   `json:"accepted"`
		Mode     string `json:"mode"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode plugin restart payload: %v", err)
	}
	if !restartPayload.Accepted || restartPayload.Mode != "programmatic" {
		t.Fatalf("expected accepted programmatic restart payload, got %#v", restartPayload)
	}

	if state := readPluginState(); state != "active" {
		t.Fatalf("expected backend plugin to be active after restart, got %q", state)
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

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Managed agent\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":2,\"total_tokens\":10}}\n\n")
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

	profileStore, err := agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	engineConfigID := "engine-managed"
	if err := profileStore.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineConfigID,
		},
	}); err != nil {
		t.Fatalf("write agent profile: %v", err)
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
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartAgentRun,
		strings.NewReader(`{"profileId":"profile-alpha","inputs":{"allowUnscoped":true,"prompt":"Plan this task."}}`),
	)
	if err != nil {
		t.Fatalf("new start run request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start managed agent run: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected start run 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running managed run, got %#v", started)
	}

	var loaded agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetAgentRun,
			strings.NewReader(`{"runId":"`+started.ID+`"}`),
		)
		if err != nil {
			t.Fatalf("new get run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get managed run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected get run 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&loaded); err != nil {
			t.Fatalf("decode managed run: %v", err)
		}
		return loaded.Status == agentruns.RunStatusCompleted
	})
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

func TestAppServesStateMachineRunRoutesWithManagedChatExecutor(t *testing.T) {
	// The real IDE app should be able to start a workflow run, dispatch the
	// child managed chat through the Go executor, and mark the parent workflow
	// completed when the child finishes.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	type providerRequest struct {
		Path          string
		Authorization string
		Body          map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case providerRequests <- providerRequest{
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

	var parentByID agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRunRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetAgentRun,
			strings.NewReader(`{"runId":"`+started.ID+`"}`),
		)
		if err != nil {
			t.Fatalf("new get parent run request: %v", err)
		}
		getRunRequest.Header.Set("Content-Type", "application/json")
		getRunRequest.AddCookie(authCookie)

		getRunResponse, err := http.DefaultClient.Do(getRunRequest)
		if err != nil {
			t.Fatalf("get parent run by id: %v", err)
		}
		defer getRunResponse.Body.Close()
		if getRunResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getRunResponse.Body)
			t.Fatalf("expected get parent run 200, got %d with body %q", getRunResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getRunResponse.Body).Decode(&parentByID); err != nil {
			t.Fatalf("decode parent run by id: %v", err)
		}
		return parentByID.Status == agentruns.RunStatusCompleted || parentByID.Status == agentruns.RunStatusFailed
	})
	if parentByID.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run, got %#v", parentByID)
	}

	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetStateMachineRun,
			strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
		)
		if err != nil {
			t.Fatalf("new get workflow run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get workflow run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected workflow get 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&latest); err != nil {
			t.Fatalf("decode latest workflow run: %v", err)
		}
		return latest.ID == started.ID && latest.Status == agentruns.RunStatusCompleted
	})
	if latest.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed workflow run, got %#v", latest)
	}
	if !appTestHasRunEventType(latest, "run_completed") {
		t.Fatalf("expected workflow run_completed event, got %#v", latest.Events)
	}
	if got := appTestStringList(latest.Outputs["reachedEndSectionIds"]); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected workflow to reach end-section, got %#v", latest.Outputs["reachedEndSectionIds"])
	}

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

func TestAppStopsStateMachineRunWhileManagedChildIsStillStreaming(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerStarted := make(chan struct{}, 1)
	providerCancelled := make(chan struct{}, 1)
	releaseProvider := make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	defer provider.Close()
	defer close(releaseProvider)

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

	select {
	case <-providerStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow child provider request")
	}

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopStateMachineRun,
		strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
	)
	if err != nil {
		t.Fatalf("new stop workflow request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopClient := &http.Client{Timeout: 2 * time.Second}
	stopResponse, err := stopClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop workflow run: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected workflow stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	select {
	case <-providerCancelled:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow child provider cancellation")
	}

	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetStateMachineRun,
			strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
		)
		if err != nil {
			t.Fatalf("new get workflow run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get workflow run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected workflow get 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&latest); err != nil {
			t.Fatalf("decode latest workflow run: %v", err)
		}
		return latest.Status == agentruns.RunStatusCancelled
	})
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
	completed, err := app.runChains.WaitForRun(waitCtx, started.ID)
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

func TestAppMainRuntimeSaveMaterializesPluginCodegenOutputsToCanonicalPath(t *testing.T) {
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
	linkAppBackendCodegenFixture(t, server.URL, newAppTestAuthCookie(t, app))

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: "setta-fixture-backend-codegen:typescript",
					Payload: mustAppJSON(t, map[string]any{
						"language": "setta-fixture-backend-codegen:typescript",
						"options": map[string]any{
							"className":  "DirectSaveState",
							"outputPath": "./nested//setta_gen.ts",
						},
					}),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "nested", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one plugin codegen output after main save, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read plugin codegen output: %v", err)
	}
	if !strings.Contains(string(content), "export class DirectSaveState") {
		t.Fatalf("expected materialized plugin codegen output, got %q", string(content))
	}
}

func TestAppMainRuntimeSaveRejectsAbsolutePluginCodegenOutputPath(t *testing.T) {
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
	linkAppBackendCodegenFixture(t, server.URL, newAppTestAuthCookie(t, app))

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: "setta-fixture-backend-codegen:typescript",
					Payload: mustAppJSON(t, map[string]any{
						"language": "setta-fixture-backend-codegen:typescript",
						"options": map[string]any{
							"className":  "DirectSaveState",
							"outputPath": "C:/outside.ts",
						},
					}),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	_, err = app.ProjectStates().Main().Save(context.Background())
	if err == nil {
		t.Fatal("expected plugin codegen absolute-path rejection")
	}
	if !strings.Contains(err.Error(), "cannot be absolute") {
		t.Fatalf("expected absolute-path rejection, got %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "*"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no plugin codegen output after failed save, got %v", matches)
	}
}

func TestAppMainRuntimeSaveMaterializesPythonCodegenOutputs(t *testing.T) {
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

func TestAppRejectsPluginSetProjectConfigCodegenTargetsRoute(t *testing.T) {
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
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project error response: %v", err)
	}
	if payload.Error.Code != "invalid_project_codegen_targets" {
		t.Fatalf("expected invalid_project_codegen_targets, got %#v", payload)
	}
	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after rejection: %v", err)
	}
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after rejection, got %#v", project.CodegenTargets)
	}
}

func TestAppLinkedPluginCodegenTargetsBecomeAvailableAfterLink(t *testing.T) {
	// Linking a backend plugin after startup should make its registered codegen targets available without a separate app restart.
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
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	manifestPath := filepath.Join(localPluginRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read linked plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode linked plugin manifest: %v", err)
	}
	manifest["capabilities"] = []string{"registerCodegenTarget"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode linked plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write linked plugin manifest: %v", err)
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
	getRuntime := func() struct {
		Status struct {
			Plugins []struct {
				PluginID                 string                                  `json:"pluginId"`
				RegisteredCodegenTargets []plugins.PluginRegisteredCodegenTarget `json:"registeredCodegenTargets"`
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
					PluginID                 string                                  `json:"pluginId"`
					RegisteredCodegenTargets []plugins.PluginRegisteredCodegenTarget `json:"registeredCodegenTargets"`
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
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-backend" {
		t.Fatalf("unexpected linked plugin runtime payload %#v", runtimePayload.Status.Plugins[0])
	}
	if len(runtimePayload.Status.Plugins[0].RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected linked plugin codegen registration in runtime payload, got %#v", runtimePayload.Status.Plugins[0].RegisteredCodegenTargets)
	}

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": "project-alpha",
		"codegenTargets": []map[string]any{
			{
				"language": "setta-fixture-backend-codegen:typescript",
				"options": map[string]any{
					"className": "LinkedState",
				},
			},
		},
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new setProjectConfigCodegenTargets request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post setProjectConfigCodegenTargets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected setProjectConfigCodegenTargets 200, got %d with body %q", response.StatusCode, string(payload))
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after linked plugin codegen update: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted linked plugin codegen target, got %#v", project.CodegenTargets)
	}
}

func TestAppServesSetProjectConfigCodegenTargetsRouteForPython(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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

	if _, err := app.binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
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
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppServesRunCodeRouteWithSectionVariantOverrides(t *testing.T) {
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
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_BASH_OK")
	if !strings.Contains(output, "APP_BASH_OK") {
		t.Fatalf("expected bash override output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeRouteRejectsUnsupportedCLIID(t *testing.T) {
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

func waitForAppCondition(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func appTestMessageText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		blockType, _ := block["type"].(string)
		if strings.TrimSpace(blockType) != "text" {
			continue
		}
		text, _ := block["text"].(string)
		if text != "" {
			return text
		}
	}
	return ""
}

func appTestStringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			continue
		}
		result = append(result, text)
	}
	return result
}

func appTestMessageTextMapList(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, message)
	}
	return result
}

func appTestHasRunEventType(run agentruns.Run, eventType string) bool {
	for _, event := range run.Events {
		if strings.TrimSpace(event.Type) == eventType {
			return true
		}
	}
	return false
}

func appManagedWorkflowTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	inlinePrompt := "Review the draft."
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"start-section",
			"chat-section",
			"end-section",
		},
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {
				ID:      "start-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "start-impl", "type": "StateMachineStart", "machineGroupId": "workflow-a", "label": "Kickoff"}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{
					"id":             "chat-impl",
					"type":           "Chat",
					"engineConfigId": "engine-managed",
					"agentProfileId": nil,
					"permissionMode": "minimal",
					"searchEnabled":  false,
					"chatId":         nil,
				}),
			},
			"end-impl": {
				ID:      "end-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "end-impl", "type": "StateMachineEnd", "machineGroupId": "workflow-a", "label": "Done"}),
			},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   &inlinePrompt,
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-end",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow app test project: %v", err)
	}
	return project
}

func setAppCompletionGuardEnabled(t *testing.T, app *App, enabled bool) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
		return document, nil
	}); err != nil {
		t.Fatalf("set completion guard enabled=%t: %v", enabled, err)
	}
}

func mustMarshalAppWorkflowObject(t *testing.T, payload map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow app test payload: %v", err)
	}
	return projectstate.RawJSON(raw)
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
			Host:     "127.0.0.1",
			Port:     61234,
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

func fetchAppLatestLSPDiagnostics(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
	projectID string,
) projectstate.LSPDiagnosticsPayload {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":`+strconv.Quote(projectID)+`}`),
	)
	if err != nil {
		t.Fatalf("new diagnostics request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post diagnostics request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected diagnostics 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectstate.LSPDiagnosticsPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics payload: %v", err)
	}
	return payload
}

func fetchAppPluginRuntimeStatus(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
) []plugins.PluginStatusEntry {
	t.Helper()
	return fetchAppPluginRuntime(t, serverURL, cookie).Status.Plugins
}

func fetchAppPluginRuntime(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
) plugins.PluginRuntimeResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, serverURL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload plugins.PluginRuntimeResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	return payload
}

func restartAppLanguageServer(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteRestartLanguageServer, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new restart language server request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post restart language server: %v", err)
	}
	return response
}

func restartAppPlugins(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsRestart, nil)
	if err != nil {
		t.Fatalf("new plugins restart request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins restart: %v", err)
	}
	return response
}

func rescanAppPlugins(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsRescan, nil)
	if err != nil {
		t.Fatalf("new plugins rescan request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins rescan: %v", err)
	}
	return response
}

func postAppPluginLifecycle(t *testing.T, app *App, serverURL string, route string, body string) {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new plugin lifecycle request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugin lifecycle request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin lifecycle 200, got %d with body %q", response.StatusCode, string(payload))
	}
}

func postAppWatchCodePluginRoute(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
	pluginID string,
	route string,
	body string,
) *http.Response {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/plugins/"+pluginID+"/watch-code/"+route,
		strings.NewReader(body),
	)
	if err != nil {
		t.Fatalf("new watch code plugin route request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post watch code plugin route: %v", err)
	}
	return response
}

func postAppPluginConfig(t *testing.T, serverURL string, cookie *http.Cookie, pluginID string, config any) *http.Response {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"pluginId": pluginID,
		"config":   config,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsConfig, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins config: %v", err)
	}
	return response
}

func writeAppPluginConfig(t *testing.T, serverURL string, cookie *http.Cookie, pluginID string, config any) {
	t.Helper()

	response := postAppPluginConfig(t, serverURL, cookie, pluginID, config)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins config 200, got %d with body %q", response.StatusCode, string(payload))
	}
}

func cloneAppRuntimeLanguageServerSpecs(t *testing.T, app *App) ([]lsp.LanguageServerSpec, []lsp.LanguageServerSpec) {
	t.Helper()

	app.pluginRuntime.mu.Lock()
	defer app.pluginRuntime.mu.Unlock()

	return cloneLanguageServerSpecs(app.pluginRuntime.lspSpecs), cloneLanguageServerSpecs(app.pluginRuntime.appliedLSPSpecs)
}

func writeAppPendingRestartPluginState(t *testing.T, cfg config.Config, pluginIDs ...string) {
	t.Helper()

	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(t, cfg, pluginIDs, pluginIDs)
}

func writeDisabledAppPluginState(t *testing.T, cfg config.Config, pluginIDs ...string) {
	t.Helper()

	pluginsStatePayload, err := json.Marshal(map[string]any{
		"disabledPluginIds": pluginIDs,
	})
	if err != nil {
		t.Fatalf("marshal disabled plugin state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"), pluginsStatePayload, 0o644); err != nil {
		t.Fatalf("write disabled plugin state: %v", err)
	}
}

func writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(
	t *testing.T,
	cfg config.Config,
	pluginIDs []string,
	languageServerOnlyPluginIDs []string,
) {
	t.Helper()

	pluginsStatePayload, err := json.Marshal(map[string]any{
		"pendingRestartBackendPluginIds":            pluginIDs,
		"pendingRestartLanguageServerOnlyPluginIds": languageServerOnlyPluginIDs,
	})
	if err != nil {
		t.Fatalf("marshal plugin state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"), pluginsStatePayload, 0o644); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
	}
}

func readAppPluginsState(t *testing.T, cfg config.Config) plugins.PluginsStateFile {
	t.Helper()

	var persistedState plugins.PluginsStateFile
	contents, err := os.ReadFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"))
	if err != nil {
		t.Fatalf("read persisted plugin state: %v", err)
	}
	if err := json.Unmarshal(contents, &persistedState); err != nil {
		t.Fatalf("decode persisted plugin state: %v", err)
	}
	return persistedState
}

func expectAppFixturePluginPendingRestartState(
	t *testing.T,
	cfg config.Config,
	serverURL string,
	cookie *http.Cookie,
	phase string,
) {
	t.Helper()

	status := fetchAppPluginRuntimeStatus(t, serverURL, cookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStatePendingRestart || !entry.RestartRequired {
		t.Fatalf("expected fixture plugin pending restart %s, got %#v", phase, entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected no applied fixture languages %s, got %#v", phase, entry.AppliedLanguageServerLanguages)
	}
	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 1 || persistedState.PendingRestartBackendPluginIDs[0] != "setta-fixture-backend" {
		t.Fatalf("expected pending restart ids to keep fixture plugin %s, got %#v", phase, persistedState.PendingRestartBackendPluginIDs)
	}
	if completions := requestAppCodeAreaCompletion(t, serverURL, cookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 0 {
		t.Fatalf("expected no fixture completions %s, got %#v", phase, completions)
	}
}

func expectAppFixturePluginAppliedState(t *testing.T, serverURL string, cookie *http.Cookie, phase string) {
	t.Helper()

	status := fetchAppPluginRuntimeStatus(t, serverURL, cookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected fixture plugin active %s, got %#v", phase, entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixture plugin to apply fixturedsl %s, got %#v", phase, entry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, serverURL, cookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected fixture completions %s, got %#v", phase, completions)
	}
}

func mustFindAppPluginStatusEntry(
	t *testing.T,
	entries []plugins.PluginStatusEntry,
	pluginID string,
) plugins.PluginStatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.ShadowedBySourcePath == nil {
			return entry
		}
	}
	t.Fatalf("expected plugin status entry %q in %#v", pluginID, entries)
	return plugins.PluginStatusEntry{}
}

func mustFindAppLanguageServerSelectionStatus(
	t *testing.T,
	selections []plugins.LanguageServerSelectionStatus,
	language string,
) plugins.LanguageServerSelectionStatus {
	t.Helper()

	for _, selection := range selections {
		if selection.Language == language {
			return selection
		}
	}
	t.Fatalf("expected language server selection status %q in %#v", language, selections)
	return plugins.LanguageServerSelectionStatus{}
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

func seedAppEmptyProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate empty project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save empty project: %v", err)
	}
}

func waitForAppWatchCodeProject(
	t *testing.T,
	app *App,
	projectID string,
	predicate func(projectstate.Project, projectstate.WatchCodePluginProjectData) bool,
) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		project, ok := snapshot.Document.Projects[projectID]
		projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, projectID)
		if ok && predicate(project, projectData) {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for watch code project state for %q; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func waitForAppWatchCodeCallable(t *testing.T, app *App, projectID string, entryKey string, sourcePath string) {
	t.Helper()

	waitForAppWatchCodeProject(t, app, projectID, func(project projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry[entryKey]
		if !ok || entry.SourcePath != sourcePath || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, _, _, err := project.ResolveSection(entry.SectionIDs[0])
		return err == nil
	})
}

func waitForAppProjectMissing(t *testing.T, app *App, projectID string) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		if _, ok := snapshot.Document.Projects[projectID]; !ok {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for project %q to be removed; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
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

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print('runner')\n")
}

func seedAppLSPCodeSectionProjectWithSource(t *testing.T, app *App, source string) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, source)
}

func seedAppLSPCodeSectionProjectWithLanguage(t *testing.T, app *App, language projectstate.CodeLanguage, source string) {
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
						Language: language,
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":           "runner-impl",
						"type":         "Code",
						"code":         source,
						"codeLanguage": string(language),
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
			ID:   "project-alpha",
			Name: "Alpha",
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
							"canonical_path": "pkg/bound.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"pkg/bound.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate watch code bound section project: %v", err)
	}
}

func appWatchCodeCallableRegistryProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:   "callable-impl",
				Kind: projectstate.SectionKind("callable"),
				Payload: mustAppJSON(t, map[string]any{
					"id":       "callable-impl",
					"type":     "Callable",
					"callable": "seed-callable",
					"codeObjVariantMap": map[string]string{
						"seed-callable":   "seed-callable-variant",
						"target-callable": "target-callable-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"seed-callable": {
				ID:               "seed-callable",
				Name:             "seed_callable",
				VariantIDs:       []string{"seed-callable-variant"},
				DefaultVariantID: "seed-callable-variant",
			},
			"target-callable": {
				ID:               "target-callable",
				Name:             "target_callable",
				VariantIDs:       []string{"target-callable-variant"},
				DefaultVariantID: "target-callable-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"seed-callable-variant": {
				ID:     "seed-callable-variant",
				ImplID: "seed-callable-impl",
			},
			"target-callable-variant": {
				ID:     "target-callable-variant",
				ImplID: "target-callable-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"seed-callable-impl": {
				ID:      "seed-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "seed-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-callable-impl": {
				ID:      "target-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "target-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable registry project: %v", err)
	}
	return project
}

func seedAppRootWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
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
							Path:       "watch_code_test.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "",
						"codeFileBinding": map[string]any{
							"canonical_path": "watch_code_test.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"watch_code_test.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate root watch code bound section project: %v", err)
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
			"lsp",
			"mini_language_server.py",
		),
	)
}

func writeAppGeneratedPythonCodeFixture(t *testing.T, cfg config.Config, projectName string) {
	t.Helper()

	codePath := filepath.Join(
		cfg.Paths.SettaFilesRoot,
		filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath(projectName)),
	)
	if err := os.MkdirAll(filepath.Dir(codePath), 0o755); err != nil {
		t.Fatalf("mkdir generated python code dir: %v", err)
	}
	if err := os.WriteFile(codePath, []byte("class SettaState:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write generated python code fixture: %v", err)
	}
}

func prepareAppFirstPartyBasedpyrightPlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")
}

func prepareAppPluginLanguageServerFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PLUGIN_FIXTURE_PYTHON", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_PLUGIN_FIXTURE_LSP_SCRIPT",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func installAppLanguageServerOnlyFixturePlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})
}

func installAppWatchCodeProviderFixture(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppWatchCodeProviderFixtureWithRouteSuffixes(t, cfg, watchcodecontracts.BackendRouteSuffixes())
}

func installAppWatchCodeProviderFixtureWithRouteSuffixes(t *testing.T, cfg config.Config, suffixes []string) string {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	pluginRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend")
	writeAppFixtureWatchCodeBackendRoutes(t, pluginRoot, suffixes)
	writeAppFixtureWatchCodeBackendUISettings(t, pluginRoot)
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		enableAppPluginManifestWatchCodeProvider(payload)
	})
	return pluginRoot
}

func enableAppPluginManifestWatchCodeProvider(payload map[string]any) {
	ensureAppPluginManifestCapability(payload, "registerWatchCodeBackend")
	ensureAppPluginManifestCapability(payload, "registerRouter")
	featureCapabilities, ok := payload["featureCapabilities"].(map[string]any)
	if !ok {
		featureCapabilities = map[string]any{}
		payload["featureCapabilities"] = featureCapabilities
	}
	featureCapabilities["watchCode"] = map[string]any{}
}

func writeAppFixtureWatchCodeBackendRoutes(
	t *testing.T,
	pluginRoot string,
	suffixes []string,
) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	routeEntries := make([]string, 0, len(suffixes))
	for _, suffix := range suffixes {
		routeEntries = append(routeEntries, fmt.Sprintf(
			"{\"path\": %q, \"methods\": []string{\"POST\"}}",
			watchcodecontracts.BackendRoutePath(testAppWatchCodeProviderPluginID, suffix),
		))
	}
	const marker = `"routes": []map[string]any{`
	if len(routeEntries) == 0 {
		if !strings.Contains(string(content), marker) {
			t.Fatalf("failed to find backend routes marker in %s", backendPath)
		}
		return
	}
	replacement := marker
	replacement += "\n\t\t\t\t" + strings.Join(routeEntries, ",\n\t\t\t\t") + ","
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend routes into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func writeAppFixtureWatchCodeBackendUISettings(t *testing.T, pluginRoot string) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	const marker = `"staticDirs": []map[string]any{`
	uiSettings := fmt.Sprintf(`"uiSettings": []map[string]any{
				{
					"id":             %q,
					"title":          "Watch Code Folders",
					"description":    "List of folders watched by Watch Code.",
					"synonyms":       []string{"watch folders", "watch code folders"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
				{
					"id":             %q,
					"title":          "Watch Code Files",
					"description":    "List of explicit files watched by Watch Code.",
					"synonyms":       []string{"watch files", "watch code files"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
			},
			`,
		watchcodecontracts.BackendLocalSettingIDFolders,
		watchcodecontracts.BackendReadHandlerIDFolders,
		watchcodecontracts.BackendWriteHandlerIDFolders,
		watchcodecontracts.BackendLocalSettingIDFiles,
		watchcodecontracts.BackendReadHandlerIDFiles,
		watchcodecontracts.BackendWriteHandlerIDFiles,
	)
	replacement := uiSettings + marker
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend UI settings into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func ensureAppPluginManifestCapability(payload map[string]any, capability string) {
	capabilities := map[string]struct{}{}
	switch values := payload["capabilities"].(type) {
	case []any:
		for _, value := range values {
			capability, ok := value.(string)
			if !ok {
				continue
			}
			capabilities[capability] = struct{}{}
		}
	case []string:
		for _, capability := range values {
			capabilities[capability] = struct{}{}
		}
	}
	capabilities[capability] = struct{}{}

	next := make([]string, 0, len(capabilities))
	for capability := range capabilities {
		next = append(next, capability)
	}
	slices.Sort(next)
	payload["capabilities"] = next
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
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "READY")
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
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	readHistory := func() string {
		history, err := service.History(sessionID)
		if err == nil && history != "" {
			return history
		}
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				history := readHistory()
				if strings.Contains(history, needle) {
					return history
				}
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, history)
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			history := readHistory()
			if strings.Contains(history, needle) {
				return history
			}
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, history)
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

func installAppPluginFixture(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func installAppRepoPlugin(t *testing.T, cfg config.Config, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", pluginID)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
	materializeAppRuntimeManagedPluginFrontendAssets(t, targetRoot)
}

func materializeAppRuntimeManagedPluginFrontendAssets(t *testing.T, pluginRoot string) {
	t.Helper()

	if err := plugins.EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot); err != nil {
		t.Fatalf("materialize runtime-managed plugin frontend assets for %s: %v", pluginRoot, err)
	}
}

func selectAppLanguageServer(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	setAppLanguageServerSelectionWithoutRefresh(t, app, language, pluginID)
	if _, err := app.pluginRuntime.Refresh(context.Background()); err != nil {
		t.Fatalf("refresh plugin runtime after selection change: %v", err)
	}
}

func setAppLanguageServerSelectionWithoutRefresh(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	selections := map[string]string{}
	if current, err := settingsstate.LanguageServerSelectedByLanguage(app.SettingsState().Snapshot().Document); err == nil {
		for currentLanguage, currentPluginID := range current {
			if currentPluginID == nil {
				continue
			}
			selections[currentLanguage] = *currentPluginID
		}
	}
	selections[language] = pluginID
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, selections)
}

func replaceAppLanguageServerSelectionsWithoutRefresh(t *testing.T, app *App, selections map[string]string) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		languageServerSettings := document["languageServer"].(map[string]any)
		selectedByLanguage := make(map[string]any, len(selections))
		for language, pluginID := range selections {
			selectedByLanguage[language] = pluginID
		}
		languageServerSettings["selectedByLanguage"] = selectedByLanguage
		return document, nil
	}); err != nil {
		t.Fatalf("save language server selection: %v", err)
	}
}

func rewriteAppPluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)

	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest %s: %v", manifestPath, err)
	}
	encoded = append(encoded, '\n')
	if err := os.WriteFile(manifestPath, encoded, 0o644); err != nil {
		t.Fatalf("write plugin manifest %s: %v", manifestPath, err)
	}
}

func linkAppBackendCodegenFixture(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(body))
	}
}

type appCompletionItem struct {
	Label string `json:"label"`
}

func requestAppCodeAreaCompletion(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) []appCompletionItem {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": projectID,
		"sectionId":       sectionID,
		"fullText":        fullText,
		"position":        position,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteCodeAreaCompletion, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new code area completion request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post code area completion: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected code area completion 200, got %d with body %q", response.StatusCode, string(payload))
	}

	var payload []appCompletionItem
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode code area completion payload: %v", err)
	}
	return payload
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
		if entry.Name() == "node_modules" {
			continue
		}
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
