package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"setta/internal/agenticsummarycache"
	"setta/internal/agentprofiles"
	"setta/internal/appgenskills"
	"setta/internal/appsubsystem"
	"setta/internal/artifacts"
	"setta/internal/artifactwatch"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/chatattachments"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/devworktree"
	"setta/internal/filebrowser"
	"setta/internal/httpapi"
	"setta/internal/jsonsourcewatch"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/pathreveal"
	"setta/internal/plugins"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"
	"setta/internal/tools"
	"setta/internal/uisettings"
)

type appBaseServices struct {
	manager           *runtime.Manager
	websocketHub      *realtime.WebsocketHub
	authService       *auth.Service
	currentSession    *auth.CurrentSession
	settaServerURL    string
	mcpToolRegistry   *tools.Registry
	mcpClient         *mcpx.Client
	backendLogService *backendlogs.Service
}

type appWorkspaceServices struct {
	terminalService      *terminals.Service
	binaryStore          *binarypayload.Store
	fileBrowserService   *filebrowser.Service
	artifactService      *artifacts.Service
	shareArtifactService *shareartifacts.Service
	attachmentService    *chatattachments.Service
	agentProfileStore    *agentprofiles.Store
	promptTemplateStore  *prompttemplates.Store
	agenticSummaryStatus *agenticsummarycache.Service
	appGenSkillService   *appgenskills.Service
	pathRevealService    *pathreveal.Service
}

type appRuntimeServices struct {
	ideAgents              ideAgentServices
	runPlanner             *runs.Planner
	listenerBroadcaster    *realtime.ListenerBroadcaster
	uiSettingRevealResults *realtime.UISettingRevealResultHub
	listenerProducer       *realtime.ListenerProducer
	promptTemplateWatcher  *prompttemplates.Watcher
	uiSettingRevealService uisettings.RevealService
	runCodeService         *runs.Service
	detachedRunManager     *detachedruns.Manager
}

type appPlatformServices struct {
	deploymentCatalog        *deployments.Catalog
	sharePublisher           deployments.SharePublishService
	pluginRuntime            *pluginBackendRuntimeRefresher
	pluginRouteService       httpapi.PluginRouteService
	appSubsystemCapabilities *appSubsystemCapabilityState
	watchCodeCapabilities    *watchCodeCapabilityState
	mcpServer                *mcpx.Server
}

type appHandlerServices struct {
	handler                http.Handler
	jsonSourceWatchService *jsonsourcewatch.Service
	artifactWatchService   *artifactwatch.Service
}

func initializeAppBaseServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
) (appBaseServices, error) {
	services := appBaseServices{
		manager:         runtime.New(context.Background(), logger),
		websocketHub:    realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
		mcpToolRegistry: tools.NewRegistry(),
	}
	authService, err := auth.NewService(auth.Options{
		Mode:              cfg.Server.Mode,
		RuntimeRoot:       cfg.Paths.RuntimeRoot,
		ProfileCookieName: cfg.Paths.AuthCookieName,
		EnvLookup:         os.LookupEnv,
	})
	if err != nil {
		return appBaseServices{}, err
	}
	services.authService = authService
	if modePolicy.IsIDE() {
		services.mcpClient, err = newInternalMCPClient(cfg, logger, authService)
		if err != nil {
			return appBaseServices{}, err
		}
	}
	services.currentSession = authServiceCurrentSessionOrNil(services.authService)
	services.settaServerURL = resolveSettaServerURL(cfg, services.currentSession)
	services.backendLogService, err = backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       logger,
		WebsocketHub: services.websocketHub,
		EnvLookup:    os.LookupEnv,
	})
	if err != nil {
		return appBaseServices{}, err
	}
	return services, nil
}

func closeProjectAndTerminal(projectServices projectServices, terminalService *terminals.Service) error {
	return errors.Join(
		closeInitializedProjectServices(projectServices),
		closeTerminalService(terminalService, context.Background()),
	)
}

func closeTerminalService(service *terminals.Service, ctx context.Context) error {
	if service == nil {
		return nil
	}
	return service.Close(ctx)
}

func initializeAppWorkspaceRuntimeServices(
	cfg config.Config,
	modePolicy modes.Policy,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectServices projectServices,
	services *appWorkspaceServices,
) error {
	var err error
	if modePolicy.IsIDE() {
		services.fileBrowserService, err = filebrowser.NewService(filebrowser.ServiceOptions{
			WorkspaceRoot:        cfg.Paths.WorkspaceRoot,
			SettaFilesRoot:       cfg.Paths.SettaFilesRoot,
			RuntimeRoot:          cfg.Paths.RuntimeRoot,
			GlobalSettaFilesBase: cfg.User.GlobalSettaFilesBase,
			BinaryStore:          services.binaryStore,
			Sessions:             authService,
		})
		if err != nil {
			return err
		}
		services.artifactService, err = artifacts.NewService(artifacts.ServiceOptions{
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			ArtifactsRoot:  projectServices.artifactsRoot,
			BinaryStore:    services.binaryStore,
		})
		if err != nil {
			return err
		}
	}
	if projectServices.deploymentRuntime != nil {
		services.shareArtifactService, err = shareartifacts.NewService(shareartifacts.ServiceOptions{
			Deployment:   projectServices.deploymentRuntime,
			BinaryStore:  services.binaryStore,
			WebsocketHub: websocketHub,
		})
		if err != nil {
			return err
		}
	}
	if projectServices.projectRuntime == nil {
		return nil
	}
	services.attachmentService, err = chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		Host:           cfg.Server.Host,
		Port:           cfg.Server.Port,
		ProjectState:   projectServices.projectRuntime,
		Deployment:     projectServices.deploymentRuntime,
		Sessions:       authService,
	})
	return err
}

func initializeAppWorkspaceIDEHelpers(
	cfg config.Config,
	modePolicy modes.Policy,
	services *appWorkspaceServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	appGenSkillService, err := appgenskills.NewService(appgenskills.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		LookupEnv:     os.LookupEnv,
	})
	if err != nil {
		return err
	}
	services.appGenSkillService = appGenSkillService
	services.pathRevealService, err = pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		Skills:         services.appGenSkillService,
	})
	return err
}

func initializeAppWorkspaceServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectServices projectServices,
) (appWorkspaceServices, error) {
	services := appWorkspaceServices{}
	var err error
	services.terminalService, err = terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = closeInitializedProjectServices(projectServices)
		return appWorkspaceServices{}, err
	}
	services.binaryStore, err = binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	if err := initializeAppWorkspaceRuntimeServices(
		cfg,
		modePolicy,
		authService,
		websocketHub,
		projectServices,
		&services,
	); err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.agentProfileStore, err = agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.promptTemplateStore, err = prompttemplates.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.agenticSummaryStatus, err = agenticsummarycache.NewService(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	if err := initializeAppWorkspaceIDEHelpers(cfg, modePolicy, &services); err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	return services, nil
}

func initializeAppRuntimeServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	appSubsystemCapabilities *appSubsystemCapabilityState,
) (appRuntimeServices, error) {
	services := appRuntimeServices{
		uiSettingRevealResults: realtime.NewUISettingRevealResultHub(),
	}
	var err error
	services.ideAgents, err = initializeIDEAgentServices(
		cfg,
		logger,
		modePolicy,
		appSubsystemCapabilities,
		base.settaServerURL,
		base.currentSession,
		base.authService,
		base.websocketHub,
		projectServices.projectStates,
		projectServices.projectRuntime,
		projectServices.settingsStateRuntime,
		projectServices.deploymentRuntime,
		workspaceServices.terminalService,
		base.mcpClient,
		base.mcpToolRegistry,
		workspaceServices.attachmentService,
		base.backendLogService,
		workspaceServices.promptTemplateStore,
		workspaceServices.agentProfileStore,
	)
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.runPlanner, err = runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectServices.projectRuntime,
		SettaFilesRoot: projectServices.plannerFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.listenerBroadcaster = realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: base.websocketHub,
		TemporaryIDs: services.ideAgents.temporaryIDs,
	})
	services.listenerProducer = realtime.NewListenerProducer(realtime.ListenerProducerOptions{
		Broadcaster:  services.listenerBroadcaster,
		ProjectState: projectServices.projectRuntime,
		Deployment:   projectServices.deploymentRuntime,
	})
	services.promptTemplateWatcher, err = prompttemplates.NewWatcher(prompttemplates.WatcherOptions{
		Store:    workspaceServices.promptTemplateStore,
		Interval: 100 * time.Millisecond,
		OnTemplatesUpdated: func(ctx context.Context, templates []prompttemplates.Template) error {
			_, err := base.websocketHub.BroadcastJSON(
				ctx,
				realtime.NewPromptTemplatesUpdatedMessage(templates),
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			)
			return err
		},
		OnParseError: func(ctx context.Context, _ error) error {
			return base.backendLogService.LogAndBroadcast(ctx, backendlogs.LogRequest{
				Severity: backendlogs.SeverityError,
				Message:  "Failed to parse prompt templates; keeping previous prompts",
			})
		},
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.uiSettingRevealService, err = uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: base.websocketHub,
		Results:   services.uiSettingRevealResults,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.runCodeService, err = runs.NewService(runs.ServiceOptions{
		Planner:           services.runPlanner,
		ProjectState:      projectServices.projectRuntime,
		SettingsState:     projectServices.settingsStateRuntime,
		DeploymentRuntime: projectServices.deploymentRuntime,
		Terminals:         workspaceServices.terminalService,
		BackendLogs:       base.backendLogService,
		BinaryStore:       workspaceServices.binaryStore,
		ListenerProducer:  services.listenerProducer,
		ArtifactsRoot:     projectServices.artifactsRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.detachedRunManager, err = detachedruns.NewManager(detachedruns.ManagerOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	return services, nil
}

func initializeAppDeploymentPublishers(
	cfg config.Config,
	modePolicy modes.Policy,
	services *appPlatformServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	catalogRoot, err := deployments.DefaultCatalogRoot(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.deploymentCatalog, err = deployments.NewCatalog(deployments.CatalogOptions{
		Root: catalogRoot,
	})
	if err != nil {
		return err
	}
	services.sharePublisher, err = deployments.NewSharePublisher(deployments.SharePublisherOptions{
		Catalog:        services.deploymentCatalog,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
	})
	if err != nil {
		return err
	}
	return nil
}

func configureAppPluginRuntime(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	projectServices projectServices,
	websocketHub *realtime.WebsocketHub,
	services *appPlatformServices,
) {
	if projectServices.pluginMutationService == nil {
		return
	}
	if modePolicy.IsIDE() && projectServices.pluginDiscovery != nil {
		services.pluginRuntime = &pluginBackendRuntimeRefresher{
			service:                  projectServices.pluginMutationService,
			logger:                   logger,
			runtimeRoot:              cfg.Paths.RuntimeRoot,
			settings:                 projectServices.settingsStateRuntime,
			lspRouter:                projectServices.lspRouter,
			projectState:             projectServices.projectRuntime,
			projectSync:              projectServices.projectLSPSyncer,
			appSubsystemCapabilities: services.appSubsystemCapabilities,
			watchCodeCapabilities:    services.watchCodeCapabilities,
			reconcileWatchCodeService: func(ctx context.Context) error {
				return reconcileIDEWatchCodeService(ctx, cfg, logger, websocketHub, &projectServices)
			},
		}
		projectServices.pluginMutationService.SetRestartCallback(func(ctx context.Context) (bool, error) {
			if services.pluginRuntime == nil {
				return false, errors.New("plugin backend runtime refresher is not configured")
			}
			if _, err := services.pluginRuntime.Refresh(ctx); err != nil {
				return false, err
			}
			return true, nil
		})
	}
	pluginRouteService := newPluginMutationRuntimeService(
		projectServices.pluginMutationService,
		services.pluginRuntime,
		services.appSubsystemCapabilities,
		services.watchCodeCapabilities,
	)
	pluginRouteService.watchCodeBackendHost = newWatchCodeBackendRouteHost(
		projectServices.projectRuntime,
		services.watchCodeCapabilities,
		websocketHub,
		cfg.Paths.WorkspaceRoot,
	)
	services.pluginRouteService = pluginRouteService
}

func initializeAppMCPServer(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	services *appPlatformServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	mcpServer, err := mcpx.NewServer(mcpx.ServerOptions{
		Logger:                       logger,
		Registry:                     base.mcpToolRegistry,
		WorkspaceRoot:                cfg.Paths.WorkspaceRoot,
		ProjectState:                 projectServices.projectRuntime,
		SkipDefaultAppSubsystemTools: true,
		ContributedUISettingBuilders: []uisettings.RuntimeEntryBuilder{
			func(runtime plugins.PluginRuntimeResponse) ([]uisettings.RuntimeEntry, error) {
				if runtime.FeatureCapabilities == nil {
					return nil, nil
				}
				return appsubsystem.BuildScopedUISettingEntries(
					runtime.FeatureCapabilities.AppSubsystem,
					projectServices.projectRuntime,
					services.pluginRouteService,
				)
			},
		},
		AfterProjectStateMutation: func(ctx context.Context, projectID string) error {
			return broadcastFrontendProjectStateUpdate(
				ctx,
				projectServices.projectStates.Main(),
				base.websocketHub,
				projectServices.projectStates.Main().Snapshot(),
				projectID,
			)
		},
		CodegenTargetValidator:         projectServices.codegenValidator,
		PythonCodegenSectionReconciler: projectServices.pythonMaterializer,
		CodeUpdates:                    projectServices.codeUpdates,
		SettingsState:                  projectServices.settingsStateRuntime,
		SectionNames:                   projectServices.renameRefactors,
		CallableSignatures:             projectServices.lspSignature,
		PluginMutations:                services.pluginRouteService,
		PythonPackages:                 projectServices.pythonPackages,
		LSPDiagnostics:                 projectServices.lspDiagnostics,
		MCPStatuses:                    base.mcpClient,
		Terminals:                      workspaceServices.terminalService,
		DocsRoot:                       filepath.Join(cfg.Paths.WorkspaceRoot, "docs"),
		TemporaryIDMapPath:             mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot),
		AgentProfiles:                  workspaceServices.agentProfileStore,
		PromptTemplates:                workspaceServices.promptTemplateStore,
		ExternalAgentConfigs:           runtimeServices.ideAgents.externalConfigService,
		LLMAPIKeys:                     runtimeServices.ideAgents.llmService,
		AgentRuns:                      runtimeServices.ideAgents.agentRunService,
		UISettingReveals:               runtimeServices.uiSettingRevealService,
		StateMachineRuns:               runtimeServices.ideAgents.stateMachineRuntime,
		ToolInvocations:                runtimeServices.ideAgents.externalAgentRuntime,
	})
	if err != nil {
		return err
	}
	services.mcpServer = mcpServer
	if services.pluginRuntime == nil {
		return nil
	}
	services.pluginRuntime.mcpServer = services.mcpServer
	pluginSnapshot, err := services.pluginRuntime.InitializeAfterProcessStart(context.Background())
	if err != nil {
		_ = errors.Join(
			closeMCPClient(base.mcpClient, context.Background()),
			closeSettingsState(projectServices.settingsStateRuntime),
			services.pluginRuntime.Close(context.Background()),
		)
		return err
	}
	if pluginRouteService, ok := services.pluginRouteService.(*pluginMutationRuntimeService); ok {
		pluginRouteService.commitSnapshot(pluginSnapshot)
	}
	return nil
}

func initializeAppPlatformServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	appSubsystemCapabilities *appSubsystemCapabilityState,
	watchCodeCapabilities *watchCodeCapabilityState,
) (appPlatformServices, error) {
	services := appPlatformServices{
		pluginRouteService:       projectServices.pluginRouteService,
		appSubsystemCapabilities: appSubsystemCapabilities,
		watchCodeCapabilities:    watchCodeCapabilities,
	}
	if err := initializeAppDeploymentPublishers(
		cfg,
		modePolicy,
		&services,
	); err != nil {
		return appPlatformServices{}, err
	}
	configureAppPluginRuntime(
		cfg,
		logger,
		modePolicy,
		projectServices,
		base.websocketHub,
		&services,
	)
	if err := initializeAppMCPServer(
		cfg,
		logger,
		modePolicy,
		base,
		projectServices,
		workspaceServices,
		runtimeServices,
		&services,
	); err != nil {
		return appPlatformServices{}, err
	}
	return services, nil
}

func initializeAppHandlerAndWatchServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	launchServices launchServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	platformServices appPlatformServices,
	watchRefs *projectWatchRefs,
) (appHandlerServices, error) {
	services := appHandlerServices{}
	authRefreshWindowSeconds := int(base.authService.AuthCookieRefreshWindow() / time.Second)
	worktreeName := devworktree.ActiveName()
	statusReadyAt := time.Now().UTC()
	listenerBuiltInInvoker, err := newListenerEndpointInvoker(
		runtimeServices.ideAgents.scriptableChatService,
		projectServices.projectRuntime,
		projectServices.deploymentRuntime,
		runtimeServices.ideAgents.chatSectionChatIDs,
		platformServices.pluginRouteService,
	)
	if err != nil {
		return appHandlerServices{}, err
	}
	handlerDeps := appHandlerDeps{
		cfg:                      cfg,
		logger:                   logger,
		authService:              base.authService,
		trustedOrigins:           launchServices.trustedOrigins,
		modePolicy:               modePolicy,
		projectStates:            projectServices.projectStates,
		projectRuntime:           projectServices.projectRuntime,
		settingsStateRuntime:     projectServices.settingsStateRuntime,
		deploymentRuntime:        projectServices.deploymentRuntime,
		shareSessions:            projectServices.shareSessions,
		attachmentService:        workspaceServices.attachmentService,
		pluginRouteService:       platformServices.pluginRouteService,
		appSubsystemCapabilities: platformServices.appSubsystemCapabilities,
		watchCodeCapabilities:    platformServices.watchCodeCapabilities,
		websocketHub:             base.websocketHub,
		uiSettingRevealResults:   runtimeServices.uiSettingRevealResults,
		listenerBroadcaster:      runtimeServices.listenerBroadcaster,
		listenerBuiltInInvoker:   listenerBuiltInInvoker,
		listenerProducer:         runtimeServices.listenerProducer,
		terminalService:          workspaceServices.terminalService,
		temporaryIDs:             runtimeServices.ideAgents.temporaryIDs,
		mcpServer:                platformServices.mcpServer,
		pathRevealService:        workspaceServices.pathRevealService,
		authRefreshWindowSeconds: authRefreshWindowSeconds,
		worktreeName:             worktreeName,
		statusReadyAt:            statusReadyAt,
		deploymentCatalog:        platformServices.deploymentCatalog,
		sharePublisher:           platformServices.sharePublisher,
		launcherHome:             launchServices.launcherHome,
		launcherManagement:       launchServices.launcherManagement,
		launcherOpenWorkspace:    launchServices.launcherOpenWorkspace,
		launchIntentService:      launchServices.launchIntentService,
		localLaunchService:       launchServices.localLaunchService,
		binaryStore:              workspaceServices.binaryStore,
		fileBrowserService:       workspaceServices.fileBrowserService,
		artifactService:          workspaceServices.artifactService,
		shareArtifactService:     workspaceServices.shareArtifactService,
		runCodeService:           runtimeServices.runCodeService,
		runPlanner:               runtimeServices.runPlanner,
		detachedRunManager:       runtimeServices.detachedRunManager,
		projectShellService:      runtimeServices.ideAgents.projectShellService,
		notificationService:      runtimeServices.ideAgents.notificationService,
		gitReadService:           runtimeServices.ideAgents.gitReadService,
		promptTemplateStore:      workspaceServices.promptTemplateStore,
		chatSectionChatIDs:       runtimeServices.ideAgents.chatSectionChatIDs,
		codegenValidator:         projectServices.codegenValidator,
		pythonMaterializer:       projectServices.pythonMaterializer,
		lspSignature:             projectServices.lspSignature,
		codeUpdates:              projectServices.codeUpdates,
		renameRefactors:          projectServices.renameRefactors,
		managedChatService:       runtimeServices.ideAgents.managedChatService,
		externalAgentSend:        runtimeServices.ideAgents.externalAgentSend,
		externalAgentChats:       runtimeServices.ideAgents.externalAgentChats,
		externalAgentFollow:      runtimeServices.ideAgents.externalAgentFollow,
		externalAgentRuntime:     runtimeServices.ideAgents.externalAgentRuntime,
		transcriptionProfiles:    runtimeServices.ideAgents.transcriptionProfiles,
		transcriptionSessions:    runtimeServices.ideAgents.transcriptionSessions,
		agentProfileStore:        workspaceServices.agentProfileStore,
		promptTemplateWatcher:    runtimeServices.promptTemplateWatcher,
		appGenSkillService:       workspaceServices.appGenSkillService,
		externalConfigService:    runtimeServices.ideAgents.externalConfigService,
		externalPreflight:        runtimeServices.ideAgents.externalPreflight,
		engineStore:              runtimeServices.ideAgents.engineStore,
		llmRuntime:               runtimeServices.ideAgents.llmRuntime,
		llmService:               runtimeServices.ideAgents.llmService,
		agenticSummaryStatus:     workspaceServices.agenticSummaryStatus,
		agentRunStore:            runtimeServices.ideAgents.agentRunStore,
		agentRunRuntime:          runtimeServices.ideAgents.agentRunRuntime,
		runChainRuntime:          runtimeServices.ideAgents.runChainRuntime,
		stateMachineRuntime:      runtimeServices.ideAgents.stateMachineRuntime,
		mcpClient:                base.mcpClient,
		lspDiagnostics:           projectServices.lspDiagnostics,
		lspCompletion:            projectServices.lspCompletion,
		projectLSPSyncer:         projectServices.projectLSPSyncer,
		pluginRuntime:            platformServices.pluginRuntime,
	}
	var refreshAppHandler func() error
	services.handler, refreshAppHandler, err = newRefreshableAppHandler(handlerDeps)
	if err != nil {
		return appHandlerServices{}, err
	}
	if platformServices.pluginRuntime != nil {
		platformServices.pluginRuntime.SetAppHandlerRefresh(refreshAppHandler)
	}
	if modePolicy.IsIDE() {
		services.jsonSourceWatchService, err = newJSONSourceWatchService(jsonSourceWatchServiceOptions{
			ProjectState:  projectServices.projectRuntime,
			WebsocketHub:  base.websocketHub,
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
			Logger:        logger,
		})
		if err != nil {
			return appHandlerServices{}, err
		}
		watchRefs.jsonSourceWatchService = services.jsonSourceWatchService
		if err := syncJSONSourceWatchInputs(
			services.jsonSourceWatchService,
			projectServices.projectRuntime.Snapshot().Document,
			cfg.Paths.WorkspaceRoot,
		); err != nil {
			_ = services.jsonSourceWatchService.Close()
			return appHandlerServices{}, err
		}
		services.artifactWatchService, err = newArtifactWatchService(artifactWatchServiceOptions{
			Artifacts:      workspaceServices.artifactService,
			WebsocketHub:   base.websocketHub,
			ListenerEvents: runtimeServices.listenerProducer,
			Logger:         logger,
		})
		if err != nil {
			_ = services.jsonSourceWatchService.Close()
			return appHandlerServices{}, err
		}
		watchRefs.artifactWatchService = services.artifactWatchService
		if err := syncArtifactWatchInputs(
			services.artifactWatchService,
			projectServices.projectRuntime.Snapshot().Document,
			cfg.Paths.SettaFilesRoot,
		); err != nil {
			_ = errors.Join(
				services.artifactWatchService.Close(),
				services.jsonSourceWatchService.Close(),
			)
			return appHandlerServices{}, err
		}
	}
	if err := runtimeServices.promptTemplateWatcher.Start(context.Background()); err != nil {
		_ = errors.Join(
			runtimeServices.promptTemplateWatcher.Close(),
			closeArtifactWatchService(services.artifactWatchService),
			closeJSONSourceWatchService(services.jsonSourceWatchService),
		)
		return appHandlerServices{}, err
	}
	return services, nil
}
