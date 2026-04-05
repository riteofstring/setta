package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/pathreveal"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/workspacelaunch"
)

type openAPITestInfoService struct{}

func (openAPITestInfoService) ServerMode(_ context.Context) string {
	return string(config.ModeIDE)
}

func (openAPITestInfoService) RuntimeInfo(_ context.Context) RuntimeInfo {
	return RuntimeInfo{
		Mode: string(config.ModeIDE),
		Paths: RuntimePaths{
			WorkspaceRoot:      "/workspace",
			SettaHome:          "/setta-home",
			ProfileLookupHome:  "/profiles",
			SettaFilesRoot:     "/setta-files",
			SettaFilesLocation: "local",
			RuntimeRoot:        "/runtime",
		},
		Policy: RuntimePathPolicy{
			GlobalSettaFilesBase: "/global-setta",
			AutoMode:             "local",
		},
	}
}

func (openAPITestInfoService) SDKRuntimeHandshake(_ context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{
		SDKVersion:         "test-sdk",
		CoreVersion:        "test-core",
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewHandlerServesOpenAPIJSON(t *testing.T) {
	handler, err := NewHandler(Dependencies{
		Logger: discardLogger(),
		Info:   openAPITestInfoService{},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest("GET", "/api/openapi.json", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("status = %d, want 200", response.Code)
	}

	var document map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &document); err != nil {
		t.Fatalf("unmarshal openapi: %v", err)
	}

	paths, ok := document["paths"].(map[string]any)
	if !ok {
		t.Fatalf("paths missing from document: %#v", document["paths"])
	}
	assertOpenAPIOperationID(t, paths, RouteGetServerMode, "get", "getServerMode")
	assertOpenAPIOperationID(t, paths, "/runtimeInfo", "get", "getRuntimeInfo")
	assertOpenAPIOperationID(t, paths, RouteSDKRuntimeHandshake, "get", "sdkRuntimeHandshake")
	assertOpenAPIStringEnumProperty(
		t,
		document,
		"HttpapiServerModeResponse",
		"mode",
		[]string{"ide", "share", "app", "launcher"},
	)
}

func TestMigratedRouteRegistrationsPopulateOpenAPIDocument(t *testing.T) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)

	if err := RegisterStatusRoutes(router, StatusRouteDependencies{
		ModePolicy:     modes.NewPolicy(config.ModeIDE),
		SettaHome:      "/setta-home",
		SettaFilesRoot: "/setta-files",
		RevealPath:     &pathreveal.Service{},
	}); err != nil {
		t.Fatalf("register status routes: %v", err)
	}
	if err := RegisterSettingsRoutes(router, SettingsRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeShare),
	}); err != nil {
		t.Fatalf("register settings routes: %v", err)
	}
	if err := RegisterDocstringRoutes(router, DocstringRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}); err != nil {
		t.Fatalf("register docstring routes: %v", err)
	}
	if err := RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		ProjectState: &projectstate.Runtime{},
		Statuses:     &agenticsummarycache.Service{},
	}); err != nil {
		t.Fatalf("register agentic summary cache routes: %v", err)
	}
	if err := RegisterMCPRoutes(router, MCPRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		LLMConfigPath: "/tmp/llm_config.json",
	}); err != nil {
		t.Fatalf("register mcp routes: %v", err)
	}
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       &auth.Service{},
		Intents:    &workspacelaunch.IntentService{},
		Launch:     &workspacelaunch.LocalLaunchService{},
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}
	if err := RegisterPluginRoutes(router, PluginRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    frontendHTTPOpenAPIPluginService{},
	}); err != nil {
		t.Fatalf("register plugin routes: %v", err)
	}

	getSettaHomeInfo := document.Paths[RouteGetSettaHomeInfo].Get
	if getSettaHomeInfo == nil {
		t.Fatalf("expected %s get operation", RouteGetSettaHomeInfo)
	}
	if getSettaHomeInfo.OperationID != "getSettaHomeInfo" {
		t.Fatalf("operation id = %q, want %q", getSettaHomeInfo.OperationID, "getSettaHomeInfo")
	}
	if got := getSettaHomeInfo.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("mode requirement = %#v, want %q", got, "ide")
	}

	saveSettings := document.Paths[RouteSaveSettings].Post
	if saveSettings == nil {
		t.Fatalf("expected %s post operation", RouteSaveSettings)
	}
	if saveSettings.RequestBody == nil {
		t.Fatalf("expected saveSettings request body to be documented")
	}
	saveSettingsSchema := saveSettings.Responses["200"].Content["application/json"].Schema
	if saveSettingsSchema.Type != "null" {
		t.Fatalf("saveSettings response schema type = %q, want %q", saveSettingsSchema.Type, "null")
	}

	loadSettings := document.Paths[RouteLoadSettings].Post
	if loadSettings == nil {
		t.Fatalf("expected %s post operation", RouteLoadSettings)
	}
	if loadSettings.RequestBody != nil {
		t.Fatalf("expected loadSettings request body to be omitted, got %#v", loadSettings.RequestBody)
	}

	workspaceLaunch := document.Paths[RouteLaunch].Post
	if workspaceLaunch == nil {
		t.Fatalf("expected %s post operation", RouteLaunch)
	}
	if workspaceLaunch.OperationID != "launchWorkspace" {
		t.Fatalf("workspace launch operation id = %q, want %q", workspaceLaunch.OperationID, "launchWorkspace")
	}

	mcpStatus := document.Paths[RouteMCPServerRuntimeStatus].Post
	if mcpStatus == nil {
		t.Fatalf("expected %s post operation", RouteMCPServerRuntimeStatus)
	}
	if got := mcpStatus.Extensions["x-setta-mode-requirement"]; got != "full-ide" {
		t.Fatalf("mcp mode requirement = %#v, want %q", got, "full-ide")
	}

	pluginsRuntime := document.Paths[RoutePluginsRuntime].Get
	if pluginsRuntime == nil {
		t.Fatalf("expected %s get operation", RoutePluginsRuntime)
	}
	if pluginsRuntime.OperationID != "getPluginsRuntime" {
		t.Fatalf("plugins runtime operation id = %q, want %q", pluginsRuntime.OperationID, "getPluginsRuntime")
	}

	pluginsRestart := document.Paths[RoutePluginsRestart].Post
	if pluginsRestart == nil {
		t.Fatalf("expected %s post operation", RoutePluginsRestart)
	}
	if pluginsRestart.OperationID != "restartPlugins" {
		t.Fatalf("plugins restart operation id = %q, want %q", pluginsRestart.OperationID, "restartPlugins")
	}
	if got := pluginsRestart.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("plugins restart mode requirement = %#v, want %q", got, "ide")
	}
}

func assertOpenAPIOperationID(
	t *testing.T,
	paths map[string]any,
	routePath string,
	method string,
	wantOperationID string,
) {
	t.Helper()

	pathEntry, ok := paths[routePath].(map[string]any)
	if !ok {
		t.Fatalf("path %s missing", routePath)
	}
	methodEntry, ok := pathEntry[method].(map[string]any)
	if !ok {
		t.Fatalf("%s %s missing", method, routePath)
	}
	if got, _ := methodEntry["operationId"].(string); got != wantOperationID {
		t.Fatalf("%s %s operationId = %q, want %q", method, routePath, got, wantOperationID)
	}
}

func assertOpenAPIStringEnumProperty(
	t *testing.T,
	document map[string]any,
	schemaName string,
	propertyName string,
	wantValues []string,
) {
	t.Helper()

	components, ok := document["components"].(map[string]any)
	if !ok {
		t.Fatalf("components missing from document: %#v", document["components"])
	}
	schemas, ok := components["schemas"].(map[string]any)
	if !ok {
		t.Fatalf("schemas missing from document: %#v", components["schemas"])
	}
	schema, ok := schemas[schemaName].(map[string]any)
	if !ok {
		t.Fatalf("schema %s missing from document", schemaName)
	}
	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("schema %s properties missing from document: %#v", schemaName, schema["properties"])
	}
	property, ok := properties[propertyName].(map[string]any)
	if !ok {
		t.Fatalf("schema %s property %s missing from document", schemaName, propertyName)
	}
	enumValues, ok := property["enum"].([]any)
	if !ok {
		t.Fatalf("schema %s property %s enum missing from document: %#v", schemaName, propertyName, property["enum"])
	}
	if len(enumValues) != len(wantValues) {
		t.Fatalf("schema %s property %s enum length = %d, want %d", schemaName, propertyName, len(enumValues), len(wantValues))
	}
	for index, want := range wantValues {
		got, _ := enumValues[index].(string)
		if got != want {
			t.Fatalf("schema %s property %s enum[%d] = %q, want %q", schemaName, propertyName, index, got, want)
		}
	}
}
