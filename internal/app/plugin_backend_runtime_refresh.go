package app

import (
	"context"
	"errors"
	"sync"

	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/tools"
)

type pluginBackendRuntimeRefresher struct {
	service          *plugins.Service
	discovery        *plugins.DiscoveryService
	runtimeProvider  plugins.WorkerRuntimeProvider
	projectStateRead plugins.ProjectStateReader
	serverMode       config.Mode
	holder           *plugins.BackendRuntimeHolder
	lspRouter        *lsp.Router
	backendRegs      plugins.BackendRegistrationSource

	mu              sync.Mutex
	mcpServer       *mcpx.Server
	pluginToolNames []string
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
		result.SourceDigestSHA256 = cloneOptionalString(entry.SourceDigestSHA256)
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
		result.SourceDigestSHA256 = cloneOptionalString(entry.SourceDigestSHA256)
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

func (r *pluginBackendRuntimeRefresher) AttachMCPServer(server *mcpx.Server, toolNames []string) {
	if r == nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.mcpServer = server
	r.pluginToolNames = append([]string(nil), toolNames...)
}

func (r *pluginBackendRuntimeRefresher) Refresh(ctx context.Context) (plugins.DiscoverySnapshot, error) {
	if r == nil || r.service == nil || r.discovery == nil || r.runtimeProvider == nil || r.holder == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	previewSnapshot, err := r.service.PreviewBackendRuntimeRefresh()
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}

	nextRuntime, err := plugins.NewBackendRouteRuntime(ctx, plugins.BackendRouteRuntimeOptions{
		DiscoveryService: r.discovery,
		Snapshot:         &previewSnapshot,
		RuntimeProvider:  r.runtimeProvider,
		ProjectStateRead: r.projectStateRead,
		ServerMode:       r.serverMode,
	})
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}

	var nextLanguageServerSpecs []lsp.LanguageServerSpec
	if r.lspRouter != nil && r.backendRegs != nil {
		nextLanguageServerSpecs, err = appLanguageServerSpecsForSnapshot(previewSnapshot, r.backendRegs)
		if err != nil {
			_ = nextRuntime.Close()
			return plugins.DiscoverySnapshot{}, err
		}
	}

	nextTools := pluginMCPToolRegistrations(nextRuntime)
	nextToolNames := toolRegistrationNames(nextTools)
	if r.mcpServer != nil {
		if err := r.mcpServer.ReplaceTools(r.pluginToolNames, nextTools); err != nil {
			_ = nextRuntime.Close()
			return plugins.DiscoverySnapshot{}, err
		}
	}
	if r.lspRouter != nil && r.backendRegs != nil {
		if err := r.lspRouter.ReplaceAdditionalSpecs(ctx, nextLanguageServerSpecs); err != nil {
			_ = nextRuntime.Close()
			return plugins.DiscoverySnapshot{}, err
		}
	}

	previousRuntime := r.holder.Swap(nextRuntime)
	r.pluginToolNames = nextToolNames

	snapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	var closeErr error
	if previousRuntime != nil {
		closeErr = previousRuntime.Close()
	}
	if commitErr != nil {
		return snapshot, commitErr
	}
	if closeErr != nil {
		return snapshot, closeErr
	}
	return snapshot, nil
}

func pluginMCPToolRegistrations(runtime *plugins.BackendRouteRuntime) []mcpx.ToolRegistration {
	if runtime == nil {
		return nil
	}

	registrations := make([]mcpx.ToolRegistration, 0, len(runtime.MCPTools()))
	for _, registration := range runtime.MCPTools() {
		toolRegistration := registration
		registrations = append(registrations, mcpx.ToolRegistration{
			Spec: tools.Spec{
				Name:        toolRegistration.Name,
				Description: toolRegistration.Description,
				Metadata:    toolRegistration.Metadata,
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					result, err := runtime.InvokeMCPTool(ctx, toolRegistration.Name, arguments)
					if err == nil {
						return result, nil
					}

					var toolErr *plugins.BackendMCPToolCallError
					if !errors.As(err, &toolErr) {
						return nil, err
					}
					code := toolErr.Code
					if code == "" {
						code = "internal_error"
					}
					return nil, mcpx.NewToolError(code, "%s", toolErr.Message)
				},
			},
			InputSchema:  toolRegistration.InputSchema,
			OutputSchema: toolRegistration.OutputSchema,
		})
	}
	return registrations
}

func toolRegistrationNames(registrations []mcpx.ToolRegistration) []string {
	names := make([]string, 0, len(registrations))
	for _, registration := range registrations {
		names = append(names, registration.Spec.Name)
	}
	return names
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
