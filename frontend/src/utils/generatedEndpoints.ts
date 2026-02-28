import { get, getBinary, post, ResponseDataAndStatus } from "./endpointUtils";
import * as gt from "./generatedTypes";

export async function route_bootstrap_page(): Promise<
  ResponseDataAndStatus<string>
> {
  return await get("/__setta__/bootstrap");
}

export async function route_bootstrap_consume(
  payload: gt.BootstrapConsumeRequestInput | null,
): Promise<ResponseDataAndStatus<Record<string, string>>> {
  return await post("/__setta__/bootstrap/consume", payload);
}

export async function route_call_mcp_tool(
  payload: gt.MCPToolCallRequestInput,
): Promise<ResponseDataAndStatus<Record<string, any>>> {
  return await post("/__setta__/tools/call", payload);
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

export async function route_new_json_version_name(
  x: gt.NewJSONVersionNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/newJsonVersionName", x);
}

export async function route_create_file(
  x: gt.CreateFileRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createFile", x);
}

export async function route_get_json_source_path_to_be_deleted(
  x: gt.GetJSONSourcePathToBeDeletedInput,
): Promise<ResponseDataAndStatus<string>> {
  return await post("/getJsonSourcePathToBeDeleted", x);
}

export async function route_delete_terminals(
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

export async function route_run_detached(
  x: gt.RunDetachedRequestInput,
): Promise<ResponseDataAndStatus<gt.RunDetachedResponse>> {
  return await post("/runDetached", x);
}

export async function route_get_run_status(
  x: gt.GetRunStatusRequestInput,
): Promise<ResponseDataAndStatus<gt.RunStatusResponse>> {
  return await post("/getRunStatus", x);
}

export async function route_cancel_run(
  x: gt.CancelRunRequestInput,
): Promise<ResponseDataAndStatus<gt.RunStatusResponse>> {
  return await post("/cancelRun", x);
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

export async function route_check_workspace_initialized(
  x: gt.CheckWorkspaceInitializedRequestInput,
): Promise<ResponseDataAndStatus<boolean>> {
  return await post("/checkWorkspaceInitialized", x);
}

export async function route_get_file_browser_root(): Promise<
  ResponseDataAndStatus<gt.GetFileBrowserRootResponse>
> {
  return await post("/getFileBrowserRoot", null);
}

export async function route_get_folder_contents(
  x: gt.GetFolderContentsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.FolderContentItem>>> {
  return await post("/getFolderContents", x);
}

export async function route_get_file_browser_download_urls(
  x: gt.GetFileBrowserDownloadUrlsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.FileBrowserDownloadUrlEntry>>> {
  return await post("/getFileBrowserDownloadUrls", x);
}

export async function route_get_file_browser_file_content(
  x: gt.GetFileBrowserFileContentRequestInput,
): Promise<ResponseDataAndStatus<gt.FileBrowserFileContentResponse>> {
  return await post("/getFileBrowserFileContent", x);
}

export async function route_get_file_browser_file_stat(
  x: gt.GetFileBrowserFileStatRequestInput,
): Promise<ResponseDataAndStatus<gt.FileBrowserFileStatResponse>> {
  return await post("/getFileBrowserFileStat", x);
}

export async function route_write_file_browser_file_content(
  x: gt.WriteFileBrowserFileContentRequestInput,
): Promise<ResponseDataAndStatus<gt.WriteFileBrowserFileContentResponse>> {
  return await post("/writeFileBrowserFileContent", x);
}

export async function route_transfer_file_browser_entry(
  x: gt.TransferFileBrowserEntryRequestInput,
): Promise<ResponseDataAndStatus<gt.TransferFileBrowserEntryResponse>> {
  return await post("/transferFileBrowserEntry", x);
}

export async function route_file_browser_download(
  token: string,
): Promise<ResponseDataAndStatus<null>> {
  return await get("/fileBrowser/{token}", { token });
}

export async function route_import_files_to_artifacts(
  x: gt.ImportFilesToArtifactsRequestInput,
): Promise<
  ResponseDataAndStatus<Array<gt.ImportFilesToArtifactsResponseItem>>
> {
  return await post("/importFilesToArtifacts", x);
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

export async function route_delete_artifacts(
  x: gt.DeleteArtifactsRequestInput,
): Promise<ResponseDataAndStatus<Array<string>>> {
  return await post("/deleteArtifacts", x);
}

export async function route_get_git_status(): Promise<
  ResponseDataAndStatus<gt.GetGitStatusResponse>
> {
  return await post("/git/status", null);
}

export async function route_get_git_diff(
  x: gt.GetGitDiffRequestInput,
): Promise<ResponseDataAndStatus<gt.GetGitDiffResponse>> {
  return await post("/git/diff", x);
}

export async function route_get_git_log(
  x: gt.GetGitLogRequestInput,
): Promise<ResponseDataAndStatus<gt.GetGitLogResponse>> {
  return await post("/git/log", x);
}

export async function route_get_git_commit_details(
  x: gt.GetGitCommitDetailsRequestInput,
): Promise<ResponseDataAndStatus<gt.GetGitCommitDetailsResponse>> {
  return await post("/git/commitDetails", x);
}

export async function route_get_git_commit_file_diff(
  x: gt.GetGitCommitFileDiffRequestInput,
): Promise<ResponseDataAndStatus<gt.GetGitCommitFileDiffResponse>> {
  return await post("/git/commitFileDiff", x);
}

export async function route_get_attachment_download_url(
  x: gt.GetAttachmentDownloadUrlRequestInput,
): Promise<ResponseDataAndStatus<gt.GetAttachmentDownloadUrlResponse>> {
  return await post("/getAttachmentDownloadUrl", x);
}

export async function route_get_attachment_download_urls(
  x: gt.GetAttachmentDownloadUrlsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.AttachmentDownloadUrlEntry>>> {
  return await post("/getAttachmentDownloadUrls", x);
}

export async function route_download_attachment(
  token: string,
): Promise<ResponseDataAndStatus<gt.Response>> {
  return await get("/attachments/{token}", { token });
}

export async function route_binary_upload(
  form: FormData,
): Promise<ResponseDataAndStatus<gt.BinaryContentRef>> {
  return await post("/binary/upload", form);
}

export async function route_binary_download(
  contentId: string,
): Promise<ResponseDataAndStatus<Uint8Array>> {
  return await getBinary("/binary/{contentId}", { contentId });
}

export async function route_get_listener_coverage(
  x: gt.ListenerCoverageRequestInput,
): Promise<ResponseDataAndStatus<gt.ListenerCoverageSnapshot>> {
  return await post("/getListenerCoverage", x);
}

export async function route_create_chat(
  x: gt.CreateChatRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/createChat", x);
}

export async function route_get_chat(
  x: gt.GetChatRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/getChat", x);
}

export async function route_append_chat_messages(
  x: gt.AppendChatMessagesRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/appendChatMessages", x);
}

export async function route_delete_chat(
  x: gt.DeleteChatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteChat", x);
}

export async function route_set_chat_system_prompt(
  x: gt.SetChatSystemPromptRequestInput,
): Promise<ResponseDataAndStatus<gt.Chat>> {
  return await post("/setChatSystemPrompt", x);
}

export async function route_get_all_chat_metadata(
  _request: gt.GetAllChatMetadataRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ChatMetadata>>> {
  return await post("/getAllChatMetadata", _request);
}

export async function route_run_mcp_tools(
  x: gt.RunMcpToolsRequestInput,
): Promise<ResponseDataAndStatus<Array<gt.ToolChatMessage>>> {
  return await post("/runMcpTools", x);
}

export async function route_emit_chat_stream_delta(
  x: gt.EmitChatStreamDeltaRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/emitChatStreamDelta", x);
}

export async function route_create_workspace_launch_intent(
  x: gt.CreateWorkspaceLaunchIntentRequestInput,
): Promise<ResponseDataAndStatus<gt.CreateWorkspaceLaunchIntentResponse>> {
  return await post("/createWorkspaceLaunchIntent", x);
}

export async function route_launch(
  x: gt.LaunchRequestInput,
): Promise<ResponseDataAndStatus<gt.LaunchResponse>> {
  return await post("/launch", x);
}

export async function route_get_launcher_recent_workspaces(
  setta_home: string | null,
): Promise<ResponseDataAndStatus<gt.LauncherRecentWorkspacesResponse>> {
  return await get("/launcherRecentWorkspaces", { setta_home });
}

export async function route_add_launcher_recent_workspace(
  x: gt.LauncherRecentWorkspaceRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherRecentWorkspacesResponse>> {
  return await post("/addLauncherRecentWorkspace", x);
}

export async function route_remove_launcher_recent_workspace(
  x: gt.LauncherRecentWorkspaceRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherRecentWorkspacesResponse>> {
  return await post("/removeLauncherRecentWorkspace", x);
}

export async function route_pin_launcher_recent_workspace(
  x: gt.PinLauncherRecentWorkspaceRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherRecentWorkspacesResponse>> {
  return await post("/pinLauncherRecentWorkspace", x);
}

export async function route_get_launcher_filesystem_roots(): Promise<
  ResponseDataAndStatus<gt.LauncherFilesystemRootsResponse>
> {
  return await get("/launcherFilesystemRoots");
}

export async function route_list_launcher_directory(
  x: gt.LauncherListDirectoryRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherListDirectoryResponse>> {
  return await post("/listLauncherDirectory", x);
}

export async function route_open_launcher_workspace(
  x: gt.LauncherOpenWorkspaceRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherOpenWorkspaceResponse>> {
  return await post("/openLauncherWorkspace", x);
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

export async function route_set_llm_config(
  config: gt.AllLLMConfigsInput,
): Promise<ResponseDataAndStatus<gt.AllLLMConfigs>> {
  return await post("/llm/config", config);
}

export async function route_get_llm_api_keys(): Promise<
  ResponseDataAndStatus<gt.ManagedAPIKeysResponse>
> {
  return await get("/llm/apiKeys");
}

export async function route_set_llm_api_keys(
  payload: gt.UpdateAPIKeysRequestInput,
): Promise<ResponseDataAndStatus<gt.ManagedAPIKeysResponse>> {
  return await post("/llm/apiKeys", payload);
}

export async function route_get_llm_response(
  x: gt.GetLLMResponseRequestInput,
): Promise<ResponseDataAndStatus<string | null>> {
  return await post("/getLLMResponse", x);
}

export async function route_start_transcription_session(
  x: gt.StartTranscriptionSessionRequestInput,
): Promise<ResponseDataAndStatus<gt.StartTranscriptionSessionResponse>> {
  return await post("/startTranscriptionSession", x);
}

export async function route_append_transcription_audio(
  x: gt.AppendTranscriptionAudioRequestInput,
): Promise<ResponseDataAndStatus<gt.TranscriptionSessionDeltaResponse>> {
  return await post("/appendTranscriptionAudio", x);
}

export async function route_stop_transcription_session(
  x: gt.StopTranscriptionSessionRequestInput,
): Promise<ResponseDataAndStatus<gt.TranscriptionSessionDeltaResponse>> {
  return await post("/stopTranscriptionSession", x);
}

export async function route_cancel_transcription_session(
  x: gt.CancelTranscriptionSessionRequestInput,
): Promise<ResponseDataAndStatus<gt.CancelTranscriptionSessionResponse>> {
  return await post("/cancelTranscriptionSession", x);
}

export async function route_stop_llm_chat(
  x: gt.StopLLMChatRequestInput,
): Promise<ResponseDataAndStatus<gt.StopLLMChatResponse>> {
  return await post("/stopLLMChat", x);
}

export async function route_get_llm_chat(
  x: gt.GetLLMChatRequestInput,
): Promise<ResponseDataAndStatus<gt.GetLLMChatRequestResponse>> {
  return await post("/getLLMChat", x);
}

export async function route_get_external_agent_chat(
  x: gt.GetExternalAgentChatRequestInput,
): Promise<ResponseDataAndStatus<gt.GetExternalAgentChatResponse>> {
  return await post("/getExternalAgentChat", x);
}

export async function route_get_ai_follow_snapshot(
  x: gt.GetAIFollowSnapshotRequestInput,
): Promise<
  ResponseDataAndStatus<Array<gt.AIFollowToolArgumentsUpdateContent>>
> {
  return await post("/getAIFollowSnapshot", x);
}

export async function route_get_app_gen_skills(): Promise<
  ResponseDataAndStatus<Array<gt.AppGenSkillEntry>>
> {
  return await get("/getAppGenSkills");
}

export async function route_get_app_gen_skill_content(
  x: gt.GetAppGenSkillContentRequestInput,
): Promise<ResponseDataAndStatus<gt.AppGenSkillContent>> {
  return await post("/getAppGenSkillContent", x);
}

export async function route_get_agent_profiles(): Promise<
  ResponseDataAndStatus<Array<gt.AgentProfile>>
> {
  return await get("/getAgentProfiles");
}

export async function route_get_agent_profile(
  x: gt.GetAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await post("/getAgentProfile", x);
}

export async function route_create_agent_profile(
  x: gt.CreateAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await post("/createAgentProfile", x);
}

export async function route_update_agent_profile(
  x: gt.UpdateAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentProfile>> {
  return await post("/updateAgentProfile", x);
}

export async function route_delete_agent_profile(
  x: gt.DeleteAgentProfileRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteAgentProfile", x);
}

export async function route_start_agent_run(
  x: gt.StartAgentRunRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/startAgentRun", x);
}

export async function route_stop_agent_run(
  x: gt.StopAgentRunRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/stopAgentRun", x);
}

export async function route_start_run_chain(
  x: gt.StartRunChainRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/startRunChain", x);
}

export async function route_stop_run_chain(
  x: gt.StopRunChainRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/stopRunChain", x);
}

export async function route_stop_external_agent_run(
  x: gt.StopExternalAgentRunRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/stopExternalAgentRun", x);
}

export async function route_respond_external_agent_approval(
  x: gt.RespondExternalAgentApprovalRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/respondExternalAgentApproval", x);
}

export async function route_respond_external_agent_question(
  x: gt.RespondExternalAgentQuestionRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/respondExternalAgentQuestion", x);
}

export async function route_get_agent_run(
  x: gt.GetAgentRunRequestInput,
): Promise<ResponseDataAndStatus<gt.AgentRun>> {
  return await post("/getAgentRun", x);
}

export async function route_get_agent_runs(): Promise<
  ResponseDataAndStatus<Array<gt.AgentRun>>
> {
  return await get("/getAgentRuns");
}

export async function route_get_agentic_summary_cache_status(
  x: gt.GetAgenticSummaryCacheStatusRequestInput,
): Promise<ResponseDataAndStatus<gt.AgenticSummaryCacheStatus>> {
  return await post("/getAgenticSummaryCacheStatus", x);
}

export async function route_get_prompt_templates(): Promise<
  ResponseDataAndStatus<Array<gt.PromptTemplate>>
> {
  return await get("/getPromptTemplates");
}

export async function route_get_prompt_template(
  x: gt.GetPromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await post("/getPromptTemplate", x);
}

export async function route_create_prompt_template(
  x: gt.CreatePromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await post("/createPromptTemplate", x);
}

export async function route_update_prompt_template(
  x: gt.UpdatePromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<gt.PromptTemplate>> {
  return await post("/updatePromptTemplate", x);
}

export async function route_delete_prompt_template(
  x: gt.DeletePromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deletePromptTemplate", x);
}

export async function route_get_external_agent_configs(): Promise<
  ResponseDataAndStatus<Array<gt.ExternalAgentConfig>>
> {
  return await get("/getExternalAgentConfigs");
}

export async function route_get_external_agent_config(
  x: gt.GetExternalAgentConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.ExternalAgentConfig>> {
  return await post("/getExternalAgentConfig", x);
}

export async function route_get_external_agent_health(): Promise<
  ResponseDataAndStatus<Array<gt.ExternalAgentPreflightStatus>>
> {
  return await get("/getExternalAgentHealth");
}

export async function route_create_external_agent_config(
  x: gt.CreateExternalAgentConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.ExternalAgentConfig>> {
  return await post("/createExternalAgentConfig", x);
}

export async function route_update_external_agent_config(
  x: gt.UpdateExternalAgentConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.ExternalAgentConfig>> {
  return await post("/updateExternalAgentConfig", x);
}

export async function route_delete_external_agent_config(
  x: gt.DeleteExternalAgentConfigRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteExternalAgentConfig", x);
}

export async function route_get_engine_configs(): Promise<
  ResponseDataAndStatus<Array<gt.EngineConfig>>
> {
  return await get("/getEngineConfigs");
}

export async function route_get_engine_config(
  x: gt.GetEngineConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.EngineConfig>> {
  return await post("/getEngineConfig", x);
}

export async function route_create_engine_config(
  x: gt.CreateEngineConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.EngineConfig>> {
  return await post("/createEngineConfig", x);
}

export async function route_update_engine_config(
  x: gt.UpdateEngineConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.EngineConfig>> {
  return await post("/updateEngineConfig", x);
}

export async function route_delete_engine_config(
  x: gt.DeleteEngineConfigRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteEngineConfig", x);
}

export async function route_get_transcription_profiles(): Promise<
  ResponseDataAndStatus<Array<gt.TranscriptionProfile>>
> {
  return await get("/getTranscriptionProfiles");
}

export async function route_create_transcription_profile(
  x: gt.CreateTranscriptionProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.TranscriptionProfile>> {
  return await post("/createTranscriptionProfile", x);
}

export async function route_update_transcription_profile(
  x: gt.UpdateTranscriptionProfileRequestInput,
): Promise<ResponseDataAndStatus<gt.TranscriptionProfile>> {
  return await post("/updateTranscriptionProfile", x);
}

export async function route_delete_transcription_profile(
  x: gt.DeleteTranscriptionProfileRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteTranscriptionProfile", x);
}

export async function route_stream_app_spec(
  x: gt.StreamAppSpecRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/streamAppSpec", x);
}

export async function route_get_app_catalog(): Promise<
  ResponseDataAndStatus<
    Record<string, any> | Array<any> | string | number | number | boolean | null
  >
> {
  return await get("/getAppCatalog");
}

export async function route_list_app_components(): Promise<
  ResponseDataAndStatus<Array<string>>
> {
  return await get("/listAppComponents");
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

export async function route_create_child_sections(
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

export async function route_toggle_view_mode_tab(
  x: gt.ToggleViewModeTabRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/toggleViewModeTab", x);
}

export async function route_set_view_mode_name(
  x: gt.SetViewModeNameRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setViewModeName", x);
}

export async function route_set_view_mode_sort_order(
  x: gt.SetViewModeSortOrderRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setViewModeSortOrder", x);
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

export async function route_get_latest_lsp_diagnostics(
  x: gt.GetLatestLspDiagnosticsRequestInput,
): Promise<ResponseDataAndStatus<gt.SettaLspDiagnosticsPayload>> {
  return await post("/getLatestLspDiagnostics", x);
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

export async function route_delete_selected_params(
  x: gt.DeleteSelectedParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteSelectedParams", x);
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

export async function route_set_variant_json_source_keys(
  x: gt.SetVariantJsonSourceKeysRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setVariantJsonSourceKeys", x);
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

export async function route_set_project_config_codegen_targets(
  x: gt.SetProjectConfigCodegenTargetsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setProjectConfigCodegenTargets", x);
}

export async function route_get_app_definition(
  x: gt.GetAppDefinitionRequestInput,
): Promise<ResponseDataAndStatus<gt.AppDefinitionResponse>> {
  return await post("/getAppDefinition", x);
}

export async function route_validate_app_definition(
  x: gt.ValidateAppDefinitionRequestInput,
): Promise<ResponseDataAndStatus<gt.ValidateAppDefinitionResponse>> {
  return await post("/validateAppDefinition", x);
}

export async function route_set_app_definition(
  x: gt.SetAppDefinitionRequestInput,
): Promise<ResponseDataAndStatus<gt.AppDefinitionResponse>> {
  return await post("/setAppDefinition", x);
}

export async function route_update_app_definition(
  x: gt.UpdateAppDefinitionRequestInput,
): Promise<ResponseDataAndStatus<gt.AppDefinitionResponse>> {
  return await post("/updateAppDefinition", x);
}

export async function route_set_prompt_template(
  x: gt.SetPromptTemplateRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setPromptTemplate", x);
}

export async function route_set_prompt_inputs(
  x: gt.SetPromptInputsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setPromptInputs", x);
}

export async function route_set_prompt_format(
  x: gt.SetPromptFormatRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setPromptFormat", x);
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

export async function route_set_watch_code_enabled(
  x: gt.SetWatchCodeEnabledRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setWatchCodeEnabled", x);
}

export async function route_set_watch_code_inputs(
  x: gt.SetWatchCodeInputsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setWatchCodeInputs", x);
}

export async function route_set_param_entered_value(
  x: gt.SetParamEnteredValueRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setParamEnteredValue", x);
}

export async function route_get_password_param_value(
  x: gt.GetPasswordParamValueRequestInput,
): Promise<ResponseDataAndStatus<gt.GetPasswordParamValueResponse>> {
  return await post("/getPasswordParamValue", x);
}

export async function route_set_type_error_ignore(
  x: gt.SetTypeErrorIgnoreRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTypeErrorIgnore", x);
}

export async function route_set_code_section_diagnostics_mute(
  x: gt.SetCodeSectionDiagnosticsMuteRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeSectionDiagnosticsMute", x);
}

export async function route_set_code_section_diagnostic_code_suppression(
  x: gt.SetCodeSectionDiagnosticCodeSuppressionRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeSectionDiagnosticCodeSuppression", x);
}

export async function route_set_code_section_attached_terminal(
  x: gt.SetCodeSectionAttachedTerminalRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setCodeSectionAttachedTerminal", x);
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

export async function route_format_code(
  x: gt.FormatCodeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/formatCode", x);
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

export async function route_create_agentic_edge(
  x: gt.CreateAgenticEdgeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/createAgenticEdge", x);
}

export async function route_update_agentic_edge(
  x: gt.UpdateAgenticEdgeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/updateAgenticEdge", x);
}

export async function route_delete_agentic_edges(
  x: gt.DeleteAgenticEdgesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/deleteAgenticEdges", x);
}

export async function route_set_agentic_edges(
  x: gt.SetAgenticEdgesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setAgenticEdges", x);
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

export async function route_set_section_variant_sort_order(
  x: gt.SetSectionVariantSortOrderRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionVariantSortOrder", x);
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

export async function route_set_section_tag_color(
  x: gt.SetSectionTagColorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionTagColor", x);
}

export async function route_set_section_style_color(
  x: gt.SetSectionStyleColorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionStyleColor", x);
}

export async function route_set_meta_control_show_section_title(
  x: gt.SetMetaControlShowSectionTitleRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setMetaControlShowSectionTitle", x);
}

export async function route_accept_rename_refactor(
  x: gt.AcceptRenameRefactorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/acceptRenameRefactor", x);
}

export async function route_decline_rename_refactor(
  x: gt.DeclineRenameRefactorRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/declineRenameRefactor", x);
}

export async function route_set_text_block_display_mode(
  x: gt.SetTextBlockDisplayModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockDisplayMode", x);
}

export async function route_set_text_block_master_font_size(
  x: gt.SetTextBlockMasterFontSizeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTextBlockMasterFontSize", x);
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

export async function route_set_section_pinned_params(
  x: gt.SetSectionPinnedParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionPinnedParams", x);
}

export async function route_set_section_column_width(
  x: gt.SetSectionColumnWidthRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSectionColumnWidth", x);
}

export async function route_set_parent_default_child_section_type(
  x: gt.SetParentDefaultChildSectionTypeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setParentDefaultChildSectionType", x);
}

export async function route_set_list_root_view_mode(
  x: gt.SetListRootViewModeRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setListRootViewMode", x);
}

export async function route_set_task_board_section_state(
  x: gt.SetTaskBoardSectionStateRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setTaskBoardSectionState", x);
}

export async function route_set_spreadsheet_file_path(
  x: gt.SetSpreadsheetFilePathRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSpreadsheetFilePath", x);
}

export async function route_set_spreadsheet_section_settings(
  x: gt.SetSpreadsheetSectionSettingsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setSpreadsheetSectionSettings", x);
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

export async function route_set_browser_saved_searches(
  x: gt.SetBrowserSavedSearchesRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/setBrowserSavedSearches", x);
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

export async function route_get_chat_section_chat_id(
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

export async function route_move_sections(
  x: gt.MoveSectionsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/moveSections", x);
}

export async function route_move_params(
  x: gt.MoveParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/moveParams", x);
}

export async function route_move_param_groups(
  x: gt.MoveParamGroupsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/moveParamGroups", x);
}

export async function route_indent_params(
  x: gt.IndentParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/indentParams", x);
}

export async function route_unindent_params(
  x: gt.UnindentParamsRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/unindentParams", x);
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

export async function route_plugins_runtime(): Promise<
  ResponseDataAndStatus<gt.PluginRuntimeResponse>
> {
  return await get("/plugins/runtime");
}

export async function route_plugins_rescan(): Promise<
  ResponseDataAndStatus<gt.PluginsRescanResponse>
> {
  return await post("/plugins/rescan", null);
}

export async function route_plugins_restart(): Promise<
  ResponseDataAndStatus<gt.PluginRestartResponse>
> {
  return await post("/plugins/restart", null);
}

export async function route_plugins_install(
  x: gt.PluginInstallRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginInstallResponse>> {
  return await post("/plugins/install", x);
}

export async function route_plugins_uninstall(
  x: gt.PluginUninstallRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginUninstallResponse>> {
  return await post("/plugins/uninstall", x);
}

export async function route_plugins_link(
  x: gt.PluginLinkRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginInstallResponse>> {
  return await post("/plugins/link", x);
}

export async function route_plugins_enable(
  x: gt.PluginEnableDisableRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginEnableDisableResponse>> {
  return await post("/plugins/enable", x);
}

export async function route_plugins_disable(
  x: gt.PluginEnableDisableRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginEnableDisableResponse>> {
  return await post("/plugins/disable", x);
}

export async function route_plugins_config(
  x: gt.PluginConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginConfigWriteResponse>> {
  return await post("/plugins/config", x);
}

export async function route_plugins_update(
  x: gt.PluginUpdateRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginUpdateResponse>> {
  return await post("/plugins/update", x);
}

export async function route_plugins_rollback(
  x: gt.PluginRollbackRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginRollbackResponse>> {
  return await post("/plugins/rollback", x);
}

export async function route_plugins_lock_write(): Promise<
  ResponseDataAndStatus<gt.PluginLockWriteResponse>
> {
  return await post("/plugins/lock/write", null);
}

export async function route_plugins_lock_apply(
  x: gt.PluginLockApplyRequestInput,
): Promise<ResponseDataAndStatus<gt.PluginLockApplyResponse>> {
  return await post("/plugins/lock/apply", x);
}

export async function route_get_backend_init_status(): Promise<
  ResponseDataAndStatus<gt.BackendInitStatusResponse>
> {
  return await get("/backendInitStatus");
}

export async function route_get_auth_refresh_status(): Promise<
  ResponseDataAndStatus<gt.AuthRefreshStatusResponse>
> {
  return await get("/authRefreshStatus");
}

export async function route_get_server_mode(): Promise<
  ResponseDataAndStatus<gt.ServerModeResponse>
> {
  return await get("/serverMode");
}

export async function route_get_setta_home_info(): Promise<
  ResponseDataAndStatus<gt.SettaHomeInfoResponse>
> {
  return await get("/settaHomeInfo");
}

export async function route_get_launcher_status(
  setta_home: string | null,
): Promise<ResponseDataAndStatus<gt.LauncherStatusResponse>> {
  return await get("/launcherStatus", { setta_home });
}

export async function route_setup_launcher(
  x: gt.SetupLauncherRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherStatusResponse>> {
  return await post("/setupLauncher", x);
}

export async function route_repair_launcher(
  x: gt.LauncherRequestBaseInput,
): Promise<ResponseDataAndStatus<gt.LauncherStatusResponse>> {
  return await post("/repairLauncher", x);
}

export async function route_remove_launcher(
  x: gt.LauncherRequestBaseInput,
): Promise<ResponseDataAndStatus<gt.LauncherStatusResponse>> {
  return await post("/removeLauncher", x);
}

export async function route_update_launcher(
  x: gt.UpdateLauncherRequestInput,
): Promise<ResponseDataAndStatus<gt.LauncherUpdateResponse>> {
  return await post("/updateLauncher", x);
}

export async function route_get_mcp_server_runtime_status(
  x: gt.GetMCPServerRuntimeStatusRequestInput,
): Promise<ResponseDataAndStatus<gt.MCPServerRuntimeStatusResponse>> {
  return await post("/mcpServerRuntimeStatus", x);
}

export async function route_reveal_path_in_os_file_explorer(
  x: gt.RevealPathInOsFileExplorerRequestInput,
): Promise<ResponseDataAndStatus<null>> {
  return await post("/revealPathInOsFileExplorer", x);
}

export async function route_list_share_deployments(): Promise<
  ResponseDataAndStatus<Array<gt.ShareDeploymentMetadata>>
> {
  return await get("/share/deployments");
}

export async function route_list_share_deployment_versions(
  deploymentName: string,
): Promise<ResponseDataAndStatus<Array<gt.ShareDeploymentMetadata>>> {
  return await get("/share/deployments/{deploymentName}/versions", {
    deploymentName,
  });
}

export async function route_get_latest_share_deployment(
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

export async function route_create_share_session(
  deploymentName: string,
  version: string,
): Promise<ResponseDataAndStatus<gt.ShareDeploymentSessionResponse>> {
  return await post(
    "/share/deployments/{deploymentName}/{version}/session",
    null,
    { deploymentName, version },
  );
}

export async function route_get_share_deployment_state(
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

export async function route_list_app_deployments(): Promise<
  ResponseDataAndStatus<Array<gt.AppDeploymentMetadata>>
> {
  return await get("/app/deployments");
}

export async function route_list_app_deployment_versions(
  deploymentName: string,
): Promise<ResponseDataAndStatus<Array<gt.AppDeploymentMetadata>>> {
  return await get("/app/deployments/{deploymentName}/versions", {
    deploymentName,
  });
}

export async function route_get_latest_app_deployment(
  deploymentName: string,
): Promise<ResponseDataAndStatus<gt.AppDeploymentMetadata>> {
  return await get("/app/deployments/{deploymentName}/latest", {
    deploymentName,
  });
}

export async function route_create_app_session_current(): Promise<
  ResponseDataAndStatus<gt.AppDeploymentSessionResponse>
> {
  return await post("/app/deployments/current/session", null);
}

export async function route_create_app_session(
  deploymentName: string,
  version: string,
): Promise<ResponseDataAndStatus<gt.AppDeploymentSessionResponse>> {
  return await post(
    "/app/deployments/{deploymentName}/{version}/session",
    null,
    { deploymentName, version },
  );
}

export async function route_get_app_deployment_state(
  deploymentName: string,
  version: string,
): Promise<ResponseDataAndStatus<gt.AppDeploymentStateResponse>> {
  return await get("/app/deployments/{deploymentName}/{version}/state", {
    deploymentName,
    version,
  });
}

export async function route_load_app_project_config(
  deploymentName: string,
  version: string,
  x: gt.LoadAppProjectConfigRequestInput,
): Promise<ResponseDataAndStatus<gt.AppDeploymentStateResponse>> {
  return await post(
    "/app/deployments/{deploymentName}/{version}/project_config",
    x,
    { deploymentName, version },
  );
}

export async function route_publish_app_deployment(
  x: gt.PublishAppDeploymentRequestInput,
): Promise<ResponseDataAndStatus<gt.AppDeploymentMetadata>> {
  return await post("/app/deployments", x);
}
