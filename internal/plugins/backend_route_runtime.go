package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"setta/internal/config"
	"setta/internal/realtime"
)

var (
	ErrBackendRouteRuntimeDiscoveryRequired = errors.New("plugins: backend route runtime discovery service is required")
	ErrBackendRouteRuntimeProviderRequired  = errors.New("plugins: backend route runtime worker provider is required")
	ErrBackendRouteRuntimeServerModeNeeded  = errors.New("plugins: backend route runtime server mode is required")
)

type BackendRouteRuntimeOptions struct {
	DiscoveryService *DiscoveryService
	Snapshot         *DiscoverySnapshot
	RuntimeProvider  WorkerRuntimeProvider
	ListenerProducer *realtime.ListenerProducer
	ProjectStateRead ProjectStateReader
	ServerMode       config.Mode
	Logger           *slog.Logger
}

type BackendRouteRuntime struct {
	logger *slog.Logger

	listenerProducer *realtime.ListenerProducer
	projectStateRead ProjectStateReader

	mcpTools    []RegisteredMCPTool
	sessions    map[string]*StartedWorkerSession
	mcpToolByID map[string]RegisteredMCPTool
}

type BackendMCPToolCallError struct {
	Code    string
	Message string
}

func (e *BackendMCPToolCallError) Error() string {
	if e == nil {
		return ""
	}
	if strings.TrimSpace(e.Code) == "" {
		return e.Message
	}
	if strings.TrimSpace(e.Message) == "" {
		return e.Code
	}
	return e.Code + ": " + e.Message
}

func NewBackendRouteRuntime(ctx context.Context, options BackendRouteRuntimeOptions) (*BackendRouteRuntime, error) {
	if options.DiscoveryService == nil && options.Snapshot == nil {
		return nil, ErrBackendRouteRuntimeDiscoveryRequired
	}
	if options.RuntimeProvider == nil {
		return nil, ErrBackendRouteRuntimeProviderRequired
	}
	if options.ServerMode == "" {
		return nil, ErrBackendRouteRuntimeServerModeNeeded
	}
	if ctx == nil {
		ctx = context.Background()
	}

	snapshot := DiscoverySnapshot{}
	if options.Snapshot != nil {
		snapshot = *options.Snapshot
	} else {
		discoveredSnapshot, err := options.DiscoveryService.Rescan()
		if err != nil {
			return nil, err
		}
		snapshot = discoveredSnapshot
	}

	runtimePlugins := collectBackendRuntimePlugins(snapshot.Plugins)
	runtime := &BackendRouteRuntime{
		logger:           options.Logger,
		listenerProducer: options.ListenerProducer,
		projectStateRead: options.ProjectStateRead,
		mcpTools:         []RegisteredMCPTool{},
		sessions:         map[string]*StartedWorkerSession{},
		mcpToolByID:      map[string]RegisteredMCPTool{},
	}
	if len(runtimePlugins) == 0 {
		return runtime, nil
	}

	workerRuntime, err := options.RuntimeProvider.ResolveWorkerRuntime(ctx)
	if err != nil {
		return nil, err
	}

	for _, entry := range runtimePlugins {
		if err := runtime.startPlugin(ctx, entry, workerRuntime, options.ServerMode); err != nil {
			runtime.logStartupError(entry.PluginID, err)
		}
	}
	runtime.sortRegistrations()
	return runtime, nil
}

func (r *BackendRouteRuntime) MCPTools() []RegisteredMCPTool {
	if r == nil || len(r.mcpTools) == 0 {
		return nil
	}

	registrations := make([]RegisteredMCPTool, len(r.mcpTools))
	for index, registration := range r.mcpTools {
		registrations[index] = cloneRegisteredMCPTool(registration)
	}
	return registrations
}

func (r *BackendRouteRuntime) Close() error {
	if r == nil {
		return nil
	}

	pluginIDs := make([]string, 0, len(r.sessions))
	for pluginID := range r.sessions {
		pluginIDs = append(pluginIDs, pluginID)
	}
	sort.Strings(pluginIDs)

	var closeErr error
	for _, pluginID := range pluginIDs {
		session := r.sessions[pluginID]
		if session == nil {
			continue
		}
		if err := session.Close(); err != nil {
			closeErr = errors.Join(closeErr, err)
		}
	}
	return closeErr
}

func (r *BackendRouteRuntime) InvokeMCPTool(ctx context.Context, toolName string, arguments map[string]any) (any, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	tool, ok := r.mcpToolByID[strings.TrimSpace(toolName)]
	if !ok {
		return nil, &BackendMCPToolCallError{
			Code:    "PLUGIN_BACKEND_REGISTER_FAILED",
			Message: fmt.Sprintf("Plugin MCP tool not found: %s", strings.TrimSpace(toolName)),
		}
	}

	session := r.session(tool.PluginID)
	if session == nil || session.Session == nil {
		return nil, backendMCPToolUnavailableError(tool.PluginID, tool.Name)
	}

	workerArguments := cloneStringAnyMap(arguments)
	if workerArguments == nil {
		workerArguments = map[string]any{}
	}

	payload, err := session.Session.Call(ctx, "plugin.invoke_mcp_tool", map[string]any{
		"toolName": tool.Name,
		"args":     []any{},
		"kwargs":   workerArguments,
	})
	if err != nil {
		var workerErr *WorkerRPCError
		switch {
		case errors.Is(err, ErrWorkerSessionClosed):
			return nil, backendMCPToolUnavailableError(tool.PluginID, tool.Name)
		case errors.As(err, &workerErr):
			return nil, &BackendMCPToolCallError{
				Code:    strings.TrimSpace(workerErr.Code),
				Message: strings.TrimSpace(workerErr.Message),
			}
		default:
			return nil, &BackendMCPToolCallError{
				Code:    workerRPCTransportErrorCode,
				Message: fmt.Sprintf("Plugin worker MCP tool call failed for %s:%s: %v", tool.PluginID, tool.Name, err),
			}
		}
	}

	decoded, decodeErr := decodeBackendMCPToolResult(payload)
	if decodeErr != nil {
		return nil, decodeErr
	}
	return decoded, nil
}

func (r *BackendRouteRuntime) session(pluginID string) *StartedWorkerSession {
	if r == nil {
		return nil
	}
	return r.sessions[strings.TrimSpace(pluginID)]
}

func (r *BackendRouteRuntime) startPlugin(
	ctx context.Context,
	entry DiscoveredPlugin,
	runtime WorkerRuntime,
	serverMode config.Mode,
) error {
	entrypoint, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Backend.Entrypoint, "plugin backend entrypoint")
	if err != nil {
		return err
	}

	mcpTools := NewMCPToolRegistry()
	languageServers := NewLanguageServerRegistry()
	externalAgentAdapters := NewExternalAgentAdapterRegistry()
	codegenTargets := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer:              r.listenerProducer,
		ProjectStateReader:            r.projectStateRead,
		MCPToolRegistrar:              mcpTools,
		LanguageServerRegistrar:       languageServers,
		ExternalAgentAdapterRegistrar: externalAgentAdapters,
		CodegenTargetRegistrar:        codegenTargets,
	})
	if err != nil {
		return err
	}
	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		return err
	}

	started, err := launcher.StartAndRegister(ctx, BackendWorkerSpec{
		CommandPrefix:         append([]string(nil), runtime.CommandPrefix...),
		PluginID:              entry.PluginID,
		PluginVersion:         entry.Version,
		PluginRoot:            entry.SourcePath,
		Entrypoint:            entrypoint,
		ServerMode:            string(serverMode),
		RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
		EffectiveCapabilities: append([]string(nil), entry.EffectiveCapabilities...),
		Environment:           append([]string(nil), runtime.Environment...),
		WorkingDirectory:      runtime.WorkingDirectory,
	})
	if err != nil {
		return err
	}

	toolRegistrations := mcpTools.Registrations()
	if len(toolRegistrations) == 0 {
		return started.Close()
	}

	r.sessions[entry.PluginID] = started
	for _, registration := range toolRegistrations {
		r.mcpTools = append(r.mcpTools, registration)
		r.mcpToolByID[registration.Name] = registration
	}
	return nil
}

func (r *BackendRouteRuntime) sortRegistrations() {
	sort.Slice(r.mcpTools, func(left int, right int) bool {
		if r.mcpTools[left].Name != r.mcpTools[right].Name {
			return r.mcpTools[left].Name < r.mcpTools[right].Name
		}
		return r.mcpTools[left].PluginID < r.mcpTools[right].PluginID
	})
}

func (r *BackendRouteRuntime) logStartupError(pluginID string, err error) {
	if r == nil || r.logger == nil {
		return
	}
	r.logger.Error("plugin backend runtime startup failed", "pluginId", pluginID, "error", err)
}

func collectBackendRuntimePlugins(entries []DiscoveredPlugin) []DiscoveredPlugin {
	plugins := make([]DiscoveredPlugin, 0, len(entries))
	for _, entry := range entries {
		if !shouldStartBackendRuntime(entry) {
			continue
		}
		plugins = append(plugins, entry)
	}
	sort.Slice(plugins, func(left int, right int) bool {
		return plugins[left].PluginID < plugins[right].PluginID
	})
	return plugins
}

func shouldStartBackendRuntime(entry DiscoveredPlugin) bool {
	if entry.ShadowedBySourcePath != "" {
		return false
	}
	if entry.Manifest == nil || entry.Manifest.Backend == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsCapability(entry.EffectiveCapabilities, CapabilityRegisterMCPTools)
}

func decodeBackendMCPToolResult(payload json.RawMessage) (any, error) {
	var decoded struct {
		Result any `json:"result"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, &BackendMCPToolCallError{
			Code:    workerRPCTransportErrorCode,
			Message: fmt.Sprintf("Plugin backend MCP tool response is invalid: %v", err),
		}
	}
	return decoded.Result, nil
}

func backendMCPToolUnavailableError(pluginID string, toolName string) error {
	return &BackendMCPToolCallError{
		Code:    workerRPCTransportErrorCode,
		Message: fmt.Sprintf("Plugin backend MCP tool is unavailable for %s:%s.", strings.TrimSpace(pluginID), strings.TrimSpace(toolName)),
	}
}
