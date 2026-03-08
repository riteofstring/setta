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
			FunctionName:    "route_reveal_path_in_os_file_explorer",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "revealPathInOsFileExplorer",
			RequestType:     reflect.TypeOf(httpapi.RevealPathInOSFileExplorerRequest{}),
		},
	}
}
