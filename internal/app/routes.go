package app

import (
	"log/slog"
	"net/http"
	"time"

	"setta/internal/agenticsummarycache"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/appgenskills"
	"setta/internal/appsubsystem"
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
	"setta/internal/externalagents"
	"setta/internal/filebrowser"
	"setta/internal/frontendorigins"
	"setta/internal/gitread"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/llmconfig"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/lspsignature"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/pathreveal"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
	"setta/internal/workspacelaunch"
	"setta/internal/wsapi"

	"github.com/go-chi/chi/v5"
)

type appHandlerDeps struct {
	cfg                      config.Config
	logger                   *slog.Logger
	authService              *auth.Service
	trustedOrigins           *frontendorigins.Service
	modePolicy               modes.Policy
	projectStates            *projectstate.Registry
	projectRuntime           *projectstate.Runtime
	settingsStateRuntime     *settingsstate.Runtime
	deploymentRuntime        *deployments.Runtime
	shareSessions            modes.ShareSessionStore
	attachmentService        *chatattachments.Service
	pluginRouteService       httpapi.PluginRouteService
	appSubsystemCapabilities *appSubsystemCapabilityState
	watchCodeCapabilities    *watchCodeCapabilityState
	websocketHub             *realtime.WebsocketHub
	uiSettingRevealResults   *realtime.UISettingRevealResultHub
	listenerBroadcaster      *realtime.ListenerBroadcaster
	listenerBuiltInInvoker   *listenerEndpointInvoker
	listenerProducer         *realtime.ListenerProducer
	terminalService          *terminals.Service
	temporaryIDs             *mcpx.TemporaryIDStore
	mcpServer                *mcpx.Server
	pathRevealService        *pathreveal.Service
	authRefreshWindowSeconds int
	worktreeName             string
	statusReadyAt            time.Time
	deploymentCatalog        *deployments.Catalog
	sharePublisher           deployments.SharePublishService
	appPublisher             deployments.AppPublishService
	launcherHome             *launcher.HomeService
	launcherManagement       *launcher.ManagementService
	launcherOpenWorkspace    *launcher.OpenWorkspaceService
	launchIntentService      *workspacelaunch.IntentService
	localLaunchService       *workspacelaunch.LocalLaunchService
	binaryStore              *binarypayload.Store
	fileBrowserService       *filebrowser.Service
	artifactService          *artifacts.Service
	shareArtifactService     *shareartifacts.Service
	runCodeService           *runs.Service
	runPlanner               *runs.Planner
	detachedRunManager       *detachedruns.Manager
	projectShellService      *projectshell.Service
	notificationService      *notifications.Service
	gitReadService           *gitread.Service
	promptTemplateStore      *prompttemplates.Store
	chatSectionChatIDs       *chatsections.Service
	codegenValidator         projectstate.CodegenTargetValidator
	pythonMaterializer       *codegen.PythonMaterializer
	lspSignature             *lspsignature.Service
	codeUpdates              *codeUpdateService
	renameRefactors          *renameRefactorService
	managedChatService       *managedchat.Service
	externalAgentSend        *externalagents.SendService
	externalAgentChats       *externalagents.Service
	externalAgentFollow      *externalagents.FollowService
	externalAgentRuntime     *externalagents.Runtime
	transcriptionProfiles    *transcriptionprofiles.Service
	transcriptionSessions    *transcriptionsessions.Service
	agentProfileStore        *agentprofiles.Store
	promptTemplateWatcher    *prompttemplates.Watcher
	appGenSkillService       *appgenskills.Service
	externalConfigService    *externalagentconfigs.Service
	externalPreflight        externalagentconfigs.Checker
	engineStore              *agentruns.EngineStore
	llmRuntime               *llmconfig.Runtime
	llmService               *llmconfig.Service
	agenticSummaryStatus     *agenticsummarycache.Service
	agentRunStore            *agentruns.RunStore
	agentRunRuntime          *agentruns.Runtime
	runChainRuntime          *runchains.Runtime
	stateMachineRuntime      *statemachineruns.Runtime
	mcpClient                *mcpx.Client
	lspDiagnostics           *projectstate.LSPDiagnosticsRegistry
	lspCompletion            *lspcompletion.Service
	projectLSPSyncer         *lsp.ProjectSynchronizer
	pluginRuntime            *pluginBackendRuntimeRefresher
}

func registerRootRoutes(r chi.Router, deps appHandlerDeps) error {
	if deps.pluginRouteService != nil {
		if err := httpapi.RegisterPluginRootRoutes(r, httpapi.PluginRootRouteDependencies{
			Service:        deps.pluginRouteService,
			Auth:           deps.authService,
			TrustedOrigins: deps.trustedOrigins,
		}); err != nil {
			return err
		}
	}
	var rootDeps httpapi.FrontendRootRouteDependencies
	if deps.attachmentService != nil {
		rootDeps.AttachmentRoot = &httpapi.AttachmentRootRouteDependencies{
			ModePolicy:    deps.modePolicy,
			ShareSessions: deps.shareSessions,
			Deployment:    deps.deploymentRuntime,
			Service:       deps.attachmentService,
		}
	}
	if err := httpapi.RegisterFrontendRootRoutes(r, rootDeps); err != nil {
		return err
	}
	return wsapi.RegisterRoutes(r, wsapi.RouteDependencies{
		Transport: wsapi.Dependencies{
			Auth:           deps.authService,
			ModePolicy:     deps.modePolicy,
			ShareSessions:  deps.shareSessions,
			TrustedOrigins: deps.trustedOrigins,
		},
		Deployment:             deps.deploymentRuntime,
		ProjectState:           deps.projectRuntime,
		Artifacts:              deps.artifactService,
		ShareArtifacts:         deps.shareArtifactService,
		WebsocketHub:           deps.websocketHub,
		UISettingRevealResults: deps.uiSettingRevealResults,
		ListenerBroadcaster:    deps.listenerBroadcaster,
		BuiltInListenerInvoker: deps.listenerBuiltInInvoker,
		ListenerProducer:       deps.listenerProducer,
		Terminals:              deps.terminalService,
		TemporaryIDs:           deps.temporaryIDs,
	})
}

func registerAuthenticatedRootRoutes(r chi.Router, deps appHandlerDeps) error {
	if deps.mcpServer == nil {
		return nil
	}
	r.Handle("/mcp", deps.mcpServer.Handler())
	r.Handle("/mcp/", deps.mcpServer.Handler())
	return httpapi.RegisterMCPRootRoutes(r, httpapi.MCPRootRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Server:       deps.mcpServer,
		ProjectState: deps.projectRuntime,
		WebsocketHub: deps.websocketHub,
	})
}

func registerAPIRoutes(r chi.Router, deps appHandlerDeps) error {
	var apiDeps httpapi.FrontendAPIRouteDependencies
	if deps.pluginRouteService != nil {
		apiDeps.Plugin = &httpapi.PluginRouteDependencies{
			ModePolicy: deps.modePolicy,
			Service:    deps.pluginRouteService,
		}
	}
	apiDeps.Status = httpapi.StatusRouteDependencies{
		ModePolicy:               deps.modePolicy,
		SettaHome:                deps.cfg.Paths.SettaHome,
		GlobalSettaFilesBase:     deps.cfg.User.GlobalSettaFilesBase,
		ActiveSettaFilesLocation: deps.cfg.Paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:           deps.cfg.Paths.SettaFilesRoot,
		RevealPath:               deps.pathRevealService,
		AuthRefreshWindowSeconds: deps.authRefreshWindowSeconds,
		WorktreeName:             deps.worktreeName,
		ReadyAt:                  deps.statusReadyAt,
	}
	apiDeps.Docstring = httpapi.DocstringRouteDependencies{ModePolicy: deps.modePolicy}
	apiDeps.Settings = httpapi.SettingsRouteDependencies{
		ModePolicy:    deps.modePolicy,
		SettingsState: deps.settingsStateRuntime,
		WebsocketHub:  deps.websocketHub,
		PluginRuntime: deps.pluginRouteService,
	}
	apiDeps.Listener = httpapi.ListenerRouteDependencies{
		ModePolicy:          deps.modePolicy,
		ShareSessions:       deps.shareSessions,
		ProjectState:        deps.projectRuntime,
		Deployment:          deps.deploymentRuntime,
		ListenerBroadcaster: deps.listenerBroadcaster,
	}
	apiDeps.ShareDeploymentIDE = httpapi.ShareDeploymentIDERouteDependencies{
		ModePolicy:     deps.modePolicy,
		ProjectState:   deps.projectRuntime,
		Catalog:        deps.deploymentCatalog,
		SharePublisher: deps.sharePublisher,
	}
	if deps.modePolicy.IsShare() {
		apiDeps.ShareDeployment = httpapi.DeploymentRouteDependencies{
			ModePolicy: deps.modePolicy,
			Deployment: deps.deploymentRuntime,
		}
	}
	apiDeps.LauncherHome = httpapi.LauncherHomeRouteDependencies{
		ModePolicy:       deps.modePolicy,
		Auth:             deps.authService,
		DefaultSettaHome: deps.cfg.Paths.SettaHome,
		Home:             deps.launcherHome,
		OpenWorkspace:    deps.launcherOpenWorkspace,
	}
	apiDeps.LauncherManagement = httpapi.LauncherManagementRouteDependencies{
		ModePolicy:       deps.modePolicy,
		DefaultSettaHome: deps.cfg.Paths.SettaHome,
		Manager:          deps.launcherManagement,
	}
	apiDeps.WorkspaceLaunch = httpapi.WorkspaceLaunchRouteDependencies{
		ModePolicy: deps.modePolicy,
		Auth:       deps.authService,
		Intents:    deps.launchIntentService,
		Launch:     deps.localLaunchService,
	}
	apiDeps.Binary = httpapi.BinaryRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Store:         deps.binaryStore,
	}
	apiDeps.Attachment = httpapi.AttachmentRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Service:       deps.attachmentService,
	}
	apiDeps.FileBrowser = httpapi.FileBrowserRouteDependencies{
		ModePolicy:     deps.modePolicy,
		DeploymentRoot: deps.cfg.Paths.DeploymentRoot,
		Browser:        deps.fileBrowserService,
	}
	apiDeps.Artifact = httpapi.ArtifactRouteDependencies{
		ModePolicy:     deps.modePolicy,
		ShareSessions:  deps.shareSessions,
		Artifacts:      deps.artifactService,
		ShareArtifacts: deps.shareArtifactService,
	}
	apiDeps.Terminal = httpapi.TerminalRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Terminals:     deps.terminalService,
		RunCode:       deps.runCodeService,
	}
	apiDeps.DetachedRun = httpapi.DetachedRunRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Planner:      deps.runPlanner,
		Runs:         deps.detachedRunManager,
		ProjectState: deps.projectRuntime,
	}
	apiDeps.ProjectShell = httpapi.ProjectShellRouteDependencies{
		ModePolicy:    deps.modePolicy,
		Shell:         deps.projectShellService,
		Notifications: deps.notificationService,
	}
	apiDeps.Git = httpapi.GitRouteDependencies{
		ModePolicy: deps.modePolicy,
		Git:        deps.gitReadService,
	}
	apiDeps.Project = httpapi.ProjectRouteDependencies{
		ModePolicy:                     deps.modePolicy,
		WorkspaceRoot:                  deps.cfg.Paths.WorkspaceRoot,
		ProjectState:                   deps.projectRuntime,
		SettingsProjectState:           deps.projectStates.Settings(),
		WebsocketHub:                   deps.websocketHub,
		PromptTemplates:                deps.promptTemplateStore,
		ShareSessions:                  deps.shareSessions,
		Deployment:                     deps.deploymentRuntime,
		SettingsState:                  deps.settingsStateRuntime,
		EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
		CodegenTargetValidator:         deps.codegenValidator,
		PythonCodegenSectionReconciler: deps.pythonMaterializer,
		CallableSignatures:             deps.lspSignature,
	}
	if deps.chatSectionChatIDs != nil {
		apiDeps.Project.ChatSectionChatID = deps.chatSectionChatIDs.GetChatID
	}
	if deps.codeUpdates != nil {
		apiDeps.Project.SetCode = deps.codeUpdates.SetCode
		apiDeps.Project.FormatCode = deps.codeUpdates.FormatCode
	}
	if deps.renameRefactors != nil {
		apiDeps.Project.SetSectionName = deps.renameRefactors.SetSectionName
		apiDeps.Project.AcceptRenameRefactor = deps.renameRefactors.AcceptRenameRefactor
		apiDeps.Project.DeclineRenameRefactor = deps.renameRefactors.DeclineRenameRefactor
	}
	apiDeps.AI = httpapi.AIRouteDependencies{
		ModePolicy:            deps.modePolicy,
		Deployment:            deps.deploymentRuntime,
		ManagedChats:          deps.managedChatService,
		ExternalAgentSend:     deps.externalAgentSend,
		ExternalAgentChats:    deps.externalAgentChats,
		ExternalAgentFollow:   deps.externalAgentFollow,
		ExternalAgentRuns:     deps.externalAgentRuntime,
		TranscriptionProfiles: deps.transcriptionProfiles,
		TranscriptionSessions: deps.transcriptionSessions,
		Sessions:              deps.authService,
	}
	apiDeps.AgentProfile = httpapi.AgentProfileRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Profiles:     deps.agentProfileStore,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.PromptTemplate = httpapi.PromptTemplateRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Templates:    deps.promptTemplateStore,
		Watcher:      deps.promptTemplateWatcher,
		ProjectState: deps.projectRuntime,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.AppGenSkill = httpapi.AppGenSkillRouteDependencies{
		ModePolicy: deps.modePolicy,
		Service:    deps.appGenSkillService,
	}
	apiDeps.ExternalAgentConfig = httpapi.ExternalAgentConfigRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Configs:      deps.externalConfigService,
		Preflight:    deps.externalPreflight,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.EngineConfig = httpapi.EngineConfigRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Engines:      deps.engineStore,
		LLM:          deps.llmRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.TranscriptionProfile = httpapi.TranscriptionProfileRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Profiles:     deps.transcriptionProfiles,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.LLM = httpapi.LLMRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Service:      deps.llmService,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.AgenticSummaryCache = httpapi.AgenticSummaryCacheRouteDependencies{
		ModePolicy:   deps.modePolicy,
		ProjectState: deps.projectRuntime,
		Statuses:     deps.agenticSummaryStatus,
	}
	apiDeps.AgentRun = httpapi.AgentRunRouteDependencies{
		ModePolicy: deps.modePolicy,
		Profiles:   deps.agentProfileStore,
		Runs:       deps.agentRunStore,
		Managed:    deps.agentRunRuntime,
		Chains:     deps.runChainRuntime,
	}
	apiDeps.StateMachine = httpapi.StateMachineRunRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.deploymentRuntime,
		Runtime:       deps.stateMachineRuntime,
	}
	apiDeps.MCP = httpapi.MCPRouteDependencies{
		Logger:                   deps.logger,
		ModePolicy:               deps.modePolicy,
		LLMConfigPath:            mcpx.LLMConfigPath(deps.cfg.Paths.SettaFilesRoot),
		ActiveSettaFilesLocation: deps.cfg.Paths.ActiveSettaFilesLocation(),
		Client:                   deps.mcpClient,
		ExternalStatusProvider: externalMCPStatusProvider{
			runtime: deps.externalAgentRuntime,
			send:    deps.externalAgentSend,
		},
	}
	apiDeps.LSP = httpapi.LSPRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ProjectState:  deps.projectRuntime,
		Diagnostics:   deps.lspDiagnostics,
		Completions:   deps.lspCompletion,
		Admin:         newWorkspaceLSPAdmin(deps.projectLSPSyncer, deps.pluginRuntime),
		WebsocketHub:  deps.websocketHub,
		PluginRuntime: deps.pluginRouteService,
	}
	appSubsystemRouteRegistrations, err := appsubsystem.BuildFrontendAPIRouteRegistrations(
		appsubsystem.FrontendRouteRegistrationOptions{
			Capabilities:           deps.appSubsystemCapabilities,
			BackendListenerInvoker: deps.pluginRouteService,
			ProjectState:           deps.projectRuntime,
			ModePolicy:             deps.modePolicy,
			AppGenSkill:            apiDeps.AppGenSkill,
			ShareDeploymentIDE: httpapi.ShareDeploymentIDERouteDependencies{
				ModePolicy:     deps.modePolicy,
				ProjectState:   deps.projectRuntime,
				Catalog:        deps.deploymentCatalog,
				SharePublisher: deps.sharePublisher,
			},
			AppDeploymentIDEPublisher: deps.appPublisher,
			AppDeployment: httpapi.DeploymentRouteDependencies{
				ModePolicy: deps.modePolicy,
				Deployment: deps.deploymentRuntime,
			},
		},
	)
	if err != nil {
		return err
	}
	return httpapi.RegisterFrontendAPIRoutes(
		r,
		apiDeps,
		appSubsystemRouteRegistrations,
	)
}

func newAppHandler(deps appHandlerDeps) (http.Handler, error) {
	return httpapi.NewHandler(httpapi.Dependencies{
		Logger:         deps.logger,
		Info:           httpapi.NewConfigInfoService(deps.cfg, deps.authService.AuthCookieBaseName()),
		Auth:           deps.authService,
		TrustedOrigins: deps.trustedOrigins,
		ModePolicy:     deps.modePolicy,
		RegisterRoot: func(r chi.Router) {
			if err := registerRootRoutes(r, deps); err != nil {
				panic(err)
			}
		},
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := registerAuthenticatedRootRoutes(r, deps); err != nil {
				panic(err)
			}
		},
		Register: func(r chi.Router) {
			if err := registerAPIRoutes(r, deps); err != nil {
				panic(err)
			}
		},
	})
}
