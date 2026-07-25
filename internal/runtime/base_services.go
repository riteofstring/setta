package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"setta/internal/agent"
	"setta/internal/appearance"
	"setta/internal/applayout"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/conversationindex"
	"setta/internal/master"
	"setta/internal/narration"
	"setta/internal/speech"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

const masterRuntimeDirectoryName = "master"

type runtimeBaseServices struct {
	appearanceService        *appearance.Service
	appPaneLayoutService     *applayout.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationIndexService *conversationindex.Service
	conversationStore        *conversation.Store
	directorServices         directorServices
	masterInputService       *master.Service
	masterRouteService       *master.RouteService
	masterSessionService     *master.SessionService
	narratorService          *narration.Service
	roleConfigurationService *conversation.RoleConfigurationService
	speechService            *speech.Service
	workspaceService         *workspacesession.Service
	workspaceUIService       *workspaceui.Service
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
		appPaneLayoutService:     foundation.appPaneLayoutService,
		codexManager:             foundation.codexManager,
		conversationService:      foundation.conversationService,
		conversationInputService: foundation.conversationInputService,
		conversationIndexService: foundation.conversationIndexService,
		conversationStore:        foundation.conversationStore,
		directorServices:         foundation.directorServices,
		masterInputService:       foundation.masterInputService,
		masterRouteService:       foundation.masterRouteService,
		masterSessionService:     foundation.masterSessionService,
		narratorService:          foundation.narratorService,
		roleConfigurationService: foundation.roleConfigurationService,
		speechService:            speechService,
		workspaceService:         foundation.workspaceService,
		workspaceUIService:       foundation.workspaceUIService,
	}, nil
}

func shutdownRuntimeFoundation(foundation runtimeFoundation, timeout time.Duration) {
	serviceCtx, cancelServices := context.WithTimeout(context.Background(), timeout)
	if foundation.masterRouteService != nil {
		_ = foundation.masterRouteService.Shutdown(serviceCtx)
	}
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
	if services.masterRouteService != nil {
		_ = services.masterRouteService.Shutdown(serviceCtx)
	}
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
	appPaneLayoutService     *applayout.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationIndexService *conversationindex.Service
	conversationStore        *conversation.Store
	directorServices         directorServices
	masterInputService       *master.Service
	masterRouteService       *master.RouteService
	masterSessionService     *master.SessionService
	narratorService          *narration.Service
	roleConfigurationService *conversation.RoleConfigurationService
	workspaceService         *workspacesession.Service
	workspaceUIService       *workspaceui.Service
}

type runtimeAgentServices struct {
	codexManager         *codexapp.Manager
	agentRuntime         *agent.Runtime
	globalRoleResolver   *conversation.MasterRoleConfigurationResolver
	masterSessionService *master.SessionService
	narratorService      *narration.Service
}

type runtimeConversationServices struct {
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
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
	appPaneLayoutService, err := newAppPaneLayoutService(config.AppDataDir, conversationStore)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, err
	}
	workspaceUIService, err := newWorkspaceUIService(
		config.AppDataDir,
		workspaceService,
		conversationStore,
	)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, err
	}
	conversationIndexService, err := conversationindex.NewService(conversationStore, workspaceService)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create conversation index service: %w", err)
	}
	agentServices, err := newRuntimeAgentServices(config, conversationStore, workspaceService)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, err
	}
	codexManager := agentServices.codexManager
	masterSessionService := agentServices.masterSessionService
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
	conversationInputService := conversationServices.conversationInputService
	directorRuntime, err := newDirectorServices(
		config.AppDataDir,
		conversationStore,
		workspaceService,
		conversationService,
		agentServices.globalRoleResolver,
		agentServices.agentRuntime,
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
		appPaneLayoutService:     appPaneLayoutService,
		codexManager:             codexManager,
		conversationService:      conversationService,
		conversationInputService: conversationInputService,
		conversationIndexService: conversationIndexService,
		conversationStore:        conversationStore,
		directorServices:         directorRuntime,
		masterSessionService:     masterSessionService,
		narratorService:          narratorService,
		roleConfigurationService: roleConfigurationService,
		workspaceService:         workspaceService,
		workspaceUIService:       workspaceUIService,
	}
	return attachMasterRouteService(config, foundation)
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
	executor, err := newConversationRouteCommandExecutor(store, service, narrator)
	if err == nil {
		err = narrator.AttachConversationRouteCommandExecutor(executor)
	}
	if err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator, agentRuntime.Manager())
		return runtimeConversationServices{}, fmt.Errorf("attach conversation route command executor: %w", err)
	}
	inputService, err := newConversationInputService(store, narrator)
	if err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator, agentRuntime.Manager())
		return runtimeConversationServices{}, err
	}
	if err := recoverRuntimeConversationServices(service, narrator); err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator, agentRuntime.Manager())
		return runtimeConversationServices{}, err
	}
	return runtimeConversationServices{
		conversationService:      service,
		conversationInputService: inputService,
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

func attachMasterRouteService(
	config Config,
	foundation runtimeFoundation,
) (runtimeFoundation, error) {
	executor, err := newMasterRouteCommandExecutor(
		foundation.conversationStore,
		foundation.conversationService,
		foundation.narratorService,
	)
	if err != nil {
		shutdownRuntimeFoundation(foundation, config.ShutdownTimeout)
		return runtimeFoundation{}, fmt.Errorf("create master route command executor: %w", err)
	}
	routeService, err := master.NewRouteService(
		foundation.conversationStore,
		foundation.conversationIndexService,
		foundation.workspaceService,
		foundation.masterSessionService,
		executor,
	)
	if err != nil {
		shutdownRuntimeFoundation(foundation, config.ShutdownTimeout)
		return runtimeFoundation{}, fmt.Errorf("create master route service: %w", err)
	}
	foundation.masterRouteService = routeService
	inputService, err := master.NewRoutedService(foundation.conversationStore, routeService)
	if err != nil {
		shutdownRuntimeFoundation(foundation, config.ShutdownTimeout)
		return runtimeFoundation{}, fmt.Errorf("create routed master input service: %w", err)
	}
	foundation.masterInputService = inputService
	return foundation, nil
}

func newRuntimeAgentServices(
	config Config,
	conversationStore *conversation.Store,
	workspaceService *workspacesession.Service,
) (runtimeAgentServices, error) {
	agentRuntime := agent.NewRuntime(agent.Config{
		ExcludedEnv: []string{speech.APIKeyEnvironmentVariable},
		Version:     config.Version,
	})
	codexManager := agentRuntime.Manager()
	// The app-global routing role is resolved once and shared. The Director
	// decides under the same durable role profile, so a model, effort, or
	// permission change reaches both without a second source of truth.
	globalRoleResolver, err := conversation.NewMasterRoleConfigurationResolver(conversationStore, agentRuntime)
	if err != nil {
		shutdownCodexManager(codexManager, config.ShutdownTimeout)
		return runtimeAgentServices{}, fmt.Errorf("create global routing role resolver: %w", err)
	}
	masterSessionService, err := newMasterSessionService(
		config.AppDataDir,
		conversationStore,
		globalRoleResolver,
		agentRuntime,
	)
	if err != nil {
		shutdownCodexManager(codexManager, config.ShutdownTimeout)
		return runtimeAgentServices{}, err
	}
	narratorService, err := narration.NewService(conversationStore, workspaceService, agentRuntime)
	if err != nil {
		shutdownCodexManager(codexManager, config.ShutdownTimeout)
		return runtimeAgentServices{}, fmt.Errorf("create narrator service: %w", err)
	}
	return runtimeAgentServices{
		codexManager:         codexManager,
		agentRuntime:         agentRuntime,
		globalRoleResolver:   globalRoleResolver,
		masterSessionService: masterSessionService,
		narratorService:      narratorService,
	}, nil
}

func newMasterSessionService(
	appDataDir string,
	store *conversation.Store,
	roles master.RoleConfigurationResolver,
	agentRuntime *agent.Runtime,
) (*master.SessionService, error) {
	workspaceRoot := filepath.Join(filepath.Clean(appDataDir), masterRuntimeDirectoryName)
	if err := os.MkdirAll(workspaceRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create master runtime directory: %w", err)
	}
	service, err := master.NewSessionService(store, roles, agentRuntime, workspaceRoot)
	if err != nil {
		return nil, fmt.Errorf("create master session service: %w", err)
	}
	return service, nil
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
	if err := narratorService.RecoverConversationInputs(context.Background()); err != nil {
		return fmt.Errorf("recover conversation input routing: %w", err)
	}
	if err := narratorService.RecoverTerminalProjections(context.Background()); err != nil {
		return fmt.Errorf("recover terminal narrator projections: %w", err)
	}
	return nil
}

func newConversationInputService(
	store *conversation.Store,
	router conversation.ConversationInputRoutingNotifier,
) (*conversation.InputService, error) {
	service, err := conversation.NewRoutedInputService(store, router)
	if err != nil {
		return nil, fmt.Errorf("create conversation input service: %w", err)
	}
	if _, err := store.RecoverConversationInputRouting(
		context.Background(),
		time.Now().UTC().Format(time.RFC3339Nano),
	); err != nil {
		return nil, fmt.Errorf("recover conversation input routing: %w", err)
	}
	return service, nil
}
