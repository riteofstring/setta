package plugins

import (
	"context"
)

func (s *Service) Update(ctx context.Context, options UpdateOptions) (PluginUpdateResponse, error) {
	if s == nil {
		return PluginUpdateResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	scope, entry, err := s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
	if err != nil {
		s.mu.Unlock()
		return PluginUpdateResponse{}, err
	}
	if err := ensureSettaManagedForWrite(entry, "update"); err != nil {
		s.mu.Unlock()
		return PluginUpdateResponse{}, err
	}
	metadataEntry, ok, err := s.store.GetInstallMetadata(options.PluginID, scope)
	if err != nil {
		s.mu.Unlock()
		return PluginUpdateResponse{}, err
	}
	if !ok {
		s.mu.Unlock()
		return PluginUpdateResponse{}, newServiceError(ServiceErrorCodeUpdateUnavailable, "No source metadata stored for plugin: %s", options.PluginID)
	}
	if SourceSpecIsLocal(metadataEntry.SourceSpec) {
		s.mu.Unlock()
		return PluginUpdateResponse{}, newServiceError(
			ServiceErrorCodeUpdateUnavailable,
			"Update is unavailable for linked local plugins. Unlink and relink the desired local source for %s.",
			options.PluginID,
		)
	}
	sourceSpec := metadataEntry.SourceSpec
	if options.To != "" {
		sourceSpec = RetargetSourceSpec(sourceSpec, options.To)
	}
	enableAfterUpdate := entry.State != PluginRuntimeStateDisabled
	existingVersion := entry.Version
	existingHadBackend := entry.HasBackend()
	s.mu.Unlock()

	installResult, err := s.Install(ctx, InstallOptions{
		SourceSpec: sourceSpec,
		Scope:      &scope,
		Installer:  metadataEntry.InstallerBackend,
		Enable:     enableAfterUpdate,
		Force:      true,
	})
	if err != nil {
		return PluginUpdateResponse{}, err
	}
	return PluginUpdateResponse{
		PluginID:           options.PluginID,
		FromVersion:        existingVersion,
		ToVersion:          installResult.Version,
		SourceDigestSHA256: cloneOptionalString(installResult.SourceDigestSHA256),
		RestartRequired:    existingHadBackend || installResult.RestartRequired,
	}, nil
}

func (s *Service) Rollback(_ context.Context, options RollbackOptions) (PluginRollbackResponse, error) {
	if s == nil {
		return PluginRollbackResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rollback, err := s.prepareRollbackLocked(options)
	if err != nil {
		return PluginRollbackResponse{}, err
	}
	restartRequired, err := s.rollbackPreparedLocked(rollback)
	if err != nil {
		return PluginRollbackResponse{}, err
	}
	return PluginRollbackResponse{
		PluginID:           rollback.pluginID,
		RestoredVersion:    rollback.snapshotManifest.Version,
		SourceDigestSHA256: stringPtr(rollback.snapshotDigest),
		RestartRequired:    restartRequired,
	}, nil
}

func (s *Service) prepareInstall(ctx context.Context, options InstallOptions) (preparedInstall, error) {
	scope, err := NormalizeScope(options.Scope)
	if err != nil {
		return preparedInstall{}, err
	}
	parsedSpec, err := ParseSourceSpec(options.SourceSpec)
	if err != nil {
		return preparedInstall{}, err
	}
	installer := resolvedInstaller(options.Installer)
	candidate, err := s.resolveCandidate(ctx, parsedSpec, installer)
	if err != nil {
		return preparedInstall{}, err
	}
	if err := normalizeCandidate(&candidate, parsedSpec); err != nil {
		return preparedInstall{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, candidate.Manifest.ID)
	if err != nil {
		return preparedInstall{}, err
	}

	request := preparedInstall{
		scope:            scope,
		sourceSpec:       options.SourceSpec,
		installer:        installer,
		candidate:        candidate,
		targetPath:       targetPath,
		enable:           options.Enable,
		force:            options.Force,
		hasExistingEntry: options.existingEntry != nil,
		skipLookupRescan: options.skipLookupRescan,
		skipFinalRescan:  options.skipFinalRescan,
	}
	if options.existingEntry != nil {
		request.existingEntryBackend = options.existingEntry.HasBackend()
		request.existingEntryLanguageServerOnly = entryHasLanguageServerOnlyBackendRuntime(*options.existingEntry)
	}
	return request, nil
}

func (s *Service) installPreparedLocked(request preparedInstall) (PluginInstallResponse, error) {
	if err := s.reserveInstallTargetPathLocked(request.targetPath, request.force); err != nil {
		return PluginInstallResponse{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(request.targetPath)

	hadBackendBefore, hadLanguageServerOnlyBefore, err := s.installHadBackendBeforeLocked(request)
	if err != nil {
		return PluginInstallResponse{}, err
	}
	if err := s.installCandidateLocked(
		request.candidate,
		request.targetPath,
		request.scope,
		request.sourceSpec,
		request.installer,
		request.enable,
		request.force,
	); err != nil {
		return PluginInstallResponse{}, err
	}

	restartRequired, err := s.syncInstallRestartStateLocked(request, hadBackendBefore, hadLanguageServerOnlyBefore)
	if err != nil {
		return PluginInstallResponse{}, err
	}
	return s.buildInstallResponseLocked(request, restartRequired)
}

func (s *Service) installHadBackendBeforeLocked(request preparedInstall) (bool, bool, error) {
	if request.hasExistingEntry {
		return request.existingEntryBackend, request.existingEntryLanguageServerOnly, nil
	}
	if request.skipLookupRescan {
		return false, false, nil
	}

	currentSnapshot, err := s.rescanLocked()
	if err != nil {
		return false, false, err
	}
	existingEntry := findDiscoveredPlugin(currentSnapshot.Plugins, request.candidate.Manifest.ID, request.scope)
	return existingEntry.PluginID != "" && existingEntry.HasBackend(), entryHasLanguageServerOnlyBackendRuntime(existingEntry), nil
}

func (s *Service) syncInstallRestartStateLocked(
	request preparedInstall,
	hadBackendBefore bool,
	hadLanguageServerOnlyBefore bool,
) (bool, error) {
	restartRequired := request.candidate.Manifest.Backend != nil || hadBackendBefore
	delete(s.pendingRestartRemovedPlugin, request.candidate.Manifest.ID)
	if restartRequired {
		languageServerOnly := s.pendingRestartLanguageServerOnlyForManifest(
			&request.candidate.Manifest,
			hadLanguageServerOnlyBefore,
		)
		if err := s.addPendingRestartBackendIDLocked(request.candidate.Manifest.ID, languageServerOnly); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := s.discardPendingRestartBackendIDLocked(request.candidate.Manifest.ID); err != nil {
		return false, err
	}
	return false, nil
}

func (s *Service) buildInstallResponseLocked(request preparedInstall, restartRequired bool) (PluginInstallResponse, error) {
	if request.skipFinalRescan {
		return buildPreparedInstallResponse(request, restartRequired), nil
	}

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginInstallResponse{}, err
	}
	activeEntry := findDiscoveredPlugin(snapshot.Plugins, request.candidate.Manifest.ID, request.scope)
	if activeEntry.PluginID == "" {
		return PluginInstallResponse{}, newServiceError(
			ServiceErrorCodeInstallFailed,
			"Installed plugin was not discovered: %s",
			request.candidate.Manifest.ID,
		)
	}
	return PluginInstallResponse{
		PluginID:              activeEntry.PluginID,
		Version:               activeEntry.Version,
		SourceScope:           request.scope,
		SourceScopeLabel:      string(request.scope),
		SourcePath:            activeEntry.SourcePath,
		CanonicalSourceKey:    activeEntry.CanonicalSourceKey,
		SourceDigestSHA256:    cloneOptionalString(activeEntry.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), activeEntry.RequestedCapabilities...),
		TrustStatus:           PluginSourceTrustStatusUnverified,
		TrustWarning:          unverifiedSourceWarning,
		Components:            manifestComponents(request.candidate.Manifest),
		State:                 activeEntry.State,
		RestartRequired:       restartRequired,
	}, nil
}

func buildPreparedInstallResponse(request preparedInstall, restartRequired bool) PluginInstallResponse {
	return PluginInstallResponse{
		PluginID:              request.candidate.Manifest.ID,
		Version:               request.candidate.Manifest.Version,
		SourceScope:           request.scope,
		SourceScopeLabel:      string(request.scope),
		SourcePath:            request.targetPath,
		CanonicalSourceKey:    request.candidate.CanonicalSourceKey,
		SourceDigestSHA256:    cloneOptionalString(request.candidate.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), request.candidate.Manifest.Capabilities...),
		TrustStatus:           PluginSourceTrustStatusUnverified,
		TrustWarning:          unverifiedSourceWarning,
		Components:            manifestComponents(request.candidate.Manifest),
		State:                 installResponseState(request.enable, restartRequired),
		RestartRequired:       restartRequired,
	}
}

func installResponseState(enable bool, restartRequired bool) PluginRuntimeState {
	if !enable {
		return PluginRuntimeStateDisabled
	}
	if restartRequired {
		return PluginRuntimeStatePendingRestart
	}
	return PluginRuntimeStateActive
}
