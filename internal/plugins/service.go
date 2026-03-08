package plugins

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"setta/internal/buildinfo"
	"setta/internal/config"
	"setta/internal/pythonenv"
)

const unverifiedSourceWarning = "Source is unverified. Install only from trusted owners."

type CandidateProvider interface {
	ResolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error)
}

type RestartCallback func(context.Context) (bool, error)

type ServiceOptions struct {
	Store                     *Store
	DiscoveryService          *DiscoveryService
	WorkspaceRoot             string
	SettaFilesRoot            string
	SettaHome                 string
	ServerMode                config.Mode
	RestartCommand            string
	RestartCallback           RestartCallback
	SettaVersion              string
	CandidateProvider         CandidateProvider
	PackageManagerRuntime     *pythonenv.Runtime
	PackageManagerSearchPaths []string
}

type Service struct {
	store             *Store
	discoveryService  *DiscoveryService
	candidateProvider CandidateProvider
	restartCommand    string
	restartCallback   RestartCallback
	settaVersion      string

	mu                          sync.Mutex
	installTargetReservations   map[string]struct{}
	pendingRestartRemovedPlugin map[string]PendingRestartRemovedBackendPlugin
}

func NewService(options ServiceOptions) (*Service, error) {
	store := options.Store
	if store == nil {
		var err error
		store, err = NewStore(StoreOptions{
			WorkspaceRoot:  options.WorkspaceRoot,
			SettaFilesRoot: options.SettaFilesRoot,
			SettaHome:      options.SettaHome,
		})
		if err != nil {
			return nil, err
		}
	}

	discoveryService := options.DiscoveryService
	if discoveryService == nil {
		var err error
		discoveryService, err = NewDiscoveryService(DiscoveryServiceOptions{
			Store:                     store,
			ServerMode:                options.ServerMode,
			PackageManagerRuntime:     options.PackageManagerRuntime,
			PackageManagerSearchPaths: options.PackageManagerSearchPaths,
		})
		if err != nil {
			return nil, err
		}
	}

	return &Service{
		store:                       store,
		discoveryService:            discoveryService,
		candidateProvider:           options.CandidateProvider,
		restartCommand:              defaultRestartCommand(options.RestartCommand),
		restartCallback:             options.RestartCallback,
		settaVersion:                resolvedSettaVersion(options.SettaVersion),
		installTargetReservations:   map[string]struct{}{},
		pendingRestartRemovedPlugin: map[string]PendingRestartRemovedBackendPlugin{},
	}, nil
}

func resolvedSettaVersion(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		return trimmed
	}
	return buildinfo.HostPackageVersion()
}

func (s *Service) Rescan() (DiscoverySnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rescanLocked()
}

func (s *Service) Enable(_ context.Context, options EnableDisableOptions) (PluginEnableDisableResult, error) {
	if s == nil {
		return PluginEnableDisableResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, err := s.resolveHighestPrecedenceEntryLocked(options.PluginID)
	if err != nil {
		return PluginEnableDisableResult{}, err
	}

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}

	wasEnabled := resolveEnablementBeforeMutation(entry, state, globalState)
	stateChanged := false
	if !containsString(state.EnabledPluginIDs, options.PluginID) {
		state.EnabledPluginIDs = appendIfMissing(state.EnabledPluginIDs, options.PluginID)
		stateChanged = true
	}
	if containsString(state.DisabledPluginIDs, options.PluginID) {
		state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, options.PluginID)
		stateChanged = true
	}

	enablementChanged := !wasEnabled
	if entry.HasBackend() && enablementChanged {
		if !containsString(state.PendingRestartBackendPluginIDs, options.PluginID) {
			state.PendingRestartBackendPluginIDs = appendIfMissing(state.PendingRestartBackendPluginIDs, options.PluginID)
			stateChanged = true
		}
		delete(s.pendingRestartRemovedPlugin, options.PluginID)
	}
	if stateChanged {
		if err := s.store.SavePluginsState(state); err != nil {
			return PluginEnableDisableResult{}, err
		}
	}

	restartRequired := entry.HasBackend() && containsString(state.PendingRestartBackendPluginIDs, options.PluginID)
	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}
	latestEntry := findHighestPrecedenceDiscoveredPlugin(snapshot.Plugins, options.PluginID)
	if latestEntry.PluginID == "" {
		return PluginEnableDisableResult{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", options.PluginID)
	}
	return PluginEnableDisableResult{
		PluginID:        options.PluginID,
		State:           latestEntry.State,
		RestartRequired: restartRequired,
	}, nil
}

func (s *Service) Disable(_ context.Context, options EnableDisableOptions) (PluginEnableDisableResult, error) {
	if s == nil {
		return PluginEnableDisableResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, err := s.resolveHighestPrecedenceEntryLocked(options.PluginID)
	if err != nil {
		return PluginEnableDisableResult{}, err
	}

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}

	wasEnabled := resolveEnablementBeforeMutation(entry, state, globalState)
	stateChanged := false
	if !containsString(state.DisabledPluginIDs, options.PluginID) {
		state.DisabledPluginIDs = appendIfMissing(state.DisabledPluginIDs, options.PluginID)
		stateChanged = true
	}
	if containsString(state.EnabledPluginIDs, options.PluginID) {
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, options.PluginID)
		stateChanged = true
	}

	enablementChanged := wasEnabled
	if entry.HasBackend() && enablementChanged {
		if !containsString(state.PendingRestartBackendPluginIDs, options.PluginID) {
			state.PendingRestartBackendPluginIDs = appendIfMissing(state.PendingRestartBackendPluginIDs, options.PluginID)
			stateChanged = true
		}
		delete(s.pendingRestartRemovedPlugin, options.PluginID)
	}
	if stateChanged {
		if err := s.store.SavePluginsState(state); err != nil {
			return PluginEnableDisableResult{}, err
		}
	}

	restartRequired := entry.HasBackend() && containsString(state.PendingRestartBackendPluginIDs, options.PluginID)
	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginEnableDisableResult{}, err
	}
	latestEntry := findHighestPrecedenceDiscoveredPlugin(snapshot.Plugins, options.PluginID)
	if latestEntry.PluginID == "" {
		return PluginEnableDisableResult{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", options.PluginID)
	}
	return PluginEnableDisableResult{
		PluginID:        options.PluginID,
		State:           latestEntry.State,
		RestartRequired: restartRequired,
	}, nil
}

func (s *Service) Install(ctx context.Context, options InstallOptions) (PluginInstallResult, error) {
	if s == nil {
		return PluginInstallResult{}, ErrWorkspaceRootRequired
	}

	scope, err := NormalizeScope(options.Scope)
	if err != nil {
		return PluginInstallResult{}, err
	}
	parsedSpec, err := ParseSourceSpec(options.SourceSpec)
	if err != nil {
		return PluginInstallResult{}, err
	}
	installer := resolvedInstaller(options.Installer)
	candidate, err := s.resolveCandidate(ctx, parsedSpec, installer)
	if err != nil {
		return PluginInstallResult{}, err
	}
	if candidate.cleanup != nil {
		defer func() {
			_ = candidate.cleanup()
		}()
	}
	if err := normalizeCandidate(&candidate, parsedSpec); err != nil {
		return PluginInstallResult{}, err
	}

	targetPath, err := s.store.PluginRoot(scope, candidate.Manifest.ID)
	if err != nil {
		return PluginInstallResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.reserveInstallTargetPathLocked(targetPath, options.Force); err != nil {
		return PluginInstallResult{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(targetPath)

	hadBackendBefore := false
	if options.existingEntry != nil {
		hadBackendBefore = options.existingEntry.HasBackend()
	} else if !options.skipLookupRescan {
		currentSnapshot, err := s.rescanLocked()
		if err != nil {
			return PluginInstallResult{}, err
		}
		existingEntry := findDiscoveredPlugin(currentSnapshot.Plugins, candidate.Manifest.ID, scope)
		hadBackendBefore = existingEntry.PluginID != "" && existingEntry.HasBackend()
	}

	if err := s.installCandidateLocked(candidate, targetPath, scope, options.SourceSpec, installer, options.Enable, options.Force); err != nil {
		return PluginInstallResult{}, err
	}

	restartRequired := candidate.Manifest.Backend != nil || hadBackendBefore
	delete(s.pendingRestartRemovedPlugin, candidate.Manifest.ID)
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(candidate.Manifest.ID); err != nil {
			return PluginInstallResult{}, err
		}
	} else {
		if err := s.discardPendingRestartBackendIDLocked(candidate.Manifest.ID); err != nil {
			return PluginInstallResult{}, err
		}
	}

	if options.skipFinalRescan {
		state := PluginRuntimeStateActive
		if !options.Enable {
			state = PluginRuntimeStateDisabled
		} else if restartRequired {
			state = PluginRuntimeStatePendingRestart
		}
		return PluginInstallResult{
			PluginID:              candidate.Manifest.ID,
			Version:               candidate.Manifest.Version,
			SourceScope:           scope,
			SourceScopeLabel:      string(scope),
			SourcePath:            targetPath,
			CanonicalSourceKey:    candidate.CanonicalSourceKey,
			SourceDigestSHA256:    cloneOptionalString(candidate.SourceDigestSHA256),
			RequestedCapabilities: append([]string(nil), candidate.Manifest.Capabilities...),
			TrustStatus:           PluginSourceTrustStatusUnverified,
			TrustWarning:          unverifiedSourceWarning,
			Components:            manifestComponents(candidate.Manifest),
			State:                 state,
			RestartRequired:       restartRequired,
		}, nil
	}

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginInstallResult{}, err
	}
	activeEntry := findDiscoveredPlugin(snapshot.Plugins, candidate.Manifest.ID, scope)
	if activeEntry.PluginID == "" {
		return PluginInstallResult{}, newServiceError(ServiceErrorCodeInstallFailed, "Installed plugin was not discovered: %s", candidate.Manifest.ID)
	}

	return PluginInstallResult{
		PluginID:              activeEntry.PluginID,
		Version:               activeEntry.Version,
		SourceScope:           scope,
		SourceScopeLabel:      string(scope),
		SourcePath:            activeEntry.SourcePath,
		CanonicalSourceKey:    activeEntry.CanonicalSourceKey,
		SourceDigestSHA256:    cloneOptionalString(activeEntry.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), activeEntry.RequestedCapabilities...),
		TrustStatus:           PluginSourceTrustStatusUnverified,
		TrustWarning:          unverifiedSourceWarning,
		Components:            manifestComponents(candidate.Manifest),
		State:                 activeEntry.State,
		RestartRequired:       restartRequired,
	}, nil
}

func (s *Service) Uninstall(_ context.Context, options UninstallOptions) (PluginUninstallResult, error) {
	if s == nil {
		return PluginUninstallResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	scope := PluginScope("")
	entry := DiscoveredPlugin{}
	var err error
	if options.resolvedEntry != nil {
		scope = options.resolvedEntry.Scope
		entry = *options.resolvedEntry
	} else {
		scope, entry, err = s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
		if err != nil {
			return PluginUninstallResult{}, err
		}
	}
	if err := ensureSettaManagedForWrite(entry, "uninstall"); err != nil {
		return PluginUninstallResult{}, err
	}

	targetPath, err := s.store.PluginRoot(scope, options.PluginID)
	if err != nil {
		return PluginUninstallResult{}, err
	}
	restartRequired := entry.HasBackend()
	if err := removePluginTarget(targetPath); err != nil {
		return PluginUninstallResult{}, err
	}
	if err := s.store.RemoveInstallMetadata(options.PluginID, scope); err != nil {
		return PluginUninstallResult{}, err
	}
	if err := s.removePluginFromEnablementLocked(options.PluginID, scope); err != nil {
		return PluginUninstallResult{}, err
	}
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(options.PluginID); err != nil {
			return PluginUninstallResult{}, err
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
	} else {
		if err := s.discardPendingRestartBackendIDLocked(options.PluginID); err != nil {
			return PluginUninstallResult{}, err
		}
		delete(s.pendingRestartRemovedPlugin, entry.PluginID)
	}
	if !options.skipFinalRescan {
		if _, err := s.rescanLocked(); err != nil {
			return PluginUninstallResult{}, err
		}
	}
	return PluginUninstallResult{
		PluginID:         entry.PluginID,
		RemovedFromScope: scope,
		RestartRequired:  restartRequired,
	}, nil
}

func (s *Service) Update(ctx context.Context, options UpdateOptions) (PluginUpdateResult, error) {
	if s == nil {
		return PluginUpdateResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	scope, entry, err := s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
	if err != nil {
		s.mu.Unlock()
		return PluginUpdateResult{}, err
	}
	if err := ensureSettaManagedForWrite(entry, "update"); err != nil {
		s.mu.Unlock()
		return PluginUpdateResult{}, err
	}
	metadataEntry, ok, err := s.store.GetInstallMetadata(options.PluginID, scope)
	if err != nil {
		s.mu.Unlock()
		return PluginUpdateResult{}, err
	}
	if !ok {
		s.mu.Unlock()
		return PluginUpdateResult{}, newServiceError(ServiceErrorCodeUpdateUnavailable, "No source metadata stored for plugin: %s", options.PluginID)
	}
	if SourceSpecIsLocal(metadataEntry.SourceSpec) {
		s.mu.Unlock()
		return PluginUpdateResult{}, newServiceError(
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
		return PluginUpdateResult{}, err
	}
	return PluginUpdateResult{
		PluginID:           options.PluginID,
		FromVersion:        existingVersion,
		ToVersion:          installResult.Version,
		SourceDigestSHA256: cloneOptionalString(installResult.SourceDigestSHA256),
		RestartRequired:    existingHadBackend || installResult.RestartRequired,
	}, nil
}

func (s *Service) Rollback(_ context.Context, options RollbackOptions) (PluginRollbackResult, error) {
	if s == nil {
		return PluginRollbackResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	scope, entry, err := s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
	if err != nil {
		return PluginRollbackResult{}, err
	}
	currentEntryHadBackend := entry.HasBackend()
	if entry.PluginID != "" {
		if err := ensureSettaManagedForWrite(entry, "rollback"); err != nil {
			return PluginRollbackResult{}, err
		}
	}

	metadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return PluginRollbackResult{}, err
	}
	metadataEntry, ok := metadata.Entries[metadataKey(scope, options.PluginID)]
	if !ok || len(metadataEntry.History) == 0 {
		return PluginRollbackResult{}, newServiceError(ServiceErrorCodeRollbackUnavailable, "No rollback history exists for plugin: %s", options.PluginID)
	}
	if SourceSpecIsLocal(metadataEntry.SourceSpec) {
		return PluginRollbackResult{}, newServiceError(
			ServiceErrorCodeRollbackUnavailable,
			"Rollback is unavailable for linked local plugins. Unlink and relink the desired local source for %s.",
			options.PluginID,
		)
	}
	previous := metadataEntry.History[len(metadataEntry.History)-1]
	if strings.TrimSpace(previous.SnapshotPath) == "" {
		return PluginRollbackResult{}, newServiceError(ServiceErrorCodeRollbackUnavailable, "Rollback snapshot missing for plugin: %s", options.PluginID)
	}
	snapshotPath := previous.SnapshotPath
	if _, err := os.Stat(snapshotPath); err != nil {
		if os.IsNotExist(err) {
			return PluginRollbackResult{}, newServiceError(ServiceErrorCodeRollbackUnavailable, "Rollback snapshot missing for plugin: %s", options.PluginID)
		}
		return PluginRollbackResult{}, fmt.Errorf("stat rollback snapshot %s: %w", snapshotPath, err)
	}
	snapshotManifest, err := LoadPluginManifest(snapshotPath, options.PluginID)
	if err != nil {
		return PluginRollbackResult{}, err
	}
	snapshotDigest, err := computeDirectoryDigest(snapshotPath)
	if err != nil {
		return PluginRollbackResult{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, options.PluginID)
	if err != nil {
		return PluginRollbackResult{}, err
	}
	if err := s.reserveInstallTargetPathLocked(targetPath, true); err != nil {
		return PluginRollbackResult{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(targetPath)

	if err := removePluginTarget(targetPath); err != nil {
		return PluginRollbackResult{}, err
	}
	if err := copyDirectoryTree(snapshotPath, targetPath); err != nil {
		return PluginRollbackResult{}, err
	}

	metadataEntry.History = append([]PluginInstallHistoryEntry(nil), metadataEntry.History[:len(metadataEntry.History)-1]...)
	metadataEntry.Version = snapshotManifest.Version
	metadataEntry.SourceDigestSHA256 = stringPtr(snapshotDigest)
	metadata.Entries[metadataKey(scope, options.PluginID)] = metadataEntry
	if err := s.store.SaveInstallMetadata(metadata); err != nil {
		return PluginRollbackResult{}, err
	}

	restartRequired := snapshotManifest.Backend != nil || currentEntryHadBackend
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(options.PluginID); err != nil {
			return PluginRollbackResult{}, err
		}
		delete(s.pendingRestartRemovedPlugin, options.PluginID)
	}
	if _, err := s.rescanLocked(); err != nil {
		return PluginRollbackResult{}, err
	}
	return PluginRollbackResult{
		PluginID:           options.PluginID,
		RestoredVersion:    snapshotManifest.Version,
		SourceDigestSHA256: stringPtr(snapshotDigest),
		RestartRequired:    restartRequired,
	}, nil
}

func (s *Service) resolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error) {
	if s.candidateProvider == nil {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source provider is unavailable.")
	}
	return s.candidateProvider.ResolveCandidate(ctx, spec, installer)
}

func normalizeCandidate(candidate *CandidatePlugin, spec ParsedSourceSpec) error {
	if candidate == nil {
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source candidate is unavailable.")
	}
	root := strings.TrimSpace(candidate.Root)
	if root == "" {
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source candidate root is required.")
	}
	info, err := os.Stat(root)
	if err != nil {
		return fmt.Errorf("stat plugin candidate root %s: %w", root, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%w: %s", ErrPluginRootInvalid, root)
	}
	manifest, err := LoadPluginManifest(root, filepath.Base(root))
	if err != nil {
		return err
	}
	if err := ValidatePluginManifestPaths(root, manifest); err != nil {
		return err
	}
	candidate.Root = root
	candidate.Manifest = manifest
	if strings.TrimSpace(candidate.CanonicalSourceKey) == "" {
		candidate.CanonicalSourceKey = spec.CanonicalSourceKey
	}
	if candidate.SourceDigestSHA256 == nil || strings.TrimSpace(*candidate.SourceDigestSHA256) == "" {
		digest, err := computeDirectoryDigest(root)
		if err != nil {
			return err
		}
		candidate.SourceDigestSHA256 = stringPtr(digest)
	}
	return nil
}

func resolvedInstaller(installer *PluginInstallerBackend) PluginInstallerBackend {
	if installer == nil {
		return PluginInstallerBackendAuto
	}
	switch *installer {
	case PluginInstallerBackendPip, PluginInstallerBackendUV:
		return *installer
	default:
		return PluginInstallerBackendAuto
	}
}

func (s *Service) rescanLocked() (DiscoverySnapshot, error) {
	snapshot, err := s.discoveryService.Rescan()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	discoveredPluginIDs := map[string]struct{}{}
	for _, entry := range snapshot.Plugins {
		discoveredPluginIDs[entry.PluginID] = struct{}{}
	}
	for pluginID := range discoveredPluginIDs {
		delete(s.pendingRestartRemovedPlugin, pluginID)
	}
	for _, pendingRemoved := range s.pendingRestartRemovedPlugin {
		snapshot.Plugins = append(snapshot.Plugins, DiscoveredPlugin{
			PluginID:              pendingRemoved.PluginID,
			Name:                  pendingRemoved.Name,
			Version:               pendingRemoved.Version,
			Scope:                 pendingRemoved.Scope,
			SourcePath:            pendingRemoved.SourcePath,
			CanonicalSourceKey:    pendingRemoved.CanonicalSourceKey,
			SourceDigestSHA256:    cloneOptionalString(pendingRemoved.SourceDigestSHA256),
			SourceManager:         PluginSourceManagerSetta,
			State:                 PluginRuntimeStatePendingRestart,
			RequestedCapabilities: append([]string(nil), pendingRemoved.RequestedCapabilities...),
			EffectiveCapabilities: append([]string(nil), pendingRemoved.EffectiveCapabilities...),
			BlockedCapabilities:   append([]PluginBlockedCapability(nil), pendingRemoved.BlockedCapabilities...),
			RestartRequired:       true,
		})
	}
	slices.SortFunc(snapshot.Plugins, compareDiscoveredPlugins)
	snapshot.InstalledPlugins = 0
	snapshot.ActivePlugins = 0
	for _, entry := range snapshot.Plugins {
		if entry.State == PluginRuntimeStateActive || entry.State == PluginRuntimeStatePendingRestart {
			snapshot.ActivePlugins++
		}
		if entry.ShadowedBySourcePath != "" {
			continue
		}
		switch entry.State {
		case PluginRuntimeStateActive, PluginRuntimeStatePendingRestart, PluginRuntimeStateDisabled, PluginRuntimeStateInvalid:
			snapshot.InstalledPlugins++
		}
	}
	return snapshot, nil
}

func (s *Service) resolveScopeAndEntryLocked(pluginID string, requestedScope *PluginScope) (PluginScope, DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return "", DiscoveredPlugin{}, err
	}
	if requestedScope != nil {
		scope, err := NormalizeScope(requestedScope)
		if err != nil {
			return "", DiscoveredPlugin{}, err
		}
		entry := findDiscoveredPlugin(snapshot.Plugins, pluginID, scope)
		if entry.PluginID == "" {
			return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
		}
		return scope, entry, nil
	}
	seen := map[PluginScope]struct{}{}
	scopes := make([]PluginScope, 0, 2)
	for _, entry := range snapshot.Plugins {
		if entry.PluginID != pluginID {
			continue
		}
		if _, ok := seen[entry.Scope]; ok {
			continue
		}
		seen[entry.Scope] = struct{}{}
		scopes = append(scopes, entry.Scope)
	}
	slices.SortFunc(scopes, compareScopeOrder)
	if len(scopes) == 0 {
		return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
	}
	if len(scopes) > 1 {
		return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeUninstallScopeRequired, "Plugin exists in multiple scopes; scope is required: %s", pluginID)
	}
	return scopes[0], findDiscoveredPlugin(snapshot.Plugins, pluginID, scopes[0]), nil
}

func (s *Service) resolveHighestPrecedenceEntryLocked(pluginID string) (DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return DiscoveredPlugin{}, err
	}
	entry := findHighestPrecedenceDiscoveredPlugin(snapshot.Plugins, pluginID)
	if entry.PluginID == "" {
		return DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
	}
	return entry, nil
}

func ensureSettaManagedForWrite(entry DiscoveredPlugin, operation string) error {
	if entry.SourceManager != PluginSourceManagerPackageManager {
		return nil
	}
	return newServiceError(
		ServiceErrorCodeManagedExternally,
		"Plugin %s is managed by a Python package manager. Use uv/pip/Poetry to %s it.",
		entry.PluginID,
		operation,
	)
}

func findDiscoveredPlugin(entries []DiscoveredPlugin, pluginID string, scope PluginScope) DiscoveredPlugin {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry
		}
	}
	return DiscoveredPlugin{}
}

func findHighestPrecedenceDiscoveredPlugin(entries []DiscoveredPlugin, pluginID string) DiscoveredPlugin {
	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	return DiscoveredPlugin{}
}

func resolveEnablementBeforeMutation(entry DiscoveredPlugin, state PluginsStateFile, globalState PluginsGlobalStateFile) bool {
	if entry.Manifest == nil {
		return containsString(state.EnabledPluginIDs, entry.PluginID) && !containsString(state.DisabledPluginIDs, entry.PluginID)
	}
	enabled, _ := resolveFilesystemPluginEnabledWithSource(
		entry.PluginID,
		entry.Scope,
		entry.Manifest.EnabledByDefault,
		state,
		globalState,
	)
	return enabled
}

func (s *Service) installCandidateLocked(candidate CandidatePlugin, targetPath string, scope PluginScope, sourceSpec string, installer PluginInstallerBackend, enable bool, force bool) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return fmt.Errorf("create plugin target parent %s: %w", targetPath, err)
	}
	if err := s.ensureTargetPathAvailableLocked(targetPath, force); err != nil {
		return err
	}
	if targetExists(targetPath) {
		if err := s.backupExistingPluginLocked(candidate.Manifest.ID, scope, targetPath); err != nil {
			return err
		}
		if err := removePluginTarget(targetPath); err != nil {
			return err
		}
	}

	stagedPath := filepath.Join(filepath.Dir(targetPath), fmt.Sprintf(".%s.tmp-%d-%d", candidate.Manifest.ID, os.Getpid(), time.Now().UTC().UnixNano()))
	if err := removePluginTarget(stagedPath); err != nil {
		return err
	}
	if err := copyDirectoryTree(candidate.Root, stagedPath); err != nil {
		return err
	}
	if err := os.Rename(stagedPath, targetPath); err != nil {
		removePluginTarget(stagedPath)
		return fmt.Errorf("activate plugin candidate %s: %w", targetPath, err)
	}
	installerValue := installer
	if err := s.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           candidate.Manifest.ID,
		Scope:              scope,
		SourceSpec:         sourceSpec,
		InstallerBackend:   &installerValue,
		CanonicalSourceKey: candidate.CanonicalSourceKey,
		SourceDigestSHA256: cloneOptionalString(candidate.SourceDigestSHA256),
		Version:            candidate.Manifest.Version,
	}); err != nil {
		return err
	}
	return s.applyEnablementAfterInstallLocked(candidate.Manifest.ID, scope, enable)
}

func (s *Service) ensureTargetPathAvailableLocked(targetPath string, force bool) error {
	if force {
		return nil
	}
	if targetExists(targetPath) {
		return newServiceError(ServiceErrorCodeTargetExists, "Plugin already exists at %s. Use force to overwrite.", targetPath)
	}
	return nil
}

func (s *Service) reserveInstallTargetPathLocked(targetPath string, force bool) error {
	if err := s.ensureTargetPathAvailableLocked(targetPath, force); err != nil {
		return err
	}
	targetKey, err := installTargetPathKey(targetPath)
	if err != nil {
		return err
	}
	if _, exists := s.installTargetReservations[targetKey]; exists {
		return newServiceError(ServiceErrorCodeTargetExists, "Plugin install already in progress for %s.", targetPath)
	}
	s.installTargetReservations[targetKey] = struct{}{}
	return nil
}

func (s *Service) releaseInstallTargetPathReservationLocked(targetPath string) {
	targetKey, err := installTargetPathKey(targetPath)
	if err != nil {
		return
	}
	delete(s.installTargetReservations, targetKey)
}

func installTargetPathKey(targetPath string) (string, error) {
	absolutePath, err := filepath.Abs(filepath.Clean(targetPath))
	if err != nil {
		return "", err
	}
	return absolutePath, nil
}

func (s *Service) backupExistingPluginLocked(pluginID string, scope PluginScope, targetPath string) error {
	info, err := os.Lstat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat existing plugin %s: %w", targetPath, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	historyEntry, err := s.store.CreateHistorySnapshot(pluginID, scope)
	if err != nil {
		return err
	}
	metadataEntry, ok, err := s.store.GetInstallMetadata(pluginID, scope)
	if err != nil {
		return err
	}
	if !ok {
		manifest, err := LoadPluginManifest(targetPath, pluginID)
		if err != nil {
			return err
		}
		digest, err := computeDirectoryDigest(targetPath)
		if err != nil {
			return err
		}
		metadataEntry = PluginInstallMetadataEntry{
			PluginID:           pluginID,
			Scope:              scope,
			SourceSpec:         "local:" + targetPath,
			CanonicalSourceKey: "local:" + targetPath,
			SourceDigestSHA256: stringPtr(digest),
			Version:            manifest.Version,
			History:            []PluginInstallHistoryEntry{},
		}
	}
	metadataEntry.History = append(metadataEntry.History, historyEntry)
	metadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return err
	}
	metadata.Entries[metadataKey(scope, pluginID)] = metadataEntry
	return s.store.SaveInstallMetadata(metadata)
}

func (s *Service) applyEnablementAfterInstallLocked(pluginID string, scope PluginScope, enable bool) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	if scope == PluginScopeGlobal {
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
		state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	} else if enable {
		state.EnabledPluginIDs = appendIfMissing(state.EnabledPluginIDs, pluginID)
		state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	} else {
		state.DisabledPluginIDs = appendIfMissing(state.DisabledPluginIDs, pluginID)
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
	}
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	if scope != PluginScopeGlobal {
		return nil
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return err
	}
	if enable {
		globalState.AutoEnabledPluginIDs = appendIfMissing(globalState.AutoEnabledPluginIDs, pluginID)
	} else {
		globalState.AutoEnabledPluginIDs = removeString(globalState.AutoEnabledPluginIDs, pluginID)
	}
	return s.store.SavePluginsGlobalState(globalState)
}

func (s *Service) removePluginFromEnablementLocked(pluginID string, scope PluginScope) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
	state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	delete(state.PluginConfigByID, pluginConfigKey(pluginID, scope))
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	if scope != PluginScopeGlobal {
		return nil
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return err
	}
	globalState.AutoEnabledPluginIDs = removeString(globalState.AutoEnabledPluginIDs, pluginID)
	return s.store.SavePluginsGlobalState(globalState)
}

func (s *Service) addPendingRestartBackendIDLocked(pluginID string) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	state.PendingRestartBackendPluginIDs = appendIfMissing(state.PendingRestartBackendPluginIDs, pluginID)
	return s.store.SavePluginsState(state)
}

func (s *Service) discardPendingRestartBackendIDLocked(pluginID string) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	state.PendingRestartBackendPluginIDs = removeString(state.PendingRestartBackendPluginIDs, pluginID)
	return s.store.SavePluginsState(state)
}

func pluginConfigKey(pluginID string, scope PluginScope) string {
	return fmt.Sprintf("%s:%s", scope, pluginID)
}

func removeString(values []string, target string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if value == target {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func appendIfMissing(values []string, target string) []string {
	for _, value := range values {
		if value == target {
			return values
		}
	}
	return append(values, target)
}

func manifestComponents(manifest PluginManifest) []string {
	components := []string{}
	if manifest.Backend != nil {
		components = append(components, "backend")
	}
	if manifest.Frontend != nil {
		components = append(components, "frontend")
	}
	if manifest.Content != nil {
		components = append(components, "content")
	}
	return components
}

func targetExists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func removePluginTarget(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat plugin target %s: %w", path, err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return os.Remove(path)
	}
	if info.IsDir() {
		return os.RemoveAll(path)
	}
	return os.Remove(path)
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
