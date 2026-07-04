package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"path/filepath"
	"strconv"
	"time"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspaceactivity"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type Config struct {
	AllowRemote                            bool
	AppDataDir                             string
	BootstrapDeviceDisplayName             string
	ChatHarness                            ChatHarnessMode
	DisableAutomaticCartographerProcessing bool
	Host                                   string
	Port                                   int
	Version                                string
	Stdout                                 io.Writer
	Stderr                                 io.Writer
	ShutdownTimeout                        time.Duration
}

type ChatHarnessMode string

const (
	ChatHarnessCodex            ChatHarnessMode = "codex"
	ChatHarnessScriptedWorkflow ChatHarnessMode = "scripted-workflow"
)

type ReadyEvent struct {
	Event           string `json:"event"`
	Addr            string `json:"addr"`
	BootstrapToken  string `json:"bootstrapToken"`
	ProtocolVersion int    `json:"protocolVersion"`
}

type Server struct {
	closeCartographerEvents func(context.Context) error
	closeSemanticStore      func() error
	closeTerminal           func(context.Context) error
	closeWorkspaceActivity  func()
	closeWorkflowStore      func() error
	closeEvents             func()
	closeRuntimeAuth        func() error
	closeWorkflowEvents     func()
	codexManager            *codexapp.Manager
	server                  *http.Server
	listener                net.Listener
	done                    chan error
}

type runtimeServices struct {
	appearanceService        *appearance.Service
	authStore                *runtimeauth.Store
	bootstrapToken           string
	chatService              *chat.Service
	codexAccountService      *codexaccount.Service
	codexManager             *codexapp.Manager
	semanticGraphService     *semanticgraph.Service
	semanticGraphStore       *semanticgraph.Store
	terminalService          *terminal.Manager
	workspaceActivityService *workspaceactivity.Service
	workspaceUIService       *workspaceui.Service
	workspaceService         *workspacesession.Service
	workflowService          *orchestrator.Service
	workflowStore            *orchestrator.Store
	runtimeIdentity          runtimeIdentity
}

type runtimeAuthBootstrap struct {
	identity       runtimeIdentity
	store          *runtimeauth.Store
	bootstrapToken string
}

type runtimeSemanticServices struct {
	activityService *workspaceactivity.Service
	graphService    *semanticgraph.Service
	graphStore      *semanticgraph.Store
}

func DefaultConfig() Config {
	return Config{
		AppDataDir:                 "",
		BootstrapDeviceDisplayName: "Setta Desktop (local)",
		ChatHarness:                ChatHarnessCodex,
		Host:                       "127.0.0.1",
		Port:                       0,
		Version:                    "dev",
		Stdout:                     io.Discard,
		Stderr:                     io.Discard,
		ShutdownTimeout:            5 * time.Second,
	}
}

func (config Config) Validate() error {
	if err := validateAppDataDir(config.AppDataDir); err != nil {
		return err
	}
	if !validChatHarnessMode(config.ChatHarness) {
		return fmt.Errorf("unsupported chat harness mode: %s", config.ChatHarness)
	}
	if config.Host == "" {
		return errors.New("host is required")
	}
	if config.BootstrapDeviceDisplayName == "" {
		return errors.New("bootstrap device display name is required")
	}
	if err := config.validateHostBinding(); err != nil {
		return err
	}
	if err := validatePort(config.Port); err != nil {
		return err
	}
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.ShutdownTimeout <= 0 {
		return errors.New("shutdown timeout must be positive")
	}
	return nil
}

func validateAppDataDir(appDataDir string) error {
	if appDataDir == "" {
		return errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	return nil
}

func (config Config) validateHostBinding() error {
	addr, err := netip.ParseAddr(config.Host)
	if err != nil {
		return fmt.Errorf("host must be a numeric IP address: %w", err)
	}
	if !addr.IsLoopback() && !config.AllowRemote {
		return fmt.Errorf("host must be loopback unless allow remote is enabled: %s", config.Host)
	}
	return nil
}

func validatePort(port int) error {
	if port < 0 || port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535: %d", port)
	}
	return nil
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
		closeWorkflowEvents:     services.workflowService.CloseEvents,
		codexManager:            services.codexManager,
		server:                  newHTTPServer(config, services),
		listener:                listener,
		done:                    make(chan error, 1),
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{
		Event:           "ready",
		Addr:            listener.Addr().String(),
		BootstrapToken:  services.bootstrapToken,
		ProtocolVersion: httpapi.ProtocolVersion,
	}); err != nil {
		_ = listener.Close()
		_ = services.authStore.Close()
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
}

func buildRuntimeServices(config Config) (runtimeServices, error) {
	authBootstrap, err := newRuntimeAuthBootstrap(config)
	if err != nil {
		return runtimeServices{}, err
	}
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = authBootstrap.store.Close()
		}
	}()
	appearanceService, err := newAppearanceService(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, err
	}
	workspaceService, err := newWorkspaceService(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, err
	}
	workspaceUIService, err := newWorkspaceUIService(config.AppDataDir, workspaceService)
	if err != nil {
		return runtimeServices{}, err
	}
	codexManager := newCodexManager()
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

	closeAuthOnFailure = false
	return runtimeServices{
		appearanceService:        appearanceService,
		authStore:                authBootstrap.store,
		bootstrapToken:           authBootstrap.bootstrapToken,
		chatService:              chatService,
		codexAccountService:      codexAccountService,
		codexManager:             codexManager,
		semanticGraphService:     semanticServices.graphService,
		semanticGraphStore:       semanticServices.graphStore,
		terminalService:          terminalService,
		workspaceActivityService: semanticServices.activityService,
		workspaceUIService:       workspaceUIService,
		workspaceService:         workspaceService,
		workflowService:          workflowService,
		workflowStore:            workflowStore,
		runtimeIdentity:          authBootstrap.identity,
	}, nil
}

func newRuntimeAuthBootstrap(config Config) (runtimeAuthBootstrap, error) {
	identity, err := loadRuntimeIdentity(config.AppDataDir)
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
	_, bootstrapToken, err := authStore.CreateDeviceSession(context.Background(), config.BootstrapDeviceDisplayName)
	if err != nil {
		return runtimeAuthBootstrap{}, fmt.Errorf("create bootstrap device session: %w", err)
	}
	closeAuthOnFailure = false
	return runtimeAuthBootstrap{identity: identity, store: authStore, bootstrapToken: bootstrapToken}, nil
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

func newCodexManager() *codexapp.Manager {
	return codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
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
	chatService, err := chat.NewService(chatStore, workspaceService, harness)
	if err != nil {
		return nil, fmt.Errorf("create chat service: %w", err)
	}
	return chatService, nil
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
	workflowService, err := orchestrator.NewService(
		workflowStore,
		workspaceService,
		orchestrator.WithCodexChatService(chatService),
	)
	if err != nil {
		_ = workflowStore.Close()
		return nil, nil, fmt.Errorf("create workflow service: %w", err)
	}
	return workflowService, workflowStore, nil
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

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	return &http.Server{
		Handler: httpapi.NewHandler(httpapi.HandlerConfig{
			Metadata: httpapi.BackendMetadata{
				Name:    httpapi.BackendName,
				Version: config.Version,
			},
			AppearanceService:   services.appearanceService,
			ChatService:         services.chatService,
			CodexAccountService: services.codexAccountService,
			RuntimeAuthService:  services.authStore,
			RuntimeMetadata: httpapi.RuntimeMetadata{
				ID:          services.runtimeIdentity.RuntimeID,
				DisplayName: services.runtimeIdentity.DisplayName,
			},
			SemanticGraphService:     services.semanticGraphService,
			TerminalService:          services.terminalService,
			WorkspaceActivityService: services.workspaceActivityService,
			WorkspaceUIService:       services.workspaceUIService,
			WorkspaceService:         services.workspaceService,
			WorkflowService:          services.workflowService,
		}),
	}
}

func (server *Server) Addr() string {
	return server.listener.Addr().String()
}

func (server *Server) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("shutdown context is required")
	}
	var shutdownErr error
	shutdownErr = firstShutdownError(shutdownErr, server.closeEventStreams(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownTerminal(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.server.Shutdown(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownRuntimeAuth())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownCodex(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownSemanticStore())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownWorkflowStore())
	return shutdownErr
}

func (server *Server) closeEventStreams(ctx context.Context) error {
	var shutdownErr error
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
	if config.Stdout == nil {
		config.Stdout = io.Discard
	}
	if config.Stderr == nil {
		config.Stderr = io.Discard
	}
	if config.ChatHarness == "" {
		config.ChatHarness = ChatHarnessCodex
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
