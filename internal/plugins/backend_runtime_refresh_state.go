package plugins

type BackendRuntimeRefreshState struct {
	PendingRestartBackendPluginIDs            []string
	PendingRestartLanguageServerOnlyPluginIDs []string
	PendingRestartRemovedPlugins              map[string]PendingRestartRemovedBackendPlugin
}

func (s *Service) BackendRuntimeRefreshState() (BackendRuntimeRefreshState, error) {
	if s == nil {
		return BackendRuntimeRefreshState{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return BackendRuntimeRefreshState{}, err
	}
	return BackendRuntimeRefreshState{
		PendingRestartBackendPluginIDs: cloneStringSliceOrEmpty(state.PendingRestartBackendPluginIDs),
		PendingRestartLanguageServerOnlyPluginIDs: cloneStringSliceOrEmpty(
			state.PendingRestartLanguageServerOnlyPluginIDs,
		),
		PendingRestartRemovedPlugins: clonePendingRestartRemovedPlugins(
			s.pendingRestartRemovedPlugin,
		),
	}, nil
}

func (s *Service) RestoreBackendRuntimeRefreshState(
	restore BackendRuntimeRefreshState,
) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	state.PendingRestartBackendPluginIDs = cloneStringSliceOrEmpty(
		restore.PendingRestartBackendPluginIDs,
	)
	state.PendingRestartLanguageServerOnlyPluginIDs = cloneStringSliceOrEmpty(
		restore.PendingRestartLanguageServerOnlyPluginIDs,
	)
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	s.pendingRestartRemovedPlugin = clonePendingRestartRemovedPlugins(
		restore.PendingRestartRemovedPlugins,
	)
	return nil
}

func clonePendingRestartRemovedPlugins(
	values map[string]PendingRestartRemovedBackendPlugin,
) map[string]PendingRestartRemovedBackendPlugin {
	if len(values) == 0 {
		return map[string]PendingRestartRemovedBackendPlugin{}
	}

	cloned := make(map[string]PendingRestartRemovedBackendPlugin, len(values))
	for key, value := range values {
		cloned[key] = PendingRestartRemovedBackendPlugin{
			PluginID:              value.PluginID,
			Name:                  value.Name,
			Version:               value.Version,
			Scope:                 value.Scope,
			SourcePath:            value.SourcePath,
			CanonicalSourceKey:    value.CanonicalSourceKey,
			SourceDigestSHA256:    cloneOptionalString(value.SourceDigestSHA256),
			RequestedCapabilities: cloneStringSliceOrEmpty(value.RequestedCapabilities),
			EffectiveCapabilities: cloneStringSliceOrEmpty(value.EffectiveCapabilities),
			BlockedCapabilities:   cloneBlockedCapabilitiesOrEmpty(value.BlockedCapabilities),
		}
	}
	return cloned
}
