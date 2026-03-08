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
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/config"
)

var (
	ErrBackendRouteRuntimeDiscoveryRequired = errors.New("plugins: backend route runtime discovery service is required")
	ErrBackendRouteRuntimeProviderRequired  = errors.New("plugins: backend route runtime worker provider is required")
	ErrBackendRouteRuntimeServerModeNeeded  = errors.New("plugins: backend route runtime server mode is required")
)

type BackendRouteRuntimeOptions struct {
	DiscoveryService *DiscoveryService
	RuntimeProvider  WorkerRuntimeProvider
	ServerMode       config.Mode
	Logger           *slog.Logger
}

type BackendRouteRuntime struct {
	logger *slog.Logger

	routes    []BackendRoute
	sessions  map[string]*StartedWorkerSession
	routeByID map[string]BackendRoute
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

	routePlugins := collectBackendRoutePlugins(snapshot.Plugins)
	runtime := &BackendRouteRuntime{
		logger:    options.Logger,
		routes:    []BackendRoute{},
		sessions:  map[string]*StartedWorkerSession{},
		routeByID: map[string]BackendRoute{},
	}
	if len(routePlugins) == 0 {
		return runtime, nil
	}

	workerRuntime, err := options.RuntimeProvider.ResolveWorkerRuntime(ctx)
	if err != nil {
		return nil, err
	}

	for _, entry := range routePlugins {
		if err := runtime.startPlugin(ctx, entry, workerRuntime, options.ServerMode); err != nil {
			runtime.logStartupError(entry.PluginID, err)
		}
	}
	runtime.sortRoutes()
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
	languageServers := NewLanguageServerRegistry()
	externalAgentAdapters := NewExternalAgentAdapterRegistry()
	codegenTargets := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		RouterRegistrar:               routers,
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
	if len(routes) == 0 {
		return started.Close()
	}

	r.sessions[entry.PluginID] = started
	for _, route := range routes {
		r.routes = append(r.routes, route)
		r.routeByID[route.PluginID+":"+route.RouteID] = route
	}
	return nil
}

func (r *BackendRouteRuntime) sortRoutes() {
	sort.Slice(r.routes, func(left int, right int) bool {
		if r.routes[left].Pattern != r.routes[right].Pattern {
			return r.routes[left].Pattern < r.routes[right].Pattern
		}
		if r.routes[left].PluginID != r.routes[right].PluginID {
			return r.routes[left].PluginID < r.routes[right].PluginID
		}
		return r.routes[left].RouteID < r.routes[right].RouteID
	})
}

func (r *BackendRouteRuntime) logStartupError(pluginID string, err error) {
	if r == nil || r.logger == nil {
		return
	}
	r.logger.Error("plugin backend route runtime startup failed", "pluginId", pluginID, "error", err)
}

func collectBackendRoutePlugins(entries []DiscoveredPlugin) []DiscoveredPlugin {
	plugins := make([]DiscoveredPlugin, 0, len(entries))
	for _, entry := range entries {
		if !shouldStartBackendRouteRuntime(entry) {
			continue
		}
		plugins = append(plugins, entry)
	}
	sort.Slice(plugins, func(left int, right int) bool {
		return plugins[left].PluginID < plugins[right].PluginID
	})
	return plugins
}

func shouldStartBackendRouteRuntime(entry DiscoveredPlugin) bool {
	if entry.ShadowedBySourcePath != "" {
		return false
	}
	if entry.Manifest == nil || entry.Manifest.Backend == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsCapability(entry.EffectiveCapabilities, CapabilityRegisterRouter)
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
