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
	"strconv"
	"time"

	"setta/internal/httpapi"
)

type Config struct {
	Host            string
	Port            int
	Version         string
	Stdout          io.Writer
	Stderr          io.Writer
	ShutdownTimeout time.Duration
}

type ReadyEvent struct {
	Event string `json:"event"`
	Addr  string `json:"addr"`
}

type Server struct {
	server   *http.Server
	listener net.Listener
	done     chan error
}

func DefaultConfig() Config {
	return Config{
		Host:            "127.0.0.1",
		Port:            0,
		Version:         "dev",
		Stdout:          io.Discard,
		Stderr:          io.Discard,
		ShutdownTimeout: 5 * time.Second,
	}
}

func (config Config) Validate() error {
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

	server := &Server{
		server: &http.Server{
			Handler: httpapi.NewHandler(httpapi.BackendMetadata{
				Name:    httpapi.BackendName,
				Version: config.Version,
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
	return config
}
