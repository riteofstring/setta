package plugins

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
)

var (
	ErrWorkerHostRouterRegistrationRequired = errors.New("plugins: router registration is required")
	ErrWorkerHostRouterPrefixInvalid        = errors.New("plugins: router prefix is invalid")
	ErrWorkerHostRouteIDRequired            = errors.New("plugins: backend route id is required")
	ErrWorkerHostRoutePathRequired          = errors.New("plugins: backend route path is required")
	ErrWorkerHostRouteMethodsInvalid        = errors.New("plugins: backend route methods are invalid")
	ErrWorkerHostRouteMethodUnsupported     = errors.New("plugins: backend route method is unsupported")
	ErrWorkerHostRouteNeedsRawBodyInvalid   = errors.New("plugins: backend route needsRawBody is invalid")
	ErrBackendRouteRegistrationConflict     = errors.New("plugins: duplicate backend route registration")
)

var backendRouteMountSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9._~-]+$`)

type BackendRouterRegistrar interface {
	RegisterRouter(context.Context, RegisteredBackendRouter) error
}

type RegisteredBackendRouter struct {
	PluginID string
	Prefix   string
	Routes   []RegisteredBackendRoute
}

type RegisteredBackendRoute struct {
	RouteID      string
	Path         string
	Methods      []string
	NeedsRawBody bool
}

type BackendRouterRegistry struct {
	mu         sync.Mutex
	byPluginID map[string]map[string]RegisteredBackendRoute
	registries []RegisteredBackendRouter
}

func NewBackendRouterRegistry() *BackendRouterRegistry {
	return &BackendRouterRegistry{
		byPluginID: make(map[string]map[string]RegisteredBackendRoute),
	}
}

func (r *BackendRouterRegistry) RegisterRouter(_ context.Context, registration RegisteredBackendRouter) error {
	if r == nil {
		return ErrWorkerHostRouterRegistrarRequired
	}

	pluginID := strings.TrimSpace(registration.PluginID)
	if pluginID == "" {
		return ErrWorkerHostPluginIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	knownRouteIDs, ok := r.byPluginID[pluginID]
	if !ok {
		knownRouteIDs = make(map[string]RegisteredBackendRoute)
		r.byPluginID[pluginID] = knownRouteIDs
	}

	cloned := RegisteredBackendRouter{
		PluginID: pluginID,
		Prefix:   registration.Prefix,
		Routes:   make([]RegisteredBackendRoute, 0, len(registration.Routes)),
	}
	for _, route := range registration.Routes {
		if _, exists := knownRouteIDs[route.RouteID]; exists {
			return fmt.Errorf("%w: %s:%s", ErrBackendRouteRegistrationConflict, pluginID, route.RouteID)
		}
		copiedRoute := RegisteredBackendRoute{
			RouteID:      route.RouteID,
			Path:         route.Path,
			Methods:      append([]string(nil), route.Methods...),
			NeedsRawBody: route.NeedsRawBody,
		}
		knownRouteIDs[copiedRoute.RouteID] = copiedRoute
		cloned.Routes = append(cloned.Routes, copiedRoute)
	}
	r.registries = append(r.registries, cloned)
	return nil
}

func (r *BackendRouterRegistry) Registrations() []RegisteredBackendRouter {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredBackendRouter, 0, len(r.registries))
	for _, registration := range r.registries {
		copied := RegisteredBackendRouter{
			PluginID: registration.PluginID,
			Prefix:   registration.Prefix,
			Routes:   make([]RegisteredBackendRoute, 0, len(registration.Routes)),
		}
		for _, route := range registration.Routes {
			copied.Routes = append(copied.Routes, RegisteredBackendRoute{
				RouteID:      route.RouteID,
				Path:         route.Path,
				Methods:      append([]string(nil), route.Methods...),
				NeedsRawBody: route.NeedsRawBody,
			})
		}
		registrations = append(registrations, copied)
	}
	return registrations
}

func normalizeOptionalWorkerRoutePrefix(prefix *string) (string, error) {
	if prefix == nil {
		return "", nil
	}
	return normalizeWorkerMountSubpath(*prefix)
}

func normalizeWorkerMountSubpath(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "/" {
		return "", nil
	}

	normalized := strings.Trim(trimmed, "/")
	if normalized == "" {
		return "", nil
	}

	segments := strings.Split(normalized, "/")
	normalizedSegments := make([]string, 0, len(segments))
	for _, rawSegment := range segments {
		if rawSegment == "" {
			return "", fmt.Errorf("%w: empty path segment", ErrWorkerHostRouterPrefixInvalid)
		}
		decodedSegment, err := url.PathUnescape(rawSegment)
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrWorkerHostRouterPrefixInvalid, err)
		}
		if decodedSegment == "." || decodedSegment == ".." {
			return "", fmt.Errorf("%w: dot segment %q", ErrWorkerHostRouterPrefixInvalid, rawSegment)
		}
		if strings.TrimSpace(decodedSegment) != decodedSegment {
			return "", fmt.Errorf("%w: whitespace in path segment %q", ErrWorkerHostRouterPrefixInvalid, rawSegment)
		}
		if strings.Contains(decodedSegment, "/") || strings.Contains(decodedSegment, `\`) {
			return "", fmt.Errorf("%w: invalid separator in path segment %q", ErrWorkerHostRouterPrefixInvalid, rawSegment)
		}
		if !backendRouteMountSegmentPattern.MatchString(decodedSegment) {
			return "", fmt.Errorf("%w: invalid characters in path segment %q", ErrWorkerHostRouterPrefixInvalid, rawSegment)
		}
		normalizedSegments = append(normalizedSegments, decodedSegment)
	}
	return strings.Join(normalizedSegments, "/"), nil
}
