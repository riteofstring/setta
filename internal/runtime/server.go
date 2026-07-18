package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/httpapi"
	"setta/internal/localcredissuer"
	"setta/internal/notify"
	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/webapp"
	"setta/internal/workspace"
	"setta/internal/workspaceactivity"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

const (
	e2eChatFailFirstTranscriptBlockIDEnv          = "SETTA_E2E_CHAT_FAIL_FIRST_TRANSCRIPT_BLOCK_ID"
	e2eChatFailPostCommitStartupPointEnv          = "SETTA_E2E_CHAT_FAIL_POST_COMMIT_STARTUP_POINT"
	e2eChatFailPostCommitStartupAttemptEnv        = "SETTA_E2E_CHAT_FAIL_POST_COMMIT_STARTUP_ATTEMPT"
	e2eWorkflowFailFirstRunnerPostStartPersistEnv = "SETTA_E2E_WORKFLOW_FAIL_FIRST_RUNNER_POST_START_PERSIST"
)

const (
	httpMaxHeaderBytes    = 1 * 1024 * 1024
	httpReadHeaderTimeout = 5 * time.Second
	httpReadTimeout       = 30 * time.Second
)

type ReadyEvent struct {
	Event             string `json:"event"`
	Addr              string `json:"addr"`
	BootstrapToken    string `json:"bootstrapToken,omitempty"`
	LocalPairingToken string `json:"localPairingToken,omitempty"`
	ProtocolVersion   int    `json:"protocolVersion"`
}

type Server struct {
	closeCartographerEvents func(context.Context) error
	closeSemanticStore      func() error
	closeTerminal           func(context.Context) error
	closeWorkspaceActivity  func()
	closeWorkflowStore      func() error
	closeEvents             func()
	closeRuntimeAuth        func() error
	closeNotify             func() error
	closeWorkflowEvents     func()
	drainChatTurns          func(context.Context) error
	codexManager            *codexapp.Manager
	server                  *http.Server
	listener                net.Listener
	done                    chan error
}

type runtimeServices struct {
	appearanceService         *appearance.Service
	authStore                 *runtimeauth.Store
	bootstrapToken            string
	localPairingToken         string
	localCredentialIssuer     *localcredissuer.Service
	chatService               *chat.Service
	codexAccountService       *codexaccount.Service
	codexManager              *codexapp.Manager
	notifyService             *notify.Service
	runtimeDiagnosticsService *runtimeDiagnosticsService
	semanticGraphService      *semanticgraph.Service
	semanticGraphStore        *semanticgraph.Store
	terminalService           *terminal.Manager
	workspaceActivityService  *workspaceactivity.Service
	workspaceUIService        *workspaceui.Service
	workspaceService          *workspacesession.Service
	workflowService           *orchestrator.Service
	workflowStore             *orchestrator.Store
	runtimeIdentityManager    *runtimeIdentityManager
	runtimeSetupStore         *runtimesetup.Store
	infrastructureProvider    httpapi.RuntimeInfrastructureProvider
}

type runtimeAuthBootstrap struct {
	identityManager        *runtimeIdentityManager
	infrastructureProvider httpapi.RuntimeInfrastructureProvider
	store                  *runtimeauth.Store
	bootstrapToken         string
	localPairingToken      string
}

type runtimeSemanticServices struct {
	activityService *workspaceactivity.Service
	graphService    *semanticgraph.Service
	graphStore      *semanticgraph.Store
}

type runtimeFoundation struct {
	appearanceService     *appearance.Service
	authBootstrap         runtimeAuthBootstrap
	localCredentialIssuer *localcredissuer.Service
	runtimeSetupStore     *runtimesetup.Store
}

func Start(ctx context.Context, config Config) (*Server, error) {
	config = normalizeConfig(config)
	if err := config.Validate(); err != nil {
		return nil, err
	}

	listenConfig := net.ListenConfig{}
	listener, err := listenConfig.Listen(ctx, "tcp", net.JoinHostPort(config.Host, strconv.Itoa(config.Port)))
	if err != nil {
		return nil, fmt.Errorf("bind backend listener: %w", err)
	}
	services, err := buildRuntimeServices(config)
	if err != nil {
		_ = listener.Close()
		return nil, err
	}

	server := &Server{
		closeCartographerEvents: services.semanticGraphService.ShutdownCartographerEventObserver,
		closeSemanticStore:      services.semanticGraphStore.Close,
		closeTerminal:           services.terminalService.Shutdown,
		closeWorkspaceActivity:  services.workspaceActivityService.CloseEvents,
		closeWorkflowStore:      services.workflowStore.Close,
		closeEvents:             services.chatService.CloseEvents,
		closeRuntimeAuth:        services.authStore.Close,
		closeNotify:             services.notifyService.Close,
		closeWorkflowEvents:     services.workflowService.CloseEvents,
		drainChatTurns:          services.chatService.ShutdownActiveTurns,
		codexManager:            services.codexManager,
		server:                  nil,
		listener:                listener,
		done:                    make(chan error, 1),
	}
	server.server, err = newHTTPServer(config, services)
	if err != nil {
		_ = listener.Close()
		closeRuntimeServicesAfterReadyFailure(config, server)
		return nil, err
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{
		Event:             "ready",
		Addr:              listener.Addr().String(),
		BootstrapToken:    services.bootstrapToken,
		LocalPairingToken: services.localPairingToken,
		ProtocolVersion:   httpapi.ProtocolVersion,
	}); err != nil {
		_ = listener.Close()
		closeRuntimeServicesAfterReadyFailure(config, server)
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
}

func buildRuntimeServices(config Config) (runtimeServices, error) {
	foundation, err := newRuntimeFoundation(config)
	if err != nil {
		return runtimeServices{}, err
	}
	authBootstrap := foundation.authBootstrap
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = authBootstrap.store.Close()
		}
	}()
	workspaceService, err := newWorkspaceService(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, err
	}
	workspaceUIService, err := newWorkspaceUIService(config.AppDataDir, workspaceService)
	if err != nil {
		return runtimeServices{}, err
	}
	codexManager := newCodexManager(config)
	chatService, err := newChatService(config.AppDataDir, workspaceService, codexManager, config.ChatHarness)
	if err != nil {
		return runtimeServices{}, err
	}
	workflowService, workflowStore, err := newWorkflowService(
		config.AppDataDir,
		workspaceService,
		chatService,
	)
	if err != nil {
		return runtimeServices{}, err
	}
	semanticServices, err := newRuntimeSemanticServices(config, workspaceService, workflowService, workflowStore, chatService)
	if err != nil {
		return runtimeServices{}, err
	}
	terminalService, codexAccountService, err := newRuntimeEdgeServices(
		config,
		workspaceService,
		chatService,
		codexManager,
		semanticServices.graphService,
		semanticServices.graphStore,
		semanticServices.activityService,
		workflowStore,
	)
	if err != nil {
		return runtimeServices{}, err
	}
	notifyService, err := newNotifyService(config, authBootstrap.store, chatService)
	if err != nil {
		closeRuntimeServicesBeforeNotifyFailure(
			config,
			terminalService,
			semanticServices.graphService,
			semanticServices.graphStore,
			semanticServices.activityService,
			chatService,
			workflowService,
			workflowStore,
		)
		return runtimeServices{}, err
	}
	runtimeDiagnosticsService := newRuntimeDiagnosticsService(runtimeDiagnosticsConfig{
		AppDataDir:                  config.AppDataDir,
		CodexAccountService:         codexAccountService,
		CodexCommand:                config.CodexCommand,
		CodexTimeout:                config.CodexDiagnosticsTimeout,
		DiskSpacePath:               config.DiskSpacePath,
		MinimumDiskFreeMiB:          config.MinimumDiskFreeMiB,
		Now:                         time.Now,
		PolicyPath:                  config.PolicyPath,
		ProtectedRuntimeStateDir:    config.ProtectedRuntimeStateDir,
		ReleaseMetadataPath:         config.ReleaseMetadataPath,
		RuntimeVersion:              config.Version,
		WorkloadLeaseDiagnosticName: config.WorkloadLeaseDiagnosticName,
		WorkloadLeaseManager:        config.WorkloadLeaseManager,
	})

	closeAuthOnFailure = false
	return runtimeServices{
		appearanceService:         foundation.appearanceService,
		authStore:                 authBootstrap.store,
		bootstrapToken:            authBootstrap.bootstrapToken,
		localPairingToken:         authBootstrap.localPairingToken,
		localCredentialIssuer:     foundation.localCredentialIssuer,
		chatService:               chatService,
		codexAccountService:       codexAccountService,
		codexManager:              codexManager,
		notifyService:             notifyService,
		runtimeDiagnosticsService: runtimeDiagnosticsService,
		semanticGraphService:      semanticServices.graphService,
		semanticGraphStore:        semanticServices.graphStore,
		terminalService:           terminalService,
		workspaceActivityService:  semanticServices.activityService,
		workspaceUIService:        workspaceUIService,
		workspaceService:          workspaceService,
		workflowService:           workflowService,
		workflowStore:             workflowStore,
		runtimeIdentityManager:    authBootstrap.identityManager,
		runtimeSetupStore:         foundation.runtimeSetupStore,
		infrastructureProvider:    authBootstrap.infrastructureProvider,
	}, nil
}

func newRuntimeFoundation(config Config) (foundation runtimeFoundation, err error) {
	foundation.authBootstrap, err = newRuntimeAuthBootstrap(config)
	if err != nil {
		return runtimeFoundation{}, err
	}
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = foundation.authBootstrap.store.Close()
		}
	}()
	foundation.appearanceService, err = newAppearanceService(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, err
	}
	foundation.runtimeSetupStore, err = runtimesetup.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, fmt.Errorf("create runtime setup store: %w", err)
	}
	foundation.localCredentialIssuer, err = newLocalCredentialIssuer(
		config,
		foundation.authBootstrap,
		foundation.runtimeSetupStore,
	)
	if err != nil {
		return runtimeFoundation{}, err
	}
	closeAuthOnFailure = false
	return foundation, nil
}

func newRuntimeAuthBootstrap(config Config) (runtimeAuthBootstrap, error) {
	identityManager, err := newRuntimeIdentityManager(config.AppDataDir, config.RuntimeDisplayName)
	if err != nil {
		return runtimeAuthBootstrap{}, err
	}
	infrastructureProvider, err := defaultRuntimeInfrastructureProvider()
	if err != nil {
		return runtimeAuthBootstrap{}, err
	}
	authStore, err := runtimeauth.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeAuthBootstrap{}, fmt.Errorf("create runtime auth store: %w", err)
	}
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = authStore.Close()
		}
	}()
	var bootstrapToken string
	if !config.SkipBootstrapDeviceSession {
		_, bootstrapToken, err = authStore.CreateBootstrapDeviceSession(context.Background(), config.BootstrapDeviceDisplayName)
		if err != nil {
			return runtimeAuthBootstrap{}, fmt.Errorf("create bootstrap device session: %w", err)
		}
	}
	var localPairingToken string
	if config.EnableLocalCredentialIssuer {
		_, localPairingToken, err = authStore.CreatePairingToken(context.Background())
		if err != nil {
			return runtimeAuthBootstrap{}, fmt.Errorf("create local enrollment pairing token: %w", err)
		}
	}
	closeAuthOnFailure = false
	return runtimeAuthBootstrap{
		identityManager:        identityManager,
		infrastructureProvider: infrastructureProvider,
		store:                  authStore,
		bootstrapToken:         bootstrapToken,
		localPairingToken:      localPairingToken,
	}, nil
}

func newLocalCredentialIssuer(config Config, authBootstrap runtimeAuthBootstrap, setupStore *runtimesetup.Store) (*localcredissuer.Service, error) {
	if !config.EnableLocalCredentialIssuer {
		return nil, nil
	}
	identity := authBootstrap.identityManager.identitySnapshot()
	managedIdentity, err := runtimeprovider.NewManagedIdentity("local-development:" + identity.RuntimeID)
	if err != nil {
		return nil, fmt.Errorf("derive local credential runtime identity: %w", err)
	}
	service, err := localcredissuer.New(localcredissuer.Config{
		BackendName:    httpapi.BackendName,
		PairingTokens:  authBootstrap.store,
		ReleaseVersion: config.Version,
		RuntimeID:      identity.RuntimeID,
		RuntimeName:    managedIdentity.Name,
		SetupStore:     setupStore,
		UserID:         "local-user-" + identity.RuntimeID,
	})
	if err != nil {
		return nil, fmt.Errorf("create local credential issuer: %w", err)
	}
	return service, nil
}

func newRuntimeSemanticServices(
	config Config,
	workspaceService *workspacesession.Service,
	workflowService *orchestrator.Service,
	workflowStore *orchestrator.Store,
	chatService *chat.Service,
) (runtimeSemanticServices, error) {
	workspaceActivityService, err := workspaceactivity.NewService(chatService, workflowService)
	if err != nil {
		_ = workflowStore.Close()
		return runtimeSemanticServices{}, fmt.Errorf("create workspace activity service: %w", err)
	}
	semanticGraphService, semanticGraphStore, err := newSemanticGraphService(
		config.AppDataDir,
		workspaceService,
		workflowService,
		chatService,
		config.DisableAutomaticCartographerProcessing,
	)
	if err != nil {
		workspaceActivityService.CloseEvents()
		_ = workflowStore.Close()
		return runtimeSemanticServices{}, err
	}
	if err := configureRuntimeSemanticServices(semanticGraphService, semanticGraphStore, workspaceActivityService, workflowService, workflowStore, chatService); err != nil {
		return runtimeSemanticServices{}, err
	}
	return runtimeSemanticServices{
		activityService: workspaceActivityService,
		graphService:    semanticGraphService,
		graphStore:      semanticGraphStore,
	}, nil
}

func configureRuntimeSemanticServices(
	semanticGraphService *semanticgraph.Service,
	semanticGraphStore *semanticgraph.Store,
	workspaceActivityService *workspaceactivity.Service,
	workflowService *orchestrator.Service,
	workflowStore *orchestrator.Store,
	chatService *chat.Service,
) error {
	chatService.SetSemanticContextCompiler(semanticGraphService)
	if err := workflowService.SetSemanticContextCompiler(semanticGraphService); err != nil {
		closeRuntimeSemanticSetupFailure(semanticGraphStore, workspaceActivityService, workflowStore)
		return fmt.Errorf("configure semantic context compiler: %w", err)
	}
	if err := semanticGraphService.StartCartographerEventObserver(context.Background(), chatService, workflowService); err != nil {
		closeRuntimeSemanticSetupFailure(semanticGraphStore, workspaceActivityService, workflowStore)
		return fmt.Errorf("start semantic cartographer observer: %w", err)
	}
	return nil
}

func closeRuntimeSemanticSetupFailure(
	semanticGraphStore *semanticgraph.Store,
	workspaceActivityService *workspaceactivity.Service,
	workflowStore *orchestrator.Store,
) {
	workspaceActivityService.CloseEvents()
	_ = semanticGraphStore.Close()
	_ = workflowStore.Close()
}

func newRuntimeEdgeServices(
	config Config,
	workspaceService *workspacesession.Service,
	chatService *chat.Service,
	codexManager *codexapp.Manager,
	semanticGraphService *semanticgraph.Service,
	semanticGraphStore *semanticgraph.Store,
	workspaceActivityService *workspaceactivity.Service,
	workflowStore *orchestrator.Store,
) (*terminal.Manager, *codexaccount.Service, error) {
	terminalService, err := newTerminalService(config.AppDataDir, workspaceService)
	if err != nil {
		closeRuntimeServicesBeforeEdgeFailure(config, semanticGraphService, semanticGraphStore, workspaceActivityService, workflowStore)
		return nil, nil, err
	}
	codexAccountService, err := codexaccount.NewService(codexManager, chatService.PublishCodexAccountChanged)
	if err != nil {
		closeRuntimeServicesBeforeEdgeFailure(config, semanticGraphService, semanticGraphStore, workspaceActivityService, workflowStore)
		return nil, nil, fmt.Errorf("create Codex account service: %w", err)
	}
	return terminalService, codexAccountService, nil
}

func newNotifyService(
	config Config,
	authStore *runtimeauth.Store,
	chatService *chat.Service,
) (*notify.Service, error) {
	service, err := notify.NewService(notify.ServiceConfig{
		AppDataDir:         config.AppDataDir,
		RuntimeAuthService: authStore,
	})
	if err != nil {
		return nil, fmt.Errorf("create notify service: %w", err)
	}
	if err := service.StartChatObserver(context.Background(), chatService); err != nil {
		_ = service.Close()
		return nil, err
	}
	return service, nil
}

func closeRuntimeServicesBeforeEdgeFailure(
	config Config,
	semanticGraphService *semanticgraph.Service,
	semanticGraphStore *semanticgraph.Store,
	workspaceActivityService *workspaceactivity.Service,
	workflowStore *orchestrator.Store,
) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	_ = semanticGraphService.ShutdownCartographerEventObserver(shutdownCtx)
	cancel()
	workspaceActivityService.CloseEvents()
	_ = semanticGraphStore.Close()
	_ = workflowStore.Close()
}

func closeRuntimeServicesBeforeNotifyFailure(
	config Config,
	terminalService *terminal.Manager,
	semanticGraphService *semanticgraph.Service,
	semanticGraphStore *semanticgraph.Store,
	workspaceActivityService *workspaceactivity.Service,
	chatService *chat.Service,
	workflowService *orchestrator.Service,
	workflowStore *orchestrator.Store,
) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	_ = terminalService.Shutdown(shutdownCtx)
	_ = semanticGraphService.ShutdownCartographerEventObserver(shutdownCtx)
	cancel()
	workspaceActivityService.CloseEvents()
	chatService.CloseEvents()
	workflowService.CloseEvents()
	_ = semanticGraphStore.Close()
	_ = workflowStore.Close()
}

func closeRuntimeServicesAfterReadyFailure(config Config, server *Server) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()
	_ = server.closeEventStreams(shutdownCtx)
	_ = server.shutdownTerminal(shutdownCtx)
	_ = server.shutdownRuntimeAuth()
	_ = server.shutdownCodex(shutdownCtx)
	_ = server.shutdownSemanticStore()
	_ = server.shutdownWorkflowStore()
}

func newAppearanceService(appDataDir string) (*appearance.Service, error) {
	appearanceStore, err := appearance.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create appearance settings store: %w", err)
	}
	appearanceService, err := appearance.NewService(appearanceStore)
	if err != nil {
		return nil, fmt.Errorf("load appearance settings: %w", err)
	}
	return appearanceService, nil
}

func newWorkspaceService(appDataDir string) (*workspacesession.Service, error) {
	appStore, err := appstate.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create app state store: %w", err)
	}
	workspaceManager, err := workspace.NewManager(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create workspace manager: %w", err)
	}
	workspaceService, err := workspacesession.NewService(appStore, workspaceManager)
	if err != nil {
		return nil, fmt.Errorf("load workspace session: %w", err)
	}
	return workspaceService, nil
}

func newWorkspaceUIService(
	appDataDir string,
	workspaceService *workspacesession.Service,
) (*workspaceui.Service, error) {
	store, err := workspaceui.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create workspace UI store: %w", err)
	}
	service, err := workspaceui.NewService(store, workspaceService)
	if err != nil {
		return nil, fmt.Errorf("create workspace UI service: %w", err)
	}
	return service, nil
}

func newCodexManager(config Config) *codexapp.Manager {
	return codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: config.CodexCommand,
			Args:    []string{"app-server", "--listen", "stdio://"},
		},
		InitializeParams: chat.CodexInitializeParams(chat.CodexHarnessConfig{}),
	})
}

func newChatService(
	appDataDir string,
	workspaceService *workspacesession.Service,
	codexManager *codexapp.Manager,
	harnessMode ChatHarnessMode,
) (*chat.Service, error) {
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create chat store: %w", err)
	}
	harness, err := chatHarness(harnessMode, codexManager)
	if err != nil {
		return nil, err
	}
	options, err := chatServiceOptionsFromEnv()
	if err != nil {
		return nil, err
	}
	chatService, err := chat.NewService(chatStore, workspaceService, harness, options...)
	if err != nil {
		return nil, fmt.Errorf("create chat service: %w", err)
	}
	return chatService, nil
}

func chatServiceOptionsFromEnv() ([]chat.Option, error) {
	var options []chat.Option
	if os.Getenv(e2eChatFailFirstTranscriptBlockIDEnv) == "1" {
		options = append(options, chat.WithIDGenerator(e2eFailFirstTranscriptBlockIDGenerator()))
	}
	startupFailureOption, ok, err := e2eChatPostCommitStartupFailureOptionFromEnv()
	if err != nil {
		return nil, err
	}
	if ok {
		options = append(options, startupFailureOption)
	}
	return options, nil
}

func e2eFailFirstTranscriptBlockIDGenerator() func(string) (string, error) {
	var mu sync.Mutex
	prefixCounts := map[string]int{}
	return func(prefix string) (string, error) {
		mu.Lock()
		defer mu.Unlock()

		prefixCounts[prefix]++
		if prefix == "transcript_block" && prefixCounts[prefix] == 1 {
			return "", errors.New("e2e injected transcript block id failure")
		}
		return e2eRandomID(prefix)
	}
}

func e2eChatPostCommitStartupFailureOptionFromEnv() (chat.Option, bool, error) {
	rawPoint := os.Getenv(e2eChatFailPostCommitStartupPointEnv)
	if rawPoint == "" {
		return nil, false, nil
	}
	point, err := e2eChatPostCommitStartupFailurePoint(rawPoint)
	if err != nil {
		return nil, false, err
	}
	attempt := 1
	if rawAttempt := os.Getenv(e2eChatFailPostCommitStartupAttemptEnv); rawAttempt != "" {
		parsed, err := strconv.Atoi(rawAttempt)
		if err != nil || parsed <= 0 {
			return nil, false, fmt.Errorf("invalid %s value %q: must be a positive integer", e2eChatFailPostCommitStartupAttemptEnv, rawAttempt)
		}
		attempt = parsed
	}
	option, err := chat.WithPostCommitTurnStartFailure(
		point,
		attempt,
		fmt.Errorf("e2e injected post-commit %s failure", rawPoint),
	)
	if err != nil {
		return nil, false, err
	}
	return option, true, nil
}

func e2eChatPostCommitStartupFailurePoint(raw string) (chat.PostCommitTurnStartFailurePoint, error) {
	switch raw {
	case string(chat.PostCommitTurnStartFailurePublish):
		return chat.PostCommitTurnStartFailurePublish, nil
	case string(chat.PostCommitTurnStartFailureDeliveryInput):
		return chat.PostCommitTurnStartFailureDeliveryInput, nil
	case string(chat.PostCommitTurnStartFailureLaunch):
		return chat.PostCommitTurnStartFailureLaunch, nil
	default:
		return "", fmt.Errorf("unsupported %s value %q", e2eChatFailPostCommitStartupPointEnv, raw)
	}
}

func e2eRandomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}

func newWorkflowService(
	appDataDir string,
	workspaceService *workspacesession.Service,
	chatService *chat.Service,
) (*orchestrator.Service, *orchestrator.Store, error) {
	workflowStore, err := orchestrator.NewStore(appDataDir)
	if err != nil {
		return nil, nil, fmt.Errorf("create workflow store: %w", err)
	}
	serviceStore := orchestrator.WorkflowStore(workflowStore)
	if os.Getenv(e2eWorkflowFailFirstRunnerPostStartPersistEnv) == "1" {
		serviceStore = &e2eWorkflowRunnerPostStartPersistFailStore{Store: workflowStore}
	}
	workflowService, err := orchestrator.NewService(
		serviceStore,
		workspaceService,
		orchestrator.WithCodexChatService(chatService),
	)
	if err != nil {
		_ = workflowStore.Close()
		return nil, nil, fmt.Errorf("create workflow service: %w", err)
	}
	return workflowService, workflowStore, nil
}

type e2eWorkflowRunnerPostStartPersistFailStore struct {
	*orchestrator.Store
	mu     sync.Mutex
	failed bool
}

func (store *e2eWorkflowRunnerPostStartPersistFailStore) PersistTransition(transition orchestrator.WorkflowTransition) ([]orchestrator.WorkflowEventEnvelope, error) {
	store.mu.Lock()
	shouldFail := !store.failed && transitionIncludesWorkflowRunnerRefsAttached(transition)
	if shouldFail {
		store.failed = true
	}
	store.mu.Unlock()
	if shouldFail {
		return nil, errors.New("e2e injected workflow runner post-start persistence failure")
	}
	return store.Store.PersistTransition(transition)
}

func transitionIncludesWorkflowRunnerRefsAttached(transition orchestrator.WorkflowTransition) bool {
	for _, event := range transition.Events {
		if event.Type == orchestrator.EventRunnerRefsAttached {
			return true
		}
	}
	return false
}

func newSemanticGraphService(
	appDataDir string,
	workspaceService *workspacesession.Service,
	workflowService *orchestrator.Service,
	chatService *chat.Service,
	disableAutomaticCartographerProcessing bool,
) (*semanticgraph.Service, *semanticgraph.Store, error) {
	semanticStore, err := semanticgraph.NewStore(appDataDir)
	if err != nil {
		return nil, nil, fmt.Errorf("create semantic graph store: %w", err)
	}
	options := []semanticgraph.Option{
		semanticgraph.WithWorkflowSourceResolver(workflowService),
		semanticgraph.WithChatSourceResolver(chatService),
		semanticgraph.WithCartographerHarnessTaskRunner(chatService.HarnessTaskRunner(), chat.HarnessCodex),
	}
	if disableAutomaticCartographerProcessing {
		options = append(options, semanticgraph.WithAutomaticCartographerProcessingDisabled())
	}
	semanticService, err := semanticgraph.NewService(semanticStore, workspaceService, options...)
	if err != nil {
		_ = semanticStore.Close()
		return nil, nil, fmt.Errorf("create semantic graph service: %w", err)
	}
	return semanticService, semanticStore, nil
}

func newTerminalService(
	appDataDir string,
	workspaceService *workspacesession.Service,
) (*terminal.Manager, error) {
	terminalService, err := terminal.NewManager(terminal.ManagerConfig{
		AppDataDir:        appDataDir,
		WorkspaceResolver: workspaceService,
	})
	if err != nil {
		return nil, fmt.Errorf("create terminal service: %w", err)
	}
	return terminalService, nil
}

func newHTTPServer(config Config, services runtimeServices) (*http.Server, error) {
	var localCredentialIssuer httpapi.LocalCredentialIssuerService
	var runtimeAccessService httpapi.RuntimeAccessService
	if services.localCredentialIssuer != nil {
		localCredentialIssuer = services.localCredentialIssuer
		runtimeAccessService = services.localCredentialIssuer
	}
	apiHandler, err := httpapi.NewHandlerWithError(httpapi.HandlerConfig{
		Metadata: httpapi.BackendMetadata{
			Name:    httpapi.BackendName,
			Version: config.Version,
		},
		AppearanceService:   services.appearanceService,
		ChatService:         services.chatService,
		CodexAccountService: services.codexAccountService,
		NotifyService:       services.notifyService,
		RuntimeEndpointAccess: httpapi.RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: config.AllowedHTTPSOrigins,
			AllowedRequestHosts: config.AllowedRequestHosts,
		},
		RuntimeAuthService:        services.authStore,
		LocalCredentialIssuer:     localCredentialIssuer,
		RuntimeAccessService:      runtimeAccessService,
		RuntimeDiagnosticsService: services.runtimeDiagnosticsService,
		RuntimeIdentityService:    services.runtimeIdentityManager,
		RuntimeMetadata: httpapi.RuntimeMetadata{
			InfrastructureProvider: services.infrastructureProvider,
		},
		RuntimeSetupService:      services.runtimeSetupStore,
		SemanticGraphService:     services.semanticGraphService,
		TerminalService:          services.terminalService,
		WorkspaceActivityService: services.workspaceActivityService,
		WorkspaceUIService:       services.workspaceUIService,
		WorkspaceService:         services.workspaceService,
		WorkflowService:          services.workflowService,
	})
	if err != nil {
		return nil, err
	}
	return &http.Server{
		Handler:           webapp.NewHandler(apiHandler),
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
	}, nil
}

func (server *Server) Addr() string {
	return server.listener.Addr().String()
}

func (server *Server) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("shutdown context is required")
	}
	var shutdownErr error
	httpShutdown := server.startHTTPShutdown(ctx)
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownChatTurns(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.closeEventStreams(ctx))
	shutdownErr = firstShutdownError(shutdownErr, waitHTTPShutdown(ctx, httpShutdown))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownTerminal(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownRuntimeAuth())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownCodex(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownSemanticStore())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownWorkflowStore())
	return shutdownErr
}

func (server *Server) startHTTPShutdown(ctx context.Context) <-chan error {
	done := make(chan error, 1)
	go func() {
		done <- server.server.Shutdown(ctx)
	}()
	return done
}

func waitHTTPShutdown(ctx context.Context, done <-chan error) error {
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (server *Server) shutdownChatTurns(ctx context.Context) error {
	if server.drainChatTurns == nil {
		return nil
	}
	return server.drainChatTurns(ctx)
}

func (server *Server) closeEventStreams(ctx context.Context) error {
	var shutdownErr error
	if server.closeNotify != nil {
		shutdownErr = firstShutdownError(shutdownErr, server.closeNotify())
	}
	if server.closeCartographerEvents != nil {
		shutdownErr = firstShutdownError(shutdownErr, server.closeCartographerEvents(ctx))
	}
	if server.closeWorkspaceActivity != nil {
		server.closeWorkspaceActivity()
	}
	if server.closeEvents != nil {
		server.closeEvents()
	}
	if server.closeWorkflowEvents != nil {
		server.closeWorkflowEvents()
	}
	return shutdownErr
}

func (server *Server) shutdownTerminal(ctx context.Context) error {
	if server.closeTerminal == nil {
		return nil
	}
	return server.closeTerminal(ctx)
}

func (server *Server) shutdownCodex(ctx context.Context) error {
	if server.codexManager == nil {
		return nil
	}
	return server.codexManager.Shutdown(ctx)
}

func (server *Server) shutdownRuntimeAuth() error {
	if server.closeRuntimeAuth != nil {
		return server.closeRuntimeAuth()
	}
	return nil
}

func (server *Server) shutdownWorkflowStore() error {
	if server.closeWorkflowStore != nil {
		return server.closeWorkflowStore()
	}
	return nil
}

func (server *Server) shutdownSemanticStore() error {
	if server.closeSemanticStore != nil {
		return server.closeSemanticStore()
	}
	return nil
}

func firstShutdownError(current error, next error) error {
	if current != nil {
		return current
	}
	return next
}

func (server *Server) Wait() error {
	return <-server.done
}

func (server *Server) serve() {
	err := server.server.Serve(server.listener)
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	server.done <- err
}

func normalizeConfig(config Config) Config {
	defaults := DefaultConfig()
	if config.Stdout == nil {
		config.Stdout = io.Discard
	}
	if config.Stderr == nil {
		config.Stderr = io.Discard
	}
	if config.ChatHarness == "" {
		config.ChatHarness = defaults.ChatHarness
	}
	if config.CodexCommand == "" {
		config.CodexCommand = defaults.CodexCommand
	}
	if config.CodexDiagnosticsTimeout == 0 {
		config.CodexDiagnosticsTimeout = defaults.CodexDiagnosticsTimeout
	}
	if config.WorkloadLeaseDiagnosticName == "" {
		config.WorkloadLeaseDiagnosticName = defaults.WorkloadLeaseDiagnosticName
	}
	return config
}

func chatHarness(mode ChatHarnessMode, codexManager *codexapp.Manager) (chat.Harness, error) {
	switch mode {
	case ChatHarnessCodex:
		return chat.NewCodexHarness(chat.CodexHarnessConfig{Manager: codexManager}), nil
	case ChatHarnessScriptedWorkflow:
		return chat.NewScriptedWorkflowHarness(), nil
	default:
		return nil, fmt.Errorf("unsupported chat harness mode: %s", mode)
	}
}

func validChatHarnessMode(mode ChatHarnessMode) bool {
	switch mode {
	case ChatHarnessCodex, ChatHarnessScriptedWorkflow:
		return true
	default:
		return false
	}
}
