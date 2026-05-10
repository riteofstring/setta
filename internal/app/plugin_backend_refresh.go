package app

import (
	"context"
	"errors"
	"strings"

	"setta/internal/plugins"
)

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
	if err := r.reconcileProjectDocumentLocked(
		ctx,
		r.lspSpecs,
		r.lspSpecs,
		watchCodeActiveProviderChanged(capabilities.previousWatchCode, capabilities.nextWatchCode),
	); err != nil {
		capabilities.rollback()
		r.runtime = previousRuntime
		rollbackErr := r.replaceRuntimeToolsLocked(nextRuntime, previousRuntime)
		restoreHandlerErr := r.refreshAppHandlerLocked()
		restoreWatchErr := r.reconcileWatchCodeServiceLocked(ctx)
		restoreProjectErr := r.reconcileProjectDocumentLocked(
			context.Background(),
			r.lspSpecs,
			r.lspSpecs,
			watchCodeActiveProviderChanged(capabilities.nextWatchCode, capabilities.previousWatchCode),
		)
		closePluginBackendRuntime(nextRuntime)
		return errors.Join(err, rollbackErr, restoreHandlerErr, restoreWatchErr, restoreProjectErr)
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

func currentWatchCodeCapabilities(state *watchCodeCapabilityState) plugins.PluginWatchCodeCapabilities {
	if state == nil {
		return plugins.WatchCodeCapabilitiesFromSnapshot(plugins.DiscoverySnapshot{})
	}
	return state.WatchCodeCapabilities()
}

func watchCodeActiveProviderChanged(
	previous plugins.PluginWatchCodeCapabilities,
	next plugins.PluginWatchCodeCapabilities,
) bool {
	previousID, previousActive := activeWatchCodeProviderID(previous)
	nextID, nextActive := activeWatchCodeProviderID(next)
	if previousActive != nextActive {
		return true
	}
	return previousActive && previousID != nextID
}

func activeWatchCodeProviderID(capabilities plugins.PluginWatchCodeCapabilities) (string, bool) {
	pluginID := strings.TrimSpace(capabilities.PluginID)
	active := capabilities.PluginEnabled && capabilities.Python && pluginID != ""
	return pluginID, active
}
