package app

import (
	"context"
	"strings"
	"sync"

	"setta/internal/plugins"
)

type pluginBackendRuntimeRefresher struct {
	service *plugins.Service

	mu sync.Mutex
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

func (s *pluginMutationRuntimeService) Runtime(options plugins.RuntimeOptions) (plugins.RuntimeResponse, error) {
	return s.base.Runtime(options)
}

func (s *pluginMutationRuntimeService) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	return s.base.ResolveAssetPath(pluginID, assetPath)
}

func (s *pluginMutationRuntimeService) Rescan() (plugins.DiscoverySnapshot, error) {
	snapshot, err := s.base.Rescan()
	if err != nil || s.refresher == nil {
		return snapshot, err
	}
	return s.refresher.Refresh(context.Background())
}

func (s *pluginMutationRuntimeService) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResult, error) {
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

func (s *pluginMutationRuntimeService) Link(options plugins.LinkOptions) (plugins.PluginInstallResult, error) {
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

func (s *pluginMutationRuntimeService) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResult, error) {
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

func (s *pluginMutationRuntimeService) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResult, error) {
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

func (s *pluginMutationRuntimeService) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResult, error) {
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

func (s *pluginMutationRuntimeService) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
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

func (s *pluginMutationRuntimeService) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
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

func (s *pluginMutationRuntimeService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error) {
	return s.base.WriteConfig(ctx, options)
}

func (s *pluginMutationRuntimeService) WriteLockfile() (plugins.PluginLockWriteResult, error) {
	return s.base.WriteLockfile()
}

func (s *pluginMutationRuntimeService) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResult, error) {
	result, err := s.base.ApplyLockfile(ctx, check)
	if err != nil || s.refresher == nil || !result.Applied || check {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	return result, nil
}

func (s *pluginMutationRuntimeService) Restart(ctx context.Context) (plugins.PluginRestartResult, error) {
	return s.base.Restart(ctx)
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

	if _, err := r.service.PreviewBackendRuntimeRefresh(); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}

	snapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	if commitErr != nil {
		return snapshot, commitErr
	}
	return snapshot, nil
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
