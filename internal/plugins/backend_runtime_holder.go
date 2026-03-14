package plugins

import (
	"context"
	"net/http"
	"sync"
)

type BackendRuntimeHolder struct {
	mu      sync.RWMutex
	runtime *BackendRouteRuntime
}

func NewBackendRuntimeHolder(runtime *BackendRouteRuntime) *BackendRuntimeHolder {
	return &BackendRuntimeHolder{runtime: runtime}
}

func (h *BackendRuntimeHolder) Current() *BackendRouteRuntime {
	if h == nil {
		return nil
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.runtime
}

func (h *BackendRuntimeHolder) Swap(runtime *BackendRouteRuntime) *BackendRouteRuntime {
	if h == nil {
		return runtime
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	previous := h.runtime
	h.runtime = runtime
	return previous
}

func (h *BackendRuntimeHolder) Close() error {
	if h == nil {
		return nil
	}

	runtime := h.Swap(nil)
	if runtime == nil {
		return nil
	}
	return runtime.Close()
}

func (h *BackendRuntimeHolder) MatchRoute(method string, path string) (BackendRoute, map[string]string, bool) {
	runtime := h.Current()
	if runtime == nil {
		return BackendRoute{}, nil, false
	}
	return runtime.MatchRoute(method, path)
}

func (h *BackendRuntimeHolder) AllowedMethods(path string) []string {
	runtime := h.Current()
	if runtime == nil {
		return nil
	}
	return runtime.AllowedMethods(path)
}

func (h *BackendRuntimeHolder) ProxyRoute(
	ctx context.Context,
	route BackendRoute,
	request *http.Request,
	pathParams map[string]string,
) (BackendRouteResponse, error) {
	return h.Current().ProxyRoute(ctx, route, request, pathParams)
}

func (h *BackendRuntimeHolder) ResolveStaticAssetPath(pluginID string, assetPath string) (string, error) {
	return h.Current().ResolveStaticAssetPath(pluginID, assetPath)
}

func (h *BackendRuntimeHolder) InvokeMCPTool(ctx context.Context, toolName string, arguments map[string]any) (any, error) {
	return h.Current().InvokeMCPTool(ctx, toolName, arguments)
}

func (h *BackendRuntimeHolder) InvokeListenerEndpoint(ctx context.Context, endpointName string, payload map[string]any) (any, error) {
	return h.Current().InvokeListenerEndpoint(ctx, endpointName, payload)
}
