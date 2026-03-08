# Go Frontend Binding Generation Plan

## Purpose

Execute the selected follow-on from `CURRENT.md`: move frontend-facing Go
HTTP/websocket contracts onto a Go-owned source of truth using a real
Go-to-TypeScript conversion pipeline, not handwritten TypeScript emitters, and
sever frontend ties to Python-generated backend bindings.

## Why This Slice Is Open Now

- The broad-coverage checklist still marks frontend backend-contract binding
  generation as Python-owned even for Go-owned transports.
- The repo already has a proven Python pattern for this problem:
  `frontend/generation/convert_pydantic_to_js.py` and
  `frontend/generation/convert_endpoints.py`.
- The rewrite needs the Go equivalent of that pattern, not a growing pile of
  route-by-route TS string assembly.

## Working Decision

Use explicit Go contract types plus explicit endpoint specs, then convert those
Go definitions into TypeScript in a reusable generator pipeline.

The transition goal is not a long-lived mixed Go/Python frontend binding
state. During the rewrite, prefer cutting over frontend imports and generated
artifacts to Go ownership even if the overall app is temporarily not in a
working state.

This follow-on does not permit:

- handwritten TS wrappers added one route at a time
- handwritten TS request/response type definitions added one route at a time
- per-route string-builder emission as the primary generator architecture
- preserving Python-generated frontend contract outputs as a parallel steady
  state just to keep partial coexistence working

If a Go runtime type is not suitable for stable frontend generation, introduce
a dedicated Go contract type for the frontend boundary and convert that type.

## Generator Shape

The Go-side generator should mirror the roles of the current Python generators:

- route constants generation
  - source of truth: Go route constants under `internal/httpapi` and
    `internal/wsapi`
- endpoint wrapper generation
  - source of truth: explicit Go endpoint specs including method, route, and
    request/response types
- type generation
  - source of truth: explicit Go contract types converted into TypeScript

Expected outputs:

- canonical frontend generated contract files
  - `frontend/src/utils/generatedRoutes.ts` where applicable
  - `frontend/src/utils/generatedTypes.ts`
  - `frontend/src/utils/generatedEndpoints.ts`

Temporary bootstrap outputs such as `generatedGo*` are allowed only while
proving the converter or landing a bounded cutover slice. They are not the
target architecture and should be deleted as soon as the canonical generated
files are Go-owned.

## Initial Slice

Start by proving the converter pipeline on a small but real Go-owned surface:

- current Go websocket route constants
- current Go status/meta route constants
- the status/meta endpoint cluster and its request/response contract types

This is intentionally small enough to validate the generator architecture
before widening it across more caller-backed Go routes.

Current landed wedge:

- `frontend/src/utils/generatedRoutes.ts`
  - current websocket route constants
  - current status/meta route constants
  - current project-shell route constants
  - current project-state layout/presence/structure-selection route constants
  - current section param-filter, meta-control-title, and group-overflow route
    constants
  - current section param column-width route constants
  - current top-level section creation, view-mode lifecycle, and section-rename
    route constants
  - current code file binding route constants
  - current browser section metadata route constants
  - current file-browser create/read/write/download/transfer route constants
  - current binary payload and bounded artifact route constants
  - current git read route constants
  - current workspace-launch route constants
  - current launcher-home route constants
  - current launcher-management route constants
  - current plugin-management route constants
- `frontend/src/utils/generatedTypes.ts`
  - current status/meta request/response contract types
  - explicit workspace-launch boundary contract types
    - `LaunchRequestInput`
    - `CreateWorkspaceLaunchIntentRequestInput`
    - `CreateWorkspaceLaunchIntentResponse`
    - `LaunchResponse`
    - these are dedicated frontend contract types, not a direct reflection of
      `internal/workspacelaunch.Request`, because the runtime request type also
      carries field-presence semantics for intent storage/validation
  - launcher-home contract types
    - recent-workspace query/mutation payloads
    - filesystem-root and directory-listing payloads
    - `LauncherOpenWorkspaceRequestInput`
    - `LauncherOpenWorkspaceResponse`
    - the open-workspace request stays a dedicated frontend contract type
      rather than reflecting the internal launcher request that tracks
      `settaFilesLocation` presence for runtime behavior
  - launcher-management contract types
    - launcher status and update payloads
    - setup/update request payloads
    - launcher status-query and request-base payloads
    - launcher state enums used by the frontend
  - project-shell and current project-state contract types
    - project metadata and project create/load payloads
      - `ProjectMetadataEntry`
      - `AllProjectMetadata`
      - `LoadProjectConfigRequestInput`
      - `CreateProjectConfigRequestInput`
      - `CreateProjectConfigResponse`
    - current layout/selection/viewport mutation payloads
      - `TopLevelSectionLayoutInput`
      - `SetTopLevelSectionLayoutRequestInput`
      - `SetSectionSizesRequestInput`
      - `SetActiveIDsRequestInput`
      - `ViewportInput`
      - `SetViewportRequestInput`
      - `SetSectionParamFilterRequestInput`
      - `SetMetaControlShowSectionTitleRequestInput`
      - `SetSectionColumnWidthRequestInput`
      - `SetParentDefaultChildSectionTypeRequestInput`
      - `SetListRootViewModeRequestInput`
      - `SetGroupOverflowModeRequestInput`
    - current structure/param-selection mutation payloads
      - `DeleteSectionsRequestInput`
      - `DeleteSelectedParamsRequestInput`
      - `GroupSectionsRequestInput`
      - `UngroupGroupsRequestInput`
      - `ToggleParamSelectedRequestInput`
      - `UnselectAllParamsRequestInput`
    - current browser section metadata payloads
      - `SetBrowserColumnWidthsRequestInput`
      - `SetBrowserAreaViewModeRequestInput`
      - `SetBrowserHideColumnRequestInput`
      - `SetBrowserSavedSearchesRequestInput`
    - current top-level section creation, view-mode lifecycle, and
      section-rename payloads
      - `Position`
      - `CreateTopLevelSectionRequestInput`
      - `CreateTopLevelSectionResponse`
      - `CreateViewModeRequestInput`
      - `CreateViewModeResponse`
      - `SetActiveViewModeRequestInput`
      - `ToggleIsEditingViewModeRequestInput`
      - `ToggleViewModeUserFacingRequestInput`
      - `ToggleViewModeTabRequestInput`
      - `SetViewModeNameRequestInput`
      - `SetViewModeSortOrderRequestInput`
      - `DeleteViewModeRequestInput`
      - `SetSectionNameRequestInput`
    - current code file binding payloads
      - `CodeFileBindingUpdate`
      - `SetCodeFileBindingRequestInput`
    - current git read payloads and responses
      - `GitDiffMode`
      - `GitRepoInfo`
      - `GitStatusEntry`
      - `GetGitStatusResponse`
      - `GetGitDiffRequestInput`
      - `GetGitDiffResponse`
      - `GitCommit`
      - `GetGitLogRequestInput`
      - `GetGitLogResponse`
      - `GitCommitChangedFile`
      - `GetGitCommitDetailsRequestInput`
      - `GetGitCommitDetailsResponse`
      - `GetGitCommitFileDiffRequestInput`
      - `GetGitCommitFileDiffResponse`
    - shared project-state/core types used by current callers
      - `SectionType`
      - `CodeObjType`
      - `ListRootViewMode`
      - `Core`
      - `Variant`
      - `ProjectConfig`
      - `ProjectStateSingleConfig`
      - `ProjectStateSingleConfigWithCompletedOpIds`
      - `SettingsState`
    - current canonical project-state helper support used by current callers
      - `ViewModeConfig` plus `createViewMode` and `createViewModeConfig`
      - shared code binding enums/types
        - `CodeFileAccessMode`
        - `CodeFileBinding`
      - current settings helper/enums used by current callers
        - `SettingsShortcuts`
        - `SettingsGUI`
        - `SettingsBackend`
        - `SectionSizingPolicy`
        - `createSettingsShortcuts`
        - `createSettingsGUI`
        - `createSettingsBackend`
        - `createSectionSizingPolicy`
        - `RenameRefactorMode`
        - `BackgroundVariant`
        - `SelectionMode`
        - `PanOnScrollMode`
        - `MetaControlSizeMode`
      - current section sizing enums/types/helpers used by current callers
        - `SectionSizeMode`
        - `SectionSizeValue`
        - `SectionSize`
        - `createSectionSize`
      - current project-codegen target enums/types/helpers used by current
        callers
        - `ProjectCodegenLanguage`
        - `SectionCodegenMode`
        - `SectionRepresentationMode`
        - `CodeObjValueRepresentationMode`
        - `SectionTypeCodegenPolicy`
        - `SectionCodegenOverride`
        - `SectionCodegenPolicy`
        - `CodeObjTypeValuePolicy`
        - `CodeObjValueOverride`
        - `CodeObjValuePolicy`
        - `ProjectCodegenPythonTarget`
        - `ProjectCodegenPluginTarget`
        - `ProjectCodegenTarget`
        - `createSectionCodegenPolicy`
        - `createCodeObjValuePolicy`
        - `createProjectCodegenPythonTarget`
        - `createProjectCodegenPluginTarget`
        - `ProjectConfig.codegenTargets` now uses the canonical
          `Array<ProjectCodegenTarget>` surface instead of
          `Array<Record<string, unknown>>`
      - section/default factories for `Callable`, `Dict`, `ListRoot`,
        `TextBlock`, `Code`, `Terminal`, `Chat`, `Browser`, `TaskBoard`, and
        `Spreadsheet`
      - browser shared enums and helpers
        - `BrowserAreaViewMode`
        - `BrowserSearchScope`
        - `BrowserSavedSearchTypeFilters`
        - `BrowserSavedSearch`
        - `createBrowserSavedSearchTypeFilters`
        - `createBrowserSavedSearch`
      - current code-object helper/type coverage for `CodeParam` plus the
        caller-used param-UI impl shapes for `CodeCallable`, `TextParam`,
        `DateParam`, `TimeParam`, `ButtonParam`, `SliderParam`,
        `RotaryParam`, `SwitchParam`, `ColorPickerParam`,
        `DropdownParam`, `PasswordParam`, `TextAreaParam`,
        `DropzoneParam`, and `NestedParam`
      - current code-object type-set exports used by UI config callers
        - `BaseChildlessCodeObjImplTypeSet`
        - `BaseParamCodeObjImplTypeSet`
        - `ControlCodeObjTypeSet`
        - `SectionParamCodeObjTypeSet`
      - chat message/tool-call helpers and chat section state/branch payloads
      - agentic-edge enums/helper support
        - `AgenticEdgeKind`
        - `AgenticEdgeContextMode`
        - `createAgenticEdge`
      - runtime enums used by the current helper callers, including
        `CodeLanguage`, `CodeFileAccessMode`, `ConfigLanguage`,
        `TextBlockFormat`,
        `TextBlockDisplayMode`, `ChatRole`, `ChatPermissionMode`,
        `ChatDictationMode`, `TaskBoardViewMode`,
        `TaskBoardTaskRecurrence`, `TaskBoardRecurringWeekday`,
        `TaskBoardRecurringMonth`, `SpreadsheetGridDensity`,
        `ParamNameType`, `ParameterPassingStyle`,
        `ButtonActionMode`, `HttpRequestMethod`, `DropzoneMode`,
        `TextParamInputUIType`, `TimeDisplayFormat`, `TimeControlMode`,
        `TimeDisplayFont`, `DateDisplayFormat`, `DateControlMode`,
        `DateSelectionMode`, and `DateCalendarWeekStart`
    - current frontend websocket transport helper/types used by current callers
      - `WebsocketConnectionType`
      - `WebsocketConnectionInfo`
      - `WebsocketMsgTypeForFrontend`
      - `WebsocketMsgTypeForBackend`
      - `WebsocketMsg`
      - `FrontendWebsocketMsgUnion`
      - `WebsocketMsgCurrentAddressUpdate`
      - `WebsocketMsgRealtimeUIChange`
      - `WebsocketMsgRealtimeDependencyEvent`
      - `WebsocketMsgUISettingRevealResult`
      - `createWebsocketConnectionInfo`
      - `createWebsocketMsgCurrentAddressUpdate`
      - `UISettingRevealContent`
      - `UISettingRevealContentSchema`
    - current shared AI runtime/helper types used by current callers
      - `EngineType`
      - `EngineConfigDefaults`
      - `EngineConfig`
      - `createEngineConfig`
      - `AgentProfile`
      - `TranscriptionTransportMode`
      - `TranscriptionProfile`
      - `AgentRunStatus`
      - `RunEvent`
      - `createRunEvent`
      - `AgentRun`
      - `createAgentRun`
      - `StreamingEventType`
      - `MessageStartEvent`
      - `MessageDeltaEvent`
      - `ToolCallDeltaEvent`
      - `ToolResultEvent`
      - `ToolArgumentPreviewDeltaEvent`
      - `MessageStopEvent`
      - `MessageFinalizedEvent`
      - `LLMStreamingResponse`
    - current project-level AI settings/config types used by current pure
      callers
      - LLM config and API-key support
        - `APIKeys`
        - `LLMConfig`
        - `createLLMConfig`
        - `MCPServerTransport`
        - `MCPServerConfig`
        - `AllLLMConfigs`
        - `createAllLLMConfigs`
      - external-agent settings/config support
        - `ExternalAgentToolType`
        - `ExternalAgentRunMode`
        - `ExternalAgentSettingsMode`
        - `ExternalAgentWorkingDirStrategy`
        - `ClaudeSettingsSource`
        - `ExternalAgentConfig`
        - `createExternalAgentConfig`
        - `ExternalAgentPreflightStatus`
        - `createExternalAgentPreflightStatus`
      - prompt-template settings support
        - `PromptFormat`
        - `PromptTemplate`
        - `createPromptTemplate`
      - project-level AI transport/action support used by the current
        `state/actions/ai` and notification callers
        - managed API-key snapshot payloads
        - notification enum/object support
          - `SettaNotificationType`
          - `SettaNotification`
        - request payloads for agent-profile CRUD, engine-config update,
          transcription-profile CRUD, prompt-template CRUD,
          external-agent-config CRUD, and chat-section state persistence
        - transport payloads for agent/profile/run/config/profile list reads,
          managed/external chat hydration, managed-chat stop results,
          transcription session start/delta responses, and string chat-id
          responses from `getLLMResponse`
  - app-config pane contract types
    - `AppCatalogResponse` and the catalog component/action/prop payloads
    - `AppDefinition`, `AppRoute`, and the app-definition read/mutation
      payloads
    - validation result payloads for `validateAppDefinition`
    - these are dedicated frontend contract types rather than a direct dump of
      `projectstate.AppDefinition`, because the runtime metadata uses
      `json.RawMessage` while the frontend boundary needs structured JSON
      values
  - plugin-management contract types
    - runtime/status payloads
      - `PluginRuntimeResponse`
      - `PluginListResponse`
      - `PluginStatusResponse`
      - `PluginListEntry`
      - `PluginStatusEntry`
      - `PluginRestartCapability`
    - mutation payloads
      - `PluginInstallRequestInput`
      - `PluginInstallResponse`
      - `PluginEnableDisableRequestInput`
      - `PluginEnableDisableResponse`
      - `PluginUninstallRequestInput`
      - `PluginUninstallResponse`
      - `PluginUpdateRequestInput`
      - `PluginUpdateResponse`
      - `PluginRollbackRequestInput`
      - `PluginRollbackResponse`
      - `PluginConfigWriteRequestInput`
      - `PluginConfigWriteResponse`
      - `PluginRestartResponse`
      - `PluginRescanResponse`
    - runtime enums and nested registration/config payloads
      - `PluginScope`
      - `PluginRuntimeState`
      - `PluginEnablementSource`
      - `PluginSourceManager`
      - `PluginInstallerBackend`
      - `PluginSourceTrustStatus`
      - `PluginBlockedCapabilityReason`
      - `PluginRestartCapabilityMode`
      - `PluginBlockedCapability`
      - `PluginErrorInfo`
      - `PluginFrontendDescriptor`
      - `PluginContentDescriptor`
      - `PluginConfigDescriptor`
      - `PluginRegisteredLanguageServer`
      - `PluginRegisteredExternalAgentAdapter`
      - `PluginRegisteredCodegenTarget`
  - binary payload and bounded artifact contract types used by the current
    callers
    - binary transport payloads
      - `BinaryUploadRequestInput`
      - `BinaryDownloadRequestInput`
      - `BinaryDownloadResponse`
    - artifact transport payloads
      - `ImportFilesToArtifactsRequestInput`
      - `ImportFilesToArtifactsResponse`
      - `LoadCachedArtifactsRequestInput`
      - `LoadCachedImageArtifactsResponse`
      - `LoadCachedChartDataResponse`
      - `LoadCachedBrushStrokesResponse`
      - `LoadCachedDrawAreaLayerItemTransformResponse`
      - `UpdateArtifactsRequestInput`
      - `UpdateArtifactsResponse`
      - `DeleteArtifactsRequestInput`
      - `DeleteArtifactsResponse`
    - shared artifact/draw-area runtime types and helpers
      - `ArtifactType`
      - `DrawAreaBrushShape`
      - `DrawAreaMode`
      - `CanvasPoint`
      - `DrawAreaTransform`
      - `BrushStroke`
      - `BrushStrokeWithTransform`
      - `DrawAreaLayerItemTransform`
      - `DrawAreaLayerItem`
      - `DrawAreaLayer`
      - `ImageArtifact`
      - `BrushStrokeArtifact`
      - `DrawAreaLayerItemTransformArtifact`
      - `ChartDataArtifact`
      - `FileArtifact`
      - `ImageMapping`
      - `BrushStrokeMapping`
      - `DrawAreaLayerItemTransformMapping`
      - `ChartDataMapping`
      - `FileMapping`
      - `UpdateArtifactMsgContent`
      - `createBrushStroke`
      - `createBrushStrokeArtifact`
      - `createDrawAreaLayer`
      - `createDrawAreaLayerItem`
      - `createDrawAreaLayerItemTransform`
      - `createDrawAreaLayerItemTransformArtifact`
- `frontend/src/utils/generatedEndpoints.ts`
  - current status/meta endpoint wrappers
  - project-shell and current project-state endpoint wrappers
    - `route_load_all_project_metadata`
    - `route_load_project_config`
    - `route_create_project_config`
    - `route_delete_sections`
    - `route_delete_selected_params`
    - `route_create_top_level_section`
    - `route_create_view_mode`
    - `route_set_active_view_mode`
    - `route_toggle_is_editing_view_mode`
    - `route_toggle_view_mode_user_facing`
    - `route_toggle_view_mode_tab`
    - `route_set_view_mode_name`
    - `route_set_view_mode_sort_order`
    - `route_delete_view_mode`
    - `route_set_section_name`
    - `route_set_top_level_section_layout`
    - `route_group_sections`
    - `route_ungroup_groups`
    - `route_set_active_ids`
    - `route_toggle_param_selected`
    - `route_unselect_all_params`
    - `route_set_viewport`
  - workspace-launch endpoint wrappers
    - `route_create_workspace_launch_intent`
    - `route_launch`
  - launcher-home endpoint wrappers
    - `route_get_launcher_recent_workspaces`
    - `route_add_launcher_recent_workspace`
    - `route_remove_launcher_recent_workspace`
    - `route_pin_launcher_recent_workspace`
    - `route_get_launcher_filesystem_roots`
    - `route_list_launcher_directory`
    - `route_open_launcher_workspace`
  - launcher-management endpoint wrappers
    - `route_get_launcher_status`
    - `route_setup_launcher`
    - `route_repair_launcher`
    - `route_remove_launcher`
    - `route_update_launcher`
  - app-config pane endpoint wrappers
    - `route_get_app_catalog`
    - `route_get_app_definition`
    - `route_set_app_definition`
    - `route_validate_app_definition`
  - LSP diagnostics/admin endpoint wrappers
    - `route_get_latest_lsp_diagnostics`
    - `route_restart_language_server`
    - `route_set_type_error_ignore`
    - `route_type_check`
  - LSP diagnostics/admin contract types
    - `SettaLspDiagnostic`
    - `SettaLspDiagnosticRange`
    - `SettaLspDiagnosticPosition`
    - `SettaSectionTypeErrors`
    - `SettaProjectConfigDiagnostics`
    - `SettaLspDiagnosticsPayload`
  - project-level AI skills and MCP viewer endpoint wrappers
    - `route_get_app_gen_skills`
    - `route_get_app_gen_skill_content`
    - `route_upsert_app_gen_custom_skill`
    - `route_get_mcp_server_runtime_status`
  - project-level AI skills and MCP viewer contract types
    - `AppGenSkillEntry`
    - `AppGenSkillContent`
    - `GetAppGenSkillsResponse`
    - `UpsertAppGenCustomSkillResponse`
    - `MCPServerRuntimeStatus`
    - `MCPRuntimeStatusResponse`
  - password reveal helper endpoint wrapper
    - `route_get_password_param_value`
  - password reveal helper contract types
    - `GetPasswordParamValueRequestInput`
    - `GetPasswordParamValueResponse`
  - attachment download helper endpoint wrappers
    - `route_get_attachment_download_url`
    - `route_get_attachment_download_urls`
  - file-browser endpoint wrappers
    - `route_create_file`
    - `route_check_if_file_exists`
    - `route_check_workspace_initialized`
    - `route_get_file_browser_root`
    - `route_get_folder_contents`
    - `route_get_file_browser_download_urls`
    - `route_get_file_browser_file_content`
    - `route_get_file_browser_file_stat`
    - `route_write_file_browser_file_content`
    - `route_transfer_file_browser_entry`
  - browser section metadata endpoint wrappers
    - `route_set_browser_column_widths`
    - `route_set_browser_area_view_mode`
    - `route_set_browser_hide_column`
    - `route_set_browser_saved_searches`
  - binary payload and bounded artifact endpoint wrappers
    - `route_binary_upload`
    - `route_binary_download`
    - `route_import_files_to_artifacts`
    - `route_load_cached_image_artifacts`
    - `route_load_cached_chart_data`
    - `route_load_cached_brush_strokes`
    - `route_load_cached_draw_area_layer_item_transform`
    - `route_update_artifacts`
    - `route_delete_artifacts`
  - attachment download helper contract types
    - `GetAttachmentDownloadURLRequestInput`
    - `GetAttachmentDownloadURLResponse`
    - `GetAttachmentDownloadURLsRequestInput`
    - `AttachmentDownloadURLEntry`
    - `GetAttachmentDownloadURLsResponse`
  - file-browser contract types
    - `CreateFileRequestInput`
    - `CheckIfFileExistsRequestInput`
    - `CheckIfFileExistsResponse`
    - `CheckWorkspaceInitializedRequestInput`
    - `CheckWorkspaceInitializedResponse`
    - `FileBrowserRootResponse`
    - `MissingFolderBehavior`
    - `GetFolderContentsRequestInput`
    - `FolderContentItemType`
    - `FolderContentItem`
    - `GetFolderContentsResponse`
    - `GetFileBrowserDownloadURLsRequestInput`
    - `FileBrowserDownloadURLEntry`
    - `GetFileBrowserDownloadURLsResponse`
    - `GetFileBrowserFileContentRequestInput`
    - `FileBrowserFileContentResponse`
    - `GetFileBrowserFileStatRequestInput`
    - `FileBrowserFileStatResponse`
    - `WriteFileBrowserFileContentRequestInput`
    - `WriteFileBrowserFileContentResponse`
    - `TransferOperation`
    - `TransferFileBrowserEntryRequestInput`
    - `TransferFileBrowserEntryResponse`
  - listener force-refresh endpoint wrapper
    - `route_force_refresh_listener`
  - listener coverage endpoint wrapper
    - `route_get_listener_coverage`
  - listener coverage and realtime dependency contract types
    - `ListenerCoverageRequestInput`
    - `ListenerCoverageSnapshot`
    - `DependencyKeyType`
    - `SectionDependencyKey`
    - `SectionParamDependencyKey`
    - `BaseDependencyKeyUnion`
    - `DependencyValueType`
    - `BinaryContentRef`
    - `LiteralDependencyValue`
    - `FileReadDependencyValue`
    - `BinaryDependencyValue`
    - `BaseDependencyValueUnion`
    - `DependencyEvent`
  - listener force-refresh contract type
    - `ForceRefreshListenerRequestInput`
  - plugin-management endpoint wrappers
    - `route_plugins_runtime`
    - `route_plugins_rescan`
    - `route_plugins_install`
    - `route_plugins_uninstall`
    - `route_plugins_update`
    - `route_plugins_rollback`
    - `route_plugins_enable`
    - `route_plugins_disable`
    - `route_plugins_config`
    - `route_plugins_restart`
  - project-level AI endpoint wrappers used by the current action layer
    - config/settings transport
      - `route_get_llm_config`
      - `route_set_llm_config`
      - `route_get_llm_api_keys`
      - `route_set_llm_api_keys`
      - `route_get_agent_profiles`
      - `route_create_agent_profile`
      - `route_update_agent_profile`
      - `route_delete_agent_profile`
      - `route_get_agent_runs`
      - `route_get_engine_configs`
      - `route_update_engine_config`
      - `route_get_prompt_templates`
      - `route_create_prompt_template`
      - `route_update_prompt_template`
      - `route_delete_prompt_template`
      - `route_get_external_agent_configs`
      - `route_get_external_agent_health`
      - `route_create_external_agent_config`
      - `route_update_external_agent_config`
      - `route_delete_external_agent_config`
      - `route_get_transcription_profiles`
      - `route_create_transcription_profile`
      - `route_update_transcription_profile`
      - `route_delete_transcription_profile`
    - transcription/chat transport
      - `route_start_transcription_session`
      - `route_append_transcription_audio`
      - `route_stop_transcription_session`
      - `route_cancel_transcription_session`
      - `route_get_llm_response`
      - `route_get_llm_chat`
      - `route_stop_llm_chat`
      - `route_get_external_agent_chat`
      - `route_stop_external_agent_run`
      - `route_respond_external_agent_approval`
      - `route_respond_external_agent_question`
      - `route_set_chat_section_state`
      - `route_set_chat_section_chat_id`
- active caller adoption
  - `GlobalWrapper`, `WorktreeHint`, `initializeServerMode`,
    `websocketReceive`, and the `settaHomeInfo` read in
    `WorkspaceSwitcherModal` now consume the canonical Go-generated modules
    for this initial slice
  - `WorkspaceSwitcherModal`, `WorkspaceLaunchPage`,
    `workspaceSwitcherLaunch`, and `launchRequestDedupeKey` now consume the
    canonical Go-generated workspace-launch bindings
  - `LauncherHomePage` now consumes the canonical Go-generated launcher-home
    bindings
  - `DesktopLauncherSettingsSection` now consumes the canonical Go-generated
    launcher-management bindings
  - `AppConfigPane` now consumes the canonical Go-generated app-config
    bindings
  - `loadProjectConfig`, `processLspDiagnostics`, `requestTypeCheck`,
    `restartLanguageServer`, and `TypeErrorContextMenu` are now covered by
    canonical Go-generated LSP diagnostics/admin bindings
  - `ProjectChatSkillsMcpViewer` is now covered by canonical Go-generated
    app-gen-skill and MCP-runtime bindings
  - the current pure project-level AI settings/config helper callers,
    including `buildLLMConfigGroups`, `resolveProviderDictationAvailability`,
    `ProjectLLMSettings`, and `projectChatSkillsMcpViewerUtils`, now consume
    canonical Go-generated AI settings/config types and enums
  - `state/actions/ai`, `state/actions/notifications`, and the current
    project-level AI settings pane now consume canonical Go-generated AI
    route wrappers and boundary types for LLM config/API keys, agent-profile,
    engine-config, prompt-template, external-agent-config, transcription,
    managed/external chat hydrate-stop-submit flows, and chat-section state
    persistence
  - `ParamInput` and the app-mode password reveal path in `appRegistry` are
    now covered by the canonical Go-generated password-value helper binding
  - `AppRenderer` and `ChatMessages` are now covered by canonical
    Go-generated attachment download helper bindings
  - `runOrImportCode`, `RunButton`, and `AppRenderer` now consume canonical
    Go-generated terminal HTTP bindings for `runCode` and
    `killSubprocesses`; the deferred deployment/share/app terminal websocket
    viewing gap remains unchanged
  - `triggerListenerForceRefresh`, `fetchListenerCoverageSnapshot`, and the
    current listener-coverage dependency-key helpers now consume canonical
    Go-generated listener bindings and dependency contracts
  - `state/actions/git`, `state/git`, `GitDiffOverlay`, and
    `GitGraphOverlay` now consume canonical Go-generated git route wrappers
    and contract types
  - the current project create/load flow plus the layout/selection/viewport
    publishers in `sectionInfos` now consume canonical Go-generated
    project-shell and current project-state bindings
  - the current section delete/group/ungroup and param-selection callers in
    `sectionInfos`, `SelectionContextMenu`, `DeleteOrHideButton`,
    `UngroupButton`, `KwargsControls`, and `PluginArea` now consume canonical
    Go-generated project-state mutation bindings
  - `KwargsControls` and `EdgePortsSettings` now consume canonical
    Go-generated `setSectionEdgeInputs` and `setSectionEdgeOutputs` bindings
    for the current edge-input/output mutation slice, including the
    `GlobalVariables` conversion path and edge-cleanup semantics owned by Go
  - `createSections`, `ViewingEditingMode`, `ViewModeTabs`, `SectionTitle`,
    and the Setta API preset helper now consume canonical Go-generated
    top-level section creation, view-mode lifecycle, and section-rename
    bindings
  - the current settings-backed UI/layout caller cluster in `ProjectNav`,
    `ProjectPageSearch`, `GlobalWrapper`, `DictArea`, `GroupContainer`,
    `FlowRenderer`, `ZoomPane`, `Pane`, `Background`, `ProjectAISettings`,
    `PluginsPane`, and `RenameReferencesModal` now consumes canonical
    Go-generated settings helpers and enums instead of the legacy
    Python-generated surface
  - `VariantList`, `EdgePortsSettings`, and `ParamNameInput` now consume the
    canonical Go-generated base-dict section helper surface needed for
    JSON-source and top-level-param-aware dict-section behavior
  - `ParamSwitch`, `ParamDndMonitor`, `state/actions/params/paramTree`, and
    `state/actions/params/moveParams` now consume the canonical
    Go-generated base-parent code-object helper surface needed for nested
    param tree behavior
  - `plugins/runtime`, `plugins/restart`, and the current `PluginsPane`
    plugin runtime/mutation callers now consume canonical Go-generated plugin
    bindings for plugin runtime/status/config/restart/install/update/rollback
    and enable/disable operations, plus the shared project-state/core bindings
  - `websocketReceive`, `realtimeDependencySend`, and
    `WebsocketConnections` now consume canonical Go-generated frontend
    websocket message enums/helpers and the bounded UI-setting reveal payload
    validator needed by the active `/ws/frontend` caller
    they load during bootstrap/runtime mutation flows

## Cutover Rule

- The steady state is a single frontend-generated contract surface, not
  parallel Python-owned and Go-owned modules.
- The canonical generated frontend files are now the active cutover target for
  the converted slice; do not reintroduce `generatedGo*` shadow outputs.
- Do not spend rewrite effort preserving Python-generated binding consumers
  that only exist to keep the app partially working during the transition.

## Rules

- Prefer explicit Go contract types over reflection on arbitrary runtime
  structs.
- Prefer converter rules and reusable rendering over ad hoc output assembly.
- Keep transport wrappers thin.
- Keep the generated surface deliberate and reviewable.
- When widening coverage, reuse the converter pipeline instead of adding
  one-off generator branches.

## Non-Goals

- replacing every `generatedTypes.ts` consumer in one pass
- recreating dormant Python-only helper surfaces without a caller
- reflecting arbitrary Go runtime internals directly into frontend types
- preserving Python route naming or wrapper shape when no current caller needs
  it
