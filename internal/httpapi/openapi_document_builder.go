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
	"setta/internal/chatsections"
	"setta/internal/codegen"
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
	"setta/internal/prompttemplates"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/transcriptionprofiles"
	"setta/internal/workspacelaunch"
)

type frontendHTTPOpenAPIInfoService struct{}
type frontendHTTPOpenAPILSPAdminService struct{}
type frontendHTTPOpenAPIProjectCodeUpdateService struct{}
type frontendHTTPOpenAPIProjectRenameRefactorService struct{}

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

func (frontendHTTPOpenAPIProjectCodeUpdateService) SetCode(context.Context, string, string, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectCodeUpdateService) FormatCode(context.Context, string, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectRenameRefactorService) SetSectionName(context.Context, string, string, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectRenameRefactorService) AcceptRenameRefactor(context.Context, string, string) error {
	return nil
}

func (frontendHTTPOpenAPIProjectRenameRefactorService) DeclineRenameRefactor(context.Context, string, string) error {
	return nil
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
		Preflight:    (*externalagentconfigs.SystemChecker)(nil),
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
		Artifacts:      (*artifacts.Service)(nil),
		ShareArtifacts: (*shareartifacts.Service)(nil),
	}); err != nil {
		return nil, fmt.Errorf("register artifact routes: %w", err)
	}
	if err := RegisterProjectRoutes(router, ProjectRouteDependencies{
		ModePolicy:                     modes.NewPolicy(config.ModeIDE),
		WorkspaceRoot:                  "/workspace",
		ProjectState:                   &projectstate.Runtime{},
		SettingsState:                  &settingsstate.Runtime{},
		ChatSectionChatIDs:             (*chatsections.Service)(nil),
		EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error { return nil }),
		CodeUpdates:                    frontendHTTPOpenAPIProjectCodeUpdateService{},
		RenameRefactors:                frontendHTTPOpenAPIProjectRenameRefactorService{},
	}); err != nil {
		return nil, fmt.Errorf("register project routes: %w", err)
	}
	if err := RegisterGitRoutes(router, GitRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Git:        (*gitread.Service)(nil),
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
		Browser:        (*filebrowser.Service)(nil),
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
		Service:    (*plugins.Service)(nil),
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
		Shell:         (*projectshell.Service)(nil),
		Notifications: (*notifications.Service)(nil),
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
