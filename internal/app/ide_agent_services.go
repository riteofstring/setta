package app

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/chatsections"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/gitread"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/scriptablechat"
	"setta/internal/settingsstate"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/tools"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
)

type ideAgentServices struct {
	agentRunService       *agentruns.Service
	engineStore           *agentruns.EngineStore
	agentRunStore         *agentruns.RunStore
	agentRunRuntime       *agentruns.Runtime
	managedChatService    *managedchat.Service
	stateMachineRuntime   *statemachineruns.Runtime
	scriptableChatService *scriptablechat.Service
	chatSectionChatIDs    *chatsections.Service
	gitReadService        *gitread.Service
	projectShellService   *projectshell.Service
	notificationService   *notifications.Service
	externalConfigStore   *externalagentconfigs.Store
	externalConfigService *externalagentconfigs.Service
	externalPreflight     externalagentconfigs.Checker
	transcriptionProfiles *transcriptionprofiles.Service
	transcriptionSessions *transcriptionsessions.Service
	temporaryIDs          *mcpx.TemporaryIDStore
	externalAgentFollow   *externalagents.FollowService
	externalAgentRuntime  *externalagents.Runtime
	externalAgentChats    *externalagents.Service
	externalAgentSend     *externalagents.SendService
	externalAgentExecutor externalagents.Executor
	llmRuntime            *llmconfig.Runtime
	llmService            *llmconfig.Service
	runChainRuntime       *runchains.Runtime
}

func initializeIDEAgentServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	appSubsystemCapabilities *appSubsystemCapabilityState,
	settaServerURL string,
	currentSession *auth.CurrentSession,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectStates *projectstate.Registry,
	projectRuntime *projectstate.Runtime,
	settingsStateRuntime *settingsstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	mcpClient *mcpx.Client,
	mcpToolRegistry *tools.Registry,
	attachmentService *chatattachments.Service,
	backendLogService *backendlogs.Service,
	promptTemplateStore *prompttemplates.Store,
	agentProfileStore *agentprofiles.Store,
) (ideAgentServices, error) {
	services := ideAgentServices{}
	if !modePolicy.IsIDE() || projectRuntime == nil {
		return services, nil
	}
	appGenerationModes, err := newAppGenerationModeResolver(appSubsystemCapabilities)
	if err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEAgentStoresAndConfigs(cfg, settaServerURL, websocketHub, &services); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDELLMServices(cfg, settaServerURL, agentProfileStore, &services); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEManagedAgentServices(
		cfg,
		websocketHub,
		projectStates,
		projectRuntime,
		settingsStateRuntime,
		terminalService,
		mcpClient,
		attachmentService,
		appGenerationModes,
		&services,
	); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEExternalAgentServices(
		cfg,
		logger,
		settaServerURL,
		currentSession,
		authService,
		websocketHub,
		projectRuntime,
		deploymentRuntime,
		mcpClient,
		mcpToolRegistry,
		attachmentService,
		backendLogService,
		promptTemplateStore,
		agentProfileStore,
		appGenerationModes,
		&services,
	); err != nil {
		return ideAgentServices{}, err
	}
	return services, nil
}

func initializeIDEAgentStoresAndConfigs(
	cfg config.Config,
	settaServerURL string,
	websocketHub *realtime.WebsocketHub,
	services *ideAgentServices,
) error {
	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.engineStore = engineStore

	agentRunStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.agentRunStore = agentRunStore
	services.agentRunStore.AddAfterSaveListener(func(run agentruns.Run) {
		_, _ = websocketHub.BroadcastJSON(
			context.Background(),
			realtime.NewAgentRunUpdatedMessage(run),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		)
	})

	externalConfigStore, err := externalagentconfigs.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.externalConfigStore = externalConfigStore
	services.externalConfigService, err = externalagentconfigs.NewService(externalagentconfigs.ServiceOptions{
		Configs:        externalConfigStore,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaServerURL: settaServerURL,
	})
	if err != nil {
		return err
	}
	if err := services.externalConfigService.SeedDefaultConfigsIfMissing(); err != nil {
		return err
	}
	externalPreflightChecker, err := externalagentconfigs.NewSystemChecker(externalagentconfigs.SystemCheckerOptions{
		WorkspaceRoot:          cfg.Paths.WorkspaceRoot,
		ManagedAPIKeysLockRoot: cfg.Paths.RuntimeRoot,
		ProcessEnv:             llmconfig.CurrentProcessEnv(),
	})
	if err != nil {
		return err
	}
	services.externalPreflight = externalPreflightChecker
	services.temporaryIDs, err = mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot))
	return err
}

func initializeIDELLMServices(
	cfg config.Config,
	settaServerURL string,
	agentProfileStore *agentprofiles.Store,
	services *ideAgentServices,
) error {
	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	llmConfigs, err := llmconfig.Load(
		llmconfig.Path(cfg.Paths.SettaFilesRoot),
		llmconfig.LoadOptions{
			SettaServerURL: settaServerURL,
		},
	)
	if err != nil {
		return err
	}
	services.llmRuntime, err = llmconfig.NewRuntime(llmConfigs)
	if err != nil {
		return err
	}
	workspaceEnv, err := llmconfig.ReadEnvFile(filepath.Join(cfg.Paths.WorkspaceRoot, ".env"))
	if err != nil {
		return err
	}
	services.llmRuntime.UpdateAPIKeys(llmconfig.ResolveRuntimeAPIKeys(
		llmConfigs,
		workspaceEnv,
		llmconfig.CurrentProcessEnv(),
	))
	services.llmService, err = llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:             llmconfig.Path(cfg.Paths.SettaFilesRoot),
		ManagedAPIKeysPath:     llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
		ManagedAPIKeysLockRoot: cfg.Paths.RuntimeRoot,
		Runtime:                services.llmRuntime,
	})
	if err != nil {
		return err
	}
	services.transcriptionProfiles, err = transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: transcriptionStore,
		LLM:      services.llmRuntime,
	})
	if err != nil {
		return err
	}
	services.transcriptionSessions, err = transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
		LLM: services.llmRuntime,
	})
	if err != nil {
		return err
	}
	if err := agentruns.SeedDefaultEngineConfigsIfMissing(services.engineStore); err != nil {
		return err
	}
	if err := agentprofiles.SeedDefaultProfilesIfMissing(agentProfileStore); err != nil {
		return err
	}
	return services.transcriptionProfiles.SeedDefaultProfilesIfMissing()
}

func initializeIDEManagedAgentServices(
	cfg config.Config,
	websocketHub *realtime.WebsocketHub,
	projectStates *projectstate.Registry,
	projectRuntime *projectstate.Runtime,
	settingsStateRuntime *settingsstate.Runtime,
	terminalService *terminals.Service,
	mcpClient *mcpx.Client,
	attachmentService *chatattachments.Service,
	appGenerationModes chatmodes.AppGenerationModeResolver,
	services *ideAgentServices,
) error {
	managedLiveRuntime := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
		Broadcaster: websocketHub,
	})
	agentRunService, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      services.engineStore,
		Runs:         services.agentRunStore,
		LLM:          services.llmRuntime,
		Executor: managedllm.NewExecutor(managedllm.ExecutorOptions{
			Live:        managedLiveRuntime,
			Tools:       mcpClient,
			Attachments: attachmentService,
			ResultFollow: managedllm.NewToolResultFollowEmitter(managedllm.ToolResultFollowEmitterOptions{
				Broadcaster:  websocketHub,
				TemporaryIDs: services.temporaryIDs,
			}),
		}),
		TemporaryIDs: services.temporaryIDs,
		CompletionGuardProvider: func() (bool, error) {
			if settingsStateRuntime == nil {
				return false, errors.New("settings state runtime is not configured")
			}
			return settingsstate.CompletionGuardEnabled(settingsStateRuntime.Snapshot().Document)
		},
	})
	if err != nil {
		return err
	}
	services.agentRunService = agentRunService
	services.agentRunRuntime, err = agentruns.NewRuntime(agentruns.RuntimeOptions{
		Service:        services.agentRunService,
		LiveRunTracker: managedLiveRuntime,
	})
	if err != nil {
		return err
	}
	services.managedChatService, err = managedchat.NewService(managedchat.ServiceOptions{
		ProjectState:       projectRuntime,
		Runs:               services.agentRunStore,
		Engines:            services.engineStore,
		LLM:                services.llmRuntime,
		Starter:            services.agentRunRuntime,
		Live:               managedLiveRuntime,
		Stopper:            services.agentRunRuntime,
		AppGenerationModes: appGenerationModes,
	})
	if err != nil {
		return err
	}
	services.chatSectionChatIDs, err = chatsections.NewService(chatsections.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         services.agentRunStore,
	})
	if err != nil {
		return err
	}
	services.scriptableChatService, err = scriptablechat.NewService(scriptablechat.ServiceOptions{
		Runs:        services.agentRunStore,
		Engines:     services.engineStore,
		LLM:         services.llmRuntime,
		Tools:       mcpClient,
		Broadcaster: websocketHub,
	})
	if err != nil {
		return err
	}
	services.gitReadService, err = gitread.NewService(gitread.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
	})
	if err != nil {
		return err
	}
	services.projectShellService, err = newIDEProjectShellService(
		projectStates,
		projectRuntime,
		settingsStateRuntime,
		terminalService,
		websocketHub,
	)
	if err != nil {
		return err
	}
	notificationStore, err := notifications.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.notificationService, err = notifications.NewService(notifications.ServiceOptions{
		Store: notificationStore,
	})
	return err
}
