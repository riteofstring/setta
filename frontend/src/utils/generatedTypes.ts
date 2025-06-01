import { z } from "zod/v4";

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export const APIKeysSchema = z.record(z.string(), z.string());
export type APIKeys = z.infer<typeof APIKeysSchema>;

export const IDToUUIDForLLMSchema = z.record(ID, z.string());
export type IDToUUIDForLLM = z.infer<typeof IDToUUIDForLLMSchema>;

export const UUIDToIDForLLMSchema = z.record(z.string(), ID);
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

export const ChatRoleSchema = z.literal(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const WebSearchResultBlockSchema = z.object({
  encrypted_content: z.string(),
  page_age: z.union([z.string(), z.null()]).optional(),
  title: z.string(),
  type: z.literal("web_search_result"),
  url: z.string(),
});
export type WebSearchResultBlock = z.infer<typeof WebSearchResultBlockSchema>;

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

export const CitationsWebSearchResultLocationSchema = z.object({
  cited_text: z.string(),
  encrypted_index: z.string(),
  title: z.union([z.string(), z.null()]).optional(),
  type: z.literal("web_search_result_location"),
  url: z.string(),
});
export type CitationsWebSearchResultLocation = z.infer<
  typeof CitationsWebSearchResultLocationSchema
>;

export const CitationContentBlockLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).optional(),
  end_block_index: z.int(),
  start_block_index: z.int(),
  type: z.literal("content_block_location"),
});
export type CitationContentBlockLocation = z.infer<
  typeof CitationContentBlockLocationSchema
>;

export const CitationPageLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).optional(),
  end_page_number: z.int(),
  start_page_number: z.int(),
  type: z.literal("page_location"),
});
export type CitationPageLocation = z.infer<typeof CitationPageLocationSchema>;

export const CitationCharLocationSchema = z.object({
  cited_text: z.string(),
  document_index: z.int(),
  document_title: z.union([z.string(), z.null()]).optional(),
  end_char_index: z.int(),
  start_char_index: z.int(),
  type: z.literal("char_location"),
});
export type CitationCharLocation = z.infer<typeof CitationCharLocationSchema>;

export const RedactedThinkingBlockSchema = z.object({
  data: z.string(),
  type: z.literal("redacted_thinking"),
});
export type RedactedThinkingBlock = z.infer<typeof RedactedThinkingBlockSchema>;

export const ThinkingBlockSchema = z.object({
  signature: z.string(),
  thinking: z.string(),
  type: z.literal("thinking"),
});
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

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

export const ServerToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.literal("web_search"),
  type: z.literal("server_tool_use"),
});
export type ServerToolUseBlock = z.infer<typeof ServerToolUseBlockSchema>;

export const ToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.string(),
  type: z.literal("tool_use"),
});
export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

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
    .optional(),
  text: z.string(),
  type: z.literal("text"),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

export const ContentBlockSchema = z.union([
  TextBlockSchema,
  ToolUseBlockSchema,
  ServerToolUseBlockSchema,
  WebSearchToolResultBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const ArtifactTypeSchema = z.enum([
  "img",
  "brushStrokes",
  "list",
  "chatHistory",
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

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

export const UITypePresetTypeSchema = z.enum(["BASE", "USER"]);
export type UITypePresetType = z.infer<typeof UITypePresetTypeSchema>;

export const CodeInfoTypeSchema = z.enum([
  "parameter",
  "callable",
  "collection",
]);
export type CodeInfoType = z.infer<typeof CodeInfoTypeSchema>;

export const SettaNotificationTypeSchema = z.enum([
  "success",
  "error",
  "warning",
  "info",
  "save",
]);
export type SettaNotificationType = z.infer<typeof SettaNotificationTypeSchema>;

export const CodeLanguageSchema = z.enum(["python", "bash"]);
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;

export const ConfigLanguageSchema = z.enum(["python", "json"]);
export type ConfigLanguage = z.infer<typeof ConfigLanguageSchema>;

export const ParameterPassingStyleSchema = z.enum([
  "DEFAULT",
  "ARGS",
  "KWARGS",
  "POSITIONAL_ONLY",
  "KEYWORD_ONLY",
]);
export type ParameterPassingStyle = z.infer<typeof ParameterPassingStyleSchema>;

export const SizeSchema = z.enum(["auto"]);
export type Size = z.infer<typeof SizeSchema>;

export const ViewingEditingModeSchema = z.enum(["DEV", "USER", "USER_EDIT"]);
export type ViewingEditingMode = z.infer<typeof ViewingEditingModeSchema>;

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
    .optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

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
    .optional(),
  id: z.union([z.string(), z.null()]),
});
export type ArtifactWithId = z.infer<typeof ArtifactWithIdSchema>;

export const ArtifactWithoutValueSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: ArtifactTypeSchema,
});
export type ArtifactWithoutValue = z.infer<typeof ArtifactWithoutValueSchema>;

export const UITypeSchema = z.object({
  id: z.string().optional(),
  type: UITypeNameSchema.optional(),
  name: z.string().optional(),
  presetType: z.union([UITypePresetTypeSchema, z.null()]).optional(),
  config: z.record(z.string(), z.any()).optional(),
});
export type UIType = z.infer<typeof UITypeSchema>;

export const BlobResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  blob: z.string(),
});
export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;

export const TextResourceContentsSchema = z.object({
  uri: z.url(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  text: z.string(),
});
export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;

export const AnnotationsSchema = z.object({
  audience: z
    .union([z.array(z.literal(["user", "assistant"])), z.null()])
    .optional(),
  priority: z.union([z.number(), z.null()]).optional(),
});
export type Annotations = z.infer<typeof AnnotationsSchema>;

export const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
});
export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ToolResultSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.array(
    z.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema]),
  ),
  is_error: z.boolean(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

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

export const ChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().optional(),
  messages: z.array(ChatMessageSchema),
});
export type Chat = z.infer<typeof ChatSchema>;

export const ChatMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.iso.datetime().optional(),
});
export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

export const FullMessageStopSchema = z.object({
  type: z.literal("full_message_stop"),
  messages: z.array(ChatMessageSchema),
  toolResults: z.record(z.string(), ToolResultSchema),
});
export type FullMessageStop = z.infer<typeof FullMessageStopSchema>;

export const CodeInfoColSchema = z.object({
  children: z.record(z.union([z.string()]), z.array(z.string())).optional(),
});
export type CodeInfoCol = z.infer<typeof CodeInfoColSchema>;

export const EVEntrySchema = z.object({
  value: z.string().optional(),
});
export type EVEntry = z.infer<typeof EVEntrySchema>;

export const ChartSettingsSchema = z.object({
  type: z.string().optional(),
  xAxisColumn: z.string().optional(),
  secondYAxisColumns: z.array(z.string()).optional(),
  xAxisLog: z.boolean().optional(),
  y1AxisLog: z.boolean().optional(),
  y2AxisLog: z.boolean().optional(),
});
export type ChartSettings = z.infer<typeof ChartSettingsSchema>;

export const DrawAreaCanvasSettingsSchema = z.object({
  activeLayerId: z.union([z.string(), z.null()]).optional(),
  color: z.string().optional(),
  brushSize: z.int().optional(),
  brushShape: z.string().optional(),
  eraserBrushSize: z.int().optional(),
  drawThrottleDelay: z.int().optional(),
  canvasTransferQueueLength: z.int().optional(),
  mode: z.string().optional(),
});
export type DrawAreaCanvasSettings = z.infer<
  typeof DrawAreaCanvasSettingsSchema
>;

export const VisibilitySchema = z.object({
  DEV: z.boolean().optional(),
  USER: z.boolean().optional(),
});
export type Visibility = z.infer<typeof VisibilitySchema>;

export const SectionSizeSchema = z.object({
  width: z.union([z.number(), z.literal("auto")]).optional(),
  height: z.union([z.number(), z.literal("auto")]).optional(),
});
export type SectionSize = z.infer<typeof SectionSizeSchema>;

export const ProjectConfigChildSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  zIndex: z.int().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
});
export type ProjectConfigChild = z.infer<typeof ProjectConfigChildSchema>;

export const ViewportSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  zoom: z.number().optional(),
});
export type Viewport = z.infer<typeof ViewportSchema>;

export const UITypeColEntrySchema = z.object({
  uiTypeId: z.string().optional(),
  nonPresetUITypeIds: z.array(z.string()).optional(),
});
export type UITypeColEntry = z.infer<typeof UITypeColEntrySchema>;

export const CodeInfoSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  editable: z.boolean().optional(),
  rcType: CodeInfoTypeSchema.optional(),
  defaultVal: z.string().optional(),
  description: z.string().optional(),
  passingStyle: ParameterPassingStyleSchema.optional(),
  isPinned: z.boolean().optional(),
  isFrozen: z.boolean().optional(),
  isSelected: z.boolean().optional(),
  ignoreTypeErrors: z.boolean().optional(),
});
export type CodeInfo = z.infer<typeof CodeInfoSchema>;

export const SectionVariantSchema = z.object({
  name: z.string().optional(),
  values: z.record(z.string(), EVEntrySchema).optional(),
  children: z.array(z.string()).optional(),
  selectedItem: z.union([z.string(), z.null()]).optional(),
  code: z.string().optional(),
  codeInfoColId: z.union([z.string(), z.null()]).optional(),
  description: z.string().optional(),
  isFrozen: z.boolean().optional(),
  configLanguage: ConfigLanguageSchema.optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional(),
});
export type SectionVariant = z.infer<typeof SectionVariantSchema>;

export const SectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  size: SectionSizeSchema.optional(),
  parentId: z.union([z.string(), z.null()]).optional(),
  variantId: z.string().optional(),
  uiTypeId: z.string().optional(),
  uiTypeColId: z.union([z.string(), z.null()]).optional(),
  social: z.string().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
  defaultVariantId: z.union([z.string(), z.null()]).optional(),
  variantIds: z.array(z.string()).optional(),
  nonPresetUITypeIds: z.array(z.string()).optional(),
  codeLanguage: CodeLanguageSchema.optional(),
  isEntryCodeBlock: z.boolean().optional(),
  isFrozen: z.boolean().optional(),
  isHorizontalOrientation: z.boolean().optional(),
  hideParams: z.boolean().optional(),
  hideSearch: z.boolean().optional(),
  hideUnpinnedParams: z.boolean().optional(),
  hideColumn: z.boolean().optional(),
  displayMode: z.string().optional(),
  visibility: VisibilitySchema.optional(),
  pinnedAreaHeight: z.union([z.number(), z.literal("auto")]).optional(),
  isMinimized: z.boolean().optional(),
  canvasSettings: DrawAreaCanvasSettingsSchema.optional(),
  chartSettings: ChartSettingsSchema.optional(),
  isTemporary: z.boolean().optional(),
  renderMarkdown: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  selectedVariantIds: z.record(z.string(), z.any()).optional(),
  paramFilter: z.string().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.int().optional(),
  aspectRatioExtraWidth: z.int().optional(),
  columnWidth: z.union([z.number(), z.null()]).optional(),
  renderedValue: z.any().optional(),
  headingAsSectionName: z.boolean().optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const ProjectConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  previewImgColor: z.string().optional(),
  viewport: z.union([ViewportSchema, z.null()]).optional(),
  children: z.record(z.string(), ProjectConfigChildSchema).optional(),
  viewingEditingMode: ViewingEditingModeSchema.optional(),
  genCodePrefix: z.string().optional(),
  genCodeSuffix: z.string().optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const ProjectStateSchema = z.object({
  projectConfigs: z.record(z.string(), ProjectConfigSchema).optional(),
  sections: z.record(z.string(), SectionSchema).optional(),
  variants: z.record(z.string(), SectionVariantSchema).optional(),
  codeInfo: z.record(z.string(), CodeInfoSchema).optional(),
  codeInfoCols: z.record(z.string(), CodeInfoColSchema).optional(),
  uiTypes: z.record(z.string(), UITypeSchema).optional(),
  uiTypeCols: z
    .record(z.string(), z.record(z.string(), UITypeColEntrySchema))
    .optional(),
  defaultProjectConfigId: z.union([z.string(), z.null()]).optional(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;

export const BaseModelSchema = z.object({});
export type BaseModel = z.infer<typeof BaseModelSchema>;

export const SettaNotificationSchema = z.object({
  id: z.string().optional(),
  projectConfigId: z.string().optional(),
  type: SettaNotificationTypeSchema.optional(),
  message: z.string(),
  temporary: z.boolean().optional(),
  timestamp: z.iso.datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  read_status: z.boolean().optional(),
});
export type SettaNotification = z.infer<typeof SettaNotificationSchema>;

export const ProjectLoadStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
});
export type ProjectLoadState = z.infer<typeof ProjectLoadStateSchema>;

export const ProjectSaveStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
});
export type ProjectSaveState = z.infer<typeof ProjectSaveStateSchema>;

export const ProjectUpdateStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
  requestRenameRefactor: z.boolean().optional(),
});
export type ProjectUpdateState = z.infer<typeof ProjectUpdateStateSchema>;

export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().optional(),
  autosave: z.boolean().optional(),
  autobackup: z.boolean().optional(),
  autobackupFreq: z.int().optional(),
  autobackupKeepLastN: z.int().optional(),
  clearTerminalBeforeMarkingAsReady: z.boolean().optional(),
  defaultTerminalShell: z.union([z.string(), z.null()]).optional(),
  exportDbRawOnSave: z.boolean().optional(),
  exportDbReadableOnSave: z.boolean().optional(),
  exportDbReadableWithVariantsOnSave: z.boolean().optional(),
  renameRefactorMode: z.string().optional(),
  saveRenderedValues: z.boolean().optional(),
});
export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

export const SettingsGUISchema = z.object({
  snapGrid: z.array(z.int()).optional(),
  showGridLines: z.boolean().optional(),
  gridPattern: z.string().optional(),
  gridPatternSize: z.int().optional(),
  gridColor: z.string().optional(),
  gridColorDarkMode: z.string().optional(),
  defaultZoomLevel: z.number().optional(),
  minZoom: z.number().optional(),
  maxZoom: z.number().optional(),
  panOnDrag: z.boolean().optional(),
  panOnScroll: z.boolean().optional(),
  panOnScrollSpeed: z.number().optional(),
  panOnScrollMode: z.string().optional(),
  zoomOnScroll: z.boolean().optional(),
  zoomOnPinch: z.boolean().optional(),
  zoomOnDoubleClick: z.boolean().optional(),
  selectionMode: z.string().optional(),
  leftSidePaneShiftsMap: z.boolean().optional(),
  transitionDuration: z.int().optional(),
});
export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

export const SettingsShortcutsSchema = z.object({
  newCardShortcut: z.string().optional(),
  newGroupShortcut: z.string().optional(),
  typeCheckShortcut: z.string().optional(),
  newProjectConfigShortcut: z.string().optional(),
  undoShortcut: z.string().optional(),
  redoShortcut: z.string().optional(),
  groupShortcut: z.string().optional(),
  ungroupShortcut: z.string().optional(),
  saveShortcut: z.string().optional(),
  saveAsShortcut: z.string().optional(),
  loadShortcut: z.string().optional(),
  searchShortcut: z.string().optional(),
  advancedSearchShortcut: z.string().optional(),
  commandPaletteShortcut: z.string().optional(),
  resetZoomShortcut: z.string().optional(),
  copyShortcut: z.string().optional(),
  pasteShortcut: z.string().optional(),
  pasteAsRefShortcut: z.string().optional(),
  sortingShortcut: z.string().optional(),
  movingFreeShortcut: z.string().optional(),
  showTooltipShortcut: z.string().optional(),
  tooltipToPlaintextShortcut: z.string().optional(),
  tooltipToMarkdownShortcut: z.string().optional(),
  freezeTooltipShortcut: z.string().optional(),
  frozenTooltipToPlaintextShortcut: z.string().optional(),
  frozenTooltipToMarkdownShortcut: z.string().optional(),
  incrementTooltipPageShortcut: z.string().optional(),
  decrementTooltipPageShortcut: z.string().optional(),
  copyTooltipTextShortcut: z.string().optional(),
  frozenTooltipIncrementShortcut: z.string().optional(),
  frozenTooltipDecrementShortcut: z.string().optional(),
  frozenTooltipCopyShortcut: z.string().optional(),
  newTerminalShortcut: z.string().optional(),
  fitViewShortcut: z.string().optional(),
  zoomToMouseShortcut: z.string().optional(),
  deleteSectionShortcut: z.string().optional(),
  selectAll: z.string().optional(),
  selectTopLevelNonGroupSections: z.string().optional(),
  showVersionsTabShortcut: z.string().optional(),
  showParamUITypeTabShortcut: z.string().optional(),
  showProjectOverviewTabShortcut: z.string().optional(),
  runCodeShortcut: z.string().optional(),
  runEntryCodeBlockShortcut: z.string().optional(),
  sendProjectToAllInteractiveCode: z.string().optional(),
  paramSelect: z.string().optional(),
  formatCode: z.string().optional(),
  selectionKeyCode: z.string().optional(),
  multiSelectionKeyCode: z.string().optional(),
  panActivationKeyCode: z.string().optional(),
  zoomActivationKeyCode: z.string().optional(),
  zoomInShortcut: z.string().optional(),
  zoomOutShortcut: z.string().optional(),
  restartLanguageServerShortcut: z.string().optional(),
});
export type SettingsShortcuts = z.infer<typeof SettingsShortcutsSchema>;

export const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.optional(),
  gui: SettingsGUISchema.optional(),
  backend: SettingsBackendSchema.optional(),
  languageServer: z.record(z.string(), z.any()).optional(),
  sections: z.record(z.string(), z.any()).optional(),
});
export type SettingsState = z.infer<typeof SettingsStateSchema>;
