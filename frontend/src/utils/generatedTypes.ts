export type ID = string;

export type APIKeys = Record<string, string>;

export type IDToUUIDForLLM = Record<ID, string>;

export type UUIDToIDForLLM = Record<string, ID>;

export type JSONValueType =
  | (Record<string, any> | any[] | string | number | number | boolean)
  | null;

export type ChatRole = "user" | "assistant";

export type WebSearchResultBlock = {
  encrypted_content: string;
  page_age: string | null;
  title: string;
  type: "web_search_result";
  url: string;
};

export type WebSearchToolResultError = {
  error_code:
    | "invalid_tool_input"
    | "unavailable"
    | "max_uses_exceeded"
    | "too_many_requests"
    | "query_too_long";
  type: "web_search_tool_result_error";
};

export type CitationsWebSearchResultLocation = {
  cited_text: string;
  encrypted_index: string;
  title: string | null;
  type: "web_search_result_location";
  url: string;
};

export type CitationContentBlockLocation = {
  cited_text: string;
  document_index: number;
  document_title: string | null;
  end_block_index: number;
  start_block_index: number;
  type: "content_block_location";
};

export type CitationPageLocation = {
  cited_text: string;
  document_index: number;
  document_title: string | null;
  end_page_number: number;
  start_page_number: number;
  type: "page_location";
};

export type CitationCharLocation = {
  cited_text: string;
  document_index: number;
  document_title: string | null;
  end_char_index: number;
  start_char_index: number;
  type: "char_location";
};

export type RedactedThinkingBlock = {
  data: string;
  type: "redacted_thinking";
};

export type ThinkingBlock = {
  signature: string;
  thinking: string;
  type: "thinking";
};

export type WebSearchToolResultBlock = {
  content: WebSearchToolResultError | WebSearchResultBlock[];
  tool_use_id: string;
  type: "web_search_tool_result";
};

export type ServerToolUseBlock = {
  id: string;
  input: any;
  name: "web_search";
  type: "server_tool_use";
};

export type ToolUseBlock = {
  id: string;
  input: any;
  name: string;
  type: "tool_use";
};

export type TextBlock = {
  citations:
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

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ServerToolUseBlock
  | WebSearchToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock;

export enum ArtifactType {
  IMG = "img",
  BRUSH_STROKES = "brushStrokes",
  LIST = "list",
  CHAT_HISTORY = "chatHistory",
}

export enum UITypeName {
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
  TERMINAL = "TERMINAL",
  IFRAME = "IFRAME",
  CHAT = "CHAT",
  BROWSER = "BROWSER",
}

export enum UITypePresetType {
  BASE = "BASE",
  USER = "USER",
}

export enum CodeInfoType {
  PARAMETER = "parameter",
  CALLABLE = "callable",
  COLLECTION = "collection",
}

export enum SettaNotificationType {
  SUCCESS = "success",
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
  SAVE = "save",
}

export enum CodeLanguage {
  PYTHON = "python",
  BASH = "bash",
}

export enum ConfigLanguage {
  PYTHON = "python",
  JSON = "json",
}

export enum ParameterPassingStyle {
  DEFAULT = "DEFAULT",
  ARGS = "ARGS",
  KWARGS = "KWARGS",
  POSITIONAL_ONLY = "POSITIONAL_ONLY",
  KEYWORD_ONLY = "KEYWORD_ONLY",
}

export enum Size {
  AUTO = "auto",
}

export enum ViewingEditingMode {
  DEV = "DEV",
  USER = "USER",
  USER_EDIT = "USER_EDIT",
}

export type Artifact = {
  name: string;
  path: string;
  type: ArtifactType;
  value:
    | (Record<string, any> | any[] | string | number | number | boolean)
    | null;
};

export type ArtifactWithId = {
  name: string;
  path: string;
  type: ArtifactType;
  value:
    | (Record<string, any> | any[] | string | number | number | boolean)
    | null;
  id: string | null;
};

export type ArtifactWithoutValue = {
  name: string;
  path: string;
  type: ArtifactType;
};

export type UIType = {
  id: string;
  type: UITypeName;
  name: string;
  presetType: UITypePresetType | null;
  config: Record<string, any>;
};

export type BlobResourceContents = {
  uri: any;
  mimeType: string | null;
  blob: string;
};

export type TextResourceContents = {
  uri: any;
  mimeType: string | null;
  text: string;
};

export type Annotations = {
  audience: "user" | "assistant"[] | null;
  priority: number | null;
};

export type EmbeddedResource = {
  type: "resource";
  resource: TextResourceContents | BlobResourceContents;
  annotations: Annotations | null;
};

export type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  annotations: Annotations | null;
};

export type TextContent = {
  type: "text";
  text: string;
  annotations: Annotations | null;
};

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: (TextContent | ImageContent | EmbeddedResource)[];
  is_error: boolean;
};

export type ChatMessage = {
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

export type Chat = {
  id: string;
  name: string;
  lastUpdated: string;
  messages: ChatMessage[];
};

export type ChatMetadata = {
  id: string;
  name: string;
  lastUpdated: string;
};

export type FullMessageStop = {
  type: "full_message_stop";
  messages: ChatMessage[];
  toolResults: Record<string, ToolResult>;
};

export type CodeInfoCol = {
  children: Record<string, string[]>;
};

export type EVEntry = {
  value: string;
};

export type ChartSettings = {
  type: string;
  xAxisColumn: string;
  secondYAxisColumns: string[];
  xAxisLog: boolean;
  y1AxisLog: boolean;
  y2AxisLog: boolean;
};

export type DrawAreaCanvasSettings = {
  activeLayerId: string | null;
  color: string;
  brushSize: number;
  brushShape: string;
  eraserBrushSize: number;
  drawThrottleDelay: number;
  canvasTransferQueueLength: number;
  mode: string;
};

export type Visibility = {
  DEV: boolean;
  USER: boolean;
};

export type SectionSize = {
  width: number | "auto";
  height: number | "auto";
};

export type ProjectConfigChild = {
  x: number;
  y: number;
  zIndex: number;
  w: number;
  h: number;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type UITypeColEntry = {
  uiTypeId: string;
  nonPresetUITypeIds: string[];
};

export type CodeInfo = {
  id: string;
  name: string;
  editable: boolean;
  rcType: CodeInfoType;
  defaultVal: string;
  description: string;
  passingStyle: ParameterPassingStyle;
  isPinned: boolean;
  isFrozen: boolean;
  isSelected: boolean;
  ignoreTypeErrors: boolean;
};

export type SectionVariant = {
  name: string;
  values: Record<string, EVEntry>;
  children: string[];
  selectedItem: string | null;
  code: string;
  codeInfoColId: string | null;
  description: string;
  isFrozen: boolean;
  configLanguage: ConfigLanguage;
  isJsonSource: boolean;
  jsonSourceKeys: string[];
  jsonSourceMissing: boolean;
};

export type Section = {
  id: string;
  name: string;
  size: SectionSize;
  parentId: string | null;
  variantId: string;
  uiTypeId: string;
  uiTypeColId: string | null;
  social: string;
  artifactGroupIds: string[];
  defaultVariantId: string | null;
  variantIds: string[];
  nonPresetUITypeIds: string[];
  codeLanguage: CodeLanguage;
  isEntryCodeBlock: boolean;
  isFrozen: boolean;
  isHorizontalOrientation: boolean;
  hideParams: boolean;
  hideSearch: boolean;
  hideUnpinnedParams: boolean;
  hideColumn: boolean;
  displayMode: string;
  visibility: Visibility;
  pinnedAreaHeight: number | "auto";
  isMinimized: boolean;
  canvasSettings: DrawAreaCanvasSettings;
  chartSettings: ChartSettings;
  isTemporary: boolean;
  renderMarkdown: boolean;
  positionAndSizeLocked: boolean;
  selectedVariantIds: Record<string, any>;
  paramFilter: string;
  isInOtherProjectConfigs: boolean;
  aspectRatio: boolean;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
  columnWidth: number | null;
  renderedValue: any;
  headingAsSectionName: boolean;
};

export type ProjectConfig = {
  id: string;
  name: string;
  previewImgColor: string;
  viewport: Viewport | null;
  children: Record<string, ProjectConfigChild>;
  viewingEditingMode: ViewingEditingMode;
  genCodePrefix: string;
  genCodeSuffix: string;
};

export type ProjectState = {
  projectConfigs: Record<string, ProjectConfig>;
  sections: Record<string, Section>;
  variants: Record<string, SectionVariant>;
  codeInfo: Record<string, CodeInfo>;
  codeInfoCols: Record<string, CodeInfoCol>;
  uiTypes: Record<string, UIType>;
  uiTypeCols: Record<string, Record<string, UITypeColEntry>>;
  defaultProjectConfigId: string | null;
};

export type BaseModel = {};

export type SettaNotification = {
  id: string;
  projectConfigId: string;
  type: SettaNotificationType;
  message: string;
  temporary: boolean;
  timestamp: string;
  metadata: Record<string, any>;
  read_status: boolean;
};

export type ProjectLoadState = {
  projectConfigId: string;
  projectState: ProjectState;
};

export type ProjectSaveState = {
  projectConfigId: string;
  projectState: ProjectState;
};

export type ProjectUpdateState = {
  projectConfigId: string;
  projectState: ProjectState;
  requestRenameRefactor: boolean;
};

export type SettingsBackend = {
  showDefaultConfigOnLoad: boolean;
  autosave: boolean;
  autobackup: boolean;
  autobackupFreq: number;
  autobackupKeepLastN: number;
  clearTerminalBeforeMarkingAsReady: boolean;
  defaultTerminalShell: string | null;
  exportDbRawOnSave: boolean;
  exportDbReadableOnSave: boolean;
  exportDbReadableWithVariantsOnSave: boolean;
  renameRefactorMode: string;
  saveRenderedValues: boolean;
};

export type SettingsGUI = {
  snapGrid: number[];
  showGridLines: boolean;
  gridPattern: string;
  gridPatternSize: number;
  gridColor: string;
  gridColorDarkMode: string;
  defaultZoomLevel: number;
  minZoom: number;
  maxZoom: number;
  panOnDrag: boolean;
  panOnScroll: boolean;
  panOnScrollSpeed: number;
  panOnScrollMode: string;
  zoomOnScroll: boolean;
  zoomOnPinch: boolean;
  zoomOnDoubleClick: boolean;
  selectionMode: string;
  leftSidePaneShiftsMap: boolean;
  transitionDuration: number;
};

export type SettingsShortcuts = {
  newCardShortcut: string;
  newGroupShortcut: string;
  typeCheckShortcut: string;
  newProjectConfigShortcut: string;
  undoShortcut: string;
  redoShortcut: string;
  groupShortcut: string;
  ungroupShortcut: string;
  saveShortcut: string;
  saveAsShortcut: string;
  loadShortcut: string;
  searchShortcut: string;
  advancedSearchShortcut: string;
  commandPaletteShortcut: string;
  resetZoomShortcut: string;
  copyShortcut: string;
  pasteShortcut: string;
  pasteAsRefShortcut: string;
  sortingShortcut: string;
  movingFreeShortcut: string;
  showTooltipShortcut: string;
  tooltipToPlaintextShortcut: string;
  tooltipToMarkdownShortcut: string;
  freezeTooltipShortcut: string;
  frozenTooltipToPlaintextShortcut: string;
  frozenTooltipToMarkdownShortcut: string;
  incrementTooltipPageShortcut: string;
  decrementTooltipPageShortcut: string;
  copyTooltipTextShortcut: string;
  frozenTooltipIncrementShortcut: string;
  frozenTooltipDecrementShortcut: string;
  frozenTooltipCopyShortcut: string;
  newTerminalShortcut: string;
  fitViewShortcut: string;
  zoomToMouseShortcut: string;
  deleteSectionShortcut: string;
  selectAll: string;
  selectTopLevelNonGroupSections: string;
  showVersionsTabShortcut: string;
  showParamUITypeTabShortcut: string;
  showProjectOverviewTabShortcut: string;
  runCodeShortcut: string;
  runEntryCodeBlockShortcut: string;
  sendProjectToAllInteractiveCode: string;
  paramSelect: string;
  formatCode: string;
  selectionKeyCode: string;
  multiSelectionKeyCode: string;
  panActivationKeyCode: string;
  zoomActivationKeyCode: string;
  zoomInShortcut: string;
  zoomOutShortcut: string;
  restartLanguageServerShortcut: string;
};

export type SettingsState = {
  shortcuts: SettingsShortcuts;
  gui: SettingsGUI;
  backend: SettingsBackend;
  languageServer: Record<string, any>;
  sections: Record<string, any>;
};
