package frontendbindings

import (
	"reflect"

	"setta/internal/httpapi"
	"setta/internal/wsapi"
)

type NamedRoute struct {
	Name string
	Path string
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
				Name: "api",
				Path: httpapi.RouteAPIPrefix,
			}},
		},
		{
			ConstName: "GoRootRoutes",
			Routes: []NamedRoute{
				{
					Name: "bootstrapPage",
					Path: httpapi.RouteBootstrapPage,
				},
				{
					Name: "bootstrapConsume",
					Path: httpapi.RouteBootstrapConsume,
				},
				{
					Name: "toolsCall",
					Path: httpapi.RouteMCPToolCall,
				},
			},
		},
		{
			ConstName: "GoHTTPRoutes",
			Routes: []NamedRoute{
				{
					Name: "getBackendInitStatus",
					Path: httpapi.RouteGetBackendInitStatus,
				},
				{
					Name: "getAuthRefreshStatus",
					Path: httpapi.RouteGetAuthRefreshStatus,
				},
				{
					Name: "getServerMode",
					Path: httpapi.RouteGetServerMode,
				},
				{
					Name: "getSettaHomeInfo",
					Path: httpapi.RouteGetSettaHomeInfo,
				},
				{
					Name: "createWorkspaceLaunchIntent",
					Path: httpapi.RouteCreateWorkspaceLaunchIntent,
				},
				{
					Name: "launch",
					Path: httpapi.RouteLaunch,
				},
				{
					Name: "getLauncherRecentWorkspaces",
					Path: httpapi.RouteGetLauncherRecentWorkspaces,
				},
				{
					Name: "addLauncherRecentWorkspace",
					Path: httpapi.RouteAddLauncherRecentWorkspace,
				},
				{
					Name: "removeLauncherRecentWorkspace",
					Path: httpapi.RouteRemoveLauncherRecentWorkspace,
				},
				{
					Name: "pinLauncherRecentWorkspace",
					Path: httpapi.RoutePinLauncherRecentWorkspace,
				},
				{
					Name: "getLauncherFilesystemRoots",
					Path: httpapi.RouteGetLauncherFilesystemRoots,
				},
				{
					Name: "listLauncherDirectory",
					Path: httpapi.RouteListLauncherDirectory,
				},
				{
					Name: "openLauncherWorkspace",
					Path: httpapi.RouteOpenLauncherWorkspace,
				},
				{
					Name: "getLauncherStatus",
					Path: httpapi.RouteGetLauncherStatus,
				},
				{
					Name: "setupLauncher",
					Path: httpapi.RouteSetupLauncher,
				},
				{
					Name: "repairLauncher",
					Path: httpapi.RouteRepairLauncher,
				},
				{
					Name: "removeLauncher",
					Path: httpapi.RouteRemoveLauncher,
				},
				{
					Name: "updateLauncher",
					Path: httpapi.RouteUpdateLauncher,
				},
				{
					Name: "revealPathInOsFileExplorer",
					Path: httpapi.RouteRevealPathInOSFileExplorer,
				},
			},
		},
		{
			ConstName: "GoWebsocketRoutes",
			Routes: []NamedRoute{
				{
					Name: "frontend",
					Path: wsapi.RouteFrontend,
				},
				{
					Name: "listenerById",
					Path: wsapi.RouteListenerByID,
				},
				{
					Name: "terminalBySection",
					Path: wsapi.RouteTerminalBySection,
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
	}
}
