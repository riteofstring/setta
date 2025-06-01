import { z } from "zod/v4";

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export const APIKeysSchema = z.record(z.string(), z.string());

export type APIKeys = z.infer<typeof APIKeysSchema>;

export function createAPIKeys(options: APIKeys) {
  return APIKeysSchema.parse(options);
}

export const IDToUUIDForLLMSchema = z.record(IDSchema, z.string());

export type IDToUUIDForLLM = z.infer<typeof IDToUUIDForLLMSchema>;

export function createIDToUUIDForLLM(options: IDToUUIDForLLM) {
  return IDToUUIDForLLMSchema.parse(options);
}

export const UUIDToIDForLLMSchema = z.record(z.string(), IDSchema);

export type UUIDToIDForLLM = z.infer<typeof UUIDToIDForLLMSchema>;

export function createUUIDToIDForLLM(options: UUIDToIDForLLM) {
  return UUIDToIDForLLMSchema.parse(options);
}

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

export function createJSONValueType(options: JSONValueType) {
  return JSONValueTypeSchema.parse(options);
}

export const ChatRoleSchema = z.literal(["user", "assistant"]);

export type ChatRole = z.infer<typeof ChatRoleSchema>;

export function createChatRole(options: ChatRole) {
  return ChatRoleSchema.parse(options);
}

export const WebSearchResultBlockSchema = z.object({
  encrypted_content: z.string(),
  page_age: z.union([z.string(), z.null()]).default(null),
  title: z.string(),
  type: z.literal("web_search_result"),
  url: z.string(),
});

export type WebSearchResultBlock = z.infer<typeof WebSearchResultBlockSchema>;

export function createWebSearchResultBlock(options: WebSearchResultBlock) {
  return WebSearchResultBlockSchema.parse(options);
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
  options: WebSearchToolResultError,
) {
  return WebSearchToolResultErrorSchema.parse(options);
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
  options: CitationsWebSearchResultLocation,
) {
  return CitationsWebSearchResultLocationSchema.parse(options);
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
  options: CitationContentBlockLocation,
) {
  return CitationContentBlockLocationSchema.parse(options);
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

export function createCitationPageLocation(options: CitationPageLocation) {
  return CitationPageLocationSchema.parse(options);
}

export const CitationCharLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).default(null),
  end_char_index: z.int(),
  start_char_index: z.int(),
  type: z.literal("char_location"),
});

export type CitationCharLocation = z.infer<typeof CitationCharLocationSchema>;

export function createCitationCharLocation(options: CitationCharLocation) {
  return CitationCharLocationSchema.parse(options);
}

export const RedactedThinkingBlockSchema = z.object({
  data: z.string(),
  type: z.literal("redacted_thinking"),
});

export type RedactedThinkingBlock = z.infer<typeof RedactedThinkingBlockSchema>;

export function createRedactedThinkingBlock(options: RedactedThinkingBlock) {
  return RedactedThinkingBlockSchema.parse(options);
}

export const ThinkingBlockSchema = z.object({
  signature: z.string(),
  thinking: z.string(),
  type: z.literal("thinking"),
});

export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

export function createThinkingBlock(options: ThinkingBlock) {
  return ThinkingBlockSchema.parse(options);
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
  options: WebSearchToolResultBlock,
) {
  return WebSearchToolResultBlockSchema.parse(options);
}

export const ServerToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.literal("web_search"),
  type: z.literal("server_tool_use"),
});

export type ServerToolUseBlock = z.infer<typeof ServerToolUseBlockSchema>;

export function createServerToolUseBlock(options: ServerToolUseBlock) {
  return ServerToolUseBlockSchema.parse(options);
}

export const ToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.string(),
  type: z.literal("tool_use"),
});

export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

export function createToolUseBlock(options: ToolUseBlock) {
  return ToolUseBlockSchema.parse(options);
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

export function createTextBlock(options: TextBlock) {
  return TextBlockSchema.parse(options);
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

export function createContentBlock(options: ContentBlock) {
  return ContentBlockSchema.parse(options);
}

export const ArtifactTypeSchema = z.enum([
  "img",
  "brushStrokes",
  "list",
  "chatHistory",
]);

export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export function createArtifactType(options: ArtifactType) {
  return ArtifactTypeSchema.parse(options);
}

export const UITypeNameSchema = z.enum([
  "TEXT",
  "SLIDER",
  "SWITCH",
  "COLOR_PICKER",
  "DROPDOWN",
  "PASSWORD",
  "SECTION",
  "LIST_ROOT",
  "DICT_ROOT",
  "GROUP",
  "IMAGE",
  "CHART",
  "DRAW",
  "TEXT_BLOCK",
  "SOCIAL",
  "GLOBAL_VARIABLES",
  "CODE",
  "GEN_PYTHON_CODE",
  "TERMINAL",
  "IFRAME",
  "CHAT",
  "BROWSER",
]);

export type UITypeName = z.infer<typeof UITypeNameSchema>;

export function createUITypeName(options: UITypeName) {
  return UITypeNameSchema.parse(options);
}

export const UITypePresetTypeSchema = z.enum(["BASE", "USER"]);

export type UITypePresetType = z.infer<typeof UITypePresetTypeSchema>;

export function createUITypePresetType(options: UITypePresetType) {
  return UITypePresetTypeSchema.parse(options);
}

export const CodeInfoTypeSchema = z.enum([
  "parameter",
  "callable",
  "collection",
]);

export type CodeInfoType = z.infer<typeof CodeInfoTypeSchema>;

export function createCodeInfoType(options: CodeInfoType) {
  return CodeInfoTypeSchema.parse(options);
}

export const SettaNotificationTypeSchema = z.enum([
  "success",
  "error",
  "warning",
  "info",
  "save",
]);

export type SettaNotificationType = z.infer<typeof SettaNotificationTypeSchema>;

export function createSettaNotificationType(options: SettaNotificationType) {
  return SettaNotificationTypeSchema.parse(options);
}

export const CodeLanguageSchema = z.enum(["python", "bash"]);

export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;

export function createCodeLanguage(options: CodeLanguage) {
  return CodeLanguageSchema.parse(options);
}

export const ConfigLanguageSchema = z.enum(["python", "json"]);

export type ConfigLanguage = z.infer<typeof ConfigLanguageSchema>;

export function createConfigLanguage(options: ConfigLanguage) {
  return ConfigLanguageSchema.parse(options);
}

export const ParameterPassingStyleSchema = z.enum([
  "DEFAULT",
  "ARGS",
  "KWARGS",
  "POSITIONAL_ONLY",
  "KEYWORD_ONLY",
]);

export type ParameterPassingStyle = z.infer<typeof ParameterPassingStyleSchema>;

export function createParameterPassingStyle(options: ParameterPassingStyle) {
  return ParameterPassingStyleSchema.parse(options);
}

export const SizeSchema = z.enum(["auto"]);

export type Size = z.infer<typeof SizeSchema>;

export function createSize(options: Size) {
  return SizeSchema.parse(options);
}

export const ViewingEditingModeSchema = z.enum(["DEV", "USER", "USER_EDIT"]);

export type ViewingEditingMode = z.infer<typeof ViewingEditingModeSchema>;

export function createViewingEditingMode(options: ViewingEditingMode) {
  return ViewingEditingModeSchema.parse(options);
}

export const ArtifactSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: ArtifactTypeSchema,
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

export function createArtifact(options: Artifact) {
  return ArtifactSchema.parse(options);
}

export const ArtifactWithIdSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: ArtifactTypeSchema,
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

export function createArtifactWithId(options: ArtifactWithId) {
  return ArtifactWithIdSchema.parse(options);
}

export const ArtifactWithoutValueSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: ArtifactTypeSchema,
});

export type ArtifactWithoutValue = z.infer<typeof ArtifactWithoutValueSchema>;

export function createArtifactWithoutValue(options: ArtifactWithoutValue) {
  return ArtifactWithoutValueSchema.parse(options);
}

export const UITypeSchema = z.object({
  id: z.string().default(create_new_id),
  type: UITypeNameSchema.default("TEXT"),
  name: z.string().default(generate_memorable_string),
  presetType: z.union([UITypePresetTypeSchema, z.null()]).default(null),
  config: z.record(z.string(), z.any()).default({}),
});

export type UIType = z.infer<typeof UITypeSchema>;

export function createUIType(options: UIType) {
  return UITypeSchema.parse(options);
}

export const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  blob: z.string(),
});

export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;

export function createBlobResourceContents(options: BlobResourceContents) {
  return BlobResourceContentsSchema.parse(options);
}

export const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).default(null),
  text: z.string(),
});

export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;

export function createTextResourceContents(options: TextResourceContents) {
  return TextResourceContentsSchema.parse(options);
}

export const AnnotationsSchema = z.object({
  audience: z
    .union([z.array(z.literal(["user", "assistant"])), z.null()])
    .default(null),
  priority: z.union([z.number(), z.null()]).default(null),
});

export type Annotations = z.infer<typeof AnnotationsSchema>;

export function createAnnotations(options: Annotations) {
  return AnnotationsSchema.parse(options);
}

export const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

export function createEmbeddedResource(options: EmbeddedResource) {
  return EmbeddedResourceSchema.parse(options);
}

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

export type ImageContent = z.infer<typeof ImageContentSchema>;

export function createImageContent(options: ImageContent) {
  return ImageContentSchema.parse(options);
}

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).default(null),
});

export type TextContent = z.infer<typeof TextContentSchema>;

export function createTextContent(options: TextContent) {
  return TextContentSchema.parse(options);
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

export function createToolResult(options: ToolResult) {
  return ToolResultSchema.parse(options);
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.literal(["user", "assistant"]),
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

export function createChatMessage(options: ChatMessage) {
  return ChatMessageSchema.parse(options);
}

export const ChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
  messages: z.array(ChatMessageSchema),
});

export type Chat = z.infer<typeof ChatSchema>;

export function createChat(options: Chat) {
  return ChatSchema.parse(options);
}

export const ChatMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().default(get_now_timestamp),
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

export function createChatMetadata(options: ChatMetadata) {
  return ChatMetadataSchema.parse(options);
}

export const FullMessageStopSchema = z.object({
  type: z.literal("full_message_stop"),
  messages: z.array(ChatMessageSchema),
  toolResults: z.record(z.string(), ToolResultSchema),
});

export type FullMessageStop = z.infer<typeof FullMessageStopSchema>;

export function createFullMessageStop(options: FullMessageStop) {
  return FullMessageStopSchema.parse(options);
}

export const CodeInfoColSchema = z.object({
  children: z.record(z.union([z.string()]), z.array(z.string())).default({}),
});

export type CodeInfoCol = z.infer<typeof CodeInfoColSchema>;

export function createCodeInfoCol(options: CodeInfoCol) {
  return CodeInfoColSchema.parse(options);
}

export const EVEntrySchema = z.object({
  value: z.string().default(""),
});

export type EVEntry = z.infer<typeof EVEntrySchema>;

export function createEVEntry(options: EVEntry) {
  return EVEntrySchema.parse(options);
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

export function createChartSettings(options: ChartSettings) {
  return ChartSettingsSchema.parse(options);
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

export function createDrawAreaCanvasSettings(options: DrawAreaCanvasSettings) {
  return DrawAreaCanvasSettingsSchema.parse(options);
}

export const VisibilitySchema = z.object({
  DEV: z.boolean().default(true),
  USER: z.boolean().default(true),
});

export type Visibility = z.infer<typeof VisibilitySchema>;

export function createVisibility(options: Visibility) {
  return VisibilitySchema.parse(options);
}

export const SectionSizeSchema = z.object({
  width: z.union([z.number(), z.literal("auto")]).default("auto"),
  height: z.union([z.number(), z.literal("auto")]).default("auto"),
});

export type SectionSize = z.infer<typeof SectionSizeSchema>;

export function createSectionSize(options: SectionSize) {
  return SectionSizeSchema.parse(options);
}

export const ProjectConfigChildSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zIndex: z.int().default(0),
  w: z.number().default(1),
  h: z.number().default(1),
});

export type ProjectConfigChild = z.infer<typeof ProjectConfigChildSchema>;

export function createProjectConfigChild(options: ProjectConfigChild) {
  return ProjectConfigChildSchema.parse(options);
}

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

export type Viewport = z.infer<typeof ViewportSchema>;

export function createViewport(options: Viewport) {
  return ViewportSchema.parse(options);
}

export const UITypeColEntrySchema = z.object({
  uiTypeId: z.string().default("3fdaeb6a-e989-4888-b844-17a76f0b0192"),
  nonPresetUITypeIds: z.array(z.string()).default([]),
});

export type UITypeColEntry = z.infer<typeof UITypeColEntrySchema>;

export function createUITypeColEntry(options: UITypeColEntry) {
  return UITypeColEntrySchema.parse(options);
}

export const CodeInfoSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  editable: z.boolean().default(false),
  rcType: CodeInfoTypeSchema.default("parameter"),
  defaultVal: z.string().default(""),
  description: z.string().default(""),
  passingStyle: ParameterPassingStyleSchema.default("DEFAULT"),
  isPinned: z.boolean().default(false),
  isFrozen: z.boolean().default(false),
  isSelected: z.boolean().default(false),
  ignoreTypeErrors: z.boolean().default(false),
});

export type CodeInfo = z.infer<typeof CodeInfoSchema>;

export function createCodeInfo(options: CodeInfo) {
  return CodeInfoSchema.parse(options);
}

export const SectionVariantSchema = z.object({
  name: z.string().default(generate_memorable_string),
  values: z.record(z.string(), EVEntrySchema).default({}),
  children: z.array(z.string()).default([]),
  selectedItem: z.union([z.string(), z.null()]).default(null),
  code: z.string().default(""),
  codeInfoColId: z.union([z.string(), z.null()]).default(null),
  description: z.string().default(""),
  isFrozen: z.boolean().default(false),
  configLanguage: ConfigLanguageSchema.default("python"),
  isJsonSource: z.boolean().default(false),
  jsonSourceKeys: z.array(z.string()).default([]),
  jsonSourceMissing: z.boolean().default(false),
});

export type SectionVariant = z.infer<typeof SectionVariantSchema>;

export function createSectionVariant(options: SectionVariant) {
  return SectionVariantSchema.parse(options);
}

export const SectionSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  size: SectionSizeSchema.default(createSectionSize),
  parentId: z.union([z.string(), z.null()]).default(null),
  variantId: z.string().default(create_new_id),
  uiTypeId: z.string().default("0191cde4-3d98-4ba0-972a-fead19b8ac73"),
  uiTypeColId: z.union([z.string(), z.null()]).default(null),
  social: z.string().default(""),
  artifactGroupIds: z.array(z.string()).default([]),
  defaultVariantId: z.union([z.string(), z.null()]).default(null),
  variantIds: z.array(z.string()).default([]),
  nonPresetUITypeIds: z.array(z.string()).default([]),
  codeLanguage: CodeLanguageSchema.default("python"),
  isEntryCodeBlock: z.boolean().default(false),
  isFrozen: z.boolean().default(false),
  isHorizontalOrientation: z.boolean().default(false),
  hideParams: z.boolean().default(false),
  hideSearch: z.boolean().default(false),
  hideUnpinnedParams: z.boolean().default(false),
  hideColumn: z.boolean().default(false),
  displayMode: z.string().default("GUI"),
  visibility: VisibilitySchema.default(createVisibility),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).default("auto"),
  isMinimized: z.boolean().default(false),
  canvasSettings: DrawAreaCanvasSettingsSchema.default(
    createDrawAreaCanvasSettings,
  ),
  chartSettings: ChartSettingsSchema.default(createChartSettings),
  isTemporary: z.boolean().default(false),
  renderMarkdown: z.boolean().default(false),
  positionAndSizeLocked: z.boolean().default(false),
  selectedVariantIds: z.record(z.string(), z.any()).default({}),
  paramFilter: z.string().default(""),
  isInOtherProjectConfigs: z.boolean().default(false),
  aspectRatio: z.boolean().default(false),
  aspectRatioExtraHeight: z.int().default(0),
  aspectRatioExtraWidth: z.int().default(0),
  columnWidth: z.union([z.number(), z.null()]).default(null),
  renderedValue: z.any().default(null),
  headingAsSectionName: z.boolean().default(false),
});

export type Section = z.infer<typeof SectionSchema>;

export function createSection(options: Section) {
  return SectionSchema.parse(options);
}

export const ProjectConfigSchema = z.object({
  id: z.string().default(create_new_id),
  name: z.string().default(generate_memorable_string),
  previewImgColor: z.string().default("bg-blue-500/60 dark:bg-blue-600/30"),
  viewport: z.union([ViewportSchema, z.null()]).default(createViewport),
  children: z.record(z.string(), ProjectConfigChildSchema).default({}),
  viewingEditingMode: ViewingEditingModeSchema.default("DEV"),
  genCodePrefix: z.string().default(""),
  genCodeSuffix: z.string().default(""),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createProjectConfig(options: ProjectConfig) {
  return ProjectConfigSchema.parse(options);
}

export const ProjectStateSchema = z.object({
  projectConfigs: z.record(z.string(), ProjectConfigSchema).default({}),
  sections: z.record(z.string(), SectionSchema).default({}),
  variants: z.record(z.string(), SectionVariantSchema).default({}),
  codeInfo: z.record(z.string(), CodeInfoSchema).default({}),
  codeInfoCols: z.record(z.string(), CodeInfoColSchema).default({}),
  uiTypes: z.record(z.string(), UITypeSchema).default(ui_types_default_factory),
  uiTypeCols: z
    .record(z.string(), z.record(z.string(), UITypeColEntrySchema))
    .default({}),
  defaultProjectConfigId: z.union([z.string(), z.null()]).default(null),
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;

export function createProjectState(options: ProjectState) {
  return ProjectStateSchema.parse(options);
}

export const BaseModelSchema = z.object({});

export type BaseModel = z.infer<typeof BaseModelSchema>;

export function createBaseModel(options: BaseModel) {
  return BaseModelSchema.parse(options);
}

export const SettaNotificationSchema = z.object({
  id: z.string().default(create_new_id),
  projectConfigId: z.string().default("NOTIFICATION_IS_FOR_ALL_PROJECTS"),
  type: SettaNotificationTypeSchema.default("info"),
  message: z.string(),
  temporary: z.boolean().default(false),
  timestamp: z.iso.datetime().default(get_now_timestamp),
  metadata: z.record(z.string(), z.any()).default({}),
  read_status: z.boolean().default(false),
});

export type SettaNotification = z.infer<typeof SettaNotificationSchema>;

export function createSettaNotification(options: SettaNotification) {
  return SettaNotificationSchema.parse(options);
}

export const ProjectLoadStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
});

export type ProjectLoadState = z.infer<typeof ProjectLoadStateSchema>;

export function createProjectLoadState(options: ProjectLoadState) {
  return ProjectLoadStateSchema.parse(options);
}

export const ProjectSaveStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
});

export type ProjectSaveState = z.infer<typeof ProjectSaveStateSchema>;

export function createProjectSaveState(options: ProjectSaveState) {
  return ProjectSaveStateSchema.parse(options);
}

export const ProjectUpdateStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
  requestRenameRefactor: z.boolean().default(false),
});

export type ProjectUpdateState = z.infer<typeof ProjectUpdateStateSchema>;

export function createProjectUpdateState(options: ProjectUpdateState) {
  return ProjectUpdateStateSchema.parse(options);
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
  renameRefactorMode: z.string().default("Always Ask"),
  saveRenderedValues: z.boolean().default(false),
});

export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

export function createSettingsBackend(options: SettingsBackend) {
  return SettingsBackendSchema.parse(options);
}

export const SettingsGUISchema = z.object({
  snapGrid: z.array(z.int()),
  showGridLines: z.boolean().default(true),
  gridPattern: z.string().default("Dots"),
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

export function createSettingsGUI(options: SettingsGUI) {
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

export function createSettingsShortcuts(options: SettingsShortcuts) {
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

export function createSettingsState(options: SettingsState) {
  return SettingsStateSchema.parse(options);
}
