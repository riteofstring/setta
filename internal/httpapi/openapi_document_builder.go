package httpapi

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/pathreveal"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/workspacelaunch"
)

type frontendHTTPOpenAPIInfoService struct{}

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
	return document, nil
}
