package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"setta/internal/agent"
	"setta/internal/appearance"
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
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationIndexService *conversationindex.Service
	conversationStore        *conversation.Store
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
	speechService, err := newSpeechService(config.Speech, foundation.conversationStore)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	closeFoundationOnFailure = false
	return runtimeBaseServices{
		appearanceService:        foundation.appearanceService,
		codexManager:             foundation.codexManager,
		conversationService:      foundation.conversationService,
		conversationInputService: foundation.conversationInputService,
		conversationIndexService: foundation.conversationIndexService,
		conversationStore:        foundation.conversationStore,
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
	managerCtx, cancelManager := context.WithTimeout(context.Background(), timeout)
	_ = foundation.codexManager.Shutdown(managerCtx)
	cancelManager()
	_ = foundation.conversationStore.Close()
}

type runtimeFoundation struct {
	appearanceService        *appearance.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationIndexService *conversationindex.Service
	conversationStore        *conversation.Store
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
		_ = conversationStore.Close()
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
	foundation := runtimeFoundation{
		appearanceService:        appearanceService,
		codexManager:             codexManager,
		conversationService:      conversationService,
		conversationInputService: conversationInputService,
		conversationIndexService: conversationIndexService,
		conversationStore:        conversationStore,
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
		shutdownRuntimeConversationServices(config, store, nil, narrator)
		return runtimeConversationServices{}, fmt.Errorf("create conversation service: %w", err)
	}
	executor, err := newConversationRouteCommandExecutor(store, service, narrator)
	if err == nil {
		err = narrator.AttachConversationRouteCommandExecutor(executor)
	}
	if err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator)
		return runtimeConversationServices{}, fmt.Errorf("attach conversation route command executor: %w", err)
	}
	inputService, err := newConversationInputService(store, narrator)
	if err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator)
		return runtimeConversationServices{}, err
	}
	if err := recoverRuntimeConversationServices(service, narrator); err != nil {
		shutdownRuntimeConversationServices(config, store, service, narrator)
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
) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()
	if service != nil {
		_ = service.Shutdown(shutdownCtx)
	}
	_ = narrator.Shutdown(shutdownCtx)
	_ = store.Close()
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
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()
		_ = foundation.conversationService.Shutdown(shutdownCtx)
		_ = foundation.narratorService.Shutdown(shutdownCtx)
		_ = foundation.codexManager.Shutdown(shutdownCtx)
		_ = foundation.conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create master route service: %w", err)
	}
	inputService, err := master.NewRoutedService(foundation.conversationStore, routeService)
	if err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()
		_ = routeService.Shutdown(shutdownCtx)
		_ = foundation.conversationService.Shutdown(shutdownCtx)
		_ = foundation.narratorService.Shutdown(shutdownCtx)
		_ = foundation.codexManager.Shutdown(shutdownCtx)
		_ = foundation.conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create routed master input service: %w", err)
	}
	foundation.masterInputService = inputService
	foundation.masterRouteService = routeService
	return foundation, nil
}

func newRuntimeAgentServices(
	config Config,
	conversationStore *conversation.Store,
	workspaceService *workspacesession.Service,
) (runtimeAgentServices, error) {
	agentRuntime := agent.NewRuntime(agent.Config{
		Command:     config.CodexCommand,
		ExcludedEnv: []string{speech.APIKeyEnvironmentVariable},
		Version:     config.Version,
	})
	codexManager := agentRuntime.Manager()
	masterSessionService, err := newMasterSessionService(config.AppDataDir, conversationStore, agentRuntime)
	if err != nil {
		return runtimeAgentServices{}, err
	}
	narratorService, err := narration.NewService(conversationStore, workspaceService, agentRuntime)
	if err != nil {
		return runtimeAgentServices{}, fmt.Errorf("create narrator service: %w", err)
	}
	return runtimeAgentServices{
		codexManager:         codexManager,
		agentRuntime:         agentRuntime,
		masterSessionService: masterSessionService,
		narratorService:      narratorService,
	}, nil
}

func newMasterSessionService(
	appDataDir string,
	store *conversation.Store,
	agentRuntime *agent.Runtime,
) (*master.SessionService, error) {
	workspaceRoot := filepath.Join(filepath.Clean(appDataDir), masterRuntimeDirectoryName)
	if err := os.MkdirAll(workspaceRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create master runtime directory: %w", err)
	}
	roles, err := conversation.NewMasterRoleConfigurationResolver(store, agentRuntime)
	if err != nil {
		return nil, fmt.Errorf("create master role configuration resolver: %w", err)
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
	if err := narratorService.RecoverCommittedTrajectory(context.Background()); err != nil {
		return fmt.Errorf("recover narrator trajectory: %w", err)
	}
	if err := narratorService.RecoverConversationInputs(context.Background()); err != nil {
		return fmt.Errorf("recover conversation input routing: %w", err)
	}
	return nil
}

func newConversationInputService(
	store *conversation.Store,
	router conversation.ConversationInputRoutingNotifier,
) (*conversation.InputService, error) {
	service, err := conversation.NewRoutedInputService(store, router)
	if err != nil {
		_ = store.Close()
		return nil, fmt.Errorf("create conversation input service: %w", err)
	}
	if _, err := store.RecoverConversationInputRouting(
		context.Background(),
		time.Now().UTC().Format(time.RFC3339Nano),
	); err != nil {
		_ = store.Close()
		return nil, fmt.Errorf("recover conversation input routing: %w", err)
	}
	return service, nil
}
