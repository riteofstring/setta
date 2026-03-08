package plugins

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
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

func mustNewBackendRouteRuntime(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode) *BackendRouteRuntime {
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
				PythonBinary:     workerRPCTestPythonBinary(t, repoRoot),
				Environment:      workerRPCTestEnv(repoRoot),
				WorkingDirectory: repoRoot,
			}, nil
		}),
		ServerMode: mode,
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
