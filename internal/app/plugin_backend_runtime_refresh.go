package app

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/settingsstate"
)

type pluginBackendRuntimeRefresher struct {
	service     *plugins.Service
	logger      *slog.Logger
	runtimeRoot string
	mcpServer   *mcpx.Server
	settings    *settingsstate.Runtime
	runtime     *pluginBackendMCPRuntime
	lspRouter   *lsp.Router
	lspSpecs    []lsp.LanguageServerSpec

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
	return s.base.Runtime(options)
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
	snapshot, err := s.base.Rescan()
	if err != nil || s.refresher == nil {
		return snapshot, err
	}
	return s.refresher.Refresh(context.Background())
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
	if entry, ok := findHighestPrecedencePlugin(snapshot.Plugins, result.PluginID); ok {
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
	if entry, ok := findHighestPrecedencePlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return s.base.WriteConfig(ctx, options)
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
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(snapshot)
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
	return r.commitRefreshTransitionLocked(transition)
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
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(previewSnapshot)
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

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerSpecs(snapshot plugins.DiscoverySnapshot) ([]lsp.LanguageServerSpec, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, err
	}
	return r.service.LanguageServerSpecsForSnapshot(snapshot, selections)
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerPlugins() (map[string]*string, error) {
	if r == nil || r.settings == nil {
		return map[string]*string{}, nil
	}
	return settingsstate.LanguageServerSelectedByLanguage(r.settings.Snapshot().Document)
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

func findPluginInScope(entries []plugins.DiscoveredPlugin, pluginID string, scope plugins.PluginScope) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry, true
		}
	}
	return plugins.DiscoveredPlugin{}, false
}

func findHighestPrecedencePlugin(entries []plugins.DiscoveredPlugin, pluginID string) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID {
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
			SettingsKey: cloneOptionalString(spec.SettingsKey),
		})
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
