import { z } from "zod";

export const UITypeNameSchema = z.enum(["TEXT", "SLIDER", "SWITCH", "COLOR_PICKER", "DROPDOWN", "PASSWORD", "SECTION", "LIST_ROOT", "DICT_ROOT", "GROUP", "IMAGE", "CHART", "DRAW", "TEXT_BLOCK", "SOCIAL", "GLOBAL_VARIABLES", "CODE", "GEN_PYTHON_CODE", "PARAM_SWEEP", "TERMINAL", "GLOBAL_PARAM_SWEEP", "IFRAME", "CHAT", "BROWSER"]);
export type UITypeName = z.infer<typeof UITypeNameSchema>;

export const UITypePresetTypeSchema = z.enum(["BASE", "USER"]);
export type UITypePresetType = z.infer<typeof UITypePresetTypeSchema>;

export const CodeInfoTypeSchema = z.enum(["parameter", "callable", "collection"]);
export type CodeInfoType = z.infer<typeof CodeInfoTypeSchema>;

export const CodeLanguageSchema = z.enum(["python", "bash"]);
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;

export const ConfigLanguageSchema = z.enum(["python", "json"]);
export type ConfigLanguage = z.infer<typeof ConfigLanguageSchema>;

export const ParameterPassingStyleSchema = z.enum(["DEFAULT", "ARGS", "KWARGS", "POSITIONAL_ONLY", "KEYWORD_ONLY"]);
export type ParameterPassingStyle = z.infer<typeof ParameterPassingStyleSchema>;

export const SizeSchema = z.enum(["auto"]);
export type Size = z.infer<typeof SizeSchema>;

export const ViewingEditingModeSchema = z.enum(["DEV", "USER", "USER_EDIT"]);
export type ViewingEditingMode = z.infer<typeof ViewingEditingModeSchema>;

export const UITypeSchema = z.object({
  id: z.string().optional(),
  type: UITypeNameSchema.optional(),
  name: z.string().optional(),
  presetType: z.any().optional(),
  config: z.record(z.string(), z.any()).optional()
});

export type UIType = z.infer<typeof UITypeSchema>;

export function createUIType(options={}){
  return UITypeSchema.parse(options)
}

export const ChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.string().datetime().optional(),
  messages: z.array(ChatMessageSchema)
});

export type Chat = z.infer<typeof ChatSchema>;

export function createChat(options={}){
  return ChatSchema.parse(options)
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.any(),
  content: z.any()
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export function createChatMessage(options={}){
  return ChatMessageSchema.parse(options)
}

export const ChatMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUpdated: z.string().datetime().optional()
});

export type ChatMetadata = z.infer<typeof ChatMetadataSchema>;

export function createChatMetadata(options={}){
  return ChatMetadataSchema.parse(options)
}

export const EmbeddedResourceSchema = z.object({
  type: z.any(),
  resource: z.any(),
  annotations: z.any().optional()
});

export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

export function createEmbeddedResource(options={}){
  return EmbeddedResourceSchema.parse(options)
}

export const FullMessageStopSchema = z.object({
  type: z.any(),
  messages: z.array(ChatMessageSchema),
  toolResults: z.record(z.string(), ToolResultSchema)
});

export type FullMessageStop = z.infer<typeof FullMessageStopSchema>;

export function createFullMessageStop(options={}){
  return FullMessageStopSchema.parse(options)
}

export const ImageContentSchema = z.object({
  type: z.any(),
  data: z.string(),
  mimeType: z.string(),
  annotations: z.any().optional()
});

export type ImageContent = z.infer<typeof ImageContentSchema>;

export function createImageContent(options={}){
  return ImageContentSchema.parse(options)
}

export const TextContentSchema = z.object({
  type: z.any(),
  text: z.string(),
  annotations: z.any().optional()
});

export type TextContent = z.infer<typeof TextContentSchema>;

export function createTextContent(options={}){
  return TextContentSchema.parse(options)
}

export const ToolResultSchema = z.object({
  type: z.any(),
  tool_use_id: z.string(),
  content: z.array(z.any()),
  is_error: z.boolean()
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export function createToolResult(options={}){
  return ToolResultSchema.parse(options)
}

export const CodeInfoColSchema = z.object({
  children: z.record(z.string(), z.array(z.string())).optional()
});

export type CodeInfoCol = z.infer<typeof CodeInfoColSchema>;

export function createCodeInfoCol(options={}){
  return CodeInfoColSchema.parse(options)
}

export const ProjectStateSchema = z.object({
  projectConfigs: z.record(z.string(), ProjectConfigSchema).optional(),
  sections: z.record(z.string(), SectionSchema).optional(),
  variants: z.record(z.string(), SectionVariantSchema).optional(),
  codeInfo: z.record(z.string(), CodeInfoSchema).optional(),
  codeInfoCols: z.record(z.string(), CodeInfoColSchema).optional(),
  uiTypes: z.record(z.string(), UITypeSchema).optional(),
  uiTypeCols: z.record(z.string(), z.record(z.string(), UITypeColEntrySchema)).optional(),
  defaultProjectConfigId: z.any().optional()
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;

export function createProjectState(options={}){
  return ProjectStateSchema.parse(options)
}

export const UITypeColEntrySchema = z.object({
  uiTypeId: z.string().optional(),
  nonPresetUITypeIds: z.array(z.string()).optional()
});

export type UITypeColEntry = z.infer<typeof UITypeColEntrySchema>;

export function createUITypeColEntry(options={}){
  return UITypeColEntrySchema.parse(options)
}

export const ArtifactSchema = z.object({
  name: z.string(),
  path: z.string(),
  value: z.any().optional(),
  type: z.string()
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export function createArtifact(options={}){
  return ArtifactSchema.parse(options)
}

export const CanvasSettingsSchema = z.object({
  activeLayerId: z.any().optional(),
  color: z.string().optional(),
  brushSize: z.number().int().optional(),
  brushShape: z.string().optional(),
  eraserBrushSize: z.number().int().optional(),
  drawThrottleDelay: z.number().int().optional(),
  canvasTransferQueueLength: z.number().int().optional(),
  mode: z.string().optional()
});

export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;

export function createCanvasSettings(options={}){
  return CanvasSettingsSchema.parse(options)
}

export const ChartSettingsSchema = z.object({
  type: z.string().optional(),
  xAxisColumn: z.string().optional(),
  secondYAxisColumns: z.array(z.string()).optional(),
  xAxisLog: z.boolean().optional(),
  y1AxisLog: z.boolean().optional(),
  y2AxisLog: z.boolean().optional()
});

export type ChartSettings = z.infer<typeof ChartSettingsSchema>;

export function createChartSettings(options={}){
  return ChartSettingsSchema.parse(options)
}

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
  ignoreTypeErrors: z.boolean().optional()
});

export type CodeInfo = z.infer<typeof CodeInfoSchema>;

export function createCodeInfo(options={}){
  return CodeInfoSchema.parse(options)
}

export const EVEntrySchema = z.object({
  value: z.string().optional()
});

export type EVEntry = z.infer<typeof EVEntrySchema>;

export function createEVEntry(options={}){
  return EVEntrySchema.parse(options)
}

export const ProjectConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  previewImgColor: z.string().optional(),
  viewport: z.any().optional(),
  children: z.record(z.string(), ProjectConfigChildSchema).optional(),
  viewingEditingMode: ViewingEditingModeSchema.optional(),
  genCodePrefix: z.string().optional(),
  genCodeSuffix: z.string().optional()
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function createProjectConfig(options={}){
  return ProjectConfigSchema.parse(options)
}

export const ProjectConfigChildSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  zIndex: z.number().int().optional(),
  w: z.number().optional(),
  h: z.number().optional()
});

export type ProjectConfigChild = z.infer<typeof ProjectConfigChildSchema>;

export function createProjectConfigChild(options={}){
  return ProjectConfigChildSchema.parse(options)
}

export const ProjectLoadStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema
});

export type ProjectLoadState = z.infer<typeof ProjectLoadStateSchema>;

export function createProjectLoadState(options={}){
  return ProjectLoadStateSchema.parse(options)
}

export const ProjectSaveStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema
});

export type ProjectSaveState = z.infer<typeof ProjectSaveStateSchema>;

export function createProjectSaveState(options={}){
  return ProjectSaveStateSchema.parse(options)
}

export const ProjectUpdateStateSchema = z.object({
  projectConfigId: z.string(),
  projectState: ProjectStateSchema,
  requestRenameRefactor: z.boolean().optional()
});

export type ProjectUpdateState = z.infer<typeof ProjectUpdateStateSchema>;

export function createProjectUpdateState(options={}){
  return ProjectUpdateStateSchema.parse(options)
}

export const SectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  size: SectionSizeSchema.optional(),
  parentId: z.any().optional(),
  variantId: z.string().optional(),
  uiTypeId: z.string().optional(),
  uiTypeColId: z.any().optional(),
  social: z.string().optional(),
  artifactGroupIds: z.array(z.string()).optional(),
  defaultVariantId: z.any().optional(),
  variantIds: z.array(z.string()).optional(),
  paramSweepSectionId: z.any().optional(),
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
  pinnedAreaHeight: z.union([z.number(), z.any()]).optional(),
  isMinimized: z.boolean().optional(),
  canvasSettings: CanvasSettingsSchema.optional(),
  chartSettings: ChartSettingsSchema.optional(),
  isTemporary: z.boolean().optional(),
  renderMarkdown: z.boolean().optional(),
  positionAndSizeLocked: z.boolean().optional(),
  selectedVariantIds: z.record(z.string(), z.any()).optional(),
  paramFilter: z.string().optional(),
  isInOtherProjectConfigs: z.boolean().optional(),
  aspectRatio: z.boolean().optional(),
  aspectRatioExtraHeight: z.number().int().optional(),
  aspectRatioExtraWidth: z.number().int().optional(),
  columnWidth: z.any().optional(),
  renderedValue: z.any().optional(),
  headingAsSectionName: z.boolean().optional()
});

export type Section = z.infer<typeof SectionSchema>;

export function createSection(options={}){
  return SectionSchema.parse(options)
}

export const SectionSizeSchema = z.object({
  width: z.union([z.number(), z.any()]).optional(),
  height: z.union([z.number(), z.any()]).optional()
});

export type SectionSize = z.infer<typeof SectionSizeSchema>;

export function createSectionSize(options={}){
  return SectionSizeSchema.parse(options)
}

export const SectionVariantSchema = z.object({
  name: z.string().optional(),
  values: z.record(z.string(), EVEntrySchema).optional(),
  children: z.array(z.string()).optional(),
  selectedItem: z.any().optional(),
  code: z.string().optional(),
  codeInfoColId: z.any().optional(),
  description: z.string().optional(),
  isFrozen: z.boolean().optional(),
  sweep: z.array(z.any()).optional(),
  runGroup: z.record(z.string(), z.any()).optional(),
  configLanguage: ConfigLanguageSchema.optional(),
  isJsonSource: z.boolean().optional(),
  jsonSourceKeys: z.array(z.string()).optional(),
  jsonSourceMissing: z.boolean().optional()
});

export type SectionVariant = z.infer<typeof SectionVariantSchema>;

export function createSectionVariant(options={}){
  return SectionVariantSchema.parse(options)
}

export const ViewportSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  zoom: z.number().optional()
});

export type Viewport = z.infer<typeof ViewportSchema>;

export function createViewport(options={}){
  return ViewportSchema.parse(options)
}

export const VisibilitySchema = z.object({
  DEV: z.boolean().optional(),
  USER: z.boolean().optional()
});

export type Visibility = z.infer<typeof VisibilitySchema>;

export function createVisibility(options={}){
  return VisibilitySchema.parse(options)
}

export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().optional(),
  autosave: z.boolean().optional(),
  autobackup: z.boolean().optional(),
  autobackupFreq: z.number().int().optional(),
  autobackupKeepLastN: z.number().int().optional(),
  clearTerminalBeforeMarkingAsReady: z.boolean().optional(),
  defaultTerminalShell: z.any().optional(),
  exportDbRawOnSave: z.boolean().optional(),
  exportDbReadableOnSave: z.boolean().optional(),
  exportDbReadableWithVariantsOnSave: z.boolean().optional(),
  renameRefactorMode: z.string().optional(),
  saveRenderedValues: z.boolean().optional()
});

export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

export function createSettingsBackend(options={}){
  return SettingsBackendSchema.parse(options)
}

export const SettingsGUISchema = z.object({
  snapGrid: z.array(z.number().int()).optional(),
  showGridLines: z.boolean().optional(),
  gridPattern: z.string().optional(),
  gridPatternSize: z.number().int().optional(),
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
  transitionDuration: z.number().int().optional()
});

export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

export function createSettingsGUI(options={}){
  return SettingsGUISchema.parse(options)
}

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
  restartLanguageServerShortcut: z.string().optional()
});

export type SettingsShortcuts = z.infer<typeof SettingsShortcutsSchema>;

export function createSettingsShortcuts(options={}){
  return SettingsShortcutsSchema.parse(options)
}

export const SettingsStateSchema = z.object({
  shortcuts: SettingsShortcutsSchema.optional(),
  gui: SettingsGUISchema.optional(),
  backend: SettingsBackendSchema.optional(),
  languageServer: z.any().optional(),
  sections: z.any().optional()
});

export type SettingsState = z.infer<typeof SettingsStateSchema>;

export function createSettingsState(options={}){
  return SettingsStateSchema.parse(options)
}

