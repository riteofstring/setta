import _ from "lodash";
import { BASE_UI_TYPES, BASE_UI_TYPE_IDS } from "utils/baseUITypes";
import {
  createNewId,
  createRandomName as generateMemorableString,
} from "utils/idNameCreation";
import { z } from "zod";
// UITypePresetType enum
export const UITypePresetTypeSchema = z.enum(["BASE", "USER"]);
export type UITypePresetType = z.infer<typeof UITypePresetTypeSchema>;
export const UITypePresetType = {
  BASE: "BASE",
  USER: "USER",
} as const;

// UITypeName enum
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
  "PARAM_SWEEP",
  "TERMINAL",
  "GLOBAL_PARAM_SWEEP",
  "IFRAME",
  "CHAT",
  "BROWSER",
]);
export type UITypeName = z.infer<typeof UITypeNameSchema>;
export const UITypeName = {
  TEXT: "TEXT",
  SLIDER: "SLIDER",
  SWITCH: "SWITCH",
  COLOR_PICKER: "COLOR_PICKER",
  DROPDOWN: "DROPDOWN",
  PASSWORD: "PASSWORD",
  SECTION: "SECTION",
  LIST_ROOT: "LIST_ROOT",
  DICT_ROOT: "DICT_ROOT",
  GROUP: "GROUP",
  IMAGE: "IMAGE",
  CHART: "CHART",
  DRAW: "DRAW",
  TEXT_BLOCK: "TEXT_BLOCK",
  SOCIAL: "SOCIAL",
  GLOBAL_VARIABLES: "GLOBAL_VARIABLES",
  CODE: "CODE",
  GEN_PYTHON_CODE: "GEN_PYTHON_CODE",
  PARAM_SWEEP: "PARAM_SWEEP",
  TERMINAL: "TERMINAL",
  GLOBAL_PARAM_SWEEP: "GLOBAL_PARAM_SWEEP",
  IFRAME: "IFRAME",
  CHAT: "CHAT",
  BROWSER: "BROWSER",
} as const;

// Size enum
export const SizeSchema = z.enum(["auto"]);
export type Size = z.infer<typeof SizeSchema>;
export const Size = {
  AUTO: "auto",
} as const;

// CodeLanguage enum
export const CodeLanguageSchema = z.enum(["python", "bash"]);
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;
export const CodeLanguage = {
  PYTHON: "python",
  BASH: "bash",
} as const;

// ConfigLanguage enum
export const ConfigLanguageSchema = z.enum(["python", "json"]);
export type ConfigLanguage = z.infer<typeof ConfigLanguageSchema>;
export const ConfigLanguage = {
  PYTHON: "python",
  JSON: "json",
} as const;

// ParameterPassingStyle enum
export const ParameterPassingStyleSchema = z.enum([
  "DEFAULT",
  "ARGS",
  "KWARGS",
  "POSITIONAL_ONLY",
  "KEYWORD_ONLY",
]);
export type ParameterPassingStyle = z.infer<typeof ParameterPassingStyleSchema>;
export const ParameterPassingStyle = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;

// CodeInfoType enum
export const CodeInfoTypeSchema = z.enum([
  "parameter",
  "callable",
  "collection",
]);
export type CodeInfoType = z.infer<typeof CodeInfoTypeSchema>;
export const CodeInfoType = {
  PARAMETER: "parameter",
  CALLABLE: "callable",
  COLLECTION: "collection",
} as const;

// ViewingEditingMode enum
export const ViewingEditingModeSchema = z.enum(["DEV", "USER", "USER_EDIT"]);
export type ViewingEditingMode = z.infer<typeof ViewingEditingModeSchema>;
export const ViewingEditingMode = {
  DEV: "DEV",
  USER: "USER",
  USER_EDIT: "USER_EDIT",
} as const;

// UIType schema
export const UITypeSchema = z.object({
  id: z.string().default(() => createNewId()),
  type: UITypeNameSchema.default(UITypeName.TEXT),
  name: z.string().default(() => generateMemorableString()),
  presetType: UITypePresetTypeSchema.nullable().default(null),
  config: z.record(z.any()).default(() => ({})),
});
export type UIType = z.infer<typeof UITypeSchema>;

// UIType factory function
export function createUIType(input: Partial<UIType> = {}): UIType {
  return UITypeSchema.parse(input);
}

// Viewport schema
export const ViewportSchema = z
  .object({
    x: z.number().default(0),
    y: z.number().default(0),
    zoom: z.number().default(1),
  })
  .strict();
export type Viewport = z.infer<typeof ViewportSchema>;

// Viewport factory function
export function createViewport(input: Partial<Viewport> = {}): Viewport {
  return ViewportSchema.parse(input);
}

// SectionSize schema
export const SectionSizeSchema = z
  .object({
    width: z.union([z.number(), z.literal(Size.AUTO)]).default(Size.AUTO),
    height: z.union([z.number(), z.literal(Size.AUTO)]).default(Size.AUTO),
  })
  .strict();
export type SectionSize = z.infer<typeof SectionSizeSchema>;

// SectionSize factory function
export function createSectionSize(
  input: Partial<SectionSize> = {},
): SectionSize {
  return SectionSizeSchema.parse(input);
}

// Visibility schema
export const VisibilitySchema = z
  .object({
    DEV: z.boolean().default(true),
    USER: z.boolean().default(true),
  })
  .strict();
export type Visibility = z.infer<typeof VisibilitySchema>;

// Visibility factory function
export function createVisibility(input: Partial<Visibility> = {}): Visibility {
  return VisibilitySchema.parse(input);
}

// CanvasSettings schema
export const CanvasSettingsSchema = z
  .object({
    activeLayerId: z.string().nullable().default(null),
    color: z.string().default("#ff0000"),
    brushSize: z.number().int().default(16),
    brushShape: z.string().default("butt"),
    eraserBrushSize: z.number().int().default(16),
    drawThrottleDelay: z.number().int().default(0),
    canvasTransferQueueLength: z.number().int().default(50),
    mode: z.string().default("draw"),
  })
  .strict();
export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;

// CanvasSettings factory function
export function createCanvasSettings(
  input: Partial<CanvasSettings> = {},
): CanvasSettings {
  return CanvasSettingsSchema.parse(input);
}

// ChartSettings schema
export const ChartSettingsSchema = z
  .object({
    type: z.string().default("line"),
    xAxisColumn: z.string().default(""),
    secondYAxisColumns: z.array(z.string()).default(() => []),
    xAxisLog: z.boolean().default(false),
    y1AxisLog: z.boolean().default(false),
    y2AxisLog: z.boolean().default(false),
  })
  .strict();
export type ChartSettings = z.infer<typeof ChartSettingsSchema>;

// ChartSettings factory function
export function createChartSettings(
  input: Partial<ChartSettings> = {},
): ChartSettings {
  return ChartSettingsSchema.parse(input);
}

// Section schema
export const SectionSchema = z
  .object({
    id: z.string().default(() => createNewId()),
    name: z.string().default(() => generateMemorableString()),
    size: SectionSizeSchema.default(() => createSectionSize()),
    parentId: z.string().nullable().default(null),
    variantId: z.string().default(() => createNewId()),
    uiTypeId: z.string().default(BASE_UI_TYPE_IDS[UITypeName.SECTION]),
    uiTypeColId: z.string().nullable().default(null),
    social: z.string().default(""),
    artifactGroupIds: z.array(z.string()).default(() => []),
    defaultVariantId: z.string().nullable().default(null),
    variantIds: z.array(z.string()).default(() => []),
    paramSweepSectionId: z.string().nullable().default(null),
    nonPresetUITypeIds: z.array(z.string()).default(() => []),
    codeLanguage: CodeLanguageSchema.default(CodeLanguage.PYTHON),
    isEntryCodeBlock: z.boolean().default(false),
    isFrozen: z.boolean().default(false),
    isHorizontalOrientation: z.boolean().default(false),
    hideParams: z.boolean().default(false),
    hideSearch: z.boolean().default(false),
    hideUnpinnedParams: z.boolean().default(false),
    hideColumn: z.boolean().default(false),
    displayMode: z.string().default("GUI"),
    visibility: VisibilitySchema.default(() => createVisibility()),
    pinnedAreaHeight: z
      .union([z.number(), z.literal(Size.AUTO)])
      .default(Size.AUTO),
    isMinimized: z.boolean().default(false),
    canvasSettings: CanvasSettingsSchema.default(() => createCanvasSettings()),
    chartSettings: ChartSettingsSchema.default(() => createChartSettings()),
    isTemporary: z.boolean().default(false),
    renderMarkdown: z.boolean().default(false),
    positionAndSizeLocked: z.boolean().default(false),
    selectedVariantIds: z.record(z.any()).default(() => ({})),
    paramFilter: z.string().default(""),
    isInOtherProjectConfigs: z.boolean().default(false),
    aspectRatio: z.boolean().default(false),
    aspectRatioExtraHeight: z.number().int().default(0),
    aspectRatioExtraWidth: z.number().int().default(0),
    columnWidth: z.number().nullable().default(null),
    renderedValue: z.any().default(null),
    headingAsSectionName: z.boolean().default(false),
  })
  .strict();
export type Section = z.infer<typeof SectionSchema>;

// Section factory function
export function createSection(input: Partial<Section> = {}): Section {
  return SectionSchema.parse(input);
}

// EVEntry schema
export const EVEntrySchema = z
  .object({
    value: z.string().default(""),
  })
  .strict();
export type EVEntry = z.infer<typeof EVEntrySchema>;

// EVEntry factory function
export function createEVEntry(input: Partial<EVEntry> = {}): EVEntry {
  return EVEntrySchema.parse(input);
}

// SectionVariant schema
export const SectionVariantSchema = z
  .object({
    name: z.string().default(() => generateMemorableString()),
    values: z.record(EVEntrySchema).default(() => ({})),
    children: z.array(z.string()).default(() => []),
    selectedItem: z.string().nullable().default(null),
    code: z.string().default(""),
    codeInfoColId: z.string().nullable().default(null),
    description: z.string().default(""),
    isFrozen: z.boolean().default(false),
    sweep: z.array(z.any()).default(() => []),
    runGroup: z.record(z.any()).default(() => ({})),
    configLanguage: ConfigLanguageSchema.default(ConfigLanguage.PYTHON),
    isJsonSource: z.boolean().default(false),
    jsonSourceKeys: z.array(z.string()).default(() => []),
    jsonSourceMissing: z.boolean().default(false),
  })
  .strict();
export type SectionVariant = z.infer<typeof SectionVariantSchema>;

// SectionVariant factory function
export function createSectionVariant(
  input: Partial<SectionVariant> = {},
): SectionVariant {
  return SectionVariantSchema.parse(input);
}

// CodeInfo schema
export const CodeInfoSchema = z
  .object({
    id: z.string().default(() => createNewId()),
    name: z.string().default(() => generateMemorableString()),
    editable: z.boolean().default(false),
    rcType: CodeInfoTypeSchema.default(CodeInfoType.PARAMETER),
    defaultVal: z.string().default(""),
    description: z.string().default(""),
    passingStyle: ParameterPassingStyleSchema.default(
      ParameterPassingStyle.DEFAULT,
    ),
    isPinned: z.boolean().default(false),
    isFrozen: z.boolean().default(false),
    isSelected: z.boolean().default(false),
    ignoreTypeErrors: z.boolean().default(false),
  })
  .strict();
export type CodeInfo = z.infer<typeof CodeInfoSchema>;

// CodeInfo factory function
export function createCodeInfo(input: Partial<CodeInfo> = {}): CodeInfo {
  return CodeInfoSchema.parse(input);
}

// CodeInfoCol schema
export const CodeInfoColSchema = z
  .object({
    children: z.record(z.any()).default(() => ({})),
  })
  .strict();
export type CodeInfoCol = z.infer<typeof CodeInfoColSchema>;

// CodeInfoCol factory function
export function createCodeInfoCol(
  input: Partial<CodeInfoCol> = {},
): CodeInfoCol {
  return CodeInfoColSchema.parse(input);
}

// UITypeColEntry schema
export const UITypeColEntrySchema = z
  .object({
    uiTypeId: z.string().default(BASE_UI_TYPE_IDS[UITypeName.TEXT]),
    nonPresetUITypeIds: z.array(z.string()).default(() => []),
  })
  .strict();
export type UITypeColEntry = z.infer<typeof UITypeColEntrySchema>;

// UITypeColEntry factory function
export function createUITypeColEntry(
  input: Partial<UITypeColEntry> = {},
): UITypeColEntry {
  return UITypeColEntrySchema.parse(input);
}

// Artifact schema
export const ArtifactSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    value: z.string().nullable().default(null),
    type: z.string(),
  })
  .strict();
export type Artifact = z.infer<typeof ArtifactSchema>;

// Artifact factory function
export function createArtifact(input: Partial<Artifact> = {}): Artifact {
  return ArtifactSchema.parse(input);
}

// ProjectConfigChild schema
export const ProjectConfigChildSchema = z
  .object({
    x: z.number().default(0),
    y: z.number().default(0),
    zIndex: z.number().int().default(0),
    w: z.number().default(1),
    h: z.number().default(1),
  })
  .strict();
export type ProjectConfigChild = z.infer<typeof ProjectConfigChildSchema>;

// ProjectConfigChild factory function
export function createProjectConfigChild(
  input: Partial<ProjectConfigChild> = {},
): ProjectConfigChild {
  return ProjectConfigChildSchema.parse(input);
}

// ProjectConfig schema
export const ProjectConfigSchema = z
  .object({
    id: z.string().default(() => createNewId()),
    name: z.string().default(() => generateMemorableString()),
    previewImgColor: z.string().default("bg-blue-500/60 dark:bg-blue-600/30"),
    viewport: ViewportSchema.nullable().default(() => createViewport()),
    children: z.record(ProjectConfigChildSchema).default(() => ({})),
    viewingEditingMode: ViewingEditingModeSchema.default(
      ViewingEditingMode.DEV,
    ),
    genCodePrefix: z.string().default(""),
    genCodeSuffix: z.string().default(""),
  })
  .strict();
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// ProjectConfig factory function
export function createProjectConfig(
  input: Partial<ProjectConfig> = {},
): ProjectConfig {
  return ProjectConfigSchema.parse(input);
}

// ProjectState schema
export const ProjectStateSchema = z
  .object({
    projectConfigs: z.record(ProjectConfigSchema).default(() => ({})),
    sections: z.record(SectionSchema).default(() => ({})),
    variants: z.record(SectionVariantSchema).default(() => ({})),
    codeInfo: z.record(CodeInfoSchema).default(() => ({})),
    codeInfoCols: z.record(CodeInfoColSchema).default(() => ({})),
    uiTypes: z.record(UITypeSchema).default(() => _.cloneDeep(BASE_UI_TYPES)),
    uiTypeCols: z.record(z.record(UITypeColEntrySchema)).default(() => ({})),
    defaultProjectConfigId: z.string().nullable().default(null),
  })
  .strict();
export type ProjectState = z.infer<typeof ProjectStateSchema>;

// ProjectState factory function
export function createProjectState(
  input: Partial<ProjectState> = {},
): ProjectState {
  return ProjectStateSchema.parse(input);
}

// ProjectSaveState schema
export const ProjectSaveStateSchema = z
  .object({
    projectConfigId: z.string(),
    projectState: ProjectStateSchema,
  })
  .strict();
export type ProjectSaveState = z.infer<typeof ProjectSaveStateSchema>;

// ProjectSaveState factory function
export function createProjectSaveState(
  input: Partial<ProjectSaveState> = {},
): ProjectSaveState {
  return ProjectSaveStateSchema.parse(input);
}

// ProjectLoadState schema
export const ProjectLoadStateSchema = z
  .object({
    projectConfigId: z.string(),
    projectState: ProjectStateSchema,
  })
  .strict();
export type ProjectLoadState = z.infer<typeof ProjectLoadStateSchema>;

// ProjectLoadState factory function
export function createProjectLoadState(
  input: Partial<ProjectLoadState> = {},
): ProjectLoadState {
  return ProjectLoadStateSchema.parse(input);
}

// ProjectUpdateState schema
export const ProjectUpdateStateSchema = z
  .object({
    projectConfigId: z.string(),
    projectState: ProjectStateSchema,
    requestRenameRefactor: z.boolean().default(false),
  })
  .strict();
export type ProjectUpdateState = z.infer<typeof ProjectUpdateStateSchema>;

// ProjectUpdateState factory function
export function createProjectUpdateState(
  input: Partial<ProjectUpdateState> = {},
): ProjectUpdateState {
  return ProjectUpdateStateSchema.parse(input);
}

// SettingsShortcuts schema
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

// SettingsShortcuts factory function
export function createSettingsShortcuts(
  input: Partial<SettingsShortcuts> = {},
): SettingsShortcuts {
  return SettingsShortcutsSchema.parse(input);
}

// SettingsGUI schema
export const SettingsGUISchema = z.object({
  snapGrid: z.array(z.number().int()).default([15, 15]),
  showGridLines: z.boolean().default(true),
  gridPattern: z.string().default("Dots"),
  gridPatternSize: z.number().int().default(2),
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
  transitionDuration: z.number().int().default(50),
});
export type SettingsGUI = z.infer<typeof SettingsGUISchema>;

// SettingsGUI factory function
export function createSettingsGUI(
  input: Partial<SettingsGUI> = {},
): SettingsGUI {
  return SettingsGUISchema.parse(input);
}

// SettingsBackend schema
export const SettingsBackendSchema = z.object({
  showDefaultConfigOnLoad: z.boolean().default(true),
  autosave: z.boolean().default(false),
  autobackup: z.boolean().default(false),
  autobackupFreq: z.number().int().default(300),
  autobackupKeepLastN: z.number().int().default(10),
  clearTerminalBeforeMarkingAsReady: z.boolean().default(true),
  defaultTerminalShell: z.string().nullable().default(null),
  exportDbRawOnSave: z.boolean().default(false),
  exportDbReadableOnSave: z.boolean().default(false),
  exportDbReadableWithVariantsOnSave: z.boolean().default(false),
  renameRefactorMode: z.string().default("Always Ask"),
  saveRenderedValues: z.boolean().default(false),
});
export type SettingsBackend = z.infer<typeof SettingsBackendSchema>;

// SettingsBackend factory function
export function createSettingsBackend(
  input: Partial<SettingsBackend> = {},
): SettingsBackend {
  return SettingsBackendSchema.parse(input);
}

// SettingsState schema
export const SettingsStateSchema = z
  .object({
    shortcuts: SettingsShortcutsSchema.default(() => createSettingsShortcuts()),
    gui: SettingsGUISchema.default(() => createSettingsGUI()),
    backend: SettingsBackendSchema.default(() => createSettingsBackend()),
    languageServer: z.record(z.any()).default(() => ({})),
    sections: z.record(z.any()).default({
      CODE: { size: { width: 500 } },
      TERMINAL: { size: { width: 700, height: 300 } },
      CHART: { size: { width: 400, height: 400 } },
      GLOBAL_VARIABLES: { name: "Global Variables" },
      GLOBAL_PARAM_SWEEP: { name: "Global Param Sweep" },
      GEN_PYTHON_CODE: { name: "Generated Python Code" },
      TEXT_BLOCK: { displayMode: "RENDER" },
      CHAT: { size: { width: 405, height: 405 } },
    }),
  })
  .strict();
export type SettingsState = z.infer<typeof SettingsStateSchema>;

// SettingsState factory function
export function createSettingsState(
  input: Partial<SettingsState> = {},
): SettingsState {
  return SettingsStateSchema.parse(input);
}
