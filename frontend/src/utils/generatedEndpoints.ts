import { get, post, ResponseDataAndStatus } from "./endpointUtils";
import * as gt from "./generatedTypes";

async function route_bootstrap_page(): Promise<ResponseDataAndStatus<string>> {
  return await get("/__setta__/bootstrap");
}

async function route_bootstrap_consume(
  payload: gt.BootstrapConsumeRequestInput | null,
): Promise<ResponseDataAndStatus<Record<string, string>>> {
  return await post("/__setta__/bootstrap/consume", payload);
}

export async function route_load_all_project_metadata(): Promise<
  ResponseDataAndStatus<gt.AllProjectMetadata>
> {
  return await post("/loadAllProjectMetadata", null);
}

export async function route_load_project_config(
  x: gt.ProjectLoadRequestInput,
): Promise<ResponseDataAndStatus<gt.ProjectStateSingleConfig>> {
  return await post("/loadProjectConfig", x);
}

export async function route_save_project(
  x: gt.ManualSaveRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveProject", x);
}

export async function route_save_as_new_project_config(
  x: gt.SaveAsNewProjectConfigRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveAsNewProjectConfig", x);
}

export async function route_create_project_config(
  x: gt.CreateProjectConfigRequestInput,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/createProjectConfig", x);
}

export async function route_delete_project_configs(
  x: gt.DeleteProjectConfigsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteProjectConfigs", x);
}

export async function route_set_project_config_name(
  x: gt.SetProjectConfigNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setProjectConfigName", x);
}

export async function router_get_default_project_config_name(): Promise<
  ResponseDataAndStatus<string | null>
> {
  return await post("/getDefaultConfigName", null);
}

export async function router_set_as_default_project(
  x: gt.SetAsDefaultProjectRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setAsDefaultProject", x);
}

export async function route_get_notifications(
  x: gt.GetNotificationsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.SettaNotification>>> {
  return await post("/getNotifications", x);
}

export async function route_delete_notification(
  x: gt.DeleteNotificationRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteNotification", x);
}

async function route_new_json_version_name(
  x: gt.NewJSONVersionNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/newJsonVersionName", x);
}

async function route_create_file(
  x: gt.CreateFileRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createFile", x);
}

async function route_get_json_source_path_to_be_deleted(
  x: gt.GetJSONSourcePathToBeDeletedInput,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/getJsonSourcePathToBeDeleted", x);
}

async function route_delete_terminals(
  x: gt.DeleteTerminalsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteTerminals", x);
}

export async function route_kill_subprocesses(
  x: gt.KillSubprocessesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/killSubprocesses", x);
}

export async function route_run_code(
  x: gt.RunCodeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/runCode", x);
}

export async function route_docstring_to_markdown(
  x: gt.DocstringToMarkdownRequestInput,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/docstringToMarkdown", x);
}

export async function route_save_settings(
  x: gt.SaveSettingsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveSettings", x);
}

export async function route_load_settings(): Promise<
  ResponseDataAndStatus<gt.SettingsState>
> {
  return await post("/loadSettings", null);
}

export async function route_check_if_file_exists(
  x: gt.CheckIfFileExistsRequestsInput,
): Promise<ResponseDataAndStatus<boolean>> {
  return await post("/checkIfFileExists", x);
}

export async function route_get_folder_contents(
  x: gt.GetFolderContentsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.FolderContentItem>>> {
  return await post("/getFolderContents", x);
}

export async function route_load_cached_image_artifacts(
  x: gt.LoadCachedPathsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ImageArtifact | null>>> {
  return await post("/loadCachedImageArtifacts", x);
}

export async function route_load_cached_chart_data(
  x: gt.LoadCachedPathsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ChartDataArtifact | null>>> {
  return await post("/loadCachedChartData", x);
}

export async function route_load_cached_brush_strokes(
  x: gt.LoadCachedPathsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.BrushStrokeArtifact | null>>> {
  return await post("/loadCachedBrushStrokes", x);
}

export async function route_load_cached_draw_area_layer_item_transform(
  x: gt.LoadCachedPathsRequestInput,
): Promise<
  ResponseDataAndStatus<Array<gt.DrawAreaLayerItemTransformArtifact | null>>
> {
  return await post("/loadDrawAreaLayerItemTransform", x);
}

export async function route_update_artifacts(
  x: gt.UpdateArtifactsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ArtifactSaveResult>>> {
  return await post("/updateArtifacts", x);
}

export async function route_get_listener_coverage(
  x: gt.ListenerCoverageRequestInput,
): Promise<ResponseDataAndStatus<gt.ListenerCoverageSnapshot>> {
  return await post("/getListenerCoverage", x);
}

async function route_create_chat(
  x: gt.CreateChatRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/createChat", x);
}

async function route_get_chat(
  x: gt.GetChatRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/getChat", x);
}

async function route_append_chat_messages(
  x: gt.AppendChatMessagesRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/appendChatMessages", x);
}

async function route_delete_chat(
  x: gt.DeleteChatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteChat", x);
}

async function route_set_chat_system_prompt(
  x: gt.SetChatSystemPromptRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/setChatSystemPrompt", x);
}

async function route_get_all_chat_metadata(
  x: gt.GetAllChatMetadataRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ChatMetadata>>> {
  return await post("/getAllChatMetadata", x);
}

async function route_run_mcp_tools(
  x: gt.RunMcpToolsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ToolChatMessage>>> {
  return await post("/runMcpTools", x);
}

async function route_emit_chat_stream_delta(
  x: gt.EmitChatStreamDeltaRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/emitChatStreamDelta", x);
}

export async function route_restart_language_server(): Promise<
  ResponseDataAndStatus<null>
> {
  return await post("/restartLanguageServer", null);
}

export async function route_type_check(
  x: gt.TypeCheckRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/typeCheck", x);
}

export async function route_get_llm_config(): Promise<
  ResponseDataAndStatus<gt.AllLLMConfigs>
> {
  return await get("/llm/config");
}

async function route_set_llm_config(
  config: gt.AllLLMConfigsInput,
): Promise<ResponseDataAndStatus<gt.AllLLMConfigs>> {
  return await post("/llm/config", config);
}

export async function route_get_llm_api_keys(): Promise<
  ResponseDataAndStatus<Record<string, string>>
> {
  return await get("/llm/apiKeys");
}

async function route_set_llm_api_keys(
  payload: gt.UpdateAPIKeysRequestInput,
): Promise<ResponseDataAndStatus<Record<string, string>>> {
  return await post("/llm/apiKeys", payload);
}

export async function route_get_llm_response(
  x: gt.GetLLMResponseRequestInput,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/getLLMResponse", x);
}

export async function route_get_all_llm_chat_metadata(): Promise<
  ResponseDataAndStatus<Array<gt.ChatMetadata>>
> {
  return await post("/getAllLLMChatMetadata", null);
}

export async function route_delete_llm_chat(
  x: gt.DeleteLLMChatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteLLMChat", x);
}

export async function route_stop_llm_chat(
  x: gt.StopLLMChatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/stopLLMChat", x);
}

export async function route_get_llm_chat(
  x: gt.GetLLMChatRequestInput,
): Promise<ResponseDataAndStatus<gt.GetLLMChatRequestResponse>> {
  return await post("/getLLMChat", x);
}

export async function route_get_ai_follow_snapshot(
  x: gt.GetAIFollowSnapshotRequestInput,
): Promise<
  ResponseDataAndStatus<Array<gt.AIFollowToolArgumentsUpdateContent>>
> {
  return await post("/getAIFollowSnapshot", x);
}

async function route_list_agent_profiles(): Promise<
  ResponseDataAndStatus<Array<gt.AgentProfile>>
> {
  return await get("/agentic/profiles");
}

async function route_get_agent_profile(
  profileId: gt.ID,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await get("/agentic/profiles/{profileId}", { profileId });
}

async function route_create_agent_profile(
  x: gt.CreateAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await post("/agentic/profiles", x);
}

async function route_update_agent_profile(
  profileId: gt.ID,
  x: gt.UpdateAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await post("/agentic/profiles/{profileId}/update", x, { profileId });
}

async function route_delete_agent_profile(
  profileId: gt.ID,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/agentic/profiles/{profileId}/delete", null, {
    profileId,
  });
}

async function route_list_agent_runs(
  agentProfileId: gt.ID | null,
): Promise<ResponseDataAndStatus<Array<gt.AgentRun>>> {
  return await get("/agentic/runs", { agentProfileId });
}

async function route_get_agent_run(
  runId: gt.ID,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await get("/agentic/runs/{runId}", { runId });
}

async function route_start_agent_run(
  x: gt.StartAgentRunRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/agentic/runs", x);
}

async function route_stop_agent_run(
  runId: gt.ID,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/agentic/runs/{runId}/stop", null, { runId });
}

async function route_list_prompt_assets(): Promise<
  ResponseDataAndStatus<Array<gt.PromptTemplate>>
> {
  return await get("/agentic/prompts");
}

async function route_get_prompt_asset(
  promptId: gt.ID,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await get("/agentic/prompts/{promptId}", { promptId });
}

async function route_create_prompt_asset(
  x: gt.CreatePromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await post("/agentic/prompts", x);
}

async function route_update_prompt_asset(
  promptId: gt.ID,
  x: gt.UpdatePromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await post("/agentic/prompts/{promptId}/update", x, { promptId });
}

async function route_delete_prompt_asset(
  promptId: gt.ID,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/agentic/prompts/{promptId}/delete", null, { promptId });
}

export async function route_clear_text_field_completion(
  x: gt.ClearTextFieldCompletionRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/clearTextFieldCompletion", x);
}

export async function route_set_callable(
  x: gt.SetCallableRequestInput,
): Promise<ResponseDataAndStatus<gt.SetCallableResponse>> {
  return await post("/setCallable", x);
}

export async function route_text_field_completion(
  x: gt.TextFieldCompletionRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/textFieldCompletion", x);
}

export async function route_output_accessor_completion(
  x: gt.OutputAccessorCompletionRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/outputAccessorCompletion", x);
}

export async function route_code_area_completion(
  x: gt.CodeAreaCompletionRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/codeAreaCompletion", x);
}

export async function route_gen_code_prefix_completion(
  x: gt.GenCodePrefixCompletionRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/genCodePrefixCompletion", x);
}

export async function route_gen_code_suffix_completion(
  x: gt.GenCodeSuffixCompletionRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/genCodeSuffixCompletion", x);
}

export async function route_change_param_impl(
  x: gt.ChangeParamImplRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/changeParamImpl", x);
}

export async function route_update_param_impl_config(
  x: gt.UpdateParamImplConfigRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/updateParamImplConfig", x);
}

export async function route_create_top_level_section(
  x: gt.CreateTopLevelSectionRequestInput,
): Promise<ResponseDataAndStatus<gt.CreateTopLevelSectionResponse>> {
  return await post("/createTopLevelSection", x);
}

async function route_create_child_sections(
  x: gt.CreateChildSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createChildSections", x);
}

export async function route_create_child_sections_via_incrementer(
  x: gt.CreateChildSectionsViaIncrementerRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createChildSectionsViaIncrementer", x);
}

export async function route_delete_sections(
  x: gt.DeleteSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteSections", x);
}

export async function route_delete_child_sections_via_decrementer(
  x: gt.DeleteChildSectionsViaDecrementerRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteChildSectionsViaDecrementer", x);
}

export async function route_create_new_section_variant(
  x: gt.CreateNewSectionVariantRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createNewSectionVariant", x);
}

export async function route_create_view_mode(
  x: gt.CreateViewModeRequestInput,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/createViewMode", x);
}

export async function route_set_active_view_mode(
  x: gt.SetActiveViewModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setActiveViewMode", x);
}

export async function route_toggle_is_editing_view_mode(
  x: gt.ToggleIsEditingViewModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleIsEditingViewMode", x);
}

export async function route_toggle_section_visibility(
  x: gt.ToggleSectionVisibilityRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleSectionVisibility", x);
}

export async function route_toggle_view_mode_user_facing(
  x: gt.ToggleViewModeUserFacingRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleViewModeUserFacing", x);
}

export async function route_set_view_mode_name(
  x: gt.SetViewModeNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setViewModeName", x);
}

export async function route_delete_view_mode(
  x: gt.DeleteViewModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteViewMode", x);
}

export async function route_undo(
  x: gt.UndoRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/undo", x);
}

export async function route_redo(
  x: gt.RedoRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/redo", x);
}

export async function route_get_latest_project_state(
  x: gt.GetLatestProjectStateRequestInput,
): Promise<
  ResponseDataAndStatus<gt.ProjectStateSingleConfigWithCompletedOpIds>
> {
  return await post("/getLatestProjectState", x);
}

export async function route_force_refresh_listener(
  x: gt.ForceRefreshProjectRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/forceRefreshListener", x);
}

export async function route_set_top_level_section_layout(
  x: gt.SetTopLevelSectionLayoutRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTopLevelSectionLayout", x);
}

export async function route_auto_layout_top_level_sections(
  x: gt.AutoLayoutTopLevelSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/autoLayoutTopLevelSections", x);
}

export async function route_add_kwarg(
  x: gt.AddKwargRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/addKwarg", x);
}

export async function route_delete_kwarg(
  x: gt.DeleteKwargRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteKwarg", x);
}

export async function route_delete_section_variant_or_ask(
  x: gt.DeleteSectionVariantOrAskRequestInput,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/deleteSectionVariantOrAsk", x);
}

export async function route_toggle_variant_json_source(
  x: gt.ToggleVariantJSONSourceRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleVariantJsonSource", x);
}

export async function route_delete_json_source_file_and_variant(
  x: gt.DeleteJSONSourceFileAndVariantRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteJsonSourceFileAndVariant", x);
}

export async function route_set_text_block_text(
  x: gt.SetTextBlockTextRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockText", x);
}

export async function route_set_gen_code_prefix(
  x: gt.SetGenCodePrefixRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setGenCodePrefix", x);
}

export async function route_set_gen_code_suffix(
  x: gt.SetGenCodeSuffixRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setGenCodeSuffix", x);
}

export async function route_set_show_param_display_names(
  x: gt.SetShowParamDisplayNamesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setShowParamDisplayNames", x);
}

export async function route_set_param_entered_value(
  x: gt.SetParamEnteredValueRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setParamEnteredValue", x);
}

export async function route_set_type_error_ignore(
  x: gt.SetTypeErrorIgnoreRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTypeErrorIgnore", x);
}

export async function route_set_code_obj_name(
  x: gt.SetCodeObjNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeObjName", x);
}

export async function route_set_code_obj_display_name(
  x: gt.SetCodeObjDisplayNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeObjDisplayName", x);
}

export async function route_set_code_file_binding(
  x: gt.SetCodeFileBindingRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeFileBinding", x);
}

export async function route_toggle_position_locks(
  x: gt.TogglePositionLocksRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/togglePositionLocks", x);
}

export async function route_toggle_minimized(
  x: gt.ToggleMinimizedRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleMinimized", x);
}

export async function route_toggle_group_orientation(
  x: gt.ToggleGroupOrientationRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleGroupOrientation", x);
}

export async function route_set_group_overflow_mode(
  x: gt.SetGroupOverflowModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setGroupOverflowMode", x);
}

export async function route_set_code(
  x: gt.SetCodeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCode", x);
}

export async function route_set_section_param_filter(
  x: gt.SetSectionParamFilterRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionParamFilter", x);
}

export async function route_set_section_edge_inputs(
  x: gt.SetSectionEdgeInputsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionEdgeInputs", x);
}

export async function route_set_section_edge_outputs(
  x: gt.SetSectionEdgeOutputsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionEdgeOutputs", x);
}

export async function route_create_edge(
  x: gt.CreateEdgeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createEdge", x);
}

export async function route_update_edge(
  x: gt.UpdateEdgeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/updateEdge", x);
}

export async function route_delete_edges(
  x: gt.DeleteEdgesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteEdges", x);
}

export async function route_reconnect_edge(
  x: gt.ReconnectEdgeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/reconnectEdge", x);
}

export async function route_set_edges(
  x: gt.SetEdgesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setEdges", x);
}

export async function route_set_section_variant(
  x: gt.SetSectionVariantRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionVariant", x);
}

export async function route_set_default_section_variant(
  x: gt.SetDefaultSectionVariantRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setDefaultSectionVariant", x);
}

export async function route_toggle_variant_frozen(
  x: gt.ToggleVariantFrozenRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleVariantFrozen", x);
}

export async function route_set_section_variant_name(
  x: gt.SetSectionVariantNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("setSectionVariantName", x);
}

export async function route_set_section_sizes(
  x: gt.SetSectionSizesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionSizes", x);
}

export async function route_set_active_ids(
  x: gt.SetActiveIdsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setActiveIds", x);
}

export async function route_set_viewport(
  x: gt.SetViewportRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setViewport", x);
}

export async function route_set_section_name(
  x: gt.SetSectionNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionName", x);
}

export async function route_set_meta_control_show_section_title(
  x: gt.SetMetaControlShowSectionTitleRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setMetaControlShowSectionTitle", x);
}

async function route_accept_rename_refactor(
  x: gt.AcceptRenameRefactorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/acceptRenameRefactor", x);
}

async function route_decline_rename_refactor(
  x: gt.DeclineRenameRefactorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/declineRenameRefactor", x);
}

export async function route_set_text_block_display_mode(
  x: gt.SetTextBlockDisplayModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockDisplayMode", x);
}

export async function route_set_text_block_heading_as_section_name(
  x: gt.SetTextBlockHeadingAsSectionNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockHeadingAsSectionName", x);
}

export async function route_set_text_block_meta_control_style(
  x: gt.SetTextBlockMetaControlStyleRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockMetaControlStyle", x);
}

export async function route_set_section_with_params_display_mode(
  x: gt.SetSectionWithParamsDisplayModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionWithParamsDisplayMode", x);
}

export async function route_set_callable_hide_params(
  x: gt.SetCallableHideParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCallableHideParams", x);
}

export async function route_set_section_hide_unpinned_params(
  x: gt.SetSectionHideUnpinnedParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionHideUnpinnedParams", x);
}

export async function route_set_section_column_width(
  x: gt.SetSectionColumnWidthRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionColumnWidth", x);
}

export async function route_set_browser_column_widths(
  x: gt.SetBrowserColumnWidthsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserColumnWidths", x);
}

export async function route_set_browser_area_view_mode(
  x: gt.SetBrowserAreaViewModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserAreaViewMode", x);
}

export async function route_set_browser_hide_column(
  x: gt.SetBrowserHideColumnRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserHideColumn", x);
}

export async function route_set_text_block_format(
  x: gt.SetTextBlockFormatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockFormat", x);
}

export async function route_set_chat_section_settings(
  x: gt.SetChatSectionSettingsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChatSectionSettings", x);
}

export async function route_set_chat_section_state(
  x: gt.SetChatSectionStateRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChatSectionState", x);
}

async function route_get_chat_section_chat_id(
  x: gt.GetChatSectionChatIdRequestInput,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/getChatSectionChatId", x);
}

export async function route_set_chat_section_chat_id(
  x: gt.SetChatSectionChatIdRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChatSectionChatId", x);
}

export async function route_set_social_url(
  x: gt.SetSocialUrlRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSocialUrl", x);
}

export async function route_move_section(
  x: gt.MoveSectionRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/moveSection", x);
}

export async function route_group_sections(
  x: gt.GroupSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/groupSections", x);
}

export async function route_ungroup_groups(
  x: gt.UngroupGroupsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/ungroupGroups", x);
}

export async function route_toggle_param_selected(
  x: gt.ToggleParamSelectedRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleParamSelected", x);
}

export async function route_unselect_all_params(
  x: gt.UnselectAllParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/unselectAllParams", x);
}

export async function route_prepare_sections_for_copy(
  x: gt.PrepareSectionsForCopyRequestInput,
): Promise<ResponseDataAndStatus<gt.SectionsClipboardData>> {
  return await post("/prepareSectionsForCopy", x);
}

export async function route_paste_sections(
  x: gt.PasteSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/pasteSections", x);
}

export async function route_append_draw_area_layer_item(
  x: gt.AppendDrawAreaLayerItemRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/appendDrawAreaLayerItem", x);
}

export async function route_set_image_area_image_path(
  x: gt.SetImageAreaImagePathRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setImageAreaImagePath", x);
}

export async function route_set_chart_area_data_path(
  x: gt.SetChartAreaDataPathRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartAreaDataPath", x);
}

export async function route_set_chart_type(
  x: gt.SetChartTypeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartType", x);
}

export async function route_set_chart_settings(
  x: gt.SetChartSettingsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartSettings", x);
}

export async function route_get_backend_init_status(): Promise<
  ResponseDataAndStatus<gt.BackendInitStatusResponse>
> {
  return await get("/backendInitStatus");
}

export async function route_list_share_deployments(): Promise<
  ResponseDataAndStatus<Array<gt.ShareDeploymentMetadata>>
> {
  return await get("/share/deployments");
}

async function route_list_share_deployment_versions(
  deploymentName: string,
): Promise<ResponseDataAndStatus<Array<gt.ShareDeploymentMetadata>>> {
  return await get("/share/deployments/{deploymentName}/versions", {
    deploymentName,
  });
}

async function route_get_latest_share_deployment(
  deploymentName: string,
): Promise<ResponseDataAndStatus<gt.ShareDeploymentMetadata>> {
  return await get("/share/deployments/{deploymentName}/latest", {
    deploymentName,
  });
}

export async function route_create_share_session_current(): Promise<
  ResponseDataAndStatus<gt.ShareDeploymentSessionResponse>
> {
  return await post("/share/deployments/current/session", null);
}

async function route_create_share_session(
  deploymentName: string,
  version: string,
): Promise<ResponseDataAndStatus<gt.ShareDeploymentSessionResponse>> {
  return await post(
    "/share/deployments/{deploymentName}/{version}/session",
    null,
    { deploymentName, version },
  );
}

async function route_get_share_deployment_state(
  deploymentName: string,
  version: string,
): Promise<
  ResponseDataAndStatus<gt.ProjectStateSingleConfigWithCompletedOpIds>
> {
  return await get("/share/deployments/{deploymentName}/{version}/state", {
    deploymentName,
    version,
  });
}

export async function route_load_share_project_config(
  deploymentName: string,
  version: string,
  x: gt.LoadShareProjectConfigRequestInput,
): Promise<
  ResponseDataAndStatus<gt.ProjectStateSingleConfigWithCompletedOpIds>
> {
  return await post(
    "/share/deployments/{deploymentName}/{version}/project_config",
    x,
    { deploymentName, version },
  );
}

export async function route_publish_share_deployment(
  x: gt.PublishShareDeploymentRequestInput,
): Promise<ResponseDataAndStatus<gt.ShareDeploymentMetadata>> {
  return await post("/share/deployments", x);
}
