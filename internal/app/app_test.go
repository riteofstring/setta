package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	appsubsystemprovider "setta/internal/testutil/appsubsystemprovider"
	"setta/internal/testutil/firstpartyplugin"
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
