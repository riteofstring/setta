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

	mu sync.Mutex
}

type pluginBackendRefreshTransition struct {
	previewSnapshot  plugins.DiscoverySnapshot
	nextRuntime      *pluginBackendMCPRuntime
	nextLSPSpecs     []lsp.LanguageServerSpec
	previousRuntime  *pluginBackendMCPRuntime
	previousLSPSpecs []lsp.LanguageServerSpec
}

type pluginMutationRuntimeService struct {
	base      *plugins.Service
	refresher *pluginBackendRuntimeRefresher
}

func newPluginMutationRuntimeService(base *plugins.Service, refresher *pluginBackendRuntimeRefresher) *pluginMutationRuntimeService {
	return &pluginMutationRuntimeService{
		base:      base,
		refresher: refresher,
	}
}

func (s *pluginMutationRuntimeService) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	response, err := s.base.Runtime(options)
	if err != nil || s.refresher == nil {
		return response, err
	}
	s.refresher.applyAppliedLanguageServerStatus(&response.Status)
	return response, nil
}

func (s *pluginMutationRuntimeService) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	return s.base.ResolveAssetPath(pluginID, assetPath)
}

func (s *pluginMutationRuntimeService) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	return s.base.ResolveRegisteredStaticAssetPath(requestPath)
}

func (s *pluginMutationRuntimeService) LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error) {
	return s.base.LookupRegisteredBackendRoute(method, requestPath)
}

func (s *pluginMutationRuntimeService) DispatchRegisteredBackendRoute(
	ctx context.Context,
	request plugins.BackendHTTPRequest,
) (plugins.BackendHTTPResponse, bool, error) {
	return s.base.DispatchRegisteredBackendRoute(ctx, request)
}

func (s *pluginMutationRuntimeService) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	return s.base.InvokeRegisteredListenerEndpoint(ctx, request)
}

func (s *pluginMutationRuntimeService) Rescan() (plugins.DiscoverySnapshot, error) {
	return s.base.Rescan()
}

func (s *pluginMutationRuntimeService) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	result, err := s.base.Install(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := findPluginInScope(snapshot.Plugins, result.PluginID, result.SourceScope); ok {
		result.State = entry.State
		result.Version = entry.Version
		result.SourcePath = entry.SourcePath
		result.SourceDigestSHA256 = cloneOptionalDigest(entry.SourceDigestSHA256)
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Link(options plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	result, err := s.base.Link(options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(context.Background())
	if err != nil {
		return result, err
	}
	if entry, ok := findPluginInScope(snapshot.Plugins, result.PluginID, result.SourceScope); ok {
		result.State = entry.State
		result.Version = entry.Version
		result.SourcePath = entry.SourcePath
		result.SourceDigestSHA256 = cloneOptionalDigest(entry.SourceDigestSHA256)
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	result, err := s.base.Uninstall(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	result, err := s.base.Update(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	result, err := s.base.Rollback(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	result, err := s.base.Enable(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := plugins.PrimaryDiscoveredPlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	result, err := s.base.Disable(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := plugins.PrimaryDiscoveredPlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
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
	return s.base.GetBackendUISettings(pluginID)
}

func (s *pluginMutationRuntimeService) ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	return s.base.ReadBackendUISettingValue(ctx, options)
}

func (s *pluginMutationRuntimeService) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	return s.base.WriteBackendUISettingValue(ctx, options)
}

func (s *pluginMutationRuntimeService) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	return s.base.WriteLockfile()
}

func (s *pluginMutationRuntimeService) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResponse, error) {
	result, err := s.base.ApplyLockfile(ctx, check)
	if err != nil || s.refresher == nil || !result.Applied || check {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
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

	snapshot, err := r.service.Rescan()
	if err != nil {
		return err
	}
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(snapshot, false)
	if err != nil {
		return err
	}
	nextRuntime, err := r.buildRuntimeLocked(ctx, snapshot)
	if err != nil {
		return err
	}
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
		r.rollbackRefreshTransitionLocked(transition)
		return plugins.DiscoverySnapshot{}, err
	}
	return r.commitRefreshTransitionLocked(transition)
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

	if trimmedPluginID != "" && !r.pluginHasAppliedLanguageServersLocked(trimmedPluginID) {
		return nil
	}
	snapshot, err := r.service.Rescan()
	if err != nil {
		return err
	}
	selectedLSPSpecs, selectedPluginIDs, err := r.selectedLanguageServerRefreshLocked(snapshot)
	if err != nil {
		return err
	}
	nextLSPSpecs := selectedLSPSpecs
	if trimmedPluginID != "" {
		nextLSPSpecs = refreshedAppliedLanguageServerSpecs(
			r.appliedLSPSpecs,
			selectedLSPSpecs,
			trimmedPluginID,
		)
	}

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
		previewSnapshot:  previewSnapshot,
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
	committedSnapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	if commitErr != nil {
		r.rollbackRefreshTransitionLocked(transition)
		return committedSnapshot, commitErr
	}

	r.lspSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.appliedLSPSpecs = cloneLanguageServerSpecs(transition.nextLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	closePluginBackendRuntime(transition.previousRuntime)
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) rollbackRefreshTransitionLocked(
	transition *pluginBackendRefreshTransition,
) {
	r.logPluginBackendRuntimeError(
		"rollback plugin backend MCP tools failed",
		r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime),
	)
	r.logPluginBackendRuntimeError(
		"rollback plugin backend language servers failed",
		r.replaceLSPSpecsLocked(context.Background(), transition.nextLSPSpecs, transition.previousLSPSpecs),
	)
	r.runtime = transition.previousRuntime
	r.lspSpecs = transition.previousLSPSpecs
	r.appliedLSPSpecs = cloneLanguageServerSpecs(transition.previousLSPSpecs)
	r.pendingLanguageServerSelectionPluginIDs = nil
	r.logPluginBackendRuntimeError(
		"rollback plugin backend project reconciliation failed",
		r.reconcileProjectDocumentLocked(context.Background(), transition.nextLSPSpecs, transition.previousLSPSpecs),
	)
	closePluginBackendRuntime(transition.nextRuntime)
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
	if r == nil || status == nil || len(status.Plugins) == 0 {
		return
	}

	r.mu.Lock()
	appliedByPlugin := appliedLanguageServerLanguagesByPlugin(r.appliedLSPSpecs)
	r.mu.Unlock()
	if len(appliedByPlugin) == 0 {
		return
	}

	for index := range status.Plugins {
		entry := &status.Plugins[index]
		languages, ok := appliedByPlugin[entry.PluginID]
		if !ok {
			continue
		}
		if entry.State != plugins.PluginRuntimeStateActive && entry.State != plugins.PluginRuntimeStatePendingRestart {
			continue
		}
		entry.AppliedLanguageServerLanguages = append([]string(nil), languages...)
		delete(appliedByPlugin, entry.PluginID)
		if len(appliedByPlugin) == 0 {
			return
		}
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
		Logger:      r.logger,
		RuntimeRoot: r.runtimeRoot,
		Snapshot:    snapshot,
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
			PluginID:    spec.PluginID,
			Name:        spec.Name,
			LanguageID:  spec.LanguageID,
			Command:     spec.Command,
			Args:        append([]string(nil), spec.Args...),
			Settings:    clonePluginLanguageServerSettings(spec.Settings),
			SettingsKey: cloneOptionalString(spec.SettingsKey),
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
	if left.PluginID != right.PluginID ||
		left.Name != right.Name ||
		left.LanguageID != right.LanguageID ||
		left.Command != right.Command {
		return false
	}
	if !slices.Equal(left.Args, right.Args) {
		return false
	}
	if !languageServerSettingsEqual(left.Settings, right.Settings) {
		return false
	}
	return optionalStringPointersEqual(left.SettingsKey, right.SettingsKey)
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
		if !ok {
			next = append(next, spec)
			continue
		}
		next = append(next, updated)
	}
	return next
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
