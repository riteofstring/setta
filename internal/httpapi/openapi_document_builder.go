package httpapi

import (
	"net/http"

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
	"setta/internal/lsp"
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

func registerFrontendHTTPOpenAPIDocumentRoutes(router chi.Router) error {
	settaHome, settaFilesRoot := "/setta-home", "/setta-files"
	ideMode, shareMode, appMode, launcherMode := modes.NewPolicy(config.ModeIDE), modes.NewPolicy(config.ModeShare), modes.NewPolicy(config.ModeApp), modes.NewPolicy(config.ModeLauncher)
	websocketHub, projectStateRuntime, deploymentRuntime := &realtime.WebsocketHub{}, &projectstate.Runtime{}, &deployments.Runtime{}
	attachmentService := &chatattachments.Service{}

	registerCoreRuntimeOpenAPIRoutes(router, NewConfigInfoService(config.Config{
		Server: config.Server{Mode: config.ModeIDE},
		Paths: config.Paths{
			WorkspaceRoot:         "/workspace",
			SettaHome:             settaHome,
			ProfileLookupHome:     "/profiles",
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           "/runtime",
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: "/global-setta",
			AutoMode:             config.AutoModeCreateLocal,
		},
	}, ""))
	if err := RegisterFrontendRootRoutes(router, FrontendRootRouteDependencies{
		AttachmentRoot: &AttachmentRootRouteDependencies{
			ModePolicy: ideMode,
			Service:    attachmentService,
		},
	}); err != nil {
		return err
	}
	return RegisterFrontendAPIRoutes(router, FrontendAPIRouteDependencies{
		Status: StatusRouteDependencies{
			ModePolicy:           ideMode,
			SettaHome:            settaHome,
			SettaFilesRoot:       settaFilesRoot,
			RevealPath:           &pathreveal.Service{},
			WorktreeName:         "default",
			GlobalSettaFilesBase: "/global-setta",
		},
		Docstring: DocstringRouteDependencies{
			ModePolicy: ideMode,
		},
		Settings: SettingsRouteDependencies{
			ModePolicy:    ideMode,
			SettingsState: &settingsstate.Runtime{},
			WebsocketHub:  websocketHub,
		},
		Plugin: &PluginRouteDependencies{
			ModePolicy: ideMode,
			Service:    (*plugins.Service)(nil),
		},
		Listener: ListenerRouteDependencies{
			ModePolicy:          ideMode,
			ProjectState:        projectStateRuntime,
			ListenerBroadcaster: &realtime.ListenerBroadcaster{},
		},
		DeploymentIDE: DeploymentIDERouteDependencies{
			ModePolicy:     ideMode,
			ProjectState:   projectStateRuntime,
			Catalog:        &deployments.Catalog{},
			SharePublisher: &deployments.SharePublisher{},
			AppPublisher:   &deployments.AppPublisher{},
		},
		ShareDeployment: DeploymentRouteDependencies{
			ModePolicy: shareMode,
			Deployment: deploymentRuntime,
		},
		AppDeployment: DeploymentRouteDependencies{
			ModePolicy: appMode,
			Deployment: deploymentRuntime,
		},
		LauncherHome: LauncherHomeRouteDependencies{
			ModePolicy:       launcherMode,
			DefaultSettaHome: settaHome,
			Home:             launcher.NewHomeService(launcher.HomeServiceOptions{}),
			OpenWorkspace:    &launcher.OpenWorkspaceService{},
		},
		LauncherManagement: LauncherManagementRouteDependencies{
			ModePolicy: ideMode,
		},
		WorkspaceLaunch: WorkspaceLaunchRouteDependencies{
			ModePolicy: ideMode,
			Auth:       &auth.Service{},
			Intents:    &workspacelaunch.IntentService{},
			Launch:     &workspacelaunch.LocalLaunchService{},
		},
		Binary: BinaryRouteDependencies{
			ModePolicy: ideMode,
			Store:      &binarypayload.Store{},
		},
		Attachment: AttachmentRouteDependencies{
			ModePolicy: ideMode,
			Service:    attachmentService,
		},
		FileBrowser: FileBrowserRouteDependencies{
			ModePolicy:     ideMode,
			DeploymentRoot: "/deployment",
			Browser:        (*filebrowser.Service)(nil),
		},
		Artifact: ArtifactRouteDependencies{
			ModePolicy:     ideMode,
			Artifacts:      (*artifacts.Service)(nil),
			ShareArtifacts: (*shareartifacts.Service)(nil),
		},
		Terminal: TerminalRouteDependencies{
			ModePolicy: ideMode,
			Terminals:  &terminals.Service{},
			RunCode:    &runs.Service{},
		},
		DetachedRun: DetachedRunRouteDependencies{
			ModePolicy:   ideMode,
			Planner:      &runs.Planner{},
			Runs:         &detachedruns.Manager{},
			ProjectState: projectStateRuntime,
		},
		ProjectShell: ProjectShellRouteDependencies{
			ModePolicy:    ideMode,
			Shell:         (*projectshell.Service)(nil),
			Notifications: (*notifications.Service)(nil),
		},
		Git: GitRouteDependencies{
			ModePolicy: ideMode,
			Git:        (*gitread.Service)(nil),
		},
		Project: ProjectRouteDependencies{
			ModePolicy: ideMode,
		},
		AppDefinition: AppDefinitionRouteDependencies{
			ModePolicy:   ideMode,
			ProjectState: projectStateRuntime,
		},
		AI: AIRouteDependencies{
			ModePolicy: shareMode,
			Deployment: deploymentRuntime,
		},
		AgentProfile: AgentProfileRouteDependencies{
			ModePolicy:   ideMode,
			Profiles:     &agentprofiles.Store{},
			WebsocketHub: websocketHub,
		},
		PromptTemplate: PromptTemplateRouteDependencies{
			ModePolicy:   ideMode,
			Templates:    &prompttemplates.Store{},
			WebsocketHub: websocketHub,
		},
		AppGenSkill: AppGenSkillRouteDependencies{
			ModePolicy: ideMode,
			Service:    &appgenskills.Service{},
		},
		ExternalAgentConfig: ExternalAgentConfigRouteDependencies{
			ModePolicy:   ideMode,
			Configs:      &externalagentconfigs.Service{},
			Preflight:    (*externalagentconfigs.SystemChecker)(nil),
			WebsocketHub: websocketHub,
		},
		EngineConfig: EngineConfigRouteDependencies{
			ModePolicy:   ideMode,
			Engines:      &agentruns.EngineStore{},
			LLM:          &llmconfig.Runtime{},
			WebsocketHub: websocketHub,
		},
		TranscriptionProfile: TranscriptionProfileRouteDependencies{
			ModePolicy:   ideMode,
			Profiles:     &transcriptionprofiles.Service{},
			WebsocketHub: websocketHub,
		},
		LLM: LLMRouteDependencies{
			ModePolicy:   ideMode,
			Service:      &llmconfig.Service{},
			WebsocketHub: websocketHub,
		},
		AgenticSummaryCache: AgenticSummaryCacheRouteDependencies{
			ModePolicy:   ideMode,
			ProjectState: projectStateRuntime,
			Statuses:     &agenticsummarycache.Service{},
		},
		AgentRun: AgentRunRouteDependencies{
			ModePolicy: ideMode,
			Profiles:   &agentprofiles.Store{},
			Runs:       &agentruns.RunStore{},
			Managed:    &agentruns.Runtime{},
			Chains:     &runchains.Runtime{},
		},
		StateMachine: StateMachineRunRouteDependencies{
			ModePolicy: ideMode,
			Runtime:    &statemachineruns.Runtime{},
		},
		MCP: MCPRouteDependencies{
			ModePolicy:    ideMode,
			LLMConfigPath: settaFilesRoot + "/llm_config.json",
		},
		LSP: LSPRouteDependencies{
			ModePolicy:   ideMode,
			ProjectState: projectStateRuntime,
			Diagnostics:  projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
			Completions:  &lspcompletion.Service{},
			Admin:        (*lsp.ProjectSynchronizer)(nil),
		},
	})
}

func BuildFrontendHTTPOpenAPIDocument() (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	if err := registerFrontendHTTPOpenAPIDocumentRoutes(router); err != nil {
		return nil, err
	}
	return document, nil
}
