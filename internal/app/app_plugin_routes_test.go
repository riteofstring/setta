package app

import (
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
)

func appPluginRouteTestConfig(t *testing.T) config.Config {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	markAppDefaultsProfileBootstrapApplied(t, cfg)
	isolateAppPackageManagerPlugins(t)
	return cfg
}

func TestAppServesPluginRuntimeAndFrontendAssets(t *testing.T) {
	// The real app should serve plugin runtime hydration plus declared frontend assets from Go.
	cfg := appPluginRouteTestConfig(t)
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
	cfg := appPluginRouteTestConfig(t)
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

	fixture := newAppRouteTestFixture(t, cfg)

	requireAppRouteStatusAndClose(t, getAppRoutePublic(t, fixture.serverURL, "/health", "get unauthorized backend route"), http.StatusUnauthorized, "unauthorized backend route")

	staticBody := readAppRouteBodyString(t, getAppRoutePublic(t, fixture.serverURL, "/static/fixture.txt", "get backend static dir asset"), http.StatusOK, "backend static asset")
	if strings.TrimSpace(string(staticBody)) != "backend static fixture" {
		t.Fatalf("unexpected backend static asset body %q", string(staticBody))
	}

	healthPayload := requireAppRouteJSON[map[string]any](t, fixture.getRaw(t, "/health", "get authorized backend route"), http.StatusOK, "backend health")
	if healthPayload["hasAuth"] != true {
		t.Fatalf("expected auth context in backend health payload, got %#v", healthPayload)
	}

	createResponse := fixture.postRaw(t, "/items?view=app", `{"name":"app-item"}`, "post backend route")
	requireAppRouteHeader(t, createResponse, "X-Plugin", "backend-fixture", "backend create")
	createPayload := requireAppRouteJSON[map[string]any](t, createResponse, http.StatusCreated, "backend create")
	if createPayload["rawQuery"] != "view=app" || createPayload["contentType"] != "application/json" {
		t.Fatalf("unexpected backend create payload %#v", createPayload)
	}
}

func TestAppLinksPluginRoutesAndServesRuntime(t *testing.T) {
	// The real app should expose local plugin linking through the shared Go plugin service.
	cfg := appPluginRouteTestConfig(t)

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

	fixture := newAppRouteTestFixture(t, cfg)

	type pluginLinkPayload struct {
		PluginID         string `json:"pluginId"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
		TrustStatus      string `json:"trustStatus"`
		TrustWarning     string `json:"trustWarning"`
		State            string `json:"state"`
	}
	linkPayload := requireAppRouteJSON[pluginLinkPayload](
		t,
		fixture.postAPI(t, httpapi.RoutePluginsLink, string(mustAppJSON(t, map[string]any{
			"localPluginRoot": localPluginRoot,
			"scope":           "workspace",
			"enable":          true,
			"force":           false,
		})), "post plugin link"),
		http.StatusOK,
		"plugin link",
	)
	if linkPayload.PluginID != "setta-fixture-frontend" || linkPayload.State != "active" {
		t.Fatalf("unexpected plugin link payload %#v", linkPayload)
	}
	if linkPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", linkPayload.SourceScopeLabel)
	}
	if linkPayload.TrustStatus != "unverified" || linkPayload.TrustWarning != "Source is unverified. Install only from trusted owners." {
		t.Fatalf("unexpected plugin link trust payload %#v", linkPayload)
	}

	type pluginRuntimeStatusPayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	runtimePayload := requireAppRouteJSON[pluginRuntimeStatusPayload](t, fixture.getAPI(t, httpapi.RoutePluginsRuntime, "get plugin runtime after link"), http.StatusOK, "plugin runtime after link")
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one linked plugin in runtime payload, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected plugin runtime payload after link %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppWritesPluginConfigAndUpdatesRuntime(t *testing.T) {
	// The real app should accept plugin config writes and reflect them in subsequent runtime reads.
	cfg := appPluginRouteTestConfig(t)
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
	cfg := appPluginRouteTestConfig(t)
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

	fixture := newAppRouteTestFixture(t, cfg)

	type pluginRescanPayload struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	initialRescan := requireAppRouteJSON[pluginRescanPayload](t, fixture.postAPI(t, httpapi.RoutePluginsRescan, "", "plugin rescan"), http.StatusOK, "plugin rescan")
	if initialRescan.InstalledPlugins != 1 || initialRescan.ActivePlugins != 1 {
		t.Fatalf("unexpected initial rescan payload %#v", initialRescan)
	}

	type pluginLifecycleStatePayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	disabledPayload := requireAppRouteJSON[pluginLifecycleStatePayload](t, fixture.postAPI(t, httpapi.RoutePluginsDisable, `{"pluginId":"setta-fixture-frontend"}`, "plugin disable"), http.StatusOK, "plugin disable")
	if disabledPayload.State != "disabled" || disabledPayload.RestartRequired {
		t.Fatalf("unexpected disable payload %#v", disabledPayload)
	}

	rescanAfterDisable := requireAppRouteJSON[pluginRescanPayload](t, fixture.postAPI(t, httpapi.RoutePluginsRescan, "", "plugin rescan after disable"), http.StatusOK, "plugin rescan after disable")
	if rescanAfterDisable.InstalledPlugins != 1 || rescanAfterDisable.ActivePlugins != 0 {
		t.Fatalf("unexpected post-disable rescan payload %#v", rescanAfterDisable)
	}

	enabledPayload := requireAppRouteJSON[pluginLifecycleStatePayload](t, fixture.postAPI(t, httpapi.RoutePluginsEnable, `{"pluginId":"setta-fixture-frontend"}`, "plugin enable"), http.StatusOK, "plugin enable")
	if enabledPayload.State != "active" || enabledPayload.RestartRequired {
		t.Fatalf("unexpected enable payload %#v", enabledPayload)
	}
}

func TestAppInstallsAndUninstallsPluginRoutes(t *testing.T) {
	// The real app should wire install and uninstall plugin routes through the production candidate-provider boundary.
	sourceSpec := configureAppLocalPyPIFixture(t, "frontend", "setta-fixture-frontend", "0.1.0")

	cfg := appPluginRouteTestConfig(t)

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

	cfg := appPluginRouteTestConfig(t)

	fixture := newAppRouteTestFixture(t, cfg)

	requireAppRouteStatusAndClose(t, fixture.postAPI(t, httpapi.RoutePluginsInstall, `{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`, "plugin install"), http.StatusOK, "plugin install")

	type pluginUpdatePayload struct {
		PluginID        string `json:"pluginId"`
		FromVersion     string `json:"fromVersion"`
		ToVersion       string `json:"toVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	updatePayload := requireAppRouteJSON[pluginUpdatePayload](t, fixture.postAPI(t, httpapi.RoutePluginsUpdate, `{"pluginId":"setta-fixture-frontend","scope":"workspace","to":"0.2.0"}`, "plugin update"), http.StatusOK, "plugin update")
	if updatePayload.PluginID != "setta-fixture-frontend" || updatePayload.FromVersion != "0.1.0" || updatePayload.ToVersion != "0.2.0" || updatePayload.RestartRequired {
		t.Fatalf("unexpected update payload %#v", updatePayload)
	}

	type pluginRollbackPayload struct {
		PluginID        string `json:"pluginId"`
		RestoredVersion string `json:"restoredVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	rollbackPayload := requireAppRouteJSON[pluginRollbackPayload](t, fixture.postAPI(t, httpapi.RoutePluginsRollback, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`, "plugin rollback"), http.StatusOK, "plugin rollback")
	if rollbackPayload.PluginID != "setta-fixture-frontend" || rollbackPayload.RestoredVersion != "0.1.0" || rollbackPayload.RestartRequired {
		t.Fatalf("unexpected rollback payload %#v", rollbackPayload)
	}

	type pluginRollbackRuntimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string  `json:"pluginId"`
				Version  string  `json:"version"`
				Shadowed *string `json:"shadowedBySourcePath"`
			} `json:"plugins"`
		} `json:"status"`
	}
	runtimePayload := requireAppRouteJSON[pluginRollbackRuntimePayload](t, fixture.getAPI(t, httpapi.RoutePluginsRuntime, "get plugin runtime after rollback"), http.StatusOK, "plugin runtime after rollback")
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

	cfg := appPluginRouteTestConfig(t)

	fixture := newAppRouteTestFixture(t, cfg)

	requireAppRouteStatusAndClose(t, fixture.postAPI(t, httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`, "plugin install"), http.StatusOK, "plugin install")

	type pluginLockWritePayload struct {
		LockfilePath string `json:"lockfilePath"`
		PluginCount  int    `json:"pluginCount"`
	}
	lockWritePayload := requireAppRouteJSON[pluginLockWritePayload](t, fixture.postAPI(t, httpapi.RoutePluginsLockWrite, "", "lock write"), http.StatusOK, "lock write")
	if lockWritePayload.PluginCount != 1 || lockWritePayload.LockfilePath == "" {
		t.Fatalf("unexpected lock write payload %#v", lockWritePayload)
	}

	requireAppRouteStatusAndClose(t, fixture.postAPI(t, httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`, "plugin uninstall"), http.StatusOK, "plugin uninstall")

	type pluginLockApplyCheckPayload struct {
		PlannedChanges []string `json:"plannedChanges"`
		Applied        bool     `json:"applied"`
	}
	lockApplyCheckPayload := requireAppRouteJSON[pluginLockApplyCheckPayload](t, fixture.postAPI(t, httpapi.RoutePluginsLockApply, `{"check":true}`, "lock apply check"), http.StatusOK, "lock apply check")
	if lockApplyCheckPayload.Applied {
		t.Fatalf("expected check-only lock apply payload, got %#v", lockApplyCheckPayload)
	}
	if len(lockApplyCheckPayload.PlannedChanges) != 1 || !strings.Contains(lockApplyCheckPayload.PlannedChanges[0], "install setta-fixture-frontend in workspace") {
		t.Fatalf("unexpected lock apply check payload %#v", lockApplyCheckPayload)
	}

	type pluginLockApplyPayload struct {
		Applied bool `json:"applied"`
	}
	lockApplyPayload := requireAppRouteJSON[pluginLockApplyPayload](t, fixture.postAPI(t, httpapi.RoutePluginsLockApply, `{"check":false}`, "lock apply"), http.StatusOK, "lock apply")
	if !lockApplyPayload.Applied {
		t.Fatalf("expected applied lock payload, got %#v", lockApplyPayload)
	}

	type pluginLockRuntimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	runtimePayload := requireAppRouteJSON[pluginLockRuntimePayload](t, fixture.getAPI(t, httpapi.RoutePluginsRuntime, "get plugin runtime after lock apply"), http.StatusOK, "plugin runtime after lock apply")
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin after lock apply, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected runtime payload after lock apply %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppServesProgrammaticPluginRestartRouteInIDE(t *testing.T) {
	// The real IDE app should wire plugin restart into the live backend-runtime refresh path.
	cfg := appPluginRouteTestConfig(t)

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
	cfg := appPluginRouteTestConfig(t)

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
	cfg := appPluginRouteTestConfig(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")
	if err := os.WriteFile(
		filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"),
		[]byte(`{"pendingRestartBackendPluginIds":["setta-fixture-backend"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
	}

	fixture := newAppRouteTestFixture(t, cfg)
	readPluginState := func() string {
		t.Helper()

		type pluginRuntimeStatePayload struct {
			Status struct {
				Plugins []struct {
					PluginID string `json:"pluginId"`
					State    string `json:"state"`
				} `json:"plugins"`
			} `json:"status"`
		}
		payload := requireAppRouteJSON[pluginRuntimeStatePayload](t, fixture.getAPI(t, httpapi.RoutePluginsRuntime, "plugin runtime"), http.StatusOK, "plugin runtime")
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
	requireAppRouteStatusAndClose(t, fixture.postAPI(t, httpapi.RoutePluginsRescan, "", "plugin rescan"), http.StatusOK, "plugin rescan")
	if state := readPluginState(); state != "pending_restart" {
		t.Fatalf("expected backend plugin to be pending_restart before restart, got %q", state)
	}

	type pluginRestartPayload struct {
		Accepted bool   `json:"accepted"`
		Mode     string `json:"mode"`
	}
	restartPayload := requireAppRouteJSON[pluginRestartPayload](t, fixture.postAPI(t, httpapi.RoutePluginsRestart, "", "plugin restart"), http.StatusOK, "plugin restart")
	if !restartPayload.Accepted || restartPayload.Mode != "programmatic" {
		t.Fatalf("expected accepted programmatic restart payload, got %#v", restartPayload)
	}

	if state := readPluginState(); state != "active" {
		t.Fatalf("expected backend plugin to be active after restart, got %q", state)
	}
}
