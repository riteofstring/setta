package httpapi

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/pathreveal"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/workspacelaunch"
)

type frontendHTTPOpenAPIInfoService struct{}
type frontendHTTPOpenAPIPluginService struct{}

func (frontendHTTPOpenAPIInfoService) ServerMode(context.Context) string {
	return string(config.ModeIDE)
}

func (frontendHTTPOpenAPIInfoService) RuntimeInfo(context.Context) RuntimeInfo {
	return RuntimeInfo{
		Mode: string(config.ModeIDE),
		Paths: RuntimePaths{
			WorkspaceRoot:      "/workspace",
			SettaHome:          "/setta-home",
			ProfileLookupHome:  "/profiles",
			SettaFilesRoot:     "/setta-files",
			SettaFilesLocation: "local",
			RuntimeRoot:        "/runtime",
		},
		Policy: RuntimePathPolicy{
			GlobalSettaFilesBase: "/global-setta",
			AutoMode:             string(config.FilesLocationLocal),
		},
	}
}

func (frontendHTTPOpenAPIInfoService) SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{
		SDKVersion:         "dev-sdk",
		CoreVersion:        "dev-core",
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}

func (frontendHTTPOpenAPIPluginService) ResolveAssetPath(string, string) (string, error) {
	return "", nil
}

func (frontendHTTPOpenAPIPluginService) ResolveRegisteredStaticAssetPath(string) (string, bool, error) {
	return "", false, nil
}

func (frontendHTTPOpenAPIPluginService) LookupRegisteredBackendRoute(string, string) (plugins.BackendRouteLookup, error) {
	return plugins.BackendRouteLookup{}, nil
}

func (frontendHTTPOpenAPIPluginService) DispatchRegisteredBackendRoute(context.Context, plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
	return plugins.BackendHTTPResponse{}, false, nil
}

func (frontendHTTPOpenAPIPluginService) InvokeRegisteredListenerEndpoint(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error) {
	return nil, false, nil
}

func (frontendHTTPOpenAPIPluginService) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	return plugins.PluginRuntimeResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) GetBackendUISettings(string) ([]plugins.PluginRegisteredUISetting, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIPluginService) ReadBackendUISettingValue(context.Context, plugins.BackendUISettingReadOptions) (any, error) {
	return nil, nil
}

func (frontendHTTPOpenAPIPluginService) WriteBackendUISettingValue(context.Context, plugins.BackendUISettingWriteOptions) error {
	return nil
}

func (frontendHTTPOpenAPIPluginService) Rescan() (plugins.DiscoverySnapshot, error) {
	return plugins.DiscoverySnapshot{}, nil
}

func (frontendHTTPOpenAPIPluginService) Install(context.Context, plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Link(plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Uninstall(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	return plugins.PluginUninstallResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Update(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	return plugins.PluginUpdateResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Rollback(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	return plugins.PluginRollbackResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Enable(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	return plugins.PluginEnableDisableResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Disable(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	return plugins.PluginEnableDisableResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) WriteConfig(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return plugins.PluginConfigWriteResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	return plugins.PluginLockWriteResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) ApplyLockfile(context.Context, bool) (plugins.PluginLockApplyResponse, error) {
	return plugins.PluginLockApplyResponse{}, nil
}

func (frontendHTTPOpenAPIPluginService) Restart(context.Context) (plugins.PluginRestartResponse, error) {
	return plugins.PluginRestartResponse{}, nil
}

func registerCoreRuntimeOpenAPIRoutes(router chi.Router, info InfoService) {
	registerOpenAPIGet[ServerModeResponse](
		router,
		"getServerMode",
		RouteGetServerMode,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, ServerModeResponse{
				Mode: openAPIServerMode(config.Mode(info.ServerMode(r.Context()))),
			})
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the current backend server mode."),
	)
	registerOpenAPIGet[RuntimeInfo](
		router,
		"getRuntimeInfo",
		"/runtimeInfo",
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.RuntimeInfo(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get runtime path and auth metadata for the current backend."),
	)
	registerOpenAPIGet[pythonsdkcontracts.RunningBackendVersionHandshake](
		router,
		"sdkRuntimeHandshake",
		RouteSDKRuntimeHandshake,
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, info.SDKRuntimeHandshake(r.Context()))
		},
		withOpenAPITags("Runtime"),
		withOpenAPISummary("Get the running backend version handshake for the local SDK."),
	)
}

func BuildFrontendHTTPOpenAPIDocument() (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPI(chi.NewRouter(), document)
	registerCoreRuntimeOpenAPIRoutes(router, frontendHTTPOpenAPIInfoService{})
	if err := RegisterStatusRoutes(router, StatusRouteDependencies{
		ModePolicy:           modes.NewPolicy(config.ModeIDE),
		SettaHome:            "/setta-home",
		SettaFilesRoot:       "/setta-files",
		RevealPath:           &pathreveal.Service{},
		WorktreeName:         "default",
		GlobalSettaFilesBase: "/global-setta",
	}); err != nil {
		return nil, fmt.Errorf("register status routes: %w", err)
	}
	if err := RegisterSettingsRoutes(router, SettingsRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		SettingsState: &settingsstate.Runtime{},
		WebsocketHub:  &realtime.WebsocketHub{},
	}); err != nil {
		return nil, fmt.Errorf("register settings routes: %w", err)
	}
	if err := RegisterDocstringRoutes(router, DocstringRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
	}); err != nil {
		return nil, fmt.Errorf("register docstring routes: %w", err)
	}
	if err := RegisterAgenticSummaryCacheRoutes(router, AgenticSummaryCacheRouteDependencies{
		ModePolicy:   modes.NewPolicy(config.ModeIDE),
		ProjectState: &projectstate.Runtime{},
		Statuses:     &agenticsummarycache.Service{},
	}); err != nil {
		return nil, fmt.Errorf("register agentic summary cache routes: %w", err)
	}
	if err := RegisterMCPRoutes(router, MCPRouteDependencies{
		ModePolicy:    modes.NewPolicy(config.ModeIDE),
		LLMConfigPath: "/setta-files/llm_config.json",
	}); err != nil {
		return nil, fmt.Errorf("register mcp routes: %w", err)
	}
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       &auth.Service{},
		Intents:    &workspacelaunch.IntentService{},
		Launch:     &workspacelaunch.LocalLaunchService{},
	}); err != nil {
		return nil, fmt.Errorf("register workspace launch routes: %w", err)
	}
	if err := RegisterPluginRoutes(router, PluginRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Service:    frontendHTTPOpenAPIPluginService{},
	}); err != nil {
		return nil, fmt.Errorf("register plugin routes: %w", err)
	}
	if err := RegisterBinaryRoutes(router, BinaryRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Store:      &binarypayload.Store{},
	}); err != nil {
		return nil, fmt.Errorf("register binary routes: %w", err)
	}
	return document, nil
}
