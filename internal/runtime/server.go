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

	"setta/internal/appstate"
	"setta/internal/chat"
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
	Stdout          io.Writer
	Stderr          io.Writer
	ShutdownTimeout time.Duration
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
	closeEvents func()
	server      *http.Server
	listener    net.Listener
	done        chan error
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
	appStore, err := appstate.NewStore(config.AppDataDir)
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("create app state store: %w", err)
	}
	workspaceManager, err := workspace.NewManager(config.AppDataDir)
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("create workspace manager: %w", err)
	}
	workspaceService, err := workspacesession.NewService(appStore, workspaceManager)
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("load workspace session: %w", err)
	}
	chatStore, err := chat.NewStore(config.AppDataDir)
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("create chat store: %w", err)
	}
	harness, err := chatHarness(config.ChatHarness)
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	chatService, err := chat.NewService(chatStore, workspaceService, harness)
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("create chat service: %w", err)
	}

	server := &Server{
		closeEvents: chatService.CloseEvents,
		server: &http.Server{
			Handler: httpapi.NewHandler(httpapi.HandlerConfig{
				Metadata: httpapi.BackendMetadata{
					Name:    httpapi.BackendName,
					Version: config.Version,
				},
				ChatService:      chatService,
				WorkspaceService: workspaceService,
			}),
		},
		listener: listener,
		done:     make(chan error, 1),
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{Event: "ready", Addr: listener.Addr().String()}); err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
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
	return server.server.Shutdown(ctx)
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

func chatHarness(mode ChatHarnessMode) (chat.Harness, error) {
	switch mode {
	case ChatHarnessCodex:
		return chat.NewCodexHarness(chat.CodexHarnessConfig{}), nil
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
