package app

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

type pluginBackendRuntimeRefresher struct {
	service                                 *plugins.Service
	logger                                  *slog.Logger
	runtimeRoot                             string
	mcpServer                               *mcpx.Server
	settings                                *settingsstate.Runtime
	runtime                                 *pluginBackendMCPRuntime
	lspRouter                               *lsp.Router
	lspSpecs                                []lsp.LanguageServerSpec
	appliedLSPSpecs                         []lsp.LanguageServerSpec
	pendingLanguageServerSelectionPluginIDs []string
	projectState                            *projectstate.Runtime
	projectSync                             projectLSPAdmin
	appSubsystemCapabilities                *appSubsystemCapabilityState
	watchCodeCapabilities                   *watchCodeCapabilityState
	refreshAppHandler                       func() error
	reconcileWatchCodeService               func(context.Context) error

	mu sync.Mutex
}

type pluginBackendRefreshTransition struct {
	nextRuntime                   *pluginBackendMCPRuntime
	nextLSPSpecs                  []lsp.LanguageServerSpec
	nextWatchCodeCapabilities     plugins.PluginWatchCodeCapabilities
	previousRuntime               *pluginBackendMCPRuntime
	previousLSPSpecs              []lsp.LanguageServerSpec
	previousWatchCodeCapabilities plugins.PluginWatchCodeCapabilities
}

type pluginFeatureCapabilityRefreshState struct {
	appSubsystem         *appSubsystemCapabilityState
	previousAppSubsystem plugins.PluginAppSubsystemCapabilities
	nextAppSubsystem     plugins.PluginAppSubsystemCapabilities
	watchCode            *watchCodeCapabilityState
	previousWatchCode    plugins.PluginWatchCodeCapabilities
	nextWatchCode        plugins.PluginWatchCodeCapabilities
}

type pluginMutationRuntimeService struct {
	base                     *plugins.Service
	refresher                *pluginBackendRuntimeRefresher
	appSubsystemCapabilities *appSubsystemCapabilityState
	watchCodeCapabilities    *watchCodeCapabilityState
	watchCodeBackendHost     *watchCodeBackendRouteHost

	opMu                 sync.Mutex
	mu                   sync.RWMutex
	committedSnapshot    plugins.DiscoverySnapshot
	hasCommittedSnapshot bool
}

func newPluginMutationRuntimeService(
	base *plugins.Service,
	refresher *pluginBackendRuntimeRefresher,
	appSubsystemCapabilities *appSubsystemCapabilityState,
	watchCodeCapabilities *watchCodeCapabilityState,
) *pluginMutationRuntimeService {
	service := &pluginMutationRuntimeService{
		base:                     base,
		refresher:                refresher,
		appSubsystemCapabilities: appSubsystemCapabilities,
		watchCodeCapabilities:    watchCodeCapabilities,
	}
	if base != nil {
		if snapshot, err := base.Rescan(); err == nil {
			service.setCommittedSnapshot(snapshot)
			if refresher == nil || refresher.runtime == nil {
				service.syncCapabilitiesFromSnapshot(snapshot)
			}
		}
	}
	return service
}

func (s *pluginMutationRuntimeService) syncCapabilitiesFromRuntimeResponse(
	response plugins.PluginRuntimeResponse,
) {
	if s == nil || response.FeatureCapabilities == nil {
		return
	}
	if s.appSubsystemCapabilities != nil {
		s.appSubsystemCapabilities.Set(response.FeatureCapabilities.AppSubsystem)
	}
	if s.watchCodeCapabilities != nil {
		s.watchCodeCapabilities.Set(response.FeatureCapabilities.WatchCode)
	}
}

func (s *pluginMutationRuntimeService) syncCapabilitiesFromSnapshot(
	snapshot plugins.DiscoverySnapshot,
) {
	if s == nil {
		return
	}
	if s.appSubsystemCapabilities != nil {
		s.appSubsystemCapabilities.SetFromSnapshot(snapshot)
	}
	if s.watchCodeCapabilities != nil {
		s.watchCodeCapabilities.SetFromSnapshot(snapshot)
	}
}

func (s *pluginMutationRuntimeService) commitSnapshot(
	snapshot plugins.DiscoverySnapshot,
) {
	if s == nil {
		return
	}
	s.setCommittedSnapshot(snapshot)
	s.syncCapabilitiesFromSnapshot(snapshot)
}

func (s *pluginMutationRuntimeService) setCommittedSnapshot(
	snapshot plugins.DiscoverySnapshot,
) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.committedSnapshot = snapshot
	s.hasCommittedSnapshot = true
}

func (s *pluginMutationRuntimeService) committedSnapshotView() (plugins.DiscoverySnapshot, bool) {
	if s == nil {
		return plugins.DiscoverySnapshot{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.hasCommittedSnapshot {
		return plugins.DiscoverySnapshot{}, false
	}
	return s.committedSnapshot, true
}

func (s *pluginMutationRuntimeService) currentSnapshot() (plugins.DiscoverySnapshot, error) {
	if snapshot, ok := s.committedSnapshotView(); ok {
		return snapshot, nil
	}
	if s == nil || s.base == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	snapshot, err := s.base.Rescan()
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	s.commitSnapshot(snapshot)
	return snapshot, nil
}

func (r *pluginBackendRuntimeRefresher) SetAppHandlerRefresh(
	refresh func() error,
) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.refreshAppHandler = refresh
}

func (r *pluginBackendRuntimeRefresher) refreshAppHandlerLocked() error {
	if r == nil || r.refreshAppHandler == nil {
		return nil
	}
	return r.refreshAppHandler()
}

func (r *pluginBackendRuntimeRefresher) reconcileWatchCodeServiceLocked(ctx context.Context) error {
	if r == nil || r.reconcileWatchCodeService == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return r.reconcileWatchCodeService(ctx)
}

func (s *pluginMutationRuntimeService) rescanRuntimeToolsWithoutRestart(
	ctx context.Context,
) (plugins.DiscoverySnapshot, error) {
	if s == nil || s.base == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	snapshot, err := s.base.Rescan()
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if s.refresher == nil {
		s.commitSnapshot(snapshot)
		return snapshot, nil
	}
	if err := s.refresher.RescanRuntimeTools(ctx, snapshot); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	s.commitSnapshot(snapshot)
	return snapshot, nil
}

func (s *pluginMutationRuntimeService) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return plugins.PluginRuntimeResponse{}, err
	}
	response, err := s.base.RuntimeFromSnapshot(snapshot, options)
	if err != nil {
		return response, err
	}
	if s.refresher != nil {
		s.refresher.applyAppliedLanguageServerStatus(&response.Status)
		if err := s.refresher.applyLanguageServerSelectionStatuses(&response.Status); err != nil {
			return plugins.PluginRuntimeResponse{}, err
		}
	}
	applyWatchCodeLanguageServerDependencyStatus(&response)
	s.syncCapabilitiesFromRuntimeResponse(response)
	return response, nil
}

func (s *pluginMutationRuntimeService) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return "", err
	}
	return s.base.ResolveAssetPathFromSnapshot(snapshot, pluginID, assetPath)
}

func (s *pluginMutationRuntimeService) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return "", false, err
	}
	return s.base.ResolveRegisteredStaticAssetPathFromSnapshot(snapshot, requestPath)
}

func (s *pluginMutationRuntimeService) LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return plugins.BackendRouteLookup{}, err
	}
	return s.base.LookupRegisteredBackendRouteFromSnapshot(snapshot, method, requestPath)
}

func (s *pluginMutationRuntimeService) DispatchRegisteredBackendRoute(
	ctx context.Context,
	request plugins.BackendHTTPRequest,
) (plugins.BackendHTTPResponse, bool, error) {
	if s.watchCodeBackendHost != nil {
		response, handled := s.watchCodeBackendHost.preflight(request)
		if handled {
			return response, true, nil
		}
	}
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return plugins.BackendHTTPResponse{}, false, err
	}
	response, matched, err := s.base.DispatchRegisteredBackendRouteFromSnapshot(ctx, snapshot, request)
	if err != nil || !matched {
		return response, matched, err
	}
	if s.watchCodeBackendHost != nil {
		if err := s.watchCodeBackendHost.reconcileSuccessfulRoute(ctx, request, response); err != nil {
			return plugins.BackendHTTPResponse{}, true, err
		}
	}
	return response, true, nil
}

func (s *pluginMutationRuntimeService) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return nil, false, err
	}
	return s.base.InvokeRegisteredListenerEndpointFromSnapshot(ctx, snapshot, request)
}

func (s *pluginMutationRuntimeService) Rescan() (plugins.DiscoverySnapshot, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	snapshot, err := s.base.Rescan()
	if err != nil {
		return snapshot, err
	}
	if s.refresher == nil {
		s.commitSnapshot(snapshot)
		return snapshot, nil
	}
	if err := s.refresher.RescanRuntimeTools(context.Background(), snapshot); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	s.commitSnapshot(snapshot)
	return snapshot, nil
}

func (s *pluginMutationRuntimeService) createMutationCheckpoint() (*plugins.MutationCheckpoint, error) {
	if s == nil || s.base == nil || s.refresher == nil {
		return nil, nil
	}
	return s.base.CreateMutationCheckpoint()
}

func (s *pluginMutationRuntimeService) restoreMutationCheckpoint(
	checkpoint *plugins.MutationCheckpoint,
	cause error,
) error {
	if checkpoint == nil || s == nil || s.base == nil {
		return cause
	}
	restoreErr := s.base.RestoreMutationCheckpoint(checkpoint)
	closeErr := checkpoint.Close()
	return errors.Join(cause, restoreErr, closeErr)
}

func closeMutationCheckpoint(checkpoint *plugins.MutationCheckpoint) error {
	if checkpoint == nil {
		return nil
	}
	return checkpoint.Close()
}

func discardMutationCheckpoint(checkpoint *plugins.MutationCheckpoint) {
	_ = closeMutationCheckpoint(checkpoint)
}

func (s *pluginMutationRuntimeService) refreshMutationResult(
	ctx context.Context,
	checkpoint *plugins.MutationCheckpoint,
	restartRequired bool,
) (plugins.DiscoverySnapshot, error) {
	if s.refresher == nil || !restartRequired {
		snapshot, err := s.rescanRuntimeToolsWithoutRestart(ctx)
		if err != nil {
			return plugins.DiscoverySnapshot{}, s.restoreMutationCheckpoint(checkpoint, err)
		}
		discardMutationCheckpoint(checkpoint)
		return snapshot, nil
	}

	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return plugins.DiscoverySnapshot{}, s.restoreMutationCheckpoint(checkpoint, err)
	}
	s.commitSnapshot(snapshot)
	discardMutationCheckpoint(checkpoint)
	return snapshot, nil
}

func applyInstallSnapshot(
	result *plugins.PluginInstallResponse,
	snapshot plugins.DiscoverySnapshot,
) {
	if result == nil {
		return
	}
	if entry, ok := findPluginInScope(snapshot.Plugins, result.PluginID, result.SourceScope); ok {
		result.State = entry.State
		result.Version = entry.Version
		result.SourcePath = entry.SourcePath
		result.SourceDigestSHA256 = cloneOptionalDigest(entry.SourceDigestSHA256)
	}
	result.RestartRequired = false
}

func applyEnableDisableSnapshot(
	result *plugins.PluginEnableDisableResponse,
	snapshot plugins.DiscoverySnapshot,
) {
	if result == nil {
		return
	}
	if entry, ok := plugins.PrimaryDiscoveredPlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
}

func (s *pluginMutationRuntimeService) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginInstallResponse{}, err
	}
	result, err := s.base.Install(ctx, options)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	snapshot, err := s.refreshMutationResult(ctx, checkpoint, result.RestartRequired)
	if err != nil {
		return result, err
	}
	applyInstallSnapshot(&result, snapshot)
	return result, nil
}

func (s *pluginMutationRuntimeService) Link(options plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginInstallResponse{}, err
	}
	result, err := s.base.Link(options)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	snapshot, err := s.refreshMutationResult(context.Background(), checkpoint, result.RestartRequired)
	if err != nil {
		return result, err
	}
	applyInstallSnapshot(&result, snapshot)
	return result, nil
}

func (s *pluginMutationRuntimeService) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginUninstallResponse{}, err
	}
	result, err := s.base.Uninstall(ctx, options)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	if _, err := s.refreshMutationResult(ctx, checkpoint, result.RestartRequired); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}
