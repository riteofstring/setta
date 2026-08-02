package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"

	"github.com/go-chi/chi/v5"
)

func TestRegisterPluginRoutesMapsProgrammaticRestartFailureTo503(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeIDE, func(context.Context) (bool, error) {
		return false, os.ErrPermission
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected restart failure 503, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode restart failure response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeRestartFailed) {
		t.Fatalf("expected restart failed error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesMapsMissingLockfileTo404(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLockApply, strings.NewReader(`{"check":false}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing lockfile 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing lockfile response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeLockfileNotFound) {
		t.Fatalf("expected lockfile not found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesBlocksConfigWriteOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsConfig, strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":true}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected share-mode config write 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
	}
}

func TestRegisterPluginRoutesBlocksLifecycleSlicesOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	testCases := []struct {
		name string
		path string
		body string
	}{
		{name: "rescan", path: RoutePluginsRescan},
		{name: "install", path: RoutePluginsInstall, body: `{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip"}`},
		{name: "link", path: RoutePluginsLink, body: `{"localPluginRoot":"/tmp/plugin","scope":"workspace","enable":true,"force":false}`},
		{name: "uninstall", path: RoutePluginsUninstall, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`},
		{name: "update", path: RoutePluginsUpdate, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace","to":null}`},
		{name: "rollback", path: RoutePluginsRollback, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`},
		{name: "enable", path: RoutePluginsEnable, body: `{"pluginId":"setta-fixture-frontend"}`},
		{name: "disable", path: RoutePluginsDisable, body: `{"pluginId":"setta-fixture-frontend"}`},
		{name: "lock write", path: RoutePluginsLockWrite},
		{name: "lock apply", path: RoutePluginsLockApply, body: `{"check":true}`},
	}
	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader(testCase.body))
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected share-mode %s 403, got %d with body %q", testCase.name, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
				t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
			}
		})
	}
}

func TestRegisterPluginRoutesBlocksRestartOutsideIDE(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeShare)
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected share-mode restart 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
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

	var payload plugins.PluginRuntimeResponse
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

func TestRegisterPluginRoutesRuntimeReportsManualRestartCapabilityOutsideIDEWithCallback(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeShare, func(context.Context) (bool, error) {
		return true, nil
	})
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.PluginRuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share-mode plugin runtime response: %v", err)
	}
	if payload.Status.RestartCapability.Mode != plugins.PluginRestartCapabilityModeManual {
		t.Fatalf("expected manual restart capability, got %#v", payload.Status.RestartCapability)
	}
	if payload.Status.RestartCapability.Command == nil || *payload.Status.RestartCapability.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", payload.Status.RestartCapability.Command)
	}
	if payload.Status.RestartCapability.Reason == nil || *payload.Status.RestartCapability.Reason != "Plugin runtime restart is available only in IDE mode." {
		t.Fatalf("unexpected share-mode restart reason %#v", payload.Status.RestartCapability.Reason)
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

func TestRegisterPluginRootRoutesRejectFrontendPluginNonFrontendAssetPath(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-full/backend/entrypoint.py", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected backend file lookup through plugin asset route to fail with 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode non-frontend asset error payload: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeAssetNotFound) {
		t.Fatalf("expected asset not found code, got %q", payload.Error.Code)
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

	missingAssetResponse := httptest.NewRecorder()
	missingAssetRequest := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-frontend/frontend/dist/missing.js", nil)
	handler.ServeHTTP(missingAssetResponse, missingAssetRequest)
	if missingAssetResponse.Code != http.StatusNotFound {
		t.Fatalf("expected missing asset 404, got %d with body %q", missingAssetResponse.Code, missingAssetResponse.Body.String())
	}
	var missingAssetPayload errorResponse
	if err := json.Unmarshal(missingAssetResponse.Body.Bytes(), &missingAssetPayload); err != nil {
		t.Fatalf("decode missing asset error payload: %v", err)
	}
	if missingAssetPayload.Error.Code != string(plugins.ServiceErrorCodeAssetNotFound) {
		t.Fatalf("expected asset not found code for missing asset, got %q", missingAssetPayload.Error.Code)
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

func TestRegisterPluginRootRoutesServesRegisteredBackendStaticDirs(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerStaticDir"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend static asset 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "backend static fixture" {
		t.Fatalf("unexpected backend static asset body %q", response.Body.String())
	}
}

func TestRegisterPluginRootRoutesDispatchesRegisteredBackendRoutes(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	getResponse := httptest.NewRecorder()
	getRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected backend route 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}

	var getPayload map[string]any
	if err := json.Unmarshal(getResponse.Body.Bytes(), &getPayload); err != nil {
		t.Fatalf("decode backend route payload: %v", err)
	}
	if getPayload["ok"] != true || getPayload["serverMode"] != "ide" {
		t.Fatalf("unexpected backend route payload %#v", getPayload)
	}

	postResponse := httptest.NewRecorder()
	postRequest := httptest.NewRequest(http.MethodPost, "/items?view=route", strings.NewReader(`{"name":"route-fixture"}`))
	postRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(postResponse, postRequest)
	if postResponse.Code != http.StatusCreated {
		t.Fatalf("expected backend route 201, got %d with body %q", postResponse.Code, postResponse.Body.String())
	}

	var postPayload map[string]any
	if err := json.Unmarshal(postResponse.Body.Bytes(), &postPayload); err != nil {
		t.Fatalf("decode backend POST payload: %v", err)
	}
	if postPayload["rawQuery"] != "view=route" || postPayload["contentType"] != "application/json" {
		t.Fatalf("unexpected backend POST payload %#v", postPayload)
	}
}

func TestRegisterPluginRootRoutesDispatchesPluginPrefixedGETBackendRoutesBeforeAssets(t *testing.T) {
	t.Parallel()

	const routePath = "/plugins/acme.plugin/health"
	var dispatchedPath string
	var assetLookups int
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if method == http.MethodGet && requestPath == routePath {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			dispatchedPath = request.Path
			return plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				Body: []byte(`{"ok":true}`),
			}, true, nil
		},
		resolveAssetPathFunc: func(pluginID string, assetPath string) (string, error) {
			assetLookups++
			return "", os.ErrNotExist
		},
	}
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, routePath, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend route 200, got %d with body %q", response.Code, response.Body.String())
	}
	if dispatchedPath != routePath {
		t.Fatalf("expected dispatch path %q, got %q", routePath, dispatchedPath)
	}
	if assetLookups != 0 {
		t.Fatalf("expected backend route to bypass asset lookup, got %d lookups", assetLookups)
	}
}

func TestRegisterPluginRootRoutesFallsBackToPluginAssetsForUnregisteredGETRoutes(t *testing.T) {
	t.Parallel()

	assetRoot := t.TempDir()
	assetPath := filepath.Join(assetRoot, "static.js")
	if err := os.WriteFile(assetPath, []byte("export const ok = true;\n"), 0o644); err != nil {
		t.Fatalf("write plugin asset: %v", err)
	}
	var lookupCalls int
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			lookupCalls++
			return plugins.BackendRouteLookup{}, nil
		},
		resolveAssetPathFunc: func(pluginID string, requestAssetPath string) (string, error) {
			if pluginID != "acme.plugin" || requestAssetPath != "static.js" {
				t.Fatalf("unexpected asset lookup plugin=%q path=%q", pluginID, requestAssetPath)
			}
			return assetPath, nil
		},
	}
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/plugins/acme.plugin/static.js", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin asset 200, got %d with body %q", response.Code, response.Body.String())
	}
	if lookupCalls != 1 {
		t.Fatalf("expected backend lookup before asset fallback, got %d calls", lookupCalls)
	}
	if !strings.Contains(response.Body.String(), "export const ok = true;") {
		t.Fatalf("unexpected asset body %q", response.Body.String())
	}
}

func TestRegisterPluginRootRoutesRequireAuthOnlyForRegisteredBackendRoutes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter", "registerStaticDir"}
	})
	handler := newPluginRouteTestHandlerWithAuth(t, config.ModeIDE, service, authService)

	unauthorizedResponse := httptest.NewRecorder()
	unauthorizedRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(unauthorizedResponse, unauthorizedRequest)
	if unauthorizedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected backend route auth 401, got %d with body %q", unauthorizedResponse.Code, unauthorizedResponse.Body.String())
	}
	if contentType := unauthorizedResponse.Header().Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected backend route auth html response, got %q", contentType)
	}
	if !strings.Contains(unauthorizedResponse.Body.String(), RouteBootstrapPage) {
		t.Fatalf("expected backend route auth html to link to bootstrap page, got %q", unauthorizedResponse.Body.String())
	}

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	cookieName, err := authService.CookieName(currentSession.Metadata.ID)
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}

	authorizedResponse := httptest.NewRecorder()
	authorizedRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	authorizedRequest.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})
	handler.ServeHTTP(authorizedResponse, authorizedRequest)
	if authorizedResponse.Code != http.StatusOK {
		t.Fatalf("expected authorized backend route 200, got %d with body %q", authorizedResponse.Code, authorizedResponse.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(authorizedResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode authorized backend payload: %v", err)
	}
	if payload["sessionId"] != "abc123" || payload["hasAuth"] != true {
		t.Fatalf("expected auth context in backend payload, got %#v", payload)
	}

	staticResponse := httptest.NewRecorder()
	staticRequest := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(staticResponse, staticRequest)
	if staticResponse.Code != http.StatusOK {
		t.Fatalf("expected public backend static asset 200, got %d with body %q", staticResponse.Code, staticResponse.Body.String())
	}
}

func TestRegisterPluginRootRoutesRejectsTraversalForRegisteredBackendStaticDirs(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerStaticDir"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/%2E%2E/main.go", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected traversal 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode traversal payload: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeAssetInvalidPath) {
		t.Fatalf("expected asset invalid path code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRootRoutesLeavesUnknownPathsAsRouteNotFoundWithoutRegisteredStaticDir(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected unknown static path 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode not found payload: %v", err)
	}
	if payload.Error.Code != "not_found" {
		t.Fatalf("expected generic not_found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRootRoutesPreserveBackendRouteStatusHeadersAndBody(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			switch requestPath {
			case "/created", "/missing":
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			default:
				return plugins.BackendRouteLookup{}, nil
			}
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			switch request.Path {
			case "/created":
				return plugins.BackendHTTPResponse{
					StatusCode: http.StatusCreated,
					Headers: map[string][]string{
						"Content-Type": {"application/json"},
						"X-Fixture":    {"created"},
					},
					Body: []byte(`{"ok":true}`),
				}, true, nil
			case "/missing":
				return plugins.BackendHTTPResponse{
					StatusCode: http.StatusNotFound,
					Headers: map[string][]string{
						"Content-Type": {"application/json"},
					},
					Body: []byte(`{"detail":"missing"}`),
				}, true, nil
			default:
				return plugins.BackendHTTPResponse{}, false, nil
			}
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	createdResponse, err := http.Get(server.URL + "/created")
	if err != nil {
		t.Fatalf("request created backend route: %v", err)
	}
	defer createdResponse.Body.Close()

	createdBody, err := io.ReadAll(createdResponse.Body)
	if err != nil {
		t.Fatalf("read created backend route body: %v", err)
	}
	if createdResponse.StatusCode != http.StatusCreated {
		t.Fatalf("expected created backend route status 201, got %d", createdResponse.StatusCode)
	}
	if got := createdResponse.Header.Get("X-Fixture"); got != "created" {
		t.Fatalf("expected created backend response header, got %q", got)
	}
	if string(createdBody) != `{"ok":true}` {
		t.Fatalf("expected created backend route body, got %q", createdBody)
	}

	missingResponse, err := http.Get(server.URL + "/missing")
	if err != nil {
		t.Fatalf("request missing backend route: %v", err)
	}
	defer missingResponse.Body.Close()

	missingBody, err := io.ReadAll(missingResponse.Body)
	if err != nil {
		t.Fatalf("read missing backend route body: %v", err)
	}
	if missingResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("expected missing backend route status 404, got %d", missingResponse.StatusCode)
	}
	if string(missingBody) != `{"detail":"missing"}` {
		t.Fatalf("expected missing backend route body, got %q", missingBody)
	}
}

func TestRegisterPluginRootRoutesMapBackendDispatchServiceErrors(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/error" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			return plugins.BackendHTTPResponse{}, true, &plugins.ServiceError{
				Code:    plugins.ServiceErrorCodeBackendRuntimeInvalid,
				Message: "backend dispatch failed",
				Status:  http.StatusBadGateway,
			}
		},
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/error", nil)
	newPluginRouteTestHandler(t, config.ModeIDE, service).ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected backend dispatch error status 502, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode backend dispatch error payload: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid code, got %#v", payload.Error)
	}
	if payload.Error.Message != "backend dispatch failed" {
		t.Fatalf("expected backend dispatch error message, got %#v", payload.Error)
	}
}

func TestRegisterPluginRootRoutesPreserveRepeatedHeadersFromBackendResponse(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/headers" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			return plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
					"Set-Cookie": {
						"a=1; Path=/; HttpOnly",
						"b=2; Path=/; Secure",
					},
					"Link": {
						"</a.css>; rel=preload; as=style",
						"</b.css>; rel=preload; as=style",
					},
					"X-Fixture": {"headers"},
				},
				Body: []byte(`{"ok":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	response, err := http.Get(server.URL + "/headers")
	if err != nil {
		t.Fatalf("request backend route with repeated headers: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected repeated-header backend route status 200, got %d", response.StatusCode)
	}
	if got := response.Header.Get("X-Fixture"); got != "headers" {
		t.Fatalf("expected x-fixture header, got %q", got)
	}
	if got := response.Header.Values("Set-Cookie"); len(got) != 2 || got[0] != "a=1; Path=/; HttpOnly" || got[1] != "b=2; Path=/; Secure" {
		t.Fatalf("expected repeated set-cookie headers, got %#v", got)
	}
	if got := response.Header.Values("Link"); len(got) != 2 || got[0] != "</a.css>; rel=preload; as=style" || got[1] != "</b.css>; rel=preload; as=style" {
		t.Fatalf("expected repeated link headers, got %#v", got)
	}
}

func TestRegisterPluginRootRoutesRejectInvalidHeaderTransportValues(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name                    string
		headers                 map[string][]string
		expectedMessageFragment string
	}{
		{
			name: "non_latin_1_value",
			headers: map[string][]string{
				"X-Fixture": {"✓"},
			},
			expectedMessageFragment: "non-latin-1 header name or value",
		},
		{
			name: "newline_in_name",
			headers: map[string][]string{
				"X-Fixture\nInvalid": {"value"},
			},
			expectedMessageFragment: "headers containing newline characters",
		},
		{
			name: "newline_in_value",
			headers: map[string][]string{
				"X-Fixture": {"value\rinvalid"},
			},
			expectedMessageFragment: "headers containing newline characters",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			service := pluginRouteServiceStub{
				lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
					if requestPath == "/headers" {
						return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
					}
					return plugins.BackendRouteLookup{}, nil
				},
				dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
					return plugins.BackendHTTPResponse{
						StatusCode: http.StatusOK,
						Headers:    tc.headers,
						Body:       []byte(`{"ok":true}`),
					}, true, nil
				},
			}

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/headers", nil)
			newPluginRouteTestHandler(t, config.ModeIDE, service).ServeHTTP(response, request)

			if response.Code != http.StatusBadGateway {
				t.Fatalf("expected invalid header transport to fail with 502, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid header transport payload: %v", err)
			}
			if payload.Error.Code != string(plugins.ServiceErrorCodeBackendRuntimeInvalid) {
				t.Fatalf("expected backend runtime invalid code, got %#v", payload.Error)
			}
			if !strings.Contains(payload.Error.Message, tc.expectedMessageFragment) {
				t.Fatalf("expected invalid header transport message to contain %q, got %#v", tc.expectedMessageFragment, payload.Error)
			}
		})
	}
}

func TestRegisterPluginRootRoutesPreserveBackendRequestBodyBytes(t *testing.T) {
	t.Parallel()

	rawBody := []byte{0xff, 'a', 'b', 'c', 0xfe}
	capturedRequests := []plugins.BackendHTTPRequest{}
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/echo" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			capturedRequests = append(capturedRequests, request)
			return plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				Body: []byte(`{"ok":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/echo?mode=raw", bytes.NewReader(rawBody))
	if err != nil {
		t.Fatalf("new backend route request: %v", err)
	}
	request.Header.Set("Content-Type", "application/octet-stream")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post backend route with raw bytes: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected raw-byte backend route status 200, got %d", response.StatusCode)
	}
	if len(capturedRequests) != 1 {
		t.Fatalf("expected one captured backend request, got %#v", capturedRequests)
	}
	captured := capturedRequests[0]
	if captured.Method != http.MethodPost || captured.Path != "/echo" || captured.RawQuery != "mode=raw" {
		t.Fatalf("unexpected captured backend request metadata %#v", captured)
	}
	if got := captured.Headers["Content-Type"]; len(got) != 1 || got[0] != "application/octet-stream" {
		t.Fatalf("expected content-type to round-trip, got %#v", captured.Headers)
	}
	if !bytes.Equal(captured.Body, rawBody) {
		t.Fatalf("expected raw backend request bytes %#v, got %#v", rawBody, captured.Body)
	}
}

func TestRegisterPluginRootRoutesPreserveExplicitJSONNullAndEmptyBodies(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			switch requestPath {
			case "/null", "/empty":
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			default:
				return plugins.BackendRouteLookup{}, nil
			}
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			response := plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
			}
			if request.Path == "/null" {
				response.Body = []byte("null")
			}
			return response, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	nullResponse, err := http.Get(server.URL + "/null")
	if err != nil {
		t.Fatalf("request backend route with null body: %v", err)
	}
	defer nullResponse.Body.Close()

	nullBody, err := io.ReadAll(nullResponse.Body)
	if err != nil {
		t.Fatalf("read backend route null body: %v", err)
	}
	if got := nullResponse.Header.Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected json content-type for null body, got %q", got)
	}
	if string(nullBody) != "null" {
		t.Fatalf("expected explicit json null body, got %q", nullBody)
	}

	emptyResponse, err := http.Get(server.URL + "/empty")
	if err != nil {
		t.Fatalf("request backend route with empty body: %v", err)
	}
	defer emptyResponse.Body.Close()

	emptyBody, err := io.ReadAll(emptyResponse.Body)
	if err != nil {
		t.Fatalf("read backend route empty body: %v", err)
	}
	if got := emptyResponse.Header.Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected json content-type for empty body, got %q", got)
	}
	if len(emptyBody) != 0 {
		t.Fatalf("expected empty backend route body, got %q", emptyBody)
	}
}

func TestRegisterPluginRootRoutesSuppressBackendResponseBodiesForNoContentStatuses(t *testing.T) {
	t.Parallel()

	statusByPath := map[string]int{
		"/no-content/204": http.StatusNoContent,
		"/no-content/205": http.StatusResetContent,
		"/no-content/304": http.StatusNotModified,
	}
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if _, ok := statusByPath[requestPath]; ok {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			status, ok := statusByPath[request.Path]
			if !ok {
				return plugins.BackendHTTPResponse{}, false, nil
			}
			return plugins.BackendHTTPResponse{
				StatusCode: status,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				Body: []byte(`{"ignored":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	for path, expectedStatus := range statusByPath {
		path := path
		expectedStatus := expectedStatus
		t.Run(strings.TrimPrefix(path, "/no-content/"), func(t *testing.T) {
			response, err := http.Get(server.URL + path)
			if err != nil {
				t.Fatalf("request backend route with no-content status: %v", err)
			}
			defer response.Body.Close()

			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatalf("read backend no-content response body: %v", err)
			}
			if response.StatusCode != expectedStatus {
				t.Fatalf("expected backend route status %d, got %d", expectedStatus, response.StatusCode)
			}
			if len(body) != 0 {
				t.Fatalf("expected no-content backend response body to be empty, got %q", body)
			}
		})
	}
}

type pluginRouteTestRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

func newPluginRouteTestService(t *testing.T, mode config.Mode) (*plugins.Service, pluginRouteTestRoots) {
	t.Helper()
	return newPluginRouteTestServiceWithRestartCallback(t, mode, nil)
}

func newPluginRouteTestServiceWithRestartCallback(t *testing.T, mode config.Mode, callback plugins.RestartCallback) (*plugins.Service, pluginRouteTestRoots) {
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
		WorkspaceRoot:   roots.workspaceRoot,
		SettaFilesRoot:  roots.settaFilesRoot,
		SettaHome:       roots.settaHome,
		ServerMode:      mode,
		RestartCallback: callback,
	})
	if err != nil {
		t.Fatalf("new plugin route service: %v", err)
	}
	return service, roots
}

func newPluginRouteTestHandler(t *testing.T, mode config.Mode, service PluginRouteService) http.Handler {
	t.Helper()

	return newPluginRouteTestHandlerWithAuth(t, mode, service, nil)
}

func newPluginRouteTestHandlerWithAuth(t *testing.T, mode config.Mode, service PluginRouteService, authService *auth.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterPluginRootRoutes(r, PluginRootRouteDependencies{
				Service: service,
				Auth:    authService,
			}); err != nil {
				t.Fatalf("register plugin root routes: %v", err)
			}
		},
		Register: func(r chi.Router) {
			if err := RegisterPluginRoutes(r, PluginRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Service:    service,
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

type pluginRouteServiceStub struct {
	runtimeFunc                          func(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error)
	getBackendUISettingsFunc             func(string) ([]plugins.PluginRegisteredUISetting, error)
	readBackendUISettingValueFunc        func(context.Context, plugins.BackendUISettingReadOptions) (any, error)
	writeBackendUISettingValueFunc       func(context.Context, plugins.BackendUISettingWriteOptions) error
	rescanFunc                           func() (plugins.DiscoverySnapshot, error)
	installFunc                          func(context.Context, plugins.InstallOptions) (plugins.PluginInstallResponse, error)
	linkFunc                             func(plugins.LinkOptions) (plugins.PluginInstallResponse, error)
	uninstallFunc                        func(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResponse, error)
	updateFunc                           func(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResponse, error)
	rollbackFunc                         func(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResponse, error)
	enableFunc                           func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error)
	disableFunc                          func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error)
	writeConfigFunc                      func(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error)
	writeLockfileFunc                    func() (plugins.PluginLockWriteResponse, error)
	applyLockfileFunc                    func(context.Context, bool) (plugins.PluginLockApplyResponse, error)
	restartFunc                          func(context.Context) (plugins.PluginRestartResponse, error)
	resolveAssetPathFunc                 func(string, string) (string, error)
	resolveRegisteredStaticAssetPathFunc func(string) (string, bool, error)
	lookupRegisteredBackendRouteFunc     func(string, string) (plugins.BackendRouteLookup, error)
	dispatchRegisteredBackendRouteFunc   func(context.Context, plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error)
	invokeRegisteredListenerEndpointFunc func(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error)
}

func (s pluginRouteServiceStub) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	if s.runtimeFunc != nil {
		return s.runtimeFunc(options)
	}
	return plugins.PluginRuntimeResponse{}, nil
}

func (s pluginRouteServiceStub) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	if s.getBackendUISettingsFunc != nil {
		return s.getBackendUISettingsFunc(pluginID)
	}
	return []plugins.PluginRegisteredUISetting{}, nil
}

func (s pluginRouteServiceStub) ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	if s.readBackendUISettingValueFunc != nil {
		return s.readBackendUISettingValueFunc(ctx, options)
	}
	return nil, nil
}

func (s pluginRouteServiceStub) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	if s.writeBackendUISettingValueFunc != nil {
		return s.writeBackendUISettingValueFunc(ctx, options)
	}
	return nil
}

func (s pluginRouteServiceStub) Rescan() (plugins.DiscoverySnapshot, error) {
	if s.rescanFunc != nil {
		return s.rescanFunc()
	}
	return plugins.DiscoverySnapshot{}, nil
}

func (s pluginRouteServiceStub) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	if s.installFunc != nil {
		return s.installFunc(ctx, options)
	}
	return plugins.PluginInstallResponse{}, nil
}

func (s pluginRouteServiceStub) Link(options plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	if s.linkFunc != nil {
		return s.linkFunc(options)
	}
	return plugins.PluginInstallResponse{}, nil
}

func (s pluginRouteServiceStub) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	if s.uninstallFunc != nil {
		return s.uninstallFunc(ctx, options)
	}
	return plugins.PluginUninstallResponse{}, nil
}

func (s pluginRouteServiceStub) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	if s.updateFunc != nil {
		return s.updateFunc(ctx, options)
	}
	return plugins.PluginUpdateResponse{}, nil
}

func (s pluginRouteServiceStub) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	if s.rollbackFunc != nil {
		return s.rollbackFunc(ctx, options)
	}
	return plugins.PluginRollbackResponse{}, nil
}

func (s pluginRouteServiceStub) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	if s.enableFunc != nil {
		return s.enableFunc(ctx, options)
	}
	return plugins.PluginEnableDisableResponse{}, nil
}

func (s pluginRouteServiceStub) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	if s.disableFunc != nil {
		return s.disableFunc(ctx, options)
	}
	return plugins.PluginEnableDisableResponse{}, nil
}

func (s pluginRouteServiceStub) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	if s.writeConfigFunc != nil {
		return s.writeConfigFunc(ctx, options)
	}
	return plugins.PluginConfigWriteResponse{}, nil
}

func (s pluginRouteServiceStub) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	if s.writeLockfileFunc != nil {
		return s.writeLockfileFunc()
	}
	return plugins.PluginLockWriteResponse{}, nil
}

func (s pluginRouteServiceStub) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResponse, error) {
	if s.applyLockfileFunc != nil {
		return s.applyLockfileFunc(ctx, check)
	}
	return plugins.PluginLockApplyResponse{}, nil
}

func (s pluginRouteServiceStub) Restart(ctx context.Context) (plugins.PluginRestartResponse, error) {
	if s.restartFunc != nil {
		return s.restartFunc(ctx)
	}
	return plugins.PluginRestartResponse{}, nil
}

func (s pluginRouteServiceStub) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	if s.resolveAssetPathFunc != nil {
		return s.resolveAssetPathFunc(pluginID, assetPath)
	}
	return "", nil
}

func (s pluginRouteServiceStub) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	if s.resolveRegisteredStaticAssetPathFunc != nil {
		return s.resolveRegisteredStaticAssetPathFunc(requestPath)
	}
	return "", false, nil
}

func (s pluginRouteServiceStub) LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error) {
	if s.lookupRegisteredBackendRouteFunc != nil {
		return s.lookupRegisteredBackendRouteFunc(method, requestPath)
	}
	return plugins.BackendRouteLookup{}, nil
}

func (s pluginRouteServiceStub) DispatchRegisteredBackendRoute(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
	if s.dispatchRegisteredBackendRouteFunc != nil {
		return s.dispatchRegisteredBackendRouteFunc(ctx, request)
	}
	return plugins.BackendHTTPResponse{}, false, nil
}

func (s pluginRouteServiceStub) InvokeRegisteredListenerEndpoint(ctx context.Context, request plugins.BackendListenerEndpointRequest) (any, bool, error) {
	if s.invokeRegisteredListenerEndpointFunc != nil {
		return s.invokeRegisteredListenerEndpointFunc(ctx, request)
	}
	return nil, false, nil
}

func copyPluginRouteFixtureToWorkspace(t *testing.T, workspaceRoot string, fixtureName string) {
	t.Helper()

	copyPluginRouteFixtureToInstallRoot(t, filepath.Join(workspaceRoot, ".setta_plugins"), fixtureName)
}

func copyPluginRouteFixtureToSettaFiles(t *testing.T, settaFilesRoot string, fixtureName string) {
	t.Helper()

	copyPluginRouteFixtureToInstallRoot(t, filepath.Join(settaFilesRoot, "plugins"), fixtureName)
}

func copyPluginRouteFixtureToInstallRoot(t *testing.T, installRoot string, fixtureName string) {
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

	targetRoot := filepath.Join(installRoot, manifest.ID)
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
