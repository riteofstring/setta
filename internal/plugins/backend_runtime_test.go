package plugins

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"setta/internal/config"
)

func TestServiceDispatchRegisteredBackendRouteInvokesGoBackendExecutable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	response, matched, err := service.DispatchRegisteredBackendRoute(context.Background(), BackendHTTPRequest{
		Context: BackendRequestContext{
			ServerMode:     config.ModeIDE,
			HasAuth:        true,
			SessionID:      "session-123",
			ShareSessionID: "share-abc",
		},
		Method:   http.MethodPost,
		Path:     "/items",
		RawQuery: "view=full",
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
		Body: []byte(`{"name":"example"}`),
	})
	if err != nil {
		t.Fatalf("dispatch backend route: %v", err)
	}
	if !matched {
		t.Fatal("expected backend route match")
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("expected created response, got %#v", response.StatusCode)
	}
	if got := response.Headers["X-Plugin"]; len(got) != 1 || got[0] != "backend-fixture" {
		t.Fatalf("unexpected response headers %#v", response.Headers)
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		t.Fatalf("decode backend route response body: %v", err)
	}
	if payload["method"] != http.MethodPost || payload["path"] != "/items" || payload["rawQuery"] != "view=full" {
		t.Fatalf("unexpected backend route payload %#v", payload)
	}
	if payload["sessionId"] != "session-123" || payload["shareSessionId"] != "share-abc" {
		t.Fatalf("expected request context in backend route payload, got %#v", payload)
	}
	bodyPayload, ok := payload["body"].(map[string]any)
	if !ok || bodyPayload["name"] != "example" {
		t.Fatalf("unexpected backend route body payload %#v", payload["body"])
	}
}

func TestServiceLookupRegisteredBackendRouteReportsPathMismatch(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	lookup, err := service.LookupRegisteredBackendRoute(http.MethodGet, "/items")
	if err != nil {
		t.Fatalf("lookup registered backend route: %v", err)
	}
	if lookup.Matched {
		t.Fatalf("expected GET /items to miss method match, got %#v", lookup)
	}
	if !lookup.PathExists {
		t.Fatalf("expected GET /items to report path match, got %#v", lookup)
	}
}

func TestServiceDispatchRegisteredBackendRouteFallsBackFromHeadToGet(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	response, matched, err := service.DispatchRegisteredBackendRoute(context.Background(), BackendHTTPRequest{
		Context: BackendRequestContext{
			ServerMode: config.ModeIDE,
		},
		Method: http.MethodHead,
		Path:   "/health",
	})
	if err != nil {
		t.Fatalf("dispatch HEAD backend route: %v", err)
	}
	if !matched {
		t.Fatal("expected HEAD backend route match")
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected HEAD backend route 200, got %#v", response.StatusCode)
	}
}

func TestServiceInvokeRegisteredListenerEndpointInvokesGoBackendExecutable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerListenerEndpoint"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	result, handled, err := service.InvokeRegisteredListenerEndpoint(context.Background(), BackendListenerEndpointRequest{
		Context: BackendRequestContext{
			ServerMode:      config.ModeIDE,
			HasAuth:         true,
			SessionID:       "session-123",
			ProjectConfigID: "project-alpha",
		},
		EndpointName: "route_backend_fixture_ping",
		Payload: map[string]any{
			"projectConfigId": "project-alpha",
			"value":           "ping",
		},
	})
	if err != nil {
		t.Fatalf("invoke registered listener endpoint: %v", err)
	}
	if !handled {
		t.Fatal("expected listener endpoint to be handled")
	}

	resultPayload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map listener result, got %#v", result)
	}
	if resultPayload["endpointName"] != "route_backend_fixture_ping" || resultPayload["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected listener result payload %#v", resultPayload)
	}
	if resultPayload["sessionId"] != "session-123" || resultPayload["hasAuth"] != true {
		t.Fatalf("unexpected listener auth payload %#v", resultPayload)
	}
	payload, ok := resultPayload["payload"].(map[string]any)
	if !ok || payload["value"] != "ping" {
		t.Fatalf("unexpected listener payload %#v", resultPayload["payload"])
	}
}
