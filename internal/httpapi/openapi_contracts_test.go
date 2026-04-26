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
	document, err := BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildContributedRouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend http openapi document: %v", err)
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

	revealPathInOSFileExplorer := document.Paths[RouteRevealPathInOSFileExplorer].Post
	if revealPathInOSFileExplorer == nil {
		t.Fatalf("expected %s post operation", RouteRevealPathInOSFileExplorer)
	}
	if revealPathInOSFileExplorer.OperationID != "revealPathInOsFileExplorer" {
		t.Fatalf(
			"reveal path operation id = %q, want %q",
			revealPathInOSFileExplorer.OperationID,
			"revealPathInOsFileExplorer",
		)
	}
	if got := revealPathInOSFileExplorer.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("reveal path mode requirement = %#v, want %q", got, "ide")
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

	setLanguageServerSelection := document.Paths[RouteSetLanguageServerSelection].Post
	if setLanguageServerSelection == nil {
		t.Fatalf("expected %s post operation", RouteSetLanguageServerSelection)
	}
	if setLanguageServerSelection.RequestBody == nil {
		t.Fatalf("expected setLanguageServerSelection request body to be documented")
	}
	setLanguageServerSelectionSchema := setLanguageServerSelection.Responses["200"].Content["application/json"].Schema
	if setLanguageServerSelectionSchema.Type != "null" {
		t.Fatalf("setLanguageServerSelection response schema type = %q, want %q", setLanguageServerSelectionSchema.Type, "null")
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

	createWorkspaceLaunchIntent := document.Paths[RouteCreateWorkspaceLaunchIntent].Post
	if createWorkspaceLaunchIntent == nil {
		t.Fatalf("expected %s post operation", RouteCreateWorkspaceLaunchIntent)
	}
	if createWorkspaceLaunchIntent.OperationID != "createWorkspaceLaunchIntent" {
		t.Fatalf(
			"workspace launch intent operation id = %q, want %q",
			createWorkspaceLaunchIntent.OperationID,
			"createWorkspaceLaunchIntent",
		)
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

	getLatestLspDiagnostics := document.Paths[RouteGetLatestLSPDiagnostics].Post
	if getLatestLspDiagnostics == nil {
		t.Fatalf("expected %s post operation", RouteGetLatestLSPDiagnostics)
	}
	if getLatestLspDiagnostics.OperationID != "getLatestLspDiagnostics" {
		t.Fatalf("lsp diagnostics operation id = %q, want %q", getLatestLspDiagnostics.OperationID, "getLatestLspDiagnostics")
	}
	if got := getLatestLspDiagnostics.Extensions["x-setta-mode-requirement"]; got != "not-deployment-and-not-launcher" {
		t.Fatalf("lsp diagnostics mode requirement = %#v, want %q", got, "not-deployment-and-not-launcher")
	}

	restartLanguageServer := document.Paths[RouteRestartLanguageServer].Post
	if restartLanguageServer == nil {
		t.Fatalf("expected %s post operation", RouteRestartLanguageServer)
	}
	if restartLanguageServer.OperationID != "restartLanguageServer" {
		t.Fatalf("restart language server operation id = %q, want %q", restartLanguageServer.OperationID, "restartLanguageServer")
	}
	if restartLanguageServer.RequestBody != nil {
		t.Fatalf("expected restartLanguageServer request body to be omitted, got %#v", restartLanguageServer.RequestBody)
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

	contributedProject := document.Paths[testContributedProjectRoutePath].Get
	if contributedProject == nil {
		t.Fatalf("expected %s get operation", testContributedProjectRoutePath)
	}
	if contributedProject.OperationID != testContributedProjectOperationID {
		t.Fatalf(
			"contributed project operation id = %q, want %q",
			contributedProject.OperationID,
			testContributedProjectOperationID,
		)
	}

	contributedDeployment := document.Paths[testContributedDeploymentRoutePath].Post
	if contributedDeployment == nil {
		t.Fatalf("expected %s post operation", testContributedDeploymentRoutePath)
	}
	if contributedDeployment.OperationID != testContributedDeploymentOperation {
		t.Fatalf(
			"contributed deployment operation id = %q, want %q",
			contributedDeployment.OperationID,
			testContributedDeploymentOperation,
		)
	}

	getGitStatus := document.Paths[RouteGetGitStatus].Post
	if getGitStatus == nil {
		t.Fatalf("expected %s post operation", RouteGetGitStatus)
	}
	if getGitStatus.OperationID != "getGitStatus" {
		t.Fatalf("get git status operation id = %q, want %q", getGitStatus.OperationID, "getGitStatus")
	}
	if getGitStatus.RequestBody != nil {
		t.Fatalf("expected getGitStatus request body to be omitted, got %#v", getGitStatus.RequestBody)
	}

	getListenerCoverage := document.Paths[RouteGetListenerCoverage].Post
	if getListenerCoverage == nil {
		t.Fatalf("expected %s post operation", RouteGetListenerCoverage)
	}
	if getListenerCoverage.OperationID != "getListenerCoverage" {
		t.Fatalf("get listener coverage operation id = %q, want %q", getListenerCoverage.OperationID, "getListenerCoverage")
	}
	if got := getListenerCoverage.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("get listener coverage mode requirement = %#v, want %q", got, "not-launcher")
	}

	getAgentRuns := document.Paths[RouteGetAgentRuns].Get
	if getAgentRuns == nil {
		t.Fatalf("expected %s get operation", RouteGetAgentRuns)
	}
	if getAgentRuns.OperationID != "getAgentRuns" {
		t.Fatalf("get agent runs operation id = %q, want %q", getAgentRuns.OperationID, "getAgentRuns")
	}
	if got := getAgentRuns.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("get agent runs mode requirement = %#v, want %q", got, "ide")
	}

	importFilesToArtifacts := document.Paths[RouteImportFilesToArtifacts].Post
	if importFilesToArtifacts == nil {
		t.Fatalf("expected %s post operation", RouteImportFilesToArtifacts)
	}
	if importFilesToArtifacts.OperationID != "importFilesToArtifacts" {
		t.Fatalf("import files to artifacts operation id = %q, want %q", importFilesToArtifacts.OperationID, "importFilesToArtifacts")
	}
	if got := importFilesToArtifacts.Extensions["x-setta-mode-requirement"]; got != "full-ide" {
		t.Fatalf("import files to artifacts mode requirement = %#v, want %q", got, "full-ide")
	}

	loadCachedImageArtifacts := document.Paths[RouteLoadCachedImageArtifacts].Post
	if loadCachedImageArtifacts == nil {
		t.Fatalf("expected %s post operation", RouteLoadCachedImageArtifacts)
	}
	if loadCachedImageArtifacts.OperationID != "loadCachedImageArtifacts" {
		t.Fatalf("load cached image artifacts operation id = %q, want %q", loadCachedImageArtifacts.OperationID, "loadCachedImageArtifacts")
	}
	if got := loadCachedImageArtifacts.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("load cached image artifacts mode requirement = %#v, want %q", got, "not-launcher")
	}

	updateArtifacts := document.Paths[RouteUpdateArtifacts].Post
	if updateArtifacts == nil {
		t.Fatalf("expected %s post operation", RouteUpdateArtifacts)
	}
	if updateArtifacts.OperationID != "updateArtifacts" {
		t.Fatalf("update artifacts operation id = %q, want %q", updateArtifacts.OperationID, "updateArtifacts")
	}
	if got := updateArtifacts.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("update artifacts mode requirement = %#v, want %q", got, "not-launcher")
	}

	runDetached := document.Paths[RouteRunDetached].Post
	if runDetached == nil {
		t.Fatalf("expected %s post operation", RouteRunDetached)
	}
	if runDetached.OperationID != "runDetached" {
		t.Fatalf("run detached operation id = %q, want %q", runDetached.OperationID, "runDetached")
	}
	if got := runDetached.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("run detached mode requirement = %#v, want %q", got, "not-launcher")
	}

	getRunnerSummary := document.Paths[RouteGetRunnerSummary].Post
	if getRunnerSummary == nil {
		t.Fatalf("expected %s post operation", RouteGetRunnerSummary)
	}
	if getRunnerSummary.OperationID != "getRunnerSummary" {
		t.Fatalf("get runner summary operation id = %q, want %q", getRunnerSummary.OperationID, "getRunnerSummary")
	}
	if got := getRunnerSummary.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("get runner summary mode requirement = %#v, want %q", got, "ide")
	}

	getStateMachineRun := document.Paths[RouteGetStateMachineRun].Post
	if getStateMachineRun == nil {
		t.Fatalf("expected %s post operation", RouteGetStateMachineRun)
	}
	if getStateMachineRun.OperationID != "getStateMachineRun" {
		t.Fatalf("get state machine run operation id = %q, want %q", getStateMachineRun.OperationID, "getStateMachineRun")
	}
	if got := getStateMachineRun.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("get state machine run mode requirement = %#v, want %q", got, "not-launcher")
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

	getAttachmentDownloadURL := document.Paths[RouteGetAttachmentDownloadURL].Post
	if getAttachmentDownloadURL == nil {
		t.Fatalf("expected %s post operation", RouteGetAttachmentDownloadURL)
	}
	if getAttachmentDownloadURL.OperationID != "getAttachmentDownloadUrl" {
		t.Fatalf("attachment download url operation id = %q, want %q", getAttachmentDownloadURL.OperationID, "getAttachmentDownloadUrl")
	}
	if got := getAttachmentDownloadURL.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("attachment download url mode requirement = %#v, want %q", got, "not-launcher")
	}

	getAttachmentDownloadURLs := document.Paths[RouteGetAttachmentDownloadURLs].Post
	if getAttachmentDownloadURLs == nil {
		t.Fatalf("expected %s post operation", RouteGetAttachmentDownloadURLs)
	}
	if getAttachmentDownloadURLs.OperationID != "getAttachmentDownloadUrls" {
		t.Fatalf("attachment download urls operation id = %q, want %q", getAttachmentDownloadURLs.OperationID, "getAttachmentDownloadUrls")
	}

	attachmentDownload := document.Paths[RouteAttachmentDownload].Get
	if attachmentDownload == nil {
		t.Fatalf("expected %s get operation", RouteAttachmentDownload)
	}
	if attachmentDownload.OperationID != "downloadAttachment" {
		t.Fatalf("attachment download operation id = %q, want %q", attachmentDownload.OperationID, "downloadAttachment")
	}
	assertOpenAPIParameter(t, attachmentDownload.Parameters, "token", "path", true)
	attachmentDownloadResponse := attachmentDownload.Responses["200"]
	if attachmentDownloadResponse == nil {
		t.Fatalf("expected attachment download success response")
	}
	attachmentDownloadContent := attachmentDownloadResponse.Content["application/octet-stream"]
	if attachmentDownloadContent == nil || attachmentDownloadContent.Schema == nil || attachmentDownloadContent.Schema.Format != "binary" {
		t.Fatalf("attachment download response schema = %#v, want binary octet-stream", attachmentDownloadContent)
	}

	deleteTerminals := document.Paths[RouteDeleteTerminals].Post
	if deleteTerminals == nil {
		t.Fatalf("expected %s post operation", RouteDeleteTerminals)
	}
	if deleteTerminals.OperationID != "deleteTerminals" {
		t.Fatalf("delete terminals operation id = %q, want %q", deleteTerminals.OperationID, "deleteTerminals")
	}
	if got := deleteTerminals.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("delete terminals mode requirement = %#v, want %q", got, "not-launcher")
	}
	deleteTerminalsJSON := deleteTerminals.Responses["200"].Content["application/json"]
	if deleteTerminalsJSON == nil || deleteTerminalsJSON.Schema == nil || deleteTerminalsJSON.Schema.Type != "null" {
		t.Fatalf("delete terminals response schema = %#v, want json null", deleteTerminalsJSON)
	}

	interruptTerminalProcesses := document.Paths[RouteInterruptTerminalProcesses].Post
	if interruptTerminalProcesses == nil {
		t.Fatalf("expected %s post operation", RouteInterruptTerminalProcesses)
	}
	if interruptTerminalProcesses.OperationID != "interruptTerminalProcesses" {
		t.Fatalf("interrupt terminal processes operation id = %q, want %q", interruptTerminalProcesses.OperationID, "interruptTerminalProcesses")
	}

	runCode := document.Paths[RouteRunCode].Post
	if runCode == nil {
		t.Fatalf("expected %s post operation", RouteRunCode)
	}
	if runCode.OperationID != "runCode" {
		t.Fatalf("run code operation id = %q, want %q", runCode.OperationID, "runCode")
	}
	if got := runCode.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("run code mode requirement = %#v, want %q", got, "not-launcher")
	}

	getLlmResponse := document.Paths[RouteGetLLMResponse].Post
	if getLlmResponse == nil {
		t.Fatalf("expected %s post operation", RouteGetLLMResponse)
	}
	if getLlmResponse.OperationID != "getLlmResponse" {
		t.Fatalf("get llm response operation id = %q, want %q", getLlmResponse.OperationID, "getLlmResponse")
	}
	if got := getLlmResponse.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("get llm response mode requirement = %#v, want %q", got, "not-launcher")
	}
	getLlmResponseJSON := getLlmResponse.Responses["200"].Content["application/json"]
	if getLlmResponseJSON == nil || getLlmResponseJSON.Schema == nil || getLlmResponseJSON.Schema.Type != "string" {
		t.Fatalf("get llm response schema = %#v, want json string", getLlmResponseJSON)
	}

	getAIFollowSnapshot := document.Paths[RouteGetAIFollowSnapshot].Post
	if getAIFollowSnapshot == nil {
		t.Fatalf("expected %s post operation", RouteGetAIFollowSnapshot)
	}
	if getAIFollowSnapshot.OperationID != "getAIFollowSnapshot" {
		t.Fatalf("ai follow snapshot operation id = %q, want %q", getAIFollowSnapshot.OperationID, "getAIFollowSnapshot")
	}
	if got := getAIFollowSnapshot.Extensions["x-setta-mode-requirement"]; got != "not-launcher" {
		t.Fatalf("ai follow snapshot mode requirement = %#v, want %q", got, "not-launcher")
	}

	startTranscriptionSession := document.Paths[RouteStartTranscriptionSession].Post
	if startTranscriptionSession == nil {
		t.Fatalf("expected %s post operation", RouteStartTranscriptionSession)
	}
	if startTranscriptionSession.OperationID != "startTranscriptionSession" {
		t.Fatalf("start transcription session operation id = %q, want %q", startTranscriptionSession.OperationID, "startTranscriptionSession")
	}
	if startTranscriptionSession.RequestBody == nil {
		t.Fatalf("expected startTranscriptionSession request body to be documented")
	}

	respondExternalAgentApproval := document.Paths[RouteRespondExternalAgentApproval].Post
	if respondExternalAgentApproval == nil {
		t.Fatalf("expected %s post operation", RouteRespondExternalAgentApproval)
	}
	if respondExternalAgentApproval.OperationID != "respondExternalAgentApproval" {
		t.Fatalf("respond external agent approval operation id = %q, want %q", respondExternalAgentApproval.OperationID, "respondExternalAgentApproval")
	}
	respondExternalAgentApprovalJSON := respondExternalAgentApproval.Responses["200"].Content["application/json"]
	if respondExternalAgentApprovalJSON == nil || respondExternalAgentApprovalJSON.Schema == nil || respondExternalAgentApprovalJSON.Schema.Type != "null" {
		t.Fatalf("respond external agent approval schema = %#v, want json null", respondExternalAgentApprovalJSON)
	}

	loadAllProjectMetadata := document.Paths[RouteLoadAllProjectMetadata].Post
	if loadAllProjectMetadata == nil {
		t.Fatalf("expected %s post operation", RouteLoadAllProjectMetadata)
	}
	if loadAllProjectMetadata.OperationID != "loadAllProjectMetadata" {
		t.Fatalf("loadAllProjectMetadata operation id = %q, want %q", loadAllProjectMetadata.OperationID, "loadAllProjectMetadata")
	}
	if loadAllProjectMetadata.RequestBody != nil {
		t.Fatalf("expected loadAllProjectMetadata request body to be omitted, got %#v", loadAllProjectMetadata.RequestBody)
	}
	if got := loadAllProjectMetadata.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("loadAllProjectMetadata mode requirement = %#v, want %q", got, "ide")
	}

	loadProjectConfig := document.Paths[RouteLoadProjectConfig].Post
	if loadProjectConfig == nil {
		t.Fatalf("expected %s post operation", RouteLoadProjectConfig)
	}
	if loadProjectConfig.OperationID != "loadProjectConfig" {
		t.Fatalf("loadProjectConfig operation id = %q, want %q", loadProjectConfig.OperationID, "loadProjectConfig")
	}

	getNotifications := document.Paths[RouteGetNotifications].Post
	if getNotifications == nil {
		t.Fatalf("expected %s post operation", RouteGetNotifications)
	}
	if getNotifications.OperationID != "getNotifications" {
		t.Fatalf("getNotifications operation id = %q, want %q", getNotifications.OperationID, "getNotifications")
	}

	getLauncherStatus := document.Paths[RouteGetLauncherStatus].Get
	if getLauncherStatus == nil {
		t.Fatalf("expected %s get operation", RouteGetLauncherStatus)
	}
	if getLauncherStatus.OperationID != "getLauncherStatus" {
		t.Fatalf("launcher status operation id = %q, want %q", getLauncherStatus.OperationID, "getLauncherStatus")
	}
	if got := getLauncherStatus.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("launcher status mode requirement = %#v, want %q", got, "ide")
	}
	assertOpenAPIParameter(t, getLauncherStatus.Parameters, "setta_home", "query", false)

	getLauncherRecentWorkspaces := document.Paths[RouteGetLauncherRecentWorkspaces].Get
	if getLauncherRecentWorkspaces == nil {
		t.Fatalf("expected %s get operation", RouteGetLauncherRecentWorkspaces)
	}
	if getLauncherRecentWorkspaces.OperationID != "getLauncherRecentWorkspaces" {
		t.Fatalf("launcher recent workspaces operation id = %q, want %q", getLauncherRecentWorkspaces.OperationID, "getLauncherRecentWorkspaces")
	}
	if got := getLauncherRecentWorkspaces.Extensions["x-setta-mode-requirement"]; got != "launcher" {
		t.Fatalf("launcher recent workspaces mode requirement = %#v, want %q", got, "launcher")
	}
	assertOpenAPIParameter(t, getLauncherRecentWorkspaces.Parameters, "setta_home", "query", false)

	listShareDeployments := document.Paths[RouteShareDeployments].Get
	if listShareDeployments == nil {
		t.Fatalf("expected %s get operation", RouteShareDeployments)
	}
	if listShareDeployments.OperationID != "listShareDeployments" {
		t.Fatalf("share deployments operation id = %q, want %q", listShareDeployments.OperationID, "listShareDeployments")
	}
	if got := listShareDeployments.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("share deployments mode requirement = %#v, want %q", got, "ide")
	}

	getShareDeploymentState := document.Paths[RouteShareDeploymentState].Get
	if getShareDeploymentState == nil {
		t.Fatalf("expected %s get operation", RouteShareDeploymentState)
	}
	if getShareDeploymentState.OperationID != "getShareDeploymentState" {
		t.Fatalf("share deployment state operation id = %q, want %q", getShareDeploymentState.OperationID, "getShareDeploymentState")
	}
	if got := getShareDeploymentState.Extensions["x-setta-mode-requirement"]; got != "share" {
		t.Fatalf("share deployment state mode requirement = %#v, want %q", got, "share")
	}
	if len(getShareDeploymentState.Parameters) != 2 {
		t.Fatalf("share deployment state params = %#v, want deploymentName/version path params", getShareDeploymentState.Parameters)
	}

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
