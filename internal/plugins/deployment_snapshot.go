package plugins

type ActivePluginDeploymentSnapshot struct {
	SourcePath string
	State      PluginsStateFile
}

func (s *Service) DeploymentSnapshotForActivePlugin(
	pluginID string,
) (ActivePluginDeploymentSnapshot, error) {
	if s == nil {
		return ActivePluginDeploymentSnapshot{}, ErrWorkspaceRootRequired
	}

	trimmedPluginID, err := validateRuntimePluginID(pluginID)
	if err != nil {
		return ActivePluginDeploymentSnapshot{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return ActivePluginDeploymentSnapshot{}, err
	}
	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return ActivePluginDeploymentSnapshot{}, newServiceError(
			ServiceErrorCodeNotFound,
			"Plugin not active: %s",
			trimmedPluginID,
		)
	}
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return ActivePluginDeploymentSnapshot{}, err
	}

	deploymentState := PluginsStateFile{
		EnabledPluginIDs: []string{entry.PluginID},
	}
	currentConfig := pluginConfigSnapshotWithDuplicateFallback(
		snapshot.Plugins,
		entry,
		&state,
	).Config
	if len(currentConfig) != 0 {
		deploymentState.PluginConfigByID = map[string]any{
			pluginConfigKey(entry.PluginID, PluginScopeWorkspace): currentConfig,
		}
	}

	return ActivePluginDeploymentSnapshot{
		SourcePath: entry.SourcePath,
		State:      normalizePluginsStateFile(deploymentState),
	}, nil
}
