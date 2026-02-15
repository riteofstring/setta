import {
  createCsvArtifactId as create_csv_artifact_id,
  createFileArtifactId as create_file_artifact_id,
  createJsonArtifactId as create_json_artifact_id,
  createNewId as create_new_id,
  createPngArtifactId as create_png_artifact_id,
  createRandomName as generate_memorable_string,
} from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import { z } from "zod";

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export type ObjectValues<T> = T[keyof T];
export const ControlCodeObjTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const SectionParamCodeObjTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseChartSettingsTypeSet = new Set(["line", "scatter"]);

export const BaseChatMessageTypeSet = new Set([
  "assistant",
  "system",
  "tool",
  "user",
]);

export const ContentChatMessageTypeSet = new Set([
  "assistant",
  "system",
  "user",
]);

export const BaseClipboardDataTypeSet = new Set(["Sections"]);

export const BaseDependencyKeyTypeSet = new Set(["Section", "SectionParam"]);

export const BaseDependencyValueTypeSet = new Set([
  "Binary",
  "FileRead",
  "Literal",
]);

export const BaseArtifactTypeSet = new Set([
  "BrushStroke",
  "ChartData",
  "DrawAreaLayerItemTransform",
  "File",
  "Image",
]);

export const BaseCanvasSectionImplArgsTypeSet = new Set(["Chart", "Draw"]);

export const BaseCanvasSectionImplTypeSet = new Set(["Chart", "Draw"]);

export const BaseChildlessCodeObjImplArgsTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseChildlessCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseCodeObjImplArgsTypeSet = new Set([
  "ButtonParam",
  "CodeCallable",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseCodeObjImplTypeSet = new Set([
  "ButtonParam",
  "CodeCallable",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseCodeSectionImplArgsTypeSet = new Set([
  "Code",
  "GenPythonCode",
  "GenPythonMetadata",
]);

export const BaseCodeSectionImplTypeSet = new Set([
  "Code",
  "GenPythonCode",
  "GenPythonMetadata",
]);

export const BaseDictSectionImplArgsTypeSet = new Set([
  "Dict",
  "GlobalVariables",
]);

export const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

export const BaseParamCodeObjImplArgsTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseParamCodeObjImplTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
]);

export const BaseParentCodeObjImplArgsTypeSet = new Set([
  "CodeCallable",
  "NestedParam",
]);

export const BaseParentCodeObjImplTypeSet = new Set([
  "CodeCallable",
  "NestedParam",
]);

export const BaseParentSectionImplArgsTypeSet = new Set([
  "Code",
  "GenPythonCode",
  "GenPythonMetadata",
  "Group",
  "ListRoot",
]);

export const BaseParentSectionImplTypeSet = new Set([
  "Code",
  "GenPythonCode",
  "GenPythonMetadata",
  "Group",
  "ListRoot",
]);

export const BaseSectionImplArgsTypeSet = new Set([
  "Browser",
  "Callable",
  "Chart",
  "Chat",
  "Code",
  "Dict",
  "Draw",
  "GenPythonCode",
  "GenPythonMetadata",
  "GlobalVariables",
  "Group",
  "IFrame",
  "Image",
  "ListRoot",
  "MetaControl",
  "Plugin",
  "Prompt",
  "Social",
  "Terminal",
  "TextBlock",
]);

export const BaseSectionImplTypeSet = new Set([
  "Browser",
  "Callable",
  "Chart",
  "Chat",
  "Code",
  "Dict",
  "Draw",
  "GenPythonCode",
  "GenPythonMetadata",
  "GlobalVariables",
  "Group",
  "IFrame",
  "Image",
  "ListRoot",
  "MetaControl",
  "Plugin",
  "Prompt",
  "Social",
  "Terminal",
  "TextBlock",
]);

export const BaseSectionWithParamsImplArgsTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
]);

export const BaseSectionWithParamsImplTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
]);

export const BackendWebsocketMsgTypeSet = new Set([
  "CurrentAddressUpdate",
  "RealtimeDependencyEvent",
  "RealtimeUIChange",
]);

export const FrontendWebsocketMsgTypeSet = new Set([
  "AIFollowToolArgumentsUpdate",
  "AIFollowToolResultUpdate",
  "AgentProfilesUpdated",
  "AllConnections",
  "AllProjectMetadata",
  "BackendLogEvent",
  "EngineConfigsUpdated",
  "ExternalAgentConfigsUpdated",
  "LLMApiKeysUpdated",
  "LLMConfigUpdated",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "ListenerCoverageSnapshot",
  "NameValidationErrors",
  "Notification",
  "PromptTemplatesUpdated",
  "ReturnRenameRefactorResults",
  "TerminalMetadata",
  "UpdateArtifacts",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const PythonScriptWebsocketMsgTypeSet = new Set([
  "ListenerDependencyEvent",
  "ListenerError",
  "ListenerForceRefresh",
  "ListenerFrontendEmit",
  "ListenerInit",
  "ListenerRealtimeEvent",
  "ListenerRegister",
  "ListenerRegisterAck",
  "ListenerRouterEndpointCall",
  "ListenerRouterEndpointResult",
]);

export const WebsocketMsgTypeSet = new Set([
  "AIFollowToolArgumentsUpdate",
  "AIFollowToolResultUpdate",
  "AgentProfilesUpdated",
  "AllConnections",
  "AllProjectMetadata",
  "BackendLogEvent",
  "CurrentAddressUpdate",
  "EngineConfigsUpdated",
  "ExternalAgentConfigsUpdated",
  "LLMApiKeysUpdated",
  "LLMConfigUpdated",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "ListenerCoverageSnapshot",
  "ListenerDependencyEvent",
  "ListenerError",
  "ListenerForceRefresh",
  "ListenerFrontendEmit",
  "ListenerInit",
  "ListenerRealtimeEvent",
  "ListenerRegister",
  "ListenerRegisterAck",
  "ListenerRouterEndpointCall",
  "ListenerRouterEndpointResult",
  "NameValidationErrors",
  "Notification",
  "PromptTemplatesUpdated",
  "RealtimeDependencyEvent",
  "RealtimeUIChange",
  "ReturnRenameRefactorResults",
  "TerminalMetadata",
  "UpdateArtifacts",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const SINGLETON_SECTION_TYPES = new Set([
  "GenPythonCode",
  "GenPythonMetadata",
  "GlobalVariables",
]);

export const RUNNABLE_CODE_LANGUAGES = new Set(["bash", "python"]);

export const ALLOWED_PATCH_OPS = new Set(["add", "remove", "replace", "set"]);

export const AgentRunStatusEnum = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type AgentRunStatus = ObjectValues<typeof AgentRunStatusEnum>;

export const EngineTypeEnum = {
  setta_llm: "setta_llm",
  external_agent: "external_agent",
} as const;

export type EngineType = ObjectValues<typeof EngineTypeEnum>;

export const AgenticEdgeContextModeEnum = {
  reference_only: "reference_only",
  inline_text: "inline_text",
  summary: "summary",
} as const;

export type AgenticEdgeContextMode = ObjectValues<
  typeof AgenticEdgeContextModeEnum
>;

export const AgenticEdgeKindEnum = {
  chat_chat: "chat_chat",
  section_chat: "section_chat",
  chat_section: "chat_section",
} as const;

export type AgenticEdgeKind = ObjectValues<typeof AgenticEdgeKindEnum>;

export const ArtifactTypeEnum = {
  Image: "Image",
  BrushStroke: "BrushStroke",
  DrawAreaLayerItemTransform: "DrawAreaLayerItemTransform",
  ChartData: "ChartData",
  File: "File",
} as const;

export type ArtifactType = ObjectValues<typeof ArtifactTypeEnum>;

export const ChartTypeEnum = { line: "line", scatter: "scatter" } as const;

export type ChartType = ObjectValues<typeof ChartTypeEnum>;

export const DrawAreaBrushShapeEnum = {
  butt: "butt",
  round: "round",
  square: "square",
} as const;

export type DrawAreaBrushShape = ObjectValues<typeof DrawAreaBrushShapeEnum>;

export const DrawAreaModeEnum = {
  draw: "draw",
  erase: "erase",
  edit: "edit",
} as const;

export type DrawAreaMode = ObjectValues<typeof DrawAreaModeEnum>;

export const ChatRoleEnum = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
} as const;

export type ChatRole = ObjectValues<typeof ChatRoleEnum>;

export const StreamingEventTypeEnum = {
  MESSAGE_START: "message_start",
  DELTA: "delta",
  TOOL_CALL_DELTA: "tool_call_delta",
  TOOL_ARGUMENT_PREVIEW_DELTA: "tool_argument_preview_delta",
  TOOL_RESULT: "tool_result",
  MESSAGE_STOP: "message_stop",
  MESSAGE_FINALIZED: "message_finalized",
} as const;

export type StreamingEventType = ObjectValues<typeof StreamingEventTypeEnum>;

export const ToolArgumentPreviewKindEnum = {
  code: "code",
  paramValue: "paramValue",
  callableName: "callableName",
  appSpecPatch: "appSpecPatch",
} as const;

export type ToolArgumentPreviewKind = ObjectValues<
  typeof ToolArgumentPreviewKindEnum
>;

export const ClipboardDataTypeEnum = { Sections: "Sections" } as const;

export type ClipboardDataType = ObjectValues<typeof ClipboardDataTypeEnum>;

export const ButtonActionModeEnum = {
  WEBSOCKET_LISTENER: "WEBSOCKET_LISTENER",
  HTTP_REQUEST: "HTTP_REQUEST",
  SETTA_API: "SETTA_API",
} as const;

export type ButtonActionMode = ObjectValues<typeof ButtonActionModeEnum>;

export const CodeObjTypeEnum = {
  CodeCallable: "CodeCallable",
  CodeParam: "CodeParam",
  TextParam: "TextParam",
  ButtonParam: "ButtonParam",
  SliderParam: "SliderParam",
  RotaryParam: "RotaryParam",
  SwitchParam: "SwitchParam",
  ColorPickerParam: "ColorPickerParam",
  DropdownParam: "DropdownParam",
  PasswordParam: "PasswordParam",
  TextAreaParam: "TextAreaParam",
  DropzoneParam: "DropzoneParam",
  NestedParam: "NestedParam",
} as const;

export type CodeObjType = ObjectValues<typeof CodeObjTypeEnum>;

export const DropzoneModeEnum = {
  STATEFUL: "STATEFUL",
  STATELESS: "STATELESS",
} as const;

export type DropzoneMode = ObjectValues<typeof DropzoneModeEnum>;

export const HttpRequestMethodEnum = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
} as const;

export type HttpRequestMethod = ObjectValues<typeof HttpRequestMethodEnum>;

export const ParamNameTypeEnum = { CODE: "CODE", TEXT: "TEXT" } as const;

export type ParamNameType = ObjectValues<typeof ParamNameTypeEnum>;

export const ParameterPassingStyleEnum = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;

export type ParameterPassingStyle = ObjectValues<
  typeof ParameterPassingStyleEnum
>;

export const SectionTypeEnum = {
  Callable: "Callable",
  Dict: "Dict",
  ListRoot: "ListRoot",
  Group: "Group",
  Image: "Image",
  Chart: "Chart",
  Draw: "Draw",
  TextBlock: "TextBlock",
  Prompt: "Prompt",
  MetaControl: "MetaControl",
  Social: "Social",
  GlobalVariables: "GlobalVariables",
  Code: "Code",
  GenPythonCode: "GenPythonCode",
  GenPythonMetadata: "GenPythonMetadata",
  Terminal: "Terminal",
  IFrame: "IFrame",
  Chat: "Chat",
  Browser: "Browser",
  Plugin: "Plugin",
} as const;

export type SectionType = ObjectValues<typeof SectionTypeEnum>;

export const DependencyKeyTypeEnum = {
  Section: "Section",
  SectionParam: "SectionParam",
} as const;

export type DependencyKeyType = ObjectValues<typeof DependencyKeyTypeEnum>;

export const DependencyValueTypeEnum = {
  Literal: "Literal",
  Binary: "Binary",
  FileRead: "FileRead",
} as const;

export type DependencyValueType = ObjectValues<typeof DependencyValueTypeEnum>;

export const ClaudeSettingsSourceEnum = {
  user: "user",
  project: "project",
  local: "local",
} as const;

export type ClaudeSettingsSource = ObjectValues<
  typeof ClaudeSettingsSourceEnum
>;

export const ExternalAgentRunModeEnum = {
  mcp: "mcp",
  server: "server",
  sdk: "sdk",
  app_server: "app_server",
} as const;

export type ExternalAgentRunMode = ObjectValues<
  typeof ExternalAgentRunModeEnum
>;

export const ExternalAgentSettingsModeEnum = {
  read_only: "read_only",
  managed_local: "managed_local",
  managed_project: "managed_project",
  explicit_path: "explicit_path",
} as const;

export type ExternalAgentSettingsMode = ObjectValues<
  typeof ExternalAgentSettingsModeEnum
>;

export const ExternalAgentToolTypeEnum = {
  claude_code: "claude_code",
  codex: "codex",
  opencode: "opencode",
  plugin: "plugin",
} as const;

export type ExternalAgentToolType = ObjectValues<
  typeof ExternalAgentToolTypeEnum
>;

export const ExternalAgentWorkingDirStrategyEnum = {
  project_root: "project_root",
  temp_dir: "temp_dir",
  custom: "custom",
} as const;

export type ExternalAgentWorkingDirStrategy = ObjectValues<
  typeof ExternalAgentWorkingDirStrategyEnum
>;

export const BrowserAreaViewModeEnum = {
  list: "list",
  thumbnail: "thumbnail",
  carousel: "carousel",
} as const;

export type BrowserAreaViewMode = ObjectValues<typeof BrowserAreaViewModeEnum>;

export const CodeLanguageEnum = {
  python: "python",
  bash: "bash",
  javascript: "javascript",
  typescript: "typescript",
  json: "json",
  yaml: "yaml",
  toml: "toml",
  markdown: "markdown",
  plaintext: "plaintext",
} as const;

export type CodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const PromptFormatEnum = { Jinja: "Jinja" } as const;

export type PromptFormat = ObjectValues<typeof PromptFormatEnum>;

export const TextBlockDisplayModeEnum = {
  Render: "Render",
  Edit: "Edit",
} as const;

export type TextBlockDisplayMode = ObjectValues<
  typeof TextBlockDisplayModeEnum
>;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;

export type TextBlockFormat = ObjectValues<typeof TextBlockFormatEnum>;

export const SectionSizeModeEnum = { auto: "auto" } as const;

export type SectionSizeMode = ObjectValues<typeof SectionSizeModeEnum>;

export const ListenerDependencyModeEnum = {
  REFRESH_ONLY: "refresh_only",
  REALTIME_ONLY: "realtime_only",
  ALWAYS: "always",
} as const;

export type ListenerDependencyMode = ObjectValues<
  typeof ListenerDependencyModeEnum
>;

export const SettaBackendLogEventSeverityEnum = {
  critical: "critical",
  error: "error",
  warning: "warning",
  info: "info",
} as const;

export type SettaBackendLogEventSeverity = ObjectValues<
  typeof SettaBackendLogEventSeverityEnum
>;

export const SettaNotificationTypeEnum = {
  error: "error",
  warning: "warning",
  info: "info",
  save: "save",
} as const;

export type SettaNotificationType = ObjectValues<
  typeof SettaNotificationTypeEnum
>;

export const CodeObjValueRepresentationModeEnum = {
  expression: "expression",
  json_parsed: "json_parsed",
  string: "string",
  file_path: "file_path",
  file_read: "file_read",
} as const;

export type CodeObjValueRepresentationMode = ObjectValues<
  typeof CodeObjValueRepresentationModeEnum
>;

export const ProjectCodegenLanguageEnum = { python: "python" } as const;

export type ProjectCodegenLanguage = ObjectValues<
  typeof ProjectCodegenLanguageEnum
>;

export const SectionCodegenModeEnum = {
  inherit: "inherit",
  include: "include",
  exclude: "exclude",
} as const;

export type SectionCodegenMode = ObjectValues<typeof SectionCodegenModeEnum>;

export const SectionRepresentationModeEnum = {
  expression: "expression",
  file_path: "file_path",
  file_read: "file_read",
} as const;

export type SectionRepresentationMode = ObjectValues<
  typeof SectionRepresentationModeEnum
>;

export const WatchCodeCallableKindEnum = {
  function: "function",
  async_function: "async_function",
  class_init: "class_init",
} as const;

export type WatchCodeCallableKind = ObjectValues<
  typeof WatchCodeCallableKindEnum
>;

export const CodeFileAccessModeEnum = {
  read_only: "read_only",
  read_write: "read_write",
  write_only: "write_only",
} as const;

export type CodeFileAccessMode = ObjectValues<typeof CodeFileAccessModeEnum>;

export const RouteEnum = {
  PREFIX: "/api",
  BOOTSTRAP_PAGE: "/__setta__/bootstrap",
  BOOTSTRAP_CONSUME: "/__setta__/bootstrap/consume",
  TOOLS_CALL: "/__setta__/tools/call",
  SWAGGER_DOCS: "/docs",
  OPENAPI_DOCS: "/openapi.json",
  REDOC_DOCS: "/redoc",
  LOAD_ALL_PROJECT_METADATA: "/loadAllProjectMetadata",
  LOAD_PROJECT_CONFIG: "/loadProjectConfig",
  SAVE_PROJECT: "/saveProject",
  CREATE_PROJECT_CONFIG: "/createProjectConfig",
  DELETE_PROJECT_CONFIGS: "/deleteProjectConfigs",
  SAVE_AS_NEW_PROJECT_CONFIG: "/saveAsNewProjectConfig",
  SET_PROJECT_CONFIG_NAME: "/setProjectConfigName",
  SAVE_SETTINGS: "/saveSettings",
  LOAD_SETTINGS: "/loadSettings",
  GET_BACKEND_INIT_STATUS: "/backendInitStatus",
  GET_AUTH_REFRESH_STATUS: "/authRefreshStatus",
  GET_SERVER_MODE: "/serverMode",
  GET_SETTA_HOME_INFO: "/settaHomeInfo",
  PLUGINS_RUNTIME: "/plugins/runtime",
  PLUGINS_INSTALL: "/plugins/install",
  PLUGINS_UNINSTALL: "/plugins/uninstall",
  PLUGINS_LINK: "/plugins/link",
  PLUGINS_ENABLE: "/plugins/enable",
  PLUGINS_DISABLE: "/plugins/disable",
  PLUGINS_CONFIG: "/plugins/config",
  PLUGINS_UPDATE: "/plugins/update",
  PLUGINS_ROLLBACK: "/plugins/rollback",
  PLUGINS_LOCK_WRITE: "/plugins/lock/write",
  PLUGINS_LOCK_APPLY: "/plugins/lock/apply",
  PLUGINS_RESCAN: "/plugins/rescan",
  PLUGINS_RESTART: "/plugins/restart",
  REVEAL_PATH_IN_OS_FILE_EXPLORER: "/revealPathInOsFileExplorer",
  LAUNCH: "/launch",
  SAVE_SETTINGS_PROJECT: "/saveSettingsProject",
  LOAD_SETTINGS_PROJECT: "/loadSettingsProject",
  TERMINAL: "/{projectConfigId}/{sectionId}/{id}",
  DELETE_TERMINALS: "/deleteTerminals",
  WEBSOCKET_FRONTEND: "/frontend",
  WEBSOCKET_CLI: "/cli",
  WEBSOCKET_CLI_WITH_ID: "/cli/{id}",
  WEBSOCKET_PYTHON_SCRIPT: "/pythonScript/{id}",
  SAVE_CODE_INFO: "/codeInfo/save",
  KILL_SUBPROCESSES: "/killSubprocesses",
  FORMAT_CODE: "/formatCode",
  SEND_ARTIFACT: "/sendArtfiact",
  LOAD_ARTIFACTS: "/loadArtifacts",
  LOAD_AVAILABLE_ARTIFACTS: "/loadAvailableArtifacts",
  UPDATE_ARTIFACTS: "/updateArtifacts",
  BINARY_UPLOAD: "/binary/upload",
  BINARY_DOWNLOAD: "/binary/{contentId}",
  FILL_IN_MISSING_ARTIFACT_IDS: "/getArtifactIdsFromNamePathType",
  GET_DEFAULT_PROJECT_CONFIG_NAME: "/getDefaultConfigName",
  DOCSTRING_TO_MARKDOWN: "/docstringToMarkdown",
  NEW_JSON_VERSION_NAME: "/newJsonVersionName",
  SET_AS_DEFAULT_PROJECT: "/setAsDefaultProject",
  FILTER_DATA_FOR_JSON_EXPORT: "/filterDataForJSONExport",
  ADD_DEFAULT_DATA_FOR_JSON_IMPORT: "/addDefaultDataForJSONImport",
  GET_JSON_SOURCE_PATH_TO_BE_DELETED: "/getJsonSourcePathToBeDeleted",
  CREATE_FILE: "/createFile",
  DELETE_JSON_SOURCE_FILE_AND_VARIANT: "/deleteJsonSourceFileAndVariant",
  CHECK_IF_FILE_EXISTS: "/checkIfFileExists",
  LOAD_ARTIFACT_FROM_DISK: "/loadArtifactFromDisk",
  GET_ATTACHMENT_DOWNLOAD_URL: "/getAttachmentDownloadUrl",
  GET_ATTACHMENT_DOWNLOAD_URLS: "/getAttachmentDownloadUrls",
  ATTACHMENT_DOWNLOAD: "/attachments/{token}",
  RESTART_LANGUAGE_SERVER: "/restartLanguageServer",
  GET_NOTIFICATIONS: "/getNotifications",
  DELETE_NOTIFICATION: "/deleteNotification",
  GET_LLM_RESPONSE: "/getLLMResponse",
  GET_LISTENER_COVERAGE: "/getListenerCoverage",
  LLM_CONFIG: "/llm/config",
  LLM_API_KEYS: "/llm/apiKeys",
  GET_ALL_LLM_CHAT_METADATA: "/getAllLLMChatMetadata",
  DELETE_LLM_CHAT: "/deleteLLMChat",
  STOP_LLM_CHAT: "/stopLLMChat",
  GET_LLM_CHAT: "/getLLMChat",
  GET_EXTERNAL_AGENT_CHAT: "/getExternalAgentChat",
  GET_AI_FOLLOW_SNAPSHOT: "/getAIFollowSnapshot",
  GET_AGENTIC_SUMMARY_CACHE_STATUS: "/getAgenticSummaryCacheStatus",
  GET_AGENT_PROFILES: "/getAgentProfiles",
  GET_AGENT_PROFILE: "/getAgentProfile",
  CREATE_AGENT_PROFILE: "/createAgentProfile",
  UPDATE_AGENT_PROFILE: "/updateAgentProfile",
  DELETE_AGENT_PROFILE: "/deleteAgentProfile",
  START_AGENT_RUN: "/startAgentRun",
  STOP_AGENT_RUN: "/stopAgentRun",
  START_RUN_CHAIN: "/startRunChain",
  STOP_RUN_CHAIN: "/stopRunChain",
  GET_AGENT_RUN: "/getAgentRun",
  GET_AGENT_RUNS: "/getAgentRuns",
  GET_PROMPT_TEMPLATES: "/getPromptTemplates",
  GET_PROMPT_TEMPLATE: "/getPromptTemplate",
  CREATE_PROMPT_TEMPLATE: "/createPromptTemplate",
  UPDATE_PROMPT_TEMPLATE: "/updatePromptTemplate",
  DELETE_PROMPT_TEMPLATE: "/deletePromptTemplate",
  GET_EXTERNAL_AGENT_CONFIGS: "/getExternalAgentConfigs",
  GET_EXTERNAL_AGENT_CONFIG: "/getExternalAgentConfig",
  GET_EXTERNAL_AGENT_HEALTH: "/getExternalAgentHealth",
  CREATE_EXTERNAL_AGENT_CONFIG: "/createExternalAgentConfig",
  UPDATE_EXTERNAL_AGENT_CONFIG: "/updateExternalAgentConfig",
  DELETE_EXTERNAL_AGENT_CONFIG: "/deleteExternalAgentConfig",
  GET_ENGINE_CONFIGS: "/getEngineConfigs",
  GET_ENGINE_CONFIG: "/getEngineConfig",
  CREATE_ENGINE_CONFIG: "/createEngineConfig",
  UPDATE_ENGINE_CONFIG: "/updateEngineConfig",
  DELETE_ENGINE_CONFIG: "/deleteEngineConfig",
  STOP_EXTERNAL_AGENT_RUN: "/stopExternalAgentRun",
  RESPOND_EXTERNAL_AGENT_APPROVAL: "/respondExternalAgentApproval",
  RESPOND_EXTERNAL_AGENT_QUESTION: "/respondExternalAgentQuestion",
  CREATE_CHAT: "/createChat",
  GET_CHAT: "/getChat",
  APPEND_CHAT_MESSAGES: "/appendChatMessages",
  DELETE_CHAT: "/deleteChat",
  SET_CHAT_SYSTEM_PROMPT: "/setChatSystemPrompt",
  GET_ALL_CHAT_METADATA: "/getAllChatMetadata",
  RUN_MCP_TOOLS: "/runMcpTools",
  EMIT_CHAT_STREAM_DELTA: "/emitChatStreamDelta",
  RUN_CODE: "/runCode",
  RUN_DETACHED: "/runDetached",
  GET_RUN_STATUS: "/getRunStatus",
  CANCEL_RUN: "/cancelRun",
  TYPE_CHECK: "/typeCheck",
  CLEAR_TEXT_FIELD_COMPLETION: "/clearTextFieldCompletion",
  SET_CALLABLE: "/setCallable",
  TEXT_FIELD_COMPLETION: "/textFieldCompletion",
  OUTPUT_ACCESSOR_COMPLETION: "/outputAccessorCompletion",
  CODE_AREA_COMPLETION: "/codeAreaCompletion",
  GEN_CODE_PREFIX_COMPLETION: "/genCodePrefixCompletion",
  GEN_CODE_SUFFIX_COMPLETION: "/genCodeSuffixCompletion",
  CHANGE_PARAM_IMPL: "/changeParamImpl",
  UPDATE_PARAM_IMPL_CONFIG: "/updateParamImplConfig",
  CREATE_TOP_LEVEL_SECTION: "/createTopLevelSection",
  CREATE_CHILD_SECTIONS: "/createChildSections",
  DELETE_SECTIONS: "/deleteSections",
  CREATE_CHILD_SECTIONS_VIA_INCREMENTER: "/createChildSectionsViaIncrementer",
  DELETE_CHILD_SECTIONS_VIA_DECREMENTER: "/deleteChildSectionsViaDecrementer",
  CREATE_NEW_SECTION_VARIANT: "/createNewSectionVariant",
  CREATE_VIEW_MODE: "/createViewMode",
  SET_ACTIVE_VIEW_MODE: "/setActiveViewMode",
  TOGGLE_IS_EDITING_VIEW_MODE: "/toggleIsEditingViewMode",
  TOGGLE_SECTION_VISIBILITY: "/toggleSectionVisibility",
  TOGGLE_VIEW_MODE_USER_FACING: "/toggleViewModeUserFacing",
  TOGGLE_VIEW_MODE_TAB: "/toggleViewModeTab",
  SET_VIEW_MODE_NAME: "/setViewModeName",
  DELETE_VIEW_MODE: "/deleteViewMode",
  UNDO: "/undo",
  REDO: "/redo",
  GET_LATEST_PROJECT_STATE: "/getLatestProjectState",
  GET_LATEST_LSP_DIAGNOSTICS: "/getLatestLspDiagnostics",
  FORCE_REFRESH_LISTENER: "/forceRefreshListener",
  SET_TOP_LEVEL_SECTION_LAYOUT: "/setTopLevelSectionLayout",
  AUTO_LAYOUT_TOP_LEVEL_SECTIONS: "/autoLayoutTopLevelSections",
  ADD_KWARG: "/addKwarg",
  DELETE_KWARG: "/deleteKwarg",
  DELETE_SELECTED_PARAMS: "/deleteSelectedParams",
  DELETE_SECTION_VARIANT_OR_ASK: "/deleteSectionVariantOrAsk",
  TOGGLE_VARIANT_JSON_SOURCE: "/toggleVariantJsonSource",
  SET_VARIANT_JSON_SOURCE_KEYS: "/setVariantJsonSourceKeys",
  SET_TEXT_BLOCK_TEXT: "/setTextBlockText",
  SET_PROJECT_CONFIG_CODEGEN_TARGETS: "/setProjectConfigCodegenTargets",
  GET_APP_DEFINITION: "/getAppDefinition",
  SET_APP_DEFINITION: "/setAppDefinition",
  UPDATE_APP_DEFINITION: "/updateAppDefinition",
  VALIDATE_APP_DEFINITION: "/validateAppDefinition",
  GET_APP_CATALOG: "/getAppCatalog",
  LIST_APP_COMPONENTS: "/listAppComponents",
  STREAM_APP_SPEC: "/streamAppSpec",
  GET_APP_GEN_SKILLS: "/getAppGenSkills",
  GET_APP_GEN_SKILL_CONTENT: "/getAppGenSkillContent",
  SET_PROMPT_TEMPLATE: "/setPromptTemplate",
  SET_PROMPT_INPUTS: "/setPromptInputs",
  SET_PROMPT_FORMAT: "/setPromptFormat",
  SET_GEN_CODE_PREFIX: "/setGenCodePrefix",
  SET_GEN_CODE_SUFFIX: "/setGenCodeSuffix",
  SET_SHOW_PARAM_DISPLAY_NAMES: "/setShowParamDisplayNames",
  SET_WATCH_CODE_ENABLED: "/setWatchCodeEnabled",
  SET_WATCH_CODE_INPUTS: "/setWatchCodeInputs",
  SET_PARAM_ENTERED_VALUE: "/setParamEnteredValue",
  GET_PASSWORD_PARAM_VALUE: "/getPasswordParamValue",
  SET_TYPE_ERROR_IGNORE: "/setTypeErrorIgnore",
  SET_CODE_SECTION_DIAGNOSTICS_MUTE: "/setCodeSectionDiagnosticsMute",
  SET_CODE_SECTION_DIAGNOSTIC_CODE_SUPPRESSION:
    "/setCodeSectionDiagnosticCodeSuppression",
  SET_CODE_SECTION_ATTACHED_TERMINAL: "/setCodeSectionAttachedTerminal",
  SET_CODE_OBJ_NAME: "/setCodeObjName",
  SET_CODE_OBJ_DISPLAY_NAME: "/setCodeObjDisplayName",
  SET_CODE_FILE_BINDING: "/setCodeFileBinding",
  SET_CODE: "/setCode",
  TOGGLE_POSITION_LOCKS: "/togglePositionLocks",
  TOGGLE_MINIMIZED: "/toggleMinimized",
  TOGGLE_GROUP_ORIENTATION: "/toggleGroupOrientation",
  SET_GROUP_OVERFLOW_MODE: "/setGroupOverflowMode",
  SET_SECTION_PARAM_FILTER: "/setSectionParamFilter",
  SET_SECTION_EDGE_INPUTS: "/setSectionEdgeInputs",
  SET_SECTION_EDGE_OUTPUTS: "/setSectionEdgeOutputs",
  CREATE_EDGE: "/createEdge",
  UPDATE_EDGE: "/updateEdge",
  DELETE_EDGES: "/deleteEdges",
  RECONNECT_EDGE: "/reconnectEdge",
  SET_EDGES: "/setEdges",
  CREATE_AGENTIC_EDGE: "/createAgenticEdge",
  UPDATE_AGENTIC_EDGE: "/updateAgenticEdge",
  DELETE_AGENTIC_EDGES: "/deleteAgenticEdges",
  SET_AGENTIC_EDGES: "/setAgenticEdges",
  SET_SECTION_VARIANT: "/setSectionVariant",
  SET_DEFAULT_SECTION_VARIANT: "/setDefaultSectionVariant",
  SET_SECTION_VARIANT_NAME: "setSectionVariantName",
  TOGGLE_VARIANT_FROZEN: "/toggleVariantFrozen",
  SET_SECTION_SIZES: "/setSectionSizes",
  SET_ACTIVE_IDS: "/setActiveIds",
  SET_VIEWPORT: "/setViewport",
  SET_SECTION_NAME: "/setSectionName",
  SET_SECTION_TAG_COLOR: "/setSectionTagColor",
  SET_SECTION_STYLE_COLOR: "/setSectionStyleColor",
  SET_META_CONTROL_SHOW_SECTION_TITLE: "/setMetaControlShowSectionTitle",
  SET_TEXT_BLOCK_DISPLAY_MODE: "/setTextBlockDisplayMode",
  SET_TEXT_BLOCK_HEADING_AS_SECTION_NAME: "/setTextBlockHeadingAsSectionName",
  SET_TEXT_BLOCK_META_CONTROL_STYLE: "/setTextBlockMetaControlStyle",
  SET_CALLABLE_HIDE_PARAMS: "/setCallableHideParams",
  SET_SECTION_HIDE_UNPINNED_PARAMS: "/setSectionHideUnpinnedParams",
  SET_SECTION_PINNED_PARAMS: "/setSectionPinnedParams",
  SET_SECTION_COLUMN_WIDTH: "/setSectionColumnWidth",
  SET_BROWSER_COLUMN_WIDTHS: "/setBrowserColumnWidths",
  SET_BROWSER_AREA_VIEW_MODE: "/setBrowserAreaViewMode",
  SET_BROWSER_HIDE_COLUMN: "/setBrowserHideColumn",
  SET_BROWSER_SAVED_SEARCHES: "/setBrowserSavedSearches",
  SET_TEXT_BLOCK_FORMAT: "/setTextBlockFormat",
  SET_CHAT_SECTION_SETTINGS: "/setChatSectionSettings",
  SET_CHAT_SECTION_STATE: "/setChatSectionState",
  GET_CHAT_SECTION_CHAT_ID: "/getChatSectionChatId",
  SET_CHAT_SECTION_CHAT_ID: "/setChatSectionChatId",
  SET_SOCIAL_URL: "/setSocialUrl",
  ACCEPT_RENAME_REFACTOR: "/acceptRenameRefactor",
  DECLINE_RENAME_REFACTOR: "/declineRenameRefactor",
  APPEND_DRAW_AREA_LAYER_ITEM: "/appendDrawAreaLayerItem",
  MOVE_SECTIONS: "/moveSections",
  MOVE_PARAMS: "/moveParams",
  MOVE_PARAM_GROUPS: "/moveParamGroups",
  INDENT_PARAMS: "/indentParams",
  UNINDENT_PARAMS: "/unindentParams",
  GROUP_SECTIONS: "/groupSections",
  UNGROUP_GROUPS: "/ungroupGroups",
  TOGGLE_PARAM_SELECTED: "/toggleParamSelected",
  UNSELECT_ALL_PARAMS: "/unselectAllParams",
  PREPARE_SECTIONS_FOR_COPY: "/prepareSectionsForCopy",
  PASTE_SECTIONS: "/pasteSections",
  GET_FILE_BROWSER_ROOT: "/getFileBrowserRoot",
  GET_FOLDER_CONTENTS: "/getFolderContents",
  GET_FILE_BROWSER_DOWNLOAD_URLS: "/getFileBrowserDownloadUrls",
  FILE_BROWSER_DOWNLOAD: "/fileBrowser/{token}",
  GET_GIT_STATUS: "/git/status",
  GET_GIT_DIFF: "/git/diff",
  GET_GIT_LOG: "/git/log",
  GET_GIT_COMMIT_DETAILS: "/git/commitDetails",
  GET_GIT_COMMIT_FILE_DIFF: "/git/commitFileDiff",
  IMPORT_FILES_TO_ARTIFACTS: "/importFilesToArtifacts",
  DELETE_ARTIFACTS: "/deleteArtifacts",
  LOAD_CACHED_IMAGE_ARTIFACTS: "/loadCachedImageArtifacts",
  SET_IMAGE_AREA_IMAGE_PATH: "/setImageAreaImagePath",
  LOAD_CACHED_CHART_DATA: "/loadCachedChartData",
  SET_CHART_TYPE: "/setChartType",
  SET_CHART_AREA_IMAGE_PATH: "/setChartAreaDataPath",
  SET_CHART_SETTINGS: "/setChartSettings",
  LOAD_CACHED_BRUSH_STROKES: "/loadCachedBrushStrokes",
  LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM: "/loadDrawAreaLayerItemTransform",
  SHARE_DEPLOYMENTS: "/share/deployments",
  SHARE_DEPLOYMENT_VERSIONS: "/share/deployments/{deploymentName}/versions",
  SHARE_DEPLOYMENT_LATEST: "/share/deployments/{deploymentName}/latest",
  SHARE_DEPLOYMENT_CURRENT_SESSION: "/share/deployments/current/session",
  SHARE_DEPLOYMENT_SESSION:
    "/share/deployments/{deploymentName}/{version}/session",
  SHARE_DEPLOYMENT_PROJECT_CONFIG:
    "/share/deployments/{deploymentName}/{version}/project_config",
  SHARE_DEPLOYMENT_STATE: "/share/deployments/{deploymentName}/{version}/state",
  APP_DEPLOYMENTS: "/app/deployments",
  APP_DEPLOYMENT_VERSIONS: "/app/deployments/{deploymentName}/versions",
  APP_DEPLOYMENT_LATEST: "/app/deployments/{deploymentName}/latest",
  APP_DEPLOYMENT_CURRENT_SESSION: "/app/deployments/current/session",
  APP_DEPLOYMENT_SESSION: "/app/deployments/{deploymentName}/{version}/session",
  APP_DEPLOYMENT_STATE: "/app/deployments/{deploymentName}/{version}/state",
  APP_DEPLOYMENT_PROJECT_CONFIG:
    "/app/deployments/{deploymentName}/{version}/project_config",
  WEBSOCKET_SHARE_FRONTEND: "/share/frontend",
} as const;

export type Route = ObjectValues<typeof RouteEnum>;

export const BrowserAreaItemTypeEnum = {
  Image: "Image",
  Video: "Video",
  Text: "Text",
  Data: "Data",
  Brushes: "Brushes",
  Other: "Other",
} as const;

export type BrowserAreaItemType = ObjectValues<typeof BrowserAreaItemTypeEnum>;

export const BrowserSearchScopeEnum = {
  recursive: "recursive",
  local: "local",
} as const;

export type BrowserSearchScope = ObjectValues<typeof BrowserSearchScopeEnum>;

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
} as const;

export type BackgroundVariant = ObjectValues<typeof BackgroundVariantEnum>;

export const MetaControlSizeModeEnum = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
} as const;

export type MetaControlSizeMode = ObjectValues<typeof MetaControlSizeModeEnum>;

export const PanOnScrollModeEnum = {
  free: "free",
  vertical: "vertical",
  horizontal: "horizontal",
} as const;

export type PanOnScrollMode = ObjectValues<typeof PanOnScrollModeEnum>;

export const RenameRefactorModeEnum = {
  ALWAYS_ASK: "ALWAYS_ASK",
  ALWAYS_RENAME: "ALWAYS_RENAME",
  NEVER_RENAME: "NEVER_RENAME",
} as const;

export type RenameRefactorMode = ObjectValues<typeof RenameRefactorModeEnum>;

export const RunSnapshotModeEnum = {
  always: "always",
  ephemeral: "ephemeral",
  never: "never",
} as const;

export type RunSnapshotMode = ObjectValues<typeof RunSnapshotModeEnum>;

export const SelectionModeEnum = { partial: "partial", full: "full" } as const;

export type SelectionMode = ObjectValues<typeof SelectionModeEnum>;

export const DeploymentTypeEnum = { share: "share", app: "app" } as const;

export type DeploymentType = ObjectValues<typeof DeploymentTypeEnum>;

export const FileEventTypeEnum = {
  created: "created",
  modified: "modified",
  deleted: "deleted",
  moved: "moved",
  readRequested: "readRequested",
} as const;

export type FileEventType = ObjectValues<typeof FileEventTypeEnum>;

export const WebsocketConnectionTypeEnum = {
  CLI: "CLI",
  SERVER: "SERVER",
  PYTHON_SCRIPT: "PYTHON_SCRIPT",
  FRONTEND: "FRONTEND",
} as const;

export type WebsocketConnectionType = ObjectValues<
  typeof WebsocketConnectionTypeEnum
>;

export const WebsocketMsgTypeForBackendEnum = {
  CurrentAddressUpdate: "CurrentAddressUpdate",
  RealtimeUIChange: "RealtimeUIChange",
  RealtimeDependencyEvent: "RealtimeDependencyEvent",
} as const;

export type WebsocketMsgTypeForBackend = ObjectValues<
  typeof WebsocketMsgTypeForBackendEnum
>;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  LSPDiagnostics: "LSPDiagnostics",
  NameValidationErrors: "NameValidationErrors",
  TerminalMetadata: "TerminalMetadata",
  Notification: "Notification",
  BackendLogEvent: "BackendLogEvent",
  LLMStreamingResponse: "LLMStreamingResponse",
  ReturnRenameRefactorResults: "ReturnRenameRefactorResults",
  UpdateFrontendProjectState: "UpdateFrontendProjectState",
  UpdateSettings: "UpdateSettings",
  AllProjectMetadata: "AllProjectMetadata",
  UpdateArtifacts: "UpdateArtifacts",
  ListenerCoverageSnapshot: "ListenerCoverageSnapshot",
  LLMConfigUpdated: "LLMConfigUpdated",
  LLMApiKeysUpdated: "LLMApiKeysUpdated",
  AIFollowToolArgumentsUpdate: "AIFollowToolArgumentsUpdate",
  AIFollowToolResultUpdate: "AIFollowToolResultUpdate",
  AgentProfilesUpdated: "AgentProfilesUpdated",
  PromptTemplatesUpdated: "PromptTemplatesUpdated",
  ExternalAgentConfigsUpdated: "ExternalAgentConfigsUpdated",
  EngineConfigsUpdated: "EngineConfigsUpdated",
} as const;

export type WebsocketMsgTypeForFrontend = ObjectValues<
  typeof WebsocketMsgTypeForFrontendEnum
>;

export const WebsocketMsgTypeForPythonScriptEnum = {
  ListenerInit: "ListenerInit",
  ListenerRegister: "ListenerRegister",
  ListenerRegisterAck: "ListenerRegisterAck",
  ListenerRealtimeEvent: "ListenerRealtimeEvent",
  ListenerDependencyEvent: "ListenerDependencyEvent",
  ListenerForceRefresh: "ListenerForceRefresh",
  ListenerError: "ListenerError",
  ListenerFrontendEmit: "ListenerFrontendEmit",
  ListenerRouterEndpointCall: "ListenerRouterEndpointCall",
  ListenerRouterEndpointResult: "ListenerRouterEndpointResult",
} as const;

export type WebsocketMsgTypeForPythonScript = ObjectValues<
  typeof WebsocketMsgTypeForPythonScriptEnum
>;

export const SaveConflictStrategyEnum = {
  skip: "skip",
  backup: "backup",
  overwrite: "overwrite",
} as const;

export type SaveConflictStrategy = ObjectValues<
  typeof SaveConflictStrategyEnum
>;

export const WebSocketStateEnum = {
  CONNECTING: "0",
  CONNECTED: "1",
  DISCONNECTED: "2",
  RESPONSE: "3",
} as const;

export type WebSocketState = ObjectValues<typeof WebSocketStateEnum>;

export const SharePolicyGuardEnum = {
  param: "param",
  variant: "variant",
  layout: "layout",
} as const;

export type SharePolicyGuard = ObjectValues<typeof SharePolicyGuardEnum>;

export const JSONValueSchema = z.union([
  z.record(z.string(), z.any()),
  z.array(z.any()),
  z.string(),
  z.int(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JSONValue = z.infer<typeof JSONValueSchema>;

export type JSONValueInput = z.input<typeof JSONValueSchema>;

export const BrushStrokeSchema = z.object({
  strokeStyle: z.string(),
  lineWidth: z.number(),
  lineCap: z.enum(DrawAreaBrushShapeEnum),
  points: z
    .array(z.union([z.tuple([z.number(), z.number()]), z.literal("BREAK")]))
    .default([]),
  globalCompositeOperation: z
    .literal([
      "color",
      "color-burn",
      "color-dodge",
      "copy",
      "darken",
      "destination-atop",
      "destination-in",
      "destination-out",
      "destination-over",
      "difference",
      "exclusion",
      "hard-light",
      "hue",
      "lighten",
      "lighter",
      "luminosity",
      "multiply",
      "overlay",
      "saturation",
      "screen",
      "soft-light",
      "source-atop",
      "source-in",
      "source-out",
      "source-over",
      "xor",
    ])
    .default("source-over" as const),
});

export type BrushStroke = z.infer<typeof BrushStrokeSchema>;

export type BrushStrokeInput = z.input<typeof BrushStrokeSchema>;

export function createBrushStroke(
  options: Partial<BrushStroke> = {},
): BrushStroke {
  return BrushStrokeSchema.parse(options);
}

export const BrushStrokeArtifactSchema = z.object({
  type: z.literal("BrushStroke").default(ArtifactTypeEnum.BrushStroke),
  id: z.string().default(create_json_artifact_id),
  value: BrushStrokeSchema,
});

export type BrushStrokeArtifact = z.infer<typeof BrushStrokeArtifactSchema>;

export type BrushStrokeArtifactInput = z.input<
  typeof BrushStrokeArtifactSchema
>;

export function createBrushStrokeArtifact(
  options: Partial<BrushStrokeArtifact> = {},
): BrushStrokeArtifact {
  return BrushStrokeArtifactSchema.parse(options);
}

export const BrushStrokeMappingSchema = z.record(
  z.string(),
  BrushStrokeArtifactSchema,
);

export type BrushStrokeMapping = z.infer<typeof BrushStrokeMappingSchema>;

export type BrushStrokeMappingInput = z.input<typeof BrushStrokeMappingSchema>;

export const CanvasPointSchema = z.tuple([z.number(), z.number()]);

export type CanvasPoint = z.infer<typeof CanvasPointSchema>;

export type CanvasPointInput = z.input<typeof CanvasPointSchema>;

export const ChartDataSchema = z.record(
  z.string(),
  z.array(z.union([z.string(), z.number()])),
);

export type ChartData = z.infer<typeof ChartDataSchema>;

export type ChartDataInput = z.input<typeof ChartDataSchema>;

export const ChartDataArtifactSchema = z.object({
  type: z.literal("ChartData").default(ArtifactTypeEnum.ChartData),
  id: z.string().default(create_csv_artifact_id),
  value: z.record(z.string(), z.array(z.union([z.string(), z.number()]))),
});

export type ChartDataArtifact = z.infer<typeof ChartDataArtifactSchema>;

export type ChartDataArtifactInput = z.input<typeof ChartDataArtifactSchema>;

export function createChartDataArtifact(
  options: Partial<ChartDataArtifact> = {},
): ChartDataArtifact {
  return ChartDataArtifactSchema.parse(options);
}

export const ChartDataMappingSchema = z.record(
  z.string(),
  ChartDataArtifactSchema,
);

export type ChartDataMapping = z.infer<typeof ChartDataMappingSchema>;

export type ChartDataMappingInput = z.input<typeof ChartDataMappingSchema>;

export const BrushStrokeWithTransformSchema = z.object({
  strokeStyle: z.string(),
  lineWidth: z.number(),
  lineCap: z.enum(DrawAreaBrushShapeEnum),
  points: z
    .array(z.union([z.tuple([z.number(), z.number()]), z.literal("BREAK")]))
    .default([]),
  globalCompositeOperation: z
    .literal([
      "color",
      "color-burn",
      "color-dodge",
      "copy",
      "darken",
      "destination-atop",
      "destination-in",
      "destination-out",
      "destination-over",
      "difference",
      "exclusion",
      "hard-light",
      "hue",
      "lighten",
      "lighter",
      "luminosity",
      "multiply",
      "overlay",
      "saturation",
      "screen",
      "soft-light",
      "source-atop",
      "source-in",
      "source-out",
      "source-over",
      "xor",
    ])
    .default("source-over" as const),
  transform: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
});

export type BrushStrokeWithTransform = z.infer<
  typeof BrushStrokeWithTransformSchema
>;

export type BrushStrokeWithTransformInput = z.input<
  typeof BrushStrokeWithTransformSchema
>;

export function createBrushStrokeWithTransform(
  options: Partial<BrushStrokeWithTransform> = {},
): BrushStrokeWithTransform {
  return BrushStrokeWithTransformSchema.parse(options);
}

export const DrawAreaLayerItemTransformSchema = z.object({
  transform: z
    .tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
    ])
    .default([1, 0, 0, 1, 0, 0]),
  eraserStrokes: z.array(BrushStrokeWithTransformSchema).default([]),
});

export type DrawAreaLayerItemTransform = z.infer<
  typeof DrawAreaLayerItemTransformSchema
>;

export type DrawAreaLayerItemTransformInput = z.input<
  typeof DrawAreaLayerItemTransformSchema
>;

export function createDrawAreaLayerItemTransform(
  options: Partial<DrawAreaLayerItemTransform> = {},
): DrawAreaLayerItemTransform {
  return DrawAreaLayerItemTransformSchema.parse(options);
}

export const DrawAreaLayerItemTransformArtifactSchema = z.object({
  type: z
    .literal("DrawAreaLayerItemTransform")
    .default(ArtifactTypeEnum.DrawAreaLayerItemTransform),
  id: z.string().default(create_json_artifact_id),
  value: DrawAreaLayerItemTransformSchema,
});

export type DrawAreaLayerItemTransformArtifact = z.infer<
  typeof DrawAreaLayerItemTransformArtifactSchema
>;

export type DrawAreaLayerItemTransformArtifactInput = z.input<
  typeof DrawAreaLayerItemTransformArtifactSchema
>;

export function createDrawAreaLayerItemTransformArtifact(
  options: Partial<DrawAreaLayerItemTransformArtifact> = {},
): DrawAreaLayerItemTransformArtifact {
  return DrawAreaLayerItemTransformArtifactSchema.parse(options);
}

export const DrawAreaLayerItemTransformMappingSchema = z.record(
  z.string(),
  DrawAreaLayerItemTransformArtifactSchema,
);

export type DrawAreaLayerItemTransformMapping = z.infer<
  typeof DrawAreaLayerItemTransformMappingSchema
>;

export type DrawAreaLayerItemTransformMappingInput = z.input<
  typeof DrawAreaLayerItemTransformMappingSchema
>;

export const DrawAreaTransformSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export type DrawAreaTransform = z.infer<typeof DrawAreaTransformSchema>;

export type DrawAreaTransformInput = z.input<typeof DrawAreaTransformSchema>;

export const BinaryContentRefSchema = z.object({
  contentId: z.string(),
  byteLength: z.int(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  sha256: z.union([z.string(), z.null()]).default(null),
});

export type BinaryContentRef = z.infer<typeof BinaryContentRefSchema>;

export type BinaryContentRefInput = z.input<typeof BinaryContentRefSchema>;

export function createBinaryContentRef(
  options: Partial<BinaryContentRef> = {},
): BinaryContentRef {
  return BinaryContentRefSchema.parse(options);
}

export const FileArtifactSchema = z.object({
  type: z.literal("File").default(ArtifactTypeEnum.File),
  id: z.string().default(create_file_artifact_id),
  value: BinaryContentRefSchema,
});

export type FileArtifact = z.infer<typeof FileArtifactSchema>;

export type FileArtifactInput = z.input<typeof FileArtifactSchema>;

export function createFileArtifact(
  options: Partial<FileArtifact> = {},
): FileArtifact {
  return FileArtifactSchema.parse(options);
}

export const FileMappingSchema = z.record(z.string(), FileArtifactSchema);

export type FileMapping = z.infer<typeof FileMappingSchema>;

export type FileMappingInput = z.input<typeof FileMappingSchema>;

export const ImageArtifactSchema = z.object({
  type: z.literal("Image").default(ArtifactTypeEnum.Image),
  id: z.string().default(create_png_artifact_id),
  value: BinaryContentRefSchema,
});

export type ImageArtifact = z.infer<typeof ImageArtifactSchema>;

export type ImageArtifactInput = z.input<typeof ImageArtifactSchema>;

export function createImageArtifact(
  options: Partial<ImageArtifact> = {},
): ImageArtifact {
  return ImageArtifactSchema.parse(options);
}

export const ImageMappingSchema = z.record(z.string(), ImageArtifactSchema);

export type ImageMapping = z.infer<typeof ImageMappingSchema>;

export type ImageMappingInput = z.input<typeof ImageMappingSchema>;

export const BaseArtifactUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "type",
  [
    ImageArtifactSchema,
    BrushStrokeArtifactSchema,
    DrawAreaLayerItemTransformArtifactSchema,
    ChartDataArtifactSchema,
    FileArtifactSchema,
  ],
);

export type BaseArtifactUnionWithDiscriminator = z.infer<
  typeof BaseArtifactUnionWithDiscriminatorSchema
>;

export type BaseArtifactUnionWithDiscriminatorInput = z.input<
  typeof BaseArtifactUnionWithDiscriminatorSchema
>;

export function createBaseArtifactUnionWithDiscriminator(
  options: Partial<BaseArtifactUnionWithDiscriminator> = {},
): BaseArtifactUnionWithDiscriminator {
  return BaseArtifactUnionWithDiscriminatorSchema.parse(options);
}

export const APIKeysSchema = z.record(z.string(), z.string());

export type APIKeys = z.infer<typeof APIKeysSchema>;

export type APIKeysInput = z.input<typeof APIKeysSchema>;

export const MessageTextContentSchema = z.object({
  type: z.literal("text").default("text" as const),
  text: z.string(),
});

export type MessageTextContent = z.infer<typeof MessageTextContentSchema>;

export type MessageTextContentInput = z.input<typeof MessageTextContentSchema>;

export function createMessageTextContent(
  options: Partial<MessageTextContent> = {},
): MessageTextContent {
  return MessageTextContentSchema.parse(options);
}

export const MessageImageUrlSchema = z.object({
  url: z.string(),
  detail: z.union([z.literal(["auto", "low", "high"]), z.null()]).default(null),
});

export type MessageImageUrl = z.infer<typeof MessageImageUrlSchema>;

export type MessageImageUrlInput = z.input<typeof MessageImageUrlSchema>;

export function createMessageImageUrl(
  options: Partial<MessageImageUrl> = {},
): MessageImageUrl {
  return MessageImageUrlSchema.parse(options);
}

export const MessageImageUrlContentSchema = z.object({
  type: z.literal("image_url").default("image_url" as const),
  image_url: MessageImageUrlSchema,
});

export type MessageImageUrlContent = z.infer<
  typeof MessageImageUrlContentSchema
>;

export type MessageImageUrlContentInput = z.input<
  typeof MessageImageUrlContentSchema
>;

export function createMessageImageUrlContent(
  options: Partial<MessageImageUrlContent> = {},
): MessageImageUrlContent {
  return MessageImageUrlContentSchema.parse(options);
}

export const MessageThinkingContentSchema = z.object({
  type: z.literal("thinking").default("thinking" as const),
  thinking: z.string().default("" as const),
  summary: z.union([z.string(), z.null()]).default("" as const),
  signature: z.union([z.string(), z.null()]).default("" as const),
});

export type MessageThinkingContent = z.infer<
  typeof MessageThinkingContentSchema
>;

export type MessageThinkingContentInput = z.input<
  typeof MessageThinkingContentSchema
>;

export function createMessageThinkingContent(
  options: Partial<MessageThinkingContent> = {},
): MessageThinkingContent {
  return MessageThinkingContentSchema.parse(options);
}

export const ChatFileAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  size: z.union([z.int(), z.null()]).default(null),
});

export type ChatFileAttachment = z.infer<typeof ChatFileAttachmentSchema>;

export type ChatFileAttachmentInput = z.input<typeof ChatFileAttachmentSchema>;

export function createChatFileAttachment(
  options: Partial<ChatFileAttachment> = {},
): ChatFileAttachment {
  return ChatFileAttachmentSchema.parse(options);
}

export const SystemChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.literal("system").default(ChatRoleEnum.system),
  content: z
    .array(
      z.union([
        MessageTextContentSchema,
        MessageImageUrlContentSchema,
        MessageThinkingContentSchema,
      ]),
    )
    .default([]),
  attachments: z.array(ChatFileAttachmentSchema).default([]),
});

export type SystemChatMessage = z.infer<typeof SystemChatMessageSchema>;

export type SystemChatMessageInput = z.input<typeof SystemChatMessageSchema>;

export function createSystemChatMessage(
  options: Partial<SystemChatMessage> = {},
): SystemChatMessage {
  return SystemChatMessageSchema.parse(options);
}

export const ToolCallFunctionSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.any()).default({}),
});

export type ToolCallFunction = z.infer<typeof ToolCallFunctionSchema>;

export type ToolCallFunctionInput = z.input<typeof ToolCallFunctionSchema>;

export function createToolCallFunction(
  options: Partial<ToolCallFunction> = {},
): ToolCallFunction {
  return ToolCallFunctionSchema.parse(options);
}

export const ToolCallSchema = z.object({
  id: z.string().default(create_new_id),
  type: z.literal("function").default("function" as const),
  function: ToolCallFunctionSchema,
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export type ToolCallInput = z.input<typeof ToolCallSchema>;

export function createToolCall(options: Partial<ToolCall> = {}): ToolCall {
  return ToolCallSchema.parse(options);
}

export const AssistantChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.literal("assistant").default(ChatRoleEnum.assistant),
  content: z
    .array(
      z.union([
        MessageTextContentSchema,
        MessageImageUrlContentSchema,
        MessageThinkingContentSchema,
      ]),
    )
    .default([]),
  attachments: z.array(ChatFileAttachmentSchema).default([]),
  tool_calls: z.union([z.array(ToolCallSchema), z.null()]).default(null),
});

export type AssistantChatMessage = z.infer<typeof AssistantChatMessageSchema>;

export type AssistantChatMessageInput = z.input<
  typeof AssistantChatMessageSchema
>;

export function createAssistantChatMessage(
  options: Partial<AssistantChatMessage> = {},
): AssistantChatMessage {
  return AssistantChatMessageSchema.parse(options);
}

export const UserChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.literal("user").default(ChatRoleEnum.user),
  content: z
    .array(
      z.union([
        MessageTextContentSchema,
        MessageImageUrlContentSchema,
        MessageThinkingContentSchema,
      ]),
    )
    .default([]),
  attachments: z.array(ChatFileAttachmentSchema).default([]),
});

export type UserChatMessage = z.infer<typeof UserChatMessageSchema>;

export type UserChatMessageInput = z.input<typeof UserChatMessageSchema>;

export function createUserChatMessage(
  options: Partial<UserChatMessage> = {},
): UserChatMessage {
  return UserChatMessageSchema.parse(options);
}

export const AnnotationsSchema = z.object({
  audience: z
    .union([z.array(z.literal(["user", "assistant"])), z.null()])
    .default(null),
  priority: z.union([z.number(), z.null()]).default(null),
});

export type Annotations = z.infer<typeof AnnotationsSchema>;

export type AnnotationsInput = z.input<typeof AnnotationsSchema>;

export function createAnnotations(
  options: Partial<Annotations> = {},
): Annotations {
  return AnnotationsSchema.parse(options);
}

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type TextContent = z.infer<typeof TextContentSchema>;

export type TextContentInput = z.input<typeof TextContentSchema>;

export function createTextContent(
  options: Partial<TextContent> = {},
): TextContent {
  return TextContentSchema.parse(options);
}

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type ImageContent = z.infer<typeof ImageContentSchema>;

export type ImageContentInput = z.input<typeof ImageContentSchema>;

export function createImageContent(
  options: Partial<ImageContent> = {},
): ImageContent {
  return ImageContentSchema.parse(options);
}

export const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  text: z.string(),
});

export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;

export type TextResourceContentsInput = z.input<
  typeof TextResourceContentsSchema
>;

export function createTextResourceContents(
  options: Partial<TextResourceContents> = {},
): TextResourceContents {
  return TextResourceContentsSchema.parse(options);
}

export const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  blob: z.string(),
});

export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;

export type BlobResourceContentsInput = z.input<
  typeof BlobResourceContentsSchema
>;

export function createBlobResourceContents(
  options: Partial<BlobResourceContents> = {},
): BlobResourceContents {
  return BlobResourceContentsSchema.parse(options);
}

export const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

export type EmbeddedResourceInput = z.input<typeof EmbeddedResourceSchema>;

export function createEmbeddedResource(
  options: Partial<EmbeddedResource> = {},
): EmbeddedResource {
  return EmbeddedResourceSchema.parse(options);
}

export const ToolReferenceContentSchema = z.object({
  type: z.literal("tool_reference").default("tool_reference" as const),
  tool_name: z.string(),
});

export type ToolReferenceContent = z.infer<typeof ToolReferenceContentSchema>;

export type ToolReferenceContentInput = z.input<
  typeof ToolReferenceContentSchema
>;

export function createToolReferenceContent(
  options: Partial<ToolReferenceContent> = {},
): ToolReferenceContent {
  return ToolReferenceContentSchema.parse(options);
}

export const ToolChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.literal("tool").default(ChatRoleEnum.tool),
  tool_call_id: z.string(),
  tool_name: z.union([z.string(), z.null()]).default(null),
  arguments: z
    .union([
      z.record(z.string(), z.any()),
      z.array(z.any()),
      z.string(),
      z.int(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .default({}),
  result: z
    .union([
      z.record(z.string(), z.any()),
      z.array(z.any()),
      z.string(),
      z.int(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .default(null),
  content: z
    .array(
      z.union([
        TextContentSchema,
        ImageContentSchema,
        EmbeddedResourceSchema,
        ToolReferenceContentSchema,
      ]),
    )
    .default([]),
  is_error: z.boolean().default(false),
  started_at: z.iso.datetime().default(get_now_timestamp),
  completed_at: z.union([z.iso.datetime(), z.null()]).default(null),
});

export type ToolChatMessage = z.infer<typeof ToolChatMessageSchema>;

export type ToolChatMessageInput = z.input<typeof ToolChatMessageSchema>;

export function createToolChatMessage(
  options: Partial<ToolChatMessage> = {},
): ToolChatMessage {
  return ToolChatMessageSchema.parse(options);
}

export const BaseChatMessageUnionSchema = z.union([
  SystemChatMessageSchema,
  AssistantChatMessageSchema,
  UserChatMessageSchema,
  ToolChatMessageSchema,
]);

export type BaseChatMessageUnion = z.infer<typeof BaseChatMessageUnionSchema>;

export type BaseChatMessageUnionInput = z.input<
  typeof BaseChatMessageUnionSchema
>;

export const MessageContentSchema = z.union([
  MessageTextContentSchema,
  MessageImageUrlContentSchema,
  MessageThinkingContentSchema,
]);

export type MessageContent = z.infer<typeof MessageContentSchema>;

export type MessageContentInput = z.input<typeof MessageContentSchema>;

export const BaseChatMessageUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "role",
  [
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ],
);

export type BaseChatMessageUnionWithDiscriminator = z.infer<
  typeof BaseChatMessageUnionWithDiscriminatorSchema
>;

export type BaseChatMessageUnionWithDiscriminatorInput = z.input<
  typeof BaseChatMessageUnionWithDiscriminatorSchema
>;

export function createBaseChatMessageUnionWithDiscriminator(
  options: Partial<BaseChatMessageUnionWithDiscriminator> = {},
): BaseChatMessageUnionWithDiscriminator {
  return BaseChatMessageUnionWithDiscriminatorSchema.parse(options);
}

export const MessageStartEventSchema = z.object({
  type: z
    .literal("message_start")
    .default(StreamingEventTypeEnum.MESSAGE_START),
  message: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
});

export type MessageStartEvent = z.infer<typeof MessageStartEventSchema>;

export type MessageStartEventInput = z.input<typeof MessageStartEventSchema>;

export function createMessageStartEvent(
  options: Partial<MessageStartEvent> = {},
): MessageStartEvent {
  return MessageStartEventSchema.parse(options);
}

export const MessageTextDeltaSchema = z.object({
  type: z.literal("text_delta").default("text_delta" as const),
  index: z.int(),
  text: z.string(),
});

export type MessageTextDelta = z.infer<typeof MessageTextDeltaSchema>;

export type MessageTextDeltaInput = z.input<typeof MessageTextDeltaSchema>;

export function createMessageTextDelta(
  options: Partial<MessageTextDelta> = {},
): MessageTextDelta {
  return MessageTextDeltaSchema.parse(options);
}

export const MessageThinkingDeltaSchema = z.object({
  type: z.literal("thinking_delta").default("thinking_delta" as const),
  index: z.int(),
  thinking: z.string(),
  summary: z.union([z.string(), z.null()]).default(null),
  signature: z.union([z.string(), z.null()]).default(null),
});

export type MessageThinkingDelta = z.infer<typeof MessageThinkingDeltaSchema>;

export type MessageThinkingDeltaInput = z.input<
  typeof MessageThinkingDeltaSchema
>;

export function createMessageThinkingDelta(
  options: Partial<MessageThinkingDelta> = {},
): MessageThinkingDelta {
  return MessageThinkingDeltaSchema.parse(options);
}

export const MessageDeltaEventSchema = z.object({
  type: z.literal("delta").default(StreamingEventTypeEnum.DELTA),
  message_id: z.string(),
  content: z
    .union([
      z.array(z.union([MessageTextDeltaSchema, MessageThinkingDeltaSchema])),
      z.null(),
    ])
    .default(null),
});

export type MessageDeltaEvent = z.infer<typeof MessageDeltaEventSchema>;

export type MessageDeltaEventInput = z.input<typeof MessageDeltaEventSchema>;

export function createMessageDeltaEvent(
  options: Partial<MessageDeltaEvent> = {},
): MessageDeltaEvent {
  return MessageDeltaEventSchema.parse(options);
}

export const ToolCallDeltaEventSchema = z.object({
  type: z
    .literal("tool_call_delta")
    .default(StreamingEventTypeEnum.TOOL_CALL_DELTA),
  message_id: z.string(),
  tool_call_id: z.string(),
  arguments_delta: z.string(),
  tool_name: z.union([z.string(), z.null()]).default(null),
});

export type ToolCallDeltaEvent = z.infer<typeof ToolCallDeltaEventSchema>;

export type ToolCallDeltaEventInput = z.input<typeof ToolCallDeltaEventSchema>;

export function createToolCallDeltaEvent(
  options: Partial<ToolCallDeltaEvent> = {},
): ToolCallDeltaEvent {
  return ToolCallDeltaEventSchema.parse(options);
}

export const ToolResultEventSchema = z.object({
  type: z.literal("tool_result").default(StreamingEventTypeEnum.TOOL_RESULT),
  result: ToolChatMessageSchema,
});

export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;

export type ToolResultEventInput = z.input<typeof ToolResultEventSchema>;

export function createToolResultEvent(
  options: Partial<ToolResultEvent> = {},
): ToolResultEvent {
  return ToolResultEventSchema.parse(options);
}

export const ToolArgumentPreviewDeltaEventSchema = z.object({
  type: z
    .literal("tool_argument_preview_delta")
    .default(StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA),
  message_id: z.string(),
  tool_call_id: z.string(),
  tool_name: z.string(),
  arguments_delta: z.string(),
  preview_kind: z.enum(ToolArgumentPreviewKindEnum),
  target_ids_by_type: z.record(
    z.literal(["section", "codeObj"]),
    z.array(IDSchema),
  ),
  preview_value_delta: z.string(),
});

export type ToolArgumentPreviewDeltaEvent = z.infer<
  typeof ToolArgumentPreviewDeltaEventSchema
>;

export type ToolArgumentPreviewDeltaEventInput = z.input<
  typeof ToolArgumentPreviewDeltaEventSchema
>;

export function createToolArgumentPreviewDeltaEvent(
  options: Partial<ToolArgumentPreviewDeltaEvent> = {},
): ToolArgumentPreviewDeltaEvent {
  return ToolArgumentPreviewDeltaEventSchema.parse(options);
}

export const MessageStopEventSchema = z.object({
  type: z.literal("message_stop").default(StreamingEventTypeEnum.MESSAGE_STOP),
  message_id: z.string(),
});

export type MessageStopEvent = z.infer<typeof MessageStopEventSchema>;

export type MessageStopEventInput = z.input<typeof MessageStopEventSchema>;

export function createMessageStopEvent(
  options: Partial<MessageStopEvent> = {},
): MessageStopEvent {
  return MessageStopEventSchema.parse(options);
}

export const MessageFinalizedEventSchema = z.object({
  type: z
    .literal("message_finalized")
    .default(StreamingEventTypeEnum.MESSAGE_FINALIZED),
  message: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
});

export type MessageFinalizedEvent = z.infer<typeof MessageFinalizedEventSchema>;

export type MessageFinalizedEventInput = z.input<
  typeof MessageFinalizedEventSchema
>;

export function createMessageFinalizedEvent(
  options: Partial<MessageFinalizedEvent> = {},
): MessageFinalizedEvent {
  return MessageFinalizedEventSchema.parse(options);
}

export const LLMStreamingResponseChunkSchema = z.union([
  MessageStartEventSchema,
  MessageDeltaEventSchema,
  ToolCallDeltaEventSchema,
  ToolResultEventSchema,
  ToolArgumentPreviewDeltaEventSchema,
  MessageStopEventSchema,
  MessageFinalizedEventSchema,
]);

export type LLMStreamingResponseChunk = z.infer<
  typeof LLMStreamingResponseChunkSchema
>;

export type LLMStreamingResponseChunkInput = z.input<
  typeof LLMStreamingResponseChunkSchema
>;

export const MessageContentDeltaSchema = z.union([
  MessageTextDeltaSchema,
  MessageThinkingDeltaSchema,
]);

export type MessageContentDelta = z.infer<typeof MessageContentDeltaSchema>;

export type MessageContentDeltaInput = z.input<
  typeof MessageContentDeltaSchema
>;

export const ToolArgumentPreviewIdTypeSchema = z.literal([
  "section",
  "codeObj",
]);

export type ToolArgumentPreviewIdType = z.infer<
  typeof ToolArgumentPreviewIdTypeSchema
>;

export type ToolArgumentPreviewIdTypeInput = z.input<
  typeof ToolArgumentPreviewIdTypeSchema
>;

export const ChatSendEventSchema = z.object({
  action: z.literal("send").default("send" as const),
  sectionId: IDSchema,
  messageId: z.string(),
  text: z.string(),
  attachments: z.array(ChatFileAttachmentSchema).default([]),
  role: z.enum(ChatRoleEnum),
  timestampMs: z.int(),
  managed: z.boolean(),
});

export type ChatSendEvent = z.infer<typeof ChatSendEventSchema>;

export type ChatSendEventInput = z.input<typeof ChatSendEventSchema>;

export function createChatSendEvent(
  options: Partial<ChatSendEvent> = {},
): ChatSendEvent {
  return ChatSendEventSchema.parse(options);
}

export const ChatStopEventSchema = z.object({
  action: z.literal("stop").default("stop" as const),
  sectionId: IDSchema,
  timestampMs: z.int(),
  managed: z.boolean(),
});

export type ChatStopEvent = z.infer<typeof ChatStopEventSchema>;

export type ChatStopEventInput = z.input<typeof ChatStopEventSchema>;

export function createChatStopEvent(
  options: Partial<ChatStopEvent> = {},
): ChatStopEvent {
  return ChatStopEventSchema.parse(options);
}

export const ChatActionEventSchema = z.union([
  ChatSendEventSchema,
  ChatStopEventSchema,
]);

export type ChatActionEvent = z.infer<typeof ChatActionEventSchema>;

export type ChatActionEventInput = z.input<typeof ChatActionEventSchema>;

export const AllImplFieldsSchema = z.literal([
  "actionMode",
  "activeBranchId",
  "activeLayerIdx",
  "agentProfileId",
  "aspectRatio",
  "aspectRatioExtraHeight",
  "aspectRatioExtraWidth",
  "attachedTerminalSectionId",
  "branches",
  "brushColor",
  "brushOpacity",
  "brushShape",
  "brushSize",
  "callable",
  "canvasMode",
  "chartSettings",
  "chatId",
  "children",
  "choices",
  "code",
  "codeFileBinding",
  "codeLanguage",
  "codeObjVariantMap",
  "colorChoices",
  "columnWidth",
  "configLanguage",
  "coreNameEditable",
  "coreNameType",
  "data",
  "dataPath",
  "defaultVal",
  "description",
  "diagnosticsIgnoreState",
  "drawThrottleDelay",
  "edgeInputParams",
  "edgeOutputPorts",
  "engineConfigId",
  "eraserBrushSize",
  "folder",
  "format",
  "hasSecret",
  "headingAsSectionName",
  "hideColumn",
  "hideParams",
  "hideUnpinnedParams",
  "id",
  "ignoreTypeErrors",
  "imagePath",
  "inputText",
  "inputs",
  "isFrozen",
  "isHorizontalOrientation",
  "isInOtherProjectConfigs",
  "isJsonSource",
  "isMinimized",
  "isPreset",
  "jsonSourceKeys",
  "jsonSourceMissing",
  "kind",
  "label",
  "layers",
  "managed",
  "max",
  "maxAttachments",
  "messages",
  "metaControlParamId",
  "metaControlStyle",
  "min",
  "missingVariables",
  "mode",
  "name",
  "overflowMode",
  "paramFilter",
  "passingStyle",
  "pinnedParams",
  "placeholder",
  "pluginId",
  "positionAndSizeLocked",
  "renderError",
  "renderedImagePath",
  "renderedText",
  "requestBody",
  "requestHeaderKey",
  "requestHeaderValue",
  "requestMethod",
  "requestUrl",
  "savedSearches",
  "schemaVersion",
  "selectedParams",
  "showSectionTitle",
  "size",
  "step",
  "styleColor",
  "tagColor",
  "template",
  "text",
  "textDisplayMode",
  "thinking",
  "toolCallArguments",
  "topLevelParamId",
  "type",
  "typesColumnWidth",
  "url",
  "value",
  "viewMode",
  "waitingForResponse",
]);

export type AllImplFields = z.infer<typeof AllImplFieldsSchema>;

export type AllImplFieldsInput = z.input<typeof AllImplFieldsSchema>;

export const DropzoneFileAttachmentSchema = z.object({
  kind: z.literal("file").default("file" as const),
  id: z.string(),
  name: z.string(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  size: z.union([z.int(), z.null()]).default(null),
});

export type DropzoneFileAttachment = z.infer<
  typeof DropzoneFileAttachmentSchema
>;

export type DropzoneFileAttachmentInput = z.input<
  typeof DropzoneFileAttachmentSchema
>;

export function createDropzoneFileAttachment(
  options: Partial<DropzoneFileAttachment> = {},
): DropzoneFileAttachment {
  return DropzoneFileAttachmentSchema.parse(options);
}

export const DropzoneTextAttachmentSchema = z.object({
  kind: z.literal("text").default("text" as const),
  id: z.string(),
  name: z.string(),
  text: z.string(),
});

export type DropzoneTextAttachment = z.infer<
  typeof DropzoneTextAttachmentSchema
>;

export type DropzoneTextAttachmentInput = z.input<
  typeof DropzoneTextAttachmentSchema
>;

export function createDropzoneTextAttachment(
  options: Partial<DropzoneTextAttachment> = {},
): DropzoneTextAttachment {
  return DropzoneTextAttachmentSchema.parse(options);
}

export const DropzoneAttachmentSchema = z.discriminatedUnion("kind", [
  DropzoneFileAttachmentSchema,
  DropzoneTextAttachmentSchema,
]);

export type DropzoneAttachment = z.infer<typeof DropzoneAttachmentSchema>;

export type DropzoneAttachmentInput = z.input<typeof DropzoneAttachmentSchema>;

export function createDropzoneAttachment(
  options: Partial<DropzoneAttachment> = {},
): DropzoneAttachment {
  return DropzoneAttachmentSchema.parse(options);
}

export const LineChartSettingsSchema = z.object({
  type: z.literal("line").default(ChartTypeEnum.line),
  xAxisColumn: z.union([z.string(), z.null()]).default(null),
  secondYAxisColumns: z.array(z.string()).default([]),
  xAxisLog: z.boolean().default(false),
  y1AxisLog: z.boolean().default(false),
  y2AxisLog: z.boolean().default(false),
});

export type LineChartSettings = z.infer<typeof LineChartSettingsSchema>;

export type LineChartSettingsInput = z.input<typeof LineChartSettingsSchema>;

export function createLineChartSettings(
  options: Partial<LineChartSettings> = {},
): LineChartSettings {
  return LineChartSettingsSchema.parse(options);
}

export const ScatterChartSettingsSchema = z.object({
  type: z.literal("scatter").default(ChartTypeEnum.scatter),
  xAxisColumn: z.union([z.string(), z.null()]).default(null),
  categoryColumn: z.union([z.string(), z.null()]).default(null),
  xAxisLog: z.boolean().default(false),
  yAxisLog: z.boolean().default(false),
});

export type ScatterChartSettings = z.infer<typeof ScatterChartSettingsSchema>;

export type ScatterChartSettingsInput = z.input<
  typeof ScatterChartSettingsSchema
>;

export function createScatterChartSettings(
  options: Partial<ScatterChartSettings> = {},
): ScatterChartSettings {
  return ScatterChartSettingsSchema.parse(options);
}

export const BaseChartSettingsUnionSchema = z.union([
  LineChartSettingsSchema,
  ScatterChartSettingsSchema,
]);

export type BaseChartSettingsUnion = z.infer<
  typeof BaseChartSettingsUnionSchema
>;

export type BaseChartSettingsUnionInput = z.input<
  typeof BaseChartSettingsUnionSchema
>;

export const BaseChartSettingsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    LineChartSettingsSchema,
    ScatterChartSettingsSchema,
  ]);

export type BaseChartSettingsUnionWithDiscriminator = z.infer<
  typeof BaseChartSettingsUnionWithDiscriminatorSchema
>;

export type BaseChartSettingsUnionWithDiscriminatorInput = z.input<
  typeof BaseChartSettingsUnionWithDiscriminatorSchema
>;

export function createBaseChartSettingsUnionWithDiscriminator(
  options: Partial<BaseChartSettingsUnionWithDiscriminator> = {},
): BaseChartSettingsUnionWithDiscriminator {
  return BaseChartSettingsUnionWithDiscriminatorSchema.parse(options);
}

export const ContentChatMessageUnionSchema = z.union([
  SystemChatMessageSchema,
  AssistantChatMessageSchema,
  UserChatMessageSchema,
]);

export type ContentChatMessageUnion = z.infer<
  typeof ContentChatMessageUnionSchema
>;

export type ContentChatMessageUnionInput = z.input<
  typeof ContentChatMessageUnionSchema
>;

export const ContentChatMessageUnionWithDiscriminatorSchema =
  z.discriminatedUnion("role", [
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
  ]);

export type ContentChatMessageUnionWithDiscriminator = z.infer<
  typeof ContentChatMessageUnionWithDiscriminatorSchema
>;

export type ContentChatMessageUnionWithDiscriminatorInput = z.input<
  typeof ContentChatMessageUnionWithDiscriminatorSchema
>;

export function createContentChatMessageUnionWithDiscriminator(
  options: Partial<ContentChatMessageUnionWithDiscriminator> = {},
): ContentChatMessageUnionWithDiscriminator {
  return ContentChatMessageUnionWithDiscriminatorSchema.parse(options);
}

export const ChatSectionBranchSchema = z.object({
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default([]),
  createdAt: z.int().default(0),
  parentBranchId: z.union([IDSchema, z.null()]).default(null),
  branchFromMessageId: z.union([IDSchema, z.null()]).default(null),
});

export type ChatSectionBranch = z.infer<typeof ChatSectionBranchSchema>;

export type ChatSectionBranchInput = z.input<typeof ChatSectionBranchSchema>;

export function createChatSectionBranch(
  options: Partial<ChatSectionBranch> = {},
): ChatSectionBranch {
  return ChatSectionBranchSchema.parse(options);
}

export const CodeFileBindingSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
  autoBinding: z.boolean().default(false),
});

export type CodeFileBinding = z.infer<typeof CodeFileBindingSchema>;

export type CodeFileBindingInput = z.input<typeof CodeFileBindingSchema>;

export function createCodeFileBinding(
  options: Partial<CodeFileBinding> = {},
): CodeFileBinding {
  return CodeFileBindingSchema.parse(options);
}

export const ColorPickerChoiceSchema = z.object({
  color: z.string(),
  description: z.string(),
});

export type ColorPickerChoice = z.infer<typeof ColorPickerChoiceSchema>;

export type ColorPickerChoiceInput = z.input<typeof ColorPickerChoiceSchema>;

export function createColorPickerChoice(
  options: Partial<ColorPickerChoice> = {},
): ColorPickerChoice {
  return ColorPickerChoiceSchema.parse(options);
}

export const CodeSectionDiagnosticsIgnoreStateSchema = z.object({
  muted: z.boolean().default(false),
  suppressedCodes: z.array(z.union([z.string(), z.int()])).default([]),
});

export type CodeSectionDiagnosticsIgnoreState = z.infer<
  typeof CodeSectionDiagnosticsIgnoreStateSchema
>;

export type CodeSectionDiagnosticsIgnoreStateInput = z.input<
  typeof CodeSectionDiagnosticsIgnoreStateSchema
>;

export function createCodeSectionDiagnosticsIgnoreState(
  options: Partial<CodeSectionDiagnosticsIgnoreState> = {},
): CodeSectionDiagnosticsIgnoreState {
  return CodeSectionDiagnosticsIgnoreStateSchema.parse(options);
}

export const EdgePortSchema = z.object({
  id: IDSchema.default(create_new_id),
  accessor: z.string().default("" as const),
});

export type EdgePort = z.infer<typeof EdgePortSchema>;

export type EdgePortInput = z.input<typeof EdgePortSchema>;

export function createEdgePort(options: Partial<EdgePort> = {}): EdgePort {
  return EdgePortSchema.parse(options);
}

export const TypeErrorIgnoreStateSchema = z.object({
  callable: z.boolean().default(false),
  params: z.record(IDSchema, z.boolean()).default({}),
});

export type TypeErrorIgnoreState = z.infer<typeof TypeErrorIgnoreStateSchema>;

export type TypeErrorIgnoreStateInput = z.input<
  typeof TypeErrorIgnoreStateSchema
>;

export function createTypeErrorIgnoreState(
  options: Partial<TypeErrorIgnoreState> = {},
): TypeErrorIgnoreState {
  return TypeErrorIgnoreStateSchema.parse(options);
}

export const DrawAreaLayerItemSchema = z.object({
  type: z
    .literal(["Image", "BrushStroke"])
    .default(ArtifactTypeEnum.BrushStroke),
  dataPath: z.string(),
  transformId: z.string(),
});

export type DrawAreaLayerItem = z.infer<typeof DrawAreaLayerItemSchema>;

export type DrawAreaLayerItemInput = z.input<typeof DrawAreaLayerItemSchema>;

export function createDrawAreaLayerItem(
  options: Partial<DrawAreaLayerItem> = {},
): DrawAreaLayerItem {
  return DrawAreaLayerItemSchema.parse(options);
}

export const DrawAreaLayerSchema = z.object({
  name: z.string().default(generate_memorable_string),
  elements: z.array(DrawAreaLayerItemSchema).default([]),
  visible: z.boolean().default(true),
  layerOpacity: z.number().default(1),
});

export type DrawAreaLayer = z.infer<typeof DrawAreaLayerSchema>;

export type DrawAreaLayerInput = z.input<typeof DrawAreaLayerSchema>;

export function createDrawAreaLayer(
  options: Partial<DrawAreaLayer> = {},
): DrawAreaLayer {
  return DrawAreaLayerSchema.parse(options);
}

export const BrowserSavedSearchTypeFiltersSchema = z.object({
  image: z.boolean().default(true),
  video: z.boolean().default(true),
  audio: z.boolean().default(true),
  text: z.boolean().default(true),
  data: z.boolean().default(true),
});

export type BrowserSavedSearchTypeFilters = z.infer<
  typeof BrowserSavedSearchTypeFiltersSchema
>;

export type BrowserSavedSearchTypeFiltersInput = z.input<
  typeof BrowserSavedSearchTypeFiltersSchema
>;

export function createBrowserSavedSearchTypeFilters(
  options: Partial<BrowserSavedSearchTypeFilters> = {},
): BrowserSavedSearchTypeFilters {
  return BrowserSavedSearchTypeFiltersSchema.parse(options);
}

export const BrowserSavedSearchSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default("" as const),
  query: z.string().default("" as const),
  searchScope: z
    .enum(BrowserSearchScopeEnum)
    .default(BrowserSearchScopeEnum.recursive),
  typeFilters: BrowserSavedSearchTypeFiltersSchema.default(
    createBrowserSavedSearchTypeFilters,
  ),
  color: z.string().default("#3b82f6" as const),
  quickInfo: z.string().default("" as const),
});

export type BrowserSavedSearch = z.infer<typeof BrowserSavedSearchSchema>;

export type BrowserSavedSearchInput = z.input<typeof BrowserSavedSearchSchema>;

export function createBrowserSavedSearch(
  options: Partial<BrowserSavedSearch> = {},
): BrowserSavedSearch {
  return BrowserSavedSearchSchema.parse(options);
}

export const SectionSizeSchema = z.object({
  width: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  height: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
});

export type SectionSize = z.infer<typeof SectionSizeSchema>;

export type SectionSizeInput = z.input<typeof SectionSizeSchema>;

export function createSectionSize(
  options: Partial<SectionSize> = {},
): SectionSize {
  return SectionSizeSchema.parse(options);
}

export const SharedModifierSchema = z.object({
  actionMode: z.enum(ButtonActionModeEnum).optional(),
  activeBranchId: z.union([IDSchema, z.null()]).optional(),
  activeLayerIdx: z.int().optional(),
  agentProfileId: z.union([IDSchema, z.null()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
  branches: z.record(IDSchema, ChatSectionBranchSchema).optional(),
  brushColor: z.string().optional(),
  brushOpacity: z.number().optional(),
  brushShape: z.enum(DrawAreaBrushShapeEnum).optional(),
  brushSize: z.int().optional(),
  callable: z.union([IDSchema, z.null()]).optional(),
  canvasMode: z.enum(DrawAreaModeEnum).optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .optional(),
  chatId: z.union([IDSchema, z.null()]).optional(),
  children: z.array(IDSchema).optional(),
  choices: z.array(z.string()).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  codeLanguage: z.union([z.enum(CodeLanguageEnum), z.string()]).optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  colorChoices: z.array(ColorPickerChoiceSchema).optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  data: z.record(z.string(), z.any()).optional(),
  dataPath: z.string().optional(),
  defaultVal: z.string().optional(),
  description: z.string().optional(),
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreStateSchema.optional(),
  drawThrottleDelay: z.int().optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  engineConfigId: z.union([IDSchema, z.null()]).optional(),
  eraserBrushSize: z.int().optional(),
  folder: z.string().optional(),
  format: z
    .union([z.enum(PromptFormatEnum), z.enum(TextBlockFormatEnum)])
    .optional(),
  hasSecret: z.boolean().optional(),
  headingAsSectionName: z.boolean().optional(),
  hideColumn: z.boolean().optional(),
  hideParams: z.boolean().optional(),
  hideUnpinnedParams: z.boolean().optional(),
  id: IDSchema.optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  imagePath: z.string().optional(),
  inputText: z.string().optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  isFrozen: z.boolean().optional(),
  isHorizontalOrientation: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  isJsonSource: z.boolean().optional(),
  isMinimized: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
  kind: z.string().optional(),
  label: z.string().optional(),
  layers: z.array(DrawAreaLayerSchema).optional(),
  managed: z.boolean().optional(),
  max: z.union([z.number(), z.int()]).optional(),
  maxAttachments: z.union([z.int(), z.null()]).optional(),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .optional(),
  metaControlParamId: z.union([IDSchema, z.null()]).optional(),
  metaControlStyle: z.boolean().optional(),
  min: z.union([z.number(), z.int()]).optional(),
  missingVariables: z.array(z.string()).optional(),
  mode: z.enum(DropzoneModeEnum).optional(),
  name: z.string().optional(),
  overflowMode: z.boolean().optional(),
  paramFilter: z.string().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  placeholder: z.string().optional(),
  pluginId: z.string().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  renderError: z.union([z.string(), z.null()]).optional(),
  renderedImagePath: z.union([z.string(), z.null()]).optional(),
  renderedText: z.string().optional(),
  requestBody: z.string().optional(),
  requestHeaderKey: z.string().optional(),
  requestHeaderValue: z.string().optional(),
  requestMethod: z.enum(HttpRequestMethodEnum).optional(),
  requestUrl: z.string().optional(),
  savedSearches: z.array(BrowserSavedSearchSchema).optional(),
  schemaVersion: z.union([z.int(), z.null()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  showSectionTitle: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  step: z.union([z.number(), z.int()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  template: z.string().optional(),
  text: z.string().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  thinking: z.boolean().optional(),
  toolCallArguments: z.record(z.string(), z.string()).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  typesColumnWidth: z.union([z.number(), z.null()]).optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  viewMode: z.enum(BrowserAreaViewModeEnum).optional(),
  waitingForResponse: z.boolean().optional(),
});

export type SharedModifier = z.infer<typeof SharedModifierSchema>;

export type SharedModifierInput = z.input<typeof SharedModifierSchema>;

export function createSharedModifier(
  options: Partial<SharedModifier> = {},
): SharedModifier {
  return SharedModifierSchema.parse(options);
}

export const CoreSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  displayName: z.string().default("" as const),
  variants: z.array(IDSchema).default([]),
  defaultVariant: z.union([IDSchema, z.null()]).default(null),
  sharedModifier: SharedModifierSchema.default(createSharedModifier),
  unsharedKeys: z
    .array(
      z.literal([
        "actionMode",
        "activeBranchId",
        "activeLayerIdx",
        "agentProfileId",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "attachedTerminalSectionId",
        "branches",
        "brushColor",
        "brushOpacity",
        "brushShape",
        "brushSize",
        "callable",
        "canvasMode",
        "chartSettings",
        "chatId",
        "children",
        "choices",
        "code",
        "codeFileBinding",
        "codeLanguage",
        "codeObjVariantMap",
        "colorChoices",
        "columnWidth",
        "configLanguage",
        "coreNameEditable",
        "coreNameType",
        "data",
        "dataPath",
        "defaultVal",
        "description",
        "diagnosticsIgnoreState",
        "drawThrottleDelay",
        "edgeInputParams",
        "edgeOutputPorts",
        "engineConfigId",
        "eraserBrushSize",
        "folder",
        "format",
        "hasSecret",
        "headingAsSectionName",
        "hideColumn",
        "hideParams",
        "hideUnpinnedParams",
        "id",
        "ignoreTypeErrors",
        "imagePath",
        "inputText",
        "inputs",
        "isFrozen",
        "isHorizontalOrientation",
        "isInOtherProjectConfigs",
        "isJsonSource",
        "isMinimized",
        "isPreset",
        "jsonSourceKeys",
        "jsonSourceMissing",
        "kind",
        "label",
        "layers",
        "managed",
        "max",
        "maxAttachments",
        "messages",
        "metaControlParamId",
        "metaControlStyle",
        "min",
        "missingVariables",
        "mode",
        "name",
        "overflowMode",
        "paramFilter",
        "passingStyle",
        "pinnedParams",
        "placeholder",
        "pluginId",
        "positionAndSizeLocked",
        "renderError",
        "renderedImagePath",
        "renderedText",
        "requestBody",
        "requestHeaderKey",
        "requestHeaderValue",
        "requestMethod",
        "requestUrl",
        "savedSearches",
        "schemaVersion",
        "selectedParams",
        "showSectionTitle",
        "size",
        "step",
        "styleColor",
        "tagColor",
        "template",
        "text",
        "textDisplayMode",
        "thinking",
        "toolCallArguments",
        "topLevelParamId",
        "type",
        "typesColumnWidth",
        "url",
        "value",
        "viewMode",
        "waitingForResponse",
      ]),
    )
    .default(() => [
      "callable" as const,
      "codeObjVariantMap" as const,
      "edgeInputParams" as const,
      "edgeOutputPorts" as const,
      "topLevelParamId" as const,
      "value" as const,
      "layers" as const,
    ]),
});

export type Core = z.infer<typeof CoreSchema>;

export type CoreInput = z.input<typeof CoreSchema>;

export function createCore(options: Partial<Core> = {}): Core {
  return CoreSchema.parse(options);
}

export const CallableSectionImplSchema = z.object({
  type: z.literal("Callable").default(SectionTypeEnum.Callable),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  callable: z.union([IDSchema, z.null()]).default(null),
  hideParams: z.boolean().default(false),
});

export type CallableSectionImpl = z.infer<typeof CallableSectionImplSchema>;

export type CallableSectionImplInput = z.input<
  typeof CallableSectionImplSchema
>;

export function createCallableSectionImpl(
  defaults: UserDefaultCallableSectionImpl,
  overrides: Partial<CallableSectionImpl> = {},
): CallableSectionImpl {
  return CallableSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DictSectionImplSchema = z.object({
  type: z.literal("Dict").default(SectionTypeEnum.Dict),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type DictSectionImpl = z.infer<typeof DictSectionImplSchema>;

export type DictSectionImplInput = z.input<typeof DictSectionImplSchema>;

export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return DictSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ListRootSectionImplSchema = z.object({
  type: z.literal("ListRoot").default(SectionTypeEnum.ListRoot),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
});

export type ListRootSectionImpl = z.infer<typeof ListRootSectionImplSchema>;

export type ListRootSectionImplInput = z.input<
  typeof ListRootSectionImplSchema
>;

export function createListRootSectionImpl(
  defaults: UserDefaultListRootSectionImpl,
  overrides: Partial<ListRootSectionImpl> = {},
): ListRootSectionImpl {
  return ListRootSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GroupSectionImplSchema = z.object({
  type: z.literal("Group").default(SectionTypeEnum.Group),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  isHorizontalOrientation: z.boolean().default(false),
  overflowMode: z.boolean().default(false),
});

export type GroupSectionImpl = z.infer<typeof GroupSectionImplSchema>;

export type GroupSectionImplInput = z.input<typeof GroupSectionImplSchema>;

export function createGroupSectionImpl(
  defaults: UserDefaultGroupSectionImpl,
  overrides: Partial<GroupSectionImpl> = {},
): GroupSectionImpl {
  return GroupSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ImageSectionImplSchema = z.object({
  type: z.literal("Image").default(SectionTypeEnum.Image),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  imagePath: z.string().default("" as const),
});

export type ImageSectionImpl = z.infer<typeof ImageSectionImplSchema>;

export type ImageSectionImplInput = z.input<typeof ImageSectionImplSchema>;

export function createImageSectionImpl(
  defaults: UserDefaultImageSectionImpl,
  overrides: Partial<ImageSectionImpl> = {},
): ImageSectionImpl {
  return ImageSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ChartSectionImplSchema = z.object({
  type: z.literal("Chart").default(SectionTypeEnum.Chart),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 300.0, height: 300.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  dataPath: z.string().default("" as const),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .default(createLineChartSettings),
});

export type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

export type ChartSectionImplInput = z.input<typeof ChartSectionImplSchema>;

export function createChartSectionImpl(
  defaults: UserDefaultChartSectionImpl,
  overrides: Partial<ChartSectionImpl> = {},
): ChartSectionImpl {
  return ChartSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DrawSectionImplSchema = z.object({
  type: z.literal("Draw").default(SectionTypeEnum.Draw),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 402.0, height: 100.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  layers: z.array(DrawAreaLayerSchema).default([]),
  renderedImagePath: z.union([z.string(), z.null()]).default(null),
  activeLayerIdx: z.int().default(0),
  brushColor: z.string().default("#ff0000" as const),
  brushSize: z.int().default(16),
  brushShape: z
    .enum(DrawAreaBrushShapeEnum)
    .default(DrawAreaBrushShapeEnum.butt),
  brushOpacity: z.number().default(1),
  eraserBrushSize: z.int().default(16),
  drawThrottleDelay: z.int().default(0),
  canvasMode: z.enum(DrawAreaModeEnum).default(DrawAreaModeEnum.draw),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
});

export type DrawSectionImpl = z.infer<typeof DrawSectionImplSchema>;

export type DrawSectionImplInput = z.input<typeof DrawSectionImplSchema>;

export function createDrawSectionImpl(
  defaults: UserDefaultDrawSectionImpl,
  overrides: Partial<DrawSectionImpl> = {},
): DrawSectionImpl {
  return DrawSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const TextBlockSectionImplSchema = z.object({
  type: z.literal("TextBlock").default(SectionTypeEnum.TextBlock),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  format: z.enum(TextBlockFormatEnum).default(TextBlockFormatEnum.Plaintext),
  headingAsSectionName: z.boolean().default(false),
  metaControlStyle: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

export type TextBlockSectionImpl = z.infer<typeof TextBlockSectionImplSchema>;

export type TextBlockSectionImplInput = z.input<
  typeof TextBlockSectionImplSchema
>;

export function createTextBlockSectionImpl(
  defaults: UserDefaultTextBlockSectionImpl,
  overrides: Partial<TextBlockSectionImpl> = {},
): TextBlockSectionImpl {
  return TextBlockSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const PromptSectionImplSchema = z.object({
  type: z.literal("Prompt").default(SectionTypeEnum.Prompt),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 300.0, height: 150.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  template: z.string().default("" as const),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputs: z.record(z.string(), z.string()).default({}),
  renderedText: z.string().default("" as const),
  missingVariables: z.array(z.string()).default([]),
  renderError: z.union([z.string(), z.null()]).default(null),
});

export type PromptSectionImpl = z.infer<typeof PromptSectionImplSchema>;

export type PromptSectionImplInput = z.input<typeof PromptSectionImplSchema>;

export function createPromptSectionImpl(
  defaults: UserDefaultPromptSectionImpl,
  overrides: Partial<PromptSectionImpl> = {},
): PromptSectionImpl {
  return PromptSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const MetaControlSectionImplSchema = z.object({
  type: z.literal("MetaControl").default(SectionTypeEnum.MetaControl),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  metaControlParamId: z.union([IDSchema, z.null()]).default(null),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  showSectionTitle: z.boolean().default(false),
});

export type MetaControlSectionImpl = z.infer<
  typeof MetaControlSectionImplSchema
>;

export type MetaControlSectionImplInput = z.input<
  typeof MetaControlSectionImplSchema
>;

export function createMetaControlSectionImpl(
  defaults: UserDefaultMetaControlSectionImpl,
  overrides: Partial<MetaControlSectionImpl> = {},
): MetaControlSectionImpl {
  return MetaControlSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const SocialSectionImplSchema = z.object({
  type: z.literal("Social").default(SectionTypeEnum.Social),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  url: z.string().default("" as const),
});

export type SocialSectionImpl = z.infer<typeof SocialSectionImplSchema>;

export type SocialSectionImplInput = z.input<typeof SocialSectionImplSchema>;

export function createSocialSectionImpl(
  defaults: UserDefaultSocialSectionImpl,
  overrides: Partial<SocialSectionImpl> = {},
): SocialSectionImpl {
  return SocialSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GlobalVariablesSectionImplSchema = z.object({
  type: z.literal("GlobalVariables").default(SectionTypeEnum.GlobalVariables),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type GlobalVariablesSectionImpl = z.infer<
  typeof GlobalVariablesSectionImplSchema
>;

export type GlobalVariablesSectionImplInput = z.input<
  typeof GlobalVariablesSectionImplSchema
>;

export function createGlobalVariablesSectionImpl(
  defaults: UserDefaultGlobalVariablesSectionImpl,
  overrides: Partial<GlobalVariablesSectionImpl> = {},
): GlobalVariablesSectionImpl {
  return GlobalVariablesSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const CodeSectionImplSchema = z.object({
  type: z.literal("Code").default(SectionTypeEnum.Code),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
  codeLanguage: z
    .union([z.enum(CodeLanguageEnum), z.string()])
    .default(CodeLanguageEnum.python),
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreStateSchema.default(
    createCodeSectionDiagnosticsIgnoreState,
  ),
});

export type CodeSectionImpl = z.infer<typeof CodeSectionImplSchema>;

export type CodeSectionImplInput = z.input<typeof CodeSectionImplSchema>;

export function createCodeSectionImpl(
  defaults: UserDefaultCodeSectionImpl,
  overrides: Partial<CodeSectionImpl> = {},
): CodeSectionImpl {
  return CodeSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GenPythonCodeSectionImplSchema = z.object({
  type: z.literal("GenPythonCode").default(SectionTypeEnum.GenPythonCode),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type GenPythonCodeSectionImpl = z.infer<
  typeof GenPythonCodeSectionImplSchema
>;

export type GenPythonCodeSectionImplInput = z.input<
  typeof GenPythonCodeSectionImplSchema
>;

export function createGenPythonCodeSectionImpl(
  defaults: UserDefaultGenPythonCodeSectionImpl,
  overrides: Partial<GenPythonCodeSectionImpl> = {},
): GenPythonCodeSectionImpl {
  return GenPythonCodeSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GenPythonMetadataSectionImplSchema = z.object({
  type: z
    .literal("GenPythonMetadata")
    .default(SectionTypeEnum.GenPythonMetadata),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type GenPythonMetadataSectionImpl = z.infer<
  typeof GenPythonMetadataSectionImplSchema
>;

export type GenPythonMetadataSectionImplInput = z.input<
  typeof GenPythonMetadataSectionImplSchema
>;

export function createGenPythonMetadataSectionImpl(
  defaults: UserDefaultGenPythonMetadataSectionImpl,
  overrides: Partial<GenPythonMetadataSectionImpl> = {},
): GenPythonMetadataSectionImpl {
  return GenPythonMetadataSectionImplSchema.parse({
    ...defaults,
    ...overrides,
  });
}

export const TerminalSectionImplSchema = z.object({
  type: z.literal("Terminal").default(SectionTypeEnum.Terminal),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 250.0, height: 150.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type TerminalSectionImpl = z.infer<typeof TerminalSectionImplSchema>;

export type TerminalSectionImplInput = z.input<
  typeof TerminalSectionImplSchema
>;

export function createTerminalSectionImpl(
  defaults: UserDefaultTerminalSectionImpl,
  overrides: Partial<TerminalSectionImpl> = {},
): TerminalSectionImpl {
  return TerminalSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const IFrameSectionImplSchema = z.object({
  type: z.literal("IFrame").default(SectionTypeEnum.IFrame),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type IFrameSectionImpl = z.infer<typeof IFrameSectionImplSchema>;

export type IFrameSectionImplInput = z.input<typeof IFrameSectionImplSchema>;

export function createIFrameSectionImpl(
  defaults: UserDefaultIFrameSectionImpl,
  overrides: Partial<IFrameSectionImpl> = {},
): IFrameSectionImpl {
  return IFrameSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ChatSectionImplSchema = z.object({
  type: z.literal("Chat").default(SectionTypeEnum.Chat),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 400.0, height: 200.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  managed: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  chatId: z.union([IDSchema, z.null()]).default(null),
  thinking: z.boolean().default(true),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default([]),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

export type ChatSectionImpl = z.infer<typeof ChatSectionImplSchema>;

export type ChatSectionImplInput = z.input<typeof ChatSectionImplSchema>;

export function createChatSectionImpl(
  defaults: UserDefaultChatSectionImpl,
  overrides: Partial<ChatSectionImpl> = {},
): ChatSectionImpl {
  return ChatSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const BrowserSectionImplSchema = z.object({
  type: z.literal("Browser").default(SectionTypeEnum.Browser),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 720.0, height: 460.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  folder: z.string().default("" as const),
  hideColumn: z.boolean().default(false),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  typesColumnWidth: z.union([z.number(), z.null()]).default(null),
  viewMode: z
    .enum(BrowserAreaViewModeEnum)
    .default(BrowserAreaViewModeEnum.list),
  savedSearches: z.array(BrowserSavedSearchSchema).default([]),
});

export type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

export type BrowserSectionImplInput = z.input<typeof BrowserSectionImplSchema>;

export function createBrowserSectionImpl(
  defaults: UserDefaultBrowserSectionImpl,
  overrides: Partial<BrowserSectionImpl> = {},
): BrowserSectionImpl {
  return BrowserSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const PluginSectionImplSchema = z.object({
  type: z.literal("Plugin").default(SectionTypeEnum.Plugin),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  pluginId: z.string().default("" as const),
  kind: z.string().default("default" as const),
  data: z.record(z.string(), z.any()).default({}),
  schemaVersion: z.union([z.int(), z.null()]).default(null),
});

export type PluginSectionImpl = z.infer<typeof PluginSectionImplSchema>;

export type PluginSectionImplInput = z.input<typeof PluginSectionImplSchema>;

export function createPluginSectionImpl(
  defaults: UserDefaultPluginSectionImpl,
  overrides: Partial<PluginSectionImpl> = {},
): PluginSectionImpl {
  return PluginSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const VariantSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: IDSchema,
  nonPresetImpls: z.array(IDSchema),
  modifier: SharedModifierSchema.default(createSharedModifier),
  isFrozen: z.boolean().default(false),
});

export type Variant = z.infer<typeof VariantSchema>;

export type VariantInput = z.input<typeof VariantSchema>;

export function createVariant(options: Partial<Variant> = {}): Variant {
  return VariantSchema.parse(options);
}

export const CodeCallableCodeObjImplSchema = z.object({
  type: z.literal("CodeCallable").default(CodeObjTypeEnum.CodeCallable),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
});

export type CodeCallableCodeObjImpl = z.infer<
  typeof CodeCallableCodeObjImplSchema
>;

export type CodeCallableCodeObjImplInput = z.input<
  typeof CodeCallableCodeObjImplSchema
>;

export function createCodeCallableCodeObjImpl(
  defaults: UserDefaultCodeCallableCodeObjImpl,
  overrides: Partial<CodeCallableCodeObjImpl> = {},
): CodeCallableCodeObjImpl {
  return CodeCallableCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const CodeParamCodeObjImplSchema = z.object({
  type: z.literal("CodeParam").default(CodeObjTypeEnum.CodeParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type CodeParamCodeObjImpl = z.infer<typeof CodeParamCodeObjImplSchema>;

export type CodeParamCodeObjImplInput = z.input<
  typeof CodeParamCodeObjImplSchema
>;

export function createCodeParamCodeObjImpl(
  defaults: UserDefaultCodeParamCodeObjImpl,
  overrides: Partial<CodeParamCodeObjImpl> = {},
): CodeParamCodeObjImpl {
  return CodeParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const TextParamCodeObjImplSchema = z.object({
  type: z.literal("TextParam").default(CodeObjTypeEnum.TextParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type TextParamCodeObjImpl = z.infer<typeof TextParamCodeObjImplSchema>;

export type TextParamCodeObjImplInput = z.input<
  typeof TextParamCodeObjImplSchema
>;

export function createTextParamCodeObjImpl(
  defaults: UserDefaultTextParamCodeObjImpl,
  overrides: Partial<TextParamCodeObjImpl> = {},
): TextParamCodeObjImpl {
  return TextParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const ButtonParamCodeObjImplSchema = z.object({
  type: z.literal("ButtonParam").default(CodeObjTypeEnum.ButtonParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  label: z.string().default("Trigger" as const),
  actionMode: z
    .enum(ButtonActionModeEnum)
    .default(ButtonActionModeEnum.WEBSOCKET_LISTENER),
  requestMethod: z
    .enum(HttpRequestMethodEnum)
    .default(HttpRequestMethodEnum.POST),
  requestUrl: z.string().default("" as const),
  requestHeaderKey: z.string().default("" as const),
  requestHeaderValue: z.string().default("" as const),
  requestBody: z.string().default("" as const),
});

export type ButtonParamCodeObjImpl = z.infer<
  typeof ButtonParamCodeObjImplSchema
>;

export type ButtonParamCodeObjImplInput = z.input<
  typeof ButtonParamCodeObjImplSchema
>;

export function createButtonParamCodeObjImpl(
  defaults: UserDefaultButtonParamCodeObjImpl,
  overrides: Partial<ButtonParamCodeObjImpl> = {},
): ButtonParamCodeObjImpl {
  return ButtonParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const SliderParamCodeObjImplSchema = z.object({
  type: z.literal("SliderParam").default(CodeObjTypeEnum.SliderParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

export type SliderParamCodeObjImpl = z.infer<
  typeof SliderParamCodeObjImplSchema
>;

export type SliderParamCodeObjImplInput = z.input<
  typeof SliderParamCodeObjImplSchema
>;

export function createSliderParamCodeObjImpl(
  defaults: UserDefaultSliderParamCodeObjImpl,
  overrides: Partial<SliderParamCodeObjImpl> = {},
): SliderParamCodeObjImpl {
  return SliderParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const RotaryParamCodeObjImplSchema = z.object({
  type: z.literal("RotaryParam").default(CodeObjTypeEnum.RotaryParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.number().default(0),
  max: z.number().default(1),
  step: z.number().default(0.1),
});

export type RotaryParamCodeObjImpl = z.infer<
  typeof RotaryParamCodeObjImplSchema
>;

export type RotaryParamCodeObjImplInput = z.input<
  typeof RotaryParamCodeObjImplSchema
>;

export function createRotaryParamCodeObjImpl(
  defaults: UserDefaultRotaryParamCodeObjImpl,
  overrides: Partial<RotaryParamCodeObjImpl> = {},
): RotaryParamCodeObjImpl {
  return RotaryParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const SwitchParamCodeObjImplSchema = z.object({
  type: z.literal("SwitchParam").default(CodeObjTypeEnum.SwitchParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("false" as const),
});

export type SwitchParamCodeObjImpl = z.infer<
  typeof SwitchParamCodeObjImplSchema
>;

export type SwitchParamCodeObjImplInput = z.input<
  typeof SwitchParamCodeObjImplSchema
>;

export function createSwitchParamCodeObjImpl(
  defaults: UserDefaultSwitchParamCodeObjImpl,
  overrides: Partial<SwitchParamCodeObjImpl> = {},
): SwitchParamCodeObjImpl {
  return SwitchParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const ColorPickerParamCodeObjImplSchema = z.object({
  type: z.literal("ColorPickerParam").default(CodeObjTypeEnum.ColorPickerParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
});

export type ColorPickerParamCodeObjImpl = z.infer<
  typeof ColorPickerParamCodeObjImplSchema
>;

export type ColorPickerParamCodeObjImplInput = z.input<
  typeof ColorPickerParamCodeObjImplSchema
>;

export function createColorPickerParamCodeObjImpl(
  defaults: UserDefaultColorPickerParamCodeObjImpl,
  overrides: Partial<ColorPickerParamCodeObjImpl> = {},
): ColorPickerParamCodeObjImpl {
  return ColorPickerParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const DropdownParamCodeObjImplSchema = z.object({
  type: z.literal("DropdownParam").default(CodeObjTypeEnum.DropdownParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default([]),
});

export type DropdownParamCodeObjImpl = z.infer<
  typeof DropdownParamCodeObjImplSchema
>;

export type DropdownParamCodeObjImplInput = z.input<
  typeof DropdownParamCodeObjImplSchema
>;

export function createDropdownParamCodeObjImpl(
  defaults: UserDefaultDropdownParamCodeObjImpl,
  overrides: Partial<DropdownParamCodeObjImpl> = {},
): DropdownParamCodeObjImpl {
  return DropdownParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const PasswordParamCodeObjImplSchema = z.object({
  type: z.literal("PasswordParam").default(CodeObjTypeEnum.PasswordParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  hasSecret: z.boolean().default(false),
});

export type PasswordParamCodeObjImpl = z.infer<
  typeof PasswordParamCodeObjImplSchema
>;

export type PasswordParamCodeObjImplInput = z.input<
  typeof PasswordParamCodeObjImplSchema
>;

export function createPasswordParamCodeObjImpl(
  defaults: UserDefaultPasswordParamCodeObjImpl,
  overrides: Partial<PasswordParamCodeObjImpl> = {},
): PasswordParamCodeObjImpl {
  return PasswordParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const TextAreaParamCodeObjImplSchema = z.object({
  type: z.literal("TextAreaParam").default(CodeObjTypeEnum.TextAreaParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type TextAreaParamCodeObjImpl = z.infer<
  typeof TextAreaParamCodeObjImplSchema
>;

export type TextAreaParamCodeObjImplInput = z.input<
  typeof TextAreaParamCodeObjImplSchema
>;

export function createTextAreaParamCodeObjImpl(
  defaults: UserDefaultTextAreaParamCodeObjImpl,
  overrides: Partial<TextAreaParamCodeObjImpl> = {},
): TextAreaParamCodeObjImpl {
  return TextAreaParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const DropzoneParamCodeObjImplSchema = z.object({
  type: z.literal("DropzoneParam").default(CodeObjTypeEnum.DropzoneParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  mode: z.enum(DropzoneModeEnum).default(DropzoneModeEnum.STATEFUL),
  maxAttachments: z.union([z.int(), z.null()]).default(null),
  placeholder: z.string().default("Drop a file here" as const),
});

export type DropzoneParamCodeObjImpl = z.infer<
  typeof DropzoneParamCodeObjImplSchema
>;

export type DropzoneParamCodeObjImplInput = z.input<
  typeof DropzoneParamCodeObjImplSchema
>;

export function createDropzoneParamCodeObjImpl(
  defaults: UserDefaultDropzoneParamCodeObjImpl,
  overrides: Partial<DropzoneParamCodeObjImpl> = {},
): DropzoneParamCodeObjImpl {
  return DropzoneParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const NestedParamCodeObjImplSchema = z.object({
  type: z.literal("NestedParam").default(CodeObjTypeEnum.NestedParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
});

export type NestedParamCodeObjImpl = z.infer<
  typeof NestedParamCodeObjImplSchema
>;

export type NestedParamCodeObjImplInput = z.input<
  typeof NestedParamCodeObjImplSchema
>;

export function createNestedParamCodeObjImpl(
  defaults: UserDefaultNestedParamCodeObjImpl,
  overrides: Partial<NestedParamCodeObjImpl> = {},
): NestedParamCodeObjImpl {
  return NestedParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const ProjectStateCoreSchema = z.object({
  sections: z.record(IDSchema, CoreSchema).default({}),
  sectionImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        PromptSectionImplSchema,
        MetaControlSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        GenPythonMetadataSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
        PluginSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(IDSchema, VariantSchema).default({}),
  codeObjs: z.record(IDSchema, CoreSchema).default({}),
  codeObjImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        ButtonParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        RotaryParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        TextAreaParamCodeObjImplSchema,
        DropzoneParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(IDSchema, VariantSchema).default({}),
});

export type ProjectStateCore = z.infer<typeof ProjectStateCoreSchema>;

export type ProjectStateCoreInput = z.input<typeof ProjectStateCoreSchema>;

export function createProjectStateCore(
  options: Partial<ProjectStateCore> = {},
): ProjectStateCore {
  return ProjectStateCoreSchema.parse(options);
}

export const ProjectStateCoreWithSectionVariantMapSchema = z.object({
  core: ProjectStateCoreSchema,
  sectionVariantMap: z.record(IDSchema, IDSchema).default({}),
});

export type ProjectStateCoreWithSectionVariantMap = z.infer<
  typeof ProjectStateCoreWithSectionVariantMapSchema
>;

export type ProjectStateCoreWithSectionVariantMapInput = z.input<
  typeof ProjectStateCoreWithSectionVariantMapSchema
>;

export function createProjectStateCoreWithSectionVariantMap(
  options: Partial<ProjectStateCoreWithSectionVariantMap> = {},
): ProjectStateCoreWithSectionVariantMap {
  return ProjectStateCoreWithSectionVariantMapSchema.parse(options);
}

export const SectionsClipboardDataSchema = z.object({
  type: z.literal("Sections").default(ClipboardDataTypeEnum.Sections),
  data: ProjectStateCoreWithSectionVariantMapSchema,
});

export type SectionsClipboardData = z.infer<typeof SectionsClipboardDataSchema>;

export type SectionsClipboardDataInput = z.input<
  typeof SectionsClipboardDataSchema
>;

export function createSectionsClipboardData(
  options: Partial<SectionsClipboardData> = {},
): SectionsClipboardData {
  return SectionsClipboardDataSchema.parse(options);
}

export const BaseClipboardDataUnionWithDiscriminatorSchema =
  SectionsClipboardDataSchema;

export type BaseClipboardDataUnionWithDiscriminator = z.infer<
  typeof BaseClipboardDataUnionWithDiscriminatorSchema
>;

export type BaseClipboardDataUnionWithDiscriminatorInput = z.input<
  typeof BaseClipboardDataUnionWithDiscriminatorSchema
>;

export const SectionDependencyKeySchema = z.object({
  type: z.literal("Section").default(DependencyKeyTypeEnum.Section),
  sectionId: IDSchema,
});

export type SectionDependencyKey = z.infer<typeof SectionDependencyKeySchema>;

export type SectionDependencyKeyInput = z.input<
  typeof SectionDependencyKeySchema
>;

export function createSectionDependencyKey(
  options: Partial<SectionDependencyKey> = {},
): SectionDependencyKey {
  return SectionDependencyKeySchema.parse(options);
}

export const SectionParamDependencyKeySchema = z.object({
  type: z.literal("SectionParam").default(DependencyKeyTypeEnum.SectionParam),
  sectionId: IDSchema,
  codeObjId: IDSchema,
});

export type SectionParamDependencyKey = z.infer<
  typeof SectionParamDependencyKeySchema
>;

export type SectionParamDependencyKeyInput = z.input<
  typeof SectionParamDependencyKeySchema
>;

export function createSectionParamDependencyKey(
  options: Partial<SectionParamDependencyKey> = {},
): SectionParamDependencyKey {
  return SectionParamDependencyKeySchema.parse(options);
}

export const BaseDependencyKeyUnionSchema = z.union([
  SectionDependencyKeySchema,
  SectionParamDependencyKeySchema,
]);

export type BaseDependencyKeyUnion = z.infer<
  typeof BaseDependencyKeyUnionSchema
>;

export type BaseDependencyKeyUnionInput = z.input<
  typeof BaseDependencyKeyUnionSchema
>;

export const BaseDependencyKeyUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]);

export type BaseDependencyKeyUnionWithDiscriminator = z.infer<
  typeof BaseDependencyKeyUnionWithDiscriminatorSchema
>;

export type BaseDependencyKeyUnionWithDiscriminatorInput = z.input<
  typeof BaseDependencyKeyUnionWithDiscriminatorSchema
>;

export function createBaseDependencyKeyUnionWithDiscriminator(
  options: Partial<BaseDependencyKeyUnionWithDiscriminator> = {},
): BaseDependencyKeyUnionWithDiscriminator {
  return BaseDependencyKeyUnionWithDiscriminatorSchema.parse(options);
}

export const LiteralDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("Literal").default(DependencyValueTypeEnum.Literal),
});

export type LiteralDependencyValue = z.infer<
  typeof LiteralDependencyValueSchema
>;

export type LiteralDependencyValueInput = z.input<
  typeof LiteralDependencyValueSchema
>;

export function createLiteralDependencyValue(
  options: Partial<LiteralDependencyValue> = {},
): LiteralDependencyValue {
  return LiteralDependencyValueSchema.parse(options);
}

export const FileReadDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("FileRead").default(DependencyValueTypeEnum.FileRead),
});

export type FileReadDependencyValue = z.infer<
  typeof FileReadDependencyValueSchema
>;

export type FileReadDependencyValueInput = z.input<
  typeof FileReadDependencyValueSchema
>;

export function createFileReadDependencyValue(
  options: Partial<FileReadDependencyValue> = {},
): FileReadDependencyValue {
  return FileReadDependencyValueSchema.parse(options);
}

export const BinaryDependencyValueSchema = z.object({
  payload: BinaryContentRefSchema,
  type: z.literal("Binary").default(DependencyValueTypeEnum.Binary),
});

export type BinaryDependencyValue = z.infer<typeof BinaryDependencyValueSchema>;

export type BinaryDependencyValueInput = z.input<
  typeof BinaryDependencyValueSchema
>;

export function createBinaryDependencyValue(
  options: Partial<BinaryDependencyValue> = {},
): BinaryDependencyValue {
  return BinaryDependencyValueSchema.parse(options);
}

export const BaseDependencyValueUnionSchema = z.union([
  LiteralDependencyValueSchema,
  FileReadDependencyValueSchema,
  BinaryDependencyValueSchema,
]);

export type BaseDependencyValueUnion = z.infer<
  typeof BaseDependencyValueUnionSchema
>;

export type BaseDependencyValueUnionInput = z.input<
  typeof BaseDependencyValueUnionSchema
>;

export const BaseDependencyValueUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    LiteralDependencyValueSchema,
    FileReadDependencyValueSchema,
    BinaryDependencyValueSchema,
  ]);

export type BaseDependencyValueUnionWithDiscriminator = z.infer<
  typeof BaseDependencyValueUnionWithDiscriminatorSchema
>;

export type BaseDependencyValueUnionWithDiscriminatorInput = z.input<
  typeof BaseDependencyValueUnionWithDiscriminatorSchema
>;

export function createBaseDependencyValueUnionWithDiscriminator(
  options: Partial<BaseDependencyValueUnionWithDiscriminator> = {},
): BaseDependencyValueUnionWithDiscriminator {
  return BaseDependencyValueUnionWithDiscriminatorSchema.parse(options);
}

export const BaseCanvasSectionImplUnionSchema = z.union([
  ChartSectionImplSchema,
  DrawSectionImplSchema,
]);

export type BaseCanvasSectionImplUnion = z.infer<
  typeof BaseCanvasSectionImplUnionSchema
>;

export type BaseCanvasSectionImplUnionInput = z.input<
  typeof BaseCanvasSectionImplUnionSchema
>;

export const BaseChildlessCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  RotaryParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
  TextAreaParamCodeObjImplSchema,
  DropzoneParamCodeObjImplSchema,
]);

export type BaseChildlessCodeObjImplUnion = z.infer<
  typeof BaseChildlessCodeObjImplUnionSchema
>;

export type BaseChildlessCodeObjImplUnionInput = z.input<
  typeof BaseChildlessCodeObjImplUnionSchema
>;

export const BaseCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  ButtonParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  RotaryParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
  TextAreaParamCodeObjImplSchema,
  DropzoneParamCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseCodeObjImplUnion = z.infer<typeof BaseCodeObjImplUnionSchema>;

export type BaseCodeObjImplUnionInput = z.input<
  typeof BaseCodeObjImplUnionSchema
>;

export const BaseCodeSectionImplUnionSchema = z.union([
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
  GenPythonMetadataSectionImplSchema,
]);

export type BaseCodeSectionImplUnion = z.infer<
  typeof BaseCodeSectionImplUnionSchema
>;

export type BaseCodeSectionImplUnionInput = z.input<
  typeof BaseCodeSectionImplUnionSchema
>;

export const BaseDictSectionImplUnionSchema = z.union([
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseDictSectionImplUnion = z.infer<
  typeof BaseDictSectionImplUnionSchema
>;

export type BaseDictSectionImplUnionInput = z.input<
  typeof BaseDictSectionImplUnionSchema
>;

export const BaseParamCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  ButtonParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  RotaryParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
  TextAreaParamCodeObjImplSchema,
  DropzoneParamCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseParamCodeObjImplUnion = z.infer<
  typeof BaseParamCodeObjImplUnionSchema
>;

export type BaseParamCodeObjImplUnionInput = z.input<
  typeof BaseParamCodeObjImplUnionSchema
>;

export const BaseParentCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseParentCodeObjImplUnion = z.infer<
  typeof BaseParentCodeObjImplUnionSchema
>;

export type BaseParentCodeObjImplUnionInput = z.input<
  typeof BaseParentCodeObjImplUnionSchema
>;

export const BaseParentSectionImplUnionSchema = z.union([
  ListRootSectionImplSchema,
  GroupSectionImplSchema,
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
  GenPythonMetadataSectionImplSchema,
]);

export type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

export type BaseParentSectionImplUnionInput = z.input<
  typeof BaseParentSectionImplUnionSchema
>;

export const BaseSectionImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  ListRootSectionImplSchema,
  GroupSectionImplSchema,
  ImageSectionImplSchema,
  ChartSectionImplSchema,
  DrawSectionImplSchema,
  TextBlockSectionImplSchema,
  PromptSectionImplSchema,
  MetaControlSectionImplSchema,
  SocialSectionImplSchema,
  GlobalVariablesSectionImplSchema,
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
  GenPythonMetadataSectionImplSchema,
  TerminalSectionImplSchema,
  IFrameSectionImplSchema,
  ChatSectionImplSchema,
  BrowserSectionImplSchema,
  PluginSectionImplSchema,
]);

export type BaseSectionImplUnion = z.infer<typeof BaseSectionImplUnionSchema>;

export type BaseSectionImplUnionInput = z.input<
  typeof BaseSectionImplUnionSchema
>;

export const BaseSectionWithParamsImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseSectionWithParamsImplUnion = z.infer<
  typeof BaseSectionWithParamsImplUnionSchema
>;

export type BaseSectionWithParamsImplUnionInput = z.input<
  typeof BaseSectionWithParamsImplUnionSchema
>;

export const BaseArtifactUnionSchema = z.union([
  ImageArtifactSchema,
  BrushStrokeArtifactSchema,
  DrawAreaLayerItemTransformArtifactSchema,
  ChartDataArtifactSchema,
  FileArtifactSchema,
]);

export type BaseArtifactUnion = z.infer<typeof BaseArtifactUnionSchema>;

export type BaseArtifactUnionInput = z.input<typeof BaseArtifactUnionSchema>;

export const ChartSectionImplArgsSchema = z.object({
  type: z.literal("Chart").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  dataPath: z.string().optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .optional(),
});

export type ChartSectionImplArgs = z.infer<typeof ChartSectionImplArgsSchema>;

export type ChartSectionImplArgsInput = z.input<
  typeof ChartSectionImplArgsSchema
>;

export function createChartSectionImplArgs(
  options: Partial<ChartSectionImplArgs> = {},
): ChartSectionImplArgs {
  return ChartSectionImplArgsSchema.parse(options);
}

export const DrawSectionImplArgsSchema = z.object({
  type: z.literal("Draw").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  layers: z.array(DrawAreaLayerSchema).optional(),
  renderedImagePath: z.union([z.string(), z.null()]).optional(),
  activeLayerIdx: z.int().optional(),
  brushColor: z.string().optional(),
  brushSize: z.int().optional(),
  brushShape: z.enum(DrawAreaBrushShapeEnum).optional(),
  brushOpacity: z.number().optional(),
  eraserBrushSize: z.int().optional(),
  drawThrottleDelay: z.int().optional(),
  canvasMode: z.enum(DrawAreaModeEnum).optional(),
  colorChoices: z.array(ColorPickerChoiceSchema).optional(),
});

export type DrawSectionImplArgs = z.infer<typeof DrawSectionImplArgsSchema>;

export type DrawSectionImplArgsInput = z.input<
  typeof DrawSectionImplArgsSchema
>;

export function createDrawSectionImplArgs(
  options: Partial<DrawSectionImplArgs> = {},
): DrawSectionImplArgs {
  return DrawSectionImplArgsSchema.parse(options);
}

export const BaseCanvasSectionImplArgsUnionSchema = z.union([
  ChartSectionImplArgsSchema,
  DrawSectionImplArgsSchema,
]);

export type BaseCanvasSectionImplArgsUnion = z.infer<
  typeof BaseCanvasSectionImplArgsUnionSchema
>;

export type BaseCanvasSectionImplArgsUnionInput = z.input<
  typeof BaseCanvasSectionImplArgsUnionSchema
>;

export const BaseCanvasSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ChartSectionImplArgsSchema,
    DrawSectionImplArgsSchema,
  ]);

export type BaseCanvasSectionImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseCanvasSectionImplArgsUnionWithDiscriminatorSchema
>;

export type BaseCanvasSectionImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseCanvasSectionImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseCanvasSectionImplArgsUnionWithDiscriminator(
  options: Partial<BaseCanvasSectionImplArgsUnionWithDiscriminator> = {},
): BaseCanvasSectionImplArgsUnionWithDiscriminator {
  return BaseCanvasSectionImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseCanvasSectionImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [ChartSectionImplSchema, DrawSectionImplSchema]);

export type BaseCanvasSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseCanvasSectionImplUnionWithDiscriminatorSchema
>;

export type BaseCanvasSectionImplUnionWithDiscriminatorInput = z.input<
  typeof BaseCanvasSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseCanvasSectionImplUnionWithDiscriminator(
  options: Partial<BaseCanvasSectionImplUnionWithDiscriminator> = {},
): BaseCanvasSectionImplUnionWithDiscriminator {
  return BaseCanvasSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeParamCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type CodeParamCodeObjImplArgs = z.infer<
  typeof CodeParamCodeObjImplArgsSchema
>;

export type CodeParamCodeObjImplArgsInput = z.input<
  typeof CodeParamCodeObjImplArgsSchema
>;

export function createCodeParamCodeObjImplArgs(
  options: Partial<CodeParamCodeObjImplArgs> = {},
): CodeParamCodeObjImplArgs {
  return CodeParamCodeObjImplArgsSchema.parse(options);
}

export const TextParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TextParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type TextParamCodeObjImplArgs = z.infer<
  typeof TextParamCodeObjImplArgsSchema
>;

export type TextParamCodeObjImplArgsInput = z.input<
  typeof TextParamCodeObjImplArgsSchema
>;

export function createTextParamCodeObjImplArgs(
  options: Partial<TextParamCodeObjImplArgs> = {},
): TextParamCodeObjImplArgs {
  return TextParamCodeObjImplArgsSchema.parse(options);
}

export const SliderParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SliderParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  min: z.int().optional(),
  max: z.int().optional(),
  step: z.int().optional(),
});

export type SliderParamCodeObjImplArgs = z.infer<
  typeof SliderParamCodeObjImplArgsSchema
>;

export type SliderParamCodeObjImplArgsInput = z.input<
  typeof SliderParamCodeObjImplArgsSchema
>;

export function createSliderParamCodeObjImplArgs(
  options: Partial<SliderParamCodeObjImplArgs> = {},
): SliderParamCodeObjImplArgs {
  return SliderParamCodeObjImplArgsSchema.parse(options);
}

export const RotaryParamCodeObjImplArgsSchema = z.object({
  type: z.literal("RotaryParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

export type RotaryParamCodeObjImplArgs = z.infer<
  typeof RotaryParamCodeObjImplArgsSchema
>;

export type RotaryParamCodeObjImplArgsInput = z.input<
  typeof RotaryParamCodeObjImplArgsSchema
>;

export function createRotaryParamCodeObjImplArgs(
  options: Partial<RotaryParamCodeObjImplArgs> = {},
): RotaryParamCodeObjImplArgs {
  return RotaryParamCodeObjImplArgsSchema.parse(options);
}

export const SwitchParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SwitchParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type SwitchParamCodeObjImplArgs = z.infer<
  typeof SwitchParamCodeObjImplArgsSchema
>;

export type SwitchParamCodeObjImplArgsInput = z.input<
  typeof SwitchParamCodeObjImplArgsSchema
>;

export function createSwitchParamCodeObjImplArgs(
  options: Partial<SwitchParamCodeObjImplArgs> = {},
): SwitchParamCodeObjImplArgs {
  return SwitchParamCodeObjImplArgsSchema.parse(options);
}

export const ColorPickerParamCodeObjImplArgsSchema = z.object({
  type: z.literal("ColorPickerParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  colorChoices: z.array(ColorPickerChoiceSchema).optional(),
});

export type ColorPickerParamCodeObjImplArgs = z.infer<
  typeof ColorPickerParamCodeObjImplArgsSchema
>;

export type ColorPickerParamCodeObjImplArgsInput = z.input<
  typeof ColorPickerParamCodeObjImplArgsSchema
>;

export function createColorPickerParamCodeObjImplArgs(
  options: Partial<ColorPickerParamCodeObjImplArgs> = {},
): ColorPickerParamCodeObjImplArgs {
  return ColorPickerParamCodeObjImplArgsSchema.parse(options);
}

export const DropdownParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DropdownParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

export type DropdownParamCodeObjImplArgs = z.infer<
  typeof DropdownParamCodeObjImplArgsSchema
>;

export type DropdownParamCodeObjImplArgsInput = z.input<
  typeof DropdownParamCodeObjImplArgsSchema
>;

export function createDropdownParamCodeObjImplArgs(
  options: Partial<DropdownParamCodeObjImplArgs> = {},
): DropdownParamCodeObjImplArgs {
  return DropdownParamCodeObjImplArgsSchema.parse(options);
}

export const PasswordParamCodeObjImplArgsSchema = z.object({
  type: z.literal("PasswordParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  hasSecret: z.boolean().optional(),
});

export type PasswordParamCodeObjImplArgs = z.infer<
  typeof PasswordParamCodeObjImplArgsSchema
>;

export type PasswordParamCodeObjImplArgsInput = z.input<
  typeof PasswordParamCodeObjImplArgsSchema
>;

export function createPasswordParamCodeObjImplArgs(
  options: Partial<PasswordParamCodeObjImplArgs> = {},
): PasswordParamCodeObjImplArgs {
  return PasswordParamCodeObjImplArgsSchema.parse(options);
}

export const TextAreaParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TextAreaParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type TextAreaParamCodeObjImplArgs = z.infer<
  typeof TextAreaParamCodeObjImplArgsSchema
>;

export type TextAreaParamCodeObjImplArgsInput = z.input<
  typeof TextAreaParamCodeObjImplArgsSchema
>;

export function createTextAreaParamCodeObjImplArgs(
  options: Partial<TextAreaParamCodeObjImplArgs> = {},
): TextAreaParamCodeObjImplArgs {
  return TextAreaParamCodeObjImplArgsSchema.parse(options);
}

export const DropzoneParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DropzoneParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  mode: z.enum(DropzoneModeEnum).optional(),
  maxAttachments: z.union([z.int(), z.null()]).optional(),
  placeholder: z.string().optional(),
});

export type DropzoneParamCodeObjImplArgs = z.infer<
  typeof DropzoneParamCodeObjImplArgsSchema
>;

export type DropzoneParamCodeObjImplArgsInput = z.input<
  typeof DropzoneParamCodeObjImplArgsSchema
>;

export function createDropzoneParamCodeObjImplArgs(
  options: Partial<DropzoneParamCodeObjImplArgs> = {},
): DropzoneParamCodeObjImplArgs {
  return DropzoneParamCodeObjImplArgsSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsUnionSchema = z.union([
  CodeParamCodeObjImplArgsSchema,
  TextParamCodeObjImplArgsSchema,
  SliderParamCodeObjImplArgsSchema,
  RotaryParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
  TextAreaParamCodeObjImplArgsSchema,
  DropzoneParamCodeObjImplArgsSchema,
]);

export type BaseChildlessCodeObjImplArgsUnion = z.infer<
  typeof BaseChildlessCodeObjImplArgsUnionSchema
>;

export type BaseChildlessCodeObjImplArgsUnionInput = z.input<
  typeof BaseChildlessCodeObjImplArgsUnionSchema
>;

export const BaseChildlessCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    RotaryParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
    TextAreaParamCodeObjImplArgsSchema,
    DropzoneParamCodeObjImplArgsSchema,
  ]);

export type BaseChildlessCodeObjImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseChildlessCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export type BaseChildlessCodeObjImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseChildlessCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseChildlessCodeObjImplArgsUnionWithDiscriminator(
  options: Partial<BaseChildlessCodeObjImplArgsUnionWithDiscriminator> = {},
): BaseChildlessCodeObjImplArgsUnionWithDiscriminator {
  return BaseChildlessCodeObjImplArgsUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const BaseChildlessCodeObjImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplSchema,
    TextParamCodeObjImplSchema,
    SliderParamCodeObjImplSchema,
    RotaryParamCodeObjImplSchema,
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
    TextAreaParamCodeObjImplSchema,
    DropzoneParamCodeObjImplSchema,
  ]);

export type BaseChildlessCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseChildlessCodeObjImplUnionWithDiscriminatorSchema
>;

export type BaseChildlessCodeObjImplUnionWithDiscriminatorInput = z.input<
  typeof BaseChildlessCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseChildlessCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseChildlessCodeObjImplUnionWithDiscriminator> = {},
): BaseChildlessCodeObjImplUnionWithDiscriminator {
  return BaseChildlessCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeCallableCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeCallable").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

export type CodeCallableCodeObjImplArgs = z.infer<
  typeof CodeCallableCodeObjImplArgsSchema
>;

export type CodeCallableCodeObjImplArgsInput = z.input<
  typeof CodeCallableCodeObjImplArgsSchema
>;

export function createCodeCallableCodeObjImplArgs(
  options: Partial<CodeCallableCodeObjImplArgs> = {},
): CodeCallableCodeObjImplArgs {
  return CodeCallableCodeObjImplArgsSchema.parse(options);
}

export const ButtonParamCodeObjImplArgsSchema = z.object({
  type: z.literal("ButtonParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  label: z.string().optional(),
  actionMode: z.enum(ButtonActionModeEnum).optional(),
  requestMethod: z.enum(HttpRequestMethodEnum).optional(),
  requestUrl: z.string().optional(),
  requestHeaderKey: z.string().optional(),
  requestHeaderValue: z.string().optional(),
  requestBody: z.string().optional(),
});

export type ButtonParamCodeObjImplArgs = z.infer<
  typeof ButtonParamCodeObjImplArgsSchema
>;

export type ButtonParamCodeObjImplArgsInput = z.input<
  typeof ButtonParamCodeObjImplArgsSchema
>;

export function createButtonParamCodeObjImplArgs(
  options: Partial<ButtonParamCodeObjImplArgs> = {},
): ButtonParamCodeObjImplArgs {
  return ButtonParamCodeObjImplArgsSchema.parse(options);
}

export const NestedParamCodeObjImplArgsSchema = z.object({
  type: z.literal("NestedParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  children: z.array(IDSchema).optional(),
});

export type NestedParamCodeObjImplArgs = z.infer<
  typeof NestedParamCodeObjImplArgsSchema
>;

export type NestedParamCodeObjImplArgsInput = z.input<
  typeof NestedParamCodeObjImplArgsSchema
>;

export function createNestedParamCodeObjImplArgs(
  options: Partial<NestedParamCodeObjImplArgs> = {},
): NestedParamCodeObjImplArgs {
  return NestedParamCodeObjImplArgsSchema.parse(options);
}

export const BaseCodeObjImplArgsUnionSchema = z.union([
  CodeCallableCodeObjImplArgsSchema,
  CodeParamCodeObjImplArgsSchema,
  TextParamCodeObjImplArgsSchema,
  ButtonParamCodeObjImplArgsSchema,
  SliderParamCodeObjImplArgsSchema,
  RotaryParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
  TextAreaParamCodeObjImplArgsSchema,
  DropzoneParamCodeObjImplArgsSchema,
  NestedParamCodeObjImplArgsSchema,
]);

export type BaseCodeObjImplArgsUnion = z.infer<
  typeof BaseCodeObjImplArgsUnionSchema
>;

export type BaseCodeObjImplArgsUnionInput = z.input<
  typeof BaseCodeObjImplArgsUnionSchema
>;

export const BaseCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplArgsSchema,
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    ButtonParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    RotaryParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
    TextAreaParamCodeObjImplArgsSchema,
    DropzoneParamCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseCodeObjImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export type BaseCodeObjImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseCodeObjImplArgsUnionWithDiscriminator(
  options: Partial<BaseCodeObjImplArgsUnionWithDiscriminator> = {},
): BaseCodeObjImplArgsUnionWithDiscriminator {
  return BaseCodeObjImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseCodeObjImplUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "type",
  [
    CodeCallableCodeObjImplSchema,
    CodeParamCodeObjImplSchema,
    TextParamCodeObjImplSchema,
    ButtonParamCodeObjImplSchema,
    SliderParamCodeObjImplSchema,
    RotaryParamCodeObjImplSchema,
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
    TextAreaParamCodeObjImplSchema,
    DropzoneParamCodeObjImplSchema,
    NestedParamCodeObjImplSchema,
  ],
);

export type BaseCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseCodeObjImplUnionWithDiscriminatorSchema
>;

export type BaseCodeObjImplUnionWithDiscriminatorInput = z.input<
  typeof BaseCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseCodeObjImplUnionWithDiscriminator> = {},
): BaseCodeObjImplUnionWithDiscriminator {
  return BaseCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeSectionImplArgsSchema = z.object({
  type: z.literal("Code").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
  codeLanguage: z.union([z.enum(CodeLanguageEnum), z.string()]).optional(),
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreStateSchema.optional(),
});

export type CodeSectionImplArgs = z.infer<typeof CodeSectionImplArgsSchema>;

export type CodeSectionImplArgsInput = z.input<
  typeof CodeSectionImplArgsSchema
>;

export function createCodeSectionImplArgs(
  options: Partial<CodeSectionImplArgs> = {},
): CodeSectionImplArgs {
  return CodeSectionImplArgsSchema.parse(options);
}

export const GenPythonCodeSectionImplArgsSchema = z.object({
  type: z.literal("GenPythonCode").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
});

export type GenPythonCodeSectionImplArgs = z.infer<
  typeof GenPythonCodeSectionImplArgsSchema
>;

export type GenPythonCodeSectionImplArgsInput = z.input<
  typeof GenPythonCodeSectionImplArgsSchema
>;

export function createGenPythonCodeSectionImplArgs(
  options: Partial<GenPythonCodeSectionImplArgs> = {},
): GenPythonCodeSectionImplArgs {
  return GenPythonCodeSectionImplArgsSchema.parse(options);
}

export const GenPythonMetadataSectionImplArgsSchema = z.object({
  type: z.literal("GenPythonMetadata").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
});

export type GenPythonMetadataSectionImplArgs = z.infer<
  typeof GenPythonMetadataSectionImplArgsSchema
>;

export type GenPythonMetadataSectionImplArgsInput = z.input<
  typeof GenPythonMetadataSectionImplArgsSchema
>;

export function createGenPythonMetadataSectionImplArgs(
  options: Partial<GenPythonMetadataSectionImplArgs> = {},
): GenPythonMetadataSectionImplArgs {
  return GenPythonMetadataSectionImplArgsSchema.parse(options);
}

export const BaseCodeSectionImplArgsUnionSchema = z.union([
  CodeSectionImplArgsSchema,
  GenPythonCodeSectionImplArgsSchema,
  GenPythonMetadataSectionImplArgsSchema,
]);

export type BaseCodeSectionImplArgsUnion = z.infer<
  typeof BaseCodeSectionImplArgsUnionSchema
>;

export type BaseCodeSectionImplArgsUnionInput = z.input<
  typeof BaseCodeSectionImplArgsUnionSchema
>;

export const BaseCodeSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
    GenPythonMetadataSectionImplArgsSchema,
  ]);

export type BaseCodeSectionImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseCodeSectionImplArgsUnionWithDiscriminatorSchema
>;

export type BaseCodeSectionImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseCodeSectionImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseCodeSectionImplArgsUnionWithDiscriminator(
  options: Partial<BaseCodeSectionImplArgsUnionWithDiscriminator> = {},
): BaseCodeSectionImplArgsUnionWithDiscriminator {
  return BaseCodeSectionImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseCodeSectionImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeSectionImplSchema,
    GenPythonCodeSectionImplSchema,
    GenPythonMetadataSectionImplSchema,
  ]);

export type BaseCodeSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseCodeSectionImplUnionWithDiscriminatorSchema
>;

export type BaseCodeSectionImplUnionWithDiscriminatorInput = z.input<
  typeof BaseCodeSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseCodeSectionImplUnionWithDiscriminator(
  options: Partial<BaseCodeSectionImplUnionWithDiscriminator> = {},
): BaseCodeSectionImplUnionWithDiscriminator {
  return BaseCodeSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const DictSectionImplArgsSchema = z.object({
  type: z.literal("Dict").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type DictSectionImplArgs = z.infer<typeof DictSectionImplArgsSchema>;

export type DictSectionImplArgsInput = z.input<
  typeof DictSectionImplArgsSchema
>;

export function createDictSectionImplArgs(
  options: Partial<DictSectionImplArgs> = {},
): DictSectionImplArgs {
  return DictSectionImplArgsSchema.parse(options);
}

export const GlobalVariablesSectionImplArgsSchema = z.object({
  type: z.literal("GlobalVariables").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type GlobalVariablesSectionImplArgs = z.infer<
  typeof GlobalVariablesSectionImplArgsSchema
>;

export type GlobalVariablesSectionImplArgsInput = z.input<
  typeof GlobalVariablesSectionImplArgsSchema
>;

export function createGlobalVariablesSectionImplArgs(
  options: Partial<GlobalVariablesSectionImplArgs> = {},
): GlobalVariablesSectionImplArgs {
  return GlobalVariablesSectionImplArgsSchema.parse(options);
}

export const BaseDictSectionImplArgsUnionSchema = z.union([
  DictSectionImplArgsSchema,
  GlobalVariablesSectionImplArgsSchema,
]);

export type BaseDictSectionImplArgsUnion = z.infer<
  typeof BaseDictSectionImplArgsUnionSchema
>;

export type BaseDictSectionImplArgsUnionInput = z.input<
  typeof BaseDictSectionImplArgsUnionSchema
>;

export const BaseDictSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    DictSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
  ]);

export type BaseDictSectionImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseDictSectionImplArgsUnionWithDiscriminatorSchema
>;

export type BaseDictSectionImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseDictSectionImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseDictSectionImplArgsUnionWithDiscriminator(
  options: Partial<BaseDictSectionImplArgsUnionWithDiscriminator> = {},
): BaseDictSectionImplArgsUnionWithDiscriminator {
  return BaseDictSectionImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseDictSectionImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    DictSectionImplSchema,
    GlobalVariablesSectionImplSchema,
  ]);

export type BaseDictSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseDictSectionImplUnionWithDiscriminatorSchema
>;

export type BaseDictSectionImplUnionWithDiscriminatorInput = z.input<
  typeof BaseDictSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseDictSectionImplUnionWithDiscriminator(
  options: Partial<BaseDictSectionImplUnionWithDiscriminator> = {},
): BaseDictSectionImplUnionWithDiscriminator {
  return BaseDictSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParamCodeObjImplArgsUnionSchema = z.union([
  CodeParamCodeObjImplArgsSchema,
  TextParamCodeObjImplArgsSchema,
  ButtonParamCodeObjImplArgsSchema,
  SliderParamCodeObjImplArgsSchema,
  RotaryParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
  TextAreaParamCodeObjImplArgsSchema,
  DropzoneParamCodeObjImplArgsSchema,
  NestedParamCodeObjImplArgsSchema,
]);

export type BaseParamCodeObjImplArgsUnion = z.infer<
  typeof BaseParamCodeObjImplArgsUnionSchema
>;

export type BaseParamCodeObjImplArgsUnionInput = z.input<
  typeof BaseParamCodeObjImplArgsUnionSchema
>;

export const BaseParamCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    ButtonParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    RotaryParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
    TextAreaParamCodeObjImplArgsSchema,
    DropzoneParamCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseParamCodeObjImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseParamCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export type BaseParamCodeObjImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseParamCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseParamCodeObjImplArgsUnionWithDiscriminator(
  options: Partial<BaseParamCodeObjImplArgsUnionWithDiscriminator> = {},
): BaseParamCodeObjImplArgsUnionWithDiscriminator {
  return BaseParamCodeObjImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParamCodeObjImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplSchema,
    TextParamCodeObjImplSchema,
    ButtonParamCodeObjImplSchema,
    SliderParamCodeObjImplSchema,
    RotaryParamCodeObjImplSchema,
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
    TextAreaParamCodeObjImplSchema,
    DropzoneParamCodeObjImplSchema,
    NestedParamCodeObjImplSchema,
  ]);

export type BaseParamCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseParamCodeObjImplUnionWithDiscriminatorSchema
>;

export type BaseParamCodeObjImplUnionWithDiscriminatorInput = z.input<
  typeof BaseParamCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseParamCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseParamCodeObjImplUnionWithDiscriminator> = {},
): BaseParamCodeObjImplUnionWithDiscriminator {
  return BaseParamCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParentCodeObjImplArgsUnionSchema = z.union([
  CodeCallableCodeObjImplArgsSchema,
  NestedParamCodeObjImplArgsSchema,
]);

export type BaseParentCodeObjImplArgsUnion = z.infer<
  typeof BaseParentCodeObjImplArgsUnionSchema
>;

export type BaseParentCodeObjImplArgsUnionInput = z.input<
  typeof BaseParentCodeObjImplArgsUnionSchema
>;

export const BaseParentCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseParentCodeObjImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseParentCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export type BaseParentCodeObjImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseParentCodeObjImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseParentCodeObjImplArgsUnionWithDiscriminator(
  options: Partial<BaseParentCodeObjImplArgsUnionWithDiscriminator> = {},
): BaseParentCodeObjImplArgsUnionWithDiscriminator {
  return BaseParentCodeObjImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParentCodeObjImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplSchema,
    NestedParamCodeObjImplSchema,
  ]);

export type BaseParentCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseParentCodeObjImplUnionWithDiscriminatorSchema
>;

export type BaseParentCodeObjImplUnionWithDiscriminatorInput = z.input<
  typeof BaseParentCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseParentCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseParentCodeObjImplUnionWithDiscriminator> = {},
): BaseParentCodeObjImplUnionWithDiscriminator {
  return BaseParentCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const ListRootSectionImplArgsSchema = z.object({
  type: z.literal("ListRoot").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

export type ListRootSectionImplArgs = z.infer<
  typeof ListRootSectionImplArgsSchema
>;

export type ListRootSectionImplArgsInput = z.input<
  typeof ListRootSectionImplArgsSchema
>;

export function createListRootSectionImplArgs(
  options: Partial<ListRootSectionImplArgs> = {},
): ListRootSectionImplArgs {
  return ListRootSectionImplArgsSchema.parse(options);
}

export const GroupSectionImplArgsSchema = z.object({
  type: z.literal("Group").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
  isHorizontalOrientation: z.boolean().optional(),
  overflowMode: z.boolean().optional(),
});

export type GroupSectionImplArgs = z.infer<typeof GroupSectionImplArgsSchema>;

export type GroupSectionImplArgsInput = z.input<
  typeof GroupSectionImplArgsSchema
>;

export function createGroupSectionImplArgs(
  options: Partial<GroupSectionImplArgs> = {},
): GroupSectionImplArgs {
  return GroupSectionImplArgsSchema.parse(options);
}

export const BaseParentSectionImplArgsUnionSchema = z.union([
  ListRootSectionImplArgsSchema,
  GroupSectionImplArgsSchema,
  CodeSectionImplArgsSchema,
  GenPythonCodeSectionImplArgsSchema,
  GenPythonMetadataSectionImplArgsSchema,
]);

export type BaseParentSectionImplArgsUnion = z.infer<
  typeof BaseParentSectionImplArgsUnionSchema
>;

export type BaseParentSectionImplArgsUnionInput = z.input<
  typeof BaseParentSectionImplArgsUnionSchema
>;

export const BaseParentSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ListRootSectionImplArgsSchema,
    GroupSectionImplArgsSchema,
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
    GenPythonMetadataSectionImplArgsSchema,
  ]);

export type BaseParentSectionImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseParentSectionImplArgsUnionWithDiscriminatorSchema
>;

export type BaseParentSectionImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseParentSectionImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseParentSectionImplArgsUnionWithDiscriminator(
  options: Partial<BaseParentSectionImplArgsUnionWithDiscriminator> = {},
): BaseParentSectionImplArgsUnionWithDiscriminator {
  return BaseParentSectionImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParentSectionImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ListRootSectionImplSchema,
    GroupSectionImplSchema,
    CodeSectionImplSchema,
    GenPythonCodeSectionImplSchema,
    GenPythonMetadataSectionImplSchema,
  ]);

export type BaseParentSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseParentSectionImplUnionWithDiscriminatorSchema
>;

export type BaseParentSectionImplUnionWithDiscriminatorInput = z.input<
  typeof BaseParentSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseParentSectionImplUnionWithDiscriminator(
  options: Partial<BaseParentSectionImplUnionWithDiscriminator> = {},
): BaseParentSectionImplUnionWithDiscriminator {
  return BaseParentSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const CallableSectionImplArgsSchema = z.object({
  type: z.literal("Callable").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  callable: z.union([IDSchema, z.null()]).optional(),
  hideParams: z.boolean().optional(),
});

export type CallableSectionImplArgs = z.infer<
  typeof CallableSectionImplArgsSchema
>;

export type CallableSectionImplArgsInput = z.input<
  typeof CallableSectionImplArgsSchema
>;

export function createCallableSectionImplArgs(
  options: Partial<CallableSectionImplArgs> = {},
): CallableSectionImplArgs {
  return CallableSectionImplArgsSchema.parse(options);
}

export const ImageSectionImplArgsSchema = z.object({
  type: z.literal("Image").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  imagePath: z.string().optional(),
});

export type ImageSectionImplArgs = z.infer<typeof ImageSectionImplArgsSchema>;

export type ImageSectionImplArgsInput = z.input<
  typeof ImageSectionImplArgsSchema
>;

export function createImageSectionImplArgs(
  options: Partial<ImageSectionImplArgs> = {},
): ImageSectionImplArgs {
  return ImageSectionImplArgsSchema.parse(options);
}

export const TextBlockSectionImplArgsSchema = z.object({
  type: z.literal("TextBlock").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  format: z.enum(TextBlockFormatEnum).optional(),
  headingAsSectionName: z.boolean().optional(),
  metaControlStyle: z.boolean().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  text: z.string().optional(),
});

export type TextBlockSectionImplArgs = z.infer<
  typeof TextBlockSectionImplArgsSchema
>;

export type TextBlockSectionImplArgsInput = z.input<
  typeof TextBlockSectionImplArgsSchema
>;

export function createTextBlockSectionImplArgs(
  options: Partial<TextBlockSectionImplArgs> = {},
): TextBlockSectionImplArgs {
  return TextBlockSectionImplArgsSchema.parse(options);
}

export const PromptSectionImplArgsSchema = z.object({
  type: z.literal("Prompt").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  template: z.string().optional(),
  format: z.enum(PromptFormatEnum).optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  renderedText: z.string().optional(),
  missingVariables: z.array(z.string()).optional(),
  renderError: z.union([z.string(), z.null()]).optional(),
});

export type PromptSectionImplArgs = z.infer<typeof PromptSectionImplArgsSchema>;

export type PromptSectionImplArgsInput = z.input<
  typeof PromptSectionImplArgsSchema
>;

export function createPromptSectionImplArgs(
  options: Partial<PromptSectionImplArgs> = {},
): PromptSectionImplArgs {
  return PromptSectionImplArgsSchema.parse(options);
}

export const MetaControlSectionImplArgsSchema = z.object({
  type: z.literal("MetaControl").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  metaControlParamId: z.union([IDSchema, z.null()]).optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  showSectionTitle: z.boolean().optional(),
});

export type MetaControlSectionImplArgs = z.infer<
  typeof MetaControlSectionImplArgsSchema
>;

export type MetaControlSectionImplArgsInput = z.input<
  typeof MetaControlSectionImplArgsSchema
>;

export function createMetaControlSectionImplArgs(
  options: Partial<MetaControlSectionImplArgs> = {},
): MetaControlSectionImplArgs {
  return MetaControlSectionImplArgsSchema.parse(options);
}

export const SocialSectionImplArgsSchema = z.object({
  type: z.literal("Social").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  url: z.string().optional(),
});

export type SocialSectionImplArgs = z.infer<typeof SocialSectionImplArgsSchema>;

export type SocialSectionImplArgsInput = z.input<
  typeof SocialSectionImplArgsSchema
>;

export function createSocialSectionImplArgs(
  options: Partial<SocialSectionImplArgs> = {},
): SocialSectionImplArgs {
  return SocialSectionImplArgsSchema.parse(options);
}

export const TerminalSectionImplArgsSchema = z.object({
  type: z.literal("Terminal").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type TerminalSectionImplArgs = z.infer<
  typeof TerminalSectionImplArgsSchema
>;

export type TerminalSectionImplArgsInput = z.input<
  typeof TerminalSectionImplArgsSchema
>;

export function createTerminalSectionImplArgs(
  options: Partial<TerminalSectionImplArgs> = {},
): TerminalSectionImplArgs {
  return TerminalSectionImplArgsSchema.parse(options);
}

export const IFrameSectionImplArgsSchema = z.object({
  type: z.literal("IFrame").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type IFrameSectionImplArgs = z.infer<typeof IFrameSectionImplArgsSchema>;

export type IFrameSectionImplArgsInput = z.input<
  typeof IFrameSectionImplArgsSchema
>;

export function createIFrameSectionImplArgs(
  options: Partial<IFrameSectionImplArgs> = {},
): IFrameSectionImplArgs {
  return IFrameSectionImplArgsSchema.parse(options);
}

export const ChatSectionImplArgsSchema = z.object({
  type: z.literal("Chat").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  managed: z.boolean().optional(),
  engineConfigId: z.union([IDSchema, z.null()]).optional(),
  agentProfileId: z.union([IDSchema, z.null()]).optional(),
  chatId: z.union([IDSchema, z.null()]).optional(),
  thinking: z.boolean().optional(),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .optional(),
  inputText: z.string().optional(),
  waitingForResponse: z.boolean().optional(),
  toolCallArguments: z.record(z.string(), z.string()).optional(),
  activeBranchId: z.union([IDSchema, z.null()]).optional(),
  branches: z.record(IDSchema, ChatSectionBranchSchema).optional(),
});

export type ChatSectionImplArgs = z.infer<typeof ChatSectionImplArgsSchema>;

export type ChatSectionImplArgsInput = z.input<
  typeof ChatSectionImplArgsSchema
>;

export function createChatSectionImplArgs(
  options: Partial<ChatSectionImplArgs> = {},
): ChatSectionImplArgs {
  return ChatSectionImplArgsSchema.parse(options);
}

export const BrowserSectionImplArgsSchema = z.object({
  type: z.literal("Browser").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  folder: z.string().optional(),
  hideColumn: z.boolean().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  typesColumnWidth: z.union([z.number(), z.null()]).optional(),
  viewMode: z.enum(BrowserAreaViewModeEnum).optional(),
  savedSearches: z.array(BrowserSavedSearchSchema).optional(),
});

export type BrowserSectionImplArgs = z.infer<
  typeof BrowserSectionImplArgsSchema
>;

export type BrowserSectionImplArgsInput = z.input<
  typeof BrowserSectionImplArgsSchema
>;

export function createBrowserSectionImplArgs(
  options: Partial<BrowserSectionImplArgs> = {},
): BrowserSectionImplArgs {
  return BrowserSectionImplArgsSchema.parse(options);
}

export const PluginSectionImplArgsSchema = z.object({
  type: z.literal("Plugin").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  pluginId: z.string().optional(),
  kind: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
  schemaVersion: z.union([z.int(), z.null()]).optional(),
});

export type PluginSectionImplArgs = z.infer<typeof PluginSectionImplArgsSchema>;

export type PluginSectionImplArgsInput = z.input<
  typeof PluginSectionImplArgsSchema
>;

export function createPluginSectionImplArgs(
  options: Partial<PluginSectionImplArgs> = {},
): PluginSectionImplArgs {
  return PluginSectionImplArgsSchema.parse(options);
}

export const BaseSectionImplArgsUnionSchema = z.union([
  CallableSectionImplArgsSchema,
  DictSectionImplArgsSchema,
  ListRootSectionImplArgsSchema,
  GroupSectionImplArgsSchema,
  ImageSectionImplArgsSchema,
  ChartSectionImplArgsSchema,
  DrawSectionImplArgsSchema,
  TextBlockSectionImplArgsSchema,
  PromptSectionImplArgsSchema,
  MetaControlSectionImplArgsSchema,
  SocialSectionImplArgsSchema,
  GlobalVariablesSectionImplArgsSchema,
  CodeSectionImplArgsSchema,
  GenPythonCodeSectionImplArgsSchema,
  GenPythonMetadataSectionImplArgsSchema,
  TerminalSectionImplArgsSchema,
  IFrameSectionImplArgsSchema,
  ChatSectionImplArgsSchema,
  BrowserSectionImplArgsSchema,
  PluginSectionImplArgsSchema,
]);

export type BaseSectionImplArgsUnion = z.infer<
  typeof BaseSectionImplArgsUnionSchema
>;

export type BaseSectionImplArgsUnionInput = z.input<
  typeof BaseSectionImplArgsUnionSchema
>;

export const BaseSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplArgsSchema,
    DictSectionImplArgsSchema,
    ListRootSectionImplArgsSchema,
    GroupSectionImplArgsSchema,
    ImageSectionImplArgsSchema,
    ChartSectionImplArgsSchema,
    DrawSectionImplArgsSchema,
    TextBlockSectionImplArgsSchema,
    PromptSectionImplArgsSchema,
    MetaControlSectionImplArgsSchema,
    SocialSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
    GenPythonMetadataSectionImplArgsSchema,
    TerminalSectionImplArgsSchema,
    IFrameSectionImplArgsSchema,
    ChatSectionImplArgsSchema,
    BrowserSectionImplArgsSchema,
    PluginSectionImplArgsSchema,
  ]);

export type BaseSectionImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseSectionImplArgsUnionWithDiscriminatorSchema
>;

export type BaseSectionImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseSectionImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseSectionImplArgsUnionWithDiscriminator(
  options: Partial<BaseSectionImplArgsUnionWithDiscriminator> = {},
): BaseSectionImplArgsUnionWithDiscriminator {
  return BaseSectionImplArgsUnionWithDiscriminatorSchema.parse(options);
}

export const BaseSectionImplUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "type",
  [
    CallableSectionImplSchema,
    DictSectionImplSchema,
    ListRootSectionImplSchema,
    GroupSectionImplSchema,
    ImageSectionImplSchema,
    ChartSectionImplSchema,
    DrawSectionImplSchema,
    TextBlockSectionImplSchema,
    PromptSectionImplSchema,
    MetaControlSectionImplSchema,
    SocialSectionImplSchema,
    GlobalVariablesSectionImplSchema,
    CodeSectionImplSchema,
    GenPythonCodeSectionImplSchema,
    GenPythonMetadataSectionImplSchema,
    TerminalSectionImplSchema,
    IFrameSectionImplSchema,
    ChatSectionImplSchema,
    BrowserSectionImplSchema,
    PluginSectionImplSchema,
  ],
);

export type BaseSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseSectionImplUnionWithDiscriminatorSchema
>;

export type BaseSectionImplUnionWithDiscriminatorInput = z.input<
  typeof BaseSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseSectionImplUnionWithDiscriminator(
  options: Partial<BaseSectionImplUnionWithDiscriminator> = {},
): BaseSectionImplUnionWithDiscriminator {
  return BaseSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const BaseSectionWithParamsImplArgsUnionSchema = z.union([
  CallableSectionImplArgsSchema,
  DictSectionImplArgsSchema,
  GlobalVariablesSectionImplArgsSchema,
]);

export type BaseSectionWithParamsImplArgsUnion = z.infer<
  typeof BaseSectionWithParamsImplArgsUnionSchema
>;

export type BaseSectionWithParamsImplArgsUnionInput = z.input<
  typeof BaseSectionWithParamsImplArgsUnionSchema
>;

export const BaseSectionWithParamsImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplArgsSchema,
    DictSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
  ]);

export type BaseSectionWithParamsImplArgsUnionWithDiscriminator = z.infer<
  typeof BaseSectionWithParamsImplArgsUnionWithDiscriminatorSchema
>;

export type BaseSectionWithParamsImplArgsUnionWithDiscriminatorInput = z.input<
  typeof BaseSectionWithParamsImplArgsUnionWithDiscriminatorSchema
>;

export function createBaseSectionWithParamsImplArgsUnionWithDiscriminator(
  options: Partial<BaseSectionWithParamsImplArgsUnionWithDiscriminator> = {},
): BaseSectionWithParamsImplArgsUnionWithDiscriminator {
  return BaseSectionWithParamsImplArgsUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const BaseSectionWithParamsImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplSchema,
    DictSectionImplSchema,
    GlobalVariablesSectionImplSchema,
  ]);

export type BaseSectionWithParamsImplUnionWithDiscriminator = z.infer<
  typeof BaseSectionWithParamsImplUnionWithDiscriminatorSchema
>;

export type BaseSectionWithParamsImplUnionWithDiscriminatorInput = z.input<
  typeof BaseSectionWithParamsImplUnionWithDiscriminatorSchema
>;

export function createBaseSectionWithParamsImplUnionWithDiscriminator(
  options: Partial<BaseSectionWithParamsImplUnionWithDiscriminator> = {},
): BaseSectionWithParamsImplUnionWithDiscriminator {
  return BaseSectionWithParamsImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeLanguageKeySchema = z.union([
  z.enum(CodeLanguageEnum),
  z.string(),
]);

export type CodeLanguageKey = z.infer<typeof CodeLanguageKeySchema>;

export type CodeLanguageKeyInput = z.input<typeof CodeLanguageKeySchema>;

export const RealtimeUIChangeContentSchema = z.object({
  projectConfigId: IDSchema,
  dependencyKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  value: z.union([
    LiteralDependencyValueSchema,
    FileReadDependencyValueSchema,
    BinaryDependencyValueSchema,
  ]),
});

export type RealtimeUIChangeContent = z.infer<
  typeof RealtimeUIChangeContentSchema
>;

export type RealtimeUIChangeContentInput = z.input<
  typeof RealtimeUIChangeContentSchema
>;

export function createRealtimeUIChangeContent(
  options: Partial<RealtimeUIChangeContent> = {},
): RealtimeUIChangeContent {
  return RealtimeUIChangeContentSchema.parse(options);
}

export const WebsocketMsgRealtimeUIChangeSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RealtimeUIChangeContentSchema,
  messageType: z
    .literal("RealtimeUIChange")
    .default(WebsocketMsgTypeForBackendEnum.RealtimeUIChange),
});

export type WebsocketMsgRealtimeUIChange = z.infer<
  typeof WebsocketMsgRealtimeUIChangeSchema
>;

export type WebsocketMsgRealtimeUIChangeInput = z.input<
  typeof WebsocketMsgRealtimeUIChangeSchema
>;

export function createWebsocketMsgRealtimeUIChange(
  options: Partial<WebsocketMsgRealtimeUIChange> = {},
): WebsocketMsgRealtimeUIChange {
  return WebsocketMsgRealtimeUIChangeSchema.parse(options);
}

export const DependencyEventSchema = z.object({
  dependencyKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  payload: z
    .union([
      z.discriminatedUnion("type", [
        LiteralDependencyValueSchema,
        FileReadDependencyValueSchema,
        BinaryDependencyValueSchema,
      ]),
      z.null(),
    ])
    .default(null),
  timestampMs: z.int(),
});

export type DependencyEvent = z.infer<typeof DependencyEventSchema>;

export type DependencyEventInput = z.input<typeof DependencyEventSchema>;

export function createDependencyEvent(
  options: Partial<DependencyEvent> = {},
): DependencyEvent {
  return DependencyEventSchema.parse(options);
}

export const RealtimeDependencyEventContentSchema = z.object({
  projectConfigId: IDSchema,
  dependencyEvent: DependencyEventSchema,
});

export type RealtimeDependencyEventContent = z.infer<
  typeof RealtimeDependencyEventContentSchema
>;

export type RealtimeDependencyEventContentInput = z.input<
  typeof RealtimeDependencyEventContentSchema
>;

export function createRealtimeDependencyEventContent(
  options: Partial<RealtimeDependencyEventContent> = {},
): RealtimeDependencyEventContent {
  return RealtimeDependencyEventContentSchema.parse(options);
}

export const WebsocketMsgRealtimeDependencyEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RealtimeDependencyEventContentSchema,
  messageType: z
    .literal("RealtimeDependencyEvent")
    .default(WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent),
});

export type WebsocketMsgRealtimeDependencyEvent = z.infer<
  typeof WebsocketMsgRealtimeDependencyEventSchema
>;

export type WebsocketMsgRealtimeDependencyEventInput = z.input<
  typeof WebsocketMsgRealtimeDependencyEventSchema
>;

export function createWebsocketMsgRealtimeDependencyEvent(
  options: Partial<WebsocketMsgRealtimeDependencyEvent> = {},
): WebsocketMsgRealtimeDependencyEvent {
  return WebsocketMsgRealtimeDependencyEventSchema.parse(options);
}

export const WebsocketMsgCurrentAddressUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.string(),
  messageType: z
    .literal("CurrentAddressUpdate")
    .default(WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate),
});

export type WebsocketMsgCurrentAddressUpdate = z.infer<
  typeof WebsocketMsgCurrentAddressUpdateSchema
>;

export type WebsocketMsgCurrentAddressUpdateInput = z.input<
  typeof WebsocketMsgCurrentAddressUpdateSchema
>;

export function createWebsocketMsgCurrentAddressUpdate(
  options: Partial<WebsocketMsgCurrentAddressUpdate> = {},
): WebsocketMsgCurrentAddressUpdate {
  return WebsocketMsgCurrentAddressUpdateSchema.parse(options);
}

export const BackendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgRealtimeUIChangeSchema,
  WebsocketMsgRealtimeDependencyEventSchema,
  WebsocketMsgCurrentAddressUpdateSchema,
]);

export type BackendWebsocketMsgUnion = z.infer<
  typeof BackendWebsocketMsgUnionSchema
>;

export type BackendWebsocketMsgUnionInput = z.input<
  typeof BackendWebsocketMsgUnionSchema
>;

export const BackendWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgRealtimeUIChangeSchema,
    WebsocketMsgRealtimeDependencyEventSchema,
    WebsocketMsgCurrentAddressUpdateSchema,
  ]);

export type BackendWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof BackendWebsocketMsgUnionWithDiscriminatorSchema
>;

export type BackendWebsocketMsgUnionWithDiscriminatorInput = z.input<
  typeof BackendWebsocketMsgUnionWithDiscriminatorSchema
>;

export function createBackendWebsocketMsgUnionWithDiscriminator(
  options: Partial<BackendWebsocketMsgUnionWithDiscriminator> = {},
): BackendWebsocketMsgUnionWithDiscriminator {
  return BackendWebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const WebsocketConnectionInfoSchema = z.object({
  id: z.string(),
  connectionType: z.enum(WebsocketConnectionTypeEnum),
  currentAddress: z.union([z.string(), z.null()]),
  shareSessionId: z.union([z.string(), z.null()]).default(null),
});

export type WebsocketConnectionInfo = z.infer<
  typeof WebsocketConnectionInfoSchema
>;

export type WebsocketConnectionInfoInput = z.input<
  typeof WebsocketConnectionInfoSchema
>;

export function createWebsocketConnectionInfo(
  options: Partial<WebsocketConnectionInfo> = {},
): WebsocketConnectionInfo {
  return WebsocketConnectionInfoSchema.parse(options);
}

export const WebsocketMsgAllConnectionsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.array(WebsocketConnectionInfoSchema),
  messageType: z
    .literal("AllConnections")
    .default(WebsocketMsgTypeForFrontendEnum.AllConnections),
});

export type WebsocketMsgAllConnections = z.infer<
  typeof WebsocketMsgAllConnectionsSchema
>;

export type WebsocketMsgAllConnectionsInput = z.input<
  typeof WebsocketMsgAllConnectionsSchema
>;

export function createWebsocketMsgAllConnections(
  options: Partial<WebsocketMsgAllConnections> = {},
): WebsocketMsgAllConnections {
  return WebsocketMsgAllConnectionsSchema.parse(options);
}

export const SettaNotificationSchema = z.object({
  id: IDSchema.default(create_new_id),
  projectConfigId: IDSchema.default(
    () => "NOTIFICATION_IS_FOR_ALL_PROJECTS" as const,
  ),
  type: z
    .enum(SettaNotificationTypeEnum)
    .default(SettaNotificationTypeEnum.info),
  message: z.string(),
  temporary: z.boolean().default(true),
  timestamp: z.iso.datetime().default(get_now_timestamp),
  metadata: z.record(z.string(), z.any()).default({}),
  read_status: z.boolean().default(false),
});

export type SettaNotification = z.infer<typeof SettaNotificationSchema>;

export type SettaNotificationInput = z.input<typeof SettaNotificationSchema>;

export function createSettaNotification(
  options: Partial<SettaNotification> = {},
): SettaNotification {
  return SettaNotificationSchema.parse(options);
}

export const WebsocketMsgNotificationSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaNotificationSchema,
  messageType: z
    .literal("Notification")
    .default(WebsocketMsgTypeForFrontendEnum.Notification),
});

export type WebsocketMsgNotification = z.infer<
  typeof WebsocketMsgNotificationSchema
>;

export type WebsocketMsgNotificationInput = z.input<
  typeof WebsocketMsgNotificationSchema
>;

export function createWebsocketMsgNotification(
  options: Partial<WebsocketMsgNotification> = {},
): WebsocketMsgNotification {
  return WebsocketMsgNotificationSchema.parse(options);
}

export const SettaBackendLogEventSchema = z.object({
  id: IDSchema.default(create_new_id),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
  severity: z
    .enum(SettaBackendLogEventSeverityEnum)
    .default(SettaBackendLogEventSeverityEnum.info),
  message: z.string(),
  timestamp: z.iso.datetime().default(get_now_timestamp),
});

export type SettaBackendLogEvent = z.infer<typeof SettaBackendLogEventSchema>;

export type SettaBackendLogEventInput = z.input<
  typeof SettaBackendLogEventSchema
>;

export function createSettaBackendLogEvent(
  options: Partial<SettaBackendLogEvent> = {},
): SettaBackendLogEvent {
  return SettaBackendLogEventSchema.parse(options);
}

export const WebsocketMsgBackendLogEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaBackendLogEventSchema,
  messageType: z
    .literal("BackendLogEvent")
    .default(WebsocketMsgTypeForFrontendEnum.BackendLogEvent),
});

export type WebsocketMsgBackendLogEvent = z.infer<
  typeof WebsocketMsgBackendLogEventSchema
>;

export type WebsocketMsgBackendLogEventInput = z.input<
  typeof WebsocketMsgBackendLogEventSchema
>;

export function createWebsocketMsgBackendLogEvent(
  options: Partial<WebsocketMsgBackendLogEvent> = {},
): WebsocketMsgBackendLogEvent {
  return WebsocketMsgBackendLogEventSchema.parse(options);
}

export const LLMStreamingResponseSchema = z.object({
  chatId: IDSchema,
  chunk: z.union([
    MessageStartEventSchema,
    MessageDeltaEventSchema,
    ToolCallDeltaEventSchema,
    ToolResultEventSchema,
    ToolArgumentPreviewDeltaEventSchema,
    MessageStopEventSchema,
    MessageFinalizedEventSchema,
  ]),
  sectionId: z.union([IDSchema, z.null()]).default(null),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type LLMStreamingResponse = z.infer<typeof LLMStreamingResponseSchema>;

export type LLMStreamingResponseInput = z.input<
  typeof LLMStreamingResponseSchema
>;

export function createLLMStreamingResponse(
  options: Partial<LLMStreamingResponse> = {},
): LLMStreamingResponse {
  return LLMStreamingResponseSchema.parse(options);
}

export const WebsocketMsgLLMStreamingResponseSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: LLMStreamingResponseSchema,
  messageType: z
    .literal("LLMStreamingResponse")
    .default(WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse),
});

export type WebsocketMsgLLMStreamingResponse = z.infer<
  typeof WebsocketMsgLLMStreamingResponseSchema
>;

export type WebsocketMsgLLMStreamingResponseInput = z.input<
  typeof WebsocketMsgLLMStreamingResponseSchema
>;

export function createWebsocketMsgLLMStreamingResponse(
  options: Partial<WebsocketMsgLLMStreamingResponse> = {},
): WebsocketMsgLLMStreamingResponse {
  return WebsocketMsgLLMStreamingResponseSchema.parse(options);
}

export const SettaSectionTypeErrorsSchema = z.object({
  callable: z.array(z.string()).default([]),
  params: z.record(IDSchema, z.array(z.string())).default({}),
});

export type SettaSectionTypeErrors = z.infer<
  typeof SettaSectionTypeErrorsSchema
>;

export type SettaSectionTypeErrorsInput = z.input<
  typeof SettaSectionTypeErrorsSchema
>;

export function createSettaSectionTypeErrors(
  options: Partial<SettaSectionTypeErrors> = {},
): SettaSectionTypeErrors {
  return SettaSectionTypeErrorsSchema.parse(options);
}

export const SettaProjectConfigDiagnosticsSchema = z.object({
  projectConfigId: IDSchema,
  errors: z.record(IDSchema, SettaSectionTypeErrorsSchema).default({}),
  isGenCode: z.boolean(),
});

export type SettaProjectConfigDiagnostics = z.infer<
  typeof SettaProjectConfigDiagnosticsSchema
>;

export type SettaProjectConfigDiagnosticsInput = z.input<
  typeof SettaProjectConfigDiagnosticsSchema
>;

export function createSettaProjectConfigDiagnostics(
  options: Partial<SettaProjectConfigDiagnostics> = {},
): SettaProjectConfigDiagnostics {
  return SettaProjectConfigDiagnosticsSchema.parse(options);
}

export const SettaLspDiagnosticPositionSchema = z.object({
  line: z.int(),
  character: z.int(),
});

export type SettaLspDiagnosticPosition = z.infer<
  typeof SettaLspDiagnosticPositionSchema
>;

export type SettaLspDiagnosticPositionInput = z.input<
  typeof SettaLspDiagnosticPositionSchema
>;

export function createSettaLspDiagnosticPosition(
  options: Partial<SettaLspDiagnosticPosition> = {},
): SettaLspDiagnosticPosition {
  return SettaLspDiagnosticPositionSchema.parse(options);
}

export const SettaLspDiagnosticRangeSchema = z.object({
  start: SettaLspDiagnosticPositionSchema,
  end: SettaLspDiagnosticPositionSchema,
});

export type SettaLspDiagnosticRange = z.infer<
  typeof SettaLspDiagnosticRangeSchema
>;

export type SettaLspDiagnosticRangeInput = z.input<
  typeof SettaLspDiagnosticRangeSchema
>;

export function createSettaLspDiagnosticRange(
  options: Partial<SettaLspDiagnosticRange> = {},
): SettaLspDiagnosticRange {
  return SettaLspDiagnosticRangeSchema.parse(options);
}

export const SettaLspDiagnosticSchema = z.object({
  message: z.string(),
  severity: z.union([z.int(), z.null()]).default(null),
  code: z.union([z.string(), z.int(), z.null()]).default(null),
  source: z.union([z.string(), z.null()]).default(null),
  range: SettaLspDiagnosticRangeSchema,
  uri: z.union([z.string(), z.null()]).default(null),
});

export type SettaLspDiagnostic = z.infer<typeof SettaLspDiagnosticSchema>;

export type SettaLspDiagnosticInput = z.input<typeof SettaLspDiagnosticSchema>;

export function createSettaLspDiagnostic(
  options: Partial<SettaLspDiagnostic> = {},
): SettaLspDiagnostic {
  return SettaLspDiagnosticSchema.parse(options);
}

export const SettaLspDiagnosticsPayloadSchema = z.object({
  projectConfigId: IDSchema,
  genCode: SettaProjectConfigDiagnosticsSchema,
  codeSections: z
    .record(IDSchema, z.array(SettaLspDiagnosticSchema))
    .default({}),
  unmappedGenCode: z.array(SettaLspDiagnosticSchema).default([]),
});

export type SettaLspDiagnosticsPayload = z.infer<
  typeof SettaLspDiagnosticsPayloadSchema
>;

export type SettaLspDiagnosticsPayloadInput = z.input<
  typeof SettaLspDiagnosticsPayloadSchema
>;

export function createSettaLspDiagnosticsPayload(
  options: Partial<SettaLspDiagnosticsPayload> = {},
): SettaLspDiagnosticsPayload {
  return SettaLspDiagnosticsPayloadSchema.parse(options);
}

export const WebsocketMsgLSPDiagnosticsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaLspDiagnosticsPayloadSchema,
  messageType: z
    .literal("LSPDiagnostics")
    .default(WebsocketMsgTypeForFrontendEnum.LSPDiagnostics),
});

export type WebsocketMsgLSPDiagnostics = z.infer<
  typeof WebsocketMsgLSPDiagnosticsSchema
>;

export type WebsocketMsgLSPDiagnosticsInput = z.input<
  typeof WebsocketMsgLSPDiagnosticsSchema
>;

export function createWebsocketMsgLSPDiagnostics(
  options: Partial<WebsocketMsgLSPDiagnostics> = {},
): WebsocketMsgLSPDiagnostics {
  return WebsocketMsgLSPDiagnosticsSchema.parse(options);
}

export const SettaProjectNameValidationErrorsSchema = z.object({
  projectConfigId: IDSchema,
  projectErrors: z.array(z.string()).default([]),
  sectionErrors: z.record(IDSchema, z.array(z.string())).default({}),
  paramErrors: z.record(IDSchema, z.array(z.string())).default({}),
});

export type SettaProjectNameValidationErrors = z.infer<
  typeof SettaProjectNameValidationErrorsSchema
>;

export type SettaProjectNameValidationErrorsInput = z.input<
  typeof SettaProjectNameValidationErrorsSchema
>;

export function createSettaProjectNameValidationErrors(
  options: Partial<SettaProjectNameValidationErrors> = {},
): SettaProjectNameValidationErrors {
  return SettaProjectNameValidationErrorsSchema.parse(options);
}

export const WebsocketMsgNameValidationErrorsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaProjectNameValidationErrorsSchema,
  messageType: z
    .literal("NameValidationErrors")
    .default(WebsocketMsgTypeForFrontendEnum.NameValidationErrors),
});

export type WebsocketMsgNameValidationErrors = z.infer<
  typeof WebsocketMsgNameValidationErrorsSchema
>;

export type WebsocketMsgNameValidationErrorsInput = z.input<
  typeof WebsocketMsgNameValidationErrorsSchema
>;

export function createWebsocketMsgNameValidationErrors(
  options: Partial<WebsocketMsgNameValidationErrors> = {},
): WebsocketMsgNameValidationErrors {
  return WebsocketMsgNameValidationErrorsSchema.parse(options);
}

export const RenameReferenceChangedValueSchema = z.object({
  depKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  newValue: z.string(),
});

export type RenameReferenceChangedValue = z.infer<
  typeof RenameReferenceChangedValueSchema
>;

export type RenameReferenceChangedValueInput = z.input<
  typeof RenameReferenceChangedValueSchema
>;

export function createRenameReferenceChangedValue(
  options: Partial<RenameReferenceChangedValue> = {},
): RenameReferenceChangedValue {
  return RenameReferenceChangedValueSchema.parse(options);
}

export const RenameRefactorBroadcastContentSchema = z.object({
  projectConfigId: IDSchema,
  frontendOpId: z.string(),
  renameMode: z.enum(RenameRefactorModeEnum),
  changedNodeValues: z.array(RenameReferenceChangedValueSchema),
});

export type RenameRefactorBroadcastContent = z.infer<
  typeof RenameRefactorBroadcastContentSchema
>;

export type RenameRefactorBroadcastContentInput = z.input<
  typeof RenameRefactorBroadcastContentSchema
>;

export function createRenameRefactorBroadcastContent(
  options: Partial<RenameRefactorBroadcastContent> = {},
): RenameRefactorBroadcastContent {
  return RenameRefactorBroadcastContentSchema.parse(options);
}

export const WebsocketMsgReturnRenameRefactorResultsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RenameRefactorBroadcastContentSchema,
  messageType: z
    .literal("ReturnRenameRefactorResults")
    .default(WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults),
});

export type WebsocketMsgReturnRenameRefactorResults = z.infer<
  typeof WebsocketMsgReturnRenameRefactorResultsSchema
>;

export type WebsocketMsgReturnRenameRefactorResultsInput = z.input<
  typeof WebsocketMsgReturnRenameRefactorResultsSchema
>;

export function createWebsocketMsgReturnRenameRefactorResults(
  options: Partial<WebsocketMsgReturnRenameRefactorResults> = {},
): WebsocketMsgReturnRenameRefactorResults {
  return WebsocketMsgReturnRenameRefactorResultsSchema.parse(options);
}

export const ViewportSchema = z.object({
  x: z.number().default(0.0),
  y: z.number().default(0.0),
  zoom: z.number().default(1.0),
});

export type Viewport = z.infer<typeof ViewportSchema>;

export type ViewportInput = z.input<typeof ViewportSchema>;

export function createViewport(options: Partial<Viewport> = {}): Viewport {
  return ViewportSchema.parse(options);
}

export const TopLevelSectionLayoutSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zIndex: z.int().default(0),
  w: z.union([z.number(), z.null()]).default(null),
  h: z.union([z.number(), z.null()]).default(null),
});

export type TopLevelSectionLayout = z.infer<typeof TopLevelSectionLayoutSchema>;

export type TopLevelSectionLayoutInput = z.input<
  typeof TopLevelSectionLayoutSchema
>;

export function createTopLevelSectionLayout(
  options: Partial<TopLevelSectionLayout> = {},
): TopLevelSectionLayout {
  return TopLevelSectionLayoutSchema.parse(options);
}

export const ViewModeConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  sortIndex: z.int().default(0),
  isUserFacing: z.boolean().default(false),
  isTab: z.boolean().default(false),
  visibilityBySectionId: z.record(IDSchema, z.boolean()).default({}),
  viewport: z.union([ViewportSchema, z.null()]).default(createViewport),
  viewportInitialized: z.boolean().default(false),
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema).default({}),
});

export type ViewModeConfig = z.infer<typeof ViewModeConfigSchema>;

export type ViewModeConfigInput = z.input<typeof ViewModeConfigSchema>;

export function createViewModeConfig(
  options: Partial<ViewModeConfig> = {},
): ViewModeConfig {
  return ViewModeConfigSchema.parse(options);
}

export const SectionTypeCodegenPolicySchema = z.object({
  mode: z.enum(SectionCodegenModeEnum).default(SectionCodegenModeEnum.inherit),
  representation: z
    .enum(SectionRepresentationModeEnum)
    .default(SectionRepresentationModeEnum.expression),
});

export type SectionTypeCodegenPolicy = z.infer<
  typeof SectionTypeCodegenPolicySchema
>;

export type SectionTypeCodegenPolicyInput = z.input<
  typeof SectionTypeCodegenPolicySchema
>;

export function createSectionTypeCodegenPolicy(
  options: Partial<SectionTypeCodegenPolicy> = {},
): SectionTypeCodegenPolicy {
  return SectionTypeCodegenPolicySchema.parse(options);
}

export const SectionCodegenOverrideSchema = z.object({
  mode: z.enum(SectionCodegenModeEnum).default(SectionCodegenModeEnum.inherit),
  representation: z
    .enum(SectionRepresentationModeEnum)
    .default(SectionRepresentationModeEnum.expression),
});

export type SectionCodegenOverride = z.infer<
  typeof SectionCodegenOverrideSchema
>;

export type SectionCodegenOverrideInput = z.input<
  typeof SectionCodegenOverrideSchema
>;

export function createSectionCodegenOverride(
  options: Partial<SectionCodegenOverride> = {},
): SectionCodegenOverride {
  return SectionCodegenOverrideSchema.parse(options);
}

export const SectionCodegenPolicySchema = z.object({
  allowlist: z
    .union([z.array(z.enum(SectionTypeEnum)), z.null()])
    .default(() => [
      SectionTypeEnum.Callable,
      SectionTypeEnum.Dict,
      SectionTypeEnum.ListRoot,
      SectionTypeEnum.Group,
      SectionTypeEnum.GlobalVariables,
      SectionTypeEnum.TextBlock,
      SectionTypeEnum.Draw,
      SectionTypeEnum.MetaControl,
    ]),
  metaControlAllowlist: z
    .union([z.array(z.enum(CodeObjTypeEnum)), z.null()])
    .default(() => [
      CodeObjTypeEnum.CodeParam,
      CodeObjTypeEnum.TextParam,
      CodeObjTypeEnum.TextAreaParam,
      CodeObjTypeEnum.SliderParam,
      CodeObjTypeEnum.RotaryParam,
      CodeObjTypeEnum.SwitchParam,
      CodeObjTypeEnum.ColorPickerParam,
      CodeObjTypeEnum.DropdownParam,
      CodeObjTypeEnum.PasswordParam,
      CodeObjTypeEnum.ButtonParam,
      CodeObjTypeEnum.DropzoneParam,
    ]),
  exclude: z.array(IDSchema).default([]),
  typePolicies: z
    .record(z.enum(SectionTypeEnum), SectionTypeCodegenPolicySchema)
    .default(() => ({
      Callable: createSectionTypeCodegenPolicy(),
      Dict: createSectionTypeCodegenPolicy(),
      ListRoot: createSectionTypeCodegenPolicy(),
      Group: createSectionTypeCodegenPolicy(),
      Image: createSectionTypeCodegenPolicy({
        representation: SectionRepresentationModeEnum.file_read,
      }),
      Chart: createSectionTypeCodegenPolicy(),
      Draw: createSectionTypeCodegenPolicy({
        representation: SectionRepresentationModeEnum.file_read,
      }),
      TextBlock: createSectionTypeCodegenPolicy(),
      Prompt: createSectionTypeCodegenPolicy(),
      MetaControl: createSectionTypeCodegenPolicy(),
      Social: createSectionTypeCodegenPolicy(),
      GlobalVariables: createSectionTypeCodegenPolicy(),
      Code: createSectionTypeCodegenPolicy(),
      GenPythonCode: createSectionTypeCodegenPolicy(),
      GenPythonMetadata: createSectionTypeCodegenPolicy(),
      Terminal: createSectionTypeCodegenPolicy(),
      IFrame: createSectionTypeCodegenPolicy(),
      Chat: createSectionTypeCodegenPolicy({
        representation: SectionRepresentationModeEnum.file_read,
      }),
      Browser: createSectionTypeCodegenPolicy(),
      Plugin: createSectionTypeCodegenPolicy(),
    })),
  sectionOverrides: z
    .record(IDSchema, SectionCodegenOverrideSchema)
    .default({}),
});

export type SectionCodegenPolicy = z.infer<typeof SectionCodegenPolicySchema>;

export type SectionCodegenPolicyInput = z.input<
  typeof SectionCodegenPolicySchema
>;

export function createSectionCodegenPolicy(
  options: Partial<SectionCodegenPolicy> = {},
): SectionCodegenPolicy {
  return SectionCodegenPolicySchema.parse(options);
}

export const CodeObjTypeValuePolicySchema = z.object({
  representation: z
    .enum(CodeObjValueRepresentationModeEnum)
    .default(CodeObjValueRepresentationModeEnum.expression),
});

export type CodeObjTypeValuePolicy = z.infer<
  typeof CodeObjTypeValuePolicySchema
>;

export type CodeObjTypeValuePolicyInput = z.input<
  typeof CodeObjTypeValuePolicySchema
>;

export function createCodeObjTypeValuePolicy(
  options: Partial<CodeObjTypeValuePolicy> = {},
): CodeObjTypeValuePolicy {
  return CodeObjTypeValuePolicySchema.parse(options);
}

export const CodeObjValueOverrideSchema = z.object({
  representation: z
    .enum(CodeObjValueRepresentationModeEnum)
    .default(CodeObjValueRepresentationModeEnum.expression),
});

export type CodeObjValueOverride = z.infer<typeof CodeObjValueOverrideSchema>;

export type CodeObjValueOverrideInput = z.input<
  typeof CodeObjValueOverrideSchema
>;

export function createCodeObjValueOverride(
  options: Partial<CodeObjValueOverride> = {},
): CodeObjValueOverride {
  return CodeObjValueOverrideSchema.parse(options);
}

export const CodeObjValuePolicySchema = z.object({
  typePolicies: z
    .record(z.enum(CodeObjTypeEnum), CodeObjTypeValuePolicySchema)
    .default(() => ({
      CodeCallable: createCodeObjTypeValuePolicy(),
      CodeParam: createCodeObjTypeValuePolicy(),
      TextParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      ButtonParam: createCodeObjTypeValuePolicy(),
      SliderParam: createCodeObjTypeValuePolicy(),
      RotaryParam: createCodeObjTypeValuePolicy(),
      SwitchParam: createCodeObjTypeValuePolicy(),
      ColorPickerParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      DropdownParam: createCodeObjTypeValuePolicy(),
      PasswordParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      TextAreaParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      DropzoneParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.file_path,
      }),
      NestedParam: createCodeObjTypeValuePolicy(),
    })),
  codeObjOverrides: z.record(IDSchema, CodeObjValueOverrideSchema).default({}),
});

export type CodeObjValuePolicy = z.infer<typeof CodeObjValuePolicySchema>;

export type CodeObjValuePolicyInput = z.input<typeof CodeObjValuePolicySchema>;

export function createCodeObjValuePolicy(
  options: Partial<CodeObjValuePolicy> = {},
): CodeObjValuePolicy {
  return CodeObjValuePolicySchema.parse(options);
}

export const ProjectCodegenPythonTargetSchema = z.object({
  language: z.literal("python").default(ProjectCodegenLanguageEnum.python),
  genCodePrefix: z.string().default("" as const),
  genCodeSuffix: z.string().default("state = SettaState()" as const),
  generateMetadata: z.boolean().default(false),
  sectionPolicy: SectionCodegenPolicySchema.default(createSectionCodegenPolicy),
  codeObjValuePolicy: CodeObjValuePolicySchema.default(
    createCodeObjValuePolicy,
  ),
});

export type ProjectCodegenPythonTarget = z.infer<
  typeof ProjectCodegenPythonTargetSchema
>;

export type ProjectCodegenPythonTargetInput = z.input<
  typeof ProjectCodegenPythonTargetSchema
>;

export function createProjectCodegenPythonTarget(
  options: Partial<ProjectCodegenPythonTarget> = {},
): ProjectCodegenPythonTarget {
  return ProjectCodegenPythonTargetSchema.parse(options);
}

export const ProjectCodegenPluginTargetSchema = z.object({
  language: z.string(),
  options: z.record(z.string(), z.any()).default({}),
});

export type ProjectCodegenPluginTarget = z.infer<
  typeof ProjectCodegenPluginTargetSchema
>;

export type ProjectCodegenPluginTargetInput = z.input<
  typeof ProjectCodegenPluginTargetSchema
>;

export function createProjectCodegenPluginTarget(
  options: Partial<ProjectCodegenPluginTarget> = {},
): ProjectCodegenPluginTarget {
  return ProjectCodegenPluginTargetSchema.parse(options);
}

export const EdgeSchema = z.object({
  id: IDSchema.default(create_new_id),
  sourceSectionId: IDSchema,
  sourceVariantId: IDSchema,
  sourcePortId: IDSchema,
  targetSectionId: IDSchema,
  targetVariantId: IDSchema,
  targetPortId: IDSchema,
  type: z.string().default("default" as const),
  label: z.union([z.string(), z.null()]).default(null),
  style: z
    .union([
      z.record(z.string(), z.union([z.string(), z.int(), z.number()])),
      z.null(),
    ])
    .default(null),
  animated: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.int().default(0),
  data: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  selected: z.boolean().default(false),
});

export type Edge = z.infer<typeof EdgeSchema>;

export type EdgeInput = z.input<typeof EdgeSchema>;

export function createEdge(options: Partial<Edge> = {}): Edge {
  return EdgeSchema.parse(options);
}

export const AgenticEdgeSchema = z.object({
  id: IDSchema.default(create_new_id),
  sourceSectionId: IDSchema,
  targetSectionId: IDSchema,
  kind: z.enum(AgenticEdgeKindEnum),
  contextMode: z
    .enum(AgenticEdgeContextModeEnum)
    .default(AgenticEdgeContextModeEnum.reference_only),
  style: z
    .union([
      z.record(z.string(), z.union([z.string(), z.int(), z.number()])),
      z.null(),
    ])
    .default(null),
  hidden: z.boolean().default(false),
  zIndex: z.int().default(0),
  selected: z.boolean().default(false),
});

export type AgenticEdge = z.infer<typeof AgenticEdgeSchema>;

export type AgenticEdgeInput = z.input<typeof AgenticEdgeSchema>;

export function createAgenticEdge(
  options: Partial<AgenticEdge> = {},
): AgenticEdge {
  return AgenticEdgeSchema.parse(options);
}

export const WatchCodeFolderSchema = z.object({
  path: z.string(),
  recursive: z.boolean().default(true),
});

export type WatchCodeFolder = z.infer<typeof WatchCodeFolderSchema>;

export type WatchCodeFolderInput = z.input<typeof WatchCodeFolderSchema>;

export function createWatchCodeFolder(
  options: Partial<WatchCodeFolder> = {},
): WatchCodeFolder {
  return WatchCodeFolderSchema.parse(options);
}

export const WatchCodeRegistryEntrySchema = z.object({
  callableName: z.string(),
  kind: z.enum(WatchCodeCallableKindEnum),
  signatureHash: z.string(),
  bodyHash: z.string(),
  sourcePath: z.string(),
  sectionIds: z.array(IDSchema).default([]),
  sectionsCount: z.int().default(0),
});

export type WatchCodeRegistryEntry = z.infer<
  typeof WatchCodeRegistryEntrySchema
>;

export type WatchCodeRegistryEntryInput = z.input<
  typeof WatchCodeRegistryEntrySchema
>;

export function createWatchCodeRegistryEntry(
  options: Partial<WatchCodeRegistryEntry> = {},
): WatchCodeRegistryEntry {
  return WatchCodeRegistryEntrySchema.parse(options);
}

export const ProjectConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  showParamDisplayNames: z.boolean().default(false),
  allowJsonSourceKeyEdits: z.boolean().default(true),
  previewImgColor: z
    .string()
    .default("bg-blue-500/60 dark:bg-blue-600/30" as const),
  viewport: z.union([ViewportSchema, z.null()]).default(createViewport),
  viewportInitialized: z.boolean().default(false),
  viewModes: z.record(IDSchema, ViewModeConfigSchema).default({}),
  activeViewModeId: z.union([IDSchema, z.null()]).default(null),
  isEditingViewMode: z.boolean().default(false),
  codegenTargets: z
    .array(
      z.union([
        ProjectCodegenPythonTargetSchema,
        ProjectCodegenPluginTargetSchema,
      ]),
    )
    .default(() => [createProjectCodegenPythonTarget()]),
  entryCodeBlockId: z.union([IDSchema, z.null()]).default(null),
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema).default({}),
  sectionVariantMap: z.record(IDSchema, IDSchema).default({}),
  activeIds: z.array(IDSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  agenticEdges: z.array(AgenticEdgeSchema).default([]),
  watchCodeEnabled: z.boolean().default(false),
  watchCodeFolders: z.array(WatchCodeFolderSchema).default([]),
  watchCodeFiles: z.array(z.string()).default([]),
  watchCodeRegistry: z
    .record(z.string(), WatchCodeRegistryEntrySchema)
    .default({}),
  watchCodeBaselineByPath: z
    .record(z.string(), z.array(z.string()))
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export type ProjectConfigInput = z.input<typeof ProjectConfigSchema>;

export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return ProjectConfigSchema.parse(options);
}

export const SingletonSectionsSchema = z.object({
  GlobalVariables: z.union([IDSchema, z.null()]).default(null),
  GenPythonCode: z.union([IDSchema, z.null()]).default(null),
  GenPythonMetadata: z.union([IDSchema, z.null()]).default(null),
});

export type SingletonSections = z.infer<typeof SingletonSectionsSchema>;

export type SingletonSectionsInput = z.input<typeof SingletonSectionsSchema>;

export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return SingletonSectionsSchema.parse(options);
}

export const ShownParamIdDetailsSchema = z.object({
  requiredParamIdsToPaths: z.record(IDSchema, z.array(IDSchema)).default({}),
  topLevelParamIds: z.array(IDSchema).default([]),
});

export type ShownParamIdDetails = z.infer<typeof ShownParamIdDetailsSchema>;

export type ShownParamIdDetailsInput = z.input<
  typeof ShownParamIdDetailsSchema
>;

export function createShownParamIdDetails(
  options: Partial<ShownParamIdDetails> = {},
): ShownParamIdDetails {
  return ShownParamIdDetailsSchema.parse(options);
}

export const ShownParamIdsSchema = z.object({
  pinned: ShownParamIdDetailsSchema.default(createShownParamIdDetails),
  unpinned: ShownParamIdDetailsSchema.default(createShownParamIdDetails),
});

export type ShownParamIds = z.infer<typeof ShownParamIdsSchema>;

export type ShownParamIdsInput = z.input<typeof ShownParamIdsSchema>;

export function createShownParamIds(
  options: Partial<ShownParamIds> = {},
): ShownParamIds {
  return ShownParamIdsSchema.parse(options);
}

export const ProjectStateSingleConfigSchema = z.object({
  sections: z.record(IDSchema, CoreSchema).default({}),
  sectionImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        PromptSectionImplSchema,
        MetaControlSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        GenPythonMetadataSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
        PluginSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(IDSchema, VariantSchema).default({}),
  codeObjs: z.record(IDSchema, CoreSchema).default({}),
  codeObjImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        ButtonParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        RotaryParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        TextAreaParamCodeObjImplSchema,
        DropzoneParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(IDSchema, VariantSchema).default({}),
  projectConfig: ProjectConfigSchema,
  singletonSections: SingletonSectionsSchema.default(createSingletonSections),
  parentSectionMap: z
    .record(IDSchema, z.union([IDSchema, z.null()]))
    .default({}),
  shownParamIds: z.record(IDSchema, ShownParamIdsSchema).default({}),
  requiredDecodedImages: z.array(z.string()).default([]),
  genCodeBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type ProjectStateSingleConfig = z.infer<
  typeof ProjectStateSingleConfigSchema
>;

export type ProjectStateSingleConfigInput = z.input<
  typeof ProjectStateSingleConfigSchema
>;

export function createProjectStateSingleConfig(
  options: Partial<ProjectStateSingleConfig> = {},
): ProjectStateSingleConfig {
  return ProjectStateSingleConfigSchema.parse(options);
}

export const ProjectStateSingleConfigWithCompletedOpIdsSchema = z.object({
  projectState: ProjectStateSingleConfigSchema,
  completedOpIds: z.array(z.string()),
  pendingOpIds: z.array(z.string()),
});

export type ProjectStateSingleConfigWithCompletedOpIds = z.infer<
  typeof ProjectStateSingleConfigWithCompletedOpIdsSchema
>;

export type ProjectStateSingleConfigWithCompletedOpIdsInput = z.input<
  typeof ProjectStateSingleConfigWithCompletedOpIdsSchema
>;

export function createProjectStateSingleConfigWithCompletedOpIds(
  options: Partial<ProjectStateSingleConfigWithCompletedOpIds> = {},
): ProjectStateSingleConfigWithCompletedOpIds {
  return ProjectStateSingleConfigWithCompletedOpIdsSchema.parse(options);
}

export const WebsocketMsgUpdateFrontendProjectStateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ProjectStateSingleConfigWithCompletedOpIdsSchema,
  messageType: z
    .literal("UpdateFrontendProjectState")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState),
});

export type WebsocketMsgUpdateFrontendProjectState = z.infer<
  typeof WebsocketMsgUpdateFrontendProjectStateSchema
>;

export type WebsocketMsgUpdateFrontendProjectStateInput = z.input<
  typeof WebsocketMsgUpdateFrontendProjectStateSchema
>;

export function createWebsocketMsgUpdateFrontendProjectState(
  options: Partial<WebsocketMsgUpdateFrontendProjectState> = {},
): WebsocketMsgUpdateFrontendProjectState {
  return WebsocketMsgUpdateFrontendProjectStateSchema.parse(options);
}

export const WebsocketMsgTerminalMetadataSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z
    .literal("TerminalMetadata")
    .default(WebsocketMsgTypeForFrontendEnum.TerminalMetadata),
});

export type WebsocketMsgTerminalMetadata = z.infer<
  typeof WebsocketMsgTerminalMetadataSchema
>;

export type WebsocketMsgTerminalMetadataInput = z.input<
  typeof WebsocketMsgTerminalMetadataSchema
>;

export function createWebsocketMsgTerminalMetadata(
  options: Partial<WebsocketMsgTerminalMetadata> = {},
): WebsocketMsgTerminalMetadata {
  return WebsocketMsgTerminalMetadataSchema.parse(options);
}

export const SettingsShortcutsSchema = z.object({
  newCardShortcut: z.string().default("N" as const),
  newGroupShortcut: z.string().default("G" as const),
  typeCheckShortcut: z.string().default("" as const),
  newProjectConfigShortcut: z.string().default("" as const),
  undoShortcut: z.string().default("Mod + Z" as const),
  redoShortcut: z.string().default("Mod + Shift + Z" as const),
  groupShortcut: z.string().default("Mod + G" as const),
  ungroupShortcut: z.string().default("Shift + Mod + G" as const),
  saveShortcut: z.string().default("Mod + S" as const),
  saveAsShortcut: z.string().default("Mod + Shift + S" as const),
  loadShortcut: z.string().default("Mod + L" as const),
  searchShortcut: z.string().default("Mod + K" as const),
  advancedSearchShortcut: z.string().default("Mod + P" as const),
  commandPaletteShortcut: z.string().default("Mod + Shift + P" as const),
  resetZoomShortcut: z.string().default("Mod + Comma" as const),
  copyShortcut: z.string().default("Mod + C" as const),
  pasteShortcut: z.string().default("Mod + V" as const),
  pasteAsRefShortcut: z.string().default("Mod + Shift + V" as const),
  sortingShortcut: z.string().default("Mod + Alt" as const),
  movingFreeShortcut: z.string().default("Alt" as const),
  showTooltipShortcut: z.string().default("Q" as const),
  tooltipToPlaintextShortcut: z.string().default("Q + S" as const),
  tooltipToMarkdownShortcut: z.string().default("Q + W" as const),
  freezeTooltipShortcut: z.string().default("Q + F" as const),
  frozenTooltipToPlaintextShortcut: z.string().default("S" as const),
  frozenTooltipToMarkdownShortcut: z.string().default("W" as const),
  incrementTooltipPageShortcut: z.string().default("Q + ArrowRight" as const),
  decrementTooltipPageShortcut: z.string().default("Q + ArrowLeft" as const),
  copyTooltipTextShortcut: z.string().default("Q + C" as const),
  frozenTooltipIncrementShortcut: z.string().default("ArrowRight" as const),
  frozenTooltipDecrementShortcut: z.string().default("ArrowLeft" as const),
  frozenTooltipCopyShortcut: z.string().default("C" as const),
  newTerminalShortcut: z.string().default("Ctrl + `" as const),
  fitViewShortcut: z.string().default("F" as const),
  zoomToMouseShortcut: z.string().default("Z" as const),
  deleteSectionShortcut: z.string().default("Backspace" as const),
  selectAll: z.string().default("Mod + A" as const),
  selectTopLevelNonGroupSections: z
    .string()
    .default("Mod + Shift + A" as const),
  showVersionsTabShortcut: z.string().default("V" as const),
  showParamUITypeTabShortcut: z.string().default("P" as const),
  showProjectOverviewTabShortcut: z.string().default("O" as const),
  focusHeaderShortcut: z.string().default("Ctrl + Shift + 1" as const),
  focusOverviewShortcut: z.string().default("Ctrl + Shift + 2" as const),
  focusCanvasShortcut: z.string().default("Ctrl + Shift + 3" as const),
  focusUiEditorShortcut: z.string().default("Ctrl + Shift + 4" as const),
  nextTopLevelSectionShortcut: z.string().default("Alt + J" as const),
  prevTopLevelSectionShortcut: z.string().default("Alt + K" as const),
  runCodeShortcut: z.string().default("Mod + Enter" as const),
  runEntryCodeBlockShortcut: z.string().default("Mod + Shift + Enter" as const),
  paramSelect: z.string().default("Mod + Shift" as const),
  paramIndentShortcut: z.string().default("Tab" as const),
  paramUnindentShortcut: z.string().default("Shift + Tab" as const),
  paramMoveUpShortcut: z.string().default("Alt + ArrowUp" as const),
  paramMoveDownShortcut: z.string().default("Alt + ArrowDown" as const),
  formatCode: z.string().default("Shift + Alt + F" as const),
  selectionKeyCode: z.string().default("Shift" as const),
  multiSelectionKeyCode: z.string().default("Mod" as const),
  panActivationKeyCode: z.string().default("Space" as const),
  zoomActivationKeyCode: z.string().default("Mod" as const),
  zoomInShortcut: z.string().default("Equal" as const),
  zoomOutShortcut: z.string().default("Minus" as const),
  restartLanguageServerShortcut: z.string().default("Alt + Shift + R" as const),
});

export type SettingsShortcuts = z.infer<typeof SettingsShortcutsSchema>;

export type SettingsShortcutsInput = z.input<typeof SettingsShortcutsSchema>;

export function createSettingsShortcuts(
  options: Partial<SettingsShortcuts> = {},
): SettingsShortcuts {
  return SettingsShortcutsSchema.parse(options);
}

export const SettingsGUISchema = z.object({
  snapGrid: z.tuple([z.int(), z.int()]).default([15, 15]),
  showGridLines: z.boolean().default(true),
  gridPattern: z
    .enum(BackgroundVariantEnum)
    .default(BackgroundVariantEnum.dots),
  gridPatternSize: z.int().default(2),
  gridColor: z.string().default("#afbacf" as const),
  gridColorDarkMode: z.string().default("#2b364a" as const),
  wireColor: z.string().default("#41506c" as const),
  wireColorDarkMode: z.string().default("#bac2d3" as const),
  defaultZoomLevel: z.number().default(1.0),
  minZoom: z.number().default(0.1),
  maxZoom: z.number().default(10.0),
  panOnDrag: z.boolean().default(true),
  panOnScroll: z.boolean().default(true),
  panOnScrollSpeed: z.number().default(1.0),
  panOnScrollMode: z
    .enum(PanOnScrollModeEnum)
    .default(PanOnScrollModeEnum.free),
  zoomOnScroll: z.boolean().default(true),
  zoomOnPinch: z.boolean().default(true),
  zoomOnDoubleClick: z.boolean().default(false),
  selectionMode: z.enum(SelectionModeEnum).default(SelectionModeEnum.partial),
  leftSidePaneShiftsMap: z.boolean().default(true),
  transitionDuration: z.int().default(50),
  sectionTagColorChoices: z
    .array(ColorPickerChoiceSchema)
    .default(() => [
      createColorPickerChoice({
        color: "#ef4444" as const,
        description: "Red" as const,
      }),
      createColorPickerChoice({
        color: "#f97316" as const,
        description: "Orange" as const,
      }),
      createColorPickerChoice({
        color: "#eab308" as const,
        description: "Yellow" as const,
      }),
      createColorPickerChoice({
        color: "#22c55e" as const,
        description: "Green" as const,
      }),
      createColorPickerChoice({
        color: "#06b6d4" as const,
        description: "Cyan" as const,
      }),
      createColorPickerChoice({
        color: "#3b82f6" as const,
        description: "Blue" as const,
      }),
      createColorPickerChoice({
        color: "#a855f7" as const,
        description: "Purple" as const,
      }),
      createColorPickerChoice({
        color: "#64748b" as const,
        description: "Slate" as const,
      }),
    ]),
});

export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

export type SettingsGUIInput = z.input<typeof SettingsGUISchema>;

export function createSettingsGUI(
  options: Partial<SettingsGUI> = {},
): SettingsGUI {
  return SettingsGUISchema.parse(options);
}

export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().default(true),
  autosave: z.boolean().default(true),
  autobackup: z.boolean().default(true),
  autobackupFreq: z.int().default(300),
  autobackupKeepLastN: z.int().default(10),
  clearTerminalBeforeMarkingAsReady: z.boolean().default(true),
  defaultTerminalShell: z.union([z.string(), z.null()]).default(null),
  exportDbReadableOnSave: z.boolean().default(false),
  exportDbReadableWithVariantsOnSave: z.boolean().default(false),
  autoRefetchCallableParamsOnLspMismatch: z.boolean().default(true),
  renameRefactorMode: z
    .enum(RenameRefactorModeEnum)
    .default(RenameRefactorModeEnum.ALWAYS_ASK),
  saveRenderedValues: z.boolean().default(false),
  runSnapshotMode: z
    .enum(RunSnapshotModeEnum)
    .default(RunSnapshotModeEnum.ephemeral),
});

export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

export type SettingsBackendInput = z.input<typeof SettingsBackendSchema>;

export function createSettingsBackend(
  options: Partial<SettingsBackend> = {},
): SettingsBackend {
  return SettingsBackendSchema.parse(options);
}

export const SectionSizingPolicyCallableTypeEntrySchema = z.object({
  minHeight: z.number(),
  maxHeight: z.number(),
  minWidth: z.number(),
  maxWidth: z.number(),
  hideSearchMinHeight: z.number(),
  hideParamsMinHeight: z.number(),
});

export type SectionSizingPolicyCallableTypeEntry = z.infer<
  typeof SectionSizingPolicyCallableTypeEntrySchema
>;

export type SectionSizingPolicyCallableTypeEntryInput = z.input<
  typeof SectionSizingPolicyCallableTypeEntrySchema
>;

export function createSectionSizingPolicyCallableTypeEntry(
  options: Partial<SectionSizingPolicyCallableTypeEntry> = {},
): SectionSizingPolicyCallableTypeEntry {
  return SectionSizingPolicyCallableTypeEntrySchema.parse(options);
}

export const SectionSizingPolicyTypeEntrySchema = z.object({
  minHeight: z.number(),
  maxHeight: z.number(),
  minWidth: z.number(),
  maxWidth: z.number(),
});

export type SectionSizingPolicyTypeEntry = z.infer<
  typeof SectionSizingPolicyTypeEntrySchema
>;

export type SectionSizingPolicyTypeEntryInput = z.input<
  typeof SectionSizingPolicyTypeEntrySchema
>;

export function createSectionSizingPolicyTypeEntry(
  options: Partial<SectionSizingPolicyTypeEntry> = {},
): SectionSizingPolicyTypeEntry {
  return SectionSizingPolicyTypeEntrySchema.parse(options);
}

export const SectionSizingPolicyByTypeSchema = z.object({
  Callable: SectionSizingPolicyCallableTypeEntrySchema.default(() =>
    createSectionSizingPolicyCallableTypeEntry({
      minHeight: 104.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
      hideSearchMinHeight: 42.0,
      hideParamsMinHeight: 90.0,
    }),
  ),
  Dict: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 78.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  ListRoot: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 50.0,
      maxHeight: 50.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Group: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 0.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Image: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 100.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Chart: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 300.0,
      maxHeight: 100000.0,
      minWidth: 300.0,
      maxWidth: 100000.0,
    }),
  ),
  Draw: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 100.0,
      maxHeight: 100000.0,
      minWidth: 402.0,
      maxWidth: 100000.0,
    }),
  ),
  Prompt: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 150.0,
      maxHeight: 100000.0,
      minWidth: 300.0,
      maxWidth: 100000.0,
    }),
  ),
  TextBlock: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 49.0,
      maxHeight: 100000.0,
      minWidth: 100.0,
      maxWidth: 100000.0,
    }),
  ),
  MetaControl: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 10.0,
      maxHeight: 100000.0,
      minWidth: 100.0,
      maxWidth: 100000.0,
    }),
  ),
  Social: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 50.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  GlobalVariables: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 78.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Code: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 58.2,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  GenPythonCode: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 0.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  GenPythonMetadata: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 0.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Terminal: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 100.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  IFrame: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 0.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Chat: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 200.0,
      maxHeight: 100000.0,
      minWidth: 400.0,
      maxWidth: 100000.0,
    }),
  ),
  Browser: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 250.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
  Plugin: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 80.0,
      maxHeight: 100000.0,
      minWidth: 200.0,
      maxWidth: 100000.0,
    }),
  ),
});

export type SectionSizingPolicyByType = z.infer<
  typeof SectionSizingPolicyByTypeSchema
>;

export type SectionSizingPolicyByTypeInput = z.input<
  typeof SectionSizingPolicyByTypeSchema
>;

export function createSectionSizingPolicyByType(
  options: Partial<SectionSizingPolicyByType> = {},
): SectionSizingPolicyByType {
  return SectionSizingPolicyByTypeSchema.parse(options);
}

export const MetaControlSizingPolicyTypeEntrySchema = z.object({
  minHeight: z.number(),
  minWidth: z.number(),
  sizeModeHeight: z
    .enum(MetaControlSizeModeEnum)
    .default(MetaControlSizeModeEnum.any),
  sizeModeWidth: z
    .enum(MetaControlSizeModeEnum)
    .default(MetaControlSizeModeEnum.any),
});

export type MetaControlSizingPolicyTypeEntry = z.infer<
  typeof MetaControlSizingPolicyTypeEntrySchema
>;

export type MetaControlSizingPolicyTypeEntryInput = z.input<
  typeof MetaControlSizingPolicyTypeEntrySchema
>;

export function createMetaControlSizingPolicyTypeEntry(
  options: Partial<MetaControlSizingPolicyTypeEntry> = {},
): MetaControlSizingPolicyTypeEntry {
  return MetaControlSizingPolicyTypeEntrySchema.parse(options);
}

export const MetaControlSizingPolicyByTypeSchema = z.object({
  CodeCallable: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  CodeParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  TextParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  ButtonParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  SliderParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
      sizeModeHeight: MetaControlSizeModeEnum.auto_only,
    }),
  ),
  RotaryParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  SwitchParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  ColorPickerParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  DropdownParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
      sizeModeHeight: MetaControlSizeModeEnum.auto_only,
    }),
  ),
  PasswordParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
      sizeModeHeight: MetaControlSizeModeEnum.auto_only,
    }),
  ),
  TextAreaParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 80.0,
      minWidth: 200.0,
    }),
  ),
  DropzoneParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 120.0,
      minWidth: 240.0,
    }),
  ),
  NestedParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
});

export type MetaControlSizingPolicyByType = z.infer<
  typeof MetaControlSizingPolicyByTypeSchema
>;

export type MetaControlSizingPolicyByTypeInput = z.input<
  typeof MetaControlSizingPolicyByTypeSchema
>;

export function createMetaControlSizingPolicyByType(
  options: Partial<MetaControlSizingPolicyByType> = {},
): MetaControlSizingPolicyByType {
  return MetaControlSizingPolicyByTypeSchema.parse(options);
}

export const SectionSizingPolicyGlobalsSchema = z.object({
  pinnedParamsAreaMinHeight: z.number().default(64),
  unpinnedParamsAreaMinHeight: z.number().default(36),
  minimizedHeight: z.number().default(32),
  infiniteMaxHeight: z.number().default(100000),
  infiniteMaxWidth: z.number().default(100000),
  autoMaxHeight: z.number().default(350.0),
});

export type SectionSizingPolicyGlobals = z.infer<
  typeof SectionSizingPolicyGlobalsSchema
>;

export type SectionSizingPolicyGlobalsInput = z.input<
  typeof SectionSizingPolicyGlobalsSchema
>;

export function createSectionSizingPolicyGlobals(
  options: Partial<SectionSizingPolicyGlobals> = {},
): SectionSizingPolicyGlobals {
  return SectionSizingPolicyGlobalsSchema.parse(options);
}

export const SectionSizingPolicySchema = z.object({
  byType: SectionSizingPolicyByTypeSchema.default(
    createSectionSizingPolicyByType,
  ),
  metaControlByType: MetaControlSizingPolicyByTypeSchema.default(
    createMetaControlSizingPolicyByType,
  ),
  globals: SectionSizingPolicyGlobalsSchema.default(
    createSectionSizingPolicyGlobals,
  ),
});

export type SectionSizingPolicy = z.infer<typeof SectionSizingPolicySchema>;

export type SectionSizingPolicyInput = z.input<
  typeof SectionSizingPolicySchema
>;

export function createSectionSizingPolicy(
  options: Partial<SectionSizingPolicy> = {},
): SectionSizingPolicy {
  return SectionSizingPolicySchema.parse(options);
}

export const UserDefaultBrowserSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 720.0, height: 460.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  folder: z.string().default("" as const),
  hideColumn: z.boolean().default(false),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  typesColumnWidth: z.union([z.number(), z.null()]).default(null),
  viewMode: z
    .enum(BrowserAreaViewModeEnum)
    .default(BrowserAreaViewModeEnum.list),
  savedSearches: z.array(BrowserSavedSearchSchema).default([]),
});

export type UserDefaultBrowserSectionImpl = z.infer<
  typeof UserDefaultBrowserSectionImplSchema
>;

export type UserDefaultBrowserSectionImplInput = z.input<
  typeof UserDefaultBrowserSectionImplSchema
>;

export function createUserDefaultBrowserSectionImpl(
  options: Partial<UserDefaultBrowserSectionImpl> = {},
): UserDefaultBrowserSectionImpl {
  return UserDefaultBrowserSectionImplSchema.parse(options);
}

export const UserDefaultCallableSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  hideParams: z.boolean().default(false),
});

export type UserDefaultCallableSectionImpl = z.infer<
  typeof UserDefaultCallableSectionImplSchema
>;

export type UserDefaultCallableSectionImplInput = z.input<
  typeof UserDefaultCallableSectionImplSchema
>;

export function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return UserDefaultCallableSectionImplSchema.parse(options);
}

export const UserDefaultChartSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 300.0, height: 300.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  dataPath: z.string().default("" as const),
});

export type UserDefaultChartSectionImpl = z.infer<
  typeof UserDefaultChartSectionImplSchema
>;

export type UserDefaultChartSectionImplInput = z.input<
  typeof UserDefaultChartSectionImplSchema
>;

export function createUserDefaultChartSectionImpl(
  options: Partial<UserDefaultChartSectionImpl> = {},
): UserDefaultChartSectionImpl {
  return UserDefaultChartSectionImplSchema.parse(options);
}

export const UserDefaultChatSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 400.0, height: 200.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  managed: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  chatId: z.union([IDSchema, z.null()]).default(null),
  thinking: z.boolean().default(true),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default([]),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

export type UserDefaultChatSectionImpl = z.infer<
  typeof UserDefaultChatSectionImplSchema
>;

export type UserDefaultChatSectionImplInput = z.input<
  typeof UserDefaultChatSectionImplSchema
>;

export function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return UserDefaultChatSectionImplSchema.parse(options);
}

export const UserDefaultCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
  codeLanguage: z
    .union([z.enum(CodeLanguageEnum), z.string()])
    .default(CodeLanguageEnum.python),
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreStateSchema.default(
    createCodeSectionDiagnosticsIgnoreState,
  ),
});

export type UserDefaultCodeSectionImpl = z.infer<
  typeof UserDefaultCodeSectionImplSchema
>;

export type UserDefaultCodeSectionImplInput = z.input<
  typeof UserDefaultCodeSectionImplSchema
>;

export function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return UserDefaultCodeSectionImplSchema.parse(options);
}

export const UserDefaultDictSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultDictSectionImpl = z.infer<
  typeof UserDefaultDictSectionImplSchema
>;

export type UserDefaultDictSectionImplInput = z.input<
  typeof UserDefaultDictSectionImplSchema
>;

export function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return UserDefaultDictSectionImplSchema.parse(options);
}

export const UserDefaultDrawSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 402.0, height: 100.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  layers: z.array(DrawAreaLayerSchema).default([]),
  renderedImagePath: z.union([z.string(), z.null()]).default(null),
  activeLayerIdx: z.int().default(0),
  brushColor: z.string().default("#ff0000" as const),
  brushSize: z.int().default(16),
  brushShape: z
    .enum(DrawAreaBrushShapeEnum)
    .default(DrawAreaBrushShapeEnum.butt),
  brushOpacity: z.number().default(1),
  eraserBrushSize: z.int().default(16),
  drawThrottleDelay: z.int().default(0),
  canvasMode: z.enum(DrawAreaModeEnum).default(DrawAreaModeEnum.draw),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
});

export type UserDefaultDrawSectionImpl = z.infer<
  typeof UserDefaultDrawSectionImplSchema
>;

export type UserDefaultDrawSectionImplInput = z.input<
  typeof UserDefaultDrawSectionImplSchema
>;

export function createUserDefaultDrawSectionImpl(
  options: Partial<UserDefaultDrawSectionImpl> = {},
): UserDefaultDrawSectionImpl {
  return UserDefaultDrawSectionImplSchema.parse(options);
}

export const UserDefaultGenPythonCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type UserDefaultGenPythonCodeSectionImpl = z.infer<
  typeof UserDefaultGenPythonCodeSectionImplSchema
>;

export type UserDefaultGenPythonCodeSectionImplInput = z.input<
  typeof UserDefaultGenPythonCodeSectionImplSchema
>;

export function createUserDefaultGenPythonCodeSectionImpl(
  options: Partial<UserDefaultGenPythonCodeSectionImpl> = {},
): UserDefaultGenPythonCodeSectionImpl {
  return UserDefaultGenPythonCodeSectionImplSchema.parse(options);
}

export const UserDefaultGenPythonMetadataSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type UserDefaultGenPythonMetadataSectionImpl = z.infer<
  typeof UserDefaultGenPythonMetadataSectionImplSchema
>;

export type UserDefaultGenPythonMetadataSectionImplInput = z.input<
  typeof UserDefaultGenPythonMetadataSectionImplSchema
>;

export function createUserDefaultGenPythonMetadataSectionImpl(
  options: Partial<UserDefaultGenPythonMetadataSectionImpl> = {},
): UserDefaultGenPythonMetadataSectionImpl {
  return UserDefaultGenPythonMetadataSectionImplSchema.parse(options);
}

export const UserDefaultGlobalVariablesSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultGlobalVariablesSectionImpl = z.infer<
  typeof UserDefaultGlobalVariablesSectionImplSchema
>;

export type UserDefaultGlobalVariablesSectionImplInput = z.input<
  typeof UserDefaultGlobalVariablesSectionImplSchema
>;

export function createUserDefaultGlobalVariablesSectionImpl(
  options: Partial<UserDefaultGlobalVariablesSectionImpl> = {},
): UserDefaultGlobalVariablesSectionImpl {
  return UserDefaultGlobalVariablesSectionImplSchema.parse(options);
}

export const UserDefaultGroupSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isHorizontalOrientation: z.boolean().default(false),
  overflowMode: z.boolean().default(false),
});

export type UserDefaultGroupSectionImpl = z.infer<
  typeof UserDefaultGroupSectionImplSchema
>;

export type UserDefaultGroupSectionImplInput = z.input<
  typeof UserDefaultGroupSectionImplSchema
>;

export function createUserDefaultGroupSectionImpl(
  options: Partial<UserDefaultGroupSectionImpl> = {},
): UserDefaultGroupSectionImpl {
  return UserDefaultGroupSectionImplSchema.parse(options);
}

export const UserDefaultIFrameSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultIFrameSectionImpl = z.infer<
  typeof UserDefaultIFrameSectionImplSchema
>;

export type UserDefaultIFrameSectionImplInput = z.input<
  typeof UserDefaultIFrameSectionImplSchema
>;

export function createUserDefaultIFrameSectionImpl(
  options: Partial<UserDefaultIFrameSectionImpl> = {},
): UserDefaultIFrameSectionImpl {
  return UserDefaultIFrameSectionImplSchema.parse(options);
}

export const UserDefaultImageSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  imagePath: z.string().default("" as const),
});

export type UserDefaultImageSectionImpl = z.infer<
  typeof UserDefaultImageSectionImplSchema
>;

export type UserDefaultImageSectionImplInput = z.input<
  typeof UserDefaultImageSectionImplSchema
>;

export function createUserDefaultImageSectionImpl(
  options: Partial<UserDefaultImageSectionImpl> = {},
): UserDefaultImageSectionImpl {
  return UserDefaultImageSectionImplSchema.parse(options);
}

export const UserDefaultListRootSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultListRootSectionImpl = z.infer<
  typeof UserDefaultListRootSectionImplSchema
>;

export type UserDefaultListRootSectionImplInput = z.input<
  typeof UserDefaultListRootSectionImplSchema
>;

export function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return UserDefaultListRootSectionImplSchema.parse(options);
}

export const UserDefaultMetaControlSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  showSectionTitle: z.boolean().default(false),
});

export type UserDefaultMetaControlSectionImpl = z.infer<
  typeof UserDefaultMetaControlSectionImplSchema
>;

export type UserDefaultMetaControlSectionImplInput = z.input<
  typeof UserDefaultMetaControlSectionImplSchema
>;

export function createUserDefaultMetaControlSectionImpl(
  options: Partial<UserDefaultMetaControlSectionImpl> = {},
): UserDefaultMetaControlSectionImpl {
  return UserDefaultMetaControlSectionImplSchema.parse(options);
}

export const UserDefaultPluginSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  pluginId: z.string().default("" as const),
  kind: z.string().default("default" as const),
  data: z.record(z.string(), z.any()).default({}),
  schemaVersion: z.union([z.int(), z.null()]).default(null),
});

export type UserDefaultPluginSectionImpl = z.infer<
  typeof UserDefaultPluginSectionImplSchema
>;

export type UserDefaultPluginSectionImplInput = z.input<
  typeof UserDefaultPluginSectionImplSchema
>;

export function createUserDefaultPluginSectionImpl(
  options: Partial<UserDefaultPluginSectionImpl> = {},
): UserDefaultPluginSectionImpl {
  return UserDefaultPluginSectionImplSchema.parse(options);
}

export const UserDefaultPromptSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 300.0, height: 150.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  template: z.string().default("" as const),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputs: z.record(z.string(), z.string()).default({}),
  renderedText: z.string().default("" as const),
  missingVariables: z.array(z.string()).default([]),
  renderError: z.union([z.string(), z.null()]).default(null),
});

export type UserDefaultPromptSectionImpl = z.infer<
  typeof UserDefaultPromptSectionImplSchema
>;

export type UserDefaultPromptSectionImplInput = z.input<
  typeof UserDefaultPromptSectionImplSchema
>;

export function createUserDefaultPromptSectionImpl(
  options: Partial<UserDefaultPromptSectionImpl> = {},
): UserDefaultPromptSectionImpl {
  return UserDefaultPromptSectionImplSchema.parse(options);
}

export const UserDefaultSocialSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  url: z.string().default("" as const),
});

export type UserDefaultSocialSectionImpl = z.infer<
  typeof UserDefaultSocialSectionImplSchema
>;

export type UserDefaultSocialSectionImplInput = z.input<
  typeof UserDefaultSocialSectionImplSchema
>;

export function createUserDefaultSocialSectionImpl(
  options: Partial<UserDefaultSocialSectionImpl> = {},
): UserDefaultSocialSectionImpl {
  return UserDefaultSocialSectionImplSchema.parse(options);
}

export const UserDefaultTerminalSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 250.0, height: 150.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultTerminalSectionImpl = z.infer<
  typeof UserDefaultTerminalSectionImplSchema
>;

export type UserDefaultTerminalSectionImplInput = z.input<
  typeof UserDefaultTerminalSectionImplSchema
>;

export function createUserDefaultTerminalSectionImpl(
  options: Partial<UserDefaultTerminalSectionImpl> = {},
): UserDefaultTerminalSectionImpl {
  return UserDefaultTerminalSectionImplSchema.parse(options);
}

export const UserDefaultTextBlockSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  format: z.enum(TextBlockFormatEnum).default(TextBlockFormatEnum.Plaintext),
  headingAsSectionName: z.boolean().default(false),
  metaControlStyle: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

export type UserDefaultTextBlockSectionImpl = z.infer<
  typeof UserDefaultTextBlockSectionImplSchema
>;

export type UserDefaultTextBlockSectionImplInput = z.input<
  typeof UserDefaultTextBlockSectionImplSchema
>;

export function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return UserDefaultTextBlockSectionImplSchema.parse(options);
}

export const UserDefaultButtonParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  label: z.string().default("Trigger" as const),
  actionMode: z
    .enum(ButtonActionModeEnum)
    .default(ButtonActionModeEnum.WEBSOCKET_LISTENER),
  requestMethod: z
    .enum(HttpRequestMethodEnum)
    .default(HttpRequestMethodEnum.POST),
  requestUrl: z.string().default("" as const),
  requestHeaderKey: z.string().default("" as const),
  requestHeaderValue: z.string().default("" as const),
  requestBody: z.string().default("" as const),
});

export type UserDefaultButtonParamCodeObjImpl = z.infer<
  typeof UserDefaultButtonParamCodeObjImplSchema
>;

export type UserDefaultButtonParamCodeObjImplInput = z.input<
  typeof UserDefaultButtonParamCodeObjImplSchema
>;

export function createUserDefaultButtonParamCodeObjImpl(
  options: Partial<UserDefaultButtonParamCodeObjImpl> = {},
): UserDefaultButtonParamCodeObjImpl {
  return UserDefaultButtonParamCodeObjImplSchema.parse(options);
}

export const UserDefaultCodeCallableCodeObjImplSchema = z.object({});

export type UserDefaultCodeCallableCodeObjImpl = z.infer<
  typeof UserDefaultCodeCallableCodeObjImplSchema
>;

export type UserDefaultCodeCallableCodeObjImplInput = z.input<
  typeof UserDefaultCodeCallableCodeObjImplSchema
>;

export function createUserDefaultCodeCallableCodeObjImpl(
  options: Partial<UserDefaultCodeCallableCodeObjImpl> = {},
): UserDefaultCodeCallableCodeObjImpl {
  return UserDefaultCodeCallableCodeObjImplSchema.parse(options);
}

export const UserDefaultCodeParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type UserDefaultCodeParamCodeObjImpl = z.infer<
  typeof UserDefaultCodeParamCodeObjImplSchema
>;

export type UserDefaultCodeParamCodeObjImplInput = z.input<
  typeof UserDefaultCodeParamCodeObjImplSchema
>;

export function createUserDefaultCodeParamCodeObjImpl(
  options: Partial<UserDefaultCodeParamCodeObjImpl> = {},
): UserDefaultCodeParamCodeObjImpl {
  return UserDefaultCodeParamCodeObjImplSchema.parse(options);
}

export const UserDefaultColorPickerParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
});

export type UserDefaultColorPickerParamCodeObjImpl = z.infer<
  typeof UserDefaultColorPickerParamCodeObjImplSchema
>;

export type UserDefaultColorPickerParamCodeObjImplInput = z.input<
  typeof UserDefaultColorPickerParamCodeObjImplSchema
>;

export function createUserDefaultColorPickerParamCodeObjImpl(
  options: Partial<UserDefaultColorPickerParamCodeObjImpl> = {},
): UserDefaultColorPickerParamCodeObjImpl {
  return UserDefaultColorPickerParamCodeObjImplSchema.parse(options);
}

export const UserDefaultDropdownParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default([]),
});

export type UserDefaultDropdownParamCodeObjImpl = z.infer<
  typeof UserDefaultDropdownParamCodeObjImplSchema
>;

export type UserDefaultDropdownParamCodeObjImplInput = z.input<
  typeof UserDefaultDropdownParamCodeObjImplSchema
>;

export function createUserDefaultDropdownParamCodeObjImpl(
  options: Partial<UserDefaultDropdownParamCodeObjImpl> = {},
): UserDefaultDropdownParamCodeObjImpl {
  return UserDefaultDropdownParamCodeObjImplSchema.parse(options);
}

export const UserDefaultDropzoneParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  mode: z.enum(DropzoneModeEnum).default(DropzoneModeEnum.STATEFUL),
  maxAttachments: z.union([z.int(), z.null()]).default(null),
  placeholder: z.string().default("Drop a file here" as const),
});

export type UserDefaultDropzoneParamCodeObjImpl = z.infer<
  typeof UserDefaultDropzoneParamCodeObjImplSchema
>;

export type UserDefaultDropzoneParamCodeObjImplInput = z.input<
  typeof UserDefaultDropzoneParamCodeObjImplSchema
>;

export function createUserDefaultDropzoneParamCodeObjImpl(
  options: Partial<UserDefaultDropzoneParamCodeObjImpl> = {},
): UserDefaultDropzoneParamCodeObjImpl {
  return UserDefaultDropzoneParamCodeObjImplSchema.parse(options);
}

export const UserDefaultNestedParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
});

export type UserDefaultNestedParamCodeObjImpl = z.infer<
  typeof UserDefaultNestedParamCodeObjImplSchema
>;

export type UserDefaultNestedParamCodeObjImplInput = z.input<
  typeof UserDefaultNestedParamCodeObjImplSchema
>;

export function createUserDefaultNestedParamCodeObjImpl(
  options: Partial<UserDefaultNestedParamCodeObjImpl> = {},
): UserDefaultNestedParamCodeObjImpl {
  return UserDefaultNestedParamCodeObjImplSchema.parse(options);
}

export const UserDefaultPasswordParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  hasSecret: z.boolean().default(false),
});

export type UserDefaultPasswordParamCodeObjImpl = z.infer<
  typeof UserDefaultPasswordParamCodeObjImplSchema
>;

export type UserDefaultPasswordParamCodeObjImplInput = z.input<
  typeof UserDefaultPasswordParamCodeObjImplSchema
>;

export function createUserDefaultPasswordParamCodeObjImpl(
  options: Partial<UserDefaultPasswordParamCodeObjImpl> = {},
): UserDefaultPasswordParamCodeObjImpl {
  return UserDefaultPasswordParamCodeObjImplSchema.parse(options);
}

export const UserDefaultRotaryParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.number().default(0),
  max: z.number().default(1),
  step: z.number().default(0.1),
});

export type UserDefaultRotaryParamCodeObjImpl = z.infer<
  typeof UserDefaultRotaryParamCodeObjImplSchema
>;

export type UserDefaultRotaryParamCodeObjImplInput = z.input<
  typeof UserDefaultRotaryParamCodeObjImplSchema
>;

export function createUserDefaultRotaryParamCodeObjImpl(
  options: Partial<UserDefaultRotaryParamCodeObjImpl> = {},
): UserDefaultRotaryParamCodeObjImpl {
  return UserDefaultRotaryParamCodeObjImplSchema.parse(options);
}

export const UserDefaultSliderParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

export type UserDefaultSliderParamCodeObjImpl = z.infer<
  typeof UserDefaultSliderParamCodeObjImplSchema
>;

export type UserDefaultSliderParamCodeObjImplInput = z.input<
  typeof UserDefaultSliderParamCodeObjImplSchema
>;

export function createUserDefaultSliderParamCodeObjImpl(
  options: Partial<UserDefaultSliderParamCodeObjImpl> = {},
): UserDefaultSliderParamCodeObjImpl {
  return UserDefaultSliderParamCodeObjImplSchema.parse(options);
}

export const UserDefaultSwitchParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("false" as const),
});

export type UserDefaultSwitchParamCodeObjImpl = z.infer<
  typeof UserDefaultSwitchParamCodeObjImplSchema
>;

export type UserDefaultSwitchParamCodeObjImplInput = z.input<
  typeof UserDefaultSwitchParamCodeObjImplSchema
>;

export function createUserDefaultSwitchParamCodeObjImpl(
  options: Partial<UserDefaultSwitchParamCodeObjImpl> = {},
): UserDefaultSwitchParamCodeObjImpl {
  return UserDefaultSwitchParamCodeObjImplSchema.parse(options);
}

export const UserDefaultTextAreaParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type UserDefaultTextAreaParamCodeObjImpl = z.infer<
  typeof UserDefaultTextAreaParamCodeObjImplSchema
>;

export type UserDefaultTextAreaParamCodeObjImplInput = z.input<
  typeof UserDefaultTextAreaParamCodeObjImplSchema
>;

export function createUserDefaultTextAreaParamCodeObjImpl(
  options: Partial<UserDefaultTextAreaParamCodeObjImpl> = {},
): UserDefaultTextAreaParamCodeObjImpl {
  return UserDefaultTextAreaParamCodeObjImplSchema.parse(options);
}

export const UserDefaultTextParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type UserDefaultTextParamCodeObjImpl = z.infer<
  typeof UserDefaultTextParamCodeObjImplSchema
>;

export type UserDefaultTextParamCodeObjImplInput = z.input<
  typeof UserDefaultTextParamCodeObjImplSchema
>;

export function createUserDefaultTextParamCodeObjImpl(
  options: Partial<UserDefaultTextParamCodeObjImpl> = {},
): UserDefaultTextParamCodeObjImpl {
  return UserDefaultTextParamCodeObjImplSchema.parse(options);
}

export const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.default(createSettingsShortcuts),
  gui: SettingsGUISchema.default(createSettingsGUI),
  backend: SettingsBackendSchema.default(createSettingsBackend),
  sectionSizingPolicy: SectionSizingPolicySchema.default(
    createSectionSizingPolicy,
  ),
  languageServer: z
    .record(z.string(), z.any())
    .default(() => ({
      basedpyright: {
        analysis: {
          diagnosticSeverityOverrides: {
            reportUnknownVariableType: "none" as const,
            reportUnknownMemberType: "none" as const,
            reportUnannotatedClassAttribute: "none" as const,
            reportSelfClsParameterName: "none" as const,
          },
        },
      },
    })),
  browserSectionDefault: UserDefaultBrowserSectionImplSchema.default(
    createUserDefaultBrowserSectionImpl,
  ),
  callableSectionDefault: UserDefaultCallableSectionImplSchema.default(
    createUserDefaultCallableSectionImpl,
  ),
  chartSectionDefault: UserDefaultChartSectionImplSchema.default(
    createUserDefaultChartSectionImpl,
  ),
  chatSectionDefault: UserDefaultChatSectionImplSchema.default(
    createUserDefaultChatSectionImpl,
  ),
  codeSectionDefault: UserDefaultCodeSectionImplSchema.default(
    createUserDefaultCodeSectionImpl,
  ),
  dictSectionDefault: UserDefaultDictSectionImplSchema.default(
    createUserDefaultDictSectionImpl,
  ),
  drawSectionDefault: UserDefaultDrawSectionImplSchema.default(
    createUserDefaultDrawSectionImpl,
  ),
  genPythonCodeSectionDefault:
    UserDefaultGenPythonCodeSectionImplSchema.default(
      createUserDefaultGenPythonCodeSectionImpl,
    ),
  genPythonMetadataSectionDefault:
    UserDefaultGenPythonMetadataSectionImplSchema.default(
      createUserDefaultGenPythonMetadataSectionImpl,
    ),
  globalVariablesSectionDefault:
    UserDefaultGlobalVariablesSectionImplSchema.default(
      createUserDefaultGlobalVariablesSectionImpl,
    ),
  groupSectionDefault: UserDefaultGroupSectionImplSchema.default(
    createUserDefaultGroupSectionImpl,
  ),
  iFrameSectionDefault: UserDefaultIFrameSectionImplSchema.default(
    createUserDefaultIFrameSectionImpl,
  ),
  imageSectionDefault: UserDefaultImageSectionImplSchema.default(
    createUserDefaultImageSectionImpl,
  ),
  listRootSectionDefault: UserDefaultListRootSectionImplSchema.default(
    createUserDefaultListRootSectionImpl,
  ),
  metaControlSectionDefault: UserDefaultMetaControlSectionImplSchema.default(
    createUserDefaultMetaControlSectionImpl,
  ),
  pluginSectionDefault: UserDefaultPluginSectionImplSchema.default(
    createUserDefaultPluginSectionImpl,
  ),
  promptSectionDefault: UserDefaultPromptSectionImplSchema.default(
    createUserDefaultPromptSectionImpl,
  ),
  socialSectionDefault: UserDefaultSocialSectionImplSchema.default(
    createUserDefaultSocialSectionImpl,
  ),
  terminalSectionDefault: UserDefaultTerminalSectionImplSchema.default(
    createUserDefaultTerminalSectionImpl,
  ),
  textBlockSectionDefault: UserDefaultTextBlockSectionImplSchema.default(
    createUserDefaultTextBlockSectionImpl,
  ),
  buttonParamCodeObjDefault: UserDefaultButtonParamCodeObjImplSchema.default(
    createUserDefaultButtonParamCodeObjImpl,
  ),
  codeCallableCodeObjDefault: UserDefaultCodeCallableCodeObjImplSchema.default(
    createUserDefaultCodeCallableCodeObjImpl,
  ),
  codeParamCodeObjDefault: UserDefaultCodeParamCodeObjImplSchema.default(
    createUserDefaultCodeParamCodeObjImpl,
  ),
  colorPickerParamCodeObjDefault:
    UserDefaultColorPickerParamCodeObjImplSchema.default(
      createUserDefaultColorPickerParamCodeObjImpl,
    ),
  dropdownParamCodeObjDefault:
    UserDefaultDropdownParamCodeObjImplSchema.default(
      createUserDefaultDropdownParamCodeObjImpl,
    ),
  dropzoneParamCodeObjDefault:
    UserDefaultDropzoneParamCodeObjImplSchema.default(
      createUserDefaultDropzoneParamCodeObjImpl,
    ),
  nestedParamCodeObjDefault: UserDefaultNestedParamCodeObjImplSchema.default(
    createUserDefaultNestedParamCodeObjImpl,
  ),
  passwordParamCodeObjDefault:
    UserDefaultPasswordParamCodeObjImplSchema.default(
      createUserDefaultPasswordParamCodeObjImpl,
    ),
  rotaryParamCodeObjDefault: UserDefaultRotaryParamCodeObjImplSchema.default(
    createUserDefaultRotaryParamCodeObjImpl,
  ),
  sliderParamCodeObjDefault: UserDefaultSliderParamCodeObjImplSchema.default(
    createUserDefaultSliderParamCodeObjImpl,
  ),
  switchParamCodeObjDefault: UserDefaultSwitchParamCodeObjImplSchema.default(
    createUserDefaultSwitchParamCodeObjImpl,
  ),
  textAreaParamCodeObjDefault:
    UserDefaultTextAreaParamCodeObjImplSchema.default(
      createUserDefaultTextAreaParamCodeObjImpl,
    ),
  textParamCodeObjDefault: UserDefaultTextParamCodeObjImplSchema.default(
    createUserDefaultTextParamCodeObjImpl,
  ),
});

export type SettingsState = z.infer<typeof SettingsStateSchema>;

export type SettingsStateInput = z.input<typeof SettingsStateSchema>;

export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  return SettingsStateSchema.parse(options);
}

export const WebsocketMsgUpdateSettingsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettingsStateSchema,
  messageType: z
    .literal("UpdateSettings")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateSettings),
});

export type WebsocketMsgUpdateSettings = z.infer<
  typeof WebsocketMsgUpdateSettingsSchema
>;

export type WebsocketMsgUpdateSettingsInput = z.input<
  typeof WebsocketMsgUpdateSettingsSchema
>;

export function createWebsocketMsgUpdateSettings(
  options: Partial<WebsocketMsgUpdateSettings> = {},
): WebsocketMsgUpdateSettings {
  return WebsocketMsgUpdateSettingsSchema.parse(options);
}

export const AllProjectMetadataSchema = z.object({
  defaultProjectConfigId: z.union([z.string(), z.null()]),
  projectMetadata: z.array(ProjectConfigSchema),
});

export type AllProjectMetadata = z.infer<typeof AllProjectMetadataSchema>;

export type AllProjectMetadataInput = z.input<typeof AllProjectMetadataSchema>;

export function createAllProjectMetadata(
  options: Partial<AllProjectMetadata> = {},
): AllProjectMetadata {
  return AllProjectMetadataSchema.parse(options);
}

export const WebsocketMsgAllProjectMetadataSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AllProjectMetadataSchema,
  messageType: z
    .literal("AllProjectMetadata")
    .default(WebsocketMsgTypeForFrontendEnum.AllProjectMetadata),
});

export type WebsocketMsgAllProjectMetadata = z.infer<
  typeof WebsocketMsgAllProjectMetadataSchema
>;

export type WebsocketMsgAllProjectMetadataInput = z.input<
  typeof WebsocketMsgAllProjectMetadataSchema
>;

export function createWebsocketMsgAllProjectMetadata(
  options: Partial<WebsocketMsgAllProjectMetadata> = {},
): WebsocketMsgAllProjectMetadata {
  return WebsocketMsgAllProjectMetadataSchema.parse(options);
}

export const UpdateArtifactMsgContentSchema = z.object({
  artifacts: z.array(
    z.discriminatedUnion("type", [
      ImageArtifactSchema,
      BrushStrokeArtifactSchema,
      DrawAreaLayerItemTransformArtifactSchema,
      ChartDataArtifactSchema,
      FileArtifactSchema,
    ]),
  ),
  updateType: z.literal(["update", "delete"]),
});

export type UpdateArtifactMsgContent = z.infer<
  typeof UpdateArtifactMsgContentSchema
>;

export type UpdateArtifactMsgContentInput = z.input<
  typeof UpdateArtifactMsgContentSchema
>;

export function createUpdateArtifactMsgContent(
  options: Partial<UpdateArtifactMsgContent> = {},
): UpdateArtifactMsgContent {
  return UpdateArtifactMsgContentSchema.parse(options);
}

export const WebsocketMsgUpdateArtifactsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: UpdateArtifactMsgContentSchema,
  messageType: z
    .literal("UpdateArtifacts")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateArtifacts),
});

export type WebsocketMsgUpdateArtifacts = z.infer<
  typeof WebsocketMsgUpdateArtifactsSchema
>;

export type WebsocketMsgUpdateArtifactsInput = z.input<
  typeof WebsocketMsgUpdateArtifactsSchema
>;

export function createWebsocketMsgUpdateArtifacts(
  options: Partial<WebsocketMsgUpdateArtifacts> = {},
): WebsocketMsgUpdateArtifacts {
  return WebsocketMsgUpdateArtifactsSchema.parse(options);
}

export const ListenerCoverageSnapshotSchema = z.object({
  projectConfigId: IDSchema,
  dependencies: z.array(
    z.discriminatedUnion("type", [
      SectionDependencyKeySchema,
      SectionParamDependencyKeySchema,
    ]),
  ),
  hasRealtimeWildcard: z.boolean(),
});

export type ListenerCoverageSnapshot = z.infer<
  typeof ListenerCoverageSnapshotSchema
>;

export type ListenerCoverageSnapshotInput = z.input<
  typeof ListenerCoverageSnapshotSchema
>;

export function createListenerCoverageSnapshot(
  options: Partial<ListenerCoverageSnapshot> = {},
): ListenerCoverageSnapshot {
  return ListenerCoverageSnapshotSchema.parse(options);
}

export const WebsocketMsgListenerCoverageSnapshotSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerCoverageSnapshotSchema,
  messageType: z
    .literal("ListenerCoverageSnapshot")
    .default(WebsocketMsgTypeForFrontendEnum.ListenerCoverageSnapshot),
});

export type WebsocketMsgListenerCoverageSnapshot = z.infer<
  typeof WebsocketMsgListenerCoverageSnapshotSchema
>;

export type WebsocketMsgListenerCoverageSnapshotInput = z.input<
  typeof WebsocketMsgListenerCoverageSnapshotSchema
>;

export function createWebsocketMsgListenerCoverageSnapshot(
  options: Partial<WebsocketMsgListenerCoverageSnapshot> = {},
): WebsocketMsgListenerCoverageSnapshot {
  return WebsocketMsgListenerCoverageSnapshotSchema.parse(options);
}

export const LLMConfigSchema = z.object({
  id: z.string(),
  model: z.string(),
  provider: z.union([z.string(), z.null()]).default(null),
  base_url: z.union([z.string(), z.null()]).default(null),
  api_key_env: z.union([z.string(), z.null()]).default(null),
  other_params: z
    .union([z.record(z.string(), z.any()), z.null()])
    .default(null),
  mcpServerIds: z.union([z.array(z.string()), z.null()]).default(null),
  temporary: z.boolean().default(false),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export type LLMConfigInput = z.input<typeof LLMConfigSchema>;

export function createLLMConfig(options: Partial<LLMConfig> = {}): LLMConfig {
  return LLMConfigSchema.parse(options);
}

export const MCPServerConfigSchema = z.object({
  transport: z.literal(["sse", "streamable_http", "stdio"]),
  url: z.union([z.string(), z.null()]).default(null),
  command: z.union([z.string(), z.null()]).default(null),
  args: z.array(z.string()).default([]),
  env: z.union([z.record(z.string(), z.string()), z.null()]).default(null),
  cwd: z.union([z.string(), z.null()]).default(null),
  encoding: z.string().default("utf-8" as const),
  encoding_error_handler: z
    .literal(["strict", "ignore", "replace"])
    .default("strict" as const),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export type MCPServerConfigInput = z.input<typeof MCPServerConfigSchema>;

export function createMCPServerConfig(
  options: Partial<MCPServerConfig> = {},
): MCPServerConfig {
  return MCPServerConfigSchema.parse(options);
}

export const AllLLMConfigsSchema = z.object({
  configs: z.record(z.string(), LLMConfigSchema).default({}),
  mcpServers: z.record(z.string(), MCPServerConfigSchema).default({}),
  defaultMcpServerIds: z.array(z.string()).default([]),
  default_config_id: z.union([z.string(), z.null()]).default(null),
});

export type AllLLMConfigs = z.infer<typeof AllLLMConfigsSchema>;

export type AllLLMConfigsInput = z.input<typeof AllLLMConfigsSchema>;

export function createAllLLMConfigs(
  options: Partial<AllLLMConfigs> = {},
): AllLLMConfigs {
  return AllLLMConfigsSchema.parse(options);
}

export const WebsocketMsgLLMConfigUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AllLLMConfigsSchema,
  messageType: z
    .literal("LLMConfigUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMConfigUpdated),
});

export type WebsocketMsgLLMConfigUpdated = z.infer<
  typeof WebsocketMsgLLMConfigUpdatedSchema
>;

export type WebsocketMsgLLMConfigUpdatedInput = z.input<
  typeof WebsocketMsgLLMConfigUpdatedSchema
>;

export function createWebsocketMsgLLMConfigUpdated(
  options: Partial<WebsocketMsgLLMConfigUpdated> = {},
): WebsocketMsgLLMConfigUpdated {
  return WebsocketMsgLLMConfigUpdatedSchema.parse(options);
}

export const WebsocketMsgLLMApiKeysUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.record(z.string(), z.string()),
  messageType: z
    .literal("LLMApiKeysUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMApiKeysUpdated),
});

export type WebsocketMsgLLMApiKeysUpdated = z.infer<
  typeof WebsocketMsgLLMApiKeysUpdatedSchema
>;

export type WebsocketMsgLLMApiKeysUpdatedInput = z.input<
  typeof WebsocketMsgLLMApiKeysUpdatedSchema
>;

export function createWebsocketMsgLLMApiKeysUpdated(
  options: Partial<WebsocketMsgLLMApiKeysUpdated> = {},
): WebsocketMsgLLMApiKeysUpdated {
  return WebsocketMsgLLMApiKeysUpdatedSchema.parse(options);
}

export const AgentProfileSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  description: z.string().default("" as const),
  systemPrompt: z.string().default("" as const),
  enableBackgroundSummaryFill: z.boolean().default(false),
  enableLlmChatTitles: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  toolAllowlist: z.array(z.string()).default([]),
  memoryScope: z.union([z.string(), z.null()]).default(null),
});

export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export type AgentProfileInput = z.input<typeof AgentProfileSchema>;

export function createAgentProfile(
  options: Partial<AgentProfile> = {},
): AgentProfile {
  return AgentProfileSchema.parse(options);
}

export const AgentProfileListSchema = z.object({
  profiles: z.array(AgentProfileSchema),
});

export type AgentProfileList = z.infer<typeof AgentProfileListSchema>;

export type AgentProfileListInput = z.input<typeof AgentProfileListSchema>;

export function createAgentProfileList(
  options: Partial<AgentProfileList> = {},
): AgentProfileList {
  return AgentProfileListSchema.parse(options);
}

export const WebsocketMsgAgentProfilesUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AgentProfileListSchema,
  messageType: z
    .literal("AgentProfilesUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.AgentProfilesUpdated),
});

export type WebsocketMsgAgentProfilesUpdated = z.infer<
  typeof WebsocketMsgAgentProfilesUpdatedSchema
>;

export type WebsocketMsgAgentProfilesUpdatedInput = z.input<
  typeof WebsocketMsgAgentProfilesUpdatedSchema
>;

export function createWebsocketMsgAgentProfilesUpdated(
  options: Partial<WebsocketMsgAgentProfilesUpdated> = {},
): WebsocketMsgAgentProfilesUpdated {
  return WebsocketMsgAgentProfilesUpdatedSchema.parse(options);
}

export const PromptTemplateSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  description: z.string().default("" as const),
  template: z.string(),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputSchema: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export type PromptTemplateInput = z.input<typeof PromptTemplateSchema>;

export function createPromptTemplate(
  options: Partial<PromptTemplate> = {},
): PromptTemplate {
  return PromptTemplateSchema.parse(options);
}

export const PromptTemplateListSchema = z.object({
  templates: z.array(PromptTemplateSchema),
});

export type PromptTemplateList = z.infer<typeof PromptTemplateListSchema>;

export type PromptTemplateListInput = z.input<typeof PromptTemplateListSchema>;

export function createPromptTemplateList(
  options: Partial<PromptTemplateList> = {},
): PromptTemplateList {
  return PromptTemplateListSchema.parse(options);
}

export const WebsocketMsgPromptTemplatesUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: PromptTemplateListSchema,
  messageType: z
    .literal("PromptTemplatesUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.PromptTemplatesUpdated),
});

export type WebsocketMsgPromptTemplatesUpdated = z.infer<
  typeof WebsocketMsgPromptTemplatesUpdatedSchema
>;

export type WebsocketMsgPromptTemplatesUpdatedInput = z.input<
  typeof WebsocketMsgPromptTemplatesUpdatedSchema
>;

export function createWebsocketMsgPromptTemplatesUpdated(
  options: Partial<WebsocketMsgPromptTemplatesUpdated> = {},
): WebsocketMsgPromptTemplatesUpdated {
  return WebsocketMsgPromptTemplatesUpdatedSchema.parse(options);
}

export const ClaudeSettingsPermissionsSchema = z.object({
  allow: z.array(z.string()).default([]),
  ask: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});

export type ClaudeSettingsPermissions = z.infer<
  typeof ClaudeSettingsPermissionsSchema
>;

export type ClaudeSettingsPermissionsInput = z.input<
  typeof ClaudeSettingsPermissionsSchema
>;

export function createClaudeSettingsPermissions(
  options: Partial<ClaudeSettingsPermissions> = {},
): ClaudeSettingsPermissions {
  return ClaudeSettingsPermissionsSchema.parse(options);
}

export const ClaudeSettingsManagedSchema = z.object({
  permissions: z
    .union([ClaudeSettingsPermissionsSchema, z.null()])
    .default(null),
  defaultMode: z.union([z.string(), z.null()]).default(null),
  mcp: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type ClaudeSettingsManaged = z.infer<typeof ClaudeSettingsManagedSchema>;

export type ClaudeSettingsManagedInput = z.input<
  typeof ClaudeSettingsManagedSchema
>;

export function createClaudeSettingsManaged(
  options: Partial<ClaudeSettingsManaged> = {},
): ClaudeSettingsManaged {
  return ClaudeSettingsManagedSchema.parse(options);
}

export const CodexSettingsManagedSchema = z.object({
  approvalPolicy: z.union([z.string(), z.null()]).default(null),
  sandboxMode: z.union([z.string(), z.null()]).default(null),
  enabledTools: z.union([z.array(z.string()), z.null()]).default(null),
  model: z.union([z.string(), z.null()]).default(null),
});

export type CodexSettingsManaged = z.infer<typeof CodexSettingsManagedSchema>;

export type CodexSettingsManagedInput = z.input<
  typeof CodexSettingsManagedSchema
>;

export function createCodexSettingsManaged(
  options: Partial<CodexSettingsManaged> = {},
): CodexSettingsManaged {
  return CodexSettingsManagedSchema.parse(options);
}

export const OpenCodeSettingsManagedSchema = z.object({
  permission: z
    .union([
      z.record(
        z.string(),
        z.union([z.string(), z.record(z.string(), z.string())]),
      ),
      z.null(),
    ])
    .default(null),
  mcp: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  model: z.union([z.string(), z.null()]).default(null),
});

export type OpenCodeSettingsManaged = z.infer<
  typeof OpenCodeSettingsManagedSchema
>;

export type OpenCodeSettingsManagedInput = z.input<
  typeof OpenCodeSettingsManagedSchema
>;

export function createOpenCodeSettingsManaged(
  options: Partial<OpenCodeSettingsManaged> = {},
): OpenCodeSettingsManaged {
  return OpenCodeSettingsManagedSchema.parse(options);
}

export const ExternalAgentSettingsManagedBlockSchema = z.object({
  claude: z.union([ClaudeSettingsManagedSchema, z.null()]).default(null),
  codex: z.union([CodexSettingsManagedSchema, z.null()]).default(null),
  opencode: z.union([OpenCodeSettingsManagedSchema, z.null()]).default(null),
});

export type ExternalAgentSettingsManagedBlock = z.infer<
  typeof ExternalAgentSettingsManagedBlockSchema
>;

export type ExternalAgentSettingsManagedBlockInput = z.input<
  typeof ExternalAgentSettingsManagedBlockSchema
>;

export function createExternalAgentSettingsManagedBlock(
  options: Partial<ExternalAgentSettingsManagedBlock> = {},
): ExternalAgentSettingsManagedBlock {
  return ExternalAgentSettingsManagedBlockSchema.parse(options);
}

export const ExternalAgentConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  description: z.string().default("" as const),
  toolType: z.enum(ExternalAgentToolTypeEnum),
  pluginAdapterId: z.union([z.string(), z.null()]).default(null),
  runMode: z.enum(ExternalAgentRunModeEnum),
  commandPath: z.union([z.string(), z.null()]).default(null),
  baseUrl: z.union([z.string(), z.null()]).default(null),
  defaultModel: z.union([z.string(), z.null()]).default(null),
  sandboxPolicy: z.union([z.string(), z.null()]).default(null),
  approvalPolicy: z.union([z.string(), z.null()]).default(null),
  settingsMode: z
    .enum(ExternalAgentSettingsModeEnum)
    .default(ExternalAgentSettingsModeEnum.managed_local),
  settingsSources: z
    .union([z.array(z.enum(ClaudeSettingsSourceEnum)), z.null()])
    .default(null),
  settingsFilePath: z.union([z.string(), z.null()]).default(null),
  settingsAllowSettaEdits: z.boolean().default(true),
  settingsManagedBlock: z
    .union([ExternalAgentSettingsManagedBlockSchema, z.null()])
    .default(null),
  envVarWhitelist: z.array(z.string()).default([]),
  workingDirStrategy: z
    .enum(ExternalAgentWorkingDirStrategyEnum)
    .default(ExternalAgentWorkingDirStrategyEnum.project_root),
  workingDir: z.union([z.string(), z.null()]).default(null),
  codexSkipGitRepoCheck: z.union([z.boolean(), z.null()]).default(null),
});

export type ExternalAgentConfig = z.infer<typeof ExternalAgentConfigSchema>;

export type ExternalAgentConfigInput = z.input<
  typeof ExternalAgentConfigSchema
>;

export function createExternalAgentConfig(
  options: Partial<ExternalAgentConfig> = {},
): ExternalAgentConfig {
  return ExternalAgentConfigSchema.parse(options);
}

export const ExternalAgentConfigListSchema = z.object({
  configs: z.array(ExternalAgentConfigSchema),
});

export type ExternalAgentConfigList = z.infer<
  typeof ExternalAgentConfigListSchema
>;

export type ExternalAgentConfigListInput = z.input<
  typeof ExternalAgentConfigListSchema
>;

export function createExternalAgentConfigList(
  options: Partial<ExternalAgentConfigList> = {},
): ExternalAgentConfigList {
  return ExternalAgentConfigListSchema.parse(options);
}

export const WebsocketMsgExternalAgentConfigsUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ExternalAgentConfigListSchema,
  messageType: z
    .literal("ExternalAgentConfigsUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.ExternalAgentConfigsUpdated),
});

export type WebsocketMsgExternalAgentConfigsUpdated = z.infer<
  typeof WebsocketMsgExternalAgentConfigsUpdatedSchema
>;

export type WebsocketMsgExternalAgentConfigsUpdatedInput = z.input<
  typeof WebsocketMsgExternalAgentConfigsUpdatedSchema
>;

export function createWebsocketMsgExternalAgentConfigsUpdated(
  options: Partial<WebsocketMsgExternalAgentConfigsUpdated> = {},
): WebsocketMsgExternalAgentConfigsUpdated {
  return WebsocketMsgExternalAgentConfigsUpdatedSchema.parse(options);
}

export const EngineConfigDefaultsSchema = z.object({
  thinking: z.union([z.boolean(), z.null()]).default(null),
});

export type EngineConfigDefaults = z.infer<typeof EngineConfigDefaultsSchema>;

export type EngineConfigDefaultsInput = z.input<
  typeof EngineConfigDefaultsSchema
>;

export function createEngineConfigDefaults(
  options: Partial<EngineConfigDefaults> = {},
): EngineConfigDefaults {
  return EngineConfigDefaultsSchema.parse(options);
}

export const EngineConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  engineType: z.enum(EngineTypeEnum),
  settaLlmConfigId: z.union([z.string(), z.null()]).default(null),
  externalAgentConfigId: z.union([IDSchema, z.null()]).default(null),
  defaults: EngineConfigDefaultsSchema.default(createEngineConfigDefaults),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export type EngineConfigInput = z.input<typeof EngineConfigSchema>;

export function createEngineConfig(
  options: Partial<EngineConfig> = {},
): EngineConfig {
  return EngineConfigSchema.parse(options);
}

export const EngineConfigListSchema = z.object({
  configs: z.array(EngineConfigSchema),
});

export type EngineConfigList = z.infer<typeof EngineConfigListSchema>;

export type EngineConfigListInput = z.input<typeof EngineConfigListSchema>;

export function createEngineConfigList(
  options: Partial<EngineConfigList> = {},
): EngineConfigList {
  return EngineConfigListSchema.parse(options);
}

export const WebsocketMsgEngineConfigsUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: EngineConfigListSchema,
  messageType: z
    .literal("EngineConfigsUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.EngineConfigsUpdated),
});

export type WebsocketMsgEngineConfigsUpdated = z.infer<
  typeof WebsocketMsgEngineConfigsUpdatedSchema
>;

export type WebsocketMsgEngineConfigsUpdatedInput = z.input<
  typeof WebsocketMsgEngineConfigsUpdatedSchema
>;

export function createWebsocketMsgEngineConfigsUpdated(
  options: Partial<WebsocketMsgEngineConfigsUpdated> = {},
): WebsocketMsgEngineConfigsUpdated {
  return WebsocketMsgEngineConfigsUpdatedSchema.parse(options);
}

export const AIFollowToolArgumentsUpdateContentSchema = z.object({
  projectConfigId: IDSchema,
  chatId: IDSchema,
  idsByType: z.record(z.literal(["section", "codeObj"]), z.array(IDSchema)),
});

export type AIFollowToolArgumentsUpdateContent = z.infer<
  typeof AIFollowToolArgumentsUpdateContentSchema
>;

export type AIFollowToolArgumentsUpdateContentInput = z.input<
  typeof AIFollowToolArgumentsUpdateContentSchema
>;

export function createAIFollowToolArgumentsUpdateContent(
  options: Partial<AIFollowToolArgumentsUpdateContent> = {},
): AIFollowToolArgumentsUpdateContent {
  return AIFollowToolArgumentsUpdateContentSchema.parse(options);
}

export const WebsocketMsgAIFollowToolArgumentsUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AIFollowToolArgumentsUpdateContentSchema,
  messageType: z
    .literal("AIFollowToolArgumentsUpdate")
    .default(WebsocketMsgTypeForFrontendEnum.AIFollowToolArgumentsUpdate),
});

export type WebsocketMsgAIFollowToolArgumentsUpdate = z.infer<
  typeof WebsocketMsgAIFollowToolArgumentsUpdateSchema
>;

export type WebsocketMsgAIFollowToolArgumentsUpdateInput = z.input<
  typeof WebsocketMsgAIFollowToolArgumentsUpdateSchema
>;

export function createWebsocketMsgAIFollowToolArgumentsUpdate(
  options: Partial<WebsocketMsgAIFollowToolArgumentsUpdate> = {},
): WebsocketMsgAIFollowToolArgumentsUpdate {
  return WebsocketMsgAIFollowToolArgumentsUpdateSchema.parse(options);
}

export const AIFollowToolResultUpdateContentSchema = z.object({
  projectConfigId: IDSchema,
  chatId: IDSchema,
  idsByType: z.record(z.literal(["section", "codeObj"]), z.array(IDSchema)),
});

export type AIFollowToolResultUpdateContent = z.infer<
  typeof AIFollowToolResultUpdateContentSchema
>;

export type AIFollowToolResultUpdateContentInput = z.input<
  typeof AIFollowToolResultUpdateContentSchema
>;

export function createAIFollowToolResultUpdateContent(
  options: Partial<AIFollowToolResultUpdateContent> = {},
): AIFollowToolResultUpdateContent {
  return AIFollowToolResultUpdateContentSchema.parse(options);
}

export const WebsocketMsgAIFollowToolResultUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AIFollowToolResultUpdateContentSchema,
  messageType: z
    .literal("AIFollowToolResultUpdate")
    .default(WebsocketMsgTypeForFrontendEnum.AIFollowToolResultUpdate),
});

export type WebsocketMsgAIFollowToolResultUpdate = z.infer<
  typeof WebsocketMsgAIFollowToolResultUpdateSchema
>;

export type WebsocketMsgAIFollowToolResultUpdateInput = z.input<
  typeof WebsocketMsgAIFollowToolResultUpdateSchema
>;

export function createWebsocketMsgAIFollowToolResultUpdate(
  options: Partial<WebsocketMsgAIFollowToolResultUpdate> = {},
): WebsocketMsgAIFollowToolResultUpdate {
  return WebsocketMsgAIFollowToolResultUpdateSchema.parse(options);
}

export const FrontendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgBackendLogEventSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgNameValidationErrorsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
  WebsocketMsgAllProjectMetadataSchema,
  WebsocketMsgUpdateArtifactsSchema,
  WebsocketMsgListenerCoverageSnapshotSchema,
  WebsocketMsgLLMConfigUpdatedSchema,
  WebsocketMsgLLMApiKeysUpdatedSchema,
  WebsocketMsgAgentProfilesUpdatedSchema,
  WebsocketMsgPromptTemplatesUpdatedSchema,
  WebsocketMsgExternalAgentConfigsUpdatedSchema,
  WebsocketMsgEngineConfigsUpdatedSchema,
  WebsocketMsgAIFollowToolArgumentsUpdateSchema,
  WebsocketMsgAIFollowToolResultUpdateSchema,
]);

export type FrontendWebsocketMsgUnion = z.infer<
  typeof FrontendWebsocketMsgUnionSchema
>;

export type FrontendWebsocketMsgUnionInput = z.input<
  typeof FrontendWebsocketMsgUnionSchema
>;

export const FrontendWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgBackendLogEventSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgNameValidationErrorsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
    WebsocketMsgAllProjectMetadataSchema,
    WebsocketMsgUpdateArtifactsSchema,
    WebsocketMsgListenerCoverageSnapshotSchema,
    WebsocketMsgLLMConfigUpdatedSchema,
    WebsocketMsgLLMApiKeysUpdatedSchema,
    WebsocketMsgAgentProfilesUpdatedSchema,
    WebsocketMsgPromptTemplatesUpdatedSchema,
    WebsocketMsgExternalAgentConfigsUpdatedSchema,
    WebsocketMsgEngineConfigsUpdatedSchema,
    WebsocketMsgAIFollowToolArgumentsUpdateSchema,
    WebsocketMsgAIFollowToolResultUpdateSchema,
  ]);

export type FrontendWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof FrontendWebsocketMsgUnionWithDiscriminatorSchema
>;

export type FrontendWebsocketMsgUnionWithDiscriminatorInput = z.input<
  typeof FrontendWebsocketMsgUnionWithDiscriminatorSchema
>;

export function createFrontendWebsocketMsgUnionWithDiscriminator(
  options: Partial<FrontendWebsocketMsgUnionWithDiscriminator> = {},
): FrontendWebsocketMsgUnionWithDiscriminator {
  return FrontendWebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const ListenerRealtimeEventContentSchema = z.object({
  projectConfigId: IDSchema,
  shareSessionId: z.union([z.string(), z.null()]).default(null),
  deltas: z.array(z.any()),
  sequence: z.int(),
});

export type ListenerRealtimeEventContent = z.infer<
  typeof ListenerRealtimeEventContentSchema
>;

export type ListenerRealtimeEventContentInput = z.input<
  typeof ListenerRealtimeEventContentSchema
>;

export function createListenerRealtimeEventContent(
  options: Partial<ListenerRealtimeEventContent> = {},
): ListenerRealtimeEventContent {
  return ListenerRealtimeEventContentSchema.parse(options);
}

export const WebsocketMsgListenerRealtimeEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerRealtimeEventContentSchema,
  messageType: z
    .literal("ListenerRealtimeEvent")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerRealtimeEvent),
});

export type WebsocketMsgListenerRealtimeEvent = z.infer<
  typeof WebsocketMsgListenerRealtimeEventSchema
>;

export type WebsocketMsgListenerRealtimeEventInput = z.input<
  typeof WebsocketMsgListenerRealtimeEventSchema
>;

export function createWebsocketMsgListenerRealtimeEvent(
  options: Partial<WebsocketMsgListenerRealtimeEvent> = {},
): WebsocketMsgListenerRealtimeEvent {
  return WebsocketMsgListenerRealtimeEventSchema.parse(options);
}

export const ListenerDependencyEventContentSchema = z.object({
  projectConfigId: IDSchema,
  shareSessionId: z.union([z.string(), z.null()]).default(null),
  dependencyEvents: z.array(DependencyEventSchema),
  sequence: z.int(),
});

export type ListenerDependencyEventContent = z.infer<
  typeof ListenerDependencyEventContentSchema
>;

export type ListenerDependencyEventContentInput = z.input<
  typeof ListenerDependencyEventContentSchema
>;

export function createListenerDependencyEventContent(
  options: Partial<ListenerDependencyEventContent> = {},
): ListenerDependencyEventContent {
  return ListenerDependencyEventContentSchema.parse(options);
}

export const WebsocketMsgListenerDependencyEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerDependencyEventContentSchema,
  messageType: z
    .literal("ListenerDependencyEvent")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerDependencyEvent),
});

export type WebsocketMsgListenerDependencyEvent = z.infer<
  typeof WebsocketMsgListenerDependencyEventSchema
>;

export type WebsocketMsgListenerDependencyEventInput = z.input<
  typeof WebsocketMsgListenerDependencyEventSchema
>;

export function createWebsocketMsgListenerDependencyEvent(
  options: Partial<WebsocketMsgListenerDependencyEvent> = {},
): WebsocketMsgListenerDependencyEvent {
  return WebsocketMsgListenerDependencyEventSchema.parse(options);
}

export const ListenerForceRefreshContentSchema = z.object({
  shareSessionId: z.union([z.string(), z.null()]).default(null),
  projectState: z
    .union([ProjectStateSingleConfigSchema, z.null()])
    .default(null),
});

export type ListenerForceRefreshContent = z.infer<
  typeof ListenerForceRefreshContentSchema
>;

export type ListenerForceRefreshContentInput = z.input<
  typeof ListenerForceRefreshContentSchema
>;

export function createListenerForceRefreshContent(
  options: Partial<ListenerForceRefreshContent> = {},
): ListenerForceRefreshContent {
  return ListenerForceRefreshContentSchema.parse(options);
}

export const WebsocketMsgListenerForceRefreshSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerForceRefreshContentSchema,
  messageType: z
    .literal("ListenerForceRefresh")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerForceRefresh),
});

export type WebsocketMsgListenerForceRefresh = z.infer<
  typeof WebsocketMsgListenerForceRefreshSchema
>;

export type WebsocketMsgListenerForceRefreshInput = z.input<
  typeof WebsocketMsgListenerForceRefreshSchema
>;

export function createWebsocketMsgListenerForceRefresh(
  options: Partial<WebsocketMsgListenerForceRefresh> = {},
): WebsocketMsgListenerForceRefresh {
  return WebsocketMsgListenerForceRefreshSchema.parse(options);
}

export const ListenerErrorContentSchema = z.object({
  error: z.string(),
  details: z.union([z.any(), z.null()]).default(null),
});

export type ListenerErrorContent = z.infer<typeof ListenerErrorContentSchema>;

export type ListenerErrorContentInput = z.input<
  typeof ListenerErrorContentSchema
>;

export function createListenerErrorContent(
  options: Partial<ListenerErrorContent> = {},
): ListenerErrorContent {
  return ListenerErrorContentSchema.parse(options);
}

export const WebsocketMsgListenerErrorSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerErrorContentSchema,
  messageType: z
    .literal("ListenerError")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerError),
});

export type WebsocketMsgListenerError = z.infer<
  typeof WebsocketMsgListenerErrorSchema
>;

export type WebsocketMsgListenerErrorInput = z.input<
  typeof WebsocketMsgListenerErrorSchema
>;

export function createWebsocketMsgListenerError(
  options: Partial<WebsocketMsgListenerError> = {},
): WebsocketMsgListenerError {
  return WebsocketMsgListenerErrorSchema.parse(options);
}

export const ListenerFrontendEmitRawContentSchema = z.object({
  projectConfigId: IDSchema,
  dependencyValues: z.record(z.string(), z.any()).default({}),
  artifactUpdates: z
    .array(
      z.discriminatedUnion("type", [
        ImageArtifactSchema,
        BrushStrokeArtifactSchema,
        DrawAreaLayerItemTransformArtifactSchema,
        ChartDataArtifactSchema,
        FileArtifactSchema,
      ]),
    )
    .default([]),
});

export type ListenerFrontendEmitRawContent = z.infer<
  typeof ListenerFrontendEmitRawContentSchema
>;

export type ListenerFrontendEmitRawContentInput = z.input<
  typeof ListenerFrontendEmitRawContentSchema
>;

export function createListenerFrontendEmitRawContent(
  options: Partial<ListenerFrontendEmitRawContent> = {},
): ListenerFrontendEmitRawContent {
  return ListenerFrontendEmitRawContentSchema.parse(options);
}

export const WebsocketMsgListenerFrontendEmitSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerFrontendEmitRawContentSchema,
  messageType: z
    .literal("ListenerFrontendEmit")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerFrontendEmit),
});

export type WebsocketMsgListenerFrontendEmit = z.infer<
  typeof WebsocketMsgListenerFrontendEmitSchema
>;

export type WebsocketMsgListenerFrontendEmitInput = z.input<
  typeof WebsocketMsgListenerFrontendEmitSchema
>;

export function createWebsocketMsgListenerFrontendEmit(
  options: Partial<WebsocketMsgListenerFrontendEmit> = {},
): WebsocketMsgListenerFrontendEmit {
  return WebsocketMsgListenerFrontendEmitSchema.parse(options);
}

export const ListenerRouterEndpointCallContentSchema = z.object({
  projectConfigId: IDSchema,
  callId: z.string(),
  endpointName: z.string(),
  payload: z.record(z.string(), z.any()).default({}),
});

export type ListenerRouterEndpointCallContent = z.infer<
  typeof ListenerRouterEndpointCallContentSchema
>;

export type ListenerRouterEndpointCallContentInput = z.input<
  typeof ListenerRouterEndpointCallContentSchema
>;

export function createListenerRouterEndpointCallContent(
  options: Partial<ListenerRouterEndpointCallContent> = {},
): ListenerRouterEndpointCallContent {
  return ListenerRouterEndpointCallContentSchema.parse(options);
}

export const WebsocketMsgListenerRouterEndpointCallSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerRouterEndpointCallContentSchema,
  messageType: z
    .literal("ListenerRouterEndpointCall")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerRouterEndpointCall),
});

export type WebsocketMsgListenerRouterEndpointCall = z.infer<
  typeof WebsocketMsgListenerRouterEndpointCallSchema
>;

export type WebsocketMsgListenerRouterEndpointCallInput = z.input<
  typeof WebsocketMsgListenerRouterEndpointCallSchema
>;

export function createWebsocketMsgListenerRouterEndpointCall(
  options: Partial<WebsocketMsgListenerRouterEndpointCall> = {},
): WebsocketMsgListenerRouterEndpointCall {
  return WebsocketMsgListenerRouterEndpointCallSchema.parse(options);
}

export const ListenerRouterEndpointResultContentSchema = z.object({
  projectConfigId: IDSchema,
  callId: z.string(),
  ok: z.boolean(),
  result: z.union([z.any(), z.null()]).default(null),
  error: z.union([z.string(), z.null()]).default(null),
  details: z.record(z.string(), z.any()).default({}),
});

export type ListenerRouterEndpointResultContent = z.infer<
  typeof ListenerRouterEndpointResultContentSchema
>;

export type ListenerRouterEndpointResultContentInput = z.input<
  typeof ListenerRouterEndpointResultContentSchema
>;

export function createListenerRouterEndpointResultContent(
  options: Partial<ListenerRouterEndpointResultContent> = {},
): ListenerRouterEndpointResultContent {
  return ListenerRouterEndpointResultContentSchema.parse(options);
}

export const WebsocketMsgListenerRouterEndpointResultSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerRouterEndpointResultContentSchema,
  messageType: z
    .literal("ListenerRouterEndpointResult")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerRouterEndpointResult),
});

export type WebsocketMsgListenerRouterEndpointResult = z.infer<
  typeof WebsocketMsgListenerRouterEndpointResultSchema
>;

export type WebsocketMsgListenerRouterEndpointResultInput = z.input<
  typeof WebsocketMsgListenerRouterEndpointResultSchema
>;

export function createWebsocketMsgListenerRouterEndpointResult(
  options: Partial<WebsocketMsgListenerRouterEndpointResult> = {},
): WebsocketMsgListenerRouterEndpointResult {
  return WebsocketMsgListenerRouterEndpointResultSchema.parse(options);
}

export const ListenerRegisterCallbackSchema = z.object({
  dependencies: z.array(
    z.discriminatedUnion("type", [
      SectionDependencyKeySchema,
      SectionParamDependencyKeySchema,
    ]),
  ),
  dependencyMode: z.enum(ListenerDependencyModeEnum),
  debounceMs: z.union([z.int(), z.null()]).default(null),
  throttleMs: z.union([z.int(), z.null()]).default(null),
  runOnRefresh: z.boolean().default(false),
});

export type ListenerRegisterCallback = z.infer<
  typeof ListenerRegisterCallbackSchema
>;

export type ListenerRegisterCallbackInput = z.input<
  typeof ListenerRegisterCallbackSchema
>;

export function createListenerRegisterCallback(
  options: Partial<ListenerRegisterCallback> = {},
): ListenerRegisterCallback {
  return ListenerRegisterCallbackSchema.parse(options);
}

export const ListenerRegisterContentSchema = z.object({
  projectConfigId: IDSchema,
  callbacks: z.record(z.string(), ListenerRegisterCallbackSchema),
});

export type ListenerRegisterContent = z.infer<
  typeof ListenerRegisterContentSchema
>;

export type ListenerRegisterContentInput = z.input<
  typeof ListenerRegisterContentSchema
>;

export function createListenerRegisterContent(
  options: Partial<ListenerRegisterContent> = {},
): ListenerRegisterContent {
  return ListenerRegisterContentSchema.parse(options);
}

export const WebsocketMsgListenerRegisterSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerRegisterContentSchema,
  messageType: z
    .literal("ListenerRegister")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerRegister),
});

export type WebsocketMsgListenerRegister = z.infer<
  typeof WebsocketMsgListenerRegisterSchema
>;

export type WebsocketMsgListenerRegisterInput = z.input<
  typeof WebsocketMsgListenerRegisterSchema
>;

export function createWebsocketMsgListenerRegister(
  options: Partial<WebsocketMsgListenerRegister> = {},
): WebsocketMsgListenerRegister {
  return WebsocketMsgListenerRegisterSchema.parse(options);
}

export const ListenerRegisterAckStatusSchema = z.object({
  status: z.literal(["accepted", "rejected"]),
  message: z.union([z.string(), z.null()]).default(null),
});

export type ListenerRegisterAckStatus = z.infer<
  typeof ListenerRegisterAckStatusSchema
>;

export type ListenerRegisterAckStatusInput = z.input<
  typeof ListenerRegisterAckStatusSchema
>;

export function createListenerRegisterAckStatus(
  options: Partial<ListenerRegisterAckStatus> = {},
): ListenerRegisterAckStatus {
  return ListenerRegisterAckStatusSchema.parse(options);
}

export const ListenerRegisterAckContentSchema = z.object({
  projectConfigId: IDSchema,
  callbacks: z.record(z.string(), ListenerRegisterAckStatusSchema),
});

export type ListenerRegisterAckContent = z.infer<
  typeof ListenerRegisterAckContentSchema
>;

export type ListenerRegisterAckContentInput = z.input<
  typeof ListenerRegisterAckContentSchema
>;

export function createListenerRegisterAckContent(
  options: Partial<ListenerRegisterAckContent> = {},
): ListenerRegisterAckContent {
  return ListenerRegisterAckContentSchema.parse(options);
}

export const WebsocketMsgListenerRegisterAckSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerRegisterAckContentSchema,
  messageType: z
    .literal("ListenerRegisterAck")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerRegisterAck),
});

export type WebsocketMsgListenerRegisterAck = z.infer<
  typeof WebsocketMsgListenerRegisterAckSchema
>;

export type WebsocketMsgListenerRegisterAckInput = z.input<
  typeof WebsocketMsgListenerRegisterAckSchema
>;

export function createWebsocketMsgListenerRegisterAck(
  options: Partial<WebsocketMsgListenerRegisterAck> = {},
): WebsocketMsgListenerRegisterAck {
  return WebsocketMsgListenerRegisterAckSchema.parse(options);
}

export const ListenerInitContentSchema = z.object({
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
  projectName: z.union([z.string(), z.null()]).default(null),
  useTemporaryIds: z.boolean().default(false),
});

export type ListenerInitContent = z.infer<typeof ListenerInitContentSchema>;

export type ListenerInitContentInput = z.input<
  typeof ListenerInitContentSchema
>;

export function createListenerInitContent(
  options: Partial<ListenerInitContent> = {},
): ListenerInitContent {
  return ListenerInitContentSchema.parse(options);
}

export const WebsocketMsgListenerInitSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerInitContentSchema,
  messageType: z
    .literal("ListenerInit")
    .default(WebsocketMsgTypeForPythonScriptEnum.ListenerInit),
});

export type WebsocketMsgListenerInit = z.infer<
  typeof WebsocketMsgListenerInitSchema
>;

export type WebsocketMsgListenerInitInput = z.input<
  typeof WebsocketMsgListenerInitSchema
>;

export function createWebsocketMsgListenerInit(
  options: Partial<WebsocketMsgListenerInit> = {},
): WebsocketMsgListenerInit {
  return WebsocketMsgListenerInitSchema.parse(options);
}

export const PythonScriptWebsocketMsgUnionSchema = z.union([
  WebsocketMsgListenerRealtimeEventSchema,
  WebsocketMsgListenerDependencyEventSchema,
  WebsocketMsgListenerForceRefreshSchema,
  WebsocketMsgListenerErrorSchema,
  WebsocketMsgListenerFrontendEmitSchema,
  WebsocketMsgListenerRouterEndpointCallSchema,
  WebsocketMsgListenerRouterEndpointResultSchema,
  WebsocketMsgListenerRegisterSchema,
  WebsocketMsgListenerRegisterAckSchema,
  WebsocketMsgListenerInitSchema,
]);

export type PythonScriptWebsocketMsgUnion = z.infer<
  typeof PythonScriptWebsocketMsgUnionSchema
>;

export type PythonScriptWebsocketMsgUnionInput = z.input<
  typeof PythonScriptWebsocketMsgUnionSchema
>;

export const PythonScriptWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgListenerRealtimeEventSchema,
    WebsocketMsgListenerDependencyEventSchema,
    WebsocketMsgListenerForceRefreshSchema,
    WebsocketMsgListenerErrorSchema,
    WebsocketMsgListenerFrontendEmitSchema,
    WebsocketMsgListenerRouterEndpointCallSchema,
    WebsocketMsgListenerRouterEndpointResultSchema,
    WebsocketMsgListenerRegisterSchema,
    WebsocketMsgListenerRegisterAckSchema,
    WebsocketMsgListenerInitSchema,
  ]);

export type PythonScriptWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof PythonScriptWebsocketMsgUnionWithDiscriminatorSchema
>;

export type PythonScriptWebsocketMsgUnionWithDiscriminatorInput = z.input<
  typeof PythonScriptWebsocketMsgUnionWithDiscriminatorSchema
>;

export function createPythonScriptWebsocketMsgUnionWithDiscriminator(
  options: Partial<PythonScriptWebsocketMsgUnionWithDiscriminator> = {},
): PythonScriptWebsocketMsgUnionWithDiscriminator {
  return PythonScriptWebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const WebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgBackendLogEventSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgNameValidationErrorsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
  WebsocketMsgAllProjectMetadataSchema,
  WebsocketMsgUpdateArtifactsSchema,
  WebsocketMsgListenerCoverageSnapshotSchema,
  WebsocketMsgLLMConfigUpdatedSchema,
  WebsocketMsgLLMApiKeysUpdatedSchema,
  WebsocketMsgAgentProfilesUpdatedSchema,
  WebsocketMsgPromptTemplatesUpdatedSchema,
  WebsocketMsgExternalAgentConfigsUpdatedSchema,
  WebsocketMsgEngineConfigsUpdatedSchema,
  WebsocketMsgAIFollowToolArgumentsUpdateSchema,
  WebsocketMsgAIFollowToolResultUpdateSchema,
  WebsocketMsgRealtimeUIChangeSchema,
  WebsocketMsgRealtimeDependencyEventSchema,
  WebsocketMsgCurrentAddressUpdateSchema,
  WebsocketMsgListenerRealtimeEventSchema,
  WebsocketMsgListenerDependencyEventSchema,
  WebsocketMsgListenerForceRefreshSchema,
  WebsocketMsgListenerErrorSchema,
  WebsocketMsgListenerFrontendEmitSchema,
  WebsocketMsgListenerRouterEndpointCallSchema,
  WebsocketMsgListenerRouterEndpointResultSchema,
  WebsocketMsgListenerRegisterSchema,
  WebsocketMsgListenerRegisterAckSchema,
  WebsocketMsgListenerInitSchema,
]);

export type WebsocketMsgUnion = z.infer<typeof WebsocketMsgUnionSchema>;

export type WebsocketMsgUnionInput = z.input<typeof WebsocketMsgUnionSchema>;

export const WebsocketMsgUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "messageType",
  [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgBackendLogEventSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgNameValidationErrorsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
    WebsocketMsgAllProjectMetadataSchema,
    WebsocketMsgUpdateArtifactsSchema,
    WebsocketMsgListenerCoverageSnapshotSchema,
    WebsocketMsgLLMConfigUpdatedSchema,
    WebsocketMsgLLMApiKeysUpdatedSchema,
    WebsocketMsgAgentProfilesUpdatedSchema,
    WebsocketMsgPromptTemplatesUpdatedSchema,
    WebsocketMsgExternalAgentConfigsUpdatedSchema,
    WebsocketMsgEngineConfigsUpdatedSchema,
    WebsocketMsgAIFollowToolArgumentsUpdateSchema,
    WebsocketMsgAIFollowToolResultUpdateSchema,
    WebsocketMsgRealtimeUIChangeSchema,
    WebsocketMsgRealtimeDependencyEventSchema,
    WebsocketMsgCurrentAddressUpdateSchema,
    WebsocketMsgListenerRealtimeEventSchema,
    WebsocketMsgListenerDependencyEventSchema,
    WebsocketMsgListenerForceRefreshSchema,
    WebsocketMsgListenerErrorSchema,
    WebsocketMsgListenerFrontendEmitSchema,
    WebsocketMsgListenerRouterEndpointCallSchema,
    WebsocketMsgListenerRouterEndpointResultSchema,
    WebsocketMsgListenerRegisterSchema,
    WebsocketMsgListenerRegisterAckSchema,
    WebsocketMsgListenerInitSchema,
  ],
);

export type WebsocketMsgUnionWithDiscriminator = z.infer<
  typeof WebsocketMsgUnionWithDiscriminatorSchema
>;

export type WebsocketMsgUnionWithDiscriminatorInput = z.input<
  typeof WebsocketMsgUnionWithDiscriminatorSchema
>;

export function createWebsocketMsgUnionWithDiscriminator(
  options: Partial<WebsocketMsgUnionWithDiscriminator> = {},
): WebsocketMsgUnionWithDiscriminator {
  return WebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const GitDiffModeSchema = z.literal(["unstaged", "staged"]);

export type GitDiffMode = z.infer<typeof GitDiffModeSchema>;

export type GitDiffModeInput = z.input<typeof GitDiffModeSchema>;

export const GitStatusKindSchema = z.literal([
  "conflict",
  "staged",
  "unstaged",
  "untracked",
]);

export type GitStatusKind = z.infer<typeof GitStatusKindSchema>;

export type GitStatusKindInput = z.input<typeof GitStatusKindSchema>;

export const CanonicalToTemporaryIDMapSchema = z.record(IDSchema, IDSchema);

export type CanonicalToTemporaryIDMap = z.infer<
  typeof CanonicalToTemporaryIDMapSchema
>;

export type CanonicalToTemporaryIDMapInput = z.input<
  typeof CanonicalToTemporaryIDMapSchema
>;

export const TemporaryToCanonicalIDMapSchema = z.record(IDSchema, IDSchema);

export type TemporaryToCanonicalIDMap = z.infer<
  typeof TemporaryToCanonicalIDMapSchema
>;

export type TemporaryToCanonicalIDMapInput = z.input<
  typeof TemporaryToCanonicalIDMapSchema
>;

export const ProjectCodegenTargetSchema = z.union([
  ProjectCodegenPythonTargetSchema,
  ProjectCodegenPluginTargetSchema,
]);

export type ProjectCodegenTarget = z.infer<typeof ProjectCodegenTargetSchema>;

export type ProjectCodegenTargetInput = z.input<
  typeof ProjectCodegenTargetSchema
>;

export const FollowIdTypeSchema = z.literal(["section", "codeObj"]);

export type FollowIdType = z.infer<typeof FollowIdTypeSchema>;

export type FollowIdTypeInput = z.input<typeof FollowIdTypeSchema>;

export const AppGenerationModeSchema = z.literal([
  "json_render",
  "json_render_with_image",
  "prompt_builder",
  "mcp_server",
]);

export type AppGenerationMode = z.infer<typeof AppGenerationModeSchema>;

export type AppGenerationModeInput = z.input<typeof AppGenerationModeSchema>;

export const InstallerValueSchema = z.literal(["auto", "pip", "uv"]);

export type InstallerValue = z.infer<typeof InstallerValueSchema>;

export type InstallerValueInput = z.input<typeof InstallerValueSchema>;

export const ScopeValueSchema = z.literal([
  "workspace",
  "setta_files",
  "global",
]);

export type ScopeValue = z.infer<typeof ScopeValueSchema>;

export type ScopeValueInput = z.input<typeof ScopeValueSchema>;

export const BaseCanvasSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseCanvasSectionImplArgs = z.infer<
  typeof BaseCanvasSectionImplArgsSchema
>;

export type BaseCanvasSectionImplArgsInput = z.input<
  typeof BaseCanvasSectionImplArgsSchema
>;

export function createBaseCanvasSectionImplArgs(
  options: Partial<BaseCanvasSectionImplArgs> = {},
): BaseCanvasSectionImplArgs {
  return BaseCanvasSectionImplArgsSchema.parse(options);
}

export const BaseCanvasSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseCanvasSectionImplArgsWithCallable = z.infer<
  typeof BaseCanvasSectionImplArgsWithCallableSchema
>;

export type BaseCanvasSectionImplArgsWithCallableInput = z.input<
  typeof BaseCanvasSectionImplArgsWithCallableSchema
>;

export function createBaseCanvasSectionImplArgsWithCallable(
  options: Partial<BaseCanvasSectionImplArgsWithCallable> = {},
): BaseCanvasSectionImplArgsWithCallable {
  return BaseCanvasSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type BaseChildlessCodeObjImplArgs = z.infer<
  typeof BaseChildlessCodeObjImplArgsSchema
>;

export type BaseChildlessCodeObjImplArgsInput = z.input<
  typeof BaseChildlessCodeObjImplArgsSchema
>;

export function createBaseChildlessCodeObjImplArgs(
  options: Partial<BaseChildlessCodeObjImplArgs> = {},
): BaseChildlessCodeObjImplArgs {
  return BaseChildlessCodeObjImplArgsSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
});

export type BaseChildlessCodeObjImplArgsWithCallable = z.infer<
  typeof BaseChildlessCodeObjImplArgsWithCallableSchema
>;

export type BaseChildlessCodeObjImplArgsWithCallableInput = z.input<
  typeof BaseChildlessCodeObjImplArgsWithCallableSchema
>;

export function createBaseChildlessCodeObjImplArgsWithCallable(
  options: Partial<BaseChildlessCodeObjImplArgsWithCallable> = {},
): BaseChildlessCodeObjImplArgsWithCallable {
  return BaseChildlessCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseCodeObjImplArgs = z.infer<typeof BaseCodeObjImplArgsSchema>;

export type BaseCodeObjImplArgsInput = z.input<
  typeof BaseCodeObjImplArgsSchema
>;

export function createBaseCodeObjImplArgs(
  options: Partial<BaseCodeObjImplArgs> = {},
): BaseCodeObjImplArgs {
  return BaseCodeObjImplArgsSchema.parse(options);
}

export const BaseCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseCodeObjImplArgsWithCallable = z.infer<
  typeof BaseCodeObjImplArgsWithCallableSchema
>;

export type BaseCodeObjImplArgsWithCallableInput = z.input<
  typeof BaseCodeObjImplArgsWithCallableSchema
>;

export function createBaseCodeObjImplArgsWithCallable(
  options: Partial<BaseCodeObjImplArgsWithCallable> = {},
): BaseCodeObjImplArgsWithCallable {
  return BaseCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseCodeSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
});

export type BaseCodeSectionImplArgs = z.infer<
  typeof BaseCodeSectionImplArgsSchema
>;

export type BaseCodeSectionImplArgsInput = z.input<
  typeof BaseCodeSectionImplArgsSchema
>;

export function createBaseCodeSectionImplArgs(
  options: Partial<BaseCodeSectionImplArgs> = {},
): BaseCodeSectionImplArgs {
  return BaseCodeSectionImplArgsSchema.parse(options);
}

export const BaseCodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null(), z.any()]).optional(),
});

export type BaseCodeSectionImplArgsWithCallable = z.infer<
  typeof BaseCodeSectionImplArgsWithCallableSchema
>;

export type BaseCodeSectionImplArgsWithCallableInput = z.input<
  typeof BaseCodeSectionImplArgsWithCallableSchema
>;

export function createBaseCodeSectionImplArgsWithCallable(
  options: Partial<BaseCodeSectionImplArgsWithCallable> = {},
): BaseCodeSectionImplArgsWithCallable {
  return BaseCodeSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseDictSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type BaseDictSectionImplArgs = z.infer<
  typeof BaseDictSectionImplArgsSchema
>;

export type BaseDictSectionImplArgsInput = z.input<
  typeof BaseDictSectionImplArgsSchema
>;

export function createBaseDictSectionImplArgs(
  options: Partial<BaseDictSectionImplArgs> = {},
): BaseDictSectionImplArgs {
  return BaseDictSectionImplArgsSchema.parse(options);
}

export const BaseDictSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  selectedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  ignoreTypeErrors: z.union([TypeErrorIgnoreStateSchema, z.any()]).optional(),
  edgeInputParams: z.union([z.array(IDSchema), z.any()]).optional(),
  edgeOutputPorts: z.union([z.array(EdgePortSchema), z.any()]).optional(),
  topLevelParamId: z.union([IDSchema, z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseDictSectionImplArgsWithCallable = z.infer<
  typeof BaseDictSectionImplArgsWithCallableSchema
>;

export type BaseDictSectionImplArgsWithCallableInput = z.input<
  typeof BaseDictSectionImplArgsWithCallableSchema
>;

export function createBaseDictSectionImplArgsWithCallable(
  options: Partial<BaseDictSectionImplArgsWithCallable> = {},
): BaseDictSectionImplArgsWithCallable {
  return BaseDictSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseParamCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
});

export type BaseParamCodeObjImplArgs = z.infer<
  typeof BaseParamCodeObjImplArgsSchema
>;

export type BaseParamCodeObjImplArgsInput = z.input<
  typeof BaseParamCodeObjImplArgsSchema
>;

export function createBaseParamCodeObjImplArgs(
  options: Partial<BaseParamCodeObjImplArgs> = {},
): BaseParamCodeObjImplArgs {
  return BaseParamCodeObjImplArgsSchema.parse(options);
}

export const BaseParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
});

export type BaseParamCodeObjImplArgsWithCallable = z.infer<
  typeof BaseParamCodeObjImplArgsWithCallableSchema
>;

export type BaseParamCodeObjImplArgsWithCallableInput = z.input<
  typeof BaseParamCodeObjImplArgsWithCallableSchema
>;

export function createBaseParamCodeObjImplArgsWithCallable(
  options: Partial<BaseParamCodeObjImplArgsWithCallable> = {},
): BaseParamCodeObjImplArgsWithCallable {
  return BaseParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseParentCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

export type BaseParentCodeObjImplArgs = z.infer<
  typeof BaseParentCodeObjImplArgsSchema
>;

export type BaseParentCodeObjImplArgsInput = z.input<
  typeof BaseParentCodeObjImplArgsSchema
>;

export function createBaseParentCodeObjImplArgs(
  options: Partial<BaseParentCodeObjImplArgs> = {},
): BaseParentCodeObjImplArgs {
  return BaseParentCodeObjImplArgsSchema.parse(options);
}

export const BaseParentCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
});

export type BaseParentCodeObjImplArgsWithCallable = z.infer<
  typeof BaseParentCodeObjImplArgsWithCallableSchema
>;

export type BaseParentCodeObjImplArgsWithCallableInput = z.input<
  typeof BaseParentCodeObjImplArgsWithCallableSchema
>;

export function createBaseParentCodeObjImplArgsWithCallable(
  options: Partial<BaseParentCodeObjImplArgsWithCallable> = {},
): BaseParentCodeObjImplArgsWithCallable {
  return BaseParentCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseParentSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

export type BaseParentSectionImplArgs = z.infer<
  typeof BaseParentSectionImplArgsSchema
>;

export type BaseParentSectionImplArgsInput = z.input<
  typeof BaseParentSectionImplArgsSchema
>;

export function createBaseParentSectionImplArgs(
  options: Partial<BaseParentSectionImplArgs> = {},
): BaseParentSectionImplArgs {
  return BaseParentSectionImplArgsSchema.parse(options);
}

export const BaseParentSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
});

export type BaseParentSectionImplArgsWithCallable = z.infer<
  typeof BaseParentSectionImplArgsWithCallableSchema
>;

export type BaseParentSectionImplArgsWithCallableInput = z.input<
  typeof BaseParentSectionImplArgsWithCallableSchema
>;

export function createBaseParentSectionImplArgsWithCallable(
  options: Partial<BaseParentSectionImplArgsWithCallable> = {},
): BaseParentSectionImplArgsWithCallable {
  return BaseParentSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseSectionImplArgs = z.infer<typeof BaseSectionImplArgsSchema>;

export type BaseSectionImplArgsInput = z.input<
  typeof BaseSectionImplArgsSchema
>;

export function createBaseSectionImplArgs(
  options: Partial<BaseSectionImplArgs> = {},
): BaseSectionImplArgs {
  return BaseSectionImplArgsSchema.parse(options);
}

export const BaseSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseSectionImplArgsWithCallable = z.infer<
  typeof BaseSectionImplArgsWithCallableSchema
>;

export type BaseSectionImplArgsWithCallableInput = z.input<
  typeof BaseSectionImplArgsWithCallableSchema
>;

export function createBaseSectionImplArgsWithCallable(
  options: Partial<BaseSectionImplArgsWithCallable> = {},
): BaseSectionImplArgsWithCallable {
  return BaseSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseSectionWithParamsImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
});

export type BaseSectionWithParamsImplArgs = z.infer<
  typeof BaseSectionWithParamsImplArgsSchema
>;

export type BaseSectionWithParamsImplArgsInput = z.input<
  typeof BaseSectionWithParamsImplArgsSchema
>;

export function createBaseSectionWithParamsImplArgs(
  options: Partial<BaseSectionWithParamsImplArgs> = {},
): BaseSectionWithParamsImplArgs {
  return BaseSectionWithParamsImplArgsSchema.parse(options);
}

export const BaseSectionWithParamsImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  selectedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  ignoreTypeErrors: z.union([TypeErrorIgnoreStateSchema, z.any()]).optional(),
  edgeInputParams: z.union([z.array(IDSchema), z.any()]).optional(),
  edgeOutputPorts: z.union([z.array(EdgePortSchema), z.any()]).optional(),
});

export type BaseSectionWithParamsImplArgsWithCallable = z.infer<
  typeof BaseSectionWithParamsImplArgsWithCallableSchema
>;

export type BaseSectionWithParamsImplArgsWithCallableInput = z.input<
  typeof BaseSectionWithParamsImplArgsWithCallableSchema
>;

export function createBaseSectionWithParamsImplArgsWithCallable(
  options: Partial<BaseSectionWithParamsImplArgsWithCallable> = {},
): BaseSectionWithParamsImplArgsWithCallable {
  return BaseSectionWithParamsImplArgsWithCallableSchema.parse(options);
}

export const BrowserSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Browser"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  folder: z.union([z.string(), z.any()]).optional(),
  hideColumn: z.union([z.boolean(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  typesColumnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  viewMode: z.union([z.enum(BrowserAreaViewModeEnum), z.any()]).optional(),
  savedSearches: z
    .union([z.array(BrowserSavedSearchSchema), z.any()])
    .optional(),
});

export type BrowserSectionImplArgsWithCallable = z.infer<
  typeof BrowserSectionImplArgsWithCallableSchema
>;

export type BrowserSectionImplArgsWithCallableInput = z.input<
  typeof BrowserSectionImplArgsWithCallableSchema
>;

export function createBrowserSectionImplArgsWithCallable(
  options: Partial<BrowserSectionImplArgsWithCallable> = {},
): BrowserSectionImplArgsWithCallable {
  return BrowserSectionImplArgsWithCallableSchema.parse(options);
}

export const ButtonParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ButtonParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  label: z.union([z.string(), z.any()]).optional(),
  actionMode: z.union([z.enum(ButtonActionModeEnum), z.any()]).optional(),
  requestMethod: z.union([z.enum(HttpRequestMethodEnum), z.any()]).optional(),
  requestUrl: z.union([z.string(), z.any()]).optional(),
  requestHeaderKey: z.union([z.string(), z.any()]).optional(),
  requestHeaderValue: z.union([z.string(), z.any()]).optional(),
  requestBody: z.union([z.string(), z.any()]).optional(),
});

export type ButtonParamCodeObjImplArgsWithCallable = z.infer<
  typeof ButtonParamCodeObjImplArgsWithCallableSchema
>;

export type ButtonParamCodeObjImplArgsWithCallableInput = z.input<
  typeof ButtonParamCodeObjImplArgsWithCallableSchema
>;

export function createButtonParamCodeObjImplArgsWithCallable(
  options: Partial<ButtonParamCodeObjImplArgsWithCallable> = {},
): ButtonParamCodeObjImplArgsWithCallable {
  return ButtonParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CallableSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Callable"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  selectedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  ignoreTypeErrors: z.union([TypeErrorIgnoreStateSchema, z.any()]).optional(),
  edgeInputParams: z.union([z.array(IDSchema), z.any()]).optional(),
  edgeOutputPorts: z.union([z.array(EdgePortSchema), z.any()]).optional(),
  callable: z.union([IDSchema, z.null(), z.any()]).optional(),
  hideParams: z.union([z.boolean(), z.any()]).optional(),
});

export type CallableSectionImplArgsWithCallable = z.infer<
  typeof CallableSectionImplArgsWithCallableSchema
>;

export type CallableSectionImplArgsWithCallableInput = z.input<
  typeof CallableSectionImplArgsWithCallableSchema
>;

export function createCallableSectionImplArgsWithCallable(
  options: Partial<CallableSectionImplArgsWithCallable> = {},
): CallableSectionImplArgsWithCallable {
  return CallableSectionImplArgsWithCallableSchema.parse(options);
}

export const ChartSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chart"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  dataPath: z.union([z.string(), z.any()]).optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema, z.any()])
    .optional(),
});

export type ChartSectionImplArgsWithCallable = z.infer<
  typeof ChartSectionImplArgsWithCallableSchema
>;

export type ChartSectionImplArgsWithCallableInput = z.input<
  typeof ChartSectionImplArgsWithCallableSchema
>;

export function createChartSectionImplArgsWithCallable(
  options: Partial<ChartSectionImplArgsWithCallable> = {},
): ChartSectionImplArgsWithCallable {
  return ChartSectionImplArgsWithCallableSchema.parse(options);
}

export const ChatSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chat"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  managed: z.union([z.boolean(), z.any()]).optional(),
  engineConfigId: z.union([IDSchema, z.null(), z.any()]).optional(),
  agentProfileId: z.union([IDSchema, z.null(), z.any()]).optional(),
  chatId: z.union([IDSchema, z.null(), z.any()]).optional(),
  thinking: z.union([z.boolean(), z.any()]).optional(),
  messages: z
    .union([
      z.array(
        z.union([
          SystemChatMessageSchema,
          AssistantChatMessageSchema,
          UserChatMessageSchema,
          ToolChatMessageSchema,
        ]),
      ),
      z.any(),
    ])
    .optional(),
  inputText: z.union([z.string(), z.any()]).optional(),
  waitingForResponse: z.union([z.boolean(), z.any()]).optional(),
  toolCallArguments: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  activeBranchId: z.union([IDSchema, z.null(), z.any()]).optional(),
  branches: z
    .union([z.record(IDSchema, ChatSectionBranchSchema), z.any()])
    .optional(),
});

export type ChatSectionImplArgsWithCallable = z.infer<
  typeof ChatSectionImplArgsWithCallableSchema
>;

export type ChatSectionImplArgsWithCallableInput = z.input<
  typeof ChatSectionImplArgsWithCallableSchema
>;

export function createChatSectionImplArgsWithCallable(
  options: Partial<ChatSectionImplArgsWithCallable> = {},
): ChatSectionImplArgsWithCallable {
  return ChatSectionImplArgsWithCallableSchema.parse(options);
}

export const CodeCallableCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("CodeCallable"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
});

export type CodeCallableCodeObjImplArgsWithCallable = z.infer<
  typeof CodeCallableCodeObjImplArgsWithCallableSchema
>;

export type CodeCallableCodeObjImplArgsWithCallableInput = z.input<
  typeof CodeCallableCodeObjImplArgsWithCallableSchema
>;

export function createCodeCallableCodeObjImplArgsWithCallable(
  options: Partial<CodeCallableCodeObjImplArgsWithCallable> = {},
): CodeCallableCodeObjImplArgsWithCallable {
  return CodeCallableCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CodeParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("CodeParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
});

export type CodeParamCodeObjImplArgsWithCallable = z.infer<
  typeof CodeParamCodeObjImplArgsWithCallableSchema
>;

export type CodeParamCodeObjImplArgsWithCallableInput = z.input<
  typeof CodeParamCodeObjImplArgsWithCallableSchema
>;

export function createCodeParamCodeObjImplArgsWithCallable(
  options: Partial<CodeParamCodeObjImplArgsWithCallable> = {},
): CodeParamCodeObjImplArgsWithCallable {
  return CodeParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Code"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null(), z.any()]).optional(),
  codeLanguage: z
    .union([z.enum(CodeLanguageEnum), z.string(), z.any()])
    .optional(),
  diagnosticsIgnoreState: z
    .union([CodeSectionDiagnosticsIgnoreStateSchema, z.any()])
    .optional(),
});

export type CodeSectionImplArgsWithCallable = z.infer<
  typeof CodeSectionImplArgsWithCallableSchema
>;

export type CodeSectionImplArgsWithCallableInput = z.input<
  typeof CodeSectionImplArgsWithCallableSchema
>;

export function createCodeSectionImplArgsWithCallable(
  options: Partial<CodeSectionImplArgsWithCallable> = {},
): CodeSectionImplArgsWithCallable {
  return CodeSectionImplArgsWithCallableSchema.parse(options);
}

export const ColorPickerParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ColorPickerParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  colorChoices: z.union([z.array(ColorPickerChoiceSchema), z.any()]).optional(),
});

export type ColorPickerParamCodeObjImplArgsWithCallable = z.infer<
  typeof ColorPickerParamCodeObjImplArgsWithCallableSchema
>;

export type ColorPickerParamCodeObjImplArgsWithCallableInput = z.input<
  typeof ColorPickerParamCodeObjImplArgsWithCallableSchema
>;

export function createColorPickerParamCodeObjImplArgsWithCallable(
  options: Partial<ColorPickerParamCodeObjImplArgsWithCallable> = {},
): ColorPickerParamCodeObjImplArgsWithCallable {
  return ColorPickerParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const DictSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Dict"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  selectedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  ignoreTypeErrors: z.union([TypeErrorIgnoreStateSchema, z.any()]).optional(),
  edgeInputParams: z.union([z.array(IDSchema), z.any()]).optional(),
  edgeOutputPorts: z.union([z.array(EdgePortSchema), z.any()]).optional(),
  topLevelParamId: z.union([IDSchema, z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type DictSectionImplArgsWithCallable = z.infer<
  typeof DictSectionImplArgsWithCallableSchema
>;

export type DictSectionImplArgsWithCallableInput = z.input<
  typeof DictSectionImplArgsWithCallableSchema
>;

export function createDictSectionImplArgsWithCallable(
  options: Partial<DictSectionImplArgsWithCallable> = {},
): DictSectionImplArgsWithCallable {
  return DictSectionImplArgsWithCallableSchema.parse(options);
}

export const DrawSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Draw"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  layers: z.union([z.array(DrawAreaLayerSchema), z.any()]).optional(),
  renderedImagePath: z.union([z.string(), z.null(), z.any()]).optional(),
  activeLayerIdx: z.union([z.int(), z.any()]).optional(),
  brushColor: z.union([z.string(), z.any()]).optional(),
  brushSize: z.union([z.int(), z.any()]).optional(),
  brushShape: z.union([z.enum(DrawAreaBrushShapeEnum), z.any()]).optional(),
  brushOpacity: z.union([z.number(), z.any()]).optional(),
  eraserBrushSize: z.union([z.int(), z.any()]).optional(),
  drawThrottleDelay: z.union([z.int(), z.any()]).optional(),
  canvasMode: z.union([z.enum(DrawAreaModeEnum), z.any()]).optional(),
  colorChoices: z.union([z.array(ColorPickerChoiceSchema), z.any()]).optional(),
});

export type DrawSectionImplArgsWithCallable = z.infer<
  typeof DrawSectionImplArgsWithCallableSchema
>;

export type DrawSectionImplArgsWithCallableInput = z.input<
  typeof DrawSectionImplArgsWithCallableSchema
>;

export function createDrawSectionImplArgsWithCallable(
  options: Partial<DrawSectionImplArgsWithCallable> = {},
): DrawSectionImplArgsWithCallable {
  return DrawSectionImplArgsWithCallableSchema.parse(options);
}

export const DropdownParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("DropdownParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  choices: z.union([z.array(z.string()), z.any()]).optional(),
});

export type DropdownParamCodeObjImplArgsWithCallable = z.infer<
  typeof DropdownParamCodeObjImplArgsWithCallableSchema
>;

export type DropdownParamCodeObjImplArgsWithCallableInput = z.input<
  typeof DropdownParamCodeObjImplArgsWithCallableSchema
>;

export function createDropdownParamCodeObjImplArgsWithCallable(
  options: Partial<DropdownParamCodeObjImplArgsWithCallable> = {},
): DropdownParamCodeObjImplArgsWithCallable {
  return DropdownParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const DropzoneParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("DropzoneParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  mode: z.union([z.enum(DropzoneModeEnum), z.any()]).optional(),
  maxAttachments: z.union([z.int(), z.null(), z.any()]).optional(),
  placeholder: z.union([z.string(), z.any()]).optional(),
});

export type DropzoneParamCodeObjImplArgsWithCallable = z.infer<
  typeof DropzoneParamCodeObjImplArgsWithCallableSchema
>;

export type DropzoneParamCodeObjImplArgsWithCallableInput = z.input<
  typeof DropzoneParamCodeObjImplArgsWithCallableSchema
>;

export function createDropzoneParamCodeObjImplArgsWithCallable(
  options: Partial<DropzoneParamCodeObjImplArgsWithCallable> = {},
): DropzoneParamCodeObjImplArgsWithCallable {
  return DropzoneParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const GenPythonCodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GenPythonCode"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null(), z.any()]).optional(),
});

export type GenPythonCodeSectionImplArgsWithCallable = z.infer<
  typeof GenPythonCodeSectionImplArgsWithCallableSchema
>;

export type GenPythonCodeSectionImplArgsWithCallableInput = z.input<
  typeof GenPythonCodeSectionImplArgsWithCallableSchema
>;

export function createGenPythonCodeSectionImplArgsWithCallable(
  options: Partial<GenPythonCodeSectionImplArgsWithCallable> = {},
): GenPythonCodeSectionImplArgsWithCallable {
  return GenPythonCodeSectionImplArgsWithCallableSchema.parse(options);
}

export const GenPythonMetadataSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GenPythonMetadata"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null(), z.any()]).optional(),
});

export type GenPythonMetadataSectionImplArgsWithCallable = z.infer<
  typeof GenPythonMetadataSectionImplArgsWithCallableSchema
>;

export type GenPythonMetadataSectionImplArgsWithCallableInput = z.input<
  typeof GenPythonMetadataSectionImplArgsWithCallableSchema
>;

export function createGenPythonMetadataSectionImplArgsWithCallable(
  options: Partial<GenPythonMetadataSectionImplArgsWithCallable> = {},
): GenPythonMetadataSectionImplArgsWithCallable {
  return GenPythonMetadataSectionImplArgsWithCallableSchema.parse(options);
}

export const GlobalVariablesSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GlobalVariables"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  selectedParams: z.union([z.array(IDSchema), z.any()]).optional(),
  ignoreTypeErrors: z.union([TypeErrorIgnoreStateSchema, z.any()]).optional(),
  edgeInputParams: z.union([z.array(IDSchema), z.any()]).optional(),
  edgeOutputPorts: z.union([z.array(EdgePortSchema), z.any()]).optional(),
  topLevelParamId: z.union([IDSchema, z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type GlobalVariablesSectionImplArgsWithCallable = z.infer<
  typeof GlobalVariablesSectionImplArgsWithCallableSchema
>;

export type GlobalVariablesSectionImplArgsWithCallableInput = z.input<
  typeof GlobalVariablesSectionImplArgsWithCallableSchema
>;

export function createGlobalVariablesSectionImplArgsWithCallable(
  options: Partial<GlobalVariablesSectionImplArgsWithCallable> = {},
): GlobalVariablesSectionImplArgsWithCallable {
  return GlobalVariablesSectionImplArgsWithCallableSchema.parse(options);
}

export const GroupSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Group"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
  isHorizontalOrientation: z.union([z.boolean(), z.any()]).optional(),
  overflowMode: z.union([z.boolean(), z.any()]).optional(),
});

export type GroupSectionImplArgsWithCallable = z.infer<
  typeof GroupSectionImplArgsWithCallableSchema
>;

export type GroupSectionImplArgsWithCallableInput = z.input<
  typeof GroupSectionImplArgsWithCallableSchema
>;

export function createGroupSectionImplArgsWithCallable(
  options: Partial<GroupSectionImplArgsWithCallable> = {},
): GroupSectionImplArgsWithCallable {
  return GroupSectionImplArgsWithCallableSchema.parse(options);
}

export const IFrameSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("IFrame"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type IFrameSectionImplArgsWithCallable = z.infer<
  typeof IFrameSectionImplArgsWithCallableSchema
>;

export type IFrameSectionImplArgsWithCallableInput = z.input<
  typeof IFrameSectionImplArgsWithCallableSchema
>;

export function createIFrameSectionImplArgsWithCallable(
  options: Partial<IFrameSectionImplArgsWithCallable> = {},
): IFrameSectionImplArgsWithCallable {
  return IFrameSectionImplArgsWithCallableSchema.parse(options);
}

export const ImageSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Image"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  imagePath: z.union([z.string(), z.any()]).optional(),
});

export type ImageSectionImplArgsWithCallable = z.infer<
  typeof ImageSectionImplArgsWithCallableSchema
>;

export type ImageSectionImplArgsWithCallableInput = z.input<
  typeof ImageSectionImplArgsWithCallableSchema
>;

export function createImageSectionImplArgsWithCallable(
  options: Partial<ImageSectionImplArgsWithCallable> = {},
): ImageSectionImplArgsWithCallable {
  return ImageSectionImplArgsWithCallableSchema.parse(options);
}

export const ListRootSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ListRoot"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
});

export type ListRootSectionImplArgsWithCallable = z.infer<
  typeof ListRootSectionImplArgsWithCallableSchema
>;

export type ListRootSectionImplArgsWithCallableInput = z.input<
  typeof ListRootSectionImplArgsWithCallableSchema
>;

export function createListRootSectionImplArgsWithCallable(
  options: Partial<ListRootSectionImplArgsWithCallable> = {},
): ListRootSectionImplArgsWithCallable {
  return ListRootSectionImplArgsWithCallableSchema.parse(options);
}

export const MetaControlSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("MetaControl"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  metaControlParamId: z.union([IDSchema, z.null(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(IDSchema, IDSchema), z.any()])
    .optional(),
  showSectionTitle: z.union([z.boolean(), z.any()]).optional(),
});

export type MetaControlSectionImplArgsWithCallable = z.infer<
  typeof MetaControlSectionImplArgsWithCallableSchema
>;

export type MetaControlSectionImplArgsWithCallableInput = z.input<
  typeof MetaControlSectionImplArgsWithCallableSchema
>;

export function createMetaControlSectionImplArgsWithCallable(
  options: Partial<MetaControlSectionImplArgsWithCallable> = {},
): MetaControlSectionImplArgsWithCallable {
  return MetaControlSectionImplArgsWithCallableSchema.parse(options);
}

export const NestedParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("NestedParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  children: z.union([z.array(IDSchema), z.any()]).optional(),
});

export type NestedParamCodeObjImplArgsWithCallable = z.infer<
  typeof NestedParamCodeObjImplArgsWithCallableSchema
>;

export type NestedParamCodeObjImplArgsWithCallableInput = z.input<
  typeof NestedParamCodeObjImplArgsWithCallableSchema
>;

export function createNestedParamCodeObjImplArgsWithCallable(
  options: Partial<NestedParamCodeObjImplArgsWithCallable> = {},
): NestedParamCodeObjImplArgsWithCallable {
  return NestedParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const PasswordParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("PasswordParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  hasSecret: z.union([z.boolean(), z.any()]).optional(),
});

export type PasswordParamCodeObjImplArgsWithCallable = z.infer<
  typeof PasswordParamCodeObjImplArgsWithCallableSchema
>;

export type PasswordParamCodeObjImplArgsWithCallableInput = z.input<
  typeof PasswordParamCodeObjImplArgsWithCallableSchema
>;

export function createPasswordParamCodeObjImplArgsWithCallable(
  options: Partial<PasswordParamCodeObjImplArgsWithCallable> = {},
): PasswordParamCodeObjImplArgsWithCallable {
  return PasswordParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const PluginSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Plugin"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  pluginId: z.union([z.string(), z.any()]).optional(),
  kind: z.union([z.string(), z.any()]).optional(),
  data: z.union([z.record(z.string(), z.any()), z.any()]).optional(),
  schemaVersion: z.union([z.int(), z.null(), z.any()]).optional(),
});

export type PluginSectionImplArgsWithCallable = z.infer<
  typeof PluginSectionImplArgsWithCallableSchema
>;

export type PluginSectionImplArgsWithCallableInput = z.input<
  typeof PluginSectionImplArgsWithCallableSchema
>;

export function createPluginSectionImplArgsWithCallable(
  options: Partial<PluginSectionImplArgsWithCallable> = {},
): PluginSectionImplArgsWithCallable {
  return PluginSectionImplArgsWithCallableSchema.parse(options);
}

export const PromptSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Prompt"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  template: z.union([z.string(), z.any()]).optional(),
  format: z.union([z.enum(PromptFormatEnum), z.any()]).optional(),
  inputs: z.union([z.record(z.string(), z.string()), z.any()]).optional(),
  renderedText: z.union([z.string(), z.any()]).optional(),
  missingVariables: z.union([z.array(z.string()), z.any()]).optional(),
  renderError: z.union([z.string(), z.null(), z.any()]).optional(),
});

export type PromptSectionImplArgsWithCallable = z.infer<
  typeof PromptSectionImplArgsWithCallableSchema
>;

export type PromptSectionImplArgsWithCallableInput = z.input<
  typeof PromptSectionImplArgsWithCallableSchema
>;

export function createPromptSectionImplArgsWithCallable(
  options: Partial<PromptSectionImplArgsWithCallable> = {},
): PromptSectionImplArgsWithCallable {
  return PromptSectionImplArgsWithCallableSchema.parse(options);
}

export const RotaryParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("RotaryParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  min: z.union([z.number(), z.any()]).optional(),
  max: z.union([z.number(), z.any()]).optional(),
  step: z.union([z.number(), z.any()]).optional(),
});

export type RotaryParamCodeObjImplArgsWithCallable = z.infer<
  typeof RotaryParamCodeObjImplArgsWithCallableSchema
>;

export type RotaryParamCodeObjImplArgsWithCallableInput = z.input<
  typeof RotaryParamCodeObjImplArgsWithCallableSchema
>;

export function createRotaryParamCodeObjImplArgsWithCallable(
  options: Partial<RotaryParamCodeObjImplArgsWithCallable> = {},
): RotaryParamCodeObjImplArgsWithCallable {
  return RotaryParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const SliderParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("SliderParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
  min: z.union([z.int(), z.any()]).optional(),
  max: z.union([z.int(), z.any()]).optional(),
  step: z.union([z.int(), z.any()]).optional(),
});

export type SliderParamCodeObjImplArgsWithCallable = z.infer<
  typeof SliderParamCodeObjImplArgsWithCallableSchema
>;

export type SliderParamCodeObjImplArgsWithCallableInput = z.input<
  typeof SliderParamCodeObjImplArgsWithCallableSchema
>;

export function createSliderParamCodeObjImplArgsWithCallable(
  options: Partial<SliderParamCodeObjImplArgsWithCallable> = {},
): SliderParamCodeObjImplArgsWithCallable {
  return SliderParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const SocialSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Social"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  url: z.union([z.string(), z.any()]).optional(),
});

export type SocialSectionImplArgsWithCallable = z.infer<
  typeof SocialSectionImplArgsWithCallableSchema
>;

export type SocialSectionImplArgsWithCallableInput = z.input<
  typeof SocialSectionImplArgsWithCallableSchema
>;

export function createSocialSectionImplArgsWithCallable(
  options: Partial<SocialSectionImplArgsWithCallable> = {},
): SocialSectionImplArgsWithCallable {
  return SocialSectionImplArgsWithCallableSchema.parse(options);
}

export const SwitchParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("SwitchParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
});

export type SwitchParamCodeObjImplArgsWithCallable = z.infer<
  typeof SwitchParamCodeObjImplArgsWithCallableSchema
>;

export type SwitchParamCodeObjImplArgsWithCallableInput = z.input<
  typeof SwitchParamCodeObjImplArgsWithCallableSchema
>;

export function createSwitchParamCodeObjImplArgsWithCallable(
  options: Partial<SwitchParamCodeObjImplArgsWithCallable> = {},
): SwitchParamCodeObjImplArgsWithCallable {
  return SwitchParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const TerminalSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Terminal"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type TerminalSectionImplArgsWithCallable = z.infer<
  typeof TerminalSectionImplArgsWithCallableSchema
>;

export type TerminalSectionImplArgsWithCallableInput = z.input<
  typeof TerminalSectionImplArgsWithCallableSchema
>;

export function createTerminalSectionImplArgsWithCallable(
  options: Partial<TerminalSectionImplArgsWithCallable> = {},
): TerminalSectionImplArgsWithCallable {
  return TerminalSectionImplArgsWithCallableSchema.parse(options);
}

export const TextAreaParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextAreaParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
});

export type TextAreaParamCodeObjImplArgsWithCallable = z.infer<
  typeof TextAreaParamCodeObjImplArgsWithCallableSchema
>;

export type TextAreaParamCodeObjImplArgsWithCallableInput = z.input<
  typeof TextAreaParamCodeObjImplArgsWithCallableSchema
>;

export function createTextAreaParamCodeObjImplArgsWithCallable(
  options: Partial<TextAreaParamCodeObjImplArgsWithCallable> = {},
): TextAreaParamCodeObjImplArgsWithCallable {
  return TextAreaParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const TextBlockSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextBlock"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  tagColor: z.union([z.string(), z.null(), z.any()]).optional(),
  styleColor: z.union([z.string(), z.null(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  format: z.union([z.enum(TextBlockFormatEnum), z.any()]).optional(),
  headingAsSectionName: z.union([z.boolean(), z.any()]).optional(),
  metaControlStyle: z.union([z.boolean(), z.any()]).optional(),
  textDisplayMode: z
    .union([z.enum(TextBlockDisplayModeEnum), z.any()])
    .optional(),
  text: z.union([z.string(), z.any()]).optional(),
});

export type TextBlockSectionImplArgsWithCallable = z.infer<
  typeof TextBlockSectionImplArgsWithCallableSchema
>;

export type TextBlockSectionImplArgsWithCallableInput = z.input<
  typeof TextBlockSectionImplArgsWithCallableSchema
>;

export function createTextBlockSectionImplArgsWithCallable(
  options: Partial<TextBlockSectionImplArgsWithCallable> = {},
): TextBlockSectionImplArgsWithCallable {
  return TextBlockSectionImplArgsWithCallableSchema.parse(options);
}

export const TextParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextParam"), z.any()]).optional(),
  id: z.union([IDSchema, z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  defaultVal: z.union([z.string(), z.any()]).optional(),
  value: z.union([z.string(), z.any()]).optional(),
});

export type TextParamCodeObjImplArgsWithCallable = z.infer<
  typeof TextParamCodeObjImplArgsWithCallableSchema
>;

export type TextParamCodeObjImplArgsWithCallableInput = z.input<
  typeof TextParamCodeObjImplArgsWithCallableSchema
>;

export function createTextParamCodeObjImplArgsWithCallable(
  options: Partial<TextParamCodeObjImplArgsWithCallable> = {},
): TextParamCodeObjImplArgsWithCallable {
  return TextParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CoreArgsSchema = z.object({
  id: IDSchema.optional(),
  name: z.string().optional(),
  displayName: z.string().optional(),
  variants: z.array(IDSchema).optional(),
  defaultVariant: z.union([IDSchema, z.null()]).optional(),
  sharedModifier: SharedModifierSchema.optional(),
  unsharedKeys: z
    .array(
      z.literal([
        "actionMode",
        "activeBranchId",
        "activeLayerIdx",
        "agentProfileId",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "attachedTerminalSectionId",
        "branches",
        "brushColor",
        "brushOpacity",
        "brushShape",
        "brushSize",
        "callable",
        "canvasMode",
        "chartSettings",
        "chatId",
        "children",
        "choices",
        "code",
        "codeFileBinding",
        "codeLanguage",
        "codeObjVariantMap",
        "colorChoices",
        "columnWidth",
        "configLanguage",
        "coreNameEditable",
        "coreNameType",
        "data",
        "dataPath",
        "defaultVal",
        "description",
        "diagnosticsIgnoreState",
        "drawThrottleDelay",
        "edgeInputParams",
        "edgeOutputPorts",
        "engineConfigId",
        "eraserBrushSize",
        "folder",
        "format",
        "hasSecret",
        "headingAsSectionName",
        "hideColumn",
        "hideParams",
        "hideUnpinnedParams",
        "id",
        "ignoreTypeErrors",
        "imagePath",
        "inputText",
        "inputs",
        "isFrozen",
        "isHorizontalOrientation",
        "isInOtherProjectConfigs",
        "isJsonSource",
        "isMinimized",
        "isPreset",
        "jsonSourceKeys",
        "jsonSourceMissing",
        "kind",
        "label",
        "layers",
        "managed",
        "max",
        "maxAttachments",
        "messages",
        "metaControlParamId",
        "metaControlStyle",
        "min",
        "missingVariables",
        "mode",
        "name",
        "overflowMode",
        "paramFilter",
        "passingStyle",
        "pinnedParams",
        "placeholder",
        "pluginId",
        "positionAndSizeLocked",
        "renderError",
        "renderedImagePath",
        "renderedText",
        "requestBody",
        "requestHeaderKey",
        "requestHeaderValue",
        "requestMethod",
        "requestUrl",
        "savedSearches",
        "schemaVersion",
        "selectedParams",
        "showSectionTitle",
        "size",
        "step",
        "styleColor",
        "tagColor",
        "template",
        "text",
        "textDisplayMode",
        "thinking",
        "toolCallArguments",
        "topLevelParamId",
        "type",
        "typesColumnWidth",
        "url",
        "value",
        "viewMode",
        "waitingForResponse",
      ]),
    )
    .optional(),
});

export type CoreArgs = z.infer<typeof CoreArgsSchema>;

export type CoreArgsInput = z.input<typeof CoreArgsSchema>;

export function createCoreArgs(options: Partial<CoreArgs> = {}): CoreArgs {
  return CoreArgsSchema.parse(options);
}

export const ProjectConfigArgsSchema = z.object({
  id: IDSchema.optional(),
  name: z.string().optional(),
  showParamDisplayNames: z.boolean().optional(),
  allowJsonSourceKeyEdits: z.boolean().optional(),
  previewImgColor: z.string().optional(),
  viewport: z.union([ViewportSchema, z.null()]).optional(),
  viewportInitialized: z.boolean().optional(),
  viewModes: z.record(IDSchema, ViewModeConfigSchema).optional(),
  activeViewModeId: z.union([IDSchema, z.null()]).optional(),
  isEditingViewMode: z.boolean().optional(),
  codegenTargets: z
    .array(
      z.union([
        ProjectCodegenPythonTargetSchema,
        ProjectCodegenPluginTargetSchema,
      ]),
    )
    .optional(),
  entryCodeBlockId: z.union([IDSchema, z.null()]).optional(),
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema).optional(),
  sectionVariantMap: z.record(IDSchema, IDSchema).optional(),
  activeIds: z.array(IDSchema).optional(),
  edges: z.array(EdgeSchema).optional(),
  agenticEdges: z.array(AgenticEdgeSchema).optional(),
  watchCodeEnabled: z.boolean().optional(),
  watchCodeFolders: z.array(WatchCodeFolderSchema).optional(),
  watchCodeFiles: z.array(z.string()).optional(),
  watchCodeRegistry: z
    .record(z.string(), WatchCodeRegistryEntrySchema)
    .optional(),
  watchCodeBaselineByPath: z.record(z.string(), z.array(z.string())).optional(),
});

export type ProjectConfigArgs = z.infer<typeof ProjectConfigArgsSchema>;

export type ProjectConfigArgsInput = z.input<typeof ProjectConfigArgsSchema>;

export function createProjectConfigArgs(
  options: Partial<ProjectConfigArgs> = {},
): ProjectConfigArgs {
  return ProjectConfigArgsSchema.parse(options);
}

export const FolderContentItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  fullPath: z.string(),
  mtime: z.number().optional(),
  size: z.int().optional(),
});

export type FolderContentItem = z.infer<typeof FolderContentItemSchema>;

export type FolderContentItemInput = z.input<typeof FolderContentItemSchema>;

export function createFolderContentItem(
  options: Partial<FolderContentItem> = {},
): FolderContentItem {
  return FolderContentItemSchema.parse(options);
}

export const RunEventSchema = z.object({
  id: IDSchema.default(create_new_id),
  timestamp: z.iso.datetime().default(get_now_timestamp),
  type: z.string(),
  payload: z.record(z.string(), z.any()).default({}),
});

export type RunEvent = z.infer<typeof RunEventSchema>;

export type RunEventInput = z.input<typeof RunEventSchema>;

export function createRunEvent(options: Partial<RunEvent> = {}): RunEvent {
  return RunEventSchema.parse(options);
}

export const AgentRunSchema = z.object({
  id: IDSchema.default(create_new_id),
  profileId: z.union([IDSchema, z.null()]).default(null),
  status: z.enum(AgentRunStatusEnum).default(AgentRunStatusEnum.queued),
  startedAt: z.union([z.iso.datetime(), z.null()]).default(null),
  finishedAt: z.union([z.iso.datetime(), z.null()]).default(null),
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  outputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  toolCalls: z.array(z.record(z.string(), z.any())).default([]),
  cost: z.union([z.number(), z.null()]).default(null),
  events: z.array(RunEventSchema).default([]),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

export type AgentRunInput = z.input<typeof AgentRunSchema>;

export function createAgentRun(options: Partial<AgentRun> = {}): AgentRun {
  return AgentRunSchema.parse(options);
}

export const AgentRunListSchema = z.object({
  runs: z.array(AgentRunSchema),
});

export type AgentRunList = z.infer<typeof AgentRunListSchema>;

export type AgentRunListInput = z.input<typeof AgentRunListSchema>;

export function createAgentRunList(
  options: Partial<AgentRunList> = {},
): AgentRunList {
  return AgentRunListSchema.parse(options);
}

export const RunChainStepSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default("" as const),
  engineConfigId: IDSchema,
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  prompt: z.union([z.string(), z.null()]).default(null),
  messages: z
    .union([z.array(z.record(z.string(), z.any())), z.null()])
    .default(null),
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  includePreviousOutputs: z.boolean().default(true),
});

export type RunChainStep = z.infer<typeof RunChainStepSchema>;

export type RunChainStepInput = z.input<typeof RunChainStepSchema>;

export function createRunChainStep(
  options: Partial<RunChainStep> = {},
): RunChainStep {
  return RunChainStepSchema.parse(options);
}

export const RunChainSpecSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default("" as const),
  steps: z.array(RunChainStepSchema),
  stopOnFailure: z.boolean().default(true),
});

export type RunChainSpec = z.infer<typeof RunChainSpecSchema>;

export type RunChainSpecInput = z.input<typeof RunChainSpecSchema>;

export function createRunChainSpec(
  options: Partial<RunChainSpec> = {},
): RunChainSpec {
  return RunChainSpecSchema.parse(options);
}

export const AgenticSummaryCacheStatusSchema = z.object({
  maxSummariesPerRun: z.int(),
  summarySectionIds: z.array(IDSchema).default([]),
  cachedSectionIds: z.array(IDSchema).default([]),
  missingSectionIds: z.array(IDSchema).default([]),
  emptySourceSectionIds: z.array(IDSchema).default([]),
  consideredSectionIds: z.array(IDSchema).default([]),
  wouldAttemptSectionIds: z.array(IDSchema).default([]),
});

export type AgenticSummaryCacheStatus = z.infer<
  typeof AgenticSummaryCacheStatusSchema
>;

export type AgenticSummaryCacheStatusInput = z.input<
  typeof AgenticSummaryCacheStatusSchema
>;

export function createAgenticSummaryCacheStatus(
  options: Partial<AgenticSummaryCacheStatus> = {},
): AgenticSummaryCacheStatus {
  return AgenticSummaryCacheStatusSchema.parse(options);
}

export const AppRouteSchema = z.object({
  path: z.string(),
  name: z.union([z.string(), z.null()]).default(null),
  rootKey: z.union([z.string(), z.null()]).default(null),
});

export type AppRoute = z.infer<typeof AppRouteSchema>;

export type AppRouteInput = z.input<typeof AppRouteSchema>;

export function createAppRoute(options: Partial<AppRoute> = {}): AppRoute {
  return AppRouteSchema.parse(options);
}

export const AppDefinitionSchema = z.object({
  appSpecVersion: z.string().default("v1" as const),
  catalogId: z.string().default("setta.app.default" as const),
  appSpecPath: z.union([z.string(), z.null()]).default(null),
  routes: z.array(AppRouteSchema).default([]),
  dataBindings: z
    .record(
      z.string(),
      z.union([
        z.record(z.string(), z.any()),
        z.array(z.any()),
        z.string(),
        z.int(),
        z.number(),
        z.boolean(),
        z.null(),
      ]),
    )
    .default({}),
  actions: z
    .record(
      z.string(),
      z.union([
        z.record(z.string(), z.any()),
        z.array(z.any()),
        z.string(),
        z.int(),
        z.number(),
        z.boolean(),
        z.null(),
      ]),
    )
    .default({}),
  theme: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  assets: z
    .array(
      z.union([
        z.record(z.string(), z.any()),
        z.array(z.any()),
        z.string(),
        z.int(),
        z.number(),
        z.boolean(),
        z.null(),
      ]),
    )
    .default([]),
});

export type AppDefinition = z.infer<typeof AppDefinitionSchema>;

export type AppDefinitionInput = z.input<typeof AppDefinitionSchema>;

export function createAppDefinition(
  options: Partial<AppDefinition> = {},
): AppDefinition {
  return AppDefinitionSchema.parse(options);
}

export const AppDeploymentMetadataSchema = z.object({
  deploymentName: z.string(),
  deploymentVersion: z.string(),
  defaultProjectConfigId: IDSchema,
  defaultProjectConfigName: z.string(),
  createdAt: z.iso.datetime(),
  deploymentRoot: z.string(),
  policyPath: z.string(),
});

export type AppDeploymentMetadata = z.infer<typeof AppDeploymentMetadataSchema>;

export type AppDeploymentMetadataInput = z.input<
  typeof AppDeploymentMetadataSchema
>;

export function createAppDeploymentMetadata(
  options: Partial<AppDeploymentMetadata> = {},
): AppDeploymentMetadata {
  return AppDeploymentMetadataSchema.parse(options);
}

export const SharePolicySchema = z.object({
  allowParamChanges: z.boolean().default(true),
  allowVariantChanges: z.boolean().default(true),
  allowLayoutChanges: z.boolean().default(true),
  allowRun: z.boolean().default(false),
  allowLLM: z.boolean().default(false),
  allowExternalLinks: z.boolean().default(false),
  allowFileDownloads: z.boolean().default(false),
  allowMultipleRuns: z.boolean().default(true),
  runSnapshotMode: z
    .enum(RunSnapshotModeEnum)
    .default(RunSnapshotModeEnum.ephemeral),
});

export type SharePolicy = z.infer<typeof SharePolicySchema>;

export type SharePolicyInput = z.input<typeof SharePolicySchema>;

export function createSharePolicy(
  options: Partial<SharePolicy> = {},
): SharePolicy {
  return SharePolicySchema.parse(options);
}

export const DeploymentListenerConfigSchema = z.object({
  entrypoint: z.string(),
  enabled: z.boolean().default(true),
});

export type DeploymentListenerConfig = z.infer<
  typeof DeploymentListenerConfigSchema
>;

export type DeploymentListenerConfigInput = z.input<
  typeof DeploymentListenerConfigSchema
>;

export function createDeploymentListenerConfig(
  options: Partial<DeploymentListenerConfig> = {},
): DeploymentListenerConfig {
  return DeploymentListenerConfigSchema.parse(options);
}

export const DeploymentManifestSchema = z.object({
  version: z.int(),
  deploymentName: z.string(),
  deploymentType: z.enum(DeploymentTypeEnum),
  defaultProjectConfigId: IDSchema,
  deploymentVersion: z.string(),
  createdAt: z.iso.datetime().default(get_now_timestamp),
  listener: z.union([DeploymentListenerConfigSchema, z.null()]).default(null),
});

export type DeploymentManifest = z.infer<typeof DeploymentManifestSchema>;

export type DeploymentManifestInput = z.input<typeof DeploymentManifestSchema>;

export function createDeploymentManifest(
  options: Partial<DeploymentManifest> = {},
): DeploymentManifest {
  return DeploymentManifestSchema.parse(options);
}

export const AppDeploymentSessionResponseSchema = z.object({
  deploymentName: z.string(),
  deploymentVersion: z.string(),
  shareSessionId: z.string(),
  sessionRunCount: z.int(),
  defaultProjectConfigId: IDSchema,
  projectMetadata: z.array(ProjectConfigSchema),
  appPolicy: SharePolicySchema,
  manifest: z.union([DeploymentManifestSchema, z.null()]).default(null),
});

export type AppDeploymentSessionResponse = z.infer<
  typeof AppDeploymentSessionResponseSchema
>;

export type AppDeploymentSessionResponseInput = z.input<
  typeof AppDeploymentSessionResponseSchema
>;

export function createAppDeploymentSessionResponse(
  options: Partial<AppDeploymentSessionResponse> = {},
): AppDeploymentSessionResponse {
  return AppDeploymentSessionResponseSchema.parse(options);
}

export const AppDeploymentStateResponseSchema = z.object({
  projectState: ProjectStateSingleConfigSchema,
  appDefinition: z.union([AppDefinitionSchema, z.null()]).default(null),
  appSpec: z
    .union([
      z.record(z.string(), z.any()),
      z.array(z.any()),
      z.string(),
      z.int(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .default(null),
  appPolicy: SharePolicySchema,
});

export type AppDeploymentStateResponse = z.infer<
  typeof AppDeploymentStateResponseSchema
>;

export type AppDeploymentStateResponseInput = z.input<
  typeof AppDeploymentStateResponseSchema
>;

export function createAppDeploymentStateResponse(
  options: Partial<AppDeploymentStateResponse> = {},
): AppDeploymentStateResponse {
  return AppDeploymentStateResponseSchema.parse(options);
}

export const AppCapabilitiesSchema = z.object({
  catalogId: z.string(),
  catalogVersion: z.string(),
  appSpecVersion: z.string(),
  themeSchemaVersion: z.string(),
  features: z.record(z.string(), z.boolean()).default({}),
});

export type AppCapabilities = z.infer<typeof AppCapabilitiesSchema>;

export type AppCapabilitiesInput = z.input<typeof AppCapabilitiesSchema>;

export function createAppCapabilities(
  options: Partial<AppCapabilities> = {},
): AppCapabilities {
  return AppCapabilitiesSchema.parse(options);
}

export const AppValidationIssueSchema = z.object({
  message: z.string(),
  elementKey: z.union([z.string(), z.null()]).default(null),
  elementType: z.union([z.string(), z.null()]).default(null),
});

export type AppValidationIssue = z.infer<typeof AppValidationIssueSchema>;

export type AppValidationIssueInput = z.input<typeof AppValidationIssueSchema>;

export function createAppValidationIssue(
  options: Partial<AppValidationIssue> = {},
): AppValidationIssue {
  return AppValidationIssueSchema.parse(options);
}

export const BaseArtifactSchema = z.object({
  type: z.any(),
  id: z.string().default(create_json_artifact_id),
  value: z.any(),
});

export type BaseArtifact = z.infer<typeof BaseArtifactSchema>;

export type BaseArtifactInput = z.input<typeof BaseArtifactSchema>;

export function createBaseArtifact(
  options: Partial<BaseArtifact> = {},
): BaseArtifact {
  return BaseArtifactSchema.parse(options);
}

export const BaseChartSettingsSchema = z.object({
  type: z.any(),
});

export type BaseChartSettings = z.infer<typeof BaseChartSettingsSchema>;

export type BaseChartSettingsInput = z.input<typeof BaseChartSettingsSchema>;

export function createBaseChartSettings(
  options: Partial<BaseChartSettings> = {},
): BaseChartSettings {
  return BaseChartSettingsSchema.parse(options);
}

export const ChatSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
  messages: z.array(
    z.union([
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
  systemPrompt: z.union([z.string(), z.null()]).default(null),
});

export type Chat = z.infer<typeof ChatSchema>;

export type ChatInput = z.input<typeof ChatSchema>;

export function createChat(options: Partial<Chat> = {}): Chat {
  return ChatSchema.parse(options);
}

export const ChatMetadataSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

export type ChatMetadataInput = z.input<typeof ChatMetadataSchema>;

export function createChatMetadata(
  options: Partial<ChatMetadata> = {},
): ChatMetadata {
  return ChatMetadataSchema.parse(options);
}

export const BaseChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.any(),
});

export type BaseChatMessage = z.infer<typeof BaseChatMessageSchema>;

export type BaseChatMessageInput = z.input<typeof BaseChatMessageSchema>;

export function createBaseChatMessage(
  options: Partial<BaseChatMessage> = {},
): BaseChatMessage {
  return BaseChatMessageSchema.parse(options);
}

export const ContentChatMessageSchema = z.object({
  id: z.string().default(create_new_id),
  role: z.any(),
  content: z
    .array(
      z.union([
        MessageTextContentSchema,
        MessageImageUrlContentSchema,
        MessageThinkingContentSchema,
      ]),
    )
    .default([]),
  attachments: z.array(ChatFileAttachmentSchema).default([]),
});

export type ContentChatMessage = z.infer<typeof ContentChatMessageSchema>;

export type ContentChatMessageInput = z.input<typeof ContentChatMessageSchema>;

export function createContentChatMessage(
  options: Partial<ContentChatMessage> = {},
): ContentChatMessage {
  return ContentChatMessageSchema.parse(options);
}

export const AppendChatMessagesRequestSchema = z.object({
  chatId: IDSchema,
  messages: z.array(
    z.discriminatedUnion("role", [
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
});

export type AppendChatMessagesRequest = z.infer<
  typeof AppendChatMessagesRequestSchema
>;

export type AppendChatMessagesRequestInput = z.input<
  typeof AppendChatMessagesRequestSchema
>;

export function createAppendChatMessagesRequest(
  options: Partial<AppendChatMessagesRequest> = {},
): AppendChatMessagesRequest {
  return AppendChatMessagesRequestSchema.parse(options);
}

export const CreateChatRequestSchema = z.object({
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  firstMessage: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
});

export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;

export type CreateChatRequestInput = z.input<typeof CreateChatRequestSchema>;

export function createCreateChatRequest(
  options: Partial<CreateChatRequest> = {},
): CreateChatRequest {
  return CreateChatRequestSchema.parse(options);
}

export const DeleteChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type DeleteChatRequest = z.infer<typeof DeleteChatRequestSchema>;

export type DeleteChatRequestInput = z.input<typeof DeleteChatRequestSchema>;

export function createDeleteChatRequest(
  options: Partial<DeleteChatRequest> = {},
): DeleteChatRequest {
  return DeleteChatRequestSchema.parse(options);
}

export const EmitChatStreamDeltaRequestSchema = z.object({
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chatId: IDSchema,
  chunk: z.union([
    MessageStartEventSchema,
    MessageDeltaEventSchema,
    ToolCallDeltaEventSchema,
    ToolResultEventSchema,
    ToolArgumentPreviewDeltaEventSchema,
    MessageStopEventSchema,
    MessageFinalizedEventSchema,
  ]),
});

export type EmitChatStreamDeltaRequest = z.infer<
  typeof EmitChatStreamDeltaRequestSchema
>;

export type EmitChatStreamDeltaRequestInput = z.input<
  typeof EmitChatStreamDeltaRequestSchema
>;

export function createEmitChatStreamDeltaRequest(
  options: Partial<EmitChatStreamDeltaRequest> = {},
): EmitChatStreamDeltaRequest {
  return EmitChatStreamDeltaRequestSchema.parse(options);
}

export const GetAllChatMetadataRequestSchema = z.object({});

export type GetAllChatMetadataRequest = z.infer<
  typeof GetAllChatMetadataRequestSchema
>;

export type GetAllChatMetadataRequestInput = z.input<
  typeof GetAllChatMetadataRequestSchema
>;

export function createGetAllChatMetadataRequest(
  options: Partial<GetAllChatMetadataRequest> = {},
): GetAllChatMetadataRequest {
  return GetAllChatMetadataRequestSchema.parse(options);
}

export const GetChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type GetChatRequest = z.infer<typeof GetChatRequestSchema>;

export type GetChatRequestInput = z.input<typeof GetChatRequestSchema>;

export function createGetChatRequest(
  options: Partial<GetChatRequest> = {},
): GetChatRequest {
  return GetChatRequestSchema.parse(options);
}

export const RunMcpToolsRequestSchema = z.object({
  chatId: IDSchema,
  sectionId: IDSchema,
  toolCalls: z.array(ToolCallSchema),
});

export type RunMcpToolsRequest = z.infer<typeof RunMcpToolsRequestSchema>;

export type RunMcpToolsRequestInput = z.input<typeof RunMcpToolsRequestSchema>;

export function createRunMcpToolsRequest(
  options: Partial<RunMcpToolsRequest> = {},
): RunMcpToolsRequest {
  return RunMcpToolsRequestSchema.parse(options);
}

export const SetChatSystemPromptRequestSchema = z.object({
  chatId: IDSchema,
  systemPrompt: z.string(),
});

export type SetChatSystemPromptRequest = z.infer<
  typeof SetChatSystemPromptRequestSchema
>;

export type SetChatSystemPromptRequestInput = z.input<
  typeof SetChatSystemPromptRequestSchema
>;

export function createSetChatSystemPromptRequest(
  options: Partial<SetChatSystemPromptRequest> = {},
): SetChatSystemPromptRequest {
  return SetChatSystemPromptRequestSchema.parse(options);
}

export const BaseClipboardDataSchema = z.object({
  type: z.any(),
  data: z.any(),
});

export type BaseClipboardData = z.infer<typeof BaseClipboardDataSchema>;

export type BaseClipboardDataInput = z.input<typeof BaseClipboardDataSchema>;

export function createBaseClipboardData(
  options: Partial<BaseClipboardData> = {},
): BaseClipboardData {
  return BaseClipboardDataSchema.parse(options);
}

export const BaseChildlessCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type BaseChildlessCodeObjImpl = z.infer<
  typeof BaseChildlessCodeObjImplSchema
>;

export type BaseChildlessCodeObjImplInput = z.input<
  typeof BaseChildlessCodeObjImplSchema
>;

export function createBaseChildlessCodeObjImpl(
  options: Partial<BaseChildlessCodeObjImpl> = {},
): BaseChildlessCodeObjImpl {
  return BaseChildlessCodeObjImplSchema.parse(options);
}

export const BaseCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
});

export type BaseCodeObjImpl = z.infer<typeof BaseCodeObjImplSchema>;

export type BaseCodeObjImplInput = z.input<typeof BaseCodeObjImplSchema>;

export function createBaseCodeObjImpl(
  options: Partial<BaseCodeObjImpl> = {},
): BaseCodeObjImpl {
  return BaseCodeObjImplSchema.parse(options);
}

export const BaseParamCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
});

export type BaseParamCodeObjImpl = z.infer<typeof BaseParamCodeObjImplSchema>;

export type BaseParamCodeObjImplInput = z.input<
  typeof BaseParamCodeObjImplSchema
>;

export function createBaseParamCodeObjImpl(
  options: Partial<BaseParamCodeObjImpl> = {},
): BaseParamCodeObjImpl {
  return BaseParamCodeObjImplSchema.parse(options);
}

export const BaseParentCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
});

export type BaseParentCodeObjImpl = z.infer<typeof BaseParentCodeObjImplSchema>;

export type BaseParentCodeObjImplInput = z.input<
  typeof BaseParentCodeObjImplSchema
>;

export function createBaseParentCodeObjImpl(
  options: Partial<BaseParentCodeObjImpl> = {},
): BaseParentCodeObjImpl {
  return BaseParentCodeObjImplSchema.parse(options);
}

export const BaseSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type BaseSectionImpl = z.infer<typeof BaseSectionImplSchema>;

export type BaseSectionImplInput = z.input<typeof BaseSectionImplSchema>;

export function createBaseSectionImpl(
  options: Partial<BaseSectionImpl> = {},
): BaseSectionImpl {
  return BaseSectionImplSchema.parse(options);
}

export const DropzoneStoredValueSchema = z.object({
  attachments: z
    .array(
      z.discriminatedUnion("kind", [
        DropzoneFileAttachmentSchema,
        DropzoneTextAttachmentSchema,
      ]),
    )
    .default([]),
});

export type DropzoneStoredValue = z.infer<typeof DropzoneStoredValueSchema>;

export type DropzoneStoredValueInput = z.input<
  typeof DropzoneStoredValueSchema
>;

export function createDropzoneStoredValue(
  options: Partial<DropzoneStoredValue> = {},
): DropzoneStoredValue {
  return DropzoneStoredValueSchema.parse(options);
}

export const ExternalAgentEnvVarStatusSchema = z.object({
  present: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
});

export type ExternalAgentEnvVarStatus = z.infer<
  typeof ExternalAgentEnvVarStatusSchema
>;

export type ExternalAgentEnvVarStatusInput = z.input<
  typeof ExternalAgentEnvVarStatusSchema
>;

export function createExternalAgentEnvVarStatus(
  options: Partial<ExternalAgentEnvVarStatus> = {},
): ExternalAgentEnvVarStatus {
  return ExternalAgentEnvVarStatusSchema.parse(options);
}

export const ExternalAgentPreflightStatusSchema = z.object({
  configId: IDSchema,
  name: z.string(),
  toolType: z.enum(ExternalAgentToolTypeEnum),
  runMode: z.enum(ExternalAgentRunModeEnum),
  supported: z.boolean(),
  available: z.boolean(),
  issues: z.array(z.string()).default([]),
  nodePath: z.union([z.string(), z.null()]).default(null),
  nodeVersion: z.union([z.string(), z.null()]).default(null),
  sdkVersion: z.union([z.string(), z.null()]).default(null),
  cliVersion: z.union([z.string(), z.null()]).default(null),
  baseUrl: z.union([z.string(), z.null()]).default(null),
  workingDir: z.union([z.string(), z.null()]).default(null),
  envVars: ExternalAgentEnvVarStatusSchema.default(
    createExternalAgentEnvVarStatus,
  ),
});

export type ExternalAgentPreflightStatus = z.infer<
  typeof ExternalAgentPreflightStatusSchema
>;

export type ExternalAgentPreflightStatusInput = z.input<
  typeof ExternalAgentPreflightStatusSchema
>;

export function createExternalAgentPreflightStatus(
  options: Partial<ExternalAgentPreflightStatus> = {},
): ExternalAgentPreflightStatus {
  return ExternalAgentPreflightStatusSchema.parse(options);
}

export const BaseCanvasSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type BaseCanvasSectionImpl = z.infer<typeof BaseCanvasSectionImplSchema>;

export type BaseCanvasSectionImplInput = z.input<
  typeof BaseCanvasSectionImplSchema
>;

export function createBaseCanvasSectionImpl(
  options: Partial<BaseCanvasSectionImpl> = {},
): BaseCanvasSectionImpl {
  return BaseCanvasSectionImplSchema.parse(options);
}

export const BaseCodeSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type BaseCodeSectionImpl = z.infer<typeof BaseCodeSectionImplSchema>;

export type BaseCodeSectionImplInput = z.input<
  typeof BaseCodeSectionImplSchema
>;

export function createBaseCodeSectionImpl(
  options: Partial<BaseCodeSectionImpl> = {},
): BaseCodeSectionImpl {
  return BaseCodeSectionImplSchema.parse(options);
}

export const BaseDictSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type BaseDictSectionImpl = z.infer<typeof BaseDictSectionImplSchema>;

export type BaseDictSectionImplInput = z.input<
  typeof BaseDictSectionImplSchema
>;

export function createBaseDictSectionImpl(
  options: Partial<BaseDictSectionImpl> = {},
): BaseDictSectionImpl {
  return BaseDictSectionImplSchema.parse(options);
}

export const BaseParentSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
});

export type BaseParentSectionImpl = z.infer<typeof BaseParentSectionImplSchema>;

export type BaseParentSectionImplInput = z.input<
  typeof BaseParentSectionImplSchema
>;

export function createBaseParentSectionImpl(
  options: Partial<BaseParentSectionImpl> = {},
): BaseParentSectionImpl {
  return BaseParentSectionImplSchema.parse(options);
}

export const BaseSectionWithParamsImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
});

export type BaseSectionWithParamsImpl = z.infer<
  typeof BaseSectionWithParamsImplSchema
>;

export type BaseSectionWithParamsImplInput = z.input<
  typeof BaseSectionWithParamsImplSchema
>;

export function createBaseSectionWithParamsImpl(
  options: Partial<BaseSectionWithParamsImpl> = {},
): BaseSectionWithParamsImpl {
  return BaseSectionWithParamsImplSchema.parse(options);
}

export const UserDefaultBaseCanvasSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseCanvasSectionImpl = z.infer<
  typeof UserDefaultBaseCanvasSectionImplSchema
>;

export type UserDefaultBaseCanvasSectionImplInput = z.input<
  typeof UserDefaultBaseCanvasSectionImplSchema
>;

export function createUserDefaultBaseCanvasSectionImpl(
  options: Partial<UserDefaultBaseCanvasSectionImpl> = {},
): UserDefaultBaseCanvasSectionImpl {
  return UserDefaultBaseCanvasSectionImplSchema.parse(options);
}

export const UserDefaultBaseChildlessCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

export type UserDefaultBaseChildlessCodeObjImpl = z.infer<
  typeof UserDefaultBaseChildlessCodeObjImplSchema
>;

export type UserDefaultBaseChildlessCodeObjImplInput = z.input<
  typeof UserDefaultBaseChildlessCodeObjImplSchema
>;

export function createUserDefaultBaseChildlessCodeObjImpl(
  options: Partial<UserDefaultBaseChildlessCodeObjImpl> = {},
): UserDefaultBaseChildlessCodeObjImpl {
  return UserDefaultBaseChildlessCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseCodeObjImplSchema = z.object({});

export type UserDefaultBaseCodeObjImpl = z.infer<
  typeof UserDefaultBaseCodeObjImplSchema
>;

export type UserDefaultBaseCodeObjImplInput = z.input<
  typeof UserDefaultBaseCodeObjImplSchema
>;

export function createUserDefaultBaseCodeObjImpl(
  options: Partial<UserDefaultBaseCodeObjImpl> = {},
): UserDefaultBaseCodeObjImpl {
  return UserDefaultBaseCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type UserDefaultBaseCodeSectionImpl = z.infer<
  typeof UserDefaultBaseCodeSectionImplSchema
>;

export type UserDefaultBaseCodeSectionImplInput = z.input<
  typeof UserDefaultBaseCodeSectionImplSchema
>;

export function createUserDefaultBaseCodeSectionImpl(
  options: Partial<UserDefaultBaseCodeSectionImpl> = {},
): UserDefaultBaseCodeSectionImpl {
  return UserDefaultBaseCodeSectionImplSchema.parse(options);
}

export const UserDefaultBaseDictSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultBaseDictSectionImpl = z.infer<
  typeof UserDefaultBaseDictSectionImplSchema
>;

export type UserDefaultBaseDictSectionImplInput = z.input<
  typeof UserDefaultBaseDictSectionImplSchema
>;

export function createUserDefaultBaseDictSectionImpl(
  options: Partial<UserDefaultBaseDictSectionImpl> = {},
): UserDefaultBaseDictSectionImpl {
  return UserDefaultBaseDictSectionImplSchema.parse(options);
}

export const UserDefaultBaseParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
});

export type UserDefaultBaseParamCodeObjImpl = z.infer<
  typeof UserDefaultBaseParamCodeObjImplSchema
>;

export type UserDefaultBaseParamCodeObjImplInput = z.input<
  typeof UserDefaultBaseParamCodeObjImplSchema
>;

export function createUserDefaultBaseParamCodeObjImpl(
  options: Partial<UserDefaultBaseParamCodeObjImpl> = {},
): UserDefaultBaseParamCodeObjImpl {
  return UserDefaultBaseParamCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseParentCodeObjImplSchema = z.object({});

export type UserDefaultBaseParentCodeObjImpl = z.infer<
  typeof UserDefaultBaseParentCodeObjImplSchema
>;

export type UserDefaultBaseParentCodeObjImplInput = z.input<
  typeof UserDefaultBaseParentCodeObjImplSchema
>;

export function createUserDefaultBaseParentCodeObjImpl(
  options: Partial<UserDefaultBaseParentCodeObjImpl> = {},
): UserDefaultBaseParentCodeObjImpl {
  return UserDefaultBaseParentCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseParentSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseParentSectionImpl = z.infer<
  typeof UserDefaultBaseParentSectionImplSchema
>;

export type UserDefaultBaseParentSectionImplInput = z.input<
  typeof UserDefaultBaseParentSectionImplSchema
>;

export function createUserDefaultBaseParentSectionImpl(
  options: Partial<UserDefaultBaseParentSectionImpl> = {},
): UserDefaultBaseParentSectionImpl {
  return UserDefaultBaseParentSectionImplSchema.parse(options);
}

export const UserDefaultBaseSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseSectionImpl = z.infer<
  typeof UserDefaultBaseSectionImplSchema
>;

export type UserDefaultBaseSectionImplInput = z.input<
  typeof UserDefaultBaseSectionImplSchema
>;

export function createUserDefaultBaseSectionImpl(
  options: Partial<UserDefaultBaseSectionImpl> = {},
): UserDefaultBaseSectionImpl {
  return UserDefaultBaseSectionImplSchema.parse(options);
}

export const UserDefaultBaseSectionWithParamsImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  edgeInputParams: z.array(IDSchema).default([]),
  edgeOutputPorts: z.array(EdgePortSchema).default([]),
});

export type UserDefaultBaseSectionWithParamsImpl = z.infer<
  typeof UserDefaultBaseSectionWithParamsImplSchema
>;

export type UserDefaultBaseSectionWithParamsImplInput = z.input<
  typeof UserDefaultBaseSectionWithParamsImplSchema
>;

export function createUserDefaultBaseSectionWithParamsImpl(
  options: Partial<UserDefaultBaseSectionWithParamsImpl> = {},
): UserDefaultBaseSectionWithParamsImpl {
  return UserDefaultBaseSectionWithParamsImplSchema.parse(options);
}

export const GetGitCommitDetailsRequestSchema = z.object({
  commitHash: z.string(),
});

export type GetGitCommitDetailsRequest = z.infer<
  typeof GetGitCommitDetailsRequestSchema
>;

export type GetGitCommitDetailsRequestInput = z.input<
  typeof GetGitCommitDetailsRequestSchema
>;

export function createGetGitCommitDetailsRequest(
  options: Partial<GetGitCommitDetailsRequest> = {},
): GetGitCommitDetailsRequest {
  return GetGitCommitDetailsRequestSchema.parse(options);
}

export const GitCommitChangedFileSchema = z.object({
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
  status: z.string(),
  additions: z.union([z.int(), z.null()]).default(null),
  deletions: z.union([z.int(), z.null()]).default(null),
});

export type GitCommitChangedFile = z.infer<typeof GitCommitChangedFileSchema>;

export type GitCommitChangedFileInput = z.input<
  typeof GitCommitChangedFileSchema
>;

export function createGitCommitChangedFile(
  options: Partial<GitCommitChangedFile> = {},
): GitCommitChangedFile {
  return GitCommitChangedFileSchema.parse(options);
}

export const GetGitCommitDetailsResponseSchema = z.object({
  repoRoot: z.string(),
  commitHash: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authorTimeMs: z.int(),
  committerName: z.string(),
  committerEmail: z.string(),
  committerTimeMs: z.int(),
  subject: z.string(),
  body: z.string(),
  files: z.array(GitCommitChangedFileSchema),
  isTruncated: z.boolean(),
});

export type GetGitCommitDetailsResponse = z.infer<
  typeof GetGitCommitDetailsResponseSchema
>;

export type GetGitCommitDetailsResponseInput = z.input<
  typeof GetGitCommitDetailsResponseSchema
>;

export function createGetGitCommitDetailsResponse(
  options: Partial<GetGitCommitDetailsResponse> = {},
): GetGitCommitDetailsResponse {
  return GetGitCommitDetailsResponseSchema.parse(options);
}

export const GetGitCommitFileDiffRequestSchema = z.object({
  commitHash: z.string(),
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
});

export type GetGitCommitFileDiffRequest = z.infer<
  typeof GetGitCommitFileDiffRequestSchema
>;

export type GetGitCommitFileDiffRequestInput = z.input<
  typeof GetGitCommitFileDiffRequestSchema
>;

export function createGetGitCommitFileDiffRequest(
  options: Partial<GetGitCommitFileDiffRequest> = {},
): GetGitCommitFileDiffRequest {
  return GetGitCommitFileDiffRequestSchema.parse(options);
}

export const GetGitCommitFileDiffResponseSchema = z.object({
  repoRoot: z.string(),
  commitHash: z.string(),
  path: z.string(),
  diff: z.string(),
  isTruncated: z.boolean(),
});

export type GetGitCommitFileDiffResponse = z.infer<
  typeof GetGitCommitFileDiffResponseSchema
>;

export type GetGitCommitFileDiffResponseInput = z.input<
  typeof GetGitCommitFileDiffResponseSchema
>;

export function createGetGitCommitFileDiffResponse(
  options: Partial<GetGitCommitFileDiffResponse> = {},
): GetGitCommitFileDiffResponse {
  return GetGitCommitFileDiffResponseSchema.parse(options);
}

export const GetGitDiffRequestSchema = z.object({
  path: z.string(),
  mode: z.literal(["unstaged", "staged"]),
  oldPath: z.union([z.string(), z.null()]).default(null),
});

export type GetGitDiffRequest = z.infer<typeof GetGitDiffRequestSchema>;

export type GetGitDiffRequestInput = z.input<typeof GetGitDiffRequestSchema>;

export function createGetGitDiffRequest(
  options: Partial<GetGitDiffRequest> = {},
): GetGitDiffRequest {
  return GetGitDiffRequestSchema.parse(options);
}

export const GetGitDiffResponseSchema = z.object({
  repoRoot: z.string(),
  path: z.string(),
  mode: z.literal(["unstaged", "staged"]),
  diff: z.string(),
  isTruncated: z.boolean(),
});

export type GetGitDiffResponse = z.infer<typeof GetGitDiffResponseSchema>;

export type GetGitDiffResponseInput = z.input<typeof GetGitDiffResponseSchema>;

export function createGetGitDiffResponse(
  options: Partial<GetGitDiffResponse> = {},
): GetGitDiffResponse {
  return GetGitDiffResponseSchema.parse(options);
}

export const GetGitLogRequestSchema = z.object({
  rev: z.string().default("HEAD" as const),
  allRefs: z.boolean().default(false),
  offset: z.int().default(0),
  pageSize: z.int().default(250),
});

export type GetGitLogRequest = z.infer<typeof GetGitLogRequestSchema>;

export type GetGitLogRequestInput = z.input<typeof GetGitLogRequestSchema>;

export function createGetGitLogRequest(
  options: Partial<GetGitLogRequest> = {},
): GetGitLogRequest {
  return GetGitLogRequestSchema.parse(options);
}

export const GitCommitSchema = z.object({
  hash: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authorTimeMs: z.int(),
  subject: z.string(),
  decorations: z.array(z.string()).default([]),
});

export type GitCommit = z.infer<typeof GitCommitSchema>;

export type GitCommitInput = z.input<typeof GitCommitSchema>;

export function createGitCommit(options: Partial<GitCommit> = {}): GitCommit {
  return GitCommitSchema.parse(options);
}

export const GetGitLogResponseSchema = z.object({
  repoRoot: z.string(),
  headBranch: z.union([z.string(), z.null()]),
  commits: z.array(GitCommitSchema),
  offset: z.int(),
  pageSize: z.int(),
  nextOffset: z.union([z.int(), z.null()]),
  hasMore: z.boolean(),
  isCapped: z.boolean(),
});

export type GetGitLogResponse = z.infer<typeof GetGitLogResponseSchema>;

export type GetGitLogResponseInput = z.input<typeof GetGitLogResponseSchema>;

export function createGetGitLogResponse(
  options: Partial<GetGitLogResponse> = {},
): GetGitLogResponse {
  return GetGitLogResponseSchema.parse(options);
}

export const GitRepoInfoResponseSchema = z.object({
  isGitRepo: z.boolean(),
  repoRoot: z.union([z.string(), z.null()]).default(null),
  headBranch: z.union([z.string(), z.null()]).default(null),
  headCommit: z.union([z.string(), z.null()]).default(null),
});

export type GitRepoInfoResponse = z.infer<typeof GitRepoInfoResponseSchema>;

export type GitRepoInfoResponseInput = z.input<
  typeof GitRepoInfoResponseSchema
>;

export function createGitRepoInfoResponse(
  options: Partial<GitRepoInfoResponse> = {},
): GitRepoInfoResponse {
  return GitRepoInfoResponseSchema.parse(options);
}

export const GitStatusEntrySchema = z.object({
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
  indexStatus: z.string(),
  worktreeStatus: z.string(),
  kind: z.literal(["conflict", "staged", "unstaged", "untracked"]),
});

export type GitStatusEntry = z.infer<typeof GitStatusEntrySchema>;

export type GitStatusEntryInput = z.input<typeof GitStatusEntrySchema>;

export function createGitStatusEntry(
  options: Partial<GitStatusEntry> = {},
): GitStatusEntry {
  return GitStatusEntrySchema.parse(options);
}

export const GetGitStatusResponseSchema = z.object({
  repo: GitRepoInfoResponseSchema,
  entries: z.array(GitStatusEntrySchema),
  isTruncated: z.boolean().default(false),
});

export type GetGitStatusResponse = z.infer<typeof GetGitStatusResponseSchema>;

export type GetGitStatusResponseInput = z.input<
  typeof GetGitStatusResponseSchema
>;

export function createGetGitStatusResponse(
  options: Partial<GetGitStatusResponse> = {},
): GetGitStatusResponse {
  return GetGitStatusResponseSchema.parse(options);
}

export const ChatSectionStateSchema = z.object({
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default([]),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

export type ChatSectionState = z.infer<typeof ChatSectionStateSchema>;

export type ChatSectionStateInput = z.input<typeof ChatSectionStateSchema>;

export function createChatSectionState(
  options: Partial<ChatSectionState> = {},
): ChatSectionState {
  return ChatSectionStateSchema.parse(options);
}

export const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export type Position = z.infer<typeof PositionSchema>;

export type PositionInput = z.input<typeof PositionSchema>;

export function createPosition(options: Partial<Position> = {}): Position {
  return PositionSchema.parse(options);
}

export const ViewportBoundsSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  w: z.number().default(0),
  h: z.number().default(0),
});

export type ViewportBounds = z.infer<typeof ViewportBoundsSchema>;

export type ViewportBoundsInput = z.input<typeof ViewportBoundsSchema>;

export function createViewportBounds(
  options: Partial<ViewportBounds> = {},
): ViewportBounds {
  return ViewportBoundsSchema.parse(options);
}

export const ProjectStateBackendSchema = z.object({
  sections: z.record(IDSchema, CoreSchema).default({}),
  sectionImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        PromptSectionImplSchema,
        MetaControlSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        GenPythonMetadataSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
        PluginSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(IDSchema, VariantSchema).default({}),
  codeObjs: z.record(IDSchema, CoreSchema).default({}),
  codeObjImpls: z
    .record(
      IDSchema,
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        ButtonParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        RotaryParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        TextAreaParamCodeObjImplSchema,
        DropzoneParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(IDSchema, VariantSchema).default({}),
  projectConfigs: z.record(IDSchema, ProjectConfigSchema).default({}),
  defaultProjectConfigId: z.union([IDSchema, z.null()]).default(null),
  appDefinition: z.union([AppDefinitionSchema, z.null()]).default(null),
});

export type ProjectStateBackend = z.infer<typeof ProjectStateBackendSchema>;

export type ProjectStateBackendInput = z.input<
  typeof ProjectStateBackendSchema
>;

export function createProjectStateBackend(
  options: Partial<ProjectStateBackend> = {},
): ProjectStateBackend {
  return ProjectStateBackendSchema.parse(options);
}

export const ListenerCoverageRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ListenerCoverageRequest = z.infer<
  typeof ListenerCoverageRequestSchema
>;

export type ListenerCoverageRequestInput = z.input<
  typeof ListenerCoverageRequestSchema
>;

export function createListenerCoverageRequest(
  options: Partial<ListenerCoverageRequest> = {},
): ListenerCoverageRequest {
  return ListenerCoverageRequestSchema.parse(options);
}

export const ListenerFrontendEmitKeyAndValueSchema = z.object({
  dependencyKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  value: z.union([
    LiteralDependencyValueSchema,
    FileReadDependencyValueSchema,
    BinaryDependencyValueSchema,
  ]),
});

export type ListenerFrontendEmitKeyAndValue = z.infer<
  typeof ListenerFrontendEmitKeyAndValueSchema
>;

export type ListenerFrontendEmitKeyAndValueInput = z.input<
  typeof ListenerFrontendEmitKeyAndValueSchema
>;

export function createListenerFrontendEmitKeyAndValue(
  options: Partial<ListenerFrontendEmitKeyAndValue> = {},
): ListenerFrontendEmitKeyAndValue {
  return ListenerFrontendEmitKeyAndValueSchema.parse(options);
}

export const ListenerRealtimeDeltaSchema = z.object({
  dependency: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  value: z.union([
    LiteralDependencyValueSchema,
    FileReadDependencyValueSchema,
    BinaryDependencyValueSchema,
  ]),
});

export type ListenerRealtimeDelta = z.infer<typeof ListenerRealtimeDeltaSchema>;

export type ListenerRealtimeDeltaInput = z.input<
  typeof ListenerRealtimeDeltaSchema
>;

export function createListenerRealtimeDelta(
  options: Partial<ListenerRealtimeDelta> = {},
): ListenerRealtimeDelta {
  return ListenerRealtimeDeltaSchema.parse(options);
}

export const BrowserAreaItemSchema = z.object({
  id: z.string(),
  type: z.any(),
  lastModified: z.iso.datetime(),
});

export type BrowserAreaItem = z.infer<typeof BrowserAreaItemSchema>;

export type BrowserAreaItemInput = z.input<typeof BrowserAreaItemSchema>;

export function createBrowserAreaItem(
  options: Partial<BrowserAreaItem> = {},
): BrowserAreaItem {
  return BrowserAreaItemSchema.parse(options);
}

export const ServerModeResponseSchema = z.object({
  mode: z.literal(["ide", "share", "app"]),
});

export type ServerModeResponse = z.infer<typeof ServerModeResponseSchema>;

export type ServerModeResponseInput = z.input<typeof ServerModeResponseSchema>;

export function createServerModeResponse(
  options: Partial<ServerModeResponse> = {},
): ServerModeResponse {
  return ServerModeResponseSchema.parse(options);
}

export const ShareDeploymentMetadataSchema = z.object({
  deploymentName: z.string(),
  deploymentVersion: z.string(),
  defaultProjectConfigId: IDSchema,
  defaultProjectConfigName: z.string(),
  createdAt: z.iso.datetime(),
  deploymentRoot: z.string(),
  policyPath: z.string(),
});

export type ShareDeploymentMetadata = z.infer<
  typeof ShareDeploymentMetadataSchema
>;

export type ShareDeploymentMetadataInput = z.input<
  typeof ShareDeploymentMetadataSchema
>;

export function createShareDeploymentMetadata(
  options: Partial<ShareDeploymentMetadata> = {},
): ShareDeploymentMetadata {
  return ShareDeploymentMetadataSchema.parse(options);
}

export const ShareDeploymentSessionResponseSchema = z.object({
  deploymentName: z.string(),
  deploymentVersion: z.string(),
  shareSessionId: z.string(),
  sessionRunCount: z.int(),
  defaultProjectConfigId: IDSchema,
  projectMetadata: z.array(ProjectConfigSchema),
  sharePolicy: SharePolicySchema,
  manifest: z.union([DeploymentManifestSchema, z.null()]).default(null),
});

export type ShareDeploymentSessionResponse = z.infer<
  typeof ShareDeploymentSessionResponseSchema
>;

export type ShareDeploymentSessionResponseInput = z.input<
  typeof ShareDeploymentSessionResponseSchema
>;

export function createShareDeploymentSessionResponse(
  options: Partial<ShareDeploymentSessionResponse> = {},
): ShareDeploymentSessionResponse {
  return ShareDeploymentSessionResponseSchema.parse(options);
}

export const FileWatcherCoreUpdateSchema = z.object({
  absPath: z.string(),
  relPath: z.string(),
  eventType: z.enum(FileEventTypeEnum),
  matchingGlobPatterns: z.array(z.string()),
  destAbsPath: z.union([z.string(), z.null()]).default(null),
  destRelPath: z.union([z.string(), z.null()]).default(null),
  fileToRead: z.string(),
});

export type FileWatcherCoreUpdate = z.infer<typeof FileWatcherCoreUpdateSchema>;

export type FileWatcherCoreUpdateInput = z.input<
  typeof FileWatcherCoreUpdateSchema
>;

export function createFileWatcherCoreUpdate(
  options: Partial<FileWatcherCoreUpdate> = {},
): FileWatcherCoreUpdate {
  return FileWatcherCoreUpdateSchema.parse(options);
}

export const BackendWebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type BackendWebsocketMsg = z.infer<typeof BackendWebsocketMsgSchema>;

export type BackendWebsocketMsgInput = z.input<
  typeof BackendWebsocketMsgSchema
>;

export function createBackendWebsocketMsg(
  options: Partial<BackendWebsocketMsg> = {},
): BackendWebsocketMsg {
  return BackendWebsocketMsgSchema.parse(options);
}

export const FrontendWebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type FrontendWebsocketMsg = z.infer<typeof FrontendWebsocketMsgSchema>;

export type FrontendWebsocketMsgInput = z.input<
  typeof FrontendWebsocketMsgSchema
>;

export function createFrontendWebsocketMsg(
  options: Partial<FrontendWebsocketMsg> = {},
): FrontendWebsocketMsg {
  return FrontendWebsocketMsgSchema.parse(options);
}

export const PythonScriptWebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type PythonScriptWebsocketMsg = z.infer<
  typeof PythonScriptWebsocketMsgSchema
>;

export type PythonScriptWebsocketMsgInput = z.input<
  typeof PythonScriptWebsocketMsgSchema
>;

export function createPythonScriptWebsocketMsg(
  options: Partial<PythonScriptWebsocketMsg> = {},
): PythonScriptWebsocketMsg {
  return PythonScriptWebsocketMsgSchema.parse(options);
}

export const WebsocketConnectionInfoWithSocketSchema = z.object({
  id: z.string(),
  connectionType: z.enum(WebsocketConnectionTypeEnum),
  currentAddress: z.union([z.string(), z.null()]),
  shareSessionId: z.union([z.string(), z.null()]).default(null),
  websocket: WebSocket,
});

export type WebsocketConnectionInfoWithSocket = z.infer<
  typeof WebsocketConnectionInfoWithSocketSchema
>;

export type WebsocketConnectionInfoWithSocketInput = z.input<
  typeof WebsocketConnectionInfoWithSocketSchema
>;

export function createWebsocketConnectionInfoWithSocket(
  options: Partial<WebsocketConnectionInfoWithSocket> = {},
): WebsocketConnectionInfoWithSocket {
  return WebsocketConnectionInfoWithSocketSchema.parse(options);
}

export const WebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type WebsocketMsg = z.infer<typeof WebsocketMsgSchema>;

export type WebsocketMsgInput = z.input<typeof WebsocketMsgSchema>;

export function createWebsocketMsg(
  options: Partial<WebsocketMsg> = {},
): WebsocketMsg {
  return WebsocketMsgSchema.parse(options);
}

export const CreateAgentProfileRequestSchema = z.object({
  name: z.string(),
  description: z.string().default("" as const),
  systemPrompt: z.string().default("" as const),
  enableBackgroundSummaryFill: z.boolean().default(false),
  enableLlmChatTitles: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  toolAllowlist: z.array(z.string()).default([]),
  memoryScope: z.union([z.string(), z.null()]).default(null),
});

export type CreateAgentProfileRequest = z.infer<
  typeof CreateAgentProfileRequestSchema
>;

export type CreateAgentProfileRequestInput = z.input<
  typeof CreateAgentProfileRequestSchema
>;

export function createCreateAgentProfileRequest(
  options: Partial<CreateAgentProfileRequest> = {},
): CreateAgentProfileRequest {
  return CreateAgentProfileRequestSchema.parse(options);
}

export const CreateEngineConfigRequestSchema = z.object({
  name: z.string(),
  engineType: z.enum(EngineTypeEnum),
  settaLlmConfigId: z.union([z.string(), z.null()]).default(null),
  externalAgentConfigId: z.union([IDSchema, z.null()]).default(null),
  defaults: EngineConfigDefaultsSchema.default(createEngineConfigDefaults),
});

export type CreateEngineConfigRequest = z.infer<
  typeof CreateEngineConfigRequestSchema
>;

export type CreateEngineConfigRequestInput = z.input<
  typeof CreateEngineConfigRequestSchema
>;

export function createCreateEngineConfigRequest(
  options: Partial<CreateEngineConfigRequest> = {},
): CreateEngineConfigRequest {
  return CreateEngineConfigRequestSchema.parse(options);
}

export const CreateExternalAgentConfigRequestSchema = z.object({
  name: z.string(),
  description: z.string().default("" as const),
  toolType: z.enum(ExternalAgentToolTypeEnum),
  pluginAdapterId: z.union([z.string(), z.null()]).default(null),
  runMode: z.enum(ExternalAgentRunModeEnum),
  commandPath: z.union([z.string(), z.null()]).default(null),
  baseUrl: z.union([z.string(), z.null()]).default(null),
  defaultModel: z.union([z.string(), z.null()]).default(null),
  sandboxPolicy: z.union([z.string(), z.null()]).default(null),
  approvalPolicy: z.union([z.string(), z.null()]).default(null),
  settingsMode: z
    .enum(ExternalAgentSettingsModeEnum)
    .default(ExternalAgentSettingsModeEnum.managed_local),
  settingsSources: z
    .union([z.array(z.enum(ClaudeSettingsSourceEnum)), z.null()])
    .default(null),
  settingsFilePath: z.union([z.string(), z.null()]).default(null),
  settingsAllowSettaEdits: z.boolean().default(true),
  settingsManagedBlock: z
    .union([ExternalAgentSettingsManagedBlockSchema, z.null()])
    .default(null),
  envVarWhitelist: z.array(z.string()).default([]),
  workingDirStrategy: z
    .enum(ExternalAgentWorkingDirStrategyEnum)
    .default(ExternalAgentWorkingDirStrategyEnum.project_root),
  workingDir: z.union([z.string(), z.null()]).default(null),
});

export type CreateExternalAgentConfigRequest = z.infer<
  typeof CreateExternalAgentConfigRequestSchema
>;

export type CreateExternalAgentConfigRequestInput = z.input<
  typeof CreateExternalAgentConfigRequestSchema
>;

export function createCreateExternalAgentConfigRequest(
  options: Partial<CreateExternalAgentConfigRequest> = {},
): CreateExternalAgentConfigRequest {
  return CreateExternalAgentConfigRequestSchema.parse(options);
}

export const CreatePromptTemplateRequestSchema = z.object({
  name: z.string(),
  description: z.string().default("" as const),
  template: z.string(),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputSchema: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type CreatePromptTemplateRequest = z.infer<
  typeof CreatePromptTemplateRequestSchema
>;

export type CreatePromptTemplateRequestInput = z.input<
  typeof CreatePromptTemplateRequestSchema
>;

export function createCreatePromptTemplateRequest(
  options: Partial<CreatePromptTemplateRequest> = {},
): CreatePromptTemplateRequest {
  return CreatePromptTemplateRequestSchema.parse(options);
}

export const DeleteAgentProfileRequestSchema = z.object({
  profileId: IDSchema,
});

export type DeleteAgentProfileRequest = z.infer<
  typeof DeleteAgentProfileRequestSchema
>;

export type DeleteAgentProfileRequestInput = z.input<
  typeof DeleteAgentProfileRequestSchema
>;

export function createDeleteAgentProfileRequest(
  options: Partial<DeleteAgentProfileRequest> = {},
): DeleteAgentProfileRequest {
  return DeleteAgentProfileRequestSchema.parse(options);
}

export const DeleteEngineConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type DeleteEngineConfigRequest = z.infer<
  typeof DeleteEngineConfigRequestSchema
>;

export type DeleteEngineConfigRequestInput = z.input<
  typeof DeleteEngineConfigRequestSchema
>;

export function createDeleteEngineConfigRequest(
  options: Partial<DeleteEngineConfigRequest> = {},
): DeleteEngineConfigRequest {
  return DeleteEngineConfigRequestSchema.parse(options);
}

export const DeleteExternalAgentConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type DeleteExternalAgentConfigRequest = z.infer<
  typeof DeleteExternalAgentConfigRequestSchema
>;

export type DeleteExternalAgentConfigRequestInput = z.input<
  typeof DeleteExternalAgentConfigRequestSchema
>;

export function createDeleteExternalAgentConfigRequest(
  options: Partial<DeleteExternalAgentConfigRequest> = {},
): DeleteExternalAgentConfigRequest {
  return DeleteExternalAgentConfigRequestSchema.parse(options);
}

export const DeletePromptTemplateRequestSchema = z.object({
  templateId: IDSchema,
});

export type DeletePromptTemplateRequest = z.infer<
  typeof DeletePromptTemplateRequestSchema
>;

export type DeletePromptTemplateRequestInput = z.input<
  typeof DeletePromptTemplateRequestSchema
>;

export function createDeletePromptTemplateRequest(
  options: Partial<DeletePromptTemplateRequest> = {},
): DeletePromptTemplateRequest {
  return DeletePromptTemplateRequestSchema.parse(options);
}

export const GetAgentProfileRequestSchema = z.object({
  profileId: IDSchema,
});

export type GetAgentProfileRequest = z.infer<
  typeof GetAgentProfileRequestSchema
>;

export type GetAgentProfileRequestInput = z.input<
  typeof GetAgentProfileRequestSchema
>;

export function createGetAgentProfileRequest(
  options: Partial<GetAgentProfileRequest> = {},
): GetAgentProfileRequest {
  return GetAgentProfileRequestSchema.parse(options);
}

export const GetAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type GetAgentRunRequest = z.infer<typeof GetAgentRunRequestSchema>;

export type GetAgentRunRequestInput = z.input<typeof GetAgentRunRequestSchema>;

export function createGetAgentRunRequest(
  options: Partial<GetAgentRunRequest> = {},
): GetAgentRunRequest {
  return GetAgentRunRequestSchema.parse(options);
}

export const GetAgenticSummaryCacheStatusRequestSchema = z.object({
  projectConfigId: IDSchema,
  chatSectionId: IDSchema,
});

export type GetAgenticSummaryCacheStatusRequest = z.infer<
  typeof GetAgenticSummaryCacheStatusRequestSchema
>;

export type GetAgenticSummaryCacheStatusRequestInput = z.input<
  typeof GetAgenticSummaryCacheStatusRequestSchema
>;

export function createGetAgenticSummaryCacheStatusRequest(
  options: Partial<GetAgenticSummaryCacheStatusRequest> = {},
): GetAgenticSummaryCacheStatusRequest {
  return GetAgenticSummaryCacheStatusRequestSchema.parse(options);
}

export const GetEngineConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type GetEngineConfigRequest = z.infer<
  typeof GetEngineConfigRequestSchema
>;

export type GetEngineConfigRequestInput = z.input<
  typeof GetEngineConfigRequestSchema
>;

export function createGetEngineConfigRequest(
  options: Partial<GetEngineConfigRequest> = {},
): GetEngineConfigRequest {
  return GetEngineConfigRequestSchema.parse(options);
}

export const GetExternalAgentConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type GetExternalAgentConfigRequest = z.infer<
  typeof GetExternalAgentConfigRequestSchema
>;

export type GetExternalAgentConfigRequestInput = z.input<
  typeof GetExternalAgentConfigRequestSchema
>;

export function createGetExternalAgentConfigRequest(
  options: Partial<GetExternalAgentConfigRequest> = {},
): GetExternalAgentConfigRequest {
  return GetExternalAgentConfigRequestSchema.parse(options);
}

export const GetPromptTemplateRequestSchema = z.object({
  templateId: IDSchema,
});

export type GetPromptTemplateRequest = z.infer<
  typeof GetPromptTemplateRequestSchema
>;

export type GetPromptTemplateRequestInput = z.input<
  typeof GetPromptTemplateRequestSchema
>;

export function createGetPromptTemplateRequest(
  options: Partial<GetPromptTemplateRequest> = {},
): GetPromptTemplateRequest {
  return GetPromptTemplateRequestSchema.parse(options);
}

export const PluginRegisteredExternalAgentAdapterSchema = z.object({
  adapterId: z.string(),
  pluginId: z.string(),
  name: z.string(),
  runModes: z.array(z.string()).default([]),
  command: z.string(),
  args: z.array(z.string()).default([]),
  envVarWhitelist: z.array(z.string()).default([]),
  defaultModel: z.union([z.string(), z.null()]).default(null),
});

export type PluginRegisteredExternalAgentAdapter = z.infer<
  typeof PluginRegisteredExternalAgentAdapterSchema
>;

export type PluginRegisteredExternalAgentAdapterInput = z.input<
  typeof PluginRegisteredExternalAgentAdapterSchema
>;

export function createPluginRegisteredExternalAgentAdapter(
  options: Partial<PluginRegisteredExternalAgentAdapter> = {},
): PluginRegisteredExternalAgentAdapter {
  return PluginRegisteredExternalAgentAdapterSchema.parse(options);
}

export const RespondExternalAgentApprovalRequestSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
});

export type RespondExternalAgentApprovalRequest = z.infer<
  typeof RespondExternalAgentApprovalRequestSchema
>;

export type RespondExternalAgentApprovalRequestInput = z.input<
  typeof RespondExternalAgentApprovalRequestSchema
>;

export function createRespondExternalAgentApprovalRequest(
  options: Partial<RespondExternalAgentApprovalRequest> = {},
): RespondExternalAgentApprovalRequest {
  return RespondExternalAgentApprovalRequestSchema.parse(options);
}

export const RespondExternalAgentQuestionRequestSchema = z.object({
  toolCallId: z.string(),
  answers: z.record(z.string(), z.string()),
});

export type RespondExternalAgentQuestionRequest = z.infer<
  typeof RespondExternalAgentQuestionRequestSchema
>;

export type RespondExternalAgentQuestionRequestInput = z.input<
  typeof RespondExternalAgentQuestionRequestSchema
>;

export function createRespondExternalAgentQuestionRequest(
  options: Partial<RespondExternalAgentQuestionRequest> = {},
): RespondExternalAgentQuestionRequest {
  return RespondExternalAgentQuestionRequestSchema.parse(options);
}

export const StartAgentRunRequestSchema = z.object({
  profileId: IDSchema,
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type StartAgentRunRequest = z.infer<typeof StartAgentRunRequestSchema>;

export type StartAgentRunRequestInput = z.input<
  typeof StartAgentRunRequestSchema
>;

export function createStartAgentRunRequest(
  options: Partial<StartAgentRunRequest> = {},
): StartAgentRunRequest {
  return StartAgentRunRequestSchema.parse(options);
}

export const StartRunChainRequestSchema = z.object({
  spec: RunChainSpecSchema,
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type StartRunChainRequest = z.infer<typeof StartRunChainRequestSchema>;

export type StartRunChainRequestInput = z.input<
  typeof StartRunChainRequestSchema
>;

export function createStartRunChainRequest(
  options: Partial<StartRunChainRequest> = {},
): StartRunChainRequest {
  return StartRunChainRequestSchema.parse(options);
}

export const StopAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type StopAgentRunRequest = z.infer<typeof StopAgentRunRequestSchema>;

export type StopAgentRunRequestInput = z.input<
  typeof StopAgentRunRequestSchema
>;

export function createStopAgentRunRequest(
  options: Partial<StopAgentRunRequest> = {},
): StopAgentRunRequest {
  return StopAgentRunRequestSchema.parse(options);
}

export const StopExternalAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type StopExternalAgentRunRequest = z.infer<
  typeof StopExternalAgentRunRequestSchema
>;

export type StopExternalAgentRunRequestInput = z.input<
  typeof StopExternalAgentRunRequestSchema
>;

export function createStopExternalAgentRunRequest(
  options: Partial<StopExternalAgentRunRequest> = {},
): StopExternalAgentRunRequest {
  return StopExternalAgentRunRequestSchema.parse(options);
}

export const StopRunChainRequestSchema = z.object({
  runId: IDSchema,
});

export type StopRunChainRequest = z.infer<typeof StopRunChainRequestSchema>;

export type StopRunChainRequestInput = z.input<
  typeof StopRunChainRequestSchema
>;

export function createStopRunChainRequest(
  options: Partial<StopRunChainRequest> = {},
): StopRunChainRequest {
  return StopRunChainRequestSchema.parse(options);
}

export const UpdateAgentProfileRequestSchema = z.object({
  profile: AgentProfileSchema,
});

export type UpdateAgentProfileRequest = z.infer<
  typeof UpdateAgentProfileRequestSchema
>;

export type UpdateAgentProfileRequestInput = z.input<
  typeof UpdateAgentProfileRequestSchema
>;

export function createUpdateAgentProfileRequest(
  options: Partial<UpdateAgentProfileRequest> = {},
): UpdateAgentProfileRequest {
  return UpdateAgentProfileRequestSchema.parse(options);
}

export const UpdateEngineConfigRequestSchema = z.object({
  config: EngineConfigSchema,
});

export type UpdateEngineConfigRequest = z.infer<
  typeof UpdateEngineConfigRequestSchema
>;

export type UpdateEngineConfigRequestInput = z.input<
  typeof UpdateEngineConfigRequestSchema
>;

export function createUpdateEngineConfigRequest(
  options: Partial<UpdateEngineConfigRequest> = {},
): UpdateEngineConfigRequest {
  return UpdateEngineConfigRequestSchema.parse(options);
}

export const UpdateExternalAgentConfigRequestSchema = z.object({
  config: ExternalAgentConfigSchema,
});

export type UpdateExternalAgentConfigRequest = z.infer<
  typeof UpdateExternalAgentConfigRequestSchema
>;

export type UpdateExternalAgentConfigRequestInput = z.input<
  typeof UpdateExternalAgentConfigRequestSchema
>;

export function createUpdateExternalAgentConfigRequest(
  options: Partial<UpdateExternalAgentConfigRequest> = {},
): UpdateExternalAgentConfigRequest {
  return UpdateExternalAgentConfigRequestSchema.parse(options);
}

export const UpdatePromptTemplateRequestSchema = z.object({
  template: PromptTemplateSchema,
});

export type UpdatePromptTemplateRequest = z.infer<
  typeof UpdatePromptTemplateRequestSchema
>;

export type UpdatePromptTemplateRequestInput = z.input<
  typeof UpdatePromptTemplateRequestSchema
>;

export function createUpdatePromptTemplateRequest(
  options: Partial<UpdatePromptTemplateRequest> = {},
): UpdatePromptTemplateRequest {
  return UpdatePromptTemplateRequestSchema.parse(options);
}

export const GetAIFollowSnapshotRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type GetAIFollowSnapshotRequest = z.infer<
  typeof GetAIFollowSnapshotRequestSchema
>;

export type GetAIFollowSnapshotRequestInput = z.input<
  typeof GetAIFollowSnapshotRequestSchema
>;

export function createGetAIFollowSnapshotRequest(
  options: Partial<GetAIFollowSnapshotRequest> = {},
): GetAIFollowSnapshotRequest {
  return GetAIFollowSnapshotRequestSchema.parse(options);
}

export const GetExternalAgentChatRequestSchema = z.object({
  chatId: IDSchema,
  projectConfigId: z.union([IDSchema, z.null()]),
});

export type GetExternalAgentChatRequest = z.infer<
  typeof GetExternalAgentChatRequestSchema
>;

export type GetExternalAgentChatRequestInput = z.input<
  typeof GetExternalAgentChatRequestSchema
>;

export function createGetExternalAgentChatRequest(
  options: Partial<GetExternalAgentChatRequest> = {},
): GetExternalAgentChatRequest {
  return GetExternalAgentChatRequestSchema.parse(options);
}

export const GetExternalAgentChatResponseSchema = z.object({
  messages: z.array(
    z.discriminatedUnion("role", [
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
  waitingForResponse: z.boolean(),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
});

export type GetExternalAgentChatResponse = z.infer<
  typeof GetExternalAgentChatResponseSchema
>;

export type GetExternalAgentChatResponseInput = z.input<
  typeof GetExternalAgentChatResponseSchema
>;

export function createGetExternalAgentChatResponse(
  options: Partial<GetExternalAgentChatResponse> = {},
): GetExternalAgentChatResponse {
  return GetExternalAgentChatResponseSchema.parse(options);
}

export const GetLLMChatRequestSchema = z.object({
  chatId: IDSchema,
  projectConfigId: z.union([IDSchema, z.null()]),
});

export type GetLLMChatRequest = z.infer<typeof GetLLMChatRequestSchema>;

export type GetLLMChatRequestInput = z.input<typeof GetLLMChatRequestSchema>;

export function createGetLLMChatRequest(
  options: Partial<GetLLMChatRequest> = {},
): GetLLMChatRequest {
  return GetLLMChatRequestSchema.parse(options);
}

export const GetLLMChatRequestResponseSchema = z.object({
  messages: z.array(
    z.discriminatedUnion("role", [
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
  waitingForResponse: z.boolean(),
  llmConfig: LLMConfigSchema,
});

export type GetLLMChatRequestResponse = z.infer<
  typeof GetLLMChatRequestResponseSchema
>;

export type GetLLMChatRequestResponseInput = z.input<
  typeof GetLLMChatRequestResponseSchema
>;

export function createGetLLMChatRequestResponse(
  options: Partial<GetLLMChatRequestResponse> = {},
): GetLLMChatRequestResponse {
  return GetLLMChatRequestResponseSchema.parse(options);
}

export const GetLLMResponseRequestSchema = z.object({
  chatId: z.union([IDSchema, z.null()]),
  message: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
  engineConfigId: IDSchema,
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  thinking: z.boolean(),
  projectConfigId: IDSchema,
  sectionId: z.union([IDSchema, z.null()]).default(null),
  allowUnscoped: z.boolean().default(false),
  branchParentChatId: z.union([IDSchema, z.null()]).default(null),
  branchFromMessageId: z.union([IDSchema, z.null()]).default(null),
  appSpecStreamingEnabled: z.boolean().default(false),
  appGenerationMode: z
    .union([
      z.literal([
        "json_render",
        "json_render_with_image",
        "prompt_builder",
        "mcp_server",
      ]),
      z.null(),
    ])
    .default(null),
  appGenerationReferenceImageUrl: z.union([z.string(), z.null()]).default(null),
  appGenerationReferenceImageNotes: z
    .union([z.string(), z.null()])
    .default(null),
});

export type GetLLMResponseRequest = z.infer<typeof GetLLMResponseRequestSchema>;

export type GetLLMResponseRequestInput = z.input<
  typeof GetLLMResponseRequestSchema
>;

export function createGetLLMResponseRequest(
  options: Partial<GetLLMResponseRequest> = {},
): GetLLMResponseRequest {
  return GetLLMResponseRequestSchema.parse(options);
}

export const StopLLMChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type StopLLMChatRequest = z.infer<typeof StopLLMChatRequestSchema>;

export type StopLLMChatRequestInput = z.input<typeof StopLLMChatRequestSchema>;

export function createStopLLMChatRequest(
  options: Partial<StopLLMChatRequest> = {},
): StopLLMChatRequest {
  return StopLLMChatRequestSchema.parse(options);
}

export const AppPolicyOverridesSchema = z.object({
  allowParamChanges: z.union([z.boolean(), z.null()]).default(null),
  allowVariantChanges: z.union([z.boolean(), z.null()]).default(null),
  allowLayoutChanges: z.union([z.boolean(), z.null()]).default(null),
  allowRun: z.union([z.boolean(), z.null()]).default(null),
  allowLLM: z.union([z.boolean(), z.null()]).default(null),
  allowExternalLinks: z.union([z.boolean(), z.null()]).default(null),
  allowFileDownloads: z.union([z.boolean(), z.null()]).default(null),
  allowMultipleRuns: z.union([z.boolean(), z.null()]).default(null),
  runSnapshotMode: z
    .union([z.enum(RunSnapshotModeEnum), z.null()])
    .default(null),
});

export type AppPolicyOverrides = z.infer<typeof AppPolicyOverridesSchema>;

export type AppPolicyOverridesInput = z.input<typeof AppPolicyOverridesSchema>;

export function createAppPolicyOverrides(
  options: Partial<AppPolicyOverrides> = {},
): AppPolicyOverrides {
  return AppPolicyOverridesSchema.parse(options);
}

export const LoadAppProjectConfigRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type LoadAppProjectConfigRequest = z.infer<
  typeof LoadAppProjectConfigRequestSchema
>;

export type LoadAppProjectConfigRequestInput = z.input<
  typeof LoadAppProjectConfigRequestSchema
>;

export function createLoadAppProjectConfigRequest(
  options: Partial<LoadAppProjectConfigRequest> = {},
): LoadAppProjectConfigRequest {
  return LoadAppProjectConfigRequestSchema.parse(options);
}

export const PublishAppDeploymentRequestSchema = z.object({
  deploymentName: z.string(),
  projectConfigId: IDSchema,
  appPolicyOverrides: z
    .union([AppPolicyOverridesSchema, z.null()])
    .default(null),
  listenerEntrypoint: z.union([z.string(), z.null()]).default(null),
  listenerEnabled: z.boolean().default(true),
});

export type PublishAppDeploymentRequest = z.infer<
  typeof PublishAppDeploymentRequestSchema
>;

export type PublishAppDeploymentRequestInput = z.input<
  typeof PublishAppDeploymentRequestSchema
>;

export function createPublishAppDeploymentRequest(
  options: Partial<PublishAppDeploymentRequest> = {},
): PublishAppDeploymentRequest {
  return PublishAppDeploymentRequestSchema.parse(options);
}

export const AppGenSkillContentSchema = z.object({
  skillId: z.string(),
  content: z.string(),
  truncated: z.boolean().default(false),
  originalSizeBytes: z.int(),
});

export type AppGenSkillContent = z.infer<typeof AppGenSkillContentSchema>;

export type AppGenSkillContentInput = z.input<typeof AppGenSkillContentSchema>;

export function createAppGenSkillContent(
  options: Partial<AppGenSkillContent> = {},
): AppGenSkillContent {
  return AppGenSkillContentSchema.parse(options);
}

export const AppGenSkillEntrySchema = z.object({
  skillId: z.string(),
  name: z.string(),
  rootLabel: z.string(),
  rootPath: z.string(),
  relativePath: z.string(),
  description: z.string().default("" as const),
});

export type AppGenSkillEntry = z.infer<typeof AppGenSkillEntrySchema>;

export type AppGenSkillEntryInput = z.input<typeof AppGenSkillEntrySchema>;

export function createAppGenSkillEntry(
  options: Partial<AppGenSkillEntry> = {},
): AppGenSkillEntry {
  return AppGenSkillEntrySchema.parse(options);
}

export const GetAppGenSkillContentRequestSchema = z.object({
  skillId: z.string(),
});

export type GetAppGenSkillContentRequest = z.infer<
  typeof GetAppGenSkillContentRequestSchema
>;

export type GetAppGenSkillContentRequestInput = z.input<
  typeof GetAppGenSkillContentRequestSchema
>;

export function createGetAppGenSkillContentRequest(
  options: Partial<GetAppGenSkillContentRequest> = {},
): GetAppGenSkillContentRequest {
  return GetAppGenSkillContentRequestSchema.parse(options);
}

export const StreamingChoicesSchema = z.object({});

export type StreamingChoices = z.infer<typeof StreamingChoicesSchema>;

export type StreamingChoicesInput = z.input<typeof StreamingChoicesSchema>;

export function createStreamingChoices(
  options: Partial<StreamingChoices> = {},
): StreamingChoices {
  return StreamingChoicesSchema.parse(options);
}

export const ModelResponseStreamSchema = z.object({
  id: z.string(),
  created: z.int(),
  model: z.union([z.string(), z.null()]).default(null),
  object: z.string(),
  system_fingerprint: z.union([z.string(), z.null()]).default(null),
  choices: z.array(StreamingChoicesSchema),
  provider_specific_fields: z
    .union([z.record(z.string(), z.any()), z.null()])
    .default(null),
});

export type ModelResponseStream = z.infer<typeof ModelResponseStreamSchema>;

export type ModelResponseStreamInput = z.input<
  typeof ModelResponseStreamSchema
>;

export function createModelResponseStream(
  options: Partial<ModelResponseStream> = {},
): ModelResponseStream {
  return ModelResponseStreamSchema.parse(options);
}

export const StreamAppSpecRequestSchema = z.object({
  prompt: z.string(),
  mode: z
    .union([
      z.literal([
        "json_render",
        "json_render_with_image",
        "prompt_builder",
        "mcp_server",
      ]),
      z.null(),
    ])
    .default(null),
  referenceImageUrl: z.union([z.string(), z.null()]).default(null),
  referenceImageNotes: z.union([z.string(), z.null()]).default(null),
  context: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  currentSpec: z.union([z.any(), z.null()]).default(null),
});

export type StreamAppSpecRequest = z.infer<typeof StreamAppSpecRequestSchema>;

export type StreamAppSpecRequestInput = z.input<
  typeof StreamAppSpecRequestSchema
>;

export function createStreamAppSpecRequest(
  options: Partial<StreamAppSpecRequest> = {},
): StreamAppSpecRequest {
  return StreamAppSpecRequestSchema.parse(options);
}

export const ArtifactSaveResultSchema = z.object({
  id: z.string(),
  type: z.enum(ArtifactTypeEnum),
  status: z.literal(["saved", "unchanged", "skipped", "conflict"]),
  backupPath: z.union([z.string(), z.null()]).default(null),
  message: z.union([z.string(), z.null()]).default(null),
});

export type ArtifactSaveResult = z.infer<typeof ArtifactSaveResultSchema>;

export type ArtifactSaveResultInput = z.input<typeof ArtifactSaveResultSchema>;

export function createArtifactSaveResult(
  options: Partial<ArtifactSaveResult> = {},
): ArtifactSaveResult {
  return ArtifactSaveResultSchema.parse(options);
}

export const CheckIfFileExistsRequestsSchema = z.object({
  filepath: z.string(),
});

export type CheckIfFileExistsRequests = z.infer<
  typeof CheckIfFileExistsRequestsSchema
>;

export type CheckIfFileExistsRequestsInput = z.input<
  typeof CheckIfFileExistsRequestsSchema
>;

export function createCheckIfFileExistsRequests(
  options: Partial<CheckIfFileExistsRequests> = {},
): CheckIfFileExistsRequests {
  return CheckIfFileExistsRequestsSchema.parse(options);
}

export const DeleteArtifactRequestItemSchema = z.object({
  id: z.string(),
  type: z.enum(ArtifactTypeEnum),
});

export type DeleteArtifactRequestItem = z.infer<
  typeof DeleteArtifactRequestItemSchema
>;

export type DeleteArtifactRequestItemInput = z.input<
  typeof DeleteArtifactRequestItemSchema
>;

export function createDeleteArtifactRequestItem(
  options: Partial<DeleteArtifactRequestItem> = {},
): DeleteArtifactRequestItem {
  return DeleteArtifactRequestItemSchema.parse(options);
}

export const DeleteArtifactsRequestSchema = z.object({
  artifacts: z.array(DeleteArtifactRequestItemSchema),
});

export type DeleteArtifactsRequest = z.infer<
  typeof DeleteArtifactsRequestSchema
>;

export type DeleteArtifactsRequestInput = z.input<
  typeof DeleteArtifactsRequestSchema
>;

export function createDeleteArtifactsRequest(
  options: Partial<DeleteArtifactsRequest> = {},
): DeleteArtifactsRequest {
  return DeleteArtifactsRequestSchema.parse(options);
}

export const FileBrowserDownloadUrlEntrySchema = z.object({
  path: z.string(),
  url: z.string(),
  expiresAt: z.int(),
});

export type FileBrowserDownloadUrlEntry = z.infer<
  typeof FileBrowserDownloadUrlEntrySchema
>;

export type FileBrowserDownloadUrlEntryInput = z.input<
  typeof FileBrowserDownloadUrlEntrySchema
>;

export function createFileBrowserDownloadUrlEntry(
  options: Partial<FileBrowserDownloadUrlEntry> = {},
): FileBrowserDownloadUrlEntry {
  return FileBrowserDownloadUrlEntrySchema.parse(options);
}

export const GetFileBrowserDownloadUrlsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type GetFileBrowserDownloadUrlsRequest = z.infer<
  typeof GetFileBrowserDownloadUrlsRequestSchema
>;

export type GetFileBrowserDownloadUrlsRequestInput = z.input<
  typeof GetFileBrowserDownloadUrlsRequestSchema
>;

export function createGetFileBrowserDownloadUrlsRequest(
  options: Partial<GetFileBrowserDownloadUrlsRequest> = {},
): GetFileBrowserDownloadUrlsRequest {
  return GetFileBrowserDownloadUrlsRequestSchema.parse(options);
}

export const GetFileBrowserRootResponseSchema = z.object({
  rootPath: z.string(),
  pathSeparator: z.string(),
  ignorePatterns: z.array(z.string()),
});

export type GetFileBrowserRootResponse = z.infer<
  typeof GetFileBrowserRootResponseSchema
>;

export type GetFileBrowserRootResponseInput = z.input<
  typeof GetFileBrowserRootResponseSchema
>;

export function createGetFileBrowserRootResponse(
  options: Partial<GetFileBrowserRootResponse> = {},
): GetFileBrowserRootResponse {
  return GetFileBrowserRootResponseSchema.parse(options);
}

export const GetFolderContentsRequestSchema = z.object({
  folderPath: z.string(),
  includeMtime: z.boolean().default(false),
  includeSize: z.boolean().default(false),
  includeHidden: z.boolean().default(false),
  ignorePatterns: z.union([z.array(z.string()), z.null()]).default(null),
  maxEntries: z.union([z.int(), z.null()]).default(null),
  missingFolderBehavior: z
    .literal(["error", "empty"])
    .default("error" as const),
});

export type GetFolderContentsRequest = z.infer<
  typeof GetFolderContentsRequestSchema
>;

export type GetFolderContentsRequestInput = z.input<
  typeof GetFolderContentsRequestSchema
>;

export function createGetFolderContentsRequest(
  options: Partial<GetFolderContentsRequest> = {},
): GetFolderContentsRequest {
  return GetFolderContentsRequestSchema.parse(options);
}

export const ImportFilesToArtifactsRequestSchema = z.object({
  paths: z.array(z.string()),
  uploadScope: z.literal(["chat", "generic"]),
});

export type ImportFilesToArtifactsRequest = z.infer<
  typeof ImportFilesToArtifactsRequestSchema
>;

export type ImportFilesToArtifactsRequestInput = z.input<
  typeof ImportFilesToArtifactsRequestSchema
>;

export function createImportFilesToArtifactsRequest(
  options: Partial<ImportFilesToArtifactsRequest> = {},
): ImportFilesToArtifactsRequest {
  return ImportFilesToArtifactsRequestSchema.parse(options);
}

export const ImportFilesToArtifactsResponseItemSchema = z.object({
  kind: z.literal("file").default("file" as const),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.int(),
});

export type ImportFilesToArtifactsResponseItem = z.infer<
  typeof ImportFilesToArtifactsResponseItemSchema
>;

export type ImportFilesToArtifactsResponseItemInput = z.input<
  typeof ImportFilesToArtifactsResponseItemSchema
>;

export function createImportFilesToArtifactsResponseItem(
  options: Partial<ImportFilesToArtifactsResponseItem> = {},
): ImportFilesToArtifactsResponseItem {
  return ImportFilesToArtifactsResponseItemSchema.parse(options);
}

export const LoadCachedPathsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type LoadCachedPathsRequest = z.infer<
  typeof LoadCachedPathsRequestSchema
>;

export type LoadCachedPathsRequestInput = z.input<
  typeof LoadCachedPathsRequestSchema
>;

export function createLoadCachedPathsRequest(
  options: Partial<LoadCachedPathsRequest> = {},
): LoadCachedPathsRequest {
  return LoadCachedPathsRequestSchema.parse(options);
}

export const UpdateArtifactsRequestSchema = z.object({
  artifacts: z.array(
    z.union([
      ImageArtifactSchema,
      BrushStrokeArtifactSchema,
      DrawAreaLayerItemTransformArtifactSchema,
      ChartDataArtifactSchema,
      FileArtifactSchema,
    ]),
  ),
  conflictStrategy: z
    .union([z.enum(SaveConflictStrategyEnum), z.null()])
    .default(null),
  uploadScope: z.literal(["chat", "generic"]),
});

export type UpdateArtifactsRequest = z.infer<
  typeof UpdateArtifactsRequestSchema
>;

export type UpdateArtifactsRequestInput = z.input<
  typeof UpdateArtifactsRequestSchema
>;

export function createUpdateArtifactsRequest(
  options: Partial<UpdateArtifactsRequest> = {},
): UpdateArtifactsRequest {
  return UpdateArtifactsRequestSchema.parse(options);
}

export const AttachmentDownloadUrlEntrySchema = z.object({
  artifactId: z.string(),
  url: z.string(),
  expiresAt: z.int(),
});

export type AttachmentDownloadUrlEntry = z.infer<
  typeof AttachmentDownloadUrlEntrySchema
>;

export type AttachmentDownloadUrlEntryInput = z.input<
  typeof AttachmentDownloadUrlEntrySchema
>;

export function createAttachmentDownloadUrlEntry(
  options: Partial<AttachmentDownloadUrlEntry> = {},
): AttachmentDownloadUrlEntry {
  return AttachmentDownloadUrlEntrySchema.parse(options);
}

export const GetAttachmentDownloadUrlRequestSchema = z.object({
  artifactId: z.string(),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type GetAttachmentDownloadUrlRequest = z.infer<
  typeof GetAttachmentDownloadUrlRequestSchema
>;

export type GetAttachmentDownloadUrlRequestInput = z.input<
  typeof GetAttachmentDownloadUrlRequestSchema
>;

export function createGetAttachmentDownloadUrlRequest(
  options: Partial<GetAttachmentDownloadUrlRequest> = {},
): GetAttachmentDownloadUrlRequest {
  return GetAttachmentDownloadUrlRequestSchema.parse(options);
}

export const GetAttachmentDownloadUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.int(),
});

export type GetAttachmentDownloadUrlResponse = z.infer<
  typeof GetAttachmentDownloadUrlResponseSchema
>;

export type GetAttachmentDownloadUrlResponseInput = z.input<
  typeof GetAttachmentDownloadUrlResponseSchema
>;

export function createGetAttachmentDownloadUrlResponse(
  options: Partial<GetAttachmentDownloadUrlResponse> = {},
): GetAttachmentDownloadUrlResponse {
  return GetAttachmentDownloadUrlResponseSchema.parse(options);
}

export const GetAttachmentDownloadUrlsRequestSchema = z.object({
  artifactIds: z.array(z.string()),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type GetAttachmentDownloadUrlsRequest = z.infer<
  typeof GetAttachmentDownloadUrlsRequestSchema
>;

export type GetAttachmentDownloadUrlsRequestInput = z.input<
  typeof GetAttachmentDownloadUrlsRequestSchema
>;

export function createGetAttachmentDownloadUrlsRequest(
  options: Partial<GetAttachmentDownloadUrlsRequest> = {},
): GetAttachmentDownloadUrlsRequest {
  return GetAttachmentDownloadUrlsRequestSchema.parse(options);
}

export const BootstrapConsumeRequestSchema = z.object({
  token: z.union([z.string(), z.null()]).default(null),
});

export type BootstrapConsumeRequest = z.infer<
  typeof BootstrapConsumeRequestSchema
>;

export type BootstrapConsumeRequestInput = z.input<
  typeof BootstrapConsumeRequestSchema
>;

export function createBootstrapConsumeRequest(
  options: Partial<BootstrapConsumeRequest> = {},
): BootstrapConsumeRequest {
  return BootstrapConsumeRequestSchema.parse(options);
}

export const DocstringToMarkdownRequestSchema = z.object({
  docstring: z.string(),
});

export type DocstringToMarkdownRequest = z.infer<
  typeof DocstringToMarkdownRequestSchema
>;

export type DocstringToMarkdownRequestInput = z.input<
  typeof DocstringToMarkdownRequestSchema
>;

export function createDocstringToMarkdownRequest(
  options: Partial<DocstringToMarkdownRequest> = {},
): DocstringToMarkdownRequest {
  return DocstringToMarkdownRequestSchema.parse(options);
}

export const LaunchErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type LaunchErrorPayload = z.infer<typeof LaunchErrorPayloadSchema>;

export type LaunchErrorPayloadInput = z.input<typeof LaunchErrorPayloadSchema>;

export function createLaunchErrorPayload(
  options: Partial<LaunchErrorPayload> = {},
): LaunchErrorPayload {
  return LaunchErrorPayloadSchema.parse(options);
}

export const LaunchRequestSchema = z.object({
  workspaceRoot: z.union([z.string(), z.null()]).default(null),
  profile: z.union([z.string(), z.null()]).default(null),
  settaHome: z.union([z.string(), z.null()]).default(null),
  settaFilesRoot: z.union([z.string(), z.null()]).default(null),
  settaFilesLocation: z
    .union([z.literal(["auto", "local", "global"]), z.null()])
    .default(null),
  runtimeRoot: z.union([z.string(), z.null()]).default(null),
  sshTarget: z.union([z.string(), z.null()]).default(null),
  sshArgs: z.union([z.string(), z.null()]).default(null),
  remoteCmd: z.union([z.string(), z.null()]).default(null),
  localPort: z.union([z.int(), z.null()]).default(null),
});

export type LaunchRequest = z.infer<typeof LaunchRequestSchema>;

export type LaunchRequestInput = z.input<typeof LaunchRequestSchema>;

export function createLaunchRequest(
  options: Partial<LaunchRequest> = {},
): LaunchRequest {
  return LaunchRequestSchema.parse(options);
}

export const LaunchSessionInfoSchema = z.object({
  id: z.string(),
  workspacePath: z.string(),
  workspacePathCanonical: z.string(),
  host: z.string(),
  port: z.int(),
  pid: z.int(),
  startedAt: z.string(),
});

export type LaunchSessionInfo = z.infer<typeof LaunchSessionInfoSchema>;

export type LaunchSessionInfoInput = z.input<typeof LaunchSessionInfoSchema>;

export function createLaunchSessionInfo(
  options: Partial<LaunchSessionInfo> = {},
): LaunchSessionInfo {
  return LaunchSessionInfoSchema.parse(options);
}

export const LaunchResponseSchema = z.object({
  ok: z.boolean(),
  bootstrapUrlFragment: z.union([z.string(), z.null()]).default(null),
  workspaceRoot: z.union([z.string(), z.null()]).default(null),
  settaFilesLocation: z
    .union([z.literal(["local", "global"]), z.null()])
    .default(null),
  settaFilesRoot: z.union([z.string(), z.null()]).default(null),
  runtimeRoot: z.union([z.string(), z.null()]).default(null),
  settaHome: z.union([z.string(), z.null()]).default(null),
  profile: z.union([z.string(), z.null()]).default(null),
  sessionId: z.union([z.string(), z.null()]).default(null),
  startedNew: z.union([z.boolean(), z.null()]).default(null),
  session: z.union([LaunchSessionInfoSchema, z.null()]).default(null),
  remoteCmdResolved: z.union([z.string(), z.null()]).default(null),
  error: z.union([LaunchErrorPayloadSchema, z.null()]).default(null),
});

export type LaunchResponse = z.infer<typeof LaunchResponseSchema>;

export type LaunchResponseInput = z.input<typeof LaunchResponseSchema>;

export function createLaunchResponse(
  options: Partial<LaunchResponse> = {},
): LaunchResponse {
  return LaunchResponseSchema.parse(options);
}

export const UpdateAPIKeysRequestSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
});

export type UpdateAPIKeysRequest = z.infer<typeof UpdateAPIKeysRequestSchema>;

export type UpdateAPIKeysRequestInput = z.input<
  typeof UpdateAPIKeysRequestSchema
>;

export function createUpdateAPIKeysRequest(
  options: Partial<UpdateAPIKeysRequest> = {},
): UpdateAPIKeysRequest {
  return UpdateAPIKeysRequestSchema.parse(options);
}

export const TypeCheckRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type TypeCheckRequest = z.infer<typeof TypeCheckRequestSchema>;

export type TypeCheckRequestInput = z.input<typeof TypeCheckRequestSchema>;

export function createTypeCheckRequest(
  options: Partial<TypeCheckRequest> = {},
): TypeCheckRequest {
  return TypeCheckRequestSchema.parse(options);
}

export const AudioContentSchema = z.object({
  type: z.literal("audio"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type AudioContent = z.infer<typeof AudioContentSchema>;

export type AudioContentInput = z.input<typeof AudioContentSchema>;

export function createAudioContent(
  options: Partial<AudioContent> = {},
): AudioContent {
  return AudioContentSchema.parse(options);
}

export const IconSchema = z.object({
  src: z.string(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  sizes: z.union([z.array(z.string()), z.null()]).default(null),
});

export type Icon = z.infer<typeof IconSchema>;

export type IconInput = z.input<typeof IconSchema>;

export function createIcon(options: Partial<Icon> = {}): Icon {
  return IconSchema.parse(options);
}

export const ResourceLinkSchema = z.object({
  name: z.string(),
  title: z.union([z.string(), z.null()]).default(null),
  uri: z.url(),
  description: z.union([z.string(), z.null()]).default(null),
  mimeType: z.union([z.string(), z.null()]).default(null),
  size: z.union([z.int(), z.null()]).default(null),
  icons: z.union([z.array(IconSchema), z.null()]).default(null),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  type: z.literal("resource_link"),
});

export type ResourceLink = z.infer<typeof ResourceLinkSchema>;

export type ResourceLinkInput = z.input<typeof ResourceLinkSchema>;

export function createResourceLink(
  options: Partial<ResourceLink> = {},
): ResourceLink {
  return ResourceLinkSchema.parse(options);
}

export const CallToolResultSchema = z.object({
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  content: z.array(
    z.union([
      TextContentSchema,
      ImageContentSchema,
      AudioContentSchema,
      ResourceLinkSchema,
      EmbeddedResourceSchema,
    ]),
  ),
  structuredContent: z
    .union([z.record(z.string(), z.any()), z.null()])
    .default(null),
  isError: z.boolean().default(false),
});

export type CallToolResult = z.infer<typeof CallToolResultSchema>;

export type CallToolResultInput = z.input<typeof CallToolResultSchema>;

export function createCallToolResult(
  options: Partial<CallToolResult> = {},
): CallToolResult {
  return CallToolResultSchema.parse(options);
}

export const ContextSchema = z.object({});

export type Context = z.infer<typeof ContextSchema>;

export type ContextInput = z.input<typeof ContextSchema>;

export function createContext(options: Partial<Context> = {}): Context {
  return ContextSchema.parse(options);
}

export const MCPToolCallAgenticContextSchema = z.object({
  projectConfigId: IDSchema,
  chatId: z.union([IDSchema, z.null()]).default(null),
  sectionId: z.union([IDSchema, z.null()]).default(null),
  allowUnscoped: z.boolean().default(false),
  shareSessionId: z.union([z.string(), z.null()]).default(null),
});

export type MCPToolCallAgenticContext = z.infer<
  typeof MCPToolCallAgenticContextSchema
>;

export type MCPToolCallAgenticContextInput = z.input<
  typeof MCPToolCallAgenticContextSchema
>;

export function createMCPToolCallAgenticContext(
  options: Partial<MCPToolCallAgenticContext> = {},
): MCPToolCallAgenticContext {
  return MCPToolCallAgenticContextSchema.parse(options);
}

export const MCPToolCallRequestSchema = z.object({
  tool: z.string(),
  arguments: z.union([z.any(), z.null()]).default(null),
  agenticContext: z.any().default(null),
});

export type MCPToolCallRequest = z.infer<typeof MCPToolCallRequestSchema>;

export type MCPToolCallRequestInput = z.input<typeof MCPToolCallRequestSchema>;

export function createMCPToolCallRequest(
  options: Partial<MCPToolCallRequest> = {},
): MCPToolCallRequest {
  return MCPToolCallRequestSchema.parse(options);
}

export const PluginConfigRequestSchema = z.object({
  pluginId: z.string(),
  config: z.record(z.string(), z.any()),
});

export type PluginConfigRequest = z.infer<typeof PluginConfigRequestSchema>;

export type PluginConfigRequestInput = z.input<
  typeof PluginConfigRequestSchema
>;

export function createPluginConfigRequest(
  options: Partial<PluginConfigRequest> = {},
): PluginConfigRequest {
  return PluginConfigRequestSchema.parse(options);
}

export const PluginConfigWriteResponseSchema = z.object({
  pluginId: z.string(),
  config: z.record(z.string(), z.any()),
  validation: z.record(z.string(), z.any()),
});

export type PluginConfigWriteResponse = z.infer<
  typeof PluginConfigWriteResponseSchema
>;

export type PluginConfigWriteResponseInput = z.input<
  typeof PluginConfigWriteResponseSchema
>;

export function createPluginConfigWriteResponse(
  options: Partial<PluginConfigWriteResponse> = {},
): PluginConfigWriteResponse {
  return PluginConfigWriteResponseSchema.parse(options);
}

export const PluginEnableDisableRequestSchema = z.object({
  pluginId: z.string(),
});

export type PluginEnableDisableRequest = z.infer<
  typeof PluginEnableDisableRequestSchema
>;

export type PluginEnableDisableRequestInput = z.input<
  typeof PluginEnableDisableRequestSchema
>;

export function createPluginEnableDisableRequest(
  options: Partial<PluginEnableDisableRequest> = {},
): PluginEnableDisableRequest {
  return PluginEnableDisableRequestSchema.parse(options);
}

export const PluginRuntimeStateEnum = {
  active: "active",
  disabled: "disabled",
  invalid: "invalid",
  shadowed: "shadowed",
  pending_restart: "pending_restart",
} as const;

export type PluginRuntimeState = ObjectValues<typeof PluginRuntimeStateEnum>;

export const PluginEnableDisableResponseSchema = z.object({
  pluginId: z.string(),
  state: z.enum(PluginRuntimeStateEnum),
  restartRequired: z.boolean(),
});

export type PluginEnableDisableResponse = z.infer<
  typeof PluginEnableDisableResponseSchema
>;

export type PluginEnableDisableResponseInput = z.input<
  typeof PluginEnableDisableResponseSchema
>;

export function createPluginEnableDisableResponse(
  options: Partial<PluginEnableDisableResponse> = {},
): PluginEnableDisableResponse {
  return PluginEnableDisableResponseSchema.parse(options);
}

export const PluginInstallRequestSchema = z.object({
  sourceSpec: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  installer: z.literal(["auto", "pip", "uv"]).default("auto" as const),
  enable: z.boolean().default(true),
  force: z.boolean().default(false),
});

export type PluginInstallRequest = z.infer<typeof PluginInstallRequestSchema>;

export type PluginInstallRequestInput = z.input<
  typeof PluginInstallRequestSchema
>;

export function createPluginInstallRequest(
  options: Partial<PluginInstallRequest> = {},
): PluginInstallRequest {
  return PluginInstallRequestSchema.parse(options);
}

export const PluginScopeEnum = {
  workspace: "workspace",
  setta_files: "setta_files",
  global_scope: "global",
} as const;

export type PluginScope = ObjectValues<typeof PluginScopeEnum>;

export const PluginSourceTrustStatusEnum = {
  unverified: "unverified",
} as const;

export type PluginSourceTrustStatus = ObjectValues<
  typeof PluginSourceTrustStatusEnum
>;

export const PluginInstallResponseSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  sourceScope: z.enum(PluginScopeEnum),
  sourceScopeLabel: z.literal(["workspace", "setta_files", "global"]),
  sourcePath: z.string(),
  canonicalSourceKey: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]).default(null),
  requestedCapabilities: z.array(z.string()).default([]),
  trustStatus: z.enum(PluginSourceTrustStatusEnum),
  trustWarning: z.string(),
  components: z.array(z.string()),
  state: z.enum(PluginRuntimeStateEnum),
  restartRequired: z.boolean(),
});

export type PluginInstallResponse = z.infer<typeof PluginInstallResponseSchema>;

export type PluginInstallResponseInput = z.input<
  typeof PluginInstallResponseSchema
>;

export function createPluginInstallResponse(
  options: Partial<PluginInstallResponse> = {},
): PluginInstallResponse {
  return PluginInstallResponseSchema.parse(options);
}

export const PluginLinkRequestSchema = z.object({
  localPluginRoot: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  enable: z.boolean().default(true),
  force: z.boolean().default(false),
});

export type PluginLinkRequest = z.infer<typeof PluginLinkRequestSchema>;

export type PluginLinkRequestInput = z.input<typeof PluginLinkRequestSchema>;

export function createPluginLinkRequest(
  options: Partial<PluginLinkRequest> = {},
): PluginLinkRequest {
  return PluginLinkRequestSchema.parse(options);
}

export const PluginLockApplyRequestSchema = z.object({
  check: z.boolean().default(false),
});

export type PluginLockApplyRequest = z.infer<
  typeof PluginLockApplyRequestSchema
>;

export type PluginLockApplyRequestInput = z.input<
  typeof PluginLockApplyRequestSchema
>;

export function createPluginLockApplyRequest(
  options: Partial<PluginLockApplyRequest> = {},
): PluginLockApplyRequest {
  return PluginLockApplyRequestSchema.parse(options);
}

export const PluginLockApplyResponseSchema = z.object({
  lockfilePath: z.string(),
  plannedChanges: z.array(z.string()),
  applied: z.boolean(),
});

export type PluginLockApplyResponse = z.infer<
  typeof PluginLockApplyResponseSchema
>;

export type PluginLockApplyResponseInput = z.input<
  typeof PluginLockApplyResponseSchema
>;

export function createPluginLockApplyResponse(
  options: Partial<PluginLockApplyResponse> = {},
): PluginLockApplyResponse {
  return PluginLockApplyResponseSchema.parse(options);
}

export const PluginLockWriteResponseSchema = z.object({
  lockfilePath: z.string(),
  pluginCount: z.int(),
});

export type PluginLockWriteResponse = z.infer<
  typeof PluginLockWriteResponseSchema
>;

export type PluginLockWriteResponseInput = z.input<
  typeof PluginLockWriteResponseSchema
>;

export function createPluginLockWriteResponse(
  options: Partial<PluginLockWriteResponse> = {},
): PluginLockWriteResponse {
  return PluginLockWriteResponseSchema.parse(options);
}

export const PluginRestartResponseSchema = z.object({
  accepted: z.boolean(),
  mode: z.literal(["programmatic", "manual"]),
  command: z.union([z.string(), z.null()]).default(null),
  reason: z.union([z.string(), z.null()]).default(null),
});

export type PluginRestartResponse = z.infer<typeof PluginRestartResponseSchema>;

export type PluginRestartResponseInput = z.input<
  typeof PluginRestartResponseSchema
>;

export function createPluginRestartResponse(
  options: Partial<PluginRestartResponse> = {},
): PluginRestartResponse {
  return PluginRestartResponseSchema.parse(options);
}

export const PluginRollbackRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
});

export type PluginRollbackRequest = z.infer<typeof PluginRollbackRequestSchema>;

export type PluginRollbackRequestInput = z.input<
  typeof PluginRollbackRequestSchema
>;

export function createPluginRollbackRequest(
  options: Partial<PluginRollbackRequest> = {},
): PluginRollbackRequest {
  return PluginRollbackRequestSchema.parse(options);
}

export const PluginRollbackResponseSchema = z.object({
  pluginId: z.string(),
  restoredVersion: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]),
  restartRequired: z.boolean(),
});

export type PluginRollbackResponse = z.infer<
  typeof PluginRollbackResponseSchema
>;

export type PluginRollbackResponseInput = z.input<
  typeof PluginRollbackResponseSchema
>;

export function createPluginRollbackResponse(
  options: Partial<PluginRollbackResponse> = {},
): PluginRollbackResponse {
  return PluginRollbackResponseSchema.parse(options);
}

export const PluginRestartCapabilitySchema = z.object({
  mode: z.literal(["programmatic", "manual"]),
  command: z.union([z.string(), z.null()]).default(null),
  reason: z.union([z.string(), z.null()]).default(null),
});

export type PluginRestartCapability = z.infer<
  typeof PluginRestartCapabilitySchema
>;

export type PluginRestartCapabilityInput = z.input<
  typeof PluginRestartCapabilitySchema
>;

export function createPluginRestartCapability(
  options: Partial<PluginRestartCapability> = {},
): PluginRestartCapability {
  return PluginRestartCapabilitySchema.parse(options);
}

export const PluginSourceManagerEnum = {
  setta: "setta",
  package_manager: "package_manager",
} as const;

export type PluginSourceManager = ObjectValues<typeof PluginSourceManagerEnum>;

export const PluginFrontendDescriptorSchema = z.object({
  entrypointUrl: z.union([z.string(), z.null()]).default(null),
  styleUrl: z.union([z.string(), z.null()]).default(null),
});

export type PluginFrontendDescriptor = z.infer<
  typeof PluginFrontendDescriptorSchema
>;

export type PluginFrontendDescriptorInput = z.input<
  typeof PluginFrontendDescriptorSchema
>;

export function createPluginFrontendDescriptor(
  options: Partial<PluginFrontendDescriptor> = {},
): PluginFrontendDescriptor {
  return PluginFrontendDescriptorSchema.parse(options);
}

export const PluginContentDescriptorSchema = z.object({
  hasBlueprints: z.boolean(),
  hasProjectTemplates: z.boolean(),
  hasPrompts: z.boolean(),
});

export type PluginContentDescriptor = z.infer<
  typeof PluginContentDescriptorSchema
>;

export type PluginContentDescriptorInput = z.input<
  typeof PluginContentDescriptorSchema
>;

export function createPluginContentDescriptor(
  options: Partial<PluginContentDescriptor> = {},
): PluginContentDescriptor {
  return PluginContentDescriptorSchema.parse(options);
}

export const PluginConfigDescriptorSchema = z.object({
  hasSchema: z.boolean(),
  schemaJson: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  schemaJsonDigestSha256: z.union([z.string(), z.null()]).default(null),
  currentConfig: z.record(z.string(), z.any()).default({}),
  currentConfigDigestSha256: z.union([z.string(), z.null()]).default(null),
});

export type PluginConfigDescriptor = z.infer<
  typeof PluginConfigDescriptorSchema
>;

export type PluginConfigDescriptorInput = z.input<
  typeof PluginConfigDescriptorSchema
>;

export function createPluginConfigDescriptor(
  options: Partial<PluginConfigDescriptor> = {},
): PluginConfigDescriptor {
  return PluginConfigDescriptorSchema.parse(options);
}

export const PluginEnablementSourceEnum = {
  workspace_disabled: "workspace_disabled",
  workspace_enabled: "workspace_enabled",
  global_auto_enabled: "global_auto_enabled",
  manifest_default: "manifest_default",
} as const;

export type PluginEnablementSource = ObjectValues<
  typeof PluginEnablementSourceEnum
>;

export const PluginListEntrySchema = z.object({
  pluginId: z.string(),
  name: z.string(),
  version: z.string(),
  sourceScope: z.enum(PluginScopeEnum),
  sourceScopeLabel: z.literal(["workspace", "setta_files", "global"]),
  sourceManager: z
    .enum(PluginSourceManagerEnum)
    .default(PluginSourceManagerEnum.setta),
  sourceManagerHint: z.union([z.string(), z.null()]).default(null),
  canonicalSourceKey: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]).default(null),
  frontend: PluginFrontendDescriptorSchema,
  content: PluginContentDescriptorSchema,
  config: PluginConfigDescriptorSchema,
  effectiveCapabilities: z.array(z.string()),
  enablementSource: z
    .union([z.enum(PluginEnablementSourceEnum), z.null()])
    .default(null),
  restartRequired: z.boolean(),
});

export type PluginListEntry = z.infer<typeof PluginListEntrySchema>;

export type PluginListEntryInput = z.input<typeof PluginListEntrySchema>;

export function createPluginListEntry(
  options: Partial<PluginListEntry> = {},
): PluginListEntry {
  return PluginListEntrySchema.parse(options);
}

export const PluginListResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app"]),
  restartCapability: PluginRestartCapabilitySchema,
  plugins: z.array(PluginListEntrySchema),
});

export type PluginListResponse = z.infer<typeof PluginListResponseSchema>;

export type PluginListResponseInput = z.input<typeof PluginListResponseSchema>;

export function createPluginListResponse(
  options: Partial<PluginListResponse> = {},
): PluginListResponse {
  return PluginListResponseSchema.parse(options);
}

export const BlockedCapabilityReasonEnum = {
  mode_policy: "mode_policy",
  host_policy: "host_policy",
  manifest_invalid: "manifest_invalid",
} as const;

export type BlockedCapabilityReason = ObjectValues<
  typeof BlockedCapabilityReasonEnum
>;

export const PluginBlockedCapabilitySchema = z.object({
  capability: z.string(),
  reason: z.enum(BlockedCapabilityReasonEnum),
});

export type PluginBlockedCapability = z.infer<
  typeof PluginBlockedCapabilitySchema
>;

export type PluginBlockedCapabilityInput = z.input<
  typeof PluginBlockedCapabilitySchema
>;

export function createPluginBlockedCapability(
  options: Partial<PluginBlockedCapability> = {},
): PluginBlockedCapability {
  return PluginBlockedCapabilitySchema.parse(options);
}

export const PluginRegisteredLanguageServerSchema = z.object({
  name: z.string(),
  language: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  settingsKey: z.union([z.string(), z.null()]).default(null),
});

export type PluginRegisteredLanguageServer = z.infer<
  typeof PluginRegisteredLanguageServerSchema
>;

export type PluginRegisteredLanguageServerInput = z.input<
  typeof PluginRegisteredLanguageServerSchema
>;

export function createPluginRegisteredLanguageServer(
  options: Partial<PluginRegisteredLanguageServer> = {},
): PluginRegisteredLanguageServer {
  return PluginRegisteredLanguageServerSchema.parse(options);
}

export const PluginRegisteredCodegenTargetSchema = z.object({
  targetId: z.string(),
  pluginId: z.string(),
  language: z.string(),
  name: z.string(),
  defaultFileName: z.string(),
});

export type PluginRegisteredCodegenTarget = z.infer<
  typeof PluginRegisteredCodegenTargetSchema
>;

export type PluginRegisteredCodegenTargetInput = z.input<
  typeof PluginRegisteredCodegenTargetSchema
>;

export function createPluginRegisteredCodegenTarget(
  options: Partial<PluginRegisteredCodegenTarget> = {},
): PluginRegisteredCodegenTarget {
  return PluginRegisteredCodegenTargetSchema.parse(options);
}

export const PluginErrorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type PluginErrorInfo = z.infer<typeof PluginErrorInfoSchema>;

export type PluginErrorInfoInput = z.input<typeof PluginErrorInfoSchema>;

export function createPluginErrorInfo(
  options: Partial<PluginErrorInfo> = {},
): PluginErrorInfo {
  return PluginErrorInfoSchema.parse(options);
}

export const PluginStatusEntrySchema = z.object({
  pluginId: z.string(),
  name: z.string(),
  version: z.string(),
  state: z.enum(PluginRuntimeStateEnum),
  sourceScope: z.enum(PluginScopeEnum),
  sourceScopeLabel: z.literal(["workspace", "setta_files", "global"]),
  sourceManager: z
    .enum(PluginSourceManagerEnum)
    .default(PluginSourceManagerEnum.setta),
  sourceManagerHint: z.union([z.string(), z.null()]).default(null),
  sourcePath: z.string(),
  canonicalSourceKey: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]).default(null),
  shadowedBySourcePath: z.union([z.string(), z.null()]).default(null),
  requestedCapabilities: z.array(z.string()),
  effectiveCapabilities: z.array(z.string()),
  blockedCapabilities: z.array(PluginBlockedCapabilitySchema),
  registeredLanguageServers: z
    .array(PluginRegisteredLanguageServerSchema)
    .default([]),
  registeredExternalAgentAdapters: z
    .array(PluginRegisteredExternalAgentAdapterSchema)
    .default([]),
  registeredCodegenTargets: z
    .array(PluginRegisteredCodegenTargetSchema)
    .default([]),
  enablementSource: z
    .union([z.enum(PluginEnablementSourceEnum), z.null()])
    .default(null),
  restartRequired: z.boolean(),
  runtimePayloadDigestSha256: z.union([z.string(), z.null()]).default(null),
  errors: z.array(PluginErrorInfoSchema),
});

export type PluginStatusEntry = z.infer<typeof PluginStatusEntrySchema>;

export type PluginStatusEntryInput = z.input<typeof PluginStatusEntrySchema>;

export function createPluginStatusEntry(
  options: Partial<PluginStatusEntry> = {},
): PluginStatusEntry {
  return PluginStatusEntrySchema.parse(options);
}

export const PluginStatusResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app"]),
  restartCapability: PluginRestartCapabilitySchema,
  plugins: z.array(PluginStatusEntrySchema),
});

export type PluginStatusResponse = z.infer<typeof PluginStatusResponseSchema>;

export type PluginStatusResponseInput = z.input<
  typeof PluginStatusResponseSchema
>;

export function createPluginStatusResponse(
  options: Partial<PluginStatusResponse> = {},
): PluginStatusResponse {
  return PluginStatusResponseSchema.parse(options);
}

export const PluginRuntimeResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  list: PluginListResponseSchema,
  status: PluginStatusResponseSchema,
});

export type PluginRuntimeResponse = z.infer<typeof PluginRuntimeResponseSchema>;

export type PluginRuntimeResponseInput = z.input<
  typeof PluginRuntimeResponseSchema
>;

export function createPluginRuntimeResponse(
  options: Partial<PluginRuntimeResponse> = {},
): PluginRuntimeResponse {
  return PluginRuntimeResponseSchema.parse(options);
}

export const PluginUninstallRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
});

export type PluginUninstallRequest = z.infer<
  typeof PluginUninstallRequestSchema
>;

export type PluginUninstallRequestInput = z.input<
  typeof PluginUninstallRequestSchema
>;

export function createPluginUninstallRequest(
  options: Partial<PluginUninstallRequest> = {},
): PluginUninstallRequest {
  return PluginUninstallRequestSchema.parse(options);
}

export const PluginUninstallResponseSchema = z.object({
  pluginId: z.string(),
  removedFromScope: z.enum(PluginScopeEnum),
  restartRequired: z.boolean(),
});

export type PluginUninstallResponse = z.infer<
  typeof PluginUninstallResponseSchema
>;

export type PluginUninstallResponseInput = z.input<
  typeof PluginUninstallResponseSchema
>;

export function createPluginUninstallResponse(
  options: Partial<PluginUninstallResponse> = {},
): PluginUninstallResponse {
  return PluginUninstallResponseSchema.parse(options);
}

export const PluginUpdateRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  to: z.union([z.string(), z.null()]).default(null),
});

export type PluginUpdateRequest = z.infer<typeof PluginUpdateRequestSchema>;

export type PluginUpdateRequestInput = z.input<
  typeof PluginUpdateRequestSchema
>;

export function createPluginUpdateRequest(
  options: Partial<PluginUpdateRequest> = {},
): PluginUpdateRequest {
  return PluginUpdateRequestSchema.parse(options);
}

export const PluginUpdateResponseSchema = z.object({
  pluginId: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]),
  restartRequired: z.boolean(),
});

export type PluginUpdateResponse = z.infer<typeof PluginUpdateResponseSchema>;

export type PluginUpdateResponseInput = z.input<
  typeof PluginUpdateResponseSchema
>;

export function createPluginUpdateResponse(
  options: Partial<PluginUpdateResponse> = {},
): PluginUpdateResponse {
  return PluginUpdateResponseSchema.parse(options);
}

export const PluginsRescanResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app"]),
  installedPlugins: z.int(),
  activePlugins: z.int(),
});

export type PluginsRescanResponse = z.infer<typeof PluginsRescanResponseSchema>;

export type PluginsRescanResponseInput = z.input<
  typeof PluginsRescanResponseSchema
>;

export function createPluginsRescanResponse(
  options: Partial<PluginsRescanResponse> = {},
): PluginsRescanResponse {
  return PluginsRescanResponseSchema.parse(options);
}

export const AcceptRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type AcceptRenameRefactorRequest = z.infer<
  typeof AcceptRenameRefactorRequestSchema
>;

export type AcceptRenameRefactorRequestInput = z.input<
  typeof AcceptRenameRefactorRequestSchema
>;

export function createAcceptRenameRefactorRequest(
  options: Partial<AcceptRenameRefactorRequest> = {},
): AcceptRenameRefactorRequest {
  return AcceptRenameRefactorRequestSchema.parse(options);
}

export const AddKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type AddKwargRequest = z.infer<typeof AddKwargRequestSchema>;

export type AddKwargRequestInput = z.input<typeof AddKwargRequestSchema>;

export function createAddKwargRequest(
  options: Partial<AddKwargRequest> = {},
): AddKwargRequest {
  return AddKwargRequestSchema.parse(options);
}

export const AppDefinitionResponseSchema = z.object({
  appSpec: z
    .union([
      z.record(z.string(), z.any()),
      z.array(z.any()),
      z.string(),
      z.int(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .default(null),
  appDefinition: z.union([AppDefinitionSchema, z.null()]).default(null),
});

export type AppDefinitionResponse = z.infer<typeof AppDefinitionResponseSchema>;

export type AppDefinitionResponseInput = z.input<
  typeof AppDefinitionResponseSchema
>;

export function createAppDefinitionResponse(
  options: Partial<AppDefinitionResponse> = {},
): AppDefinitionResponse {
  return AppDefinitionResponseSchema.parse(options);
}

export const AppendDrawAreaLayerItemRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  layerIdx: z.int(),
  element: DrawAreaLayerItemSchema,
});

export type AppendDrawAreaLayerItemRequest = z.infer<
  typeof AppendDrawAreaLayerItemRequestSchema
>;

export type AppendDrawAreaLayerItemRequestInput = z.input<
  typeof AppendDrawAreaLayerItemRequestSchema
>;

export function createAppendDrawAreaLayerItemRequest(
  options: Partial<AppendDrawAreaLayerItemRequest> = {},
): AppendDrawAreaLayerItemRequest {
  return AppendDrawAreaLayerItemRequestSchema.parse(options);
}

export const AutoLayoutTopLevelSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  margin: z.int().default(50),
});

export type AutoLayoutTopLevelSectionsRequest = z.infer<
  typeof AutoLayoutTopLevelSectionsRequestSchema
>;

export type AutoLayoutTopLevelSectionsRequestInput = z.input<
  typeof AutoLayoutTopLevelSectionsRequestSchema
>;

export function createAutoLayoutTopLevelSectionsRequest(
  options: Partial<AutoLayoutTopLevelSectionsRequest> = {},
): AutoLayoutTopLevelSectionsRequest {
  return AutoLayoutTopLevelSectionsRequestSchema.parse(options);
}

export const ChangeParamImplRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  selectedId: IDSchema,
});

export type ChangeParamImplRequest = z.infer<
  typeof ChangeParamImplRequestSchema
>;

export type ChangeParamImplRequestInput = z.input<
  typeof ChangeParamImplRequestSchema
>;

export function createChangeParamImplRequest(
  options: Partial<ChangeParamImplRequest> = {},
): ChangeParamImplRequest {
  return ChangeParamImplRequestSchema.parse(options);
}

export const ClearTextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
});

export type ClearTextFieldCompletionRequest = z.infer<
  typeof ClearTextFieldCompletionRequestSchema
>;

export type ClearTextFieldCompletionRequestInput = z.input<
  typeof ClearTextFieldCompletionRequestSchema
>;

export function createClearTextFieldCompletionRequest(
  options: Partial<ClearTextFieldCompletionRequest> = {},
): ClearTextFieldCompletionRequest {
  return ClearTextFieldCompletionRequestSchema.parse(options);
}

export const CodeAreaCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type CodeAreaCompletionRequest = z.infer<
  typeof CodeAreaCompletionRequestSchema
>;

export type CodeAreaCompletionRequestInput = z.input<
  typeof CodeAreaCompletionRequestSchema
>;

export function createCodeAreaCompletionRequest(
  options: Partial<CodeAreaCompletionRequest> = {},
): CodeAreaCompletionRequest {
  return CodeAreaCompletionRequestSchema.parse(options);
}

export const CreateAgenticEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  id: z.union([IDSchema, z.null()]).default(null),
  sourceSectionId: IDSchema,
  targetSectionId: IDSchema,
  kind: z.enum(AgenticEdgeKindEnum),
  contextMode: z
    .enum(AgenticEdgeContextModeEnum)
    .default(AgenticEdgeContextModeEnum.reference_only),
  style: z
    .union([
      z.record(z.string(), z.union([z.string(), z.int(), z.number()])),
      z.null(),
    ])
    .default(null),
  hidden: z.boolean().default(false),
  zIndex: z.int().default(0),
});

export type CreateAgenticEdgeRequest = z.infer<
  typeof CreateAgenticEdgeRequestSchema
>;

export type CreateAgenticEdgeRequestInput = z.input<
  typeof CreateAgenticEdgeRequestSchema
>;

export function createCreateAgenticEdgeRequest(
  options: Partial<CreateAgenticEdgeRequest> = {},
): CreateAgenticEdgeRequest {
  return CreateAgenticEdgeRequestSchema.parse(options);
}

export const CreateChildSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  parentId: IDSchema,
  implType: z.enum(SectionTypeEnum),
  numChildren: z.int(),
  startIdx: z.union([z.int(), z.null()]),
});

export type CreateChildSectionsRequest = z.infer<
  typeof CreateChildSectionsRequestSchema
>;

export type CreateChildSectionsRequestInput = z.input<
  typeof CreateChildSectionsRequestSchema
>;

export function createCreateChildSectionsRequest(
  options: Partial<CreateChildSectionsRequest> = {},
): CreateChildSectionsRequest {
  return CreateChildSectionsRequestSchema.parse(options);
}

export const CreateChildSectionsViaIncrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
  implType: z.enum(SectionTypeEnum),
});

export type CreateChildSectionsViaIncrementerRequest = z.infer<
  typeof CreateChildSectionsViaIncrementerRequestSchema
>;

export type CreateChildSectionsViaIncrementerRequestInput = z.input<
  typeof CreateChildSectionsViaIncrementerRequestSchema
>;

export function createCreateChildSectionsViaIncrementerRequest(
  options: Partial<CreateChildSectionsViaIncrementerRequest> = {},
): CreateChildSectionsViaIncrementerRequest {
  return CreateChildSectionsViaIncrementerRequestSchema.parse(options);
}

export const CreateEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sourceSectionId: IDSchema,
  sourceVariantId: IDSchema,
  sourcePortId: IDSchema,
  targetSectionId: IDSchema,
  targetVariantId: IDSchema,
  targetPortId: IDSchema,
  type: z.string().default("default" as const),
  label: z.union([z.string(), z.null()]).default(null),
  style: z
    .union([
      z.record(z.string(), z.union([z.string(), z.int(), z.number()])),
      z.null(),
    ])
    .default(null),
  animated: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.int().default(0),
  data: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type CreateEdgeRequest = z.infer<typeof CreateEdgeRequestSchema>;

export type CreateEdgeRequestInput = z.input<typeof CreateEdgeRequestSchema>;

export function createCreateEdgeRequest(
  options: Partial<CreateEdgeRequest> = {},
): CreateEdgeRequest {
  return CreateEdgeRequestSchema.parse(options);
}

export const CreateNewSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type CreateNewSectionVariantRequest = z.infer<
  typeof CreateNewSectionVariantRequestSchema
>;

export type CreateNewSectionVariantRequestInput = z.input<
  typeof CreateNewSectionVariantRequestSchema
>;

export function createCreateNewSectionVariantRequest(
  options: Partial<CreateNewSectionVariantRequest> = {},
): CreateNewSectionVariantRequest {
  return CreateNewSectionVariantRequestSchema.parse(options);
}

export const CreateTopLevelSectionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  implType: z.enum(SectionTypeEnum),
  controlCodeObjType: z
    .union([z.enum(CodeObjTypeEnum), z.null()])
    .default(null),
  implOverrides: z
    .union([
      z.discriminatedUnion("type", [
        CallableSectionImplArgsSchema,
        DictSectionImplArgsSchema,
        ListRootSectionImplArgsSchema,
        GroupSectionImplArgsSchema,
        ImageSectionImplArgsSchema,
        ChartSectionImplArgsSchema,
        DrawSectionImplArgsSchema,
        TextBlockSectionImplArgsSchema,
        PromptSectionImplArgsSchema,
        MetaControlSectionImplArgsSchema,
        SocialSectionImplArgsSchema,
        GlobalVariablesSectionImplArgsSchema,
        CodeSectionImplArgsSchema,
        GenPythonCodeSectionImplArgsSchema,
        GenPythonMetadataSectionImplArgsSchema,
        TerminalSectionImplArgsSchema,
        IFrameSectionImplArgsSchema,
        ChatSectionImplArgsSchema,
        BrowserSectionImplArgsSchema,
        PluginSectionImplArgsSchema,
      ]),
      z.null(),
    ])
    .default(null),
  position: z.union([PositionSchema, z.null()]).default(null),
  topLevelSections: z
    .union([z.record(IDSchema, TopLevelSectionLayoutSchema), z.null()])
    .default(null),
  viewportBounds: z.union([ViewportBoundsSchema, z.null()]).default(null),
});

export type CreateTopLevelSectionRequest = z.infer<
  typeof CreateTopLevelSectionRequestSchema
>;

export type CreateTopLevelSectionRequestInput = z.input<
  typeof CreateTopLevelSectionRequestSchema
>;

export function createCreateTopLevelSectionRequest(
  options: Partial<CreateTopLevelSectionRequest> = {},
): CreateTopLevelSectionRequest {
  return CreateTopLevelSectionRequestSchema.parse(options);
}

export const CreateTopLevelSectionResponseSchema = z.object({
  sectionId: IDSchema,
  panTo: z.union([PositionSchema, z.null()]).default(null),
});

export type CreateTopLevelSectionResponse = z.infer<
  typeof CreateTopLevelSectionResponseSchema
>;

export type CreateTopLevelSectionResponseInput = z.input<
  typeof CreateTopLevelSectionResponseSchema
>;

export function createCreateTopLevelSectionResponse(
  options: Partial<CreateTopLevelSectionResponse> = {},
): CreateTopLevelSectionResponse {
  return CreateTopLevelSectionResponseSchema.parse(options);
}

export const CreateViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type CreateViewModeRequest = z.infer<typeof CreateViewModeRequestSchema>;

export type CreateViewModeRequestInput = z.input<
  typeof CreateViewModeRequestSchema
>;

export function createCreateViewModeRequest(
  options: Partial<CreateViewModeRequest> = {},
): CreateViewModeRequest {
  return CreateViewModeRequestSchema.parse(options);
}

export const DeclineRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type DeclineRenameRefactorRequest = z.infer<
  typeof DeclineRenameRefactorRequestSchema
>;

export type DeclineRenameRefactorRequestInput = z.input<
  typeof DeclineRenameRefactorRequestSchema
>;

export function createDeclineRenameRefactorRequest(
  options: Partial<DeclineRenameRefactorRequest> = {},
): DeclineRenameRefactorRequest {
  return DeclineRenameRefactorRequestSchema.parse(options);
}

export const DeleteAgenticEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edgeIds: z.array(IDSchema),
});

export type DeleteAgenticEdgesRequest = z.infer<
  typeof DeleteAgenticEdgesRequestSchema
>;

export type DeleteAgenticEdgesRequestInput = z.input<
  typeof DeleteAgenticEdgesRequestSchema
>;

export function createDeleteAgenticEdgesRequest(
  options: Partial<DeleteAgenticEdgesRequest> = {},
): DeleteAgenticEdgesRequest {
  return DeleteAgenticEdgesRequestSchema.parse(options);
}

export const DeleteChildSectionsViaDecrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
});

export type DeleteChildSectionsViaDecrementerRequest = z.infer<
  typeof DeleteChildSectionsViaDecrementerRequestSchema
>;

export type DeleteChildSectionsViaDecrementerRequestInput = z.input<
  typeof DeleteChildSectionsViaDecrementerRequestSchema
>;

export function createDeleteChildSectionsViaDecrementerRequest(
  options: Partial<DeleteChildSectionsViaDecrementerRequest> = {},
): DeleteChildSectionsViaDecrementerRequest {
  return DeleteChildSectionsViaDecrementerRequestSchema.parse(options);
}

export const DeleteEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edgeIds: z.array(IDSchema),
});

export type DeleteEdgesRequest = z.infer<typeof DeleteEdgesRequestSchema>;

export type DeleteEdgesRequestInput = z.input<typeof DeleteEdgesRequestSchema>;

export function createDeleteEdgesRequest(
  options: Partial<DeleteEdgesRequest> = {},
): DeleteEdgesRequest {
  return DeleteEdgesRequestSchema.parse(options);
}

export const DeleteJSONSourceFileAndVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
  filepath: z.string(),
});

export type DeleteJSONSourceFileAndVariantRequest = z.infer<
  typeof DeleteJSONSourceFileAndVariantRequestSchema
>;

export type DeleteJSONSourceFileAndVariantRequestInput = z.input<
  typeof DeleteJSONSourceFileAndVariantRequestSchema
>;

export function createDeleteJSONSourceFileAndVariantRequest(
  options: Partial<DeleteJSONSourceFileAndVariantRequest> = {},
): DeleteJSONSourceFileAndVariantRequest {
  return DeleteJSONSourceFileAndVariantRequestSchema.parse(options);
}

export const DeleteKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type DeleteKwargRequest = z.infer<typeof DeleteKwargRequestSchema>;

export type DeleteKwargRequestInput = z.input<typeof DeleteKwargRequestSchema>;

export function createDeleteKwargRequest(
  options: Partial<DeleteKwargRequest> = {},
): DeleteKwargRequest {
  return DeleteKwargRequestSchema.parse(options);
}

export const DeleteSectionVariantOrAskRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type DeleteSectionVariantOrAskRequest = z.infer<
  typeof DeleteSectionVariantOrAskRequestSchema
>;

export type DeleteSectionVariantOrAskRequestInput = z.input<
  typeof DeleteSectionVariantOrAskRequestSchema
>;

export function createDeleteSectionVariantOrAskRequest(
  options: Partial<DeleteSectionVariantOrAskRequest> = {},
): DeleteSectionVariantOrAskRequest {
  return DeleteSectionVariantOrAskRequestSchema.parse(options);
}

export const DeleteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type DeleteSectionsRequest = z.infer<typeof DeleteSectionsRequestSchema>;

export type DeleteSectionsRequestInput = z.input<
  typeof DeleteSectionsRequestSchema
>;

export function createDeleteSectionsRequest(
  options: Partial<DeleteSectionsRequest> = {},
): DeleteSectionsRequest {
  return DeleteSectionsRequestSchema.parse(options);
}

export const DeleteSelectedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoIds: z.array(IDSchema),
});

export type DeleteSelectedParamsRequest = z.infer<
  typeof DeleteSelectedParamsRequestSchema
>;

export type DeleteSelectedParamsRequestInput = z.input<
  typeof DeleteSelectedParamsRequestSchema
>;

export function createDeleteSelectedParamsRequest(
  options: Partial<DeleteSelectedParamsRequest> = {},
): DeleteSelectedParamsRequest {
  return DeleteSelectedParamsRequestSchema.parse(options);
}

export const DeleteViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type DeleteViewModeRequest = z.infer<typeof DeleteViewModeRequestSchema>;

export type DeleteViewModeRequestInput = z.input<
  typeof DeleteViewModeRequestSchema
>;

export function createDeleteViewModeRequest(
  options: Partial<DeleteViewModeRequest> = {},
): DeleteViewModeRequest {
  return DeleteViewModeRequestSchema.parse(options);
}

export const ForceRefreshProjectRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type ForceRefreshProjectRequest = z.infer<
  typeof ForceRefreshProjectRequestSchema
>;

export type ForceRefreshProjectRequestInput = z.input<
  typeof ForceRefreshProjectRequestSchema
>;

export function createForceRefreshProjectRequest(
  options: Partial<ForceRefreshProjectRequest> = {},
): ForceRefreshProjectRequest {
  return ForceRefreshProjectRequestSchema.parse(options);
}

export const FormatCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type FormatCodeRequest = z.infer<typeof FormatCodeRequestSchema>;

export type FormatCodeRequestInput = z.input<typeof FormatCodeRequestSchema>;

export function createFormatCodeRequest(
  options: Partial<FormatCodeRequest> = {},
): FormatCodeRequest {
  return FormatCodeRequestSchema.parse(options);
}

export const GenCodePrefixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodePrefixCompletionRequest = z.infer<
  typeof GenCodePrefixCompletionRequestSchema
>;

export type GenCodePrefixCompletionRequestInput = z.input<
  typeof GenCodePrefixCompletionRequestSchema
>;

export function createGenCodePrefixCompletionRequest(
  options: Partial<GenCodePrefixCompletionRequest> = {},
): GenCodePrefixCompletionRequest {
  return GenCodePrefixCompletionRequestSchema.parse(options);
}

export const GenCodeSuffixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodeSuffixCompletionRequest = z.infer<
  typeof GenCodeSuffixCompletionRequestSchema
>;

export type GenCodeSuffixCompletionRequestInput = z.input<
  typeof GenCodeSuffixCompletionRequestSchema
>;

export function createGenCodeSuffixCompletionRequest(
  options: Partial<GenCodeSuffixCompletionRequest> = {},
): GenCodeSuffixCompletionRequest {
  return GenCodeSuffixCompletionRequestSchema.parse(options);
}

export const GetAppDefinitionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
});

export type GetAppDefinitionRequest = z.infer<
  typeof GetAppDefinitionRequestSchema
>;

export type GetAppDefinitionRequestInput = z.input<
  typeof GetAppDefinitionRequestSchema
>;

export function createGetAppDefinitionRequest(
  options: Partial<GetAppDefinitionRequest> = {},
): GetAppDefinitionRequest {
  return GetAppDefinitionRequestSchema.parse(options);
}

export const GetChatSectionChatIdRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type GetChatSectionChatIdRequest = z.infer<
  typeof GetChatSectionChatIdRequestSchema
>;

export type GetChatSectionChatIdRequestInput = z.input<
  typeof GetChatSectionChatIdRequestSchema
>;

export function createGetChatSectionChatIdRequest(
  options: Partial<GetChatSectionChatIdRequest> = {},
): GetChatSectionChatIdRequest {
  return GetChatSectionChatIdRequestSchema.parse(options);
}

export const GetLatestLspDiagnosticsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type GetLatestLspDiagnosticsRequest = z.infer<
  typeof GetLatestLspDiagnosticsRequestSchema
>;

export type GetLatestLspDiagnosticsRequestInput = z.input<
  typeof GetLatestLspDiagnosticsRequestSchema
>;

export function createGetLatestLspDiagnosticsRequest(
  options: Partial<GetLatestLspDiagnosticsRequest> = {},
): GetLatestLspDiagnosticsRequest {
  return GetLatestLspDiagnosticsRequestSchema.parse(options);
}

export const GetLatestProjectStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type GetLatestProjectStateRequest = z.infer<
  typeof GetLatestProjectStateRequestSchema
>;

export type GetLatestProjectStateRequestInput = z.input<
  typeof GetLatestProjectStateRequestSchema
>;

export function createGetLatestProjectStateRequest(
  options: Partial<GetLatestProjectStateRequest> = {},
): GetLatestProjectStateRequest {
  return GetLatestProjectStateRequestSchema.parse(options);
}

export const GetPasswordParamValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
});

export type GetPasswordParamValueRequest = z.infer<
  typeof GetPasswordParamValueRequestSchema
>;

export type GetPasswordParamValueRequestInput = z.input<
  typeof GetPasswordParamValueRequestSchema
>;

export function createGetPasswordParamValueRequest(
  options: Partial<GetPasswordParamValueRequest> = {},
): GetPasswordParamValueRequest {
  return GetPasswordParamValueRequestSchema.parse(options);
}

export const GetPasswordParamValueResponseSchema = z.object({
  value: z.string(),
});

export type GetPasswordParamValueResponse = z.infer<
  typeof GetPasswordParamValueResponseSchema
>;

export type GetPasswordParamValueResponseInput = z.input<
  typeof GetPasswordParamValueResponseSchema
>;

export function createGetPasswordParamValueResponse(
  options: Partial<GetPasswordParamValueResponse> = {},
): GetPasswordParamValueResponse {
  return GetPasswordParamValueResponseSchema.parse(options);
}

export const GroupSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type GroupSectionsRequest = z.infer<typeof GroupSectionsRequestSchema>;

export type GroupSectionsRequestInput = z.input<
  typeof GroupSectionsRequestSchema
>;

export function createGroupSectionsRequest(
  options: Partial<GroupSectionsRequest> = {},
): GroupSectionsRequest {
  return GroupSectionsRequestSchema.parse(options);
}

export const IndentParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
});

export type IndentParamsRequest = z.infer<typeof IndentParamsRequestSchema>;

export type IndentParamsRequestInput = z.input<
  typeof IndentParamsRequestSchema
>;

export function createIndentParamsRequest(
  options: Partial<IndentParamsRequest> = {},
): IndentParamsRequest {
  return IndentParamsRequestSchema.parse(options);
}

export const MoveParamGroupSchema = z.object({
  paramIds: z.array(IDSchema),
  newParentId: IDSchema,
  newIndex: z.int(),
});

export type MoveParamGroup = z.infer<typeof MoveParamGroupSchema>;

export type MoveParamGroupInput = z.input<typeof MoveParamGroupSchema>;

export function createMoveParamGroup(
  options: Partial<MoveParamGroup> = {},
): MoveParamGroup {
  return MoveParamGroupSchema.parse(options);
}

export const MoveParamGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  moves: z.array(MoveParamGroupSchema),
});

export type MoveParamGroupsRequest = z.infer<
  typeof MoveParamGroupsRequestSchema
>;

export type MoveParamGroupsRequestInput = z.input<
  typeof MoveParamGroupsRequestSchema
>;

export function createMoveParamGroupsRequest(
  options: Partial<MoveParamGroupsRequest> = {},
): MoveParamGroupsRequest {
  return MoveParamGroupsRequestSchema.parse(options);
}

export const MoveParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
  newParentId: IDSchema,
  newIndex: z.int(),
});

export type MoveParamsRequest = z.infer<typeof MoveParamsRequestSchema>;

export type MoveParamsRequestInput = z.input<typeof MoveParamsRequestSchema>;

export function createMoveParamsRequest(
  options: Partial<MoveParamsRequest> = {},
): MoveParamsRequest {
  return MoveParamsRequestSchema.parse(options);
}

export const MoveSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
  newParentId: z.union([IDSchema, z.null()]),
  newIndex: z.union([z.int(), z.null()]),
  positionsById: z.union([z.record(IDSchema, PositionSchema), z.null()]),
});

export type MoveSectionsRequest = z.infer<typeof MoveSectionsRequestSchema>;

export type MoveSectionsRequestInput = z.input<
  typeof MoveSectionsRequestSchema
>;

export function createMoveSectionsRequest(
  options: Partial<MoveSectionsRequest> = {},
): MoveSectionsRequest {
  return MoveSectionsRequestSchema.parse(options);
}

export const OutputAccessorCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type OutputAccessorCompletionRequest = z.infer<
  typeof OutputAccessorCompletionRequestSchema
>;

export type OutputAccessorCompletionRequestInput = z.input<
  typeof OutputAccessorCompletionRequestSchema
>;

export function createOutputAccessorCompletionRequest(
  options: Partial<OutputAccessorCompletionRequest> = {},
): OutputAccessorCompletionRequest {
  return OutputAccessorCompletionRequestSchema.parse(options);
}

export const PasteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  data: ProjectStateCoreWithSectionVariantMapSchema,
  position: PositionSchema,
  asRef: z.boolean(),
});

export type PasteSectionsRequest = z.infer<typeof PasteSectionsRequestSchema>;

export type PasteSectionsRequestInput = z.input<
  typeof PasteSectionsRequestSchema
>;

export function createPasteSectionsRequest(
  options: Partial<PasteSectionsRequest> = {},
): PasteSectionsRequest {
  return PasteSectionsRequestSchema.parse(options);
}

export const PrepareSectionsForCopyRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type PrepareSectionsForCopyRequest = z.infer<
  typeof PrepareSectionsForCopyRequestSchema
>;

export type PrepareSectionsForCopyRequestInput = z.input<
  typeof PrepareSectionsForCopyRequestSchema
>;

export function createPrepareSectionsForCopyRequest(
  options: Partial<PrepareSectionsForCopyRequest> = {},
): PrepareSectionsForCopyRequest {
  return PrepareSectionsForCopyRequestSchema.parse(options);
}

export const ReconnectEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edgeId: IDSchema,
  sourceSectionId: IDSchema,
  sourceVariantId: IDSchema,
  sourcePortId: IDSchema,
  targetSectionId: IDSchema,
  targetVariantId: IDSchema,
  targetPortId: IDSchema,
});

export type ReconnectEdgeRequest = z.infer<typeof ReconnectEdgeRequestSchema>;

export type ReconnectEdgeRequestInput = z.input<
  typeof ReconnectEdgeRequestSchema
>;

export function createReconnectEdgeRequest(
  options: Partial<ReconnectEdgeRequest> = {},
): ReconnectEdgeRequest {
  return ReconnectEdgeRequestSchema.parse(options);
}

export const RedoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type RedoRequest = z.infer<typeof RedoRequestSchema>;

export type RedoRequestInput = z.input<typeof RedoRequestSchema>;

export function createRedoRequest(
  options: Partial<RedoRequest> = {},
): RedoRequest {
  return RedoRequestSchema.parse(options);
}

export const SetActiveIdsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  activeIds: z.array(IDSchema),
});

export type SetActiveIdsRequest = z.infer<typeof SetActiveIdsRequestSchema>;

export type SetActiveIdsRequestInput = z.input<
  typeof SetActiveIdsRequestSchema
>;

export function createSetActiveIdsRequest(
  options: Partial<SetActiveIdsRequest> = {},
): SetActiveIdsRequest {
  return SetActiveIdsRequestSchema.parse(options);
}

export const SetActiveViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  activeViewModeId: IDSchema,
});

export type SetActiveViewModeRequest = z.infer<
  typeof SetActiveViewModeRequestSchema
>;

export type SetActiveViewModeRequestInput = z.input<
  typeof SetActiveViewModeRequestSchema
>;

export function createSetActiveViewModeRequest(
  options: Partial<SetActiveViewModeRequest> = {},
): SetActiveViewModeRequest {
  return SetActiveViewModeRequestSchema.parse(options);
}

export const SetAgenticEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edges: z.array(AgenticEdgeSchema),
});

export type SetAgenticEdgesRequest = z.infer<
  typeof SetAgenticEdgesRequestSchema
>;

export type SetAgenticEdgesRequestInput = z.input<
  typeof SetAgenticEdgesRequestSchema
>;

export function createSetAgenticEdgesRequest(
  options: Partial<SetAgenticEdgesRequest> = {},
): SetAgenticEdgesRequest {
  return SetAgenticEdgesRequestSchema.parse(options);
}

export const SetAppDefinitionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  appSpec: z.union([
    z.record(z.string(), z.any()),
    z.array(z.any()),
    z.string(),
    z.int(),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
  appSpecPath: z.union([z.string(), z.null()]).default(null),
  appSpecVersion: z.union([z.string(), z.null()]).default(null),
  catalogId: z.union([z.string(), z.null()]).default(null),
  routes: z.union([z.array(AppRouteSchema), z.null()]).default(null),
  dataBindings: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  actions: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  theme: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  assets: z
    .union([
      z.array(
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
});

export type SetAppDefinitionRequest = z.infer<
  typeof SetAppDefinitionRequestSchema
>;

export type SetAppDefinitionRequestInput = z.input<
  typeof SetAppDefinitionRequestSchema
>;

export function createSetAppDefinitionRequest(
  options: Partial<SetAppDefinitionRequest> = {},
): SetAppDefinitionRequest {
  return SetAppDefinitionRequestSchema.parse(options);
}

export const SetBrowserAreaViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  viewMode: z.enum(BrowserAreaViewModeEnum),
});

export type SetBrowserAreaViewModeRequest = z.infer<
  typeof SetBrowserAreaViewModeRequestSchema
>;

export type SetBrowserAreaViewModeRequestInput = z.input<
  typeof SetBrowserAreaViewModeRequestSchema
>;

export function createSetBrowserAreaViewModeRequest(
  options: Partial<SetBrowserAreaViewModeRequest> = {},
): SetBrowserAreaViewModeRequest {
  return SetBrowserAreaViewModeRequestSchema.parse(options);
}

export const SetBrowserColumnWidthsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  columnWidth: z.union([z.number(), z.null()]),
  typesColumnWidth: z.union([z.number(), z.null()]),
});

export type SetBrowserColumnWidthsRequest = z.infer<
  typeof SetBrowserColumnWidthsRequestSchema
>;

export type SetBrowserColumnWidthsRequestInput = z.input<
  typeof SetBrowserColumnWidthsRequestSchema
>;

export function createSetBrowserColumnWidthsRequest(
  options: Partial<SetBrowserColumnWidthsRequest> = {},
): SetBrowserColumnWidthsRequest {
  return SetBrowserColumnWidthsRequestSchema.parse(options);
}

export const SetBrowserHideColumnRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideColumn: z.boolean(),
});

export type SetBrowserHideColumnRequest = z.infer<
  typeof SetBrowserHideColumnRequestSchema
>;

export type SetBrowserHideColumnRequestInput = z.input<
  typeof SetBrowserHideColumnRequestSchema
>;

export function createSetBrowserHideColumnRequest(
  options: Partial<SetBrowserHideColumnRequest> = {},
): SetBrowserHideColumnRequest {
  return SetBrowserHideColumnRequestSchema.parse(options);
}

export const SetBrowserSavedSearchesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  savedSearches: z.array(BrowserSavedSearchSchema),
});

export type SetBrowserSavedSearchesRequest = z.infer<
  typeof SetBrowserSavedSearchesRequestSchema
>;

export type SetBrowserSavedSearchesRequestInput = z.input<
  typeof SetBrowserSavedSearchesRequestSchema
>;

export function createSetBrowserSavedSearchesRequest(
  options: Partial<SetBrowserSavedSearchesRequest> = {},
): SetBrowserSavedSearchesRequest {
  return SetBrowserSavedSearchesRequestSchema.parse(options);
}

export const SetCallableHideParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideParams: z.boolean(),
});

export type SetCallableHideParamsRequest = z.infer<
  typeof SetCallableHideParamsRequestSchema
>;

export type SetCallableHideParamsRequestInput = z.input<
  typeof SetCallableHideParamsRequestSchema
>;

export function createSetCallableHideParamsRequest(
  options: Partial<SetCallableHideParamsRequest> = {},
): SetCallableHideParamsRequest {
  return SetCallableHideParamsRequestSchema.parse(options);
}

export const SetCallableRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  callableName: z.string(),
  refetchParams: z.boolean(),
});

export type SetCallableRequest = z.infer<typeof SetCallableRequestSchema>;

export type SetCallableRequestInput = z.input<typeof SetCallableRequestSchema>;

export function createSetCallableRequest(
  options: Partial<SetCallableRequest> = {},
): SetCallableRequest {
  return SetCallableRequestSchema.parse(options);
}

export const SetCallableChildCodeObjSchema = z.object({
  codeObjId: IDSchema,
  name: z.string(),
});

export type SetCallableChildCodeObj = z.infer<
  typeof SetCallableChildCodeObjSchema
>;

export type SetCallableChildCodeObjInput = z.input<
  typeof SetCallableChildCodeObjSchema
>;

export function createSetCallableChildCodeObj(
  options: Partial<SetCallableChildCodeObj> = {},
): SetCallableChildCodeObj {
  return SetCallableChildCodeObjSchema.parse(options);
}

export const SignatureHelpStatusEnum = {
  MATCHED: "matched",
  NO_MATCH: "no_match",
  SKIPPED: "skipped",
} as const;

export type SignatureHelpStatus = ObjectValues<typeof SignatureHelpStatusEnum>;

export const SetCallableResponseSchema = z.object({
  callableId: z.union([IDSchema, z.null()]).default(null),
  childCodeObjs: z.array(SetCallableChildCodeObjSchema).default([]),
  lspStatus: z.enum(SignatureHelpStatusEnum),
});

export type SetCallableResponse = z.infer<typeof SetCallableResponseSchema>;

export type SetCallableResponseInput = z.input<
  typeof SetCallableResponseSchema
>;

export function createSetCallableResponse(
  options: Partial<SetCallableResponse> = {},
): SetCallableResponse {
  return SetCallableResponseSchema.parse(options);
}

export const SetChartAreaDataPathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  dataPath: z.string(),
});

export type SetChartAreaDataPathRequest = z.infer<
  typeof SetChartAreaDataPathRequestSchema
>;

export type SetChartAreaDataPathRequestInput = z.input<
  typeof SetChartAreaDataPathRequestSchema
>;

export function createSetChartAreaDataPathRequest(
  options: Partial<SetChartAreaDataPathRequest> = {},
): SetChartAreaDataPathRequest {
  return SetChartAreaDataPathRequestSchema.parse(options);
}

export const SetChartSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartSettings: z.union([LineChartSettingsSchema, ScatterChartSettingsSchema]),
  changedSettings: z.array(z.string()),
});

export type SetChartSettingsRequest = z.infer<
  typeof SetChartSettingsRequestSchema
>;

export type SetChartSettingsRequestInput = z.input<
  typeof SetChartSettingsRequestSchema
>;

export function createSetChartSettingsRequest(
  options: Partial<SetChartSettingsRequest> = {},
): SetChartSettingsRequest {
  return SetChartSettingsRequestSchema.parse(options);
}

export const SetChartTypeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartType: z.enum(ChartTypeEnum),
});

export type SetChartTypeRequest = z.infer<typeof SetChartTypeRequestSchema>;

export type SetChartTypeRequestInput = z.input<
  typeof SetChartTypeRequestSchema
>;

export function createSetChartTypeRequest(
  options: Partial<SetChartTypeRequest> = {},
): SetChartTypeRequest {
  return SetChartTypeRequestSchema.parse(options);
}

export const SetChatSectionChatIdRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chatId: z.union([IDSchema, z.null()]),
});

export type SetChatSectionChatIdRequest = z.infer<
  typeof SetChatSectionChatIdRequestSchema
>;

export type SetChatSectionChatIdRequestInput = z.input<
  typeof SetChatSectionChatIdRequestSchema
>;

export function createSetChatSectionChatIdRequest(
  options: Partial<SetChatSectionChatIdRequest> = {},
): SetChatSectionChatIdRequest {
  return SetChatSectionChatIdRequestSchema.parse(options);
}

export const SetChatSectionSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  managed: z.boolean(),
  engineConfigId: z.union([IDSchema, z.null()]),
  agentProfileId: z.union([IDSchema, z.null()]),
  thinking: z.boolean(),
});

export type SetChatSectionSettingsRequest = z.infer<
  typeof SetChatSectionSettingsRequestSchema
>;

export type SetChatSectionSettingsRequestInput = z.input<
  typeof SetChatSectionSettingsRequestSchema
>;

export function createSetChatSectionSettingsRequest(
  options: Partial<SetChatSectionSettingsRequest> = {},
): SetChatSectionSettingsRequest {
  return SetChatSectionSettingsRequestSchema.parse(options);
}

export const SetChatSectionStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  state: ChatSectionStateSchema,
});

export type SetChatSectionStateRequest = z.infer<
  typeof SetChatSectionStateRequestSchema
>;

export type SetChatSectionStateRequestInput = z.input<
  typeof SetChatSectionStateRequestSchema
>;

export function createSetChatSectionStateRequest(
  options: Partial<SetChatSectionStateRequest> = {},
): SetChatSectionStateRequest {
  return SetChatSectionStateRequestSchema.parse(options);
}

export const CodeFileBindingUpdateSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
});

export type CodeFileBindingUpdate = z.infer<typeof CodeFileBindingUpdateSchema>;

export type CodeFileBindingUpdateInput = z.input<
  typeof CodeFileBindingUpdateSchema
>;

export function createCodeFileBindingUpdate(
  options: Partial<CodeFileBindingUpdate> = {},
): CodeFileBindingUpdate {
  return CodeFileBindingUpdateSchema.parse(options);
}

export const SetCodeFileBindingRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  binding: CodeFileBindingUpdateSchema,
});

export type SetCodeFileBindingRequest = z.infer<
  typeof SetCodeFileBindingRequestSchema
>;

export type SetCodeFileBindingRequestInput = z.input<
  typeof SetCodeFileBindingRequestSchema
>;

export function createSetCodeFileBindingRequest(
  options: Partial<SetCodeFileBindingRequest> = {},
): SetCodeFileBindingRequest {
  return SetCodeFileBindingRequestSchema.parse(options);
}

export const SetCodeObjDisplayNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codeObjId: IDSchema,
  displayName: z.string(),
});

export type SetCodeObjDisplayNameRequest = z.infer<
  typeof SetCodeObjDisplayNameRequestSchema
>;

export type SetCodeObjDisplayNameRequestInput = z.input<
  typeof SetCodeObjDisplayNameRequestSchema
>;

export function createSetCodeObjDisplayNameRequest(
  options: Partial<SetCodeObjDisplayNameRequest> = {},
): SetCodeObjDisplayNameRequest {
  return SetCodeObjDisplayNameRequestSchema.parse(options);
}

export const SetCodeObjNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codeObjId: IDSchema,
  name: z.string(),
});

export type SetCodeObjNameRequest = z.infer<typeof SetCodeObjNameRequestSchema>;

export type SetCodeObjNameRequestInput = z.input<
  typeof SetCodeObjNameRequestSchema
>;

export function createSetCodeObjNameRequest(
  options: Partial<SetCodeObjNameRequest> = {},
): SetCodeObjNameRequest {
  return SetCodeObjNameRequestSchema.parse(options);
}

export const SetCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  code: z.string(),
});

export type SetCodeRequest = z.infer<typeof SetCodeRequestSchema>;

export type SetCodeRequestInput = z.input<typeof SetCodeRequestSchema>;

export function createSetCodeRequest(
  options: Partial<SetCodeRequest> = {},
): SetCodeRequest {
  return SetCodeRequestSchema.parse(options);
}

export const SetCodeSectionAttachedTerminalRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  terminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type SetCodeSectionAttachedTerminalRequest = z.infer<
  typeof SetCodeSectionAttachedTerminalRequestSchema
>;

export type SetCodeSectionAttachedTerminalRequestInput = z.input<
  typeof SetCodeSectionAttachedTerminalRequestSchema
>;

export function createSetCodeSectionAttachedTerminalRequest(
  options: Partial<SetCodeSectionAttachedTerminalRequest> = {},
): SetCodeSectionAttachedTerminalRequest {
  return SetCodeSectionAttachedTerminalRequestSchema.parse(options);
}

export const SetCodeSectionDiagnosticCodeSuppressionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  code: z.union([z.string(), z.int()]),
  suppress: z.boolean(),
});

export type SetCodeSectionDiagnosticCodeSuppressionRequest = z.infer<
  typeof SetCodeSectionDiagnosticCodeSuppressionRequestSchema
>;

export type SetCodeSectionDiagnosticCodeSuppressionRequestInput = z.input<
  typeof SetCodeSectionDiagnosticCodeSuppressionRequestSchema
>;

export function createSetCodeSectionDiagnosticCodeSuppressionRequest(
  options: Partial<SetCodeSectionDiagnosticCodeSuppressionRequest> = {},
): SetCodeSectionDiagnosticCodeSuppressionRequest {
  return SetCodeSectionDiagnosticCodeSuppressionRequestSchema.parse(options);
}

export const SetCodeSectionDiagnosticsMuteRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  mute: z.boolean(),
});

export type SetCodeSectionDiagnosticsMuteRequest = z.infer<
  typeof SetCodeSectionDiagnosticsMuteRequestSchema
>;

export type SetCodeSectionDiagnosticsMuteRequestInput = z.input<
  typeof SetCodeSectionDiagnosticsMuteRequestSchema
>;

export function createSetCodeSectionDiagnosticsMuteRequest(
  options: Partial<SetCodeSectionDiagnosticsMuteRequest> = {},
): SetCodeSectionDiagnosticsMuteRequest {
  return SetCodeSectionDiagnosticsMuteRequestSchema.parse(options);
}

export const SetDefaultSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetDefaultSectionVariantRequest = z.infer<
  typeof SetDefaultSectionVariantRequestSchema
>;

export type SetDefaultSectionVariantRequestInput = z.input<
  typeof SetDefaultSectionVariantRequestSchema
>;

export function createSetDefaultSectionVariantRequest(
  options: Partial<SetDefaultSectionVariantRequest> = {},
): SetDefaultSectionVariantRequest {
  return SetDefaultSectionVariantRequestSchema.parse(options);
}

export const SetEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edges: z.array(EdgeSchema),
});

export type SetEdgesRequest = z.infer<typeof SetEdgesRequestSchema>;

export type SetEdgesRequestInput = z.input<typeof SetEdgesRequestSchema>;

export function createSetEdgesRequest(
  options: Partial<SetEdgesRequest> = {},
): SetEdgesRequest {
  return SetEdgesRequestSchema.parse(options);
}

export const SetGenCodePrefixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodePrefix: z.string(),
});

export type SetGenCodePrefixRequest = z.infer<
  typeof SetGenCodePrefixRequestSchema
>;

export type SetGenCodePrefixRequestInput = z.input<
  typeof SetGenCodePrefixRequestSchema
>;

export function createSetGenCodePrefixRequest(
  options: Partial<SetGenCodePrefixRequest> = {},
): SetGenCodePrefixRequest {
  return SetGenCodePrefixRequestSchema.parse(options);
}

export const SetGenCodeSuffixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodeSuffix: z.string(),
});

export type SetGenCodeSuffixRequest = z.infer<
  typeof SetGenCodeSuffixRequestSchema
>;

export type SetGenCodeSuffixRequestInput = z.input<
  typeof SetGenCodeSuffixRequestSchema
>;

export function createSetGenCodeSuffixRequest(
  options: Partial<SetGenCodeSuffixRequest> = {},
): SetGenCodeSuffixRequest {
  return SetGenCodeSuffixRequestSchema.parse(options);
}

export const SetGroupOverflowModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  overflowMode: z.boolean(),
});

export type SetGroupOverflowModeRequest = z.infer<
  typeof SetGroupOverflowModeRequestSchema
>;

export type SetGroupOverflowModeRequestInput = z.input<
  typeof SetGroupOverflowModeRequestSchema
>;

export function createSetGroupOverflowModeRequest(
  options: Partial<SetGroupOverflowModeRequest> = {},
): SetGroupOverflowModeRequest {
  return SetGroupOverflowModeRequestSchema.parse(options);
}

export const SetImageAreaImagePathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  imagePath: z.string(),
});

export type SetImageAreaImagePathRequest = z.infer<
  typeof SetImageAreaImagePathRequestSchema
>;

export type SetImageAreaImagePathRequestInput = z.input<
  typeof SetImageAreaImagePathRequestSchema
>;

export function createSetImageAreaImagePathRequest(
  options: Partial<SetImageAreaImagePathRequest> = {},
): SetImageAreaImagePathRequest {
  return SetImageAreaImagePathRequestSchema.parse(options);
}

export const SetMetaControlShowSectionTitleRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  showSectionTitle: z.boolean(),
});

export type SetMetaControlShowSectionTitleRequest = z.infer<
  typeof SetMetaControlShowSectionTitleRequestSchema
>;

export type SetMetaControlShowSectionTitleRequestInput = z.input<
  typeof SetMetaControlShowSectionTitleRequestSchema
>;

export function createSetMetaControlShowSectionTitleRequest(
  options: Partial<SetMetaControlShowSectionTitleRequest> = {},
): SetMetaControlShowSectionTitleRequest {
  return SetMetaControlShowSectionTitleRequestSchema.parse(options);
}

export const SetParamEnteredValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  value: z.string(),
});

export type SetParamEnteredValueRequest = z.infer<
  typeof SetParamEnteredValueRequestSchema
>;

export type SetParamEnteredValueRequestInput = z.input<
  typeof SetParamEnteredValueRequestSchema
>;

export function createSetParamEnteredValueRequest(
  options: Partial<SetParamEnteredValueRequest> = {},
): SetParamEnteredValueRequest {
  return SetParamEnteredValueRequestSchema.parse(options);
}

export const SetProjectConfigCodegenTargetsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codegenTargets: z.array(
    z.union([
      ProjectCodegenPythonTargetSchema,
      ProjectCodegenPluginTargetSchema,
    ]),
  ),
});

export type SetProjectConfigCodegenTargetsRequest = z.infer<
  typeof SetProjectConfigCodegenTargetsRequestSchema
>;

export type SetProjectConfigCodegenTargetsRequestInput = z.input<
  typeof SetProjectConfigCodegenTargetsRequestSchema
>;

export function createSetProjectConfigCodegenTargetsRequest(
  options: Partial<SetProjectConfigCodegenTargetsRequest> = {},
): SetProjectConfigCodegenTargetsRequest {
  return SetProjectConfigCodegenTargetsRequestSchema.parse(options);
}

export const SetPromptFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  format: z.enum(PromptFormatEnum),
});

export type SetPromptFormatRequest = z.infer<
  typeof SetPromptFormatRequestSchema
>;

export type SetPromptFormatRequestInput = z.input<
  typeof SetPromptFormatRequestSchema
>;

export function createSetPromptFormatRequest(
  options: Partial<SetPromptFormatRequest> = {},
): SetPromptFormatRequest {
  return SetPromptFormatRequestSchema.parse(options);
}

export const SetPromptInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  inputs: z.record(z.string(), z.string()),
});

export type SetPromptInputsRequest = z.infer<
  typeof SetPromptInputsRequestSchema
>;

export type SetPromptInputsRequestInput = z.input<
  typeof SetPromptInputsRequestSchema
>;

export function createSetPromptInputsRequest(
  options: Partial<SetPromptInputsRequest> = {},
): SetPromptInputsRequest {
  return SetPromptInputsRequestSchema.parse(options);
}

export const SetPromptTemplateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  template: z.string(),
});

export type SetPromptTemplateRequest = z.infer<
  typeof SetPromptTemplateRequestSchema
>;

export type SetPromptTemplateRequestInput = z.input<
  typeof SetPromptTemplateRequestSchema
>;

export function createSetPromptTemplateRequest(
  options: Partial<SetPromptTemplateRequest> = {},
): SetPromptTemplateRequest {
  return SetPromptTemplateRequestSchema.parse(options);
}

export const SetSectionColumnWidthRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  columnWidth: z.union([z.number(), z.null()]),
});

export type SetSectionColumnWidthRequest = z.infer<
  typeof SetSectionColumnWidthRequestSchema
>;

export type SetSectionColumnWidthRequestInput = z.input<
  typeof SetSectionColumnWidthRequestSchema
>;

export function createSetSectionColumnWidthRequest(
  options: Partial<SetSectionColumnWidthRequest> = {},
): SetSectionColumnWidthRequest {
  return SetSectionColumnWidthRequestSchema.parse(options);
}

export const SetSectionEdgeInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  edgeInputParams: z.array(IDSchema),
});

export type SetSectionEdgeInputsRequest = z.infer<
  typeof SetSectionEdgeInputsRequestSchema
>;

export type SetSectionEdgeInputsRequestInput = z.input<
  typeof SetSectionEdgeInputsRequestSchema
>;

export function createSetSectionEdgeInputsRequest(
  options: Partial<SetSectionEdgeInputsRequest> = {},
): SetSectionEdgeInputsRequest {
  return SetSectionEdgeInputsRequestSchema.parse(options);
}

export const SetSectionEdgeOutputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  edgeOutputPorts: z.array(EdgePortSchema),
});

export type SetSectionEdgeOutputsRequest = z.infer<
  typeof SetSectionEdgeOutputsRequestSchema
>;

export type SetSectionEdgeOutputsRequestInput = z.input<
  typeof SetSectionEdgeOutputsRequestSchema
>;

export function createSetSectionEdgeOutputsRequest(
  options: Partial<SetSectionEdgeOutputsRequest> = {},
): SetSectionEdgeOutputsRequest {
  return SetSectionEdgeOutputsRequestSchema.parse(options);
}

export const SetSectionHideUnpinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideUnpinnedParams: z.boolean(),
});

export type SetSectionHideUnpinnedParamsRequest = z.infer<
  typeof SetSectionHideUnpinnedParamsRequestSchema
>;

export type SetSectionHideUnpinnedParamsRequestInput = z.input<
  typeof SetSectionHideUnpinnedParamsRequestSchema
>;

export function createSetSectionHideUnpinnedParamsRequest(
  options: Partial<SetSectionHideUnpinnedParamsRequest> = {},
): SetSectionHideUnpinnedParamsRequest {
  return SetSectionHideUnpinnedParamsRequestSchema.parse(options);
}

export const SetSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  name: z.string(),
});

export type SetSectionNameRequest = z.infer<typeof SetSectionNameRequestSchema>;

export type SetSectionNameRequestInput = z.input<
  typeof SetSectionNameRequestSchema
>;

export function createSetSectionNameRequest(
  options: Partial<SetSectionNameRequest> = {},
): SetSectionNameRequest {
  return SetSectionNameRequestSchema.parse(options);
}

export const SetSectionParamFilterRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  value: z.string(),
});

export type SetSectionParamFilterRequest = z.infer<
  typeof SetSectionParamFilterRequestSchema
>;

export type SetSectionParamFilterRequestInput = z.input<
  typeof SetSectionParamFilterRequestSchema
>;

export function createSetSectionParamFilterRequest(
  options: Partial<SetSectionParamFilterRequest> = {},
): SetSectionParamFilterRequest {
  return SetSectionParamFilterRequestSchema.parse(options);
}

export const SetSectionPinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  pinnedParams: z.array(IDSchema),
});

export type SetSectionPinnedParamsRequest = z.infer<
  typeof SetSectionPinnedParamsRequestSchema
>;

export type SetSectionPinnedParamsRequestInput = z.input<
  typeof SetSectionPinnedParamsRequestSchema
>;

export function createSetSectionPinnedParamsRequest(
  options: Partial<SetSectionPinnedParamsRequest> = {},
): SetSectionPinnedParamsRequest {
  return SetSectionPinnedParamsRequestSchema.parse(options);
}

export const SetSectionSizesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionSizes: z.record(IDSchema, SectionSizeSchema),
});

export type SetSectionSizesRequest = z.infer<
  typeof SetSectionSizesRequestSchema
>;

export type SetSectionSizesRequestInput = z.input<
  typeof SetSectionSizesRequestSchema
>;

export function createSetSectionSizesRequest(
  options: Partial<SetSectionSizesRequest> = {},
): SetSectionSizesRequest {
  return SetSectionSizesRequestSchema.parse(options);
}

export const SetSectionStyleColorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  styleColor: z.union([z.string(), z.null()]).default(null),
});

export type SetSectionStyleColorRequest = z.infer<
  typeof SetSectionStyleColorRequestSchema
>;

export type SetSectionStyleColorRequestInput = z.input<
  typeof SetSectionStyleColorRequestSchema
>;

export function createSetSectionStyleColorRequest(
  options: Partial<SetSectionStyleColorRequest> = {},
): SetSectionStyleColorRequest {
  return SetSectionStyleColorRequestSchema.parse(options);
}

export const SetSectionTagColorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  tagColor: z.union([z.string(), z.null()]).default(null),
});

export type SetSectionTagColorRequest = z.infer<
  typeof SetSectionTagColorRequestSchema
>;

export type SetSectionTagColorRequestInput = z.input<
  typeof SetSectionTagColorRequestSchema
>;

export function createSetSectionTagColorRequest(
  options: Partial<SetSectionTagColorRequest> = {},
): SetSectionTagColorRequest {
  return SetSectionTagColorRequestSchema.parse(options);
}

export const SetSectionVariantNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
  name: z.string(),
});

export type SetSectionVariantNameRequest = z.infer<
  typeof SetSectionVariantNameRequestSchema
>;

export type SetSectionVariantNameRequestInput = z.input<
  typeof SetSectionVariantNameRequestSchema
>;

export function createSetSectionVariantNameRequest(
  options: Partial<SetSectionVariantNameRequest> = {},
): SetSectionVariantNameRequest {
  return SetSectionVariantNameRequestSchema.parse(options);
}

export const SetSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetSectionVariantRequest = z.infer<
  typeof SetSectionVariantRequestSchema
>;

export type SetSectionVariantRequestInput = z.input<
  typeof SetSectionVariantRequestSchema
>;

export function createSetSectionVariantRequest(
  options: Partial<SetSectionVariantRequest> = {},
): SetSectionVariantRequest {
  return SetSectionVariantRequestSchema.parse(options);
}

export const SetShowParamDisplayNamesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  showParamDisplayNames: z.boolean(),
});

export type SetShowParamDisplayNamesRequest = z.infer<
  typeof SetShowParamDisplayNamesRequestSchema
>;

export type SetShowParamDisplayNamesRequestInput = z.input<
  typeof SetShowParamDisplayNamesRequestSchema
>;

export function createSetShowParamDisplayNamesRequest(
  options: Partial<SetShowParamDisplayNamesRequest> = {},
): SetShowParamDisplayNamesRequest {
  return SetShowParamDisplayNamesRequestSchema.parse(options);
}

export const SetSocialUrlRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  url: z.string(),
});

export type SetSocialUrlRequest = z.infer<typeof SetSocialUrlRequestSchema>;

export type SetSocialUrlRequestInput = z.input<
  typeof SetSocialUrlRequestSchema
>;

export function createSetSocialUrlRequest(
  options: Partial<SetSocialUrlRequest> = {},
): SetSocialUrlRequest {
  return SetSocialUrlRequestSchema.parse(options);
}

export const SetTextBlockDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  textDisplayMode: z.enum(TextBlockDisplayModeEnum),
});

export type SetTextBlockDisplayModeRequest = z.infer<
  typeof SetTextBlockDisplayModeRequestSchema
>;

export type SetTextBlockDisplayModeRequestInput = z.input<
  typeof SetTextBlockDisplayModeRequestSchema
>;

export function createSetTextBlockDisplayModeRequest(
  options: Partial<SetTextBlockDisplayModeRequest> = {},
): SetTextBlockDisplayModeRequest {
  return SetTextBlockDisplayModeRequestSchema.parse(options);
}

export const SetTextBlockFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  format: z.enum(TextBlockFormatEnum),
});

export type SetTextBlockFormatRequest = z.infer<
  typeof SetTextBlockFormatRequestSchema
>;

export type SetTextBlockFormatRequestInput = z.input<
  typeof SetTextBlockFormatRequestSchema
>;

export function createSetTextBlockFormatRequest(
  options: Partial<SetTextBlockFormatRequest> = {},
): SetTextBlockFormatRequest {
  return SetTextBlockFormatRequestSchema.parse(options);
}

export const SetTextBlockHeadingAsSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  headingAsSectionName: z.boolean(),
});

export type SetTextBlockHeadingAsSectionNameRequest = z.infer<
  typeof SetTextBlockHeadingAsSectionNameRequestSchema
>;

export type SetTextBlockHeadingAsSectionNameRequestInput = z.input<
  typeof SetTextBlockHeadingAsSectionNameRequestSchema
>;

export function createSetTextBlockHeadingAsSectionNameRequest(
  options: Partial<SetTextBlockHeadingAsSectionNameRequest> = {},
): SetTextBlockHeadingAsSectionNameRequest {
  return SetTextBlockHeadingAsSectionNameRequestSchema.parse(options);
}

export const SetTextBlockMetaControlStyleRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  metaControlStyle: z.boolean(),
});

export type SetTextBlockMetaControlStyleRequest = z.infer<
  typeof SetTextBlockMetaControlStyleRequestSchema
>;

export type SetTextBlockMetaControlStyleRequestInput = z.input<
  typeof SetTextBlockMetaControlStyleRequestSchema
>;

export function createSetTextBlockMetaControlStyleRequest(
  options: Partial<SetTextBlockMetaControlStyleRequest> = {},
): SetTextBlockMetaControlStyleRequest {
  return SetTextBlockMetaControlStyleRequestSchema.parse(options);
}

export const SetTextBlockTextRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  text: z.string(),
});

export type SetTextBlockTextRequest = z.infer<
  typeof SetTextBlockTextRequestSchema
>;

export type SetTextBlockTextRequestInput = z.input<
  typeof SetTextBlockTextRequestSchema
>;

export function createSetTextBlockTextRequest(
  options: Partial<SetTextBlockTextRequest> = {},
): SetTextBlockTextRequest {
  return SetTextBlockTextRequestSchema.parse(options);
}

export const SetTopLevelSectionLayoutRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema),
});

export type SetTopLevelSectionLayoutRequest = z.infer<
  typeof SetTopLevelSectionLayoutRequestSchema
>;

export type SetTopLevelSectionLayoutRequestInput = z.input<
  typeof SetTopLevelSectionLayoutRequestSchema
>;

export function createSetTopLevelSectionLayoutRequest(
  options: Partial<SetTopLevelSectionLayoutRequest> = {},
): SetTopLevelSectionLayoutRequest {
  return SetTopLevelSectionLayoutRequestSchema.parse(options);
}

export const SetTypeErrorIgnoreRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
  ignoreTypeErrors: z.boolean(),
});

export type SetTypeErrorIgnoreRequest = z.infer<
  typeof SetTypeErrorIgnoreRequestSchema
>;

export type SetTypeErrorIgnoreRequestInput = z.input<
  typeof SetTypeErrorIgnoreRequestSchema
>;

export function createSetTypeErrorIgnoreRequest(
  options: Partial<SetTypeErrorIgnoreRequest> = {},
): SetTypeErrorIgnoreRequest {
  return SetTypeErrorIgnoreRequestSchema.parse(options);
}

export const SetVariantJsonSourceKeysRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
  jsonSourceKeys: z.array(z.string()),
});

export type SetVariantJsonSourceKeysRequest = z.infer<
  typeof SetVariantJsonSourceKeysRequestSchema
>;

export type SetVariantJsonSourceKeysRequestInput = z.input<
  typeof SetVariantJsonSourceKeysRequestSchema
>;

export function createSetVariantJsonSourceKeysRequest(
  options: Partial<SetVariantJsonSourceKeysRequest> = {},
): SetVariantJsonSourceKeysRequest {
  return SetVariantJsonSourceKeysRequestSchema.parse(options);
}

export const SetViewModeNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
  name: z.string(),
});

export type SetViewModeNameRequest = z.infer<
  typeof SetViewModeNameRequestSchema
>;

export type SetViewModeNameRequestInput = z.input<
  typeof SetViewModeNameRequestSchema
>;

export function createSetViewModeNameRequest(
  options: Partial<SetViewModeNameRequest> = {},
): SetViewModeNameRequest {
  return SetViewModeNameRequestSchema.parse(options);
}

export const SetViewportRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewport: z.union([ViewportSchema, z.null()]),
});

export type SetViewportRequest = z.infer<typeof SetViewportRequestSchema>;

export type SetViewportRequestInput = z.input<typeof SetViewportRequestSchema>;

export function createSetViewportRequest(
  options: Partial<SetViewportRequest> = {},
): SetViewportRequest {
  return SetViewportRequestSchema.parse(options);
}

export const SetWatchCodeEnabledRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  enabled: z.boolean(),
});

export type SetWatchCodeEnabledRequest = z.infer<
  typeof SetWatchCodeEnabledRequestSchema
>;

export type SetWatchCodeEnabledRequestInput = z.input<
  typeof SetWatchCodeEnabledRequestSchema
>;

export function createSetWatchCodeEnabledRequest(
  options: Partial<SetWatchCodeEnabledRequest> = {},
): SetWatchCodeEnabledRequest {
  return SetWatchCodeEnabledRequestSchema.parse(options);
}

export const SetWatchCodeInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  watchCodeFolders: z.array(WatchCodeFolderSchema),
  watchCodeFiles: z.array(z.string()),
});

export type SetWatchCodeInputsRequest = z.infer<
  typeof SetWatchCodeInputsRequestSchema
>;

export type SetWatchCodeInputsRequestInput = z.input<
  typeof SetWatchCodeInputsRequestSchema
>;

export function createSetWatchCodeInputsRequest(
  options: Partial<SetWatchCodeInputsRequest> = {},
): SetWatchCodeInputsRequest {
  return SetWatchCodeInputsRequestSchema.parse(options);
}

export const TextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
  fullText: z.string(),
  position: z.int(),
});

export type TextFieldCompletionRequest = z.infer<
  typeof TextFieldCompletionRequestSchema
>;

export type TextFieldCompletionRequestInput = z.input<
  typeof TextFieldCompletionRequestSchema
>;

export function createTextFieldCompletionRequest(
  options: Partial<TextFieldCompletionRequest> = {},
): TextFieldCompletionRequest {
  return TextFieldCompletionRequestSchema.parse(options);
}

export const ToggleGroupOrientationRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type ToggleGroupOrientationRequest = z.infer<
  typeof ToggleGroupOrientationRequestSchema
>;

export type ToggleGroupOrientationRequestInput = z.input<
  typeof ToggleGroupOrientationRequestSchema
>;

export function createToggleGroupOrientationRequest(
  options: Partial<ToggleGroupOrientationRequest> = {},
): ToggleGroupOrientationRequest {
  return ToggleGroupOrientationRequestSchema.parse(options);
}

export const ToggleIsEditingViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type ToggleIsEditingViewModeRequest = z.infer<
  typeof ToggleIsEditingViewModeRequestSchema
>;

export type ToggleIsEditingViewModeRequestInput = z.input<
  typeof ToggleIsEditingViewModeRequestSchema
>;

export function createToggleIsEditingViewModeRequest(
  options: Partial<ToggleIsEditingViewModeRequest> = {},
): ToggleIsEditingViewModeRequest {
  return ToggleIsEditingViewModeRequestSchema.parse(options);
}

export const ToggleMinimizedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type ToggleMinimizedRequest = z.infer<
  typeof ToggleMinimizedRequestSchema
>;

export type ToggleMinimizedRequestInput = z.input<
  typeof ToggleMinimizedRequestSchema
>;

export function createToggleMinimizedRequest(
  options: Partial<ToggleMinimizedRequest> = {},
): ToggleMinimizedRequest {
  return ToggleMinimizedRequestSchema.parse(options);
}

export const ToggleParamSelectedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
});

export type ToggleParamSelectedRequest = z.infer<
  typeof ToggleParamSelectedRequestSchema
>;

export type ToggleParamSelectedRequestInput = z.input<
  typeof ToggleParamSelectedRequestSchema
>;

export function createToggleParamSelectedRequest(
  options: Partial<ToggleParamSelectedRequest> = {},
): ToggleParamSelectedRequest {
  return ToggleParamSelectedRequestSchema.parse(options);
}

export const TogglePositionLocksRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type TogglePositionLocksRequest = z.infer<
  typeof TogglePositionLocksRequestSchema
>;

export type TogglePositionLocksRequestInput = z.input<
  typeof TogglePositionLocksRequestSchema
>;

export function createTogglePositionLocksRequest(
  options: Partial<TogglePositionLocksRequest> = {},
): TogglePositionLocksRequest {
  return TogglePositionLocksRequestSchema.parse(options);
}

export const ToggleSectionVisibilityRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type ToggleSectionVisibilityRequest = z.infer<
  typeof ToggleSectionVisibilityRequestSchema
>;

export type ToggleSectionVisibilityRequestInput = z.input<
  typeof ToggleSectionVisibilityRequestSchema
>;

export function createToggleSectionVisibilityRequest(
  options: Partial<ToggleSectionVisibilityRequest> = {},
): ToggleSectionVisibilityRequest {
  return ToggleSectionVisibilityRequestSchema.parse(options);
}

export const ToggleVariantFrozenRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantFrozenRequest = z.infer<
  typeof ToggleVariantFrozenRequestSchema
>;

export type ToggleVariantFrozenRequestInput = z.input<
  typeof ToggleVariantFrozenRequestSchema
>;

export function createToggleVariantFrozenRequest(
  options: Partial<ToggleVariantFrozenRequest> = {},
): ToggleVariantFrozenRequest {
  return ToggleVariantFrozenRequestSchema.parse(options);
}

export const ToggleVariantJSONSourceRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantJSONSourceRequest = z.infer<
  typeof ToggleVariantJSONSourceRequestSchema
>;

export type ToggleVariantJSONSourceRequestInput = z.input<
  typeof ToggleVariantJSONSourceRequestSchema
>;

export function createToggleVariantJSONSourceRequest(
  options: Partial<ToggleVariantJSONSourceRequest> = {},
): ToggleVariantJSONSourceRequest {
  return ToggleVariantJSONSourceRequestSchema.parse(options);
}

export const ToggleViewModeTabRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type ToggleViewModeTabRequest = z.infer<
  typeof ToggleViewModeTabRequestSchema
>;

export type ToggleViewModeTabRequestInput = z.input<
  typeof ToggleViewModeTabRequestSchema
>;

export function createToggleViewModeTabRequest(
  options: Partial<ToggleViewModeTabRequest> = {},
): ToggleViewModeTabRequest {
  return ToggleViewModeTabRequestSchema.parse(options);
}

export const ToggleViewModeUserFacingRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type ToggleViewModeUserFacingRequest = z.infer<
  typeof ToggleViewModeUserFacingRequestSchema
>;

export type ToggleViewModeUserFacingRequestInput = z.input<
  typeof ToggleViewModeUserFacingRequestSchema
>;

export function createToggleViewModeUserFacingRequest(
  options: Partial<ToggleViewModeUserFacingRequest> = {},
): ToggleViewModeUserFacingRequest {
  return ToggleViewModeUserFacingRequestSchema.parse(options);
}

export const UndoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type UndoRequest = z.infer<typeof UndoRequestSchema>;

export type UndoRequestInput = z.input<typeof UndoRequestSchema>;

export function createUndoRequest(
  options: Partial<UndoRequest> = {},
): UndoRequest {
  return UndoRequestSchema.parse(options);
}

export const UngroupGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  groupIds: z.array(IDSchema),
});

export type UngroupGroupsRequest = z.infer<typeof UngroupGroupsRequestSchema>;

export type UngroupGroupsRequestInput = z.input<
  typeof UngroupGroupsRequestSchema
>;

export function createUngroupGroupsRequest(
  options: Partial<UngroupGroupsRequest> = {},
): UngroupGroupsRequest {
  return UngroupGroupsRequestSchema.parse(options);
}

export const UnindentParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
});

export type UnindentParamsRequest = z.infer<typeof UnindentParamsRequestSchema>;

export type UnindentParamsRequestInput = z.input<
  typeof UnindentParamsRequestSchema
>;

export function createUnindentParamsRequest(
  options: Partial<UnindentParamsRequest> = {},
): UnindentParamsRequest {
  return UnindentParamsRequestSchema.parse(options);
}

export const UnselectAllParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type UnselectAllParamsRequest = z.infer<
  typeof UnselectAllParamsRequestSchema
>;

export type UnselectAllParamsRequestInput = z.input<
  typeof UnselectAllParamsRequestSchema
>;

export function createUnselectAllParamsRequest(
  options: Partial<UnselectAllParamsRequest> = {},
): UnselectAllParamsRequest {
  return UnselectAllParamsRequestSchema.parse(options);
}

export const UpdateAgenticEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edge: AgenticEdgeSchema,
});

export type UpdateAgenticEdgeRequest = z.infer<
  typeof UpdateAgenticEdgeRequestSchema
>;

export type UpdateAgenticEdgeRequestInput = z.input<
  typeof UpdateAgenticEdgeRequestSchema
>;

export function createUpdateAgenticEdgeRequest(
  options: Partial<UpdateAgenticEdgeRequest> = {},
): UpdateAgenticEdgeRequest {
  return UpdateAgenticEdgeRequestSchema.parse(options);
}

export const UpdateAppDefinitionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  patch: z.union([
    z.record(z.string(), z.any()),
    z.array(z.any()),
    z.string(),
    z.int(),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
});

export type UpdateAppDefinitionRequest = z.infer<
  typeof UpdateAppDefinitionRequestSchema
>;

export type UpdateAppDefinitionRequestInput = z.input<
  typeof UpdateAppDefinitionRequestSchema
>;

export function createUpdateAppDefinitionRequest(
  options: Partial<UpdateAppDefinitionRequest> = {},
): UpdateAppDefinitionRequest {
  return UpdateAppDefinitionRequestSchema.parse(options);
}

export const UpdateEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edge: EdgeSchema,
});

export type UpdateEdgeRequest = z.infer<typeof UpdateEdgeRequestSchema>;

export type UpdateEdgeRequestInput = z.input<typeof UpdateEdgeRequestSchema>;

export function createUpdateEdgeRequest(
  options: Partial<UpdateEdgeRequest> = {},
): UpdateEdgeRequest {
  return UpdateEdgeRequestSchema.parse(options);
}

export const UpdateParamImplConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  newConfig: z.record(z.string(), z.any()),
});

export type UpdateParamImplConfigRequest = z.infer<
  typeof UpdateParamImplConfigRequestSchema
>;

export type UpdateParamImplConfigRequestInput = z.input<
  typeof UpdateParamImplConfigRequestSchema
>;

export function createUpdateParamImplConfigRequest(
  options: Partial<UpdateParamImplConfigRequest> = {},
): UpdateParamImplConfigRequest {
  return UpdateParamImplConfigRequestSchema.parse(options);
}

export const ValidateAppDefinitionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  appSpec: z.union([
    z.record(z.string(), z.any()),
    z.array(z.any()),
    z.string(),
    z.int(),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
  appSpecVersion: z.union([z.string(), z.null()]).default(null),
  catalogId: z.union([z.string(), z.null()]).default(null),
  routes: z.union([z.array(AppRouteSchema), z.null()]).default(null),
  dataBindings: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  actions: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  theme: z
    .union([
      z.record(
        z.string(),
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
  assets: z
    .union([
      z.array(
        z.union([
          z.record(z.string(), z.any()),
          z.array(z.any()),
          z.string(),
          z.int(),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      ),
      z.null(),
    ])
    .default(null),
});

export type ValidateAppDefinitionRequest = z.infer<
  typeof ValidateAppDefinitionRequestSchema
>;

export type ValidateAppDefinitionRequestInput = z.input<
  typeof ValidateAppDefinitionRequestSchema
>;

export function createValidateAppDefinitionRequest(
  options: Partial<ValidateAppDefinitionRequest> = {},
): ValidateAppDefinitionRequest {
  return ValidateAppDefinitionRequestSchema.parse(options);
}

export const ValidateAppDefinitionResponseSchema = z.object({
  errors: z.array(AppValidationIssueSchema).default([]),
  warnings: z.array(AppValidationIssueSchema).default([]),
  capabilities: AppCapabilitiesSchema,
});

export type ValidateAppDefinitionResponse = z.infer<
  typeof ValidateAppDefinitionResponseSchema
>;

export type ValidateAppDefinitionResponseInput = z.input<
  typeof ValidateAppDefinitionResponseSchema
>;

export function createValidateAppDefinitionResponse(
  options: Partial<ValidateAppDefinitionResponse> = {},
): ValidateAppDefinitionResponse {
  return ValidateAppDefinitionResponseSchema.parse(options);
}

export const AddDefaultDataForJSONImportRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
});

export type AddDefaultDataForJSONImportRequest = z.infer<
  typeof AddDefaultDataForJSONImportRequestSchema
>;

export type AddDefaultDataForJSONImportRequestInput = z.input<
  typeof AddDefaultDataForJSONImportRequestSchema
>;

export function createAddDefaultDataForJSONImportRequest(
  options: Partial<AddDefaultDataForJSONImportRequest> = {},
): AddDefaultDataForJSONImportRequest {
  return AddDefaultDataForJSONImportRequestSchema.parse(options);
}

export const CreateProjectConfigRequestSchema = z.object({
  previewImgColor: z.string(),
});

export type CreateProjectConfigRequest = z.infer<
  typeof CreateProjectConfigRequestSchema
>;

export type CreateProjectConfigRequestInput = z.input<
  typeof CreateProjectConfigRequestSchema
>;

export function createCreateProjectConfigRequest(
  options: Partial<CreateProjectConfigRequest> = {},
): CreateProjectConfigRequest {
  return CreateProjectConfigRequestSchema.parse(options);
}

export const DeleteNotificationRequestSchema = z.object({
  notificationId: IDSchema,
});

export type DeleteNotificationRequest = z.infer<
  typeof DeleteNotificationRequestSchema
>;

export type DeleteNotificationRequestInput = z.input<
  typeof DeleteNotificationRequestSchema
>;

export function createDeleteNotificationRequest(
  options: Partial<DeleteNotificationRequest> = {},
): DeleteNotificationRequest {
  return DeleteNotificationRequestSchema.parse(options);
}

export const DeleteProjectConfigsRequestSchema = z.object({
  ids: z.array(IDSchema),
});

export type DeleteProjectConfigsRequest = z.infer<
  typeof DeleteProjectConfigsRequestSchema
>;

export type DeleteProjectConfigsRequestInput = z.input<
  typeof DeleteProjectConfigsRequestSchema
>;

export function createDeleteProjectConfigsRequest(
  options: Partial<DeleteProjectConfigsRequest> = {},
): DeleteProjectConfigsRequest {
  return DeleteProjectConfigsRequestSchema.parse(options);
}

export const FilterDataForJSONExportRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
});

export type FilterDataForJSONExportRequest = z.infer<
  typeof FilterDataForJSONExportRequestSchema
>;

export type FilterDataForJSONExportRequestInput = z.input<
  typeof FilterDataForJSONExportRequestSchema
>;

export function createFilterDataForJSONExportRequest(
  options: Partial<FilterDataForJSONExportRequest> = {},
): FilterDataForJSONExportRequest {
  return FilterDataForJSONExportRequestSchema.parse(options);
}

export const GetNotificationsRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type GetNotificationsRequest = z.infer<
  typeof GetNotificationsRequestSchema
>;

export type GetNotificationsRequestInput = z.input<
  typeof GetNotificationsRequestSchema
>;

export function createGetNotificationsRequest(
  options: Partial<GetNotificationsRequest> = {},
): GetNotificationsRequest {
  return GetNotificationsRequestSchema.parse(options);
}

export const ManualSaveRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ManualSaveRequest = z.infer<typeof ManualSaveRequestSchema>;

export type ManualSaveRequestInput = z.input<typeof ManualSaveRequestSchema>;

export function createManualSaveRequest(
  options: Partial<ManualSaveRequest> = {},
): ManualSaveRequest {
  return ManualSaveRequestSchema.parse(options);
}

export const ProjectLoadRequestSchema = z.object({
  projectConfigName: z.string(),
});

export type ProjectLoadRequest = z.infer<typeof ProjectLoadRequestSchema>;

export type ProjectLoadRequestInput = z.input<typeof ProjectLoadRequestSchema>;

export function createProjectLoadRequest(
  options: Partial<ProjectLoadRequest> = {},
): ProjectLoadRequest {
  return ProjectLoadRequestSchema.parse(options);
}

export const SaveAsNewProjectConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  newConfigName: z.string(),
  withRefs: z.boolean(),
});

export type SaveAsNewProjectConfigRequest = z.infer<
  typeof SaveAsNewProjectConfigRequestSchema
>;

export type SaveAsNewProjectConfigRequestInput = z.input<
  typeof SaveAsNewProjectConfigRequestSchema
>;

export function createSaveAsNewProjectConfigRequest(
  options: Partial<SaveAsNewProjectConfigRequest> = {},
): SaveAsNewProjectConfigRequest {
  return SaveAsNewProjectConfigRequestSchema.parse(options);
}

export const SetAsDefaultProjectRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type SetAsDefaultProjectRequest = z.infer<
  typeof SetAsDefaultProjectRequestSchema
>;

export type SetAsDefaultProjectRequestInput = z.input<
  typeof SetAsDefaultProjectRequestSchema
>;

export function createSetAsDefaultProjectRequest(
  options: Partial<SetAsDefaultProjectRequest> = {},
): SetAsDefaultProjectRequest {
  return SetAsDefaultProjectRequestSchema.parse(options);
}

export const SetProjectConfigNameRequestSchema = z.object({
  projectConfigId: IDSchema,
  newName: z.string(),
});

export type SetProjectConfigNameRequest = z.infer<
  typeof SetProjectConfigNameRequestSchema
>;

export type SetProjectConfigNameRequestInput = z.input<
  typeof SetProjectConfigNameRequestSchema
>;

export function createSetProjectConfigNameRequest(
  options: Partial<SetProjectConfigNameRequest> = {},
): SetProjectConfigNameRequest {
  return SetProjectConfigNameRequestSchema.parse(options);
}

export const CancelRunRequestSchema = z.object({
  runId: z.string(),
});

export type CancelRunRequest = z.infer<typeof CancelRunRequestSchema>;

export type CancelRunRequestInput = z.input<typeof CancelRunRequestSchema>;

export function createCancelRunRequest(
  options: Partial<CancelRunRequest> = {},
): CancelRunRequest {
  return CancelRunRequestSchema.parse(options);
}

export const GetRunStatusRequestSchema = z.object({
  runId: z.string(),
});

export type GetRunStatusRequest = z.infer<typeof GetRunStatusRequestSchema>;

export type GetRunStatusRequestInput = z.input<
  typeof GetRunStatusRequestSchema
>;

export function createGetRunStatusRequest(
  options: Partial<GetRunStatusRequest> = {},
): GetRunStatusRequest {
  return GetRunStatusRequestSchema.parse(options);
}

export const RunDetachedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  entrySectionId: z.union([IDSchema, z.null()]).default(null),
  runSnapshotMode: z
    .union([z.enum(RunSnapshotModeEnum), z.null()])
    .default(null),
  sectionVariantOverrides: z
    .union([z.record(IDSchema, IDSchema), z.null()])
    .default(null),
  paramOverrides: z
    .union([z.record(z.string(), z.string()), z.null()])
    .default(null),
  tags: z.union([z.record(z.string(), z.string()), z.null()]).default(null),
});

export type RunDetachedRequest = z.infer<typeof RunDetachedRequestSchema>;

export type RunDetachedRequestInput = z.input<typeof RunDetachedRequestSchema>;

export function createRunDetachedRequest(
  options: Partial<RunDetachedRequest> = {},
): RunDetachedRequest {
  return RunDetachedRequestSchema.parse(options);
}

export const RunStatusEnum = {
  queued: "queued",
  running: "running",
  exited: "exited",
  failed: "failed",
  canceled: "canceled",
  lost: "lost",
} as const;

export type RunStatus = ObjectValues<typeof RunStatusEnum>;

export const RunDetachedResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(RunStatusEnum),
});

export type RunDetachedResponse = z.infer<typeof RunDetachedResponseSchema>;

export type RunDetachedResponseInput = z.input<
  typeof RunDetachedResponseSchema
>;

export function createRunDetachedResponse(
  options: Partial<RunDetachedResponse> = {},
): RunDetachedResponse {
  return RunDetachedResponseSchema.parse(options);
}

export const RunStatusResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(RunStatusEnum),
  createdAtMs: z.int(),
  startedAtMs: z.union([z.int(), z.null()]),
  exitedAtMs: z.union([z.int(), z.null()]),
  exitCode: z.union([z.int(), z.null()]),
  pid: z.union([z.int(), z.null()]),
  command: z.string(),
  snapshotPath: z.string(),
  projectConfigId: IDSchema,
  entrySectionId: z.union([IDSchema, z.null()]),
  tags: z.record(z.string(), z.string()),
});

export type RunStatusResponse = z.infer<typeof RunStatusResponseSchema>;

export type RunStatusResponseInput = z.input<typeof RunStatusResponseSchema>;

export function createRunStatusResponse(
  options: Partial<RunStatusResponse> = {},
): RunStatusResponse {
  return RunStatusResponseSchema.parse(options);
}

export const CreateFileRequestSchema = z.object({
  filepath: z.string(),
});

export type CreateFileRequest = z.infer<typeof CreateFileRequestSchema>;

export type CreateFileRequestInput = z.input<typeof CreateFileRequestSchema>;

export function createCreateFileRequest(
  options: Partial<CreateFileRequest> = {},
): CreateFileRequest {
  return CreateFileRequestSchema.parse(options);
}

export const GetJSONSourcePathToBeDeletedSchema = z.object({
  variantName: z.string(),
});

export type GetJSONSourcePathToBeDeleted = z.infer<
  typeof GetJSONSourcePathToBeDeletedSchema
>;

export type GetJSONSourcePathToBeDeletedInput = z.input<
  typeof GetJSONSourcePathToBeDeletedSchema
>;

export function createGetJSONSourcePathToBeDeleted(
  options: Partial<GetJSONSourcePathToBeDeleted> = {},
): GetJSONSourcePathToBeDeleted {
  return GetJSONSourcePathToBeDeletedSchema.parse(options);
}

export const NewJSONVersionNameRequestSchema = z.object({
  filename: z.string(),
});

export type NewJSONVersionNameRequest = z.infer<
  typeof NewJSONVersionNameRequestSchema
>;

export type NewJSONVersionNameRequestInput = z.input<
  typeof NewJSONVersionNameRequestSchema
>;

export function createNewJSONVersionNameRequest(
  options: Partial<NewJSONVersionNameRequest> = {},
): NewJSONVersionNameRequest {
  return NewJSONVersionNameRequestSchema.parse(options);
}

export const SaveSettingsRequestSchema = z.object({
  settings: SettingsStateSchema,
});

export type SaveSettingsRequest = z.infer<typeof SaveSettingsRequestSchema>;

export type SaveSettingsRequestInput = z.input<
  typeof SaveSettingsRequestSchema
>;

export function createSaveSettingsRequest(
  options: Partial<SaveSettingsRequest> = {},
): SaveSettingsRequest {
  return SaveSettingsRequestSchema.parse(options);
}

export const LoadShareProjectConfigRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type LoadShareProjectConfigRequest = z.infer<
  typeof LoadShareProjectConfigRequestSchema
>;

export type LoadShareProjectConfigRequestInput = z.input<
  typeof LoadShareProjectConfigRequestSchema
>;

export function createLoadShareProjectConfigRequest(
  options: Partial<LoadShareProjectConfigRequest> = {},
): LoadShareProjectConfigRequest {
  return LoadShareProjectConfigRequestSchema.parse(options);
}

export const SharePolicyOverridesSchema = z.object({
  allowParamChanges: z.union([z.boolean(), z.null()]).default(null),
  allowVariantChanges: z.union([z.boolean(), z.null()]).default(null),
  allowLayoutChanges: z.union([z.boolean(), z.null()]).default(null),
  allowRun: z.union([z.boolean(), z.null()]).default(null),
  allowLLM: z.union([z.boolean(), z.null()]).default(null),
  allowExternalLinks: z.union([z.boolean(), z.null()]).default(null),
  allowFileDownloads: z.union([z.boolean(), z.null()]).default(null),
  allowMultipleRuns: z.union([z.boolean(), z.null()]).default(null),
  runSnapshotMode: z
    .union([z.enum(RunSnapshotModeEnum), z.null()])
    .default(null),
});

export type SharePolicyOverrides = z.infer<typeof SharePolicyOverridesSchema>;

export type SharePolicyOverridesInput = z.input<
  typeof SharePolicyOverridesSchema
>;

export function createSharePolicyOverrides(
  options: Partial<SharePolicyOverrides> = {},
): SharePolicyOverrides {
  return SharePolicyOverridesSchema.parse(options);
}

export const PublishShareDeploymentRequestSchema = z.object({
  deploymentName: z.string(),
  projectConfigId: IDSchema,
  sharePolicyOverrides: z
    .union([SharePolicyOverridesSchema, z.null()])
    .default(null),
  listenerEntrypoint: z.union([z.string(), z.null()]).default(null),
  listenerEnabled: z.boolean().default(true),
});

export type PublishShareDeploymentRequest = z.infer<
  typeof PublishShareDeploymentRequestSchema
>;

export type PublishShareDeploymentRequestInput = z.input<
  typeof PublishShareDeploymentRequestSchema
>;

export function createPublishShareDeploymentRequest(
  options: Partial<PublishShareDeploymentRequest> = {},
): PublishShareDeploymentRequest {
  return PublishShareDeploymentRequestSchema.parse(options);
}

export const AuthRefreshStatusResponseSchema = z.object({
  authCookieRefreshWindowSeconds: z.int(),
});

export type AuthRefreshStatusResponse = z.infer<
  typeof AuthRefreshStatusResponseSchema
>;

export type AuthRefreshStatusResponseInput = z.input<
  typeof AuthRefreshStatusResponseSchema
>;

export function createAuthRefreshStatusResponse(
  options: Partial<AuthRefreshStatusResponse> = {},
): AuthRefreshStatusResponse {
  return AuthRefreshStatusResponseSchema.parse(options);
}

export const BackendInitEventSchema = z.object({
  message: z.string(),
  timestamp: z.iso.datetime().default(get_now_timestamp),
});

export type BackendInitEvent = z.infer<typeof BackendInitEventSchema>;

export type BackendInitEventInput = z.input<typeof BackendInitEventSchema>;

export function createBackendInitEvent(
  options: Partial<BackendInitEvent> = {},
): BackendInitEvent {
  return BackendInitEventSchema.parse(options);
}

export const BackendInitStatusResponseSchema = z.object({
  events: z.array(BackendInitEventSchema),
  isReady: z.boolean(),
  error: z.union([z.string(), z.null()]),
  authCookieRefreshWindowSeconds: z.int(),
  worktreeName: z.union([z.string(), z.null()]),
});

export type BackendInitStatusResponse = z.infer<
  typeof BackendInitStatusResponseSchema
>;

export type BackendInitStatusResponseInput = z.input<
  typeof BackendInitStatusResponseSchema
>;

export function createBackendInitStatusResponse(
  options: Partial<BackendInitStatusResponse> = {},
): BackendInitStatusResponse {
  return BackendInitStatusResponseSchema.parse(options);
}

export const RevealPathInOsFileExplorerRequestSchema = z.object({
  path: z.string(),
});

export type RevealPathInOsFileExplorerRequest = z.infer<
  typeof RevealPathInOsFileExplorerRequestSchema
>;

export type RevealPathInOsFileExplorerRequestInput = z.input<
  typeof RevealPathInOsFileExplorerRequestSchema
>;

export function createRevealPathInOsFileExplorerRequest(
  options: Partial<RevealPathInOsFileExplorerRequest> = {},
): RevealPathInOsFileExplorerRequest {
  return RevealPathInOsFileExplorerRequestSchema.parse(options);
}

export const SettaHomeInfoResponseSchema = z.object({
  settaHome: z.string(),
  globalSettaFilesBase: z.string(),
  activeSettaFilesLocation: z.string(),
  llmConfigPath: z.string(),
});

export type SettaHomeInfoResponse = z.infer<typeof SettaHomeInfoResponseSchema>;

export type SettaHomeInfoResponseInput = z.input<
  typeof SettaHomeInfoResponseSchema
>;

export function createSettaHomeInfoResponse(
  options: Partial<SettaHomeInfoResponse> = {},
): SettaHomeInfoResponse {
  return SettaHomeInfoResponseSchema.parse(options);
}

export const DeleteTerminalsRequestSchema = z.object({
  sectionIds: z.array(IDSchema),
});

export type DeleteTerminalsRequest = z.infer<
  typeof DeleteTerminalsRequestSchema
>;

export type DeleteTerminalsRequestInput = z.input<
  typeof DeleteTerminalsRequestSchema
>;

export function createDeleteTerminalsRequest(
  options: Partial<DeleteTerminalsRequest> = {},
): DeleteTerminalsRequest {
  return DeleteTerminalsRequestSchema.parse(options);
}

export const KillSubprocessesRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type KillSubprocessesRequest = z.infer<
  typeof KillSubprocessesRequestSchema
>;

export type KillSubprocessesRequestInput = z.input<
  typeof KillSubprocessesRequestSchema
>;

export function createKillSubprocessesRequest(
  options: Partial<KillSubprocessesRequest> = {},
): KillSubprocessesRequest {
  return KillSubprocessesRequestSchema.parse(options);
}

export const RunCodeRequestSchema = z.object({
  projectConfigId: IDSchema,
  sectionId: z.union([IDSchema, z.null()]),
  terminalSectionId: z.union([IDSchema, z.null()]).default(null),
  cliId: z.union([z.string(), z.null()]).default(null),
  runSnapshotMode: z
    .union([z.enum(RunSnapshotModeEnum), z.null()])
    .default(null),
  drawSnapshotsBySectionId: z
    .union([z.record(IDSchema, BinaryContentRefSchema), z.null()])
    .default(null),
  sectionVariantOverrides: z
    .union([z.record(IDSchema, IDSchema), z.null()])
    .default(null),
  paramOverrides: z
    .union([z.record(z.string(), z.string()), z.null()])
    .default(null),
});

export type RunCodeRequest = z.infer<typeof RunCodeRequestSchema>;

export type RunCodeRequestInput = z.input<typeof RunCodeRequestSchema>;

export function createRunCodeRequest(
  options: Partial<RunCodeRequest> = {},
): RunCodeRequest {
  return RunCodeRequestSchema.parse(options);
}

export const BaseDependencyKeySchema = z.object({
  type: z.enum(DependencyKeyTypeEnum),
});

export type BaseDependencyKey = z.infer<typeof BaseDependencyKeySchema>;

export type BaseDependencyKeyInput = z.input<typeof BaseDependencyKeySchema>;

export function createBaseDependencyKey(
  options: Partial<BaseDependencyKey> = {},
): BaseDependencyKey {
  return BaseDependencyKeySchema.parse(options);
}

export const BaseDependencyValueSchema = z.object({
  payload: z.any(),
  type: z.enum(DependencyValueTypeEnum),
});

export type BaseDependencyValue = z.infer<typeof BaseDependencyValueSchema>;

export type BaseDependencyValueInput = z.input<
  typeof BaseDependencyValueSchema
>;

export function createBaseDependencyValue(
  options: Partial<BaseDependencyValue> = {},
): BaseDependencyValue {
  return BaseDependencyValueSchema.parse(options);
}

export const LayoutRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export type LayoutRect = z.infer<typeof LayoutRectSchema>;

export type LayoutRectInput = z.input<typeof LayoutRectSchema>;

export function createLayoutRect(
  options: Partial<LayoutRect> = {},
): LayoutRect {
  return LayoutRectSchema.parse(options);
}

export const PromptRenderResultSchema = z.object({
  rendered_text: z.string(),
  missing_variables: z.array(z.string()),
  render_error: z.union([z.string(), z.null()]),
});

export type PromptRenderResult = z.infer<typeof PromptRenderResultSchema>;

export type PromptRenderResultInput = z.input<typeof PromptRenderResultSchema>;

export function createPromptRenderResult(
  options: Partial<PromptRenderResult> = {},
): PromptRenderResult {
  return PromptRenderResultSchema.parse(options);
}

export const SettaLSPPositionSchema = z.object({
  start: z.int(),
  end: z.int(),
});

export type SettaLSPPosition = z.infer<typeof SettaLSPPositionSchema>;

export type SettaLSPPositionInput = z.input<typeof SettaLSPPositionSchema>;

export function createSettaLSPPosition(
  options: Partial<SettaLSPPosition> = {},
): SettaLSPPosition {
  return SettaLSPPositionSchema.parse(options);
}

export const ResolvedCodeObjValuePolicySchema = z.object({
  representation: z.enum(CodeObjValueRepresentationModeEnum),
});

export type ResolvedCodeObjValuePolicy = z.infer<
  typeof ResolvedCodeObjValuePolicySchema
>;

export type ResolvedCodeObjValuePolicyInput = z.input<
  typeof ResolvedCodeObjValuePolicySchema
>;

export function createResolvedCodeObjValuePolicy(
  options: Partial<ResolvedCodeObjValuePolicy> = {},
): ResolvedCodeObjValuePolicy {
  return ResolvedCodeObjValuePolicySchema.parse(options);
}

export const ResolvedSectionCodegenPolicySchema = z.object({
  include_in_codegen: z.boolean(),
  representation: z.enum(SectionRepresentationModeEnum),
});

export type ResolvedSectionCodegenPolicy = z.infer<
  typeof ResolvedSectionCodegenPolicySchema
>;

export type ResolvedSectionCodegenPolicyInput = z.input<
  typeof ResolvedSectionCodegenPolicySchema
>;

export function createResolvedSectionCodegenPolicy(
  options: Partial<ResolvedSectionCodegenPolicy> = {},
): ResolvedSectionCodegenPolicy {
  return ResolvedSectionCodegenPolicySchema.parse(options);
}

export const BinaryStoreSchema = z.object({
  root: z.string(),
  ttl_seconds: z.int().default(21600),
  _last_cleanup_at: z.union([z.number(), z.null()]).default(null),
  _writes_since_cleanup: z.int().default(0),
});

export type BinaryStore = z.infer<typeof BinaryStoreSchema>;

export type BinaryStoreInput = z.input<typeof BinaryStoreSchema>;

export function createBinaryStore(
  options: Partial<BinaryStore> = {},
): BinaryStore {
  return BinaryStoreSchema.parse(options);
}

export const MetaSchema = z.object({
  progressToken: z.union([z.string(), z.int(), z.null()]).default(null),
});

export type Meta = z.infer<typeof MetaSchema>;

export type MetaInput = z.input<typeof MetaSchema>;

export function createMeta(options: Partial<Meta> = {}): Meta {
  return MetaSchema.parse(options);
}

export const RequestContextSchema = z.object({
  request_id: z.union([z.int(), z.string()]),
  meta: z.union([MetaSchema, z.null()]),
  session: z.any(),
  lifespan_context: z.any(),
  experimental: z.any().default(null),
  request: z.union([z.any(), z.null()]).default(null),
  close_sse_stream: z.union([z.any(), z.null()]).default(null),
  close_standalone_sse_stream: z.union([z.any(), z.null()]).default(null),
});

export type RequestContext = z.infer<typeof RequestContextSchema>;

export type RequestContextInput = z.input<typeof RequestContextSchema>;

export function createRequestContext(
  options: Partial<RequestContext> = {},
): RequestContext {
  return RequestContextSchema.parse(options);
}

export const CodeMirrorCompletionSchema = z.object({
  label: z.string(),
  type: z.string(),
});

export type CodeMirrorCompletion = z.infer<typeof CodeMirrorCompletionSchema>;

export type CodeMirrorCompletionInput = z.input<
  typeof CodeMirrorCompletionSchema
>;

export function createCodeMirrorCompletion(
  options: Partial<CodeMirrorCompletion> = {},
): CodeMirrorCompletion {
  return CodeMirrorCompletionSchema.parse(options);
}

export const DetachedRunSpecSchema = z.object({
  command: z.string(),
  snapshot_path: z.string(),
  project_config_id: IDSchema,
  entry_section_id: z.union([IDSchema, z.null()]),
  tags: z.record(z.string(), z.string()),
});

export type DetachedRunSpec = z.infer<typeof DetachedRunSpecSchema>;

export type DetachedRunSpecInput = z.input<typeof DetachedRunSpecSchema>;

export function createDetachedRunSpec(
  options: Partial<DetachedRunSpec> = {},
): DetachedRunSpec {
  return DetachedRunSpecSchema.parse(options);
}

export function isBaseCanvasSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseCanvasSectionImplUnion {
  return BaseCanvasSectionImplTypeSet.has(x.type);
}

export function isBaseChildlessCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseChildlessCodeObjImplUnion {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
}

export function isBaseCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseCodeObjImplUnion {
  return BaseCodeObjImplTypeSet.has(x.type);
}

export function isBaseCodeSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseCodeSectionImplUnion {
  return BaseCodeSectionImplTypeSet.has(x.type);
}

export function isBaseDictSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseDictSectionImplUnion {
  return BaseDictSectionImplTypeSet.has(x.type);
}

export function isBaseParamCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseParamCodeObjImplUnion {
  return BaseParamCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseParentCodeObjImplUnion {
  return BaseParentCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseParentSectionImplUnion {
  return BaseParentSectionImplTypeSet.has(x.type);
}

export function isBaseSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseSectionImplUnion {
  return BaseSectionImplTypeSet.has(x.type);
}

export function isBaseSectionWithParamsImpl(
  x: BaseSectionImplUnion,
): x is BaseSectionWithParamsImplUnion {
  return BaseSectionWithParamsImplTypeSet.has(x.type);
}

type ImplArgsBundleWithUpdaters<T, T2> = {
  [K in keyof T]?: T[K] | (K extends keyof T2 ? (prev: T2[K]) => T2[K] : never);
};

export type ImplArgsBundleMap = {
  BaseSection: {
    impl: BaseSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplArgs, BaseSectionImpl>;
  };

  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseSectionWithParamsImplArgs,
      BaseSectionWithParamsImpl
    >;
  };

  BaseCanvasSection: {
    impl: BaseCanvasSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseCanvasSectionImplArgs,
      BaseCanvasSectionImpl
    >;
  };

  BaseParentSection: {
    impl: BaseParentSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseParentSectionImplArgs,
      BaseParentSectionImpl
    >;
  };

  BaseCodeSection: {
    impl: BaseCodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseCodeSectionImplArgs,
      BaseCodeSectionImpl
    >;
  };

  BaseDictSection: {
    impl: BaseDictSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseDictSectionImplArgs,
      BaseDictSectionImpl
    >;
  };

  CallableSection: {
    impl: CallableSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      CallableSectionImplArgs,
      CallableSectionImpl
    >;
  };

  DictSection: {
    impl: DictSectionImpl;
    args: ImplArgsBundleWithUpdaters<DictSectionImplArgs, DictSectionImpl>;
  };

  ListRootSection: {
    impl: ListRootSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      ListRootSectionImplArgs,
      ListRootSectionImpl
    >;
  };

  GroupSection: {
    impl: GroupSectionImpl;
    args: ImplArgsBundleWithUpdaters<GroupSectionImplArgs, GroupSectionImpl>;
  };

  ImageSection: {
    impl: ImageSectionImpl;
    args: ImplArgsBundleWithUpdaters<ImageSectionImplArgs, ImageSectionImpl>;
  };

  ChartSection: {
    impl: ChartSectionImpl;
    args: ImplArgsBundleWithUpdaters<ChartSectionImplArgs, ChartSectionImpl>;
  };

  DrawSection: {
    impl: DrawSectionImpl;
    args: ImplArgsBundleWithUpdaters<DrawSectionImplArgs, DrawSectionImpl>;
  };

  TextBlockSection: {
    impl: TextBlockSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      TextBlockSectionImplArgs,
      TextBlockSectionImpl
    >;
  };

  PromptSection: {
    impl: PromptSectionImpl;
    args: ImplArgsBundleWithUpdaters<PromptSectionImplArgs, PromptSectionImpl>;
  };

  MetaControlSection: {
    impl: MetaControlSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      MetaControlSectionImplArgs,
      MetaControlSectionImpl
    >;
  };

  SocialSection: {
    impl: SocialSectionImpl;
    args: ImplArgsBundleWithUpdaters<SocialSectionImplArgs, SocialSectionImpl>;
  };

  GlobalVariablesSection: {
    impl: GlobalVariablesSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      GlobalVariablesSectionImplArgs,
      GlobalVariablesSectionImpl
    >;
  };

  CodeSection: {
    impl: CodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<CodeSectionImplArgs, CodeSectionImpl>;
  };

  GenPythonCodeSection: {
    impl: GenPythonCodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      GenPythonCodeSectionImplArgs,
      GenPythonCodeSectionImpl
    >;
  };

  GenPythonMetadataSection: {
    impl: GenPythonMetadataSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      GenPythonMetadataSectionImplArgs,
      GenPythonMetadataSectionImpl
    >;
  };

  TerminalSection: {
    impl: TerminalSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      TerminalSectionImplArgs,
      TerminalSectionImpl
    >;
  };

  IFrameSection: {
    impl: IFrameSectionImpl;
    args: ImplArgsBundleWithUpdaters<IFrameSectionImplArgs, IFrameSectionImpl>;
  };

  ChatSection: {
    impl: ChatSectionImpl;
    args: ImplArgsBundleWithUpdaters<ChatSectionImplArgs, ChatSectionImpl>;
  };

  BrowserSection: {
    impl: BrowserSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BrowserSectionImplArgs,
      BrowserSectionImpl
    >;
  };

  PluginSection: {
    impl: PluginSectionImpl;
    args: ImplArgsBundleWithUpdaters<PluginSectionImplArgs, PluginSectionImpl>;
  };

  BaseCodeObj: {
    impl: BaseCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<BaseCodeObjImplArgs, BaseCodeObjImpl>;
  };

  BaseParamCodeObj: {
    impl: BaseParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseParamCodeObjImplArgs,
      BaseParamCodeObjImpl
    >;
  };

  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseChildlessCodeObjImplArgs,
      BaseChildlessCodeObjImpl
    >;
  };

  BaseParentCodeObj: {
    impl: BaseParentCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseParentCodeObjImplArgs,
      BaseParentCodeObjImpl
    >;
  };

  CodeCallableCodeObj: {
    impl: CodeCallableCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      CodeCallableCodeObjImplArgs,
      CodeCallableCodeObjImpl
    >;
  };

  CodeParamCodeObj: {
    impl: CodeParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      CodeParamCodeObjImplArgs,
      CodeParamCodeObjImpl
    >;
  };

  TextParamCodeObj: {
    impl: TextParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      TextParamCodeObjImplArgs,
      TextParamCodeObjImpl
    >;
  };

  ButtonParamCodeObj: {
    impl: ButtonParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      ButtonParamCodeObjImplArgs,
      ButtonParamCodeObjImpl
    >;
  };

  SliderParamCodeObj: {
    impl: SliderParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      SliderParamCodeObjImplArgs,
      SliderParamCodeObjImpl
    >;
  };

  RotaryParamCodeObj: {
    impl: RotaryParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      RotaryParamCodeObjImplArgs,
      RotaryParamCodeObjImpl
    >;
  };

  SwitchParamCodeObj: {
    impl: SwitchParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      SwitchParamCodeObjImplArgs,
      SwitchParamCodeObjImpl
    >;
  };

  ColorPickerParamCodeObj: {
    impl: ColorPickerParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      ColorPickerParamCodeObjImplArgs,
      ColorPickerParamCodeObjImpl
    >;
  };

  DropdownParamCodeObj: {
    impl: DropdownParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      DropdownParamCodeObjImplArgs,
      DropdownParamCodeObjImpl
    >;
  };

  PasswordParamCodeObj: {
    impl: PasswordParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      PasswordParamCodeObjImplArgs,
      PasswordParamCodeObjImpl
    >;
  };

  TextAreaParamCodeObj: {
    impl: TextAreaParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      TextAreaParamCodeObjImplArgs,
      TextAreaParamCodeObjImpl
    >;
  };

  DropzoneParamCodeObj: {
    impl: DropzoneParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      DropzoneParamCodeObjImplArgs,
      DropzoneParamCodeObjImpl
    >;
  };

  NestedParamCodeObj: {
    impl: NestedParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      NestedParamCodeObjImplArgs,
      NestedParamCodeObjImpl
    >;
  };
};
