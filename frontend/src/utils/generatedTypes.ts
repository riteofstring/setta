import {
  createNewId as create_new_id,
  createRandomName as generate_memorable_string,
} from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import { z } from "zod/v4";

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export type ObjectValues<T> = T[keyof T];
export const BaseChildlessCodeObjImplModifierTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseCodeObjImplModifierTypeSet = new Set([
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

export const BaseParamCodeObjImplModifierTypeSet = new Set([
  "CodeParam",
  "ColorPickerParam",
  "DropdownParam",
  "NestedParam",
  "PasswordParam",
  "SliderParam",
  "SwitchParam",
  "TextParam",
]);

export const BaseParentCodeObjImplModifierTypeSet = new Set([
  "CodeCallable",
  "NestedParam",
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

export const BaseArtifactSectionImplModifierTypeSet = new Set([
  "Chart",
  "Draw",
  "Image",
]);

export const BaseCanvasSectionImplModifierTypeSet = new Set(["Chart", "Draw"]);

export const BaseCodeSectionImplModifierTypeSet = new Set([
  "Code",
  "GenPythonCode",
]);

export const BaseDictSectionImplModifierTypeSet = new Set([
  "Dict",
  "GlobalVariables",
]);

export const BaseParentSectionImplModifierTypeSet = new Set([
  "DictRoot",
  "Group",
  "ListRoot",
]);

export const BaseSectionImplModifierTypeSet = new Set([
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

export const BaseSectionWithParamsImplModifierTypeSet = new Set([
  "Callable",
  "Dict",
  "GlobalVariables",
]);

export const BaseArtifactSectionImplTypeSet = new Set([
  "Chart",
  "Draw",
  "Image",
]);

export const BaseCanvasSectionImplTypeSet = new Set(["Chart", "Draw"]);

export const BaseCodeSectionImplTypeSet = new Set(["Code", "GenPythonCode"]);

export const BaseDictSectionImplTypeSet = new Set(["Dict", "GlobalVariables"]);

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

export const WebsocketMsgForBackendTypeSet = new Set([
  "CurrentAddressUpdate",
  "UpdateBackendProjectState",
]);

export const WebsocketMsgForFrontendTypeSet = new Set([
  "AllConnections",
  "AllDependencies",
  "Artifact",
  "LLMStreamingResponse",
  "LSPDiagnostics",
  "NewTerminalCreated",
  "Notification",
  "ReturnRenameRefactorResults",
  "SpecificFileWatcherUpdate",
  "TerminalMetadata",
  "UUIDMappingForLLM",
  "UpdateFrontendProjectState",
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
  TERMINAL: "/{projectConfigId}/{sectionId}/{id}/{isTemporary}",
  DELETE_TERMINALS: "/deleteTerminals",
  WEBSOCKET_FRONTEND: "/frontend",
  WEBSOCKET_CLI: "/cli",
  WEBSOCKET_CLI_WITH_ID: "/cli/{id}",
  WEBSOCKET_PYTHON_SCRIPT: "/pythonScript/{id}",
  WEBSOCKET_PYTHON_LOGGER: "/pythonLogger",
  GET_EXISTING_TERMINALS: "/getExistingTerminals/{projectConfigId}",
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
  SET_SELECTED_ITEM: "/setSelectedItem",
  TEXT_FIELD_COMPLETION: "/textFieldCompletion",
  CODE_AREA_COMPLETION: "/codeAreaCompletion",
  GEN_CODE_PREFIX_COMPLETION: "/genCodePrefixCompletion",
} as const;

export type Route = ObjectValues<typeof RouteEnum>;

export const CodeLanguageEnum = { python: "python", bash: "bash" } as const;

export type CodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = { python: "python", json: "json" } as const;

export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const SectionSizeModeEnum = { auto: "auto" } as const;

export type SectionSizeMode = ObjectValues<typeof SectionSizeModeEnum>;

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

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
} as const;

export type BackgroundVariant = ObjectValues<typeof BackgroundVariantEnum>;

export const RenameRefactorModeEnum = {
  ALWAYS_ASK: "ALWAYS_ASK",
  ALWAYS_RENAME: "ALWAYS_RENAME",
  NEVER_RENAME: "NEVER_RENAME",
} as const;

export type RenameRefactorMode = ObjectValues<typeof RenameRefactorModeEnum>;

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
  UpdateBackendProjectState: "UpdateBackendProjectState",
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
  NewTerminalCreated: "NewTerminalCreated",
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

export const CodeParamCodeObjImplModifierSchema = z.object({
  type: z.literal("CodeParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type CodeParamCodeObjImplModifier = z.infer<
  typeof CodeParamCodeObjImplModifierSchema
>;

export function createCodeParamCodeObjImplModifier(
  options: Partial<CodeParamCodeObjImplModifier> = {},
): CodeParamCodeObjImplModifier {
  return CodeParamCodeObjImplModifierSchema.parse(options);
}

export const TextParamCodeObjImplModifierSchema = z.object({
  type: z.literal("TextParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type TextParamCodeObjImplModifier = z.infer<
  typeof TextParamCodeObjImplModifierSchema
>;

export function createTextParamCodeObjImplModifier(
  options: Partial<TextParamCodeObjImplModifier> = {},
): TextParamCodeObjImplModifier {
  return TextParamCodeObjImplModifierSchema.parse(options);
}

export const SliderParamCodeObjImplModifierSchema = z.object({
  type: z.literal("SliderParam").optional(),
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

export type SliderParamCodeObjImplModifier = z.infer<
  typeof SliderParamCodeObjImplModifierSchema
>;

export function createSliderParamCodeObjImplModifier(
  options: Partial<SliderParamCodeObjImplModifier> = {},
): SliderParamCodeObjImplModifier {
  return SliderParamCodeObjImplModifierSchema.parse(options);
}

export const SwitchParamCodeObjImplModifierSchema = z.object({
  type: z.literal("SwitchParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type SwitchParamCodeObjImplModifier = z.infer<
  typeof SwitchParamCodeObjImplModifierSchema
>;

export function createSwitchParamCodeObjImplModifier(
  options: Partial<SwitchParamCodeObjImplModifier> = {},
): SwitchParamCodeObjImplModifier {
  return SwitchParamCodeObjImplModifierSchema.parse(options);
}

export const ColorPickerParamCodeObjImplModifierSchema = z.object({
  type: z.literal("ColorPickerParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type ColorPickerParamCodeObjImplModifier = z.infer<
  typeof ColorPickerParamCodeObjImplModifierSchema
>;

export function createColorPickerParamCodeObjImplModifier(
  options: Partial<ColorPickerParamCodeObjImplModifier> = {},
): ColorPickerParamCodeObjImplModifier {
  return ColorPickerParamCodeObjImplModifierSchema.parse(options);
}

export const DropdownParamCodeObjImplModifierSchema = z.object({
  type: z.literal("DropdownParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

export type DropdownParamCodeObjImplModifier = z.infer<
  typeof DropdownParamCodeObjImplModifierSchema
>;

export function createDropdownParamCodeObjImplModifier(
  options: Partial<DropdownParamCodeObjImplModifier> = {},
): DropdownParamCodeObjImplModifier {
  return DropdownParamCodeObjImplModifierSchema.parse(options);
}

export const PasswordParamCodeObjImplModifierSchema = z.object({
  type: z.literal("PasswordParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type PasswordParamCodeObjImplModifier = z.infer<
  typeof PasswordParamCodeObjImplModifierSchema
>;

export function createPasswordParamCodeObjImplModifier(
  options: Partial<PasswordParamCodeObjImplModifier> = {},
): PasswordParamCodeObjImplModifier {
  return PasswordParamCodeObjImplModifierSchema.parse(options);
}

export const BaseChildlessCodeObjImplModifierUnionSchema = z.union([
  CodeParamCodeObjImplModifierSchema,
  TextParamCodeObjImplModifierSchema,
  SliderParamCodeObjImplModifierSchema,
  SwitchParamCodeObjImplModifierSchema,
  ColorPickerParamCodeObjImplModifierSchema,
  DropdownParamCodeObjImplModifierSchema,
  PasswordParamCodeObjImplModifierSchema,
]);

export type BaseChildlessCodeObjImplModifierUnion = z.infer<
  typeof BaseChildlessCodeObjImplModifierUnionSchema
>;

export const BaseChildlessCodeObjImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplModifierSchema,
    TextParamCodeObjImplModifierSchema,
    SliderParamCodeObjImplModifierSchema,
    SwitchParamCodeObjImplModifierSchema,
    ColorPickerParamCodeObjImplModifierSchema,
    DropdownParamCodeObjImplModifierSchema,
    PasswordParamCodeObjImplModifierSchema,
  ]);

export type BaseChildlessCodeObjImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseChildlessCodeObjImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseChildlessCodeObjImplModifierUnionWithDiscriminator(
  options: Partial<BaseChildlessCodeObjImplModifierUnionWithDiscriminator> = {},
): BaseChildlessCodeObjImplModifierUnionWithDiscriminator {
  return BaseChildlessCodeObjImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const CodeCallableCodeObjImplModifierSchema = z.object({
  type: z.literal("CodeCallable").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type CodeCallableCodeObjImplModifier = z.infer<
  typeof CodeCallableCodeObjImplModifierSchema
>;

export function createCodeCallableCodeObjImplModifier(
  options: Partial<CodeCallableCodeObjImplModifier> = {},
): CodeCallableCodeObjImplModifier {
  return CodeCallableCodeObjImplModifierSchema.parse(options);
}

export const NestedParamCodeObjImplModifierSchema = z.object({
  type: z.literal("NestedParam").optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  children: z.array(z.string()).optional(),
});

export type NestedParamCodeObjImplModifier = z.infer<
  typeof NestedParamCodeObjImplModifierSchema
>;

export function createNestedParamCodeObjImplModifier(
  options: Partial<NestedParamCodeObjImplModifier> = {},
): NestedParamCodeObjImplModifier {
  return NestedParamCodeObjImplModifierSchema.parse(options);
}

export const BaseCodeObjImplModifierUnionSchema = z.union([
  CodeCallableCodeObjImplModifierSchema,
  CodeParamCodeObjImplModifierSchema,
  TextParamCodeObjImplModifierSchema,
  SliderParamCodeObjImplModifierSchema,
  SwitchParamCodeObjImplModifierSchema,
  ColorPickerParamCodeObjImplModifierSchema,
  DropdownParamCodeObjImplModifierSchema,
  PasswordParamCodeObjImplModifierSchema,
  NestedParamCodeObjImplModifierSchema,
]);

export type BaseCodeObjImplModifierUnion = z.infer<
  typeof BaseCodeObjImplModifierUnionSchema
>;

export const BaseCodeObjImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplModifierSchema,
    CodeParamCodeObjImplModifierSchema,
    TextParamCodeObjImplModifierSchema,
    SliderParamCodeObjImplModifierSchema,
    SwitchParamCodeObjImplModifierSchema,
    ColorPickerParamCodeObjImplModifierSchema,
    DropdownParamCodeObjImplModifierSchema,
    PasswordParamCodeObjImplModifierSchema,
    NestedParamCodeObjImplModifierSchema,
  ]);

export type BaseCodeObjImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseCodeObjImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseCodeObjImplModifierUnionWithDiscriminator(
  options: Partial<BaseCodeObjImplModifierUnionWithDiscriminator> = {},
): BaseCodeObjImplModifierUnionWithDiscriminator {
  return BaseCodeObjImplModifierUnionWithDiscriminatorSchema.parse(options);
}

export const BaseParamCodeObjImplModifierUnionSchema = z.union([
  CodeParamCodeObjImplModifierSchema,
  TextParamCodeObjImplModifierSchema,
  SliderParamCodeObjImplModifierSchema,
  SwitchParamCodeObjImplModifierSchema,
  ColorPickerParamCodeObjImplModifierSchema,
  DropdownParamCodeObjImplModifierSchema,
  PasswordParamCodeObjImplModifierSchema,
  NestedParamCodeObjImplModifierSchema,
]);

export type BaseParamCodeObjImplModifierUnion = z.infer<
  typeof BaseParamCodeObjImplModifierUnionSchema
>;

export const BaseParamCodeObjImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeParamCodeObjImplModifierSchema,
    TextParamCodeObjImplModifierSchema,
    SliderParamCodeObjImplModifierSchema,
    SwitchParamCodeObjImplModifierSchema,
    ColorPickerParamCodeObjImplModifierSchema,
    DropdownParamCodeObjImplModifierSchema,
    PasswordParamCodeObjImplModifierSchema,
    NestedParamCodeObjImplModifierSchema,
  ]);

export type BaseParamCodeObjImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseParamCodeObjImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseParamCodeObjImplModifierUnionWithDiscriminator(
  options: Partial<BaseParamCodeObjImplModifierUnionWithDiscriminator> = {},
): BaseParamCodeObjImplModifierUnionWithDiscriminator {
  return BaseParamCodeObjImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const BaseParentCodeObjImplModifierUnionSchema = z.union([
  CodeCallableCodeObjImplModifierSchema,
  NestedParamCodeObjImplModifierSchema,
]);

export type BaseParentCodeObjImplModifierUnion = z.infer<
  typeof BaseParentCodeObjImplModifierUnionSchema
>;

export const BaseParentCodeObjImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeCallableCodeObjImplModifierSchema,
    NestedParamCodeObjImplModifierSchema,
  ]);

export type BaseParentCodeObjImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseParentCodeObjImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseParentCodeObjImplModifierUnionWithDiscriminator(
  options: Partial<BaseParentCodeObjImplModifierUnionWithDiscriminator> = {},
): BaseParentCodeObjImplModifierUnionWithDiscriminator {
  return BaseParentCodeObjImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const CodeParamCodeObjImplSchema = z.object({
  type: z.literal("CodeParam").default(CodeObjTypeEnum.CodeParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type CodeParamCodeObjImpl = z.infer<typeof CodeParamCodeObjImplSchema>;

export function createCodeParamCodeObjImpl(
  options: Partial<CodeParamCodeObjImpl> = {},
): CodeParamCodeObjImpl {
  return CodeParamCodeObjImplSchema.parse(options);
}

export const TextParamCodeObjImplSchema = z.object({
  type: z.literal("TextParam").default(CodeObjTypeEnum.TextParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type TextParamCodeObjImpl = z.infer<typeof TextParamCodeObjImplSchema>;

export function createTextParamCodeObjImpl(
  options: Partial<TextParamCodeObjImpl> = {},
): TextParamCodeObjImpl {
  return TextParamCodeObjImplSchema.parse(options);
}

export const SliderParamCodeObjImplSchema = z.object({
  type: z.literal("SliderParam").default(CodeObjTypeEnum.SliderParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
  min: z.int().default(0),
  max: z.int().default(100),
  step: z.int().default(1),
});

export type SliderParamCodeObjImpl = z.infer<
  typeof SliderParamCodeObjImplSchema
>;

export function createSliderParamCodeObjImpl(
  options: Partial<SliderParamCodeObjImpl> = {},
): SliderParamCodeObjImpl {
  return SliderParamCodeObjImplSchema.parse(options);
}

export const SwitchParamCodeObjImplSchema = z.object({
  type: z.literal("SwitchParam").default(CodeObjTypeEnum.SwitchParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type SwitchParamCodeObjImpl = z.infer<
  typeof SwitchParamCodeObjImplSchema
>;

export function createSwitchParamCodeObjImpl(
  options: Partial<SwitchParamCodeObjImpl> = {},
): SwitchParamCodeObjImpl {
  return SwitchParamCodeObjImplSchema.parse(options);
}

export const ColorPickerParamCodeObjImplSchema = z.object({
  type: z.literal("ColorPickerParam").default(CodeObjTypeEnum.ColorPickerParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type ColorPickerParamCodeObjImpl = z.infer<
  typeof ColorPickerParamCodeObjImplSchema
>;

export function createColorPickerParamCodeObjImpl(
  options: Partial<ColorPickerParamCodeObjImpl> = {},
): ColorPickerParamCodeObjImpl {
  return ColorPickerParamCodeObjImplSchema.parse(options);
}

export const DropdownParamCodeObjImplSchema = z.object({
  type: z.literal("DropdownParam").default(CodeObjTypeEnum.DropdownParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
  choices: z.array(z.string()),
});

export type DropdownParamCodeObjImpl = z.infer<
  typeof DropdownParamCodeObjImplSchema
>;

export function createDropdownParamCodeObjImpl(
  options: Partial<DropdownParamCodeObjImpl> = {},
): DropdownParamCodeObjImpl {
  return DropdownParamCodeObjImplSchema.parse(options);
}

export const PasswordParamCodeObjImplSchema = z.object({
  type: z.literal("PasswordParam").default(CodeObjTypeEnum.PasswordParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type PasswordParamCodeObjImpl = z.infer<
  typeof PasswordParamCodeObjImplSchema
>;

export function createPasswordParamCodeObjImpl(
  options: Partial<PasswordParamCodeObjImpl> = {},
): PasswordParamCodeObjImpl {
  return PasswordParamCodeObjImplSchema.parse(options);
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

export const CodeCallableCodeObjImplSchema = z.object({
  type: z.literal("CodeCallable").default(CodeObjTypeEnum.CodeCallable),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type CodeCallableCodeObjImpl = z.infer<
  typeof CodeCallableCodeObjImplSchema
>;

export function createCodeCallableCodeObjImpl(
  options: Partial<CodeCallableCodeObjImpl> = {},
): CodeCallableCodeObjImpl {
  return CodeCallableCodeObjImplSchema.parse(options);
}

export const NestedParamCodeObjImplSchema = z.object({
  type: z.literal("NestedParam").default(CodeObjTypeEnum.NestedParam),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
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
  options: Partial<NestedParamCodeObjImpl> = {},
): NestedParamCodeObjImpl {
  return NestedParamCodeObjImplSchema.parse(options);
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

export const BaseParentCodeObjImplUnionSchema = z.union([
  CodeCallableCodeObjImplSchema,
  NestedParamCodeObjImplSchema,
]);

export type BaseParentCodeObjImplUnion = z.infer<
  typeof BaseParentCodeObjImplUnionSchema
>;

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

export const ImageSectionImplModifierSchema = z.object({
  type: z.literal("Image").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
});

export type ImageSectionImplModifier = z.infer<
  typeof ImageSectionImplModifierSchema
>;

export function createImageSectionImplModifier(
  options: Partial<ImageSectionImplModifier> = {},
): ImageSectionImplModifier {
  return ImageSectionImplModifierSchema.parse(options);
}

export const ChartSettingsSchema = z.object({
  type: z.string().default("line"),
  xAxisColumn: z.string().default(""),
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

export const ChartSectionImplModifierSchema = z.object({
  type: z.literal("Chart").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
  renderedValue: z.any().optional(),
  chartSettings: ChartSettingsSchema.optional(),
});

export type ChartSectionImplModifier = z.infer<
  typeof ChartSectionImplModifierSchema
>;

export function createChartSectionImplModifier(
  options: Partial<ChartSectionImplModifier> = {},
): ChartSectionImplModifier {
  return ChartSectionImplModifierSchema.parse(options);
}

export const DrawAreaCanvasSettingsSchema = z.object({
  activeLayerId: z.union([z.string(), z.null()]).default(null),
  color: z.string().default("#ff0000"),
  brushSize: z.int().default(16),
  brushShape: z.string().default("butt"),
  eraserBrushSize: z.int().default(16),
  drawThrottleDelay: z.int().default(0),
  canvasTransferQueueLength: z.int().default(50),
  mode: z.string().default("draw"),
});

export type DrawAreaCanvasSettings = z.infer<
  typeof DrawAreaCanvasSettingsSchema
>;

export function createDrawAreaCanvasSettings(
  options: Partial<DrawAreaCanvasSettings> = {},
): DrawAreaCanvasSettings {
  return DrawAreaCanvasSettingsSchema.parse(options);
}

export const DrawSectionImplModifierSchema = z.object({
  type: z.literal("Draw").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
  renderedValue: z.any().optional(),
  canvasSettings: DrawAreaCanvasSettingsSchema.optional(),
});

export type DrawSectionImplModifier = z.infer<
  typeof DrawSectionImplModifierSchema
>;

export function createDrawSectionImplModifier(
  options: Partial<DrawSectionImplModifier> = {},
): DrawSectionImplModifier {
  return DrawSectionImplModifierSchema.parse(options);
}

export const BaseArtifactSectionImplModifierUnionSchema = z.union([
  ImageSectionImplModifierSchema,
  ChartSectionImplModifierSchema,
  DrawSectionImplModifierSchema,
]);

export type BaseArtifactSectionImplModifierUnion = z.infer<
  typeof BaseArtifactSectionImplModifierUnionSchema
>;

export const BaseArtifactSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ImageSectionImplModifierSchema,
    ChartSectionImplModifierSchema,
    DrawSectionImplModifierSchema,
  ]);

export type BaseArtifactSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseArtifactSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseArtifactSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseArtifactSectionImplModifierUnionWithDiscriminator> = {},
): BaseArtifactSectionImplModifierUnionWithDiscriminator {
  return BaseArtifactSectionImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const BaseCanvasSectionImplModifierUnionSchema = z.union([
  ChartSectionImplModifierSchema,
  DrawSectionImplModifierSchema,
]);

export type BaseCanvasSectionImplModifierUnion = z.infer<
  typeof BaseCanvasSectionImplModifierUnionSchema
>;

export const BaseCanvasSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ChartSectionImplModifierSchema,
    DrawSectionImplModifierSchema,
  ]);

export type BaseCanvasSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseCanvasSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseCanvasSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseCanvasSectionImplModifierUnionWithDiscriminator> = {},
): BaseCanvasSectionImplModifierUnionWithDiscriminator {
  return BaseCanvasSectionImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const CodeSectionImplModifierSchema = z.object({
  type: z.literal("Code").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  code: z.string().optional(),
  codeLanguage: z.enum(CodeLanguageEnum).optional(),
});

export type CodeSectionImplModifier = z.infer<
  typeof CodeSectionImplModifierSchema
>;

export function createCodeSectionImplModifier(
  options: Partial<CodeSectionImplModifier> = {},
): CodeSectionImplModifier {
  return CodeSectionImplModifierSchema.parse(options);
}

export const GenPythonCodeSectionImplModifierSchema = z.object({
  type: z.literal("GenPythonCode").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  code: z.string().optional(),
});

export type GenPythonCodeSectionImplModifier = z.infer<
  typeof GenPythonCodeSectionImplModifierSchema
>;

export function createGenPythonCodeSectionImplModifier(
  options: Partial<GenPythonCodeSectionImplModifier> = {},
): GenPythonCodeSectionImplModifier {
  return GenPythonCodeSectionImplModifierSchema.parse(options);
}

export const BaseCodeSectionImplModifierUnionSchema = z.union([
  CodeSectionImplModifierSchema,
  GenPythonCodeSectionImplModifierSchema,
]);

export type BaseCodeSectionImplModifierUnion = z.infer<
  typeof BaseCodeSectionImplModifierUnionSchema
>;

export const BaseCodeSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CodeSectionImplModifierSchema,
    GenPythonCodeSectionImplModifierSchema,
  ]);

export type BaseCodeSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseCodeSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseCodeSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseCodeSectionImplModifierUnionWithDiscriminator> = {},
): BaseCodeSectionImplModifierUnionWithDiscriminator {
  return BaseCodeSectionImplModifierUnionWithDiscriminatorSchema.parse(options);
}

export const DictSectionImplModifierSchema = z.object({
  type: z.literal("Dict").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
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

export type DictSectionImplModifier = z.infer<
  typeof DictSectionImplModifierSchema
>;

export function createDictSectionImplModifier(
  options: Partial<DictSectionImplModifier> = {},
): DictSectionImplModifier {
  return DictSectionImplModifierSchema.parse(options);
}

export const GlobalVariablesSectionImplModifierSchema = z.object({
  type: z.literal("GlobalVariables").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
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
});

export type GlobalVariablesSectionImplModifier = z.infer<
  typeof GlobalVariablesSectionImplModifierSchema
>;

export function createGlobalVariablesSectionImplModifier(
  options: Partial<GlobalVariablesSectionImplModifier> = {},
): GlobalVariablesSectionImplModifier {
  return GlobalVariablesSectionImplModifierSchema.parse(options);
}

export const BaseDictSectionImplModifierUnionSchema = z.union([
  DictSectionImplModifierSchema,
  GlobalVariablesSectionImplModifierSchema,
]);

export type BaseDictSectionImplModifierUnion = z.infer<
  typeof BaseDictSectionImplModifierUnionSchema
>;

export const BaseDictSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    DictSectionImplModifierSchema,
    GlobalVariablesSectionImplModifierSchema,
  ]);

export type BaseDictSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseDictSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseDictSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseDictSectionImplModifierUnionWithDiscriminator> = {},
): BaseDictSectionImplModifierUnionWithDiscriminator {
  return BaseDictSectionImplModifierUnionWithDiscriminatorSchema.parse(options);
}

export const ListRootSectionImplModifierSchema = z.object({
  type: z.literal("ListRoot").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type ListRootSectionImplModifier = z.infer<
  typeof ListRootSectionImplModifierSchema
>;

export function createListRootSectionImplModifier(
  options: Partial<ListRootSectionImplModifier> = {},
): ListRootSectionImplModifier {
  return ListRootSectionImplModifierSchema.parse(options);
}

export const DictRootSectionImplModifierSchema = z.object({
  type: z.literal("DictRoot").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type DictRootSectionImplModifier = z.infer<
  typeof DictRootSectionImplModifierSchema
>;

export function createDictRootSectionImplModifier(
  options: Partial<DictRootSectionImplModifier> = {},
): DictRootSectionImplModifier {
  return DictRootSectionImplModifierSchema.parse(options);
}

export const GroupSectionImplModifierSchema = z.object({
  type: z.literal("Group").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  children: z.array(z.string()).optional(),
  isHorizontalOrientation: z.boolean().optional(),
});

export type GroupSectionImplModifier = z.infer<
  typeof GroupSectionImplModifierSchema
>;

export function createGroupSectionImplModifier(
  options: Partial<GroupSectionImplModifier> = {},
): GroupSectionImplModifier {
  return GroupSectionImplModifierSchema.parse(options);
}

export const BaseParentSectionImplModifierUnionSchema = z.union([
  ListRootSectionImplModifierSchema,
  DictRootSectionImplModifierSchema,
  GroupSectionImplModifierSchema,
]);

export type BaseParentSectionImplModifierUnion = z.infer<
  typeof BaseParentSectionImplModifierUnionSchema
>;

export const BaseParentSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    ListRootSectionImplModifierSchema,
    DictRootSectionImplModifierSchema,
    GroupSectionImplModifierSchema,
  ]);

export type BaseParentSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseParentSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseParentSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseParentSectionImplModifierUnionWithDiscriminator> = {},
): BaseParentSectionImplModifierUnionWithDiscriminator {
  return BaseParentSectionImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
}

export const CallableSectionImplModifierSchema = z.object({
  type: z.literal("Callable").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
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

export type CallableSectionImplModifier = z.infer<
  typeof CallableSectionImplModifierSchema
>;

export function createCallableSectionImplModifier(
  options: Partial<CallableSectionImplModifier> = {},
): CallableSectionImplModifier {
  return CallableSectionImplModifierSchema.parse(options);
}

export const TextBlockSectionImplModifierSchema = z.object({
  type: z.literal("TextBlock").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  renderMarkdown: z.boolean().optional(),
  headingAsSectionName: z.boolean().optional(),
  displayMode: z.string().optional(),
  description: z.string().optional(),
});

export type TextBlockSectionImplModifier = z.infer<
  typeof TextBlockSectionImplModifierSchema
>;

export function createTextBlockSectionImplModifier(
  options: Partial<TextBlockSectionImplModifier> = {},
): TextBlockSectionImplModifier {
  return TextBlockSectionImplModifierSchema.parse(options);
}

export const SocialSectionImplModifierSchema = z.object({
  type: z.literal("Social").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  social: z.string().optional(),
});

export type SocialSectionImplModifier = z.infer<
  typeof SocialSectionImplModifierSchema
>;

export function createSocialSectionImplModifier(
  options: Partial<SocialSectionImplModifier> = {},
): SocialSectionImplModifier {
  return SocialSectionImplModifierSchema.parse(options);
}

export const TerminalSectionImplModifierSchema = z.object({
  type: z.literal("Terminal").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
});

export type TerminalSectionImplModifier = z.infer<
  typeof TerminalSectionImplModifierSchema
>;

export function createTerminalSectionImplModifier(
  options: Partial<TerminalSectionImplModifier> = {},
): TerminalSectionImplModifier {
  return TerminalSectionImplModifierSchema.parse(options);
}

export const IFrameSectionImplModifierSchema = z.object({
  type: z.literal("IFrame").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
});

export type IFrameSectionImplModifier = z.infer<
  typeof IFrameSectionImplModifierSchema
>;

export function createIFrameSectionImplModifier(
  options: Partial<IFrameSectionImplModifier> = {},
): IFrameSectionImplModifier {
  return IFrameSectionImplModifierSchema.parse(options);
}

export const ChatSectionImplModifierSchema = z.object({
  type: z.literal("Chat").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
});

export type ChatSectionImplModifier = z.infer<
  typeof ChatSectionImplModifierSchema
>;

export function createChatSectionImplModifier(
  options: Partial<ChatSectionImplModifier> = {},
): ChatSectionImplModifier {
  return ChatSectionImplModifierSchema.parse(options);
}

export const BrowserSectionImplModifierSchema = z.object({
  type: z.literal("Browser").optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  hideColumn: z.boolean().optional(),
});

export type BrowserSectionImplModifier = z.infer<
  typeof BrowserSectionImplModifierSchema
>;

export function createBrowserSectionImplModifier(
  options: Partial<BrowserSectionImplModifier> = {},
): BrowserSectionImplModifier {
  return BrowserSectionImplModifierSchema.parse(options);
}

export const BaseSectionImplModifierUnionSchema = z.union([
  CallableSectionImplModifierSchema,
  DictSectionImplModifierSchema,
  ListRootSectionImplModifierSchema,
  DictRootSectionImplModifierSchema,
  GroupSectionImplModifierSchema,
  ImageSectionImplModifierSchema,
  ChartSectionImplModifierSchema,
  DrawSectionImplModifierSchema,
  TextBlockSectionImplModifierSchema,
  SocialSectionImplModifierSchema,
  GlobalVariablesSectionImplModifierSchema,
  CodeSectionImplModifierSchema,
  GenPythonCodeSectionImplModifierSchema,
  TerminalSectionImplModifierSchema,
  IFrameSectionImplModifierSchema,
  ChatSectionImplModifierSchema,
  BrowserSectionImplModifierSchema,
]);

export type BaseSectionImplModifierUnion = z.infer<
  typeof BaseSectionImplModifierUnionSchema
>;

export const BaseSectionImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplModifierSchema,
    DictSectionImplModifierSchema,
    ListRootSectionImplModifierSchema,
    DictRootSectionImplModifierSchema,
    GroupSectionImplModifierSchema,
    ImageSectionImplModifierSchema,
    ChartSectionImplModifierSchema,
    DrawSectionImplModifierSchema,
    TextBlockSectionImplModifierSchema,
    SocialSectionImplModifierSchema,
    GlobalVariablesSectionImplModifierSchema,
    CodeSectionImplModifierSchema,
    GenPythonCodeSectionImplModifierSchema,
    TerminalSectionImplModifierSchema,
    IFrameSectionImplModifierSchema,
    ChatSectionImplModifierSchema,
    BrowserSectionImplModifierSchema,
  ]);

export type BaseSectionImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseSectionImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseSectionImplModifierUnionWithDiscriminator(
  options: Partial<BaseSectionImplModifierUnionWithDiscriminator> = {},
): BaseSectionImplModifierUnionWithDiscriminator {
  return BaseSectionImplModifierUnionWithDiscriminatorSchema.parse(options);
}

export const BaseSectionWithParamsImplModifierUnionSchema = z.union([
  CallableSectionImplModifierSchema,
  DictSectionImplModifierSchema,
  GlobalVariablesSectionImplModifierSchema,
]);

export type BaseSectionWithParamsImplModifierUnion = z.infer<
  typeof BaseSectionWithParamsImplModifierUnionSchema
>;

export const BaseSectionWithParamsImplModifierUnionWithDiscriminatorSchema =
  z.discriminatedUnion("type", [
    CallableSectionImplModifierSchema,
    DictSectionImplModifierSchema,
    GlobalVariablesSectionImplModifierSchema,
  ]);

export type BaseSectionWithParamsImplModifierUnionWithDiscriminator = z.infer<
  typeof BaseSectionWithParamsImplModifierUnionWithDiscriminatorSchema
>;

export function createBaseSectionWithParamsImplModifierUnionWithDiscriminator(
  options: Partial<BaseSectionWithParamsImplModifierUnionWithDiscriminator> = {},
): BaseSectionWithParamsImplModifierUnionWithDiscriminator {
  return BaseSectionWithParamsImplModifierUnionWithDiscriminatorSchema.parse(
    options,
  );
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  artifactGroupIds: z.array(z.string()).default([]),
});

export type ImageSectionImpl = z.infer<typeof ImageSectionImplSchema>;

export function createImageSectionImpl(
  options: Partial<ImageSectionImpl> = {},
): ImageSectionImpl {
  return ImageSectionImplSchema.parse(options);
}

export const ChartSectionImplSchema = z.object({
  type: z.literal("Chart").default(SectionTypeEnum.Chart),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  renderedValue: z.any().default(null),
  artifactGroupIds: z.array(z.string()).default([]),
  chartSettings: ChartSettingsSchema.default(createChartSettings),
});

export type ChartSectionImpl = z.infer<typeof ChartSectionImplSchema>;

export function createChartSectionImpl(
  options: Partial<ChartSectionImpl> = {},
): ChartSectionImpl {
  return ChartSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  renderedValue: z.any().default(null),
  artifactGroupIds: z.array(z.string()).default([]),
  canvasSettings: DrawAreaCanvasSettingsSchema.default(
    createDrawAreaCanvasSettings,
  ),
});

export type DrawSectionImpl = z.infer<typeof DrawSectionImplSchema>;

export function createDrawSectionImpl(
  options: Partial<DrawSectionImpl> = {},
): DrawSectionImpl {
  return DrawSectionImplSchema.parse(options);
}

export const BaseArtifactSectionImplUnionSchema = z.union([
  ImageSectionImplSchema,
  ChartSectionImplSchema,
  DrawSectionImplSchema,
]);

export type BaseArtifactSectionImplUnion = z.infer<
  typeof BaseArtifactSectionImplUnionSchema
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

export const BaseCanvasSectionImplUnionSchema = z.union([
  ChartSectionImplSchema,
  DrawSectionImplSchema,
]);

export type BaseCanvasSectionImplUnion = z.infer<
  typeof BaseCanvasSectionImplUnionSchema
>;

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

export const CodeSectionImplSchema = z.object({
  type: z.literal("Code").default(SectionTypeEnum.Code),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default(""),
  codeLanguage: z.enum(CodeLanguageEnum).default(CodeLanguageEnum.python),
});

export type CodeSectionImpl = z.infer<typeof CodeSectionImplSchema>;

export function createCodeSectionImpl(
  options: Partial<CodeSectionImpl> = {},
): CodeSectionImpl {
  return CodeSectionImplSchema.parse(options);
}

export const GenPythonCodeSectionImplSchema = z.object({
  type: z.literal("GenPythonCode").default(SectionTypeEnum.GenPythonCode),
  id: z.string().default(create_new_id),
  name: z.string().default("Generated Python Code"),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default(""),
});

export type GenPythonCodeSectionImpl = z.infer<
  typeof GenPythonCodeSectionImplSchema
>;

export function createGenPythonCodeSectionImpl(
  options: Partial<GenPythonCodeSectionImpl> = {},
): GenPythonCodeSectionImpl {
  return GenPythonCodeSectionImplSchema.parse(options);
}

export const BaseCodeSectionImplUnionSchema = z.union([
  CodeSectionImplSchema,
  GenPythonCodeSectionImplSchema,
]);

export type BaseCodeSectionImplUnion = z.infer<
  typeof BaseCodeSectionImplUnionSchema
>;

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

export const DictSectionImplSchema = z.object({
  type: z.literal("Dict").default(SectionTypeEnum.Dict),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default(""),
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
  options: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return DictSectionImplSchema.parse(options);
}

export const GlobalVariablesSectionImplSchema = z.object({
  type: z.literal("GlobalVariables").default(SectionTypeEnum.GlobalVariables),
  id: z.string().default(create_new_id),
  name: z.string().default("Global Variables"),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default(""),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  topLevelParamIds: z.array(z.string()).default([]),
});

export type GlobalVariablesSectionImpl = z.infer<
  typeof GlobalVariablesSectionImplSchema
>;

export function createGlobalVariablesSectionImpl(
  options: Partial<GlobalVariablesSectionImpl> = {},
): GlobalVariablesSectionImpl {
  return GlobalVariablesSectionImplSchema.parse(options);
}

export const BaseDictSectionImplUnionSchema = z.union([
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseDictSectionImplUnion = z.infer<
  typeof BaseDictSectionImplUnionSchema
>;

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

export const ListRootSectionImplSchema = z.object({
  type: z.literal("ListRoot").default(SectionTypeEnum.ListRoot),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type ListRootSectionImpl = z.infer<typeof ListRootSectionImplSchema>;

export function createListRootSectionImpl(
  options: Partial<ListRootSectionImpl> = {},
): ListRootSectionImpl {
  return ListRootSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type DictRootSectionImpl = z.infer<typeof DictRootSectionImplSchema>;

export function createDictRootSectionImpl(
  options: Partial<DictRootSectionImpl> = {},
): DictRootSectionImpl {
  return DictRootSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  children: z.array(z.string()).default([]),
  isHorizontalOrientation: z.boolean().default(false),
});

export type GroupSectionImpl = z.infer<typeof GroupSectionImplSchema>;

export function createGroupSectionImpl(
  options: Partial<GroupSectionImpl> = {},
): GroupSectionImpl {
  return GroupSectionImplSchema.parse(options);
}

export const BaseParentSectionImplUnionSchema = z.union([
  ListRootSectionImplSchema,
  DictRootSectionImplSchema,
  GroupSectionImplSchema,
]);

export type BaseParentSectionImplUnion = z.infer<
  typeof BaseParentSectionImplUnionSchema
>;

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

export const CallableSectionImplSchema = z.object({
  type: z.literal("Callable").default(SectionTypeEnum.Callable),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default(""),
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
  options: Partial<CallableSectionImpl> = {},
): CallableSectionImpl {
  return CallableSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  renderMarkdown: z.boolean().default(false),
  headingAsSectionName: z.boolean().default(false),
  displayMode: z.string().default("GUI"),
  description: z.string().default(""),
});

export type TextBlockSectionImpl = z.infer<typeof TextBlockSectionImplSchema>;

export function createTextBlockSectionImpl(
  options: Partial<TextBlockSectionImpl> = {},
): TextBlockSectionImpl {
  return TextBlockSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  social: z.string().default(""),
});

export type SocialSectionImpl = z.infer<typeof SocialSectionImplSchema>;

export function createSocialSectionImpl(
  options: Partial<SocialSectionImpl> = {},
): SocialSectionImpl {
  return SocialSectionImplSchema.parse(options);
}

export const TerminalSectionImplSchema = z.object({
  type: z.literal("Terminal").default(SectionTypeEnum.Terminal),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type TerminalSectionImpl = z.infer<typeof TerminalSectionImplSchema>;

export function createTerminalSectionImpl(
  options: Partial<TerminalSectionImpl> = {},
): TerminalSectionImpl {
  return TerminalSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type IFrameSectionImpl = z.infer<typeof IFrameSectionImplSchema>;

export function createIFrameSectionImpl(
  options: Partial<IFrameSectionImpl> = {},
): IFrameSectionImpl {
  return IFrameSectionImplSchema.parse(options);
}

export const ChatSectionImplSchema = z.object({
  type: z.literal("Chat").default(SectionTypeEnum.Chat),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  parentId: z.union([z.string(), z.null()]).default(null),
  isFrozen: z.boolean().default(false),
  visibility: VisibilitySchema.default(createVisibility),
  isInOtherProjectConfigs: z.boolean().default(false),
  size: SectionSizeSchema.default(createSectionSize),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type ChatSectionImpl = z.infer<typeof ChatSectionImplSchema>;

export function createChatSectionImpl(
  options: Partial<ChatSectionImpl> = {},
): ChatSectionImpl {
  return ChatSectionImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  hideColumn: z.boolean().default(false),
});

export type BrowserSectionImpl = z.infer<typeof BrowserSectionImplSchema>;

export function createBrowserSectionImpl(
  options: Partial<BrowserSectionImpl> = {},
): BrowserSectionImpl {
  return BrowserSectionImplSchema.parse(options);
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

export const BaseSectionWithParamsImplUnionSchema = z.union([
  CallableSectionImplSchema,
  DictSectionImplSchema,
  GlobalVariablesSectionImplSchema,
]);

export type BaseSectionWithParamsImplUnion = z.infer<
  typeof BaseSectionWithParamsImplUnionSchema
>;

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

export const SectionCoreSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  implLayerings: z.array(z.string()).default([]),
  defaultImplLayering: z.union([z.string(), z.null()]).default(null),
});

export type SectionCore = z.infer<typeof SectionCoreSchema>;

export function createSectionCore(
  options: Partial<SectionCore> = {},
): SectionCore {
  return SectionCoreSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
});

export type BaseSectionImpl = z.infer<typeof BaseSectionImplSchema>;

export function createBaseSectionImpl(
  options: Partial<BaseSectionImpl> = {},
): BaseSectionImpl {
  return BaseSectionImplSchema.parse(options);
}

export const ImplLayeringSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  impl: z.string(),
  modifier: z.any(),
});

export type ImplLayering = z.infer<typeof ImplLayeringSchema>;

export function createImplLayering(
  options: Partial<ImplLayering> = {},
): ImplLayering {
  return ImplLayeringSchema.parse(options);
}

export const CodeObjCoreSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  implLayerings: z.array(z.string()).default([]),
  defaultImplLayering: z.union([z.string(), z.null()]).default(null),
});

export type CodeObjCore = z.infer<typeof CodeObjCoreSchema>;

export function createCodeObjCore(
  options: Partial<CodeObjCore> = {},
): CodeObjCore {
  return CodeObjCoreSchema.parse(options);
}

export const BaseCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
});

export type BaseCodeObjImpl = z.infer<typeof BaseCodeObjImplSchema>;

export function createBaseCodeObjImpl(
  options: Partial<BaseCodeObjImpl> = {},
): BaseCodeObjImpl {
  return BaseCodeObjImplSchema.parse(options);
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
  w: z.number().default(1),
  h: z.number().default(1),
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
  previewImgColor: z.string().default("bg-blue-500/60 dark:bg-blue-600/30"),
  viewport: z.union([ViewportSchema, z.null()]).default(createViewport),
  viewingEditingMode: z
    .enum(ViewingEditingModeEnum)
    .default(ViewingEditingModeEnum.DEV),
  genCodePrefix: z.string().default(""),
  genCodeSuffix: z.string().default(""),
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
  sections: z.record(z.string(), SectionCoreSchema).default({}),
  sectionImpls: z.record(z.string(), BaseSectionImplSchema).default({}),
  sectionImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
  codeObjs: z.record(z.string(), CodeObjCoreSchema).default({}),
  codeObjImpls: z.record(z.string(), BaseCodeObjImplSchema).default({}),
  codeObjImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
  projectConfig: ProjectConfigSchema,
});

export type ProjectStateSingleConfig = z.infer<
  typeof ProjectStateSingleConfigSchema
>;

export function createProjectStateSingleConfig(
  options: Partial<ProjectStateSingleConfig> = {},
): ProjectStateSingleConfig {
  return ProjectStateSingleConfigSchema.parse(options);
}

export const WebsocketMsgUpdateBackendProjectStateContentSchema = z.object({
  projectState: ProjectStateSingleConfigSchema,
  requestRenameRefactor: z.boolean(),
});

export type WebsocketMsgUpdateBackendProjectStateContent = z.infer<
  typeof WebsocketMsgUpdateBackendProjectStateContentSchema
>;

export function createWebsocketMsgUpdateBackendProjectStateContent(
  options: Partial<WebsocketMsgUpdateBackendProjectStateContent> = {},
): WebsocketMsgUpdateBackendProjectStateContent {
  return WebsocketMsgUpdateBackendProjectStateContentSchema.parse(options);
}

export const WebsocketMsgUpdateBackendProjectStateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: WebsocketMsgUpdateBackendProjectStateContentSchema,
  messageType: z
    .literal("UpdateBackendProjectState")
    .default(WebsocketMsgTypeForBackendEnum.UpdateBackendProjectState),
});

export type WebsocketMsgUpdateBackendProjectState = z.infer<
  typeof WebsocketMsgUpdateBackendProjectStateSchema
>;

export function createWebsocketMsgUpdateBackendProjectState(
  options: Partial<WebsocketMsgUpdateBackendProjectState> = {},
): WebsocketMsgUpdateBackendProjectState {
  return WebsocketMsgUpdateBackendProjectStateSchema.parse(options);
}

export const WebsocketMsgForBackendUnionSchema = z.union([
  WebsocketMsgCurrentAddressUpdateSchema,
  WebsocketMsgUpdateBackendProjectStateSchema,
]);

export type WebsocketMsgForBackendUnion = z.infer<
  typeof WebsocketMsgForBackendUnionSchema
>;

export const WebsocketMsgForBackendUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgCurrentAddressUpdateSchema,
    WebsocketMsgUpdateBackendProjectStateSchema,
  ]);

export type WebsocketMsgForBackendUnionWithDiscriminator = z.infer<
  typeof WebsocketMsgForBackendUnionWithDiscriminatorSchema
>;

export function createWebsocketMsgForBackendUnionWithDiscriminator(
  options: Partial<WebsocketMsgForBackendUnionWithDiscriminator> = {},
): WebsocketMsgForBackendUnionWithDiscriminator {
  return WebsocketMsgForBackendUnionWithDiscriminatorSchema.parse(options);
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

export const WebsocketMsgSpecificFileWatcherUpdateSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
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

export const SettaNotificationSchema = z.object({
  id: z.string().default(create_new_id),
  projectConfigId: z.string().default("NOTIFICATION_IS_FOR_ALL_PROJECTS"),
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

export const WebsocketMsgNewTerminalCreatedSchema = z.object({
  id: z.union([z.string(), z.null()]).default(null),
  content: z.any(),
  messageType: z
    .literal("NewTerminalCreated")
    .default(WebsocketMsgTypeForFrontendEnum.NewTerminalCreated),
});

export type WebsocketMsgNewTerminalCreated = z.infer<
  typeof WebsocketMsgNewTerminalCreatedSchema
>;

export function createWebsocketMsgNewTerminalCreated(
  options: Partial<WebsocketMsgNewTerminalCreated> = {},
): WebsocketMsgNewTerminalCreated {
  return WebsocketMsgNewTerminalCreatedSchema.parse(options);
}

export const WebsocketMsgForFrontendUnionSchema = z.union([
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgAllDependenciesSchema,
  WebsocketMsgSpecificFileWatcherUpdateSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgUUIDMappingForLLMSchema,
  WebsocketMsgArtifactSchema,
  WebsocketMsgReturnRenameRefactorResultsSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgNewTerminalCreatedSchema,
]);

export type WebsocketMsgForFrontendUnion = z.infer<
  typeof WebsocketMsgForFrontendUnionSchema
>;

export const WebsocketMsgForFrontendUnionWithDiscriminatorSchema =
  z.discriminatedUnion("messageType", [
    WebsocketMsgAllConnectionsSchema,
    WebsocketMsgLSPDiagnosticsSchema,
    WebsocketMsgTerminalMetadataSchema,
    WebsocketMsgAllDependenciesSchema,
    WebsocketMsgSpecificFileWatcherUpdateSchema,
    WebsocketMsgNotificationSchema,
    WebsocketMsgLLMStreamingResponseSchema,
    WebsocketMsgUUIDMappingForLLMSchema,
    WebsocketMsgArtifactSchema,
    WebsocketMsgReturnRenameRefactorResultsSchema,
    WebsocketMsgUpdateFrontendProjectStateSchema,
    WebsocketMsgNewTerminalCreatedSchema,
  ]);

export type WebsocketMsgForFrontendUnionWithDiscriminator = z.infer<
  typeof WebsocketMsgForFrontendUnionWithDiscriminatorSchema
>;

export function createWebsocketMsgForFrontendUnionWithDiscriminator(
  options: Partial<WebsocketMsgForFrontendUnionWithDiscriminator> = {},
): WebsocketMsgForFrontendUnionWithDiscriminator {
  return WebsocketMsgForFrontendUnionWithDiscriminatorSchema.parse(options);
}

export const BaseChildlessCodeObjImplModifierSchema = z.object({
  type: z.any().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
  defaultVal: z.string().optional(),
  value: z.string().optional(),
});

export type BaseChildlessCodeObjImplModifier = z.infer<
  typeof BaseChildlessCodeObjImplModifierSchema
>;

export function createBaseChildlessCodeObjImplModifier(
  options: Partial<BaseChildlessCodeObjImplModifier> = {},
): BaseChildlessCodeObjImplModifier {
  return BaseChildlessCodeObjImplModifierSchema.parse(options);
}

export const BaseCodeObjImplModifierSchema = z.object({
  type: z.any().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
});

export type BaseCodeObjImplModifier = z.infer<
  typeof BaseCodeObjImplModifierSchema
>;

export function createBaseCodeObjImplModifier(
  options: Partial<BaseCodeObjImplModifier> = {},
): BaseCodeObjImplModifier {
  return BaseCodeObjImplModifierSchema.parse(options);
}

export const BaseParamCodeObjImplModifierSchema = z.object({
  type: z.any().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  coreNameType: z.enum(ParamNameTypeEnum).optional(),
  coreNameEditable: z.boolean().optional(),
  passingStyle: z.enum(ParameterPassingStyleEnum).optional(),
});

export type BaseParamCodeObjImplModifier = z.infer<
  typeof BaseParamCodeObjImplModifierSchema
>;

export function createBaseParamCodeObjImplModifier(
  options: Partial<BaseParamCodeObjImplModifier> = {},
): BaseParamCodeObjImplModifier {
  return BaseParamCodeObjImplModifierSchema.parse(options);
}

export const BaseParentCodeObjImplModifierSchema = z.object({
  type: z.any().optional(),
  description: z.string().optional(),
  isPreset: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type BaseParentCodeObjImplModifier = z.infer<
  typeof BaseParentCodeObjImplModifierSchema
>;

export function createBaseParentCodeObjImplModifier(
  options: Partial<BaseParentCodeObjImplModifier> = {},
): BaseParentCodeObjImplModifier {
  return BaseParentCodeObjImplModifierSchema.parse(options);
}

export const BaseArtifactSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
});

export type BaseArtifactSectionImplModifier = z.infer<
  typeof BaseArtifactSectionImplModifierSchema
>;

export function createBaseArtifactSectionImplModifier(
  options: Partial<BaseArtifactSectionImplModifier> = {},
): BaseArtifactSectionImplModifier {
  return BaseArtifactSectionImplModifierSchema.parse(options);
}

export const BaseCanvasSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  renderedValue: z.any().optional(),
});

export type BaseCanvasSectionImplModifier = z.infer<
  typeof BaseCanvasSectionImplModifierSchema
>;

export function createBaseCanvasSectionImplModifier(
  options: Partial<BaseCanvasSectionImplModifier> = {},
): BaseCanvasSectionImplModifier {
  return BaseCanvasSectionImplModifierSchema.parse(options);
}

export const BaseCodeSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  code: z.string().optional(),
});

export type BaseCodeSectionImplModifier = z.infer<
  typeof BaseCodeSectionImplModifierSchema
>;

export function createBaseCodeSectionImplModifier(
  options: Partial<BaseCodeSectionImplModifier> = {},
): BaseCodeSectionImplModifier {
  return BaseCodeSectionImplModifierSchema.parse(options);
}

export const BaseDictSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
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
});

export type BaseDictSectionImplModifier = z.infer<
  typeof BaseDictSectionImplModifierSchema
>;

export function createBaseDictSectionImplModifier(
  options: Partial<BaseDictSectionImplModifier> = {},
): BaseDictSectionImplModifier {
  return BaseDictSectionImplModifierSchema.parse(options);
}

export const BaseParentSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  children: z.array(z.string()).optional(),
});

export type BaseParentSectionImplModifier = z.infer<
  typeof BaseParentSectionImplModifierSchema
>;

export function createBaseParentSectionImplModifier(
  options: Partial<BaseParentSectionImplModifier> = {},
): BaseParentSectionImplModifier {
  return BaseParentSectionImplModifierSchema.parse(options);
}

export const BaseSectionImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
});

export type BaseSectionImplModifier = z.infer<
  typeof BaseSectionImplModifierSchema
>;

export function createBaseSectionImplModifier(
  options: Partial<BaseSectionImplModifier> = {},
): BaseSectionImplModifier {
  return BaseSectionImplModifierSchema.parse(options);
}

export const BaseSectionWithParamsImplModifierSchema = z.object({
  type: z.any().optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  isFrozen: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  size: SectionSizeSchema.optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  isMinimized: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
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

export type BaseSectionWithParamsImplModifier = z.infer<
  typeof BaseSectionWithParamsImplModifierSchema
>;

export function createBaseSectionWithParamsImplModifier(
  options: Partial<BaseSectionWithParamsImplModifier> = {},
): BaseSectionWithParamsImplModifier {
  return BaseSectionWithParamsImplModifierSchema.parse(options);
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
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  coreNameType: z.enum(ParamNameTypeEnum).default(ParamNameTypeEnum.TEXT),
  coreNameEditable: z.boolean().default(false),
  passingStyle: z
    .enum(ParameterPassingStyleEnum)
    .default(ParameterPassingStyleEnum.DEFAULT),
  defaultVal: z.string().default(""),
  value: z.string().default(""),
});

export type BaseChildlessCodeObjImpl = z.infer<
  typeof BaseChildlessCodeObjImplSchema
>;

export function createBaseChildlessCodeObjImpl(
  options: Partial<BaseChildlessCodeObjImpl> = {},
): BaseChildlessCodeObjImpl {
  return BaseChildlessCodeObjImplSchema.parse(options);
}

export const BaseParamCodeObjImplSchema = z.object({
  type: z.any(),
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  description: z.string().default(""),
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
  description: z.string().default(""),
  isPreset: z.boolean().default(false),
  children: z.array(z.string()).default([]),
});

export type BaseParentCodeObjImpl = z.infer<typeof BaseParentCodeObjImplSchema>;

export function createBaseParentCodeObjImpl(
  options: Partial<BaseParentCodeObjImpl> = {},
): BaseParentCodeObjImpl {
  return BaseParentCodeObjImplSchema.parse(options);
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default(""),
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

export const ProjectStateBackendSchema = z.object({
  sections: z.record(z.string(), SectionCoreSchema).default({}),
  sectionImpls: z.record(z.string(), BaseSectionImplSchema).default({}),
  sectionImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
  codeObjs: z.record(z.string(), CodeObjCoreSchema).default({}),
  codeObjImpls: z.record(z.string(), BaseCodeObjImplSchema).default({}),
  codeObjImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
  projectConfigs: z.record(z.string(), ProjectConfigSchema).default({}),
  defaultProjectConfigId: z.union([z.string(), z.null()]).default(null),
});

export type ProjectStateBackend = z.infer<typeof ProjectStateBackendSchema>;

export function createProjectStateBackend(
  options: Partial<ProjectStateBackend> = {},
): ProjectStateBackend {
  return ProjectStateBackendSchema.parse(options);
}

export const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export type Position = z.infer<typeof PositionSchema>;

export function createPosition(options: Partial<Position> = {}): Position {
  return PositionSchema.parse(options);
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

export const ProjectStateCoreSchema = z.object({
  sections: z.record(z.string(), SectionCoreSchema).default({}),
  sectionImpls: z.record(z.string(), BaseSectionImplSchema).default({}),
  sectionImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
  codeObjs: z.record(z.string(), CodeObjCoreSchema).default({}),
  codeObjImpls: z.record(z.string(), BaseCodeObjImplSchema).default({}),
  codeObjImplLayerings: z.record(z.string(), ImplLayeringSchema).default({}),
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  code: z.string().default(""),
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
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  isMinimized: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  codeObjImplLayeringMap: z.record(z.string(), z.string()).default({}),
  hideUnpinnedParams: z.boolean().default(false),
  paramFilter: z.string().default(""),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  configLanguage: z.enum(ConfigLanguageEnum).default(ConfigLanguageEnum.python),
  pinnedParams: z.array(z.string()).default([]),
  pinnedAreaHeight: z
    .union([z.number(), z.literal("auto")])
    .default(SectionSizeModeEnum.auto),
  selectedParams: z.array(z.string()).default([]),
  ignoreTypeErrors: z.record(z.string(), z.boolean()).default({}),
  topLevelParamIds: z.array(z.string()).default([]),
});

export type BaseDictSectionImpl = z.infer<typeof BaseDictSectionImplSchema>;

export function createBaseDictSectionImpl(
  options: Partial<BaseDictSectionImpl> = {},
): BaseDictSectionImpl {
  return BaseDictSectionImplSchema.parse(options);
}

export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().default(true),
  autosave: z.boolean().default(false),
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

export const SettingsGUISchema = z.object({
  snapGrid: z.tuple([z.int(), z.int()]),
  showGridLines: z.boolean().default(true),
  gridPattern: z
    .enum(BackgroundVariantEnum)
    .default(BackgroundVariantEnum.dots),
  gridPatternSize: z.int().default(2),
  gridColor: z.string().default("#afbacf"),
  gridColorDarkMode: z.string().default("#2b364a"),
  defaultZoomLevel: z.number().default(1.0),
  minZoom: z.number().default(0.1),
  maxZoom: z.number().default(10.0),
  panOnDrag: z.boolean().default(true),
  panOnScroll: z.boolean().default(true),
  panOnScrollSpeed: z.number().default(1.0),
  panOnScrollMode: z.string().default("free"),
  zoomOnScroll: z.boolean().default(true),
  zoomOnPinch: z.boolean().default(true),
  zoomOnDoubleClick: z.boolean().default(false),
  selectionMode: z.string().default("partial"),
  leftSidePaneShiftsMap: z.boolean().default(true),
  transitionDuration: z.int().default(50),
});

export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

export function createSettingsGUI(
  options: Partial<SettingsGUI> = {},
): SettingsGUI {
  return SettingsGUISchema.parse(options);
}

export const SettingsShortcutsSchema = z.object({
  newCardShortcut: z.string().default("N"),
  newGroupShortcut: z.string().default("G"),
  typeCheckShortcut: z.string().default(""),
  newProjectConfigShortcut: z.string().default(""),
  undoShortcut: z.string().default("Mod + Z"),
  redoShortcut: z.string().default("Mod + Shift + Z"),
  groupShortcut: z.string().default("Mod + G"),
  ungroupShortcut: z.string().default("Shift + Mod + G"),
  saveShortcut: z.string().default("Mod + S"),
  saveAsShortcut: z.string().default("Mod + Shift + S"),
  loadShortcut: z.string().default("Mod + L"),
  searchShortcut: z.string().default("Mod + K"),
  advancedSearchShortcut: z.string().default("Mod + P"),
  commandPaletteShortcut: z.string().default("Mod + Shift + P"),
  resetZoomShortcut: z.string().default("Mod + Comma"),
  copyShortcut: z.string().default("Mod + C"),
  pasteShortcut: z.string().default("Mod + V"),
  pasteAsRefShortcut: z.string().default("Mod + Shift + V"),
  sortingShortcut: z.string().default("Mod + Alt"),
  movingFreeShortcut: z.string().default("Alt"),
  showTooltipShortcut: z.string().default("Q"),
  tooltipToPlaintextShortcut: z.string().default("Q + S"),
  tooltipToMarkdownShortcut: z.string().default("Q + W"),
  freezeTooltipShortcut: z.string().default("Q + F"),
  frozenTooltipToPlaintextShortcut: z.string().default("S"),
  frozenTooltipToMarkdownShortcut: z.string().default("W"),
  incrementTooltipPageShortcut: z.string().default("Q + ArrowRight"),
  decrementTooltipPageShortcut: z.string().default("Q + ArrowLeft"),
  copyTooltipTextShortcut: z.string().default("Q + C"),
  frozenTooltipIncrementShortcut: z.string().default("ArrowRight"),
  frozenTooltipDecrementShortcut: z.string().default("ArrowLeft"),
  frozenTooltipCopyShortcut: z.string().default("C"),
  newTerminalShortcut: z.string().default("Ctrl + `"),
  fitViewShortcut: z.string().default("F"),
  zoomToMouseShortcut: z.string().default("Z"),
  deleteSectionShortcut: z.string().default("Backspace"),
  selectAll: z.string().default("Mod + A"),
  selectTopLevelNonGroupSections: z.string().default("Mod + Shift + A"),
  showVersionsTabShortcut: z.string().default("V"),
  showParamUITypeTabShortcut: z.string().default("P"),
  showProjectOverviewTabShortcut: z.string().default("O"),
  runCodeShortcut: z.string().default("Mod + Enter"),
  runEntryCodeBlockShortcut: z.string().default("Mod + Shift + Enter"),
  sendProjectToAllInteractiveCode: z.string().default("Alt + I"),
  paramSelect: z.string().default("Mod + Shift"),
  formatCode: z.string().default("Shift + Alt + F"),
  selectionKeyCode: z.string().default("Shift"),
  multiSelectionKeyCode: z.string().default("Mod"),
  panActivationKeyCode: z.string().default("Space"),
  zoomActivationKeyCode: z.string().default("Mod"),
  zoomInShortcut: z.string().default("Equal"),
  zoomOutShortcut: z.string().default("Minus"),
  restartLanguageServerShortcut: z.string().default("Alt + Shift + R"),
});

export type SettingsShortcuts = z.infer<typeof SettingsShortcutsSchema>;

export function createSettingsShortcuts(
  options: Partial<SettingsShortcuts> = {},
): SettingsShortcuts {
  return SettingsShortcutsSchema.parse(options);
}

export const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.default(createSettingsShortcuts),
  gui: SettingsGUISchema.default(createSettingsGUI),
  backend: SettingsBackendSchema.default(createSettingsBackend),
  languageServer: z.record(z.string(), z.any()),
  sections: z.record(z.string(), z.any()),
});

export type SettingsState = z.infer<typeof SettingsStateSchema>;

export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  return SettingsStateSchema.parse(options);
}

export const SimplifiedCodeInfoSchema = z.object({
  name: z.string(),
  defaultVal: z.string().default(""),
  description: z.string().default(""),
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

export const SetSelectedItemRequestSchema = z.object({
  projectConfigId: z.string(),
  sectionId: z.string(),
  selectedItemName: z.string(),
  refetchParams: z.boolean(),
});

export type SetSelectedItemRequest = z.infer<
  typeof SetSelectedItemRequestSchema
>;

export function createSetSelectedItemRequest(
  options: Partial<SetSelectedItemRequest> = {},
): SetSelectedItemRequest {
  return SetSelectedItemRequestSchema.parse(options);
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
  fileWatchGroupName: z.string(),
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
  sections: z.record(z.string(), SectionCoreSchema),
  sectionImpls: z.record(z.string(), BaseSectionImplSchema),
  sectionImplLayerings: z.record(z.string(), ImplLayeringSchema),
  codeObjs: z.record(z.string(), CodeObjCoreSchema),
  codeObjImpls: z.record(z.string(), BaseCodeObjImplSchema),
  codeObjImplLayerings: z.record(z.string(), ImplLayeringSchema),
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
  settings: z.record(z.string(), z.any()),
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

export function isBaseChildlessCodeObjImpl(
  x: BaseCodeObjImpl,
): x is BaseChildlessCodeObjImpl {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
}

export function isBaseCodeObjImpl(x: BaseCodeObjImpl): x is BaseCodeObjImpl {
  return BaseCodeObjImplTypeSet.has(x.type);
}

export function isBaseParamCodeObjImpl(
  x: BaseCodeObjImpl,
): x is BaseParamCodeObjImpl {
  return BaseParamCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentCodeObjImpl(
  x: BaseCodeObjImpl,
): x is BaseParentCodeObjImpl {
  return BaseParentCodeObjImplTypeSet.has(x.type);
}

export function isBaseArtifactSectionImpl(
  x: BaseSectionImpl,
): x is BaseArtifactSectionImpl {
  return BaseArtifactSectionImplTypeSet.has(x.type);
}

export function isBaseCanvasSectionImpl(
  x: BaseSectionImpl,
): x is BaseCanvasSectionImpl {
  return BaseCanvasSectionImplTypeSet.has(x.type);
}

export function isBaseCodeSectionImpl(
  x: BaseSectionImpl,
): x is BaseCodeSectionImpl {
  return BaseCodeSectionImplTypeSet.has(x.type);
}

export function isBaseDictSectionImpl(
  x: BaseSectionImpl,
): x is BaseDictSectionImpl {
  return BaseDictSectionImplTypeSet.has(x.type);
}

export function isBaseParentSectionImpl(
  x: BaseSectionImpl,
): x is BaseParentSectionImpl {
  return BaseParentSectionImplTypeSet.has(x.type);
}

export function isBaseSectionImpl(x: BaseSectionImpl): x is BaseSectionImpl {
  return BaseSectionImplTypeSet.has(x.type);
}

export function isBaseSectionWithParamsImpl(
  x: BaseSectionImpl,
): x is BaseSectionWithParamsImpl {
  return BaseSectionWithParamsImplTypeSet.has(x.type);
}
