import { post } from "./endpointUtils";
import * as gt from "./generatedTypes";

export async function route_load_all_project_metadata() {
  return await post("/loadAllProjectMetadata", {});
}

export async function route_load_project_config(x: gt.ProjectLoadRequest) {
  return await post("/loadProjectConfig", {});
}

export async function route_save_project(x: gt.ProjectSaveRequest) {
  return await post("/projects/save", {});
}

export async function route_create_project_config(
  x: gt.CreateProjectConfigRequest,
) {
  return await post("/projects/createProjectConfig", {});
}

export async function route_save_as_new_project_config(
  x: gt.SaveAsNewProjectConfigRequest,
) {
  return await post("/projects/saveAsNewProjectConfig", {});
}

export async function route_save_as_existing_project_config(
  x: gt.SaveAsExistingProjectConfigRequest,
) {
  return await post("/projects/saveAsExistingProjectConfig", {});
}

export async function route_delete_project_configs(
  x: gt.DeleteProjectConfigsRequest,
) {
  return await post("/deleteProjectConfigs", {});
}

export async function route_set_project_config_name(
  x: gt.SetProjectConfigNameRequest,
) {
  return await post("/setProjectConfigName", {});
}

export async function router_get_default_project_config_name() {
  return await post("/getDefaultConfigName", {});
}

export async function router_set_as_default_project(
  x: gt.SetAsDefaultProjectRequest,
) {
  return await post("/setAsDefaultProject", {});
}

export async function router_filter_data_for_json_export(
  x: gt.FilterDataForJSONExportRequest,
) {
  return await post("/filterDataForJSONExport", {});
}

export async function router_add_default_data_for_json_import(
  x: gt.FilterDataForJSONExportRequest,
) {
  return await post("/addDefaultDataForJSONImport", {});
}

export async function route_get_notifications(x: gt.GetNotificationsRequest) {
  return await post("/getNotifications", {});
}

export async function route_delete_notification(
  x: gt.DeleteNotificationRequest,
) {
  return await post("/deleteNotification", {});
}

export async function route_sections_make_copy(x: gt.SectionsMakeCopyRequest) {
  return await post("/copySections", {});
}

export async function route_section_to_yaml(x: gt.SectionToYamlRequest) {
  return await post("/sectionToYaml", {});
}

export async function route_load_section_json_source(
  x: gt.LoadSectionJSONSourceRequest,
) {
  return await post("/loadSectionJSONSource", {});
}

export async function route_new_json_version_name(
  x: gt.NewJSONVersionNameRequest,
) {
  return await post("/newJsonVersionName", {});
}

export async function route_create_file(x: gt.CreateFileRequest) {
  return await post("/createFile", {});
}

export async function route_save_section_json_source(
  x: gt.SaveSectionJSONSourceRequest,
) {
  return await post("/saveSectionJsonSource", {});
}

export async function route_get_json_source_path_to_be_deleted(
  x: gt.GetJSONSourcePathToBeDeleted,
) {
  return await post("/getJsonSourcePathToBeDeleted", {});
}

export async function route_delete_file(x: gt.DeleteFileRequest) {
  return await post("/deleteFile", {});
}

export async function route_file_watch_list(x: gt.FileWatchListRequest) {
  return await post("/fileWatchList", {});
}

export async function route_file_watch_gen_python_code(
  x: gt.FileWatchGenPythonCodeRequest,
) {
  return await post("/fileWatchGenPythonCode", {});
}

export async function route_terminal_delete_terminals(
  x: gt.DeleteTerminalsRequest,
) {
  return await post("/terminal/deleteTerminals", {});
}

export async function route_terminal_get_existing_terminals(
  projectConfigId: string,
) {
  return await post("/terminal/getExistingTerminals/{projectConfigId}", {});
}

export async function route_kill_subprocesses(x: gt.KillSubprocessesRequest) {
  return await post("/killSubprocesses", {});
}

export async function route_run_code(x: gt.RunCodeRequest) {
  return await post("/runCode", {});
}

export async function route_docstring_to_markdown(
  x: gt.DocstringToMarkdownRequest,
) {
  return await post("/docstringToMarkdown", {});
}

export async function route_save_settings(x: gt.SaveSettingsRequest) {
  return await post("/saveSettings", {});
}

export async function route_load_settings() {
  return await post("/loadSettings", {});
}

export async function route_save_settings_project(
  x: gt.SaveSettingsProjectRequest,
) {
  return await post("/saveSettingsProject", {});
}

export async function route_load_settings_project() {
  return await post("/loadSettingsProject", {});
}

export async function route_format_code(x: gt.FormatCodeRequest) {
  return await post("/formatCode", {});
}

export async function route_send_artifact(x: gt.SendArtifactRequest) {
  return await post("/sendArtfiact", {});
}

export async function route_load_artifacts(x: gt.LoadArtifactsRequest) {
  return await post("/loadArtifacts", {});
}

export async function route_load_available_artifacts(
  x: gt.LoadAvailableArtifactsRequest,
) {
  return await post("/loadAvailableArtifacts", {});
}

export async function route_check_if_file_exists(
  x: gt.CheckIfFileExistsRequests,
) {
  return await post("/checkIfFileExists", {});
}

export async function route_load_artifact_from_disk(
  x: gt.LoadArtifactFromDiskRequest,
) {
  return await post("/loadArtifactFromDisk", {});
}

export async function route_read_csv_base64(x: gt.ReadCSVBase64Request) {
  return await post("/readCSVBase64", {});
}

export async function route_get_artifact_ids_from_name_path_type(
  x: gt.FillInMissingArtifactIdsRequest,
) {
  return await post("/getArtifactIdsFromNamePathType", {});
}

export async function route_restart_language_server() {
  return await post("/restartLanguageServer", {});
}

export async function route_type_check(x: gt.TypeCheckRequest) {
  return await post("/typeCheck", {});
}

export async function route_get_llm_response(x: gt.GetLLMResponseRequest) {
  return await post("/getLLMResponse", {});
}

export async function route_set_llm_api_keys(x: gt.SetLLMApiKeysRequest) {
  return await post("/setLLMApiKeys", {});
}

export async function route_get_all_llm_chat_metadata() {
  return await post("/getAllLLMChatMetadata", {});
}

export async function route_delete_llm_chat(x: gt.DeleteLLMChatRequest) {
  return await post("/deleteLLMChat", {});
}

export async function route_stop_llm_chat(x: gt.StopLLMChatRequest) {
  return await post("/stopLLMChat", {});
}

export async function route_get_llm_chat(x: gt.GetLLMChatRequest) {
  return await post("/getLLMChat", {});
}

export async function route_get_uuid_mapping_for_llm() {
  return await post("/getUUIDMappingForLLM", {});
}
