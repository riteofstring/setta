import {
  createCsvArtifactId as create_csv_artifact_id,
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
  "Base64",
  "FileRead",
  "Literal",
]);

export const BaseArtifactTypeSet = new Set([
  "BrushStroke",
  "ChartData",
  "DrawAreaLayerItemTransform",
  "Image",
]);

export const BaseCanvasSectionImplArgsTypeSet = new Set(["Chart", "Draw"]);

export const BaseCanvasSectionImplTypeSet = new Set(["Chart", "Draw"]);

export const BaseChildlessCodeObjImplArgsTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseChildlessCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseCodeObjImplArgsTypeSet = new Set([
  "CodeCallable",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "NestedParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseCodeObjImplTypeSet = new Set([
  "CodeCallable",
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "NestedParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseCodeSectionImplArgsTypeSet = new Set([
  "Code",
  "GenPythonCode",
]);

export const BaseCodeSectionImplTypeSet = new Set(["Code", "GenPythonCode"]);

export const BaseDictSectionImplArgsTypeSet = new Set([
  "Dict",
  "GlobalVariables",
]);

export const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

export const BaseParamCodeObjImplArgsTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "NestedParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseParamCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "NestedParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
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
  "DictRoot",
  "Group",
  "ListRoot",
]);

export const BaseParentSectionImplTypeSet = new Set([
  "DictRoot",
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
  "DictRoot",
  "Draw",
  "GenPythonCode",
  "GlobalVariables",
  "Group",
  "IFrame",
  "Image",
  "ListRoot",
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
  "DictRoot",
  "Draw",
  "GenPythonCode",
  "GlobalVariables",
  "Group",
  "IFrame",
  "Image",
  "ListRoot",
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
  "RealtimeUIChange",
]);

export const FrontendWebsocketMsgTypeSet = new Set([
  "AllConnections",
  "AllProjectMetadata",
  "LLMApiKeysUpdated",
  "LLMConfigUpdated",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "ListenerCoverageSnapshot",
  "Notification",
  "ReturnRenameRefactorResults",
  "TerminalMetadata",
  "UUIDMappingForLLM",
  "UpdateArtifacts",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const PythonScriptWebsocketMsgTypeSet = new Set([
  "ListenerError",
  "ListenerForceRefresh",
  "ListenerFrontendEmit",
  "ListenerInit",
  "ListenerRealtimeEvent",
  "ListenerRegister",
  "ListenerRegisterAck",
]);

export const WebsocketMsgTypeSet = new Set([
  "AllConnections",
  "AllProjectMetadata",
  "CurrentAddressUpdate",
  "LLMApiKeysUpdated",
  "LLMConfigUpdated",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "ListenerCoverageSnapshot",
  "ListenerError",
  "ListenerForceRefresh",
  "ListenerFrontendEmit",
  "ListenerInit",
  "ListenerRealtimeEvent",
  "ListenerRegister",
  "ListenerRegisterAck",
  "Notification",
  "RealtimeUIChange",
  "ReturnRenameRefactorResults",
  "TerminalMetadata",
  "UUIDMappingForLLM",
  "UpdateArtifacts",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const SINGLETON_SECTION_TYPES = new Set([
  "SectionType.GenPythonCode",
  "SectionType.GlobalVariables",
]);

export const ArtifactTypeEnum = {
  Image: "Image",
  BrushStroke: "BrushStroke",
  DrawAreaLayerItemTransform: "DrawAreaLayerItemTransform",
  ChartData: "ChartData",
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
  TOOL_RESULT: "tool_result",
  MESSAGE_STOP: "message_stop",
  MESSAGE_FINALIZED: "message_finalized",
} as const;

export type StreamingEventType = ObjectValues<typeof StreamingEventTypeEnum>;

export const ClipboardDataTypeEnum = { Sections: "Sections" } as const;

export type ClipboardDataType = ObjectValues<typeof ClipboardDataTypeEnum>;

export const CodeObjTypeEnum = {
  CodeCallable: "CodeCallable",
  CodeParam: "CodeParam",
  TextParam: "TextParam",
  SliderParam: "SliderParam",
  SwitchParam: "SwitchParam",
  ColorPickerParam: "ColorPickerParam",
  DropdownParam: "DropdownParam",
  PasswordParam: "PasswordParam",
  NestedParam: "NestedParam",
} as const;

export type CodeObjType = ObjectValues<typeof CodeObjTypeEnum>;

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
  DictRoot: "DictRoot",
  Group: "Group",
  Image: "Image",
  Chart: "Chart",
  Draw: "Draw",
  TextBlock: "TextBlock",
  Social: "Social",
  GlobalVariables: "GlobalVariables",
  Code: "Code",
  GenPythonCode: "GenPythonCode",
  Terminal: "Terminal",
  IFrame: "IFrame",
  Chat: "Chat",
  Browser: "Browser",
} as const;

export type SectionType = ObjectValues<typeof SectionTypeEnum>;

export const DependencyKeyTypeEnum = {
  Section: "Section",
  SectionParam: "SectionParam",
} as const;

export type DependencyKeyType = ObjectValues<typeof DependencyKeyTypeEnum>;

export const DependencyValueTypeEnum = {
  Literal: "Literal",
  Base64: "Base64",
  FileRead: "FileRead",
} as const;

export type DependencyValueType = ObjectValues<typeof DependencyValueTypeEnum>;

export const BrowserAreaViewModeEnum = {
  list: "list",
  thumbnail: "thumbnail",
  carousel: "carousel",
} as const;

export type BrowserAreaViewMode = ObjectValues<typeof BrowserAreaViewModeEnum>;

export const CodeLanguageEnum = { python: "python", bash: "bash" } as const;

export type CodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const SectionSizeModeEnum = { auto: "auto" } as const;

export type SectionSizeMode = ObjectValues<typeof SectionSizeModeEnum>;

export const SectionWithParamsDisplayModeEnum = {
  Gui: "Gui",
  Yaml: "Yaml",
} as const;

export type SectionWithParamsDisplayMode = ObjectValues<
  typeof SectionWithParamsDisplayModeEnum
>;

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

export const ViewingEditingModeEnum = {
  DEV: "DEV",
  USER: "USER",
  USER_EDIT: "USER_EDIT",
} as const;

export type ViewingEditingMode = ObjectValues<typeof ViewingEditingModeEnum>;

export const ListenerDependencyModeEnum = {
  SPECIFIC: "specific",
  ANY_DEPENDENCY: "any_dependency",
  REFRESH_ONLY: "refresh_only",
} as const;

export type ListenerDependencyMode = ObjectValues<
  typeof ListenerDependencyModeEnum
>;

export const SettaNotificationTypeEnum = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  save: "save",
} as const;

export type SettaNotificationType = ObjectValues<
  typeof SettaNotificationTypeEnum
>;

export const CodeFileAccessModeEnum = {
  read_only: "read_only",
  read_write: "read_write",
  write_only: "write_only",
} as const;

export type CodeFileAccessMode = ObjectValues<typeof CodeFileAccessModeEnum>;

export const RouteEnum = {
  PREFIX: "/api",
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
  READ_CSV_BASE64: "/readCSVBase64",
  FILL_IN_MISSING_ARTIFACT_IDS: "/getArtifactIdsFromNamePathType",
  GET_DEFAULT_PROJECT_CONFIG_NAME: "/getDefaultConfigName",
  SECTION_TO_YAML: "/sectionToYaml",
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
  GET_UUID_MAPPING_FOR_LLM: "/getUUIDMappingForLLM",
  RUN_CODE: "/runCode",
  TYPE_CHECK: "/typeCheck",
  CLEAR_TEXT_FIELD_COMPLETION: "/clearTextFieldCompletion",
  SET_CALLABLE: "/setCallable",
  TEXT_FIELD_COMPLETION: "/textFieldCompletion",
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
  UNDO: "/undo",
  REDO: "/redo",
  GET_LATEST_PROJECT_STATE: "/getLatestProjectState",
  FORCE_REFRESH_LISTENER: "/forceRefreshListener",
  SET_TOP_LEVEL_SECTION_LAYOUT: "/setTopLevelSectionLayout",
  ADD_KWARG: "/addKwarg",
  DELETE_KWARG: "/deleteKwarg",
  DELETE_SECTION_VARIANT_OR_ASK: "/deleteSectionVariantOrAsk",
  TOGGLE_VARIANT_JSON_SOURCE: "/toggleVariantJsonSource",
  SET_TEXT_BLOCK_TEXT: "/setTextBlockText",
  SET_GEN_CODE_PREFIX: "/setGenCodePrefix",
  SET_GEN_CODE_SUFFIX: "/setGenCodeSuffix",
  SET_PARAM_ENTERED_VALUE: "/setParamEnteredValue",
  SET_CODE_OBJ_NAME: "/setCodeObjName",
  SET_CODE_FILE_BINDING: "/setCodeFileBinding",
  SET_CODE: "/setCode",
  TOGGLE_POSITION_LOCK: "/togglePositionLock",
  TOGGLE_MINIMIZED: "/toggleMinimized",
  SET_SECTION_PARAM_FILTER: "/setSectionParamFilter",
  SET_SECTION_VARIANT: "/setSectionVariant",
  SET_DEFAULT_SECTION_VARIANT: "/setDefaultSectionVariant",
  SET_SECTION_VARIANT_NAME: "setSectionVariantName",
  TOGGLE_VARIANT_FROZEN: "/toggleVariantFrozen",
  SET_SECTION_SIZES: "/setSectionSizes",
  SET_ACTIVE_IDS: "/setActiveIds",
  SET_VIEWPORT: "/setViewport",
  SET_SECTION_NAME: "/setSectionName",
  SET_TEXT_BLOCK_DISPLAY_MODE: "/setTextBlockDisplayMode",
  SET_SECTION_WITH_PARAMS_DISPLAY_MODE: "/setSectionWithParamsDisplayMode",
  SET_CALLABLE_HIDE_PARAMS: "/setCallableHideParams",
  SET_SECTION_HIDE_UNPINNED_PARAMS: "/setSectionHideUnpinnedParams",
  SET_BROWSER_AREA_VIEW_MODE: "/setBrowserAreaViewMode",
  SET_BROWSER_HIDE_COLUMN: "/setBrowserHideColumn",
  SET_TEXT_BLOCK_FORMAT: "/setTextBlockFormat",
  SET_SOCIAL_URL: "/setSocialUrl",
  ACCEPT_RENAME_REFACTOR: "/acceptRenameRefactor",
  DECLINE_RENAME_REFACTOR: "/declineRenameRefactor",
  APPEND_DRAW_AREA_LAYER_ITEM: "/appendDrawAreaLayerItem",
  GROUP_SECTIONS: "/groupSections",
  UNGROUP_GROUPS: "/ungroupGroups",
  TOGGLE_PARAM_SELECTED: "/toggleParamSelected",
  UNSELECT_ALL_PARAMS: "/unselectAllParams",
  PREPARE_SECTIONS_FOR_COPY: "/prepareSectionsForCopy",
  PASTE_SECTIONS: "/pasteSections",
  GET_FOLDER_CONTENTS: "/getFolderContents",
  LOAD_CACHED_IMAGE_ARTIFACTS: "/loadCachedImageArtifacts",
  SET_IMAGE_AREA_IMAGE_PATH: "/setImageAreaImagePath",
  LOAD_CACHED_CHART_DATA: "/loadCachedChartData",
  SET_CHART_TYPE: "/setChartType",
  SET_CHART_AREA_IMAGE_PATH: "/setChartAreaDataPath",
  SET_CHART_SETTINGS: "/setChartSettings",
  LOAD_CACHED_BRUSH_STROKES: "/loadCachedBrushStrokes",
  LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM: "/loadDrawAreaLayerItemTransform",
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

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
} as const;

export type BackgroundVariant = ObjectValues<typeof BackgroundVariantEnum>;

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

export const SelectionModeEnum = { partial: "partial", full: "full" } as const;

export type SelectionMode = ObjectValues<typeof SelectionModeEnum>;

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
} as const;

export type WebsocketMsgTypeForBackend = ObjectValues<
  typeof WebsocketMsgTypeForBackendEnum
>;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  LSPDiagnostics: "LSPDiagnostics",
  TerminalMetadata: "TerminalMetadata",
  Notification: "Notification",
  LLMStreamingResponse: "LLMStreamingResponse",
  UUIDMappingForLLM: "UUIDMappingForLLM",
  ReturnRenameRefactorResults: "ReturnRenameRefactorResults",
  UpdateFrontendProjectState: "UpdateFrontendProjectState",
  UpdateSettings: "UpdateSettings",
  AllProjectMetadata: "AllProjectMetadata",
  UpdateArtifacts: "UpdateArtifacts",
  ListenerCoverageSnapshot: "ListenerCoverageSnapshot",
  LLMConfigUpdated: "LLMConfigUpdated",
  LLMApiKeysUpdated: "LLMApiKeysUpdated",
} as const;

export type WebsocketMsgTypeForFrontend = ObjectValues<
  typeof WebsocketMsgTypeForFrontendEnum
>;

export const WebsocketMsgTypeForPythonScriptEnum = {
  ListenerInit: "ListenerInit",
  ListenerRegister: "ListenerRegister",
  ListenerRegisterAck: "ListenerRegisterAck",
  ListenerRealtimeEvent: "ListenerRealtimeEvent",
  ListenerForceRefresh: "ListenerForceRefresh",
  ListenerError: "ListenerError",
  ListenerFrontendEmit: "ListenerFrontendEmit",
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

export const CanvasPointSchema = z.tuple([z.number(), z.number()]);

export type CanvasPoint = z.infer<typeof CanvasPointSchema>;

export const ChartDataSchema = z.record(
  z.string(),
  z.array(z.union([z.string(), z.number()])),
);

export type ChartData = z.infer<typeof ChartDataSchema>;

export const ChartDataArtifactSchema = z.object({
  type: z.literal("ChartData").default(ArtifactTypeEnum.ChartData),
  id: z.string().default(create_csv_artifact_id),
  value: z.record(z.string(), z.array(z.union([z.string(), z.number()]))),
});

export type ChartDataArtifact = z.infer<typeof ChartDataArtifactSchema>;

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

export const DrawAreaTransformSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export type DrawAreaTransform = z.infer<typeof DrawAreaTransformSchema>;

export const ImageArtifactSchema = z.object({
  type: z.literal("Image").default(ArtifactTypeEnum.Image),
  id: z.string().default(create_png_artifact_id),
  value: z.string(),
});

export type ImageArtifact = z.infer<typeof ImageArtifactSchema>;

export function createImageArtifact(
  options: Partial<ImageArtifact> = {},
): ImageArtifact {
  return ImageArtifactSchema.parse(options);
}

export const ImageMappingSchema = z.record(z.string(), ImageArtifactSchema);

export type ImageMapping = z.infer<typeof ImageMappingSchema>;

export const BaseArtifactUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "type",
  [
    ImageArtifactSchema,
    BrushStrokeArtifactSchema,
    DrawAreaLayerItemTransformArtifactSchema,
    ChartDataArtifactSchema,
  ],
);

export type BaseArtifactUnionWithDiscriminator = z.infer<
  typeof BaseArtifactUnionWithDiscriminatorSchema
>;

export function createBaseArtifactUnionWithDiscriminator(
  options: Partial<BaseArtifactUnionWithDiscriminator> = {},
): BaseArtifactUnionWithDiscriminator {
  return BaseArtifactUnionWithDiscriminatorSchema.parse(options);
}

export const APIKeysSchema = z.record(z.string(), z.string());

export type APIKeys = z.infer<typeof APIKeysSchema>;

export const MessageTextContentSchema = z.object({
  type: z.literal("text").default("text" as const),
  text: z.string(),
});

export type MessageTextContent = z.infer<typeof MessageTextContentSchema>;

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

export function createMessageImageUrlContent(
  options: Partial<MessageImageUrlContent> = {},
): MessageImageUrlContent {
  return MessageImageUrlContentSchema.parse(options);
}

export const MessageThinkingContentSchema = z.object({
  type: z.literal("thinking").default("thinking" as const),
  thinking: z.string().default("" as const),
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
});

export type SystemChatMessage = z.infer<typeof SystemChatMessageSchema>;

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
  tool_calls: z.union([z.array(ToolCallSchema), z.null()]).default(null),
});

export type AssistantChatMessage = z.infer<typeof AssistantChatMessageSchema>;

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
});

export type UserChatMessage = z.infer<typeof UserChatMessageSchema>;

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

export function createAnnotations(
  options: Partial<Annotations> = {},
): Annotations {
  return AnnotationsSchema.parse(options);
}

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

export type TextContent = z.infer<typeof TextContentSchema>;

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
});

export type ImageContent = z.infer<typeof ImageContentSchema>;

export function createImageContent(
  options: Partial<ImageContent> = {},
): ImageContent {
  return ImageContentSchema.parse(options);
}

export const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  text: z.string(),
});

export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;

export function createTextResourceContents(
  options: Partial<TextResourceContents> = {},
): TextResourceContents {
  return TextResourceContentsSchema.parse(options);
}

export const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  blob: z.string(),
});

export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;

export function createBlobResourceContents(
  options: Partial<BlobResourceContents> = {},
): BlobResourceContents {
  return BlobResourceContentsSchema.parse(options);
}

export const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

export function createEmbeddedResource(
  options: Partial<EmbeddedResource> = {},
): EmbeddedResource {
  return EmbeddedResourceSchema.parse(options);
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
      z.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema]),
    )
    .default([]),
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

export const BaseChatMessageUnionSchema = z.union([
  SystemChatMessageSchema,
  AssistantChatMessageSchema,
  UserChatMessageSchema,
  ToolChatMessageSchema,
]);

export type BaseChatMessageUnion = z.infer<typeof BaseChatMessageUnionSchema>;

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

export const MessageContentSchema = z.union([
  MessageTextContentSchema,
  MessageImageUrlContentSchema,
  MessageThinkingContentSchema,
]);

export type MessageContent = z.infer<typeof MessageContentSchema>;

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

export function createMessageTextDelta(
  options: Partial<MessageTextDelta> = {},
): MessageTextDelta {
  return MessageTextDeltaSchema.parse(options);
}

export const MessageThinkingDeltaSchema = z.object({
  type: z.literal("thinking_delta").default("thinking_delta" as const),
  index: z.int(),
  thinking: z.string(),
  signature: z.union([z.string(), z.null()]).default(null),
});

export type MessageThinkingDelta = z.infer<typeof MessageThinkingDeltaSchema>;

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
});

export type ToolCallDeltaEvent = z.infer<typeof ToolCallDeltaEventSchema>;

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

export function createToolResultEvent(
  options: Partial<ToolResultEvent> = {},
): ToolResultEvent {
  return ToolResultEventSchema.parse(options);
}

export const MessageStopEventSchema = z.object({
  type: z.literal("message_stop").default(StreamingEventTypeEnum.MESSAGE_STOP),
  message_id: z.string(),
});

export type MessageStopEvent = z.infer<typeof MessageStopEventSchema>;

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
  MessageStopEventSchema,
  MessageFinalizedEventSchema,
]);

export type LLMStreamingResponseChunk = z.infer<
  typeof LLMStreamingResponseChunkSchema
>;

export const MessageContentDeltaSchema = z.union([
  MessageTextDeltaSchema,
  MessageThinkingDeltaSchema,
]);

export type MessageContentDelta = z.infer<typeof MessageContentDeltaSchema>;

export const AllImplFieldsSchema = z.literal([
  "activeLayerIdx",
  "aspectRatio",
  "aspectRatioExtraHeight",
  "aspectRatioExtraWidth",
  "brushColor",
  "brushOpacity",
  "brushShape",
  "brushSize",
  "callable",
  "canvasMode",
  "chartSettings",
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
  "dataPath",
  "defaultVal",
  "description",
  "displayMode",
  "drawThrottleDelay",
  "eraserBrushSize",
  "folder",
  "format",
  "headingAsSectionName",
  "hideColumn",
  "hideParams",
  "hideUnpinnedParams",
  "id",
  "ignoreTypeErrors",
  "imagePath",
  "isFrozen",
  "isHorizontalOrientation",
  "isInOtherProjectConfigs",
  "isJsonSource",
  "isMinimized",
  "isPreset",
  "jsonSourceKeys",
  "jsonSourceMissing",
  "layers",
  "max",
  "min",
  "name",
  "paramFilter",
  "passingStyle",
  "pinnedAreaHeight",
  "pinnedParams",
  "positionAndSizeLocked",
  "renderedValue",
  "selectedParams",
  "size",
  "step",
  "text",
  "textDisplayMode",
  "topLevelParamId",
  "type",
  "url",
  "value",
  "viewMode",
  "visibility",
]);

export type AllImplFields = z.infer<typeof AllImplFieldsSchema>;

export const LineChartSettingsSchema = z.object({
  type: z.literal("line").default(ChartTypeEnum.line),
  xAxisColumn: z.union([z.string(), z.null()]).default(null),
  secondYAxisColumns: z.array(z.string()).default([]),
  xAxisLog: z.boolean().default(false),
  y1AxisLog: z.boolean().default(false),
  y2AxisLog: z.boolean().default(false),
});

export type LineChartSettings = z.infer<typeof LineChartSettingsSchema>;

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

export const BaseChartSettingsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    LineChartSettingsSchema,
    ScatterChartSettingsSchema,
  ]);

export type BaseChartSettingsUnionWithDiscriminator = z.infer<
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

export const ContentChatMessageUnionWithDiscriminatorSchema =
  z.discriminatedUnion("role", [
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
  ]);

export type ContentChatMessageUnionWithDiscriminator = z.infer<
  typeof ContentChatMessageUnionWithDiscriminatorSchema
>;

export function createContentChatMessageUnionWithDiscriminator(
  options: Partial<ContentChatMessageUnionWithDiscriminator> = {},
): ContentChatMessageUnionWithDiscriminator {
  return ContentChatMessageUnionWithDiscriminatorSchema.parse(options);
}

export const CodeFileBindingSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
});

export type CodeFileBinding = z.infer<typeof CodeFileBindingSchema>;

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

export function createColorPickerChoice(
  options: Partial<ColorPickerChoice> = {},
): ColorPickerChoice {
  return ColorPickerChoiceSchema.parse(options);
}

export const DrawAreaLayerItemSchema = z.object({
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

export const DrawAreaLayerSchema = z.object({
  name: z.string().default(generate_memorable_string),
  elements: z.array(DrawAreaLayerItemSchema).default([]),
  visible: z.boolean().default(true),
  layerOpacity: z.number().default(1),
});

export type DrawAreaLayer = z.infer<typeof DrawAreaLayerSchema>;

export function createDrawAreaLayer(
  options: Partial<DrawAreaLayer> = {},
): DrawAreaLayer {
  return DrawAreaLayerSchema.parse(options);
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

export function createSectionSize(
  options: Partial<SectionSize> = {},
): SectionSize {
  return SectionSizeSchema.parse(options);
}

export const VisibilitySchema = z.object({
  DEV: z.boolean().default(true),
  USER: z.boolean().default(true),
});

export type Visibility = z.infer<typeof VisibilitySchema>;

export function createVisibility(
  options: Partial<Visibility> = {},
): Visibility {
  return VisibilitySchema.parse(options);
}

export const SharedModifierSchema = z.object({
  activeLayerIdx: z.int().optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  brushColor: z.string().optional(),
  brushOpacity: z.number().optional(),
  brushShape: z.enum(DrawAreaBrushShapeEnum).optional(),
  brushSize: z.int().optional(),
  callable: z.union([z.string(), z.null()]).optional(),
  canvasMode: z.enum(DrawAreaModeEnum).optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .optional(),
  children: z.array(z.string()).optional(),
  choices: z.array(z.string()).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  codeLanguage: z.enum(CodeLanguageEnum).optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  colorChoices: z.array(ColorPickerChoiceSchema).optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  dataPath: z.string().optional(),
  defaultVal: z.string().optional(),
  description: z.string().optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  drawThrottleDelay: z.int().optional(),
  eraserBrushSize: z.int().optional(),
  folder: z.string().optional(),
  format: z.enum(TextBlockFormatEnum).optional(),
  headingAsSectionName: z.boolean().optional(),
  hideColumn: z.boolean().optional(),
  hideParams: z.boolean().optional(),
  hideUnpinnedParams: z.boolean().optional(),
  id: z.string().optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  imagePath: z.string().optional(),
  isFrozen: z.boolean().optional(),
  isHorizontalOrientation: z.boolean().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  isJsonSource: z.boolean().optional(),
  isMinimized: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
  layers: z.array(DrawAreaLayerSchema).optional(),
  max: z.int().optional(),
  min: z.int().optional(),
  name: z.string().optional(),
  paramFilter: z.string().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  pinnedParams: z.array(z.string()).optional(),
  positionAndSizeLocked: z.boolean().optional(),
  renderedValue: z.union([z.string(), z.null()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  size: SectionSizeSchema.optional(),
  step: z.int().optional(),
  text: z.string().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  topLevelParamId: z.union([z.string(), z.null()]).optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  viewMode: z.enum(BrowserAreaViewModeEnum).optional(),
  visibility: VisibilitySchema.optional(),
});

export type SharedModifier = z.infer<typeof SharedModifierSchema>;

export function createSharedModifier(
  options: Partial<SharedModifier> = {},
): SharedModifier {
  return SharedModifierSchema.parse(options);
}

export const CoreSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  variants: z.array(z.string()).default([]),
  defaultVariant: z.union([z.string(), z.null()]).default(null),
  sharedModifier: SharedModifierSchema.default(createSharedModifier),
  unsharedKeys: z
    .array(
      z.literal([
        "activeLayerIdx",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "brushColor",
        "brushOpacity",
        "brushShape",
        "brushSize",
        "callable",
        "canvasMode",
        "chartSettings",
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
        "dataPath",
        "defaultVal",
        "description",
        "displayMode",
        "drawThrottleDelay",
        "eraserBrushSize",
        "folder",
        "format",
        "headingAsSectionName",
        "hideColumn",
        "hideParams",
        "hideUnpinnedParams",
        "id",
        "ignoreTypeErrors",
        "imagePath",
        "isFrozen",
        "isHorizontalOrientation",
        "isInOtherProjectConfigs",
        "isJsonSource",
        "isMinimized",
        "isPreset",
        "jsonSourceKeys",
        "jsonSourceMissing",
        "layers",
        "max",
        "min",
        "name",
        "paramFilter",
        "passingStyle",
        "pinnedAreaHeight",
        "pinnedParams",
        "positionAndSizeLocked",
        "renderedValue",
        "selectedParams",
        "size",
        "step",
        "text",
        "textDisplayMode",
        "topLevelParamId",
        "type",
        "url",
        "value",
        "viewMode",
        "visibility",
      ]),
    )
    .default(() => [
      "callable" as const,
      "codeObjVariantMap" as const,
      "topLevelParamId" as const,
      "value" as const,
      "layers" as const,
    ]),
});

export type Core = z.infer<typeof CoreSchema>;

export function createCore(options: Partial<Core> = {}): Core {
  return CoreSchema.parse(options);
}

export const CallableSectionImplSchema = z.object({
  type: z.literal("Callable").default(SectionTypeEnum.Callable),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  callable: z.union([z.string(), z.null()]).default(null),
  hideParams: z.boolean().default(false),
});

export type CallableSectionImpl = z.infer<typeof CallableSectionImplSchema>;

export function createCallableSectionImpl(
  defaults: UserDefaultCallableSectionImpl,
  overrides: Partial<CallableSectionImpl> = {},
): CallableSectionImpl {
  return CallableSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DictSectionImplSchema = z.object({
  type: z.literal("Dict").default(SectionTypeEnum.Dict),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([z.string(), z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type DictSectionImpl = z.infer<typeof DictSectionImplSchema>;

export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return DictSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ListRootSectionImplSchema = z.object({
  type: z.literal("ListRoot").default(SectionTypeEnum.ListRoot),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type ListRootSectionImpl = z.infer<typeof ListRootSectionImplSchema>;

export function createListRootSectionImpl(
  defaults: UserDefaultListRootSectionImpl,
  overrides: Partial<ListRootSectionImpl> = {},
): ListRootSectionImpl {
  return ListRootSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DictRootSectionImplSchema = z.object({
  type: z.literal("DictRoot").default(SectionTypeEnum.DictRoot),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type DictRootSectionImpl = z.infer<typeof DictRootSectionImplSchema>;

export function createDictRootSectionImpl(
  defaults: UserDefaultDictRootSectionImpl,
  overrides: Partial<DictRootSectionImpl> = {},
): DictRootSectionImpl {
  return DictRootSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GroupSectionImplSchema = z.object({
  type: z.literal("Group").default(SectionTypeEnum.Group),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
  isHorizontalOrientation: z.boolean().default(false),
});

export type GroupSectionImpl = z.infer<typeof GroupSectionImplSchema>;

export function createGroupSectionImpl(
  defaults: UserDefaultGroupSectionImpl,
  overrides: Partial<GroupSectionImpl> = {},
): GroupSectionImpl {
  return GroupSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ImageSectionImplSchema = z.object({
  type: z.literal("Image").default(SectionTypeEnum.Image),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
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

export function createImageSectionImpl(
  defaults: UserDefaultImageSectionImpl,
  overrides: Partial<ImageSectionImpl> = {},
): ImageSectionImpl {
  return ImageSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ChartSectionImplSchema = z.object({
  type: z.literal("Chart").default(SectionTypeEnum.Chart),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 400.0, height: 400.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  renderedValue: z.union([z.string(), z.null()]).default(null),
  dataPath: z.string().default("" as const),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .default(createLineChartSettings),
});

export type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

export function createChartSectionImpl(
  defaults: UserDefaultChartSectionImpl,
  overrides: Partial<ChartSectionImpl> = {},
): ChartSectionImpl {
  return ChartSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DrawSectionImplSchema = z.object({
  type: z.literal("Draw").default(SectionTypeEnum.Draw),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  renderedValue: z.union([z.string(), z.null()]).default(null),
  layers: z.array(DrawAreaLayerSchema).default([]),
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

export function createDrawSectionImpl(
  defaults: UserDefaultDrawSectionImpl,
  overrides: Partial<DrawSectionImpl> = {},
): DrawSectionImpl {
  return DrawSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const TextBlockSectionImplSchema = z.object({
  type: z.literal("TextBlock").default(SectionTypeEnum.TextBlock),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  format: z.enum(TextBlockFormatEnum).default(TextBlockFormatEnum.Plaintext),
  headingAsSectionName: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

export type TextBlockSectionImpl = z.infer<typeof TextBlockSectionImplSchema>;

export function createTextBlockSectionImpl(
  defaults: UserDefaultTextBlockSectionImpl,
  overrides: Partial<TextBlockSectionImpl> = {},
): TextBlockSectionImpl {
  return TextBlockSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const SocialSectionImplSchema = z.object({
  type: z.literal("Social").default(SectionTypeEnum.Social),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
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

export function createSocialSectionImpl(
  defaults: UserDefaultSocialSectionImpl,
  overrides: Partial<SocialSectionImpl> = {},
): SocialSectionImpl {
  return SocialSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GlobalVariablesSectionImplSchema = z.object({
  type: z.literal("GlobalVariables").default(SectionTypeEnum.GlobalVariables),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([z.string(), z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type GlobalVariablesSectionImpl = z.infer<
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
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  codeLanguage: z.enum(CodeLanguageEnum).default(CodeLanguageEnum.python),
});

export type CodeSectionImpl = z.infer<typeof CodeSectionImplSchema>;

export function createCodeSectionImpl(
  defaults: UserDefaultCodeSectionImpl,
  overrides: Partial<CodeSectionImpl> = {},
): CodeSectionImpl {
  return CodeSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const GenPythonCodeSectionImplSchema = z.object({
  type: z.literal("GenPythonCode").default(SectionTypeEnum.GenPythonCode),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type GenPythonCodeSectionImpl = z.infer<
  typeof GenPythonCodeSectionImplSchema
>;

export function createGenPythonCodeSectionImpl(
  defaults: UserDefaultGenPythonCodeSectionImpl,
  overrides: Partial<GenPythonCodeSectionImpl> = {},
): GenPythonCodeSectionImpl {
  return GenPythonCodeSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const TerminalSectionImplSchema = z.object({
  type: z.literal("Terminal").default(SectionTypeEnum.Terminal),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 700.0, height: 300.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type TerminalSectionImpl = z.infer<typeof TerminalSectionImplSchema>;

export function createTerminalSectionImpl(
  defaults: UserDefaultTerminalSectionImpl,
  overrides: Partial<TerminalSectionImpl> = {},
): TerminalSectionImpl {
  return TerminalSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const IFrameSectionImplSchema = z.object({
  type: z.literal("IFrame").default(SectionTypeEnum.IFrame),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type IFrameSectionImpl = z.infer<typeof IFrameSectionImplSchema>;

export function createIFrameSectionImpl(
  defaults: UserDefaultIFrameSectionImpl,
  overrides: Partial<IFrameSectionImpl> = {},
): IFrameSectionImpl {
  return IFrameSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ChatSectionImplSchema = z.object({
  type: z.literal("Chat").default(SectionTypeEnum.Chat),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 405.0, height: 405.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type ChatSectionImpl = z.infer<typeof ChatSectionImplSchema>;

export function createChatSectionImpl(
  defaults: UserDefaultChatSectionImpl,
  overrides: Partial<ChatSectionImpl> = {},
): ChatSectionImpl {
  return ChatSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const BrowserSectionImplSchema = z.object({
  type: z.literal("Browser").default(SectionTypeEnum.Browser),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  folder: z.string().default("" as const),
  hideColumn: z.boolean().default(false),
  viewMode: z
    .enum(BrowserAreaViewModeEnum)
    .default(BrowserAreaViewModeEnum.list),
});

export type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

export function createBrowserSectionImpl(
  defaults: UserDefaultBrowserSectionImpl,
  overrides: Partial<BrowserSectionImpl> = {},
): BrowserSectionImpl {
  return BrowserSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const VariantSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: z.string(),
  nonPresetImpls: z.array(z.string()),
  modifier: SharedModifierSchema.default(createSharedModifier),
  isFrozen: z.boolean().default(false),
});

export type Variant = z.infer<typeof VariantSchema>;

export function createVariant(options: Partial<Variant> = {}): Variant {
  return VariantSchema.parse(options);
}

export const CodeCallableCodeObjImplSchema = z.object({
  type: z.literal("CodeCallable").default(CodeObjTypeEnum.CodeCallable),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type CodeCallableCodeObjImpl = z.infer<
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
  id: z.string().default(create_new_id),
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

export function createCodeParamCodeObjImpl(
  defaults: UserDefaultCodeParamCodeObjImpl,
  overrides: Partial<CodeParamCodeObjImpl> = {},
): CodeParamCodeObjImpl {
  return CodeParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const TextParamCodeObjImplSchema = z.object({
  type: z.literal("TextParam").default(CodeObjTypeEnum.TextParam),
  id: z.string().default(create_new_id),
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

export function createTextParamCodeObjImpl(
  defaults: UserDefaultTextParamCodeObjImpl,
  overrides: Partial<TextParamCodeObjImpl> = {},
): TextParamCodeObjImpl {
  return TextParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const SliderParamCodeObjImplSchema = z.object({
  type: z.literal("SliderParam").default(CodeObjTypeEnum.SliderParam),
  id: z.string().default(create_new_id),
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

export function createSliderParamCodeObjImpl(
  defaults: UserDefaultSliderParamCodeObjImpl,
  overrides: Partial<SliderParamCodeObjImpl> = {},
): SliderParamCodeObjImpl {
  return SliderParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const SwitchParamCodeObjImplSchema = z.object({
  type: z.literal("SwitchParam").default(CodeObjTypeEnum.SwitchParam),
  id: z.string().default(create_new_id),
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

export function createSwitchParamCodeObjImpl(
  defaults: UserDefaultSwitchParamCodeObjImpl,
  overrides: Partial<SwitchParamCodeObjImpl> = {},
): SwitchParamCodeObjImpl {
  return SwitchParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const ColorPickerParamCodeObjImplSchema = z.object({
  type: z.literal("ColorPickerParam").default(CodeObjTypeEnum.ColorPickerParam),
  id: z.string().default(create_new_id),
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

export function createColorPickerParamCodeObjImpl(
  defaults: UserDefaultColorPickerParamCodeObjImpl,
  overrides: Partial<ColorPickerParamCodeObjImpl> = {},
): ColorPickerParamCodeObjImpl {
  return ColorPickerParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const DropdownParamCodeObjImplSchema = z.object({
  type: z.literal("DropdownParam").default(CodeObjTypeEnum.DropdownParam),
  id: z.string().default(create_new_id),
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

export function createDropdownParamCodeObjImpl(
  defaults: UserDefaultDropdownParamCodeObjImpl,
  overrides: Partial<DropdownParamCodeObjImpl> = {},
): DropdownParamCodeObjImpl {
  return DropdownParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const PasswordParamCodeObjImplSchema = z.object({
  type: z.literal("PasswordParam").default(CodeObjTypeEnum.PasswordParam),
  id: z.string().default(create_new_id),
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

export type PasswordParamCodeObjImpl = z.infer<
  typeof PasswordParamCodeObjImplSchema
>;

export function createPasswordParamCodeObjImpl(
  defaults: UserDefaultPasswordParamCodeObjImpl,
  overrides: Partial<PasswordParamCodeObjImpl> = {},
): PasswordParamCodeObjImpl {
  return PasswordParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const NestedParamCodeObjImplSchema = z.object({
  type: z.literal("NestedParam").default(CodeObjTypeEnum.NestedParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
});

export type NestedParamCodeObjImpl = z.infer<
  typeof NestedParamCodeObjImplSchema
>;

export function createNestedParamCodeObjImpl(
  defaults: UserDefaultNestedParamCodeObjImpl,
  overrides: Partial<NestedParamCodeObjImpl> = {},
): NestedParamCodeObjImpl {
  return NestedParamCodeObjImplSchema.parse({ ...defaults, ...overrides });
}

export const ProjectStateCoreSchema = z.object({
  sections: z.record(z.string(), CoreSchema).default({}),
  sectionImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        DictRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(z.string(), VariantSchema).default({}),
  codeObjs: z.record(z.string(), CoreSchema).default({}),
  codeObjImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(z.string(), VariantSchema).default({}),
});

export type ProjectStateCore = z.infer<typeof ProjectStateCoreSchema>;

export function createProjectStateCore(
  options: Partial<ProjectStateCore> = {},
): ProjectStateCore {
  return ProjectStateCoreSchema.parse(options);
}

export const ProjectStateCoreWithSectionVariantMapSchema = z.object({
  core: ProjectStateCoreSchema,
  sectionVariantMap: z.record(z.string(), z.string()).default({}),
});

export type ProjectStateCoreWithSectionVariantMap = z.infer<
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

export const SectionDependencyKeySchema = z.object({
  type: z.literal("Section").default(DependencyKeyTypeEnum.Section),
  sectionId: z.string(),
});

export type SectionDependencyKey = z.infer<typeof SectionDependencyKeySchema>;

export function createSectionDependencyKey(
  options: Partial<SectionDependencyKey> = {},
): SectionDependencyKey {
  return SectionDependencyKeySchema.parse(options);
}

export const SectionParamDependencyKeySchema = z.object({
  type: z.literal("SectionParam").default(DependencyKeyTypeEnum.SectionParam),
  sectionId: z.string(),
  codeObjId: z.string(),
});

export type SectionParamDependencyKey = z.infer<
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

export const BaseDependencyKeyUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]);

export type BaseDependencyKeyUnionWithDiscriminator = z.infer<
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

export function createLiteralDependencyValue(
  options: Partial<LiteralDependencyValue> = {},
): LiteralDependencyValue {
  return LiteralDependencyValueSchema.parse(options);
}

export const Base64DependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("Base64").default(DependencyValueTypeEnum.Base64),
});

export type Base64DependencyValue = z.infer<typeof Base64DependencyValueSchema>;

export function createBase64DependencyValue(
  options: Partial<Base64DependencyValue> = {},
): Base64DependencyValue {
  return Base64DependencyValueSchema.parse(options);
}

export const FileReadDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("FileRead").default(DependencyValueTypeEnum.FileRead),
});

export type FileReadDependencyValue = z.infer<
  typeof FileReadDependencyValueSchema
>;

export function createFileReadDependencyValue(
  options: Partial<FileReadDependencyValue> = {},
): FileReadDependencyValue {
  return FileReadDependencyValueSchema.parse(options);
}

export const BaseDependencyValueUnionSchema = z.union([
  LiteralDependencyValueSchema,
  Base64DependencyValueSchema,
  FileReadDependencyValueSchema,
]);

export type BaseDependencyValueUnion = z.infer<
  typeof BaseDependencyValueUnionSchema
>;

export const BaseDependencyValueUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    LiteralDependencyValueSchema,
    Base64DependencyValueSchema,
    FileReadDependencyValueSchema,
  ]);

export type BaseDependencyValueUnionWithDiscriminator = z.infer<
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

export const BaseChildlessCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
]);

export type BaseChildlessCodeObjImplUnion = z.infer<
  typeof BaseChildlessCodeObjImplUnionSchema
>;

export const BaseCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseCodeObjImplUnion = z.infer<typeof BaseCodeObjImplUnionSchema>;

export const BaseCodeSectionImplUnionSchema = z.union([
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
]);

export type BaseCodeSectionImplUnion = z.infer<
  typeof BaseCodeSectionImplUnionSchema
>;

export const BaseDictSectionImplUnionSchema = z.union([
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseDictSectionImplUnion = z.infer<
  typeof BaseDictSectionImplUnionSchema
>;

export const BaseParamCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseParamCodeObjImplUnion = z.infer<
  typeof BaseParamCodeObjImplUnionSchema
>;

export const BaseParentCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseParentCodeObjImplUnion = z.infer<
  typeof BaseParentCodeObjImplUnionSchema
>;

export const BaseParentSectionImplUnionSchema = z.union([
  ListRootSectionImplSchema,
  DictRootSectionImplSchema,
  GroupSectionImplSchema,
]);

export type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

export const BaseSectionImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  ListRootSectionImplSchema,
  DictRootSectionImplSchema,
  GroupSectionImplSchema,
  ImageSectionImplSchema,
  ChartSectionImplSchema,
  DrawSectionImplSchema,
  TextBlockSectionImplSchema,
  SocialSectionImplSchema,
  GlobalVariablesSectionImplSchema,
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
  TerminalSectionImplSchema,
  IFrameSectionImplSchema,
  ChatSectionImplSchema,
  BrowserSectionImplSchema,
]);

export type BaseSectionImplUnion = z.infer<typeof BaseSectionImplUnionSchema>;

export const BaseSectionWithParamsImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseSectionWithParamsImplUnion = z.infer<
  typeof BaseSectionWithParamsImplUnionSchema
>;

export const BaseArtifactUnionSchema = z.union([
  ImageArtifactSchema,
  BrushStrokeArtifactSchema,
  DrawAreaLayerItemTransformArtifactSchema,
  ChartDataArtifactSchema,
]);

export type BaseArtifactUnion = z.infer<typeof BaseArtifactUnionSchema>;

export const ChartSectionImplArgsSchema = z.object({
  type: z.literal("Chart").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  renderedValue: z.union([z.string(), z.null()]).optional(),
  dataPath: z.string().optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .optional(),
});

export type ChartSectionImplArgs = z.infer<typeof ChartSectionImplArgsSchema>;

export function createChartSectionImplArgs(
  options: Partial<ChartSectionImplArgs> = {},
): ChartSectionImplArgs {
  return ChartSectionImplArgsSchema.parse(options);
}

export const DrawSectionImplArgsSchema = z.object({
  type: z.literal("Draw").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  renderedValue: z.union([z.string(), z.null()]).optional(),
  layers: z.array(DrawAreaLayerSchema).optional(),
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

export const BaseCanvasSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ChartSectionImplArgsSchema,
    DrawSectionImplArgsSchema,
  ]);

export type BaseCanvasSectionImplArgsUnionWithDiscriminator = z.infer<
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

export function createBaseCanvasSectionImplUnionWithDiscriminator(
  options: Partial<BaseCanvasSectionImplUnionWithDiscriminator> = {},
): BaseCanvasSectionImplUnionWithDiscriminator {
  return BaseCanvasSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeParamCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeParam").optional(),
  id: z.string().optional(),
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

export function createCodeParamCodeObjImplArgs(
  options: Partial<CodeParamCodeObjImplArgs> = {},
): CodeParamCodeObjImplArgs {
  return CodeParamCodeObjImplArgsSchema.parse(options);
}

export const TextParamCodeObjImplArgsSchema = z.object({
  type: z.literal("TextParam").optional(),
  id: z.string().optional(),
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

export function createTextParamCodeObjImplArgs(
  options: Partial<TextParamCodeObjImplArgs> = {},
): TextParamCodeObjImplArgs {
  return TextParamCodeObjImplArgsSchema.parse(options);
}

export const SliderParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SliderParam").optional(),
  id: z.string().optional(),
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

export function createSliderParamCodeObjImplArgs(
  options: Partial<SliderParamCodeObjImplArgs> = {},
): SliderParamCodeObjImplArgs {
  return SliderParamCodeObjImplArgsSchema.parse(options);
}

export const SwitchParamCodeObjImplArgsSchema = z.object({
  type: z.literal("SwitchParam").optional(),
  id: z.string().optional(),
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

export function createSwitchParamCodeObjImplArgs(
  options: Partial<SwitchParamCodeObjImplArgs> = {},
): SwitchParamCodeObjImplArgs {
  return SwitchParamCodeObjImplArgsSchema.parse(options);
}

export const ColorPickerParamCodeObjImplArgsSchema = z.object({
  type: z.literal("ColorPickerParam").optional(),
  id: z.string().optional(),
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

export function createColorPickerParamCodeObjImplArgs(
  options: Partial<ColorPickerParamCodeObjImplArgs> = {},
): ColorPickerParamCodeObjImplArgs {
  return ColorPickerParamCodeObjImplArgsSchema.parse(options);
}

export const DropdownParamCodeObjImplArgsSchema = z.object({
  type: z.literal("DropdownParam").optional(),
  id: z.string().optional(),
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

export function createDropdownParamCodeObjImplArgs(
  options: Partial<DropdownParamCodeObjImplArgs> = {},
): DropdownParamCodeObjImplArgs {
  return DropdownParamCodeObjImplArgsSchema.parse(options);
}

export const PasswordParamCodeObjImplArgsSchema = z.object({
  type: z.literal("PasswordParam").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type PasswordParamCodeObjImplArgs = z.infer<
  typeof PasswordParamCodeObjImplArgsSchema
>;

export function createPasswordParamCodeObjImplArgs(
  options: Partial<PasswordParamCodeObjImplArgs> = {},
): PasswordParamCodeObjImplArgs {
  return PasswordParamCodeObjImplArgsSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsUnionSchema = z.union([
  CodeParamCodeObjImplArgsSchema,
  TextParamCodeObjImplArgsSchema,
  SliderParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
]);

export type BaseChildlessCodeObjImplArgsUnion = z.infer<
  typeof BaseChildlessCodeObjImplArgsUnionSchema
>;

export const BaseChildlessCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
  ]);

export type BaseChildlessCodeObjImplArgsUnionWithDiscriminator = z.infer<
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
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
  ]);

export type BaseChildlessCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseChildlessCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseChildlessCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseChildlessCodeObjImplUnionWithDiscriminator> = {},
): BaseChildlessCodeObjImplUnionWithDiscriminator {
  return BaseChildlessCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeCallableCodeObjImplArgsSchema = z.object({
  type: z.literal("CodeCallable").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type CodeCallableCodeObjImplArgs = z.infer<
  typeof CodeCallableCodeObjImplArgsSchema
>;

export function createCodeCallableCodeObjImplArgs(
  options: Partial<CodeCallableCodeObjImplArgs> = {},
): CodeCallableCodeObjImplArgs {
  return CodeCallableCodeObjImplArgsSchema.parse(options);
}

export const NestedParamCodeObjImplArgsSchema = z.object({
  type: z.literal("NestedParam").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  children: z.array(z.string()).optional(),
});

export type NestedParamCodeObjImplArgs = z.infer<
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
  SliderParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
  NestedParamCodeObjImplArgsSchema,
]);

export type BaseCodeObjImplArgsUnion = z.infer<
  typeof BaseCodeObjImplArgsUnionSchema
>;

export const BaseCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplArgsSchema,
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseCodeObjImplArgsUnionWithDiscriminator = z.infer<
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
    SliderParamCodeObjImplSchema,
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
    NestedParamCodeObjImplSchema,
  ],
);

export type BaseCodeObjImplUnionWithDiscriminator = z.infer<
  typeof BaseCodeObjImplUnionWithDiscriminatorSchema
>;

export function createBaseCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseCodeObjImplUnionWithDiscriminator> = {},
): BaseCodeObjImplUnionWithDiscriminator {
  return BaseCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const CodeSectionImplArgsSchema = z.object({
  type: z.literal("Code").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  codeLanguage: z.enum(CodeLanguageEnum).optional(),
});

export type CodeSectionImplArgs = z.infer<typeof CodeSectionImplArgsSchema>;

export function createCodeSectionImplArgs(
  options: Partial<CodeSectionImplArgs> = {},
): CodeSectionImplArgs {
  return CodeSectionImplArgsSchema.parse(options);
}

export const GenPythonCodeSectionImplArgsSchema = z.object({
  type: z.literal("GenPythonCode").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
});

export type GenPythonCodeSectionImplArgs = z.infer<
  typeof GenPythonCodeSectionImplArgsSchema
>;

export function createGenPythonCodeSectionImplArgs(
  options: Partial<GenPythonCodeSectionImplArgs> = {},
): GenPythonCodeSectionImplArgs {
  return GenPythonCodeSectionImplArgsSchema.parse(options);
}

export const BaseCodeSectionImplArgsUnionSchema = z.union([
  CodeSectionImplArgsSchema,
  GenPythonCodeSectionImplArgsSchema,
]);

export type BaseCodeSectionImplArgsUnion = z.infer<
  typeof BaseCodeSectionImplArgsUnionSchema
>;

export const BaseCodeSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
  ]);

export type BaseCodeSectionImplArgsUnionWithDiscriminator = z.infer<
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
  ]);

export type BaseCodeSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseCodeSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseCodeSectionImplUnionWithDiscriminator(
  options: Partial<BaseCodeSectionImplUnionWithDiscriminator> = {},
): BaseCodeSectionImplUnionWithDiscriminator {
  return BaseCodeSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const DictSectionImplArgsSchema = z.object({
  type: z.literal("Dict").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  topLevelParamId: z.union([z.string(), z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type DictSectionImplArgs = z.infer<typeof DictSectionImplArgsSchema>;

export function createDictSectionImplArgs(
  options: Partial<DictSectionImplArgs> = {},
): DictSectionImplArgs {
  return DictSectionImplArgsSchema.parse(options);
}

export const GlobalVariablesSectionImplArgsSchema = z.object({
  type: z.literal("GlobalVariables").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  topLevelParamId: z.union([z.string(), z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type GlobalVariablesSectionImplArgs = z.infer<
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

export const BaseDictSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    DictSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
  ]);

export type BaseDictSectionImplArgsUnionWithDiscriminator = z.infer<
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

export function createBaseDictSectionImplUnionWithDiscriminator(
  options: Partial<BaseDictSectionImplUnionWithDiscriminator> = {},
): BaseDictSectionImplUnionWithDiscriminator {
  return BaseDictSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParamCodeObjImplArgsUnionSchema = z.union([
  CodeParamCodeObjImplArgsSchema,
  TextParamCodeObjImplArgsSchema,
  SliderParamCodeObjImplArgsSchema,
  SwitchParamCodeObjImplArgsSchema,
  ColorPickerParamCodeObjImplArgsSchema,
  DropdownParamCodeObjImplArgsSchema,
  PasswordParamCodeObjImplArgsSchema,
  NestedParamCodeObjImplArgsSchema,
]);

export type BaseParamCodeObjImplArgsUnion = z.infer<
  typeof BaseParamCodeObjImplArgsUnionSchema
>;

export const BaseParamCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplArgsSchema,
    TextParamCodeObjImplArgsSchema,
    SliderParamCodeObjImplArgsSchema,
    SwitchParamCodeObjImplArgsSchema,
    ColorPickerParamCodeObjImplArgsSchema,
    DropdownParamCodeObjImplArgsSchema,
    PasswordParamCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseParamCodeObjImplArgsUnionWithDiscriminator = z.infer<
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
    SliderParamCodeObjImplSchema,
    SwitchParamCodeObjImplSchema,
    ColorPickerParamCodeObjImplSchema,
    DropdownParamCodeObjImplSchema,
    PasswordParamCodeObjImplSchema,
    NestedParamCodeObjImplSchema,
  ]);

export type BaseParamCodeObjImplUnionWithDiscriminator = z.infer<
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

export const BaseParentCodeObjImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplArgsSchema,
    NestedParamCodeObjImplArgsSchema,
  ]);

export type BaseParentCodeObjImplArgsUnionWithDiscriminator = z.infer<
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

export function createBaseParentCodeObjImplUnionWithDiscriminator(
  options: Partial<BaseParentCodeObjImplUnionWithDiscriminator> = {},
): BaseParentCodeObjImplUnionWithDiscriminator {
  return BaseParentCodeObjImplUnionWithDiscriminatorSchema.parse(options);
}

export const ListRootSectionImplArgsSchema = z.object({
  type: z.literal("ListRoot").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type ListRootSectionImplArgs = z.infer<
  typeof ListRootSectionImplArgsSchema
>;

export function createListRootSectionImplArgs(
  options: Partial<ListRootSectionImplArgs> = {},
): ListRootSectionImplArgs {
  return ListRootSectionImplArgsSchema.parse(options);
}

export const DictRootSectionImplArgsSchema = z.object({
  type: z.literal("DictRoot").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type DictRootSectionImplArgs = z.infer<
  typeof DictRootSectionImplArgsSchema
>;

export function createDictRootSectionImplArgs(
  options: Partial<DictRootSectionImplArgs> = {},
): DictRootSectionImplArgs {
  return DictRootSectionImplArgsSchema.parse(options);
}

export const GroupSectionImplArgsSchema = z.object({
  type: z.literal("Group").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
  isHorizontalOrientation: z.boolean().optional(),
});

export type GroupSectionImplArgs = z.infer<typeof GroupSectionImplArgsSchema>;

export function createGroupSectionImplArgs(
  options: Partial<GroupSectionImplArgs> = {},
): GroupSectionImplArgs {
  return GroupSectionImplArgsSchema.parse(options);
}

export const BaseParentSectionImplArgsUnionSchema = z.union([
  ListRootSectionImplArgsSchema,
  DictRootSectionImplArgsSchema,
  GroupSectionImplArgsSchema,
]);

export type BaseParentSectionImplArgsUnion = z.infer<
  typeof BaseParentSectionImplArgsUnionSchema
>;

export const BaseParentSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ListRootSectionImplArgsSchema,
    DictRootSectionImplArgsSchema,
    GroupSectionImplArgsSchema,
  ]);

export type BaseParentSectionImplArgsUnionWithDiscriminator = z.infer<
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
    DictRootSectionImplSchema,
    GroupSectionImplSchema,
  ]);

export type BaseParentSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseParentSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseParentSectionImplUnionWithDiscriminator(
  options: Partial<BaseParentSectionImplUnionWithDiscriminator> = {},
): BaseParentSectionImplUnionWithDiscriminator {
  return BaseParentSectionImplUnionWithDiscriminatorSchema.parse(options);
}

export const CallableSectionImplArgsSchema = z.object({
  type: z.literal("Callable").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  callable: z.union([z.string(), z.null()]).optional(),
  hideParams: z.boolean().optional(),
});

export type CallableSectionImplArgs = z.infer<
  typeof CallableSectionImplArgsSchema
>;

export function createCallableSectionImplArgs(
  options: Partial<CallableSectionImplArgs> = {},
): CallableSectionImplArgs {
  return CallableSectionImplArgsSchema.parse(options);
}

export const ImageSectionImplArgsSchema = z.object({
  type: z.literal("Image").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
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

export function createImageSectionImplArgs(
  options: Partial<ImageSectionImplArgs> = {},
): ImageSectionImplArgs {
  return ImageSectionImplArgsSchema.parse(options);
}

export const TextBlockSectionImplArgsSchema = z.object({
  type: z.literal("TextBlock").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  format: z.enum(TextBlockFormatEnum).optional(),
  headingAsSectionName: z.boolean().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  text: z.string().optional(),
});

export type TextBlockSectionImplArgs = z.infer<
  typeof TextBlockSectionImplArgsSchema
>;

export function createTextBlockSectionImplArgs(
  options: Partial<TextBlockSectionImplArgs> = {},
): TextBlockSectionImplArgs {
  return TextBlockSectionImplArgsSchema.parse(options);
}

export const SocialSectionImplArgsSchema = z.object({
  type: z.literal("Social").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
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

export function createSocialSectionImplArgs(
  options: Partial<SocialSectionImplArgs> = {},
): SocialSectionImplArgs {
  return SocialSectionImplArgsSchema.parse(options);
}

export const TerminalSectionImplArgsSchema = z.object({
  type: z.literal("Terminal").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
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

export function createTerminalSectionImplArgs(
  options: Partial<TerminalSectionImplArgs> = {},
): TerminalSectionImplArgs {
  return TerminalSectionImplArgsSchema.parse(options);
}

export const IFrameSectionImplArgsSchema = z.object({
  type: z.literal("IFrame").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type IFrameSectionImplArgs = z.infer<typeof IFrameSectionImplArgsSchema>;

export function createIFrameSectionImplArgs(
  options: Partial<IFrameSectionImplArgs> = {},
): IFrameSectionImplArgs {
  return IFrameSectionImplArgsSchema.parse(options);
}

export const ChatSectionImplArgsSchema = z.object({
  type: z.literal("Chat").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type ChatSectionImplArgs = z.infer<typeof ChatSectionImplArgsSchema>;

export function createChatSectionImplArgs(
  options: Partial<ChatSectionImplArgs> = {},
): ChatSectionImplArgs {
  return ChatSectionImplArgsSchema.parse(options);
}

export const BrowserSectionImplArgsSchema = z.object({
  type: z.literal("Browser").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  folder: z.string().optional(),
  hideColumn: z.boolean().optional(),
  viewMode: z.enum(BrowserAreaViewModeEnum).optional(),
});

export type BrowserSectionImplArgs = z.infer<
  typeof BrowserSectionImplArgsSchema
>;

export function createBrowserSectionImplArgs(
  options: Partial<BrowserSectionImplArgs> = {},
): BrowserSectionImplArgs {
  return BrowserSectionImplArgsSchema.parse(options);
}

export const BaseSectionImplArgsUnionSchema = z.union([
  CallableSectionImplArgsSchema,
  DictSectionImplArgsSchema,
  ListRootSectionImplArgsSchema,
  DictRootSectionImplArgsSchema,
  GroupSectionImplArgsSchema,
  ImageSectionImplArgsSchema,
  ChartSectionImplArgsSchema,
  DrawSectionImplArgsSchema,
  TextBlockSectionImplArgsSchema,
  SocialSectionImplArgsSchema,
  GlobalVariablesSectionImplArgsSchema,
  CodeSectionImplArgsSchema,
  GenPythonCodeSectionImplArgsSchema,
  TerminalSectionImplArgsSchema,
  IFrameSectionImplArgsSchema,
  ChatSectionImplArgsSchema,
  BrowserSectionImplArgsSchema,
]);

export type BaseSectionImplArgsUnion = z.infer<
  typeof BaseSectionImplArgsUnionSchema
>;

export const BaseSectionImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplArgsSchema,
    DictSectionImplArgsSchema,
    ListRootSectionImplArgsSchema,
    DictRootSectionImplArgsSchema,
    GroupSectionImplArgsSchema,
    ImageSectionImplArgsSchema,
    ChartSectionImplArgsSchema,
    DrawSectionImplArgsSchema,
    TextBlockSectionImplArgsSchema,
    SocialSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
    TerminalSectionImplArgsSchema,
    IFrameSectionImplArgsSchema,
    ChatSectionImplArgsSchema,
    BrowserSectionImplArgsSchema,
  ]);

export type BaseSectionImplArgsUnionWithDiscriminator = z.infer<
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
    DictRootSectionImplSchema,
    GroupSectionImplSchema,
    ImageSectionImplSchema,
    ChartSectionImplSchema,
    DrawSectionImplSchema,
    TextBlockSectionImplSchema,
    SocialSectionImplSchema,
    GlobalVariablesSectionImplSchema,
    CodeSectionImplSchema,
    GenPythonCodeSectionImplSchema,
    TerminalSectionImplSchema,
    IFrameSectionImplSchema,
    ChatSectionImplSchema,
    BrowserSectionImplSchema,
  ],
);

export type BaseSectionImplUnionWithDiscriminator = z.infer<
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

export const BaseSectionWithParamsImplArgsUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplArgsSchema,
    DictSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
  ]);

export type BaseSectionWithParamsImplArgsUnionWithDiscriminator = z.infer<
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

export function createBaseSectionWithParamsImplUnionWithDiscriminator(
  options: Partial<BaseSectionWithParamsImplUnionWithDiscriminator> = {},
): BaseSectionWithParamsImplUnionWithDiscriminator {
  return BaseSectionWithParamsImplUnionWithDiscriminatorSchema.parse(options);
}

export const RealtimeUIChangeContentSchema = z.object({
  projectConfigId: z.string(),
  dependencyKey: z.union([
    SectionDependencyKeySchema,
    SectionParamDependencyKeySchema,
  ]),
  value: z.union([
    LiteralDependencyValueSchema,
    Base64DependencyValueSchema,
    FileReadDependencyValueSchema,
  ]),
});

export type RealtimeUIChangeContent = z.infer<
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

export function createWebsocketMsgRealtimeUIChange(
  options: Partial<WebsocketMsgRealtimeUIChange> = {},
): WebsocketMsgRealtimeUIChange {
  return WebsocketMsgRealtimeUIChangeSchema.parse(options);
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

export function createWebsocketMsgCurrentAddressUpdate(
  options: Partial<WebsocketMsgCurrentAddressUpdate> = {},
): WebsocketMsgCurrentAddressUpdate {
  return WebsocketMsgCurrentAddressUpdateSchema.parse(options);
}

export const BackendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgRealtimeUIChangeSchema,
  WebsocketMsgCurrentAddressUpdateSchema,
]);

export type BackendWebsocketMsgUnion = z.infer<
  typeof BackendWebsocketMsgUnionSchema
>;

export const BackendWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgRealtimeUIChangeSchema,
    WebsocketMsgCurrentAddressUpdateSchema,
  ]);

export type BackendWebsocketMsgUnionWithDiscriminator = z.infer<
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
});

export type WebsocketConnectionInfo = z.infer<
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

export function createWebsocketMsgAllConnections(
  options: Partial<WebsocketMsgAllConnections> = {},
): WebsocketMsgAllConnections {
  return WebsocketMsgAllConnectionsSchema.parse(options);
}

export const SettaNotificationSchema = z.object({
  id: z.string().default(create_new_id),
  projectConfigId: z
    .string()
    .default("NOTIFICATION_IS_FOR_ALL_PROJECTS" as const),
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

export function createWebsocketMsgNotification(
  options: Partial<WebsocketMsgNotification> = {},
): WebsocketMsgNotification {
  return WebsocketMsgNotificationSchema.parse(options);
}

export const LLMStreamingResponseSchema = z.object({
  chatId: z.string(),
  chunk: z.union([
    MessageStartEventSchema,
    MessageDeltaEventSchema,
    ToolCallDeltaEventSchema,
    ToolResultEventSchema,
    MessageStopEventSchema,
    MessageFinalizedEventSchema,
  ]),
});

export type LLMStreamingResponse = z.infer<typeof LLMStreamingResponseSchema>;

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

export function createWebsocketMsgLLMStreamingResponse(
  options: Partial<WebsocketMsgLLMStreamingResponse> = {},
): WebsocketMsgLLMStreamingResponse {
  return WebsocketMsgLLMStreamingResponseSchema.parse(options);
}

export const WebsocketMsgUUIDMappingForLLMSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.record(IDSchema, z.string()),
  messageType: z
    .literal("UUIDMappingForLLM")
    .default(WebsocketMsgTypeForFrontendEnum.UUIDMappingForLLM),
});

export type WebsocketMsgUUIDMappingForLLM = z.infer<
  typeof WebsocketMsgUUIDMappingForLLMSchema
>;

export function createWebsocketMsgUUIDMappingForLLM(
  options: Partial<WebsocketMsgUUIDMappingForLLM> = {},
): WebsocketMsgUUIDMappingForLLM {
  return WebsocketMsgUUIDMappingForLLMSchema.parse(options);
}

export const SettaGenCodeDiagnosticSchema = z.object({
  sectionId: z.string(),
  paramInfoId: z.union([z.string(), z.null()]),
  message: z.string(),
});

export type SettaGenCodeDiagnostic = z.infer<
  typeof SettaGenCodeDiagnosticSchema
>;

export function createSettaGenCodeDiagnostic(
  options: Partial<SettaGenCodeDiagnostic> = {},
): SettaGenCodeDiagnostic {
  return SettaGenCodeDiagnosticSchema.parse(options);
}

export const SettaProjectConfigDiagnosticsSchema = z.object({
  projectConfigId: z.string(),
  diagnostics: z.array(SettaGenCodeDiagnosticSchema),
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

export const WebsocketMsgLSPDiagnosticsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaProjectConfigDiagnosticsSchema,
  messageType: z
    .literal("LSPDiagnostics")
    .default(WebsocketMsgTypeForFrontendEnum.LSPDiagnostics),
});

export type WebsocketMsgLSPDiagnostics = z.infer<
  typeof WebsocketMsgLSPDiagnosticsSchema
>;

export function createWebsocketMsgLSPDiagnostics(
  options: Partial<WebsocketMsgLSPDiagnostics> = {},
): WebsocketMsgLSPDiagnostics {
  return WebsocketMsgLSPDiagnosticsSchema.parse(options);
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

export function createRenameReferenceChangedValue(
  options: Partial<RenameReferenceChangedValue> = {},
): RenameReferenceChangedValue {
  return RenameReferenceChangedValueSchema.parse(options);
}

export const RenameRefactorBroadcastContentSchema = z.object({
  projectConfigId: z.string(),
  frontendOpId: z.string(),
  renameMode: z.enum(RenameRefactorModeEnum),
  changedNodeValues: z.array(RenameReferenceChangedValueSchema),
});

export type RenameRefactorBroadcastContent = z.infer<
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

export function createWebsocketMsgReturnRenameRefactorResults(
  options: Partial<WebsocketMsgReturnRenameRefactorResults> = {},
): WebsocketMsgReturnRenameRefactorResults {
  return WebsocketMsgReturnRenameRefactorResultsSchema.parse(options);
}

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

export type Viewport = z.infer<typeof ViewportSchema>;

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

export function createTopLevelSectionLayout(
  options: Partial<TopLevelSectionLayout> = {},
): TopLevelSectionLayout {
  return TopLevelSectionLayoutSchema.parse(options);
}

export const ProjectConfigSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  previewImgColor: z
    .string()
    .default("bg-blue-500/60 dark:bg-blue-600/30" as const),
  viewport: z.union([ViewportSchema, z.null()]).default(createViewport),
  viewingEditingMode: z
    .enum(ViewingEditingModeEnum)
    .default(ViewingEditingModeEnum.DEV),
  genCodePrefix: z.string().default("" as const),
  genCodeSuffix: z.string().default("s = S()" as const),
  entryCodeBlockId: z.union([z.string(), z.null()]).default(null),
  topLevelSections: z
    .record(z.string(), TopLevelSectionLayoutSchema)
    .default({}),
  sectionVariantMap: z.record(z.string(), z.string()).default({}),
  activeIds: z.array(z.string()).default([]),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return ProjectConfigSchema.parse(options);
}

export const SingletonSectionsSchema = z.object({
  GlobalVariables: z.union([z.string(), z.null()]).default(null),
  GenPythonCode: z.union([z.string(), z.null()]).default(null),
});

export type SingletonSections = z.infer<typeof SingletonSectionsSchema>;

export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return SingletonSectionsSchema.parse(options);
}

export const ShownParamIdDetailsSchema = z.object({
  requiredParamIdsToPaths: z
    .record(z.string(), z.array(z.string()))
    .default({}),
  topLevelParamIds: z.array(z.string()).default([]),
});

export type ShownParamIdDetails = z.infer<typeof ShownParamIdDetailsSchema>;

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

export function createShownParamIds(
  options: Partial<ShownParamIds> = {},
): ShownParamIds {
  return ShownParamIdsSchema.parse(options);
}

export const ProjectStateSingleConfigSchema = z.object({
  sections: z.record(z.string(), CoreSchema).default({}),
  sectionImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        DictRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(z.string(), VariantSchema).default({}),
  codeObjs: z.record(z.string(), CoreSchema).default({}),
  codeObjImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(z.string(), VariantSchema).default({}),
  projectConfig: ProjectConfigSchema,
  singletonSections: SingletonSectionsSchema.default(createSingletonSections),
  parentSectionMap: z
    .record(z.string(), z.union([z.string(), z.null()]))
    .default({}),
  yamlValues: z.record(z.string(), z.string()).default({}),
  shownParamIds: z.record(z.string(), ShownParamIdsSchema).default({}),
  requiredDecodedImages: z.array(z.string()).default([]),
  genCodeBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type ProjectStateSingleConfig = z.infer<
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
  runCodeShortcut: z.string().default("Mod + Enter" as const),
  runEntryCodeBlockShortcut: z.string().default("Mod + Shift + Enter" as const),
  paramSelect: z.string().default("Mod + Shift" as const),
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
});

export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

export function createSettingsGUI(
  options: Partial<SettingsGUI> = {},
): SettingsGUI {
  return SettingsGUISchema.parse(options);
}

export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().default(true),
  autosave: z.boolean().default(true),
  autobackup: z.boolean().default(false),
  autobackupFreq: z.int().default(300),
  autobackupKeepLastN: z.int().default(10),
  clearTerminalBeforeMarkingAsReady: z.boolean().default(true),
  defaultTerminalShell: z.union([z.string(), z.null()]).default(null),
  exportDbReadableOnSave: z.boolean().default(false),
  exportDbReadableWithVariantsOnSave: z.boolean().default(false),
  renameRefactorMode: z
    .enum(RenameRefactorModeEnum)
    .default(RenameRefactorModeEnum.ALWAYS_ASK),
  saveRenderedValues: z.boolean().default(false),
});

export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

export function createSettingsBackend(
  options: Partial<SettingsBackend> = {},
): SettingsBackend {
  return SettingsBackendSchema.parse(options);
}

export const UserDefaultBrowserSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  folder: z.string().default("" as const),
  hideColumn: z.boolean().default(false),
  viewMode: z
    .enum(BrowserAreaViewModeEnum)
    .default(BrowserAreaViewModeEnum.list),
});

export type UserDefaultBrowserSectionImpl = z.infer<
  typeof UserDefaultBrowserSectionImplSchema
>;

export function createUserDefaultBrowserSectionImpl(
  options: Partial<UserDefaultBrowserSectionImpl> = {},
): UserDefaultBrowserSectionImpl {
  return UserDefaultBrowserSectionImplSchema.parse(options);
}

export const UserDefaultCallableSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  hideParams: z.boolean().default(false),
});

export type UserDefaultCallableSectionImpl = z.infer<
  typeof UserDefaultCallableSectionImplSchema
>;

export function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return UserDefaultCallableSectionImplSchema.parse(options);
}

export const UserDefaultChartSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 400.0, height: 400.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  dataPath: z.string().default("" as const),
});

export type UserDefaultChartSectionImpl = z.infer<
  typeof UserDefaultChartSectionImplSchema
>;

export function createUserDefaultChartSectionImpl(
  options: Partial<UserDefaultChartSectionImpl> = {},
): UserDefaultChartSectionImpl {
  return UserDefaultChartSectionImplSchema.parse(options);
}

export const UserDefaultChatSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 405.0, height: 405.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultChatSectionImpl = z.infer<
  typeof UserDefaultChatSectionImplSchema
>;

export function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return UserDefaultChatSectionImplSchema.parse(options);
}

export const UserDefaultCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
  codeLanguage: z.enum(CodeLanguageEnum).default(CodeLanguageEnum.python),
});

export type UserDefaultCodeSectionImpl = z.infer<
  typeof UserDefaultCodeSectionImplSchema
>;

export function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return UserDefaultCodeSectionImplSchema.parse(options);
}

export const UserDefaultDictRootSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultDictRootSectionImpl = z.infer<
  typeof UserDefaultDictRootSectionImplSchema
>;

export function createUserDefaultDictRootSectionImpl(
  options: Partial<UserDefaultDictRootSectionImpl> = {},
): UserDefaultDictRootSectionImpl {
  return UserDefaultDictRootSectionImplSchema.parse(options);
}

export const UserDefaultDictSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultDictSectionImpl = z.infer<
  typeof UserDefaultDictSectionImplSchema
>;

export function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return UserDefaultDictSectionImplSchema.parse(options);
}

export const UserDefaultDrawSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  layers: z.array(DrawAreaLayerSchema).default([]),
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

export function createUserDefaultDrawSectionImpl(
  options: Partial<UserDefaultDrawSectionImpl> = {},
): UserDefaultDrawSectionImpl {
  return UserDefaultDrawSectionImplSchema.parse(options);
}

export const UserDefaultGenPythonCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type UserDefaultGenPythonCodeSectionImpl = z.infer<
  typeof UserDefaultGenPythonCodeSectionImplSchema
>;

export function createUserDefaultGenPythonCodeSectionImpl(
  options: Partial<UserDefaultGenPythonCodeSectionImpl> = {},
): UserDefaultGenPythonCodeSectionImpl {
  return UserDefaultGenPythonCodeSectionImplSchema.parse(options);
}

export const UserDefaultGlobalVariablesSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultGlobalVariablesSectionImpl = z.infer<
  typeof UserDefaultGlobalVariablesSectionImplSchema
>;

export function createUserDefaultGlobalVariablesSectionImpl(
  options: Partial<UserDefaultGlobalVariablesSectionImpl> = {},
): UserDefaultGlobalVariablesSectionImpl {
  return UserDefaultGlobalVariablesSectionImplSchema.parse(options);
}

export const UserDefaultGroupSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isHorizontalOrientation: z.boolean().default(false),
});

export type UserDefaultGroupSectionImpl = z.infer<
  typeof UserDefaultGroupSectionImplSchema
>;

export function createUserDefaultGroupSectionImpl(
  options: Partial<UserDefaultGroupSectionImpl> = {},
): UserDefaultGroupSectionImpl {
  return UserDefaultGroupSectionImplSchema.parse(options);
}

export const UserDefaultIFrameSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultIFrameSectionImpl = z.infer<
  typeof UserDefaultIFrameSectionImplSchema
>;

export function createUserDefaultIFrameSectionImpl(
  options: Partial<UserDefaultIFrameSectionImpl> = {},
): UserDefaultIFrameSectionImpl {
  return UserDefaultIFrameSectionImplSchema.parse(options);
}

export const UserDefaultImageSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  imagePath: z.string().default("" as const),
});

export type UserDefaultImageSectionImpl = z.infer<
  typeof UserDefaultImageSectionImplSchema
>;

export function createUserDefaultImageSectionImpl(
  options: Partial<UserDefaultImageSectionImpl> = {},
): UserDefaultImageSectionImpl {
  return UserDefaultImageSectionImplSchema.parse(options);
}

export const UserDefaultListRootSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultListRootSectionImpl = z.infer<
  typeof UserDefaultListRootSectionImplSchema
>;

export function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return UserDefaultListRootSectionImplSchema.parse(options);
}

export const UserDefaultSocialSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  url: z.string().default("" as const),
});

export type UserDefaultSocialSectionImpl = z.infer<
  typeof UserDefaultSocialSectionImplSchema
>;

export function createUserDefaultSocialSectionImpl(
  options: Partial<UserDefaultSocialSectionImpl> = {},
): UserDefaultSocialSectionImpl {
  return UserDefaultSocialSectionImplSchema.parse(options);
}

export const UserDefaultTerminalSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 700.0, height: 300.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultTerminalSectionImpl = z.infer<
  typeof UserDefaultTerminalSectionImplSchema
>;

export function createUserDefaultTerminalSectionImpl(
  options: Partial<UserDefaultTerminalSectionImpl> = {},
): UserDefaultTerminalSectionImpl {
  return UserDefaultTerminalSectionImplSchema.parse(options);
}

export const UserDefaultTextBlockSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  format: z.enum(TextBlockFormatEnum).default(TextBlockFormatEnum.Plaintext),
  headingAsSectionName: z.boolean().default(false),
  textDisplayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.Render),
  text: z.string().default("" as const),
});

export type UserDefaultTextBlockSectionImpl = z.infer<
  typeof UserDefaultTextBlockSectionImplSchema
>;

export function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return UserDefaultTextBlockSectionImplSchema.parse(options);
}

export const UserDefaultCodeCallableCodeObjImplSchema = z.object({});

export type UserDefaultCodeCallableCodeObjImpl = z.infer<
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

export function createUserDefaultDropdownParamCodeObjImpl(
  options: Partial<UserDefaultDropdownParamCodeObjImpl> = {},
): UserDefaultDropdownParamCodeObjImpl {
  return UserDefaultDropdownParamCodeObjImplSchema.parse(options);
}

export const UserDefaultNestedParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
});

export type UserDefaultNestedParamCodeObjImpl = z.infer<
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
});

export type UserDefaultPasswordParamCodeObjImpl = z.infer<
  typeof UserDefaultPasswordParamCodeObjImplSchema
>;

export function createUserDefaultPasswordParamCodeObjImpl(
  options: Partial<UserDefaultPasswordParamCodeObjImpl> = {},
): UserDefaultPasswordParamCodeObjImpl {
  return UserDefaultPasswordParamCodeObjImplSchema.parse(options);
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

export function createUserDefaultSwitchParamCodeObjImpl(
  options: Partial<UserDefaultSwitchParamCodeObjImpl> = {},
): UserDefaultSwitchParamCodeObjImpl {
  return UserDefaultSwitchParamCodeObjImplSchema.parse(options);
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

export function createUserDefaultTextParamCodeObjImpl(
  options: Partial<UserDefaultTextParamCodeObjImpl> = {},
): UserDefaultTextParamCodeObjImpl {
  return UserDefaultTextParamCodeObjImplSchema.parse(options);
}

export const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.default(createSettingsShortcuts),
  gui: SettingsGUISchema.default(createSettingsGUI),
  backend: SettingsBackendSchema.default(createSettingsBackend),
  languageServer: z.record(z.string(), z.any()).default({}),
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
  dictRootSectionDefault: UserDefaultDictRootSectionImplSchema.default(
    createUserDefaultDictRootSectionImpl,
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
  socialSectionDefault: UserDefaultSocialSectionImplSchema.default(
    createUserDefaultSocialSectionImpl,
  ),
  terminalSectionDefault: UserDefaultTerminalSectionImplSchema.default(
    createUserDefaultTerminalSectionImpl,
  ),
  textBlockSectionDefault: UserDefaultTextBlockSectionImplSchema.default(
    createUserDefaultTextBlockSectionImpl,
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
  nestedParamCodeObjDefault: UserDefaultNestedParamCodeObjImplSchema.default(
    createUserDefaultNestedParamCodeObjImpl,
  ),
  passwordParamCodeObjDefault:
    UserDefaultPasswordParamCodeObjImplSchema.default(
      createUserDefaultPasswordParamCodeObjImpl,
    ),
  sliderParamCodeObjDefault: UserDefaultSliderParamCodeObjImplSchema.default(
    createUserDefaultSliderParamCodeObjImpl,
  ),
  switchParamCodeObjDefault: UserDefaultSwitchParamCodeObjImplSchema.default(
    createUserDefaultSwitchParamCodeObjImpl,
  ),
  textParamCodeObjDefault: UserDefaultTextParamCodeObjImplSchema.default(
    createUserDefaultTextParamCodeObjImpl,
  ),
});

export type SettingsState = z.infer<typeof SettingsStateSchema>;

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
    ]),
  ),
  updateType: z.literal(["update", "delete"]),
});

export type UpdateArtifactMsgContent = z.infer<
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

export function createWebsocketMsgUpdateArtifacts(
  options: Partial<WebsocketMsgUpdateArtifacts> = {},
): WebsocketMsgUpdateArtifacts {
  return WebsocketMsgUpdateArtifactsSchema.parse(options);
}

export const ListenerCoverageSnapshotSchema = z.object({
  projectConfigId: z.string(),
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
  temporary: z.boolean().default(false),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export function createLLMConfig(options: Partial<LLMConfig> = {}): LLMConfig {
  return LLMConfigSchema.parse(options);
}

export const AllLLMConfigsSchema = z.object({
  configs: z.record(z.string(), LLMConfigSchema).default({}),
  default_config_id: z.union([z.string(), z.null()]).default(null),
});

export type AllLLMConfigs = z.infer<typeof AllLLMConfigsSchema>;

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

export function createWebsocketMsgLLMApiKeysUpdated(
  options: Partial<WebsocketMsgLLMApiKeysUpdated> = {},
): WebsocketMsgLLMApiKeysUpdated {
  return WebsocketMsgLLMApiKeysUpdatedSchema.parse(options);
}

export const FrontendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgUUIDMappingForLLMSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
  WebsocketMsgAllProjectMetadataSchema,
  WebsocketMsgUpdateArtifactsSchema,
  WebsocketMsgListenerCoverageSnapshotSchema,
  WebsocketMsgLLMConfigUpdatedSchema,
  WebsocketMsgLLMApiKeysUpdatedSchema,
]);

export type FrontendWebsocketMsgUnion = z.infer<
  typeof FrontendWebsocketMsgUnionSchema
>;

export const FrontendWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgUUIDMappingForLLMSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
    WebsocketMsgAllProjectMetadataSchema,
    WebsocketMsgUpdateArtifactsSchema,
    WebsocketMsgListenerCoverageSnapshotSchema,
    WebsocketMsgLLMConfigUpdatedSchema,
    WebsocketMsgLLMApiKeysUpdatedSchema,
  ]);

export type FrontendWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof FrontendWebsocketMsgUnionWithDiscriminatorSchema
>;

export function createFrontendWebsocketMsgUnionWithDiscriminator(
  options: Partial<FrontendWebsocketMsgUnionWithDiscriminator> = {},
): FrontendWebsocketMsgUnionWithDiscriminator {
  return FrontendWebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const ListenerRealtimeEventContentSchema = z.object({
  projectConfigId: z.string(),
  deltas: z.array(z.any()),
  sequence: z.int(),
});

export type ListenerRealtimeEventContent = z.infer<
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

export function createWebsocketMsgListenerRealtimeEvent(
  options: Partial<WebsocketMsgListenerRealtimeEvent> = {},
): WebsocketMsgListenerRealtimeEvent {
  return WebsocketMsgListenerRealtimeEventSchema.parse(options);
}

export const ListenerForceRefreshContentSchema = z.object({
  projectState: z
    .union([ProjectStateSingleConfigSchema, z.null()])
    .default(null),
});

export type ListenerForceRefreshContent = z.infer<
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

export function createWebsocketMsgListenerError(
  options: Partial<WebsocketMsgListenerError> = {},
): WebsocketMsgListenerError {
  return WebsocketMsgListenerErrorSchema.parse(options);
}

export const ListenerFrontendEmitRawContentSchema = z.object({
  projectConfigId: z.string(),
  dependencyValues: z.record(z.string(), z.any()).default({}),
  artifactUpdates: z
    .array(
      z.discriminatedUnion("type", [
        ImageArtifactSchema,
        BrushStrokeArtifactSchema,
        DrawAreaLayerItemTransformArtifactSchema,
        ChartDataArtifactSchema,
      ]),
    )
    .default([]),
});

export type ListenerFrontendEmitRawContent = z.infer<
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

export function createWebsocketMsgListenerFrontendEmit(
  options: Partial<WebsocketMsgListenerFrontendEmit> = {},
): WebsocketMsgListenerFrontendEmit {
  return WebsocketMsgListenerFrontendEmitSchema.parse(options);
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

export function createListenerRegisterCallback(
  options: Partial<ListenerRegisterCallback> = {},
): ListenerRegisterCallback {
  return ListenerRegisterCallbackSchema.parse(options);
}

export const ListenerRegisterContentSchema = z.object({
  projectConfigId: z.string(),
  callbacks: z.record(z.string(), ListenerRegisterCallbackSchema),
});

export type ListenerRegisterContent = z.infer<
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

export function createListenerRegisterAckStatus(
  options: Partial<ListenerRegisterAckStatus> = {},
): ListenerRegisterAckStatus {
  return ListenerRegisterAckStatusSchema.parse(options);
}

export const ListenerRegisterAckContentSchema = z.object({
  projectConfigId: z.string(),
  callbacks: z.record(z.string(), ListenerRegisterAckStatusSchema),
});

export type ListenerRegisterAckContent = z.infer<
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

export function createWebsocketMsgListenerRegisterAck(
  options: Partial<WebsocketMsgListenerRegisterAck> = {},
): WebsocketMsgListenerRegisterAck {
  return WebsocketMsgListenerRegisterAckSchema.parse(options);
}

export const ListenerInitContentSchema = z.object({
  projectConfigId: z.union([z.string(), z.null()]).default(null),
  projectName: z.union([z.string(), z.null()]).default(null),
});

export type ListenerInitContent = z.infer<typeof ListenerInitContentSchema>;

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

export function createWebsocketMsgListenerInit(
  options: Partial<WebsocketMsgListenerInit> = {},
): WebsocketMsgListenerInit {
  return WebsocketMsgListenerInitSchema.parse(options);
}

export const PythonScriptWebsocketMsgUnionSchema = z.union([
  WebsocketMsgListenerRealtimeEventSchema,
  WebsocketMsgListenerForceRefreshSchema,
  WebsocketMsgListenerErrorSchema,
  WebsocketMsgListenerFrontendEmitSchema,
  WebsocketMsgListenerRegisterSchema,
  WebsocketMsgListenerRegisterAckSchema,
  WebsocketMsgListenerInitSchema,
]);

export type PythonScriptWebsocketMsgUnion = z.infer<
  typeof PythonScriptWebsocketMsgUnionSchema
>;

export const PythonScriptWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgListenerRealtimeEventSchema,
    WebsocketMsgListenerForceRefreshSchema,
    WebsocketMsgListenerErrorSchema,
    WebsocketMsgListenerFrontendEmitSchema,
    WebsocketMsgListenerRegisterSchema,
    WebsocketMsgListenerRegisterAckSchema,
    WebsocketMsgListenerInitSchema,
  ]);

export type PythonScriptWebsocketMsgUnionWithDiscriminator = z.infer<
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
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgUUIDMappingForLLMSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
  WebsocketMsgAllProjectMetadataSchema,
  WebsocketMsgUpdateArtifactsSchema,
  WebsocketMsgListenerCoverageSnapshotSchema,
  WebsocketMsgLLMConfigUpdatedSchema,
  WebsocketMsgLLMApiKeysUpdatedSchema,
  WebsocketMsgRealtimeUIChangeSchema,
  WebsocketMsgCurrentAddressUpdateSchema,
  WebsocketMsgListenerRealtimeEventSchema,
  WebsocketMsgListenerForceRefreshSchema,
  WebsocketMsgListenerErrorSchema,
  WebsocketMsgListenerFrontendEmitSchema,
  WebsocketMsgListenerRegisterSchema,
  WebsocketMsgListenerRegisterAckSchema,
  WebsocketMsgListenerInitSchema,
]);

export type WebsocketMsgUnion = z.infer<typeof WebsocketMsgUnionSchema>;

export const WebsocketMsgUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "messageType",
  [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgUUIDMappingForLLMSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
    WebsocketMsgAllProjectMetadataSchema,
    WebsocketMsgUpdateArtifactsSchema,
    WebsocketMsgListenerCoverageSnapshotSchema,
    WebsocketMsgLLMConfigUpdatedSchema,
    WebsocketMsgLLMApiKeysUpdatedSchema,
    WebsocketMsgRealtimeUIChangeSchema,
    WebsocketMsgCurrentAddressUpdateSchema,
    WebsocketMsgListenerRealtimeEventSchema,
    WebsocketMsgListenerForceRefreshSchema,
    WebsocketMsgListenerErrorSchema,
    WebsocketMsgListenerFrontendEmitSchema,
    WebsocketMsgListenerRegisterSchema,
    WebsocketMsgListenerRegisterAckSchema,
    WebsocketMsgListenerInitSchema,
  ],
);

export type WebsocketMsgUnionWithDiscriminator = z.infer<
  typeof WebsocketMsgUnionWithDiscriminatorSchema
>;

export function createWebsocketMsgUnionWithDiscriminator(
  options: Partial<WebsocketMsgUnionWithDiscriminator> = {},
): WebsocketMsgUnionWithDiscriminator {
  return WebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const IDToUUIDForLLMSchema = z.record(IDSchema, z.string());

export type IDToUUIDForLLM = z.infer<typeof IDToUUIDForLLMSchema>;

export const UUIDToIDForLLMSchema = z.record(z.string(), IDSchema);

export type UUIDToIDForLLM = z.infer<typeof UUIDToIDForLLMSchema>;

export const BaseCanvasSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  renderedValue: z.union([z.string(), z.null()]).optional(),
});

export type BaseCanvasSectionImplArgs = z.infer<
  typeof BaseCanvasSectionImplArgsSchema
>;

export function createBaseCanvasSectionImplArgs(
  options: Partial<BaseCanvasSectionImplArgs> = {},
): BaseCanvasSectionImplArgs {
  return BaseCanvasSectionImplArgsSchema.parse(options);
}

export const BaseCanvasSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  renderedValue: z.union([z.string(), z.null(), z.any()]).optional(),
});

export type BaseCanvasSectionImplArgsWithCallable = z.infer<
  typeof BaseCanvasSectionImplArgsWithCallableSchema
>;

export function createBaseCanvasSectionImplArgsWithCallable(
  options: Partial<BaseCanvasSectionImplArgsWithCallable> = {},
): BaseCanvasSectionImplArgsWithCallable {
  return BaseCanvasSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
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

export function createBaseChildlessCodeObjImplArgs(
  options: Partial<BaseChildlessCodeObjImplArgs> = {},
): BaseChildlessCodeObjImplArgs {
  return BaseChildlessCodeObjImplArgsSchema.parse(options);
}

export const BaseChildlessCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createBaseChildlessCodeObjImplArgsWithCallable(
  options: Partial<BaseChildlessCodeObjImplArgsWithCallable> = {},
): BaseChildlessCodeObjImplArgsWithCallable {
  return BaseChildlessCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseCodeObjImplArgs = z.infer<typeof BaseCodeObjImplArgsSchema>;

export function createBaseCodeObjImplArgs(
  options: Partial<BaseCodeObjImplArgs> = {},
): BaseCodeObjImplArgs {
  return BaseCodeObjImplArgsSchema.parse(options);
}

export const BaseCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseCodeObjImplArgsWithCallable = z.infer<
  typeof BaseCodeObjImplArgsWithCallableSchema
>;

export function createBaseCodeObjImplArgsWithCallable(
  options: Partial<BaseCodeObjImplArgsWithCallable> = {},
): BaseCodeObjImplArgsWithCallable {
  return BaseCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseCodeSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
});

export type BaseCodeSectionImplArgs = z.infer<
  typeof BaseCodeSectionImplArgsSchema
>;

export function createBaseCodeSectionImplArgs(
  options: Partial<BaseCodeSectionImplArgs> = {},
): BaseCodeSectionImplArgs {
  return BaseCodeSectionImplArgsSchema.parse(options);
}

export const BaseCodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
});

export type BaseCodeSectionImplArgsWithCallable = z.infer<
  typeof BaseCodeSectionImplArgsWithCallableSchema
>;

export function createBaseCodeSectionImplArgsWithCallable(
  options: Partial<BaseCodeSectionImplArgsWithCallable> = {},
): BaseCodeSectionImplArgsWithCallable {
  return BaseCodeSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseDictSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  topLevelParamId: z.union([z.string(), z.null()]).optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});

export type BaseDictSectionImplArgs = z.infer<
  typeof BaseDictSectionImplArgsSchema
>;

export function createBaseDictSectionImplArgs(
  options: Partial<BaseDictSectionImplArgs> = {},
): BaseDictSectionImplArgs {
  return BaseDictSectionImplArgsSchema.parse(options);
}

export const BaseDictSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(z.string()), z.any()]).optional(),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto"), z.any()])
    .optional(),
  selectedParams: z.union([z.array(z.string()), z.any()]).optional(),
  ignoreTypeErrors: z
    .union([z.record(z.string(), z.boolean()), z.any()])
    .optional(),
  displayMode: z
    .union([z.enum(SectionWithParamsDisplayModeEnum), z.any()])
    .optional(),
  topLevelParamId: z.union([z.string(), z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type BaseDictSectionImplArgsWithCallable = z.infer<
  typeof BaseDictSectionImplArgsWithCallableSchema
>;

export function createBaseDictSectionImplArgsWithCallable(
  options: Partial<BaseDictSectionImplArgsWithCallable> = {},
): BaseDictSectionImplArgsWithCallable {
  return BaseDictSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseParamCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
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

export function createBaseParamCodeObjImplArgs(
  options: Partial<BaseParamCodeObjImplArgs> = {},
): BaseParamCodeObjImplArgs {
  return BaseParamCodeObjImplArgsSchema.parse(options);
}

export const BaseParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createBaseParamCodeObjImplArgsWithCallable(
  options: Partial<BaseParamCodeObjImplArgsWithCallable> = {},
): BaseParamCodeObjImplArgsWithCallable {
  return BaseParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseParentCodeObjImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type BaseParentCodeObjImplArgs = z.infer<
  typeof BaseParentCodeObjImplArgsSchema
>;

export function createBaseParentCodeObjImplArgs(
  options: Partial<BaseParentCodeObjImplArgs> = {},
): BaseParentCodeObjImplArgs {
  return BaseParentCodeObjImplArgsSchema.parse(options);
}

export const BaseParentCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type BaseParentCodeObjImplArgsWithCallable = z.infer<
  typeof BaseParentCodeObjImplArgsWithCallableSchema
>;

export function createBaseParentCodeObjImplArgsWithCallable(
  options: Partial<BaseParentCodeObjImplArgsWithCallable> = {},
): BaseParentCodeObjImplArgsWithCallable {
  return BaseParentCodeObjImplArgsWithCallableSchema.parse(options);
}

export const BaseParentSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type BaseParentSectionImplArgs = z.infer<
  typeof BaseParentSectionImplArgsSchema
>;

export function createBaseParentSectionImplArgs(
  options: Partial<BaseParentSectionImplArgs> = {},
): BaseParentSectionImplArgs {
  return BaseParentSectionImplArgsSchema.parse(options);
}

export const BaseParentSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type BaseParentSectionImplArgsWithCallable = z.infer<
  typeof BaseParentSectionImplArgsWithCallableSchema
>;

export function createBaseParentSectionImplArgsWithCallable(
  options: Partial<BaseParentSectionImplArgsWithCallable> = {},
): BaseParentSectionImplArgsWithCallable {
  return BaseParentSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseSectionImplArgs = z.infer<typeof BaseSectionImplArgsSchema>;

export function createBaseSectionImplArgs(
  options: Partial<BaseSectionImplArgs> = {},
): BaseSectionImplArgs {
  return BaseSectionImplArgsSchema.parse(options);
}

export const BaseSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
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

export function createBaseSectionImplArgsWithCallable(
  options: Partial<BaseSectionImplArgsWithCallable> = {},
): BaseSectionImplArgsWithCallable {
  return BaseSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseSectionWithParamsImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  codeObjVariantMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
});

export type BaseSectionWithParamsImplArgs = z.infer<
  typeof BaseSectionWithParamsImplArgsSchema
>;

export function createBaseSectionWithParamsImplArgs(
  options: Partial<BaseSectionWithParamsImplArgs> = {},
): BaseSectionWithParamsImplArgs {
  return BaseSectionWithParamsImplArgsSchema.parse(options);
}

export const BaseSectionWithParamsImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(z.string()), z.any()]).optional(),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto"), z.any()])
    .optional(),
  selectedParams: z.union([z.array(z.string()), z.any()]).optional(),
  ignoreTypeErrors: z
    .union([z.record(z.string(), z.boolean()), z.any()])
    .optional(),
  displayMode: z
    .union([z.enum(SectionWithParamsDisplayModeEnum), z.any()])
    .optional(),
});

export type BaseSectionWithParamsImplArgsWithCallable = z.infer<
  typeof BaseSectionWithParamsImplArgsWithCallableSchema
>;

export function createBaseSectionWithParamsImplArgsWithCallable(
  options: Partial<BaseSectionWithParamsImplArgsWithCallable> = {},
): BaseSectionWithParamsImplArgsWithCallable {
  return BaseSectionWithParamsImplArgsWithCallableSchema.parse(options);
}

export const BrowserSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Browser"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  folder: z.union([z.string(), z.any()]).optional(),
  hideColumn: z.union([z.boolean(), z.any()]).optional(),
  viewMode: z.union([z.enum(BrowserAreaViewModeEnum), z.any()]).optional(),
});

export type BrowserSectionImplArgsWithCallable = z.infer<
  typeof BrowserSectionImplArgsWithCallableSchema
>;

export function createBrowserSectionImplArgsWithCallable(
  options: Partial<BrowserSectionImplArgsWithCallable> = {},
): BrowserSectionImplArgsWithCallable {
  return BrowserSectionImplArgsWithCallableSchema.parse(options);
}

export const CallableSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Callable"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(z.string()), z.any()]).optional(),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto"), z.any()])
    .optional(),
  selectedParams: z.union([z.array(z.string()), z.any()]).optional(),
  ignoreTypeErrors: z
    .union([z.record(z.string(), z.boolean()), z.any()])
    .optional(),
  displayMode: z
    .union([z.enum(SectionWithParamsDisplayModeEnum), z.any()])
    .optional(),
  callable: z.union([z.string(), z.null(), z.any()]).optional(),
  hideParams: z.union([z.boolean(), z.any()]).optional(),
});

export type CallableSectionImplArgsWithCallable = z.infer<
  typeof CallableSectionImplArgsWithCallableSchema
>;

export function createCallableSectionImplArgsWithCallable(
  options: Partial<CallableSectionImplArgsWithCallable> = {},
): CallableSectionImplArgsWithCallable {
  return CallableSectionImplArgsWithCallableSchema.parse(options);
}

export const ChartSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chart"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  renderedValue: z.union([z.string(), z.null(), z.any()]).optional(),
  dataPath: z.union([z.string(), z.any()]).optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema, z.any()])
    .optional(),
});

export type ChartSectionImplArgsWithCallable = z.infer<
  typeof ChartSectionImplArgsWithCallableSchema
>;

export function createChartSectionImplArgsWithCallable(
  options: Partial<ChartSectionImplArgsWithCallable> = {},
): ChartSectionImplArgsWithCallable {
  return ChartSectionImplArgsWithCallableSchema.parse(options);
}

export const ChatSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chat"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
});

export type ChatSectionImplArgsWithCallable = z.infer<
  typeof ChatSectionImplArgsWithCallableSchema
>;

export function createChatSectionImplArgsWithCallable(
  options: Partial<ChatSectionImplArgsWithCallable> = {},
): ChatSectionImplArgsWithCallable {
  return ChatSectionImplArgsWithCallableSchema.parse(options);
}

export const CodeCallableCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("CodeCallable"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type CodeCallableCodeObjImplArgsWithCallable = z.infer<
  typeof CodeCallableCodeObjImplArgsWithCallableSchema
>;

export function createCodeCallableCodeObjImplArgsWithCallable(
  options: Partial<CodeCallableCodeObjImplArgsWithCallable> = {},
): CodeCallableCodeObjImplArgsWithCallable {
  return CodeCallableCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CodeParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("CodeParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createCodeParamCodeObjImplArgsWithCallable(
  options: Partial<CodeParamCodeObjImplArgsWithCallable> = {},
): CodeParamCodeObjImplArgsWithCallable {
  return CodeParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Code"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
  codeLanguage: z.union([z.enum(CodeLanguageEnum), z.any()]).optional(),
});

export type CodeSectionImplArgsWithCallable = z.infer<
  typeof CodeSectionImplArgsWithCallableSchema
>;

export function createCodeSectionImplArgsWithCallable(
  options: Partial<CodeSectionImplArgsWithCallable> = {},
): CodeSectionImplArgsWithCallable {
  return CodeSectionImplArgsWithCallableSchema.parse(options);
}

export const ColorPickerParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ColorPickerParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createColorPickerParamCodeObjImplArgsWithCallable(
  options: Partial<ColorPickerParamCodeObjImplArgsWithCallable> = {},
): ColorPickerParamCodeObjImplArgsWithCallable {
  return ColorPickerParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const DictRootSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("DictRoot"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type DictRootSectionImplArgsWithCallable = z.infer<
  typeof DictRootSectionImplArgsWithCallableSchema
>;

export function createDictRootSectionImplArgsWithCallable(
  options: Partial<DictRootSectionImplArgsWithCallable> = {},
): DictRootSectionImplArgsWithCallable {
  return DictRootSectionImplArgsWithCallableSchema.parse(options);
}

export const DictSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Dict"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(z.string()), z.any()]).optional(),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto"), z.any()])
    .optional(),
  selectedParams: z.union([z.array(z.string()), z.any()]).optional(),
  ignoreTypeErrors: z
    .union([z.record(z.string(), z.boolean()), z.any()])
    .optional(),
  displayMode: z
    .union([z.enum(SectionWithParamsDisplayModeEnum), z.any()])
    .optional(),
  topLevelParamId: z.union([z.string(), z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type DictSectionImplArgsWithCallable = z.infer<
  typeof DictSectionImplArgsWithCallableSchema
>;

export function createDictSectionImplArgsWithCallable(
  options: Partial<DictSectionImplArgsWithCallable> = {},
): DictSectionImplArgsWithCallable {
  return DictSectionImplArgsWithCallableSchema.parse(options);
}

export const DrawSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Draw"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  renderedValue: z.union([z.string(), z.null(), z.any()]).optional(),
  layers: z.union([z.array(DrawAreaLayerSchema), z.any()]).optional(),
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

export function createDrawSectionImplArgsWithCallable(
  options: Partial<DrawSectionImplArgsWithCallable> = {},
): DrawSectionImplArgsWithCallable {
  return DrawSectionImplArgsWithCallableSchema.parse(options);
}

export const DropdownParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("DropdownParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createDropdownParamCodeObjImplArgsWithCallable(
  options: Partial<DropdownParamCodeObjImplArgsWithCallable> = {},
): DropdownParamCodeObjImplArgsWithCallable {
  return DropdownParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const GenPythonCodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GenPythonCode"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  code: z.union([z.string(), z.any()]).optional(),
  codeFileBinding: z
    .union([CodeFileBindingSchema, z.null(), z.any()])
    .optional(),
});

export type GenPythonCodeSectionImplArgsWithCallable = z.infer<
  typeof GenPythonCodeSectionImplArgsWithCallableSchema
>;

export function createGenPythonCodeSectionImplArgsWithCallable(
  options: Partial<GenPythonCodeSectionImplArgsWithCallable> = {},
): GenPythonCodeSectionImplArgsWithCallable {
  return GenPythonCodeSectionImplArgsWithCallableSchema.parse(options);
}

export const GlobalVariablesSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GlobalVariables"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  codeObjVariantMap: z
    .union([z.record(z.string(), z.string()), z.any()])
    .optional(),
  hideUnpinnedParams: z.union([z.boolean(), z.any()]).optional(),
  paramFilter: z.union([z.string(), z.any()]).optional(),
  columnWidth: z.union([z.number(), z.null(), z.any()]).optional(),
  configLanguage: z.union([z.enum(ConfigLanguageEnum), z.any()]).optional(),
  pinnedParams: z.union([z.array(z.string()), z.any()]).optional(),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto"), z.any()])
    .optional(),
  selectedParams: z.union([z.array(z.string()), z.any()]).optional(),
  ignoreTypeErrors: z
    .union([z.record(z.string(), z.boolean()), z.any()])
    .optional(),
  displayMode: z
    .union([z.enum(SectionWithParamsDisplayModeEnum), z.any()])
    .optional(),
  topLevelParamId: z.union([z.string(), z.null(), z.any()]).optional(),
  isJsonSource: z.union([z.boolean(), z.any()]).optional(),
  jsonSourceKeys: z.union([z.array(z.string()), z.any()]).optional(),
  jsonSourceMissing: z.union([z.boolean(), z.any()]).optional(),
});

export type GlobalVariablesSectionImplArgsWithCallable = z.infer<
  typeof GlobalVariablesSectionImplArgsWithCallableSchema
>;

export function createGlobalVariablesSectionImplArgsWithCallable(
  options: Partial<GlobalVariablesSectionImplArgsWithCallable> = {},
): GlobalVariablesSectionImplArgsWithCallable {
  return GlobalVariablesSectionImplArgsWithCallableSchema.parse(options);
}

export const GroupSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Group"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
  isHorizontalOrientation: z.union([z.boolean(), z.any()]).optional(),
});

export type GroupSectionImplArgsWithCallable = z.infer<
  typeof GroupSectionImplArgsWithCallableSchema
>;

export function createGroupSectionImplArgsWithCallable(
  options: Partial<GroupSectionImplArgsWithCallable> = {},
): GroupSectionImplArgsWithCallable {
  return GroupSectionImplArgsWithCallableSchema.parse(options);
}

export const IFrameSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("IFrame"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
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

export function createIFrameSectionImplArgsWithCallable(
  options: Partial<IFrameSectionImplArgsWithCallable> = {},
): IFrameSectionImplArgsWithCallable {
  return IFrameSectionImplArgsWithCallableSchema.parse(options);
}

export const ImageSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Image"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
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

export function createImageSectionImplArgsWithCallable(
  options: Partial<ImageSectionImplArgsWithCallable> = {},
): ImageSectionImplArgsWithCallable {
  return ImageSectionImplArgsWithCallableSchema.parse(options);
}

export const ListRootSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ListRoot"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type ListRootSectionImplArgsWithCallable = z.infer<
  typeof ListRootSectionImplArgsWithCallableSchema
>;

export function createListRootSectionImplArgsWithCallable(
  options: Partial<ListRootSectionImplArgsWithCallable> = {},
): ListRootSectionImplArgsWithCallable {
  return ListRootSectionImplArgsWithCallableSchema.parse(options);
}

export const NestedParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("NestedParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  description: z.union([z.string(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  coreNameType: z.union([z.enum(ParamNameTypeEnum), z.any()]).optional(),
  coreNameEditable: z.union([z.boolean(), z.any()]).optional(),
  passingStyle: z
    .union([z.enum(ParameterPassingStyleEnum), z.any()])
    .optional(),
  children: z.union([z.array(z.string()), z.any()]).optional(),
});

export type NestedParamCodeObjImplArgsWithCallable = z.infer<
  typeof NestedParamCodeObjImplArgsWithCallableSchema
>;

export function createNestedParamCodeObjImplArgsWithCallable(
  options: Partial<NestedParamCodeObjImplArgsWithCallable> = {},
): NestedParamCodeObjImplArgsWithCallable {
  return NestedParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const PasswordParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("PasswordParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export type PasswordParamCodeObjImplArgsWithCallable = z.infer<
  typeof PasswordParamCodeObjImplArgsWithCallableSchema
>;

export function createPasswordParamCodeObjImplArgsWithCallable(
  options: Partial<PasswordParamCodeObjImplArgsWithCallable> = {},
): PasswordParamCodeObjImplArgsWithCallable {
  return PasswordParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const SliderParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("SliderParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createSliderParamCodeObjImplArgsWithCallable(
  options: Partial<SliderParamCodeObjImplArgsWithCallable> = {},
): SliderParamCodeObjImplArgsWithCallable {
  return SliderParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const SocialSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Social"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
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

export function createSocialSectionImplArgsWithCallable(
  options: Partial<SocialSectionImplArgsWithCallable> = {},
): SocialSectionImplArgsWithCallable {
  return SocialSectionImplArgsWithCallableSchema.parse(options);
}

export const SwitchParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("SwitchParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createSwitchParamCodeObjImplArgsWithCallable(
  options: Partial<SwitchParamCodeObjImplArgsWithCallable> = {},
): SwitchParamCodeObjImplArgsWithCallable {
  return SwitchParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const TerminalSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Terminal"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
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

export function createTerminalSectionImplArgsWithCallable(
  options: Partial<TerminalSectionImplArgsWithCallable> = {},
): TerminalSectionImplArgsWithCallable {
  return TerminalSectionImplArgsWithCallableSchema.parse(options);
}

export const TextBlockSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextBlock"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  isFrozen: z.union([z.boolean(), z.any()]).optional(),
  visibility: z.union([VisibilitySchema, z.any()]).optional(),
  isInOtherProjectConfigs: z.union([z.boolean(), z.any()]).optional(),
  size: z.union([SectionSizeSchema, z.any()]).optional(),
  aspectRatio: z.union([z.boolean(), z.number(), z.any()]).optional(),
  aspectRatioExtraHeight: z.union([z.int(), z.any()]).optional(),
  aspectRatioExtraWidth: z.union([z.int(), z.any()]).optional(),
  isMinimized: z.union([z.boolean(), z.any()]).optional(),
  positionAndSizeLocked: z.union([z.boolean(), z.any()]).optional(),
  isPreset: z.union([z.boolean(), z.any()]).optional(),
  format: z.union([z.enum(TextBlockFormatEnum), z.any()]).optional(),
  headingAsSectionName: z.union([z.boolean(), z.any()]).optional(),
  textDisplayMode: z
    .union([z.enum(TextBlockDisplayModeEnum), z.any()])
    .optional(),
  text: z.union([z.string(), z.any()]).optional(),
});

export type TextBlockSectionImplArgsWithCallable = z.infer<
  typeof TextBlockSectionImplArgsWithCallableSchema
>;

export function createTextBlockSectionImplArgsWithCallable(
  options: Partial<TextBlockSectionImplArgsWithCallable> = {},
): TextBlockSectionImplArgsWithCallable {
  return TextBlockSectionImplArgsWithCallableSchema.parse(options);
}

export const TextParamCodeObjImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextParam"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
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

export function createTextParamCodeObjImplArgsWithCallable(
  options: Partial<TextParamCodeObjImplArgsWithCallable> = {},
): TextParamCodeObjImplArgsWithCallable {
  return TextParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const CoreArgsSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  variants: z.array(z.string()).optional(),
  defaultVariant: z.union([z.string(), z.null()]).optional(),
  sharedModifier: SharedModifierSchema.optional(),
  unsharedKeys: z
    .array(
      z.literal([
        "activeLayerIdx",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "brushColor",
        "brushOpacity",
        "brushShape",
        "brushSize",
        "callable",
        "canvasMode",
        "chartSettings",
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
        "dataPath",
        "defaultVal",
        "description",
        "displayMode",
        "drawThrottleDelay",
        "eraserBrushSize",
        "folder",
        "format",
        "headingAsSectionName",
        "hideColumn",
        "hideParams",
        "hideUnpinnedParams",
        "id",
        "ignoreTypeErrors",
        "imagePath",
        "isFrozen",
        "isHorizontalOrientation",
        "isInOtherProjectConfigs",
        "isJsonSource",
        "isMinimized",
        "isPreset",
        "jsonSourceKeys",
        "jsonSourceMissing",
        "layers",
        "max",
        "min",
        "name",
        "paramFilter",
        "passingStyle",
        "pinnedAreaHeight",
        "pinnedParams",
        "positionAndSizeLocked",
        "renderedValue",
        "selectedParams",
        "size",
        "step",
        "text",
        "textDisplayMode",
        "topLevelParamId",
        "type",
        "url",
        "value",
        "viewMode",
        "visibility",
      ]),
    )
    .optional(),
});

export type CoreArgs = z.infer<typeof CoreArgsSchema>;

export function createCoreArgs(options: Partial<CoreArgs> = {}): CoreArgs {
  return CoreArgsSchema.parse(options);
}

export const ProjectConfigArgsSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  previewImgColor: z.string().optional(),
  viewport: z.union([ViewportSchema, z.null()]).optional(),
  viewingEditingMode: z.enum(ViewingEditingModeEnum).optional(),
  genCodePrefix: z.string().optional(),
  genCodeSuffix: z.string().optional(),
  entryCodeBlockId: z.union([z.string(), z.null()]).optional(),
  topLevelSections: z
    .record(z.string(), TopLevelSectionLayoutSchema)
    .optional(),
  sectionVariantMap: z.record(z.string(), z.string()).optional(),
  activeIds: z.array(z.string()).optional(),
});

export type ProjectConfigArgs = z.infer<typeof ProjectConfigArgsSchema>;

export function createProjectConfigArgs(
  options: Partial<ProjectConfigArgs> = {},
): ProjectConfigArgs {
  return ProjectConfigArgsSchema.parse(options);
}

export const FolderContentItemSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export type FolderContentItem = z.infer<typeof FolderContentItemSchema>;

export function createFolderContentItem(
  options: Partial<FolderContentItem> = {},
): FolderContentItem {
  return FolderContentItemSchema.parse(options);
}

export const BaseArtifactSchema = z.object({
  type: z.any(),
  id: z.string().default(create_json_artifact_id),
  value: z.any(),
});

export type BaseArtifact = z.infer<typeof BaseArtifactSchema>;

export function createBaseArtifact(
  options: Partial<BaseArtifact> = {},
): BaseArtifact {
  return BaseArtifactSchema.parse(options);
}

export const BaseChartSettingsSchema = z.object({
  type: z.any(),
});

export type BaseChartSettings = z.infer<typeof BaseChartSettingsSchema>;

export function createBaseChartSettings(
  options: Partial<BaseChartSettings> = {},
): BaseChartSettings {
  return BaseChartSettingsSchema.parse(options);
}

export const ChatSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: z.string(),
  messages: z.array(
    z.union([
      SystemChatMessageSchema,
      AssistantChatMessageSchema,
      UserChatMessageSchema,
      ToolChatMessageSchema,
    ]),
  ),
});

export type Chat = z.infer<typeof ChatSchema>;

export function createChat(options: Partial<Chat> = {}): Chat {
  return ChatSchema.parse(options);
}

export const ChatMetadataSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: z.string(),
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

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
});

export type ContentChatMessage = z.infer<typeof ContentChatMessageSchema>;

export function createContentChatMessage(
  options: Partial<ContentChatMessage> = {},
): ContentChatMessage {
  return ContentChatMessageSchema.parse(options);
}

export const BaseClipboardDataSchema = z.object({
  type: z.any(),
  data: z.any(),
});

export type BaseClipboardData = z.infer<typeof BaseClipboardDataSchema>;

export function createBaseClipboardData(
  options: Partial<BaseClipboardData> = {},
): BaseClipboardData {
  return BaseClipboardDataSchema.parse(options);
}

export const BaseChildlessCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
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

export function createBaseChildlessCodeObjImpl(
  options: Partial<BaseChildlessCodeObjImpl> = {},
): BaseChildlessCodeObjImpl {
  return BaseChildlessCodeObjImplSchema.parse(options);
}

export const BaseCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
});

export type BaseCodeObjImpl = z.infer<typeof BaseCodeObjImplSchema>;

export function createBaseCodeObjImpl(
  options: Partial<BaseCodeObjImpl> = {},
): BaseCodeObjImpl {
  return BaseCodeObjImplSchema.parse(options);
}

export const BaseParamCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
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

export function createBaseParamCodeObjImpl(
  options: Partial<BaseParamCodeObjImpl> = {},
): BaseParamCodeObjImpl {
  return BaseParamCodeObjImplSchema.parse(options);
}

export const BaseParentCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type BaseParentCodeObjImpl = z.infer<typeof BaseParentCodeObjImplSchema>;

export function createBaseParentCodeObjImpl(
  options: Partial<BaseParentCodeObjImpl> = {},
): BaseParentCodeObjImpl {
  return BaseParentCodeObjImplSchema.parse(options);
}

export const BaseSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
});

export type BaseSectionImpl = z.infer<typeof BaseSectionImplSchema>;

export function createBaseSectionImpl(
  options: Partial<BaseSectionImpl> = {},
): BaseSectionImpl {
  return BaseSectionImplSchema.parse(options);
}

export const BaseCanvasSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  renderedValue: z.union([z.string(), z.null()]).default(null),
});

export type BaseCanvasSectionImpl = z.infer<typeof BaseCanvasSectionImplSchema>;

export function createBaseCanvasSectionImpl(
  options: Partial<BaseCanvasSectionImpl> = {},
): BaseCanvasSectionImpl {
  return BaseCanvasSectionImplSchema.parse(options);
}

export const BaseCodeSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type BaseCodeSectionImpl = z.infer<typeof BaseCodeSectionImplSchema>;

export function createBaseCodeSectionImpl(
  options: Partial<BaseCodeSectionImpl> = {},
): BaseCodeSectionImpl {
  return BaseCodeSectionImplSchema.parse(options);
}

export const BaseDictSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([z.string(), z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type BaseDictSectionImpl = z.infer<typeof BaseDictSectionImplSchema>;

export function createBaseDictSectionImpl(
  options: Partial<BaseDictSectionImpl> = {},
): BaseDictSectionImpl {
  return BaseDictSectionImplSchema.parse(options);
}

export const BaseParentSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type BaseParentSectionImpl = z.infer<typeof BaseParentSectionImplSchema>;

export function createBaseParentSectionImpl(
  options: Partial<BaseParentSectionImpl> = {},
): BaseParentSectionImpl {
  return BaseParentSectionImplSchema.parse(options);
}

export const BaseSectionWithParamsImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isPreset: z.boolean().default(false),
  codeObjVariantMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
});

export type BaseSectionWithParamsImpl = z.infer<
  typeof BaseSectionWithParamsImplSchema
>;

export function createBaseSectionWithParamsImpl(
  options: Partial<BaseSectionWithParamsImpl> = {},
): BaseSectionWithParamsImpl {
  return BaseSectionWithParamsImplSchema.parse(options);
}

export const UserDefaultBaseCanvasSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseCanvasSectionImpl = z.infer<
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

export function createUserDefaultBaseChildlessCodeObjImpl(
  options: Partial<UserDefaultBaseChildlessCodeObjImpl> = {},
): UserDefaultBaseChildlessCodeObjImpl {
  return UserDefaultBaseChildlessCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseCodeObjImplSchema = z.object({});

export type UserDefaultBaseCodeObjImpl = z.infer<
  typeof UserDefaultBaseCodeObjImplSchema
>;

export function createUserDefaultBaseCodeObjImpl(
  options: Partial<UserDefaultBaseCodeObjImpl> = {},
): UserDefaultBaseCodeObjImpl {
  return UserDefaultBaseCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseCodeSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

export type UserDefaultBaseCodeSectionImpl = z.infer<
  typeof UserDefaultBaseCodeSectionImplSchema
>;

export function createUserDefaultBaseCodeSectionImpl(
  options: Partial<UserDefaultBaseCodeSectionImpl> = {},
): UserDefaultBaseCodeSectionImpl {
  return UserDefaultBaseCodeSectionImplSchema.parse(options);
}

export const UserDefaultBaseDictSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
});

export type UserDefaultBaseDictSectionImpl = z.infer<
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

export function createUserDefaultBaseParamCodeObjImpl(
  options: Partial<UserDefaultBaseParamCodeObjImpl> = {},
): UserDefaultBaseParamCodeObjImpl {
  return UserDefaultBaseParamCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseParentCodeObjImplSchema = z.object({});

export type UserDefaultBaseParentCodeObjImpl = z.infer<
  typeof UserDefaultBaseParentCodeObjImplSchema
>;

export function createUserDefaultBaseParentCodeObjImpl(
  options: Partial<UserDefaultBaseParentCodeObjImpl> = {},
): UserDefaultBaseParentCodeObjImpl {
  return UserDefaultBaseParentCodeObjImplSchema.parse(options);
}

export const UserDefaultBaseParentSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseParentSectionImpl = z.infer<
  typeof UserDefaultBaseParentSectionImplSchema
>;

export function createUserDefaultBaseParentSectionImpl(
  options: Partial<UserDefaultBaseParentSectionImpl> = {},
): UserDefaultBaseParentSectionImpl {
  return UserDefaultBaseParentSectionImplSchema.parse(options);
}

export const UserDefaultBaseSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseSectionImpl = z.infer<
  typeof UserDefaultBaseSectionImplSchema
>;

export function createUserDefaultBaseSectionImpl(
  options: Partial<UserDefaultBaseSectionImpl> = {},
): UserDefaultBaseSectionImpl {
  return UserDefaultBaseSectionImplSchema.parse(options);
}

export const UserDefaultBaseSectionWithParamsImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
});

export type UserDefaultBaseSectionWithParamsImpl = z.infer<
  typeof UserDefaultBaseSectionWithParamsImplSchema
>;

export function createUserDefaultBaseSectionWithParamsImpl(
  options: Partial<UserDefaultBaseSectionWithParamsImpl> = {},
): UserDefaultBaseSectionWithParamsImpl {
  return UserDefaultBaseSectionWithParamsImplSchema.parse(options);
}

export const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export type Position = z.infer<typeof PositionSchema>;

export function createPosition(options: Partial<Position> = {}): Position {
  return PositionSchema.parse(options);
}

export const ProjectStateBackendSchema = z.object({
  sections: z.record(z.string(), CoreSchema).default({}),
  sectionImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CallableSectionImplSchema,
        DictSectionImplSchema,
        ListRootSectionImplSchema,
        DictRootSectionImplSchema,
        GroupSectionImplSchema,
        ImageSectionImplSchema,
        ChartSectionImplSchema,
        DrawSectionImplSchema,
        TextBlockSectionImplSchema,
        SocialSectionImplSchema,
        GlobalVariablesSectionImplSchema,
        CodeSectionImplSchema,
        GenPythonCodeSectionImplSchema,
        TerminalSectionImplSchema,
        IFrameSectionImplSchema,
        ChatSectionImplSchema,
        BrowserSectionImplSchema,
      ]),
    )
    .default({}),
  sectionVariants: z.record(z.string(), VariantSchema).default({}),
  codeObjs: z.record(z.string(), CoreSchema).default({}),
  codeObjImpls: z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        CodeCallableCodeObjImplSchema,
        CodeParamCodeObjImplSchema,
        TextParamCodeObjImplSchema,
        SliderParamCodeObjImplSchema,
        SwitchParamCodeObjImplSchema,
        ColorPickerParamCodeObjImplSchema,
        DropdownParamCodeObjImplSchema,
        PasswordParamCodeObjImplSchema,
        NestedParamCodeObjImplSchema,
      ]),
    )
    .default({}),
  codeObjVariants: z.record(z.string(), VariantSchema).default({}),
  projectConfigs: z.record(z.string(), ProjectConfigSchema).default({}),
  defaultProjectConfigId: z.union([z.string(), z.null()]).default(null),
});

export type ProjectStateBackend = z.infer<typeof ProjectStateBackendSchema>;

export function createProjectStateBackend(
  options: Partial<ProjectStateBackend> = {},
): ProjectStateBackend {
  return ProjectStateBackendSchema.parse(options);
}

export const ListenerCoverageRequestSchema = z.object({
  projectConfigId: z.string(),
});

export type ListenerCoverageRequest = z.infer<
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
    Base64DependencyValueSchema,
    FileReadDependencyValueSchema,
  ]),
});

export type ListenerFrontendEmitKeyAndValue = z.infer<
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
    Base64DependencyValueSchema,
    FileReadDependencyValueSchema,
  ]),
});

export type ListenerRealtimeDelta = z.infer<typeof ListenerRealtimeDeltaSchema>;

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

export function createBrowserAreaItem(
  options: Partial<BrowserAreaItem> = {},
): BrowserAreaItem {
  return BrowserAreaItemSchema.parse(options);
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

export function createPythonScriptWebsocketMsg(
  options: Partial<PythonScriptWebsocketMsg> = {},
): PythonScriptWebsocketMsg {
  return PythonScriptWebsocketMsgSchema.parse(options);
}

export const WebsocketConnectionInfoWithSocketSchema = z.object({
  id: z.string(),
  connectionType: z.enum(WebsocketConnectionTypeEnum),
  currentAddress: z.union([z.string(), z.null()]),
  websocket: WebSocket,
});

export type WebsocketConnectionInfoWithSocket = z.infer<
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

export function createWebsocketMsg(
  options: Partial<WebsocketMsg> = {},
): WebsocketMsg {
  return WebsocketMsgSchema.parse(options);
}

export const DeleteLLMChatRequestSchema = z.object({
  chatId: z.string(),
});

export type DeleteLLMChatRequest = z.infer<typeof DeleteLLMChatRequestSchema>;

export function createDeleteLLMChatRequest(
  options: Partial<DeleteLLMChatRequest> = {},
): DeleteLLMChatRequest {
  return DeleteLLMChatRequestSchema.parse(options);
}

export const GetLLMChatRequestSchema = z.object({
  chatId: z.string(),
  projectConfigId: z.union([z.string(), z.null()]),
});

export type GetLLMChatRequest = z.infer<typeof GetLLMChatRequestSchema>;

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

export function createGetLLMChatRequestResponse(
  options: Partial<GetLLMChatRequestResponse> = {},
): GetLLMChatRequestResponse {
  return GetLLMChatRequestResponseSchema.parse(options);
}

export const GetLLMResponseRequestSchema = z.object({
  chatId: z.union([z.string(), z.null()]),
  message: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
  llmConfigId: z.string(),
  deepThink: z.boolean(),
  projectConfigId: z.string(),
});

export type GetLLMResponseRequest = z.infer<typeof GetLLMResponseRequestSchema>;

export function createGetLLMResponseRequest(
  options: Partial<GetLLMResponseRequest> = {},
): GetLLMResponseRequest {
  return GetLLMResponseRequestSchema.parse(options);
}

export const StopLLMChatRequestSchema = z.object({
  chatId: z.string(),
});

export type StopLLMChatRequest = z.infer<typeof StopLLMChatRequestSchema>;

export function createStopLLMChatRequest(
  options: Partial<StopLLMChatRequest> = {},
): StopLLMChatRequest {
  return StopLLMChatRequestSchema.parse(options);
}

export const ArtifactSaveResultSchema = z.object({
  id: z.string(),
  type: z.enum(ArtifactTypeEnum),
  status: z.literal(["saved", "unchanged", "skipped", "conflict"]),
  backupPath: z.union([z.string(), z.null()]).default(null),
  message: z.union([z.string(), z.null()]).default(null),
});

export type ArtifactSaveResult = z.infer<typeof ArtifactSaveResultSchema>;

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

export function createCheckIfFileExistsRequests(
  options: Partial<CheckIfFileExistsRequests> = {},
): CheckIfFileExistsRequests {
  return CheckIfFileExistsRequestsSchema.parse(options);
}

export const GetFolderContentsRequestSchema = z.object({
  folderPath: z.string(),
});

export type GetFolderContentsRequest = z.infer<
  typeof GetFolderContentsRequestSchema
>;

export function createGetFolderContentsRequest(
  options: Partial<GetFolderContentsRequest> = {},
): GetFolderContentsRequest {
  return GetFolderContentsRequestSchema.parse(options);
}

export const LoadCachedPathsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type LoadCachedPathsRequest = z.infer<
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
    ]),
  ),
  conflictStrategy: z
    .union([z.enum(SaveConflictStrategyEnum), z.null()])
    .default(null),
});

export type UpdateArtifactsRequest = z.infer<
  typeof UpdateArtifactsRequestSchema
>;

export function createUpdateArtifactsRequest(
  options: Partial<UpdateArtifactsRequest> = {},
): UpdateArtifactsRequest {
  return UpdateArtifactsRequestSchema.parse(options);
}

export const DocstringToMarkdownRequestSchema = z.object({
  docstring: z.string(),
});

export type DocstringToMarkdownRequest = z.infer<
  typeof DocstringToMarkdownRequestSchema
>;

export function createDocstringToMarkdownRequest(
  options: Partial<DocstringToMarkdownRequest> = {},
): DocstringToMarkdownRequest {
  return DocstringToMarkdownRequestSchema.parse(options);
}

export const UpdateAPIKeysRequestSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
});

export type UpdateAPIKeysRequest = z.infer<typeof UpdateAPIKeysRequestSchema>;

export function createUpdateAPIKeysRequest(
  options: Partial<UpdateAPIKeysRequest> = {},
): UpdateAPIKeysRequest {
  return UpdateAPIKeysRequestSchema.parse(options);
}

export const TypeCheckRequestSchema = z.object({
  projectConfigId: z.string(),
});

export type TypeCheckRequest = z.infer<typeof TypeCheckRequestSchema>;

export function createTypeCheckRequest(
  options: Partial<TypeCheckRequest> = {},
): TypeCheckRequest {
  return TypeCheckRequestSchema.parse(options);
}

export const AcceptRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
});

export type AcceptRenameRefactorRequest = z.infer<
  typeof AcceptRenameRefactorRequestSchema
>;

export function createAcceptRenameRefactorRequest(
  options: Partial<AcceptRenameRefactorRequest> = {},
): AcceptRenameRefactorRequest {
  return AcceptRenameRefactorRequestSchema.parse(options);
}

export const AddKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type AddKwargRequest = z.infer<typeof AddKwargRequestSchema>;

export function createAddKwargRequest(
  options: Partial<AddKwargRequest> = {},
): AddKwargRequest {
  return AddKwargRequestSchema.parse(options);
}

export const AppendDrawAreaLayerItemRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  layerIdx: z.int(),
  element: DrawAreaLayerItemSchema,
});

export type AppendDrawAreaLayerItemRequest = z.infer<
  typeof AppendDrawAreaLayerItemRequestSchema
>;

export function createAppendDrawAreaLayerItemRequest(
  options: Partial<AppendDrawAreaLayerItemRequest> = {},
): AppendDrawAreaLayerItemRequest {
  return AppendDrawAreaLayerItemRequestSchema.parse(options);
}

export const ChangeParamImplRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.string(),
  selectedId: z.string(),
});

export type ChangeParamImplRequest = z.infer<
  typeof ChangeParamImplRequestSchema
>;

export function createChangeParamImplRequest(
  options: Partial<ChangeParamImplRequest> = {},
): ChangeParamImplRequest {
  return ChangeParamImplRequestSchema.parse(options);
}

export const ClearTextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.union([z.string(), z.null()]),
});

export type ClearTextFieldCompletionRequest = z.infer<
  typeof ClearTextFieldCompletionRequestSchema
>;

export function createClearTextFieldCompletionRequest(
  options: Partial<ClearTextFieldCompletionRequest> = {},
): ClearTextFieldCompletionRequest {
  return ClearTextFieldCompletionRequestSchema.parse(options);
}

export const CodeAreaCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  fullText: z.string(),
  position: z.int(),
});

export type CodeAreaCompletionRequest = z.infer<
  typeof CodeAreaCompletionRequestSchema
>;

export function createCodeAreaCompletionRequest(
  options: Partial<CodeAreaCompletionRequest> = {},
): CodeAreaCompletionRequest {
  return CodeAreaCompletionRequestSchema.parse(options);
}

export const CreateChildSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  parentId: z.string(),
  implType: z.enum(SectionTypeEnum),
  numChildren: z.int(),
  startIdx: z.union([z.int(), z.null()]),
});

export type CreateChildSectionsRequest = z.infer<
  typeof CreateChildSectionsRequestSchema
>;

export function createCreateChildSectionsRequest(
  options: Partial<CreateChildSectionsRequest> = {},
): CreateChildSectionsRequest {
  return CreateChildSectionsRequestSchema.parse(options);
}

export const CreateChildSectionsViaIncrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  calledBy: z.string(),
  numChildren: z.int(),
  implType: z.enum(SectionTypeEnum),
});

export type CreateChildSectionsViaIncrementerRequest = z.infer<
  typeof CreateChildSectionsViaIncrementerRequestSchema
>;

export function createCreateChildSectionsViaIncrementerRequest(
  options: Partial<CreateChildSectionsViaIncrementerRequest> = {},
): CreateChildSectionsViaIncrementerRequest {
  return CreateChildSectionsViaIncrementerRequestSchema.parse(options);
}

export const CreateNewSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type CreateNewSectionVariantRequest = z.infer<
  typeof CreateNewSectionVariantRequestSchema
>;

export function createCreateNewSectionVariantRequest(
  options: Partial<CreateNewSectionVariantRequest> = {},
): CreateNewSectionVariantRequest {
  return CreateNewSectionVariantRequestSchema.parse(options);
}

export const CreateTopLevelSectionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  implType: z.enum(SectionTypeEnum),
  implOverrides: z.union([
    CallableSectionImplArgsSchema,
    DictSectionImplArgsSchema,
    ListRootSectionImplArgsSchema,
    DictRootSectionImplArgsSchema,
    GroupSectionImplArgsSchema,
    ImageSectionImplArgsSchema,
    ChartSectionImplArgsSchema,
    DrawSectionImplArgsSchema,
    TextBlockSectionImplArgsSchema,
    SocialSectionImplArgsSchema,
    GlobalVariablesSectionImplArgsSchema,
    CodeSectionImplArgsSchema,
    GenPythonCodeSectionImplArgsSchema,
    TerminalSectionImplArgsSchema,
    IFrameSectionImplArgsSchema,
    ChatSectionImplArgsSchema,
    BrowserSectionImplArgsSchema,
  ]),
  position: PositionSchema,
});

export type CreateTopLevelSectionRequest = z.infer<
  typeof CreateTopLevelSectionRequestSchema
>;

export function createCreateTopLevelSectionRequest(
  options: Partial<CreateTopLevelSectionRequest> = {},
): CreateTopLevelSectionRequest {
  return CreateTopLevelSectionRequestSchema.parse(options);
}

export const DeclineRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
});

export type DeclineRenameRefactorRequest = z.infer<
  typeof DeclineRenameRefactorRequestSchema
>;

export function createDeclineRenameRefactorRequest(
  options: Partial<DeclineRenameRefactorRequest> = {},
): DeclineRenameRefactorRequest {
  return DeclineRenameRefactorRequestSchema.parse(options);
}

export const DeleteChildSectionsViaDecrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  calledBy: z.string(),
  numChildren: z.int(),
});

export type DeleteChildSectionsViaDecrementerRequest = z.infer<
  typeof DeleteChildSectionsViaDecrementerRequestSchema
>;

export function createDeleteChildSectionsViaDecrementerRequest(
  options: Partial<DeleteChildSectionsViaDecrementerRequest> = {},
): DeleteChildSectionsViaDecrementerRequest {
  return DeleteChildSectionsViaDecrementerRequestSchema.parse(options);
}

export const DeleteJSONSourceFileAndVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  variantId: z.string(),
  filepath: z.string(),
});

export type DeleteJSONSourceFileAndVariantRequest = z.infer<
  typeof DeleteJSONSourceFileAndVariantRequestSchema
>;

export function createDeleteJSONSourceFileAndVariantRequest(
  options: Partial<DeleteJSONSourceFileAndVariantRequest> = {},
): DeleteJSONSourceFileAndVariantRequest {
  return DeleteJSONSourceFileAndVariantRequestSchema.parse(options);
}

export const DeleteKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type DeleteKwargRequest = z.infer<typeof DeleteKwargRequestSchema>;

export function createDeleteKwargRequest(
  options: Partial<DeleteKwargRequest> = {},
): DeleteKwargRequest {
  return DeleteKwargRequestSchema.parse(options);
}

export const DeleteSectionVariantOrAskRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  variantId: z.string(),
});

export type DeleteSectionVariantOrAskRequest = z.infer<
  typeof DeleteSectionVariantOrAskRequestSchema
>;

export function createDeleteSectionVariantOrAskRequest(
  options: Partial<DeleteSectionVariantOrAskRequest> = {},
): DeleteSectionVariantOrAskRequest {
  return DeleteSectionVariantOrAskRequestSchema.parse(options);
}

export const DeleteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionIds: z.array(z.string()),
});

export type DeleteSectionsRequest = z.infer<typeof DeleteSectionsRequestSchema>;

export function createDeleteSectionsRequest(
  options: Partial<DeleteSectionsRequest> = {},
): DeleteSectionsRequest {
  return DeleteSectionsRequestSchema.parse(options);
}

export const ForceRefreshProjectRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
});

export type ForceRefreshProjectRequest = z.infer<
  typeof ForceRefreshProjectRequestSchema
>;

export function createForceRefreshProjectRequest(
  options: Partial<ForceRefreshProjectRequest> = {},
): ForceRefreshProjectRequest {
  return ForceRefreshProjectRequestSchema.parse(options);
}

export const GenCodePrefixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  fullText: z.string(),
  position: z.int(),
});

export type GenCodePrefixCompletionRequest = z.infer<
  typeof GenCodePrefixCompletionRequestSchema
>;

export function createGenCodePrefixCompletionRequest(
  options: Partial<GenCodePrefixCompletionRequest> = {},
): GenCodePrefixCompletionRequest {
  return GenCodePrefixCompletionRequestSchema.parse(options);
}

export const GenCodeSuffixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  fullText: z.string(),
  position: z.int(),
});

export type GenCodeSuffixCompletionRequest = z.infer<
  typeof GenCodeSuffixCompletionRequestSchema
>;

export function createGenCodeSuffixCompletionRequest(
  options: Partial<GenCodeSuffixCompletionRequest> = {},
): GenCodeSuffixCompletionRequest {
  return GenCodeSuffixCompletionRequestSchema.parse(options);
}

export const GetLatestProjectStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
});

export type GetLatestProjectStateRequest = z.infer<
  typeof GetLatestProjectStateRequestSchema
>;

export function createGetLatestProjectStateRequest(
  options: Partial<GetLatestProjectStateRequest> = {},
): GetLatestProjectStateRequest {
  return GetLatestProjectStateRequestSchema.parse(options);
}

export const GroupSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionIds: z.array(z.string()),
});

export type GroupSectionsRequest = z.infer<typeof GroupSectionsRequestSchema>;

export function createGroupSectionsRequest(
  options: Partial<GroupSectionsRequest> = {},
): GroupSectionsRequest {
  return GroupSectionsRequestSchema.parse(options);
}

export const PasteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  data: ProjectStateCoreWithSectionVariantMapSchema,
  position: PositionSchema,
  asRef: z.boolean(),
});

export type PasteSectionsRequest = z.infer<typeof PasteSectionsRequestSchema>;

export function createPasteSectionsRequest(
  options: Partial<PasteSectionsRequest> = {},
): PasteSectionsRequest {
  return PasteSectionsRequestSchema.parse(options);
}

export const PrepareSectionsForCopyRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionIds: z.array(z.string()),
});

export type PrepareSectionsForCopyRequest = z.infer<
  typeof PrepareSectionsForCopyRequestSchema
>;

export function createPrepareSectionsForCopyRequest(
  options: Partial<PrepareSectionsForCopyRequest> = {},
): PrepareSectionsForCopyRequest {
  return PrepareSectionsForCopyRequestSchema.parse(options);
}

export const RedoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  steps: z.int(),
});

export type RedoRequest = z.infer<typeof RedoRequestSchema>;

export function createRedoRequest(
  options: Partial<RedoRequest> = {},
): RedoRequest {
  return RedoRequestSchema.parse(options);
}

export const SetActiveIdsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  activeIds: z.array(z.string()),
});

export type SetActiveIdsRequest = z.infer<typeof SetActiveIdsRequestSchema>;

export function createSetActiveIdsRequest(
  options: Partial<SetActiveIdsRequest> = {},
): SetActiveIdsRequest {
  return SetActiveIdsRequestSchema.parse(options);
}

export const SetBrowserAreaViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  viewMode: z.enum(BrowserAreaViewModeEnum),
});

export type SetBrowserAreaViewModeRequest = z.infer<
  typeof SetBrowserAreaViewModeRequestSchema
>;

export function createSetBrowserAreaViewModeRequest(
  options: Partial<SetBrowserAreaViewModeRequest> = {},
): SetBrowserAreaViewModeRequest {
  return SetBrowserAreaViewModeRequestSchema.parse(options);
}

export const SetBrowserHideColumnRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  hideColumn: z.boolean(),
});

export type SetBrowserHideColumnRequest = z.infer<
  typeof SetBrowserHideColumnRequestSchema
>;

export function createSetBrowserHideColumnRequest(
  options: Partial<SetBrowserHideColumnRequest> = {},
): SetBrowserHideColumnRequest {
  return SetBrowserHideColumnRequestSchema.parse(options);
}

export const SetCallableHideParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  hideParams: z.boolean(),
});

export type SetCallableHideParamsRequest = z.infer<
  typeof SetCallableHideParamsRequestSchema
>;

export function createSetCallableHideParamsRequest(
  options: Partial<SetCallableHideParamsRequest> = {},
): SetCallableHideParamsRequest {
  return SetCallableHideParamsRequestSchema.parse(options);
}

export const SetCallableRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  callableName: z.string(),
  refetchParams: z.boolean(),
});

export type SetCallableRequest = z.infer<typeof SetCallableRequestSchema>;

export function createSetCallableRequest(
  options: Partial<SetCallableRequest> = {},
): SetCallableRequest {
  return SetCallableRequestSchema.parse(options);
}

export const SetChartAreaDataPathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  dataPath: z.string(),
});

export type SetChartAreaDataPathRequest = z.infer<
  typeof SetChartAreaDataPathRequestSchema
>;

export function createSetChartAreaDataPathRequest(
  options: Partial<SetChartAreaDataPathRequest> = {},
): SetChartAreaDataPathRequest {
  return SetChartAreaDataPathRequestSchema.parse(options);
}

export const SetChartSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  chartSettings: z.union([LineChartSettingsSchema, ScatterChartSettingsSchema]),
  changedSettings: z.array(z.string()),
});

export type SetChartSettingsRequest = z.infer<
  typeof SetChartSettingsRequestSchema
>;

export function createSetChartSettingsRequest(
  options: Partial<SetChartSettingsRequest> = {},
): SetChartSettingsRequest {
  return SetChartSettingsRequestSchema.parse(options);
}

export const SetChartTypeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  chartType: z.enum(ChartTypeEnum),
});

export type SetChartTypeRequest = z.infer<typeof SetChartTypeRequestSchema>;

export function createSetChartTypeRequest(
  options: Partial<SetChartTypeRequest> = {},
): SetChartTypeRequest {
  return SetChartTypeRequestSchema.parse(options);
}

export const CodeFileBindingUpdateSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
});

export type CodeFileBindingUpdate = z.infer<typeof CodeFileBindingUpdateSchema>;

export function createCodeFileBindingUpdate(
  options: Partial<CodeFileBindingUpdate> = {},
): CodeFileBindingUpdate {
  return CodeFileBindingUpdateSchema.parse(options);
}

export const SetCodeFileBindingRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  binding: CodeFileBindingUpdateSchema,
});

export type SetCodeFileBindingRequest = z.infer<
  typeof SetCodeFileBindingRequestSchema
>;

export function createSetCodeFileBindingRequest(
  options: Partial<SetCodeFileBindingRequest> = {},
): SetCodeFileBindingRequest {
  return SetCodeFileBindingRequestSchema.parse(options);
}

export const SetCodeObjNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  codeObjId: z.string(),
  name: z.string(),
});

export type SetCodeObjNameRequest = z.infer<typeof SetCodeObjNameRequestSchema>;

export function createSetCodeObjNameRequest(
  options: Partial<SetCodeObjNameRequest> = {},
): SetCodeObjNameRequest {
  return SetCodeObjNameRequestSchema.parse(options);
}

export const SetCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  code: z.string(),
});

export type SetCodeRequest = z.infer<typeof SetCodeRequestSchema>;

export function createSetCodeRequest(
  options: Partial<SetCodeRequest> = {},
): SetCodeRequest {
  return SetCodeRequestSchema.parse(options);
}

export const SetDefaultSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  variantId: z.string(),
});

export type SetDefaultSectionVariantRequest = z.infer<
  typeof SetDefaultSectionVariantRequestSchema
>;

export function createSetDefaultSectionVariantRequest(
  options: Partial<SetDefaultSectionVariantRequest> = {},
): SetDefaultSectionVariantRequest {
  return SetDefaultSectionVariantRequestSchema.parse(options);
}

export const SetGenCodePrefixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  genCodePrefix: z.string(),
});

export type SetGenCodePrefixRequest = z.infer<
  typeof SetGenCodePrefixRequestSchema
>;

export function createSetGenCodePrefixRequest(
  options: Partial<SetGenCodePrefixRequest> = {},
): SetGenCodePrefixRequest {
  return SetGenCodePrefixRequestSchema.parse(options);
}

export const SetGenCodeSuffixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  genCodeSuffix: z.string(),
});

export type SetGenCodeSuffixRequest = z.infer<
  typeof SetGenCodeSuffixRequestSchema
>;

export function createSetGenCodeSuffixRequest(
  options: Partial<SetGenCodeSuffixRequest> = {},
): SetGenCodeSuffixRequest {
  return SetGenCodeSuffixRequestSchema.parse(options);
}

export const SetImageAreaImagePathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  imagePath: z.string(),
});

export type SetImageAreaImagePathRequest = z.infer<
  typeof SetImageAreaImagePathRequestSchema
>;

export function createSetImageAreaImagePathRequest(
  options: Partial<SetImageAreaImagePathRequest> = {},
): SetImageAreaImagePathRequest {
  return SetImageAreaImagePathRequestSchema.parse(options);
}

export const SetParamEnteredValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.string(),
  value: z.string(),
});

export type SetParamEnteredValueRequest = z.infer<
  typeof SetParamEnteredValueRequestSchema
>;

export function createSetParamEnteredValueRequest(
  options: Partial<SetParamEnteredValueRequest> = {},
): SetParamEnteredValueRequest {
  return SetParamEnteredValueRequestSchema.parse(options);
}

export const SetSectionHideUnpinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  hideUnpinnedParams: z.boolean(),
});

export type SetSectionHideUnpinnedParamsRequest = z.infer<
  typeof SetSectionHideUnpinnedParamsRequestSchema
>;

export function createSetSectionHideUnpinnedParamsRequest(
  options: Partial<SetSectionHideUnpinnedParamsRequest> = {},
): SetSectionHideUnpinnedParamsRequest {
  return SetSectionHideUnpinnedParamsRequestSchema.parse(options);
}

export const SetSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  name: z.string(),
});

export type SetSectionNameRequest = z.infer<typeof SetSectionNameRequestSchema>;

export function createSetSectionNameRequest(
  options: Partial<SetSectionNameRequest> = {},
): SetSectionNameRequest {
  return SetSectionNameRequestSchema.parse(options);
}

export const SetSectionParamFilterRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  value: z.string(),
});

export type SetSectionParamFilterRequest = z.infer<
  typeof SetSectionParamFilterRequestSchema
>;

export function createSetSectionParamFilterRequest(
  options: Partial<SetSectionParamFilterRequest> = {},
): SetSectionParamFilterRequest {
  return SetSectionParamFilterRequestSchema.parse(options);
}

export const SetSectionSizesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionSizes: z.record(z.string(), SectionSizeSchema),
});

export type SetSectionSizesRequest = z.infer<
  typeof SetSectionSizesRequestSchema
>;

export function createSetSectionSizesRequest(
  options: Partial<SetSectionSizesRequest> = {},
): SetSectionSizesRequest {
  return SetSectionSizesRequestSchema.parse(options);
}

export const SetSectionVariantNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  variantId: z.string(),
  name: z.string(),
});

export type SetSectionVariantNameRequest = z.infer<
  typeof SetSectionVariantNameRequestSchema
>;

export function createSetSectionVariantNameRequest(
  options: Partial<SetSectionVariantNameRequest> = {},
): SetSectionVariantNameRequest {
  return SetSectionVariantNameRequestSchema.parse(options);
}

export const SetSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  variantId: z.string(),
});

export type SetSectionVariantRequest = z.infer<
  typeof SetSectionVariantRequestSchema
>;

export function createSetSectionVariantRequest(
  options: Partial<SetSectionVariantRequest> = {},
): SetSectionVariantRequest {
  return SetSectionVariantRequestSchema.parse(options);
}

export const SetSectionWithParamsDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum),
});

export type SetSectionWithParamsDisplayModeRequest = z.infer<
  typeof SetSectionWithParamsDisplayModeRequestSchema
>;

export function createSetSectionWithParamsDisplayModeRequest(
  options: Partial<SetSectionWithParamsDisplayModeRequest> = {},
): SetSectionWithParamsDisplayModeRequest {
  return SetSectionWithParamsDisplayModeRequestSchema.parse(options);
}

export const SetSocialUrlRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  url: z.string(),
});

export type SetSocialUrlRequest = z.infer<typeof SetSocialUrlRequestSchema>;

export function createSetSocialUrlRequest(
  options: Partial<SetSocialUrlRequest> = {},
): SetSocialUrlRequest {
  return SetSocialUrlRequestSchema.parse(options);
}

export const SetTextBlockDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum),
});

export type SetTextBlockDisplayModeRequest = z.infer<
  typeof SetTextBlockDisplayModeRequestSchema
>;

export function createSetTextBlockDisplayModeRequest(
  options: Partial<SetTextBlockDisplayModeRequest> = {},
): SetTextBlockDisplayModeRequest {
  return SetTextBlockDisplayModeRequestSchema.parse(options);
}

export const SetTextBlockFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  format: z.enum(TextBlockFormatEnum),
});

export type SetTextBlockFormatRequest = z.infer<
  typeof SetTextBlockFormatRequestSchema
>;

export function createSetTextBlockFormatRequest(
  options: Partial<SetTextBlockFormatRequest> = {},
): SetTextBlockFormatRequest {
  return SetTextBlockFormatRequestSchema.parse(options);
}

export const SetTextBlockTextRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  text: z.string(),
});

export type SetTextBlockTextRequest = z.infer<
  typeof SetTextBlockTextRequestSchema
>;

export function createSetTextBlockTextRequest(
  options: Partial<SetTextBlockTextRequest> = {},
): SetTextBlockTextRequest {
  return SetTextBlockTextRequestSchema.parse(options);
}

export const SetTopLevelSectionLayoutRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  topLevelSections: z.record(z.string(), TopLevelSectionLayoutSchema),
});

export type SetTopLevelSectionLayoutRequest = z.infer<
  typeof SetTopLevelSectionLayoutRequestSchema
>;

export function createSetTopLevelSectionLayoutRequest(
  options: Partial<SetTopLevelSectionLayoutRequest> = {},
): SetTopLevelSectionLayoutRequest {
  return SetTopLevelSectionLayoutRequestSchema.parse(options);
}

export const SetViewportRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  viewport: z.union([ViewportSchema, z.null()]),
});

export type SetViewportRequest = z.infer<typeof SetViewportRequestSchema>;

export function createSetViewportRequest(
  options: Partial<SetViewportRequest> = {},
): SetViewportRequest {
  return SetViewportRequestSchema.parse(options);
}

export const TextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.union([z.string(), z.null()]),
  fullText: z.string(),
  position: z.int(),
});

export type TextFieldCompletionRequest = z.infer<
  typeof TextFieldCompletionRequestSchema
>;

export function createTextFieldCompletionRequest(
  options: Partial<TextFieldCompletionRequest> = {},
): TextFieldCompletionRequest {
  return TextFieldCompletionRequestSchema.parse(options);
}

export const ToggleMinimizedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type ToggleMinimizedRequest = z.infer<
  typeof ToggleMinimizedRequestSchema
>;

export function createToggleMinimizedRequest(
  options: Partial<ToggleMinimizedRequest> = {},
): ToggleMinimizedRequest {
  return ToggleMinimizedRequestSchema.parse(options);
}

export const ToggleParamSelectedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.string(),
});

export type ToggleParamSelectedRequest = z.infer<
  typeof ToggleParamSelectedRequestSchema
>;

export function createToggleParamSelectedRequest(
  options: Partial<ToggleParamSelectedRequest> = {},
): ToggleParamSelectedRequest {
  return ToggleParamSelectedRequestSchema.parse(options);
}

export const TogglePositionLockRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type TogglePositionLockRequest = z.infer<
  typeof TogglePositionLockRequestSchema
>;

export function createTogglePositionLockRequest(
  options: Partial<TogglePositionLockRequest> = {},
): TogglePositionLockRequest {
  return TogglePositionLockRequestSchema.parse(options);
}

export const ToggleVariantFrozenRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  variantId: z.string(),
});

export type ToggleVariantFrozenRequest = z.infer<
  typeof ToggleVariantFrozenRequestSchema
>;

export function createToggleVariantFrozenRequest(
  options: Partial<ToggleVariantFrozenRequest> = {},
): ToggleVariantFrozenRequest {
  return ToggleVariantFrozenRequestSchema.parse(options);
}

export const ToggleVariantJSONSourceRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  variantId: z.string(),
});

export type ToggleVariantJSONSourceRequest = z.infer<
  typeof ToggleVariantJSONSourceRequestSchema
>;

export function createToggleVariantJSONSourceRequest(
  options: Partial<ToggleVariantJSONSourceRequest> = {},
): ToggleVariantJSONSourceRequest {
  return ToggleVariantJSONSourceRequestSchema.parse(options);
}

export const UndoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  steps: z.int(),
});

export type UndoRequest = z.infer<typeof UndoRequestSchema>;

export function createUndoRequest(
  options: Partial<UndoRequest> = {},
): UndoRequest {
  return UndoRequestSchema.parse(options);
}

export const UngroupGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  groupIds: z.array(z.string()),
});

export type UngroupGroupsRequest = z.infer<typeof UngroupGroupsRequestSchema>;

export function createUngroupGroupsRequest(
  options: Partial<UngroupGroupsRequest> = {},
): UngroupGroupsRequest {
  return UngroupGroupsRequestSchema.parse(options);
}

export const UnselectAllParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
});

export type UnselectAllParamsRequest = z.infer<
  typeof UnselectAllParamsRequestSchema
>;

export function createUnselectAllParamsRequest(
  options: Partial<UnselectAllParamsRequest> = {},
): UnselectAllParamsRequest {
  return UnselectAllParamsRequestSchema.parse(options);
}

export const UpdateParamImplConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  sectionId: z.string(),
  paramInfoId: z.string(),
  newConfig: z.record(z.string(), z.any()),
});

export type UpdateParamImplConfigRequest = z.infer<
  typeof UpdateParamImplConfigRequestSchema
>;

export function createUpdateParamImplConfigRequest(
  options: Partial<UpdateParamImplConfigRequest> = {},
): UpdateParamImplConfigRequest {
  return UpdateParamImplConfigRequestSchema.parse(options);
}

export const AddDefaultDataForJSONImportRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
});

export type AddDefaultDataForJSONImportRequest = z.infer<
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

export function createCreateProjectConfigRequest(
  options: Partial<CreateProjectConfigRequest> = {},
): CreateProjectConfigRequest {
  return CreateProjectConfigRequestSchema.parse(options);
}

export const DeleteNotificationRequestSchema = z.object({
  notificationId: z.string(),
});

export type DeleteNotificationRequest = z.infer<
  typeof DeleteNotificationRequestSchema
>;

export function createDeleteNotificationRequest(
  options: Partial<DeleteNotificationRequest> = {},
): DeleteNotificationRequest {
  return DeleteNotificationRequestSchema.parse(options);
}

export const DeleteProjectConfigsRequestSchema = z.object({
  ids: z.array(z.string()),
});

export type DeleteProjectConfigsRequest = z.infer<
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

export function createFilterDataForJSONExportRequest(
  options: Partial<FilterDataForJSONExportRequest> = {},
): FilterDataForJSONExportRequest {
  return FilterDataForJSONExportRequestSchema.parse(options);
}

export const GetNotificationsRequestSchema = z.object({
  projectConfigId: z.string(),
});

export type GetNotificationsRequest = z.infer<
  typeof GetNotificationsRequestSchema
>;

export function createGetNotificationsRequest(
  options: Partial<GetNotificationsRequest> = {},
): GetNotificationsRequest {
  return GetNotificationsRequestSchema.parse(options);
}

export const ManualSaveRequestSchema = z.object({
  projectConfigId: z.string(),
});

export type ManualSaveRequest = z.infer<typeof ManualSaveRequestSchema>;

export function createManualSaveRequest(
  options: Partial<ManualSaveRequest> = {},
): ManualSaveRequest {
  return ManualSaveRequestSchema.parse(options);
}

export const ProjectLoadRequestSchema = z.object({
  projectConfigName: z.string(),
});

export type ProjectLoadRequest = z.infer<typeof ProjectLoadRequestSchema>;

export function createProjectLoadRequest(
  options: Partial<ProjectLoadRequest> = {},
): ProjectLoadRequest {
  return ProjectLoadRequestSchema.parse(options);
}

export const SaveAsNewProjectConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: z.string(),
  newConfigName: z.string(),
  withRefs: z.boolean(),
});

export type SaveAsNewProjectConfigRequest = z.infer<
  typeof SaveAsNewProjectConfigRequestSchema
>;

export function createSaveAsNewProjectConfigRequest(
  options: Partial<SaveAsNewProjectConfigRequest> = {},
): SaveAsNewProjectConfigRequest {
  return SaveAsNewProjectConfigRequestSchema.parse(options);
}

export const SetAsDefaultProjectRequestSchema = z.object({
  projectId: z.string(),
});

export type SetAsDefaultProjectRequest = z.infer<
  typeof SetAsDefaultProjectRequestSchema
>;

export function createSetAsDefaultProjectRequest(
  options: Partial<SetAsDefaultProjectRequest> = {},
): SetAsDefaultProjectRequest {
  return SetAsDefaultProjectRequestSchema.parse(options);
}

export const SetProjectConfigNameRequestSchema = z.object({
  projectConfigId: z.string(),
  newName: z.string(),
});

export type SetProjectConfigNameRequest = z.infer<
  typeof SetProjectConfigNameRequestSchema
>;

export function createSetProjectConfigNameRequest(
  options: Partial<SetProjectConfigNameRequest> = {},
): SetProjectConfigNameRequest {
  return SetProjectConfigNameRequestSchema.parse(options);
}

export const CreateFileRequestSchema = z.object({
  filepath: z.string(),
});

export type CreateFileRequest = z.infer<typeof CreateFileRequestSchema>;

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

export function createNewJSONVersionNameRequest(
  options: Partial<NewJSONVersionNameRequest> = {},
): NewJSONVersionNameRequest {
  return NewJSONVersionNameRequestSchema.parse(options);
}

export const SaveSettingsRequestSchema = z.object({
  settings: SettingsStateSchema,
});

export type SaveSettingsRequest = z.infer<typeof SaveSettingsRequestSchema>;

export function createSaveSettingsRequest(
  options: Partial<SaveSettingsRequest> = {},
): SaveSettingsRequest {
  return SaveSettingsRequestSchema.parse(options);
}

export const DeleteTerminalsRequestSchema = z.object({
  sectionIds: z.array(z.string()),
});

export type DeleteTerminalsRequest = z.infer<
  typeof DeleteTerminalsRequestSchema
>;

export function createDeleteTerminalsRequest(
  options: Partial<DeleteTerminalsRequest> = {},
): DeleteTerminalsRequest {
  return DeleteTerminalsRequestSchema.parse(options);
}

export const KillSubprocessesRequestSchema = z.object({
  projectConfigId: z.string(),
});

export type KillSubprocessesRequest = z.infer<
  typeof KillSubprocessesRequestSchema
>;

export function createKillSubprocessesRequest(
  options: Partial<KillSubprocessesRequest> = {},
): KillSubprocessesRequest {
  return KillSubprocessesRequestSchema.parse(options);
}

export const RunCodeRequestSchema = z.object({
  projectConfigId: z.string(),
  sectionId: z.union([z.string(), z.null()]),
  cliId: z.union([z.string(), z.null()]).default(null),
});

export type RunCodeRequest = z.infer<typeof RunCodeRequestSchema>;

export function createRunCodeRequest(
  options: Partial<RunCodeRequest> = {},
): RunCodeRequest {
  return RunCodeRequestSchema.parse(options);
}

export const BaseDependencyKeySchema = z.object({
  type: z.enum(DependencyKeyTypeEnum),
});

export type BaseDependencyKey = z.infer<typeof BaseDependencyKeySchema>;

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

export function createBaseDependencyValue(
  options: Partial<BaseDependencyValue> = {},
): BaseDependencyValue {
  return BaseDependencyValueSchema.parse(options);
}

export const SettaLSPPositionSchema = z.object({
  start: z.int(),
  end: z.int(),
});

export type SettaLSPPosition = z.infer<typeof SettaLSPPositionSchema>;

export function createSettaLSPPosition(
  options: Partial<SettaLSPPosition> = {},
): SettaLSPPosition {
  return SettaLSPPositionSchema.parse(options);
}

export const CodeMirrorCompletionSchema = z.object({
  label: z.string(),
  type: z.string(),
});

export type CodeMirrorCompletion = z.infer<typeof CodeMirrorCompletionSchema>;

export function createCodeMirrorCompletion(
  options: Partial<CodeMirrorCompletion> = {},
): CodeMirrorCompletion {
  return CodeMirrorCompletionSchema.parse(options);
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

  BaseCodeSection: {
    impl: BaseCodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseCodeSectionImplArgs,
      BaseCodeSectionImpl
    >;
  };

  BaseParentSection: {
    impl: BaseParentSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      BaseParentSectionImplArgs,
      BaseParentSectionImpl
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

  DictRootSection: {
    impl: DictRootSectionImpl;
    args: ImplArgsBundleWithUpdaters<
      DictRootSectionImplArgs,
      DictRootSectionImpl
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

  SliderParamCodeObj: {
    impl: SliderParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      SliderParamCodeObjImplArgs,
      SliderParamCodeObjImpl
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

  NestedParamCodeObj: {
    impl: NestedParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<
      NestedParamCodeObjImplArgs,
      NestedParamCodeObjImpl
    >;
  };
};
