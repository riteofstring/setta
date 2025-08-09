import {
  createNewId as create_new_id,
  createRandomName as generate_memorable_string,
} from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import { z } from "zod/v4";

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export type ObjectValues<T> = T[keyof T];
export const BaseArtifactSectionImplTypeSet = new Set([
  "Chart",
  "Draw",
  "Image",
]);

export const BaseCanvasSectionImplTypeSet = new Set(["Chart", "Draw"]);

export const BaseChildlessCodeObjImplTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
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

export const BaseCodeSectionImplTypeSet = new Set(["Code", "GenPythonCode"]);

export const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

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

export const BaseParentCodeObjImplTypeSet = new Set([
  "CodeCallable",
  "NestedParam",
]);

export const BaseParentSectionImplTypeSet = new Set([
  "DictRoot",
  "Group",
  "ListRoot",
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

export const BaseSectionWithParamsImplTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
]);

export const BackendWebsocketMsgTypeSet = new Set(["CurrentAddressUpdate"]);

export const FrontendWebsocketMsgTypeSet = new Set([
  "AllConnections",
  "AllDependencies",
  "Artifact",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "Notification",
  "ReturnRenameRefactorResults",
  "SpecificFileWatcherUpdate",
  "TerminalMetadata",
  "UUIDMappingForLLM",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const WebsocketMsgTypeSet = new Set([
  "AllConnections",
  "AllDependencies",
  "Artifact",
  "CurrentAddressUpdate",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "Notification",
  "ReturnRenameRefactorResults",
  "SpecificFileWatcherUpdate",
  "TerminalMetadata",
  "UUIDMappingForLLM",
  "UpdateFrontendProjectState",
  "UpdateSettings",
]);

export const ArtifactTypeEnum = {
  IMG: "IMG",
  BRUSH_STROKES: "BRUSH_STROKES",
  LIST: "LIST",
  CHAT_HISTORY: "CHAT_HISTORY",
} as const;

export type ArtifactType = ObjectValues<typeof ArtifactTypeEnum>;

export const ChatRoleEnum = { user: "user", assistant: "assistant" } as const;

export type ChatRole = ObjectValues<typeof ChatRoleEnum>;

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

export const CodeLanguageEnum = { python: "python", bash: "bash" } as const;

export type CodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const SectionSizeModeEnum = { auto: "auto" } as const;

export type SectionSizeMode = ObjectValues<typeof SectionSizeModeEnum>;

export const TextBlockDisplayModeEnum = {
  render: "render",
  edit: "edit",
} as const;

export type TextBlockDisplayMode = ObjectValues<
  typeof TextBlockDisplayModeEnum
>;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;

export type TextBlockFormat = ObjectValues<typeof TextBlockFormatEnum>;

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

export const ViewingEditingModeEnum = {
  DEV: "DEV",
  USER: "USER",
  USER_EDIT: "USER_EDIT",
} as const;

export type ViewingEditingMode = ObjectValues<typeof ViewingEditingModeEnum>;

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
  SAVE_AS_EXISTING_PROJECT_CONFIG: "/saveAsExistingProjectConfig",
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
  WEBSOCKET_PYTHON_LOGGER: "/pythonLogger",
  SAVE_CODE_INFO: "/codeInfo/save",
  COPY_SECTIONS: "/copySections",
  SEND_PROJECT_TO_INTERACTIVE_CODE: "/sendProjectTointeractiveCode",
  KILL_SUBPROCESSES: "/killSubprocesses",
  FORMAT_CODE: "/formatCode",
  SEND_ARTIFACT: "/sendArtfiact",
  LOAD_ARTIFACTS: "/loadArtifacts",
  LOAD_AVAILABLE_ARTIFACTS: "/loadAvailableArtifacts",
  READ_CSV_BASE64: "/readCSVBase64",
  FILL_IN_MISSING_ARTIFACT_IDS: "/getArtifactIdsFromNamePathType",
  GET_DEFAULT_PROJECT_CONFIG_NAME: "/getDefaultConfigName",
  SECTION_TO_YAML: "/sectionToYaml",
  LOAD_SECTION_JSON_SOURCE: "/loadSectionJSONSource",
  DOCSTRING_TO_MARKDOWN: "/docstringToMarkdown",
  NEW_JSON_VERSION_NAME: "/newJsonVersionName",
  SAVE_SECTION_JSON_SOURCE: "/saveSectionJsonSource",
  SET_AS_DEFAULT_PROJECT: "/setAsDefaultProject",
  FILTER_DATA_FOR_JSON_EXPORT: "/filterDataForJSONExport",
  ADD_DEFAULT_DATA_FOR_JSON_IMPORT: "/addDefaultDataForJSONImport",
  GET_JSON_SOURCE_PATH_TO_BE_DELETED: "/getJsonSourcePathToBeDeleted",
  CREATE_FILE: "/createFile",
  DELETE_FILE: "/deleteFile",
  CHECK_IF_FILE_EXISTS: "/checkIfFileExists",
  LOAD_ARTIFACT_FROM_DISK: "/loadArtifactFromDisk",
  RESTART_LANGUAGE_SERVER: "/restartLanguageServer",
  FILE_WATCH_LIST: "/fileWatchList",
  FILE_WATCH_GEN_PYTHON_CODE: "/fileWatchGenPythonCode",
  GET_NOTIFICATIONS: "/getNotifications",
  DELETE_NOTIFICATION: "/deleteNotification",
  GET_LLM_RESPONSE: "/getLLMResponse",
  SET_LLM_API_KEYS: "/setLLMApiKeys",
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
  CREATE_NEW_SECTION_VERSION: "/createNewSectionVersion",
  UNDO: "/undo",
  REDO: "/redo",
  UPDATE_FROM_FRONTEND: "/updateFromFrontend",
  GET_LATEST_PROJECT_STATE: "/getLatestProjectState",
  UPDATE_FROM_FRONTEND_TOP_LEVEL_SECTION_LAYOUT:
    "/updateFromFrontendTopLevelSectionLayout",
} as const;

export type Route = ObjectValues<typeof RouteEnum>;

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

export const FileWatchGroupNameEnum = {
  jsonSource: "jsonSource",
  apiKeys: "apiKeys",
  genPythonCode: "genPythonCode",
} as const;

export type FileWatchGroupName = ObjectValues<typeof FileWatchGroupNameEnum>;

export const WebsocketConnectionTypeEnum = {
  CLI: "CLI",
  SERVER: "SERVER",
  PYTHON_SCRIPT: "PYTHON_SCRIPT",
  PYTHON_LOGGER: "PYTHON_LOGGER",
  FRONTEND: "FRONTEND",
} as const;

export type WebsocketConnectionType = ObjectValues<
  typeof WebsocketConnectionTypeEnum
>;

export const WebsocketMsgTypeForBackendEnum = {
  CurrentAddressUpdate: "CurrentAddressUpdate",
} as const;

export type WebsocketMsgTypeForBackend = ObjectValues<
  typeof WebsocketMsgTypeForBackendEnum
>;

export const WebsocketMsgTypeForFrontendEnum = {
  AllConnections: "AllConnections",
  LSPDiagnostics: "LSPDiagnostics",
  TerminalMetadata: "TerminalMetadata",
  AllDependencies: "AllDependencies",
  SpecificFileWatcherUpdate: "SpecificFileWatcherUpdate",
  Notification: "Notification",
  LLMStreamingResponse: "LLMStreamingResponse",
  UUIDMappingForLLM: "UUIDMappingForLLM",
  Artifact: "Artifact",
  ReturnRenameRefactorResults: "ReturnRenameRefactorResults",
  UpdateFrontendProjectState: "UpdateFrontendProjectState",
  UpdateSettings: "UpdateSettings",
} as const;

export type WebsocketMsgTypeForFrontend = ObjectValues<
  typeof WebsocketMsgTypeForFrontendEnum
>;

export const APIKeysSchema = z.record(z.string(), z.string());

export type APIKeys = z.infer<typeof APIKeysSchema>;

export const IDToUUIDForLLMSchema = z.record(IDSchema, z.string());

export type IDToUUIDForLLM = z.infer<typeof IDToUUIDForLLMSchema>;

export const UUIDToIDForLLMSchema = z.record(z.string(), IDSchema);

export type UUIDToIDForLLM = z.infer<typeof UUIDToIDForLLMSchema>;

export const JSONValueTypeSchema = z.union([
  z.record(z.string(), z.any()),
  z.array(z.any()),
  z.string(),
  z.int(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JSONValueType = z.infer<typeof JSONValueTypeSchema>;

export const CitationCharLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).default(null),
  end_char_index: z.int(),
  start_char_index: z.int(),
  type: z.literal("char_location"),
});

export type CitationCharLocation = z.infer<typeof CitationCharLocationSchema>;

export function createCitationCharLocation(
  options: Partial<CitationCharLocation> = {},
): CitationCharLocation {
  return CitationCharLocationSchema.parse(options);
}

export const CitationPageLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).default(null),
  end_page_number: z.int(),
  start_page_number: z.int(),
  type: z.literal("page_location"),
});

export type CitationPageLocation = z.infer<typeof CitationPageLocationSchema>;

export function createCitationPageLocation(
  options: Partial<CitationPageLocation> = {},
): CitationPageLocation {
  return CitationPageLocationSchema.parse(options);
}

export const CitationContentBlockLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).default(null),
  end_block_index: z.int(),
  start_block_index: z.int(),
  type: z.literal("content_block_location"),
});

export type CitationContentBlockLocation = z.infer<
  typeof CitationContentBlockLocationSchema
>;

export function createCitationContentBlockLocation(
  options: Partial<CitationContentBlockLocation> = {},
): CitationContentBlockLocation {
  return CitationContentBlockLocationSchema.parse(options);
}

export const CitationsWebSearchResultLocationSchema = z.object({
  cited_text: z.string(),
  encrypted_index: z.string(),
  title: z.union([z.string(), z.null()]).default(null),
  type: z.literal("web_search_result_location"),
  url: z.string(),
});

export type CitationsWebSearchResultLocation = z.infer<
  typeof CitationsWebSearchResultLocationSchema
>;

export function createCitationsWebSearchResultLocation(
  options: Partial<CitationsWebSearchResultLocation> = {},
): CitationsWebSearchResultLocation {
  return CitationsWebSearchResultLocationSchema.parse(options);
}

export const TextBlockSchema = z.object({
  citations: z
    .union([
      z.array(
        z.union([
          CitationCharLocationSchema,
          CitationPageLocationSchema,
          CitationContentBlockLocationSchema,
          CitationsWebSearchResultLocationSchema,
        ]),
      ),
      z.null(),
    ])
    .default(null),
  text: z.string(),
  type: z.literal("text"),
});

export type TextBlock = z.infer<typeof TextBlockSchema>;

export function createTextBlock(options: Partial<TextBlock> = {}): TextBlock {
  return TextBlockSchema.parse(options);
}

export const ToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.string(),
  type: z.literal("tool_use"),
});

export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

export function createToolUseBlock(
  options: Partial<ToolUseBlock> = {},
): ToolUseBlock {
  return ToolUseBlockSchema.parse(options);
}

export const ServerToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.literal("web_search"),
  type: z.literal("server_tool_use"),
});

export type ServerToolUseBlock = z.infer<typeof ServerToolUseBlockSchema>;

export function createServerToolUseBlock(
  options: Partial<ServerToolUseBlock> = {},
): ServerToolUseBlock {
  return ServerToolUseBlockSchema.parse(options);
}

export const WebSearchToolResultErrorSchema = z.object({
  error_code: z.literal([
    "invalid_tool_input",
    "unavailable",
    "max_uses_exceeded",
    "too_many_requests",
    "query_too_long",
  ]),
  type: z.literal("web_search_tool_result_error"),
});

export type WebSearchToolResultError = z.infer<
  typeof WebSearchToolResultErrorSchema
>;

export function createWebSearchToolResultError(
  options: Partial<WebSearchToolResultError> = {},
): WebSearchToolResultError {
  return WebSearchToolResultErrorSchema.parse(options);
}

export const WebSearchResultBlockSchema = z.object({
  encrypted_content: z.string(),
  page_age: z.union([z.string(), z.null()]).default(null),
  title: z.string(),
  type: z.literal("web_search_result"),
  url: z.string(),
});

export type WebSearchResultBlock = z.infer<typeof WebSearchResultBlockSchema>;

export function createWebSearchResultBlock(
  options: Partial<WebSearchResultBlock> = {},
): WebSearchResultBlock {
  return WebSearchResultBlockSchema.parse(options);
}

export const WebSearchToolResultBlockSchema = z.object({
  content: z.union([
    WebSearchToolResultErrorSchema,
    z.array(WebSearchResultBlockSchema),
  ]),
  tool_use_id: z.string(),
  type: z.literal("web_search_tool_result"),
});

export type WebSearchToolResultBlock = z.infer<
  typeof WebSearchToolResultBlockSchema
>;

export function createWebSearchToolResultBlock(
  options: Partial<WebSearchToolResultBlock> = {},
): WebSearchToolResultBlock {
  return WebSearchToolResultBlockSchema.parse(options);
}

export const ThinkingBlockSchema = z.object({
  signature: z.string(),
  thinking: z.string(),
  type: z.literal("thinking"),
});

export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

export function createThinkingBlock(
  options: Partial<ThinkingBlock> = {},
): ThinkingBlock {
  return ThinkingBlockSchema.parse(options);
}

export const RedactedThinkingBlockSchema = z.object({
  data: z.string(),
  type: z.literal("redacted_thinking"),
});

export type RedactedThinkingBlock = z.infer<typeof RedactedThinkingBlockSchema>;

export function createRedactedThinkingBlock(
  options: Partial<RedactedThinkingBlock> = {},
): RedactedThinkingBlock {
  return RedactedThinkingBlockSchema.parse(options);
}

export const ContentBlockSchema = z.union([
  TextBlockSchema,
  ToolUseBlockSchema,
  ServerToolUseBlockSchema,
  WebSearchToolResultBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

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

export const ToolResultSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.array(
    z.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema]),
  ),
  is_error: z.boolean(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export function createToolResult(
  options: Partial<ToolResult> = {},
): ToolResult {
  return ToolResultSchema.parse(options);
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(ChatRoleEnum),
  content: z.array(
    z.union([
      z.union([
        TextBlockSchema,
        ToolUseBlockSchema,
        ServerToolUseBlockSchema,
        WebSearchToolResultBlockSchema,
        ThinkingBlockSchema,
        RedactedThinkingBlockSchema,
      ]),
      ToolResultSchema,
    ]),
  ),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export function createChatMessage(
  options: Partial<ChatMessage> = {},
): ChatMessage {
  return ChatMessageSchema.parse(options);
}

export const FullMessageStopSchema = z.object({
  type: z.literal("full_message_stop"),
  messages: z.array(ChatMessageSchema),
  toolResults: z.record(z.string(), ToolResultSchema),
});

export type FullMessageStop = z.infer<typeof FullMessageStopSchema>;

export function createFullMessageStop(
  options: Partial<FullMessageStop> = {},
): FullMessageStop {
  return FullMessageStopSchema.parse(options);
}

export const ServerToolUsageSchema = z.object({
  web_search_requests: z.int(),
});

export type ServerToolUsage = z.infer<typeof ServerToolUsageSchema>;

export function createServerToolUsage(
  options: Partial<ServerToolUsage> = {},
): ServerToolUsage {
  return ServerToolUsageSchema.parse(options);
}

export const UsageSchema = z.object({
  cache_creation_input_tokens: z.union([z.int(), z.null()]).default(null),
  cache_read_input_tokens: z.union([z.int(), z.null()]).default(null),
  input_tokens: z.int(),
  output_tokens: z.int(),
  server_tool_use: z.union([ServerToolUsageSchema, z.null()]).default(null),
  service_tier: z
    .union([z.literal(["standard", "priority", "batch"]), z.null()])
    .default(null),
});

export type Usage = z.infer<typeof UsageSchema>;

export function createUsage(options: Partial<Usage> = {}): Usage {
  return UsageSchema.parse(options);
}

export const MessageSchema = z.object({
  id: z.string(),
  content: z.array(
    z.union([
      TextBlockSchema,
      ToolUseBlockSchema,
      ServerToolUseBlockSchema,
      WebSearchToolResultBlockSchema,
      ThinkingBlockSchema,
      RedactedThinkingBlockSchema,
    ]),
  ),
  model: z.union([
    z.literal([
      "claude-3-7-sonnet-latest",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-haiku-latest",
      "claude-3-5-haiku-20241022",
      "claude-sonnet-4-20250514",
      "claude-sonnet-4-0",
      "claude-4-sonnet-20250514",
      "claude-3-5-sonnet-latest",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-sonnet-20240620",
      "claude-opus-4-0",
      "claude-opus-4-20250514",
      "claude-4-opus-20250514",
      "claude-3-opus-latest",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
      "claude-2.1",
      "claude-2.0",
    ]),
    z.string(),
  ]),
  role: z.literal("assistant"),
  stop_reason: z
    .union([
      z.literal([
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use",
        "pause_turn",
        "refusal",
      ]),
      z.null(),
    ])
    .default(null),
  stop_sequence: z.union([z.string(), z.null()]).default(null),
  type: z.literal("message"),
  usage: UsageSchema,
});

export type Message = z.infer<typeof MessageSchema>;

export function createMessage(options: Partial<Message> = {}): Message {
  return MessageSchema.parse(options);
}

export const RawMessageStartEventSchema = z.object({
  message: MessageSchema,
  type: z.literal("message_start"),
});

export type RawMessageStartEvent = z.infer<typeof RawMessageStartEventSchema>;

export function createRawMessageStartEvent(
  options: Partial<RawMessageStartEvent> = {},
): RawMessageStartEvent {
  return RawMessageStartEventSchema.parse(options);
}

export const RawContentBlockStartEventSchema = z.object({
  content_block: z.union([
    TextBlockSchema,
    ToolUseBlockSchema,
    ServerToolUseBlockSchema,
    WebSearchToolResultBlockSchema,
    ThinkingBlockSchema,
    RedactedThinkingBlockSchema,
  ]),
  index: z.int(),
  type: z.literal("content_block_start"),
});

export type RawContentBlockStartEvent = z.infer<
  typeof RawContentBlockStartEventSchema
>;

export function createRawContentBlockStartEvent(
  options: Partial<RawContentBlockStartEvent> = {},
): RawContentBlockStartEvent {
  return RawContentBlockStartEventSchema.parse(options);
}

export const TextDeltaSchema = z.object({
  text: z.string(),
  type: z.literal("text_delta"),
});

export type TextDelta = z.infer<typeof TextDeltaSchema>;

export function createTextDelta(options: Partial<TextDelta> = {}): TextDelta {
  return TextDeltaSchema.parse(options);
}

export const InputJSONDeltaSchema = z.object({
  partial_json: z.string(),
  type: z.literal("input_json_delta"),
});

export type InputJSONDelta = z.infer<typeof InputJSONDeltaSchema>;

export function createInputJSONDelta(
  options: Partial<InputJSONDelta> = {},
): InputJSONDelta {
  return InputJSONDeltaSchema.parse(options);
}

export const CitationsDeltaSchema = z.object({
  citation: z.union([
    CitationCharLocationSchema,
    CitationPageLocationSchema,
    CitationContentBlockLocationSchema,
    CitationsWebSearchResultLocationSchema,
  ]),
  type: z.literal("citations_delta"),
});

export type CitationsDelta = z.infer<typeof CitationsDeltaSchema>;

export function createCitationsDelta(
  options: Partial<CitationsDelta> = {},
): CitationsDelta {
  return CitationsDeltaSchema.parse(options);
}

export const ThinkingDeltaSchema = z.object({
  thinking: z.string(),
  type: z.literal("thinking_delta"),
});

export type ThinkingDelta = z.infer<typeof ThinkingDeltaSchema>;

export function createThinkingDelta(
  options: Partial<ThinkingDelta> = {},
): ThinkingDelta {
  return ThinkingDeltaSchema.parse(options);
}

export const SignatureDeltaSchema = z.object({
  signature: z.string(),
  type: z.literal("signature_delta"),
});

export type SignatureDelta = z.infer<typeof SignatureDeltaSchema>;

export function createSignatureDelta(
  options: Partial<SignatureDelta> = {},
): SignatureDelta {
  return SignatureDeltaSchema.parse(options);
}

export const RawContentBlockDeltaEventSchema = z.object({
  delta: z.union([
    TextDeltaSchema,
    InputJSONDeltaSchema,
    CitationsDeltaSchema,
    ThinkingDeltaSchema,
    SignatureDeltaSchema,
  ]),
  index: z.int(),
  type: z.literal("content_block_delta"),
});

export type RawContentBlockDeltaEvent = z.infer<
  typeof RawContentBlockDeltaEventSchema
>;

export function createRawContentBlockDeltaEvent(
  options: Partial<RawContentBlockDeltaEvent> = {},
): RawContentBlockDeltaEvent {
  return RawContentBlockDeltaEventSchema.parse(options);
}

export const RawContentBlockStopEventSchema = z.object({
  index: z.int(),
  type: z.literal("content_block_stop"),
});

export type RawContentBlockStopEvent = z.infer<
  typeof RawContentBlockStopEventSchema
>;

export function createRawContentBlockStopEvent(
  options: Partial<RawContentBlockStopEvent> = {},
): RawContentBlockStopEvent {
  return RawContentBlockStopEventSchema.parse(options);
}

export const DeltaSchema = z.object({
  stop_reason: z
    .union([
      z.literal([
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use",
        "pause_turn",
        "refusal",
      ]),
      z.null(),
    ])
    .default(null),
  stop_sequence: z.union([z.string(), z.null()]).default(null),
});

export type Delta = z.infer<typeof DeltaSchema>;

export function createDelta(options: Partial<Delta> = {}): Delta {
  return DeltaSchema.parse(options);
}

export const MessageDeltaUsageSchema = z.object({
  cache_creation_input_tokens: z.union([z.int(), z.null()]).default(null),
  cache_read_input_tokens: z.union([z.int(), z.null()]).default(null),
  input_tokens: z.union([z.int(), z.null()]).default(null),
  output_tokens: z.int(),
  server_tool_use: z.union([ServerToolUsageSchema, z.null()]).default(null),
});

export type MessageDeltaUsage = z.infer<typeof MessageDeltaUsageSchema>;

export function createMessageDeltaUsage(
  options: Partial<MessageDeltaUsage> = {},
): MessageDeltaUsage {
  return MessageDeltaUsageSchema.parse(options);
}

export const RawMessageDeltaEventSchema = z.object({
  delta: DeltaSchema,
  type: z.literal("message_delta"),
  usage: MessageDeltaUsageSchema,
});

export type RawMessageDeltaEvent = z.infer<typeof RawMessageDeltaEventSchema>;

export function createRawMessageDeltaEvent(
  options: Partial<RawMessageDeltaEvent> = {},
): RawMessageDeltaEvent {
  return RawMessageDeltaEventSchema.parse(options);
}

export const RawMessageStopEventSchema = z.object({
  type: z.literal("message_stop"),
});

export type RawMessageStopEvent = z.infer<typeof RawMessageStopEventSchema>;

export function createRawMessageStopEvent(
  options: Partial<RawMessageStopEvent> = {},
): RawMessageStopEvent {
  return RawMessageStopEventSchema.parse(options);
}

export const LLMStreamingResponseChunkSchema = z.union([
  FullMessageStopSchema,
  ToolResultSchema,
  RawMessageStartEventSchema,
  RawContentBlockStartEventSchema,
  RawContentBlockDeltaEventSchema,
  RawContentBlockStopEventSchema,
  RawMessageDeltaEventSchema,
  RawMessageStopEventSchema,
]);

export type LLMStreamingResponseChunk = z.infer<
  typeof LLMStreamingResponseChunkSchema
>;

export const AllImplFieldsSchema = z.literal([
  "artifactGroupIds",
  "aspectRatio",
  "aspectRatioExtraHeight",
  "aspectRatioExtraWidth",
  "callable",
  "canvasSettings",
  "chartSettings",
  "children",
  "choices",
  "code",
  "codeLanguage",
  "codeObjImplLayeringMap",
  "columnWidth",
  "configLanguage",
  "coreNameEditable",
  "coreNameType",
  "defaultVal",
  "description",
  "displayMode",
  "format",
  "headingAsSectionName",
  "hideColumn",
  "hideParams",
  "hideUnpinnedParams",
  "id",
  "ignoreTypeErrors",
  "isFrozen",
  "isHorizontalOrientation",
  "isInOtherProjectConfigs",
  "isJsonSource",
  "isMinimized",
  "isPreset",
  "jsonSourceKeys",
  "jsonSourceMissing",
  "max",
  "min",
  "name",
  "paramFilter",
  "parentId",
  "passingStyle",
  "pinnedAreaHeight",
  "pinnedParams",
  "positionAndSizeLocked",
  "renderedValue",
  "selectedParams",
  "size",
  "social",
  "step",
  "text",
  "topLevelParamIds",
  "type",
  "value",
  "visibility",
]);

export type AllImplFields = z.infer<typeof AllImplFieldsSchema>;

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

export const ImageSectionImplSchema = z.object({
  type: z.literal("Image").default(SectionTypeEnum.Image),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  artifactGroupIds: z.array(z.string()).default([]),
});

export type ImageSectionImpl = z.infer<typeof ImageSectionImplSchema>;

export function createImageSectionImpl(
  defaults: UserDefaultImageSectionImpl,
  overrides: Partial<ImageSectionImpl> = {},
): ImageSectionImpl {
  return ImageSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const ChartSettingsSchema = z.object({
  type: z.string().default("line" as const),
  xAxisColumn: z.string().default("" as const),
  secondYAxisColumns: z.array(z.string()).default([]),
  xAxisLog: z.boolean().default(false),
  y1AxisLog: z.boolean().default(false),
  y2AxisLog: z.boolean().default(false),
});

export type ChartSettings = z.infer<typeof ChartSettingsSchema>;

export function createChartSettings(
  options: Partial<ChartSettings> = {},
): ChartSettings {
  return ChartSettingsSchema.parse(options);
}

export const ChartSectionImplSchema = z.object({
  type: z.literal("Chart").default(SectionTypeEnum.Chart),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  renderedValue: z.any().default(null),
  artifactGroupIds: z.array(z.string()).default([]),
  chartSettings: ChartSettingsSchema.default(createChartSettings),
});

export type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

export function createChartSectionImpl(
  defaults: UserDefaultChartSectionImpl,
  overrides: Partial<ChartSectionImpl> = {},
): ChartSectionImpl {
  return ChartSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const DrawAreaCanvasSettingsSchema = z.object({
  activeLayerId: z.union([z.string(), z.null()]).default(null),
  color: z.string().default("#ff0000" as const),
  brushSize: z.int().default(16),
  brushShape: z.string().default("butt" as const),
  eraserBrushSize: z.int().default(16),
  drawThrottleDelay: z.int().default(0),
  canvasTransferQueueLength: z.int().default(50),
  mode: z.string().default("draw" as const),
});

export type DrawAreaCanvasSettings = z.infer<
  typeof DrawAreaCanvasSettingsSchema
>;

export function createDrawAreaCanvasSettings(
  options: Partial<DrawAreaCanvasSettings> = {},
): DrawAreaCanvasSettings {
  return DrawAreaCanvasSettingsSchema.parse(options);
}

export const DrawSectionImplSchema = z.object({
  type: z.literal("Draw").default(SectionTypeEnum.Draw),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  renderedValue: z.any().default(null),
  artifactGroupIds: z.array(z.string()).default([]),
  canvasSettings: DrawAreaCanvasSettingsSchema.default(
    createDrawAreaCanvasSettings,
  ),
});

export type DrawSectionImpl = z.infer<typeof DrawSectionImplSchema>;

export function createDrawSectionImpl(
  defaults: UserDefaultDrawSectionImpl,
  overrides: Partial<DrawSectionImpl> = {},
): DrawSectionImpl {
  return DrawSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const BaseArtifactSectionImplUnionSchema = z.union([
  ImageSectionImplSchema,
  ChartSectionImplSchema,
  DrawSectionImplSchema,
]);

export type BaseArtifactSectionImplUnion = z.infer<
  typeof BaseArtifactSectionImplUnionSchema
>;

export const BaseCanvasSectionImplUnionSchema = z.union([
  ChartSectionImplSchema,
  DrawSectionImplSchema,
]);

export type BaseCanvasSectionImplUnion = z.infer<
  typeof BaseCanvasSectionImplUnionSchema
>;

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
  choices: z.array(ColorPickerChoiceSchema).default([]),
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

export const CodeSectionImplSchema = z.object({
  type: z.literal("Code").default(SectionTypeEnum.Code),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  code: z.string().default("" as const),
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

export const BaseCodeSectionImplUnionSchema = z.union([
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
]);

export type BaseCodeSectionImplUnion = z.infer<
  typeof BaseCodeSectionImplUnionSchema
>;

export const DictSectionImplSchema = z.object({
  type: z.literal("Dict").default(SectionTypeEnum.Dict),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
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
  topLevelParamIds: z.array(z.string()).default([]),
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

export const GlobalVariablesSectionImplSchema = z.object({
  type: z.literal("GlobalVariables").default(SectionTypeEnum.GlobalVariables),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
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
  topLevelParamIds: z.array(z.string()).default([]),
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

export const ListRootSectionImplSchema = z.object({
  type: z.literal("ListRoot").default(SectionTypeEnum.ListRoot),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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

export const BaseParentSectionImplUnionSchema = z.union([
  ListRootSectionImplSchema,
  DictRootSectionImplSchema,
  GroupSectionImplSchema,
]);

export type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

export const CallableSectionImplSchema = z.object({
  type: z.literal("Callable").default(SectionTypeEnum.Callable),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
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

export const TextBlockSectionImplSchema = z.object({
  type: z.literal("TextBlock").default(SectionTypeEnum.TextBlock),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  displayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.render),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  social: z.string().default("" as const),
});

export type SocialSectionImpl = z.infer<typeof SocialSectionImplSchema>;

export function createSocialSectionImpl(
  defaults: UserDefaultSocialSectionImpl,
  overrides: Partial<SocialSectionImpl> = {},
): SocialSectionImpl {
  return SocialSectionImplSchema.parse({ ...defaults, ...overrides });
}

export const TerminalSectionImplSchema = z.object({
  type: z.literal("Terminal").default(SectionTypeEnum.Terminal),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  hideColumn: z.boolean().default(false),
});

export type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

export function createBrowserSectionImpl(
  defaults: UserDefaultBrowserSectionImpl,
  overrides: Partial<BrowserSectionImpl> = {},
): BrowserSectionImpl {
  return BrowserSectionImplSchema.parse({ ...defaults, ...overrides });
}

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

export const BaseArtifactSectionImplUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ImageSectionImplSchema,
    ChartSectionImplSchema,
    DrawSectionImplSchema,
  ]);

export type BaseArtifactSectionImplUnionWithDiscriminator = z.infer<
  typeof BaseArtifactSectionImplUnionWithDiscriminatorSchema
>;

export function createBaseArtifactSectionImplUnionWithDiscriminator(
  options: Partial<BaseArtifactSectionImplUnionWithDiscriminator> = {},
): BaseArtifactSectionImplUnionWithDiscriminator {
  return BaseArtifactSectionImplUnionWithDiscriminatorSchema.parse(options);
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

export const BackendWebsocketMsgUnionWithDiscriminatorSchema =
  WebsocketMsgCurrentAddressUpdateSchema;

export type BackendWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof BackendWebsocketMsgUnionWithDiscriminatorSchema
>;

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

export const ArtifactSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(ArtifactTypeEnum),
  value: z
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
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export function createArtifact(options: Partial<Artifact> = {}): Artifact {
  return ArtifactSchema.parse(options);
}

export const WebsocketMsgArtifactSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ArtifactSchema,
  messageType: z
    .literal("Artifact")
    .default(WebsocketMsgTypeForFrontendEnum.Artifact),
});

export type WebsocketMsgArtifact = z.infer<typeof WebsocketMsgArtifactSchema>;

export function createWebsocketMsgArtifact(
  options: Partial<WebsocketMsgArtifact> = {},
): WebsocketMsgArtifact {
  return WebsocketMsgArtifactSchema.parse(options);
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
  temporary: z.boolean().default(false),
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
  assistantMessageId: z.union([z.string(), z.null()]),
  chunk: z.union([
    FullMessageStopSchema,
    ToolResultSchema,
    RawMessageStartEventSchema,
    RawContentBlockStartEventSchema,
    RawContentBlockDeltaEventSchema,
    RawContentBlockStopEventSchema,
    RawMessageDeltaEventSchema,
    RawMessageStopEventSchema,
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

export const WebsocketMsgReturnRenameRefactorResultsSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
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

export const CoreSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  implLayerings: z.array(z.string()).default([]),
  defaultImplLayering: z.union([z.string(), z.null()]).default(null),
  sharedModifier: z.record(z.string(), z.any()).default({}),
  unsharedKeys: z
    .array(
      z.literal([
        "artifactGroupIds",
        "aspectRatio",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
        "callable",
        "canvasSettings",
        "chartSettings",
        "children",
        "choices",
        "code",
        "codeLanguage",
        "codeObjImplLayeringMap",
        "columnWidth",
        "configLanguage",
        "coreNameEditable",
        "coreNameType",
        "defaultVal",
        "description",
        "displayMode",
        "format",
        "headingAsSectionName",
        "hideColumn",
        "hideParams",
        "hideUnpinnedParams",
        "id",
        "ignoreTypeErrors",
        "isFrozen",
        "isHorizontalOrientation",
        "isInOtherProjectConfigs",
        "isJsonSource",
        "isMinimized",
        "isPreset",
        "jsonSourceKeys",
        "jsonSourceMissing",
        "max",
        "min",
        "name",
        "paramFilter",
        "parentId",
        "passingStyle",
        "pinnedAreaHeight",
        "pinnedParams",
        "positionAndSizeLocked",
        "renderedValue",
        "selectedParams",
        "size",
        "social",
        "step",
        "text",
        "topLevelParamIds",
        "type",
        "value",
        "visibility",
      ]),
    )
    .default(() => [
      "callable" as const,
      "codeObjImplLayeringMap" as const,
      "topLevelParamIds" as const,
      "value" as const,
    ]),
});

export type Core = z.infer<typeof CoreSchema>;

export function createCore(options: Partial<Core> = {}): Core {
  return CoreSchema.parse(options);
}

export const LayeringSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: z.string(),
  nonPresetImpls: z.array(z.string()),
  modifier: z.record(z.string(), z.any()).default({}),
});

export type Layering = z.infer<typeof LayeringSchema>;

export function createLayering(options: Partial<Layering> = {}): Layering {
  return LayeringSchema.parse(options);
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
  sectionImplLayeringMap: z.record(z.string(), z.string()).default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return ProjectConfigSchema.parse(options);
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
  sectionImplLayerings: z.record(z.string(), LayeringSchema).default({}),
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
  codeObjImplLayerings: z.record(z.string(), LayeringSchema).default({}),
  projectConfig: ProjectConfigSchema,
  modCount: z.int().default(0),
});

export type ProjectStateSingleConfig = z.infer<
  typeof ProjectStateSingleConfigSchema
>;

export function createProjectStateSingleConfig(
  options: Partial<ProjectStateSingleConfig> = {},
): ProjectStateSingleConfig {
  return ProjectStateSingleConfigSchema.parse(options);
}

export const WebsocketMsgUpdateFrontendProjectStateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: ProjectStateSingleConfigSchema,
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

export const FileWatcherCoreUpdateSchema = z.object({
  absPath: z.string(),
  relPath: z.string(),
  eventType: z.enum(FileEventTypeEnum),
  matchingGlobPatterns: z.array(z.string()),
  destAbsPath: z.union([z.string(), z.null()]).default(null),
  destRelPath: z.union([z.string(), z.null()]).default(null),
});

export type FileWatcherCoreUpdate = z.infer<typeof FileWatcherCoreUpdateSchema>;

export function createFileWatcherCoreUpdate(
  options: Partial<FileWatcherCoreUpdate> = {},
): FileWatcherCoreUpdate {
  return FileWatcherCoreUpdateSchema.parse(options);
}

export const FileWatcherUpdateSchema = z.object({
  fileWatchGroupName: z.any(),
  coreUpdate: FileWatcherCoreUpdateSchema,
  fileContent: z.any(),
});

export type FileWatcherUpdate = z.infer<typeof FileWatcherUpdateSchema>;

export function createFileWatcherUpdate(
  options: Partial<FileWatcherUpdate> = {},
): FileWatcherUpdate {
  return FileWatcherUpdateSchema.parse(options);
}

export const WebsocketMsgSpecificFileWatcherUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: FileWatcherUpdateSchema,
  messageType: z
    .literal("SpecificFileWatcherUpdate")
    .default(WebsocketMsgTypeForFrontendEnum.SpecificFileWatcherUpdate),
});

export type WebsocketMsgSpecificFileWatcherUpdate = z.infer<
  typeof WebsocketMsgSpecificFileWatcherUpdateSchema
>;

export function createWebsocketMsgSpecificFileWatcherUpdate(
  options: Partial<WebsocketMsgSpecificFileWatcherUpdate> = {},
): WebsocketMsgSpecificFileWatcherUpdate {
  return WebsocketMsgSpecificFileWatcherUpdateSchema.parse(options);
}

export const WebsocketMsgAllDependenciesSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z
    .literal("AllDependencies")
    .default(WebsocketMsgTypeForFrontendEnum.AllDependencies),
});

export type WebsocketMsgAllDependencies = z.infer<
  typeof WebsocketMsgAllDependenciesSchema
>;

export function createWebsocketMsgAllDependencies(
  options: Partial<WebsocketMsgAllDependencies> = {},
): WebsocketMsgAllDependencies {
  return WebsocketMsgAllDependenciesSchema.parse(options);
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
  sendProjectToAllInteractiveCode: z.string().default("Alt + I" as const),
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
  exportDbRawOnSave: z.boolean().default(false),
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
  hideColumn: z.boolean().default(false),
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
  chartSettings: ChartSettingsSchema.default(createChartSettings),
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
  canvasSettings: DrawAreaCanvasSettingsSchema.default(
    createDrawAreaCanvasSettings,
  ),
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
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
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
  social: z.string().default("" as const),
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
  displayMode: z
    .enum(TextBlockDisplayModeEnum)
    .default(TextBlockDisplayModeEnum.render),
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
  choices: z.array(ColorPickerChoiceSchema).default([]),
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

export const FrontendWebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgArtifactSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgUUIDMappingForLLMSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgSpecificFileWatcherUpdateSchema,
  WebsocketMsgAllDependenciesSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
]);

export type FrontendWebsocketMsgUnion = z.infer<
  typeof FrontendWebsocketMsgUnionSchema
>;

export const FrontendWebsocketMsgUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgArtifactSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgUUIDMappingForLLMSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgSpecificFileWatcherUpdateSchema,
    WebsocketMsgAllDependenciesSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
  ]);

export type FrontendWebsocketMsgUnionWithDiscriminator = z.infer<
  typeof FrontendWebsocketMsgUnionWithDiscriminatorSchema
>;

export function createFrontendWebsocketMsgUnionWithDiscriminator(
  options: Partial<FrontendWebsocketMsgUnionWithDiscriminator> = {},
): FrontendWebsocketMsgUnionWithDiscriminator {
  return FrontendWebsocketMsgUnionWithDiscriminatorSchema.parse(options);
}

export const WebsocketMsgUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgArtifactSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgUUIDMappingForLLMSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgSpecificFileWatcherUpdateSchema,
  WebsocketMsgAllDependenciesSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateSettingsSchema,
  WebsocketMsgCurrentAddressUpdateSchema,
]);

export type WebsocketMsgUnion = z.infer<typeof WebsocketMsgUnionSchema>;

export const WebsocketMsgUnionWithDiscriminatorSchema = z.discriminatedUnion(
  "messageType",
  [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgArtifactSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgUUIDMappingForLLMSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgSpecificFileWatcherUpdateSchema,
    WebsocketMsgAllDependenciesSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgUpdateSettingsSchema,
    WebsocketMsgCurrentAddressUpdateSchema,
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

export const FileWatcherUpdateJSONSourceSchema = z.object({
  fileWatchGroupName: z
    .literal("jsonSource")
    .default(FileWatchGroupNameEnum.jsonSource),
  coreUpdate: FileWatcherCoreUpdateSchema,
  fileContent: z.null().default(null),
});

export type FileWatcherUpdateJSONSource = z.infer<
  typeof FileWatcherUpdateJSONSourceSchema
>;

export function createFileWatcherUpdateJSONSource(
  options: Partial<FileWatcherUpdateJSONSource> = {},
): FileWatcherUpdateJSONSource {
  return FileWatcherUpdateJSONSourceSchema.parse(options);
}

export const FileWatcherUpdateAPIKeysSchema = z.object({
  fileWatchGroupName: z
    .literal("apiKeys")
    .default(FileWatchGroupNameEnum.apiKeys),
  coreUpdate: FileWatcherCoreUpdateSchema,
  fileContent: z.record(z.string(), z.string()),
});

export type FileWatcherUpdateAPIKeys = z.infer<
  typeof FileWatcherUpdateAPIKeysSchema
>;

export function createFileWatcherUpdateAPIKeys(
  options: Partial<FileWatcherUpdateAPIKeys> = {},
): FileWatcherUpdateAPIKeys {
  return FileWatcherUpdateAPIKeysSchema.parse(options);
}

export const FileWatcherUpdateGenPythonCodeSchema = z.object({
  fileWatchGroupName: z
    .literal("genPythonCode")
    .default(FileWatchGroupNameEnum.genPythonCode),
  coreUpdate: FileWatcherCoreUpdateSchema,
  fileContent: z.string(),
});

export type FileWatcherUpdateGenPythonCode = z.infer<
  typeof FileWatcherUpdateGenPythonCodeSchema
>;

export function createFileWatcherUpdateGenPythonCode(
  options: Partial<FileWatcherUpdateGenPythonCode> = {},
): FileWatcherUpdateGenPythonCode {
  return FileWatcherUpdateGenPythonCodeSchema.parse(options);
}

export const FileWatcherUpdateUnionSchema = z.union([
  FileWatcherUpdateJSONSourceSchema,
  FileWatcherUpdateAPIKeysSchema,
  FileWatcherUpdateGenPythonCodeSchema,
]);

export type FileWatcherUpdateUnion = z.infer<
  typeof FileWatcherUpdateUnionSchema
>;

export const FileWatcherUpdateUnionWithDiscriminatorSchema =
  z.discriminatedUnion("fileWatchGroupName", [
    FileWatcherUpdateJSONSourceSchema,
    FileWatcherUpdateAPIKeysSchema,
    FileWatcherUpdateGenPythonCodeSchema,
  ]);

export type FileWatcherUpdateUnionWithDiscriminator = z.infer<
  typeof FileWatcherUpdateUnionWithDiscriminatorSchema
>;

export function createFileWatcherUpdateUnionWithDiscriminator(
  options: Partial<FileWatcherUpdateUnionWithDiscriminator> = {},
): FileWatcherUpdateUnionWithDiscriminator {
  return FileWatcherUpdateUnionWithDiscriminatorSchema.parse(options);
}

export const BaseArtifactSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  artifactGroupIds: z.array(z.string()).optional(),
});

export type BaseArtifactSectionImplArgs = z.infer<
  typeof BaseArtifactSectionImplArgsSchema
>;

export function createBaseArtifactSectionImplArgs(
  options: Partial<BaseArtifactSectionImplArgs> = {},
): BaseArtifactSectionImplArgs {
  return BaseArtifactSectionImplArgsSchema.parse(options);
}

export const BaseArtifactSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.any(), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  artifactGroupIds: z.union([z.array(z.string()), z.any()]).optional(),
});

export type BaseArtifactSectionImplArgsWithCallable = z.infer<
  typeof BaseArtifactSectionImplArgsWithCallableSchema
>;

export function createBaseArtifactSectionImplArgsWithCallable(
  options: Partial<BaseArtifactSectionImplArgsWithCallable> = {},
): BaseArtifactSectionImplArgsWithCallable {
  return BaseArtifactSectionImplArgsWithCallableSchema.parse(options);
}

export const BaseCanvasSectionImplArgsSchema = z.object({
  type: z.any().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  renderedValue: z.any().optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  renderedValue: z.union([z.any(), z.any()]).optional(),
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
  parentId: z.union([z.string(), z.null()]).optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  topLevelParamIds: z.array(z.string()).optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  codeObjImplLayeringMap: z
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
  topLevelParamIds: z.union([z.array(z.string()), z.any()]).optional(),
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
  parentId: z.union([z.string(), z.null()]).optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  parentId: z.union([z.string(), z.null()]).optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
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
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  codeObjImplLayeringMap: z
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
});

export type BaseSectionWithParamsImplArgsWithCallable = z.infer<
  typeof BaseSectionWithParamsImplArgsWithCallableSchema
>;

export function createBaseSectionWithParamsImplArgsWithCallable(
  options: Partial<BaseSectionWithParamsImplArgsWithCallable> = {},
): BaseSectionWithParamsImplArgsWithCallable {
  return BaseSectionWithParamsImplArgsWithCallableSchema.parse(options);
}

export const BrowserSectionImplArgsSchema = z.object({
  type: z.literal("Browser").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  hideColumn: z.boolean().optional(),
});

export type BrowserSectionImplArgs = z.infer<
  typeof BrowserSectionImplArgsSchema
>;

export function createBrowserSectionImplArgs(
  options: Partial<BrowserSectionImplArgs> = {},
): BrowserSectionImplArgs {
  return BrowserSectionImplArgsSchema.parse(options);
}

export const BrowserSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Browser"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  hideColumn: z.union([z.boolean(), z.any()]).optional(),
});

export type BrowserSectionImplArgsWithCallable = z.infer<
  typeof BrowserSectionImplArgsWithCallableSchema
>;

export function createBrowserSectionImplArgsWithCallable(
  options: Partial<BrowserSectionImplArgsWithCallable> = {},
): BrowserSectionImplArgsWithCallable {
  return BrowserSectionImplArgsWithCallableSchema.parse(options);
}

export const CallableSectionImplArgsSchema = z.object({
  type: z.literal("Callable").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
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

export const CallableSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Callable"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  codeObjImplLayeringMap: z
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

export const ChartSectionImplArgsSchema = z.object({
  type: z.literal("Chart").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  artifactGroupIds: z.array(z.string()).optional(),
  renderedValue: z.any().optional(),
  chartSettings: ChartSettingsSchema.optional(),
});

export type ChartSectionImplArgs = z.infer<typeof ChartSectionImplArgsSchema>;

export function createChartSectionImplArgs(
  options: Partial<ChartSectionImplArgs> = {},
): ChartSectionImplArgs {
  return ChartSectionImplArgsSchema.parse(options);
}

export const ChartSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chart"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  artifactGroupIds: z.union([z.array(z.string()), z.any()]).optional(),
  renderedValue: z.union([z.any(), z.any()]).optional(),
  chartSettings: z.union([ChartSettingsSchema, z.any()]).optional(),
});

export type ChartSectionImplArgsWithCallable = z.infer<
  typeof ChartSectionImplArgsWithCallableSchema
>;

export function createChartSectionImplArgsWithCallable(
  options: Partial<ChartSectionImplArgsWithCallable> = {},
): ChartSectionImplArgsWithCallable {
  return ChartSectionImplArgsWithCallableSchema.parse(options);
}

export const ChatSectionImplArgsSchema = z.object({
  type: z.literal("Chat").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const ChatSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Chat"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const CodeSectionImplArgsSchema = z.object({
  type: z.literal("Code").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeLanguage: z.enum(CodeLanguageEnum).optional(),
});

export type CodeSectionImplArgs = z.infer<typeof CodeSectionImplArgsSchema>;

export function createCodeSectionImplArgs(
  options: Partial<CodeSectionImplArgs> = {},
): CodeSectionImplArgs {
  return CodeSectionImplArgsSchema.parse(options);
}

export const CodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Code"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  choices: z.array(ColorPickerChoiceSchema).optional(),
});

export type ColorPickerParamCodeObjImplArgs = z.infer<
  typeof ColorPickerParamCodeObjImplArgsSchema
>;

export function createColorPickerParamCodeObjImplArgs(
  options: Partial<ColorPickerParamCodeObjImplArgs> = {},
): ColorPickerParamCodeObjImplArgs {
  return ColorPickerParamCodeObjImplArgsSchema.parse(options);
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
  choices: z.union([z.array(ColorPickerChoiceSchema), z.any()]).optional(),
});

export type ColorPickerParamCodeObjImplArgsWithCallable = z.infer<
  typeof ColorPickerParamCodeObjImplArgsWithCallableSchema
>;

export function createColorPickerParamCodeObjImplArgsWithCallable(
  options: Partial<ColorPickerParamCodeObjImplArgsWithCallable> = {},
): ColorPickerParamCodeObjImplArgsWithCallable {
  return ColorPickerParamCodeObjImplArgsWithCallableSchema.parse(options);
}

export const DictRootSectionImplArgsSchema = z.object({
  type: z.literal("DictRoot").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const DictRootSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("DictRoot"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const DictSectionImplArgsSchema = z.object({
  type: z.literal("Dict").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  topLevelParamIds: z.array(z.string()).optional(),
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

export const DictSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Dict"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  codeObjImplLayeringMap: z
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
  topLevelParamIds: z.union([z.array(z.string()), z.any()]).optional(),
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

export const DrawSectionImplArgsSchema = z.object({
  type: z.literal("Draw").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  artifactGroupIds: z.array(z.string()).optional(),
  renderedValue: z.any().optional(),
  canvasSettings: DrawAreaCanvasSettingsSchema.optional(),
});

export type DrawSectionImplArgs = z.infer<typeof DrawSectionImplArgsSchema>;

export function createDrawSectionImplArgs(
  options: Partial<DrawSectionImplArgs> = {},
): DrawSectionImplArgs {
  return DrawSectionImplArgsSchema.parse(options);
}

export const DrawSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Draw"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  artifactGroupIds: z.union([z.array(z.string()), z.any()]).optional(),
  renderedValue: z.union([z.any(), z.any()]).optional(),
  canvasSettings: z.union([DrawAreaCanvasSettingsSchema, z.any()]).optional(),
});

export type DrawSectionImplArgsWithCallable = z.infer<
  typeof DrawSectionImplArgsWithCallableSchema
>;

export function createDrawSectionImplArgsWithCallable(
  options: Partial<DrawSectionImplArgsWithCallable> = {},
): DrawSectionImplArgsWithCallable {
  return DrawSectionImplArgsWithCallableSchema.parse(options);
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

export const GenPythonCodeSectionImplArgsSchema = z.object({
  type: z.literal("GenPythonCode").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
});

export type GenPythonCodeSectionImplArgs = z.infer<
  typeof GenPythonCodeSectionImplArgsSchema
>;

export function createGenPythonCodeSectionImplArgs(
  options: Partial<GenPythonCodeSectionImplArgs> = {},
): GenPythonCodeSectionImplArgs {
  return GenPythonCodeSectionImplArgsSchema.parse(options);
}

export const GenPythonCodeSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GenPythonCode"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
});

export type GenPythonCodeSectionImplArgsWithCallable = z.infer<
  typeof GenPythonCodeSectionImplArgsWithCallableSchema
>;

export function createGenPythonCodeSectionImplArgsWithCallable(
  options: Partial<GenPythonCodeSectionImplArgsWithCallable> = {},
): GenPythonCodeSectionImplArgsWithCallable {
  return GenPythonCodeSectionImplArgsWithCallableSchema.parse(options);
}

export const GlobalVariablesSectionImplArgsSchema = z.object({
  type: z.literal("GlobalVariables").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).optional(),
  hideUnpinnedParams: z.boolean().optional(),
  paramFilter: z.string().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  configLanguage: z.enum(ConfigLanguageEnum).optional(),
  pinnedParams: z.array(z.string()).optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  selectedParams: z.array(z.string()).optional(),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).optional(),
  topLevelParamIds: z.array(z.string()).optional(),
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

export const GlobalVariablesSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("GlobalVariables"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  codeObjImplLayeringMap: z
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
  topLevelParamIds: z.union([z.array(z.string()), z.any()]).optional(),
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

export const GroupSectionImplArgsSchema = z.object({
  type: z.literal("Group").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const GroupSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Group"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const IFrameSectionImplArgsSchema = z.object({
  type: z.literal("IFrame").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const IFrameSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("IFrame"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const ImageSectionImplArgsSchema = z.object({
  type: z.literal("Image").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  artifactGroupIds: z.array(z.string()).optional(),
});

export type ImageSectionImplArgs = z.infer<typeof ImageSectionImplArgsSchema>;

export function createImageSectionImplArgs(
  options: Partial<ImageSectionImplArgs> = {},
): ImageSectionImplArgs {
  return ImageSectionImplArgsSchema.parse(options);
}

export const ImageSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Image"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  artifactGroupIds: z.union([z.array(z.string()), z.any()]).optional(),
});

export type ImageSectionImplArgsWithCallable = z.infer<
  typeof ImageSectionImplArgsWithCallableSchema
>;

export function createImageSectionImplArgsWithCallable(
  options: Partial<ImageSectionImplArgsWithCallable> = {},
): ImageSectionImplArgsWithCallable {
  return ImageSectionImplArgsWithCallableSchema.parse(options);
}

export const ListRootSectionImplArgsSchema = z.object({
  type: z.literal("ListRoot").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const ListRootSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("ListRoot"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const SocialSectionImplArgsSchema = z.object({
  type: z.literal("Social").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  social: z.string().optional(),
});

export type SocialSectionImplArgs = z.infer<typeof SocialSectionImplArgsSchema>;

export function createSocialSectionImplArgs(
  options: Partial<SocialSectionImplArgs> = {},
): SocialSectionImplArgs {
  return SocialSectionImplArgsSchema.parse(options);
}

export const SocialSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Social"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  social: z.union([z.string(), z.any()]).optional(),
});

export type SocialSectionImplArgsWithCallable = z.infer<
  typeof SocialSectionImplArgsWithCallableSchema
>;

export function createSocialSectionImplArgsWithCallable(
  options: Partial<SocialSectionImplArgsWithCallable> = {},
): SocialSectionImplArgsWithCallable {
  return SocialSectionImplArgsWithCallableSchema.parse(options);
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

export const TerminalSectionImplArgsSchema = z.object({
  type: z.literal("Terminal").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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

export const TerminalSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("Terminal"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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

export const TextBlockSectionImplArgsSchema = z.object({
  type: z.literal("TextBlock").optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
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
  displayMode: z.enum(TextBlockDisplayModeEnum).optional(),
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

export const TextBlockSectionImplArgsWithCallableSchema = z.object({
  type: z.union([z.literal("TextBlock"), z.any()]).optional(),
  id: z.union([z.string(), z.any()]).optional(),
  name: z.union([z.string(), z.any()]).optional(),
  parentId: z.union([z.string(), z.null(), z.any()]).optional(),
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
  displayMode: z.union([z.enum(TextBlockDisplayModeEnum), z.any()]).optional(),
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

export const ArtifactWithIdSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(ArtifactTypeEnum),
  value: z
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
  id: z.union([z.string(), z.null()]),
});

export type ArtifactWithId = z.infer<typeof ArtifactWithIdSchema>;

export function createArtifactWithId(
  options: Partial<ArtifactWithId> = {},
): ArtifactWithId {
  return ArtifactWithIdSchema.parse(options);
}

export const ArtifactWithoutValueSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(ArtifactTypeEnum),
});

export type ArtifactWithoutValue = z.infer<typeof ArtifactWithoutValueSchema>;

export function createArtifactWithoutValue(
  options: Partial<ArtifactWithoutValue> = {},
): ArtifactWithoutValue {
  return ArtifactWithoutValueSchema.parse(options);
}

export const ChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  messages: z.array(ChatMessageSchema),
});

export type Chat = z.infer<typeof ChatSchema>;

export function createChat(options: Partial<Chat> = {}): Chat {
  return ChatSchema.parse(options);
}

export const ChatMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

export function createChatMetadata(
  options: Partial<ChatMetadata> = {},
): ChatMetadata {
  return ChatMetadataSchema.parse(options);
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
  parentId: z.union([z.string(), z.null()]).default(null),
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

export const UserDefaultBaseArtifactSectionImplSchema = z.object({
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type UserDefaultBaseArtifactSectionImpl = z.infer<
  typeof UserDefaultBaseArtifactSectionImplSchema
>;

export function createUserDefaultBaseArtifactSectionImpl(
  options: Partial<UserDefaultBaseArtifactSectionImpl> = {},
): UserDefaultBaseArtifactSectionImpl {
  return UserDefaultBaseArtifactSectionImplSchema.parse(options);
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
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.union([z.boolean(), z.number()]).default(false),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default("" as const),
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
});

export type UserDefaultBaseSectionWithParamsImpl = z.infer<
  typeof UserDefaultBaseSectionWithParamsImplSchema
>;

export function createUserDefaultBaseSectionWithParamsImpl(
  options: Partial<UserDefaultBaseSectionWithParamsImpl> = {},
): UserDefaultBaseSectionWithParamsImpl {
  return UserDefaultBaseSectionWithParamsImplSchema.parse(options);
}

export const BaseParentSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
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
});

export type BaseSectionWithParamsImpl = z.infer<
  typeof BaseSectionWithParamsImplSchema
>;

export function createBaseSectionWithParamsImpl(
  options: Partial<BaseSectionWithParamsImpl> = {},
): BaseSectionWithParamsImpl {
  return BaseSectionWithParamsImplSchema.parse(options);
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
  sectionImplLayerings: z.record(z.string(), LayeringSchema).default({}),
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
  codeObjImplLayerings: z.record(z.string(), LayeringSchema).default({}),
  projectConfigs: z.record(z.string(), ProjectConfigSchema).default({}),
  defaultProjectConfigId: z.union([z.string(), z.null()]).default(null),
  modCount: z.int().default(0),
});

export type ProjectStateBackend = z.infer<typeof ProjectStateBackendSchema>;

export function createProjectStateBackend(
  options: Partial<ProjectStateBackend> = {},
): ProjectStateBackend {
  return ProjectStateBackendSchema.parse(options);
}

export const ProjectMetadataSchema = z.object({
  defaultProjectConfigId: z.union([z.string(), z.null()]),
  projectMetadata: z.array(ProjectConfigSchema),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export function createProjectMetadata(
  options: Partial<ProjectMetadata> = {},
): ProjectMetadata {
  return ProjectMetadataSchema.parse(options);
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
  sectionImplLayerings: z.record(z.string(), LayeringSchema).default({}),
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
  codeObjImplLayerings: z.record(z.string(), LayeringSchema).default({}),
});

export type ProjectStateCore = z.infer<typeof ProjectStateCoreSchema>;

export function createProjectStateCore(
  options: Partial<ProjectStateCore> = {},
): ProjectStateCore {
  return ProjectStateCoreSchema.parse(options);
}

export const BaseArtifactSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  artifactGroupIds: z.array(z.string()).default([]),
});

export type BaseArtifactSectionImpl = z.infer<
  typeof BaseArtifactSectionImplSchema
>;

export function createBaseArtifactSectionImpl(
  options: Partial<BaseArtifactSectionImpl> = {},
): BaseArtifactSectionImpl {
  return BaseArtifactSectionImplSchema.parse(options);
}

export const BaseCanvasSectionImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
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
  renderedValue: z.any().default(null),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  code: z.string().default("" as const),
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
  parentId: z.union([z.string(), z.null()]).default(null),
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
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
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
  topLevelParamIds: z.array(z.string()).default([]),
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

export const SimplifiedCodeInfoSchema = z.object({
  name: z.string(),
  defaultVal: z.string().default("" as const),
  description: z.string().default("" as const),
});

export type SimplifiedCodeInfo = z.infer<typeof SimplifiedCodeInfoSchema>;

export function createSimplifiedCodeInfo(
  options: Partial<SimplifiedCodeInfo> = {},
): SimplifiedCodeInfo {
  return SimplifiedCodeInfoSchema.parse(options);
}

export const SimplifiedSectionSchema = z.object({
  name: z.string(),
});

export type SimplifiedSection = z.infer<typeof SimplifiedSectionSchema>;

export function createSimplifiedSection(
  options: Partial<SimplifiedSection> = {},
): SimplifiedSection {
  return SimplifiedSectionSchema.parse(options);
}

export const SimplifiedSectionCreationSchema = z.object({
  name: z.string(),
  position: PositionSchema.default(createPosition),
  size: SectionSizeSchema.default(createSectionSize),
  type: z.enum(SectionTypeEnum).default(SectionTypeEnum.Callable),
});

export type SimplifiedSectionCreation = z.infer<
  typeof SimplifiedSectionCreationSchema
>;

export function createSimplifiedSectionCreation(
  options: Partial<SimplifiedSectionCreation> = {},
): SimplifiedSectionCreation {
  return SimplifiedSectionCreationSchema.parse(options);
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

export const GetLLMApiKeysRequestSchema = z.object({
  apiKeysFilepath: z.string(),
});

export type GetLLMApiKeysRequest = z.infer<typeof GetLLMApiKeysRequestSchema>;

export function createGetLLMApiKeysRequest(
  options: Partial<GetLLMApiKeysRequest> = {},
): GetLLMApiKeysRequest {
  return GetLLMApiKeysRequestSchema.parse(options);
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
  messages: z.array(ChatMessageSchema),
  toolResults: z.record(z.string(), ToolResultSchema),
  waitingForResponse: z.boolean(),
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
  projectConfigId: z.string(),
  chatId: z.union([z.string(), z.null()]),
  message: ChatMessageSchema,
  model: z.string(),
  deepThink: z.boolean(),
});

export type GetLLMResponseRequest = z.infer<typeof GetLLMResponseRequestSchema>;

export function createGetLLMResponseRequest(
  options: Partial<GetLLMResponseRequest> = {},
): GetLLMResponseRequest {
  return GetLLMResponseRequestSchema.parse(options);
}

export const SetLLMApiKeysRequestSchema = z.object({
  apiKeys: z.record(z.string(), z.string()),
  apiKeysFilepath: z.string(),
});

export type SetLLMApiKeysRequest = z.infer<typeof SetLLMApiKeysRequestSchema>;

export function createSetLLMApiKeysRequest(
  options: Partial<SetLLMApiKeysRequest> = {},
): SetLLMApiKeysRequest {
  return SetLLMApiKeysRequestSchema.parse(options);
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

export const FillInMissingArtifactIdsRequestSchema = z.object({
  namesPathsTypes: z.array(z.any()),
});

export type FillInMissingArtifactIdsRequest = z.infer<
  typeof FillInMissingArtifactIdsRequestSchema
>;

export function createFillInMissingArtifactIdsRequest(
  options: Partial<FillInMissingArtifactIdsRequest> = {},
): FillInMissingArtifactIdsRequest {
  return FillInMissingArtifactIdsRequestSchema.parse(options);
}

export const LoadArtifactFromDiskRequestSchema = z.object({
  filepath: z.string(),
  type: z.string(),
});

export type LoadArtifactFromDiskRequest = z.infer<
  typeof LoadArtifactFromDiskRequestSchema
>;

export function createLoadArtifactFromDiskRequest(
  options: Partial<LoadArtifactFromDiskRequest> = {},
): LoadArtifactFromDiskRequest {
  return LoadArtifactFromDiskRequestSchema.parse(options);
}

export const LoadArtifactsRequestSchema = z.object({
  artifactIds: z.array(z.string()),
});

export type LoadArtifactsRequest = z.infer<typeof LoadArtifactsRequestSchema>;

export function createLoadArtifactsRequest(
  options: Partial<LoadArtifactsRequest> = {},
): LoadArtifactsRequest {
  return LoadArtifactsRequestSchema.parse(options);
}

export const LoadAvailableArtifactsRequestSchema = z.object({
  sectionType: z.string(),
});

export type LoadAvailableArtifactsRequest = z.infer<
  typeof LoadAvailableArtifactsRequestSchema
>;

export function createLoadAvailableArtifactsRequest(
  options: Partial<LoadAvailableArtifactsRequest> = {},
): LoadAvailableArtifactsRequest {
  return LoadAvailableArtifactsRequestSchema.parse(options);
}

export const ReadCSVBase64RequestSchema = z.object({
  base64Str: z.string(),
});

export type ReadCSVBase64Request = z.infer<typeof ReadCSVBase64RequestSchema>;

export function createReadCSVBase64Request(
  options: Partial<ReadCSVBase64Request> = {},
): ReadCSVBase64Request {
  return ReadCSVBase64RequestSchema.parse(options);
}

export const SendArtifactRequestSchema = z.object({
  data: z.array(z.record(z.string(), z.any())),
});

export type SendArtifactRequest = z.infer<typeof SendArtifactRequestSchema>;

export function createSendArtifactRequest(
  options: Partial<SendArtifactRequest> = {},
): SendArtifactRequest {
  return SendArtifactRequestSchema.parse(options);
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

export const FormatCodeRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
});

export type FormatCodeRequest = z.infer<typeof FormatCodeRequestSchema>;

export function createFormatCodeRequest(
  options: Partial<FormatCodeRequest> = {},
): FormatCodeRequest {
  return FormatCodeRequestSchema.parse(options);
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

export const ChangeParamImplRequestSchema = z.object({
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

export const CreateNewSectionVersionRequestSchema = z.object({
  projectConfigId: z.string(),
  sectionId: z.string(),
});

export type CreateNewSectionVersionRequest = z.infer<
  typeof CreateNewSectionVersionRequestSchema
>;

export function createCreateNewSectionVersionRequest(
  options: Partial<CreateNewSectionVersionRequest> = {},
): CreateNewSectionVersionRequest {
  return CreateNewSectionVersionRequestSchema.parse(options);
}

export const CreateTopLevelSectionRequestSchema = z.object({
  projectConfigId: z.string(),
  implType: z.enum(SectionTypeEnum),
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

export const DeleteChildSectionsViaDecrementerRequestSchema = z.object({
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

export const DeleteSectionsRequestSchema = z.object({
  projectConfigId: z.string(),
  sectionIds: z.array(z.string()),
});

export type DeleteSectionsRequest = z.infer<typeof DeleteSectionsRequestSchema>;

export function createDeleteSectionsRequest(
  options: Partial<DeleteSectionsRequest> = {},
): DeleteSectionsRequest {
  return DeleteSectionsRequestSchema.parse(options);
}

export const GenCodePrefixCompletionRequestSchema = z.object({
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

export const RedoRequestSchema = z.object({
  steps: z.int(),
});

export type RedoRequest = z.infer<typeof RedoRequestSchema>;

export function createRedoRequest(
  options: Partial<RedoRequest> = {},
): RedoRequest {
  return RedoRequestSchema.parse(options);
}

export const SetCallableRequestSchema = z.object({
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

export const TextFieldCompletionRequestSchema = z.object({
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

export const UndoRequestSchema = z.object({
  steps: z.int(),
});

export type UndoRequest = z.infer<typeof UndoRequestSchema>;

export function createUndoRequest(
  options: Partial<UndoRequest> = {},
): UndoRequest {
  return UndoRequestSchema.parse(options);
}

export const UpdateFromFrontendRequestSchema = z.object({
  messageId: z.union([z.string(), z.null()]).default(null),
  projectState: ProjectStateSingleConfigSchema,
  requestRenameRefactor: z.boolean().default(false),
});

export type UpdateFromFrontendRequest = z.infer<
  typeof UpdateFromFrontendRequestSchema
>;

export function createUpdateFromFrontendRequest(
  options: Partial<UpdateFromFrontendRequest> = {},
): UpdateFromFrontendRequest {
  return UpdateFromFrontendRequestSchema.parse(options);
}

export const UpdateFromFrontendTopLevelSectionLayoutSchema = z.object({
  projectConfigId: z.string(),
  topLevelSections: z.record(z.string(), TopLevelSectionLayoutSchema),
});

export type UpdateFromFrontendTopLevelSectionLayout = z.infer<
  typeof UpdateFromFrontendTopLevelSectionLayoutSchema
>;

export function createUpdateFromFrontendTopLevelSectionLayout(
  options: Partial<UpdateFromFrontendTopLevelSectionLayout> = {},
): UpdateFromFrontendTopLevelSectionLayout {
  return UpdateFromFrontendTopLevelSectionLayoutSchema.parse(options);
}

export const UpdateParamImplConfigRequestSchema = z.object({
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

export const ProjectLoadRequestSchema = z.object({
  projectConfigName: z.string(),
});

export type ProjectLoadRequest = z.infer<typeof ProjectLoadRequestSchema>;

export function createProjectLoadRequest(
  options: Partial<ProjectLoadRequest> = {},
): ProjectLoadRequest {
  return ProjectLoadRequestSchema.parse(options);
}

export const ProjectSaveRequestSchema = z.object({
  project: ProjectStateSingleConfigSchema,
});

export type ProjectSaveRequest = z.infer<typeof ProjectSaveRequestSchema>;

export function createProjectSaveRequest(
  options: Partial<ProjectSaveRequest> = {},
): ProjectSaveRequest {
  return ProjectSaveRequestSchema.parse(options);
}

export const SaveAsExistingProjectConfigRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
  configName: z.string(),
});

export type SaveAsExistingProjectConfigRequest = z.infer<
  typeof SaveAsExistingProjectConfigRequestSchema
>;

export function createSaveAsExistingProjectConfigRequest(
  options: Partial<SaveAsExistingProjectConfigRequest> = {},
): SaveAsExistingProjectConfigRequest {
  return SaveAsExistingProjectConfigRequestSchema.parse(options);
}

export const SaveAsNewProjectConfigRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
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

export const DeleteFileRequestSchema = z.object({
  filepath: z.string(),
});

export type DeleteFileRequest = z.infer<typeof DeleteFileRequestSchema>;

export function createDeleteFileRequest(
  options: Partial<DeleteFileRequest> = {},
): DeleteFileRequest {
  return DeleteFileRequestSchema.parse(options);
}

export const FileWatchGenPythonCodeRequestSchema = z.object({
  projectConfigId: z.string(),
  watch: z.boolean(),
});

export type FileWatchGenPythonCodeRequest = z.infer<
  typeof FileWatchGenPythonCodeRequestSchema
>;

export function createFileWatchGenPythonCodeRequest(
  options: Partial<FileWatchGenPythonCodeRequest> = {},
): FileWatchGenPythonCodeRequest {
  return FileWatchGenPythonCodeRequestSchema.parse(options);
}

export const FileWatchListRequestSchema = z.object({
  filepaths: z.array(z.string()),
  fileWatchGroupName: z.enum(FileWatchGroupNameEnum),
});

export type FileWatchListRequest = z.infer<typeof FileWatchListRequestSchema>;

export function createFileWatchListRequest(
  options: Partial<FileWatchListRequest> = {},
): FileWatchListRequest {
  return FileWatchListRequestSchema.parse(options);
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

export const LoadJSONSourceObjectSchema = z.object({
  sections: z.record(z.string(), CoreSchema),
  sectionImpls: z.record(
    z.string(),
    z.union([
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
  ),
  sectionImplLayerings: z.record(z.string(), LayeringSchema),
  codeObjs: z.record(z.string(), CoreSchema),
  codeObjImpls: z.record(
    z.string(),
    z.union([
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
  ),
  codeObjImplLayerings: z.record(z.string(), LayeringSchema),
});

export type LoadJSONSourceObject = z.infer<typeof LoadJSONSourceObjectSchema>;

export function createLoadJSONSourceObject(
  options: Partial<LoadJSONSourceObject> = {},
): LoadJSONSourceObject {
  return LoadJSONSourceObjectSchema.parse(options);
}

export const LoadSectionJSONSourceRequestSchema = z.object({
  project: LoadJSONSourceObjectSchema,
  variantIdsToLoad: z.array(z.string()),
});

export type LoadSectionJSONSourceRequest = z.infer<
  typeof LoadSectionJSONSourceRequestSchema
>;

export function createLoadSectionJSONSourceRequest(
  options: Partial<LoadSectionJSONSourceRequest> = {},
): LoadSectionJSONSourceRequest {
  return LoadSectionJSONSourceRequestSchema.parse(options);
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

export const SaveSectionJSONSourceRequestSchema = z.object({
  project: z.record(z.string(), z.any()),
  variantId: z.string(),
});

export type SaveSectionJSONSourceRequest = z.infer<
  typeof SaveSectionJSONSourceRequestSchema
>;

export function createSaveSectionJSONSourceRequest(
  options: Partial<SaveSectionJSONSourceRequest> = {},
): SaveSectionJSONSourceRequest {
  return SaveSectionJSONSourceRequestSchema.parse(options);
}

export const SectionToYamlRequestSchema = z.object({
  codeInfo: z.record(z.string(), z.any()),
  codeInfoChildren: z.record(z.string(), z.any()),
  sectionVariant: z.record(z.string(), z.any()),
  pinnedIds: z.record(z.string(), z.array(z.string())),
  unpinnedIds: z.record(z.string(), z.array(z.string())),
});

export type SectionToYamlRequest = z.infer<typeof SectionToYamlRequestSchema>;

export function createSectionToYamlRequest(
  options: Partial<SectionToYamlRequest> = {},
): SectionToYamlRequest {
  return SectionToYamlRequestSchema.parse(options);
}

export const SectionsMakeCopyRequestSchema = z.object({
  sectionsAndOtherInfo: z.record(z.string(), z.any()),
});

export type SectionsMakeCopyRequest = z.infer<
  typeof SectionsMakeCopyRequestSchema
>;

export function createSectionsMakeCopyRequest(
  options: Partial<SectionsMakeCopyRequest> = {},
): SectionsMakeCopyRequest {
  return SectionsMakeCopyRequestSchema.parse(options);
}

export const SaveSettingsProjectRequestSchema = z.object({
  settingsProject: ProjectStateSingleConfigSchema,
});

export type SaveSettingsProjectRequest = z.infer<
  typeof SaveSettingsProjectRequestSchema
>;

export function createSaveSettingsProjectRequest(
  options: Partial<SaveSettingsProjectRequest> = {},
): SaveSettingsProjectRequest {
  return SaveSettingsProjectRequestSchema.parse(options);
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

export function isBaseArtifactSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseArtifactSectionImplUnion {
  return BaseArtifactSectionImplTypeSet.has(x.type);
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

export function isBackendWebsocketMsg(
  x: WebsocketMsgUnion,
): x is BackendWebsocketMsgUnion {
  return BackendWebsocketMsgTypeSet.has(x.messageType);
}

export function isFrontendWebsocketMsg(
  x: WebsocketMsgUnion,
): x is FrontendWebsocketMsgUnion {
  return FrontendWebsocketMsgTypeSet.has(x.messageType);
}

export function isWebsocketMsg(x: WebsocketMsgUnion): x is WebsocketMsgUnion {
  return WebsocketMsgTypeSet.has(x.messageType);
}

export function getSectionDefault(
  settings: SettingsState,
  sectionType: SectionType,
) {
  switch (sectionType) {
    case SectionTypeEnum.Callable:
      return settings.callableSectionDefault;
    case SectionTypeEnum.Dict:
      return settings.dictSectionDefault;
    case SectionTypeEnum.ListRoot:
      return settings.listRootSectionDefault;
    case SectionTypeEnum.DictRoot:
      return settings.dictRootSectionDefault;
    case SectionTypeEnum.Group:
      return settings.groupSectionDefault;
    case SectionTypeEnum.Image:
      return settings.imageSectionDefault;
    case SectionTypeEnum.Chart:
      return settings.chartSectionDefault;
    case SectionTypeEnum.Draw:
      return settings.drawSectionDefault;
    case SectionTypeEnum.TextBlock:
      return settings.textBlockSectionDefault;
    case SectionTypeEnum.Social:
      return settings.socialSectionDefault;
    case SectionTypeEnum.GlobalVariables:
      return settings.globalVariablesSectionDefault;
    case SectionTypeEnum.Code:
      return settings.codeSectionDefault;
    case SectionTypeEnum.GenPythonCode:
      return settings.genPythonCodeSectionDefault;
    case SectionTypeEnum.Terminal:
      return settings.terminalSectionDefault;
    case SectionTypeEnum.IFrame:
      return settings.iFrameSectionDefault;
    case SectionTypeEnum.Chat:
      return settings.chatSectionDefault;
    case SectionTypeEnum.Browser:
      return settings.browserSectionDefault;
    default:
      return sectionType satisfies never;
  }
}

export function getCodeObjDefault(
  settings: SettingsState,
  codeObjType: CodeObjType,
) {
  switch (codeObjType) {
    case CodeObjTypeEnum.CodeCallable:
      return settings.codeCallableCodeObjDefault;
    case CodeObjTypeEnum.CodeParam:
      return settings.codeParamCodeObjDefault;
    case CodeObjTypeEnum.TextParam:
      return settings.textParamCodeObjDefault;
    case CodeObjTypeEnum.SliderParam:
      return settings.sliderParamCodeObjDefault;
    case CodeObjTypeEnum.SwitchParam:
      return settings.switchParamCodeObjDefault;
    case CodeObjTypeEnum.ColorPickerParam:
      return settings.colorPickerParamCodeObjDefault;
    case CodeObjTypeEnum.DropdownParam:
      return settings.dropdownParamCodeObjDefault;
    case CodeObjTypeEnum.PasswordParam:
      return settings.passwordParamCodeObjDefault;
    case CodeObjTypeEnum.NestedParam:
      return settings.nestedParamCodeObjDefault;
    default:
      return codeObjType satisfies never;
  }
}

type ImplArgsBundleWithUpdaters<T> = {
  [K in keyof T]?: T[K] | ((prev: T[K]) => T[K]);
};

export type ImplArgsBundleMap = {
  BaseSection: {
    impl: BaseSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplArgs>;
  };

  BaseSectionUnion: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplArgs>;
  };

  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImpl;
    args: ImplArgsBundleWithUpdaters<BaseSectionWithParamsImplArgs>;
  };

  BaseSectionWithParamsUnion: {
    impl: BaseSectionWithParamsImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionWithParamsImplArgs>;
  };

  BaseArtifactSection: {
    impl: BaseArtifactSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseArtifactSectionImplArgs>;
  };

  BaseArtifactSectionUnion: {
    impl: BaseArtifactSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseArtifactSectionImplArgs>;
  };

  BaseCanvasSection: {
    impl: BaseCanvasSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseCanvasSectionImplArgs>;
  };

  BaseCanvasSectionUnion: {
    impl: BaseCanvasSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseCanvasSectionImplArgs>;
  };

  BaseCodeSection: {
    impl: BaseCodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseCodeSectionImplArgs>;
  };

  BaseCodeSectionUnion: {
    impl: BaseCodeSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseCodeSectionImplArgs>;
  };

  BaseParentSection: {
    impl: BaseParentSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplArgs>;
  };

  BaseParentSectionUnion: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplArgs>;
  };

  BaseDictSection: {
    impl: BaseDictSectionImpl;
    args: ImplArgsBundleWithUpdaters<BaseDictSectionImplArgs>;
  };

  BaseDictSectionUnion: {
    impl: BaseDictSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseDictSectionImplArgs>;
  };

  CallableSection: {
    impl: CallableSectionImpl;
    args: ImplArgsBundleWithUpdaters<CallableSectionImplArgs>;
  };

  DictSection: {
    impl: DictSectionImpl;
    args: ImplArgsBundleWithUpdaters<DictSectionImplArgs>;
  };

  ListRootSection: {
    impl: ListRootSectionImpl;
    args: ImplArgsBundleWithUpdaters<ListRootSectionImplArgs>;
  };

  DictRootSection: {
    impl: DictRootSectionImpl;
    args: ImplArgsBundleWithUpdaters<DictRootSectionImplArgs>;
  };

  GroupSection: {
    impl: GroupSectionImpl;
    args: ImplArgsBundleWithUpdaters<GroupSectionImplArgs>;
  };

  ImageSection: {
    impl: ImageSectionImpl;
    args: ImplArgsBundleWithUpdaters<ImageSectionImplArgs>;
  };

  ChartSection: {
    impl: ChartSectionImpl;
    args: ImplArgsBundleWithUpdaters<ChartSectionImplArgs>;
  };

  DrawSection: {
    impl: DrawSectionImpl;
    args: ImplArgsBundleWithUpdaters<DrawSectionImplArgs>;
  };

  TextBlockSection: {
    impl: TextBlockSectionImpl;
    args: ImplArgsBundleWithUpdaters<TextBlockSectionImplArgs>;
  };

  SocialSection: {
    impl: SocialSectionImpl;
    args: ImplArgsBundleWithUpdaters<SocialSectionImplArgs>;
  };

  GlobalVariablesSection: {
    impl: GlobalVariablesSectionImpl;
    args: ImplArgsBundleWithUpdaters<GlobalVariablesSectionImplArgs>;
  };

  CodeSection: {
    impl: CodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<CodeSectionImplArgs>;
  };

  GenPythonCodeSection: {
    impl: GenPythonCodeSectionImpl;
    args: ImplArgsBundleWithUpdaters<GenPythonCodeSectionImplArgs>;
  };

  TerminalSection: {
    impl: TerminalSectionImpl;
    args: ImplArgsBundleWithUpdaters<TerminalSectionImplArgs>;
  };

  IFrameSection: {
    impl: IFrameSectionImpl;
    args: ImplArgsBundleWithUpdaters<IFrameSectionImplArgs>;
  };

  ChatSection: {
    impl: ChatSectionImpl;
    args: ImplArgsBundleWithUpdaters<ChatSectionImplArgs>;
  };

  BrowserSection: {
    impl: BrowserSectionImpl;
    args: ImplArgsBundleWithUpdaters<BrowserSectionImplArgs>;
  };

  BaseCodeObj: {
    impl: BaseCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<BaseCodeObjImplArgs>;
  };

  BaseCodeObjUnion: {
    impl: BaseCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseCodeObjImplArgs>;
  };

  BaseParamCodeObj: {
    impl: BaseParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<BaseParamCodeObjImplArgs>;
  };

  BaseParamCodeObjUnion: {
    impl: BaseParamCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParamCodeObjImplArgs>;
  };

  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<BaseChildlessCodeObjImplArgs>;
  };

  BaseChildlessCodeObjUnion: {
    impl: BaseChildlessCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseChildlessCodeObjImplArgs>;
  };

  BaseParentCodeObj: {
    impl: BaseParentCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<BaseParentCodeObjImplArgs>;
  };

  BaseParentCodeObjUnion: {
    impl: BaseParentCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentCodeObjImplArgs>;
  };

  CodeCallableCodeObj: {
    impl: CodeCallableCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<CodeCallableCodeObjImplArgs>;
  };

  CodeParamCodeObj: {
    impl: CodeParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<CodeParamCodeObjImplArgs>;
  };

  TextParamCodeObj: {
    impl: TextParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<TextParamCodeObjImplArgs>;
  };

  SliderParamCodeObj: {
    impl: SliderParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<SliderParamCodeObjImplArgs>;
  };

  SwitchParamCodeObj: {
    impl: SwitchParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<SwitchParamCodeObjImplArgs>;
  };

  ColorPickerParamCodeObj: {
    impl: ColorPickerParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<ColorPickerParamCodeObjImplArgs>;
  };

  DropdownParamCodeObj: {
    impl: DropdownParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<DropdownParamCodeObjImplArgs>;
  };

  PasswordParamCodeObj: {
    impl: PasswordParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<PasswordParamCodeObjImplArgs>;
  };

  NestedParamCodeObj: {
    impl: NestedParamCodeObjImpl;
    args: ImplArgsBundleWithUpdaters<NestedParamCodeObjImplArgs>;
  };
};
