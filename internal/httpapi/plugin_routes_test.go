package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"
)

func TestRegisterPluginRoutesReturnsRuntimePayload(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	writePluginRouteStateFile(t, roots.settaFilesRoot, map[string]any{
		"pluginConfigById": map[string]any{
			"workspace:setta-fixture-full": map[string]any{
				"enabled": true,
				"label":   "route-fixture",
			},
		},
	})

	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.RuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin runtime response: %v", err)
	}
	if len(payload.List.Plugins) != 1 {
		t.Fatalf("expected one active list plugin, got %#v", payload.List.Plugins)
	}
	if len(payload.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", payload.Status.Plugins)
	}
	if payload.List.Plugins[0].PluginID != "setta-fixture-full" {
		t.Fatalf("expected full fixture plugin id, got %#v", payload.List.Plugins[0].PluginID)
	}
	if payload.List.Plugins[0].Frontend.EntrypointURL == nil || !strings.Contains(*payload.List.Plugins[0].Frontend.EntrypointURL, "/plugins/setta-fixture-full/frontend/src/index.js?v=") {
		t.Fatalf("expected versioned entrypoint url, got %#v", payload.List.Plugins[0].Frontend.EntrypointURL)
	}
	if got := payload.List.Plugins[0].Config.CurrentConfig["label"]; got != "route-fixture" {
		t.Fatalf("expected current config label route-fixture, got %#v", got)
	}
}

func TestRegisterPluginRoutesRedactsRuntimePayloadOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	writePluginRouteStateFile(t, roots.settaFilesRoot, map[string]any{
		"pluginConfigById": map[string]any{
			"workspace:setta-fixture-full": map[string]any{
				"secret": "value",
			},
		},
	})

	handler := newPluginRouteTestHandler(t, config.ModeShare, service)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.RuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode redacted plugin runtime response: %v", err)
	}
	entry := payload.List.Plugins[0]
	if !strings.Contains(entry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted canonical source key, got %q", entry.CanonicalSourceKey)
	}
	if len(entry.Config.CurrentConfig) != 0 {
		t.Fatalf("expected redacted config payload, got %#v", entry.Config.CurrentConfig)
	}
	if entry.Config.SchemaJSON != nil {
		t.Fatalf("expected redacted schema payload, got %#v", entry.Config.SchemaJSON)
	}
	if !strings.Contains(payload.Status.Plugins[0].SourcePath, "[redacted]:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted status source path, got %q", payload.Status.Plugins[0].SourcePath)
	}
}

func TestRegisterPluginRootRoutesServesFrontendAssetsAndImmutableCache(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-frontend/frontend/src/index.js", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected asset 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.Contains(response.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("expected unversioned asset to skip immutable cache headers, got %q", response.Header().Get("Cache-Control"))
	}
	if !strings.Contains(response.Body.String(), "export const apiVersion = 1;") {
		t.Fatalf("expected frontend asset body, got %q", response.Body.String())
	}

	versionedResponse := httptest.NewRecorder()
	versionedRequest := httptest.NewRequest(
		http.MethodGet,
		"/plugins/setta-fixture-frontend/frontend/src/index.js?v=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		nil,
	)
	handler.ServeHTTP(versionedResponse, versionedRequest)
	if versionedResponse.Code != http.StatusOK {
		t.Fatalf("expected versioned asset 200, got %d with body %q", versionedResponse.Code, versionedResponse.Body.String())
	}
	if got := versionedResponse.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("expected immutable cache header, got %q", got)
	}
}

func TestRegisterPluginRootRoutesRejectsTraversalAndUnknownPlugins(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	traversalResponse := httptest.NewRecorder()
	traversalRequest := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-frontend/%2E%2E/setta.plugin.json", nil)
	handler.ServeHTTP(traversalResponse, traversalRequest)
	if traversalResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected traversal 400, got %d with body %q", traversalResponse.Code, traversalResponse.Body.String())
	}
	var traversalPayload errorResponse
	if err := json.Unmarshal(traversalResponse.Body.Bytes(), &traversalPayload); err != nil {
		t.Fatalf("decode traversal error payload: %v", err)
	}
	if traversalPayload.Error.Code != string(plugins.ServiceErrorCodeAssetInvalidPath) {
		t.Fatalf("expected asset invalid path code, got %q", traversalPayload.Error.Code)
	}

	notFoundResponse := httptest.NewRecorder()
	notFoundRequest := httptest.NewRequest(http.MethodGet, "/plugins/missing-plugin/frontend/src/index.js", nil)
	handler.ServeHTTP(notFoundResponse, notFoundRequest)
	if notFoundResponse.Code != http.StatusNotFound {
		t.Fatalf("expected unknown plugin 404, got %d with body %q", notFoundResponse.Code, notFoundResponse.Body.String())
	}
	var notFoundPayload errorResponse
	if err := json.Unmarshal(notFoundResponse.Body.Bytes(), &notFoundPayload); err != nil {
		t.Fatalf("decode unknown plugin error payload: %v", err)
	}
	if notFoundPayload.Error.Code != string(plugins.ServiceErrorCodeNotFound) {
		t.Fatalf("expected plugin not found code, got %q", notFoundPayload.Error.Code)
	}
}

type pluginRouteTestRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

func newPluginRouteTestService(t *testing.T, mode config.Mode) (*plugins.Service, pluginRouteTestRoots) {
	t.Helper()

	baseRoot := t.TempDir()
	roots := pluginRouteTestRoots{
		workspaceRoot:  filepath.Join(baseRoot, "workspace"),
		settaFilesRoot: filepath.Join(baseRoot, "setta_files"),
		settaHome:      filepath.Join(baseRoot, "setta_home"),
	}
	for _, root := range []string{roots.workspaceRoot, roots.settaFilesRoot, roots.settaHome} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", root, err)
		}
	}

	service, err := plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
		ServerMode:     mode,
	})
	if err != nil {
		t.Fatalf("new plugin route service: %v", err)
	}
	return service, roots
}

func newPluginRouteTestHandler(t *testing.T, mode config.Mode, service *plugins.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterPluginRootRoutes(r, PluginRootRouteDependencies{
				Service: service,
			}); err != nil {
				t.Fatalf("register plugin root routes: %v", err)
			}
		},
		Register: func(r chi.Router) {
			if err := RegisterPluginRoutes(r, PluginRouteDependencies{
				Service: service,
			}); err != nil {
				t.Fatalf("register plugin routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new plugin route handler: %v", err)
	}
	return handler
}

func copyPluginRouteFixtureToWorkspace(t *testing.T, workspaceRoot string, fixtureName string) {
	t.Helper()

	sourceRoot := filepath.Join(routePluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", fixtureName)
	manifestPayload, err := os.ReadFile(filepath.Join(sourceRoot, "setta.plugin.json"))
	if err != nil {
		t.Fatalf("read plugin fixture manifest: %v", err)
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin fixture manifest: %v", err)
	}

	targetRoot := filepath.Join(workspaceRoot, ".setta_plugins", manifest.ID)
	if err := copyRoutePluginFixtureDir(sourceRoot, targetRoot); err != nil {
		t.Fatalf("copy plugin fixture: %v", err)
	}
	if fixtureName == "frontend" || fixtureName == "full" {
		if err := rewriteRoutePluginManifest(targetRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		}); err != nil {
			t.Fatalf("rewrite plugin fixture manifest: %v", err)
		}
	}
}

func writePluginRouteStateFile(t *testing.T, settaFilesRoot string, payload map[string]any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal plugin state payload: %v", err)
	}
	encoded = append(encoded, '\n')
	path := filepath.Join(settaFilesRoot, "plugins_state.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir plugin state parent: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write plugin state payload: %v", err)
	}
}
