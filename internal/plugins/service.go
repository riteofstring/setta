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
	settaFilesRoot    string

	mu                          sync.Mutex
	installTargetReservations   map[string]struct{}
	pendingRestartRemovedPlugin map[string]PendingRestartRemovedBackendPlugin
}

type preparedInstall struct {
	scope                PluginScope
	sourceSpec           string
	installer            PluginInstallerBackend
	candidate            CandidatePlugin
	targetPath           string
	enable               bool
	force                bool
	hasExistingEntry     bool
	existingEntryBackend bool
	skipLookupRescan     bool
	skipFinalRescan      bool
}

type preparedRollback struct {
	pluginID               string
	scope                  PluginScope
	targetPath             string
	snapshotPath           string
	snapshotManifest       PluginManifest
	snapshotDigest         string
	metadata               PluginInstallMetadataFile
	metadataEntry          PluginInstallMetadataEntry
	currentEntryHadBackend bool
}

type preparedUninstall struct {
	scope           PluginScope
	entry           DiscoveredPlugin
	targetPath      string
	skipFinalRescan bool
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
		settaFilesRoot:              strings.TrimSpace(options.SettaFilesRoot),
		installTargetReservations:   map[string]struct{}{},
		pendingRestartRemovedPlugin: map[string]PendingRestartRemovedBackendPlugin{},
	}, nil
}

func (s *Service) SetRestartCallback(callback RestartCallback) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.restartCallback = callback
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

func (s *Service) PreviewBackendRuntimeRefresh() (DiscoverySnapshot, error) {
	if s == nil {
		return DiscoverySnapshot{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	state.PendingRestartBackendPluginIDs = nil
	return s.discoveryService.rescanWithStates(state, globalState)
}

func (s *Service) CommitBackendRuntimeRefresh() (DiscoverySnapshot, error) {
	if s == nil {
		return DiscoverySnapshot{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	stateChanged := len(state.PendingRestartBackendPluginIDs) != 0
	if stateChanged {
		state.PendingRestartBackendPluginIDs = nil
		if err := s.store.SavePluginsState(state); err != nil {
			return DiscoverySnapshot{}, err
		}
	}
	if len(s.pendingRestartRemovedPlugin) != 0 {
		s.pendingRestartRemovedPlugin = map[string]PendingRestartRemovedBackendPlugin{}
	}

	return s.rescanLocked()
}

func (s *Service) CommitAppliedLanguageServerPlugins(pluginIDs []string) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	if len(state.PendingRestartBackendPluginIDs) == 0 {
		return nil
	}

	snapshot, err := s.rescanLocked()
	if err != nil {
		return err
	}
	removablePendingIDs := pendingRestartLanguageServerOnlyPluginIDs(snapshot.Plugins, pluginIDs)
	if len(removablePendingIDs) == 0 {
		return nil
	}

	nextPendingIDs := make([]string, 0, len(state.PendingRestartBackendPluginIDs))
	for _, pluginID := range state.PendingRestartBackendPluginIDs {
		if _, ok := removablePendingIDs[pluginID]; ok {
			continue
		}
		nextPendingIDs = append(nextPendingIDs, pluginID)
	}

	state.PendingRestartBackendPluginIDs = nextPendingIDs
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	for pluginID := range removablePendingIDs {
		delete(s.pendingRestartRemovedPlugin, pluginID)
	}
	return nil
}

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
	if containsString(state.PendingRestartBackendPluginIDs, pluginID) {
		delete(s.pendingRestartRemovedPlugin, pluginID)
		return false
	}

	state.PendingRestartBackendPluginIDs = appendIfMissing(state.PendingRestartBackendPluginIDs, pluginID)
	delete(s.pendingRestartRemovedPlugin, pluginID)
	return true
}

func (s *Service) buildEnableDisableResponseLocked(pluginID string, restartRequired bool) (PluginEnableDisableResponse, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginEnableDisableResponse{}, err
	}
	latestEntry := findHighestPrecedenceDiscoveredPlugin(snapshot.Plugins, pluginID)
	if latestEntry.PluginID == "" {
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
		if err := s.addPendingRestartBackendIDLocked(entry.PluginID); err != nil {
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
	}
	return request, nil
}

func (s *Service) installPreparedLocked(request preparedInstall) (PluginInstallResponse, error) {
	if err := s.reserveInstallTargetPathLocked(request.targetPath, request.force); err != nil {
		return PluginInstallResponse{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(request.targetPath)

	hadBackendBefore, err := s.installHadBackendBeforeLocked(request)
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

	restartRequired, err := s.syncInstallRestartStateLocked(request, hadBackendBefore)
	if err != nil {
		return PluginInstallResponse{}, err
	}
	return s.buildInstallResponseLocked(request, restartRequired)
}

func (s *Service) installHadBackendBeforeLocked(request preparedInstall) (bool, error) {
	if request.hasExistingEntry {
		return request.existingEntryBackend, nil
	}
	if request.skipLookupRescan {
		return false, nil
	}

	currentSnapshot, err := s.rescanLocked()
	if err != nil {
		return false, err
	}
	existingEntry := findDiscoveredPlugin(currentSnapshot.Plugins, request.candidate.Manifest.ID, request.scope)
	return existingEntry.PluginID != "" && existingEntry.HasBackend(), nil
}

func (s *Service) syncInstallRestartStateLocked(request preparedInstall, hadBackendBefore bool) (bool, error) {
	restartRequired := request.candidate.Manifest.Backend != nil || hadBackendBefore
	delete(s.pendingRestartRemovedPlugin, request.candidate.Manifest.ID)
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(request.candidate.Manifest.ID); err != nil {
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

func (s *Service) prepareRollbackLocked(options RollbackOptions) (preparedRollback, error) {
	scope, entry, err := s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
	if err != nil {
		return preparedRollback{}, err
	}
	if entry.PluginID != "" {
		if err := ensureSettaManagedForWrite(entry, "rollback"); err != nil {
			return preparedRollback{}, err
		}
	}

	metadata, metadataEntry, err := s.rollbackMetadataEntryLocked(options.PluginID, scope)
	if err != nil {
		return preparedRollback{}, err
	}
	snapshotPath, snapshotManifest, snapshotDigest, err := loadRollbackSnapshot(options.PluginID, metadataEntry)
	if err != nil {
		return preparedRollback{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, options.PluginID)
	if err != nil {
		return preparedRollback{}, err
	}
	return preparedRollback{
		pluginID:               options.PluginID,
		scope:                  scope,
		targetPath:             targetPath,
		snapshotPath:           snapshotPath,
		snapshotManifest:       snapshotManifest,
		snapshotDigest:         snapshotDigest,
		metadata:               metadata,
		metadataEntry:          metadataEntry,
		currentEntryHadBackend: entry.HasBackend(),
	}, nil
}

func (s *Service) rollbackMetadataEntryLocked(pluginID string, scope PluginScope) (PluginInstallMetadataFile, PluginInstallMetadataEntry, error) {
	metadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, err
	}

	metadataEntry, ok := metadata.Entries[metadataKey(scope, pluginID)]
	if ok && SourceSpecIsLocal(metadataEntry.SourceSpec) {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, newServiceError(
			ServiceErrorCodeRollbackUnavailable,
			"Rollback is unavailable for linked local plugins. Unlink and relink the desired local source for %s.",
			pluginID,
		)
	}
	if !ok || len(metadataEntry.History) == 0 {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, newServiceError(
			ServiceErrorCodeRollbackUnavailable,
			"No rollback history exists for plugin: %s",
			pluginID,
		)
	}
	return metadata, metadataEntry, nil
}

func loadRollbackSnapshot(pluginID string, metadataEntry PluginInstallMetadataEntry) (string, PluginManifest, string, error) {
	previous := metadataEntry.History[len(metadataEntry.History)-1]
	snapshotPath := strings.TrimSpace(previous.SnapshotPath)
	if snapshotPath == "" {
		return "", PluginManifest{}, "", missingRollbackSnapshotError(pluginID)
	}
	if _, err := os.Stat(snapshotPath); err != nil {
		if os.IsNotExist(err) {
			return "", PluginManifest{}, "", missingRollbackSnapshotError(pluginID)
		}
		return "", PluginManifest{}, "", fmt.Errorf("stat rollback snapshot %s: %w", snapshotPath, err)
	}

	snapshotManifest, err := LoadPluginManifest(snapshotPath, pluginID)
	if err != nil {
		return "", PluginManifest{}, "", err
	}
	snapshotDigest, err := computeDirectoryDigest(snapshotPath)
	if err != nil {
		return "", PluginManifest{}, "", err
	}
	return snapshotPath, snapshotManifest, snapshotDigest, nil
}

func missingRollbackSnapshotError(pluginID string) error {
	return newServiceError(ServiceErrorCodeRollbackUnavailable, "Rollback snapshot missing for plugin: %s", pluginID)
}

func (s *Service) rollbackPreparedLocked(rollback preparedRollback) (bool, error) {
	if err := s.reserveInstallTargetPathLocked(rollback.targetPath, true); err != nil {
		return false, err
	}
	defer s.releaseInstallTargetPathReservationLocked(rollback.targetPath)

	if err := removePluginTarget(rollback.targetPath); err != nil {
		return false, err
	}
	if err := copyDirectoryTree(rollback.snapshotPath, rollback.targetPath); err != nil {
		return false, err
	}
	if err := s.saveRollbackMetadataLocked(rollback); err != nil {
		return false, err
	}

	restartRequired := rollback.snapshotManifest.Backend != nil || rollback.currentEntryHadBackend
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(rollback.pluginID); err != nil {
			return false, err
		}
		delete(s.pendingRestartRemovedPlugin, rollback.pluginID)
	}
	if _, err := s.rescanLocked(); err != nil {
		return false, err
	}
	return restartRequired, nil
}

func (s *Service) saveRollbackMetadataLocked(rollback preparedRollback) error {
	rollback.metadataEntry.History = append(
		[]PluginInstallHistoryEntry(nil),
		rollback.metadataEntry.History[:len(rollback.metadataEntry.History)-1]...,
	)
	rollback.metadataEntry.Version = rollback.snapshotManifest.Version
	rollback.metadataEntry.SourceDigestSHA256 = stringPtr(rollback.snapshotDigest)
	rollback.metadata.Entries[metadataKey(rollback.scope, rollback.pluginID)] = rollback.metadataEntry
	return s.store.SaveInstallMetadata(rollback.metadata)
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

func pendingRestartLanguageServerOnlyPluginIDs(entries []DiscoveredPlugin, pluginIDs []string) map[string]struct{} {
	if len(entries) == 0 || len(pluginIDs) == 0 {
		return nil
	}

	selected := map[string]struct{}{}
	for _, pluginID := range pluginIDs {
		trimmed := strings.TrimSpace(pluginID)
		if trimmed == "" {
			continue
		}
		selected[trimmed] = struct{}{}
	}
	if len(selected) == 0 {
		return nil
	}

	removable := map[string]struct{}{}
	for _, entry := range entries {
		if entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if _, ok := selected[entry.PluginID]; !ok {
			continue
		}
		if !entryHasLanguageServerOnlyBackendRuntime(entry) {
			continue
		}
		removable[entry.PluginID] = struct{}{}
	}
	if len(removable) == 0 {
		return nil
	}
	return removable
}

func entryHasLanguageServerOnlyBackendRuntime(entry DiscoveredPlugin) bool {
	if !entry.HasBackend() {
		return false
	}

	hasLanguageServer := false
	for _, capability := range entry.EffectiveCapabilities {
		switch capability {
		case "registerLanguageServer":
			hasLanguageServer = true
		case "registerCodegenTarget", "registerListenerEndpoint", "registerMcpTools", "registerRouter", "registerStaticDir":
			return false
		}
	}
	return hasLanguageServer
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
