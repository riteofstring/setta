package plugins

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/config"
	"setta/internal/realtime"
	"setta/internal/statefs"
)

var (
	ErrBackendRouteRuntimeDiscoveryRequired = errors.New("plugins: backend route runtime discovery service is required")
	ErrBackendRouteRuntimeProviderRequired  = errors.New("plugins: backend route runtime worker provider is required")
	ErrBackendRouteRuntimeServerModeNeeded  = errors.New("plugins: backend route runtime server mode is required")
)

type BackendRouteRuntimeOptions struct {
	DiscoveryService *DiscoveryService
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

	routes         []BackendRoute
	mcpTools       []RegisteredMCPTool
	staticDirs     []RegisteredBackendStaticDir
	listeners      []RegisteredBackendListenerEndpoint
	sessions       map[string]*StartedWorkerSession
	routeByID      map[string]BackendRoute
	mcpToolByID    map[string]RegisteredMCPTool
	listenerByName map[string]RegisteredBackendListenerEndpoint
	staticByPID    map[string][]RegisteredBackendStaticDir
}

type BackendRoute struct {
	PluginID      string
	RouteID       string
	Pattern       string
	Methods       []string
	NeedsRawBody  bool
	RegisteredVia string
}

type BackendRouteHeader struct {
	Name  string
	Value string
}

type BackendRouteResponse struct {
	StatusCode        int
	Headers           []BackendRouteHeader
	MediaType         string
	Body              any
	BodyPresent       bool
	BinaryBody        []byte
	BinaryBodyPresent bool
}

type BackendRouteProxyError struct {
	StatusCode int
	Code       string
	Message    string
}

type BackendMCPToolCallError struct {
	Code    string
	Message string
}

type BackendListenerEndpointCallError struct {
	Code    string
	Message string
}

func (e *BackendRouteProxyError) Error() string {
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

func (e *BackendListenerEndpointCallError) Error() string {
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
	if options.DiscoveryService == nil {
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

	snapshot, err := options.DiscoveryService.Rescan()
	if err != nil {
		return nil, err
	}

	runtimePlugins := collectBackendRuntimePlugins(snapshot.Plugins)
	runtime := &BackendRouteRuntime{
		logger:           options.Logger,
		listenerProducer: options.ListenerProducer,
		projectStateRead: options.ProjectStateRead,
		routes:           []BackendRoute{},
		mcpTools:         []RegisteredMCPTool{},
		staticDirs:       []RegisteredBackendStaticDir{},
		listeners:        []RegisteredBackendListenerEndpoint{},
		sessions:         map[string]*StartedWorkerSession{},
		routeByID:        map[string]BackendRoute{},
		mcpToolByID:      map[string]RegisteredMCPTool{},
		listenerByName:   map[string]RegisteredBackendListenerEndpoint{},
		staticByPID:      map[string][]RegisteredBackendStaticDir{},
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

func (r *BackendRouteRuntime) Routes() []BackendRoute {
	if r == nil || len(r.routes) == 0 {
		return nil
	}

	routes := make([]BackendRoute, len(r.routes))
	for index, route := range r.routes {
		routes[index] = BackendRoute{
			PluginID:      route.PluginID,
			RouteID:       route.RouteID,
			Pattern:       route.Pattern,
			Methods:       append([]string(nil), route.Methods...),
			NeedsRawBody:  route.NeedsRawBody,
			RegisteredVia: route.RegisteredVia,
		}
	}
	return routes
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

func (r *BackendRouteRuntime) StaticDirs() []RegisteredBackendStaticDir {
	if r == nil || len(r.staticDirs) == 0 {
		return nil
	}

	registrations := make([]RegisteredBackendStaticDir, len(r.staticDirs))
	copy(registrations, r.staticDirs)
	return registrations
}

func (r *BackendRouteRuntime) ListenerEndpoints() []RegisteredBackendListenerEndpoint {
	if r == nil || len(r.listeners) == 0 {
		return nil
	}

	registrations := make([]RegisteredBackendListenerEndpoint, len(r.listeners))
	copy(registrations, r.listeners)
	return registrations
}

func (r *BackendRouteRuntime) ProxyRoute(
	ctx context.Context,
	route BackendRoute,
	request *http.Request,
	pathParams map[string]string,
) (BackendRouteResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if request == nil {
		return BackendRouteResponse{}, &BackendRouteProxyError{
			StatusCode: http.StatusBadGateway,
			Code:       workerRPCTransportErrorCode,
			Message:    "Plugin backend route request is missing.",
		}
	}

	session := r.session(route.PluginID)
	if session == nil || session.Session == nil {
		return BackendRouteResponse{}, backendRouteUnavailableError(route.PluginID)
	}

	jsonBody, rawBodyBase64, err := normalizeBackendRouteRequestBody(request, route.NeedsRawBody)
	if err != nil {
		return BackendRouteResponse{}, &BackendRouteProxyError{
			StatusCode: http.StatusBadGateway,
			Code:       workerRPCTransportErrorCode,
			Message:    fmt.Sprintf("Read request body for plugin %s route %s: %v", route.PluginID, route.RouteID, err),
		}
	}

	workerParams := map[string]any{
		"routeId":        route.RouteID,
		"pathParams":     cloneBackendRoutePathParams(pathParams),
		"queryParams":    normalizeBackendRouteQueryParams(request),
		"jsonBody":       jsonBody,
		"requestContext": buildBackendRouteRequestContext(request),
	}
	if rawBodyBase64 != nil {
		workerParams["rawBodyBase64"] = *rawBodyBase64
	}

	payload, err := session.Session.Call(ctx, "plugin.invoke_route", workerParams)
	if err != nil {
		var workerErr *WorkerRPCError
		switch {
		case errors.Is(err, ErrWorkerSessionClosed):
			return BackendRouteResponse{}, backendRouteUnavailableError(route.PluginID)
		case errors.As(err, &workerErr):
			return BackendRouteResponse{}, &BackendRouteProxyError{
				StatusCode: http.StatusBadGateway,
				Code:       strings.TrimSpace(workerErr.Code),
				Message:    strings.TrimSpace(workerErr.Message),
			}
		default:
			return BackendRouteResponse{}, &BackendRouteProxyError{
				StatusCode: http.StatusBadGateway,
				Code:       workerRPCTransportErrorCode,
				Message: fmt.Sprintf(
					"Plugin worker route call failed for %s:%s: %v",
					route.PluginID,
					route.RouteID,
					err,
				),
			}
		}
	}

	return decodeBackendRouteResponse(payload, route)
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

func (r *BackendRouteRuntime) InvokeListenerEndpoint(ctx context.Context, endpointName string, payload map[string]any) (any, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if r == nil {
		return nil, &BackendListenerEndpointCallError{
			Code:    workerRPCTransportErrorCode,
			Message: fmt.Sprintf("unknown listener endpoint: %s", strings.TrimSpace(endpointName)),
		}
	}

	registration, ok := r.listenerByName[strings.TrimSpace(endpointName)]
	if !ok {
		return nil, &BackendListenerEndpointCallError{
			Code:    workerRPCTransportErrorCode,
			Message: fmt.Sprintf("unknown listener endpoint: %s", strings.TrimSpace(endpointName)),
		}
	}

	route, ok := r.routeByID[registration.PluginID+":"+registration.RouteID]
	if !ok {
		return nil, &BackendListenerEndpointCallError{
			Code:    workerRPCTransportErrorCode,
			Message: fmt.Sprintf("listener endpoint route missing for %s", strings.TrimSpace(endpointName)),
		}
	}

	session := r.session(registration.PluginID)
	if session == nil || session.Session == nil {
		return nil, backendListenerEndpointUnavailableError(registration.PluginID, registration.EndpointName)
	}

	jsonBody := cloneStringAnyMap(payload)
	if jsonBody == nil {
		jsonBody = map[string]any{}
	}

	responsePayload, err := session.Session.Call(ctx, "plugin.invoke_route", map[string]any{
		"routeId":     route.RouteID,
		"pathParams":  map[string]string{},
		"queryParams": map[string]any{},
		"jsonBody":    jsonBody,
	})
	if err != nil {
		var workerErr *WorkerRPCError
		switch {
		case errors.Is(err, ErrWorkerSessionClosed):
			return nil, backendListenerEndpointUnavailableError(registration.PluginID, registration.EndpointName)
		case errors.As(err, &workerErr):
			return nil, &BackendListenerEndpointCallError{
				Code:    strings.TrimSpace(workerErr.Code),
				Message: strings.TrimSpace(workerErr.Message),
			}
		default:
			return nil, &BackendListenerEndpointCallError{
				Code:    workerRPCTransportErrorCode,
				Message: fmt.Sprintf("Plugin worker listener endpoint call failed for %s:%s: %v", registration.PluginID, registration.EndpointName, err),
			}
		}
	}

	response, err := decodeBackendRouteResponse(responsePayload, route)
	if err != nil {
		var proxyErr *BackendRouteProxyError
		if errors.As(err, &proxyErr) {
			return nil, &BackendListenerEndpointCallError{
				Code:    strings.TrimSpace(proxyErr.Code),
				Message: strings.TrimSpace(proxyErr.Message),
			}
		}
		return nil, &BackendListenerEndpointCallError{
			Code:    workerRPCTransportErrorCode,
			Message: err.Error(),
		}
	}

	if response.StatusCode < http.StatusOK || response.StatusCode > http.StatusMultipleChoices-1 {
		return nil, &BackendListenerEndpointCallError{
			Code:    workerRPCTransportErrorCode,
			Message: fmt.Sprintf("Plugin listener endpoint %s returned status %d.", registration.EndpointName, response.StatusCode),
		}
	}
	if !response.BodyPresent {
		return nil, nil
	}
	return response.Body, nil
}

func (r *BackendRouteRuntime) ResolveStaticAssetPath(pluginID string, assetPath string) (string, error) {
	if r == nil {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin static assets unavailable: %s", strings.TrimSpace(pluginID))
	}

	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin static assets unavailable: %s", pluginID)
	}

	registrations := r.staticByPID[trimmedPluginID]
	if len(registrations) == 0 {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin static assets unavailable: %s", trimmedPluginID)
	}

	requestPath := strings.TrimPrefix(assetPath, "/")
	registration, relativePath, ok := matchBackendStaticDir(registrations, requestPath)
	if !ok || relativePath == "" {
		return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin static asset not found: %s", strings.TrimSpace(assetPath))
	}

	resolvedPath, err := statefs.ResolveWithinRoot(registration.SourceDir, relativePath, "plugin static asset path")
	if err != nil {
		return "", newServiceError(ServiceErrorCodeAssetInvalidPath, "Invalid plugin static asset path: %s", strings.TrimSpace(assetPath))
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin static asset not found: %s", strings.TrimSpace(assetPath))
		}
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", newServiceError(ServiceErrorCodeAssetNotFound, "Plugin static asset not found: %s", strings.TrimSpace(assetPath))
	}
	return resolvedPath, nil
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

	routers := NewBackendRouterRegistry()
	listeners := NewBackendListenerEndpointRegistry(routers)
	staticDirs := NewBackendStaticDirRegistry()
	mcpTools := NewMCPToolRegistry()
	languageServers := NewLanguageServerRegistry()
	externalAgentAdapters := NewExternalAgentAdapterRegistry()
	codegenTargets := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer:              r.listenerProducer,
		ListenerEndpointRegistrar:     listeners,
		ProjectStateReader:            r.projectStateRead,
		RouterRegistrar:               routers,
		StaticDirRegistrar:            staticDirs,
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
		PythonBinary:          runtime.PythonBinary,
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

	registrations := routers.Registrations()
	routes := flattenRegisteredBackendRoutes(registrations)
	listenerRegistrations := listeners.Registrations()
	staticDirRegistrations := staticDirs.Registrations()
	toolRegistrations := mcpTools.Registrations()
	keepSession := len(routes) != 0 || len(toolRegistrations) != 0
	if !keepSession {
		if err := started.Close(); err != nil {
			return err
		}
	}

	if keepSession {
		r.sessions[entry.PluginID] = started
	}
	for _, route := range routes {
		r.routes = append(r.routes, route)
		r.routeByID[route.PluginID+":"+route.RouteID] = route
	}
	for _, registration := range toolRegistrations {
		r.mcpTools = append(r.mcpTools, registration)
		r.mcpToolByID[registration.Name] = registration
	}
	for _, registration := range listenerRegistrations {
		r.listeners = append(r.listeners, registration)
		r.listenerByName[registration.EndpointName] = registration
	}
	for _, registration := range staticDirRegistrations {
		r.staticDirs = append(r.staticDirs, registration)
	}
	return nil
}

func (r *BackendRouteRuntime) sortRegistrations() {
	sort.Slice(r.routes, func(left int, right int) bool {
		if r.routes[left].Pattern != r.routes[right].Pattern {
			return r.routes[left].Pattern < r.routes[right].Pattern
		}
		if r.routes[left].PluginID != r.routes[right].PluginID {
			return r.routes[left].PluginID < r.routes[right].PluginID
		}
		return r.routes[left].RouteID < r.routes[right].RouteID
	})
	sort.Slice(r.mcpTools, func(left int, right int) bool {
		if r.mcpTools[left].Name != r.mcpTools[right].Name {
			return r.mcpTools[left].Name < r.mcpTools[right].Name
		}
		return r.mcpTools[left].PluginID < r.mcpTools[right].PluginID
	})
	sort.Slice(r.staticDirs, func(left int, right int) bool {
		if r.staticDirs[left].PluginID != r.staticDirs[right].PluginID {
			return r.staticDirs[left].PluginID < r.staticDirs[right].PluginID
		}
		if len(r.staticDirs[left].URLPrefix) != len(r.staticDirs[right].URLPrefix) {
			return len(r.staticDirs[left].URLPrefix) > len(r.staticDirs[right].URLPrefix)
		}
		return r.staticDirs[left].URLPrefix < r.staticDirs[right].URLPrefix
	})

	r.staticByPID = map[string][]RegisteredBackendStaticDir{}
	for _, registration := range r.staticDirs {
		r.staticByPID[registration.PluginID] = append(r.staticByPID[registration.PluginID], registration)
	}
}

func (r *BackendRouteRuntime) logStartupError(pluginID string, err error) {
	if r == nil || r.logger == nil {
		return
	}
	r.logger.Error("plugin backend route runtime startup failed", "pluginId", pluginID, "error", err)
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
	return containsCapability(entry.EffectiveCapabilities, CapabilityRegisterRouter) ||
		containsCapability(entry.EffectiveCapabilities, CapabilityRegisterMCPTools) ||
		containsCapability(entry.EffectiveCapabilities, CapabilityRegisterStaticDir)
}

func flattenRegisteredBackendRoutes(registrations []RegisteredBackendRouter) []BackendRoute {
	routes := make([]BackendRoute, 0)
	for _, registration := range registrations {
		for _, route := range registration.Routes {
			routes = append(routes, BackendRoute{
				PluginID:      registration.PluginID,
				RouteID:       route.RouteID,
				Pattern:       buildBackendRoutePattern(registration.PluginID, registration.Prefix, route.Path),
				Methods:       append([]string(nil), route.Methods...),
				NeedsRawBody:  route.NeedsRawBody,
				RegisteredVia: registration.Prefix,
			})
		}
	}
	return routes
}

func buildBackendRoutePattern(pluginID string, prefix string, routePath string) string {
	base := "/plugins/" + strings.TrimSpace(pluginID)
	normalizedPrefix := strings.Trim(strings.TrimSpace(prefix), "/")
	if normalizedPrefix != "" {
		base += "/" + normalizedPrefix
	}
	normalizedPath := strings.TrimSpace(routePath)
	if !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}
	return base + normalizedPath
}

func matchBackendStaticDir(
	registrations []RegisteredBackendStaticDir,
	requestPath string,
) (RegisteredBackendStaticDir, string, bool) {
	for _, registration := range registrations {
		if registration.URLPrefix == "" {
			return registration, requestPath, true
		}
		if requestPath == registration.URLPrefix {
			return registration, "", true
		}
		prefix := registration.URLPrefix + "/"
		if strings.HasPrefix(requestPath, prefix) {
			return registration, requestPath[len(prefix):], true
		}
	}
	return RegisteredBackendStaticDir{}, "", false
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

func backendListenerEndpointUnavailableError(pluginID string, endpointName string) error {
	return &BackendListenerEndpointCallError{
		Code:    workerRPCTransportErrorCode,
		Message: fmt.Sprintf("Plugin backend listener endpoint is unavailable for %s:%s.", strings.TrimSpace(pluginID), strings.TrimSpace(endpointName)),
	}
}

func normalizeBackendRouteQueryParams(request *http.Request) map[string]any {
	normalized := map[string]any{}
	if request == nil || request.URL == nil {
		return normalized
	}
	for key, values := range request.URL.Query() {
		if len(values) == 0 {
			normalized[key] = ""
			continue
		}
		if len(values) == 1 {
			normalized[key] = values[0]
			continue
		}
		normalized[key] = append([]string(nil), values...)
	}
	return normalized
}

func normalizeBackendRouteRequestBody(request *http.Request, needsRawBody bool) (any, *string, error) {
	if request == nil || request.Body == nil {
		return nil, nil, nil
	}
	if request.Method == http.MethodGet || request.Method == http.MethodHead || request.Method == http.MethodOptions {
		return nil, nil, nil
	}

	rawBody, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, nil, err
	}
	if len(rawBody) == 0 {
		return nil, nil, nil
	}

	var rawBodyBase64 *string
	if needsRawBody {
		encoded := base64.StdEncoding.EncodeToString(rawBody)
		rawBodyBase64 = &encoded
	}

	contentType := request.Header.Get("Content-Type")
	switch {
	case backendRouteContentTypeIsJSON(contentType):
		var jsonBody any
		if err := json.Unmarshal(rawBody, &jsonBody); err == nil {
			return jsonBody, rawBodyBase64, nil
		}
	case backendRouteContentTypeIsText(contentType):
		if utf8.Valid(rawBody) {
			return string(rawBody), rawBodyBase64, nil
		}
	}
	return nil, rawBodyBase64, nil
}

func buildBackendRouteRequestContext(request *http.Request) map[string]any {
	if request == nil {
		return map[string]any{
			"method":      "",
			"path":        "",
			"queryString": "",
			"headers":     [][2]string{},
		}
	}
	path := ""
	queryString := ""
	if request.URL != nil {
		path = request.URL.Path
		queryString = request.URL.RawQuery
	}
	return map[string]any{
		"method":      request.Method,
		"path":        path,
		"queryString": queryString,
		"headers":     serializeBackendRouteRequestHeaders(request),
	}
}

func serializeBackendRouteRequestHeaders(request *http.Request) [][2]string {
	if request == nil {
		return [][2]string{}
	}

	headers := make([][2]string, 0, len(request.Header)+1)
	if strings.TrimSpace(request.Host) != "" {
		headers = append(headers, [2]string{"host", request.Host})
	}

	names := make([]string, 0, len(request.Header))
	for name := range request.Header {
		if strings.EqualFold(name, "Host") {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		for _, value := range request.Header.Values(name) {
			headers = append(headers, [2]string{name, value})
		}
	}
	return headers
}

func cloneBackendRoutePathParams(pathParams map[string]string) map[string]string {
	if len(pathParams) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(pathParams))
	for key, value := range pathParams {
		cloned[key] = value
	}
	return cloned
}

func decodeBackendRouteResponse(payload json.RawMessage, route BackendRoute) (BackendRouteResponse, error) {
	var rawValue any
	if err := json.Unmarshal(payload, &rawValue); err != nil {
		return BackendRouteResponse{}, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s is invalid JSON: %v", route.PluginID, route.RouteID, err))
	}

	fields, ok := rawValue.(map[string]any)
	if !ok {
		return BackendRouteResponse{}, invalidBackendRouteResponseError(route, "Plugin worker route response must be an object.")
	}

	response := BackendRouteResponse{
		StatusCode: http.StatusOK,
		Headers:    []BackendRouteHeader{},
	}

	if rawStatusCode, ok := fields["statusCode"]; ok {
		statusCode, err := parseBackendRouteStatusCode(rawStatusCode)
		if err != nil {
			return BackendRouteResponse{}, invalidBackendRouteResponseError(route, err.Error())
		}
		response.StatusCode = statusCode
	}
	if rawHeaders, ok := fields["headers"]; ok {
		headers, err := parseBackendRouteHeaders(rawHeaders, route)
		if err != nil {
			return BackendRouteResponse{}, err
		}
		response.Headers = headers
	}
	if rawMediaType, ok := fields["mediaType"]; ok {
		mediaType, err := parseBackendRouteMediaType(rawMediaType)
		if err != nil {
			return BackendRouteResponse{}, invalidBackendRouteResponseError(route, err.Error())
		}
		response.MediaType = mediaType
	}

	rawBodyEncoding, hasBodyEncoding := fields["bodyEncoding"]
	bodyEncoding := ""
	if hasBodyEncoding {
		parsedEncoding, err := parseBackendRouteBodyEncoding(rawBodyEncoding)
		if err != nil {
			return BackendRouteResponse{}, invalidBackendRouteResponseError(route, err.Error())
		}
		bodyEncoding = parsedEncoding
	}

	rawBody, bodyPresent := fields["body"]
	response.BodyPresent = bodyPresent
	if bodyEncoding == "base64" {
		body, ok := rawBody.(string)
		if !ok {
			return BackendRouteResponse{}, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned a non-string base64 body.", route.PluginID, route.RouteID))
		}
		decoded, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return BackendRouteResponse{}, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned an invalid base64 body.", route.PluginID, route.RouteID))
		}
		response.BinaryBody = decoded
		response.BinaryBodyPresent = true
		return response, nil
	}

	response.Body = rawBody
	return response, nil
}

func parseBackendRouteStatusCode(rawStatusCode any) (int, error) {
	statusCode, ok := rawStatusCode.(float64)
	if !ok || math.Trunc(statusCode) != statusCode || statusCode < 100 || statusCode > 599 {
		return 0, fmt.Errorf("Plugin worker response returned an invalid statusCode value: %#v", rawStatusCode)
	}
	return int(statusCode), nil
}

func parseBackendRouteHeaders(rawHeaders any, route BackendRoute) ([]BackendRouteHeader, error) {
	items, ok := rawHeaders.([]any)
	if !ok {
		return nil, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned a non-array headers payload.", route.PluginID, route.RouteID))
	}

	headers := make([]BackendRouteHeader, 0, len(items))
	for _, item := range items {
		pair, ok := item.([]any)
		if !ok || len(pair) != 2 {
			return nil, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned an invalid header entry.", route.PluginID, route.RouteID))
		}
		name, okName := pair[0].(string)
		value, okValue := pair[1].(string)
		if !okName || !okValue {
			return nil, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned an invalid header entry.", route.PluginID, route.RouteID))
		}
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if strings.EqualFold(name, "content-length") || strings.EqualFold(name, "transfer-encoding") {
			continue
		}
		if strings.ContainsAny(name, "\r\n") || strings.ContainsAny(value, "\r\n") {
			return nil, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned headers containing newline characters.", route.PluginID, route.RouteID))
		}
		if !backendRouteHeaderValueIsLatin1(name) || !backendRouteHeaderValueIsLatin1(value) {
			return nil, invalidBackendRouteResponseError(route, fmt.Sprintf("Plugin worker response for %s:%s returned a non-latin-1 header name or value.", route.PluginID, route.RouteID))
		}
		headers = append(headers, BackendRouteHeader{Name: name, Value: value})
	}
	return headers, nil
}

func parseBackendRouteMediaType(rawMediaType any) (string, error) {
	mediaType, ok := rawMediaType.(string)
	if !ok {
		return "", fmt.Errorf("Plugin worker response returned a non-string mediaType value.")
	}
	return strings.TrimSpace(mediaType), nil
}

func parseBackendRouteBodyEncoding(rawBodyEncoding any) (string, error) {
	bodyEncoding, ok := rawBodyEncoding.(string)
	if !ok {
		return "", fmt.Errorf("Plugin worker response returned an unsupported bodyEncoding value.")
	}
	if bodyEncoding != "base64" {
		return "", fmt.Errorf("Plugin worker response returned an unsupported bodyEncoding value.")
	}
	return bodyEncoding, nil
}

func invalidBackendRouteResponseError(route BackendRoute, message string) error {
	return &BackendRouteProxyError{
		StatusCode: http.StatusBadGateway,
		Code:       workerRPCTransportErrorCode,
		Message:    message,
	}
}

func backendRouteUnavailableError(pluginID string) error {
	return &BackendRouteProxyError{
		StatusCode: http.StatusServiceUnavailable,
		Code:       workerRPCTransportErrorCode,
		Message:    fmt.Sprintf("Backend worker unavailable for plugin %s.", strings.TrimSpace(pluginID)),
	}
}

func backendRouteContentTypeIsJSON(rawContentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(rawContentType, ";")[0]))
	return mediaType == "application/json" || strings.HasSuffix(mediaType, "+json")
}

func backendRouteContentTypeIsText(rawContentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(rawContentType, ";")[0]))
	return strings.HasPrefix(mediaType, "text/")
}

func backendRouteHeaderValueIsLatin1(value string) bool {
	for _, runeValue := range value {
		if runeValue > 0xFF {
			return false
		}
	}
	return true
}
