package plugins

import (
	"context"
)

func (s *Service) Enable(_ context.Context, options EnableDisableOptions) (PluginEnableDisableResponse, error) {
	if s == nil {
		return PluginEnableDisableResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setPluginEnabledLocked(options.PluginID, true)
}

func (s *Service) Disable(_ context.Context, options EnableDisableOptions) (PluginEnableDisableResponse, error) {
	if s == nil {
		return PluginEnableDisableResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setPluginEnabledLocked(options.PluginID, false)
}

func (s *Service) Install(ctx context.Context, options InstallOptions) (PluginInstallResponse, error) {
	if s == nil {
		return PluginInstallResponse{}, ErrWorkspaceRootRequired
	}

	request, err := s.prepareInstall(ctx, options)
	if err != nil {
		return PluginInstallResponse{}, err
	}
	if request.candidate.cleanup != nil {
		defer func() {
			_ = request.candidate.cleanup()
		}()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.installPreparedLocked(request)
}

func (s *Service) Uninstall(_ context.Context, options UninstallOptions) (PluginUninstallResponse, error) {
	if s == nil {
		return PluginUninstallResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	uninstall, err := s.prepareUninstallLocked(options)
	if err != nil {
		return PluginUninstallResponse{}, err
	}
	return s.uninstallPreparedLocked(uninstall)
}

func (s *Service) setPluginEnabledLocked(pluginID string, enable bool) (PluginEnableDisableResponse, error) {
	entry, err := s.resolveHighestPrecedenceEntryLocked(pluginID)
	if err != nil {
		return PluginEnableDisableResponse{}, err
	}
	state, globalState, err := s.loadEnablementStateLocked()
	if err != nil {
		return PluginEnableDisableResponse{}, err
	}

	wasEnabled := resolveEnablementBeforeMutation(entry, state, globalState)
	stateChanged := applyEnablementMutation(&state, pluginID, enable)
	stateChanged = s.applyPendingRestartAfterEnablementMutation(&state, entry, pluginID, wasEnabled, enable) || stateChanged
	if stateChanged {
		if err := s.store.SavePluginsState(state); err != nil {
			return PluginEnableDisableResponse{}, err
		}
	}

	restartRequired := entry.HasBackend() && containsString(state.PendingRestartBackendPluginIDs, pluginID)
	return s.buildEnableDisableResponseLocked(pluginID, restartRequired)
}

func (s *Service) loadEnablementStateLocked() (PluginsStateFile, PluginsGlobalStateFile, error) {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return PluginsStateFile{}, PluginsGlobalStateFile{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return PluginsStateFile{}, PluginsGlobalStateFile{}, err
	}
	return state, globalState, nil
}

func applyEnablementMutation(state *PluginsStateFile, pluginID string, enable bool) bool {
	if state == nil {
		return false
	}

	stateChanged := false
	if enable {
		if !containsString(state.EnabledPluginIDs, pluginID) {
			state.EnabledPluginIDs = appendIfMissing(state.EnabledPluginIDs, pluginID)
			stateChanged = true
		}
		if containsString(state.DisabledPluginIDs, pluginID) {
			state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
			stateChanged = true
		}
		return stateChanged
	}

	if !containsString(state.DisabledPluginIDs, pluginID) {
		state.DisabledPluginIDs = appendIfMissing(state.DisabledPluginIDs, pluginID)
		stateChanged = true
	}
	if containsString(state.EnabledPluginIDs, pluginID) {
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
		stateChanged = true
	}
	return stateChanged
}

func (s *Service) applyPendingRestartAfterEnablementMutation(
	state *PluginsStateFile,
	entry DiscoveredPlugin,
	pluginID string,
	wasEnabled bool,
	enable bool,
) bool {
	if state == nil || !entry.HasBackend() || wasEnabled == enable {
		return false
	}
	stateChanged := syncPendingRestartBackendState(state, pluginID, entryHasLanguageServerOnlyBackendRuntime(entry))
	delete(s.pendingRestartRemovedPlugin, pluginID)
	return stateChanged
}

func (s *Service) buildEnableDisableResponseLocked(pluginID string, restartRequired bool) (PluginEnableDisableResponse, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginEnableDisableResponse{}, err
	}
	latestEntry, ok := PrimaryDiscoveredPlugin(snapshot.Plugins, pluginID)
	if !ok {
		return PluginEnableDisableResponse{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
	}
	return PluginEnableDisableResponse{
		PluginID:        pluginID,
		State:           latestEntry.State,
		RestartRequired: restartRequired,
	}, nil
}

func (s *Service) prepareUninstallLocked(options UninstallOptions) (preparedUninstall, error) {
	scope, entry, err := s.resolveUninstallEntryLocked(options)
	if err != nil {
		return preparedUninstall{}, err
	}
	if err := ensureSettaManagedForWrite(entry, "uninstall"); err != nil {
		return preparedUninstall{}, err
	}

	targetPath, err := s.store.PluginRoot(scope, options.PluginID)
	if err != nil {
		return preparedUninstall{}, err
	}
	return preparedUninstall{
		scope:           scope,
		entry:           entry,
		targetPath:      targetPath,
		skipFinalRescan: options.skipFinalRescan,
	}, nil
}

func (s *Service) resolveUninstallEntryLocked(options UninstallOptions) (PluginScope, DiscoveredPlugin, error) {
	if options.resolvedEntry != nil {
		return options.resolvedEntry.Scope, *options.resolvedEntry, nil
	}
	return s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
}

func (s *Service) uninstallPreparedLocked(uninstall preparedUninstall) (PluginUninstallResponse, error) {
	restartRequired := uninstall.entry.HasBackend()
	if err := removePluginTarget(uninstall.targetPath); err != nil {
		return PluginUninstallResponse{}, err
	}
	if err := s.store.RemoveInstallMetadata(uninstall.entry.PluginID, uninstall.scope); err != nil {
		return PluginUninstallResponse{}, err
	}
	if err := s.removePluginFromEnablementLocked(uninstall.entry.PluginID, uninstall.scope); err != nil {
		return PluginUninstallResponse{}, err
	}
	if err := s.syncPendingRestartAfterUninstallLocked(uninstall.entry, restartRequired); err != nil {
		return PluginUninstallResponse{}, err
	}
	if !uninstall.skipFinalRescan {
		if _, err := s.rescanLocked(); err != nil {
			return PluginUninstallResponse{}, err
		}
	}
	return PluginUninstallResponse{
		PluginID:         uninstall.entry.PluginID,
		RemovedFromScope: uninstall.scope,
		RestartRequired:  restartRequired,
	}, nil
}

func (s *Service) syncPendingRestartAfterUninstallLocked(entry DiscoveredPlugin, restartRequired bool) error {
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(entry.PluginID, entryHasLanguageServerOnlyBackendRuntime(entry)); err != nil {
			return err
		}
		s.pendingRestartRemovedPlugin[entry.PluginID] = PendingRestartRemovedBackendPlugin{
			PluginID:              entry.PluginID,
			Name:                  entry.Name,
			Version:               entry.Version,
			Scope:                 entry.Scope,
			SourcePath:            entry.SourcePath,
			CanonicalSourceKey:    entry.CanonicalSourceKey,
			SourceDigestSHA256:    cloneOptionalString(entry.SourceDigestSHA256),
			RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
			EffectiveCapabilities: append([]string(nil), entry.EffectiveCapabilities...),
			BlockedCapabilities:   append([]PluginBlockedCapability(nil), entry.BlockedCapabilities...),
		}
		return nil
	}
	if err := s.discardPendingRestartBackendIDLocked(entry.PluginID); err != nil {
		return err
	}
	delete(s.pendingRestartRemovedPlugin, entry.PluginID)
	return nil
}
