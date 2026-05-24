package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	appsubsystemprovider "setta/internal/testutil/appsubsystemprovider"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/testutil/packagedsetta"
)

func TestAppSubsystemPluginDisabledHidesBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteShareDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, false)
}

func TestAppSubsystemPluginEnabledRestoresBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, firstpartyplugin.AppSubsystemPluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, true)
}

func TestAppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemToolPresence(t, app, false)

	enableRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RoutePluginsEnable,
		strings.NewReader(`{"pluginId":"setta-json-render-app-gen"}`),
	)
	if err != nil {
		t.Fatalf("new enable request: %v", err)
	}
	enableRequest.Header.Set("Content-Type", "application/json")
	enableRequest.AddCookie(authCookie)
	enableResponse, err := http.DefaultClient.Do(enableRequest)
	if err != nil {
		t.Fatalf("enable plugin: %v", err)
	}
	defer enableResponse.Body.Close()
	if enableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(enableResponse.Body)
		t.Fatalf("expected enable 200, got %d with body %q", enableResponse.StatusCode, string(body))
	}

	var enablePayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(enableResponse.Body).Decode(&enablePayload); err != nil {
		t.Fatalf("decode enable payload: %v", err)
	}
	if enablePayload.State != string(plugins.PluginRuntimeStateActive) || enablePayload.RestartRequired {
		t.Fatalf("unexpected enable payload %#v", enablePayload)
	}

	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, true)
}

func TestAppSubsystemPackageManagerPluginDisabledHidesBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installAppPackageManagerPlugin(t, sitePackages, firstpartyplugin.AppSubsystemPluginID)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusNotFound,
	)
	assertAppSubsystemToolPresence(t, app, false)
}

func TestAppSubsystemPackageManagerPluginEnabledRestoresBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installAppPackageManagerPlugin(t, sitePackages, firstpartyplugin.AppSubsystemPluginID)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))
	writeEnabledAppPluginState(t, cfg, firstpartyplugin.AppSubsystemPluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, true)
}

func TestAppSubsystemUnknownIDPackageManagerPluginEnabledRestoresBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installAppPackageManagerFixturePlugin(t, sitePackages, "app-subsystem-unknown-id")
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, true)
}

func TestAppSubsystemUnknownIDPluginEnabledRestoresBackendRoutesAndTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	installAppFixturePlugin(t, cfg, "app-subsystem-unknown-id")
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

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

	authCookie := appSubsystemPluginTestAuthCookie(t, app)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteGetAppCatalog,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemRouteStatus(
		t,
		server.URL+"/api"+httpapi.RouteAppDeployments,
		authCookie,
		http.StatusOK,
	)
	assertAppSubsystemToolPresence(t, app, true)
}

func appSubsystemPluginTestAuthCookie(t *testing.T, app *App) *http.Cookie {
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

func assertAppSubsystemRouteStatus(
	t *testing.T,
	url string,
	authCookie *http.Cookie,
	expectedStatus int,
) {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("new request %s: %v", url, err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("do request %s: %v", url, err)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s status %d, got %d with body %q", url, expectedStatus, response.StatusCode, string(body))
	}
}

func assertAppSubsystemToolPresence(t *testing.T, app *App, expectedPresent bool) {
	t.Helper()

	tools := app.mcpServer.Registry().List()
	names := make([]string, 0, len(tools))
	for _, tool := range tools {
		names = append(names, tool.Name)
	}
	slices.Sort(names)

	for _, toolName := range []string{
		"get_app_catalog",
		"list_app_components",
		"get_app_definition",
		"validate_app_definition",
		"set_app_definition",
		"stream_app_definition",
		"update_app_definition",
	} {
		present := slices.Contains(names, toolName)
		if present != expectedPresent {
			t.Fatalf("expected app tool %s present=%v, got present=%v with tools=%#v", toolName, expectedPresent, present, names)
		}
	}
}

func writeEnabledAppPluginState(t *testing.T, cfg config.Config, pluginIDs ...string) {
	t.Helper()

	payload, err := json.Marshal(map[string]any{
		"enabledPluginIds": pluginIDs,
	})
	if err != nil {
		t.Fatalf("marshal enabled plugin state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"), payload, 0o644); err != nil {
		t.Fatalf("write enabled plugin state: %v", err)
	}
}

func enableAppSubsystemPluginForTest(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppRepoPlugin(t, cfg, firstpartyplugin.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, firstpartyplugin.AppSubsystemPluginID)
}

func installAppFixturePlugin(t *testing.T, cfg config.Config, fixtureName string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", appsubsystemprovider.PluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
	materializeAppRuntimeManagedPluginFrontendAssets(t, targetRoot)
}

func installAppPackageManagerPlugin(t *testing.T, sitePackages string, pluginID string) {
	t.Helper()

	installAppPackageManagerPluginAsID(t, sitePackages, pluginID, pluginID)
}

func installAppPackageManagerPluginAsID(
	t *testing.T,
	sitePackages string,
	sourcePluginID string,
	targetPluginID string,
) {
	t.Helper()

	packagedsetta.InstallRuntimeSitePackages(t, appTestRepoRoot(t), sitePackages)

	repoRoot := appTestRepoRoot(t)
	pluginRoot := filepath.Join(sitePackages, targetPluginID)
	copyAppTestDir(t, filepath.Join(repoRoot, "plugins", sourcePluginID), pluginRoot)
	if err := os.RemoveAll(filepath.Join(pluginRoot, "build")); err != nil {
		t.Fatalf("remove copied plugin build dir: %v", err)
	}
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["id"] = targetPluginID
	})
	materializeAppRuntimeManagedPluginFrontendAssets(t, pluginRoot)
	if err := os.RemoveAll(filepath.Join(pluginRoot, "frontend", "node_modules")); err != nil {
		t.Fatalf("remove built plugin frontend node_modules: %v", err)
	}

	distInfoName := strings.ReplaceAll(targetPluginID, "-", "_") + "-0.1.0.dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writeAppPackageManagerFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + targetPluginID,
		"Version: 0.1.0",
		"Summary: Setta app subsystem plugin",
		"",
	}, "\n"))

	recordLines := make([]string, 0)
	for _, root := range []string{pluginRoot, distInfoRoot} {
		err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() || filepath.Base(path) == "RECORD" {
				return nil
			}
			relativePath, err := filepath.Rel(sitePackages, path)
			if err != nil {
				return err
			}
			recordLines = append(recordLines, filepath.ToSlash(relativePath)+",,")
			return nil
		})
		if err != nil {
			t.Fatalf("walk package-manager plugin fixture: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join(distInfoName, "RECORD"))+",,")
	writeAppPackageManagerFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join(append(recordLines, ""), "\n"))
}

func installAppPackageManagerFixturePlugin(t *testing.T, sitePackages string, fixtureName string) {
	t.Helper()

	packagedsetta.InstallRuntimeSitePackages(t, appTestRepoRoot(t), sitePackages)

	repoRoot := appTestRepoRoot(t)
	pluginRoot := filepath.Join(sitePackages, appsubsystemprovider.PluginID)
	copyAppTestDir(t, filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName), pluginRoot)
	materializeAppPackageManagerFixtureFrontendAssets(t, pluginRoot)

	distInfoName := strings.ReplaceAll(appsubsystemprovider.PluginID, "-", "_") + "-0.1.0.dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writeAppPackageManagerFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + appsubsystemprovider.PluginID,
		"Version: 0.1.0",
		"Summary: Unknown-id app subsystem fixture",
		"",
	}, "\n"))

	recordLines := make([]string, 0)
	for _, root := range []string{pluginRoot, distInfoRoot} {
		err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() || filepath.Base(path) == "RECORD" {
				return nil
			}
			relativePath, err := filepath.Rel(sitePackages, path)
			if err != nil {
				return err
			}
			recordLines = append(recordLines, filepath.ToSlash(relativePath)+",,")
			return nil
		})
		if err != nil {
			t.Fatalf("walk package-manager fixture plugin: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join(distInfoName, "RECORD"))+",,")
	writeAppPackageManagerFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join(append(recordLines, ""), "\n"))
}

func materializeAppPackageManagerFixtureFrontendAssets(t *testing.T, pluginRoot string) {
	t.Helper()

	materializeAppRuntimeManagedPluginFrontendAssets(t, pluginRoot)
	for _, relativePath := range []string{
		"build_backend.py",
		filepath.Join("frontend", "node_modules"),
		filepath.Join("frontend", "package.json"),
		filepath.Join("frontend", "scripts"),
		filepath.Join("frontend", "src"),
		filepath.Join("frontend", "pnpm-lock.yaml"),
		"pyproject.toml",
	} {
		if err := os.RemoveAll(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("remove package-manager app fixture build input %s: %v", relativePath, err)
		}
	}
}

func appendAppPythonPath(path string) string {
	existing := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existing == "" {
		return path
	}
	return path + string(os.PathListSeparator) + existing
}

func writeAppPackageManagerFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
