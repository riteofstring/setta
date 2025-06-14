import * as gt from "./generatedTypes";

export function dbRouteLoadAllProjectMetadata() {}

export function dbRouteLoadProjectConfig(x: gt.ProjectLoadRequest) {}

export function dbRouteSaveProject(x: gt.ProjectSaveRequest) {}

export function dbRouteCreateProjectConfig(x: gt.CreateProjectConfigRequest) {}

export function dbRouteSaveAsNewProjectConfig(
  x: gt.SaveAsNewProjectConfigRequest,
) {}

export function dbRouteSaveAsExistingProjectConfig(
  x: gt.SaveAsExistingProjectConfigRequest,
) {}

export function dbRouteDeleteProjectConfigs(
  x: gt.DeleteProjectConfigsRequest,
) {}

export function dbRouteSetProjectConfigName(
  x: gt.SetProjectConfigNameRequest,
) {}

export function dbRouterGetDefaultProjectConfigName() {}

export function dbRouterSetAsDefaultProject(x: gt.SetAsDefaultProjectRequest) {}

export function dbRouterFilterDataForJsonExport(
  x: gt.FilterDataForJSONExportRequest,
) {}

export function dbRouterAddDefaultDataForJsonImport(
  x: gt.FilterDataForJSONExportRequest,
) {}

export function dbRouteGetNotifications(x: gt.GetNotificationsRequest) {}

export function dbRouteDeleteNotification(x: gt.DeleteNotificationRequest) {}

export function dbRouteSectionsMakeCopy(x: gt.SectionsMakeCopyRequest) {}

export function dbRouteSectionToYaml(x: gt.SectionToYamlRequest) {}

export function dbRouteLoadSectionJsonSource(
  x: gt.LoadSectionJSONSourceRequest,
) {}

export function dbRouteNewJsonVersionName(x: gt.NewJSONVersionNameRequest) {}

export function dbRouteCreateFile(x: gt.CreateFileRequest) {}

export function dbRouteSaveSectionJsonSource(
  x: gt.SaveSectionJSONSourceRequest,
) {}

export function dbRouteGetJsonSourcePathToBeDeleted(
  x: gt.GetJSONSourcePathToBeDeleted,
) {}

export function dbRouteDeleteFile(x: gt.DeleteFileRequest) {}

export function dbRouteFileWatchList(x: gt.FileWatchListRequest) {}

export function dbRouteFileWatchGenPythonCode(
  x: gt.FileWatchGenPythonCodeRequest,
) {}

export function dbRouteTerminalDeleteTerminals(x: gt.DeleteTerminalsRequest) {}

export function dbRouteTerminalGetExistingTerminals(projectConfigId: gt.str) {}

export function dbRouteKillSubprocesses(x: gt.KillSubprocessesRequest) {}

export function dbRouteRunCode(x: gt.RunCodeRequest) {}

export function dbRouteDocstringToMarkdown(x: gt.DocstringToMarkdownRequest) {}

export function dbRouteSaveSettings(x: gt.SaveSettingsRequest) {}

export function dbRouteLoadSettings() {}

export function dbRouteSaveSettingsProject(x: gt.SaveSettingsProjectRequest) {}

export function dbRouteLoadSettingsProject() {}

export function dbRouteFormatCode(x: gt.FormatCodeRequest) {}

export function dbRouteSendArtifact(x: gt.SendArtifactRequest) {}

export function dbRouteLoadArtifacts(x: gt.LoadArtifactsRequest) {}

export function dbRouteLoadAvailableArtifacts(
  x: gt.LoadAvailableArtifactsRequest,
) {}

export function dbRouteCheckIfFileExists(x: gt.CheckIfFileExistsRequests) {}

export function dbRouteLoadArtifactFromDisk(
  x: gt.LoadArtifactFromDiskRequest,
) {}

export function dbRouteReadCsvBase64(x: gt.ReadCSVBase64Request) {}

export function dbRouteGetArtifactIdsFromNamePathType(
  x: gt.FillInMissingArtifactIdsRequest,
) {}

export function dbRouteRestartLanguageServer() {}

export function dbRouteTypeCheck(x: gt.TypeCheckRequest) {}

export function dbRouteGetLlmResponse(x: gt.GetLLMResponseRequest) {}

export function dbRouteSetLlmApiKeys(x: gt.SetLLMApiKeysRequest) {}

export function dbRouteGetAllLlmChatMetadata() {}

export function dbRouteDeleteLlmChat(x: gt.DeleteLLMChatRequest) {}

export function dbRouteStopLlmChat(x: gt.StopLLMChatRequest) {}

export function dbRouteGetLlmChat(x: gt.GetLLMChatRequest) {}

export function dbRouteGetUuidMappingForLlm() {}
