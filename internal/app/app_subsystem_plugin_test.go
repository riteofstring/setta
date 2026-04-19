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
	"setta/internal/testutil/firstpartyplugin"
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

	installAppRepoPlugin(t, cfg, plugins.AppSubsystemPluginID)

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

	installAppRepoPlugin(t, cfg, plugins.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, plugins.AppSubsystemPluginID)

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
	installAppPackageManagerPlugin(t, sitePackages, plugins.AppSubsystemPluginID)
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
	installAppPackageManagerPlugin(t, sitePackages, plugins.AppSubsystemPluginID)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))
	writeEnabledAppPluginState(t, cfg, plugins.AppSubsystemPluginID)

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

	installAppRepoPlugin(t, cfg, plugins.AppSubsystemPluginID)
	writeEnabledAppPluginState(t, cfg, plugins.AppSubsystemPluginID)
}

func installAppPackageManagerPlugin(t *testing.T, sitePackages string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	pluginRoot := filepath.Join(sitePackages, pluginID)
	copyAppTestDir(t, filepath.Join(repoRoot, "plugins", pluginID), pluginRoot)
	if err := os.RemoveAll(filepath.Join(pluginRoot, "build")); err != nil {
		t.Fatalf("remove copied plugin build dir: %v", err)
	}

	distInfoName := strings.ReplaceAll(pluginID, "-", "_") + "-0.1.0.dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writeAppPackageManagerFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + pluginID,
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
