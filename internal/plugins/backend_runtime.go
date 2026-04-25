package plugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"

	"setta/internal/codegencontracts"
	"setta/internal/config"
)

const (
	backendRuntimeArg           = "--setta-plugin-backend-runtime"
	backendRuntimeSchemaVersion = 1
	backendRuntimeKindHTTP      = "http"
	backendRuntimeKindListener  = "listener_endpoint"
	backendRuntimeKindCodegen   = "codegen_target"
	backendRuntimeKindUISetting = "ui_setting"
)

type BackendRequestContext struct {
	ServerMode      config.Mode `json:"serverMode"`
	HasAuth         bool        `json:"hasAuth"`
	SessionID       string      `json:"sessionId,omitempty"`
	ShareSessionID  string      `json:"shareSessionId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId,omitempty"`
	WorkspaceRoot   string      `json:"workspaceRoot,omitempty"`
	SettaFilesRoot  string      `json:"settaFilesRoot,omitempty"`
	RuntimeRoot     string      `json:"runtimeRoot,omitempty"`
}

type BackendHTTPRequest struct {
	Context  BackendRequestContext `json:"context"`
	Method   string                `json:"method"`
	Path     string                `json:"path"`
	RawQuery string                `json:"rawQuery,omitempty"`
	Headers  map[string][]string   `json:"headers"`
	Body     []byte                `json:"-"`
}

type BackendHTTPResponse struct {
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Body       []byte              `json:"-"`
}

type BackendListenerEndpointRequest struct {
	Context      BackendRequestContext `json:"context"`
	PluginID     string                `json:"-"`
	EndpointName string                `json:"endpointName"`
	Payload      map[string]any        `json:"payload"`
}

type BackendCodegenTargetRequest struct {
	Language      string         `json:"language"`
	TargetID      string         `json:"targetId"`
	ProjectState  map[string]any `json:"projectState"`
	TargetOptions map[string]any `json:"targetOptions"`
}

type BackendUISettingReadOptions struct {
	PluginID        string
	HandlerID       string
	ProjectConfigID string
}

type BackendUISettingWriteOptions struct {
	PluginID        string
	HandlerID       string
	ProjectConfigID string
	Value           any
}

type backendRuntimeRequest struct {
	SchemaVersion int                             `json:"schemaVersion"`
	Kind          string                          `json:"kind"`
	HTTP          *backendRuntimeHTTPRequest      `json:"http,omitempty"`
	Listener      *BackendListenerEndpointRequest `json:"listenerEndpoint,omitempty"`
	Codegen       *BackendCodegenTargetRequest    `json:"codegenTarget,omitempty"`
	UISetting     *backendRuntimeUISettingRequest `json:"uiSetting,omitempty"`
}

type backendRuntimeHTTPRequest struct {
	Context    BackendRequestContext `json:"context"`
	Method     string                `json:"method"`
	Path       string                `json:"path"`
	RawQuery   string                `json:"rawQuery,omitempty"`
	Headers    map[string][]string   `json:"headers"`
	BodyBase64 string                `json:"bodyBase64,omitempty"`
}

type backendRuntimeResponse struct {
	SchemaVersion int                              `json:"schemaVersion"`
	HTTP          *backendRuntimeHTTPResponse      `json:"http,omitempty"`
	Listener      *backendRuntimeListenerResponse  `json:"listenerEndpoint,omitempty"`
	Codegen       *backendRuntimeCodegenResponse   `json:"codegenTarget,omitempty"`
	UISetting     *backendRuntimeUISettingResponse `json:"uiSetting,omitempty"`
}

type backendRuntimeHTTPResponse struct {
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	BodyBase64 string              `json:"bodyBase64,omitempty"`
}

type backendRuntimeListenerResponse struct {
	Result any                          `json:"result"`
	Error  *backendRuntimeResponseError `json:"error,omitempty"`
}

type backendRuntimeCodegenResponse struct {
	Files []backendRuntimeCodegenFile `json:"files"`
}

type backendRuntimeCodegenFile struct {
	RelativePath *string `json:"relativePath,omitempty"`
	Content      *string `json:"content"`
}

type backendRuntimeUISettingRequest struct {
	HandlerID       string `json:"handlerId"`
	Operation       string `json:"operation"`
	ProjectConfigID string `json:"projectConfigId"`
	Value           any    `json:"value,omitempty"`
}

type backendRuntimeUISettingResponse struct {
	Value json.RawMessage `json:"value,omitempty"`
}

type backendRuntimeResponseError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type BackendRuntimeError struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *BackendRuntimeError) Error() string {
	if e == nil {
		return ""
	}
	code := strings.TrimSpace(e.Code)
	message := strings.TrimSpace(e.Message)
	switch {
	case code == "":
		return message
	case message == "":
		return code
	default:
		return code + ": " + message
	}
}

type backendRouteMatch struct {
	Entry  DiscoveredPlugin
	Route  PluginRegisteredBackendRoute
	Method string
}

type backendRouteCandidate struct {
	Entry DiscoveredPlugin
	Route PluginRegisteredBackendRoute
}

type backendListenerEndpointMatch struct {
	Entry    DiscoveredPlugin
	Endpoint PluginRegisteredListenerEndpoint
}

type BackendRouteLookup struct {
	Matched    bool
	PathExists bool
}

func (s *Service) LookupRegisteredBackendRoute(method string, requestPath string) (BackendRouteLookup, error) {
	if s == nil {
		return BackendRouteLookup{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return BackendRouteLookup{}, err
	}

	_, lookup, err := findRegisteredBackendRouteMatch(snapshot.Plugins, method, requestPath)
	if err != nil {
		return BackendRouteLookup{}, err
	}
	return lookup, nil
}

func (s *Service) DispatchRegisteredBackendRoute(
	ctx context.Context,
	request BackendHTTPRequest,
) (BackendHTTPResponse, bool, error) {
	if s == nil {
		return BackendHTTPResponse{}, false, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return BackendHTTPResponse{}, false, err
	}

	match, lookup, err := findRegisteredBackendRouteMatch(snapshot.Plugins, request.Method, request.Path)
	if err != nil {
		return BackendHTTPResponse{}, true, err
	}
	if !lookup.Matched {
		return BackendHTTPResponse{}, false, nil
	}

	response, err := invokeGoBackendHTTP(
		ctx,
		match.Entry.SourcePath,
		*match.Entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		BackendHTTPRequest{
			Context:  s.enrichBackendRequestContext(request.Context),
			Method:   match.Method,
			Path:     request.Path,
			RawQuery: request.RawQuery,
			Headers:  cloneHeaderValues(request.Headers),
			Body:     append([]byte(nil), request.Body...),
		},
	)
	if err != nil {
		return BackendHTTPResponse{}, true, err
	}
	return response, true, nil
}

func (s *Service) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request BackendListenerEndpointRequest,
) (any, bool, error) {
	if s == nil {
		return nil, false, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, false, err
	}

	match, ok, err := findRegisteredListenerEndpointMatch(snapshot.Plugins, request)
	if err != nil {
		return nil, true, err
	}
	if !ok {
		return nil, false, nil
	}

	response, err := invokeGoBackendListenerEndpoint(
		ctx,
		match.Entry.SourcePath,
		*match.Entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		BackendListenerEndpointRequest{
			Context:      s.enrichBackendRequestContext(request.Context),
			EndpointName: request.EndpointName,
			Payload:      cloneBackendPayload(request.Payload),
		},
	)
	if err != nil {
		return nil, true, err
	}
	return response, true, nil
}

func (s *Service) GetBackendUISettings(pluginID string) ([]PluginRegisteredUISetting, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return nil, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", pluginID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return nil, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", trimmedPluginID)
	}
	return cloneRegisteredUISettings(entry.RegisteredUISettings), nil
}

func (s *Service) ReadBackendUISettingValue(ctx context.Context, options BackendUISettingReadOptions) (any, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, strings.TrimSpace(options.PluginID))
	if !ok {
		return nil, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", strings.TrimSpace(options.PluginID))
	}

	return invokeGoBackendUISetting(
		ctx,
		entry.SourcePath,
		*entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		backendRuntimeUISettingRequest{
			HandlerID:       strings.TrimSpace(options.HandlerID),
			Operation:       "read",
			ProjectConfigID: strings.TrimSpace(options.ProjectConfigID),
		},
	)
}

func (s *Service) WriteBackendUISettingValue(ctx context.Context, options BackendUISettingWriteOptions) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, strings.TrimSpace(options.PluginID))
	if !ok {
		return newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", strings.TrimSpace(options.PluginID))
	}

	_, err = invokeGoBackendUISetting(
		ctx,
		entry.SourcePath,
		*entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		backendRuntimeUISettingRequest{
			HandlerID:       strings.TrimSpace(options.HandlerID),
			Operation:       "write",
			ProjectConfigID: strings.TrimSpace(options.ProjectConfigID),
			Value:           options.Value,
		},
	)
	return err
}

func findRegisteredBackendRouteMatch(entries []DiscoveredPlugin, method string, requestPath string) (backendRouteMatch, BackendRouteLookup, error) {
	normalizedPath, methodsToCheck, validPath, err := normalizeBackendRouteLookup(method, requestPath)
	if err != nil {
		return backendRouteMatch{}, BackendRouteLookup{}, err
	}
	if !validPath {
		return backendRouteMatch{}, BackendRouteLookup{}, nil
	}

	candidates, pathExists := collectRegisteredBackendRouteCandidates(entries, normalizedPath)
	match, matched, err := resolveRegisteredBackendRouteMatch(candidates, methodsToCheck, normalizedPath)
	if err != nil {
		return backendRouteMatch{}, BackendRouteLookup{}, err
	}
	return match, BackendRouteLookup{
		Matched:    matched,
		PathExists: pathExists,
	}, nil
}

func normalizeBackendRouteLookup(method string, requestPath string) (string, []string, bool, error) {
	normalizedMethod := strings.ToUpper(strings.TrimSpace(method))
	if normalizedMethod == "" {
		return "", nil, false, fmt.Errorf("backend route method is required")
	}
	normalizedPath, err := normalizeBackendRegistrationPath(requestPath, "path")
	if err != nil {
		// Request paths are caller input, not persisted plugin registrations.
		// Invalid paths should miss route matching so static-dir and 404 handlers
		// can fail closed without surfacing an internal error from the lookup step.
		return "", nil, false, nil
	}

	methodsToCheck := []string{normalizedMethod}
	if normalizedMethod == http.MethodHead {
		methodsToCheck = append(methodsToCheck, http.MethodGet)
	}
	return normalizedPath, methodsToCheck, true, nil
}

func collectRegisteredBackendRouteCandidates(entries []DiscoveredPlugin, normalizedPath string) ([]backendRouteCandidate, bool) {
	candidates := make([]backendRouteCandidate, 0)
	pathExists := false
	for _, entry := range entries {
		if !isRegisteredBackendRouteEntry(entry) {
			continue
		}
		for _, route := range entry.RegisteredBackendRoutes {
			if route.Path != normalizedPath {
				continue
			}
			pathExists = true
			candidates = append(candidates, backendRouteCandidate{
				Entry: entry,
				Route: route,
			})
		}
	}
	return candidates, pathExists
}

func isRegisteredBackendRouteEntry(entry DiscoveredPlugin) bool {
	if entry.Manifest == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsString(entry.EffectiveCapabilities, "registerRouter")
}

func resolveRegisteredBackendRouteMatch(
	candidates []backendRouteCandidate,
	methodsToCheck []string,
	normalizedPath string,
) (backendRouteMatch, bool, error) {
	var match backendRouteMatch
	found := false
	for _, candidate := range candidates {
		matchedMethod, ok := firstRegisteredBackendRouteMethod(candidate.Route, methodsToCheck)
		if !ok {
			continue
		}
		if !found {
			match = backendRouteMatch{
				Entry:  candidate.Entry,
				Route:  candidate.Route,
				Method: matchedMethod,
			}
			found = true
			continue
		}
		return backendRouteMatch{}, false, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Conflicting plugin backend route registration for %s %s: %s and %s",
			matchedMethod,
			normalizedPath,
			match.Entry.PluginID,
			candidate.Entry.PluginID,
		)
	}
	return match, found, nil
}

func firstRegisteredBackendRouteMethod(route PluginRegisteredBackendRoute, methodsToCheck []string) (string, bool) {
	for _, candidateMethod := range methodsToCheck {
		if containsString(route.Methods, candidateMethod) {
			return candidateMethod, true
		}
	}
	return "", false
}

func findRegisteredListenerEndpointMatch(
	entries []DiscoveredPlugin,
	request BackendListenerEndpointRequest,
) (backendListenerEndpointMatch, bool, error) {
	normalizedName := strings.TrimSpace(request.EndpointName)
	if normalizedName == "" {
		return backendListenerEndpointMatch{}, false, fmt.Errorf("listener endpoint name is required")
	}
	normalizedPluginID := strings.TrimSpace(request.PluginID)

	var match backendListenerEndpointMatch
	found := false
	for _, entry := range entries {
		endpoint, ok := findListenerEndpointInEntry(
			entry,
			normalizedPluginID,
			normalizedName,
		)
		if !ok {
			continue
		}
		if !found {
			match = backendListenerEndpointMatch{
				Entry:    entry,
				Endpoint: endpoint,
			}
			found = true
			continue
		}
		return backendListenerEndpointMatch{}, false, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Conflicting plugin listener endpoint registration for %s: %s and %s",
			normalizedName,
			match.Entry.PluginID,
			entry.PluginID,
		)
	}
	return match, found, nil
}

func findListenerEndpointInEntry(
	entry DiscoveredPlugin,
	normalizedPluginID string,
	normalizedName string,
) (PluginRegisteredListenerEndpoint, bool) {
	if !listenerEndpointEntryEligible(entry, normalizedPluginID) {
		return PluginRegisteredListenerEndpoint{}, false
	}
	endpoints := listenerEndpointsForRequest(entry, normalizedPluginID != "")
	for _, endpoint := range endpoints {
		if endpoint.Name == normalizedName {
			return endpoint, true
		}
	}
	return PluginRegisteredListenerEndpoint{}, false
}

func listenerEndpointEntryEligible(entry DiscoveredPlugin, normalizedPluginID string) bool {
	if entry.Manifest == nil {
		return false
	}
	if normalizedPluginID != "" && entry.PluginID != normalizedPluginID {
		return false
	}
	switch entry.State {
	case PluginRuntimeStateActive, PluginRuntimeStatePendingRestart:
		return true
	default:
		return false
	}
}

func listenerEndpointsForRequest(
	entry DiscoveredPlugin,
	pluginScoped bool,
) []PluginRegisteredListenerEndpoint {
	if !pluginScoped {
		if !containsString(entry.EffectiveCapabilities, "registerListenerEndpoint") {
			return nil
		}
		return entry.RegisteredListenerEndpoints
	}
	endpoints := make(
		[]PluginRegisteredListenerEndpoint,
		0,
		len(entry.RegisteredListenerEndpoints)+len(entry.appSubsystemListenerEndpoints),
	)
	if containsString(entry.EffectiveCapabilities, "registerListenerEndpoint") {
		endpoints = append(endpoints, entry.RegisteredListenerEndpoints...)
	}
	if containsString(entry.EffectiveCapabilities, "registerAppSubsystemBackend") {
		endpoints = append(endpoints, entry.appSubsystemListenerEndpoints...)
	}
	return endpoints
}

func invokeGoBackendHTTP(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	request BackendHTTPRequest,
) (BackendHTTPResponse, error) {
	runtimeRequest := backendRuntimeRequest{
		SchemaVersion: backendRuntimeSchemaVersion,
		Kind:          backendRuntimeKindHTTP,
		HTTP: &backendRuntimeHTTPRequest{
			Context:    request.Context,
			Method:     strings.ToUpper(strings.TrimSpace(request.Method)),
			Path:       strings.TrimSpace(request.Path),
			RawQuery:   strings.TrimSpace(request.RawQuery),
			Headers:    cloneHeaderValues(request.Headers),
			BodyBase64: encodeBackendRuntimeBytes(request.Body),
		},
	}

	response, err := invokeGoBackendRuntime(ctx, pluginRoot, manifest, buildRoot, runtimeRequest)
	if err != nil {
		return BackendHTTPResponse{}, err
	}
	if response.HTTP == nil {
		return BackendHTTPResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: missing http response payload",
			manifest.ID,
		)
	}

	if response.HTTP.StatusCode < 100 || response.HTTP.StatusCode > 999 {
		return BackendHTTPResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: unsupported status code %d",
			manifest.ID,
			response.HTTP.StatusCode,
		)
	}
	body, err := decodeBackendRuntimeBytes(response.HTTP.BodyBase64)
	if err != nil {
		return BackendHTTPResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: %s",
			manifest.ID,
			err.Error(),
		)
	}
	return BackendHTTPResponse{
		StatusCode: response.HTTP.StatusCode,
		Headers:    cloneHeaderValues(response.HTTP.Headers),
		Body:       body,
	}, nil
}

func invokeGoBackendListenerEndpoint(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	request BackendListenerEndpointRequest,
) (any, error) {
	runtimeRequest := backendRuntimeRequest{
		SchemaVersion: backendRuntimeSchemaVersion,
		Kind:          backendRuntimeKindListener,
		Listener: &BackendListenerEndpointRequest{
			Context:      request.Context,
			EndpointName: strings.TrimSpace(request.EndpointName),
			Payload:      cloneBackendPayload(request.Payload),
		},
	}

	response, err := invokeGoBackendRuntime(ctx, pluginRoot, manifest, buildRoot, runtimeRequest)
	if err != nil {
		return nil, err
	}
	if response.Listener == nil {
		return nil, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: missing listener endpoint response payload",
			manifest.ID,
		)
	}
	if response.Listener.Error != nil {
		message := strings.TrimSpace(response.Listener.Error.Message)
		if message == "" {
			message = "plugin listener endpoint failed"
		}
		code := strings.TrimSpace(response.Listener.Error.Code)
		if code == "" {
			return nil, fmt.Errorf("%s", message)
		}
		return nil, &BackendRuntimeError{
			Code:    code,
			Message: message,
			Details: cloneBackendPayload(response.Listener.Error.Details),
		}
	}
	return response.Listener.Result, nil
}

func (s *Service) enrichBackendRequestContext(
	requestContext BackendRequestContext,
) BackendRequestContext {
	if s == nil || s.store == nil {
		return requestContext
	}
	requestContext.WorkspaceRoot = s.store.workspaceRoot
	requestContext.SettaFilesRoot = s.store.settaFilesRoot
	requestContext.RuntimeRoot = s.store.settaHome
	return requestContext
}

func invokeGoBackendCodegenTarget(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	target PluginRegisteredCodegenTarget,
	projectState map[string]any,
	targetOptions map[string]any,
) ([]codegencontracts.PluginGeneratedFile, error) {
	runtimeRequest := backendRuntimeRequest{
		SchemaVersion: backendRuntimeSchemaVersion,
		Kind:          backendRuntimeKindCodegen,
		Codegen: &BackendCodegenTargetRequest{
			Language:      target.Language,
			TargetID:      target.TargetID,
			ProjectState:  cloneBackendPayload(projectState),
			TargetOptions: cloneBackendPayload(targetOptions),
		},
	}

	response, err := invokeGoBackendRuntime(ctx, pluginRoot, manifest, buildRoot, runtimeRequest)
	if err != nil {
		return nil, err
	}
	if response.Codegen == nil {
		return nil, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: missing codegen target response payload",
			manifest.ID,
		)
	}
	return normalizeGeneratedCodegenFiles(target, response.Codegen.Files)
}

func invokeGoBackendUISetting(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	request backendRuntimeUISettingRequest,
) (any, error) {
	runtimeRequest := backendRuntimeRequest{
		SchemaVersion: backendRuntimeSchemaVersion,
		Kind:          backendRuntimeKindUISetting,
		UISetting: &backendRuntimeUISettingRequest{
			HandlerID:       strings.TrimSpace(request.HandlerID),
			Operation:       strings.TrimSpace(request.Operation),
			ProjectConfigID: strings.TrimSpace(request.ProjectConfigID),
			Value:           request.Value,
		},
	}

	response, err := invokeGoBackendRuntime(ctx, pluginRoot, manifest, buildRoot, runtimeRequest)
	if err != nil {
		return nil, err
	}
	if response.UISetting == nil {
		return nil, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: missing ui setting response payload",
			manifest.ID,
		)
	}
	if strings.TrimSpace(request.Operation) == "write" {
		return nil, nil
	}
	if response.UISetting.Value == nil {
		return nil, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: ui setting read is missing value",
			manifest.ID,
		)
	}

	var value any
	if err := json.Unmarshal(response.UISetting.Value, &value); err != nil {
		return nil, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: decode ui setting value: %s",
			manifest.ID,
			err.Error(),
		)
	}
	return value, nil
}

func invokeGoBackendRuntime(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	request backendRuntimeRequest,
) (backendRuntimeResponse, error) {
	launch, err := ResolvePluginBackendLaunch(pluginRoot, manifest, buildRoot)
	if err != nil {
		return backendRuntimeResponse{}, err
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return backendRuntimeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime request for plugin %s: %s",
			manifest.ID,
			err.Error(),
		)
	}

	args := append(append([]string(nil), launch.Args...), backendRuntimeArg)
	command := exec.CommandContext(ctx, launch.Command, args...)
	command.Dir = pluginRoot
	if len(launch.Environment) != 0 {
		command.Env = mergePluginBackendCommandEnv(launch.Environment)
	}
	command.Stdin = bytes.NewReader(payload)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = strings.TrimSpace(stdout.String())
		}
		if message == "" {
			message = err.Error()
		}
		return backendRuntimeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Plugin backend runtime failed for plugin %s: %s",
			manifest.ID,
			message,
		)
	}

	response, err := decodeBackendRuntimeResponse(stdout.Bytes())
	if err != nil {
		return backendRuntimeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime response for plugin %s: %s",
			manifest.ID,
			err.Error(),
		)
	}
	return response, nil
}

func decodeBackendRuntimeResponse(output []byte) (backendRuntimeResponse, error) {
	var response backendRuntimeResponse
	decoder := json.NewDecoder(bytes.NewReader(output))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&response); err != nil {
		return backendRuntimeResponse{}, err
	}
	if decoder.More() {
		return backendRuntimeResponse{}, fmt.Errorf("trailing JSON content")
	}
	if response.SchemaVersion != backendRuntimeSchemaVersion {
		return backendRuntimeResponse{}, fmt.Errorf("unsupported schema version %d", response.SchemaVersion)
	}
	if response.HTTP != nil && response.HTTP.Headers == nil {
		response.HTTP.Headers = map[string][]string{}
	}
	if response.Codegen != nil && response.Codegen.Files == nil {
		response.Codegen.Files = []backendRuntimeCodegenFile{}
	}
	return response, nil
}

func encodeBackendRuntimeBytes(value []byte) string {
	if len(value) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(value)
}

func decodeBackendRuntimeBytes(value string) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return []byte{}, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return nil, fmt.Errorf("decode bodyBase64: %w", err)
	}
	return decoded, nil
}

func cloneHeaderValues(values map[string][]string) map[string][]string {
	if len(values) == 0 {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(values))
	for key, entryValues := range values {
		cloned[key] = append([]string(nil), entryValues...)
	}
	return cloned
}

func cloneBackendPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(payload))
	for key, value := range payload {
		cloned[key] = value
	}
	return cloned
}
