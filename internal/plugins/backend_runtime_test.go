package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
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

func TestServiceDispatchRegisteredBackendRoutePreservesRepeatedQueryParamsInRawQuery(t *testing.T) {
	// Backend route dispatch should preserve repeated query parameters on the public raw-query transport.
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
		Method:   http.MethodPost,
		Path:     "/items",
		RawQuery: "kind=first&kind=second&single=value&kind=third",
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
		Body: []byte(`{"name":"example"}`),
	})
	if err != nil {
		t.Fatalf("dispatch backend route with repeated query params: %v", err)
	}
	if !matched {
		t.Fatal("expected backend route match")
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		t.Fatalf("decode backend route response body: %v", err)
	}
	if payload["rawQuery"] != "kind=first&kind=second&single=value&kind=third" {
		t.Fatalf("expected repeated query params to be preserved, got %#v", payload["rawQuery"])
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

func TestFindRegisteredBackendRouteMatchRejectsConflictingPlugins(t *testing.T) {
	entries := []DiscoveredPlugin{
		newBackendRouteTestPlugin("plugin-alpha", PluginRuntimeStateActive, "/items", http.MethodPost),
		newBackendRouteTestPlugin("plugin-beta", PluginRuntimeStatePendingRestart, "/items", http.MethodPost),
	}

	_, _, err := findRegisteredBackendRouteMatch(entries, http.MethodPost, "/items")
	if err == nil {
		t.Fatal("expected conflicting backend route registration error")
	}

	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %T (%v)", err, err)
	}
	if serviceErr.Code != ServiceErrorCodeBackendRuntimeInvalid {
		t.Fatalf("expected backend runtime invalid code, got %#v", serviceErr)
	}
	if !strings.Contains(serviceErr.Message, "plugin-alpha") || !strings.Contains(serviceErr.Message, "plugin-beta") {
		t.Fatalf("expected conflicting plugin ids in error message, got %#v", serviceErr.Message)
	}
}

func TestFindRegisteredBackendRouteMatchTreatsInvalidRequestPathAsMiss(t *testing.T) {
	entries := []DiscoveredPlugin{
		newBackendRouteTestPlugin("plugin-alpha", PluginRuntimeStateActive, "/items", http.MethodGet),
	}

	match, lookup, err := findRegisteredBackendRouteMatch(entries, http.MethodGet, "/items//bad")
	if err != nil {
		t.Fatalf("expected invalid caller path to miss without error, got %v", err)
	}
	if lookup.Matched || lookup.PathExists {
		t.Fatalf("expected invalid path to miss route matching, got %#v", lookup)
	}
	if match.Entry.PluginID != "" {
		t.Fatalf("expected no route match, got %#v", match)
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

func TestServiceDispatchRegisteredBackendRouteRejectsInvalidRuntimeStatusCode(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte(`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"routes": []map[string]any{
				{
					"path": "/health",
					"methods": []string{"GET"},
				},
			},
			"staticDirs": []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"http": map[string]any{
				"statusCode": 1000,
				"headers": map[string][]string{},
			},
		})
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
`),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with invalid runtime status code: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	_, matched, err := service.DispatchRegisteredBackendRoute(context.Background(), BackendHTTPRequest{
		Context: BackendRequestContext{
			ServerMode: config.ModeIDE,
		},
		Method: http.MethodGet,
		Path:   "/health",
	})
	if err == nil {
		t.Fatal("expected invalid runtime status code error")
	}
	if !matched {
		t.Fatal("expected route match before invalid runtime status code error")
	}

	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %T (%v)", err, err)
	}
	if serviceErr.Code != ServiceErrorCodeBackendRuntimeInvalid {
		t.Fatalf("expected backend runtime invalid code, got %#v", serviceErr)
	}
	if !strings.Contains(serviceErr.Message, "unsupported status code 1000") {
		t.Fatalf("expected invalid status message, got %#v", serviceErr.Message)
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

func TestFindRegisteredListenerEndpointMatchScopesToRequestedPlugin(t *testing.T) {
	entries := []DiscoveredPlugin{
		newListenerEndpointTestPlugin("plugin-alpha", PluginRuntimeStateActive, "shared_endpoint"),
		newListenerEndpointTestPlugin("plugin-beta", PluginRuntimeStateActive, "shared_endpoint"),
	}

	match, ok, err := findRegisteredListenerEndpointMatch(entries, BackendListenerEndpointRequest{
		PluginID:     "plugin-beta",
		EndpointName: "shared_endpoint",
	})
	if err != nil {
		t.Fatalf("find plugin-scoped listener endpoint match: %v", err)
	}
	if !ok {
		t.Fatal("expected plugin-scoped listener endpoint match")
	}
	if match.Entry.PluginID != "plugin-beta" {
		t.Fatalf("expected plugin-beta match, got %#v", match.Entry.PluginID)
	}

	_, _, err = findRegisteredListenerEndpointMatch(entries, BackendListenerEndpointRequest{
		EndpointName: "shared_endpoint",
	})
	if err == nil {
		t.Fatal("expected unscoped listener endpoint conflict")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %T (%v)", err, err)
	}
	if serviceErr.Code != ServiceErrorCodeBackendRuntimeInvalid {
		t.Fatalf("expected backend runtime invalid code, got %#v", serviceErr.Code)
	}
}

func TestFindRegisteredListenerEndpointMatchUsesAppSubsystemPrivateEndpointsForPluginScopedRequest(
	t *testing.T,
) {
	entry := newListenerEndpointTestPlugin(
		"app-provider",
		PluginRuntimeStateActive,
		"generic_endpoint",
	)
	entry.EffectiveCapabilities = []string{"registerAppSubsystemBackend"}
	entry.RegisteredListenerEndpoints = nil
	entry.appSubsystemListenerEndpoints = []PluginRegisteredListenerEndpoint{
		{Name: "appsubsystem_get_app_definition"},
	}

	match, ok, err := findRegisteredListenerEndpointMatch([]DiscoveredPlugin{entry}, BackendListenerEndpointRequest{
		PluginID:     "app-provider",
		EndpointName: "appsubsystem_get_app_definition",
	})
	if err != nil {
		t.Fatalf("find app-subsystem listener endpoint match: %v", err)
	}
	if !ok {
		t.Fatal("expected app-subsystem listener endpoint match")
	}
	if match.Entry.PluginID != "app-provider" {
		t.Fatalf("expected app-provider match, got %#v", match.Entry.PluginID)
	}

	_, ok, err = findRegisteredListenerEndpointMatch([]DiscoveredPlugin{entry}, BackendListenerEndpointRequest{
		EndpointName: "appsubsystem_get_app_definition",
	})
	if err != nil {
		t.Fatalf("unscoped app-subsystem private endpoint should miss without error, got %v", err)
	}
	if ok {
		t.Fatal("expected app-subsystem private endpoint to be unavailable globally")
	}
}

func TestServiceAppSubsystemPrivateListenerEndpointsArePluginScoped(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appDeploymentRuntime": true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	_, handled, err := service.InvokeRegisteredListenerEndpoint(context.Background(), BackendListenerEndpointRequest{
		EndpointName: backendruntime.ListenerEndpointGetAppDefinition,
	})
	if err != nil {
		t.Fatalf("invoke unscoped app-subsystem listener endpoint: %v", err)
	}
	if handled {
		t.Fatal("expected app-subsystem listener endpoint to miss when unscoped")
	}

	_, handled, err = service.InvokeRegisteredListenerEndpoint(context.Background(), BackendListenerEndpointRequest{
		PluginID:     pluginID,
		EndpointName: backendruntime.ListenerEndpointGetAppDefinition,
	})
	if err != nil {
		t.Fatalf("invoke plugin-scoped app-subsystem listener endpoint: %v", err)
	}
	if !handled {
		t.Fatal("expected app-subsystem listener endpoint to be handled when plugin scoped")
	}
}

func TestServiceBackendUISettingRoundTripInvokesGoBackendExecutable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerUISettings"}
	})
	writePluginBackendUISettingFixtureMainGo(t, pluginRoot, false)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	settings, err := service.GetBackendUISettings("setta-fixture-full")
	if err != nil {
		t.Fatalf("get backend ui settings: %v", err)
	}
	if len(settings) != 1 {
		t.Fatalf("expected one backend ui setting, got %#v", settings)
	}
	if settings[0].LocalSettingID != "backend_enabled" || settings[0].ReadHandlerID != "read-backend-enabled" {
		t.Fatalf("unexpected backend ui setting registration %#v", settings[0])
	}

	value, err := service.ReadBackendUISettingValue(context.Background(), BackendUISettingReadOptions{
		PluginID:        "setta-fixture-full",
		HandlerID:       "read-backend-enabled",
		ProjectConfigID: "project-alpha",
	})
	if err != nil {
		t.Fatalf("read backend ui setting value: %v", err)
	}
	if value != false {
		t.Fatalf("expected default backend ui setting value false, got %#v", value)
	}

	if err := service.WriteBackendUISettingValue(context.Background(), BackendUISettingWriteOptions{
		PluginID:        "setta-fixture-full",
		HandlerID:       "write-backend-enabled",
		ProjectConfigID: "project-alpha",
		Value:           true,
	}); err != nil {
		t.Fatalf("write backend ui setting value: %v", err)
	}

	updatedValue, err := service.ReadBackendUISettingValue(context.Background(), BackendUISettingReadOptions{
		PluginID:        "setta-fixture-full",
		HandlerID:       "read-backend-enabled",
		ProjectConfigID: "project-alpha",
	})
	if err != nil {
		t.Fatalf("read backend ui setting value after write: %v", err)
	}
	if updatedValue != true {
		t.Fatalf("expected updated backend ui setting value true, got %#v", updatedValue)
	}
}

func writePluginBackendUISettingFixtureMainGo(t *testing.T, pluginRoot string, invalidPostWrite bool) {
	t.Helper()

	assignment := "state.Enabled = value"
	if invalidPostWrite {
		assignment = "if value {\n\t\tstate.Enabled = \"invalid-value\"\n\t} else {\n\t\tstate.Enabled = value\n\t}"
	}

	source := fmt.Sprintf(`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

type runtimeRequest struct {
	SchemaVersion int               `+"`json:\"schemaVersion\"`"+`
	Kind          string            `+"`json:\"kind\"`"+`
	UISetting     *uiSettingRequest `+"`json:\"uiSetting,omitempty\"`"+`
}

type uiSettingRequest struct {
	HandlerID       string `+"`json:\"handlerId\"`"+`
	Operation       string `+"`json:\"operation\"`"+`
	ProjectConfigID string `+"`json:\"projectConfigId\"`"+`
	Value           any    `+"`json:\"value,omitempty\"`"+`
}

type runtimeResponse struct {
	SchemaVersion int            `+"`json:\"schemaVersion\"`"+`
	UISetting     map[string]any `+"`json:\"uiSetting,omitempty\"`"+`
}

type stateFile struct {
	Enabled any `+"`json:\"enabled\"`"+`
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"uiSettings": []map[string]any{
				{
					"id":             "backend_enabled",
					"title":          "Backend Enabled",
					"description":    "Enable backend-provided fixture behavior.",
					"paneId":         "full-settings-pane",
					"revealKey":      "full-settings",
					"synonyms":       []string{"backend enabled"},
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "boolean"},
					"readHandlerId":  "read-backend-enabled",
					"writeHandlerId": "write-backend-enabled",
				},
			},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func handleRuntime() {
	var request runtimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %%v", err)
	}
	switch strings.TrimSpace(request.Kind) {
	case "ui_setting":
		if request.UISetting == nil {
			fail("ui setting runtime payload is required")
		}
		handleUISetting(*request.UISetting)
	default:
		fail("unsupported backend runtime kind %%q", request.Kind)
	}
}

func handleUISetting(request uiSettingRequest) {
	switch strings.TrimSpace(request.HandlerID) {
	case "read-backend-enabled":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "write-backend-enabled":
		if strings.TrimSpace(request.Operation) != "write" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		value, ok := request.Value.(bool)
		if !ok {
			fail("ui setting write value must be boolean")
		}
		state := loadState()
		%s
		saveState(state)
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	default:
		fail("unsupported ui setting handler %%q", request.HandlerID)
	}
}

func statePath() string {
	return filepath.Join(".", "backend_ui_setting_state.json")
}

func loadState() stateFile {
	bytes, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return stateFile{Enabled: false}
		}
		fail("read ui setting state: %%v", err)
	}
	var state stateFile
	if err := json.Unmarshal(bytes, &state); err != nil {
		fail("decode ui setting state: %%v", err)
	}
	if state.Enabled == nil {
		state.Enabled = false
	}
	return state
}

func saveState(state stateFile) {
	payload, err := json.Marshal(state)
	if err != nil {
		fail("encode ui setting state: %%v", err)
	}
	if err := os.WriteFile(statePath(), payload, 0o644); err != nil {
		fail("write ui setting state: %%v", err)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %%v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`, assignment)

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write backend ui setting fixture main.go: %v", err)
	}
}

func newBackendRouteTestPlugin(pluginID string, state PluginRuntimeState, routePath string, methods ...string) DiscoveredPlugin {
	return DiscoveredPlugin{
		PluginID: pluginID,
		Manifest: &PluginManifest{},
		State:    state,
		EffectiveCapabilities: []string{
			"registerRouter",
		},
		RegisteredBackendRoutes: []PluginRegisteredBackendRoute{
			{
				Path:    routePath,
				Methods: append([]string(nil), methods...),
			},
		},
	}
}

func newListenerEndpointTestPlugin(pluginID string, state PluginRuntimeState, endpointName string) DiscoveredPlugin {
	return DiscoveredPlugin{
		PluginID: pluginID,
		Manifest: &PluginManifest{},
		State:    state,
		EffectiveCapabilities: []string{
			"registerListenerEndpoint",
		},
		RegisteredListenerEndpoints: []PluginRegisteredListenerEndpoint{
			{Name: endpointName},
		},
	}
}
