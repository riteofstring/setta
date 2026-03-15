package plugins

import (
	"context"
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

func (h *BackendRuntimeHolder) InvokeMCPTool(ctx context.Context, toolName string, arguments map[string]any) (any, error) {
	runtime := h.Current()
	if runtime == nil {
		return nil, backendMCPToolUnavailableError("", toolName)
	}
	return runtime.InvokeMCPTool(ctx, toolName, arguments)
}
