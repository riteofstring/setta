package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/appgenskills"
	"setta/internal/artifacts"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/chatattachments"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/filebrowser"
	"setta/internal/gitread"
	"setta/internal/launcher"
	"setta/internal/llmconfig"
	"setta/internal/lspcompletion"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/pathreveal"
	"setta/internal/plugins"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/settingsstate"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/transcriptionprofiles"
	"setta/internal/workspacelaunch"
)

type frontendHTTPOpenAPIInfoService struct{}
type frontendHTTPOpenAPIFileBrowserService struct{}
type frontendHTTPOpenAPIPluginService struct{}
type frontendHTTPOpenAPIExternalAgentChecker struct{}
type frontendHTTPOpenAPIProjectShellService struct{}
type frontendHTTPOpenAPIProjectNotificationService struct{}
type frontendHTTPOpenAPILSPAdminService struct{}
type frontendHTTPOpenAPIGitService struct{}
type frontendHTTPOpenAPIArtifactService struct{}
type frontendHTTPOpenAPIShareArtifactService struct{}

func (frontendHTTPOpenAPIInfoService) ServerMode(context.Context) string {
	return string(config.ModeIDE)
}

func (frontendHTTPOpenAPIInfoService) RuntimeInfo(context.Context) RuntimeInfo {
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
			AutoMode:             string(config.FilesLocationLocal),
		},
	}
}

func (frontendHTTPOpenAPIInfoService) SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{
		SDKVersion:         "dev-sdk",
		CoreVersion:        "dev-core",
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}

func (frontendHTTPOpenAPIFileBrowserService) Root(context.Context) filebrowser.RootResponse {
	return filebrowser.RootResponse{}
}

func (frontendHTTPOpenAPIFileBrowserService) CreateFile(context.Context, string) error {
	return nil
}

func (frontendHTTPOpenAPIFileBrowserService) CheckIfFileExists(context.Context, string) (bool, error) {
	return false, nil
}

func (frontendHTTPOpenAPIFileBrowserService) CheckWorkspaceInitialized(context.Context, filebrowser.CheckWorkspaceInitializedRequest) (bool, error) {
	return false, nil
}

func (frontendHTTPOpenAPIFileBrowserService) ListFolder(context.Context, filebrowser.ListFolderRequest) (filebrowser.ListFolderResponse, error) {
	return filebrowser.ListFolderResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) WorkspacePythonSignal(context.Context, string) (filebrowser.WorkspacePythonSignalResponse, error) {
	return filebrowser.WorkspacePythonSignalResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) BuildDownloadURLs(context.Context, filebrowser.FileBrowserDownloadURLRequest, func(string) string) ([]filebrowser.FileBrowserDownloadURLEntry, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIFileBrowserService) ReadFileContent(context.Context, filebrowser.FileContentRequest) (filebrowser.FileContentResponse, error) {
	return filebrowser.FileContentResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) StatFile(context.Context, string) (filebrowser.FileStatResponse, error) {
	return filebrowser.FileStatResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) WriteFileContent(context.Context, filebrowser.WriteFileContentRequest) (filebrowser.WriteFileContentResponse, error) {
	return filebrowser.WriteFileContentResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) Transfer(context.Context, filebrowser.TransferRequest) (filebrowser.TransferResponse, error) {
	return filebrowser.TransferResponse{}, nil
}

func (frontendHTTPOpenAPIFileBrowserService) Download(context.Context, string) (filebrowser.DownloadResult, error) {
	return filebrowser.DownloadResult{}, nil
}

func (frontendHTTPOpenAPIArtifactService) ImportFiles(context.Context, artifacts.ImportFilesRequest) ([]artifacts.ImportFilesResponseItem, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) LoadCachedImages(context.Context, artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) LoadCachedChartData(context.Context, artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) LoadCachedBrushStrokes(context.Context, artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) LoadCachedDrawAreaLayerItemTransforms(context.Context, artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) Update(context.Context, artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIArtifactService) Delete(context.Context, artifacts.DeleteRequest) ([]string, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) LoadCachedImages(context.Context, string, artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) LoadCachedChartData(context.Context, string, artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) LoadCachedBrushStrokes(context.Context, string, artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) LoadCachedDrawAreaLayerItemTransforms(context.Context, string, artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) Update(context.Context, string, artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIShareArtifactService) Delete(context.Context, string, artifacts.DeleteRequest) ([]string, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIGitService) Status(context.Context) (gitread.StatusResponse, error) {
	return gitread.StatusResponse{}, nil
}

func (frontendHTTPOpenAPIGitService) Diff(context.Context, gitread.DiffRequest) (gitread.DiffResponse, error) {
	return gitread.DiffResponse{}, nil
}

func (frontendHTTPOpenAPIGitService) Log(context.Context, gitread.LogRequest) (gitread.LogResponse, error) {
	return gitread.LogResponse{}, nil
}

func (frontendHTTPOpenAPIGitService) CommitDetails(context.Context, gitread.CommitDetailsRequest) (gitread.CommitDetailsResponse, error) {
	return gitread.CommitDetailsResponse{}, nil
}

func (frontendHTTPOpenAPIGitService) CommitFileDiff(context.Context, gitread.CommitFileDiffRequest) (gitread.CommitFileDiffResponse, error) {
	return gitread.CommitFileDiffResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) ResolveAssetPath(string, string) (string, error) {
	return "", nil
}

func (frontendHTTPOpenAPIPluginService) ResolveRegisteredStaticAssetPath(string) (string, bool, error) {
	return "", false, nil
}

func (frontendHTTPOpenAPIPluginService) LookupRegisteredBackendRoute(string, string) (plugins.BackendRouteLookup, error) {
	return plugins.BackendRouteLookup{}, nil
}

func (frontendHTTPOpenAPIPluginService) DispatchRegisteredBackendRoute(context.Context, plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
	return plugins.BackendHTTPResponse{}, false, nil
}

func (frontendHTTPOpenAPIPluginService) InvokeRegisteredListenerEndpoint(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error) {
	return nil, false, nil
}

func (frontendHTTPOpenAPIPluginService) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	return plugins.PluginRuntimeResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) GetBackendUISettings(string) ([]plugins.PluginRegisteredUISetting, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIPluginService) ReadBackendUISettingValue(context.Context, plugins.BackendUISettingReadOptions) (any, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIPluginService) WriteBackendUISettingValue(context.Context, plugins.BackendUISettingWriteOptions) error {
	return nil
}

func (frontendHTTPOpenAPIPluginService) Rescan() (plugins.DiscoverySnapshot, error) {
	return plugins.DiscoverySnapshot{}, nil
}

func (frontendHTTPOpenAPIPluginService) Install(context.Context, plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Link(plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Uninstall(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	return plugins.PluginUninstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Update(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	return plugins.PluginUpdateResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Rollback(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	return plugins.PluginRollbackResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Enable(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	return plugins.PluginEnableDisableResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Disable(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	return plugins.PluginEnableDisableResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) WriteConfig(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return plugins.PluginConfigWriteResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	return plugins.PluginLockWriteResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) ApplyLockfile(context.Context, bool) (plugins.PluginLockApplyResponse, error) {
	return plugins.PluginLockApplyResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Restart(context.Context) (plugins.PluginRestartResponse, error) {
	return plugins.PluginRestartResponse{}, nil
}

func (frontendHTTPOpenAPIExternalAgentChecker) Check(externalagentconfigs.Config) (externalagentconfigs.Status, error) {
	return externalagentconfigs.Status{}, nil
}

func (frontendHTTPOpenAPIProjectShellService) LoadAllProjectMetadata(context.Context) (projectshell.AllProjectMetadata, error) {
	return projectshell.AllProjectMetadata{}, nil
}

func (frontendHTTPOpenAPIProjectShellService) LoadProjectConfig(context.Context, string) (projectview.SingleConfig, error) {
	return projectview.SingleConfig{}, nil
}

func (frontendHTTPOpenAPIProjectShellService) SaveProject(context.Context, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectShellService) CreateProjectConfig(context.Context, string) (string, error) {
	return "", nil
}

func (frontendHTTPOpenAPIProjectShellService) SaveAsNewProjectConfig(context.Context, string, string, bool) error {
	return nil
}

func (frontendHTTPOpenAPIProjectShellService) DeleteProjectConfigs(context.Context, []string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectShellService) SetDefaultProjectConfig(context.Context, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectShellService) SetProjectConfigName(context.Context, string, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectNotificationService) GetNotifications(context.Context, string) ([]notifications.Notification, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIProjectNotificationService) DeleteNotification(context.Context, string) (bool, error) {
	return false, nil
}

func (frontendHTTPOpenAPILSPAdminService) Restart(context.Context, projectstate.Document) error {
	return nil
}

func (frontendHTTPOpenAPILSPAdminService) TypeCheckProject(context.Context, projectstate.Document, string) error {
	return nil
}

func newFrontendHTTPOpenAPILauncherManagementService() (*launcher.ManagementService, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve current executable: %w", err)
	}
	service, err := launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
		Version:        "dev-openapi",
	})
	if err != nil {
		return nil, fmt.Errorf("create launcher management service: %w", err)
	}
	return service, nil
}

func registerCoreRuntimeOpenAPIRoutes(router chi.Router, info InfoService) {
	registerOpenAPIGet[ServerModeResponse](
		router,
		"getServerMode",
		RouteGetServerMode,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, ServerModeResponse{
				Mode: openAPIServerMode(config.Mode(info.ServerMode(r.Context()))),
			})
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the current backend server mode."),
	)
	registerOpenAPIGet[RuntimeInfo](
		router,
		"getRuntimeInfo",
		"/runtimeInfo",
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.RuntimeInfo(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get runtime path and auth metadata for the current backend."),
	)
	registerOpenAPIGet[pythonsdkcontracts.RunningBackendVersionHandshake](
		router,
		"sdkRuntimeHandshake",
		RouteSDKRuntimeHandshake,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.SDKRuntimeHandshake(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the running backend version handshake for the local SDK."),
	)
}

func BuildFrontendHTTPOpenAPIDocument() (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)
	launcherManagement, err := newFrontendHTTPOpenAPILauncherManagementService()
	if err != nil {
		return nil, fmt.Errorf("create launcher management service: %w", err)
	}
	launcherHome := launcher.NewHomeService(launcher.HomeServiceOptions{})
	registerCoreRuntimeOpenAPIRoutes(router, frontendHTTPOpenAPIInfoService{})
	if err := RegisterStatusRoutes(router, StatusRouteDependencies{
		ModePolicy:           modes.NewPolicy(config.ModeIDE),
		SettaHome:            "/setta-home",
		SettaFilesRoot:       "/setta-files",
		RevealPath:           &pathreveal.Service{},
		WorktreeName:         "default",
		GlobalSettaFilesBase: "/global-setta",
	}); err != nil {
		return nil, fmt.Errorf("register status routes: %w", err)
	}
	if err := RegisterSettingsRoutes(router, SettingsRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		SettingsState: &settingsstate.Runtime{},
		WebsocketHub:  &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register settings routes: %w", err)
	}
	if err := RegisterLLMRoutes(router, LLMRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Service:      &llmconfig.Service{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register llm routes: %w", err)
	}
	if err := RegisterEngineConfigRoutes(router, EngineConfigRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Engines:      &agentruns.EngineStore{},
		LLM:          &llmconfig.Runtime{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register engine config routes: %w", err)
	}
	if err := RegisterAgentProfileRoutes(router, AgentProfileRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Profiles:     &agentprofiles.Store{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register agent profile routes: %w", err)
	}
	if err := RegisterPromptTemplateRoutes(router, PromptTemplateRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Templates:    &prompttemplates.Store{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register prompt template routes: %w", err)
	}
	if err := RegisterExternalAgentConfigRoutes(router, ExternalAgentConfigRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Configs:      &externalagentconfigs.Service{},
		Preflight:    frontendHTTPOpenAPIExternalAgentChecker{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register external agent config routes: %w", err)
	}
	if err := RegisterTranscriptionProfileRoutes(router, TranscriptionProfileRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Profiles:     &transcriptionprofiles.Service{},
		WebsocketHub: &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register transcription profile routes: %w", err)
	}
	if err := RegisterDocstringRoutes(router, DocstringRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}); err != nil {
		return nil, fmt.Errorf("register docstring routes: %w", err)
	}
	if err := RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		ProjectState: &projectstate.Runtime{},
		Statuses:     &agenticsummarycache.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register agentic summary cache routes: %w", err)
	}
	if err := RegisterMCPRoutes(router, MCPRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		LLMConfigPath: "/setta-files/llm_config.json",
	}); err != nil {
		return nil, fmt.Errorf("register mcp routes: %w", err)
	}
	if err := RegisterAppDefinitionRoutes(router, AppDefinitionRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		ProjectState: &projectstate.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register app definition routes: %w", err)
	}
	if err := RegisterAppGenSkillRoutes(router, AppGenSkillRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    &appgenskills.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register app gen skill routes: %w", err)
	}
	if err := RegisterArtifactRoutes(router, ArtifactRouteDependencies{
		ModePolicy:     modes.NewPolicy(config.ModeIDE),
		Artifacts:      frontendHTTPOpenAPIArtifactService{},
		ShareArtifacts: frontendHTTPOpenAPIShareArtifactService{},
	}); err != nil {
		return nil, fmt.Errorf("register artifact routes: %w", err)
	}
	if err := RegisterGitRoutes(router, GitRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Git:        frontendHTTPOpenAPIGitService{},
	}); err != nil {
		return nil, fmt.Errorf("register git routes: %w", err)
	}
	if err := RegisterListenerRoutes(router, ListenerRouteDependencies{
		ModePolicy:          modes.NewPolicy(config.ModeIDE),
		ProjectState:        &projectstate.Runtime{},
		ListenerBroadcaster: &realtime.ListenerBroadcaster{},
	}); err != nil {
		return nil, fmt.Errorf("register listener routes: %w", err)
	}
	if err := RegisterAgentRunRoutes(router, AgentRunRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Profiles:   &agentprofiles.Store{},
		Runs:       &agentruns.RunStore{},
		Managed:    &agentruns.Runtime{},
		Chains:     &runchains.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register agent run routes: %w", err)
	}
	if err := RegisterDetachedRunRoutes(router, DetachedRunRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		Planner:      &runs.Planner{},
		Runs:         &detachedruns.Manager{},
		ProjectState: &projectstate.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register detached run routes: %w", err)
	}
	if err := RegisterStateMachineRunRoutes(router, StateMachineRunRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Runtime:    &statemachineruns.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register state machine routes: %w", err)
	}
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       &auth.Service{},
		Intents:    &workspacelaunch.IntentService{},
		Launch:     &workspacelaunch.LocalLaunchService{},
	}); err != nil {
		return nil, fmt.Errorf("register workspace launch routes: %w", err)
	}
	if err := RegisterFileBrowserRoutes(router, FileBrowserRouteDependencies{
		ModePolicy:     modes.NewPolicy(config.ModeIDE),
		DeploymentRoot: "/deployment",
		Browser:        frontendHTTPOpenAPIFileBrowserService{},
	}); err != nil {
		return nil, fmt.Errorf("register file browser routes: %w", err)
	}
	if err := RegisterLSPRoutes(router, LSPRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		ProjectState: &projectstate.Runtime{},
		Diagnostics:  projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		Completions:  &lspcompletion.Service{},
		Admin:        frontendHTTPOpenAPILSPAdminService{},
	}); err != nil {
		return nil, fmt.Errorf("register lsp routes: %w", err)
	}
	if err := RegisterPluginRoutes(router, PluginRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    frontendHTTPOpenAPIPluginService{},
	}); err != nil {
		return nil, fmt.Errorf("register plugin routes: %w", err)
	}
	if err := RegisterBinaryRoutes(router, BinaryRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Store:      &binarypayload.Store{},
	}); err != nil {
		return nil, fmt.Errorf("register binary routes: %w", err)
	}
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    &chatattachments.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register attachment root routes: %w", err)
	}
	if err := RegisterAttachmentRoutes(router, AttachmentRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    &chatattachments.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register attachment routes: %w", err)
	}
	if err := RegisterProjectShellRoutes(router, ProjectShellRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		Shell:         frontendHTTPOpenAPIProjectShellService{},
		Notifications: frontendHTTPOpenAPIProjectNotificationService{},
	}); err != nil {
		return nil, fmt.Errorf("register project shell routes: %w", err)
	}
	if err := RegisterTerminalRoutes(router, TerminalRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Terminals:  &terminals.Service{},
		RunCode:    &runs.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register terminal routes: %w", err)
	}
	if err := RegisterAIRoutes(router, AIRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Deployment: &deployments.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register ai routes: %w", err)
	}
	if err := RegisterLauncherManagementRoutes(router, LauncherManagementRouteDependencies{
		ModePolicy:       modes.NewPolicy(config.ModeIDE),
		DefaultSettaHome: "/setta-home",
		Manager:          launcherManagement,
	}); err != nil {
		return nil, fmt.Errorf("register launcher management routes: %w", err)
	}
	if err := RegisterLauncherHomeRoutes(router, LauncherHomeRouteDependencies{
		ModePolicy:       modes.NewPolicy(config.ModeLauncher),
		DefaultSettaHome: "/setta-home",
		Home:             launcherHome,
		OpenWorkspace:    &launcher.OpenWorkspaceService{},
	}); err != nil {
		return nil, fmt.Errorf("register launcher home routes: %w", err)
	}
	if err := RegisterDeploymentIDERoutes(router, DeploymentIDERouteDependencies{
		ModePolicy:     modes.NewPolicy(config.ModeIDE),
		ProjectState:   &projectstate.Runtime{},
		Catalog:        &deployments.Catalog{},
		SharePublisher: &deployments.SharePublisher{},
		AppPublisher:   &deployments.AppPublisher{},
	}); err != nil {
		return nil, fmt.Errorf("register deployment ide routes: %w", err)
	}
	if err := RegisterDeploymentRoutes(router, DeploymentRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Deployment: &deployments.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register share deployment routes: %w", err)
	}
	if err := RegisterDeploymentRoutes(router, DeploymentRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeApp),
		Deployment: &deployments.Runtime{},
	}); err != nil {
		return nil, fmt.Errorf("register app deployment routes: %w", err)
	}
	return document, nil
}
