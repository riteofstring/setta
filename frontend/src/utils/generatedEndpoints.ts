import { get, post, ResponseDataAndStatus } from "./endpointUtils";
import * as gt from "./generatedTypes";

export async function route_load_all_project_metadata(): Promise<
  ResponseDataAndStatus<gt.AllProjectMetadata>
> {
  return await post("/loadAllProjectMetadata");
}

export async function route_load_project_config(
  x: gt.ProjectLoadRequest,
): Promise<ResponseDataAndStatus<gt.ProjectStateSingleConfig>> {
  return await post("/loadProjectConfig", x);
}

export async function route_save_project(
  x: gt.ManualSaveRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveProject", x);
}

export async function route_save_as_new_project_config(
  x: gt.SaveAsNewProjectConfigRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveAsNewProjectConfig", x);
}

export async function route_create_project_config(
  x: gt.CreateProjectConfigRequest,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/createProjectConfig", x);
}

export async function route_delete_project_configs(
  x: gt.DeleteProjectConfigsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteProjectConfigs", x);
}

export async function route_set_project_config_name(
  x: gt.SetProjectConfigNameRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setProjectConfigName", x);
}

export async function router_get_default_project_config_name(): Promise<
  ResponseDataAndStatus<string | null>
> {
  return await post("/getDefaultConfigName");
}

export async function router_set_as_default_project(
  x: gt.SetAsDefaultProjectRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setAsDefaultProject", x);
}

export async function route_get_notifications(
  x: gt.GetNotificationsRequest,
): Promise<ResponseDataAndStatus<Array<gt.SettaNotification>>> {
  return await post("/getNotifications", x);
}

export async function route_delete_notification(
  x: gt.DeleteNotificationRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteNotification", x);
}

export async function route_new_json_version_name(
  x: gt.NewJSONVersionNameRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/newJsonVersionName", x);
}

export async function route_create_file(
  x: gt.CreateFileRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createFile", x);
}

export async function route_get_json_source_path_to_be_deleted(
  x: gt.GetJSONSourcePathToBeDeleted,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/getJsonSourcePathToBeDeleted", x);
}

export async function route_delete_terminals(
  x: gt.DeleteTerminalsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteTerminals", x);
}

export async function route_kill_subprocesses(
  x: gt.KillSubprocessesRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/killSubprocesses", x);
}

export async function route_run_code(
  x: gt.RunCodeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/runCode", x);
}

export async function route_docstring_to_markdown(
  x: gt.DocstringToMarkdownRequest,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/docstringToMarkdown", x);
}

export async function route_save_settings(
  x: gt.SaveSettingsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveSettings", x);
}

export async function route_load_settings(): Promise<
  ResponseDataAndStatus<gt.SettingsState>
> {
  return await post("/loadSettings");
}

export async function route_check_if_file_exists(
  x: gt.CheckIfFileExistsRequests,
): Promise<ResponseDataAndStatus<boolean>> {
  return await post("/checkIfFileExists", x);
}

export async function route_get_folder_contents(
  x: gt.GetFolderContentsRequest,
): Promise<ResponseDataAndStatus<Array<gt.FolderContentItem>>> {
  return await post("/getFolderContents", x);
}

export async function route_load_cached_image_artifacts(
  x: gt.LoadCachedPathsRequest,
): Promise<ResponseDataAndStatus<Array<gt.ImageArtifact | null>>> {
  return await post("/loadCachedImageArtifacts", x);
}

export async function route_load_cached_chart_data(
  x: gt.LoadCachedPathsRequest,
): Promise<ResponseDataAndStatus<Array<gt.ChartDataArtifact | null>>> {
  return await post("/loadCachedChartData", x);
}

export async function route_load_cached_brush_strokes(
  x: gt.LoadCachedPathsRequest,
): Promise<ResponseDataAndStatus<Array<gt.BrushStrokeArtifact | null>>> {
  return await post("/loadCachedBrushStrokes", x);
}

export async function route_load_cached_draw_area_layer_item_transform(
  x: gt.LoadCachedPathsRequest,
): Promise<
  ResponseDataAndStatus<Array<gt.DrawAreaLayerItemTransformArtifact | null>>
> {
  return await post("/loadDrawAreaLayerItemTransform", x);
}

export async function route_update_artifacts(
  x: gt.UpdateArtifactsRequest,
): Promise<ResponseDataAndStatus<Array<gt.ArtifactSaveResult>>> {
  return await post("/updateArtifacts", x);
}

export async function route_get_listener_coverage(
  x: gt.ListenerCoverageRequest,
): Promise<ResponseDataAndStatus<gt.ListenerCoverageSnapshot>> {
  return await post("/getListenerCoverage", x);
}

export async function route_restart_language_server(): Promise<
  ResponseDataAndStatus<null>
> {
  return await post("/restartLanguageServer");
}

export async function route_type_check(
  x: gt.TypeCheckRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/typeCheck", x);
}

export async function route_get_llm_config(): Promise<
  ResponseDataAndStatus<gt.AllLLMConfigs>
> {
  return await get("/llm/config");
}

export async function route_set_llm_config(
  config: gt.AllLLMConfigs,
): Promise<ResponseDataAndStatus<gt.AllLLMConfigs>> {
  return await post("/llm/config", config);
}

export async function route_get_llm_api_keys(): Promise<
  ResponseDataAndStatus<Record<string, string>>
> {
  return await get("/llm/apiKeys");
}

export async function route_set_llm_api_keys(
  payload: gt.UpdateAPIKeysRequest,
): Promise<ResponseDataAndStatus<Record<string, string>>> {
  return await post("/llm/apiKeys", payload);
}

export async function route_get_llm_response(
  x: gt.GetLLMResponseRequest,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/getLLMResponse", x);
}

export async function route_get_all_llm_chat_metadata(): Promise<
  ResponseDataAndStatus<Array<gt.ChatMetadata>>
> {
  return await post("/getAllLLMChatMetadata");
}

export async function route_delete_llm_chat(
  x: gt.DeleteLLMChatRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteLLMChat", x);
}

export async function route_stop_llm_chat(
  x: gt.StopLLMChatRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/stopLLMChat", x);
}

export async function route_get_llm_chat(
  x: gt.GetLLMChatRequest,
): Promise<ResponseDataAndStatus<gt.GetLLMChatRequestResponse>> {
  return await post("/getLLMChat", x);
}

export async function route_clear_text_field_completion(
  x: gt.ClearTextFieldCompletionRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/clearTextFieldCompletion", x);
}

export async function route_set_callable(
  x: gt.SetCallableRequest,
): Promise<ResponseDataAndStatus<gt.SetCallableResponse>> {
  return await post("/setCallable", x);
}

export async function route_text_field_completion(
  x: gt.TextFieldCompletionRequest,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/textFieldCompletion", x);
}

export async function route_code_area_completion(
  x: gt.CodeAreaCompletionRequest,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/codeAreaCompletion", x);
}

export async function route_gen_code_prefix_completion(
  x: gt.GenCodePrefixCompletionRequest,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/genCodePrefixCompletion", x);
}

export async function route_gen_code_suffix_completion(
  x: gt.GenCodeSuffixCompletionRequest,
): Promise<ResponseDataAndStatus<Array<gt.CodeMirrorCompletion>>> {
  return await post("/genCodeSuffixCompletion", x);
}

export async function route_change_param_impl(
  x: gt.ChangeParamImplRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/changeParamImpl", x);
}

export async function route_update_param_impl_config(
  x: gt.UpdateParamImplConfigRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/updateParamImplConfig", x);
}

export async function route_create_top_level_section(
  x: gt.CreateTopLevelSectionRequest,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/createTopLevelSection", x);
}

export async function route_create_child_sections(
  x: gt.CreateChildSectionsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createChildSections", x);
}

export async function route_create_child_sections_via_incrementer(
  x: gt.CreateChildSectionsViaIncrementerRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createChildSectionsViaIncrementer", x);
}

export async function route_delete_sections(
  x: gt.DeleteSectionsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteSections", x);
}

export async function route_delete_child_sections_via_decrementer(
  x: gt.DeleteChildSectionsViaDecrementerRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteChildSectionsViaDecrementer", x);
}

export async function route_create_new_section_variant(
  x: gt.CreateNewSectionVariantRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createNewSectionVariant", x);
}

export async function route_undo(
  x: gt.UndoRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/undo", x);
}

export async function route_redo(
  x: gt.RedoRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/redo", x);
}

export async function route_get_latest_project_state(
  x: gt.GetLatestProjectStateRequest,
): Promise<
  ResponseDataAndStatus<gt.ProjectStateSingleConfigWithCompletedOpIds>
> {
  return await post("/getLatestProjectState", x);
}

export async function route_force_refresh_listener(
  x: gt.ForceRefreshProjectRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/forceRefreshListener", x);
}

export async function route_set_top_level_section_layout(
  x: gt.SetTopLevelSectionLayoutRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTopLevelSectionLayout", x);
}

export async function route_add_kwarg(
  x: gt.AddKwargRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/addKwarg", x);
}

export async function route_delete_kwarg(
  x: gt.DeleteKwargRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteKwarg", x);
}

export async function route_delete_section_variant_or_ask(
  x: gt.DeleteSectionVariantOrAskRequest,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/deleteSectionVariantOrAsk", x);
}

export async function route_toggle_variant_json_source(
  x: gt.ToggleVariantJSONSourceRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleVariantJsonSource", x);
}

export async function route_delete_json_source_file_and_variant(
  x: gt.DeleteJSONSourceFileAndVariantRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteJsonSourceFileAndVariant", x);
}

export async function route_set_text_block_text(
  x: gt.SetTextBlockTextRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockText", x);
}

export async function route_set_gen_code_prefix(
  x: gt.SetGenCodePrefixRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setGenCodePrefix", x);
}

export async function route_set_gen_code_suffix(
  x: gt.SetGenCodeSuffixRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setGenCodeSuffix", x);
}

export async function route_set_param_entered_value(
  x: gt.SetParamEnteredValueRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setParamEnteredValue", x);
}

export async function route_set_code_obj_name(
  x: gt.SetCodeObjNameRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeObjName", x);
}

export async function route_set_code_file_binding(
  x: gt.SetCodeFileBindingRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeFileBinding", x);
}

export async function route_toggle_position_lock(
  x: gt.TogglePositionLockRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/togglePositionLock", x);
}

export async function route_toggle_minimized(
  x: gt.ToggleMinimizedRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleMinimized", x);
}

export async function route_set_code(
  x: gt.SetCodeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCode", x);
}

export async function route_set_section_param_filter(
  x: gt.SetSectionParamFilterRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionParamFilter", x);
}

export async function route_set_section_variant(
  x: gt.SetSectionVariantRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionVariant", x);
}

export async function route_set_default_section_variant(
  x: gt.SetDefaultSectionVariantRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setDefaultSectionVariant", x);
}

export async function route_toggle_variant_frozen(
  x: gt.ToggleVariantFrozenRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleVariantFrozen", x);
}

export async function route_set_section_variant_name(
  x: gt.SetSectionVariantNameRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("setSectionVariantName", x);
}

export async function route_set_section_sizes(
  x: gt.SetSectionSizesRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionSizes", x);
}

export async function route_set_active_ids(
  x: gt.SetActiveIdsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setActiveIds", x);
}

export async function route_set_viewport(
  x: gt.SetViewportRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setViewport", x);
}

export async function route_set_section_name(
  x: gt.SetSectionNameRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionName", x);
}

export async function route_accept_rename_refactor(
  x: gt.AcceptRenameRefactorRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/acceptRenameRefactor", x);
}

export async function route_decline_rename_refactor(
  x: gt.DeclineRenameRefactorRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/declineRenameRefactor", x);
}

export async function route_set_text_block_display_mode(
  x: gt.SetTextBlockDisplayModeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockDisplayMode", x);
}

export async function route_set_section_with_params_display_mode(
  x: gt.SetSectionWithParamsDisplayModeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionWithParamsDisplayMode", x);
}

export async function route_set_callable_hide_params(
  x: gt.SetCallableHideParamsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCallableHideParams", x);
}

export async function route_set_section_hide_unpinned_params(
  x: gt.SetSectionHideUnpinnedParamsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionHideUnpinnedParams", x);
}

export async function route_set_browser_area_view_mode(
  x: gt.SetBrowserAreaViewModeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserAreaViewMode", x);
}

export async function route_set_browser_hide_column(
  x: gt.SetBrowserHideColumnRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserHideColumn", x);
}

export async function route_set_text_block_format(
  x: gt.SetTextBlockFormatRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockFormat", x);
}

export async function route_set_social_url(
  x: gt.SetSocialUrlRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSocialUrl", x);
}

export async function route_group_sections(
  x: gt.GroupSectionsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/groupSections", x);
}

export async function route_ungroup_groups(
  x: gt.UngroupGroupsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/ungroupGroups", x);
}

export async function route_toggle_param_selected(
  x: gt.ToggleParamSelectedRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleParamSelected", x);
}

export async function route_unselect_all_params(
  x: gt.UnselectAllParamsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/unselectAllParams", x);
}

export async function route_prepare_sections_for_copy(
  x: gt.PrepareSectionsForCopyRequest,
): Promise<ResponseDataAndStatus<gt.SectionsClipboardData>> {
  return await post("/prepareSectionsForCopy", x);
}

export async function route_paste_sections(
  x: gt.PasteSectionsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/pasteSections", x);
}

export async function route_append_draw_area_layer_item(
  x: gt.AppendDrawAreaLayerItemRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/appendDrawAreaLayerItem", x);
}

export async function route_set_image_area_image_path(
  x: gt.SetImageAreaImagePathRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setImageAreaImagePath", x);
}

export async function route_set_chart_area_data_path(
  x: gt.SetChartAreaDataPathRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartAreaDataPath", x);
}

export async function route_set_chart_type(
  x: gt.SetChartTypeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartType", x);
}

export async function route_set_chart_settings(
  x: gt.SetChartSettingsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setChartSettings", x);
}

export async function route_get_backend_init_status(): Promise<
  ResponseDataAndStatus<null>
> {
  return await get("/backendInitStatus");
}
