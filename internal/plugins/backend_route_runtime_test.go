package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

// The live backend route runtime should start mixed route+language-server plugins and proxy request/response payloads over the worker RPC boundary.
func TestBackendRouteRuntimeProxiesFixtureRoutePayloads(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-language-server-e2e")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	routes := runtime.Routes()
	if len(routes) != 9 {
		t.Fatalf("expected 9 registered backend routes, got %#v", routes)
	}

	queryRoute := mustFindBackendRoute(t, routes, "/payload/echo-query")
	queryRequest := httptest.NewRequest(http.MethodGet, "http://setta.test"+queryRoute.Pattern+"?alpha=one&repeated=a&repeated=b", nil)
	queryResponse, err := runtime.ProxyRoute(context.Background(), queryRoute, queryRequest, nil)
	if err != nil {
		t.Fatalf("proxy query route: %v", err)
	}
	if queryResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected query status 200, got %#v", queryResponse.StatusCode)
	}
	queryPayload := decodeBackendRouteBodyMap(t, queryResponse)
	if queryPayload["alpha"] != "one" {
		t.Fatalf("expected alpha one, got %#v", queryPayload["alpha"])
	}
	repeatedValues, ok := queryPayload["repeated"].([]any)
	if !ok || len(repeatedValues) != 2 || repeatedValues[0] != "a" || repeatedValues[1] != "b" {
		t.Fatalf("expected repeated query list, got %#v", queryPayload["repeated"])
	}
	if queryPayload["repeatedIsList"] != true {
		t.Fatalf("expected repeatedIsList true, got %#v", queryPayload["repeatedIsList"])
	}

	bodyRoute := mustFindBackendRoute(t, routes, "/payload/echo-body")
	bodyRequest := httptest.NewRequest(
		http.MethodPost,
		"http://setta.test"+bodyRoute.Pattern+"?token=from-query",
		strings.NewReader(`{"value":"hello","count":3,"nested":{"ok":true}}`),
	)
	bodyRequest.Header.Set("Content-Type", "application/json")
	bodyResponse, err := runtime.ProxyRoute(context.Background(), bodyRoute, bodyRequest, nil)
	if err != nil {
		t.Fatalf("proxy body route: %v", err)
	}
	if bodyResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected body status 200, got %#v", bodyResponse.StatusCode)
	}
	bodyPayload := decodeBackendRouteBodyMap(t, bodyResponse)
	if bodyPayload["value"] != "hello" {
		t.Fatalf("expected value hello, got %#v", bodyPayload["value"])
	}
	if bodyPayload["count"] != float64(3) {
		t.Fatalf("expected count 3, got %#v", bodyPayload["count"])
	}
	if bodyPayload["token"] != "from-query" {
		t.Fatalf("expected token from-query, got %#v", bodyPayload["token"])
	}

	contentTypeRoute := mustFindBackendRoute(t, routes, "/payload/echo-header-only-content-type")
	contentTypeRequest := httptest.NewRequest(http.MethodGet, "http://setta.test"+contentTypeRoute.Pattern, nil)
	contentTypeResponse, err := runtime.ProxyRoute(context.Background(), contentTypeRoute, contentTypeRequest, nil)
	if err != nil {
		t.Fatalf("proxy custom content-type route: %v", err)
	}
	if contentTypeResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected custom content-type status 200, got %#v", contentTypeResponse.StatusCode)
	}
	if contentTypeResponse.MediaType != "application/x-custom" {
		t.Fatalf("expected application/x-custom media type, got %#v", contentTypeResponse.MediaType)
	}
	if contentTypeResponse.Body != "ok" {
		t.Fatalf("expected text body ok, got %#v", contentTypeResponse.Body)
	}

	notFoundRoute := mustFindBackendRoute(t, routes, "/payload/echo-not-found")
	notFoundRequest := httptest.NewRequest(http.MethodGet, "http://setta.test"+notFoundRoute.Pattern, nil)
	notFoundResponse, err := runtime.ProxyRoute(context.Background(), notFoundRoute, notFoundRequest, nil)
	if err != nil {
		t.Fatalf("proxy not-found route: %v", err)
	}
	if notFoundResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("expected not-found status 404, got %#v", notFoundResponse.StatusCode)
	}
	if notFoundResponse.MediaType != "application/json" {
		t.Fatalf("expected JSON not-found media type, got %#v", notFoundResponse.MediaType)
	}
	notFoundPayload := decodeBackendRouteBodyMap(t, notFoundResponse)
	if notFoundPayload["detail"] != "fixture-not-found" {
		t.Fatalf("expected fixture-not-found detail, got %#v", notFoundPayload["detail"])
	}
}

// The runtime matcher should resolve the current backend route by method/path
// so the HTTP transport can dispatch newly refreshed plugin routes at request
// time instead of depending on startup-time chi registration.
func TestBackendRouteRuntimeMatchesRoutesAndAllowedMethods(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-language-server-e2e")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	route, pathParams, ok := runtime.MatchRoute(
		http.MethodPost,
		"/plugins/setta-fixture-backend-language-server-e2e/payload/echo-body",
	)
	if !ok {
		t.Fatal("expected backend route match")
	}
	if route.Pattern != "/plugins/setta-fixture-backend-language-server-e2e/payload/echo-body" {
		t.Fatalf("unexpected matched route %#v", route)
	}
	if len(pathParams) != 0 {
		t.Fatalf("expected no path params for fixture route, got %#v", pathParams)
	}

	if _, _, ok := runtime.MatchRoute(
		http.MethodPatch,
		"/plugins/setta-fixture-backend-language-server-e2e/payload/echo-body",
	); ok {
		t.Fatal("expected unsupported method not to match backend route")
	}

	allowedMethods := runtime.AllowedMethods("/plugins/setta-fixture-backend-language-server-e2e/payload/echo-body")
	if len(allowedMethods) != 1 || allowedMethods[0] != http.MethodPost {
		t.Fatalf("expected POST to be the only allowed method, got %#v", allowedMethods)
	}
	if allowedMethods := runtime.AllowedMethods("/plugins/setta-fixture-backend-language-server-e2e/payload/missing"); len(allowedMethods) != 0 {
		t.Fatalf("expected no allowed methods for unknown backend path, got %#v", allowedMethods)
	}
}

// Tool-only backend plugins should stay live and proxy MCP tool calls over the worker RPC boundary.
func TestBackendRouteRuntimeInvokesToolOnlyFixtureMCPTools(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-mcp-tools")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	tools := runtime.MCPTools()
	if len(tools) != 2 {
		t.Fatalf("expected 2 registered backend mcp tools, got %#v", tools)
	}

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_mcp_read", map[string]any{
		"value": "alpha",
	})
	if err != nil {
		t.Fatalf("invoke read tool: %v", err)
	}
	if result != "read:setta-fixture-backend-mcp-tools:alpha" {
		t.Fatalf("unexpected read tool result %#v", result)
	}
}

// Backend fixture plugins should support project-state reads over both routes and MCP tools.
func TestBackendRouteRuntimeSupportsProjectStateReadsOverRoutesAndMCPTools(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	projectRuntime := newWorkerHostTestProjectRuntime(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "fixture-project",
		Projects: map[string]projectstate.Project{
			"fixture-project": {
				ID:   "fixture-project",
				Name: "Fixture Project",
			},
		},
	})
	reader, err := NewRuntimeProjectStateReader(RuntimeProjectStateReaderOptions{
		ProjectState: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new project state reader: %v", err)
	}

	runtime := mustNewBackendRouteRuntimeWithOptions(t, roots, config.ModeIDE, reader, nil)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	route := mustFindBackendRoute(t, runtime.Routes(), "/project-state-summary")
	request := httptest.NewRequest(
		http.MethodGet,
		"http://setta.test"+route.Pattern+"?projectConfigId=fixture-project",
		nil,
	)
	response, err := runtime.ProxyRoute(context.Background(), route, request, nil)
	if err != nil {
		t.Fatalf("proxy project-state route: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected project-state route status 200, got %#v", response.StatusCode)
	}
	payload := decodeBackendRouteBodyMap(t, response)
	projectState, ok := payload["projectState"].(map[string]any)
	if !ok {
		t.Fatalf("expected projectState object, got %#v", payload["projectState"])
	}
	projectConfig, ok := projectState["projectConfig"].(map[string]any)
	if !ok || projectConfig["id"] != "fixture-project" {
		t.Fatalf("unexpected project-state route payload %#v", payload)
	}

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_backend_project_summary", map[string]any{
		"project_config_id": "fixture-project",
	})
	if err != nil {
		t.Fatalf("invoke project summary tool: %v", err)
	}
	projectSummary, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map project summary result, got %#v", result)
	}
	projectConfig, ok = projectSummary["projectConfig"].(map[string]any)
	if !ok || projectConfig["id"] != "fixture-project" {
		t.Fatalf("unexpected project summary tool result %#v", result)
	}
}

// Static-dir-only backend plugins should capture mount registrations, close their worker session, and resolve files later without a live worker.
func TestBackendRouteRuntimeResolvesStaticOnlyFixtureAssets(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-fixture-static-only")
	staticRoot := filepath.Join(pluginRoot, "backend", "static")
	if err := os.MkdirAll(staticRoot, 0o755); err != nil {
		t.Fatalf("mkdir static root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staticRoot, "hello.txt"), []byte("hello from static-only fixture\n"), 0o644); err != nil {
		t.Fatalf("write static file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "entrypoint.py"), []byte(
		"def register(plugin):\n    plugin.register_static_dir('assets', 'backend/static')\n",
	), 0o644); err != nil {
		t.Fatalf("write backend entrypoint: %v", err)
	}
	writeJSONFile(t, filepath.Join(pluginRoot, "setta.plugin.json"), map[string]any{
		"schemaVersion":     1,
		"id":                "setta-fixture-static-only",
		"name":              "Static Only Fixture",
		"version":           "0.1.0",
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"capabilities":      []string{"registerStaticDir"},
		"backend": map[string]any{
			"entrypoint": "backend/entrypoint.py",
		},
	})

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	if len(runtime.Routes()) != 0 {
		t.Fatalf("expected no backend routes, got %#v", runtime.Routes())
	}
	if len(runtime.MCPTools()) != 0 {
		t.Fatalf("expected no backend mcp tools, got %#v", runtime.MCPTools())
	}
	staticDirs := runtime.StaticDirs()
	if len(staticDirs) != 1 {
		t.Fatalf("expected 1 static-dir registration, got %#v", staticDirs)
	}
	if len(runtime.sessions) != 0 {
		t.Fatalf("expected static-only plugin to close worker session, got %#v", runtime.sessions)
	}

	resolvedPath, err := runtime.ResolveStaticAssetPath("setta-fixture-static-only", "assets/hello.txt")
	if err != nil {
		t.Fatalf("resolve static asset path: %v", err)
	}
	payload, err := os.ReadFile(resolvedPath)
	if err != nil {
		t.Fatalf("read resolved static asset: %v", err)
	}
	if strings.TrimSpace(string(payload)) != "hello from static-only fixture" {
		t.Fatalf("unexpected static asset payload %q", string(payload))
	}

	_, err = runtime.ResolveStaticAssetPath("setta-fixture-static-only", "assets/../setta.plugin.json")
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ServiceErrorCodeAssetInvalidPath {
		t.Fatalf("expected traversal asset-invalid-path error, got %v", err)
	}
}

// Mixed route+tool backend plugins should reuse one live worker session for both HTTP proxying and MCP tool calls.
func TestBackendRouteRuntimeSupportsMixedRouteAndMCPFixtures(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-language-server-e2e")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	routes := runtime.Routes()
	if len(routes) != 9 {
		t.Fatalf("expected 9 registered backend routes, got %#v", routes)
	}
	tools := runtime.MCPTools()
	if len(tools) != 1 {
		t.Fatalf("expected 1 registered backend mcp tool, got %#v", tools)
	}

	route := mustFindBackendRoute(t, routes, "/payload/echo-query")
	request := httptest.NewRequest(http.MethodGet, "http://setta.test"+route.Pattern+"?alpha=route", nil)
	response, err := runtime.ProxyRoute(context.Background(), route, request, nil)
	if err != nil {
		t.Fatalf("proxy mixed fixture route: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected mixed fixture route status 200, got %#v", response.StatusCode)
	}

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_backend_route_runtime_tool", map[string]any{
		"value": "tool",
	})
	if err != nil {
		t.Fatalf("invoke mixed fixture tool: %v", err)
	}
	if result != "route-runtime:setta-fixture-backend-language-server-e2e:tool" {
		t.Fatalf("unexpected mixed fixture tool result %#v", result)
	}
}

// Mixed route+static backend plugins should expose both HTTP proxying and static asset resolution from one startup path.
func TestBackendRouteRuntimeSupportsMixedRouteAndStaticFixtures(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-static-router")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	routes := runtime.Routes()
	if len(routes) != 1 {
		t.Fatalf("expected 1 backend route, got %#v", routes)
	}
	staticDirs := runtime.StaticDirs()
	if len(staticDirs) != 1 {
		t.Fatalf("expected 1 backend static dir, got %#v", staticDirs)
	}
	if len(runtime.sessions) != 1 {
		t.Fatalf("expected mixed plugin to keep one worker session, got %#v", runtime.sessions)
	}

	route := mustFindBackendRoute(t, routes, "/info")
	request := httptest.NewRequest(http.MethodGet, "http://setta.test"+route.Pattern, nil)
	response, err := runtime.ProxyRoute(context.Background(), route, request, nil)
	if err != nil {
		t.Fatalf("proxy mixed route+static fixture route: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected mixed route+static status 200, got %#v", response.StatusCode)
	}

	resolvedPath, err := runtime.ResolveStaticAssetPath("setta-fixture-backend-static-router", "fixture/hello.txt")
	if err != nil {
		t.Fatalf("resolve mixed fixture static asset: %v", err)
	}
	payload, err := os.ReadFile(resolvedPath)
	if err != nil {
		t.Fatalf("read mixed fixture static asset: %v", err)
	}
	if strings.TrimSpace(string(payload)) != "fixture static payload" {
		t.Fatalf("unexpected mixed fixture static asset payload %q", string(payload))
	}
}

func mustNewBackendRouteRuntime(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode) *BackendRouteRuntime {
	t.Helper()

	return mustNewBackendRouteRuntimeWithOptions(t, roots, mode, nil, nil)
}

func mustNewBackendRouteRuntimeWithOptions(
	t *testing.T,
	roots filesystemResolverTestRoots,
	mode config.Mode,
	reader ProjectStateReader,
	listenerProducer *realtime.ListenerProducer,
) *BackendRouteRuntime {
	t.Helper()

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new backend route runtime store: %v", err)
	}
	discovery, err := NewDiscoveryService(DiscoveryServiceOptions{
		Store:      store,
		ServerMode: mode,
	})
	if err != nil {
		t.Fatalf("new backend route runtime discovery service: %v", err)
	}

	repoRoot := workerRPCTestRepoRoot(t)
	runtime, err := NewBackendRouteRuntime(context.Background(), BackendRouteRuntimeOptions{
		DiscoveryService: discovery,
		RuntimeProvider: WorkerRuntimeProviderFunc(func(context.Context) (WorkerRuntime, error) {
			return WorkerRuntime{
				CommandPrefix:    workerRPCTestCommandPrefix(t, repoRoot),
				Environment:      workerRPCTestEnv(repoRoot),
				WorkingDirectory: repoRoot,
			}, nil
		}),
		ListenerProducer: listenerProducer,
		ProjectStateRead: reader,
		ServerMode:       mode,
	})
	if err != nil {
		t.Fatalf("new backend route runtime: %v", err)
	}
	return runtime
}

func mustFindBackendRoute(t *testing.T, routes []BackendRoute, suffix string) BackendRoute {
	t.Helper()

	for _, route := range routes {
		if strings.HasSuffix(route.Pattern, suffix) {
			return route
		}
	}
	t.Fatalf("expected backend route with suffix %q in %#v", suffix, routes)
	return BackendRoute{}
}

func decodeBackendRouteBodyMap(t *testing.T, response BackendRouteResponse) map[string]any {
	t.Helper()

	if !response.BodyPresent {
		t.Fatal("expected backend route response body")
	}
	encoded, err := json.Marshal(response.Body)
	if err != nil {
		t.Fatalf("marshal backend route response body: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode backend route response body: %v", err)
	}
	return payload
}
