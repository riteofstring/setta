package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"slices"
	"strings"
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
	projectSync                             *lsp.ProjectSynchronizer
	appSubsystemCapabilities                *appSubsystemCapabilityState
	watchCodeCapabilities                   *watchCodeCapabilityState
	refreshAppHandler                       func() error
	reconcileWatchCodeService               func(context.Context) error

	mu sync.Mutex
}

type pluginBackendRefreshTransition struct {
	nextRuntime      *pluginBackendMCPRuntime
	nextLSPSpecs     []lsp.LanguageServerSpec
	previousRuntime  *pluginBackendMCPRuntime
	previousLSPSpecs []lsp.LanguageServerSpec
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
		response, handled, err := s.watchCodeBackendHost.intercept(ctx, request)
		if handled || err != nil {
			return response, handled, err
		}
	}
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return plugins.BackendHTTPResponse{}, false, err
	}
	return s.base.DispatchRegisteredBackendRouteFromSnapshot(ctx, snapshot, request)
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

func (s *pluginMutationRuntimeService) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginUpdateResponse{}, err
	}
	result, err := s.base.Update(ctx, options)
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

func (s *pluginMutationRuntimeService) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginRollbackResponse{}, err
	}
	result, err := s.base.Rollback(ctx, options)
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

func (s *pluginMutationRuntimeService) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginEnableDisableResponse{}, err
	}
	result, err := s.base.Enable(ctx, options)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	snapshot, err := s.refreshMutationResult(ctx, checkpoint, result.RestartRequired)
	if err != nil {
		return result, err
	}
	applyEnableDisableSnapshot(&result, snapshot)
	return result, nil
}

func (s *pluginMutationRuntimeService) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginEnableDisableResponse{}, err
	}
	result, err := s.base.Disable(ctx, options)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	snapshot, err := s.refreshMutationResult(ctx, checkpoint, result.RestartRequired)
	if err != nil {
		return result, err
	}
	applyEnableDisableSnapshot(&result, snapshot)
	return result, nil
}

func (s *pluginMutationRuntimeService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	if s.refresher == nil {
		return s.base.WriteConfig(ctx, options)
	}

	previousConfig := plugins.PluginConfigSnapshot{}
	shouldRollbackConfig := s.refresher.hasAppliedPluginLanguageServers(options.PluginID)
	if shouldRollbackConfig {
		currentConfig, err := s.base.CurrentConfigSnapshot(options.PluginID)
		if err != nil {
			return plugins.PluginConfigWriteResponse{}, err
		}
		previousConfig = currentConfig
	}

	result, err := s.base.WriteConfig(ctx, options)
	if err != nil {
		return result, err
	}
	if err := s.refresher.RefreshAppliedPluginLanguageServers(ctx, result.PluginID); err != nil {
		if shouldRollbackConfig {
			if rollbackErr := s.base.RestoreConfig(result.PluginID, previousConfig, result.Config); rollbackErr != nil {
				return result, errors.Join(err, rollbackErr)
			}
		}
		return result, err
	}
	return result, nil
}

func (s *pluginMutationRuntimeService) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return nil, err
	}
	registrations, err := s.base.GetBackendUISettingsFromSnapshot(snapshot, pluginID)
	if err != nil {
		return nil, err
	}
	if !watchCodeProviderCandidateSelected(snapshot, pluginID) {
		return filterUnavailableWatchCodeBackendUISettings(snapshot, pluginID, registrations), nil
	}
	return registrations, nil
}

func (s *pluginMutationRuntimeService) ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return nil, err
	}
	if watchCodeBackendUISettingCandidate(snapshot, options.PluginID, options.HandlerID) {
		if err := watchCodeBackendUISettingAccessError(snapshot, options.PluginID, s.watchCodeBackendHost); err != nil {
			return nil, err
		}
		value, handled, err := s.watchCodeBackendHost.readUISettingValue(options)
		if handled || err != nil {
			return value, err
		}
		return nil, watchCodeProviderUISettingUnavailableError(options.PluginID)
	}
	return s.base.ReadBackendUISettingValueFromSnapshot(ctx, snapshot, options)
}

func (s *pluginMutationRuntimeService) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	snapshot, err := s.currentSnapshot()
	if err != nil {
		return err
	}
	if watchCodeBackendUISettingCandidate(snapshot, options.PluginID, options.HandlerID) {
		if err := watchCodeBackendUISettingAccessError(snapshot, options.PluginID, s.watchCodeBackendHost); err != nil {
			return err
		}
		handled, err := s.watchCodeBackendHost.writeUISettingValue(ctx, options)
		if handled || err != nil {
			return err
		}
		return watchCodeProviderUISettingUnavailableError(options.PluginID)
	}
	return s.base.WriteBackendUISettingValueFromSnapshot(ctx, snapshot, options)
}

func (s *pluginMutationRuntimeService) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	return s.base.WriteLockfile()
}

func (s *pluginMutationRuntimeService) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResponse, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	checkpoint, err := s.createMutationCheckpoint()
	if err != nil {
		return plugins.PluginLockApplyResponse{}, err
	}
	result, err := s.base.ApplyLockfile(ctx, check)
	if err != nil {
		discardMutationCheckpoint(checkpoint)
		return result, err
	}
	if s.refresher == nil || !result.Applied || check {
		if result.Applied && !check {
			if _, err := s.refreshMutationResult(ctx, checkpoint, false); err != nil {
				return result, err
			}
			return result, nil
		}
		discardMutationCheckpoint(checkpoint)
		return result, nil
	}
	if _, err := s.refreshMutationResult(ctx, checkpoint, true); err != nil {
		return result, err
	}
	return result, nil
}

func (s *pluginMutationRuntimeService) Restart(ctx context.Context) (plugins.PluginRestartResponse, error) {
	return s.base.Restart(ctx)
}

func (r *pluginBackendRuntimeRefresher) Initialize(ctx context.Context) error {
	if r == nil || r.service == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	nextRuntime, nextLSPSpecs, err := r.prepareInitializeRuntimeLocked(ctx)
	if err != nil {
		return err
	}
	return r.commitInitializedRuntimeLocked(ctx, nextRuntime, nextLSPSpecs)
}

func (r *pluginBackendRuntimeRefresher) prepareInitializeRuntimeLocked(
	ctx context.Context,
) (*pluginBackendMCPRuntime, []lsp.LanguageServerSpec, error) {
	snapshot, err := r.service.Rescan()
	if err != nil {
		return nil, nil, err
	}
	if r.appSubsystemCapabilities != nil {
		r.appSubsystemCapabilities.SetFromSnapshot(snapshot)
	}
	if r.watchCodeCapabilities != nil {
		r.watchCodeCapabilities.SetFromSnapshot(snapshot)
	}
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(snapshot, false)
	if err != nil {
		return nil, nil, err
	}
	nextRuntime, err := r.buildRuntimeLocked(ctx, snapshot)
	if err != nil {
		return nil, nil, err
	}
	return nextRuntime, nextLSPSpecs, nil
}

func (r *pluginBackendRuntimeRefresher) commitInitializedRuntimeLocked(
	ctx context.Context,
	nextRuntime *pluginBackendMCPRuntime,
	nextLSPSpecs []lsp.LanguageServerSpec,
) error {
	if err := r.replaceRuntimeToolsLocked(nil, nextRuntime); err != nil {
		_ = nextRuntime.Close(context.Background())
		return err
	}
	if err := r.replaceLSPSpecsLocked(ctx, nil, nextLSPSpecs); err != nil {
		if rollbackErr := r.replaceRuntimeToolsLocked(nextRuntime, nil); rollbackErr != nil && r.logger != nil {
			r.logger.Error("rollback plugin backend MCP tools after LSP initialization failure", "error", rollbackErr)
		}
		_ = nextRuntime.Close(context.Background())
		return err
	}
	r.runtime = nextRuntime
	r.lspSpecs = cloneLanguageServerSpecs(nextLSPSpecs)
	r.appliedLSPSpecs = cloneLanguageServerSpecs(nextLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	if err := r.reconcileWatchCodeServiceLocked(ctx); err != nil {
		return err
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) Refresh(ctx context.Context) (plugins.DiscoverySnapshot, error) {
	if r == nil || r.service == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	transition, err := r.prepareRefreshTransitionLocked(ctx)
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if err := r.applyRefreshTransitionLocked(ctx, transition); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if err := r.reconcileProjectDocumentLocked(ctx, transition.previousLSPSpecs, transition.nextLSPSpecs); err != nil {
		return plugins.DiscoverySnapshot{}, errors.Join(
			err,
			r.rollbackRefreshTransitionLocked(transition),
		)
	}
	return r.commitRefreshTransitionLocked(transition)
}

func (r *pluginBackendRuntimeRefresher) RescanRuntimeTools(ctx context.Context, snapshot plugins.DiscoverySnapshot) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	capabilities := r.captureFeatureCapabilityRefreshState(snapshot)
	nextRuntime, err := r.buildRuntimeLocked(ctx, snapshot)
	if err != nil {
		return err
	}
	previousRuntime := r.runtime
	if err := r.replaceRuntimeToolsLocked(previousRuntime, nextRuntime); err != nil {
		closePluginBackendRuntime(nextRuntime)
		return err
	}
	r.runtime = nextRuntime
	capabilities.applyNext()
	if err := r.refreshAppHandlerLocked(); err != nil {
		capabilities.rollback()
		r.runtime = previousRuntime
		rollbackErr := r.replaceRuntimeToolsLocked(nextRuntime, previousRuntime)
		closePluginBackendRuntime(nextRuntime)
		return errors.Join(err, rollbackErr)
	}
	if err := r.reconcileWatchCodeServiceLocked(ctx); err != nil {
		capabilities.rollback()
		r.runtime = previousRuntime
		rollbackErr := r.replaceRuntimeToolsLocked(nextRuntime, previousRuntime)
		restoreHandlerErr := r.refreshAppHandlerLocked()
		restoreWatchErr := r.reconcileWatchCodeServiceLocked(ctx)
		closePluginBackendRuntime(nextRuntime)
		return errors.Join(err, rollbackErr, restoreHandlerErr, restoreWatchErr)
	}
	closePluginBackendRuntime(previousRuntime)
	return nil
}

func (r *pluginBackendRuntimeRefresher) captureFeatureCapabilityRefreshState(
	snapshot plugins.DiscoverySnapshot,
) pluginFeatureCapabilityRefreshState {
	state := pluginFeatureCapabilityRefreshState{
		appSubsystem: r.appSubsystemCapabilities,
		watchCode:    r.watchCodeCapabilities,
	}
	if state.appSubsystem != nil {
		state.previousAppSubsystem = state.appSubsystem.AppSubsystemCapabilities()
		state.nextAppSubsystem = plugins.AppSubsystemCapabilitiesFromSnapshot(snapshot)
	}
	if state.watchCode != nil {
		state.previousWatchCode = state.watchCode.WatchCodeCapabilities()
		state.nextWatchCode = plugins.WatchCodeCapabilitiesFromSnapshot(snapshot)
	}
	return state
}

func (s pluginFeatureCapabilityRefreshState) applyNext() {
	if s.appSubsystem != nil {
		s.appSubsystem.Set(s.nextAppSubsystem)
	}
	if s.watchCode != nil {
		s.watchCode.Set(s.nextWatchCode)
	}
}

func (s pluginFeatureCapabilityRefreshState) rollback() {
	if s.appSubsystem != nil {
		s.appSubsystem.Set(s.previousAppSubsystem)
	}
	if s.watchCode != nil {
		s.watchCode.Set(s.previousWatchCode)
	}
}

func (r *pluginBackendRuntimeRefresher) RefreshLanguageServers(ctx context.Context) error {
	return r.refreshLanguageServers(ctx, "")
}

func (r *pluginBackendRuntimeRefresher) RefreshAppliedPluginLanguageServers(ctx context.Context, pluginID string) error {
	return r.refreshLanguageServers(ctx, pluginID)
}

func (r *pluginBackendRuntimeRefresher) refreshLanguageServers(ctx context.Context, appliedPluginID string) error {
	if r == nil || r.service == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	trimmedPluginID := strings.TrimSpace(appliedPluginID)

	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.shouldRefreshLanguageServersLocked(trimmedPluginID) {
		return nil
	}
	nextLSPSpecs, selectedPluginIDs, err := r.nextRefreshedLanguageServerSpecsLocked(trimmedPluginID)
	if err != nil {
		return err
	}
	return r.applyLanguageServerRefreshLocked(ctx, trimmedPluginID, nextLSPSpecs, selectedPluginIDs)
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerRefreshLocked(
	snapshot plugins.DiscoverySnapshot,
) ([]lsp.LanguageServerSpec, []string, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, nil, err
	}
	selectedLSPSpecs, err := r.languageServerSpecsForSelections(snapshot, selections, true)
	if err != nil {
		return nil, nil, err
	}
	return selectedLSPSpecs, selectedLanguageServerPluginIDsFromSelections(selections), nil
}

func (r *pluginBackendRuntimeRefresher) shouldRefreshLanguageServersLocked(pluginID string) bool {
	return pluginID == "" || r.pluginHasAppliedLanguageServersLocked(pluginID)
}

func (r *pluginBackendRuntimeRefresher) nextRefreshedLanguageServerSpecsLocked(
	trimmedPluginID string,
) ([]lsp.LanguageServerSpec, []string, error) {
	snapshot, err := r.service.Rescan()
	if err != nil {
		return nil, nil, err
	}
	selectedLSPSpecs, selectedPluginIDs, err := r.selectedLanguageServerRefreshLocked(snapshot)
	if err != nil {
		return nil, nil, err
	}
	if trimmedPluginID == "" {
		return selectedLSPSpecs, selectedPluginIDs, nil
	}
	return refreshedAppliedLanguageServerSpecs(r.appliedLSPSpecs, selectedLSPSpecs, trimmedPluginID), selectedPluginIDs, nil
}

func (r *pluginBackendRuntimeRefresher) applyLanguageServerRefreshLocked(
	ctx context.Context,
	trimmedPluginID string,
	nextLSPSpecs []lsp.LanguageServerSpec,
	selectedPluginIDs []string,
) error {
	previousLSPSpecs := cloneLanguageServerSpecs(r.lspSpecs)
	if err := r.replaceLSPSpecsLocked(ctx, previousLSPSpecs, nextLSPSpecs); err != nil {
		return err
	}
	if err := r.reconcileAppliedPluginLanguageServerRefreshLocked(ctx, trimmedPluginID, previousLSPSpecs, nextLSPSpecs); err != nil {
		return err
	}
	r.lspSpecs = cloneLanguageServerSpecs(nextLSPSpecs)
	if trimmedPluginID == "" {
		r.pendingLanguageServerSelectionPluginIDs = selectedPluginIDs
		return nil
	}
	r.appliedLSPSpecs = cloneLanguageServerSpecs(nextLSPSpecs)
	return nil
}

func (r *pluginBackendRuntimeRefresher) prepareRefreshTransitionLocked(ctx context.Context) (*pluginBackendRefreshTransition, error) {
	previewSnapshot, err := r.service.PreviewBackendRuntimeRefresh()
	if err != nil {
		return nil, err
	}

	nextRuntime, err := r.buildRuntimeLocked(ctx, previewSnapshot)
	if err != nil {
		return nil, err
	}
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(previewSnapshot, true)
	if err != nil {
		closePluginBackendRuntime(nextRuntime)
		return nil, err
	}
	return &pluginBackendRefreshTransition{
		nextRuntime:      nextRuntime,
		nextLSPSpecs:     nextLSPSpecs,
		previousRuntime:  r.runtime,
		previousLSPSpecs: cloneLanguageServerSpecs(r.lspSpecs),
	}, nil
}

func (r *pluginBackendRuntimeRefresher) applyRefreshTransitionLocked(
	ctx context.Context,
	transition *pluginBackendRefreshTransition,
) error {
	if err := r.replaceRuntimeToolsLocked(transition.previousRuntime, transition.nextRuntime); err != nil {
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	if err := r.replaceLSPSpecsLocked(ctx, transition.previousLSPSpecs, transition.nextLSPSpecs); err != nil {
		r.logPluginBackendRuntimeError(
			"rollback plugin backend MCP tools after LSP refresh failure",
			r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime),
		)
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	r.runtime = transition.nextRuntime
	return nil
}

func (r *pluginBackendRuntimeRefresher) commitRefreshTransitionLocked(
	transition *pluginBackendRefreshTransition,
) (plugins.DiscoverySnapshot, error) {
	previousRefreshState, err := r.service.BackendRuntimeRefreshState()
	if err != nil {
		return plugins.DiscoverySnapshot{}, errors.Join(
			err,
			r.rollbackRefreshTransitionLocked(transition),
		)
	}
	committedSnapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	if commitErr != nil {
		return committedSnapshot, errors.Join(
			commitErr,
			r.rollbackRefreshTransitionLocked(transition),
		)
	}
	previousCapabilities := plugins.PluginAppSubsystemCapabilities{}
	if r.appSubsystemCapabilities != nil {
		previousCapabilities = r.appSubsystemCapabilities.AppSubsystemCapabilities()
		r.appSubsystemCapabilities.SetFromSnapshot(committedSnapshot)
	}
	previousWatchCodeCapabilities := plugins.PluginWatchCodeCapabilities{}
	if r.watchCodeCapabilities != nil {
		previousWatchCodeCapabilities = r.watchCodeCapabilities.WatchCodeCapabilities()
		r.watchCodeCapabilities.SetFromSnapshot(committedSnapshot)
	}
	if err := r.refreshAppHandlerLocked(); err != nil {
		if r.appSubsystemCapabilities != nil {
			r.appSubsystemCapabilities.Set(previousCapabilities)
		}
		if r.watchCodeCapabilities != nil {
			r.watchCodeCapabilities.Set(previousWatchCodeCapabilities)
		}
		rollbackErr := r.rollbackRefreshTransitionLocked(transition)
		restoreErr := r.service.RestoreBackendRuntimeRefreshState(
			previousRefreshState,
		)
		return committedSnapshot, errors.Join(err, rollbackErr, restoreErr)
	}
	if err := r.reconcileWatchCodeServiceLocked(context.Background()); err != nil {
		if r.appSubsystemCapabilities != nil {
			r.appSubsystemCapabilities.Set(previousCapabilities)
		}
		if r.watchCodeCapabilities != nil {
			r.watchCodeCapabilities.Set(previousWatchCodeCapabilities)
		}
		restoreHandlerErr := r.refreshAppHandlerLocked()
		restoreWatchErr := r.reconcileWatchCodeServiceLocked(context.Background())
		rollbackErr := r.rollbackRefreshTransitionLocked(transition)
		restoreErr := r.service.RestoreBackendRuntimeRefreshState(
			previousRefreshState,
		)
		return committedSnapshot, errors.Join(err, restoreHandlerErr, restoreWatchErr, rollbackErr, restoreErr)
	}

	r.lspSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.appliedLSPSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	closePluginBackendRuntime(transition.previousRuntime)
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) rollbackRefreshTransitionLocked(
	transition *pluginBackendRefreshTransition,
) error {
	var rollbackErr error
	r.logPluginBackendRuntimeError(
		"rollback plugin backend MCP tools failed",
		func() error {
			err := r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime)
			rollbackErr = errors.Join(rollbackErr, err)
			return err
		}(),
	)
	r.logPluginBackendRuntimeError(
		"rollback plugin backend language servers failed",
		func() error {
			err := r.replaceLSPSpecsLocked(context.Background(), transition.nextLSPSpecs, transition.previousLSPSpecs)
			rollbackErr = errors.Join(rollbackErr, err)
			return err
		}(),
	)
	r.runtime = transition.previousRuntime
	r.lspSpecs = transition.previousLSPSpecs
	r.appliedLSPSpecs = cloneLanguageServerSpecs(transition.previousLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	r.logPluginBackendRuntimeError(
		"rollback plugin backend project reconciliation failed",
		func() error {
			err := r.reconcileProjectDocumentLocked(context.Background(), transition.nextLSPSpecs, transition.previousLSPSpecs)
			rollbackErr = errors.Join(rollbackErr, err)
			return err
		}(),
	)
	closePluginBackendRuntime(transition.nextRuntime)
	return rollbackErr
}

func (r *pluginBackendRuntimeRefresher) Close(ctx context.Context) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.runtime == nil {
		return nil
	}
	runtime := r.runtime
	r.runtime = nil
	return runtime.Close(ctx)
}

func (r *pluginBackendRuntimeRefresher) HasConfiguredLanguageServers() bool {
	if r == nil {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	return len(r.lspSpecs) != 0
}

func (r *pluginBackendRuntimeRefresher) RollbackLanguageServers(ctx context.Context) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	previousLSPSpecs := cloneLanguageServerSpecs(r.lspSpecs)
	nextLSPSpecs := cloneLanguageServerSpecs(r.appliedLSPSpecs)
	if languageServerSpecSlicesEqual(previousLSPSpecs, nextLSPSpecs) {
		return nil
	}
	if err := r.replaceLSPSpecsLocked(ctx, previousLSPSpecs, nextLSPSpecs); err != nil {
		return err
	}
	r.lspSpecs = cloneLanguageServerSpecs(nextLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	return nil
}

func (r *pluginBackendRuntimeRefresher) CommitAppliedLanguageServerPlugins(_ context.Context) error {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	previousLSPSpecs := cloneLanguageServerSpecs(r.appliedLSPSpecs)
	nextAppliedLSPSpecs := cloneLanguageServerSpecs(r.lspSpecs)
	service := r.service
	allAppliedSpecs := make([]lsp.LanguageServerSpec, 0, len(previousLSPSpecs)+len(nextAppliedLSPSpecs))
	allAppliedSpecs = append(allAppliedSpecs, previousLSPSpecs...)
	allAppliedSpecs = append(allAppliedSpecs, nextAppliedLSPSpecs...)
	pluginIDs := mergeUniqueSortedStrings(
		appliedLanguageServerPluginIDs(allAppliedSpecs),
		r.pendingLanguageServerSelectionPluginIDs,
	)
	if len(pluginIDs) != 0 && service != nil {
		if err := service.CommitAppliedLanguageServerPlugins(pluginIDs); err != nil {
			return err
		}
	}

	r.appliedLSPSpecs = nextAppliedLSPSpecs
	r.pendingLanguageServerSelectionPluginIDs = nil
	return nil
}

func (r *pluginBackendRuntimeRefresher) applyAppliedLanguageServerStatus(status *plugins.PluginStatusResponse) {
	if r == nil || status == nil {
		return
	}

	r.mu.Lock()
	appliedByPlugin := appliedLanguageServerStatusesByPlugin(r.appliedLSPSpecs)
	r.mu.Unlock()
	if len(appliedByPlugin) == 0 {
		return
	}

	status.Plugins = appliedLanguageServerStatusEntries(status.Plugins, appliedByPlugin)
}

type appliedLanguageServerStatus struct {
	spec      lsp.LanguageServerSpec
	languages []string
}

func appliedLanguageServerStatusEntries(
	entries []plugins.PluginStatusEntry,
	appliedByPlugin map[string]appliedLanguageServerStatus,
) []plugins.PluginStatusEntry {
	if len(entries) == 0 && len(appliedByPlugin) == 0 {
		return nil
	}

	output := make([]plugins.PluginStatusEntry, 0, len(entries)+len(appliedByPlugin))
	for index := 0; index < len(entries); {
		groupStart := index
		pluginID := entries[index].PluginID
		for index < len(entries) && entries[index].PluginID == pluginID {
			index++
		}
		group := append([]plugins.PluginStatusEntry(nil), entries[groupStart:index]...)
		applied, ok := appliedByPlugin[pluginID]
		if !ok {
			output = append(output, group...)
			continue
		}
		if matchedIndex := matchingAppliedLanguageServerStatusIndex(group, applied); matchedIndex >= 0 {
			group[matchedIndex].AppliedLanguageServerLanguages = append([]string(nil), applied.languages...)
			group = movePluginStatusEntryToFront(group, matchedIndex)
		} else {
			output = append(output, missingAppliedLanguageServerStatusEntry(pluginID, applied.languages))
		}
		output = append(output, group...)
		delete(appliedByPlugin, pluginID)
	}
	return appendMissingAppliedLanguageServerStatuses(output, appliedByPlugin)
}

func matchingAppliedLanguageServerStatusIndex(
	group []plugins.PluginStatusEntry,
	applied appliedLanguageServerStatus,
) int {
	for index := range group {
		if languageServerSpecMatchesStatusEntry(applied.spec, group[index]) {
			return index
		}
	}
	return -1
}

func appendMissingAppliedLanguageServerStatuses(
	output []plugins.PluginStatusEntry,
	appliedByPlugin map[string]appliedLanguageServerStatus,
) []plugins.PluginStatusEntry {
	if len(appliedByPlugin) == 0 {
		return output
	}
	pluginIDs := make([]string, 0, len(appliedByPlugin))
	for pluginID := range appliedByPlugin {
		pluginIDs = append(pluginIDs, pluginID)
	}
	for _, pluginID := range uniqueSortedStrings(pluginIDs) {
		applied := appliedByPlugin[pluginID]
		output = append(output, missingAppliedLanguageServerStatusEntry(pluginID, applied.languages))
	}
	return output
}

func movePluginStatusEntryToFront(entries []plugins.PluginStatusEntry, index int) []plugins.PluginStatusEntry {
	if index <= 0 || index >= len(entries) {
		return entries
	}
	moved := entries[index]
	output := make([]plugins.PluginStatusEntry, 0, len(entries))
	output = append(output, moved)
	output = append(output, entries[:index]...)
	output = append(output, entries[index+1:]...)
	return output
}

func missingAppliedLanguageServerStatusEntry(pluginID string, languages []string) plugins.PluginStatusEntry {
	trimmedPluginID := strings.TrimSpace(pluginID)
	return plugins.PluginStatusEntry{
		PluginID:                       trimmedPluginID,
		Name:                           trimmedPluginID,
		State:                          plugins.PluginRuntimeStateInvalid,
		AppliedLanguageServerLanguages: append([]string(nil), languages...),
		RestartRequired:                true,
		Errors: []plugins.PluginErrorInfo{
			{
				Code:    "applied_language_server_plugin_missing",
				Message: "Plugin is no longer discovered, but its language server remains applied until restart.",
			},
		},
	}
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerSpecs(
	snapshot plugins.DiscoverySnapshot,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, err
	}
	return r.languageServerSpecsForSelections(snapshot, selections, includePendingLanguageServerOnly)
}

func (r *pluginBackendRuntimeRefresher) reconcileAppliedPluginLanguageServerRefreshLocked(
	ctx context.Context,
	appliedPluginID string,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
) error {
	if strings.TrimSpace(appliedPluginID) == "" {
		return nil
	}
	if err := r.reconcileProjectDocumentLocked(ctx, previous, next); err != nil {
		r.logPluginBackendRuntimeError(
			"rollback plugin backend language servers after config refresh failure",
			r.replaceLSPSpecsLocked(context.Background(), next, previous),
		)
		r.logPluginBackendRuntimeError(
			"rollback plugin backend project reconciliation after config refresh failure",
			r.reconcileProjectDocumentLocked(context.Background(), next, previous),
		)
		return err
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerPlugins() (map[string]*string, error) {
	if r == nil || r.settings == nil {
		return map[string]*string{}, nil
	}
	return settingsstate.LanguageServerSelectedByLanguage(r.settings.Snapshot().Document)
}

func (r *pluginBackendRuntimeRefresher) languageServerSpecsForSelections(
	snapshot plugins.DiscoverySnapshot,
	selections map[string]*string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	if includePendingLanguageServerOnly {
		return r.service.LanguageServerSpecsForSnapshot(snapshot, selections)
	}
	return r.service.ActiveLanguageServerSpecsForSnapshot(snapshot, selections)
}

func (r *pluginBackendRuntimeRefresher) buildRuntimeLocked(ctx context.Context, snapshot plugins.DiscoverySnapshot) (*pluginBackendMCPRuntime, error) {
	return newPluginBackendMCPRuntime(ctx, pluginBackendMCPRuntimeOptions{
		Logger:                 r.logger,
		RuntimeRoot:            r.runtimeRoot,
		Snapshot:               snapshot,
		ProjectRuntime:         r.projectState,
		BackendListenerInvoker: r.service,
	})
}

func (r *pluginBackendRuntimeRefresher) replaceRuntimeToolsLocked(previous *pluginBackendMCPRuntime, next *pluginBackendMCPRuntime) error {
	if r == nil || r.mcpServer == nil {
		return nil
	}

	removeNames := []string{}
	if previous != nil {
		removeNames = append(removeNames, previous.toolNames...)
	}

	nextRegistrations := []mcpx.ToolRegistration{}
	if next != nil {
		nextRegistrations = append(nextRegistrations, next.registrations...)
	}
	if err := r.mcpServer.ReplaceTools(removeNames, nextRegistrations); err != nil {
		return fmt.Errorf("replace plugin backend MCP tools: %w", err)
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) replaceLSPSpecsLocked(
	ctx context.Context,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
) error {
	if r == nil || r.lspRouter == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := r.lspRouter.ReplaceAdditionalSpecs(ctx, next); err != nil {
		rollbackCtx := context.Background()
		if rollbackErr := r.lspRouter.ReplaceAdditionalSpecs(rollbackCtx, previous); rollbackErr != nil && r.logger != nil {
			r.logger.Error("rollback plugin backend language servers after refresh failure", "error", rollbackErr)
		}
		return fmt.Errorf("replace plugin backend language servers: %w", err)
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) logPluginBackendRuntimeError(message string, err error) {
	if err == nil || r == nil || r.logger == nil {
		return
	}
	r.logger.Error(message, "error", err)
}

func (r *pluginBackendRuntimeRefresher) reconcileProjectDocumentLocked(
	ctx context.Context,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
) error {
	if r == nil || r.projectState == nil || r.projectSync == nil {
		return nil
	}
	if languageServerSpecSlicesEqual(previous, next) {
		return nil
	}
	snapshot := r.projectState.Snapshot()
	return r.projectSync.Restart(ctx, snapshot.Document)
}

func (r *pluginBackendRuntimeRefresher) pluginHasAppliedLanguageServersLocked(pluginID string) bool {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	for _, spec := range r.appliedLSPSpecs {
		if strings.TrimSpace(spec.PluginID) == trimmedPluginID {
			return true
		}
	}
	return false
}

func (r *pluginBackendRuntimeRefresher) hasAppliedPluginLanguageServers(pluginID string) bool {
	if r == nil {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	return r.pluginHasAppliedLanguageServersLocked(pluginID)
}

func findPluginInScope(entries []plugins.DiscoveredPlugin, pluginID string, scope plugins.PluginScope) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry, true
		}
	}
	return plugins.DiscoveredPlugin{}, false
}

func cloneOptionalDigest(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func cloneLanguageServerSpecs(specs []lsp.LanguageServerSpec) []lsp.LanguageServerSpec {
	if len(specs) == 0 {
		return nil
	}
	cloned := make([]lsp.LanguageServerSpec, 0, len(specs))
	for _, spec := range specs {
		cloned = append(cloned, lsp.LanguageServerSpec{
			PluginID:                 spec.PluginID,
			Name:                     spec.Name,
			LanguageID:               spec.LanguageID,
			Command:                  spec.Command,
			Args:                     append([]string(nil), spec.Args...),
			Environment:              clonePluginLanguageServerEnvironment(spec.Environment),
			Settings:                 clonePluginLanguageServerSettings(spec.Settings),
			SettingsKey:              cloneOptionalString(spec.SettingsKey),
			PluginSourceScope:        spec.PluginSourceScope,
			PluginSourceManager:      spec.PluginSourceManager,
			PluginCanonicalSourceKey: spec.PluginCanonicalSourceKey,
			PluginSourcePath:         spec.PluginSourcePath,
			PluginSourceDigestSHA256: cloneOptionalString(spec.PluginSourceDigestSHA256),
		})
	}
	return cloned
}

func languageServerSpecSlicesEqual(left []lsp.LanguageServerSpec, right []lsp.LanguageServerSpec) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !lspLanguageServerSpecsEqual(left[index], right[index]) {
			return false
		}
	}
	return true
}

func lspLanguageServerSpecsEqual(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	if !lspLanguageServerSpecScalarFieldsEqual(left, right) {
		return false
	}
	if !slices.Equal(left.Args, right.Args) {
		return false
	}
	if !languageServerEnvironmentEqual(left.Environment, right.Environment) {
		return false
	}
	if !languageServerSettingsEqual(left.Settings, right.Settings) {
		return false
	}
	return optionalStringPointersEqual(left.SettingsKey, right.SettingsKey) &&
		optionalStringPointersEqual(left.PluginSourceDigestSHA256, right.PluginSourceDigestSHA256)
}

func lspLanguageServerSpecScalarFieldsEqual(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	return left.PluginID == right.PluginID &&
		left.Name == right.Name &&
		left.LanguageID == right.LanguageID &&
		left.Command == right.Command &&
		left.PluginSourceScope == right.PluginSourceScope &&
		left.PluginSourceManager == right.PluginSourceManager &&
		left.PluginCanonicalSourceKey == right.PluginCanonicalSourceKey &&
		left.PluginSourcePath == right.PluginSourcePath
}

func clonePluginLanguageServerEnvironment(source map[string]string) map[string]string {
	if source == nil {
		return nil
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		normalizedKey := strings.TrimSpace(key)
		if normalizedKey == "" {
			continue
		}
		cloned[normalizedKey] = value
	}
	if len(cloned) == 0 {
		return nil
	}
	return cloned
}

func languageServerEnvironmentEqual(left map[string]string, right map[string]string) bool {
	return reflect.DeepEqual(
		clonePluginLanguageServerEnvironment(left),
		clonePluginLanguageServerEnvironment(right),
	)
}

func languageServerSettingsEqual(left map[string]any, right map[string]any) bool {
	return reflect.DeepEqual(
		clonePluginLanguageServerSettings(left),
		clonePluginLanguageServerSettings(right),
	)
}

func optionalStringPointersEqual(left *string, right *string) bool {
	switch {
	case left == nil && right == nil:
		return true
	case left == nil || right == nil:
		return false
	default:
		return *left == *right
	}
}

func selectedLanguageServerPluginIDsFromSelections(selections map[string]*string) []string {
	selectedPluginIDs := make([]string, 0, len(selections))
	for _, pluginID := range selections {
		if pluginID == nil {
			continue
		}
		selectedPluginIDs = append(selectedPluginIDs, *pluginID)
	}
	return uniqueSortedStrings(selectedPluginIDs)
}

func appliedLanguageServerLanguagesByPlugin(specs []lsp.LanguageServerSpec) map[string][]string {
	if len(specs) == 0 {
		return nil
	}
	byPlugin := map[string][]string{}
	for _, spec := range specs {
		pluginID := strings.TrimSpace(spec.PluginID)
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if pluginID == "" || languageID == "" {
			continue
		}
		if slices.Contains(byPlugin[pluginID], languageID) {
			continue
		}
		byPlugin[pluginID] = append(byPlugin[pluginID], languageID)
	}
	for pluginID := range byPlugin {
		slices.Sort(byPlugin[pluginID])
	}
	return byPlugin
}

func appliedLanguageServerPluginIDs(specs []lsp.LanguageServerSpec) []string {
	byPlugin := appliedLanguageServerLanguagesByPlugin(specs)
	if len(byPlugin) == 0 {
		return nil
	}

	pluginIDs := make([]string, 0, len(byPlugin))
	for pluginID := range byPlugin {
		pluginIDs = append(pluginIDs, pluginID)
	}
	slices.Sort(pluginIDs)
	return pluginIDs
}

func mergeUniqueSortedStrings(values ...[]string) []string {
	merged := make([]string, 0)
	for _, entries := range values {
		merged = append(merged, entries...)
	}
	return uniqueSortedStrings(merged)
}

func uniqueSortedStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	set := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := set[trimmed]; ok {
			continue
		}
		set[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return nil
	}
	slices.Sort(normalized)
	return normalized
}

func refreshedAppliedLanguageServerSpecs(
	applied []lsp.LanguageServerSpec,
	selected []lsp.LanguageServerSpec,
	pluginID string,
) []lsp.LanguageServerSpec {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return cloneLanguageServerSpecs(applied)
	}

	selectedByLanguage := map[string]lsp.LanguageServerSpec{}
	for _, spec := range selected {
		if strings.TrimSpace(spec.PluginID) != trimmedPluginID {
			continue
		}
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if languageID == "" {
			continue
		}
		selectedByLanguage[languageID] = spec
	}

	next := make([]lsp.LanguageServerSpec, 0, len(applied))
	for _, spec := range applied {
		specPluginID := strings.TrimSpace(spec.PluginID)
		if specPluginID != trimmedPluginID {
			next = append(next, spec)
			continue
		}
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		updated, ok := selectedByLanguage[languageID]
		if !ok || !languageServerSpecsShareImplementation(spec, updated) {
			next = append(next, spec)
			continue
		}
		next = append(next, updated)
	}
	return next
}

func appliedLanguageServerStatusesByPlugin(specs []lsp.LanguageServerSpec) map[string]appliedLanguageServerStatus {
	if len(specs) == 0 {
		return nil
	}
	byPlugin := map[string]appliedLanguageServerStatus{}
	for _, spec := range specs {
		pluginID := strings.TrimSpace(spec.PluginID)
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if pluginID == "" || languageID == "" {
			continue
		}
		applied := byPlugin[pluginID]
		if strings.TrimSpace(applied.spec.PluginID) == "" {
			applied.spec = spec
		}
		if slices.Contains(applied.languages, languageID) {
			byPlugin[pluginID] = applied
			continue
		}
		applied.languages = append(applied.languages, languageID)
		slices.Sort(applied.languages)
		byPlugin[pluginID] = applied
	}
	if len(byPlugin) == 0 {
		return nil
	}
	return byPlugin
}

func languageServerSpecsShareImplementation(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	if strings.TrimSpace(left.PluginID) != strings.TrimSpace(right.PluginID) {
		return false
	}
	if !languageServerSpecHasImplementationMetadata(left) || !languageServerSpecHasImplementationMetadata(right) {
		return true
	}
	return strings.TrimSpace(left.PluginSourceScope) == strings.TrimSpace(right.PluginSourceScope) &&
		strings.TrimSpace(left.PluginSourceManager) == strings.TrimSpace(right.PluginSourceManager) &&
		strings.TrimSpace(left.PluginCanonicalSourceKey) == strings.TrimSpace(right.PluginCanonicalSourceKey) &&
		strings.TrimSpace(left.PluginSourcePath) == strings.TrimSpace(right.PluginSourcePath)
}

func languageServerSpecMatchesStatusEntry(spec lsp.LanguageServerSpec, entry plugins.PluginStatusEntry) bool {
	if strings.TrimSpace(spec.PluginID) != strings.TrimSpace(entry.PluginID) {
		return false
	}
	if !languageServerSpecHasImplementationMetadata(spec) {
		return true
	}
	return strings.TrimSpace(spec.PluginSourceScope) == strings.TrimSpace(string(entry.SourceScope)) &&
		strings.TrimSpace(spec.PluginSourceManager) == strings.TrimSpace(string(entry.SourceManager)) &&
		strings.TrimSpace(spec.PluginCanonicalSourceKey) == strings.TrimSpace(entry.CanonicalSourceKey) &&
		strings.TrimSpace(spec.PluginSourcePath) == strings.TrimSpace(entry.SourcePath)
}

func languageServerSpecHasImplementationMetadata(spec lsp.LanguageServerSpec) bool {
	return strings.TrimSpace(spec.PluginSourceScope) != "" ||
		strings.TrimSpace(spec.PluginSourceManager) != "" ||
		strings.TrimSpace(spec.PluginCanonicalSourceKey) != "" ||
		strings.TrimSpace(spec.PluginSourcePath) != "" ||
		spec.PluginSourceDigestSHA256 != nil
}

func clonePluginLanguageServerSettings(settings map[string]any) map[string]any {
	if settings == nil {
		return nil
	}
	payload, err := json.Marshal(settings)
	if err != nil {
		return nil
	}
	var cloned map[string]any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return nil
	}
	return cloned
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func closePluginBackendRuntime(runtime *pluginBackendMCPRuntime) {
	if runtime == nil {
		return
	}
	_ = runtime.Close(context.Background())
}
