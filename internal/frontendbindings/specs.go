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
					Name:     "loadAllProjectMetadata",
					Path:     httpapi.RouteLoadAllProjectMetadata,
					EnumName: "LOAD_ALL_PROJECT_METADATA",
				},
				{
					Name:     "loadProjectConfig",
					Path:     httpapi.RouteLoadProjectConfig,
					EnumName: "LOAD_PROJECT_CONFIG",
				},
				{
					Name:     "createProjectConfig",
					Path:     httpapi.RouteCreateProjectConfig,
					EnumName: "CREATE_PROJECT_CONFIG",
				},
				{
					Name:     "deleteSections",
					Path:     httpapi.RouteDeleteSections,
					EnumName: "DELETE_SECTIONS",
				},
				{
					Name:     "deleteSelectedParams",
					Path:     httpapi.RouteDeleteSelectedParams,
					EnumName: "DELETE_SELECTED_PARAMS",
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
					Name:     "getAppGenSkills",
					Path:     httpapi.RouteGetAppGenSkills,
					EnumName: "GET_APP_GEN_SKILLS",
				},
				{
					Name:     "getAppGenSkillContent",
					Path:     httpapi.RouteGetAppGenSkillContent,
					EnumName: "GET_APP_GEN_SKILL_CONTENT",
				},
				{
					Name:     "upsertAppGenCustomSkill",
					Path:     httpapi.RouteUpsertAppGenCustomSkill,
					EnumName: "UPSERT_APP_GEN_CUSTOM_SKILL",
				},
				{
					Name:     "getMCPServerRuntimeStatus",
					Path:     httpapi.RouteMCPServerRuntimeStatus,
					EnumName: "GET_MCP_SERVER_RUNTIME_STATUS",
				},
				{
					Name:     "getPasswordParamValue",
					Path:     httpapi.RouteGetPasswordParamValue,
					EnumName: "GET_PASSWORD_PARAM_VALUE",
				},
				{
					Name:     "getAttachmentDownloadUrl",
					Path:     httpapi.RouteGetAttachmentDownloadURL,
					EnumName: "GET_ATTACHMENT_DOWNLOAD_URL",
				},
				{
					Name:     "getAttachmentDownloadUrls",
					Path:     httpapi.RouteGetAttachmentDownloadURLs,
					EnumName: "GET_ATTACHMENT_DOWNLOAD_URLS",
				},
				{
					Name:     "forceRefreshListener",
					Path:     httpapi.RouteForceRefreshListener,
					EnumName: "FORCE_REFRESH_LISTENER",
				},
				{
					Name:     "setTopLevelSectionLayout",
					Path:     httpapi.RouteSetTopLevelSectionLayout,
					EnumName: "SET_TOP_LEVEL_SECTION_LAYOUT",
				},
				{
					Name:     "groupSections",
					Path:     httpapi.RouteGroupSections,
					EnumName: "GROUP_SECTIONS",
				},
				{
					Name:     "ungroupGroups",
					Path:     httpapi.RouteUngroupGroups,
					EnumName: "UNGROUP_GROUPS",
				},
				{
					Name:     "setActiveIds",
					Path:     httpapi.RouteSetActiveIDs,
					EnumName: "SET_ACTIVE_IDS",
				},
				{
					Name:     "toggleParamSelected",
					Path:     httpapi.RouteToggleParamSelected,
					EnumName: "TOGGLE_PARAM_SELECTED",
				},
				{
					Name:     "unselectAllParams",
					Path:     httpapi.RouteUnselectAllParams,
					EnumName: "UNSELECT_ALL_PARAMS",
				},
				{
					Name:     "setViewport",
					Path:     httpapi.RouteSetViewport,
					EnumName: "SET_VIEWPORT",
				},
				{
					Name:     "getListenerCoverage",
					Path:     httpapi.RouteGetListenerCoverage,
					EnumName: "GET_LISTENER_COVERAGE",
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
				{
					Name:     "pluginsRuntime",
					Path:     httpapi.RoutePluginsRuntime,
					EnumName: "PLUGINS_RUNTIME",
				},
				{
					Name:     "pluginsRescan",
					Path:     httpapi.RoutePluginsRescan,
					EnumName: "PLUGINS_RESCAN",
				},
				{
					Name:     "pluginsInstall",
					Path:     httpapi.RoutePluginsInstall,
					EnumName: "PLUGINS_INSTALL",
				},
				{
					Name:     "pluginsUninstall",
					Path:     httpapi.RoutePluginsUninstall,
					EnumName: "PLUGINS_UNINSTALL",
				},
				{
					Name:     "pluginsUpdate",
					Path:     httpapi.RoutePluginsUpdate,
					EnumName: "PLUGINS_UPDATE",
				},
				{
					Name:     "pluginsRollback",
					Path:     httpapi.RoutePluginsRollback,
					EnumName: "PLUGINS_ROLLBACK",
				},
				{
					Name:     "pluginsEnable",
					Path:     httpapi.RoutePluginsEnable,
					EnumName: "PLUGINS_ENABLE",
				},
				{
					Name:     "pluginsDisable",
					Path:     httpapi.RoutePluginsDisable,
					EnumName: "PLUGINS_DISABLE",
				},
				{
					Name:     "pluginsConfig",
					Path:     httpapi.RoutePluginsConfig,
					EnumName: "PLUGINS_CONFIG",
				},
				{
					Name:     "pluginsRestart",
					Path:     httpapi.RoutePluginsRestart,
					EnumName: "PLUGINS_RESTART",
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
			FunctionName:    "route_load_all_project_metadata",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "loadAllProjectMetadata",
			ResponseType:    reflect.TypeOf(AllProjectMetadata{}),
		},
		{
			FunctionName:    "route_load_project_config",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "loadProjectConfig",
			RequestType:     reflect.TypeOf(LoadProjectConfigRequestInput{}),
			ResponseType:    reflect.TypeOf(ProjectStateSingleConfig{}),
		},
		{
			FunctionName:    "route_create_project_config",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "createProjectConfig",
			RequestType:     reflect.TypeOf(CreateProjectConfigRequestInput{}),
			ResponseType:    reflect.TypeOf(CreateProjectConfigResponse("")),
		},
		{
			FunctionName:    "route_delete_sections",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "deleteSections",
			RequestType:     reflect.TypeOf(DeleteSectionsRequestInput{}),
		},
		{
			FunctionName:    "route_delete_selected_params",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "deleteSelectedParams",
			RequestType:     reflect.TypeOf(DeleteSelectedParamsRequestInput{}),
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
			FunctionName:    "route_get_app_gen_skills",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAppGenSkills",
			ResponseType:    reflect.TypeOf(GetAppGenSkillsResponse{}),
		},
		{
			FunctionName:    "route_get_app_gen_skill_content",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAppGenSkillContent",
			RequestType:     reflect.TypeOf(GetAppGenSkillContentRequestInput{}),
			ResponseType:    reflect.TypeOf(AppGenSkillContent{}),
		},
		{
			FunctionName:    "route_upsert_app_gen_custom_skill",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "upsertAppGenCustomSkill",
			RequestType:     reflect.TypeOf(UpsertAppGenCustomSkillRequestInput{}),
			ResponseType:    reflect.TypeOf(UpsertAppGenCustomSkillResponse{}),
		},
		{
			FunctionName:    "route_get_mcp_server_runtime_status",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getMCPServerRuntimeStatus",
			RequestType:     reflect.TypeOf(MCPRuntimeStatusRequestInput{}),
			ResponseType:    reflect.TypeOf(MCPRuntimeStatusResponse{}),
		},
		{
			FunctionName:    "route_get_password_param_value",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getPasswordParamValue",
			RequestType:     reflect.TypeOf(GetPasswordParamValueRequestInput{}),
			ResponseType:    reflect.TypeOf(GetPasswordParamValueResponse{}),
		},
		{
			FunctionName:    "route_get_attachment_download_url",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAttachmentDownloadUrl",
			RequestType:     reflect.TypeOf(GetAttachmentDownloadURLRequestInput{}),
			ResponseType:    reflect.TypeOf(GetAttachmentDownloadURLResponse{}),
		},
		{
			FunctionName:    "route_get_attachment_download_urls",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getAttachmentDownloadUrls",
			RequestType:     reflect.TypeOf(GetAttachmentDownloadURLsRequestInput{}),
			ResponseType:    reflect.TypeOf(GetAttachmentDownloadURLsResponse{}),
		},
		{
			FunctionName:    "route_force_refresh_listener",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "forceRefreshListener",
			RequestType:     reflect.TypeOf(ForceRefreshListenerRequestInput{}),
		},
		{
			FunctionName:    "route_set_top_level_section_layout",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setTopLevelSectionLayout",
			RequestType:     reflect.TypeOf(SetTopLevelSectionLayoutRequestInput{}),
		},
		{
			FunctionName:    "route_group_sections",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "groupSections",
			RequestType:     reflect.TypeOf(GroupSectionsRequestInput{}),
		},
		{
			FunctionName:    "route_ungroup_groups",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "ungroupGroups",
			RequestType:     reflect.TypeOf(UngroupGroupsRequestInput{}),
		},
		{
			FunctionName:    "route_set_active_ids",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setActiveIds",
			RequestType:     reflect.TypeOf(SetActiveIDsRequestInput{}),
		},
		{
			FunctionName:    "route_toggle_param_selected",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "toggleParamSelected",
			RequestType:     reflect.TypeOf(ToggleParamSelectedRequestInput{}),
		},
		{
			FunctionName:    "route_unselect_all_params",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "unselectAllParams",
			RequestType:     reflect.TypeOf(UnselectAllParamsRequestInput{}),
		},
		{
			FunctionName:    "route_set_viewport",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "setViewport",
			RequestType:     reflect.TypeOf(SetViewportRequestInput{}),
		},
		{
			FunctionName:    "route_get_listener_coverage",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getListenerCoverage",
			RequestType:     reflect.TypeOf(ListenerCoverageRequestInput{}),
			ResponseType:    reflect.TypeOf(ListenerCoverageSnapshot{}),
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
		{
			FunctionName:    "route_plugins_runtime",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsRuntime",
			ResponseType:    reflect.TypeOf(PluginRuntimeResponse{}),
		},
		{
			FunctionName:    "route_plugins_rescan",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsRescan",
			ResponseType:    reflect.TypeOf(PluginRescanResponse{}),
		},
		{
			FunctionName:    "route_plugins_install",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsInstall",
			RequestType:     reflect.TypeOf(PluginInstallRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginInstallResponse{}),
		},
		{
			FunctionName:    "route_plugins_uninstall",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsUninstall",
			RequestType:     reflect.TypeOf(PluginUninstallRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginUninstallResponse{}),
		},
		{
			FunctionName:    "route_plugins_update",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsUpdate",
			RequestType:     reflect.TypeOf(PluginUpdateRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginUpdateResponse{}),
		},
		{
			FunctionName:    "route_plugins_rollback",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsRollback",
			RequestType:     reflect.TypeOf(PluginRollbackRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginRollbackResponse{}),
		},
		{
			FunctionName:    "route_plugins_enable",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsEnable",
			RequestType:     reflect.TypeOf(PluginEnableDisableRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginEnableDisableResponse{}),
		},
		{
			FunctionName:    "route_plugins_disable",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsDisable",
			RequestType:     reflect.TypeOf(PluginEnableDisableRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginEnableDisableResponse{}),
		},
		{
			FunctionName:    "route_plugins_config",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsConfig",
			RequestType:     reflect.TypeOf(PluginConfigWriteRequestInput{}),
			ResponseType:    reflect.TypeOf(PluginConfigWriteResponse{}),
		},
		{
			FunctionName:    "route_plugins_restart",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "pluginsRestart",
			ResponseType:    reflect.TypeOf(PluginRestartResponse{}),
		},
	}
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(DependencyKeyType("")),
		reflect.TypeOf(SectionDependencyKey{}),
		reflect.TypeOf(SectionParamDependencyKey{}),
		reflect.TypeOf(BaseDependencyKeyUnion{}),
		reflect.TypeOf(DependencyValueType("")),
		reflect.TypeOf(BinaryContentRef{}),
		reflect.TypeOf(LiteralDependencyValue{}),
		reflect.TypeOf(FileReadDependencyValue{}),
		reflect.TypeOf(BinaryDependencyValue{}),
		reflect.TypeOf(BaseDependencyValueUnion{}),
		reflect.TypeOf(DependencyEvent{}),
	}
}
