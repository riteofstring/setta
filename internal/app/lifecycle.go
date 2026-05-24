package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"setta/internal/agentruns"
	"setta/internal/artifactwatch"
	"setta/internal/auth"
	"setta/internal/boundcode"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/jsonsourcewatch"
	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/runtime"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"
	"setta/internal/transcriptionsessions"
	"setta/internal/watchcode"
)

func startAppBackgroundServices(
	modePolicy modes.Policy,
	manager *runtime.Manager,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	listenerBroadcaster *realtime.ListenerBroadcaster,
	shareArtifactService *shareartifacts.Service,
	transcriptionSessions *transcriptionsessions.Service,
	mcpClient *mcpx.Client,
) {
	if deploymentRuntime != nil {
		manager.Go("deployment-session-cleanup", func(ctx context.Context) error {
			return runDeploymentSessionCleanupLoop(
				ctx,
				deploymentRuntime,
				terminalService,
				listenerBroadcaster,
				shareArtifactService,
				0,
			)
		})
	}
	if modePolicy.IsIDE() && transcriptionSessions != nil {
		manager.Go("transcription-session-cleanup", func(ctx context.Context) error {
			return runTranscriptionSessionCleanupLoop(ctx, transcriptionSessions, 0)
		})
	}
	if mcpClient != nil {
		mcpClient.Start(context.Background())
	}
}

func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	if logger == nil {
		logger = observability.NewLogger(cfg.Server.LogLevel, os.Stderr)
	}

	modePolicy := modes.NewPolicy(cfg.Server.Mode)
	baseServices, err := initializeAppBaseServices(cfg, logger, modePolicy)
	if err != nil {
		return nil, err
	}
	watchRefs := &projectWatchRefs{}
	launchServices, err := initializeLaunchServices(cfg, baseServices.authService, modePolicy)
	if err != nil {
		return nil, err
	}
	projectServices, err := initializeProjectServices(
		cfg,
		logger,
		modePolicy,
		baseServices.websocketHub,
		watchRefs,
	)
	if err != nil {
		return nil, err
	}
	workspaceServices, err := initializeAppWorkspaceServices(
		cfg,
		logger,
		modePolicy,
		baseServices.authService,
		baseServices.websocketHub,
		projectServices,
	)
	if err != nil {
		return nil, err
	}
	appSubsystemCapabilities, watchCodeCapabilities, err := ensureProjectPluginFeatureCapabilities(&projectServices)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	runtimeServices, err := initializeAppRuntimeServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		projectServices,
		workspaceServices,
		appSubsystemCapabilities,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	platformServices, err := initializeAppPlatformServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		projectServices,
		workspaceServices,
		runtimeServices,
		appSubsystemCapabilities,
		watchCodeCapabilities,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	handlerServices, err := initializeAppHandlerAndWatchServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		launchServices,
		projectServices,
		workspaceServices,
		runtimeServices,
		platformServices,
		watchRefs,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	startAppBackgroundServices(
		modePolicy,
		baseServices.manager,
		projectServices.deploymentRuntime,
		workspaceServices.terminalService,
		runtimeServices.listenerBroadcaster,
		workspaceServices.shareArtifactService,
		runtimeServices.ideAgents.transcriptionSessions,
		baseServices.mcpClient,
	)

	return &App{
		config:          cfg,
		logger:          logger,
		authService:     baseServices.authService,
		runtime:         baseServices.manager,
		projectStates:   projectServices.projectStates,
		deployment:      projectServices.deploymentRuntime,
		shareSessions:   projectServices.shareSessions,
		terminals:       workspaceServices.terminalService,
		binaryStore:     workspaceServices.binaryStore,
		runCode:         runtimeServices.runCodeService,
		agentRuns:       runtimeServices.ideAgents.agentRunService,
		agentRuntime:    runtimeServices.ideAgents.agentRunRuntime,
		runChains:       runtimeServices.ideAgents.runChainRuntime,
		settingsState:   projectServices.settingsStateRuntime,
		websocketHub:    baseServices.websocketHub,
		listeners:       runtimeServices.listenerBroadcaster,
		lspSync:         projectServices.projectLSPSyncer,
		watchCodeRef:    projectServices.watchCodeServiceRef,
		jsonSourceWatch: handlerServices.jsonSourceWatchService,
		artifactWatch:   handlerServices.artifactWatchService,
		boundCode:       projectServices.boundCodeService,
		promptWatcher:   runtimeServices.promptTemplateWatcher,
		mcpServer:       platformServices.mcpServer,
		mcpClient:       baseServices.mcpClient,
		pluginRuntime:   platformServices.pluginRuntime,
		handler:         handlerServices.handler,
	}, nil
}

func (a *App) Config() config.Config {
	return a.config
}

func (a *App) Handler() http.Handler {
	return a.handler
}

func (a *App) Runtime() *runtime.Manager {
	return a.runtime
}

func (a *App) Auth() *auth.Service {
	return a.authService
}

func (a *App) ProjectStates() *projectstate.Registry {
	return a.projectStates
}

func (a *App) SettingsState() *settingsstate.Runtime {
	return a.settingsState
}

func newAppNotificationID() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (a *App) Terminals() *terminals.Service {
	return a.terminals
}

func (a *App) Shutdown(ctx context.Context) error {
	return errors.Join(
		a.promptWatcher.Close(),
		closeArtifactWatchService(a.artifactWatch),
		closeJSONSourceWatchService(a.jsonSourceWatch),
		closeManagedAgentRuntime(a.agentRuntime, ctx),
		closeProjectStateServices(a.projectStates, a.deployment, a.lspSync, a.watchCodeRef, a.boundCode, ctx),
		closeMCPClient(a.mcpClient, ctx),
		closeSettingsState(a.settingsState),
		a.pluginRuntime.Close(ctx),
		a.terminals.Close(ctx),
		a.runtime.Shutdown(ctx),
	)
}

func closeProjectResources(projectStates *projectstate.Registry, deploymentRuntime *deployments.Runtime) error {
	return errors.Join(closeProjectStates(projectStates), closeDeploymentRuntime(deploymentRuntime))
}

func closeProjectStateServices(
	projectStates *projectstate.Registry,
	deploymentRuntime *deployments.Runtime,
	syncer *lsp.ProjectSynchronizer,
	watchServiceRef *watchCodeServiceRef,
	boundCodeService *boundcode.Service,
	ctx context.Context,
) error {
	return errors.Join(
		closeBoundCodeService(boundCodeService),
		watchServiceRef.Close(),
		closeLSPProjectSynchronizer(syncer, ctx),
		closeProjectResources(projectStates, deploymentRuntime),
	)
}

func closeManagedAgentRuntime(runtime *agentruns.Runtime, ctx context.Context) error {
	if runtime == nil {
		return nil
	}
	return runtime.Shutdown(ctx)
}

func closeProjectStates(projectStates *projectstate.Registry) error {
	if projectStates == nil {
		return nil
	}
	return projectStates.Close()
}

func closeDeploymentRuntime(deploymentRuntime *deployments.Runtime) error {
	if deploymentRuntime == nil {
		return nil
	}
	return deploymentRuntime.Close()
}

func closeLSPProjectSynchronizer(syncer *lsp.ProjectSynchronizer, ctx context.Context) error {
	if syncer == nil {
		return nil
	}
	return syncer.Close(ctx)
}

func closeWatchCodeService(service *watchcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeBoundCodeService(service *boundcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeJSONSourceWatchService(service *jsonsourcewatch.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeArtifactWatchService(service *artifactwatch.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func boundCodeServiceInputs(inputs []projectstate.BoundCodeFileInput) []boundcode.FileInput {
	serviceInputs := make([]boundcode.FileInput, 0, len(inputs))
	for _, input := range inputs {
		bindings := make([]boundcode.Binding, 0, len(input.Bindings))
		for _, binding := range input.Bindings {
			bindings = append(bindings, boundcode.Binding{
				ProjectID: binding.ProjectID,
				SectionID: binding.SectionID,
			})
		}
		serviceInputs = append(serviceInputs, boundcode.FileInput{
			Path:     input.Path,
			Bindings: bindings,
		})
	}
	return serviceInputs
}

func newInternalMCPClient(cfg config.Config, logger *slog.Logger, authService *auth.Service) (*mcpx.Client, error) {
	serverConfigs, err := mcpx.LoadServerConfigs(
		mcpx.LLMConfigPath(cfg.Paths.SettaFilesRoot),
		mcpx.LoadServerConfigsOptions{
			SettaServerURL: resolveSettaServerURL(
				cfg,
				authServiceCurrentSessionOrNil(authService),
			),
		},
	)
	if err != nil {
		return nil, err
	}

	return mcpx.NewClient(mcpx.ClientOptions{
		Logger:  logger,
		Servers: serverConfigs,
		HeaderProvider: func(serverID string) (http.Header, error) {
			if serverID != mcpx.DefaultServerID {
				return nil, nil
			}
			return buildInternalMCPHeaders(authService)
		},
	})
}

func buildInternalMCPHeaders(authService *auth.Service) (http.Header, error) {
	if authService == nil {
		return nil, nil
	}
	session, ok := authService.CurrentSession()
	if !ok {
		return nil, auth.ErrMissingCurrentSession
	}
	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		return nil, err
	}
	cookieName, err := authService.CookieName(session.Metadata.ID)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Cookie", cookieName+"="+token)
	return headers, nil
}

func closeMCPClient(client *mcpx.Client, ctx context.Context) error {
	if client == nil {
		return nil
	}
	return client.Close(ctx)
}

func closeSettingsState(runtime *settingsstate.Runtime) error {
	if runtime == nil {
		return nil
	}
	return runtime.Close()
}
