package httpapi

import (
	"fmt"
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

func registerFrontendHTTPOpenAPIRouteFamily(family string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("register %s routes: %w", family, err)
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
	if err := registerFrontendHTTPOpenAPIRouteFamily("status", RegisterStatusRoutes(router, StatusRouteDependencies{
		ModePolicy:           ideMode,
		SettaHome:            settaHome,
		SettaFilesRoot:       settaFilesRoot,
		RevealPath:           &pathreveal.Service{},
		WorktreeName:         "default",
		GlobalSettaFilesBase: "/global-setta",
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("settings", RegisterSettingsRoutes(router, SettingsRouteDependencies{
		ModePolicy:    ideMode,
		SettingsState: &settingsstate.Runtime{},
		WebsocketHub:  websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("llm", RegisterLLMRoutes(router, LLMRouteDependencies{
		ModePolicy:   ideMode,
		Service:      &llmconfig.Service{},
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("engine config", RegisterEngineConfigRoutes(router, EngineConfigRouteDependencies{
		ModePolicy:   ideMode,
		Engines:      &agentruns.EngineStore{},
		LLM:          &llmconfig.Runtime{},
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("agent profile", RegisterAgentProfileRoutes(router, AgentProfileRouteDependencies{
		ModePolicy:   ideMode,
		Profiles:     &agentprofiles.Store{},
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("prompt template", RegisterPromptTemplateRoutes(router, PromptTemplateRouteDependencies{
		ModePolicy:   ideMode,
		Templates:    &prompttemplates.Store{},
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("external agent config", RegisterExternalAgentConfigRoutes(router, ExternalAgentConfigRouteDependencies{
		ModePolicy:   ideMode,
		Configs:      &externalagentconfigs.Service{},
		Preflight:    (*externalagentconfigs.SystemChecker)(nil),
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("transcription profile", RegisterTranscriptionProfileRoutes(router, TranscriptionProfileRouteDependencies{
		ModePolicy:   ideMode,
		Profiles:     &transcriptionprofiles.Service{},
		WebsocketHub: websocketHub,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("docstring", RegisterDocstringRoutes(router, DocstringRouteDependencies{
		ModePolicy: ideMode,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("agentic summary cache", RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
		ModePolicy:   ideMode,
		ProjectState: projectStateRuntime,
		Statuses:     &agenticsummarycache.Service{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("mcp", RegisterMCPRoutes(router, MCPRouteDependencies{ModePolicy: ideMode, LLMConfigPath: settaFilesRoot + "/llm_config.json"})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("app definition", RegisterAppDefinitionRoutes(router, AppDefinitionRouteDependencies{
		ModePolicy:   ideMode,
		ProjectState: projectStateRuntime,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("app gen skill", RegisterAppGenSkillRoutes(router, AppGenSkillRouteDependencies{
		ModePolicy: ideMode,
		Service:    &appgenskills.Service{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("artifact", RegisterArtifactRoutes(router, ArtifactRouteDependencies{ModePolicy: ideMode, Artifacts: (*artifacts.Service)(nil), ShareArtifacts: (*shareartifacts.Service)(nil)})); err != nil {
		return err
	}
	if err := registerOpenAPIProjectRouteFamily(router, ideMode, "/workspace"); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("git", RegisterGitRoutes(router, GitRouteDependencies{ModePolicy: ideMode, Git: (*gitread.Service)(nil)})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("listener", RegisterListenerRoutes(router, ListenerRouteDependencies{
		ModePolicy:          ideMode,
		ProjectState:        projectStateRuntime,
		ListenerBroadcaster: &realtime.ListenerBroadcaster{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("agent run", RegisterAgentRunRoutes(router, AgentRunRouteDependencies{
		ModePolicy: ideMode,
		Profiles:   &agentprofiles.Store{},
		Runs:       &agentruns.RunStore{},
		Managed:    &agentruns.Runtime{},
		Chains:     &runchains.Runtime{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("detached run", RegisterDetachedRunRoutes(router, DetachedRunRouteDependencies{
		ModePolicy:   ideMode,
		Planner:      &runs.Planner{},
		Runs:         &detachedruns.Manager{},
		ProjectState: projectStateRuntime,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("state machine", RegisterStateMachineRunRoutes(router, StateMachineRunRouteDependencies{
		ModePolicy: ideMode,
		Runtime:    &statemachineruns.Runtime{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("workspace launch", RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: ideMode,
		Auth:       &auth.Service{},
		Intents:    &workspacelaunch.IntentService{},
		Launch:     &workspacelaunch.LocalLaunchService{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("file browser", RegisterFileBrowserRoutes(router, FileBrowserRouteDependencies{
		ModePolicy:     ideMode,
		DeploymentRoot: "/deployment",
		Browser:        (*filebrowser.Service)(nil),
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("lsp", RegisterLSPRoutes(router, LSPRouteDependencies{
		ModePolicy:   ideMode,
		ProjectState: projectStateRuntime,
		Diagnostics:  projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		Completions:  &lspcompletion.Service{},
		Admin:        (*lsp.ProjectSynchronizer)(nil),
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("plugin", RegisterPluginRoutes(router, PluginRouteDependencies{ModePolicy: ideMode, Service: (*plugins.Service)(nil)})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("binary", RegisterBinaryRoutes(router, BinaryRouteDependencies{ModePolicy: ideMode, Store: &binarypayload.Store{}})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("attachment root", RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{ModePolicy: ideMode, Service: attachmentService})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("attachment", RegisterAttachmentRoutes(router, AttachmentRouteDependencies{ModePolicy: ideMode, Service: attachmentService})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("project shell", RegisterProjectShellRoutes(router, ProjectShellRouteDependencies{
		ModePolicy:    ideMode,
		Shell:         (*projectshell.Service)(nil),
		Notifications: (*notifications.Service)(nil),
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("terminal", RegisterTerminalRoutes(router, TerminalRouteDependencies{
		ModePolicy: ideMode,
		Terminals:  &terminals.Service{},
		RunCode:    &runs.Service{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("ai", RegisterAIRoutes(router, AIRouteDependencies{ModePolicy: shareMode, Deployment: deploymentRuntime})); err != nil {
		return err
	}
	if err := registerOpenAPILauncherManagementRouteFamily(router, ideMode, settaHome); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("launcher home", RegisterLauncherHomeRoutes(router, LauncherHomeRouteDependencies{
		ModePolicy:       launcherMode,
		DefaultSettaHome: settaHome,
		Home:             launcher.NewHomeService(launcher.HomeServiceOptions{}),
		OpenWorkspace:    &launcher.OpenWorkspaceService{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("deployment ide", RegisterDeploymentIDERoutes(router, DeploymentIDERouteDependencies{
		ModePolicy:     ideMode,
		ProjectState:   projectStateRuntime,
		Catalog:        &deployments.Catalog{},
		SharePublisher: &deployments.SharePublisher{},
		AppPublisher:   &deployments.AppPublisher{},
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("share deployment", RegisterDeploymentRoutes(router, DeploymentRouteDependencies{
		ModePolicy: shareMode,
		Deployment: deploymentRuntime,
	})); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("app deployment", RegisterDeploymentRoutes(router, DeploymentRouteDependencies{
		ModePolicy: appMode,
		Deployment: deploymentRuntime,
	})); err != nil {
		return err
	}
	return nil
}

func BuildFrontendHTTPOpenAPIDocument() (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)
	if err := registerFrontendHTTPOpenAPIDocumentRoutes(router); err != nil {
		return nil, err
	}
	return document, nil
}
