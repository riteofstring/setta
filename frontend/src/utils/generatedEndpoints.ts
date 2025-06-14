import { get, post, ResponseDataAndStatus } from "./endpointUtils";
import * as gt from "./generatedTypes";

export async function route_load_all_project_metadata(): Promise<
  ResponseDataAndStatus<null>
> {
  return await post("/loadAllProjectMetadata");
}

export async function route_load_project_config(
  x: gt.ProjectLoadRequest,
): Promise<ResponseDataAndStatus<gt.ProjectStateSingleConfig>> {
  return await post("/loadProjectConfig", x);
}

export async function route_save_project(
  x: gt.ProjectSaveRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveProject", x);
}

export async function route_create_project_config(
  x: gt.CreateProjectConfigRequest,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/createProjectConfig", x);
}

export async function route_save_as_new_project_config(
  x: gt.SaveAsNewProjectConfigRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveAsNewProjectConfig", x);
}

export async function route_save_as_existing_project_config(
  x: gt.SaveAsExistingProjectConfigRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveAsExistingProjectConfig", x);
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

export async function router_filter_data_for_json_export(
  x: gt.FilterDataForJSONExportRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/filterDataForJSONExport", x);
}

export async function router_add_default_data_for_json_import(
  x: gt.FilterDataForJSONExportRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/addDefaultDataForJSONImport", x);
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

export async function route_sections_make_copy(
  x: gt.SectionsMakeCopyRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/copySections", x);
}

export async function route_section_to_yaml(
  x: gt.SectionToYamlRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/sectionToYaml", x);
}

export async function route_load_section_json_source(
  x: gt.LoadSectionJSONSourceRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/loadSectionJSONSource", x);
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

export async function route_save_section_json_source(
  x: gt.SaveSectionJSONSourceRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/saveSectionJsonSource", x);
}

export async function route_get_json_source_path_to_be_deleted(
  x: gt.GetJSONSourcePathToBeDeleted,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/getJsonSourcePathToBeDeleted", x);
}

export async function route_delete_file(
  x: gt.DeleteFileRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteFile", x);
}

export async function route_file_watch_list(
  x: gt.FileWatchListRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/fileWatchList", x);
}

export async function route_file_watch_gen_python_code(
  x: gt.FileWatchGenPythonCodeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/fileWatchGenPythonCode", x);
}

export async function route_delete_terminals(
  x: gt.DeleteTerminalsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteTerminals", x);
}

export async function route_get_existing_terminals(
  projectConfigId: string,
): Promise<ResponseDataAndStatus<null>> {
  return await get("/getExistingTerminals/{projectConfigId}", {
    projectConfigId,
  });
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

export async function route_save_settings_project(
  x: gt.SaveSettingsProjectRequest,
): Promise<ResponseDataAndStatus<gt.SettingsState | null>> {
  return await post("/saveSettingsProject", x);
}

export async function route_load_settings_project(): Promise<
  ResponseDataAndStatus<gt.ProjectStateSingleConfig>
> {
  return await post("/loadSettingsProject");
}

export async function route_format_code(
  x: gt.FormatCodeRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/formatCode", x);
}

export async function route_send_artifact(
  x: gt.SendArtifactRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/sendArtfiact", x);
}

export async function route_load_artifacts(
  x: gt.LoadArtifactsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/loadArtifacts", x);
}

export async function route_load_available_artifacts(
  x: gt.LoadAvailableArtifactsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/loadAvailableArtifacts", x);
}

export async function route_check_if_file_exists(
  x: gt.CheckIfFileExistsRequests,
): Promise<ResponseDataAndStatus<boolean>> {
  return await post("/checkIfFileExists", x);
}

export async function route_load_artifact_from_disk(
  x: gt.LoadArtifactFromDiskRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/loadArtifactFromDisk", x);
}

export async function route_read_csv_base64(
  x: gt.ReadCSVBase64Request,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/readCSVBase64", x);
}

export async function route_get_artifact_ids_from_name_path_type(
  x: gt.FillInMissingArtifactIdsRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/getArtifactIdsFromNamePathType", x);
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

export async function route_get_llm_response(
  x: gt.GetLLMResponseRequest,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/getLLMResponse", x);
}

export async function route_set_llm_api_keys(
  x: gt.SetLLMApiKeysRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setLLMApiKeys", x);
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

export async function route_get_uuid_mapping_for_llm(): Promise<
  ResponseDataAndStatus<Record<gt.ID, string>>
> {
  return await post("/getUUIDMappingForLLM");
}

export async function route_clear_text_field_completion(
  x: gt.ClearTextFieldCompletionRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/clearTextFieldCompletion", x);
}

export async function route_set_selected_item(
  x: gt.SetSelectedItemRequest,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSelectedItem", x);
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
