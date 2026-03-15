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

	"setta/internal/config"
)

const (
	backendRuntimeArg           = "--setta-plugin-backend-runtime"
	backendRuntimeSchemaVersion = 1
	backendRuntimeKindHTTP      = "http"
	backendRuntimeKindListener  = "listener_endpoint"
)

type BackendRequestContext struct {
	ServerMode      config.Mode `json:"serverMode"`
	HasAuth         bool        `json:"hasAuth"`
	SessionID       string      `json:"sessionId,omitempty"`
	ShareSessionID  string      `json:"shareSessionId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId,omitempty"`
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
	EndpointName string                `json:"endpointName"`
	Payload      map[string]any        `json:"payload"`
}

type backendRuntimeRequest struct {
	SchemaVersion int                             `json:"schemaVersion"`
	Kind          string                          `json:"kind"`
	HTTP          *backendRuntimeHTTPRequest      `json:"http,omitempty"`
	Listener      *BackendListenerEndpointRequest `json:"listenerEndpoint,omitempty"`
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
	SchemaVersion int                             `json:"schemaVersion"`
	HTTP          *backendRuntimeHTTPResponse     `json:"http,omitempty"`
	Listener      *backendRuntimeListenerResponse `json:"listenerEndpoint,omitempty"`
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

type backendRuntimeResponseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type backendRouteMatch struct {
	Entry  DiscoveredPlugin
	Route  PluginRegisteredBackendRoute
	Method string
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
			Context:  request.Context,
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

	match, ok, err := findRegisteredListenerEndpointMatch(snapshot.Plugins, request.EndpointName)
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
		request,
	)
	if err != nil {
		return nil, true, err
	}
	return response, true, nil
}

func findRegisteredBackendRouteMatch(entries []DiscoveredPlugin, method string, requestPath string) (backendRouteMatch, BackendRouteLookup, error) {
	normalizedMethod := strings.ToUpper(strings.TrimSpace(method))
	if normalizedMethod == "" {
		return backendRouteMatch{}, BackendRouteLookup{}, fmt.Errorf("backend route method is required")
	}
	normalizedPath, err := normalizeBackendRegistrationPath(requestPath, "path")
	if err != nil {
		return backendRouteMatch{}, BackendRouteLookup{}, err
	}

	methodsToCheck := []string{normalizedMethod}
	if normalizedMethod == http.MethodHead {
		methodsToCheck = append(methodsToCheck, http.MethodGet)
	}

	var match backendRouteMatch
	found := false
	pathExists := false
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if !containsString(entry.EffectiveCapabilities, "registerRouter") {
			continue
		}

		for _, route := range entry.RegisteredBackendRoutes {
			if route.Path != normalizedPath {
				continue
			}
			pathExists = true
			for _, candidateMethod := range methodsToCheck {
				if !containsString(route.Methods, candidateMethod) {
					continue
				}
				if !found {
					match = backendRouteMatch{
						Entry:  entry,
						Route:  route,
						Method: candidateMethod,
					}
					found = true
					break
				}
				return backendRouteMatch{}, BackendRouteLookup{}, newServiceError(
					ServiceErrorCodeBackendRuntimeInvalid,
					"Conflicting plugin backend route registration for %s %s: %s and %s",
					candidateMethod,
					normalizedPath,
					match.Entry.PluginID,
					entry.PluginID,
				)
			}
		}
	}
	return match, BackendRouteLookup{
		Matched:    found,
		PathExists: pathExists,
	}, nil
}

func findRegisteredListenerEndpointMatch(entries []DiscoveredPlugin, endpointName string) (backendListenerEndpointMatch, bool, error) {
	normalizedName := strings.TrimSpace(endpointName)
	if normalizedName == "" {
		return backendListenerEndpointMatch{}, false, fmt.Errorf("listener endpoint name is required")
	}

	var match backendListenerEndpointMatch
	found := false
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if !containsString(entry.EffectiveCapabilities, "registerListenerEndpoint") {
			continue
		}

		for _, endpoint := range entry.RegisteredListenerEndpoints {
			if endpoint.Name != normalizedName {
				continue
			}
			if !found {
				match = backendListenerEndpointMatch{
					Entry:    entry,
					Endpoint: endpoint,
				}
				found = true
				break
			}
			return backendListenerEndpointMatch{}, false, newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Conflicting plugin listener endpoint registration for %s: %s and %s",
				normalizedName,
				match.Entry.PluginID,
				entry.PluginID,
			)
		}
	}
	return match, found, nil
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
		return nil, fmt.Errorf("%s: %s", code, message)
	}
	return response.Listener.Result, nil
}

func invokeGoBackendRuntime(
	ctx context.Context,
	pluginRoot string,
	manifest PluginManifest,
	buildRoot string,
	request backendRuntimeRequest,
) (backendRuntimeResponse, error) {
	executablePath, err := BuildGoBackendExecutable(pluginRoot, manifest, buildRoot)
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

	command := exec.CommandContext(ctx, executablePath, backendRuntimeArg)
	command.Dir = pluginRoot
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
			"Go backend runtime failed for plugin %s: %s",
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
