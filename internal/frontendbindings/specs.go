package frontendbindings

import (
	"reflect"

	"setta/internal/httpapi"
	"setta/internal/wsapi"
)

type NamedRoute struct {
	Name     string
	Path     string
	EnumName string
}

type RouteGroup struct {
	ConstName string
	Routes    []NamedRoute
}

type EndpointSpec struct {
	FunctionName    string
	Method          string
	RouteCollection string
	RouteName       string
	RequestType     reflect.Type
	ResponseType    reflect.Type
}

func CurrentRouteGroups() []RouteGroup {
	return []RouteGroup{
		{
			ConstName: "GoRoutePrefixes",
			Routes: []NamedRoute{{
				Name:     "api",
				Path:     httpapi.RouteAPIPrefix,
				EnumName: "PREFIX",
			}},
		},
		{
			ConstName: "GoRootRoutes",
			Routes: []NamedRoute{
				{
					Name:     "bootstrapPage",
					Path:     httpapi.RouteBootstrapPage,
					EnumName: "BOOTSTRAP_PAGE",
				},
				{
					Name:     "bootstrapConsume",
					Path:     httpapi.RouteBootstrapConsume,
					EnumName: "BOOTSTRAP_CONSUME",
				},
				{
					Name:     "toolsCall",
					Path:     httpapi.RouteMCPToolCall,
					EnumName: "TOOLS_CALL",
				},
			},
		},
		{
			ConstName: "GoHTTPRoutes",
			Routes: []NamedRoute{
				{
					Name:     "getBackendInitStatus",
					Path:     httpapi.RouteGetBackendInitStatus,
					EnumName: "GET_BACKEND_INIT_STATUS",
				},
				{
					Name:     "getAuthRefreshStatus",
					Path:     httpapi.RouteGetAuthRefreshStatus,
					EnumName: "GET_AUTH_REFRESH_STATUS",
				},
				{
					Name:     "getServerMode",
					Path:     httpapi.RouteGetServerMode,
					EnumName: "GET_SERVER_MODE",
				},
				{
					Name:     "getSettaHomeInfo",
					Path:     httpapi.RouteGetSettaHomeInfo,
					EnumName: "GET_SETTA_HOME_INFO",
				},
				{
					Name:     "createWorkspaceLaunchIntent",
					Path:     httpapi.RouteCreateWorkspaceLaunchIntent,
					EnumName: "CREATE_WORKSPACE_LAUNCH_INTENT",
				},
				{
					Name:     "launch",
					Path:     httpapi.RouteLaunch,
					EnumName: "LAUNCH",
				},
				{
					Name:     "getLauncherRecentWorkspaces",
					Path:     httpapi.RouteGetLauncherRecentWorkspaces,
					EnumName: "GET_LAUNCHER_RECENT_WORKSPACES",
				},
				{
					Name:     "addLauncherRecentWorkspace",
					Path:     httpapi.RouteAddLauncherRecentWorkspace,
					EnumName: "ADD_LAUNCHER_RECENT_WORKSPACE",
				},
				{
					Name:     "removeLauncherRecentWorkspace",
					Path:     httpapi.RouteRemoveLauncherRecentWorkspace,
					EnumName: "REMOVE_LAUNCHER_RECENT_WORKSPACE",
				},
				{
					Name:     "pinLauncherRecentWorkspace",
					Path:     httpapi.RoutePinLauncherRecentWorkspace,
					EnumName: "PIN_LAUNCHER_RECENT_WORKSPACE",
				},
				{
					Name:     "getLauncherFilesystemRoots",
					Path:     httpapi.RouteGetLauncherFilesystemRoots,
					EnumName: "GET_LAUNCHER_FILESYSTEM_ROOTS",
				},
				{
					Name:     "listLauncherDirectory",
					Path:     httpapi.RouteListLauncherDirectory,
					EnumName: "LIST_LAUNCHER_DIRECTORY",
				},
				{
					Name:     "openLauncherWorkspace",
					Path:     httpapi.RouteOpenLauncherWorkspace,
					EnumName: "OPEN_LAUNCHER_WORKSPACE",
				},
				{
					Name:     "getLauncherStatus",
					Path:     httpapi.RouteGetLauncherStatus,
					EnumName: "GET_LAUNCHER_STATUS",
				},
				{
					Name:     "setupLauncher",
					Path:     httpapi.RouteSetupLauncher,
					EnumName: "SETUP_LAUNCHER",
				},
				{
					Name:     "repairLauncher",
					Path:     httpapi.RouteRepairLauncher,
					EnumName: "REPAIR_LAUNCHER",
				},
				{
					Name:     "removeLauncher",
					Path:     httpapi.RouteRemoveLauncher,
					EnumName: "REMOVE_LAUNCHER",
				},
				{
					Name:     "updateLauncher",
					Path:     httpapi.RouteUpdateLauncher,
					EnumName: "UPDATE_LAUNCHER",
				},
				{
					Name:     "revealPathInOsFileExplorer",
					Path:     httpapi.RouteRevealPathInOSFileExplorer,
					EnumName: "REVEAL_PATH_IN_OS_FILE_EXPLORER",
				},
				{
					Name:     "getAppDefinition",
					Path:     httpapi.RouteGetAppDefinition,
					EnumName: "GET_APP_DEFINITION",
				},
				{
					Name:     "setAppDefinition",
					Path:     httpapi.RouteSetAppDefinition,
					EnumName: "SET_APP_DEFINITION",
				},
				{
					Name:     "validateAppDefinition",
					Path:     httpapi.RouteValidateAppDefinition,
					EnumName: "VALIDATE_APP_DEFINITION",
				},
				{
					Name:     "getAppCatalog",
					Path:     httpapi.RouteGetAppCatalog,
					EnumName: "GET_APP_CATALOG",
				},
				{
					Name:     "restartLanguageServer",
					Path:     httpapi.RouteRestartLanguageServer,
					EnumName: "RESTART_LANGUAGE_SERVER",
				},
				{
					Name:     "typeCheck",
					Path:     httpapi.RouteTypeCheck,
					EnumName: "TYPE_CHECK",
				},
				{
					Name:     "getLatestLspDiagnostics",
					Path:     httpapi.RouteGetLatestLSPDiagnostics,
					EnumName: "GET_LATEST_LSP_DIAGNOSTICS",
				},
				{
					Name:     "setTypeErrorIgnore",
					Path:     httpapi.RouteSetTypeErrorIgnore,
					EnumName: "SET_TYPE_ERROR_IGNORE",
				},
			},
		},
		{
			ConstName: "GoWebsocketRoutes",
			Routes: []NamedRoute{
				{
					Name:     "frontend",
					Path:     wsapi.RouteFrontend,
					EnumName: "WEBSOCKET_FRONTEND",
				},
				{
					Name:     "listenerById",
					Path:     wsapi.RouteListenerByID,
					EnumName: "WEBSOCKET_LISTENER_BY_ID",
				},
				{
					Name:     "terminalBySection",
					Path:     wsapi.RouteTerminalBySection,
					EnumName: "WEBSOCKET_TERMINAL_BY_SECTION",
				},
			},
		},
	}
}

func CurrentEndpoints() []EndpointSpec {
	return []EndpointSpec{
		{
			FunctionName:    "route_get_backend_init_status",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getBackendInitStatus",
			ResponseType:    reflect.TypeOf(BackendInitStatusResponse{}),
		},
		{
			FunctionName:    "route_get_auth_refresh_status",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAuthRefreshStatus",
			ResponseType:    reflect.TypeOf(AuthRefreshStatusResponse{}),
		},
		{
			FunctionName:    "route_get_server_mode",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getServerMode",
			ResponseType:    reflect.TypeOf(ServerModeResponse{}),
		},
		{
			FunctionName:    "route_get_setta_home_info",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getSettaHomeInfo",
			ResponseType:    reflect.TypeOf(SettaHomeInfoResponse{}),
		},
		{
			FunctionName:    "route_create_workspace_launch_intent",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "createWorkspaceLaunchIntent",
			RequestType:     reflect.TypeOf(CreateWorkspaceLaunchIntentRequestInput{}),
			ResponseType:    reflect.TypeOf(CreateWorkspaceLaunchIntentResponse{}),
		},
		{
			FunctionName:    "route_launch",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "launch",
			RequestType:     reflect.TypeOf(LaunchRequestInput{}),
			ResponseType:    reflect.TypeOf(LaunchResponse{}),
		},
		{
			FunctionName:    "route_get_launcher_recent_workspaces",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getLauncherRecentWorkspaces",
			RequestType:     reflect.TypeOf(GetLauncherRecentWorkspacesRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherRecentWorkspacesResponse{}),
		},
		{
			FunctionName:    "route_add_launcher_recent_workspace",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "addLauncherRecentWorkspace",
			RequestType:     reflect.TypeOf(LauncherRecentWorkspaceRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherRecentWorkspacesResponse{}),
		},
		{
			FunctionName:    "route_remove_launcher_recent_workspace",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "removeLauncherRecentWorkspace",
			RequestType:     reflect.TypeOf(LauncherRecentWorkspaceRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherRecentWorkspacesResponse{}),
		},
		{
			FunctionName:    "route_pin_launcher_recent_workspace",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pinLauncherRecentWorkspace",
			RequestType:     reflect.TypeOf(PinLauncherRecentWorkspaceRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherRecentWorkspacesResponse{}),
		},
		{
			FunctionName:    "route_get_launcher_filesystem_roots",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getLauncherFilesystemRoots",
			ResponseType:    reflect.TypeOf(LauncherFilesystemRootsResponse{}),
		},
		{
			FunctionName:    "route_list_launcher_directory",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "listLauncherDirectory",
			RequestType:     reflect.TypeOf(LauncherListDirectoryRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherListDirectoryResponse{}),
		},
		{
			FunctionName:    "route_open_launcher_workspace",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "openLauncherWorkspace",
			RequestType:     reflect.TypeOf(LauncherOpenWorkspaceRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherOpenWorkspaceResponse{}),
		},
		{
			FunctionName:    "route_get_launcher_status",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getLauncherStatus",
			RequestType:     reflect.TypeOf(GetLauncherStatusRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherStatusResponse{}),
		},
		{
			FunctionName:    "route_setup_launcher",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setupLauncher",
			RequestType:     reflect.TypeOf(SetupLauncherRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherStatusResponse{}),
		},
		{
			FunctionName:    "route_repair_launcher",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "repairLauncher",
			RequestType:     reflect.TypeOf(LauncherRequestBaseInput{}),
			ResponseType:    reflect.TypeOf(LauncherStatusResponse{}),
		},
		{
			FunctionName:    "route_remove_launcher",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "removeLauncher",
			RequestType:     reflect.TypeOf(LauncherRequestBaseInput{}),
			ResponseType:    reflect.TypeOf(LauncherStatusResponse{}),
		},
		{
			FunctionName:    "route_update_launcher",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "updateLauncher",
			RequestType:     reflect.TypeOf(UpdateLauncherRequestInput{}),
			ResponseType:    reflect.TypeOf(LauncherUpdateResponse{}),
		},
		{
			FunctionName:    "route_reveal_path_in_os_file_explorer",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "revealPathInOsFileExplorer",
			RequestType:     reflect.TypeOf(httpapi.RevealPathInOSFileExplorerRequest{}),
		},
		{
			FunctionName:    "route_get_app_catalog",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAppCatalog",
			ResponseType:    reflect.TypeOf(AppCatalogResponse{}),
		},
		{
			FunctionName:    "route_get_app_definition",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAppDefinition",
			RequestType:     reflect.TypeOf(GetAppDefinitionRequestInput{}),
			ResponseType:    reflect.TypeOf(AppDefinitionReadResponse{}),
		},
		{
			FunctionName:    "route_set_app_definition",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setAppDefinition",
			RequestType:     reflect.TypeOf(SetAppDefinitionRequestInput{}),
			ResponseType:    reflect.TypeOf(AppDefinitionMutationResponse{}),
		},
		{
			FunctionName:    "route_validate_app_definition",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "validateAppDefinition",
			RequestType:     reflect.TypeOf(ValidateAppDefinitionRequestInput{}),
			ResponseType:    reflect.TypeOf(AppDefinitionValidationResponse{}),
		},
		{
			FunctionName:    "route_restart_language_server",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "restartLanguageServer",
		},
		{
			FunctionName:    "route_type_check",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "typeCheck",
			RequestType:     reflect.TypeOf(TypeCheckRequestInput{}),
		},
		{
			FunctionName:    "route_get_latest_lsp_diagnostics",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getLatestLspDiagnostics",
			RequestType:     reflect.TypeOf(GetLatestLspDiagnosticsRequestInput{}),
			ResponseType:    reflect.TypeOf(SettaLspDiagnosticsPayload{}),
		},
		{
			FunctionName:    "route_set_type_error_ignore",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setTypeErrorIgnore",
			RequestType:     reflect.TypeOf(SetTypeErrorIgnoreRequestInput{}),
		},
	}
}
