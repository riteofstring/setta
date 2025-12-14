import {
  createCsvArtifactId as create_csv_artifact_id,
  createJsonArtifactId as create_json_artifact_id,
  createNewId as create_new_id,
  createPngArtifactId as create_png_artifact_id,
  createRandomName as generate_memorable_string,
} from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import { z } from "zod";

const IDSchema = z.string();

export type ObjectValues<T> = T[keyof T];

const BaseChildlessCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

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

const BaseParentCodeObjImplTypeSet = new Set(["CodeCallable", "NestedParam"]);

const BaseParentSectionImplTypeSet = new Set(["DictRoot", "Group", "ListRoot"]);

const BaseSectionWithParamsImplTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
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

export const StreamingEventTypeEnum = {
  MESSAGE_START: "message_start",
  DELTA: "delta",
  TOOL_CALL_DELTA: "tool_call_delta",
  TOOL_RESULT: "tool_result",
  MESSAGE_STOP: "message_stop",
  MESSAGE_FINALIZED: "message_finalized",
} as const;

export const ClipboardDataTypeEnum = { Sections: "Sections" } as const;

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

const ParamNameTypeEnum = { CODE: "CODE", TEXT: "TEXT" } as const;

const ParameterPassingStyleEnum = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;

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

export const DependencyValueTypeEnum = {
  Literal: "Literal",
  Base64: "Base64",
  FileRead: "FileRead",
} as const;

export const BrowserAreaViewModeEnum = {
  list: "list",
  thumbnail: "thumbnail",
  carousel: "carousel",
} as const;

export type BrowserAreaViewMode = ObjectValues<typeof BrowserAreaViewModeEnum>;

export const CodeLanguageEnum = { python: "python", bash: "bash" } as const;

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

const SectionSizeModeEnum = { auto: "auto" } as const;

export const SectionWithParamsDisplayModeEnum = {
  Gui: "Gui",
  Yaml: "Yaml",
} as const;

export const TextBlockDisplayModeEnum = {
  Render: "Render",
  Edit: "Edit",
} as const;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;

export const ViewingEditingModeEnum = {
  DEV: "DEV",
  USER: "USER",
  USER_EDIT: "USER_EDIT",
} as const;

export type ViewingEditingMode = ObjectValues<typeof ViewingEditingModeEnum>;

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
  GET_BACKEND_INIT_STATUS: "/backendInitStatus",
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

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
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

export const SelectionModeEnum = { partial: "partial", full: "full" } as const;

export const WebsocketConnectionTypeEnum = {
  CLI: "CLI",
  SERVER: "SERVER",
  PYTHON_SCRIPT: "PYTHON_SCRIPT",
  FRONTEND: "FRONTEND",
} as const;

export const WebsocketMsgTypeForBackendEnum = {
  CurrentAddressUpdate: "CurrentAddressUpdate",
  RealtimeUIChange: "RealtimeUIChange",
} as const;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  LSPDiagnostics: "LSPDiagnostics",
  TerminalMetadata: "TerminalMetadata",
  Notification: "Notification",
  LLMStreamingResponse: "LLMStreamingResponse",
  ReturnRenameRefactorResults: "ReturnRenameRefactorResults",
  UpdateFrontendProjectState: "UpdateFrontendProjectState",
  UpdateSettings: "UpdateSettings",
  AllProjectMetadata: "AllProjectMetadata",
  UpdateArtifacts: "UpdateArtifacts",
  ListenerCoverageSnapshot: "ListenerCoverageSnapshot",
  LLMConfigUpdated: "LLMConfigUpdated",
  LLMApiKeysUpdated: "LLMApiKeysUpdated",
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
  eraserStrokes: z.array(BrushStrokeWithTransformSchema).default([]),
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

const ImageArtifactSchema = z.object({
  type: z.literal("Image").default(ArtifactTypeEnum.Image),
  id: z.string().default(create_png_artifact_id),
  value: z.string(),
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
    .default([]),
});

const ToolCallFunctionSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.any()).default({}),
});

const ToolCallSchema = z.object({
  id: z.string().default(create_new_id),
  type: z.literal("function").default("function" as const),
  function: ToolCallFunctionSchema,
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

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
    .default([]),
  tool_calls: z.union([z.array(ToolCallSchema), z.null()]).default(null),
});

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
    .default([]),
});

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
});

const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  text: z.string(),
});

const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  blob: z.string(),
});

const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
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
      z.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema]),
    )
    .default([]),
  is_error: z.boolean().default(false),
  started_at: z.iso.datetime().default(get_now_timestamp),
  completed_at: z.union([z.iso.datetime(), z.null()]).default(null),
});

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
  secondYAxisColumns: z.array(z.string()).default([]),
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

const CodeFileBindingSchema = z.object({
  canonical_path: z.string(),
  access_mode: z.enum(CodeFileAccessModeEnum),
});

const ColorPickerChoiceSchema = z.object({
  color: z.string(),
  description: z.string(),
});

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

const VisibilitySchema = z.object({
  DEV: z.boolean().default(true),
  USER: z.boolean().default(true),
});

type Visibility = z.infer<typeof VisibilitySchema>;

function createVisibility(options: Partial<Visibility> = {}): Visibility {
  return VisibilitySchema.parse(options);
}

const SharedModifierSchema = z.object({
  activeLayerIdx: z.int().optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  brushColor: z.string().optional(),
  brushOpacity: z.number().optional(),
  brushShape: z.enum(DrawAreaBrushShapeEnum).optional(),
  brushSize: z.int().optional(),
  callable: z.union([IDSchema, z.null()]).optional(),
  canvasMode: z.enum(DrawAreaModeEnum).optional(),
  chartSettings: z
    .union([LineChartSettingsSchema, ScatterChartSettingsSchema])
    .optional(),
  children: z.array(IDSchema).optional(),
  choices: z.array(z.string()).optional(),
  code: z.string().optional(),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).optional(),
  codeLanguage: z.enum(CodeLanguageEnum).optional(),
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
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
  id: IDSchema.optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
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
  pinnedParams: z.array(IDSchema).optional(),
  positionAndSizeLocked: z.boolean().optional(),
  renderedValue: z.union([z.string(), z.null()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  size: SectionSizeSchema.optional(),
  step: z.int().optional(),
  text: z.string().optional(),
  textDisplayMode: z.enum(TextBlockDisplayModeEnum).optional(),
  topLevelParamId: z.union([IDSchema, z.null()]).optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  viewMode: z.enum(BrowserAreaViewModeEnum).optional(),
  visibility: VisibilitySchema.optional(),
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
  variants: z.array(IDSchema).default([]),
  defaultVariant: z.union([IDSchema, z.null()]).default(null),
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

const CallableSectionImplSchema = z.object({
  type: z.literal("Callable").default(SectionTypeEnum.Callable),
  id: IDSchema.default(create_new_id),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  callable: z.union([IDSchema, z.null()]).default(null),
  hideParams: z.boolean().default(false),
});

type CallableSectionImpl = z.infer<typeof CallableSectionImplSchema>;

const DictSectionImplSchema = z.object({
  type: z.literal("Dict").default(SectionTypeEnum.Dict),
  id: IDSchema.default(create_new_id),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

type DictSectionImpl = z.infer<typeof DictSectionImplSchema>;

const ListRootSectionImplSchema = z.object({
  type: z.literal("ListRoot").default(SectionTypeEnum.ListRoot),
  id: IDSchema.default(create_new_id),
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
  children: z.array(IDSchema).default([]),
});

type ListRootSectionImpl = z.infer<typeof ListRootSectionImplSchema>;

const DictRootSectionImplSchema = z.object({
  type: z.literal("DictRoot").default(SectionTypeEnum.DictRoot),
  id: IDSchema.default(create_new_id),
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
  children: z.array(IDSchema).default([]),
});

type DictRootSectionImpl = z.infer<typeof DictRootSectionImplSchema>;

const GroupSectionImplSchema = z.object({
  type: z.literal("Group").default(SectionTypeEnum.Group),
  id: IDSchema.default(create_new_id),
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
  children: z.array(IDSchema).default([]),
  isHorizontalOrientation: z.boolean().default(false),
});

type GroupSectionImpl = z.infer<typeof GroupSectionImplSchema>;

const ImageSectionImplSchema = z.object({
  type: z.literal("Image").default(SectionTypeEnum.Image),
  id: IDSchema.default(create_new_id),
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

type ImageSectionImpl = z.infer<typeof ImageSectionImplSchema>;

const ChartSectionImplSchema = z.object({
  type: z.literal("Chart").default(SectionTypeEnum.Chart),
  id: IDSchema.default(create_new_id),
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

type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

const DrawSectionImplSchema = z.object({
  type: z.literal("Draw").default(SectionTypeEnum.Draw),
  id: IDSchema.default(create_new_id),
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

type DrawSectionImpl = z.infer<typeof DrawSectionImplSchema>;

const TextBlockSectionImplSchema = z.object({
  type: z.literal("TextBlock").default(SectionTypeEnum.TextBlock),
  id: IDSchema.default(create_new_id),
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

type TextBlockSectionImpl = z.infer<typeof TextBlockSectionImplSchema>;

const SocialSectionImplSchema = z.object({
  type: z.literal("Social").default(SectionTypeEnum.Social),
  id: IDSchema.default(create_new_id),
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

type SocialSectionImpl = z.infer<typeof SocialSectionImplSchema>;

const GlobalVariablesSectionImplSchema = z.object({
  type: z.literal("GlobalVariables").default(SectionTypeEnum.GlobalVariables),
  id: IDSchema.default(create_new_id),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
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

type CodeSectionImpl = z.infer<typeof CodeSectionImplSchema>;

const GenPythonCodeSectionImplSchema = z.object({
  type: z.literal("GenPythonCode").default(SectionTypeEnum.GenPythonCode),
  id: IDSchema.default(create_new_id),
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

type GenPythonCodeSectionImpl = z.infer<typeof GenPythonCodeSectionImplSchema>;

const TerminalSectionImplSchema = z.object({
  type: z.literal("Terminal").default(SectionTypeEnum.Terminal),
  id: IDSchema.default(create_new_id),
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

type TerminalSectionImpl = z.infer<typeof TerminalSectionImplSchema>;

const IFrameSectionImplSchema = z.object({
  type: z.literal("IFrame").default(SectionTypeEnum.IFrame),
  id: IDSchema.default(create_new_id),
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

type IFrameSectionImpl = z.infer<typeof IFrameSectionImplSchema>;

const ChatSectionImplSchema = z.object({
  type: z.literal("Chat").default(SectionTypeEnum.Chat),
  id: IDSchema.default(create_new_id),
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

type ChatSectionImpl = z.infer<typeof ChatSectionImplSchema>;

const BrowserSectionImplSchema = z.object({
  type: z.literal("Browser").default(SectionTypeEnum.Browser),
  id: IDSchema.default(create_new_id),
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

type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

const VariantSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: IDSchema,
  nonPresetImpls: z.array(IDSchema),
  modifier: SharedModifierSchema.default(createSharedModifier),
  isFrozen: z.boolean().default(false),
});

export type Variant = z.infer<typeof VariantSchema>;

const CodeCallableCodeObjImplSchema = z.object({
  type: z.literal("CodeCallable").default(CodeObjTypeEnum.CodeCallable),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type CodeParamCodeObjImpl = z.infer<typeof CodeParamCodeObjImplSchema>;

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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type TextParamCodeObjImpl = z.infer<typeof TextParamCodeObjImplSchema>;

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
  defaultVal: z.string().default("" as const),
  value: z.string().default("0" as const),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

export type SliderParamCodeObjImpl = z.infer<
  typeof SliderParamCodeObjImplSchema
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default([]),
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type PasswordParamCodeObjImpl = z.infer<typeof PasswordParamCodeObjImplSchema>;

const NestedParamCodeObjImplSchema = z.object({
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
  sectionVariants: z.record(IDSchema, VariantSchema).default({}),
  codeObjs: z.record(IDSchema, CoreSchema).default({}),
  codeObjImpls: z
    .record(
      IDSchema,
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

const Base64DependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("Base64").default(DependencyValueTypeEnum.Base64),
});

export type Base64DependencyValue = z.infer<typeof Base64DependencyValueSchema>;

const FileReadDependencyValueSchema = z.object({
  payload: z.string(),
  type: z.literal("FileRead").default(DependencyValueTypeEnum.FileRead),
});

const BaseDependencyValueUnionSchema = z.union([
  LiteralDependencyValueSchema,
  Base64DependencyValueSchema,
  FileReadDependencyValueSchema,
]);

export type BaseDependencyValueUnion = z.infer<
  typeof BaseDependencyValueUnionSchema
>;

const BaseChildlessCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
]);

type BaseChildlessCodeObjImplUnion = z.infer<
  typeof BaseChildlessCodeObjImplUnionSchema
>;

const BaseCodeObjImplUnionSchema = z.union([
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

const BaseDictSectionImplUnionSchema = z.union([
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

type BaseDictSectionImplUnion = z.infer<typeof BaseDictSectionImplUnionSchema>;

const BaseParamCodeObjImplUnionSchema = z.union([
  CodeParamCodeObjImplSchema,
  TextParamCodeObjImplSchema,
  SliderParamCodeObjImplSchema,
  SwitchParamCodeObjImplSchema,
  ColorPickerParamCodeObjImplSchema,
  DropdownParamCodeObjImplSchema,
  PasswordParamCodeObjImplSchema,
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
  DictRootSectionImplSchema,
  GroupSectionImplSchema,
]);

type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

const BaseSectionImplUnionSchema = z.union([
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

type ChartSectionImplArgs = z.infer<typeof ChartSectionImplArgsSchema>;

const DrawSectionImplArgsSchema = z.object({
  type: z.literal("Draw").optional(),
  id: IDSchema.optional(),
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
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type TextParamCodeObjImplArgs = z.infer<typeof TextParamCodeObjImplArgsSchema>;

const SliderParamCodeObjImplArgsSchema = z.object({
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

type SliderParamCodeObjImplArgs = z.infer<
  typeof SliderParamCodeObjImplArgsSchema
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
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

type PasswordParamCodeObjImplArgs = z.infer<
  typeof PasswordParamCodeObjImplArgsSchema
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

const NestedParamCodeObjImplArgsSchema = z.object({
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

type NestedParamCodeObjImplArgs = z.infer<
  typeof NestedParamCodeObjImplArgsSchema
>;

const CodeSectionImplArgsSchema = z.object({
  type: z.literal("Code").optional(),
  id: IDSchema.optional(),
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

type CodeSectionImplArgs = z.infer<typeof CodeSectionImplArgsSchema>;

const GenPythonCodeSectionImplArgsSchema = z.object({
  type: z.literal("GenPythonCode").optional(),
  id: IDSchema.optional(),
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

type GenPythonCodeSectionImplArgs = z.infer<
  typeof GenPythonCodeSectionImplArgsSchema
>;

const DictSectionImplArgsSchema = z.object({
  type: z.literal("Dict").optional(),
  id: IDSchema.optional(),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
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
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
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
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
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
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.union([z.boolean(), z.number()]).optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(IDSchema).optional(),
});

type ListRootSectionImplArgs = z.infer<typeof ListRootSectionImplArgsSchema>;

const DictRootSectionImplArgsSchema = z.object({
  type: z.literal("DictRoot").optional(),
  id: IDSchema.optional(),
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
  children: z.array(IDSchema).optional(),
});

type DictRootSectionImplArgs = z.infer<typeof DictRootSectionImplArgsSchema>;

const GroupSectionImplArgsSchema = z.object({
  type: z.literal("Group").optional(),
  id: IDSchema.optional(),
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
  children: z.array(IDSchema).optional(),
  isHorizontalOrientation: z.boolean().optional(),
});

type GroupSectionImplArgs = z.infer<typeof GroupSectionImplArgsSchema>;

const CallableSectionImplArgsSchema = z.object({
  type: z.literal("Callable").optional(),
  id: IDSchema.optional(),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
  callable: z.union([IDSchema, z.null()]).optional(),
  hideParams: z.boolean().optional(),
});

type CallableSectionImplArgs = z.infer<typeof CallableSectionImplArgsSchema>;

const ImageSectionImplArgsSchema = z.object({
  type: z.literal("Image").optional(),
  id: IDSchema.optional(),
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

type ImageSectionImplArgs = z.infer<typeof ImageSectionImplArgsSchema>;

const TextBlockSectionImplArgsSchema = z.object({
  type: z.literal("TextBlock").optional(),
  id: IDSchema.optional(),
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

type TextBlockSectionImplArgs = z.infer<typeof TextBlockSectionImplArgsSchema>;

const SocialSectionImplArgsSchema = z.object({
  type: z.literal("Social").optional(),
  id: IDSchema.optional(),
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

type SocialSectionImplArgs = z.infer<typeof SocialSectionImplArgsSchema>;

const TerminalSectionImplArgsSchema = z.object({
  type: z.literal("Terminal").optional(),
  id: IDSchema.optional(),
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

type TerminalSectionImplArgs = z.infer<typeof TerminalSectionImplArgsSchema>;

const IFrameSectionImplArgsSchema = z.object({
  type: z.literal("IFrame").optional(),
  id: IDSchema.optional(),
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

type IFrameSectionImplArgs = z.infer<typeof IFrameSectionImplArgsSchema>;

const ChatSectionImplArgsSchema = z.object({
  type: z.literal("Chat").optional(),
  id: IDSchema.optional(),
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

type ChatSectionImplArgs = z.infer<typeof ChatSectionImplArgsSchema>;

const BrowserSectionImplArgsSchema = z.object({
  type: z.literal("Browser").optional(),
  id: IDSchema.optional(),
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

type BrowserSectionImplArgs = z.infer<typeof BrowserSectionImplArgsSchema>;

const RealtimeUIChangeContentSchema = z.object({
  projectConfigId: IDSchema,
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

const LLMStreamingResponseSchema = z.object({
  chatId: IDSchema,
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

const WebsocketMsgLLMStreamingResponseSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: LLMStreamingResponseSchema,
  messageType: z
    .literal("LLMStreamingResponse")
    .default(WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse),
});

const SettaGenCodeDiagnosticSchema = z.object({
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
  message: z.string(),
});

const SettaProjectConfigDiagnosticsSchema = z.object({
  projectConfigId: IDSchema,
  diagnostics: z.array(SettaGenCodeDiagnosticSchema),
  isGenCode: z.boolean(),
});

export type SettaProjectConfigDiagnostics = z.infer<
  typeof SettaProjectConfigDiagnosticsSchema
>;

const WebsocketMsgLSPDiagnosticsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: SettaProjectConfigDiagnosticsSchema,
  messageType: z
    .literal("LSPDiagnostics")
    .default(WebsocketMsgTypeForFrontendEnum.LSPDiagnostics),
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

const ProjectConfigSchema = z.object({
  id: IDSchema.default(create_new_id),
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
  entryCodeBlockId: z.union([IDSchema, z.null()]).default(null),
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema).default({}),
  sectionVariantMap: z.record(IDSchema, IDSchema).default({}),
  activeIds: z.array(IDSchema).default([]),
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
});

type SingletonSections = z.infer<typeof SingletonSectionsSchema>;

export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return SingletonSectionsSchema.parse(options);
}

const ShownParamIdDetailsSchema = z.object({
  requiredParamIdsToPaths: z.record(IDSchema, z.array(IDSchema)).default({}),
  topLevelParamIds: z.array(IDSchema).default([]),
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

const ProjectStateSingleConfigSchema = z.object({
  sections: z.record(IDSchema, CoreSchema).default({}),
  sectionImpls: z
    .record(
      IDSchema,
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
  sectionVariants: z.record(IDSchema, VariantSchema).default({}),
  codeObjs: z.record(IDSchema, CoreSchema).default({}),
  codeObjImpls: z
    .record(
      IDSchema,
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
  codeObjVariants: z.record(IDSchema, VariantSchema).default({}),
  projectConfig: ProjectConfigSchema,
  singletonSections: SingletonSectionsSchema.default(createSingletonSections),
  parentSectionMap: z
    .record(IDSchema, z.union([IDSchema, z.null()]))
    .default({}),
  yamlValues: z.record(z.string(), z.string()).default({}),
  shownParamIds: z.record(IDSchema, ShownParamIdsSchema).default({}),
  requiredDecodedImages: z.array(z.string()).default([]),
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

type SettingsGUI = z.infer<typeof SettingsGUISchema>;

function createSettingsGUI(options: Partial<SettingsGUI> = {}): SettingsGUI {
  return SettingsGUISchema.parse(options);
}

const SettingsBackendSchema = z.object({
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

type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

function createSettingsBackend(
  options: Partial<SettingsBackend> = {},
): SettingsBackend {
  return SettingsBackendSchema.parse(options);
}

const UserDefaultBrowserSectionImplSchema = z.object({
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

type UserDefaultCallableSectionImpl = z.infer<
  typeof UserDefaultCallableSectionImplSchema
>;

function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return UserDefaultCallableSectionImplSchema.parse(options);
}

const UserDefaultChartSectionImplSchema = z.object({
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
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 405.0, height: 405.0 }),
  ),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

type UserDefaultChatSectionImpl = z.infer<
  typeof UserDefaultChatSectionImplSchema
>;

function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return UserDefaultChatSectionImplSchema.parse(options);
}

const UserDefaultCodeSectionImplSchema = z.object({
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

type UserDefaultCodeSectionImpl = z.infer<
  typeof UserDefaultCodeSectionImplSchema
>;

function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return UserDefaultCodeSectionImplSchema.parse(options);
}

const UserDefaultDictRootSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

type UserDefaultDictRootSectionImpl = z.infer<
  typeof UserDefaultDictRootSectionImplSchema
>;

function createUserDefaultDictRootSectionImpl(
  options: Partial<UserDefaultDictRootSectionImpl> = {},
): UserDefaultDictRootSectionImpl {
  return UserDefaultDictRootSectionImplSchema.parse(options);
}

const UserDefaultDictSectionImplSchema = z.object({
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

type UserDefaultDictSectionImpl = z.infer<
  typeof UserDefaultDictSectionImplSchema
>;

function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return UserDefaultDictSectionImplSchema.parse(options);
}

const UserDefaultDrawSectionImplSchema = z.object({
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
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() => createSectionSize({ width: 500.0 })),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
  codeFileBinding: z.union([CodeFileBindingSchema, z.null()]).default(null),
});

type UserDefaultGenPythonCodeSectionImpl = z.infer<
  typeof UserDefaultGenPythonCodeSectionImplSchema
>;

function createUserDefaultGenPythonCodeSectionImpl(
  options: Partial<UserDefaultGenPythonCodeSectionImpl> = {},
): UserDefaultGenPythonCodeSectionImpl {
  return UserDefaultGenPythonCodeSectionImplSchema.parse(options);
}

const UserDefaultGlobalVariablesSectionImplSchema = z.object({
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
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  isHorizontalOrientation: z.boolean().default(false),
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
  visibility: VisibilitySchema.default(createVisibility),
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
  visibility: VisibilitySchema.default(createVisibility),
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
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

type UserDefaultListRootSectionImpl = z.infer<
  typeof UserDefaultListRootSectionImplSchema
>;

function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return UserDefaultListRootSectionImplSchema.parse(options);
}

const UserDefaultSocialSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
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

const UserDefaultTerminalSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(() =>
    createSectionSize({ width: 700.0, height: 300.0 }),
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

type UserDefaultTextBlockSectionImpl = z.infer<
  typeof UserDefaultTextBlockSectionImplSchema
>;

function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return UserDefaultTextBlockSectionImplSchema.parse(options);
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type UserDefaultCodeParamCodeObjImpl = z.infer<
  typeof UserDefaultCodeParamCodeObjImplSchema
>;

function createUserDefaultCodeParamCodeObjImpl(
  options: Partial<UserDefaultCodeParamCodeObjImpl> = {},
): UserDefaultCodeParamCodeObjImpl {
  return UserDefaultCodeParamCodeObjImplSchema.parse(options);
}

const UserDefaultColorPickerParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("#ff0000" as const),
  colorChoices: z.array(ColorPickerChoiceSchema).default([]),
});

type UserDefaultColorPickerParamCodeObjImpl = z.infer<
  typeof UserDefaultColorPickerParamCodeObjImplSchema
>;

function createUserDefaultColorPickerParamCodeObjImpl(
  options: Partial<UserDefaultColorPickerParamCodeObjImpl> = {},
): UserDefaultColorPickerParamCodeObjImpl {
  return UserDefaultColorPickerParamCodeObjImplSchema.parse(options);
}

const UserDefaultDropdownParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
  choices: z.array(z.string()).default([]),
});

type UserDefaultDropdownParamCodeObjImpl = z.infer<
  typeof UserDefaultDropdownParamCodeObjImplSchema
>;

function createUserDefaultDropdownParamCodeObjImpl(
  options: Partial<UserDefaultDropdownParamCodeObjImpl> = {},
): UserDefaultDropdownParamCodeObjImpl {
  return UserDefaultDropdownParamCodeObjImplSchema.parse(options);
}

const UserDefaultNestedParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
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
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type UserDefaultPasswordParamCodeObjImpl = z.infer<
  typeof UserDefaultPasswordParamCodeObjImplSchema
>;

function createUserDefaultPasswordParamCodeObjImpl(
  options: Partial<UserDefaultPasswordParamCodeObjImpl> = {},
): UserDefaultPasswordParamCodeObjImpl {
  return UserDefaultPasswordParamCodeObjImplSchema.parse(options);
}

const UserDefaultSliderParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
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

const UserDefaultTextParamCodeObjImplSchema = z.object({
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  defaultVal: z.string().default("" as const),
  value: z.string().default("" as const),
});

type UserDefaultTextParamCodeObjImpl = z.infer<
  typeof UserDefaultTextParamCodeObjImplSchema
>;

function createUserDefaultTextParamCodeObjImpl(
  options: Partial<UserDefaultTextParamCodeObjImpl> = {},
): UserDefaultTextParamCodeObjImpl {
  return UserDefaultTextParamCodeObjImplSchema.parse(options);
}

const SettingsStateSchema = z.object({
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
  temporary: z.boolean().default(false),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

const AllLLMConfigsSchema = z.object({
  configs: z.record(z.string(), LLMConfigSchema).default({}),
  default_config_id: z.union([z.string(), z.null()]).default(null),
});

export type AllLLMConfigs = z.infer<typeof AllLLMConfigsSchema>;

const WebsocketMsgLLMConfigUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: AllLLMConfigsSchema,
  messageType: z
    .literal("LLMConfigUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMConfigUpdated),
});

const WebsocketMsgLLMApiKeysUpdatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.record(z.string(), z.string()),
  messageType: z
    .literal("LLMApiKeysUpdated")
    .default(WebsocketMsgTypeForFrontendEnum.LLMApiKeysUpdated),
});

const FrontendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgLLMStreamingResponseSchema,
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

const BaseCanvasSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
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

type BaseCodeSectionImplArgs = z.infer<typeof BaseCodeSectionImplArgsSchema>;

const BaseDictSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
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
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
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

type BaseSectionImplArgs = z.infer<typeof BaseSectionImplArgsSchema>;

const BaseSectionWithParamsImplArgsSchema = z.object({
  type: z.any().optional(),
  id: IDSchema.optional(),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(IDSchema).optional(),
  pinnedAreaHeight: z.union([z.literal("auto"), z.number()]).optional(),
  selectedParams: z.array(IDSchema).optional(),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).optional(),
  displayMode: z.enum(SectionWithParamsDisplayModeEnum).optional(),
});

type BaseSectionWithParamsImplArgs = z.infer<
  typeof BaseSectionWithParamsImplArgsSchema
>;

const FolderContentItemSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export type FolderContentItem = z.infer<typeof FolderContentItemSchema>;

const ChatMetadataSchema = z.object({
  id: IDSchema.default(create_new_id),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  llmConfig: LLMConfigSchema,
  projectConfigId: IDSchema,
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

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
});

type BaseParamCodeObjImpl = z.infer<typeof BaseParamCodeObjImplSchema>;

const BaseParentCodeObjImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default("" as const),
  isPreset: z.boolean().default(false),
  children: z.array(IDSchema).default([]),
});

type BaseParentCodeObjImpl = z.infer<typeof BaseParentCodeObjImplSchema>;

const BaseSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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

type BaseSectionImpl = z.infer<typeof BaseSectionImplSchema>;

const BaseCanvasSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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

type BaseCanvasSectionImpl = z.infer<typeof BaseCanvasSectionImplSchema>;

const BaseCodeSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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

type BaseCodeSectionImpl = z.infer<typeof BaseCodeSectionImplSchema>;

const BaseDictSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
  topLevelParamId: z.union([IDSchema, z.null()]).default(null),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

type BaseDictSectionImpl = z.infer<typeof BaseDictSectionImplSchema>;

const BaseParentSectionImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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
  children: z.array(IDSchema).default([]),
});

type BaseParentSectionImpl = z.infer<typeof BaseParentSectionImplSchema>;

const BaseSectionWithParamsImplSchema = z.object({
  type: z.any(),
  id: IDSchema.default(create_new_id),
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
  codeObjVariantMap: z.record(IDSchema, IDSchema).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default("" as const),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(IDSchema).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(IDSchema).default([]),
  ignoreTypeErrors: z.record(IDSchema, z.boolean()).default({}),
  displayMode: z
    .enum(SectionWithParamsDisplayModeEnum)
    .default(SectionWithParamsDisplayModeEnum.Gui),
});

type BaseSectionWithParamsImpl = z.infer<
  typeof BaseSectionWithParamsImplSchema
>;

const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export type Position = z.infer<typeof PositionSchema>;

const ListenerCoverageRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ListenerCoverageRequest = z.infer<
  typeof ListenerCoverageRequestSchema
>;

const BrowserAreaItemSchema = z.object({
  id: z.string(),
  type: z.any(),
  lastModified: z.iso.datetime(),
});

export type BrowserAreaItem = z.infer<typeof BrowserAreaItemSchema>;

const WebsocketMsgSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z.any(),
});

export type WebsocketMsg = z.infer<typeof WebsocketMsgSchema>;

const DeleteLLMChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type DeleteLLMChatRequest = z.infer<typeof DeleteLLMChatRequestSchema>;

const GetLLMChatRequestSchema = z.object({
  chatId: IDSchema,
  projectConfigId: z.union([IDSchema, z.null()]),
});

export type GetLLMChatRequest = z.infer<typeof GetLLMChatRequestSchema>;

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
  llmConfig: LLMConfigSchema,
});

export type GetLLMChatRequestResponse = z.infer<
  typeof GetLLMChatRequestResponseSchema
>;

const GetLLMResponseRequestSchema = z.object({
  chatId: z.union([IDSchema, z.null()]),
  message: z.union([
    SystemChatMessageSchema,
    AssistantChatMessageSchema,
    UserChatMessageSchema,
    ToolChatMessageSchema,
  ]),
  llmConfigId: z.string(),
  deepThink: z.boolean(),
  projectConfigId: IDSchema,
});

export type GetLLMResponseRequest = z.infer<typeof GetLLMResponseRequestSchema>;

const StopLLMChatRequestSchema = z.object({
  chatId: IDSchema,
});

export type StopLLMChatRequest = z.infer<typeof StopLLMChatRequestSchema>;

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

export type CheckIfFileExistsRequests = z.infer<
  typeof CheckIfFileExistsRequestsSchema
>;

const GetFolderContentsRequestSchema = z.object({
  folderPath: z.string(),
});

export type GetFolderContentsRequest = z.infer<
  typeof GetFolderContentsRequestSchema
>;

const LoadCachedPathsRequestSchema = z.object({
  paths: z.array(z.string()),
});

export type LoadCachedPathsRequest = z.infer<
  typeof LoadCachedPathsRequestSchema
>;

const UpdateArtifactsRequestSchema = z.object({
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

const DocstringToMarkdownRequestSchema = z.object({
  docstring: z.string(),
});

export type DocstringToMarkdownRequest = z.infer<
  typeof DocstringToMarkdownRequestSchema
>;

const UpdateAPIKeysRequestSchema = z.object({
  apiKeys: z.record(z.string(), z.string()).default({}),
});

export type UpdateAPIKeysRequest = z.infer<typeof UpdateAPIKeysRequestSchema>;

const TypeCheckRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type TypeCheckRequest = z.infer<typeof TypeCheckRequestSchema>;

const AcceptRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type AcceptRenameRefactorRequest = z.infer<
  typeof AcceptRenameRefactorRequestSchema
>;

const AddKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type AddKwargRequest = z.infer<typeof AddKwargRequestSchema>;

const AppendDrawAreaLayerItemRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  layerIdx: z.int(),
  element: DrawAreaLayerItemSchema,
});

export type AppendDrawAreaLayerItemRequest = z.infer<
  typeof AppendDrawAreaLayerItemRequestSchema
>;

const ChangeParamImplRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  selectedId: IDSchema,
});

export type ChangeParamImplRequest = z.infer<
  typeof ChangeParamImplRequestSchema
>;

const ClearTextFieldCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: z.union([IDSchema, z.null()]),
});

export type ClearTextFieldCompletionRequest = z.infer<
  typeof ClearTextFieldCompletionRequestSchema
>;

const CodeAreaCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type CodeAreaCompletionRequest = z.infer<
  typeof CodeAreaCompletionRequestSchema
>;

const CreateChildSectionsRequestSchema = z.object({
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

const CreateChildSectionsViaIncrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
  implType: z.enum(SectionTypeEnum),
});

export type CreateChildSectionsViaIncrementerRequest = z.infer<
  typeof CreateChildSectionsViaIncrementerRequestSchema
>;

const CreateNewSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type CreateNewSectionVariantRequest = z.infer<
  typeof CreateNewSectionVariantRequestSchema
>;

const CreateTopLevelSectionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  implType: z.enum(SectionTypeEnum),
  implOverrides: z
    .union([
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
      ]),
      z.null(),
    ])
    .default(null),
  position: PositionSchema,
});

export type CreateTopLevelSectionRequest = z.infer<
  typeof CreateTopLevelSectionRequestSchema
>;

const DeclineRenameRefactorRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type DeclineRenameRefactorRequest = z.infer<
  typeof DeclineRenameRefactorRequestSchema
>;

const DeleteChildSectionsViaDecrementerRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  calledBy: IDSchema,
  numChildren: z.int(),
});

export type DeleteChildSectionsViaDecrementerRequest = z.infer<
  typeof DeleteChildSectionsViaDecrementerRequestSchema
>;

const DeleteJSONSourceFileAndVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
  filepath: z.string(),
});

export type DeleteJSONSourceFileAndVariantRequest = z.infer<
  typeof DeleteJSONSourceFileAndVariantRequestSchema
>;

const DeleteKwargRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type DeleteKwargRequest = z.infer<typeof DeleteKwargRequestSchema>;

const DeleteSectionVariantOrAskRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type DeleteSectionVariantOrAskRequest = z.infer<
  typeof DeleteSectionVariantOrAskRequestSchema
>;

const DeleteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type DeleteSectionsRequest = z.infer<typeof DeleteSectionsRequestSchema>;

const ForceRefreshProjectRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type ForceRefreshProjectRequest = z.infer<
  typeof ForceRefreshProjectRequestSchema
>;

const GenCodePrefixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodePrefixCompletionRequest = z.infer<
  typeof GenCodePrefixCompletionRequestSchema
>;

const GenCodeSuffixCompletionRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  fullText: z.string(),
  position: z.int(),
});

export type GenCodeSuffixCompletionRequest = z.infer<
  typeof GenCodeSuffixCompletionRequestSchema
>;

const GetLatestProjectStateRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type GetLatestProjectStateRequest = z.infer<
  typeof GetLatestProjectStateRequestSchema
>;

const GroupSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type GroupSectionsRequest = z.infer<typeof GroupSectionsRequestSchema>;

const PasteSectionsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  data: ProjectStateCoreWithSectionVariantMapSchema,
  position: PositionSchema,
  asRef: z.boolean(),
});

export type PasteSectionsRequest = z.infer<typeof PasteSectionsRequestSchema>;

const PrepareSectionsForCopyRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionIds: z.array(IDSchema),
});

export type PrepareSectionsForCopyRequest = z.infer<
  typeof PrepareSectionsForCopyRequestSchema
>;

const RedoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type RedoRequest = z.infer<typeof RedoRequestSchema>;

const SetActiveIdsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  activeIds: z.array(IDSchema),
});

export type SetActiveIdsRequest = z.infer<typeof SetActiveIdsRequestSchema>;

const SetBrowserAreaViewModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  viewMode: z.enum(BrowserAreaViewModeEnum),
});

export type SetBrowserAreaViewModeRequest = z.infer<
  typeof SetBrowserAreaViewModeRequestSchema
>;

const SetBrowserHideColumnRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideColumn: z.boolean(),
});

export type SetBrowserHideColumnRequest = z.infer<
  typeof SetBrowserHideColumnRequestSchema
>;

const SetCallableHideParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideParams: z.boolean(),
});

export type SetCallableHideParamsRequest = z.infer<
  typeof SetCallableHideParamsRequestSchema
>;

const SetCallableRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  callableName: z.string(),
  refetchParams: z.boolean(),
});

export type SetCallableRequest = z.infer<typeof SetCallableRequestSchema>;

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
  childCodeObjs: z.array(SetCallableChildCodeObjSchema).default([]),
  lspStatus: z.enum(SignatureHelpStatusEnum),
});

export type SetCallableResponse = z.infer<typeof SetCallableResponseSchema>;

const SetChartAreaDataPathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  dataPath: z.string(),
});

export type SetChartAreaDataPathRequest = z.infer<
  typeof SetChartAreaDataPathRequestSchema
>;

const SetChartSettingsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartSettings: z.union([LineChartSettingsSchema, ScatterChartSettingsSchema]),
  changedSettings: z.array(z.string()),
});

export type SetChartSettingsRequest = z.infer<
  typeof SetChartSettingsRequestSchema
>;

const SetChartTypeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  chartType: z.enum(ChartTypeEnum),
});

export type SetChartTypeRequest = z.infer<typeof SetChartTypeRequestSchema>;

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

export type SetCodeFileBindingRequest = z.infer<
  typeof SetCodeFileBindingRequestSchema
>;

const SetCodeObjNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  codeObjId: IDSchema,
  name: z.string(),
});

export type SetCodeObjNameRequest = z.infer<typeof SetCodeObjNameRequestSchema>;

const SetCodeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  code: z.string(),
});

export type SetCodeRequest = z.infer<typeof SetCodeRequestSchema>;

const SetDefaultSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetDefaultSectionVariantRequest = z.infer<
  typeof SetDefaultSectionVariantRequestSchema
>;

const SetGenCodePrefixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodePrefix: z.string(),
});

export type SetGenCodePrefixRequest = z.infer<
  typeof SetGenCodePrefixRequestSchema
>;

const SetGenCodeSuffixRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  genCodeSuffix: z.string(),
});

export type SetGenCodeSuffixRequest = z.infer<
  typeof SetGenCodeSuffixRequestSchema
>;

const SetImageAreaImagePathRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  imagePath: z.string(),
});

export type SetImageAreaImagePathRequest = z.infer<
  typeof SetImageAreaImagePathRequestSchema
>;

const SetParamEnteredValueRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  value: z.string(),
});

export type SetParamEnteredValueRequest = z.infer<
  typeof SetParamEnteredValueRequestSchema
>;

const SetSectionHideUnpinnedParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  hideUnpinnedParams: z.boolean(),
});

export type SetSectionHideUnpinnedParamsRequest = z.infer<
  typeof SetSectionHideUnpinnedParamsRequestSchema
>;

const SetSectionNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  name: z.string(),
});

export type SetSectionNameRequest = z.infer<typeof SetSectionNameRequestSchema>;

const SetSectionParamFilterRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  value: z.string(),
});

export type SetSectionParamFilterRequest = z.infer<
  typeof SetSectionParamFilterRequestSchema
>;

const SetSectionSizesRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionSizes: z.record(IDSchema, SectionSizeSchema),
});

export type SetSectionSizesRequest = z.infer<
  typeof SetSectionSizesRequestSchema
>;

const SetSectionVariantNameRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
  name: z.string(),
});

export type SetSectionVariantNameRequest = z.infer<
  typeof SetSectionVariantNameRequestSchema
>;

const SetSectionVariantRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type SetSectionVariantRequest = z.infer<
  typeof SetSectionVariantRequestSchema
>;

const SetSectionWithParamsDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  displayMode: z.enum(SectionWithParamsDisplayModeEnum),
});

export type SetSectionWithParamsDisplayModeRequest = z.infer<
  typeof SetSectionWithParamsDisplayModeRequestSchema
>;

const SetSocialUrlRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  url: z.string(),
});

export type SetSocialUrlRequest = z.infer<typeof SetSocialUrlRequestSchema>;

const SetTextBlockDisplayModeRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  textDisplayMode: z.enum(TextBlockDisplayModeEnum),
});

export type SetTextBlockDisplayModeRequest = z.infer<
  typeof SetTextBlockDisplayModeRequestSchema
>;

const SetTextBlockFormatRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  format: z.enum(TextBlockFormatEnum),
});

export type SetTextBlockFormatRequest = z.infer<
  typeof SetTextBlockFormatRequestSchema
>;

const SetTextBlockTextRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  text: z.string(),
});

export type SetTextBlockTextRequest = z.infer<
  typeof SetTextBlockTextRequestSchema
>;

const SetTopLevelSectionLayoutRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  topLevelSections: z.record(IDSchema, TopLevelSectionLayoutSchema),
});

export type SetTopLevelSectionLayoutRequest = z.infer<
  typeof SetTopLevelSectionLayoutRequestSchema
>;

const SetViewportRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  viewport: z.union([ViewportSchema, z.null()]),
});

export type SetViewportRequest = z.infer<typeof SetViewportRequestSchema>;

const TextFieldCompletionRequestSchema = z.object({
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

const ToggleMinimizedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type ToggleMinimizedRequest = z.infer<
  typeof ToggleMinimizedRequestSchema
>;

const ToggleParamSelectedRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
});

export type ToggleParamSelectedRequest = z.infer<
  typeof ToggleParamSelectedRequestSchema
>;

const TogglePositionLockRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
});

export type TogglePositionLockRequest = z.infer<
  typeof TogglePositionLockRequestSchema
>;

const ToggleVariantFrozenRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantFrozenRequest = z.infer<
  typeof ToggleVariantFrozenRequestSchema
>;

const ToggleVariantJSONSourceRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  variantId: IDSchema,
});

export type ToggleVariantJSONSourceRequest = z.infer<
  typeof ToggleVariantJSONSourceRequestSchema
>;

const UndoRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  steps: z.int(),
});

export type UndoRequest = z.infer<typeof UndoRequestSchema>;

const UngroupGroupsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  groupIds: z.array(IDSchema),
});

export type UngroupGroupsRequest = z.infer<typeof UngroupGroupsRequestSchema>;

const UnselectAllParamsRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
});

export type UnselectAllParamsRequest = z.infer<
  typeof UnselectAllParamsRequestSchema
>;

const UpdateParamImplConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  sectionId: IDSchema,
  paramInfoId: IDSchema,
  newConfig: z.record(z.string(), z.any()),
});

export type UpdateParamImplConfigRequest = z.infer<
  typeof UpdateParamImplConfigRequestSchema
>;

const CreateProjectConfigRequestSchema = z.object({
  previewImgColor: z.string(),
});

export type CreateProjectConfigRequest = z.infer<
  typeof CreateProjectConfigRequestSchema
>;

const DeleteNotificationRequestSchema = z.object({
  notificationId: IDSchema,
});

export type DeleteNotificationRequest = z.infer<
  typeof DeleteNotificationRequestSchema
>;

const DeleteProjectConfigsRequestSchema = z.object({
  ids: z.array(IDSchema),
});

export type DeleteProjectConfigsRequest = z.infer<
  typeof DeleteProjectConfigsRequestSchema
>;

const GetNotificationsRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type GetNotificationsRequest = z.infer<
  typeof GetNotificationsRequestSchema
>;

const ManualSaveRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type ManualSaveRequest = z.infer<typeof ManualSaveRequestSchema>;

const ProjectLoadRequestSchema = z.object({
  projectConfigName: z.string(),
});

export type ProjectLoadRequest = z.infer<typeof ProjectLoadRequestSchema>;

const SaveAsNewProjectConfigRequestSchema = z.object({
  frontendOpId: z.union([z.string(), z.null()]).default(null),
  projectConfigId: IDSchema,
  newConfigName: z.string(),
  withRefs: z.boolean(),
});

export type SaveAsNewProjectConfigRequest = z.infer<
  typeof SaveAsNewProjectConfigRequestSchema
>;

const SetAsDefaultProjectRequestSchema = z.object({
  projectId: IDSchema,
});

export type SetAsDefaultProjectRequest = z.infer<
  typeof SetAsDefaultProjectRequestSchema
>;

const SetProjectConfigNameRequestSchema = z.object({
  projectConfigId: IDSchema,
  newName: z.string(),
});

export type SetProjectConfigNameRequest = z.infer<
  typeof SetProjectConfigNameRequestSchema
>;

const CreateFileRequestSchema = z.object({
  filepath: z.string(),
});

export type CreateFileRequest = z.infer<typeof CreateFileRequestSchema>;

const GetJSONSourcePathToBeDeletedSchema = z.object({
  variantName: z.string(),
});

export type GetJSONSourcePathToBeDeleted = z.infer<
  typeof GetJSONSourcePathToBeDeletedSchema
>;

const NewJSONVersionNameRequestSchema = z.object({
  filename: z.string(),
});

export type NewJSONVersionNameRequest = z.infer<
  typeof NewJSONVersionNameRequestSchema
>;

const SaveSettingsRequestSchema = z.object({
  settings: SettingsStateSchema,
});

export type SaveSettingsRequest = z.infer<typeof SaveSettingsRequestSchema>;

const BackendInitEventSchema = z.object({
  message: z.string(),
  timestamp: z.iso.datetime().default(get_now_timestamp),
});

const BackendInitStatusResponseSchema = z.object({
  events: z.array(BackendInitEventSchema),
  isReady: z.boolean(),
  error: z.union([z.string(), z.null()]),
});

export type BackendInitStatusResponse = z.infer<
  typeof BackendInitStatusResponseSchema
>;

const DeleteTerminalsRequestSchema = z.object({
  sectionIds: z.array(IDSchema),
});

export type DeleteTerminalsRequest = z.infer<
  typeof DeleteTerminalsRequestSchema
>;

const KillSubprocessesRequestSchema = z.object({
  projectConfigId: IDSchema,
});

export type KillSubprocessesRequest = z.infer<
  typeof KillSubprocessesRequestSchema
>;

const RunCodeRequestSchema = z.object({
  projectConfigId: IDSchema,
  sectionId: z.union([IDSchema, z.null()]),
  cliId: z.union([z.string(), z.null()]).default(null),
});

export type RunCodeRequest = z.infer<typeof RunCodeRequestSchema>;

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
