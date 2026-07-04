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
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspaceactivity"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type Config struct {
	AppDataDir                             string
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
	Event string `json:"event"`
	Addr  string `json:"addr"`
}

type Server struct {
	closeCartographerEvents func(context.Context) error
	closeSemanticStore      func() error
	closeTerminal           func(context.Context) error
	closeWorkspaceActivity  func()
	closeWorkflowStore      func() error
	closeEvents             func()
	closeWorkflowEvents     func()
	drainChatTurns          func(context.Context) error
	codexManager            *codexapp.Manager
	server                  *http.Server
	listener                net.Listener
	done                    chan error
}

type runtimeServices struct {
	appearanceService        *appearance.Service
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
}

func DefaultConfig() Config {
	return Config{
		AppDataDir:      "",
		ChatHarness:     ChatHarnessCodex,
		Host:            "127.0.0.1",
		Port:            0,
		Version:         "dev",
		Stdout:          io.Discard,
		Stderr:          io.Discard,
		ShutdownTimeout: 5 * time.Second,
	}
}

func (config Config) Validate() error {
	if config.AppDataDir == "" {
		return errors.New("app data directory is required")
	}
	if !filepath.IsAbs(config.AppDataDir) {
		return fmt.Errorf("app data directory must be absolute: %s", config.AppDataDir)
	}
	if !validChatHarnessMode(config.ChatHarness) {
		return fmt.Errorf("unsupported chat harness mode: %s", config.ChatHarness)
	}
	if config.Host == "" {
		return errors.New("host is required")
	}
	addr, err := netip.ParseAddr(config.Host)
	if err != nil {
		return fmt.Errorf("host must be a numeric IP address: %w", err)
	}
	if !addr.IsLoopback() {
		return fmt.Errorf("host must be loopback: %s", config.Host)
	}
	if config.Port < 0 || config.Port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535: %d", config.Port)
	}
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.ShutdownTimeout <= 0 {
		return errors.New("shutdown timeout must be positive")
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
		closeWorkflowEvents:     services.workflowService.CloseEvents,
		drainChatTurns:          services.chatService.ShutdownActiveTurns,
		codexManager:            services.codexManager,
		server:                  newHTTPServer(config, services),
		listener:                listener,
		done:                    make(chan error, 1),
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{Event: "ready", Addr: listener.Addr().String()}); err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
}

func buildRuntimeServices(config Config) (runtimeServices, error) {
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
	workspaceActivityService, err := workspaceactivity.NewService(chatService, workflowService)
	if err != nil {
		_ = workflowStore.Close()
		return runtimeServices{}, fmt.Errorf("create workspace activity service: %w", err)
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
		return runtimeServices{}, err
	}
	chatService.SetSemanticContextCompiler(semanticGraphService)
	if err := workflowService.SetSemanticContextCompiler(semanticGraphService); err != nil {
		workspaceActivityService.CloseEvents()
		_ = semanticGraphStore.Close()
		_ = workflowStore.Close()
		return runtimeServices{}, fmt.Errorf("configure semantic context compiler: %w", err)
	}
	if err := semanticGraphService.StartCartographerEventObserver(context.Background(), chatService, workflowService); err != nil {
		workspaceActivityService.CloseEvents()
		_ = semanticGraphStore.Close()
		_ = workflowStore.Close()
		return runtimeServices{}, fmt.Errorf("start semantic cartographer observer: %w", err)
	}
	terminalService, codexAccountService, err := newRuntimeEdgeServices(
		config,
		workspaceService,
		chatService,
		codexManager,
		semanticGraphService,
		semanticGraphStore,
		workspaceActivityService,
		workflowStore,
	)
	if err != nil {
		return runtimeServices{}, err
	}

	return runtimeServices{
		appearanceService:        appearanceService,
		chatService:              chatService,
		codexAccountService:      codexAccountService,
		codexManager:             codexManager,
		semanticGraphService:     semanticGraphService,
		semanticGraphStore:       semanticGraphStore,
		terminalService:          terminalService,
		workspaceActivityService: workspaceActivityService,
		workspaceUIService:       workspaceUIService,
		workspaceService:         workspaceService,
		workflowService:          workflowService,
		workflowStore:            workflowStore,
	}, nil
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

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	return &http.Server{
		Handler: httpapi.NewHandler(httpapi.HandlerConfig{
			Metadata: httpapi.BackendMetadata{
				Name:    httpapi.BackendName,
				Version: config.Version,
			},
			AppearanceService:        services.appearanceService,
			ChatService:              services.chatService,
			CodexAccountService:      services.codexAccountService,
			SemanticGraphService:     services.semanticGraphService,
			TerminalService:          services.terminalService,
			WorkspaceActivityService: services.workspaceActivityService,
			WorkspaceUIService:       services.workspaceUIService,
			WorkspaceService:         services.workspaceService,
			WorkflowService:          services.workflowService,
		}),
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
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
	httpShutdown := server.startHTTPShutdown(ctx)
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownChatTurns(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.closeEventStreams(ctx))
	shutdownErr = firstShutdownError(shutdownErr, waitHTTPShutdown(ctx, httpShutdown))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownTerminal(ctx))
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
