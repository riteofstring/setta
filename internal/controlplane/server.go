package controlplane

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"

	"setta/internal/httpapi"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

type ServerConfig struct {
	Attachments           runtimeaccess.GatewayAttachmentRecorder
	Authorizer            runtimeaccess.ClientAuthorizer
	Dialer                runtimeprovider.PrivateAccessDialer
	ListenAddress         string
	MaxConcurrentRequests int
	MaxRequestBytes       int64
	Observer              runtimeaccess.GatewayObserver
	Routes                interface {
		ResolveRoute(context.Context, string) (RouteRecord, error)
	}
	RuntimeTarget string
	Secrets       SecretStore
}

type Server struct {
	httpServer  *http.Server
	listener    net.Listener
	routes      *RouteResolver
	done        chan error
	closeOnce   sync.Once
	shutdownErr error
}

func StartServer(config ServerConfig) (*Server, error) {
	if err := validateServerConfig(config); err != nil {
		return nil, err
	}
	routes, err := NewRouteResolver(RouteResolverConfig{
		Dialer:        config.Dialer,
		Routes:        config.Routes,
		RuntimeTarget: config.RuntimeTarget,
		Secrets:       config.Secrets,
	})
	if err != nil {
		return nil, err
	}
	gateway, err := runtimeaccess.NewGateway(runtimeaccess.GatewayConfig{
		Attachments: config.Attachments,
		Authorizer:  config.Authorizer,
		Classifier:  runtimeaccess.GatewayRequestClassifierFunc(httpapi.GatewayOperation),
		Observer:    config.Observer,
		Routes:      routes,
	})
	if err != nil {
		_ = routes.Close()
		return nil, err
	}
	httpServer, err := runtimeaccess.NewGatewayHTTPServer(gateway)
	if err != nil {
		_ = routes.Close()
		return nil, err
	}
	httpServer.Handler = controlPlaneHandler(boundedGatewayHandler(
		httpServer.Handler,
		config.MaxConcurrentRequests,
		config.MaxRequestBytes,
	))
	listener, err := net.Listen("tcp", config.ListenAddress)
	if err != nil {
		_ = routes.Close()
		return nil, fmt.Errorf("listen for control-plane gateway: %w", err)
	}
	server := &Server{
		httpServer: httpServer,
		listener:   listener,
		routes:     routes,
		done:       make(chan error, 1),
	}
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		server.done <- err
		close(server.done)
	}()
	return server, nil
}

func (server *Server) Addr() net.Addr {
	return server.listener.Addr()
}

func (server *Server) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("control-plane shutdown context is required")
	}
	server.closeOnce.Do(func() {
		if err := server.httpServer.Shutdown(ctx); err != nil {
			server.shutdownErr = fmt.Errorf("shutdown control-plane gateway: %w", err)
			_ = server.httpServer.Close()
		}
		if err := server.routes.Close(); err != nil && server.shutdownErr == nil {
			server.shutdownErr = err
		}
	})
	return server.shutdownErr
}

func (server *Server) Wait() error {
	return <-server.done
}

func validateServerConfig(config ServerConfig) error {
	if config.Attachments == nil || config.Authorizer == nil || config.Observer == nil ||
		config.Routes == nil || config.Secrets == nil || config.Dialer == nil {
		return errors.New("control-plane server dependencies are required")
	}
	if config.ListenAddress == "" {
		return errors.New("control-plane listen address is required")
	}
	if config.RuntimeTarget == "" {
		return errors.New("control-plane runtime target is required")
	}
	if config.MaxConcurrentRequests <= 0 || config.MaxRequestBytes <= 0 {
		return errors.New("control-plane request ceilings must be positive")
	}
	return nil
}

func boundedGatewayHandler(next http.Handler, maximumConcurrent int, maximumBodyBytes int64) http.Handler {
	semaphore := make(chan struct{}, maximumConcurrent)
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.ContentLength < 0 {
			http.Error(response, "gateway_content_length_required", http.StatusLengthRequired)
			return
		}
		if request.ContentLength > maximumBodyBytes {
			http.Error(response, "gateway_request_too_large", http.StatusRequestEntityTooLarge)
			return
		}
		select {
		case semaphore <- struct{}{}:
			defer func() { <-semaphore }()
		default:
			http.Error(response, "gateway_capacity_exhausted", http.StatusServiceUnavailable)
			return
		}
		request.Body = http.MaxBytesReader(response, request.Body, maximumBodyBytes)
		next.ServeHTTP(response, request)
	})
}

func controlPlaneHandler(gateway http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/healthz" {
			if request.Method != http.MethodGet {
				response.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			response.WriteHeader(http.StatusNoContent)
			return
		}
		gateway.ServeHTTP(response, request)
	})
}
