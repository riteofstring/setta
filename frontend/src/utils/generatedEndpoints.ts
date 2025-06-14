import { post } from "./endpointUtils";
import * as gt from "./generatedTypes";

export async function dbRouteLoadAllProjectMetadata() {
  return await post();
}

export async function dbRouteLoadProjectConfig(x: gt.ProjectLoadRequest) {
  return await post();
}

export async function dbRouteSaveProject(x: gt.ProjectSaveRequest) {
  return await post();
}

export async function dbRouteCreateProjectConfig(
  x: gt.CreateProjectConfigRequest,
) {
  return await post();
}

export async function dbRouteSaveAsNewProjectConfig(
  x: gt.SaveAsNewProjectConfigRequest,
) {
  return await post();
}

export async function dbRouteSaveAsExistingProjectConfig(
  x: gt.SaveAsExistingProjectConfigRequest,
) {
  return await post();
}

export async function dbRouteDeleteProjectConfigs(
  x: gt.DeleteProjectConfigsRequest,
) {
  return await post();
}

export async function dbRouteSetProjectConfigName(
  x: gt.SetProjectConfigNameRequest,
) {
  return await post();
}

export async function dbRouterGetDefaultProjectConfigName() {
  return await post();
}

export async function dbRouterSetAsDefaultProject(
  x: gt.SetAsDefaultProjectRequest,
) {
  return await post();
}

export async function dbRouterFilterDataForJsonExport(
  x: gt.FilterDataForJSONExportRequest,
) {
  return await post();
}

export async function dbRouterAddDefaultDataForJsonImport(
  x: gt.FilterDataForJSONExportRequest,
) {
  return await post();
}

export async function dbRouteGetNotifications(x: gt.GetNotificationsRequest) {
  return await post();
}

export async function dbRouteDeleteNotification(
  x: gt.DeleteNotificationRequest,
) {
  return await post();
}

export async function dbRouteSectionsMakeCopy(x: gt.SectionsMakeCopyRequest) {
  return await post();
}

export async function dbRouteSectionToYaml(x: gt.SectionToYamlRequest) {
  return await post();
}

export async function dbRouteLoadSectionJsonSource(
  x: gt.LoadSectionJSONSourceRequest,
) {
  return await post();
}

export async function dbRouteNewJsonVersionName(
  x: gt.NewJSONVersionNameRequest,
) {
  return await post();
}

export async function dbRouteCreateFile(x: gt.CreateFileRequest) {
  return await post();
}

export async function dbRouteSaveSectionJsonSource(
  x: gt.SaveSectionJSONSourceRequest,
) {
  return await post();
}

export async function dbRouteGetJsonSourcePathToBeDeleted(
  x: gt.GetJSONSourcePathToBeDeleted,
) {
  return await post();
}

export async function dbRouteDeleteFile(x: gt.DeleteFileRequest) {
  return await post();
}

export async function dbRouteFileWatchList(x: gt.FileWatchListRequest) {
  return await post();
}

export async function dbRouteFileWatchGenPythonCode(
  x: gt.FileWatchGenPythonCodeRequest,
) {
  return await post();
}

export async function dbRouteTerminalDeleteTerminals(
  x: gt.DeleteTerminalsRequest,
) {
  return await post();
}

export async function dbRouteTerminalGetExistingTerminals(
  projectConfigId: string,
) {
  return await post();
}

export async function dbRouteKillSubprocesses(x: gt.KillSubprocessesRequest) {
  return await post();
}

export async function dbRouteRunCode(x: gt.RunCodeRequest) {
  return await post();
}

export async function dbRouteDocstringToMarkdown(
  x: gt.DocstringToMarkdownRequest,
) {
  return await post();
}

export async function dbRouteSaveSettings(x: gt.SaveSettingsRequest) {
  return await post();
}

export async function dbRouteLoadSettings() {
  return await post();
}

export async function dbRouteSaveSettingsProject(
  x: gt.SaveSettingsProjectRequest,
) {
  return await post();
}

export async function dbRouteLoadSettingsProject() {
  return await post();
}

export async function dbRouteFormatCode(x: gt.FormatCodeRequest) {
  return await post();
}

export async function dbRouteSendArtifact(x: gt.SendArtifactRequest) {
  return await post();
}

export async function dbRouteLoadArtifacts(x: gt.LoadArtifactsRequest) {
  return await post();
}

export async function dbRouteLoadAvailableArtifacts(
  x: gt.LoadAvailableArtifactsRequest,
) {
  return await post();
}

export async function dbRouteCheckIfFileExists(
  x: gt.CheckIfFileExistsRequests,
) {
  return await post();
}

export async function dbRouteLoadArtifactFromDisk(
  x: gt.LoadArtifactFromDiskRequest,
) {
  return await post();
}

export async function dbRouteReadCsvBase64(x: gt.ReadCSVBase64Request) {
  return await post();
}

export async function dbRouteGetArtifactIdsFromNamePathType(
  x: gt.FillInMissingArtifactIdsRequest,
) {
  return await post();
}

export async function dbRouteRestartLanguageServer() {
  return await post();
}

export async function dbRouteTypeCheck(x: gt.TypeCheckRequest) {
  return await post();
}

export async function dbRouteGetLlmResponse(x: gt.GetLLMResponseRequest) {
  return await post();
}

export async function dbRouteSetLlmApiKeys(x: gt.SetLLMApiKeysRequest) {
  return await post();
}

export async function dbRouteGetAllLlmChatMetadata() {
  return await post();
}

export async function dbRouteDeleteLlmChat(x: gt.DeleteLLMChatRequest) {
  return await post();
}

export async function dbRouteStopLlmChat(x: gt.StopLLMChatRequest) {
  return await post();
}

export async function dbRouteGetLlmChat(x: gt.GetLLMChatRequest) {
  return await post();
}

export async function dbRouteGetUuidMappingForLlm() {
  return await post();
}
