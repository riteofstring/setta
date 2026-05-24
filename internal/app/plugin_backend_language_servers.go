package app

import (
	"context"
	"errors"
	"strings"

	"setta/internal/lsp"
	"setta/internal/plugins"
)

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
		nextRuntime:                   nextRuntime,
		nextLSPSpecs:                  nextLSPSpecs,
		nextWatchCodeCapabilities:     plugins.WatchCodeCapabilitiesFromSnapshot(previewSnapshot),
		previousRuntime:               r.runtime,
		previousLSPSpecs:              cloneLanguageServerSpecs(r.lspSpecs),
		previousWatchCodeCapabilities: currentWatchCodeCapabilities(r.watchCodeCapabilities),
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
	capabilities := r.captureFeatureCapabilityRefreshState(committedSnapshot)
	capabilities.applyNext()
	transition.previousWatchCodeCapabilities = capabilities.previousWatchCode
	transition.nextWatchCodeCapabilities = capabilities.nextWatchCode
	if err := r.reconcileProjectDocumentLocked(
		context.Background(),
		transition.previousLSPSpecs,
		transition.nextLSPSpecs,
		watchCodeActiveProviderChanged(
			transition.previousWatchCodeCapabilities,
			transition.nextWatchCodeCapabilities,
		),
	); err != nil {
		return committedSnapshot, errors.Join(
			err,
			r.rollbackCommittedRefreshTransitionLocked(
				transition,
				capabilities,
				previousRefreshState,
			),
		)
	}
	if err := r.refreshAppHandlerLocked(); err != nil {
		rollbackErr := r.rollbackCommittedRefreshTransitionLocked(
			transition,
			capabilities,
			previousRefreshState,
		)
		return committedSnapshot, errors.Join(err, rollbackErr)
	}
	if err := r.reconcileWatchCodeServiceLocked(context.Background()); err != nil {
		rollbackErr := r.rollbackCommittedRefreshTransitionLocked(
			transition,
			capabilities,
			previousRefreshState,
		)
		restoreHandlerErr := r.refreshAppHandlerLocked()
		restoreWatchErr := r.reconcileWatchCodeServiceLocked(context.Background())
		return committedSnapshot, errors.Join(err, rollbackErr, restoreHandlerErr, restoreWatchErr)
	}

	r.lspSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.appliedLSPSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	closePluginBackendRuntime(transition.previousRuntime)
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) rollbackCommittedRefreshTransitionLocked(
	transition *pluginBackendRefreshTransition,
	capabilities pluginFeatureCapabilityRefreshState,
	previousRefreshState plugins.BackendRuntimeRefreshState,
) error {
	capabilities.rollback()
	rollbackErr := r.rollbackRefreshTransitionLocked(transition)
	restoreErr := r.service.RestoreBackendRuntimeRefreshState(previousRefreshState)
	return errors.Join(rollbackErr, restoreErr)
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
			err := r.reconcileProjectDocumentLocked(
				context.Background(),
				transition.nextLSPSpecs,
				transition.previousLSPSpecs,
				watchCodeActiveProviderChanged(
					transition.nextWatchCodeCapabilities,
					transition.previousWatchCodeCapabilities,
				),
			)
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
