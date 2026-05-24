package app

import (
	"context"
	"errors"

	"setta/internal/lsp"
	"setta/internal/plugins"
)

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
		return s.base.ReadBackendUISettingValueFromSnapshot(ctx, snapshot, options)
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
		if err := s.base.WriteBackendUISettingValueFromSnapshot(ctx, snapshot, options); err != nil {
			return err
		}
		return s.watchCodeBackendHost.reconcileSuccessfulUISettingWrite(ctx, options)
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
	s.opMu.Lock()
	defer s.opMu.Unlock()

	result, err := s.base.Restart(ctx)
	if err != nil || !result.Accepted {
		return result, err
	}
	snapshot, err := s.base.Rescan()
	if err != nil {
		return result, err
	}
	s.commitSnapshot(snapshot)
	return result, nil
}

func (r *pluginBackendRuntimeRefresher) Initialize(ctx context.Context) error {
	_, err := r.initialize(ctx, false)
	return err
}

func (r *pluginBackendRuntimeRefresher) InitializeAfterProcessStart(
	ctx context.Context,
) (plugins.DiscoverySnapshot, error) {
	return r.initialize(ctx, true)
}

func (r *pluginBackendRuntimeRefresher) initialize(
	ctx context.Context,
	commitPendingRestart bool,
) (plugins.DiscoverySnapshot, error) {
	if r == nil || r.service == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	snapshot, nextRuntime, nextLSPSpecs, err := r.prepareInitializeRuntimeLocked(
		ctx,
		commitPendingRestart,
	)
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if err := r.commitInitializedRuntimeLocked(ctx, nextRuntime, nextLSPSpecs); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if !commitPendingRestart {
		return snapshot, nil
	}
	committedSnapshot, err := r.service.CommitBackendRuntimeRefresh()
	if err != nil {
		return committedSnapshot, err
	}
	if r.appSubsystemCapabilities != nil {
		r.appSubsystemCapabilities.SetFromSnapshot(committedSnapshot)
	}
	if r.watchCodeCapabilities != nil {
		r.watchCodeCapabilities.SetFromSnapshot(committedSnapshot)
	}
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) prepareInitializeRuntimeLocked(
	ctx context.Context,
	previewPendingRestart bool,
) (plugins.DiscoverySnapshot, *pluginBackendMCPRuntime, []lsp.LanguageServerSpec, error) {
	var snapshot plugins.DiscoverySnapshot
	var err error
	if previewPendingRestart {
		snapshot, err = r.service.PreviewBackendRuntimeRefresh()
	} else {
		snapshot, err = r.service.Rescan()
	}
	if err != nil {
		return plugins.DiscoverySnapshot{}, nil, nil, err
	}
	if r.appSubsystemCapabilities != nil {
		r.appSubsystemCapabilities.SetFromSnapshot(snapshot)
	}
	if r.watchCodeCapabilities != nil {
		r.watchCodeCapabilities.SetFromSnapshot(snapshot)
	}
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(snapshot, false)
	if err != nil {
		return plugins.DiscoverySnapshot{}, nil, nil, err
	}
	nextRuntime, err := r.buildRuntimeLocked(ctx, snapshot)
	if err != nil {
		return plugins.DiscoverySnapshot{}, nil, nil, err
	}
	return snapshot, nextRuntime, nextLSPSpecs, nil
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
