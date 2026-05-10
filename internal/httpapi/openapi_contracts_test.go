package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/chatattachments"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/runs"
	"setta/internal/terminals"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewHandlerServesOpenAPIJSON(t *testing.T) {
	handler, err := NewHandler(Dependencies{
		Logger: discardLogger(),
		Info:   NewConfigInfoService(config.Config{Server: config.Server{Mode: config.ModeIDE}}, ""),
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

func TestNewHandlerServesRootAndAPIRoutesInOpenAPIJSON(t *testing.T) {
	handler, err := NewHandler(Dependencies{
		Logger: discardLogger(),
		Info:   NewConfigInfoService(config.Config{Server: config.Server{Mode: config.ModeIDE}}, ""),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterAttachmentRootRoutes(r, AttachmentRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Service:    &chatattachments.Service{},
			}); err != nil {
				t.Fatalf("register attachment root routes: %v", err)
			}
		},
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  &terminals.Service{},
				RunCode:    &runs.Service{},
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
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
	assertOpenAPIOperationID(t, paths, RouteAttachmentDownload, "get", "downloadAttachment")
	assertOpenAPIOperationID(t, paths, RouteRunCode, "post", "runCode")
}

func TestMigratedRouteRegistrationsPopulateOpenAPIDocument(t *testing.T) {
	document := buildMigratedRouteOpenAPIDocument(t)

	assertOpenAPIOperationContracts(t, document, migratedRouteOperationContracts())
	assertBinaryUploadOpenAPIContract(t, document)
}

type openAPIMethod string

const (
	openAPIGet  openAPIMethod = "get"
	openAPIPost openAPIMethod = "post"
)

type openAPIRequestBodyExpectation int

const (
	openAPIRequestBodyAny openAPIRequestBodyExpectation = iota
	openAPIRequestBodyPresent
	openAPIRequestBodyOmitted
)

type openAPIParameterContract struct {
	name     string
	location string
	required bool
}

type openAPIOperationContract struct {
	route             string
	method            openAPIMethod
	operationID       string
	modeRequirement   string
	requestBody       openAPIRequestBodyExpectation
	jsonResponseType  string
	binaryContentType string
	parameters        []openAPIParameterContract
	parameterCount    *int
}

func buildMigratedRouteOpenAPIDocument(t *testing.T) *huma.OpenAPI {
	t.Helper()

	document, err := BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildContributedRouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend http openapi document: %v", err)
	}
	return document
}

func migratedRouteOperationContracts() []openAPIOperationContract {
	return []openAPIOperationContract{
		{route: RouteGetSettaHomeInfo, method: openAPIGet, operationID: "getSettaHomeInfo", modeRequirement: "ide"},
		{route: RouteRevealPathInOSFileExplorer, method: openAPIPost, operationID: "revealPathInOsFileExplorer", modeRequirement: "ide"},
		{route: RouteSaveSettings, method: openAPIPost, requestBody: openAPIRequestBodyPresent, jsonResponseType: "null"},
		{route: RouteLoadSettings, method: openAPIPost, requestBody: openAPIRequestBodyOmitted},
		{route: RouteSetLanguageServerSelection, method: openAPIPost, requestBody: openAPIRequestBodyPresent, jsonResponseType: "null"},
		{route: RouteLLMConfig, method: openAPIGet, operationID: "getLlmConfig", modeRequirement: "ide"},
		{route: RouteLLMAPIKeys, method: openAPIGet, operationID: "getLlmApiKeys"},
		{route: RouteGetEngineConfigs, method: openAPIGet, operationID: "getEngineConfigs"},
		{route: RouteGetAgentProfiles, method: openAPIGet, modeRequirement: "not-launcher"},
		{route: RouteGetPromptTemplates, method: openAPIGet, modeRequirement: "not-launcher"},
		{route: RouteGetExternalAgentHealth, method: openAPIGet, operationID: "getExternalAgentHealth", modeRequirement: "not-launcher"},
		{route: RouteCreateTranscriptionProfile, method: openAPIPost, operationID: "createTranscriptionProfile", modeRequirement: "ide"},
		{route: RouteLaunch, method: openAPIPost, operationID: "launchWorkspace"},
		{route: RouteCreateWorkspaceLaunchIntent, method: openAPIPost, operationID: "createWorkspaceLaunchIntent"},
		{route: RouteCreateFile, method: openAPIPost, operationID: "createFile", modeRequirement: "ide", jsonResponseType: "null"},
		{route: RouteGetFileBrowserRoot, method: openAPIPost, operationID: "getFileBrowserRoot", requestBody: openAPIRequestBodyOmitted},
		{route: RouteGetLatestLSPDiagnostics, method: openAPIPost, operationID: "getLatestLspDiagnostics", modeRequirement: "not-deployment-and-not-launcher"},
		{route: RouteRestartLanguageServer, method: openAPIPost, operationID: "restartLanguageServer", requestBody: openAPIRequestBodyOmitted},
		{route: RouteGetFileBrowserDownloadURL, method: openAPIPost, operationID: "getFileBrowserDownloadUrls", modeRequirement: "not-launcher"},
		{route: RouteFileBrowserDownload, method: openAPIGet, operationID: "downloadFileBrowserEntry", binaryContentType: "application/octet-stream", parameterCount: openAPIIntPtr(1), parameters: []openAPIParameterContract{{name: "token", location: "path", required: true}}},
		{route: RouteMCPServerRuntimeStatus, method: openAPIPost, modeRequirement: "full-ide"},
		{route: testContributedProjectRoutePath, method: openAPIGet, operationID: testContributedProjectOperationID},
		{route: testContributedDeploymentRoutePath, method: openAPIPost, operationID: testContributedDeploymentOperation},
		{route: RouteGetGitStatus, method: openAPIPost, operationID: "getGitStatus", requestBody: openAPIRequestBodyOmitted},
		{route: RouteGetListenerCoverage, method: openAPIPost, operationID: "getListenerCoverage", modeRequirement: "not-launcher"},
		{route: RouteGetAgentRuns, method: openAPIGet, operationID: "getAgentRuns", modeRequirement: "ide"},
		{route: RouteImportFilesToArtifacts, method: openAPIPost, operationID: "importFilesToArtifacts", modeRequirement: "full-ide"},
		{route: RouteLoadCachedImageArtifacts, method: openAPIPost, operationID: "loadCachedImageArtifacts", modeRequirement: "not-launcher"},
		{route: RouteUpdateArtifacts, method: openAPIPost, operationID: "updateArtifacts", modeRequirement: "not-launcher"},
		{route: RouteRunDetached, method: openAPIPost, operationID: "runDetached", modeRequirement: "not-launcher"},
		{route: RouteGetRunnerSummary, method: openAPIPost, operationID: "getRunnerSummary", modeRequirement: "ide"},
		{route: RouteGetStateMachineRun, method: openAPIPost, operationID: "getStateMachineRun", modeRequirement: "not-launcher"},
		{route: RoutePluginsRuntime, method: openAPIGet, operationID: "getPluginsRuntime"},
		{route: RoutePluginsRestart, method: openAPIPost, operationID: "restartPlugins", modeRequirement: "ide"},
		{route: RouteBinaryDownload, method: openAPIGet, operationID: "downloadBinary", modeRequirement: "not-launcher", binaryContentType: "application/octet-stream"},
		{route: RouteGetAttachmentDownloadURL, method: openAPIPost, operationID: "getAttachmentDownloadUrl", modeRequirement: "not-launcher"},
		{route: RouteGetAttachmentDownloadURLs, method: openAPIPost, operationID: "getAttachmentDownloadUrls"},
		{route: RouteAttachmentDownload, method: openAPIGet, operationID: "downloadAttachment", binaryContentType: "application/octet-stream", parameters: []openAPIParameterContract{{name: "token", location: "path", required: true}}},
		{route: RouteDeleteTerminals, method: openAPIPost, operationID: "deleteTerminals", modeRequirement: "not-launcher", jsonResponseType: "null"},
		{route: RouteInterruptTerminalProcesses, method: openAPIPost, operationID: "interruptTerminalProcesses"},
		{route: RouteRunCode, method: openAPIPost, operationID: "runCode", modeRequirement: "not-launcher"},
		{route: RouteGetLLMResponse, method: openAPIPost, operationID: "getLlmResponse", modeRequirement: "not-launcher", jsonResponseType: "string"},
		{route: RouteGetAIFollowSnapshot, method: openAPIPost, operationID: "getAIFollowSnapshot", modeRequirement: "not-launcher"},
		{route: RouteStartTranscriptionSession, method: openAPIPost, operationID: "startTranscriptionSession", requestBody: openAPIRequestBodyPresent},
		{route: RouteRespondExternalAgentApproval, method: openAPIPost, operationID: "respondExternalAgentApproval", jsonResponseType: "null"},
		{route: RouteLoadAllProjectMetadata, method: openAPIPost, operationID: "loadAllProjectMetadata", modeRequirement: "ide", requestBody: openAPIRequestBodyOmitted},
		{route: RouteLoadProjectConfig, method: openAPIPost, operationID: "loadProjectConfig"},
		{route: RouteGetNotifications, method: openAPIPost, operationID: "getNotifications"},
		{route: RouteGetLauncherStatus, method: openAPIGet, operationID: "getLauncherStatus", modeRequirement: "ide", parameters: []openAPIParameterContract{{name: "setta_home", location: "query", required: false}}},
		{route: RouteGetLauncherRecentWorkspaces, method: openAPIGet, operationID: "getLauncherRecentWorkspaces", modeRequirement: "launcher", parameters: []openAPIParameterContract{{name: "setta_home", location: "query", required: false}}},
		{route: RouteShareDeployments, method: openAPIGet, operationID: "listShareDeployments", modeRequirement: "ide"},
		{route: RouteShareDeploymentState, method: openAPIGet, operationID: "getShareDeploymentState", modeRequirement: "share", parameterCount: openAPIIntPtr(2)},
	}
}

func assertOpenAPIOperationContracts(
	t *testing.T,
	document *huma.OpenAPI,
	contracts []openAPIOperationContract,
) {
	t.Helper()

	for _, contract := range contracts {
		operation := requireOpenAPIOperation(t, document, contract.route, contract.method)
		assertOpenAPIOperationContract(t, operation, contract)
	}
}

func requireOpenAPIOperation(
	t *testing.T,
	document *huma.OpenAPI,
	route string,
	method openAPIMethod,
) *huma.Operation {
	t.Helper()

	path := document.Paths[route]
	if path == nil {
		t.Fatalf("expected %s path", route)
	}
	operation := operationForMethod(path, method)
	if operation == nil {
		t.Fatalf("expected %s %s operation", route, method)
	}
	return operation
}

func operationForMethod(path *huma.PathItem, method openAPIMethod) *huma.Operation {
	switch method {
	case openAPIGet:
		return path.Get
	case openAPIPost:
		return path.Post
	default:
		return nil
	}
}

func assertOpenAPIOperationContract(
	t *testing.T,
	operation *huma.Operation,
	contract openAPIOperationContract,
) {
	t.Helper()

	if contract.operationID != "" && operation.OperationID != contract.operationID {
		t.Fatalf("%s operation id = %q, want %q", contract.route, operation.OperationID, contract.operationID)
	}
	if contract.modeRequirement != "" {
		assertOpenAPIModeRequirement(t, operation, contract.route, contract.modeRequirement)
	}
	assertOpenAPIRequestBody(t, operation, contract.route, contract.requestBody)
	if contract.jsonResponseType != "" {
		assertOpenAPIJSONResponseType(t, operation, contract.route, contract.jsonResponseType)
	}
	if contract.binaryContentType != "" {
		assertOpenAPIBinaryResponse(t, operation, contract.route, contract.binaryContentType)
	}
	if contract.parameterCount != nil && len(operation.Parameters) != *contract.parameterCount {
		t.Fatalf("%s params = %#v, want %d params", contract.route, operation.Parameters, *contract.parameterCount)
	}
	for _, parameter := range contract.parameters {
		assertOpenAPIParameter(t, operation.Parameters, parameter.name, parameter.location, parameter.required)
	}
}

func assertOpenAPIModeRequirement(
	t *testing.T,
	operation *huma.Operation,
	route string,
	want string,
) {
	t.Helper()

	if got := operation.Extensions["x-setta-mode-requirement"]; got != want {
		t.Fatalf("%s mode requirement = %#v, want %q", route, got, want)
	}
}

func assertOpenAPIRequestBody(
	t *testing.T,
	operation *huma.Operation,
	route string,
	expectation openAPIRequestBodyExpectation,
) {
	t.Helper()

	switch expectation {
	case openAPIRequestBodyAny:
		return
	case openAPIRequestBodyPresent:
		if operation.RequestBody == nil {
			t.Fatalf("expected %s request body to be documented", route)
		}
	case openAPIRequestBodyOmitted:
		if operation.RequestBody != nil {
			t.Fatalf("expected %s request body to be omitted, got %#v", route, operation.RequestBody)
		}
	}
}

func assertOpenAPIJSONResponseType(
	t *testing.T,
	operation *huma.Operation,
	route string,
	wantType string,
) {
	t.Helper()

	content := requireOpenAPIResponseContent(t, operation, route, "application/json")
	if content.Schema == nil || content.Schema.Type != wantType {
		t.Fatalf("%s response schema = %#v, want json %s", route, content, wantType)
	}
}

func assertOpenAPIBinaryResponse(
	t *testing.T,
	operation *huma.Operation,
	route string,
	contentType string,
) {
	t.Helper()

	content := requireOpenAPIResponseContent(t, operation, route, contentType)
	if content.Schema == nil || content.Schema.Format != "binary" {
		t.Fatalf("%s response schema = %#v, want binary %s", route, content.Schema, contentType)
	}
}

func requireOpenAPIResponseContent(
	t *testing.T,
	operation *huma.Operation,
	route string,
	contentType string,
) *huma.MediaType {
	t.Helper()

	response := operation.Responses["200"]
	if response == nil {
		t.Fatalf("expected %s success response", route)
	}
	content := response.Content[contentType]
	if content == nil {
		t.Fatalf("expected %s response content %s, got %#v", route, contentType, response.Content)
	}
	return content
}

func assertBinaryUploadOpenAPIContract(t *testing.T, document *huma.OpenAPI) {
	t.Helper()

	binaryUpload := requireOpenAPIOperation(t, document, RouteBinaryUpload, openAPIPost)
	if binaryUpload.OperationID != "uploadBinary" {
		t.Fatalf("binary upload operation id = %q, want %q", binaryUpload.OperationID, "uploadBinary")
	}
	assertOpenAPIModeRequirement(t, binaryUpload, RouteBinaryUpload, "full-ide")
	uploadBody := binaryUpload.RequestBody
	if uploadBody == nil {
		t.Fatalf("expected binary upload request body to be documented")
	}
	uploadContent := uploadBody.Content["multipart/form-data"]
	if uploadContent == nil || uploadContent.Schema == nil {
		t.Fatalf("expected binary upload multipart schema, got %#v", uploadBody.Content)
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
}

func openAPIIntPtr(value int) *int {
	return &value
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesProjectRoutes(t *testing.T) {
	document, err := BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(nil)
	if err != nil {
		t.Fatalf("build frontend http openapi document: %v", err)
	}

	getLatestProjectState := document.Paths[RouteGetLatestProjectState].Post
	if getLatestProjectState == nil {
		t.Fatalf("expected %s post operation", RouteGetLatestProjectState)
	}
	if getLatestProjectState.OperationID != "getLatestProjectState" {
		t.Fatalf("latest project state operation id = %q, want %q", getLatestProjectState.OperationID, "getLatestProjectState")
	}

	setProjectConfigCodegenTargets := document.Paths[RouteSetProjectConfigCodegenTargets].Post
	if setProjectConfigCodegenTargets == nil {
		t.Fatalf("expected %s post operation", RouteSetProjectConfigCodegenTargets)
	}
	if setProjectConfigCodegenTargets.OperationID != "setProjectConfigCodegenTargets" {
		t.Fatalf(
			"set project config codegen targets operation id = %q, want %q",
			setProjectConfigCodegenTargets.OperationID,
			"setProjectConfigCodegenTargets",
		)
	}

	createWindowSpace := document.Paths[RouteCreateWindowSpace].Post
	if createWindowSpace == nil {
		t.Fatalf("expected %s post operation", RouteCreateWindowSpace)
	}
	if createWindowSpace.OperationID != "createWindowSpace" {
		t.Fatalf("create window space operation id = %q, want %q", createWindowSpace.OperationID, "createWindowSpace")
	}

	assertOpenAPISchemaRequiredProperties(
		t,
		document,
		"#/components/schemas/ProjectstateChartSettingsUpdate",
		[]string{"type"},
		[]string{
			"xAxisColumn",
			"secondYAxisColumns",
			"categoryColumn",
			"xAxisLog",
			"y1AxisLog",
			"y2AxisLog",
			"yAxisLog",
		},
	)
}

func TestSettaOpenAPISchemaNameUsesPluginOwnedAppschemaPrefixes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		typ  reflect.Type
		want string
	}{
		{
			typ:  reflect.TypeOf(appspec.AppCapabilities{}),
			want: "AppsubsystemAppspecAppCapabilities",
		},
		{
			typ:  reflect.TypeOf(appspec.AppValidationIssue{}),
			want: "AppsubsystemAppspecAppValidationIssue",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			if got := settaOpenAPISchemaName(tc.typ, ""); got != tc.want {
				t.Fatalf("settaOpenAPISchemaName(%v) = %q, want %q", tc.typ, got, tc.want)
			}
		})
	}
}

func TestDocumentOnlyOpenAPIRouterRegistersProjectRoutesWithoutRuntimeDependencies(t *testing.T) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)

	if err := RegisterProjectRoutes(router, ProjectRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}); err != nil {
		t.Fatalf("register project routes with document-only openapi router: %v", err)
	}

	setCode := document.Paths[RouteSetCode].Post
	if setCode == nil {
		t.Fatalf("expected %s post operation", RouteSetCode)
	}
	if setCode.OperationID != "setCode" {
		t.Fatalf("set code operation id = %q, want %q", setCode.OperationID, "setCode")
	}

	acceptRenameRefactor := document.Paths[RouteAcceptRenameRefactor].Post
	if acceptRenameRefactor == nil {
		t.Fatalf("expected %s post operation", RouteAcceptRenameRefactor)
	}
	if acceptRenameRefactor.OperationID != "acceptRenameRefactor" {
		t.Fatalf(
			"accept rename refactor operation id = %q, want %q",
			acceptRenameRefactor.OperationID,
			"acceptRenameRefactor",
		)
	}
}

func TestRuntimeOpenAPIRouterStillRequiresProjectRouteDependencies(t *testing.T) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)

	err := RegisterProjectRoutes(router, ProjectRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	})
	if err == nil {
		t.Fatal("expected ide project route dependency validation error")
	}
	if got := err.Error(); got != "workspace root is required in ide mode" {
		t.Fatalf("register project routes error = %q, want %q", got, "workspace root is required in ide mode")
	}
}

func TestDocumentOnlyOpenAPIRouterRegistersLauncherManagementRoutesWithoutRuntimeDependencies(t *testing.T) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)

	if err := RegisterLauncherManagementRoutes(router, LauncherManagementRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}); err != nil {
		t.Fatalf("register launcher management routes with document-only openapi router: %v", err)
	}

	getLauncherStatus := document.Paths[RouteGetLauncherStatus].Get
	if getLauncherStatus == nil {
		t.Fatalf("expected %s get operation", RouteGetLauncherStatus)
	}
	if getLauncherStatus.OperationID != "getLauncherStatus" {
		t.Fatalf("get launcher status operation id = %q, want %q", getLauncherStatus.OperationID, "getLauncherStatus")
	}

	updateLauncher := document.Paths[RouteUpdateLauncher].Post
	if updateLauncher == nil {
		t.Fatalf("expected %s post operation", RouteUpdateLauncher)
	}
	if updateLauncher.OperationID != "updateLauncher" {
		t.Fatalf("update launcher operation id = %q, want %q", updateLauncher.OperationID, "updateLauncher")
	}
}

func TestRuntimeOpenAPIRouterStillRequiresLauncherManagementDependencies(t *testing.T) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)

	err := RegisterLauncherManagementRoutes(router, LauncherManagementRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	})
	if err == nil {
		t.Fatal("expected launcher management dependency validation error")
	}
	if got := err.Error(); got != "default setta home is required in ide mode" {
		t.Fatalf("register launcher management routes error = %q, want %q", got, "default setta home is required in ide mode")
	}
}

func TestDocumentOnlyOpenAPIRouterRegistersSelectedRoutesWithoutRuntimeDependencies(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name            string
		register        func(chi.Router) error
		routePath       string
		operation       func(*huma.PathItem) *huma.Operation
		wantOperationID string
	}{
		{
			name: "agent profile",
			register: func(router chi.Router) error {
				return RegisterAgentProfileRoutes(router, AgentProfileRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetAgentProfiles,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getAgentProfiles",
		},
		{
			name: "prompt template",
			register: func(router chi.Router) error {
				return RegisterPromptTemplateRoutes(router, PromptTemplateRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetPromptTemplates,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getPromptTemplates",
		},
		{
			name: "app gen skill",
			register: func(router chi.Router) error {
				return RegisterAppGenSkillRoutes(router, AppGenSkillRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetAppGenSkills,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getAppGenSkills",
		},
		{
			name: "external agent config",
			register: func(router chi.Router) error {
				return RegisterExternalAgentConfigRoutes(router, ExternalAgentConfigRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetExternalAgentHealth,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getExternalAgentHealth",
		},
		{
			name: "engine config",
			register: func(router chi.Router) error {
				return RegisterEngineConfigRoutes(router, EngineConfigRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetEngineConfigs,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getEngineConfigs",
		},
		{
			name: "transcription profile",
			register: func(router chi.Router) error {
				return RegisterTranscriptionProfileRoutes(router, TranscriptionProfileRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteCreateTranscriptionProfile,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Post },
			wantOperationID: "createTranscriptionProfile",
		},
		{
			name: "llm",
			register: func(router chi.Router) error {
				return RegisterLLMRoutes(router, LLMRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteLLMConfig,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getLlmConfig",
		},
		{
			name: "agentic summary cache",
			register: func(router chi.Router) error {
				return RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetAgenticSummaryCacheStatus,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Post },
			wantOperationID: "getAgenticSummaryCacheStatus",
		},
		{
			name: "agent run",
			register: func(router chi.Router) error {
				return RegisterAgentRunRoutes(router, AgentRunRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteGetAgentRuns,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Get },
			wantOperationID: "getAgentRuns",
		},
		{
			name: "state machine",
			register: func(router chi.Router) error {
				return RegisterStateMachineRunRoutes(router, StateMachineRunRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			routePath:       RouteStartStateMachineRun,
			operation:       func(item *huma.PathItem) *huma.Operation { return item.Post },
			wantOperationID: "startStateMachineRun",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			document := newOpenAPIDocument()
			router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
			if err := tc.register(router); err != nil {
				t.Fatalf("register %s routes with document-only openapi router: %v", tc.name, err)
			}

			pathItem := document.Paths[tc.routePath]
			if pathItem == nil {
				t.Fatalf("expected documented path %s", tc.routePath)
			}
			operation := tc.operation(pathItem)
			if operation == nil {
				t.Fatalf("expected documented operation for %s", tc.routePath)
			}
			if operation.OperationID != tc.wantOperationID {
				t.Fatalf("%s operation id = %q, want %q", tc.routePath, operation.OperationID, tc.wantOperationID)
			}
		})
	}
}

func TestRuntimeOpenAPIRouterStillRequiresSelectedRouteDependencies(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		register  func(chi.Router) error
		wantError string
	}{
		{
			name: "agent profile",
			register: func(router chi.Router) error {
				return RegisterAgentProfileRoutes(router, AgentProfileRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "agent profile store is required",
		},
		{
			name: "prompt template",
			register: func(router chi.Router) error {
				return RegisterPromptTemplateRoutes(router, PromptTemplateRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "prompt template store is required",
		},
		{
			name: "app gen skill",
			register: func(router chi.Router) error {
				return RegisterAppGenSkillRoutes(router, AppGenSkillRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "app gen skill service is required in ide mode",
		},
		{
			name: "external agent config",
			register: func(router chi.Router) error {
				return RegisterExternalAgentConfigRoutes(router, ExternalAgentConfigRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "external agent config service is required in ide mode",
		},
		{
			name: "engine config",
			register: func(router chi.Router) error {
				return RegisterEngineConfigRoutes(router, EngineConfigRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "engine config store is required in ide mode",
		},
		{
			name: "transcription profile",
			register: func(router chi.Router) error {
				return RegisterTranscriptionProfileRoutes(router, TranscriptionProfileRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "transcription profile service is required in ide mode",
		},
		{
			name: "llm",
			register: func(router chi.Router) error {
				return RegisterLLMRoutes(router, LLMRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "llm config service is required in ide mode",
		},
		{
			name: "agentic summary cache",
			register: func(router chi.Router) error {
				return RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "project state runtime is required in ide mode",
		},
		{
			name: "agent run",
			register: func(router chi.Router) error {
				return RegisterAgentRunRoutes(router, AgentRunRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "agent profile store is required in ide mode",
		},
		{
			name: "state machine",
			register: func(router chi.Router) error {
				return RegisterStateMachineRunRoutes(router, StateMachineRunRouteDependencies{
					ModePolicy: modes.NewPolicy(config.ModeIDE),
				})
			},
			wantError: "state machine runtime is required in ide mode",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			document := newOpenAPIDocument()
			router := wrapRouterWithOpenAPI(chi.NewRouter(), document)
			err := tc.register(router)
			if err == nil {
				t.Fatalf("expected %s dependency validation error", tc.name)
			}
			if got := err.Error(); got != tc.wantError {
				t.Fatalf("%s error = %q, want %q", tc.name, got, tc.wantError)
			}
		})
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

func assertOpenAPIParameter(
	t *testing.T,
	parameters []*huma.Param,
	name string,
	location string,
	required bool,
) {
	t.Helper()

	for _, parameter := range parameters {
		if parameter != nil && parameter.Name == name && parameter.In == location {
			if parameter.Required != required {
				t.Fatalf("parameter %s %s required = %v, want %v", location, name, parameter.Required, required)
			}
			return
		}
	}
	t.Fatalf("missing %s parameter %q in %#v", location, name, parameters)
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

func assertOpenAPISchemaRequiredProperties(
	t *testing.T,
	document *huma.OpenAPI,
	schemaRef string,
	wantRequired []string,
	wantOptional []string,
) {
	t.Helper()

	schema := document.Components.Schemas.SchemaFromRef(schemaRef)
	if schema == nil {
		t.Fatalf("schema %s missing from document", schemaRef)
	}

	required := make(map[string]struct{}, len(schema.Required))
	for _, name := range schema.Required {
		required[name] = struct{}{}
	}

	for _, name := range wantRequired {
		if _, ok := required[name]; !ok {
			t.Fatalf("schema %s required properties = %#v, want %q to be required", schemaRef, schema.Required, name)
		}
	}
	for _, name := range wantOptional {
		if _, ok := required[name]; ok {
			t.Fatalf("schema %s required properties = %#v, want %q to be optional", schemaRef, schema.Required, name)
		}
	}
}
