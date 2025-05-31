enum ParameterPassingStyle {
  DEFAULT = "DEFAULT",
  ARGS = "ARGS",
  KWARGS = "KWARGS",
  POSITIONAL_ONLY = "POSITIONAL_ONLY",
  KEYWORD_ONLY = "KEYWORD_ONLY"
}

enum ConfigLanguage {
  PYTHON = "python",
  JSON = "json"
}

enum CodeLanguage {
  PYTHON = "python",
  BASH = "bash"
}

enum UITypeName {
  TEXT = "TEXT",
  SLIDER = "SLIDER",
  SWITCH = "SWITCH",
  COLOR_PICKER = "COLOR_PICKER",
  DROPDOWN = "DROPDOWN",
  PASSWORD = "PASSWORD",
  SECTION = "SECTION",
  LIST_ROOT = "LIST_ROOT",
  DICT_ROOT = "DICT_ROOT",
  GROUP = "GROUP",
  IMAGE = "IMAGE",
  CHART = "CHART",
  DRAW = "DRAW",
  TEXT_BLOCK = "TEXT_BLOCK",
  SOCIAL = "SOCIAL",
  GLOBAL_VARIABLES = "GLOBAL_VARIABLES",
  CODE = "CODE",
  GEN_PYTHON_CODE = "GEN_PYTHON_CODE",
  PARAM_SWEEP = "PARAM_SWEEP",
  TERMINAL = "TERMINAL",
  GLOBAL_PARAM_SWEEP = "GLOBAL_PARAM_SWEEP",
  IFRAME = "IFRAME",
  CHAT = "CHAT",
  BROWSER = "BROWSER"
}

enum ViewingEditingMode {
  DEV = "DEV",
  USER = "USER",
  USER_EDIT = "USER_EDIT"
}

enum CodeInfoType {
  PARAMETER = "parameter",
  CALLABLE = "callable",
  COLLECTION = "collection"
}

enum Size {
  AUTO = "auto"
}

enum UITypePresetType {
  BASE = "BASE",
  USER = "USER"
}

type ProjectConfigChild = {
  x?: number;
  y?: number;
  zIndex?: number;
  w?: number;
  h?: number;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: Sequence;
}

type Chat = {
  id: string;
  name: string;
  lastUpdated?: datetime;
  messages: ChatMessage[];
}

type SectionVariant = {
  name?: string;
  values?: Record<string, EVEntry>;
  children?: string[];
  selectedItem?: any;
  code?: string;
  codeInfoColId?: any;
  description?: string;
  isFrozen?: boolean;
  sweep?: any[];
  runGroup?: Record<string, any>;
  configLanguage?: ConfigLanguage;
  isJsonSource?: boolean;
  jsonSourceKeys?: string[];
  jsonSourceMissing?: boolean;
}

type EVEntry = {
  value?: string;
}

type ProjectConfig = {
  id?: string;
  name?: string;
  previewImgColor?: string;
  viewport?: any;
  children?: Record<string, ProjectConfigChild>;
  viewingEditingMode?: ViewingEditingMode;
  genCodePrefix?: string;
  genCodeSuffix?: string;
}

type ProjectUpdateState = {
  projectConfigId: string;
  projectState: ProjectState;
  requestRenameRefactor?: boolean;
}

type UITypeColEntry = {
  uiTypeId?: string;
  nonPresetUITypeIds?: string[];
}

type Viewport = {
  x?: number;
  y?: number;
  zoom?: number;
}

type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: any[];
  is_error: boolean;
}

type SettingsBackend = {
  showDefaultConfigOnLoad?: boolean;
  autosave?: boolean;
  autobackup?: boolean;
  autobackupFreq?: number;
  autobackupKeepLastN?: number;
  clearTerminalBeforeMarkingAsReady?: boolean;
  defaultTerminalShell?: any;
  exportDbRawOnSave?: boolean;
  exportDbReadableOnSave?: boolean;
  exportDbReadableWithVariantsOnSave?: boolean;
  renameRefactorMode?: string;
  saveRenderedValues?: boolean;
}

type FullMessageStop = {
  type: "full_message_stop";
  messages: ChatMessage[];
  toolResults: Record<string, ToolResult>;
}

type ChartSettings = {
  type?: string;
  xAxisColumn?: string;
  secondYAxisColumns?: string[];
  xAxisLog?: boolean;
  y1AxisLog?: boolean;
  y2AxisLog?: boolean;
}

type SectionSize = {
  width?: (number | "auto");
  height?: (number | "auto");
}

type Visibility = {
  DEV?: boolean;
  USER?: boolean;
}

type ProjectState = {
  projectConfigs?: Record<string, ProjectConfig>;
  sections?: Record<string, Section>;
  variants?: Record<string, SectionVariant>;
  codeInfo?: Record<string, CodeInfo>;
  codeInfoCols?: Record<string, CodeInfoCol>;
  uiTypes?: Record<string, UIType>;
  uiTypeCols?: Record<string, Record<string, UITypeColEntry>>;
  defaultProjectConfigId?: any;
}

type CodeInfoCol = {
  children?: Record<any, string[]>;
}

type Artifact = {
  name: string;
  path: string;
  value?: any;
  type: string;
}

type CodeInfo = {
  id?: string;
  name?: string;
  editable?: boolean;
  rcType?: CodeInfoType;
  defaultVal?: string;
  description?: string;
  passingStyle?: ParameterPassingStyle;
  isPinned?: boolean;
  isFrozen?: boolean;
  isSelected?: boolean;
  ignoreTypeErrors?: boolean;
}

type ChatMetadata = {
  id: string;
  name: string;
  lastUpdated?: datetime;
}

type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: any;
}

type CanvasSettings = {
  activeLayerId?: any;
  color?: string;
  brushSize?: number;
  brushShape?: string;
  eraserBrushSize?: number;
  drawThrottleDelay?: number;
  canvasTransferQueueLength?: number;
  mode?: string;
}

type SettingsShortcuts = {
  newCardShortcut?: string;
  newGroupShortcut?: string;
  typeCheckShortcut?: string;
  newProjectConfigShortcut?: string;
  undoShortcut?: string;
  redoShortcut?: string;
  groupShortcut?: string;
  ungroupShortcut?: string;
  saveShortcut?: string;
  saveAsShortcut?: string;
  loadShortcut?: string;
  searchShortcut?: string;
  advancedSearchShortcut?: string;
  commandPaletteShortcut?: string;
  resetZoomShortcut?: string;
  copyShortcut?: string;
  pasteShortcut?: string;
  pasteAsRefShortcut?: string;
  sortingShortcut?: string;
  movingFreeShortcut?: string;
  showTooltipShortcut?: string;
  tooltipToPlaintextShortcut?: string;
  tooltipToMarkdownShortcut?: string;
  freezeTooltipShortcut?: string;
  frozenTooltipToPlaintextShortcut?: string;
  frozenTooltipToMarkdownShortcut?: string;
  incrementTooltipPageShortcut?: string;
  decrementTooltipPageShortcut?: string;
  copyTooltipTextShortcut?: string;
  frozenTooltipIncrementShortcut?: string;
  frozenTooltipDecrementShortcut?: string;
  frozenTooltipCopyShortcut?: string;
  newTerminalShortcut?: string;
  fitViewShortcut?: string;
  zoomToMouseShortcut?: string;
  deleteSectionShortcut?: string;
  selectAll?: string;
  selectTopLevelNonGroupSections?: string;
  showVersionsTabShortcut?: string;
  showParamUITypeTabShortcut?: string;
  showProjectOverviewTabShortcut?: string;
  runCodeShortcut?: string;
  runEntryCodeBlockShortcut?: string;
  sendProjectToAllInteractiveCode?: string;
  paramSelect?: string;
  formatCode?: string;
  selectionKeyCode?: string;
  multiSelectionKeyCode?: string;
  panActivationKeyCode?: string;
  zoomActivationKeyCode?: string;
  zoomInShortcut?: string;
  zoomOutShortcut?: string;
  restartLanguageServerShortcut?: string;
}

type ProjectSaveState = {
  projectConfigId: string;
  projectState: ProjectState;
}

type UIType = {
  id?: string;
  type?: UITypeName;
  name?: string;
  presetType?: any;
  config?: Record<string, any>;
}

type EmbeddedResource = {
  type: "resource";
  resource: any;
  annotations?: any;
}

type Section = {
  id?: string;
  name?: string;
  size?: SectionSize;
  parentId?: any;
  variantId?: string;
  uiTypeId?: string;
  uiTypeColId?: any;
  social?: string;
  artifactGroupIds?: string[];
  defaultVariantId?: any;
  variantIds?: string[];
  paramSweepSectionId?: any;
  nonPresetUITypeIds?: string[];
  codeLanguage?: CodeLanguage;
  isEntryCodeBlock?: boolean;
  isFrozen?: boolean;
  isHorizontalOrientation?: boolean;
  hideParams?: boolean;
  hideSearch?: boolean;
  hideUnpinnedParams?: boolean;
  hideColumn?: boolean;
  displayMode?: string;
  visibility?: Visibility;
  pinnedAreaHeight?: (number | "auto");
  isMinimized?: boolean;
  canvasSettings?: CanvasSettings;
  chartSettings?: ChartSettings;
  isTemporary?: boolean;
  renderMarkdown?: boolean;
  positionAndSizeLocked?: boolean;
  selectedVariantIds?: Record<string, any>;
  paramFilter?: string;
  isInOtherProjectConfigs?: boolean;
  aspectRatio?: boolean;
  aspectRatioExtraHeight?: number;
  aspectRatioExtraWidth?: number;
  columnWidth?: any;
  renderedValue?: any;
  headingAsSectionName?: boolean;
}

type SettingsGUI = {
  snapGrid?: number[];
  showGridLines?: boolean;
  gridPattern?: string;
  gridPatternSize?: number;
  gridColor?: string;
  gridColorDarkMode?: string;
  defaultZoomLevel?: number;
  minZoom?: number;
  maxZoom?: number;
  panOnDrag?: boolean;
  panOnScroll?: boolean;
  panOnScrollSpeed?: number;
  panOnScrollMode?: string;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  zoomOnDoubleClick?: boolean;
  selectionMode?: string;
  leftSidePaneShiftsMap?: boolean;
  transitionDuration?: number;
}

type TextContent = {
  type: "text";
  text: string;
  annotations?: any;
}

type ProjectLoadState = {
  projectConfigId: string;
  projectState: ProjectState;
}

type SettingsState = {
  shortcuts?: SettingsShortcuts;
  gui?: SettingsGUI;
  backend?: SettingsBackend;
  languageServer?: dict;
  sections?: dict;
}

