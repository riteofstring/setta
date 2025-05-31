type APIKeys = Record<string, string>;

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
  BROWSER = "BROWSER",
}

enum UITypePresetType {
  BASE = "BASE",
  USER = "USER",
}

enum CodeInfoType {
  PARAMETER = "parameter",
  CALLABLE = "callable",
  COLLECTION = "collection",
}

enum CodeLanguage {
  PYTHON = "python",
  BASH = "bash",
}

enum ConfigLanguage {
  PYTHON = "python",
  JSON = "json",
}

enum ParameterPassingStyle {
  DEFAULT = "DEFAULT",
  ARGS = "ARGS",
  KWARGS = "KWARGS",
  POSITIONAL_ONLY = "POSITIONAL_ONLY",
  KEYWORD_ONLY = "KEYWORD_ONLY",
}

enum Size {
  AUTO = "auto",
}

enum ViewingEditingMode {
  DEV = "DEV",
  USER = "USER",
  USER_EDIT = "USER_EDIT",
}

type UIType = {
  id?: string;
  type?: UITypeName;
  name?: string;
  presetType?: any;
  config?: Record<string, any>;
};

type WebSearchResultBlock = {
  encrypted_content: string;
  page_age?: string | null;
  title: string;
  type: "web_search_result";
  url: string;
};

type WebSearchToolResultError = {
  error_code:
    | "invalid_tool_input"
    | "unavailable"
    | "max_uses_exceeded"
    | "too_many_requests"
    | "query_too_long";
  type: "web_search_tool_result_error";
};

type CitationsWebSearchResultLocation = {
  cited_text: string;
  encrypted_index: string;
  title?: string | null;
  type: "web_search_result_location";
  url: string;
};

type CitationContentBlockLocation = {
  cited_text: string;
  document_index: number;
  document_title?: string | null;
  end_block_index: number;
  start_block_index: number;
  type: "content_block_location";
};

type CitationPageLocation = {
  cited_text: string;
  document_index: number;
  document_title?: string | null;
  end_page_number: number;
  start_page_number: number;
  type: "page_location";
};

type CitationCharLocation = {
  cited_text: string;
  document_index: number;
  document_title?: string | null;
  end_char_index: number;
  start_char_index: number;
  type: "char_location";
};

type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: any[];
  is_error: boolean;
};

type RedactedThinkingBlock = {
  data: string;
  type: "redacted_thinking";
};

type ThinkingBlock = {
  signature: string;
  thinking: string;
  type: "thinking";
};

type WebSearchToolResultBlock = {
  content: WebSearchToolResultError | WebSearchResultBlock[];
  tool_use_id: string;
  type: "web_search_tool_result";
};

type ServerToolUseBlock = {
  id: string;
  input: any;
  name: "web_search";
  type: "server_tool_use";
};

type ToolUseBlock = {
  id: string;
  input: any;
  name: string;
  type: "tool_use";
};

type TextBlock = {
  citations?:
    | (
        | CitationCharLocation
        | CitationPageLocation
        | CitationContentBlockLocation
        | CitationsWebSearchResultLocation
      )[]
    | null;
  text: string;
  type: "text";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: (
    | (
        | TextBlock
        | ToolUseBlock
        | ServerToolUseBlock
        | WebSearchToolResultBlock
        | ThinkingBlock
        | RedactedThinkingBlock
      )
    | ToolResult
  )[];
};

type Chat = {
  id: string;
  name: string;
  lastUpdated?: string;
  messages: ChatMessage[];
};

type ChatMetadata = {
  id: string;
  name: string;
  lastUpdated?: string;
};

type EmbeddedResource = {
  type: "resource";
  resource: any;
  annotations?: any;
};

type FullMessageStop = {
  type: "full_message_stop";
  messages: ChatMessage[];
  toolResults: Record<string, ToolResult>;
};

type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: any;
};

type TextContent = {
  type: "text";
  text: string;
  annotations?: any;
};

type CodeInfoCol = {
  children?: Record<any, string[]>;
};

type EVEntry = {
  value?: string;
};

type ChartSettings = {
  type?: string;
  xAxisColumn?: string;
  secondYAxisColumns?: string[];
  xAxisLog?: boolean;
  y1AxisLog?: boolean;
  y2AxisLog?: boolean;
};

type DrawAreaCanvasSettings = {
  activeLayerId?: any;
  color?: string;
  brushSize?: number;
  brushShape?: string;
  eraserBrushSize?: number;
  drawThrottleDelay?: number;
  canvasTransferQueueLength?: number;
  mode?: string;
};

type Visibility = {
  DEV?: boolean;
  USER?: boolean;
};

type SectionSize = {
  width?: number | "auto";
  height?: number | "auto";
};

type ProjectConfigChild = {
  x?: number;
  y?: number;
  zIndex?: number;
  w?: number;
  h?: number;
};

type UITypeColEntry = {
  uiTypeId?: string;
  nonPresetUITypeIds?: string[];
};

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
};

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
};

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
  pinnedAreaHeight?: number | "auto";
  isMinimized?: boolean;
  canvasSettings?: DrawAreaCanvasSettings;
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
};

type ProjectConfig = {
  id?: string;
  name?: string;
  previewImgColor?: string;
  viewport?: any;
  children?: Record<string, ProjectConfigChild>;
  viewingEditingMode?: ViewingEditingMode;
  genCodePrefix?: string;
  genCodeSuffix?: string;
};

type ProjectState = {
  projectConfigs?: Record<string, ProjectConfig>;
  sections?: Record<string, Section>;
  variants?: Record<string, SectionVariant>;
  codeInfo?: Record<string, CodeInfo>;
  codeInfoCols?: Record<string, CodeInfoCol>;
  uiTypes?: Record<string, UIType>;
  uiTypeCols?: Record<string, Record<string, UITypeColEntry>>;
  defaultProjectConfigId?: any;
};

type Artifact = {
  name: string;
  path: string;
  value?: any;
  type: string;
};

type ProjectLoadState = {
  projectConfigId: string;
  projectState: ProjectState;
};

type ProjectSaveState = {
  projectConfigId: string;
  projectState: ProjectState;
};

type ProjectUpdateState = {
  projectConfigId: string;
  projectState: ProjectState;
  requestRenameRefactor?: boolean;
};

type Viewport = {
  x?: number;
  y?: number;
  zoom?: number;
};

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
};

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
};

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
};

type SettingsState = {
  shortcuts?: SettingsShortcuts;
  gui?: SettingsGUI;
  backend?: SettingsBackend;
  languageServer?: Record<string, any>;
  sections?: Record<string, any>;
};
