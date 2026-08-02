package runtime

import (
	"context"
	"fmt"
	"time"

	"setta/internal/agent"
	"setta/internal/appearance"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/narration"
	"setta/internal/speech"
	"setta/internal/workspacesession"
)

type runtimeBaseServices struct {
	appearanceService        *appearance.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationStore        *conversation.Store
	directorServices         directorServices
	narratorService          *narration.Service
	roleConfigurationService *conversation.RoleConfigurationService
	speechService            *speech.Service
	workspaceService         *workspacesession.Service
}

func newRuntimeBaseServices(config Config) (runtimeBaseServices, error) {
	foundation, err := newRuntimeFoundation(config)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	closeFoundationOnFailure := true
	defer func() {
		if closeFoundationOnFailure {
			shutdownRuntimeFoundation(foundation, config.ShutdownTimeout)
		}
	}()
	speechService, err := newSpeechService(
		config.Speech,
		config.SpeechStartupAPIKey,
		foundation.conversationStore,
	)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	closeFoundationOnFailure = false
	return runtimeBaseServices{
		appearanceService:        foundation.appearanceService,
		codexManager:             foundation.codexManager,
		conversationService:      foundation.conversationService,
		conversationStore:        foundation.conversationStore,
		directorServices:         foundation.directorServices,
		narratorService:          foundation.narratorService,
		roleConfigurationService: foundation.roleConfigurationService,
		speechService:            speechService,
		workspaceService:         foundation.workspaceService,
	}, nil
}

func shutdownRuntimeFoundation(foundation runtimeFoundation, timeout time.Duration) {
	serviceCtx, cancelServices := context.WithTimeout(context.Background(), timeout)
	_ = foundation.conversationService.Shutdown(serviceCtx)
	_ = foundation.narratorService.Shutdown(serviceCtx)
	cancelServices()
	closeDirectorServices(foundation.directorServices)
	_ = foundation.conversationStore.Close()
	shutdownCodexManager(foundation.codexManager, timeout)
}

// shutdownRuntimeBaseServices closes a fully assembled base after a later
// startup step fails. The Director follower must stop before its durable store,
// just as it does during normal server shutdown.
func shutdownRuntimeBaseServices(services runtimeBaseServices, timeout time.Duration) {
	serviceCtx, cancelServices := context.WithTimeout(context.Background(), timeout)
	if services.conversationService != nil {
		_ = services.conversationService.Shutdown(serviceCtx)
	}
	if services.narratorService != nil {
		_ = services.narratorService.Shutdown(serviceCtx)
	}
	if services.speechService != nil {
		_ = services.speechService.Shutdown(serviceCtx)
	}
	cancelServices()
	closeDirectorServices(services.directorServices)
	if services.conversationStore != nil {
		_ = services.conversationStore.Close()
	}
	shutdownCodexManager(services.codexManager, timeout)
}

func shutdownCodexManager(manager *codexapp.Manager, timeout time.Duration) {
	if manager == nil {
		return
	}
	managerCtx, cancelManager := context.WithTimeout(context.Background(), timeout)
	_ = manager.Shutdown(managerCtx)
	cancelManager()
}

type runtimeFoundation struct {
	appearanceService        *appearance.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationStore        *conversation.Store
	directorServices         directorServices
	narratorService          *narration.Service
	roleConfigurationService *conversation.RoleConfigurationService
	workspaceService         *workspacesession.Service
}

type runtimeAgentServices struct {
	codexManager       *codexapp.Manager
	agentRuntime       *agent.Runtime
	globalRoleResolver *conversation.DirectorRoleConfigurationResolver
	narratorService    *narration.Service
}

type runtimeConversationServices struct {
	conversationService *conversation.Service
}

func newRuntimeFoundation(config Config) (runtimeFoundation, error) {
	appearanceService, err := newAppearanceService(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, err
	}
	workspaceService, err := newWorkspaceService(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, err
	}
	conversationStore, err := conversation.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, fmt.Errorf("create conversation store: %w", err)
	}
	agentServices, err := newRuntimeAgentServices(config, conversationStore, workspaceService)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, err
	}
	codexManager := agentServices.codexManager
	narratorService := agentServices.narratorService
	roleConfigurationService, err := conversation.NewRoleConfigurationService(
		conversationStore,
		agentServices.agentRuntime,
	)
	if err != nil {
		shutdownRuntimeConversationServices(
			config,
			conversationStore,
			nil,
			narratorService,
			codexManager,
		)
		return runtimeFoundation{}, fmt.Errorf("create role configuration service: %w", err)
	}
	conversationServices, err := newRuntimeConversationServices(
		config,
		conversationStore,
		workspaceService,
		agentServices.agentRuntime,
		narratorService,
	)
	if err != nil {
		return runtimeFoundation{}, err
	}
	conversationService := conversationServices.conversationService
	directorRuntime, err := newDirectorServices(
		config.AppDataDir,
		conversationStore,
		workspaceService,
		conversationService,
		agentServices.globalRoleResolver,
		agentServices.agentRuntime,
		narratorService,
	)
	if err != nil {
		shutdownRuntimeConversationServices(
			config,
			conversationStore,
			conversationService,
			narratorService,
			codexManager,
		)
		return runtimeFoundation{}, err
	}
	foundation := runtimeFoundation{
		appearanceService:        appearanceService,
		codexManager:             codexManager,
		conversationService:      conversationService,
		conversationStore:        conversationStore,
		directorServices:         directorRuntime,
		narratorService:          narratorService,
		roleConfigurationService: roleConfigurationService,
		workspaceService:         workspaceService,
	}
	return foundation, nil
}

func newRuntimeConversationServices(
	config Config,
	store *conversation.Store,
	workspaces *workspacesession.Service,
	agentRuntime *agent.Runtime,
	narrator *narration.Service,
) (runtimeConversationServices, error) {
	service, err := conversation.NewService(
		store,
		workspaces,
		agentRuntime,
		conversation.WithNarrationTrajectoryObserver(narrator),
	)
	if err != nil {
		shutdownRuntimeConversationServices(config, store, nil, narrator, agentRuntime.Manager())
		return runtimeConversationServices{}, fmt.Errorf("create conversation service: %w", err)
	}
	if err := recoverRuntimeConversationServices(service, narrator); err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator, agentRuntime.Manager())
		return runtimeConversationServices{}, err
	}
	return runtimeConversationServices{
		conversationService: service,
	}, nil
}

func shutdownRuntimeConversationServices(
	config Config,
	store *conversation.Store,
	service *conversation.Service,
	narrator *narration.Service,
	manager *codexapp.Manager,
) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()
	if service != nil {
		_ = service.Shutdown(shutdownCtx)
	}
	if narrator != nil {
		_ = narrator.Shutdown(shutdownCtx)
	}
	if store != nil {
		_ = store.Close()
	}
	shutdownCodexManager(manager, config.ShutdownTimeout)
}

func newRuntimeAgentServices(
	config Config,
	conversationStore *conversation.Store,
	workspaceService *workspacesession.Service,
) (runtimeAgentServices, error) {
	agentRuntime := agent.NewRuntime(agent.Config{
		ExcludedEnv:           []string{speech.APIKeyEnvironmentVariable},
		RestrictExternalTools: config.RestrictAgentExternalTools,
		TokenUsageObserver:    config.TokenUsageObserver,
		Version:               config.Version,
	})
	codexManager := agentRuntime.Manager()
	// The app-global Director role is resolved from its durable profile when
	// its provider thread starts and again for each conversational turn.
	globalRoleResolver, err := conversation.NewDirectorRoleConfigurationResolver(conversationStore, agentRuntime)
	if err != nil {
		shutdownCodexManager(codexManager, config.ShutdownTimeout)
		return runtimeAgentServices{}, fmt.Errorf("create global Director role resolver: %w", err)
	}
	narratorService, err := narration.NewService(conversationStore, workspaceService, agentRuntime)
	if err != nil {
		shutdownCodexManager(codexManager, config.ShutdownTimeout)
		return runtimeAgentServices{}, fmt.Errorf("create narrator service: %w", err)
	}
	return runtimeAgentServices{
		codexManager:       codexManager,
		agentRuntime:       agentRuntime,
		globalRoleResolver: globalRoleResolver,
		narratorService:    narratorService,
	}, nil
}

func recoverRuntimeConversationServices(
	conversationService *conversation.Service,
	narratorService *narration.Service,
) error {
	if err := conversationService.RecoverAgentTurns(context.Background()); err != nil {
		return fmt.Errorf("recover agent turns: %w", err)
	}
	if err := conversationService.RecoverSideConversations(context.Background()); err != nil {
		return fmt.Errorf("recover side conversations: %w", err)
	}
	if err := narratorService.RecoverTerminalProjections(context.Background()); err != nil {
		return fmt.Errorf("recover terminal narrator projections: %w", err)
	}
	return nil
}
