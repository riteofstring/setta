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
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/pathreveal"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
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
	if err := RegisterLLMRoutes(router, LLMRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Service:      &llmconfig.Service{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register llm routes: %v", err)
	}
	if err := RegisterEngineConfigRoutes(router, EngineConfigRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Engines:      &agentruns.EngineStore{},
		LLM:          &llmconfig.Runtime{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register engine config routes: %v", err)
	}
	if err := RegisterAgentProfileRoutes(router, AgentProfileRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Profiles:     &agentprofiles.Store{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register agent profile routes: %v", err)
	}
	if err := RegisterPromptTemplateRoutes(router, PromptTemplateRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Templates:    &prompttemplates.Store{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register prompt template routes: %v", err)
	}
	if err := RegisterExternalAgentConfigRoutes(router, ExternalAgentConfigRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Configs:      &externalagentconfigs.Service{},
		Preflight:    frontendHTTPOpenAPIExternalAgentChecker{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register external agent config routes: %v", err)
	}
	if err := RegisterTranscriptionProfileRoutes(router, TranscriptionProfileRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Profiles:     &transcriptionprofiles.Service{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		t.Fatalf("register transcription profile routes: %v", err)
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
	if err := RegisterFileBrowserRoutes(router, FileBrowserRouteDependencies{
		ModePolicy:     modes.NewPolicy(config.ModeIDE),
		DeploymentRoot: "/deployment",
		Browser:        frontendHTTPOpenAPIFileBrowserService{},
	}); err != nil {
		t.Fatalf("register file browser routes: %v", err)
	}
	if err := RegisterPluginRoutes(router, PluginRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    frontendHTTPOpenAPIPluginService{},
	}); err != nil {
		t.Fatalf("register plugin routes: %v", err)
	}
	if err := RegisterBinaryRoutes(router, BinaryRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Store:      &binarypayload.Store{},
	}); err != nil {
		t.Fatalf("register binary routes: %v", err)
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

	getLlmConfig := document.Paths[RouteLLMConfig].Get
	if getLlmConfig == nil {
		t.Fatalf("expected %s get operation", RouteLLMConfig)
	}
	if getLlmConfig.OperationID != "getLlmConfig" {
		t.Fatalf("llm config operation id = %q, want %q", getLlmConfig.OperationID, "getLlmConfig")
	}
	if got := getLlmConfig.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("llm config mode requirement = %#v, want %q", got, "ide")
	}

	getLlmAPIKeys := document.Paths[RouteLLMAPIKeys].Get
	if getLlmAPIKeys == nil {
		t.Fatalf("expected %s get operation", RouteLLMAPIKeys)
	}
	if getLlmAPIKeys.OperationID != "getLlmApiKeys" {
		t.Fatalf("llm api keys operation id = %q, want %q", getLlmAPIKeys.OperationID, "getLlmApiKeys")
	}

	getEngineConfigs := document.Paths[RouteGetEngineConfigs].Get
	if getEngineConfigs == nil {
		t.Fatalf("expected %s get operation", RouteGetEngineConfigs)
	}
	if getEngineConfigs.OperationID != "getEngineConfigs" {
		t.Fatalf("engine configs operation id = %q, want %q", getEngineConfigs.OperationID, "getEngineConfigs")
	}

	getAgentProfiles := document.Paths[RouteGetAgentProfiles].Get
	if getAgentProfiles == nil {
		t.Fatalf("expected %s get operation", RouteGetAgentProfiles)
	}
	if got := getAgentProfiles.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("agent profiles mode requirement = %#v, want %q", got, "not-launcher")
	}

	getPromptTemplates := document.Paths[RouteGetPromptTemplates].Get
	if getPromptTemplates == nil {
		t.Fatalf("expected %s get operation", RouteGetPromptTemplates)
	}
	if got := getPromptTemplates.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("prompt templates mode requirement = %#v, want %q", got, "not-launcher")
	}

	getExternalAgentHealth := document.Paths[RouteGetExternalAgentHealth].Get
	if getExternalAgentHealth == nil {
		t.Fatalf("expected %s get operation", RouteGetExternalAgentHealth)
	}
	if getExternalAgentHealth.OperationID != "getExternalAgentHealth" {
		t.Fatalf("external agent health operation id = %q, want %q", getExternalAgentHealth.OperationID, "getExternalAgentHealth")
	}
	if got := getExternalAgentHealth.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("external agent health mode requirement = %#v, want %q", got, "not-launcher")
	}

	createTranscriptionProfile := document.Paths[RouteCreateTranscriptionProfile].Post
	if createTranscriptionProfile == nil {
		t.Fatalf("expected %s post operation", RouteCreateTranscriptionProfile)
	}
	if createTranscriptionProfile.OperationID != "createTranscriptionProfile" {
		t.Fatalf("transcription profile create operation id = %q, want %q", createTranscriptionProfile.OperationID, "createTranscriptionProfile")
	}
	if got := createTranscriptionProfile.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("transcription profile create mode requirement = %#v, want %q", got, "ide")
	}

	workspaceLaunch := document.Paths[RouteLaunch].Post
	if workspaceLaunch == nil {
		t.Fatalf("expected %s post operation", RouteLaunch)
	}
	if workspaceLaunch.OperationID != "launchWorkspace" {
		t.Fatalf("workspace launch operation id = %q, want %q", workspaceLaunch.OperationID, "launchWorkspace")
	}

	createFile := document.Paths[RouteCreateFile].Post
	if createFile == nil {
		t.Fatalf("expected %s post operation", RouteCreateFile)
	}
	if createFile.OperationID != "createFile" {
		t.Fatalf("create file operation id = %q, want %q", createFile.OperationID, "createFile")
	}
	if got := createFile.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("create file mode requirement = %#v, want %q", got, "ide")
	}
	createFileResponse := createFile.Responses["200"]
	if createFileResponse == nil {
		t.Fatalf("expected createFile success response")
	}
	createFileJSON := createFileResponse.Content["application/json"]
	if createFileJSON == nil || createFileJSON.Schema == nil || createFileJSON.Schema.Type != "null" {
		t.Fatalf("createFile response schema = %#v, want json null", createFileJSON)
	}

	getFileBrowserRoot := document.Paths[RouteGetFileBrowserRoot].Post
	if getFileBrowserRoot == nil {
		t.Fatalf("expected %s post operation", RouteGetFileBrowserRoot)
	}
	if getFileBrowserRoot.OperationID != "getFileBrowserRoot" {
		t.Fatalf("file browser root operation id = %q, want %q", getFileBrowserRoot.OperationID, "getFileBrowserRoot")
	}
	if getFileBrowserRoot.RequestBody != nil {
		t.Fatalf("expected getFileBrowserRoot request body to be omitted, got %#v", getFileBrowserRoot.RequestBody)
	}

	getFileBrowserDownloadURLs := document.Paths[RouteGetFileBrowserDownloadURL].Post
	if getFileBrowserDownloadURLs == nil {
		t.Fatalf("expected %s post operation", RouteGetFileBrowserDownloadURL)
	}
	if getFileBrowserDownloadURLs.OperationID != "getFileBrowserDownloadUrls" {
		t.Fatalf("download url operation id = %q, want %q", getFileBrowserDownloadURLs.OperationID, "getFileBrowserDownloadUrls")
	}
	if got := getFileBrowserDownloadURLs.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("download url mode requirement = %#v, want %q", got, "not-launcher")
	}

	fileBrowserDownload := document.Paths[RouteFileBrowserDownload].Get
	if fileBrowserDownload == nil {
		t.Fatalf("expected %s get operation", RouteFileBrowserDownload)
	}
	if fileBrowserDownload.OperationID != "downloadFileBrowserEntry" {
		t.Fatalf("file browser download operation id = %q, want %q", fileBrowserDownload.OperationID, "downloadFileBrowserEntry")
	}
	if len(fileBrowserDownload.Parameters) != 1 || fileBrowserDownload.Parameters[0].Name != "token" {
		t.Fatalf("file browser download params = %#v, want token path param", fileBrowserDownload.Parameters)
	}
	fileBrowserDownloadResponse := fileBrowserDownload.Responses["200"]
	if fileBrowserDownloadResponse == nil {
		t.Fatalf("expected file browser download success response")
	}
	fileBrowserDownloadContent := fileBrowserDownloadResponse.Content["application/octet-stream"]
	if fileBrowserDownloadContent == nil || fileBrowserDownloadContent.Schema == nil || fileBrowserDownloadContent.Schema.Format != "binary" {
		t.Fatalf("file browser download response schema = %#v, want binary octet-stream", fileBrowserDownloadContent)
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

	binaryUpload := document.Paths[RouteBinaryUpload].Post
	if binaryUpload == nil {
		t.Fatalf("expected %s post operation", RouteBinaryUpload)
	}
	if binaryUpload.OperationID != "uploadBinary" {
		t.Fatalf("binary upload operation id = %q, want %q", binaryUpload.OperationID, "uploadBinary")
	}
	uploadBody := binaryUpload.RequestBody
	if uploadBody == nil {
		t.Fatalf("expected binary upload request body to be documented")
	}
	uploadContent := uploadBody.Content["multipart/form-data"]
	if uploadContent == nil {
		t.Fatalf("expected binary upload multipart request content, got %#v", uploadBody.Content)
	}
	if uploadContent.Schema == nil {
		t.Fatalf("expected binary upload schema, got %#v", uploadContent.Schema)
	}
	uploadSchema := uploadContent.Schema
	if uploadSchema.Ref != "#/components/schemas/HttpapiBinaryUploadFormRequest" {
		t.Fatalf("binary upload schema ref = %q, want %q", uploadSchema.Ref, "#/components/schemas/HttpapiBinaryUploadFormRequest")
	}
	uploadSchema = document.Components.Schemas.SchemaFromRef(uploadSchema.Ref)
	if uploadSchema == nil || uploadSchema.Properties["file"] == nil {
		t.Fatalf("expected binary upload component schema, got %#v", uploadSchema)
	}
	if got := uploadSchema.Properties["file"].Format; got != "binary" {
		t.Fatalf("binary upload file schema format = %q, want %q", got, "binary")
	}
	if got := binaryUpload.Extensions["x-setta-mode-requirement"]; got != "full-ide" {
		t.Fatalf("binary upload mode requirement = %#v, want %q", got, "full-ide")
	}

	binaryDownload := document.Paths[RouteBinaryDownload].Get
	if binaryDownload == nil {
		t.Fatalf("expected %s get operation", RouteBinaryDownload)
	}
	if binaryDownload.OperationID != "downloadBinary" {
		t.Fatalf("binary download operation id = %q, want %q", binaryDownload.OperationID, "downloadBinary")
	}
	downloadResponse := binaryDownload.Responses["200"]
	if downloadResponse == nil {
		t.Fatalf("expected binary download success response")
	}
	downloadContent := downloadResponse.Content["application/octet-stream"]
	if downloadContent == nil {
		t.Fatalf("expected binary download octet-stream response content, got %#v", downloadResponse.Content)
	}
	if downloadContent.Schema == nil || downloadContent.Schema.Format != "binary" {
		t.Fatalf("binary download response schema = %#v, want binary format", downloadContent.Schema)
	}
	if got := binaryDownload.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("binary download mode requirement = %#v, want %q", got, "not-launcher")
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
