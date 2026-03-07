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

const IDSchema = z.string();

export type ObjectValues<T> = T[keyof T];
export const ControlCodeObjTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam",
]);

export const SectionParamCodeObjTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam",
]);

const BaseChildlessCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam",
]);

const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

export const BaseParamCodeObjImplTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "NestedParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam",
]);

const BaseParentCodeObjImplTypeSet = new Set(["CodeCallable", "NestedParam"]);

const BaseParentSectionImplTypeSet = new Set([
  "Code",
  "GenPythonCode",
  "GenPythonMetadata",
  "Group",
  "ListRoot",
]);

const BaseSectionWithParamsImplTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
]);

export const AgentRunStatusEnum = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export const EngineTypeEnum = {
  setta_llm: "setta_llm",
  external_agent: "external_agent",
} as const;

export const TranscriptionTransportModeEnum = {
  auto: "auto",
  file: "file",
  realtime: "realtime",
} as const;

export const AgenticEdgeContextModeEnum = {
  reference_only: "reference_only",
  inline_text: "inline_text",
  summary: "summary",
} as const;

export const AgenticEdgeKindEnum = {
  chat_chat: "chat_chat",
  section_chat: "section_chat",
  chat_section: "chat_section",
} as const;

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

export const StreamingEventTypeEnum = {
  MESSAGE_START: "message_start",
  DELTA: "delta",
  TOOL_CALL_DELTA: "tool_call_delta",
  TOOL_ARGUMENT_PREVIEW_DELTA: "tool_argument_preview_delta",
  TOOL_RESULT: "tool_result",
  MESSAGE_STOP: "message_stop",
  MESSAGE_FINALIZED: "message_finalized",
} as const;

const ToolArgumentPreviewKindEnum = {
  code: "code",
  paramValue: "paramValue",
  callableName: "callableName",
  appSpecPatch: "appSpecPatch",
} as const;

export const ClipboardDataTypeEnum = { Sections: "Sections" } as const;

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
  DateParam: "DateParam",
  TimeParam: "TimeParam",
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

export const DateCalendarWeekStartEnum = {
  sunday: "sunday",
  monday: "monday",
} as const;

export type DateCalendarWeekStart = ObjectValues<
  typeof DateCalendarWeekStartEnum
>;

export const DateControlModeEnum = {
  input: "input",
  calendar: "calendar",
} as const;

export type DateControlMode = ObjectValues<typeof DateControlModeEnum>;

export const DateDisplayFormatEnum = {
  iso: "iso",
  us: "us",
  eu: "eu",
  long: "long",
} as const;

export type DateDisplayFormat = ObjectValues<typeof DateDisplayFormatEnum>;

export const DateSelectionModeEnum = {
  single: "single",
  multiple: "multiple",
} as const;

export type DateSelectionMode = ObjectValues<typeof DateSelectionModeEnum>;

export const DropzoneModeEnum = {
  STATEFUL: "STATEFUL",
  STATELESS: "STATELESS",
} as const;

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

export const ParameterPassingStyleEnum = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;

export const TextParamInputUITypeEnum = {
  plain: "plain",
  time: "time",
  date: "date",
} as const;

export type TextParamInputUIType = ObjectValues<
  typeof TextParamInputUITypeEnum
>;

export const TimeControlModeEnum = {
  input: "input",
  display: "display",
} as const;

export type TimeControlMode = ObjectValues<typeof TimeControlModeEnum>;

export const TimeDisplayFontEnum = {
  clock: "clock",
  monospace: "monospace",
  system: "system",
} as const;

export type TimeDisplayFont = ObjectValues<typeof TimeDisplayFontEnum>;

export const TimeDisplayFormatEnum = {
  twenty_four_hour: "twenty_four_hour",
  twelve_hour: "twelve_hour",
} as const;

export type TimeDisplayFormat = ObjectValues<typeof TimeDisplayFormatEnum>;

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
  TaskBoard: "TaskBoard",
  Spreadsheet: "Spreadsheet",
} as const;

export type SectionType = ObjectValues<typeof SectionTypeEnum>;

export const DependencyKeyTypeEnum = {
  Section: "Section",
  SectionParam: "SectionParam",
} as const;

export const DependencyValueTypeEnum = {
  Literal: "Literal",
  Binary: "Binary",
  FileRead: "FileRead",
} as const;

export const ClaudeSettingsSourceEnum = {
  user: "user",
  project: "project",
  local: "local",
} as const;

export const ExternalAgentRunModeEnum = {
  mcp: "mcp",
  server: "server",
  sdk: "sdk",
  app_server: "app_server",
} as const;

export const ExternalAgentSettingsModeEnum = {
  read_only: "read_only",
  managed_local: "managed_local",
  managed_project: "managed_project",
  explicit_path: "explicit_path",
} as const;

export const ExternalAgentToolTypeEnum = {
  claude_code: "claude_code",
  codex: "codex",
  opencode: "opencode",
  plugin: "plugin",
} as const;

export const ExternalAgentWorkingDirStrategyEnum = {
  project_root: "project_root",
  temp_dir: "temp_dir",
  custom: "custom",
} as const;

export const BrowserAreaViewModeEnum = {
  list: "list",
  thumbnail: "thumbnail",
  carousel: "carousel",
} as const;

export type BrowserAreaViewMode = ObjectValues<typeof BrowserAreaViewModeEnum>;

const ChatDictationModeEnum = {
  auto: "auto",
  browser: "browser",
  provider: "provider",
} as const;

export const ChatPermissionModeEnum = {
  minimal: "minimal",
  yolo: "yolo",
  config_toml_custom: "config_toml_custom",
} as const;

export type ChatPermissionMode = ObjectValues<typeof ChatPermissionModeEnum>;

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

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

export const ListRootViewModeEnum = {
  default: "default",
  task_list: "task_list",
  kanban: "kanban",
} as const;

export type ListRootViewMode = ObjectValues<typeof ListRootViewModeEnum>;

export const PromptFormatEnum = { Jinja: "Jinja" } as const;

export const SpreadsheetGridDensityEnum = {
  compact: "compact",
  comfortable: "comfortable",
} as const;

export type SpreadsheetGridDensity = ObjectValues<
  typeof SpreadsheetGridDensityEnum
>;

export const TaskBoardViewModeEnum = {
  task_list: "task_list",
  kanban: "kanban",
} as const;

export type TaskBoardViewMode = ObjectValues<typeof TaskBoardViewModeEnum>;

export const TextBlockDisplayModeEnum = {
  Render: "Render",
  Edit: "Edit",
} as const;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;

const SectionSizeModeEnum = { auto: "auto" } as const;

const MCPServerRuntimeStateEnum = {
  connected: "connected",
  connecting: "connecting",
  retrying: "retrying",
  error: "error",
  disabled: "disabled",
  unknown: "unknown",
} as const;

const SettaBackendLogEventSeverityEnum = {
  critical: "critical",
  error: "error",
  warning: "warning",
  info: "info",
} as const;

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

const SectionCodegenModeEnum = {
  inherit: "inherit",
  include: "include",
  exclude: "exclude",
} as const;

const SectionRepresentationModeEnum = {
  expression: "expression",
  file_path: "file_path",
  file_read: "file_read",
} as const;

const WatchCodeCallableKindEnum = {
  function: "function",
  async_function: "async_function",
  class_init: "class_init",
} as const;

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
  GET_LAUNCHER_STATUS: "/launcherStatus",
  SETUP_LAUNCHER: "/setupLauncher",
  REPAIR_LAUNCHER: "/repairLauncher",
  REMOVE_LAUNCHER: "/removeLauncher",
  UPDATE_LAUNCHER: "/updateLauncher",
  GET_LAUNCHER_RECENT_WORKSPACES: "/launcherRecentWorkspaces",
  ADD_LAUNCHER_RECENT_WORKSPACE: "/addLauncherRecentWorkspace",
  REMOVE_LAUNCHER_RECENT_WORKSPACE: "/removeLauncherRecentWorkspace",
  PIN_LAUNCHER_RECENT_WORKSPACE: "/pinLauncherRecentWorkspace",
  GET_LAUNCHER_FILESYSTEM_ROOTS: "/launcherFilesystemRoots",
  LIST_LAUNCHER_DIRECTORY: "/listLauncherDirectory",
  OPEN_LAUNCHER_WORKSPACE: "/openLauncherWorkspace",
  GET_MCP_SERVER_RUNTIME_STATUS: "/mcpServerRuntimeStatus",
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
  CREATE_WORKSPACE_LAUNCH_INTENT: "/createWorkspaceLaunchIntent",
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
  CHECK_WORKSPACE_INITIALIZED: "/checkWorkspaceInitialized",
  LOAD_ARTIFACT_FROM_DISK: "/loadArtifactFromDisk",
  GET_ATTACHMENT_DOWNLOAD_URL: "/getAttachmentDownloadUrl",
  GET_ATTACHMENT_DOWNLOAD_URLS: "/getAttachmentDownloadUrls",
  ATTACHMENT_DOWNLOAD: "/attachments/{token}",
  RESTART_LANGUAGE_SERVER: "/restartLanguageServer",
  GET_NOTIFICATIONS: "/getNotifications",
  DELETE_NOTIFICATION: "/deleteNotification",
  GET_LLM_RESPONSE: "/getLLMResponse",
  START_TRANSCRIPTION_SESSION: "/startTranscriptionSession",
  APPEND_TRANSCRIPTION_AUDIO: "/appendTranscriptionAudio",
  STOP_TRANSCRIPTION_SESSION: "/stopTranscriptionSession",
  CANCEL_TRANSCRIPTION_SESSION: "/cancelTranscriptionSession",
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
  GET_TRANSCRIPTION_PROFILES: "/getTranscriptionProfiles",
  CREATE_TRANSCRIPTION_PROFILE: "/createTranscriptionProfile",
  UPDATE_TRANSCRIPTION_PROFILE: "/updateTranscriptionProfile",
  DELETE_TRANSCRIPTION_PROFILE: "/deleteTranscriptionProfile",
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
  SET_VIEW_MODE_SORT_ORDER: "/setViewModeSortOrder",
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
  UPSERT_APP_GEN_CUSTOM_SKILL: "/upsertAppGenCustomSkill",
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
  SET_SECTION_VARIANT_SORT_ORDER: "/setSectionVariantSortOrder",
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
  SET_TEXT_BLOCK_MASTER_FONT_SIZE: "/setTextBlockMasterFontSize",
  SET_CALLABLE_HIDE_PARAMS: "/setCallableHideParams",
  SET_SECTION_HIDE_UNPINNED_PARAMS: "/setSectionHideUnpinnedParams",
  SET_SECTION_PINNED_PARAMS: "/setSectionPinnedParams",
  SET_SECTION_COLUMN_WIDTH: "/setSectionColumnWidth",
  SET_PARENT_DEFAULT_CHILD_SECTION_TYPE: "/setParentDefaultChildSectionType",
  SET_LIST_ROOT_VIEW_MODE: "/setListRootViewMode",
  SET_TASK_BOARD_SECTION_STATE: "/setTaskBoardSectionState",
  SET_SPREADSHEET_FILE_PATH: "/setSpreadsheetFilePath",
  SET_SPREADSHEET_SECTION_SETTINGS: "/setSpreadsheetSectionSettings",
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
  GET_FILE_BROWSER_FILE_CONTENT: "/getFileBrowserFileContent",
  GET_FILE_BROWSER_FILE_STAT: "/getFileBrowserFileStat",
  WRITE_FILE_BROWSER_FILE_CONTENT: "/writeFileBrowserFileContent",
  TRANSFER_FILE_BROWSER_ENTRY: "/transferFileBrowserEntry",
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

export const BrowserSearchScopeEnum = {
  recursive: "recursive",
  local: "local",
} as const;

export const TaskBoardRecurringMonthEnum = {
  january: "january",
  february: "february",
  march: "march",
  april: "april",
  may: "may",
  june: "june",
  july: "july",
  august: "august",
  september: "september",
  october: "october",
  november: "november",
  december: "december",
} as const;

export type TaskBoardRecurringMonth = ObjectValues<
  typeof TaskBoardRecurringMonthEnum
>;

export const TaskBoardRecurringWeekdayEnum = {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
} as const;

export type TaskBoardRecurringWeekday = ObjectValues<
  typeof TaskBoardRecurringWeekdayEnum
>;

export const TaskBoardTaskRecurrenceEnum = {
  none: "none",
  hourly: "hourly",
  daily: "daily",
  specified_days: "specified_days",
  specified_months: "specified_months",
  specified_years: "specified_years",
} as const;

export type TaskBoardTaskRecurrence = ObjectValues<
  typeof TaskBoardTaskRecurrenceEnum
>;

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
} as const;

const MetaControlSizeModeEnum = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
} as const;

export const PanOnScrollModeEnum = {
  free: "free",
  vertical: "vertical",
  horizontal: "horizontal",
} as const;

export const RenameRefactorModeEnum = {
  ALWAYS_ASK: "ALWAYS_ASK",
  ALWAYS_RENAME: "ALWAYS_RENAME",
  NEVER_RENAME: "NEVER_RENAME",
} as const;

export type RenameRefactorMode = ObjectValues<typeof RenameRefactorModeEnum>;

const RunSnapshotModeEnum = {
  always: "always",
  ephemeral: "ephemeral",
  never: "never",
} as const;

export const SelectionModeEnum = { partial: "partial", full: "full" } as const;

const DeploymentTypeEnum = { share: "share", app: "app" } as const;

export const WebsocketConnectionTypeEnum = {
  CLI: "CLI",
  SERVER: "SERVER",
  PYTHON_SCRIPT: "PYTHON_SCRIPT",
  FRONTEND: "FRONTEND",
} as const;

export const WebsocketMsgTypeForBackendEnum = {
  CurrentAddressUpdate: "CurrentAddressUpdate",
  RealtimeUIChange: "RealtimeUIChange",
  RealtimeDependencyEvent: "RealtimeDependencyEvent",
  UISettingRevealResult: "UISettingRevealResult",
} as const;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  FrontendIdentity: "FrontendIdentity",
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
  UISettingReveal: "UISettingReveal",
  AgentProfilesUpdated: "AgentProfilesUpdated",
  PromptTemplatesUpdated: "PromptTemplatesUpdated",
  ExternalAgentConfigsUpdated: "ExternalAgentConfigsUpdated",
  EngineConfigsUpdated: "EngineConfigsUpdated",
  TranscriptionProfilesUpdated: "TranscriptionProfilesUpdated",
} as const;

const SaveConflictStrategyEnum = {
  skip: "skip",
  backup: "backup",
  overwrite: "overwrite",
} as const;

const BrushStrokeSchema = z.object({
  strokeStyle: z.string(),
  lineWidth: z.number(),
  lineCap: z.enum(DrawAreaBrushShapeEnum),
  points: z
    .array(z.union([z.tuple([z.number(), z.number()]), z.literal("BREAK")]))
    .default(() => []),
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

export function createBrushStroke(
  options: Partial<BrushStroke> = {},
): BrushStroke {
  return BrushStrokeSchema.parse(options);
}

const BrushStrokeArtifactSchema = z.object({
  type: z.literal("BrushStroke").default(ArtifactTypeEnum.BrushStroke),
  id: z.string().default(create_json_artifact_id),
  value: BrushStrokeSchema,
});

export type BrushStrokeArtifact = z.infer<typeof BrushStrokeArtifactSchema>;

export function createBrushStrokeArtifact(
  options: Partial<BrushStrokeArtifact> = {},
): BrushStrokeArtifact {
  return BrushStrokeArtifactSchema.parse(options);
}

const BrushStrokeMappingSchema = z.record(
  z.string(),
  BrushStrokeArtifactSchema,
);

export type BrushStrokeMapping = z.infer<typeof BrushStrokeMappingSchema>;

const CanvasPointSchema = z.tuple([z.number(), z.number()]);

export type CanvasPoint = z.infer<typeof CanvasPointSchema>;

const ChartDataSchema = z.record(
  z.string(),
  z.array(z.union([z.string(), z.number()])),
);

export type ChartData = z.infer<typeof ChartDataSchema>;

const ChartDataArtifactSchema = z.object({
  type: z.literal("ChartData").default(ArtifactTypeEnum.ChartData),
  id: z.string().default(create_csv_artifact_id),
  value: z.record(z.string(), z.array(z.union([z.string(), z.number()]))),
});

export type ChartDataArtifact = z.infer<typeof ChartDataArtifactSchema>;

const ChartDataMappingSchema = z.record(z.string(), ChartDataArtifactSchema);

export type ChartDataMapping = z.infer<typeof ChartDataMappingSchema>;

const BrushStrokeWithTransformSchema = z.object({
  strokeStyle: z.string(),
  lineWidth: z.number(),
  lineCap: z.enum(DrawAreaBrushShapeEnum),
  points: z
    .array(z.union([z.tuple([z.number(), z.number()]), z.literal("BREAK")]))
    .default(() => []),
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

const DrawAreaLayerItemTransformSchema = z.object({
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
  eraserStrokes: z.array(BrushStrokeWithTransformSchema).default(() => []),
});

type DrawAreaLayerItemTransform = z.infer<
  typeof DrawAreaLayerItemTransformSchema
>;

export function createDrawAreaLayerItemTransform(
  options: Partial<DrawAreaLayerItemTransform> = {},
): DrawAreaLayerItemTransform {
  return DrawAreaLayerItemTransformSchema.parse(options);
}

const DrawAreaLayerItemTransformArtifactSchema = z.object({
  type: z
    .literal("DrawAreaLayerItemTransform")
    .default(ArtifactTypeEnum.DrawAreaLayerItemTransform),
  id: z.string().default(create_json_artifact_id),
  value: DrawAreaLayerItemTransformSchema,
});

export type DrawAreaLayerItemTransformArtifact = z.infer<
  typeof DrawAreaLayerItemTransformArtifactSchema
>;

export function createDrawAreaLayerItemTransformArtifact(
  options: Partial<DrawAreaLayerItemTransformArtifact> = {},
): DrawAreaLayerItemTransformArtifact {
  return DrawAreaLayerItemTransformArtifactSchema.parse(options);
}

const DrawAreaLayerItemTransformMappingSchema = z.record(
  z.string(),
  DrawAreaLayerItemTransformArtifactSchema,
);

export type DrawAreaLayerItemTransformMapping = z.infer<
  typeof DrawAreaLayerItemTransformMappingSchema
>;

const DrawAreaTransformSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export type DrawAreaTransform = z.infer<typeof DrawAreaTransformSchema>;

const BinaryContentRefSchema = z.object({
  contentId: z.string(),
  byteLength: z.int(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  sha256: z.union([z.string(), z.null()]).default(null),
});

export type BinaryContentRef = z.infer<typeof BinaryContentRefSchema>;

const FileArtifactSchema = z.object({
  type: z.literal("File").default(ArtifactTypeEnum.File),
  id: z.string().default(create_file_artifact_id),
  value: BinaryContentRefSchema,
});

export type FileArtifact = z.infer<typeof FileArtifactSchema>;

const ImageArtifactSchema = z.object({
  type: z.literal("Image").default(ArtifactTypeEnum.Image),
  id: z.string().default(create_png_artifact_id),
  value: BinaryContentRefSchema,
});

export type ImageArtifact = z.infer<typeof ImageArtifactSchema>;

const ImageMappingSchema = z.record(z.string(), ImageArtifactSchema);

export type ImageMapping = z.infer<typeof ImageMappingSchema>;

const APIKeysSchema = z.record(z.string(), z.string());

export type APIKeys = z.infer<typeof APIKeysSchema>;

const MessageTextContentSchema = z.object({
  type: z.literal("text").default("text" as const),
  text: z.string(),
});

export type MessageTextContent = z.infer<typeof MessageTextContentSchema>;

export function createMessageTextContent(
  options: Partial<MessageTextContent> = {},
): MessageTextContent {
  return MessageTextContentSchema.parse(options);
}

const MessageImageUrlSchema = z.object({
  url: z.string(),
  detail: z.union([z.literal(["auto", "low", "high"]), z.null()]).default(null),
});

const MessageImageUrlContentSchema = z.object({
  type: z.literal("image_url").default("image_url" as const),
  image_url: MessageImageUrlSchema,
});

export type MessageImageUrlContent = z.infer<
  typeof MessageImageUrlContentSchema
>;

const MessageThinkingContentSchema = z.object({
  type: z.literal("thinking").default("thinking" as const),
  thinking: z.string().default("" as const),
  summary: z.union([z.string(), z.null()]).default("" as const),
  signature: z.union([z.string(), z.null()]).default("" as const),
});

export type MessageThinkingContent = z.infer<
  typeof MessageThinkingContentSchema
>;

export function createMessageThinkingContent(
  options: Partial<MessageThinkingContent> = {},
): MessageThinkingContent {
  return MessageThinkingContentSchema.parse(options);
}

const ChatFileAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  size: z.union([z.int(), z.null()]).default(null),
});

export type ChatFileAttachment = z.infer<typeof ChatFileAttachmentSchema>;

const SystemChatMessageSchema = z.object({
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
    .default(() => []),
  attachments: z.array(ChatFileAttachmentSchema).default(() => []),
});

const ToolCallFunctionSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.any()).default({}),
});

type ToolCallFunction = z.infer<typeof ToolCallFunctionSchema>;

export function createToolCallFunction(
  options: Partial<ToolCallFunction> = {},
): ToolCallFunction {
  return ToolCallFunctionSchema.parse(options);
}

const ToolCallSchema = z.object({
  id: z.string().default(create_new_id),
  type: z.literal("function").default("function" as const),
  function: ToolCallFunctionSchema,
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export function createToolCall(options: Partial<ToolCall> = {}): ToolCall {
  return ToolCallSchema.parse(options);
}

const AssistantChatMessageSchema = z.object({
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
    .default(() => []),
  attachments: z.array(ChatFileAttachmentSchema).default(() => []),
  tool_calls: z.union([z.array(ToolCallSchema), z.null()]).default(null),
});

export type AssistantChatMessage = z.infer<typeof AssistantChatMessageSchema>;

export function createAssistantChatMessage(
  options: Partial<AssistantChatMessage> = {},
): AssistantChatMessage {
  return AssistantChatMessageSchema.parse(options);
}

const UserChatMessageSchema = z.object({
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
    .default(() => []),
  attachments: z.array(ChatFileAttachmentSchema).default(() => []),
});

type UserChatMessage = z.infer<typeof UserChatMessageSchema>;

export function createUserChatMessage(
  options: Partial<UserChatMessage> = {},
): UserChatMessage {
  return UserChatMessageSchema.parse(options);
}

const AnnotationsSchema = z.object({
  audience: z
    .union([z.array(z.literal(["user", "assistant"])), z.null()])
    .default(null),
  priority: z.union([z.number(), z.null()]).default(null),
});

const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  text: z.string(),
});

const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  blob: z.string(),
});

const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
  meta: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

const ToolReferenceContentSchema = z.object({
  type: z.literal("tool_reference").default("tool_reference" as const),
  tool_name: z.string(),
});

const ToolChatMessageSchema = z.object({
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
    .default(() => []),
  is_error: z.boolean().default(false),
  started_at: z.iso.datetime().default(get_now_timestamp),
  completed_at: z.union([z.iso.datetime(), z.null()]).default(null),
});

export type ToolChatMessage = z.infer<typeof ToolChatMessageSchema>;

export function createToolChatMessage(
  options: Partial<ToolChatMessage> = {},
): ToolChatMessage {
  return ToolChatMessageSchema.parse(options);
}

const BaseChatMessageUnionSchema = z.union([
  SystemChatMessageSchema,
  AssistantChatMessageSchema,
  UserChatMessageSchema,
  ToolChatMessageSchema,
]);

export type BaseChatMessageUnion = z.infer<typeof BaseChatMessageUnionSchema>;

const MessageStartEventSchema = z.object({
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

const MessageTextDeltaSchema = z.object({
  type: z.literal("text_delta").default("text_delta" as const),
  index: z.int(),
  text: z.string(),
});

const MessageThinkingDeltaSchema = z.object({
  type: z.literal("thinking_delta").default("thinking_delta" as const),
  index: z.int(),
  thinking: z.string(),
  summary: z.union([z.string(), z.null()]).default(null),
  signature: z.union([z.string(), z.null()]).default(null),
});

const MessageDeltaEventSchema = z.object({
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

const ToolCallDeltaEventSchema = z.object({
  type: z
    .literal("tool_call_delta")
    .default(StreamingEventTypeEnum.TOOL_CALL_DELTA),
  message_id: z.string(),
  tool_call_id: z.string(),
  arguments_delta: z.string(),
  tool_name: z.union([z.string(), z.null()]).default(null),
});

export type ToolCallDeltaEvent = z.infer<typeof ToolCallDeltaEventSchema>;

const ToolResultEventSchema = z.object({
  type: z.literal("tool_result").default(StreamingEventTypeEnum.TOOL_RESULT),
  result: ToolChatMessageSchema,
});

export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;

const ToolArgumentPreviewDeltaEventSchema = z.object({
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

const MessageStopEventSchema = z.object({
  type: z.literal("message_stop").default(StreamingEventTypeEnum.MESSAGE_STOP),
  message_id: z.string(),
});

const MessageFinalizedEventSchema = z.object({
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

const LineChartSettingsSchema = z.object({
  type: z.literal("line").default(ChartTypeEnum.line),
  xAxisColumn: z.union([z.string(), z.null()]).default(null),
  secondYAxisColumns: z.array(z.string()).default(() => []),
  xAxisLog: z.boolean().default(false),
  y1AxisLog: z.boolean().default(false),
  y2AxisLog: z.boolean().default(false),
});

export type LineChartSettings = z.infer<typeof LineChartSettingsSchema>;

function createLineChartSettings(
  options: Partial<LineChartSettings> = {},
): LineChartSettings {
  return LineChartSettingsSchema.parse(options);
}

const ScatterChartSettingsSchema = z.object({
  type: z.literal("scatter").default(ChartTypeEnum.scatter),
  xAxisColumn: z.union([z.string(), z.null()]).default(null),
  categoryColumn: z.union([z.string(), z.null()]).default(null),
  xAxisLog: z.boolean().default(false),
  yAxisLog: z.boolean().default(false),
});

export type ScatterChartSettings = z.infer<typeof ScatterChartSettingsSchema>;

const BaseChartSettingsUnionSchema = z.union([
  LineChartSettingsSchema,
  ScatterChartSettingsSchema,
]);

export type BaseChartSettingsUnion = z.infer<
  typeof BaseChartSettingsUnionSchema
>;

const BaseChartSettingsUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "type",
  [LineChartSettingsSchema, ScatterChartSettingsSchema],
);

type BaseChartSettingsUnionWithDiscriminator = z.infer<
  typeof BaseChartSettingsUnionWithDiscriminatorSchema
>;

export function createBaseChartSettingsUnionWithDiscriminator(
  options: Partial<BaseChartSettingsUnionWithDiscriminator> = {},
): BaseChartSettingsUnionWithDiscriminator {
  return BaseChartSettingsUnionWithDiscriminatorSchema.parse(options);
}

const ChatSectionBranchSchema = z.object({
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default(() => []),
  createdAt: z.int().default(0),
  parentBranchId: z.union([IDSchema, z.null()]).default(null),
  branchFromMessageId: z.union([IDSchema, z.null()]).default(null),
});

export type ChatSectionBranch = z.infer<typeof ChatSectionBranchSchema>;

const CodeFileBindingSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
  autoBinding: z.boolean().default(false),
});

const ColorPickerChoiceSchema = z.object({
  color: z.string(),
  description: z.string(),
});

export type ColorPickerChoice = z.infer<typeof ColorPickerChoiceSchema>;

function createColorPickerChoice(
  options: Partial<ColorPickerChoice> = {},
): ColorPickerChoice {
  return ColorPickerChoiceSchema.parse(options);
}

const TaskBoardColumnSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default("" as const),
  color: z.string().default("#3b82f6" as const),
  sortIndex: z.int().default(0),
});

export type TaskBoardColumn = z.infer<typeof TaskBoardColumnSchema>;

export function createTaskBoardColumn(
  options: Partial<TaskBoardColumn> = {},
): TaskBoardColumn {
  return TaskBoardColumnSchema.parse(options);
}

const CodeSectionDiagnosticsIgnoreStateSchema = z.object({
  muted: z.boolean().default(false),
  suppressedCodes: z.array(z.union([z.string(), z.int()])).default(() => []),
});

type CodeSectionDiagnosticsIgnoreState = z.infer<
  typeof CodeSectionDiagnosticsIgnoreStateSchema
>;

function createCodeSectionDiagnosticsIgnoreState(
  options: Partial<CodeSectionDiagnosticsIgnoreState> = {},
): CodeSectionDiagnosticsIgnoreState {
  return CodeSectionDiagnosticsIgnoreStateSchema.parse(options);
}

const EdgePortSchema = z.object({
  id: IDSchema.default(create_new_id),
  accessor: z.string().default("" as const),
});

const TypeErrorIgnoreStateSchema = z.object({
  callable: z.boolean().default(false),
  params: z.record(IDSchema, z.boolean()).default({}),
});

type TypeErrorIgnoreState = z.infer<typeof TypeErrorIgnoreStateSchema>;

function createTypeErrorIgnoreState(
  options: Partial<TypeErrorIgnoreState> = {},
): TypeErrorIgnoreState {
  return TypeErrorIgnoreStateSchema.parse(options);
}

const DrawAreaLayerItemSchema = z.object({
  type: z
    .literal(["Image", "BrushStroke"])
    .default(ArtifactTypeEnum.BrushStroke),
  dataPath: z.string(),
  transformId: z.string(),
});

export type DrawAreaLayerItem = z.infer<typeof DrawAreaLayerItemSchema>;

export function createDrawAreaLayerItem(
  options: Partial<DrawAreaLayerItem> = {},
): DrawAreaLayerItem {
  return DrawAreaLayerItemSchema.parse(options);
}

const DrawAreaLayerSchema = z.object({
  name: z.string().default(generate_memorable_string),
  elements: z.array(DrawAreaLayerItemSchema).default(() => []),
  visible: z.boolean().default(true),
  layerOpacity: z.number().default(1),
});

export type DrawAreaLayer = z.infer<typeof DrawAreaLayerSchema>;

export function createDrawAreaLayer(
  options: Partial<DrawAreaLayer> = {},
): DrawAreaLayer {
  return DrawAreaLayerSchema.parse(options);
}

const BrowserSavedSearchTypeFiltersSchema = z.object({
  image: z.boolean().default(true),
  video: z.boolean().default(true),
  audio: z.boolean().default(true),
  text: z.boolean().default(true),
  data: z.boolean().default(true),
});

export type BrowserSavedSearchTypeFilters = z.infer<
  typeof BrowserSavedSearchTypeFiltersSchema
>;

function createBrowserSavedSearchTypeFilters(
  options: Partial<BrowserSavedSearchTypeFilters> = {},
): BrowserSavedSearchTypeFilters {
  return BrowserSavedSearchTypeFiltersSchema.parse(options);
}

const BrowserSavedSearchSchema = z.object({
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

const SectionSizeSchema = z.object({
  width: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  height: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
});

export type SectionSize = z.infer<typeof SectionSizeSchema>;

export function createSectionSize(
  options: Partial<SectionSize> = {},
): SectionSize {
  return SectionSizeSchema.parse(options);
}

const TaskBoardTaskSchema = z.object({
  id: IDSchema.default(create_new_id),
  title: z.string().default("" as const),
  description: z.string().default("" as const),
  completed: z.boolean().default(false),
  columnId: z.union([IDSchema, z.null()]).default(null),
  dueDateIso: z.string().default("" as const),
  recurrence: z
    .enum(TaskBoardTaskRecurrenceEnum)
    .default(TaskBoardTaskRecurrenceEnum.none),
  recurrenceDays: z
    .array(z.enum(TaskBoardRecurringWeekdayEnum))
    .default(() => []),
  recurrenceMonths: z
    .array(z.enum(TaskBoardRecurringMonthEnum))
    .default(() => []),
  recurrenceYears: z.array(z.int()).default(() => []),
  sortIndex: z.int().default(0),
});

export type TaskBoardTask = z.infer<typeof TaskBoardTaskSchema>;

export function createTaskBoardTask(
  options: Partial<TaskBoardTask> = {},
): TaskBoardTask {
  return TaskBoardTaskSchema.parse(options);
}

const SharedModifierSchema = z.object({
  actionMode: z.enum(ButtonActionModeEnum).optional(),
  activeBranchId: z.union([IDSchema, z.null()]).optional(),
  activeLayerIdx: z.int().optional(),
  activeSheet: z.union([z.string(), z.null()]).optional(),
  agentProfileId: z.union([IDSchema, z.null()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).optional(),
  autoReloadOnExternalChange: z.boolean().optional(),
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
  columns: z.array(TaskBoardColumnSchema).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  data: z.record(z.string(), z.any()).optional(),
  dataPath: z.string().optional(),
  dateCalendarWeekStart: z.enum(DateCalendarWeekStartEnum).optional(),
  dateControlMode: z.enum(DateControlModeEnum).optional(),
  dateDisplayFormat: z.enum(DateDisplayFormatEnum).optional(),
  dateIncludesTime: z.boolean().optional(),
  dateSelectionMode: z.enum(DateSelectionModeEnum).optional(),
  defaultChildSectionType: z.enum(SectionTypeEnum).optional(),
  defaultVal: z.string().optional(),
  density: z.enum(SpreadsheetGridDensityEnum).optional(),
  description: z.string().optional(),
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreStateSchema.optional(),
  dictationMode: z.enum(ChatDictationModeEnum).optional(),
  drawThrottleDelay: z.int().optional(),
  edgeInputParams: z.array(IDSchema).optional(),
  edgeOutputPorts: z.array(EdgePortSchema).optional(),
  engineConfigId: z.union([IDSchema, z.null()]).optional(),
  eraserBrushSize: z.int().optional(),
  filePath: z.string().optional(),
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
  masterFontSizePx: z.number().optional(),
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
  permissionMode: z.enum(ChatPermissionModeEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  placeholder: z.string().optional(),
  pluginId: z.string().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  readOnly: z.boolean().optional(),
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
  searchEnabled: z.boolean().optional(),
  selectedParams: z.array(IDSchema).optional(),
  showRowNumbers: z.boolean().optional(),
  showSectionTitle: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  step: z.union([z.number(), z.int()]).optional(),
  styleColor: z.union([z.string(), z.null()]).optional(),
  tagColor: z.union([z.string(), z.null()]).optional(),
  tasks: z.array(TaskBoardTaskSchema).optional(),
  template: z.string().optional(),
  text: z.string().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  thinking: z.boolean().optional(),
  timeControlMode: z.enum(TimeControlModeEnum).optional(),
  timeDisplayFont: z.enum(TimeDisplayFontEnum).optional(),
  timeDisplayFormat: z.enum(TimeDisplayFormatEnum).optional(),
  timeDisplayScale: z.number().optional(),
  timeDisplayTransparent: z.boolean().optional(),
  toolCallArguments: z.record(z.string(), z.string()).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  transcriptionProfileId: z.union([IDSchema, z.null()]).optional(),
  typeAnnotation: z.string().optional(),
  typesColumnWidth: z.union([z.number(), z.null()]).optional(),
  uiType: z.enum(TextParamInputUITypeEnum).optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  viewMode: z
    .union([
      z.enum(BrowserAreaViewModeEnum),
      z.enum(ListRootViewModeEnum),
      z.enum(TaskBoardViewModeEnum),
    ])
    .optional(),
  waitingForResponse: z.boolean().optional(),
});

type SharedModifier = z.infer<typeof SharedModifierSchema>;

function createSharedModifier(
  options: Partial<SharedModifier> = {},
): SharedModifier {
  return SharedModifierSchema.parse(options);
}

const CoreSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  displayName: z.string().default("" as const),
  variants: z.array(IDSchema).default(() => []),
  defaultVariant: z.union([IDSchema, z.null()]).default(null),
  sharedModifier: SharedModifierSchema.default(createSharedModifier),
  unsharedKeys: z
    .array(
      z.literal([
        "actionMode",
        "activeBranchId",
        "activeLayerIdx",
        "activeSheet",
        "agentProfileId",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "attachedTerminalSectionId",
        "autoReloadOnExternalChange",
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
        "columns",
        "configLanguage",
        "coreNameEditable",
        "coreNameType",
        "data",
        "dataPath",
        "dateCalendarWeekStart",
        "dateControlMode",
        "dateDisplayFormat",
        "dateIncludesTime",
        "dateSelectionMode",
        "defaultChildSectionType",
        "defaultVal",
        "density",
        "description",
        "diagnosticsIgnoreState",
        "dictationMode",
        "drawThrottleDelay",
        "edgeInputParams",
        "edgeOutputPorts",
        "engineConfigId",
        "eraserBrushSize",
        "filePath",
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
        "masterFontSizePx",
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
        "permissionMode",
        "pinnedParams",
        "placeholder",
        "pluginId",
        "positionAndSizeLocked",
        "readOnly",
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
        "searchEnabled",
        "selectedParams",
        "showRowNumbers",
        "showSectionTitle",
        "size",
        "step",
        "styleColor",
        "tagColor",
        "tasks",
        "template",
        "text",
        "textDisplayMode",
        "thinking",
        "timeControlMode",
        "timeDisplayFont",
        "timeDisplayFormat",
        "timeDisplayScale",
        "timeDisplayTransparent",
        "toolCallArguments",
        "topLevelParamId",
        "transcriptionProfileId",
        "type",
        "typeAnnotation",
        "typesColumnWidth",
        "uiType",
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

export function createCore(options: Partial<Core> = {}): Core {
  return CoreSchema.parse(options);
}

const CallableSectionImplSchema = z.object({
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
  pinnedParams: z.array(IDSchema).default(() => []),
  selectedParams: z.array(IDSchema).default(() => []),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  callable: z.union([IDSchema, z.null()]).default(null),
  hideParams: z.boolean().default(false),
});

type CallableSectionImpl = z.infer<typeof CallableSectionImplSchema>;

export function createCallableSectionImpl(
  defaults: UserDefaultCallableSectionImpl,
  overrides: Partial<CallableSectionImpl> = {},
): CallableSectionImpl {
  return CallableSectionImplSchema.parse({ ...defaults, ...overrides });
}

const DictSectionImplSchema = z.object({
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
  pinnedParams: z.array(IDSchema).default(() => []),
  selectedParams: z.array(IDSchema).default(() => []),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default(() => []),
  jsonSourceMissing: z.boolean().default(false),
});

type DictSectionImpl = z.infer<typeof DictSectionImplSchema>;

export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return DictSectionImplSchema.parse({ ...defaults, ...overrides });
}

const ListRootSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
  defaultChildSectionType: z
    .enum(SectionTypeEnum)
    .default(SectionTypeEnum.Callable),
  viewMode: z.enum(ListRootViewModeEnum).default(ListRootViewModeEnum.default),
});

type ListRootSectionImpl = z.infer<typeof ListRootSectionImplSchema>;

export function createListRootSectionImpl(
  defaults: UserDefaultListRootSectionImpl,
  overrides: Partial<ListRootSectionImpl> = {},
): ListRootSectionImpl {
  return ListRootSectionImplSchema.parse({ ...defaults, ...overrides });
}

const GroupSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
  isHorizontalOrientation: z.boolean().default(false),
  overflowMode: z.boolean().default(false),
  defaultChildSectionType: z
    .enum(SectionTypeEnum)
    .default(SectionTypeEnum.Callable),
});

type GroupSectionImpl = z.infer<typeof GroupSectionImplSchema>;

const ImageSectionImplSchema = z.object({
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

type ImageSectionImpl = z.infer<typeof ImageSectionImplSchema>;

const ChartSectionImplSchema = z.object({
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

type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

const DrawSectionImplSchema = z.object({
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
  layers: z.array(DrawAreaLayerSchema).default(() => []),
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
  colorChoices: z.array(ColorPickerChoiceSchema).default(() => []),
});

type DrawSectionImpl = z.infer<typeof DrawSectionImplSchema>;

const TextBlockSectionImplSchema = z.object({
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
  masterFontSizePx: z.number().default(14.0),
  headingAsSectionName: z.boolean().default(false),
  metaControlStyle: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

type TextBlockSectionImpl = z.infer<typeof TextBlockSectionImplSchema>;

export function createTextBlockSectionImpl(
  defaults: UserDefaultTextBlockSectionImpl,
  overrides: Partial<TextBlockSectionImpl> = {},
): TextBlockSectionImpl {
  return TextBlockSectionImplSchema.parse({ ...defaults, ...overrides });
}

const PromptSectionImplSchema = z.object({
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
  missingVariables: z.array(z.string()).default(() => []),
  renderError: z.union([z.string(), z.null()]).default(null),
});

type PromptSectionImpl = z.infer<typeof PromptSectionImplSchema>;

const MetaControlSectionImplSchema = z.object({
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

type MetaControlSectionImpl = z.infer<typeof MetaControlSectionImplSchema>;

const SocialSectionImplSchema = z.object({
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

type SocialSectionImpl = z.infer<typeof SocialSectionImplSchema>;

const GlobalVariablesSectionImplSchema = z.object({
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
  pinnedParams: z.array(IDSchema).default(() => []),
  selectedParams: z.array(IDSchema).default(() => []),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default(() => []),
  jsonSourceMissing: z.boolean().default(false),
});

type GlobalVariablesSectionImpl = z.infer<
  typeof GlobalVariablesSectionImplSchema
>;

const CodeSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
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

type CodeSectionImpl = z.infer<typeof CodeSectionImplSchema>;

export function createCodeSectionImpl(
  defaults: UserDefaultCodeSectionImpl,
  overrides: Partial<CodeSectionImpl> = {},
): CodeSectionImpl {
  return CodeSectionImplSchema.parse({ ...defaults, ...overrides });
}

const GenPythonCodeSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

type GenPythonCodeSectionImpl = z.infer<typeof GenPythonCodeSectionImplSchema>;

const GenPythonMetadataSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

type GenPythonMetadataSectionImpl = z.infer<
  typeof GenPythonMetadataSectionImplSchema
>;

const TerminalSectionImplSchema = z.object({
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

type TerminalSectionImpl = z.infer<typeof TerminalSectionImplSchema>;

export function createTerminalSectionImpl(
  defaults: UserDefaultTerminalSectionImpl,
  overrides: Partial<TerminalSectionImpl> = {},
): TerminalSectionImpl {
  return TerminalSectionImplSchema.parse({ ...defaults, ...overrides });
}

const IFrameSectionImplSchema = z.object({
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

type IFrameSectionImpl = z.infer<typeof IFrameSectionImplSchema>;

const ChatSectionImplSchema = z.object({
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
  transcriptionProfileId: z.union([IDSchema, z.null()]).default(null),
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  chatId: z.union([IDSchema, z.null()]).default(null),
  thinking: z.boolean().default(true),
  permissionMode: z
    .enum(ChatPermissionModeEnum)
    .default(ChatPermissionModeEnum.minimal),
  searchEnabled: z.boolean().default(true),
  dictationMode: z
    .enum(ChatDictationModeEnum)
    .default(ChatDictationModeEnum.auto),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default(() => []),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

type ChatSectionImpl = z.infer<typeof ChatSectionImplSchema>;

export function createChatSectionImpl(
  defaults: UserDefaultChatSectionImpl,
  overrides: Partial<ChatSectionImpl> = {},
): ChatSectionImpl {
  return ChatSectionImplSchema.parse({ ...defaults, ...overrides });
}

const BrowserSectionImplSchema = z.object({
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
  savedSearches: z.array(BrowserSavedSearchSchema).default(() => []),
});

type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

const PluginSectionImplSchema = z.object({
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

type PluginSectionImpl = z.infer<typeof PluginSectionImplSchema>;

const TaskBoardSectionImplSchema = z.object({
  type: z.literal("TaskBoard").default(SectionTypeEnum.TaskBoard),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 720.0, height: 430.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  viewMode: z.enum(TaskBoardViewModeEnum).default(TaskBoardViewModeEnum.kanban),
  columns: z.array(TaskBoardColumnSchema).default(() => []),
  tasks: z.array(TaskBoardTaskSchema).default(() => []),
});

type TaskBoardSectionImpl = z.infer<typeof TaskBoardSectionImplSchema>;

export function createTaskBoardSectionImpl(
  defaults: UserDefaultTaskBoardSectionImpl,
  overrides: Partial<TaskBoardSectionImpl> = {},
): TaskBoardSectionImpl {
  return TaskBoardSectionImplSchema.parse({ ...defaults, ...overrides });
}

const SpreadsheetSectionImplSchema = z.object({
  type: z.literal("Spreadsheet").default(SectionTypeEnum.Spreadsheet),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  isInOtherProjectConfigs: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 760.0, height: 500.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  filePath: z.string().default("" as const),
  activeSheet: z.union([z.string(), z.null()]).default(null),
  readOnly: z.boolean().default(false),
  showRowNumbers: z.boolean().default(true),
  density: z
    .enum(SpreadsheetGridDensityEnum)
    .default(SpreadsheetGridDensityEnum.compact),
  autoReloadOnExternalChange: z.boolean().default(false),
});

type SpreadsheetSectionImpl = z.infer<typeof SpreadsheetSectionImplSchema>;

export function createSpreadsheetSectionImpl(
  defaults: UserDefaultSpreadsheetSectionImpl,
  overrides: Partial<SpreadsheetSectionImpl> = {},
): SpreadsheetSectionImpl {
  return SpreadsheetSectionImplSchema.parse({ ...defaults, ...overrides });
}

const VariantSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: IDSchema,
  nonPresetImpls: z.array(IDSchema),
  modifier: SharedModifierSchema.default(createSharedModifier),
  isFrozen: z.boolean().default(false),
});

export type Variant = z.infer<typeof VariantSchema>;

export function createVariant(options: Partial<Variant> = {}): Variant {
  return VariantSchema.parse(options);
}

const CodeCallableCodeObjImplSchema = z.object({
  type: z.literal("CodeCallable").default(CodeObjTypeEnum.CodeCallable),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default(() => []),
});

type CodeCallableCodeObjImpl = z.infer<typeof CodeCallableCodeObjImplSchema>;

const CodeParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type CodeParamCodeObjImpl = z.infer<typeof CodeParamCodeObjImplSchema>;

export function createCodeParamCodeObjImpl(
  defaults: UserDefaultCodeParamCodeObjImpl,
  overrides: Partial<CodeParamCodeObjImpl> = {},
): CodeParamCodeObjImpl {
  return CodeParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

const TextParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  uiType: z
    .enum(TextParamInputUITypeEnum)
    .default(TextParamInputUITypeEnum.plain),
});

type TextParamCodeObjImpl = z.infer<typeof TextParamCodeObjImplSchema>;

const DateParamCodeObjImplSchema = z.object({
  type: z.literal("DateParam").default(CodeObjTypeEnum.DateParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  dateDisplayFormat: z
    .enum(DateDisplayFormatEnum)
    .default(DateDisplayFormatEnum.iso),
  dateControlMode: z
    .enum(DateControlModeEnum)
    .default(DateControlModeEnum.input),
  dateSelectionMode: z
    .enum(DateSelectionModeEnum)
    .default(DateSelectionModeEnum.single),
  dateCalendarWeekStart: z
    .enum(DateCalendarWeekStartEnum)
    .default(DateCalendarWeekStartEnum.sunday),
  dateIncludesTime: z.boolean().default(false),
});

export type DateParamCodeObjImpl = z.infer<typeof DateParamCodeObjImplSchema>;

const TimeParamCodeObjImplSchema = z.object({
  type: z.literal("TimeParam").default(CodeObjTypeEnum.TimeParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  timeControlMode: z
    .enum(TimeControlModeEnum)
    .default(TimeControlModeEnum.input),
  timeDisplayFormat: z
    .enum(TimeDisplayFormatEnum)
    .default(TimeDisplayFormatEnum.twenty_four_hour),
  timeDisplayTransparent: z.boolean().default(false),
  timeDisplayScale: z.number().default(1.0),
  timeDisplayFont: z
    .enum(TimeDisplayFontEnum)
    .default(TimeDisplayFontEnum.monospace),
});

export type TimeParamCodeObjImpl = z.infer<typeof TimeParamCodeObjImplSchema>;

const ButtonParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
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

const SliderParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

export type SliderParamCodeObjImpl = z.infer<
  typeof SliderParamCodeObjImplSchema
>;

const RotaryParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.number().default(0),
  max: z.number().default(1),
  step: z.number().default(0.1),
});

export type RotaryParamCodeObjImpl = z.infer<
  typeof RotaryParamCodeObjImplSchema
>;

const SwitchParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("false" as const),
});

type SwitchParamCodeObjImpl = z.infer<typeof SwitchParamCodeObjImplSchema>;

const ColorPickerParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default(() => []),
});

export type ColorPickerParamCodeObjImpl = z.infer<
  typeof ColorPickerParamCodeObjImplSchema
>;

const DropdownParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default(() => []),
});

export type DropdownParamCodeObjImpl = z.infer<
  typeof DropdownParamCodeObjImplSchema
>;

const PasswordParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  hasSecret: z.boolean().default(false),
});

type PasswordParamCodeObjImpl = z.infer<typeof PasswordParamCodeObjImplSchema>;

const TextAreaParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type TextAreaParamCodeObjImpl = z.infer<typeof TextAreaParamCodeObjImplSchema>;

const DropzoneParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  mode: z.enum(DropzoneModeEnum).default(DropzoneModeEnum.STATEFUL),
  maxAttachments: z.union([z.int(), z.null()]).default(null),
  placeholder: z.string().default("Drop a file here" as const),
});

export type DropzoneParamCodeObjImpl = z.infer<
  typeof DropzoneParamCodeObjImplSchema
>;

const NestedParamCodeObjImplSchema = z.object({
  type: z.literal("NestedParam").default(CodeObjTypeEnum.NestedParam),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default(() => []),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  typeAnnotation: z.string().default("" as const),
});

type NestedParamCodeObjImpl = z.infer<typeof NestedParamCodeObjImplSchema>;

const ProjectStateCoreSchema = z.object({
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
        TaskBoardSectionImplSchema,
        SpreadsheetSectionImplSchema,
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
        DateParamCodeObjImplSchema,
        TimeParamCodeObjImplSchema,
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

const ProjectStateCoreWithSectionVariantMapSchema = z.object({
  core: ProjectStateCoreSchema,
  sectionVariantMap: z.record(IDSchema, IDSchema).default({}),
});

const SectionsClipboardDataSchema = z.object({
  type: z.literal("Sections").default(ClipboardDataTypeEnum.Sections),
  data: ProjectStateCoreWithSectionVariantMapSchema,
});

export type SectionsClipboardData = z.infer<typeof SectionsClipboardDataSchema>;

const BaseClipboardDataUnionWithDiscriminatorSchema =
  SectionsClipboardDataSchema;

export type BaseClipboardDataUnionWithDiscriminator = z.infer<
  typeof BaseClipboardDataUnionWithDiscriminatorSchema
>;

const SectionDependencyKeySchema = z.object({
  type: z.literal("Section").default(DependencyKeyTypeEnum.Section),
  sectionId: IDSchema,
});

export type SectionDependencyKey = z.infer<typeof SectionDependencyKeySchema>;

const SectionParamDependencyKeySchema = z.object({
  type: z.literal("SectionParam").default(DependencyKeyTypeEnum.SectionParam),
  sectionId: IDSchema,
  codeObjId: IDSchema,
});

export type SectionParamDependencyKey = z.infer<
  typeof SectionParamDependencyKeySchema
>;

const BaseDependencyKeyUnionSchema = z.union([
  SectionDependencyKeySchema,
  SectionParamDependencyKeySchema,
]);

export type BaseDependencyKeyUnion = z.infer<
  typeof BaseDependencyKeyUnionSchema
>;

const LiteralDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("Literal").default(DependencyValueTypeEnum.Literal),
});

export type LiteralDependencyValue = z.infer<
  typeof LiteralDependencyValueSchema
>;

const FileReadDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("FileRead").default(DependencyValueTypeEnum.FileRead),
});

const BinaryDependencyValueSchema = z.object({
  payload: BinaryContentRefSchema,
  type: z.literal("Binary").default(DependencyValueTypeEnum.Binary),
});

export type BinaryDependencyValue = z.infer<typeof BinaryDependencyValueSchema>;

const BaseDependencyValueUnionSchema = z.union([
  LiteralDependencyValueSchema,
  FileReadDependencyValueSchema,
  BinaryDependencyValueSchema,
]);

export type BaseDependencyValueUnion = z.infer<
  typeof BaseDependencyValueUnionSchema
>;

const BaseChildlessCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  DateParamCodeObjImplSchema,
  TimeParamCodeObjImplSchema,
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

const BaseCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  DateParamCodeObjImplSchema,
  TimeParamCodeObjImplSchema,
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

const BaseDictSectionImplUnionSchema = z.union([
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

type BaseDictSectionImplUnion = z.infer<typeof BaseDictSectionImplUnionSchema>;

const BaseParamCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  DateParamCodeObjImplSchema,
  TimeParamCodeObjImplSchema,
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

type BaseParamCodeObjImplUnion = z.infer<
  typeof BaseParamCodeObjImplUnionSchema
>;

const BaseParentCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

type BaseParentCodeObjImplUnion = z.infer<
  typeof BaseParentCodeObjImplUnionSchema
>;

const BaseParentSectionImplUnionSchema = z.union([
  ListRootSectionImplSchema,
  GroupSectionImplSchema,
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
  GenPythonMetadataSectionImplSchema,
]);

type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

const BaseSectionImplUnionSchema = z.union([
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
  TaskBoardSectionImplSchema,
  SpreadsheetSectionImplSchema,
]);

export type BaseSectionImplUnion = z.infer<typeof BaseSectionImplUnionSchema>;

const BaseSectionWithParamsImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

type BaseSectionWithParamsImplUnion = z.infer<
  typeof BaseSectionWithParamsImplUnionSchema
>;

const ChartSectionImplArgsSchema = z.object({
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

type ChartSectionImplArgs = z.infer<typeof ChartSectionImplArgsSchema>;

const DrawSectionImplArgsSchema = z.object({
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

type DrawSectionImplArgs = z.infer<typeof DrawSectionImplArgsSchema>;

const CodeParamCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type CodeParamCodeObjImplArgs = z.infer<typeof CodeParamCodeObjImplArgsSchema>;

const TextParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TextParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  uiType: z.enum(TextParamInputUITypeEnum).optional(),
});

type TextParamCodeObjImplArgs = z.infer<typeof TextParamCodeObjImplArgsSchema>;

const DateParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DateParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  dateDisplayFormat: z.enum(DateDisplayFormatEnum).optional(),
  dateControlMode: z.enum(DateControlModeEnum).optional(),
  dateSelectionMode: z.enum(DateSelectionModeEnum).optional(),
  dateCalendarWeekStart: z.enum(DateCalendarWeekStartEnum).optional(),
  dateIncludesTime: z.boolean().optional(),
});

type DateParamCodeObjImplArgs = z.infer<typeof DateParamCodeObjImplArgsSchema>;

const TimeParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TimeParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  timeControlMode: z.enum(TimeControlModeEnum).optional(),
  timeDisplayFormat: z.enum(TimeDisplayFormatEnum).optional(),
  timeDisplayTransparent: z.boolean().optional(),
  timeDisplayScale: z.number().optional(),
  timeDisplayFont: z.enum(TimeDisplayFontEnum).optional(),
});

type TimeParamCodeObjImplArgs = z.infer<typeof TimeParamCodeObjImplArgsSchema>;

const SliderParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SliderParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  min: z.int().optional(),
  max: z.int().optional(),
  step: z.int().optional(),
});

type SliderParamCodeObjImplArgs = z.infer<
  typeof SliderParamCodeObjImplArgsSchema
>;

const RotaryParamCodeObjImplArgsSchema = z.object({
  type: z.literal("RotaryParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

type RotaryParamCodeObjImplArgs = z.infer<
  typeof RotaryParamCodeObjImplArgsSchema
>;

const SwitchParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SwitchParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type SwitchParamCodeObjImplArgs = z.infer<
  typeof SwitchParamCodeObjImplArgsSchema
>;

const ColorPickerParamCodeObjImplArgsSchema = z.object({
  type: z.literal("ColorPickerParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  colorChoices: z.array(ColorPickerChoiceSchema).optional(),
});

type ColorPickerParamCodeObjImplArgs = z.infer<
  typeof ColorPickerParamCodeObjImplArgsSchema
>;

const DropdownParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DropdownParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

type DropdownParamCodeObjImplArgs = z.infer<
  typeof DropdownParamCodeObjImplArgsSchema
>;

const PasswordParamCodeObjImplArgsSchema = z.object({
  type: z.literal("PasswordParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  hasSecret: z.boolean().optional(),
});

type PasswordParamCodeObjImplArgs = z.infer<
  typeof PasswordParamCodeObjImplArgsSchema
>;

const TextAreaParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TextAreaParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type TextAreaParamCodeObjImplArgs = z.infer<
  typeof TextAreaParamCodeObjImplArgsSchema
>;

const DropzoneParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DropzoneParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  mode: z.enum(DropzoneModeEnum).optional(),
  maxAttachments: z.union([z.int(), z.null()]).optional(),
  placeholder: z.string().optional(),
});

type DropzoneParamCodeObjImplArgs = z.infer<
  typeof DropzoneParamCodeObjImplArgsSchema
>;

const CodeCallableCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeCallable").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

type CodeCallableCodeObjImplArgs = z.infer<
  typeof CodeCallableCodeObjImplArgsSchema
>;

const ButtonParamCodeObjImplArgsSchema = z.object({
  type: z.literal("ButtonParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  label: z.string().optional(),
  actionMode: z.enum(ButtonActionModeEnum).optional(),
  requestMethod: z.enum(HttpRequestMethodEnum).optional(),
  requestUrl: z.string().optional(),
  requestHeaderKey: z.string().optional(),
  requestHeaderValue: z.string().optional(),
  requestBody: z.string().optional(),
});

type ButtonParamCodeObjImplArgs = z.infer<
  typeof ButtonParamCodeObjImplArgsSchema
>;

const NestedParamCodeObjImplArgsSchema = z.object({
  type: z.literal("NestedParam").optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  children: z.array(IDSchema).optional(),
});

type NestedParamCodeObjImplArgs = z.infer<
  typeof NestedParamCodeObjImplArgsSchema
>;

const CodeSectionImplArgsSchema = z.object({
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

type CodeSectionImplArgs = z.infer<typeof CodeSectionImplArgsSchema>;

const GenPythonCodeSectionImplArgsSchema = z.object({
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

type GenPythonCodeSectionImplArgs = z.infer<
  typeof GenPythonCodeSectionImplArgsSchema
>;

const GenPythonMetadataSectionImplArgsSchema = z.object({
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

type GenPythonMetadataSectionImplArgs = z.infer<
  typeof GenPythonMetadataSectionImplArgsSchema
>;

const DictSectionImplArgsSchema = z.object({
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

type DictSectionImplArgs = z.infer<typeof DictSectionImplArgsSchema>;

const GlobalVariablesSectionImplArgsSchema = z.object({
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

type GlobalVariablesSectionImplArgs = z.infer<
  typeof GlobalVariablesSectionImplArgsSchema
>;

const ListRootSectionImplArgsSchema = z.object({
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
  defaultChildSectionType: z.enum(SectionTypeEnum).optional(),
  viewMode: z.enum(ListRootViewModeEnum).optional(),
});

type ListRootSectionImplArgs = z.infer<typeof ListRootSectionImplArgsSchema>;

const GroupSectionImplArgsSchema = z.object({
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
  defaultChildSectionType: z.enum(SectionTypeEnum).optional(),
});

type GroupSectionImplArgs = z.infer<typeof GroupSectionImplArgsSchema>;

const CallableSectionImplArgsSchema = z.object({
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

type CallableSectionImplArgs = z.infer<typeof CallableSectionImplArgsSchema>;

const ImageSectionImplArgsSchema = z.object({
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

type ImageSectionImplArgs = z.infer<typeof ImageSectionImplArgsSchema>;

const TextBlockSectionImplArgsSchema = z.object({
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
  masterFontSizePx: z.number().optional(),
  headingAsSectionName: z.boolean().optional(),
  metaControlStyle: z.boolean().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  text: z.string().optional(),
});

type TextBlockSectionImplArgs = z.infer<typeof TextBlockSectionImplArgsSchema>;

const PromptSectionImplArgsSchema = z.object({
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

type PromptSectionImplArgs = z.infer<typeof PromptSectionImplArgsSchema>;

const MetaControlSectionImplArgsSchema = z.object({
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

type MetaControlSectionImplArgs = z.infer<
  typeof MetaControlSectionImplArgsSchema
>;

const SocialSectionImplArgsSchema = z.object({
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

type SocialSectionImplArgs = z.infer<typeof SocialSectionImplArgsSchema>;

const TerminalSectionImplArgsSchema = z.object({
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

type TerminalSectionImplArgs = z.infer<typeof TerminalSectionImplArgsSchema>;

const IFrameSectionImplArgsSchema = z.object({
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

type IFrameSectionImplArgs = z.infer<typeof IFrameSectionImplArgsSchema>;

const ChatSectionImplArgsSchema = z.object({
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
  transcriptionProfileId: z.union([IDSchema, z.null()]).optional(),
  agentProfileId: z.union([IDSchema, z.null()]).optional(),
  chatId: z.union([IDSchema, z.null()]).optional(),
  thinking: z.boolean().optional(),
  permissionMode: z.enum(ChatPermissionModeEnum).optional(),
  searchEnabled: z.boolean().optional(),
  dictationMode: z.enum(ChatDictationModeEnum).optional(),
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

type ChatSectionImplArgs = z.infer<typeof ChatSectionImplArgsSchema>;

const BrowserSectionImplArgsSchema = z.object({
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

type BrowserSectionImplArgs = z.infer<typeof BrowserSectionImplArgsSchema>;

const PluginSectionImplArgsSchema = z.object({
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

type PluginSectionImplArgs = z.infer<typeof PluginSectionImplArgsSchema>;

const TaskBoardSectionImplArgsSchema = z.object({
  type: z.literal("TaskBoard").optional(),
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
  viewMode: z.enum(TaskBoardViewModeEnum).optional(),
  columns: z.array(TaskBoardColumnSchema).optional(),
  tasks: z.array(TaskBoardTaskSchema).optional(),
});

type TaskBoardSectionImplArgs = z.infer<typeof TaskBoardSectionImplArgsSchema>;

const SpreadsheetSectionImplArgsSchema = z.object({
  type: z.literal("Spreadsheet").optional(),
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
  filePath: z.string().optional(),
  activeSheet: z.union([z.string(), z.null()]).optional(),
  readOnly: z.boolean().optional(),
  showRowNumbers: z.boolean().optional(),
  density: z.enum(SpreadsheetGridDensityEnum).optional(),
  autoReloadOnExternalChange: z.boolean().optional(),
});

type SpreadsheetSectionImplArgs = z.infer<
  typeof SpreadsheetSectionImplArgsSchema
>;

const UISettingRevealResultStatusSchema = z.object({
  settingId: z.string(),
  status: z.literal(["revealed", "failed"]),
  errorCode: z.union([z.string(), z.null()]).default(null),
  errorMessage: z.union([z.string(), z.null()]).default(null),
});

const UISettingRevealResultContentSchema = z.object({
  projectConfigId: IDSchema,
  requestId: z.string(),
  statuses: z.array(UISettingRevealResultStatusSchema),
});

const WebsocketMsgUISettingRevealResultSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: UISettingRevealResultContentSchema,
  messageType: z
    .literal("UISettingRevealResult")
    .default(WebsocketMsgTypeForBackendEnum.UISettingRevealResult),
});

export type WebsocketMsgUISettingRevealResult = z.infer<
  typeof WebsocketMsgUISettingRevealResultSchema
>;

const RealtimeUIChangeContentSchema = z.object({
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

const WebsocketMsgRealtimeUIChangeSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RealtimeUIChangeContentSchema,
  messageType: z
    .literal("RealtimeUIChange")
    .default(WebsocketMsgTypeForBackendEnum.RealtimeUIChange),
});

export type WebsocketMsgRealtimeUIChange = z.infer<
  typeof WebsocketMsgRealtimeUIChangeSchema
>;

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

const RealtimeDependencyEventContentSchema = z.object({
  projectConfigId: IDSchema,
  dependencyEvent: DependencyEventSchema,
});

const WebsocketMsgRealtimeDependencyEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RealtimeDependencyEventContentSchema,
  messageType: z
    .literal("RealtimeDependencyEvent")
    .default(WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent),
});

export type WebsocketMsgRealtimeDependencyEvent = z.infer<
  typeof WebsocketMsgRealtimeDependencyEventSchema
>;

const WebsocketMsgCurrentAddressUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.string(),
  messageType: z
    .literal("CurrentAddressUpdate")
    .default(WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate),
});

type WebsocketMsgCurrentAddressUpdate = z.infer<
  typeof WebsocketMsgCurrentAddressUpdateSchema
>;

export function createWebsocketMsgCurrentAddressUpdate(
  options: Partial<WebsocketMsgCurrentAddressUpdate> = {},
): WebsocketMsgCurrentAddressUpdate {
  return WebsocketMsgCurrentAddressUpdateSchema.parse(options);
}

const WebsocketConnectionInfoSchema = z.object({
  id: z.string(),
  connectionType: z.enum(WebsocketConnectionTypeEnum),
  currentAddress: z.union([z.string(), z.null()]),
  shareSessionId: z.union([z.string(), z.null()]).default(null),
});

export type WebsocketConnectionInfo = z.infer<
  typeof WebsocketConnectionInfoSchema
>;

export function createWebsocketConnectionInfo(
  options: Partial<WebsocketConnectionInfo> = {},
): WebsocketConnectionInfo {
  return WebsocketConnectionInfoSchema.parse(options);
}

const WebsocketMsgAllConnectionsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.array(WebsocketConnectionInfoSchema),
  messageType: z
    .literal("AllConnections")
    .default(WebsocketMsgTypeForFrontendEnum.AllConnections),
});

const FrontendIdentityContentSchema = z.object({
  frontendAffinityToken: z.string(),
});

const WebsocketMsgFrontendIdentitySchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: FrontendIdentityContentSchema,
  messageType: z
    .literal("FrontendIdentity")
    .default(WebsocketMsgTypeForFrontendEnum.FrontendIdentity),
});

const SettaNotificationSchema = z.object({
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

export function createSettaNotification(
  options: Partial<SettaNotification> = {},
): SettaNotification {
  return SettaNotificationSchema.parse(options);
}

const WebsocketMsgNotificationSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaNotificationSchema,
  messageType: z
    .literal("Notification")
    .default(WebsocketMsgTypeForFrontendEnum.Notification),
});

const SettaBackendLogEventSchema = z.object({
  id: IDSchema.default(create_new_id),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
  severity: z
    .enum(SettaBackendLogEventSeverityEnum)
    .default(SettaBackendLogEventSeverityEnum.info),
  message: z.string(),
  timestamp: z.iso.datetime().default(get_now_timestamp),
});

export type SettaBackendLogEvent = z.infer<typeof SettaBackendLogEventSchema>;

const WebsocketMsgBackendLogEventSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaBackendLogEventSchema,
  messageType: z
    .literal("BackendLogEvent")
    .default(WebsocketMsgTypeForFrontendEnum.BackendLogEvent),
});

const LLMStreamingResponseSchema = z.object({
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

const WebsocketMsgLLMStreamingResponseSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: LLMStreamingResponseSchema,
  messageType: z
    .literal("LLMStreamingResponse")
    .default(WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse),
});

const SettaSectionTypeErrorsSchema = z.object({
  callable: z.array(z.string()).default(() => []),
  params: z.record(IDSchema, z.array(z.string())).default({}),
});

const SettaProjectConfigDiagnosticsSchema = z.object({
  projectConfigId: IDSchema,
  errors: z.record(IDSchema, SettaSectionTypeErrorsSchema).default({}),
  isGenCode: z.boolean(),
});

export type SettaProjectConfigDiagnostics = z.infer<
  typeof SettaProjectConfigDiagnosticsSchema
>;

export function createSettaProjectConfigDiagnostics(
  options: Partial<SettaProjectConfigDiagnostics> = {},
): SettaProjectConfigDiagnostics {
  return SettaProjectConfigDiagnosticsSchema.parse(options);
}

const SettaLspDiagnosticPositionSchema = z.object({
  line: z.int(),
  character: z.int(),
});

const SettaLspDiagnosticRangeSchema = z.object({
  start: SettaLspDiagnosticPositionSchema,
  end: SettaLspDiagnosticPositionSchema,
});

const SettaLspDiagnosticSchema = z.object({
  message: z.string(),
  severity: z.union([z.int(), z.null()]).default(null),
  code: z.union([z.string(), z.int(), z.null()]).default(null),
  source: z.union([z.string(), z.null()]).default(null),
  range: SettaLspDiagnosticRangeSchema,
  uri: z.union([z.string(), z.null()]).default(null),
});

export type SettaLspDiagnostic = z.infer<typeof SettaLspDiagnosticSchema>;

const SettaLspDiagnosticsPayloadSchema = z.object({
  projectConfigId: IDSchema,
  genCode: SettaProjectConfigDiagnosticsSchema,
  codeSections: z
    .record(IDSchema, z.array(SettaLspDiagnosticSchema))
    .default({}),
  unmappedGenCode: z.array(SettaLspDiagnosticSchema).default(() => []),
});

export type SettaLspDiagnosticsPayload = z.infer<
  typeof SettaLspDiagnosticsPayloadSchema
>;

export function createSettaLspDiagnosticsPayload(
  options: Partial<SettaLspDiagnosticsPayload> = {},
): SettaLspDiagnosticsPayload {
  return SettaLspDiagnosticsPayloadSchema.parse(options);
}

const WebsocketMsgLSPDiagnosticsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaLspDiagnosticsPayloadSchema,
  messageType: z
    .literal("LSPDiagnostics")
    .default(WebsocketMsgTypeForFrontendEnum.LSPDiagnostics),
});

const SettaProjectNameValidationErrorsSchema = z.object({
  projectConfigId: IDSchema,
  projectErrors: z.array(z.string()).default(() => []),
  sectionErrors: z.record(IDSchema, z.array(z.string())).default({}),
  paramErrors: z.record(IDSchema, z.array(z.string())).default({}),
});

export type SettaProjectNameValidationErrors = z.infer<
  typeof SettaProjectNameValidationErrorsSchema
>;

const WebsocketMsgNameValidationErrorsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaProjectNameValidationErrorsSchema,
  messageType: z
    .literal("NameValidationErrors")
    .default(WebsocketMsgTypeForFrontendEnum.NameValidationErrors),
});

const RenameReferenceChangedValueSchema = z.object({
  depKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  newValue: z.string(),
});

export type RenameReferenceChangedValue = z.infer<
  typeof RenameReferenceChangedValueSchema
>;

const RenameRefactorBroadcastContentSchema = z.object({
  projectConfigId: IDSchema,
  frontendOpId: z.string(),
  renameMode: z.enum(RenameRefactorModeEnum),
  changedNodeValues: z.array(RenameReferenceChangedValueSchema),
});

export type RenameRefactorBroadcastContent = z.infer<
  typeof RenameRefactorBroadcastContentSchema
>;

const WebsocketMsgReturnRenameRefactorResultsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: RenameRefactorBroadcastContentSchema,
  messageType: z
    .literal("ReturnRenameRefactorResults")
    .default(WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults),
});

const ViewportSchema = z.object({
  x: z.number().default(0.0),
  y: z.number().default(0.0),
  zoom: z.number().default(1.0),
});

export type Viewport = z.infer<typeof ViewportSchema>;

function createViewport(options: Partial<Viewport> = {}): Viewport {
  return ViewportSchema.parse(options);
}

const TopLevelSectionLayoutSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zIndex: z.int().default(0),
  w: z.union([z.number(), z.null()]).default(null),
  h: z.union([z.number(), z.null()]).default(null),
});

export type TopLevelSectionLayout = z.infer<typeof TopLevelSectionLayoutSchema>;

export function createTopLevelSectionLayout(
  options: Partial<TopLevelSectionLayout> = {},
): TopLevelSectionLayout {
  return TopLevelSectionLayoutSchema.parse(options);
}

const ViewModeConfigSchema = z.object({
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

export function createViewModeConfig(
  options: Partial<ViewModeConfig> = {},
): ViewModeConfig {
  return ViewModeConfigSchema.parse(options);
}

const SectionTypeCodegenPolicySchema = z.object({
  mode: z.enum(SectionCodegenModeEnum).default(SectionCodegenModeEnum.inherit),
  representation: z
    .enum(SectionRepresentationModeEnum)
    .default(SectionRepresentationModeEnum.expression),
});

type SectionTypeCodegenPolicy = z.infer<typeof SectionTypeCodegenPolicySchema>;

function createSectionTypeCodegenPolicy(
  options: Partial<SectionTypeCodegenPolicy> = {},
): SectionTypeCodegenPolicy {
  return SectionTypeCodegenPolicySchema.parse(options);
}

const SectionCodegenOverrideSchema = z.object({
  mode: z.enum(SectionCodegenModeEnum).default(SectionCodegenModeEnum.inherit),
  representation: z
    .enum(SectionRepresentationModeEnum)
    .default(SectionRepresentationModeEnum.expression),
});

const SectionCodegenPolicySchema = z.object({
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
      SectionTypeEnum.TaskBoard,
      SectionTypeEnum.Spreadsheet,
    ]),
  metaControlAllowlist: z
    .union([z.array(z.enum(CodeObjTypeEnum)), z.null()])
    .default(() => [
      CodeObjTypeEnum.CodeParam,
      CodeObjTypeEnum.TextParam,
      CodeObjTypeEnum.DateParam,
      CodeObjTypeEnum.TimeParam,
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
  exclude: z.array(IDSchema).default(() => []),
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
      TaskBoard: createSectionTypeCodegenPolicy(),
      Spreadsheet: createSectionTypeCodegenPolicy(),
    })),
  sectionOverrides: z
    .record(IDSchema, SectionCodegenOverrideSchema)
    .default({}),
});

type SectionCodegenPolicy = z.infer<typeof SectionCodegenPolicySchema>;

export function createSectionCodegenPolicy(
  options: Partial<SectionCodegenPolicy> = {},
): SectionCodegenPolicy {
  return SectionCodegenPolicySchema.parse(options);
}

const CodeObjTypeValuePolicySchema = z.object({
  representation: z
    .enum(CodeObjValueRepresentationModeEnum)
    .default(CodeObjValueRepresentationModeEnum.expression),
});

type CodeObjTypeValuePolicy = z.infer<typeof CodeObjTypeValuePolicySchema>;

function createCodeObjTypeValuePolicy(
  options: Partial<CodeObjTypeValuePolicy> = {},
): CodeObjTypeValuePolicy {
  return CodeObjTypeValuePolicySchema.parse(options);
}

const CodeObjValueOverrideSchema = z.object({
  representation: z
    .enum(CodeObjValueRepresentationModeEnum)
    .default(CodeObjValueRepresentationModeEnum.expression),
});

const CodeObjValuePolicySchema = z.object({
  typePolicies: z
    .record(z.enum(CodeObjTypeEnum), CodeObjTypeValuePolicySchema)
    .default(() => ({
      CodeCallable: createCodeObjTypeValuePolicy(),
      CodeParam: createCodeObjTypeValuePolicy(),
      TextParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      DateParam: createCodeObjTypeValuePolicy({
        representation: CodeObjValueRepresentationModeEnum.string,
      }),
      TimeParam: createCodeObjTypeValuePolicy({
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

type CodeObjValuePolicy = z.infer<typeof CodeObjValuePolicySchema>;

export function createCodeObjValuePolicy(
  options: Partial<CodeObjValuePolicy> = {},
): CodeObjValuePolicy {
  return CodeObjValuePolicySchema.parse(options);
}

const ProjectCodegenPythonTargetSchema = z.object({
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

export function createProjectCodegenPythonTarget(
  options: Partial<ProjectCodegenPythonTarget> = {},
): ProjectCodegenPythonTarget {
  return ProjectCodegenPythonTargetSchema.parse(options);
}

const ProjectCodegenPluginTargetSchema = z.object({
  language: z.string(),
  options: z.record(z.string(), z.any()).default({}),
});

export type ProjectCodegenPluginTarget = z.infer<
  typeof ProjectCodegenPluginTargetSchema
>;

export function createProjectCodegenPluginTarget(
  options: Partial<ProjectCodegenPluginTarget> = {},
): ProjectCodegenPluginTarget {
  return ProjectCodegenPluginTargetSchema.parse(options);
}

const EdgeSchema = z.object({
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

const AgenticEdgeSchema = z.object({
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

export function createAgenticEdge(
  options: Partial<AgenticEdge> = {},
): AgenticEdge {
  return AgenticEdgeSchema.parse(options);
}

const WatchCodeFolderSchema = z.object({
  path: z.string(),
  recursive: z.boolean().default(true),
});

export type WatchCodeFolder = z.infer<typeof WatchCodeFolderSchema>;

const WatchCodeRegistryEntrySchema = z.object({
  callableName: z.string(),
  kind: z.enum(WatchCodeCallableKindEnum),
  signatureHash: z.string(),
  bodyHash: z.string(),
  sourcePath: z.string(),
  sectionIds: z.array(IDSchema).default(() => []),
  sectionsCount: z.int().default(0),
});

const ProjectConfigSchema = z.object({
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
  activeIds: z.array(IDSchema).default(() => []),
  edges: z.array(EdgeSchema).default(() => []),
  agenticEdges: z.array(AgenticEdgeSchema).default(() => []),
  watchCodeEnabled: z.boolean().default(false),
  watchCodeFolders: z.array(WatchCodeFolderSchema).default(() => []),
  watchCodeFiles: z.array(z.string()).default(() => []),
  watchCodeRegistry: z
    .record(z.string(), WatchCodeRegistryEntrySchema)
    .default({}),
  watchCodeBaselineByPath: z
    .record(z.string(), z.array(z.string()))
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return ProjectConfigSchema.parse(options);
}

const SingletonSectionsSchema = z.object({
  GlobalVariables: z.union([IDSchema, z.null()]).default(null),
  GenPythonCode: z.union([IDSchema, z.null()]).default(null),
  GenPythonMetadata: z.union([IDSchema, z.null()]).default(null),
});

type SingletonSections = z.infer<typeof SingletonSectionsSchema>;

export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return SingletonSectionsSchema.parse(options);
}

const ShownParamIdDetailsSchema = z.object({
  requiredParamIdsToPaths: z.record(IDSchema, z.array(IDSchema)).default({}),
  topLevelParamIds: z.array(IDSchema).default(() => []),
});

type ShownParamIdDetails = z.infer<typeof ShownParamIdDetailsSchema>;

function createShownParamIdDetails(
  options: Partial<ShownParamIdDetails> = {},
): ShownParamIdDetails {
  return ShownParamIdDetailsSchema.parse(options);
}

const ShownParamIdsSchema = z.object({
  pinned: ShownParamIdDetailsSchema.default(createShownParamIdDetails),
  unpinned: ShownParamIdDetailsSchema.default(createShownParamIdDetails),
});

export type ShownParamIds = z.infer<typeof ShownParamIdsSchema>;

const ProjectStateSingleConfigSchema = z.object({
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
        TaskBoardSectionImplSchema,
        SpreadsheetSectionImplSchema,
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
        DateParamCodeObjImplSchema,
        TimeParamCodeObjImplSchema,
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
  requiredDecodedImages: z.array(z.string()).default(() => []),
  genCodeBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type ProjectStateSingleConfig = z.infer<
  typeof ProjectStateSingleConfigSchema
>;

const ProjectStateSingleConfigWithCompletedOpIdsSchema = z.object({
  projectState: ProjectStateSingleConfigSchema,
  completedOpIds: z.array(z.string()),
  pendingOpIds: z.array(z.string()),
});

export type ProjectStateSingleConfigWithCompletedOpIds = z.infer<
  typeof ProjectStateSingleConfigWithCompletedOpIdsSchema
>;

const WebsocketMsgUpdateFrontendProjectStateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ProjectStateSingleConfigWithCompletedOpIdsSchema,
  messageType: z
    .literal("UpdateFrontendProjectState")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState),
});

const WebsocketMsgTerminalMetadataSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z
    .literal("TerminalMetadata")
    .default(WebsocketMsgTypeForFrontendEnum.TerminalMetadata),
});

const SettingsShortcutsSchema = z.object({
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

type SettingsShortcuts = z.infer<typeof SettingsShortcutsSchema>;

function createSettingsShortcuts(
  options: Partial<SettingsShortcuts> = {},
): SettingsShortcuts {
  return SettingsShortcutsSchema.parse(options);
}

const SettingsGUISchema = z.object({
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
  sectionTagColorChoices: z.array(ColorPickerChoiceSchema).default(() => [
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

type SettingsGUI = z.infer<typeof SettingsGUISchema>;

function createSettingsGUI(options: Partial<SettingsGUI> = {}): SettingsGUI {
  return SettingsGUISchema.parse(options);
}

const SettingsBackendSchema = z.object({
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
  completionGuardEnabled: z.boolean().default(false),
});

type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

function createSettingsBackend(
  options: Partial<SettingsBackend> = {},
): SettingsBackend {
  return SettingsBackendSchema.parse(options);
}

const SectionSizingPolicyCallableTypeEntrySchema = z.object({
  minHeight: z.number(),
  maxHeight: z.number(),
  minWidth: z.number(),
  maxWidth: z.number(),
  hideSearchMinHeight: z.number(),
  hideParamsMinHeight: z.number(),
});

type SectionSizingPolicyCallableTypeEntry = z.infer<
  typeof SectionSizingPolicyCallableTypeEntrySchema
>;

function createSectionSizingPolicyCallableTypeEntry(
  options: Partial<SectionSizingPolicyCallableTypeEntry> = {},
): SectionSizingPolicyCallableTypeEntry {
  return SectionSizingPolicyCallableTypeEntrySchema.parse(options);
}

const SectionSizingPolicyTypeEntrySchema = z.object({
  minHeight: z.number(),
  maxHeight: z.number(),
  minWidth: z.number(),
  maxWidth: z.number(),
});

type SectionSizingPolicyTypeEntry = z.infer<
  typeof SectionSizingPolicyTypeEntrySchema
>;

function createSectionSizingPolicyTypeEntry(
  options: Partial<SectionSizingPolicyTypeEntry> = {},
): SectionSizingPolicyTypeEntry {
  return SectionSizingPolicyTypeEntrySchema.parse(options);
}

const SectionSizingPolicyByTypeSchema = z.object({
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
  TaskBoard: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 240.0,
      maxHeight: 100000.0,
      minWidth: 360.0,
      maxWidth: 100000.0,
    }),
  ),
  Spreadsheet: SectionSizingPolicyTypeEntrySchema.default(() =>
    createSectionSizingPolicyTypeEntry({
      minHeight: 260.0,
      maxHeight: 100000.0,
      minWidth: 420.0,
      maxWidth: 100000.0,
    }),
  ),
});

type SectionSizingPolicyByType = z.infer<
  typeof SectionSizingPolicyByTypeSchema
>;

function createSectionSizingPolicyByType(
  options: Partial<SectionSizingPolicyByType> = {},
): SectionSizingPolicyByType {
  return SectionSizingPolicyByTypeSchema.parse(options);
}

const MetaControlSizingPolicyTypeEntrySchema = z.object({
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

function createMetaControlSizingPolicyTypeEntry(
  options: Partial<MetaControlSizingPolicyTypeEntry> = {},
): MetaControlSizingPolicyTypeEntry {
  return MetaControlSizingPolicyTypeEntrySchema.parse(options);
}

const MetaControlSizingPolicyByTypeSchema = z.object({
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
  DateParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
    createMetaControlSizingPolicyTypeEntry({
      minHeight: 32.0,
      minWidth: 200.0,
    }),
  ),
  TimeParam: MetaControlSizingPolicyTypeEntrySchema.default(() =>
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

type MetaControlSizingPolicyByType = z.infer<
  typeof MetaControlSizingPolicyByTypeSchema
>;

function createMetaControlSizingPolicyByType(
  options: Partial<MetaControlSizingPolicyByType> = {},
): MetaControlSizingPolicyByType {
  return MetaControlSizingPolicyByTypeSchema.parse(options);
}

const SectionSizingPolicyGlobalsSchema = z.object({
  pinnedParamsAreaMinHeight: z.number().default(64),
  unpinnedParamsAreaMinHeight: z.number().default(36),
  minimizedHeight: z.number().default(32),
  infiniteMaxHeight: z.number().default(100000),
  infiniteMaxWidth: z.number().default(100000),
  autoMaxHeight: z.number().default(350.0),
});

type SectionSizingPolicyGlobals = z.infer<
  typeof SectionSizingPolicyGlobalsSchema
>;

function createSectionSizingPolicyGlobals(
  options: Partial<SectionSizingPolicyGlobals> = {},
): SectionSizingPolicyGlobals {
  return SectionSizingPolicyGlobalsSchema.parse(options);
}

const SectionSizingPolicySchema = z.object({
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

function createSectionSizingPolicy(
  options: Partial<SectionSizingPolicy> = {},
): SectionSizingPolicy {
  return SectionSizingPolicySchema.parse(options);
}

const UserDefaultBrowserSectionImplSchema = z.object({
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
  savedSearches: z.array(BrowserSavedSearchSchema).default(() => []),
});

type UserDefaultBrowserSectionImpl = z.infer<
  typeof UserDefaultBrowserSectionImplSchema
>;

function createUserDefaultBrowserSectionImpl(
  options: Partial<UserDefaultBrowserSectionImpl> = {},
): UserDefaultBrowserSectionImpl {
  return UserDefaultBrowserSectionImplSchema.parse(options);
}

const UserDefaultCallableSectionImplSchema = z.object({
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
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  hideParams: z.boolean().default(false),
});

type UserDefaultCallableSectionImpl = z.infer<
  typeof UserDefaultCallableSectionImplSchema
>;

export function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return UserDefaultCallableSectionImplSchema.parse(options);
}

const UserDefaultChartSectionImplSchema = z.object({
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

type UserDefaultChartSectionImpl = z.infer<
  typeof UserDefaultChartSectionImplSchema
>;

function createUserDefaultChartSectionImpl(
  options: Partial<UserDefaultChartSectionImpl> = {},
): UserDefaultChartSectionImpl {
  return UserDefaultChartSectionImplSchema.parse(options);
}

const UserDefaultChatSectionImplSchema = z.object({
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
  transcriptionProfileId: z.union([IDSchema, z.null()]).default(null),
  agentProfileId: z.union([IDSchema, z.null()]).default(null),
  chatId: z.union([IDSchema, z.null()]).default(null),
  thinking: z.boolean().default(true),
  permissionMode: z
    .enum(ChatPermissionModeEnum)
    .default(ChatPermissionModeEnum.minimal),
  searchEnabled: z.boolean().default(true),
  dictationMode: z
    .enum(ChatDictationModeEnum)
    .default(ChatDictationModeEnum.auto),
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default(() => []),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

type UserDefaultChatSectionImpl = z.infer<
  typeof UserDefaultChatSectionImplSchema
>;

export function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return UserDefaultChatSectionImplSchema.parse(options);
}

const UserDefaultCodeSectionImplSchema = z.object({
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

type UserDefaultCodeSectionImpl = z.infer<
  typeof UserDefaultCodeSectionImplSchema
>;

export function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return UserDefaultCodeSectionImplSchema.parse(options);
}

const UserDefaultDictSectionImplSchema = z.object({
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
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default(() => []),
});

type UserDefaultDictSectionImpl = z.infer<
  typeof UserDefaultDictSectionImplSchema
>;

export function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return UserDefaultDictSectionImplSchema.parse(options);
}

const UserDefaultDrawSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 402.0, height: 100.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  layers: z.array(DrawAreaLayerSchema).default(() => []),
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
  colorChoices: z.array(ColorPickerChoiceSchema).default(() => []),
});

type UserDefaultDrawSectionImpl = z.infer<
  typeof UserDefaultDrawSectionImplSchema
>;

function createUserDefaultDrawSectionImpl(
  options: Partial<UserDefaultDrawSectionImpl> = {},
): UserDefaultDrawSectionImpl {
  return UserDefaultDrawSectionImplSchema.parse(options);
}

const UserDefaultGenPythonCodeSectionImplSchema = z.object({
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

type UserDefaultGenPythonCodeSectionImpl = z.infer<
  typeof UserDefaultGenPythonCodeSectionImplSchema
>;

function createUserDefaultGenPythonCodeSectionImpl(
  options: Partial<UserDefaultGenPythonCodeSectionImpl> = {},
): UserDefaultGenPythonCodeSectionImpl {
  return UserDefaultGenPythonCodeSectionImplSchema.parse(options);
}

const UserDefaultGenPythonMetadataSectionImplSchema = z.object({
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

type UserDefaultGenPythonMetadataSectionImpl = z.infer<
  typeof UserDefaultGenPythonMetadataSectionImplSchema
>;

function createUserDefaultGenPythonMetadataSectionImpl(
  options: Partial<UserDefaultGenPythonMetadataSectionImpl> = {},
): UserDefaultGenPythonMetadataSectionImpl {
  return UserDefaultGenPythonMetadataSectionImplSchema.parse(options);
}

const UserDefaultGlobalVariablesSectionImplSchema = z.object({
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
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default(() => []),
});

type UserDefaultGlobalVariablesSectionImpl = z.infer<
  typeof UserDefaultGlobalVariablesSectionImplSchema
>;

function createUserDefaultGlobalVariablesSectionImpl(
  options: Partial<UserDefaultGlobalVariablesSectionImpl> = {},
): UserDefaultGlobalVariablesSectionImpl {
  return UserDefaultGlobalVariablesSectionImplSchema.parse(options);
}

const UserDefaultGroupSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isHorizontalOrientation: z.boolean().default(false),
  overflowMode: z.boolean().default(false),
  defaultChildSectionType: z
    .enum(SectionTypeEnum)
    .default(SectionTypeEnum.Callable),
});

type UserDefaultGroupSectionImpl = z.infer<
  typeof UserDefaultGroupSectionImplSchema
>;

function createUserDefaultGroupSectionImpl(
  options: Partial<UserDefaultGroupSectionImpl> = {},
): UserDefaultGroupSectionImpl {
  return UserDefaultGroupSectionImplSchema.parse(options);
}

const UserDefaultIFrameSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

type UserDefaultIFrameSectionImpl = z.infer<
  typeof UserDefaultIFrameSectionImplSchema
>;

function createUserDefaultIFrameSectionImpl(
  options: Partial<UserDefaultIFrameSectionImpl> = {},
): UserDefaultIFrameSectionImpl {
  return UserDefaultIFrameSectionImplSchema.parse(options);
}

const UserDefaultImageSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  imagePath: z.string().default("" as const),
});

type UserDefaultImageSectionImpl = z.infer<
  typeof UserDefaultImageSectionImplSchema
>;

function createUserDefaultImageSectionImpl(
  options: Partial<UserDefaultImageSectionImpl> = {},
): UserDefaultImageSectionImpl {
  return UserDefaultImageSectionImplSchema.parse(options);
}

const UserDefaultListRootSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  defaultChildSectionType: z
    .enum(SectionTypeEnum)
    .default(SectionTypeEnum.Callable),
  viewMode: z.enum(ListRootViewModeEnum).default(ListRootViewModeEnum.default),
});

type UserDefaultListRootSectionImpl = z.infer<
  typeof UserDefaultListRootSectionImplSchema
>;

export function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return UserDefaultListRootSectionImplSchema.parse(options);
}

const UserDefaultMetaControlSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  showSectionTitle: z.boolean().default(false),
});

type UserDefaultMetaControlSectionImpl = z.infer<
  typeof UserDefaultMetaControlSectionImplSchema
>;

function createUserDefaultMetaControlSectionImpl(
  options: Partial<UserDefaultMetaControlSectionImpl> = {},
): UserDefaultMetaControlSectionImpl {
  return UserDefaultMetaControlSectionImplSchema.parse(options);
}

const UserDefaultPluginSectionImplSchema = z.object({
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

type UserDefaultPluginSectionImpl = z.infer<
  typeof UserDefaultPluginSectionImplSchema
>;

function createUserDefaultPluginSectionImpl(
  options: Partial<UserDefaultPluginSectionImpl> = {},
): UserDefaultPluginSectionImpl {
  return UserDefaultPluginSectionImplSchema.parse(options);
}

const UserDefaultPromptSectionImplSchema = z.object({
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
  missingVariables: z.array(z.string()).default(() => []),
  renderError: z.union([z.string(), z.null()]).default(null),
});

type UserDefaultPromptSectionImpl = z.infer<
  typeof UserDefaultPromptSectionImplSchema
>;

function createUserDefaultPromptSectionImpl(
  options: Partial<UserDefaultPromptSectionImpl> = {},
): UserDefaultPromptSectionImpl {
  return UserDefaultPromptSectionImplSchema.parse(options);
}

const UserDefaultSocialSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  url: z.string().default("" as const),
});

type UserDefaultSocialSectionImpl = z.infer<
  typeof UserDefaultSocialSectionImplSchema
>;

function createUserDefaultSocialSectionImpl(
  options: Partial<UserDefaultSocialSectionImpl> = {},
): UserDefaultSocialSectionImpl {
  return UserDefaultSocialSectionImplSchema.parse(options);
}

const UserDefaultSpreadsheetSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 760.0, height: 500.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  filePath: z.string().default("" as const),
  activeSheet: z.union([z.string(), z.null()]).default(null),
  readOnly: z.boolean().default(false),
  showRowNumbers: z.boolean().default(true),
  density: z
    .enum(SpreadsheetGridDensityEnum)
    .default(SpreadsheetGridDensityEnum.compact),
  autoReloadOnExternalChange: z.boolean().default(false),
});

type UserDefaultSpreadsheetSectionImpl = z.infer<
  typeof UserDefaultSpreadsheetSectionImplSchema
>;

export function createUserDefaultSpreadsheetSectionImpl(
  options: Partial<UserDefaultSpreadsheetSectionImpl> = {},
): UserDefaultSpreadsheetSectionImpl {
  return UserDefaultSpreadsheetSectionImplSchema.parse(options);
}

const UserDefaultTaskBoardSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 720.0, height: 430.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  viewMode: z.enum(TaskBoardViewModeEnum).default(TaskBoardViewModeEnum.kanban),
  columns: z.union([z.array(TaskBoardColumnSchema), z.null()]).default(null),
  tasks: z.array(TaskBoardTaskSchema).default(() => []),
});

type UserDefaultTaskBoardSectionImpl = z.infer<
  typeof UserDefaultTaskBoardSectionImplSchema
>;

export function createUserDefaultTaskBoardSectionImpl(
  options: Partial<UserDefaultTaskBoardSectionImpl> = {},
): UserDefaultTaskBoardSectionImpl {
  return UserDefaultTaskBoardSectionImplSchema.parse(options);
}

const UserDefaultTerminalSectionImplSchema = z.object({
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

type UserDefaultTerminalSectionImpl = z.infer<
  typeof UserDefaultTerminalSectionImplSchema
>;

function createUserDefaultTerminalSectionImpl(
  options: Partial<UserDefaultTerminalSectionImpl> = {},
): UserDefaultTerminalSectionImpl {
  return UserDefaultTerminalSectionImplSchema.parse(options);
}

const UserDefaultTextBlockSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  tagColor: z.union([z.string(), z.null()]).default(null),
  styleColor: z.union([z.string(), z.null()]).default(null),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  format: z.enum(TextBlockFormatEnum).default(TextBlockFormatEnum.Plaintext),
  masterFontSizePx: z.number().default(14.0),
  headingAsSectionName: z.boolean().default(false),
  metaControlStyle: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

type UserDefaultTextBlockSectionImpl = z.infer<
  typeof UserDefaultTextBlockSectionImplSchema
>;

export function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return UserDefaultTextBlockSectionImplSchema.parse(options);
}

const UserDefaultButtonParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
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

type UserDefaultButtonParamCodeObjImpl = z.infer<
  typeof UserDefaultButtonParamCodeObjImplSchema
>;

function createUserDefaultButtonParamCodeObjImpl(
  options: Partial<UserDefaultButtonParamCodeObjImpl> = {},
): UserDefaultButtonParamCodeObjImpl {
  return UserDefaultButtonParamCodeObjImplSchema.parse(options);
}

const UserDefaultCodeCallableCodeObjImplSchema = z.object({});

type UserDefaultCodeCallableCodeObjImpl = z.infer<
  typeof UserDefaultCodeCallableCodeObjImplSchema
>;

function createUserDefaultCodeCallableCodeObjImpl(
  options: Partial<UserDefaultCodeCallableCodeObjImpl> = {},
): UserDefaultCodeCallableCodeObjImpl {
  return UserDefaultCodeCallableCodeObjImplSchema.parse(options);
}

const UserDefaultCodeParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type UserDefaultCodeParamCodeObjImpl = z.infer<
  typeof UserDefaultCodeParamCodeObjImplSchema
>;

export function createUserDefaultCodeParamCodeObjImpl(
  options: Partial<UserDefaultCodeParamCodeObjImpl> = {},
): UserDefaultCodeParamCodeObjImpl {
  return UserDefaultCodeParamCodeObjImplSchema.parse(options);
}

const UserDefaultColorPickerParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default(() => []),
});

type UserDefaultColorPickerParamCodeObjImpl = z.infer<
  typeof UserDefaultColorPickerParamCodeObjImplSchema
>;

function createUserDefaultColorPickerParamCodeObjImpl(
  options: Partial<UserDefaultColorPickerParamCodeObjImpl> = {},
): UserDefaultColorPickerParamCodeObjImpl {
  return UserDefaultColorPickerParamCodeObjImplSchema.parse(options);
}

const UserDefaultDateParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  dateDisplayFormat: z
    .enum(DateDisplayFormatEnum)
    .default(DateDisplayFormatEnum.iso),
  dateControlMode: z
    .enum(DateControlModeEnum)
    .default(DateControlModeEnum.input),
  dateSelectionMode: z
    .enum(DateSelectionModeEnum)
    .default(DateSelectionModeEnum.single),
  dateCalendarWeekStart: z
    .enum(DateCalendarWeekStartEnum)
    .default(DateCalendarWeekStartEnum.sunday),
  dateIncludesTime: z.boolean().default(false),
});

type UserDefaultDateParamCodeObjImpl = z.infer<
  typeof UserDefaultDateParamCodeObjImplSchema
>;

function createUserDefaultDateParamCodeObjImpl(
  options: Partial<UserDefaultDateParamCodeObjImpl> = {},
): UserDefaultDateParamCodeObjImpl {
  return UserDefaultDateParamCodeObjImplSchema.parse(options);
}

const UserDefaultDropdownParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default(() => []),
});

type UserDefaultDropdownParamCodeObjImpl = z.infer<
  typeof UserDefaultDropdownParamCodeObjImplSchema
>;

function createUserDefaultDropdownParamCodeObjImpl(
  options: Partial<UserDefaultDropdownParamCodeObjImpl> = {},
): UserDefaultDropdownParamCodeObjImpl {
  return UserDefaultDropdownParamCodeObjImplSchema.parse(options);
}

const UserDefaultDropzoneParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  mode: z.enum(DropzoneModeEnum).default(DropzoneModeEnum.STATEFUL),
  maxAttachments: z.union([z.int(), z.null()]).default(null),
  placeholder: z.string().default("Drop a file here" as const),
});

type UserDefaultDropzoneParamCodeObjImpl = z.infer<
  typeof UserDefaultDropzoneParamCodeObjImplSchema
>;

function createUserDefaultDropzoneParamCodeObjImpl(
  options: Partial<UserDefaultDropzoneParamCodeObjImpl> = {},
): UserDefaultDropzoneParamCodeObjImpl {
  return UserDefaultDropzoneParamCodeObjImplSchema.parse(options);
}

const UserDefaultNestedParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
});

type UserDefaultNestedParamCodeObjImpl = z.infer<
  typeof UserDefaultNestedParamCodeObjImplSchema
>;

function createUserDefaultNestedParamCodeObjImpl(
  options: Partial<UserDefaultNestedParamCodeObjImpl> = {},
): UserDefaultNestedParamCodeObjImpl {
  return UserDefaultNestedParamCodeObjImplSchema.parse(options);
}

const UserDefaultPasswordParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  hasSecret: z.boolean().default(false),
});

type UserDefaultPasswordParamCodeObjImpl = z.infer<
  typeof UserDefaultPasswordParamCodeObjImplSchema
>;

function createUserDefaultPasswordParamCodeObjImpl(
  options: Partial<UserDefaultPasswordParamCodeObjImpl> = {},
): UserDefaultPasswordParamCodeObjImpl {
  return UserDefaultPasswordParamCodeObjImplSchema.parse(options);
}

const UserDefaultRotaryParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.number().default(0),
  max: z.number().default(1),
  step: z.number().default(0.1),
});

type UserDefaultRotaryParamCodeObjImpl = z.infer<
  typeof UserDefaultRotaryParamCodeObjImplSchema
>;

function createUserDefaultRotaryParamCodeObjImpl(
  options: Partial<UserDefaultRotaryParamCodeObjImpl> = {},
): UserDefaultRotaryParamCodeObjImpl {
  return UserDefaultRotaryParamCodeObjImplSchema.parse(options);
}

const UserDefaultSliderParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

type UserDefaultSliderParamCodeObjImpl = z.infer<
  typeof UserDefaultSliderParamCodeObjImplSchema
>;

function createUserDefaultSliderParamCodeObjImpl(
  options: Partial<UserDefaultSliderParamCodeObjImpl> = {},
): UserDefaultSliderParamCodeObjImpl {
  return UserDefaultSliderParamCodeObjImplSchema.parse(options);
}

const UserDefaultSwitchParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("false" as const),
});

type UserDefaultSwitchParamCodeObjImpl = z.infer<
  typeof UserDefaultSwitchParamCodeObjImplSchema
>;

function createUserDefaultSwitchParamCodeObjImpl(
  options: Partial<UserDefaultSwitchParamCodeObjImpl> = {},
): UserDefaultSwitchParamCodeObjImpl {
  return UserDefaultSwitchParamCodeObjImplSchema.parse(options);
}

const UserDefaultTextAreaParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type UserDefaultTextAreaParamCodeObjImpl = z.infer<
  typeof UserDefaultTextAreaParamCodeObjImplSchema
>;

function createUserDefaultTextAreaParamCodeObjImpl(
  options: Partial<UserDefaultTextAreaParamCodeObjImpl> = {},
): UserDefaultTextAreaParamCodeObjImpl {
  return UserDefaultTextAreaParamCodeObjImplSchema.parse(options);
}

const UserDefaultTextParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  uiType: z
    .enum(TextParamInputUITypeEnum)
    .default(TextParamInputUITypeEnum.plain),
});

type UserDefaultTextParamCodeObjImpl = z.infer<
  typeof UserDefaultTextParamCodeObjImplSchema
>;

function createUserDefaultTextParamCodeObjImpl(
  options: Partial<UserDefaultTextParamCodeObjImpl> = {},
): UserDefaultTextParamCodeObjImpl {
  return UserDefaultTextParamCodeObjImplSchema.parse(options);
}

const UserDefaultTimeParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  timeControlMode: z
    .enum(TimeControlModeEnum)
    .default(TimeControlModeEnum.input),
  timeDisplayFormat: z
    .enum(TimeDisplayFormatEnum)
    .default(TimeDisplayFormatEnum.twenty_four_hour),
  timeDisplayTransparent: z.boolean().default(false),
  timeDisplayScale: z.number().default(1.0),
  timeDisplayFont: z
    .enum(TimeDisplayFontEnum)
    .default(TimeDisplayFontEnum.monospace),
});

type UserDefaultTimeParamCodeObjImpl = z.infer<
  typeof UserDefaultTimeParamCodeObjImplSchema
>;

function createUserDefaultTimeParamCodeObjImpl(
  options: Partial<UserDefaultTimeParamCodeObjImpl> = {},
): UserDefaultTimeParamCodeObjImpl {
  return UserDefaultTimeParamCodeObjImplSchema.parse(options);
}

const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.default(createSettingsShortcuts),
  gui: SettingsGUISchema.default(createSettingsGUI),
  backend: SettingsBackendSchema.default(createSettingsBackend),
  sectionSizingPolicy: SectionSizingPolicySchema.default(
    createSectionSizingPolicy,
  ),
  languageServer: z.record(z.string(), z.any()).default(() => ({
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
  spreadsheetSectionDefault: UserDefaultSpreadsheetSectionImplSchema.default(
    createUserDefaultSpreadsheetSectionImpl,
  ),
  taskBoardSectionDefault: UserDefaultTaskBoardSectionImplSchema.default(
    createUserDefaultTaskBoardSectionImpl,
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
  dateParamCodeObjDefault: UserDefaultDateParamCodeObjImplSchema.default(
    createUserDefaultDateParamCodeObjImpl,
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
  timeParamCodeObjDefault: UserDefaultTimeParamCodeObjImplSchema.default(
    createUserDefaultTimeParamCodeObjImpl,
  ),
});

export type SettingsState = z.infer<typeof SettingsStateSchema>;

export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  return SettingsStateSchema.parse(options);
}

const WebsocketMsgUpdateSettingsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettingsStateSchema,
  messageType: z
    .literal("UpdateSettings")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateSettings),
});

const AllProjectMetadataSchema = z.object({
  defaultProjectConfigId: z.union([z.string(), z.null()]),
  projectMetadata: z.array(ProjectConfigSchema),
});

export type AllProjectMetadata = z.infer<typeof AllProjectMetadataSchema>;

const WebsocketMsgAllProjectMetadataSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AllProjectMetadataSchema,
  messageType: z
    .literal("AllProjectMetadata")
    .default(WebsocketMsgTypeForFrontendEnum.AllProjectMetadata),
});

const UpdateArtifactMsgContentSchema = z.object({
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

const WebsocketMsgUpdateArtifactsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: UpdateArtifactMsgContentSchema,
  messageType: z
    .literal("UpdateArtifacts")
    .default(WebsocketMsgTypeForFrontendEnum.UpdateArtifacts),
});

const ListenerCoverageSnapshotSchema = z.object({
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

const WebsocketMsgListenerCoverageSnapshotSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ListenerCoverageSnapshotSchema,
  messageType: z
    .literal("ListenerCoverageSnapshot")
    .default(WebsocketMsgTypeForFrontendEnum.ListenerCoverageSnapshot),
});

const LLMConfigSchema = z.object({
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

export function createLLMConfig(options: Partial<LLMConfig> = {}): LLMConfig {
  return LLMConfigSchema.parse(options);
}

const MCPServerConfigSchema = z.object({
  transport: z.literal(["sse", "streamable_http", "stdio"]),
  url: z.union([z.string(), z.null()]).default(null),
  command: z.union([z.string(), z.null()]).default(null),
  args: z.array(z.string()).default(() => []),
  env: z.union([z.record(z.string(), z.string()), z.null()]).default(null),
  http_headers: z
    .union([z.record(z.string(), z.string()), z.null()])
    .default(null),
  cwd: z.union([z.string(), z.null()]).default(null),
  encoding: z.string().default("utf-8" as const),
  encoding_error_handler: z
    .literal(["strict", "ignore", "replace"])
    .default("strict" as const),
});

const AllLLMConfigsSchema = z.object({
  configs: z.record(z.string(), LLMConfigSchema).default({}),
  mcpServers: z.record(z.string(), MCPServerConfigSchema).default({}),
  defaultMcpServerIds: z.array(z.string()).default(() => []),
  default_config_id: z.union([z.string(), z.null()]).default(null),
  codexMcpImportedAt: z.union([z.string(), z.null()]).default(null),
});

export type AllLLMConfigs = z.infer<typeof AllLLMConfigsSchema>;

export type AllLLMConfigsInput = z.input<typeof AllLLMConfigsSchema>;

export function createAllLLMConfigs(
  options: Partial<AllLLMConfigs> = {},
): AllLLMConfigs {
  return AllLLMConfigsSchema.parse(options);
}

const WebsocketMsgLLMConfigUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AllLLMConfigsSchema,
  messageType: z
    .literal("LLMConfigUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMConfigUpdated),
});

const ManagedAPIKeysSnapshotSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
  revision: z.int(),
  corrupt: z.boolean().default(false),
  errorCode: z.union([z.string(), z.null()]).default(null),
  message: z.union([z.string(), z.null()]).default(null),
});

const WebsocketMsgLLMApiKeysUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ManagedAPIKeysSnapshotSchema,
  messageType: z
    .literal("LLMApiKeysUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMApiKeysUpdated),
});

const AgentProfileSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  description: z.string().default("" as const),
  systemPrompt: z.string().default("" as const),
  enableBackgroundSummaryFill: z.boolean().default(false),
  enableLlmChatTitles: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  toolAllowlist: z.array(z.string()).default(() => []),
  memoryScope: z.union([z.string(), z.null()]).default(null),
});

export type AgentProfile = z.infer<typeof AgentProfileSchema>;

const AgentProfileListSchema = z.object({
  profiles: z.array(AgentProfileSchema),
});

const WebsocketMsgAgentProfilesUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AgentProfileListSchema,
  messageType: z
    .literal("AgentProfilesUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.AgentProfilesUpdated),
});

const PromptTemplateSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  description: z.string().default("" as const),
  template: z.string(),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputSchema: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

const PromptTemplateListSchema = z.object({
  templates: z.array(PromptTemplateSchema),
});

const WebsocketMsgPromptTemplatesUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: PromptTemplateListSchema,
  messageType: z
    .literal("PromptTemplatesUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.PromptTemplatesUpdated),
});

const ClaudeSettingsPermissionsSchema = z.object({
  allow: z.array(z.string()).default(() => []),
  ask: z.array(z.string()).default(() => []),
  deny: z.array(z.string()).default(() => []),
});

const ClaudeSettingsManagedSchema = z.object({
  permissions: z
    .union([ClaudeSettingsPermissionsSchema, z.null()])
    .default(null),
  defaultMode: z.union([z.string(), z.null()]).default(null),
  mcp: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

const CodexSettingsManagedSchema = z.object({
  approvalPolicy: z.union([z.string(), z.null()]).default(null),
  sandboxMode: z.union([z.string(), z.null()]).default(null),
  enabledTools: z.union([z.array(z.string()), z.null()]).default(null),
  model: z.union([z.string(), z.null()]).default(null),
});

const OpenCodeSettingsManagedSchema = z.object({
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

const ExternalAgentSettingsManagedBlockSchema = z.object({
  claude: z.union([ClaudeSettingsManagedSchema, z.null()]).default(null),
  codex: z.union([CodexSettingsManagedSchema, z.null()]).default(null),
  opencode: z.union([OpenCodeSettingsManagedSchema, z.null()]).default(null),
});

const ExternalAgentConfigSchema = z.object({
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
  envVarWhitelist: z.array(z.string()).default(() => []),
  workingDirStrategy: z
    .enum(ExternalAgentWorkingDirStrategyEnum)
    .default(ExternalAgentWorkingDirStrategyEnum.project_root),
  workingDir: z.union([z.string(), z.null()]).default(null),
  codexSkipGitRepoCheck: z.union([z.boolean(), z.null()]).default(null),
});

export type ExternalAgentConfig = z.infer<typeof ExternalAgentConfigSchema>;

const ExternalAgentConfigListSchema = z.object({
  configs: z.array(ExternalAgentConfigSchema),
});

const WebsocketMsgExternalAgentConfigsUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ExternalAgentConfigListSchema,
  messageType: z
    .literal("ExternalAgentConfigsUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.ExternalAgentConfigsUpdated),
});

const EngineConfigDefaultsSchema = z.object({
  thinking: z.union([z.boolean(), z.null()]).default(null),
});

type EngineConfigDefaults = z.infer<typeof EngineConfigDefaultsSchema>;

function createEngineConfigDefaults(
  options: Partial<EngineConfigDefaults> = {},
): EngineConfigDefaults {
  return EngineConfigDefaultsSchema.parse(options);
}

const EngineConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  engineType: z.enum(EngineTypeEnum),
  settaLlmConfigId: z.union([z.string(), z.null()]).default(null),
  externalAgentConfigId: z.union([IDSchema, z.null()]).default(null),
  defaults: EngineConfigDefaultsSchema.default(createEngineConfigDefaults),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export function createEngineConfig(
  options: Partial<EngineConfig> = {},
): EngineConfig {
  return EngineConfigSchema.parse(options);
}

const EngineConfigListSchema = z.object({
  configs: z.array(EngineConfigSchema),
});

const WebsocketMsgEngineConfigsUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: EngineConfigListSchema,
  messageType: z
    .literal("EngineConfigsUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.EngineConfigsUpdated),
});

const TranscriptionProfileSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  transcriptionLlmConfigId: z.string(),
  transportMode: z.enum(TranscriptionTransportModeEnum),
  chunkMs: z.int(),
  supportsRealtimeTranscription: z.boolean().default(false),
  language: z.union([z.string(), z.null()]).default(null),
});

export type TranscriptionProfile = z.infer<typeof TranscriptionProfileSchema>;

const TranscriptionProfileListSchema = z.object({
  profiles: z.array(TranscriptionProfileSchema),
});

const WebsocketMsgTranscriptionProfilesUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: TranscriptionProfileListSchema,
  messageType: z
    .literal("TranscriptionProfilesUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.TranscriptionProfilesUpdated),
});

const AIFollowToolArgumentsUpdateContentSchema = z.object({
  projectConfigId: IDSchema,
  chatId: IDSchema,
  idsByType: z.record(z.literal(["section", "codeObj"]), z.array(IDSchema)),
});

export type AIFollowToolArgumentsUpdateContent = z.infer<
  typeof AIFollowToolArgumentsUpdateContentSchema
>;

const WebsocketMsgAIFollowToolArgumentsUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AIFollowToolArgumentsUpdateContentSchema,
  messageType: z
    .literal("AIFollowToolArgumentsUpdate")
    .default(WebsocketMsgTypeForFrontendEnum.AIFollowToolArgumentsUpdate),
});

const AIFollowToolResultUpdateContentSchema = z.object({
  projectConfigId: IDSchema,
  chatId: IDSchema,
  idsByType: z.record(z.literal(["section", "codeObj"]), z.array(IDSchema)),
});

export type AIFollowToolResultUpdateContent = z.infer<
  typeof AIFollowToolResultUpdateContentSchema
>;

const WebsocketMsgAIFollowToolResultUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AIFollowToolResultUpdateContentSchema,
  messageType: z
    .literal("AIFollowToolResultUpdate")
    .default(WebsocketMsgTypeForFrontendEnum.AIFollowToolResultUpdate),
});

const UISettingRevealActivationStepSchema = z.object({
  type: z.literal([
    "project_ai_settings_accordion_item",
    "run_instructions_accordion_item",
  ]),
  itemValue: z.string(),
});

const UISettingRevealTargetSchema = z.object({
  settingId: z.string(),
  side: z.literal(["left", "right"]),
  overviewTabKey: z.union([z.string(), z.null()]).default(null),
  uiEditorTabName: z.union([z.string(), z.null()]).default(null),
  pluginId: z.union([z.string(), z.null()]).default(null),
  paneId: z.union([z.string(), z.null()]).default(null),
  strategy: z.literal(["dom_anchor", "plugin_handler"]),
  anchorId: z.union([z.string(), z.null()]).default(null),
  pluginRevealKey: z.union([z.string(), z.null()]).default(null),
  revealActivationSteps: z
    .array(UISettingRevealActivationStepSchema)
    .default(() => []),
});

export type UISettingRevealTarget = z.infer<typeof UISettingRevealTargetSchema>;

export const UISettingRevealContentSchema = z.object({
  projectConfigId: IDSchema,
  chatId: z.union([IDSchema, z.null()]).default(null),
  activeSectionId: z.union([IDSchema, z.null()]).default(null),
  reveals: z.array(UISettingRevealTargetSchema),
  durationMs: z.int().default(3000),
  requestId: z.string(),
});

export type UISettingRevealContent = z.infer<
  typeof UISettingRevealContentSchema
>;

const WebsocketMsgUISettingRevealSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: UISettingRevealContentSchema,
  messageType: z
    .literal("UISettingReveal")
    .default(WebsocketMsgTypeForFrontendEnum.UISettingReveal),
});

const FrontendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgFrontendIdentitySchema,
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
  WebsocketMsgTranscriptionProfilesUpdatedSchema,
  WebsocketMsgAIFollowToolArgumentsUpdateSchema,
  WebsocketMsgAIFollowToolResultUpdateSchema,
  WebsocketMsgUISettingRevealSchema,
]);

export type FrontendWebsocketMsgUnion = z.infer<
  typeof FrontendWebsocketMsgUnionSchema
>;

const GitDiffModeSchema = z.literal(["unstaged", "staged"]);

export type GitDiffMode = z.infer<typeof GitDiffModeSchema>;

const ProjectCodegenTargetSchema = z.union([
  ProjectCodegenPythonTargetSchema,
  ProjectCodegenPluginTargetSchema,
]);

export type ProjectCodegenTarget = z.infer<typeof ProjectCodegenTargetSchema>;

const BaseCanvasSectionImplArgsSchema = z.object({
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

type BaseCanvasSectionImplArgs = z.infer<
  typeof BaseCanvasSectionImplArgsSchema
>;

const BaseChildlessCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type BaseChildlessCodeObjImplArgs = z.infer<
  typeof BaseChildlessCodeObjImplArgsSchema
>;

const BaseCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
});

type BaseCodeObjImplArgs = z.infer<typeof BaseCodeObjImplArgsSchema>;

const BaseCodeSectionImplArgsSchema = z.object({
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

type BaseCodeSectionImplArgs = z.infer<typeof BaseCodeSectionImplArgsSchema>;

const BaseDictSectionImplArgsSchema = z.object({
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

type BaseDictSectionImplArgs = z.infer<typeof BaseDictSectionImplArgsSchema>;

const BaseParamCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  typeAnnotation: z.string().optional(),
});

type BaseParamCodeObjImplArgs = z.infer<typeof BaseParamCodeObjImplArgsSchema>;

const BaseParentCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

type BaseParentCodeObjImplArgs = z.infer<
  typeof BaseParentCodeObjImplArgsSchema
>;

const BaseParentSectionImplArgsSchema = z.object({
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

type BaseParentSectionImplArgs = z.infer<
  typeof BaseParentSectionImplArgsSchema
>;

const BaseSectionImplArgsSchema = z.object({
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

type BaseSectionImplArgs = z.infer<typeof BaseSectionImplArgsSchema>;

const BaseSectionWithParamsImplArgsSchema = z.object({
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

type BaseSectionWithParamsImplArgs = z.infer<
  typeof BaseSectionWithParamsImplArgsSchema
>;

const FolderContentItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  fullPath: z.string(),
  mtime: z.number().optional(),
  size: z.int().optional(),
  isSettaInitialized: z.boolean().optional(),
});

export type FolderContentItem = z.infer<typeof FolderContentItemSchema>;

const RunEventSchema = z.object({
  id: IDSchema.default(create_new_id),
  timestamp: z.iso.datetime().default(get_now_timestamp),
  type: z.string(),
  payload: z.record(z.string(), z.any()).default({}),
});

const AgentRunSchema = z.object({
  id: IDSchema.default(create_new_id),
  profileId: z.union([IDSchema, z.null()]).default(null),
  status: z.enum(AgentRunStatusEnum).default(AgentRunStatusEnum.queued),
  startedAt: z.union([z.iso.datetime(), z.null()]).default(null),
  finishedAt: z.union([z.iso.datetime(), z.null()]).default(null),
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  outputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  toolCalls: z.array(z.record(z.string(), z.any())).default(() => []),
  cost: z.union([z.number(), z.null()]).default(null),
  events: z.array(RunEventSchema).default(() => []),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

export function createAgentRun(options: Partial<AgentRun> = {}): AgentRun {
  return AgentRunSchema.parse(options);
}

const RunChainStepSchema = z.object({
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

const RunChainSpecSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default("" as const),
  steps: z.array(RunChainStepSchema),
  stopOnFailure: z.boolean().default(true),
});

const AgenticSummaryCacheStatusSchema = z.object({
  maxSummariesPerRun: z.int(),
  summarySectionIds: z.array(IDSchema).default(() => []),
  cachedSectionIds: z.array(IDSchema).default(() => []),
  missingSectionIds: z.array(IDSchema).default(() => []),
  emptySourceSectionIds: z.array(IDSchema).default(() => []),
  consideredSectionIds: z.array(IDSchema).default(() => []),
  wouldAttemptSectionIds: z.array(IDSchema).default(() => []),
});

export type AgenticSummaryCacheStatus = z.infer<
  typeof AgenticSummaryCacheStatusSchema
>;

const AppRouteSchema = z.object({
  path: z.string(),
  name: z.union([z.string(), z.null()]).default(null),
  rootKey: z.union([z.string(), z.null()]).default(null),
});

export type AppRoute = z.infer<typeof AppRouteSchema>;

const AppDefinitionSchema = z.object({
  appSpecVersion: z.string().default("v1" as const),
  catalogId: z.string().default("setta.app.default" as const),
  appSpecPath: z.union([z.string(), z.null()]).default(null),
  routes: z.array(AppRouteSchema).default(() => []),
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
    .default(() => []),
});

export type AppDefinition = z.infer<typeof AppDefinitionSchema>;

export function createAppDefinition(
  options: Partial<AppDefinition> = {},
): AppDefinition {
  return AppDefinitionSchema.parse(options);
}

const AppDeploymentMetadataSchema = z.object({
  deploymentName: z.string(),
  deploymentVersion: z.string(),
  defaultProjectConfigId: IDSchema,
  defaultProjectConfigName: z.string(),
  createdAt: z.iso.datetime(),
  deploymentRoot: z.string(),
  policyPath: z.string(),
});

export type AppDeploymentMetadata = z.infer<typeof AppDeploymentMetadataSchema>;

const SharePolicySchema = z.object({
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

export function createSharePolicy(
  options: Partial<SharePolicy> = {},
): SharePolicy {
  return SharePolicySchema.parse(options);
}

const DeploymentListenerConfigSchema = z.object({
  entrypoint: z.string(),
  enabled: z.boolean().default(true),
});

const DeploymentManifestSchema = z.object({
  version: z.int(),
  deploymentName: z.string(),
  deploymentType: z.enum(DeploymentTypeEnum),
  defaultProjectConfigId: IDSchema,
  deploymentVersion: z.string(),
  createdAt: z.iso.datetime().default(get_now_timestamp),
  listener: z.union([DeploymentListenerConfigSchema, z.null()]).default(null),
});

const AppDeploymentSessionResponseSchema = z.object({
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

const AppDeploymentStateResponseSchema = z.object({
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

const AppCapabilitiesSchema = z.object({
  catalogId: z.string(),
  catalogVersion: z.string(),
  appSpecVersion: z.string(),
  themeSchemaVersion: z.string(),
  features: z.record(z.string(), z.boolean()).default({}),
});

const AppValidationIssueSchema = z.object({
  message: z.string(),
  elementKey: z.union([z.string(), z.null()]).default(null),
  elementType: z.union([z.string(), z.null()]).default(null),
});

const ChatSchema = z.object({
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

const ChatMetadataSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

const AppendChatMessagesRequestSchema = z.object({
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

export type AppendChatMessagesRequestInput = z.input<
  typeof AppendChatMessagesRequestSchema
>;

const CreateChatRequestSchema = z.object({
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  firstMessage: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
});

export type CreateChatRequestInput = z.input<typeof CreateChatRequestSchema>;

const DeleteChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type DeleteChatRequestInput = z.input<typeof DeleteChatRequestSchema>;

const EmitChatStreamDeltaRequestSchema = z.object({
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

export type EmitChatStreamDeltaRequestInput = z.input<
  typeof EmitChatStreamDeltaRequestSchema
>;

const GetAllChatMetadataRequestSchema = z.object({});

export type GetAllChatMetadataRequestInput = z.input<
  typeof GetAllChatMetadataRequestSchema
>;

const GetChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type GetChatRequestInput = z.input<typeof GetChatRequestSchema>;

const RunMcpToolsRequestSchema = z.object({
  chatId: IDSchema,
  sectionId: IDSchema,
  frontendAffinityToken: z.union([z.string(), z.null()]).default(null),
  toolCalls: z.array(ToolCallSchema),
});

export type RunMcpToolsRequestInput = z.input<typeof RunMcpToolsRequestSchema>;

const SetChatSystemPromptRequestSchema = z.object({
  chatId: IDSchema,
  systemPrompt: z.string(),
});

export type SetChatSystemPromptRequestInput = z.input<
  typeof SetChatSystemPromptRequestSchema
>;

const BaseChildlessCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type BaseChildlessCodeObjImpl = z.infer<typeof BaseChildlessCodeObjImplSchema>;

const BaseCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
});

type BaseCodeObjImpl = z.infer<typeof BaseCodeObjImplSchema>;

const BaseParamCodeObjImplSchema = z.object({
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
  typeAnnotation: z.string().default("" as const),
});

type BaseParamCodeObjImpl = z.infer<typeof BaseParamCodeObjImplSchema>;

const BaseParentCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default(() => []),
});

type BaseParentCodeObjImpl = z.infer<typeof BaseParentCodeObjImplSchema>;

const BaseSectionImplSchema = z.object({
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

type BaseSectionImpl = z.infer<typeof BaseSectionImplSchema>;

const ExternalAgentEnvVarStatusSchema = z.object({
  present: z.array(z.string()).default(() => []),
  missing: z.array(z.string()).default(() => []),
});

type ExternalAgentEnvVarStatus = z.infer<
  typeof ExternalAgentEnvVarStatusSchema
>;

function createExternalAgentEnvVarStatus(
  options: Partial<ExternalAgentEnvVarStatus> = {},
): ExternalAgentEnvVarStatus {
  return ExternalAgentEnvVarStatusSchema.parse(options);
}

const ExternalAgentPreflightStatusSchema = z.object({
  configId: IDSchema,
  name: z.string(),
  toolType: z.enum(ExternalAgentToolTypeEnum),
  runMode: z.enum(ExternalAgentRunModeEnum),
  supported: z.boolean(),
  available: z.boolean(),
  issues: z.array(z.string()).default(() => []),
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

export function createExternalAgentPreflightStatus(
  options: Partial<ExternalAgentPreflightStatus> = {},
): ExternalAgentPreflightStatus {
  return ExternalAgentPreflightStatusSchema.parse(options);
}

const BaseCanvasSectionImplSchema = z.object({
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

type BaseCanvasSectionImpl = z.infer<typeof BaseCanvasSectionImplSchema>;

const BaseCodeSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  attachedTerminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

type BaseCodeSectionImpl = z.infer<typeof BaseCodeSectionImplSchema>;

const BaseDictSectionImplSchema = z.object({
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
  pinnedParams: z.array(IDSchema).default(() => []),
  selectedParams: z.array(IDSchema).default(() => []),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default(() => []),
  jsonSourceMissing: z.boolean().default(false),
});

type BaseDictSectionImpl = z.infer<typeof BaseDictSectionImplSchema>;

const BaseParentSectionImplSchema = z.object({
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
  children: z.array(IDSchema).default(() => []),
});

type BaseParentSectionImpl = z.infer<typeof BaseParentSectionImplSchema>;

const BaseSectionWithParamsImplSchema = z.object({
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
  pinnedParams: z.array(IDSchema).default(() => []),
  selectedParams: z.array(IDSchema).default(() => []),
  ignoreTypeErrors: TypeErrorIgnoreStateSchema.default(
    createTypeErrorIgnoreState,
  ),
  edgeInputParams: z.array(IDSchema).default(() => []),
  edgeOutputPorts: z.array(EdgePortSchema).default(() => []),
});

export type BaseSectionWithParamsImpl = z.infer<
  typeof BaseSectionWithParamsImplSchema
>;

const GetGitCommitDetailsRequestSchema = z.object({
  commitHash: z.string(),
});

export type GetGitCommitDetailsRequestInput = z.input<
  typeof GetGitCommitDetailsRequestSchema
>;

const GitCommitChangedFileSchema = z.object({
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
  status: z.string(),
  additions: z.union([z.int(), z.null()]).default(null),
  deletions: z.union([z.int(), z.null()]).default(null),
});

export type GitCommitChangedFile = z.infer<typeof GitCommitChangedFileSchema>;

export function createGitCommitChangedFile(
  options: Partial<GitCommitChangedFile> = {},
): GitCommitChangedFile {
  return GitCommitChangedFileSchema.parse(options);
}

const GetGitCommitDetailsResponseSchema = z.object({
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

export function createGetGitCommitDetailsResponse(
  options: Partial<GetGitCommitDetailsResponse> = {},
): GetGitCommitDetailsResponse {
  return GetGitCommitDetailsResponseSchema.parse(options);
}

const GetGitCommitFileDiffRequestSchema = z.object({
  commitHash: z.string(),
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
});

export type GetGitCommitFileDiffRequestInput = z.input<
  typeof GetGitCommitFileDiffRequestSchema
>;

const GetGitCommitFileDiffResponseSchema = z.object({
  repoRoot: z.string(),
  commitHash: z.string(),
  path: z.string(),
  diff: z.string(),
  isTruncated: z.boolean(),
});

export type GetGitCommitFileDiffResponse = z.infer<
  typeof GetGitCommitFileDiffResponseSchema
>;

const GetGitDiffRequestSchema = z.object({
  path: z.string(),
  mode: z.literal(["unstaged", "staged"]),
  oldPath: z.union([z.string(), z.null()]).default(null),
});

export type GetGitDiffRequestInput = z.input<typeof GetGitDiffRequestSchema>;

const GetGitDiffResponseSchema = z.object({
  repoRoot: z.string(),
  path: z.string(),
  mode: z.literal(["unstaged", "staged"]),
  diff: z.string(),
  isTruncated: z.boolean(),
});

export type GetGitDiffResponse = z.infer<typeof GetGitDiffResponseSchema>;

const GetGitLogRequestSchema = z.object({
  rev: z.string().default("HEAD" as const),
  allRefs: z.boolean().default(false),
  offset: z.int().default(0),
  pageSize: z.int().default(250),
});

export type GetGitLogRequestInput = z.input<typeof GetGitLogRequestSchema>;

const GitCommitSchema = z.object({
  hash: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authorTimeMs: z.int(),
  subject: z.string(),
  decorations: z.array(z.string()).default(() => []),
});

export type GitCommit = z.infer<typeof GitCommitSchema>;

export function createGitCommit(options: Partial<GitCommit> = {}): GitCommit {
  return GitCommitSchema.parse(options);
}

const GetGitLogResponseSchema = z.object({
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

export function createGetGitLogResponse(
  options: Partial<GetGitLogResponse> = {},
): GetGitLogResponse {
  return GetGitLogResponseSchema.parse(options);
}

const GitRepoInfoResponseSchema = z.object({
  isGitRepo: z.boolean(),
  repoRoot: z.union([z.string(), z.null()]).default(null),
  headBranch: z.union([z.string(), z.null()]).default(null),
  headCommit: z.union([z.string(), z.null()]).default(null),
});

const GitStatusEntrySchema = z.object({
  path: z.string(),
  oldPath: z.union([z.string(), z.null()]).default(null),
  indexStatus: z.string(),
  worktreeStatus: z.string(),
  kind: z.literal(["conflict", "staged", "unstaged", "untracked"]),
});

export type GitStatusEntry = z.infer<typeof GitStatusEntrySchema>;

export function createGitStatusEntry(
  options: Partial<GitStatusEntry> = {},
): GitStatusEntry {
  return GitStatusEntrySchema.parse(options);
}

const GetGitStatusResponseSchema = z.object({
  repo: GitRepoInfoResponseSchema,
  entries: z.array(GitStatusEntrySchema),
  isTruncated: z.boolean().default(false),
});

export type GetGitStatusResponse = z.infer<typeof GetGitStatusResponseSchema>;

const ChatSectionStateSchema = z.object({
  messages: z
    .array(
      z.union([
        SystemChatMessageSchema,
        AssistantChatMessageSchema,
        UserChatMessageSchema,
        ToolChatMessageSchema,
      ]),
    )
    .default(() => []),
  inputText: z.string().default("" as const),
  waitingForResponse: z.boolean().default(false),
  toolCallArguments: z.record(z.string(), z.string()).default({}),
  activeBranchId: z.union([IDSchema, z.null()]).default(null),
  branches: z.record(IDSchema, ChatSectionBranchSchema).default({}),
});

export type ChatSectionState = z.infer<typeof ChatSectionStateSchema>;

const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export type Position = z.infer<typeof PositionSchema>;

const ViewportBoundsSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  w: z.number().default(0),
  h: z.number().default(0),
});

export type ViewportBounds = z.infer<typeof ViewportBoundsSchema>;

const ListenerCoverageRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ListenerCoverageRequestInput = z.input<
  typeof ListenerCoverageRequestSchema
>;

const GetMCPServerRuntimeStatusRequestSchema = z.object({
  chatId: z.union([IDSchema, z.null()]).default(null),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type GetMCPServerRuntimeStatusRequestInput = z.input<
  typeof GetMCPServerRuntimeStatusRequestSchema
>;

const MCPServerRuntimeStatusSchema = z.object({
  serverId: z.string(),
  source: z.string().default("setta_mcp" as const),
  transport: z.string(),
  endpoint: z.string(),
  state: z
    .enum(MCPServerRuntimeStateEnum)
    .default(MCPServerRuntimeStateEnum.unknown),
  lastAttemptAt: z.union([z.iso.datetime(), z.null()]).default(null),
  lastConnectedAt: z.union([z.iso.datetime(), z.null()]).default(null),
  lastFailureAt: z.union([z.iso.datetime(), z.null()]).default(null),
  consecutiveFailures: z.int().default(0),
  lastError: z.union([z.string(), z.null()]).default(null),
  missingEnvVar: z.union([z.string(), z.null()]).default(null),
  toolCount: z.int().default(0),
});

const MCPServerRuntimeStatusResponseSchema = z.object({
  llmConfigPath: z.string(),
  activeSettaFilesLocation: z.union([z.string(), z.null()]),
  servers: z.array(MCPServerRuntimeStatusSchema).default(() => []),
  externalServers: z.array(MCPServerRuntimeStatusSchema).default(() => []),
});

export type MCPServerRuntimeStatusResponse = z.infer<
  typeof MCPServerRuntimeStatusResponseSchema
>;

const ServerModeResponseSchema = z.object({
  mode: z.literal(["ide", "share", "app", "launcher"]),
});

export type ServerModeResponse = z.infer<typeof ServerModeResponseSchema>;

const ShareDeploymentMetadataSchema = z.object({
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

const ShareDeploymentSessionResponseSchema = z.object({
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

const WebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type WebsocketMsg = z.infer<typeof WebsocketMsgSchema>;

const CreateAgentProfileRequestSchema = z.object({
  name: z.string(),
  description: z.string().default("" as const),
  systemPrompt: z.string().default("" as const),
  enableBackgroundSummaryFill: z.boolean().default(false),
  enableLlmChatTitles: z.boolean().default(false),
  engineConfigId: z.union([IDSchema, z.null()]).default(null),
  toolAllowlist: z.array(z.string()).default(() => []),
  memoryScope: z.union([z.string(), z.null()]).default(null),
});

export type CreateAgentProfileRequestInput = z.input<
  typeof CreateAgentProfileRequestSchema
>;

const CreateEngineConfigRequestSchema = z.object({
  name: z.string(),
  engineType: z.enum(EngineTypeEnum),
  settaLlmConfigId: z.union([z.string(), z.null()]).default(null),
  externalAgentConfigId: z.union([IDSchema, z.null()]).default(null),
  defaults: EngineConfigDefaultsSchema.default(createEngineConfigDefaults),
});

export type CreateEngineConfigRequestInput = z.input<
  typeof CreateEngineConfigRequestSchema
>;

const CreateExternalAgentConfigRequestSchema = z.object({
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
  envVarWhitelist: z.array(z.string()).default(() => []),
  workingDirStrategy: z
    .enum(ExternalAgentWorkingDirStrategyEnum)
    .default(ExternalAgentWorkingDirStrategyEnum.project_root),
  workingDir: z.union([z.string(), z.null()]).default(null),
});

export type CreateExternalAgentConfigRequestInput = z.input<
  typeof CreateExternalAgentConfigRequestSchema
>;

const CreatePromptTemplateRequestSchema = z.object({
  name: z.string(),
  description: z.string().default("" as const),
  template: z.string(),
  format: z.enum(PromptFormatEnum).default(PromptFormatEnum.Jinja),
  inputSchema: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type CreatePromptTemplateRequestInput = z.input<
  typeof CreatePromptTemplateRequestSchema
>;

const CreateTranscriptionProfileRequestSchema = z.object({
  name: z.string(),
  transcriptionLlmConfigId: z.string(),
  transportMode: z.enum(TranscriptionTransportModeEnum),
  chunkMs: z.int(),
  language: z.union([z.string(), z.null()]).default(null),
});

export type CreateTranscriptionProfileRequestInput = z.input<
  typeof CreateTranscriptionProfileRequestSchema
>;

const DeleteAgentProfileRequestSchema = z.object({
  profileId: IDSchema,
});

export type DeleteAgentProfileRequestInput = z.input<
  typeof DeleteAgentProfileRequestSchema
>;

const DeleteEngineConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type DeleteEngineConfigRequestInput = z.input<
  typeof DeleteEngineConfigRequestSchema
>;

const DeleteExternalAgentConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type DeleteExternalAgentConfigRequestInput = z.input<
  typeof DeleteExternalAgentConfigRequestSchema
>;

const DeletePromptTemplateRequestSchema = z.object({
  templateId: IDSchema,
});

export type DeletePromptTemplateRequestInput = z.input<
  typeof DeletePromptTemplateRequestSchema
>;

const DeleteTranscriptionProfileRequestSchema = z.object({
  profileId: IDSchema,
});

export type DeleteTranscriptionProfileRequestInput = z.input<
  typeof DeleteTranscriptionProfileRequestSchema
>;

const GetAgentProfileRequestSchema = z.object({
  profileId: IDSchema,
});

export type GetAgentProfileRequestInput = z.input<
  typeof GetAgentProfileRequestSchema
>;

const GetAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type GetAgentRunRequestInput = z.input<typeof GetAgentRunRequestSchema>;

const GetAgenticSummaryCacheStatusRequestSchema = z.object({
  projectConfigId: IDSchema,
  chatSectionId: IDSchema,
});

export type GetAgenticSummaryCacheStatusRequestInput = z.input<
  typeof GetAgenticSummaryCacheStatusRequestSchema
>;

const GetEngineConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type GetEngineConfigRequestInput = z.input<
  typeof GetEngineConfigRequestSchema
>;

const GetExternalAgentConfigRequestSchema = z.object({
  configId: IDSchema,
});

export type GetExternalAgentConfigRequestInput = z.input<
  typeof GetExternalAgentConfigRequestSchema
>;

const GetPromptTemplateRequestSchema = z.object({
  templateId: IDSchema,
});

export type GetPromptTemplateRequestInput = z.input<
  typeof GetPromptTemplateRequestSchema
>;

const PluginRegisteredExternalAgentAdapterSchema = z.object({
  adapterId: z.string(),
  pluginId: z.string(),
  name: z.string(),
  runModes: z.array(z.string()).default(() => []),
  command: z.string(),
  args: z.array(z.string()).default(() => []),
  envVarWhitelist: z.array(z.string()).default(() => []),
  defaultModel: z.union([z.string(), z.null()]).default(null),
});

const RespondExternalAgentApprovalRequestSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
});

export type RespondExternalAgentApprovalRequestInput = z.input<
  typeof RespondExternalAgentApprovalRequestSchema
>;

const RespondExternalAgentQuestionRequestSchema = z.object({
  toolCallId: z.string(),
  answers: z.record(z.string(), z.string()),
});

export type RespondExternalAgentQuestionRequestInput = z.input<
  typeof RespondExternalAgentQuestionRequestSchema
>;

const StartAgentRunRequestSchema = z.object({
  profileId: IDSchema,
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type StartAgentRunRequestInput = z.input<
  typeof StartAgentRunRequestSchema
>;

const StartRunChainRequestSchema = z.object({
  spec: RunChainSpecSchema,
  inputs: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
});

export type StartRunChainRequestInput = z.input<
  typeof StartRunChainRequestSchema
>;

const StopAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type StopAgentRunRequestInput = z.input<
  typeof StopAgentRunRequestSchema
>;

const StopExternalAgentRunRequestSchema = z.object({
  runId: IDSchema,
});

export type StopExternalAgentRunRequestInput = z.input<
  typeof StopExternalAgentRunRequestSchema
>;

const StopRunChainRequestSchema = z.object({
  runId: IDSchema,
});

export type StopRunChainRequestInput = z.input<
  typeof StopRunChainRequestSchema
>;

const UpdateAgentProfileRequestSchema = z.object({
  profile: AgentProfileSchema,
});

export type UpdateAgentProfileRequestInput = z.input<
  typeof UpdateAgentProfileRequestSchema
>;

const UpdateEngineConfigRequestSchema = z.object({
  config: EngineConfigSchema,
});

export type UpdateEngineConfigRequestInput = z.input<
  typeof UpdateEngineConfigRequestSchema
>;

const UpdateExternalAgentConfigRequestSchema = z.object({
  config: ExternalAgentConfigSchema,
});

export type UpdateExternalAgentConfigRequestInput = z.input<
  typeof UpdateExternalAgentConfigRequestSchema
>;

const UpdatePromptTemplateRequestSchema = z.object({
  template: PromptTemplateSchema,
});

export type UpdatePromptTemplateRequestInput = z.input<
  typeof UpdatePromptTemplateRequestSchema
>;

const UpdateTranscriptionProfileRequestSchema = z.object({
  profile: TranscriptionProfileSchema,
});

export type UpdateTranscriptionProfileRequestInput = z.input<
  typeof UpdateTranscriptionProfileRequestSchema
>;

const AppendTranscriptionAudioRequestSchema = z.object({
  sessionId: IDSchema,
  audioPcm16Base64: z.string(),
  sampleRateHz: z.int(),
  channels: z.int().default(1),
});

export type AppendTranscriptionAudioRequestInput = z.input<
  typeof AppendTranscriptionAudioRequestSchema
>;

const CancelTranscriptionSessionRequestSchema = z.object({
  sessionId: IDSchema,
});

export type CancelTranscriptionSessionRequestInput = z.input<
  typeof CancelTranscriptionSessionRequestSchema
>;

const CancelTranscriptionSessionResponseSchema = z.object({
  ok: z.boolean().default(true),
});

export type CancelTranscriptionSessionResponse = z.infer<
  typeof CancelTranscriptionSessionResponseSchema
>;

const ChatContextUsageSchema = z.object({
  contextWindowTokens: z.union([z.int(), z.null()]).default(null),
  contextUsedTokens: z.union([z.int(), z.null()]).default(null),
  estimated: z.boolean().default(false),
});

const GetAIFollowSnapshotRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type GetAIFollowSnapshotRequestInput = z.input<
  typeof GetAIFollowSnapshotRequestSchema
>;

const GetExternalAgentChatRequestSchema = z.object({
  chatId: IDSchema,
  projectConfigId: z.union([IDSchema, z.null()]),
});

export type GetExternalAgentChatRequestInput = z.input<
  typeof GetExternalAgentChatRequestSchema
>;

const GetExternalAgentChatResponseSchema = z.object({
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
  contextUsage: z.union([ChatContextUsageSchema, z.null()]).default(null),
});

export type GetExternalAgentChatResponse = z.infer<
  typeof GetExternalAgentChatResponseSchema
>;

const GetLLMChatRequestSchema = z.object({
  chatId: IDSchema,
  projectConfigId: z.union([IDSchema, z.null()]),
});

export type GetLLMChatRequestInput = z.input<typeof GetLLMChatRequestSchema>;

const GetLLMChatRequestResponseSchema = z.object({
  messages: z.array(
    z.discriminatedUnion("role", [
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
  waitingForResponse: z.boolean(),
  llmConfig: z.union([LLMConfigSchema, z.null()]),
  contextUsage: z.union([ChatContextUsageSchema, z.null()]).default(null),
});

export type GetLLMChatRequestResponse = z.infer<
  typeof GetLLMChatRequestResponseSchema
>;

const GetLLMResponseRequestSchema = z.object({
  chatId: z.union([IDSchema, z.null()]),
  continueFromChatId: z.union([IDSchema, z.null()]).default(null),
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
  frontendAffinityToken: z.union([z.string(), z.null()]).default(null),
  allowUnscoped: z.boolean().default(false),
  branchParentChatId: z.union([IDSchema, z.null()]).default(null),
  branchFromMessageId: z.union([IDSchema, z.null()]).default(null),
  appSpecStreamingEnabled: z.boolean().default(false),
  permissionMode: z.enum(ChatPermissionModeEnum),
  searchEnabled: z.boolean(),
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

export type GetLLMResponseRequestInput = z.input<
  typeof GetLLMResponseRequestSchema
>;

const StartTranscriptionSessionRequestSchema = z.object({
  transcriptionProfileId: IDSchema,
  language: z.union([z.string(), z.null()]).default(null),
});

export type StartTranscriptionSessionRequestInput = z.input<
  typeof StartTranscriptionSessionRequestSchema
>;

const StartTranscriptionSessionResponseSchema = z.object({
  sessionId: IDSchema,
  resolvedTransportMode: z.literal(["file", "realtime"]),
  chunkMs: z.int(),
});

export type StartTranscriptionSessionResponse = z.infer<
  typeof StartTranscriptionSessionResponseSchema
>;

const StopLLMChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type StopLLMChatRequestInput = z.input<typeof StopLLMChatRequestSchema>;

const StopLLMChatResponseSchema = z.object({
  alreadyStopped: z.boolean(),
  stoppedRunId: z.union([IDSchema, z.null()]).default(null),
  stoppedMessageId: z.union([IDSchema, z.null()]).default(null),
});

export type StopLLMChatResponse = z.infer<typeof StopLLMChatResponseSchema>;

const StopTranscriptionSessionRequestSchema = z.object({
  sessionId: IDSchema,
});

export type StopTranscriptionSessionRequestInput = z.input<
  typeof StopTranscriptionSessionRequestSchema
>;

const TranscriptionSessionDeltaResponseSchema = z.object({
  appendText: z.string(),
  fullText: z.string(),
  isFinal: z.boolean(),
});

export type TranscriptionSessionDeltaResponse = z.infer<
  typeof TranscriptionSessionDeltaResponseSchema
>;

const AppPolicyOverridesSchema = z.object({
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

const LoadAppProjectConfigRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type LoadAppProjectConfigRequestInput = z.input<
  typeof LoadAppProjectConfigRequestSchema
>;

const PublishAppDeploymentRequestSchema = z.object({
  deploymentName: z.string(),
  projectConfigId: IDSchema,
  appPolicyOverrides: z
    .union([AppPolicyOverridesSchema, z.null()])
    .default(null),
  listenerEntrypoint: z.union([z.string(), z.null()]).default(null),
  listenerEnabled: z.boolean().default(true),
});

export type PublishAppDeploymentRequestInput = z.input<
  typeof PublishAppDeploymentRequestSchema
>;

const AppGenSkillContentSchema = z.object({
  skillId: z.string(),
  content: z.string(),
  truncated: z.boolean().default(false),
  originalSizeBytes: z.int(),
});

export type AppGenSkillContent = z.infer<typeof AppGenSkillContentSchema>;

const AppGenSkillEntrySchema = z.object({
  skillId: z.string(),
  name: z.string(),
  rootLabel: z.string(),
  rootPath: z.string(),
  relativePath: z.string(),
  isEditable: z.boolean(),
  editabilityReason: z.union([z.string(), z.null()]).default(null),
  description: z.string().default("" as const),
});

export type AppGenSkillEntry = z.infer<typeof AppGenSkillEntrySchema>;

const GetAppGenSkillContentRequestSchema = z.object({
  skillId: z.string(),
});

export type GetAppGenSkillContentRequestInput = z.input<
  typeof GetAppGenSkillContentRequestSchema
>;

const UpsertAppGenCustomSkillRequestSchema = z.object({
  skillId: z.union([z.string(), z.null()]).default(null),
  relativePath: z.union([z.string(), z.null()]).default(null),
  content: z.string(),
});

export type UpsertAppGenCustomSkillRequestInput = z.input<
  typeof UpsertAppGenCustomSkillRequestSchema
>;

const UpsertAppGenCustomSkillResponseSchema = z.object({
  skillId: z.string(),
  created: z.boolean(),
  rootPath: z.string(),
  skillDocPath: z.string(),
});

export type UpsertAppGenCustomSkillResponse = z.infer<
  typeof UpsertAppGenCustomSkillResponseSchema
>;

const StreamAppSpecRequestSchema = z.object({
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

export type StreamAppSpecRequestInput = z.input<
  typeof StreamAppSpecRequestSchema
>;

const ArtifactSaveResultSchema = z.object({
  id: z.string(),
  type: z.enum(ArtifactTypeEnum),
  status: z.literal(["saved", "unchanged", "skipped", "conflict"]),
  backupPath: z.union([z.string(), z.null()]).default(null),
  message: z.union([z.string(), z.null()]).default(null),
});

export type ArtifactSaveResult = z.infer<typeof ArtifactSaveResultSchema>;

const CheckIfFileExistsRequestsSchema = z.object({
  filepath: z.string(),
});

export type CheckIfFileExistsRequestsInput = z.input<
  typeof CheckIfFileExistsRequestsSchema
>;

const CheckWorkspaceInitializedRequestSchema = z.object({
  folderPath: z.string(),
  allowOutsideWorkspaceRoot: z.boolean().default(false),
});

export type CheckWorkspaceInitializedRequestInput = z.input<
  typeof CheckWorkspaceInitializedRequestSchema
>;

const DeleteArtifactRequestItemSchema = z.object({
  id: z.string(),
  type: z.enum(ArtifactTypeEnum),
});

const DeleteArtifactsRequestSchema = z.object({
  artifacts: z.array(DeleteArtifactRequestItemSchema),
});

export type DeleteArtifactsRequestInput = z.input<
  typeof DeleteArtifactsRequestSchema
>;

const FileBrowserDownloadUrlEntrySchema = z.object({
  path: z.string(),
  url: z.string(),
  expiresAt: z.int(),
});

export type FileBrowserDownloadUrlEntry = z.infer<
  typeof FileBrowserDownloadUrlEntrySchema
>;

const FileBrowserFileContentResponseSchema = z.object({
  path: z.string(),
  mimeType: z.string(),
  contentId: z.string(),
  mtimeNs: z.int(),
  size: z.int(),
});

export type FileBrowserFileContentResponse = z.infer<
  typeof FileBrowserFileContentResponseSchema
>;

const FileBrowserFileStatResponseSchema = z.object({
  path: z.string(),
  mtimeNs: z.int(),
  size: z.int(),
});

export type FileBrowserFileStatResponse = z.infer<
  typeof FileBrowserFileStatResponseSchema
>;

const GetFileBrowserDownloadUrlsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type GetFileBrowserDownloadUrlsRequestInput = z.input<
  typeof GetFileBrowserDownloadUrlsRequestSchema
>;

const GetFileBrowserFileContentRequestSchema = z.object({
  path: z.string(),
  maxBytes: z.union([z.int(), z.null()]).default(null),
});

export type GetFileBrowserFileContentRequestInput = z.input<
  typeof GetFileBrowserFileContentRequestSchema
>;

const GetFileBrowserFileStatRequestSchema = z.object({
  path: z.string(),
});

export type GetFileBrowserFileStatRequestInput = z.input<
  typeof GetFileBrowserFileStatRequestSchema
>;

const GetFileBrowserRootResponseSchema = z.object({
  rootPath: z.string(),
  pathSeparator: z.string(),
  ignorePatterns: z.array(z.string()),
});

export type GetFileBrowserRootResponse = z.infer<
  typeof GetFileBrowserRootResponseSchema
>;

const GetFolderContentsRequestSchema = z.object({
  folderPath: z.string(),
  allowOutsideWorkspaceRoot: z.boolean().default(false),
  includeMtime: z.boolean().default(false),
  includeSize: z.boolean().default(false),
  includeHidden: z.boolean().default(false),
  includeSettaInitialized: z.boolean().default(false),
  ignorePatterns: z.union([z.array(z.string()), z.null()]).default(null),
  maxEntries: z.union([z.int(), z.null()]).default(null),
  missingFolderBehavior: z
    .literal(["error", "empty"])
    .default("error" as const),
});

export type GetFolderContentsRequestInput = z.input<
  typeof GetFolderContentsRequestSchema
>;

const ImportFilesToArtifactsRequestSchema = z.object({
  paths: z.array(z.string()),
  uploadScope: z.literal(["chat", "generic"]),
});

export type ImportFilesToArtifactsRequestInput = z.input<
  typeof ImportFilesToArtifactsRequestSchema
>;

const ImportFilesToArtifactsResponseItemSchema = z.object({
  kind: z.literal("file").default("file" as const),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.int(),
});

export type ImportFilesToArtifactsResponseItem = z.infer<
  typeof ImportFilesToArtifactsResponseItemSchema
>;

const LoadCachedPathsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type LoadCachedPathsRequestInput = z.input<
  typeof LoadCachedPathsRequestSchema
>;

const TransferFileBrowserEntryRequestSchema = z.object({
  sourcePath: z.string(),
  destinationFolderPath: z.string(),
  operation: z.literal(["copy", "move"]),
});

export type TransferFileBrowserEntryRequestInput = z.input<
  typeof TransferFileBrowserEntryRequestSchema
>;

const TransferFileBrowserEntryResponseSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  operation: z.literal(["copy", "move"]),
});

export type TransferFileBrowserEntryResponse = z.infer<
  typeof TransferFileBrowserEntryResponseSchema
>;

const UpdateArtifactsRequestSchema = z.object({
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

export type UpdateArtifactsRequestInput = z.input<
  typeof UpdateArtifactsRequestSchema
>;

const WriteFileBrowserFileContentRequestSchema = z.object({
  path: z.string(),
  contentId: z.string(),
  expectedMtimeNs: z.union([z.int(), z.null()]).default(null),
});

export type WriteFileBrowserFileContentRequestInput = z.input<
  typeof WriteFileBrowserFileContentRequestSchema
>;

const WriteFileBrowserFileContentResponseSchema = z.object({
  path: z.string(),
  mimeType: z.string(),
  mtimeNs: z.int(),
  size: z.int(),
});

export type WriteFileBrowserFileContentResponse = z.infer<
  typeof WriteFileBrowserFileContentResponseSchema
>;

const AttachmentDownloadUrlEntrySchema = z.object({
  artifactId: z.string(),
  url: z.string(),
  expiresAt: z.int(),
});

export type AttachmentDownloadUrlEntry = z.infer<
  typeof AttachmentDownloadUrlEntrySchema
>;

const GetAttachmentDownloadUrlRequestSchema = z.object({
  artifactId: z.string(),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type GetAttachmentDownloadUrlRequestInput = z.input<
  typeof GetAttachmentDownloadUrlRequestSchema
>;

const GetAttachmentDownloadUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.int(),
});

export type GetAttachmentDownloadUrlResponse = z.infer<
  typeof GetAttachmentDownloadUrlResponseSchema
>;

const GetAttachmentDownloadUrlsRequestSchema = z.object({
  artifactIds: z.array(z.string()),
  projectConfigId: z.union([IDSchema, z.null()]).default(null),
});

export type GetAttachmentDownloadUrlsRequestInput = z.input<
  typeof GetAttachmentDownloadUrlsRequestSchema
>;

const BootstrapConsumeRequestSchema = z.object({
  token: z.union([z.string(), z.null()]).default(null),
  launcherOrigin: z.union([z.string(), z.null()]).default(null),
  launcherOriginProof: z.union([z.string(), z.null()]).default(null),
});

export type BootstrapConsumeRequestInput = z.input<
  typeof BootstrapConsumeRequestSchema
>;

const DocstringToMarkdownRequestSchema = z.object({
  docstring: z.string(),
});

export type DocstringToMarkdownRequestInput = z.input<
  typeof DocstringToMarkdownRequestSchema
>;

const LaunchRequestSchema = z.object({
  launchIntentToken: z.union([z.string(), z.null()]).default(null),
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

export type LaunchRequestInput = z.input<typeof LaunchRequestSchema>;

const CreateWorkspaceLaunchIntentRequestSchema = z.object({
  launchRequest: LaunchRequestSchema,
  returnUrl: z.string(),
});

export type CreateWorkspaceLaunchIntentRequestInput = z.input<
  typeof CreateWorkspaceLaunchIntentRequestSchema
>;

const LaunchErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const CreateWorkspaceLaunchIntentResponseSchema = z.object({
  ok: z.boolean(),
  launchIntentToken: z.union([z.string(), z.null()]).default(null),
  requestedAt: z.union([z.int(), z.null()]).default(null),
  error: z.union([LaunchErrorPayloadSchema, z.null()]).default(null),
});

export type CreateWorkspaceLaunchIntentResponse = z.infer<
  typeof CreateWorkspaceLaunchIntentResponseSchema
>;

const LaunchSessionInfoSchema = z.object({
  id: z.string(),
  workspacePath: z.string(),
  workspacePathCanonical: z.string(),
  host: z.string(),
  port: z.int(),
  pid: z.int(),
  startedAt: z.string(),
});

const LaunchResponseSchema = z.object({
  ok: z.boolean(),
  bootstrapUrlFragment: z.union([z.string(), z.null()]).default(null),
  returnUrl: z.union([z.string(), z.null()]).default(null),
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

const LauncherDirectoryEntryPayloadSchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean(),
});

export type LauncherDirectoryEntryPayload = z.infer<
  typeof LauncherDirectoryEntryPayloadSchema
>;

const LauncherFilesystemRootsResponseSchema = z.object({
  ok: z.boolean(),
  roots: z.array(z.string()).default(() => []),
});

export type LauncherFilesystemRootsResponse = z.infer<
  typeof LauncherFilesystemRootsResponseSchema
>;

const LauncherHomeErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const LauncherListDirectoryRequestSchema = z.object({
  path: z.union([z.string(), z.null()]).default(null),
  cursor: z.union([z.string(), z.null()]).default(null),
  pageSize: z.union([z.int(), z.null()]).default(null),
});

export type LauncherListDirectoryRequestInput = z.input<
  typeof LauncherListDirectoryRequestSchema
>;

const LauncherListDirectoryResponseSchema = z.object({
  ok: z.boolean(),
  currentPath: z.union([z.string(), z.null()]).default(null),
  parentPath: z.union([z.string(), z.null()]).default(null),
  entries: z.array(LauncherDirectoryEntryPayloadSchema).default(() => []),
  nextCursor: z.union([z.string(), z.null()]).default(null),
  hasMore: z.boolean().default(false),
  truncated: z.boolean().default(false),
  error: z.union([LauncherHomeErrorPayloadSchema, z.null()]).default(null),
});

export type LauncherListDirectoryResponse = z.infer<
  typeof LauncherListDirectoryResponseSchema
>;

const LauncherOpenWorkspaceRequestSchema = z.object({
  workspaceRoot: z.string(),
  settaHome: z.union([z.string(), z.null()]).default(null),
  profile: z.union([z.string(), z.null()]).default(null),
  settaFilesRoot: z.union([z.string(), z.null()]).default(null),
  settaFilesLocation: z
    .union([z.literal(["auto", "local", "global"]), z.null()])
    .default(null),
  runtimeRoot: z.union([z.string(), z.null()]).default(null),
  createIfMissing: z.boolean().default(false),
});

export type LauncherOpenWorkspaceRequestInput = z.input<
  typeof LauncherOpenWorkspaceRequestSchema
>;

const LauncherOpenWorkspaceResponseSchema = z.object({
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
  error: z.union([LauncherHomeErrorPayloadSchema, z.null()]).default(null),
});

export type LauncherOpenWorkspaceResponse = z.infer<
  typeof LauncherOpenWorkspaceResponseSchema
>;

const LauncherRecentWorkspacePayloadSchema = z.object({
  workspaceRoot: z.string(),
  pinned: z.boolean(),
  lastUsedAt: z.int(),
});

export type LauncherRecentWorkspacePayload = z.infer<
  typeof LauncherRecentWorkspacePayloadSchema
>;

const LauncherRecentWorkspaceRequestSchema = z.object({
  settaHome: z.union([z.string(), z.null()]).default(null),
  workspaceRoot: z.string(),
  pinned: z.union([z.boolean(), z.null()]).default(null),
});

export type LauncherRecentWorkspaceRequestInput = z.input<
  typeof LauncherRecentWorkspaceRequestSchema
>;

const LauncherRecentWorkspacesResponseSchema = z.object({
  ok: z.boolean(),
  workspaces: z.array(LauncherRecentWorkspacePayloadSchema).default(() => []),
  error: z.union([LauncherHomeErrorPayloadSchema, z.null()]).default(null),
});

export type LauncherRecentWorkspacesResponse = z.infer<
  typeof LauncherRecentWorkspacesResponseSchema
>;

const PinLauncherRecentWorkspaceRequestSchema = z.object({
  settaHome: z.union([z.string(), z.null()]).default(null),
  workspaceRoot: z.string(),
  pinned: z.boolean(),
});

export type PinLauncherRecentWorkspaceRequestInput = z.input<
  typeof PinLauncherRecentWorkspaceRequestSchema
>;

const ManagedAPIKeysResponseSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
  revision: z.int(),
});

export type ManagedAPIKeysResponse = z.infer<
  typeof ManagedAPIKeysResponseSchema
>;

const UpdateAPIKeysRequestSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
  expectedRevision: z.int(),
});

export type UpdateAPIKeysRequestInput = z.input<
  typeof UpdateAPIKeysRequestSchema
>;

const TypeCheckRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type TypeCheckRequestInput = z.input<typeof TypeCheckRequestSchema>;

const MCPToolCallRequestSchema = z.object({
  tool: z.string(),
  arguments: z.union([z.any(), z.null()]).default(null),
  agenticContext: z.any().default(null),
});

export type MCPToolCallRequestInput = z.input<typeof MCPToolCallRequestSchema>;

const PluginConfigRequestSchema = z.object({
  pluginId: z.string(),
  config: z.record(z.string(), z.any()),
});

export type PluginConfigRequestInput = z.input<
  typeof PluginConfigRequestSchema
>;

const PluginConfigWriteResponseSchema = z.object({
  pluginId: z.string(),
  config: z.record(z.string(), z.any()),
  validation: z.record(z.string(), z.any()),
});

export type PluginConfigWriteResponse = z.infer<
  typeof PluginConfigWriteResponseSchema
>;

const PluginEnableDisableRequestSchema = z.object({
  pluginId: z.string(),
});

export type PluginEnableDisableRequestInput = z.input<
  typeof PluginEnableDisableRequestSchema
>;

export const PluginRuntimeStateEnum = {
  active: "active",
  disabled: "disabled",
  invalid: "invalid",
  shadowed: "shadowed",
  pending_restart: "pending_restart",
} as const;

const PluginEnableDisableResponseSchema = z.object({
  pluginId: z.string(),
  state: z.enum(PluginRuntimeStateEnum),
  restartRequired: z.boolean(),
});

export type PluginEnableDisableResponse = z.infer<
  typeof PluginEnableDisableResponseSchema
>;

const PluginInstallRequestSchema = z.object({
  sourceSpec: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  installer: z.literal(["auto", "pip", "uv"]).default("auto" as const),
  enable: z.boolean().default(true),
  force: z.boolean().default(false),
});

export type PluginInstallRequestInput = z.input<
  typeof PluginInstallRequestSchema
>;

const PluginScopeEnum = {
  workspace: "workspace",
  setta_files: "setta_files",
  global_scope: "global",
} as const;

const PluginSourceTrustStatusEnum = {
  unverified: "unverified",
} as const;

const PluginInstallResponseSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  sourceScope: z.enum(PluginScopeEnum),
  sourceScopeLabel: z.literal(["workspace", "setta_files", "global"]),
  sourcePath: z.string(),
  canonicalSourceKey: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]).default(null),
  requestedCapabilities: z.array(z.string()).default(() => []),
  trustStatus: z.enum(PluginSourceTrustStatusEnum),
  trustWarning: z.string(),
  components: z.array(z.string()),
  state: z.enum(PluginRuntimeStateEnum),
  restartRequired: z.boolean(),
});

export type PluginInstallResponse = z.infer<typeof PluginInstallResponseSchema>;

const PluginLinkRequestSchema = z.object({
  localPluginRoot: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  enable: z.boolean().default(true),
  force: z.boolean().default(false),
});

export type PluginLinkRequestInput = z.input<typeof PluginLinkRequestSchema>;

const PluginLockApplyRequestSchema = z.object({
  check: z.boolean().default(false),
});

export type PluginLockApplyRequestInput = z.input<
  typeof PluginLockApplyRequestSchema
>;

const PluginLockApplyResponseSchema = z.object({
  lockfilePath: z.string(),
  plannedChanges: z.array(z.string()),
  applied: z.boolean(),
});

export type PluginLockApplyResponse = z.infer<
  typeof PluginLockApplyResponseSchema
>;

const PluginLockWriteResponseSchema = z.object({
  lockfilePath: z.string(),
  pluginCount: z.int(),
});

export type PluginLockWriteResponse = z.infer<
  typeof PluginLockWriteResponseSchema
>;

const PluginRestartResponseSchema = z.object({
  accepted: z.boolean(),
  mode: z.literal(["programmatic", "manual"]),
  command: z.union([z.string(), z.null()]).default(null),
  reason: z.union([z.string(), z.null()]).default(null),
});

export type PluginRestartResponse = z.infer<typeof PluginRestartResponseSchema>;

const PluginRollbackRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
});

export type PluginRollbackRequestInput = z.input<
  typeof PluginRollbackRequestSchema
>;

const PluginRollbackResponseSchema = z.object({
  pluginId: z.string(),
  restoredVersion: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]),
  restartRequired: z.boolean(),
});

export type PluginRollbackResponse = z.infer<
  typeof PluginRollbackResponseSchema
>;

const PluginRestartCapabilitySchema = z.object({
  mode: z.literal(["programmatic", "manual"]),
  command: z.union([z.string(), z.null()]).default(null),
  reason: z.union([z.string(), z.null()]).default(null),
});

export type PluginRestartCapability = z.infer<
  typeof PluginRestartCapabilitySchema
>;

const PluginSourceManagerEnum = {
  setta: "setta",
  package_manager: "package_manager",
} as const;

const PluginFrontendDescriptorSchema = z.object({
  entrypointUrl: z.union([z.string(), z.null()]).default(null),
  styleUrl: z.union([z.string(), z.null()]).default(null),
});

const PluginContentDescriptorSchema = z.object({
  hasBlueprints: z.boolean(),
  hasProjectTemplates: z.boolean(),
  hasPrompts: z.boolean(),
});

const PluginConfigDescriptorSchema = z.object({
  hasSchema: z.boolean(),
  schemaJson: z.union([z.record(z.string(), z.any()), z.null()]).default(null),
  schemaJsonDigestSha256: z.union([z.string(), z.null()]).default(null),
  currentConfig: z.record(z.string(), z.any()).default({}),
  currentConfigDigestSha256: z.union([z.string(), z.null()]).default(null),
});

const PluginEnablementSourceEnum = {
  workspace_disabled: "workspace_disabled",
  workspace_enabled: "workspace_enabled",
  global_auto_enabled: "global_auto_enabled",
  manifest_default: "manifest_default",
} as const;

const PluginListEntrySchema = z.object({
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

export function createPluginListEntry(
  options: Partial<PluginListEntry> = {},
): PluginListEntry {
  return PluginListEntrySchema.parse(options);
}

const PluginListResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app", "launcher"]),
  restartCapability: PluginRestartCapabilitySchema,
  plugins: z.array(PluginListEntrySchema),
});

export type PluginListResponse = z.infer<typeof PluginListResponseSchema>;

const BlockedCapabilityReasonEnum = {
  mode_policy: "mode_policy",
  host_policy: "host_policy",
  manifest_invalid: "manifest_invalid",
} as const;

const PluginBlockedCapabilitySchema = z.object({
  capability: z.string(),
  reason: z.enum(BlockedCapabilityReasonEnum),
});

export type PluginBlockedCapability = z.infer<
  typeof PluginBlockedCapabilitySchema
>;

const PluginRegisteredLanguageServerSchema = z.object({
  name: z.string(),
  language: z.string(),
  command: z.string(),
  args: z.array(z.string()).default(() => []),
  settingsKey: z.union([z.string(), z.null()]).default(null),
});

const PluginRegisteredCodegenTargetSchema = z.object({
  targetId: z.string(),
  pluginId: z.string(),
  language: z.string(),
  name: z.string(),
  defaultFileName: z.string(),
});

const PluginErrorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const PluginStatusEntrySchema = z.object({
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
    .default(() => []),
  registeredExternalAgentAdapters: z
    .array(PluginRegisteredExternalAgentAdapterSchema)
    .default(() => []),
  registeredCodegenTargets: z
    .array(PluginRegisteredCodegenTargetSchema)
    .default(() => []),
  enablementSource: z
    .union([z.enum(PluginEnablementSourceEnum), z.null()])
    .default(null),
  restartRequired: z.boolean(),
  runtimePayloadDigestSha256: z.string(),
  errors: z.array(PluginErrorInfoSchema),
});

export type PluginStatusEntry = z.infer<typeof PluginStatusEntrySchema>;

export function createPluginStatusEntry(
  options: Partial<PluginStatusEntry> = {},
): PluginStatusEntry {
  return PluginStatusEntrySchema.parse(options);
}

const PluginStatusResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app", "launcher"]),
  restartCapability: PluginRestartCapabilitySchema,
  plugins: z.array(PluginStatusEntrySchema),
});

export type PluginStatusResponse = z.infer<typeof PluginStatusResponseSchema>;

const PluginRuntimeResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  list: PluginListResponseSchema,
  status: PluginStatusResponseSchema,
});

export type PluginRuntimeResponse = z.infer<typeof PluginRuntimeResponseSchema>;

const PluginUninstallRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
});

export type PluginUninstallRequestInput = z.input<
  typeof PluginUninstallRequestSchema
>;

const PluginUninstallResponseSchema = z.object({
  pluginId: z.string(),
  removedFromScope: z.enum(PluginScopeEnum),
  restartRequired: z.boolean(),
});

export type PluginUninstallResponse = z.infer<
  typeof PluginUninstallResponseSchema
>;

const PluginUpdateRequestSchema = z.object({
  pluginId: z.string(),
  scope: z
    .union([z.literal(["workspace", "setta_files", "global"]), z.null()])
    .default(null),
  to: z.union([z.string(), z.null()]).default(null),
});

export type PluginUpdateRequestInput = z.input<
  typeof PluginUpdateRequestSchema
>;

const PluginUpdateResponseSchema = z.object({
  pluginId: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  sourceDigestSha256: z.union([z.string(), z.null()]),
  restartRequired: z.boolean(),
});

export type PluginUpdateResponse = z.infer<typeof PluginUpdateResponseSchema>;

const PluginsRescanResponseSchema = z.object({
  schemaVersion: z.int().default(1),
  serverMode: z.literal(["ide", "share", "app", "launcher"]),
  installedPlugins: z.int(),
  activePlugins: z.int(),
});

export type PluginsRescanResponse = z.infer<typeof PluginsRescanResponseSchema>;

const AcceptRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type AcceptRenameRefactorRequestInput = z.input<
  typeof AcceptRenameRefactorRequestSchema
>;

const AddKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type AddKwargRequestInput = z.input<typeof AddKwargRequestSchema>;

const AppDefinitionResponseSchema = z.object({
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

const AppendDrawAreaLayerItemRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  layerIdx: z.int(),
  element: DrawAreaLayerItemSchema,
});

export type AppendDrawAreaLayerItemRequestInput = z.input<
  typeof AppendDrawAreaLayerItemRequestSchema
>;

const AutoLayoutTopLevelSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  margin: z.int().default(50),
});

export type AutoLayoutTopLevelSectionsRequestInput = z.input<
  typeof AutoLayoutTopLevelSectionsRequestSchema
>;

const ChangeParamImplRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  selectedId: IDSchema,
});

export type ChangeParamImplRequestInput = z.input<
  typeof ChangeParamImplRequestSchema
>;

const ClearTextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
});

export type ClearTextFieldCompletionRequestInput = z.input<
  typeof ClearTextFieldCompletionRequestSchema
>;

const CodeAreaCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type CodeAreaCompletionRequestInput = z.input<
  typeof CodeAreaCompletionRequestSchema
>;

const CreateAgenticEdgeRequestSchema = z.object({
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

export type CreateAgenticEdgeRequestInput = z.input<
  typeof CreateAgenticEdgeRequestSchema
>;

const CreateChildSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  parentId: IDSchema,
  implType: z.enum(SectionTypeEnum),
  numChildren: z.int(),
  startIdx: z.union([z.int(), z.null()]),
});

export type CreateChildSectionsRequestInput = z.input<
  typeof CreateChildSectionsRequestSchema
>;

const CreateChildSectionsViaIncrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
  implType: z.enum(SectionTypeEnum),
});

export type CreateChildSectionsViaIncrementerRequestInput = z.input<
  typeof CreateChildSectionsViaIncrementerRequestSchema
>;

const CreateEdgeRequestSchema = z.object({
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

export type CreateEdgeRequestInput = z.input<typeof CreateEdgeRequestSchema>;

const CreateNewSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type CreateNewSectionVariantRequestInput = z.input<
  typeof CreateNewSectionVariantRequestSchema
>;

const CreateTopLevelSectionRequestSchema = z.object({
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
        TaskBoardSectionImplArgsSchema,
        SpreadsheetSectionImplArgsSchema,
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

export type CreateTopLevelSectionRequestInput = z.input<
  typeof CreateTopLevelSectionRequestSchema
>;

const CreateTopLevelSectionResponseSchema = z.object({
  sectionId: IDSchema,
  metaControlParamId: z.union([IDSchema, z.null()]).default(null),
  panTo: z.union([PositionSchema, z.null()]).default(null),
});

export type CreateTopLevelSectionResponse = z.infer<
  typeof CreateTopLevelSectionResponseSchema
>;

const CreateViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type CreateViewModeRequestInput = z.input<
  typeof CreateViewModeRequestSchema
>;

const DeclineRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type DeclineRenameRefactorRequestInput = z.input<
  typeof DeclineRenameRefactorRequestSchema
>;

const DeleteAgenticEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edgeIds: z.array(IDSchema),
});

export type DeleteAgenticEdgesRequestInput = z.input<
  typeof DeleteAgenticEdgesRequestSchema
>;

const DeleteChildSectionsViaDecrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
});

export type DeleteChildSectionsViaDecrementerRequestInput = z.input<
  typeof DeleteChildSectionsViaDecrementerRequestSchema
>;

const DeleteEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edgeIds: z.array(IDSchema),
});

export type DeleteEdgesRequestInput = z.input<typeof DeleteEdgesRequestSchema>;

const DeleteJSONSourceFileAndVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
  filepath: z.string(),
});

export type DeleteJSONSourceFileAndVariantRequestInput = z.input<
  typeof DeleteJSONSourceFileAndVariantRequestSchema
>;

const DeleteKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type DeleteKwargRequestInput = z.input<typeof DeleteKwargRequestSchema>;

const DeleteSectionVariantOrAskRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type DeleteSectionVariantOrAskRequestInput = z.input<
  typeof DeleteSectionVariantOrAskRequestSchema
>;

const DeleteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type DeleteSectionsRequestInput = z.input<
  typeof DeleteSectionsRequestSchema
>;

const DeleteSelectedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoIds: z.array(IDSchema),
});

export type DeleteSelectedParamsRequestInput = z.input<
  typeof DeleteSelectedParamsRequestSchema
>;

const DeleteViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type DeleteViewModeRequestInput = z.input<
  typeof DeleteViewModeRequestSchema
>;

const ForceRefreshProjectRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type ForceRefreshProjectRequestInput = z.input<
  typeof ForceRefreshProjectRequestSchema
>;

const FormatCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type FormatCodeRequestInput = z.input<typeof FormatCodeRequestSchema>;

const GenCodePrefixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodePrefixCompletionRequestInput = z.input<
  typeof GenCodePrefixCompletionRequestSchema
>;

const GenCodeSuffixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodeSuffixCompletionRequestInput = z.input<
  typeof GenCodeSuffixCompletionRequestSchema
>;

const GetAppDefinitionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
});

export type GetAppDefinitionRequestInput = z.input<
  typeof GetAppDefinitionRequestSchema
>;

const GetChatSectionChatIdRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type GetChatSectionChatIdRequestInput = z.input<
  typeof GetChatSectionChatIdRequestSchema
>;

const GetLatestLspDiagnosticsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type GetLatestLspDiagnosticsRequestInput = z.input<
  typeof GetLatestLspDiagnosticsRequestSchema
>;

const GetLatestProjectStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type GetLatestProjectStateRequestInput = z.input<
  typeof GetLatestProjectStateRequestSchema
>;

const GetPasswordParamValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
});

export type GetPasswordParamValueRequestInput = z.input<
  typeof GetPasswordParamValueRequestSchema
>;

const GetPasswordParamValueResponseSchema = z.object({
  value: z.string(),
});

export type GetPasswordParamValueResponse = z.infer<
  typeof GetPasswordParamValueResponseSchema
>;

const GroupSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type GroupSectionsRequestInput = z.input<
  typeof GroupSectionsRequestSchema
>;

const IndentParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
});

export type IndentParamsRequestInput = z.input<
  typeof IndentParamsRequestSchema
>;

const MoveParamGroupSchema = z.object({
  paramIds: z.array(IDSchema),
  newParentId: IDSchema,
  newIndex: z.int(),
});

const MoveParamGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  moves: z.array(MoveParamGroupSchema),
});

export type MoveParamGroupsRequestInput = z.input<
  typeof MoveParamGroupsRequestSchema
>;

const MoveParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
  newParentId: IDSchema,
  newIndex: z.int(),
});

export type MoveParamsRequestInput = z.input<typeof MoveParamsRequestSchema>;

const MoveSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
  newParentId: z.union([IDSchema, z.null()]),
  newIndex: z.union([z.int(), z.null()]),
  positionsById: z.union([z.record(IDSchema, PositionSchema), z.null()]),
});

export type MoveSectionsRequestInput = z.input<
  typeof MoveSectionsRequestSchema
>;

const OutputAccessorCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type OutputAccessorCompletionRequestInput = z.input<
  typeof OutputAccessorCompletionRequestSchema
>;

const PasteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  data: ProjectStateCoreWithSectionVariantMapSchema,
  position: PositionSchema,
  asRef: z.boolean(),
});

export type PasteSectionsRequestInput = z.input<
  typeof PasteSectionsRequestSchema
>;

const PrepareSectionsForCopyRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type PrepareSectionsForCopyRequestInput = z.input<
  typeof PrepareSectionsForCopyRequestSchema
>;

const ReconnectEdgeRequestSchema = z.object({
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

export type ReconnectEdgeRequestInput = z.input<
  typeof ReconnectEdgeRequestSchema
>;

const RedoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type RedoRequestInput = z.input<typeof RedoRequestSchema>;

const SetActiveIdsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  activeIds: z.array(IDSchema),
});

export type SetActiveIdsRequestInput = z.input<
  typeof SetActiveIdsRequestSchema
>;

const SetActiveViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  activeViewModeId: IDSchema,
});

export type SetActiveViewModeRequestInput = z.input<
  typeof SetActiveViewModeRequestSchema
>;

const SetAgenticEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edges: z.array(AgenticEdgeSchema),
});

export type SetAgenticEdgesRequestInput = z.input<
  typeof SetAgenticEdgesRequestSchema
>;

const SetAppDefinitionRequestSchema = z.object({
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

export type SetAppDefinitionRequestInput = z.input<
  typeof SetAppDefinitionRequestSchema
>;

const SetBrowserAreaViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  viewMode: z.enum(BrowserAreaViewModeEnum),
});

export type SetBrowserAreaViewModeRequestInput = z.input<
  typeof SetBrowserAreaViewModeRequestSchema
>;

const SetBrowserColumnWidthsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  columnWidth: z.union([z.number(), z.null()]),
  typesColumnWidth: z.union([z.number(), z.null()]),
});

export type SetBrowserColumnWidthsRequestInput = z.input<
  typeof SetBrowserColumnWidthsRequestSchema
>;

const SetBrowserHideColumnRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideColumn: z.boolean(),
});

export type SetBrowserHideColumnRequestInput = z.input<
  typeof SetBrowserHideColumnRequestSchema
>;

const SetBrowserSavedSearchesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  savedSearches: z.array(BrowserSavedSearchSchema),
});

export type SetBrowserSavedSearchesRequestInput = z.input<
  typeof SetBrowserSavedSearchesRequestSchema
>;

const SetCallableHideParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideParams: z.boolean(),
});

export type SetCallableHideParamsRequestInput = z.input<
  typeof SetCallableHideParamsRequestSchema
>;

const SetCallableRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  callableName: z.string(),
  refetchParams: z.boolean(),
});

export type SetCallableRequestInput = z.input<typeof SetCallableRequestSchema>;

const SetCallableChildCodeObjSchema = z.object({
  codeObjId: IDSchema,
  name: z.string(),
});

const SignatureHelpStatusEnum = {
  MATCHED: "matched",
  NO_MATCH: "no_match",
  SKIPPED: "skipped",
} as const;

const SetCallableResponseSchema = z.object({
  callableId: z.union([IDSchema, z.null()]).default(null),
  childCodeObjs: z.array(SetCallableChildCodeObjSchema).default(() => []),
  lspStatus: z.enum(SignatureHelpStatusEnum),
});

export type SetCallableResponse = z.infer<typeof SetCallableResponseSchema>;

const SetChartAreaDataPathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  dataPath: z.string(),
});

export type SetChartAreaDataPathRequestInput = z.input<
  typeof SetChartAreaDataPathRequestSchema
>;

const SetChartSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartSettings: z.union([LineChartSettingsSchema, ScatterChartSettingsSchema]),
  changedSettings: z.array(z.string()),
});

export type SetChartSettingsRequestInput = z.input<
  typeof SetChartSettingsRequestSchema
>;

const SetChartTypeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartType: z.enum(ChartTypeEnum),
});

export type SetChartTypeRequestInput = z.input<
  typeof SetChartTypeRequestSchema
>;

const SetChatSectionChatIdRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chatId: z.union([IDSchema, z.null()]),
});

export type SetChatSectionChatIdRequestInput = z.input<
  typeof SetChatSectionChatIdRequestSchema
>;

const SetChatSectionSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  managed: z.boolean(),
  engineConfigId: z.union([IDSchema, z.null()]),
  transcriptionProfileId: z.union([IDSchema, z.null()]),
  agentProfileId: z.union([IDSchema, z.null()]),
  thinking: z.boolean(),
  permissionMode: z.enum(ChatPermissionModeEnum),
  searchEnabled: z.boolean(),
  dictationMode: z.enum(ChatDictationModeEnum),
});

export type SetChatSectionSettingsRequestInput = z.input<
  typeof SetChatSectionSettingsRequestSchema
>;

const SetChatSectionStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  state: ChatSectionStateSchema,
});

export type SetChatSectionStateRequestInput = z.input<
  typeof SetChatSectionStateRequestSchema
>;

const CodeFileBindingUpdateSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
});

const SetCodeFileBindingRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  binding: CodeFileBindingUpdateSchema,
});

export type SetCodeFileBindingRequestInput = z.input<
  typeof SetCodeFileBindingRequestSchema
>;

const SetCodeObjDisplayNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codeObjId: IDSchema,
  displayName: z.string(),
});

export type SetCodeObjDisplayNameRequestInput = z.input<
  typeof SetCodeObjDisplayNameRequestSchema
>;

const SetCodeObjNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codeObjId: IDSchema,
  name: z.string(),
});

export type SetCodeObjNameRequestInput = z.input<
  typeof SetCodeObjNameRequestSchema
>;

const SetCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  code: z.string(),
});

export type SetCodeRequestInput = z.input<typeof SetCodeRequestSchema>;

const SetCodeSectionAttachedTerminalRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  terminalSectionId: z.union([IDSchema, z.null()]).default(null),
});

export type SetCodeSectionAttachedTerminalRequestInput = z.input<
  typeof SetCodeSectionAttachedTerminalRequestSchema
>;

const SetCodeSectionDiagnosticCodeSuppressionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  code: z.union([z.string(), z.int()]),
  suppress: z.boolean(),
});

export type SetCodeSectionDiagnosticCodeSuppressionRequestInput = z.input<
  typeof SetCodeSectionDiagnosticCodeSuppressionRequestSchema
>;

const SetCodeSectionDiagnosticsMuteRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  mute: z.boolean(),
});

export type SetCodeSectionDiagnosticsMuteRequestInput = z.input<
  typeof SetCodeSectionDiagnosticsMuteRequestSchema
>;

const SetDefaultSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetDefaultSectionVariantRequestInput = z.input<
  typeof SetDefaultSectionVariantRequestSchema
>;

const SetEdgesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edges: z.array(EdgeSchema),
});

export type SetEdgesRequestInput = z.input<typeof SetEdgesRequestSchema>;

const SetGenCodePrefixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodePrefix: z.string(),
});

export type SetGenCodePrefixRequestInput = z.input<
  typeof SetGenCodePrefixRequestSchema
>;

const SetGenCodeSuffixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodeSuffix: z.string(),
});

export type SetGenCodeSuffixRequestInput = z.input<
  typeof SetGenCodeSuffixRequestSchema
>;

const SetGroupOverflowModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  overflowMode: z.boolean(),
});

export type SetGroupOverflowModeRequestInput = z.input<
  typeof SetGroupOverflowModeRequestSchema
>;

const SetImageAreaImagePathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  imagePath: z.string(),
});

export type SetImageAreaImagePathRequestInput = z.input<
  typeof SetImageAreaImagePathRequestSchema
>;

const SetListRootViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  viewMode: z.enum(ListRootViewModeEnum),
});

export type SetListRootViewModeRequestInput = z.input<
  typeof SetListRootViewModeRequestSchema
>;

const SetMetaControlShowSectionTitleRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  showSectionTitle: z.boolean(),
});

export type SetMetaControlShowSectionTitleRequestInput = z.input<
  typeof SetMetaControlShowSectionTitleRequestSchema
>;

const SetParamEnteredValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  value: z.string(),
});

export type SetParamEnteredValueRequestInput = z.input<
  typeof SetParamEnteredValueRequestSchema
>;

const SetParentDefaultChildSectionTypeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  defaultChildSectionType: z.enum(SectionTypeEnum),
});

export type SetParentDefaultChildSectionTypeRequestInput = z.input<
  typeof SetParentDefaultChildSectionTypeRequestSchema
>;

const SetProjectConfigCodegenTargetsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codegenTargets: z.array(
    z.union([
      ProjectCodegenPythonTargetSchema,
      ProjectCodegenPluginTargetSchema,
    ]),
  ),
});

export type SetProjectConfigCodegenTargetsRequestInput = z.input<
  typeof SetProjectConfigCodegenTargetsRequestSchema
>;

const SetPromptFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  format: z.enum(PromptFormatEnum),
});

export type SetPromptFormatRequestInput = z.input<
  typeof SetPromptFormatRequestSchema
>;

const SetPromptInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  inputs: z.record(z.string(), z.string()),
});

export type SetPromptInputsRequestInput = z.input<
  typeof SetPromptInputsRequestSchema
>;

const SetPromptTemplateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  template: z.string(),
});

export type SetPromptTemplateRequestInput = z.input<
  typeof SetPromptTemplateRequestSchema
>;

const SetSectionColumnWidthRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  columnWidth: z.union([z.number(), z.null()]),
});

export type SetSectionColumnWidthRequestInput = z.input<
  typeof SetSectionColumnWidthRequestSchema
>;

const SetSectionEdgeInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  edgeInputParams: z.array(IDSchema),
});

export type SetSectionEdgeInputsRequestInput = z.input<
  typeof SetSectionEdgeInputsRequestSchema
>;

const SetSectionEdgeOutputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  edgeOutputPorts: z.array(EdgePortSchema),
});

export type SetSectionEdgeOutputsRequestInput = z.input<
  typeof SetSectionEdgeOutputsRequestSchema
>;

const SetSectionHideUnpinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideUnpinnedParams: z.boolean(),
});

export type SetSectionHideUnpinnedParamsRequestInput = z.input<
  typeof SetSectionHideUnpinnedParamsRequestSchema
>;

const SetSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  name: z.string(),
});

export type SetSectionNameRequestInput = z.input<
  typeof SetSectionNameRequestSchema
>;

const SetSectionParamFilterRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  value: z.string(),
});

export type SetSectionParamFilterRequestInput = z.input<
  typeof SetSectionParamFilterRequestSchema
>;

const SetSectionPinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  pinnedParams: z.array(IDSchema),
});

export type SetSectionPinnedParamsRequestInput = z.input<
  typeof SetSectionPinnedParamsRequestSchema
>;

const SetSectionSizesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionSizes: z.record(IDSchema, SectionSizeSchema),
});

export type SetSectionSizesRequestInput = z.input<
  typeof SetSectionSizesRequestSchema
>;

const SetSectionStyleColorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  styleColor: z.union([z.string(), z.null()]).default(null),
});

export type SetSectionStyleColorRequestInput = z.input<
  typeof SetSectionStyleColorRequestSchema
>;

const SetSectionTagColorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  tagColor: z.union([z.string(), z.null()]).default(null),
});

export type SetSectionTagColorRequestInput = z.input<
  typeof SetSectionTagColorRequestSchema
>;

const SetSectionVariantNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
  name: z.string(),
});

export type SetSectionVariantNameRequestInput = z.input<
  typeof SetSectionVariantNameRequestSchema
>;

const SetSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetSectionVariantRequestInput = z.input<
  typeof SetSectionVariantRequestSchema
>;

const SetSectionVariantSortOrderRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  orderedVariantIds: z.array(IDSchema),
});

export type SetSectionVariantSortOrderRequestInput = z.input<
  typeof SetSectionVariantSortOrderRequestSchema
>;

const SetShowParamDisplayNamesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  showParamDisplayNames: z.boolean(),
});

export type SetShowParamDisplayNamesRequestInput = z.input<
  typeof SetShowParamDisplayNamesRequestSchema
>;

const SetSocialUrlRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  url: z.string(),
});

export type SetSocialUrlRequestInput = z.input<
  typeof SetSocialUrlRequestSchema
>;

const SetSpreadsheetFilePathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  filePath: z.string(),
  activeSheet: z.union([z.string(), z.null()]),
});

export type SetSpreadsheetFilePathRequestInput = z.input<
  typeof SetSpreadsheetFilePathRequestSchema
>;

const SetSpreadsheetSectionSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  readOnly: z.boolean(),
  showRowNumbers: z.boolean(),
  density: z.enum(SpreadsheetGridDensityEnum),
  autoReloadOnExternalChange: z.boolean(),
});

export type SetSpreadsheetSectionSettingsRequestInput = z.input<
  typeof SetSpreadsheetSectionSettingsRequestSchema
>;

const SetTaskBoardSectionStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  viewMode: z.enum(TaskBoardViewModeEnum),
  columns: z.array(TaskBoardColumnSchema),
  tasks: z.array(TaskBoardTaskSchema),
});

export type SetTaskBoardSectionStateRequestInput = z.input<
  typeof SetTaskBoardSectionStateRequestSchema
>;

const SetTextBlockDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  textDisplayMode: z.enum(TextBlockDisplayModeEnum),
});

export type SetTextBlockDisplayModeRequestInput = z.input<
  typeof SetTextBlockDisplayModeRequestSchema
>;

const SetTextBlockFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  format: z.enum(TextBlockFormatEnum),
});

export type SetTextBlockFormatRequestInput = z.input<
  typeof SetTextBlockFormatRequestSchema
>;

const SetTextBlockHeadingAsSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  headingAsSectionName: z.boolean(),
});

export type SetTextBlockHeadingAsSectionNameRequestInput = z.input<
  typeof SetTextBlockHeadingAsSectionNameRequestSchema
>;

const SetTextBlockMasterFontSizeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  masterFontSizePx: z.number(),
});

export type SetTextBlockMasterFontSizeRequestInput = z.input<
  typeof SetTextBlockMasterFontSizeRequestSchema
>;

const SetTextBlockMetaControlStyleRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  metaControlStyle: z.boolean(),
});

export type SetTextBlockMetaControlStyleRequestInput = z.input<
  typeof SetTextBlockMetaControlStyleRequestSchema
>;

const SetTextBlockTextRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  text: z.string(),
});

export type SetTextBlockTextRequestInput = z.input<
  typeof SetTextBlockTextRequestSchema
>;

const SetTopLevelSectionLayoutRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema),
});

export type SetTopLevelSectionLayoutRequestInput = z.input<
  typeof SetTopLevelSectionLayoutRequestSchema
>;

const SetTypeErrorIgnoreRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
  ignoreTypeErrors: z.boolean(),
});

export type SetTypeErrorIgnoreRequestInput = z.input<
  typeof SetTypeErrorIgnoreRequestSchema
>;

const SetVariantJsonSourceKeysRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
  jsonSourceKeys: z.array(z.string()),
});

export type SetVariantJsonSourceKeysRequestInput = z.input<
  typeof SetVariantJsonSourceKeysRequestSchema
>;

const SetViewModeNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
  name: z.string(),
});

export type SetViewModeNameRequestInput = z.input<
  typeof SetViewModeNameRequestSchema
>;

const SetViewModeSortOrderRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  orderedViewModeIds: z.array(IDSchema),
});

export type SetViewModeSortOrderRequestInput = z.input<
  typeof SetViewModeSortOrderRequestSchema
>;

const SetViewportRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewport: z.union([ViewportSchema, z.null()]),
});

export type SetViewportRequestInput = z.input<typeof SetViewportRequestSchema>;

const SetWatchCodeEnabledRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  enabled: z.boolean(),
});

export type SetWatchCodeEnabledRequestInput = z.input<
  typeof SetWatchCodeEnabledRequestSchema
>;

const SetWatchCodeInputsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  watchCodeFolders: z.array(WatchCodeFolderSchema),
  watchCodeFiles: z.array(z.string()),
});

export type SetWatchCodeInputsRequestInput = z.input<
  typeof SetWatchCodeInputsRequestSchema
>;

const TextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
  fullText: z.string(),
  position: z.int(),
});

export type TextFieldCompletionRequestInput = z.input<
  typeof TextFieldCompletionRequestSchema
>;

const ToggleGroupOrientationRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type ToggleGroupOrientationRequestInput = z.input<
  typeof ToggleGroupOrientationRequestSchema
>;

const ToggleIsEditingViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type ToggleIsEditingViewModeRequestInput = z.input<
  typeof ToggleIsEditingViewModeRequestSchema
>;

const ToggleMinimizedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type ToggleMinimizedRequestInput = z.input<
  typeof ToggleMinimizedRequestSchema
>;

const ToggleParamSelectedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
});

export type ToggleParamSelectedRequestInput = z.input<
  typeof ToggleParamSelectedRequestSchema
>;

const TogglePositionLocksRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type TogglePositionLocksRequestInput = z.input<
  typeof TogglePositionLocksRequestSchema
>;

const ToggleSectionVisibilityRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type ToggleSectionVisibilityRequestInput = z.input<
  typeof ToggleSectionVisibilityRequestSchema
>;

const ToggleVariantFrozenRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantFrozenRequestInput = z.input<
  typeof ToggleVariantFrozenRequestSchema
>;

const ToggleVariantJSONSourceRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantJSONSourceRequestInput = z.input<
  typeof ToggleVariantJSONSourceRequestSchema
>;

const ToggleViewModeTabRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type ToggleViewModeTabRequestInput = z.input<
  typeof ToggleViewModeTabRequestSchema
>;

const ToggleViewModeUserFacingRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewModeId: IDSchema,
});

export type ToggleViewModeUserFacingRequestInput = z.input<
  typeof ToggleViewModeUserFacingRequestSchema
>;

const UndoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type UndoRequestInput = z.input<typeof UndoRequestSchema>;

const UngroupGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  groupIds: z.array(IDSchema),
});

export type UngroupGroupsRequestInput = z.input<
  typeof UngroupGroupsRequestSchema
>;

const UnindentParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramIds: z.array(IDSchema),
});

export type UnindentParamsRequestInput = z.input<
  typeof UnindentParamsRequestSchema
>;

const UnselectAllParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type UnselectAllParamsRequestInput = z.input<
  typeof UnselectAllParamsRequestSchema
>;

const UpdateAgenticEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edge: AgenticEdgeSchema,
});

export type UpdateAgenticEdgeRequestInput = z.input<
  typeof UpdateAgenticEdgeRequestSchema
>;

const UpdateAppDefinitionRequestSchema = z.object({
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

export type UpdateAppDefinitionRequestInput = z.input<
  typeof UpdateAppDefinitionRequestSchema
>;

const UpdateEdgeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  edge: EdgeSchema,
});

export type UpdateEdgeRequestInput = z.input<typeof UpdateEdgeRequestSchema>;

const UpdateParamImplConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  newConfig: z.record(z.string(), z.any()),
});

export type UpdateParamImplConfigRequestInput = z.input<
  typeof UpdateParamImplConfigRequestSchema
>;

const ValidateAppDefinitionRequestSchema = z.object({
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

export type ValidateAppDefinitionRequestInput = z.input<
  typeof ValidateAppDefinitionRequestSchema
>;

const ValidateAppDefinitionResponseSchema = z.object({
  errors: z.array(AppValidationIssueSchema).default(() => []),
  warnings: z.array(AppValidationIssueSchema).default(() => []),
  capabilities: AppCapabilitiesSchema,
});

export type ValidateAppDefinitionResponse = z.infer<
  typeof ValidateAppDefinitionResponseSchema
>;

const CreateProjectConfigRequestSchema = z.object({
  previewImgColor: z.string(),
});

export type CreateProjectConfigRequestInput = z.input<
  typeof CreateProjectConfigRequestSchema
>;

const DeleteNotificationRequestSchema = z.object({
  notificationId: IDSchema,
});

export type DeleteNotificationRequestInput = z.input<
  typeof DeleteNotificationRequestSchema
>;

const DeleteProjectConfigsRequestSchema = z.object({
  ids: z.array(IDSchema),
});

export type DeleteProjectConfigsRequestInput = z.input<
  typeof DeleteProjectConfigsRequestSchema
>;

const GetNotificationsRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type GetNotificationsRequestInput = z.input<
  typeof GetNotificationsRequestSchema
>;

const ManualSaveRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ManualSaveRequestInput = z.input<typeof ManualSaveRequestSchema>;

const ProjectLoadRequestSchema = z.object({
  projectConfigName: z.string(),
});

export type ProjectLoadRequestInput = z.input<typeof ProjectLoadRequestSchema>;

const SaveAsNewProjectConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  newConfigName: z.string(),
  withRefs: z.boolean(),
});

export type SaveAsNewProjectConfigRequestInput = z.input<
  typeof SaveAsNewProjectConfigRequestSchema
>;

const SetAsDefaultProjectRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type SetAsDefaultProjectRequestInput = z.input<
  typeof SetAsDefaultProjectRequestSchema
>;

const SetProjectConfigNameRequestSchema = z.object({
  projectConfigId: IDSchema,
  newName: z.string(),
});

export type SetProjectConfigNameRequestInput = z.input<
  typeof SetProjectConfigNameRequestSchema
>;

const CancelRunRequestSchema = z.object({
  runId: z.string(),
});

export type CancelRunRequestInput = z.input<typeof CancelRunRequestSchema>;

const GetRunStatusRequestSchema = z.object({
  runId: z.string(),
});

export type GetRunStatusRequestInput = z.input<
  typeof GetRunStatusRequestSchema
>;

const RunDetachedRequestSchema = z.object({
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

export type RunDetachedRequestInput = z.input<typeof RunDetachedRequestSchema>;

const RunStatusEnum = {
  queued: "queued",
  running: "running",
  exited: "exited",
  failed: "failed",
  canceled: "canceled",
  lost: "lost",
} as const;

const RunDetachedResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(RunStatusEnum),
});

export type RunDetachedResponse = z.infer<typeof RunDetachedResponseSchema>;

const RunStatusResponseSchema = z.object({
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

const CreateFileRequestSchema = z.object({
  filepath: z.string(),
});

export type CreateFileRequestInput = z.input<typeof CreateFileRequestSchema>;

const GetJSONSourcePathToBeDeletedSchema = z.object({
  variantName: z.string(),
});

export type GetJSONSourcePathToBeDeletedInput = z.input<
  typeof GetJSONSourcePathToBeDeletedSchema
>;

const NewJSONVersionNameRequestSchema = z.object({
  filename: z.string(),
});

export type NewJSONVersionNameRequestInput = z.input<
  typeof NewJSONVersionNameRequestSchema
>;

const SaveSettingsRequestSchema = z.object({
  settings: SettingsStateSchema,
});

export type SaveSettingsRequestInput = z.input<
  typeof SaveSettingsRequestSchema
>;

const LoadShareProjectConfigRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type LoadShareProjectConfigRequestInput = z.input<
  typeof LoadShareProjectConfigRequestSchema
>;

const SharePolicyOverridesSchema = z.object({
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

const PublishShareDeploymentRequestSchema = z.object({
  deploymentName: z.string(),
  projectConfigId: IDSchema,
  sharePolicyOverrides: z
    .union([SharePolicyOverridesSchema, z.null()])
    .default(null),
  listenerEntrypoint: z.union([z.string(), z.null()]).default(null),
  listenerEnabled: z.boolean().default(true),
});

export type PublishShareDeploymentRequestInput = z.input<
  typeof PublishShareDeploymentRequestSchema
>;

const AuthRefreshStatusResponseSchema = z.object({
  authCookieRefreshWindowSeconds: z.int(),
});

export type AuthRefreshStatusResponse = z.infer<
  typeof AuthRefreshStatusResponseSchema
>;

const BackendInitEventSchema = z.object({
  message: z.string(),
  timestamp: z.iso.datetime().default(get_now_timestamp),
});

const BackendInitStatusResponseSchema = z.object({
  events: z.array(BackendInitEventSchema),
  isReady: z.boolean(),
  error: z.union([z.string(), z.null()]),
  authCookieRefreshWindowSeconds: z.int(),
  worktreeName: z.union([z.string(), z.null()]),
});

export type BackendInitStatusResponse = z.infer<
  typeof BackendInitStatusResponseSchema
>;

const LauncherOperationErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const LauncherRequestBaseSchema = z.object({
  settaHome: z.union([z.string(), z.null()]).default(null),
});

export type LauncherRequestBaseInput = z.input<
  typeof LauncherRequestBaseSchema
>;

const LauncherStatusResponseSchema = z.object({
  ok: z.boolean(),
  installed: z.union([z.boolean(), z.null()]).default(null),
  settaHome: z.union([z.string(), z.null()]).default(null),
  launcherDir: z.union([z.string(), z.null()]).default(null),
  metadataPath: z.union([z.string(), z.null()]).default(null),
  targetCommand: z.union([z.array(z.string()), z.null()]).default(null),
  targetValid: z.union([z.boolean(), z.null()]).default(null),
  targetError: z.union([z.string(), z.null()]).default(null),
  channel: z.union([z.string(), z.null()]).default(null),
  settaVersion: z.union([z.string(), z.null()]).default(null),
  openMode: z
    .union([z.literal(["browser", "chrome-app"]), z.null()])
    .default(null),
  workspaceBehavior: z
    .union([z.literal(["last_used_or_prompt", "always_prompt"]), z.null()])
    .default(null),
  lastUsedWorkspace: z.union([z.string(), z.null()]).default(null),
  artifactOptions: z.record(z.string(), z.string()).default({}),
  managedArtifacts: z.record(z.string(), z.string()).default({}),
  existingManagedArtifacts: z.array(z.string()).default(() => []),
  missingManagedArtifacts: z.array(z.string()).default(() => []),
  updateCapability: z
    .union([
      z.literal(["in_app", "installer_managed", "unsupported"]),
      z.null(),
    ])
    .default(null),
  updateGuidance: z.union([z.string(), z.null()]).default(null),
  error: z.union([LauncherOperationErrorPayloadSchema, z.null()]).default(null),
});

export type LauncherStatusResponse = z.infer<
  typeof LauncherStatusResponseSchema
>;

export function createLauncherStatusResponse(
  options: Partial<LauncherStatusResponse> = {},
): LauncherStatusResponse {
  return LauncherStatusResponseSchema.parse(options);
}

const LauncherUpdateResponseSchema = z.object({
  ok: z.boolean(),
  installed: z.union([z.boolean(), z.null()]).default(null),
  settaHome: z.union([z.string(), z.null()]).default(null),
  launcherDir: z.union([z.string(), z.null()]).default(null),
  metadataPath: z.union([z.string(), z.null()]).default(null),
  targetCommand: z.union([z.array(z.string()), z.null()]).default(null),
  targetValid: z.union([z.boolean(), z.null()]).default(null),
  targetError: z.union([z.string(), z.null()]).default(null),
  channel: z.union([z.string(), z.null()]).default(null),
  settaVersion: z.union([z.string(), z.null()]).default(null),
  openMode: z
    .union([z.literal(["browser", "chrome-app"]), z.null()])
    .default(null),
  workspaceBehavior: z
    .union([z.literal(["last_used_or_prompt", "always_prompt"]), z.null()])
    .default(null),
  lastUsedWorkspace: z.union([z.string(), z.null()]).default(null),
  artifactOptions: z.record(z.string(), z.string()).default({}),
  managedArtifacts: z.record(z.string(), z.string()).default({}),
  existingManagedArtifacts: z.array(z.string()).default(() => []),
  missingManagedArtifacts: z.array(z.string()).default(() => []),
  updateCapability: z
    .union([
      z.literal(["in_app", "installer_managed", "unsupported"]),
      z.null(),
    ])
    .default(null),
  updateGuidance: z.union([z.string(), z.null()]).default(null),
  error: z.union([LauncherOperationErrorPayloadSchema, z.null()]).default(null),
  packageSpec: z.union([z.string(), z.null()]).default(null),
  fromVersion: z.union([z.string(), z.null()]).default(null),
  toVersion: z.union([z.string(), z.null()]).default(null),
});

export type LauncherUpdateResponse = z.infer<
  typeof LauncherUpdateResponseSchema
>;

const RevealPathInOsFileExplorerRequestSchema = z.object({
  path: z.string(),
});

export type RevealPathInOsFileExplorerRequestInput = z.input<
  typeof RevealPathInOsFileExplorerRequestSchema
>;

const SettaHomeInfoResponseSchema = z.object({
  settaHome: z.string(),
  globalSettaFilesBase: z.string(),
  activeSettaFilesLocation: z.union([z.string(), z.null()]),
  llmConfigPath: z.string(),
});

export type SettaHomeInfoResponse = z.infer<typeof SettaHomeInfoResponseSchema>;

const SetupLauncherRequestSchema = z.object({
  settaHome: z.union([z.string(), z.null()]).default(null),
  channel: z.string().default("manual" as const),
  installSource: z
    .union([
      z.literal(["uv-tool", "installer-managed", "unsupported"]),
      z.null(),
    ])
    .default(null),
  openMode: z.literal(["browser", "chrome-app"]).default("chrome-app" as const),
  workspaceBehavior: z
    .union([z.literal(["last-used-or-prompt", "always-prompt"]), z.null()])
    .default(null),
  installArtifacts: z.boolean().default(true),
  artifactOptions: z.record(z.string(), z.string()).default({}),
});

export type SetupLauncherRequestInput = z.input<
  typeof SetupLauncherRequestSchema
>;

const UpdateLauncherRequestSchema = z.object({
  settaHome: z.union([z.string(), z.null()]).default(null),
  packageSpec: z.string().default("setta" as const),
});

export type UpdateLauncherRequestInput = z.input<
  typeof UpdateLauncherRequestSchema
>;

const DeleteTerminalsRequestSchema = z.object({
  sectionIds: z.array(IDSchema),
});

export type DeleteTerminalsRequestInput = z.input<
  typeof DeleteTerminalsRequestSchema
>;

const KillSubprocessesRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type KillSubprocessesRequestInput = z.input<
  typeof KillSubprocessesRequestSchema
>;

const RunCodeRequestSchema = z.object({
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

export type RunCodeRequestInput = z.input<typeof RunCodeRequestSchema>;

const CodeMirrorCompletionSchema = z.object({
  label: z.string(),
  type: z.string(),
});

export type CodeMirrorCompletion = z.infer<typeof CodeMirrorCompletionSchema>;

export function isBaseChildlessCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseChildlessCodeObjImplUnion {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
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

  TaskBoardSection: {
    impl: TaskBoardSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      TaskBoardSectionImplArgs,
      TaskBoardSectionImpl
    >;
  };

  SpreadsheetSection: {
    impl: SpreadsheetSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      SpreadsheetSectionImplArgs,
      SpreadsheetSectionImpl
    >;
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

  DateParamCodeObj: {
    impl: DateParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      DateParamCodeObjImplArgs,
      DateParamCodeObjImpl
    >;
  };

  TimeParamCodeObj: {
    impl: TimeParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      TimeParamCodeObjImplArgs,
      TimeParamCodeObjImpl
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
