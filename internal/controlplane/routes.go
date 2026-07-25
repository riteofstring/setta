package controlplane

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

type RouteResolverConfig struct {
	Dialer runtimeprovider.PrivateAccessDialer
	Routes interface {
		ResolveRoute(context.Context, string) (RouteRecord, error)
	}
	RuntimeTarget string
	Secrets       SecretStore
}

type RouteResolver struct {
	dialer runtimeprovider.PrivateAccessDialer
	routes interface {
		ResolveRoute(context.Context, string) (RouteRecord, error)
	}
	runtimeTarget string
	secrets       SecretStore
	mu            sync.Mutex
	closed        bool
	transports    map[string]*http.Transport
}

func NewRouteResolver(config RouteResolverConfig) (*RouteResolver, error) {
	if config.Dialer == nil {
		return nil, errors.New("control-plane private runtime dialer is required")
	}
	if config.Routes == nil {
		return nil, errors.New("control-plane route store is required")
	}
	if config.Secrets == nil {
		return nil, errors.New("control-plane secret store is required")
	}
	if config.RuntimeTarget == "" {
		return nil, errors.New("control-plane runtime target is required")
	}
	return &RouteResolver{
		dialer:        config.Dialer,
		routes:        config.Routes,
		runtimeTarget: config.RuntimeTarget,
		secrets:       config.Secrets,
		transports:    map[string]*http.Transport{},
	}, nil
}

func (resolver *RouteResolver) ResolveRuntimeRoute(
	ctx context.Context,
	runtimeName string,
) (runtimeaccess.RuntimeRoute, error) {
	record, err := resolver.routes.ResolveRoute(ctx, runtimeName)
	if err != nil {
		return runtimeaccess.RuntimeRoute{}, err
	}
	secret, err := resolver.secrets.ReadSecret(ctx, record.CredentialSecretRef)
	if err != nil {
		return runtimeaccess.RuntimeRoute{}, fmt.Errorf("resolve runtime credential: %w", err)
	}
	transport, err := resolver.transport(runtimeName)
	if err != nil {
		return runtimeaccess.RuntimeRoute{}, err
	}
	return runtimeaccess.RuntimeRoute{
		RuntimeName:       record.RuntimeName,
		UpstreamAuthority: record.UpstreamAuthority,
		RuntimeCredential: string(secret),
		Transport:         transport,
	}, nil
}

func (resolver *RouteResolver) Close() error {
	resolver.mu.Lock()
	defer resolver.mu.Unlock()
	if resolver.closed {
		return nil
	}
	for _, transport := range resolver.transports {
		transport.CloseIdleConnections()
	}
	resolver.transports = nil
	resolver.closed = true
	return nil
}

func (resolver *RouteResolver) transport(runtimeName string) (*http.Transport, error) {
	resolver.mu.Lock()
	defer resolver.mu.Unlock()
	if resolver.closed {
		return nil, errors.New("control-plane route resolver is closed")
	}
	if existing := resolver.transports[runtimeName]; existing != nil {
		return existing, nil
	}
	transport, err := runtimeaccess.NewPrivateHTTPTransport(resolver.dialer, runtimeName, resolver.runtimeTarget)
	if err != nil {
		return nil, err
	}
	resolver.transports[runtimeName] = transport
	return transport, nil
}

var _ runtimeaccess.RuntimeRouteResolver = (*RouteResolver)(nil)
