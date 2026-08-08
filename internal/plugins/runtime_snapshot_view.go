package plugins

import (
	"context"
	"path/filepath"
	"strings"
)

func (s *Service) RuntimeFromSnapshot(
	snapshot DiscoverySnapshot,
	options RuntimeOptions,
) (PluginRuntimeResponse, error) {
	if s == nil {
		return PluginRuntimeResponse{}, ErrWorkspaceRootRequired
	}

	redactSourceDetails := shouldRedactRuntimeSourceDetails(snapshot.ServerMode)
	redactConfigDetails := shouldRedactRuntimeConfigDetails(snapshot.ServerMode)
	redactedSourcePathByPath := map[string]string{}
	if redactSourceDetails {
		redactedSourcePathByPath = buildRedactedSourcePathMap(snapshot.Plugins)
	}

	var pluginsState *PluginsStateFile
	if !redactConfigDetails {
		state, err := s.store.LoadPluginsState()
		if err != nil {
			return PluginRuntimeResponse{}, err
		}
		pluginsState = &state
	}

	restartCapability := s.restartCapability()
	return PluginRuntimeResponse{
		SchemaVersion: pluginRuntimeSchemaVersion,
		FeatureCapabilities: &PluginFeatureCapabilities{
			AppSubsystem: buildRuntimeAppSubsystemCapabilities(snapshot.Plugins),
			WatchCode:    buildRuntimeWatchCodeCapabilities(snapshot.Plugins),
		},
		List: PluginListResponse{
			SchemaVersion:     pluginListSchemaVersion,
			ServerMode:        snapshot.ServerMode,
			RestartCapability: restartCapability,
			Plugins: s.buildRuntimeListEntries(
				snapshot.Plugins,
				pluginsState,
				options.AssetURLBuilder,
				redactSourceDetails,
				redactConfigDetails,
			),
		},
		Status: buildRuntimeStatusResponse(
			snapshot,
			restartCapability,
			redactSourceDetails,
			redactedSourcePathByPath,
		),
	}, nil
}

func (s *Service) ResolveAssetPathFromSnapshot(
	snapshot DiscoverySnapshot,
	pluginID string,
	assetPath string,
) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}

	trimmedPluginID, err := validateRuntimePluginID(pluginID)
	if err != nil {
		return "", err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", trimmedPluginID)
	}
	return resolveRuntimeAssetPath(entry, assetPath)
}

func (s *Service) ResolveRegisteredStaticAssetPathFromSnapshot(
	snapshot DiscoverySnapshot,
	requestPath string,
) (string, bool, error) {
	if s == nil {
		return "", false, ErrWorkspaceRootRequired
	}

	trimmedRequestPath := strings.TrimSpace(requestPath)
	if trimmedRequestPath == "" || !strings.HasPrefix(trimmedRequestPath, "/") {
		return "", true, newServiceError(
			ServiceErrorCodeAssetInvalidPath,
			"Invalid plugin backend static asset path: %s",
			requestPath,
		)
	}

	match, ok, err := findRegisteredStaticAssetMatch(snapshot.Plugins, trimmedRequestPath)
	if err != nil {
		return "", true, err
	}
	if !ok {
		return "", false, nil
	}

	resolvedPath, err := resolveRegisteredStaticAssetPath(match, trimmedRequestPath)
	if err != nil {
		return "", true, err
	}
	return resolvedPath, true, nil
}

func (s *Service) LookupRegisteredBackendRouteFromSnapshot(
	snapshot DiscoverySnapshot,
	method string,
	requestPath string,
) (BackendRouteLookup, error) {
	if s == nil {
		return BackendRouteLookup{}, ErrWorkspaceRootRequired
	}

	_, lookup, err := findRegisteredBackendRouteMatch(snapshot.Plugins, method, requestPath)
	if err != nil {
		return BackendRouteLookup{}, err
	}
	return lookup, nil
}

func (s *Service) DispatchRegisteredBackendRouteFromSnapshot(
	ctx context.Context,
	snapshot DiscoverySnapshot,
	request BackendHTTPRequest,
) (BackendHTTPResponse, bool, error) {
	if s == nil {
		return BackendHTTPResponse{}, false, ErrWorkspaceRootRequired
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

func (s *Service) InvokeRegisteredListenerEndpointFromSnapshot(
	ctx context.Context,
	snapshot DiscoverySnapshot,
	request BackendListenerEndpointRequest,
) (any, bool, error) {
	if s == nil {
		return nil, false, ErrWorkspaceRootRequired
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

func (s *Service) GetBackendUISettingsFromSnapshot(
	snapshot DiscoverySnapshot,
	pluginID string,
) ([]PluginRegisteredUISetting, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return nil, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", pluginID)
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return nil, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", trimmedPluginID)
	}
	return cloneRegisteredUISettings(entry.RegisteredUISettings), nil
}

func (s *Service) ReadBackendUISettingValueFromSnapshot(
	ctx context.Context,
	snapshot DiscoverySnapshot,
	options BackendUISettingReadOptions,
) (any, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
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
			Context:         s.backendUISettingRequestContext(options.ProjectConfigID),
			HandlerID:       strings.TrimSpace(options.HandlerID),
			Operation:       "read",
			ProjectConfigID: strings.TrimSpace(options.ProjectConfigID),
		},
	)
}

func (s *Service) WriteBackendUISettingValueFromSnapshot(
	ctx context.Context,
	snapshot DiscoverySnapshot,
	options BackendUISettingWriteOptions,
) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, strings.TrimSpace(options.PluginID))
	if !ok {
		return newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", strings.TrimSpace(options.PluginID))
	}

	_, err := invokeGoBackendUISetting(
		ctx,
		entry.SourcePath,
		*entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		backendRuntimeUISettingRequest{
			Context:         s.backendUISettingRequestContext(options.ProjectConfigID),
			HandlerID:       strings.TrimSpace(options.HandlerID),
			Operation:       "write",
			ProjectConfigID: strings.TrimSpace(options.ProjectConfigID),
			Value:           options.Value,
		},
	)
	return err
}
