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
	"os"
	"path/filepath"
	"strconv"
	"time"

	"setta/internal/appstate"
	"setta/internal/backendconn"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/httpapi"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

type Config struct {
	AppDataDir      string
	ChatHarness     ChatHarnessMode
	Host            string
	Port            int
	Version         string
	AuthToken       string
	Stdout          io.Writer
	Stderr          io.Writer
	ShutdownTimeout time.Duration

	backendURL string
}

type ChatHarnessMode string

const (
	ChatHarnessCodex            ChatHarnessMode = "codex"
	ChatHarnessScriptedWorkflow ChatHarnessMode = "scripted-workflow"
)

type ReadyEvent struct {
	Event string `json:"event"`
	Addr  string `json:"addr"`
}

type Server struct {
	closeCodex  func(context.Context) error
	closeEvents func()
	appDataDir  string
	server      *http.Server
	listener    net.Listener
	done        chan error
}

type runtimeServices struct {
	chatService         *chat.Service
	codexAccountService *codexaccount.Service
	codexManager        *codexapp.Manager
	workspaceService    *workspacesession.Service
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

func ValidateConfig(config Config) error {
	if err := validateAppDataDir(config.AppDataDir); err != nil {
		return err
	}
	if err := validateChatHarness(config.ChatHarness); err != nil {
		return err
	}
	if err := validateBackendAddress(config.Host, config.Port); err != nil {
		return err
	}
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.AuthToken == "" {
		return errors.New("backend auth token is required")
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

func validateChatHarness(mode ChatHarnessMode) error {
	if !validChatHarnessMode(mode) {
		return fmt.Errorf("unsupported chat harness mode: %s", mode)
	}
	return nil
}

func validateBackendAddress(host string, port int) error {
	if host == "" {
		return errors.New("host is required")
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return fmt.Errorf("host must be a numeric IP address: %w", err)
	}
	if !addr.IsLoopback() {
		return fmt.Errorf("host must be loopback: %s", host)
	}
	if port < 0 || port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535: %d", port)
	}
	return nil
}

func Start(ctx context.Context, config Config) (*Server, error) {
	config = normalizeConfig(config)
	if err := ValidateConfig(config); err != nil {
		return nil, err
	}

	listenConfig := net.ListenConfig{}
	listener, err := listenConfig.Listen(ctx, "tcp", net.JoinHostPort(config.Host, strconv.Itoa(config.Port)))
	if err != nil {
		return nil, fmt.Errorf("bind backend listener: %w", err)
	}
	config.backendURL = "http://" + listener.Addr().String()
	services, err := buildRuntimeServices(config)
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	if err := writeRuntimeConnectionFile(config); err != nil {
		_ = listener.Close()
		cleanupRuntimeServices(context.Background(), services)
		return nil, err
	}

	server := &Server{
		closeCodex:  services.codexManager.Shutdown,
		closeEvents: services.chatService.CloseEvents,
		appDataDir:  config.AppDataDir,
		server:      newHTTPServer(config, services),
		listener:    listener,
		done:        make(chan error, 1),
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{Event: "ready", Addr: listener.Addr().String()}); err != nil {
		_ = listener.Close()
		_ = backendconn.RemoveRuntimeFile(config.AppDataDir)
		cleanupRuntimeServices(context.Background(), services)
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
}

func buildRuntimeServices(config Config) (runtimeServices, error) {
	appStore, err := appstate.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create app state store: %w", err)
	}
	workspaceManager, err := workspace.NewManager(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create workspace manager: %w", err)
	}
	workspaceService, err := workspacesession.NewService(appStore, workspaceManager)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("load workspace session: %w", err)
	}
	chatStore, err := chat.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create chat store: %w", err)
	}
	codexManager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
			Args:    []string{"app-server", "--listen", "stdio://"},
			Env:     settaAgentBaseEnv(config),
		},
		InitializeParams: chat.CodexInitializeParams(chat.CodexHarnessConfig{}),
	})
	harness, err := chatHarness(config)
	if err != nil {
		return runtimeServices{}, err
	}
	chatService, err := chat.NewService(chatStore, workspaceService, harness)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create chat service: %w", err)
	}
	codexAccountService, err := codexaccount.NewService(codexManager, chatService.PublishCodexAccountChanged)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create Codex account service: %w", err)
	}

	return runtimeServices{
		chatService:         chatService,
		codexAccountService: codexAccountService,
		codexManager:        codexManager,
		workspaceService:    workspaceService,
	}, nil
}

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	return &http.Server{
		Handler: httpapi.NewHandler(httpapi.HandlerConfig{
			Metadata: httpapi.BackendMetadata{
				Name:    httpapi.BackendName,
				Version: config.Version,
			},
			AuthToken:           config.AuthToken,
			ChatService:         services.chatService,
			CodexAccountService: services.codexAccountService,
			WorkspaceService:    services.workspaceService,
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
	if server.closeEvents != nil {
		server.closeEvents()
	}
	shutdownErr := server.server.Shutdown(ctx)
	if server.closeCodex != nil {
		if err := server.closeCodex(ctx); err != nil && shutdownErr == nil {
			shutdownErr = err
		}
	}
	if err := backendconn.RemoveRuntimeFile(server.appDataDir); err != nil && shutdownErr == nil {
		shutdownErr = err
	}
	return shutdownErr
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

func writeRuntimeConnectionFile(config Config) error {
	return backendconn.WriteRuntimeFile(backendconn.RuntimeFile{
		SchemaVersion: backendconn.RuntimeSchemaVersion,
		Addr:          config.backendURL,
		Token:         config.AuthToken,
		PID:           os.Getpid(),
		AppDataDir:    config.AppDataDir,
		StartedAt:     time.Now().UTC().Format(time.RFC3339Nano),
		Version:       config.Version,
	})
}

func cleanupRuntimeServices(ctx context.Context, services runtimeServices) {
	if services.chatService != nil {
		services.chatService.CloseEvents()
	}
	if services.codexManager != nil {
		_ = services.codexManager.Shutdown(ctx)
	}
}

func chatHarness(config Config) (chat.Harness, error) {
	switch config.ChatHarness {
	case ChatHarnessCodex:
		return chat.NewCodexHarness(chat.CodexHarnessConfig{
			Env:        settaAgentBaseEnv(config),
			SessionEnv: settaAgentSessionEnv,
		}), nil
	case ChatHarnessScriptedWorkflow:
		return chat.NewScriptedWorkflowHarness(), nil
	default:
		return nil, fmt.Errorf("unsupported chat harness mode: %s", config.ChatHarness)
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

func settaAgentBaseEnv(config Config) []string {
	return []string{
		backendconn.AddrEnv + "=" + config.backendURL,
		backendconn.TokenEnv + "=" + config.AuthToken,
		backendconn.AppDataDirEnv + "=" + config.AppDataDir,
	}
}

func settaAgentSessionEnv(envContext chat.CodexSessionEnvContext) []string {
	env := []string{}
	if envContext.Workspace.ID != "" {
		env = append(env,
			"SETTA_WORKSPACE_ID="+envContext.Workspace.ID,
			"SETTA_WORKSPACE_ROOT="+envContext.Workspace.RootPath,
		)
	}
	if envContext.Conversation.ID != "" {
		env = append(env, "SETTA_CONVERSATION_ID="+envContext.Conversation.ID)
	}
	if envContext.Run != nil && envContext.Run.ID != "" {
		env = append(env, "SETTA_RUN_ID="+envContext.Run.ID)
	}
	return env
}
