package plugins

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

var (
	ErrWorkerHostListenerEndpointRegistrarRequired = errors.New("plugins: listener endpoint registrar is required")
	ErrWorkerHostListenerEndpointRequired          = errors.New("plugins: listener endpoint registration is required")
	ErrWorkerHostListenerEndpointNameRequired      = errors.New("plugins: listener endpoint name is required")
	ErrWorkerHostListenerEndpointRouteIDRequired   = errors.New("plugins: listener endpoint route id is required")
	ErrWorkerHostListenerEndpointUnknownRoute      = errors.New("plugins: listener endpoint route id is unknown")
	ErrBackendListenerEndpointRegistrationConflict = errors.New("plugins: duplicate backend listener endpoint registration")
)

type BackendListenerEndpointRegistrar interface {
	RegisterListenerEndpoint(context.Context, RegisteredBackendListenerEndpoint) error
}

type RegisteredBackendListenerEndpoint struct {
	PluginID     string
	EndpointName string
	RouteID      string
}

type backendListenerEndpointRouteLookup interface {
	HasRoute(pluginID string, routeID string) bool
}

type BackendListenerEndpointRegistry struct {
	mu          sync.Mutex
	routeLookup backendListenerEndpointRouteLookup
	byName      map[string]RegisteredBackendListenerEndpoint
	endpoints   []RegisteredBackendListenerEndpoint
}

func NewBackendListenerEndpointRegistry(routeLookup backendListenerEndpointRouteLookup) *BackendListenerEndpointRegistry {
	return &BackendListenerEndpointRegistry{
		routeLookup: routeLookup,
		byName:      map[string]RegisteredBackendListenerEndpoint{},
	}
}

func (r *BackendListenerEndpointRegistry) RegisterListenerEndpoint(_ context.Context, registration RegisteredBackendListenerEndpoint) error {
	if r == nil {
		return ErrWorkerHostListenerEndpointRegistrarRequired
	}

	pluginID := strings.TrimSpace(registration.PluginID)
	if pluginID == "" {
		return ErrWorkerHostPluginIDRequired
	}

	endpointName := strings.TrimSpace(registration.EndpointName)
	if endpointName == "" {
		return ErrWorkerHostListenerEndpointNameRequired
	}

	routeID := strings.TrimSpace(registration.RouteID)
	if routeID == "" {
		return ErrWorkerHostListenerEndpointRouteIDRequired
	}

	if r.routeLookup == nil || !r.routeLookup.HasRoute(pluginID, routeID) {
		return fmt.Errorf("%w: %s:%s", ErrWorkerHostListenerEndpointUnknownRoute, pluginID, routeID)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	existing, exists := r.byName[endpointName]
	if exists {
		if existing.PluginID == pluginID && existing.RouteID == routeID {
			return nil
		}
		return fmt.Errorf("%w: %s", ErrBackendListenerEndpointRegistrationConflict, endpointName)
	}

	cloned := RegisteredBackendListenerEndpoint{
		PluginID:     pluginID,
		EndpointName: endpointName,
		RouteID:      routeID,
	}
	r.byName[endpointName] = cloned
	r.endpoints = append(r.endpoints, cloned)
	return nil
}

func (r *BackendListenerEndpointRegistry) Registrations() []RegisteredBackendListenerEndpoint {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredBackendListenerEndpoint, len(r.endpoints))
	copy(registrations, r.endpoints)
	return registrations
}
