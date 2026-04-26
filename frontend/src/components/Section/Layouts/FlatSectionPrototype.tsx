import { useId, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArtifactTypeEnum,
  BrowserAreaViewModeEnum,
  BrowserSearchScopeEnum,
  ButtonActionModeEnum,
  ChartTypeEnum,
  ChatDictationModeEnum,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  CodeObjTypeEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  DrawAreaBrushShapeEnum,
  DrawAreaModeEnum,
  DropzoneModeEnum,
  EngineTypeEnum,
  FormatEnum,
  ListRootViewModeEnum,
  SectionTypeEnum,
  SpreadsheetGridDensityEnum,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardViewModeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
  TimeControlModeEnum,
  TimeDisplayFormatEnum,
  type SectionType,
} from "utils/generatedTypes";
import "./FlatSectionPrototype.css";

type FlatSectionKind =
  | "browser"
  | "callable"
  | "chart"
  | "chat"
  | "code"
  | "dict"
  | "draw"
  | "gen-python-code"
  | "gen-python-metadata"
  | "global-variables"
  | "group"
  | "image"
  | "iframe"
  | "list-root"
  | "meta-control"
  | "plugin"
  | "prompt"
  | "social"
  | "spreadsheet"
  | "terminal"
  | "task-board"
  | "text-block"
  | "state-machine-start"
  | "state-machine-gate"
  | "state-machine-end";

type FlatPrototypeTheme = "dark" | "light";

type FlatPrototypePortAlign = "left" | "right";

type FlatPrototypeRowEmphasis =
  | "required"
  | "optional"
  | "pinned"
  | "edge"
  | "group"
  | "nested";

type FlatPrototypeRow = {
  keyLabel: string;
  valueLabel: string;
  depth?: number;
  emphasis?: FlatPrototypeRowEmphasis;
  trailing?: string | null;
};

type FlatPrototypeRowProps = FlatPrototypeRow & {
  nestedRailRole?: FlatPrototypeNestedRailRole;
};

type FlatPrototypeNestedRailRole = "single" | "start" | "middle" | "end";

type FlatSectionShellProps = {
  kind: FlatSectionKind;
  title: string;
  controlLabel: string;
  controlsInitiallyOpen?: boolean;
  hideMinimizeControl?: boolean;
  theme?: FlatPrototypeTheme;
  lead?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
};

type FlatPrototypeIconButtonProps = {
  label: string;
  buttonClassName?: string;
  iconClassName: string;
  controlsId?: string;
  dataAttr?: string;
  dataControlToggle?: boolean;
  dataSectionTypeMenu?: boolean;
  expanded?: boolean;
  onClick?: () => void;
};

type FlatPrototypeHeaderProps = {
  kind: FlatSectionKind;
  title: string;
  controlLabel: string;
  controlBarId: string;
  headerActions?: ReactNode;
  hideMinimizeControl: boolean;
  isControlBarOpen: boolean;
  onToggleControlBar: () => void;
};

type FlatPrototypeSectionProps = {
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
};

type FlatPrototypeGalleryItemProps = {
  label: string;
  children: ReactNode;
};

type FlatStateMachineStartAction = {
  action: "reset" | "start" | "stop";
  label: string;
  iconClassName: string;
  status: "available" | "disabled";
};

type FlatStateMachineStartActivity = {
  label: string;
  tone: "default" | "success" | "warning" | "danger";
};

type FlatStateMachineGateStatusRow = {
  label: string;
  value: string;
  state: "running" | "satisfied" | "complete";
};

type FlatStateMachineGateActivity = FlatStateMachineStartActivity & {
  id: string;
};

type FlatListRootChild = {
  id: string;
  orderLabel: string;
  sectionType: SectionType;
  title: string;
};

type FlatGroupChild = FlatListRootChild;

type FlatChartDataset = {
  id: string;
  axis: "y1" | "y2";
  label: string;
  status: "visible" | "hidden";
  tone: "primary" | "secondary" | "muted";
};

type FlatChartPoint = {
  id: string;
  tone: FlatChartDataset["tone"];
  x: string;
  y: string;
};

type FlatChartSegment = FlatChartPoint & {
  angle: string;
  width: string;
};

type FlatDrawModeControl = {
  mode: (typeof DrawAreaModeEnum)[keyof typeof DrawAreaModeEnum];
  label: string;
  iconClassName: string;
};

type FlatDrawLayerItem = {
  id: string;
  type: typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke;
  dataPath: string;
  transformId: string;
  label: string;
  x: string;
  y: string;
  width: string;
  height: string;
  angle?: string;
};

type FlatDrawLayer = {
  id: string;
  orderLabel: string;
  name: string;
  visible: boolean;
  active: boolean;
  layerOpacity: number;
  elements: FlatDrawLayerItem[];
};

type FlatTextBlockSetting = {
  id: "format" | "display" | "heading-name" | "transparent";
  label: string;
  value: string;
  active: boolean;
};

type FlatPromptInput = {
  name: string;
  value: string;
};

type FlatMetaControlWidgetPreview = {
  id: string;
  codeObjType:
    | typeof CodeObjTypeEnum.ButtonParam
    | typeof CodeObjTypeEnum.SwitchParam
    | typeof CodeObjTypeEnum.ColorPickerParam
    | typeof CodeObjTypeEnum.DropdownParam
    | typeof CodeObjTypeEnum.DateParam
    | typeof CodeObjTypeEnum.TimeParam
    | typeof CodeObjTypeEnum.DropzoneParam;
  label: string;
  value: string;
  detail: string;
};

type FlatSocialProviderOption = {
  id: "youtube" | "twitter";
  label: string;
  status: "active" | "supported";
  provider: "youtube" | "twitter";
};

type FlatCodeHeaderAction = {
  id: "run" | "entry" | "terminal" | "diagnostics";
  label: string;
  iconClassName: string;
  state: "ready" | "selected" | "visible" | "issues";
};

type FlatCodeEditorLine = {
  number: number;
  text: string;
  diagnostic?: {
    severity: "error" | "warning";
    code: string;
    message: string;
  };
};

type FlatGenPythonCodeEditorLine = FlatCodeEditorLine & {
  region: "prefix" | "generated" | "suffix";
};

type FlatGenPythonMetadataLine = FlatCodeEditorLine & {
  kind: "definition" | "project" | "sections" | "sections_by_id" | "meta";
};

type FlatTerminalLine = {
  id: string;
  kind: "command" | "output" | "system";
  prompt?: string;
  text: string;
};

type FlatChatMessage = {
  id: string;
  role:
    | typeof ChatRoleEnum.assistant
    | typeof ChatRoleEnum.tool
    | typeof ChatRoleEnum.user;
  label: string;
  text: string;
  meta: string;
  attachmentName?: string;
  branchLabel?: string;
  streaming?: boolean;
  toolCallId?: string;
  toolName?: string;
};

type FlatChatToolArgument = {
  id: string;
  toolName: string;
  value: string;
};

type FlatBrowserTypeFilter = {
  id: "image" | "video" | "audio" | "text" | "data";
  label: string;
  active: boolean;
  count: number;
};

type FlatBrowserSavedSearch = {
  id: string;
  name: string;
  query: string;
  searchScope:
    | typeof BrowserSearchScopeEnum.local
    | typeof BrowserSearchScopeEnum.recursive;
  active: boolean;
  color: string;
  quickInfo: string;
};

type FlatBrowserItem = {
  id: string;
  name: string;
  fullPath: string;
  type: "file" | "folder";
  previewKind: "audio" | "data" | "folder" | "image" | "text" | "video";
  depth: number;
  modifiedLabel: string;
  draggable: boolean;
  droppable: boolean;
  expanded?: boolean;
  selected?: boolean;
  status?: string;
};

type FlatPluginRendererStat = {
  id: "words" | "local-clicks" | "saved-pulses" | "state";
  label: string;
  value: string | number;
  source: "computed" | "data" | "local";
};

type FlatTaskBoardColumn = {
  id: string;
  name: string;
  color: string;
  sortIndex: number;
};

type FlatTaskBoardTask = {
  id: string;
  title: string;
  description: string;
  columnId: string;
  completed: boolean;
  dueDateIso: string;
  dueSummary: string | null;
  recurrence: (typeof TaskBoardTaskRecurrenceEnum)[keyof typeof TaskBoardTaskRecurrenceEnum];
  recurrenceSummary: string | null;
  sortIndex: number;
};

type FlatSpreadsheetColumn = {
  id: string;
  label: string;
  sortState: "none" | "asc" | "desc";
};

type FlatSpreadsheetRow = {
  id: string;
  rowNumber: number;
  cells: string[];
};

type FlatPrototypeRowStyle = CSSProperties &
  Partial<Record<"--flat-depth-offset", string>> &
  Partial<Record<"--flat-rail-left", string>>;

type FlatChartPointStyle = CSSProperties &
  Partial<Record<"--flat-chart-x" | "--flat-chart-y", string>>;

type FlatChartSegmentStyle = FlatChartPointStyle &
  Partial<
    Record<"--flat-chart-segment-angle" | "--flat-chart-segment-width", string>
  >;

type FlatDrawLayerStyle = CSSProperties &
  Partial<Record<"--flat-draw-layer-alpha", number>>;

type FlatDrawItemStyle = CSSProperties &
  Partial<
    Record<
      | "--flat-draw-item-angle"
      | "--flat-draw-item-height"
      | "--flat-draw-item-width"
      | "--flat-draw-item-x"
      | "--flat-draw-item-y",
      string
    >
  >;

type FlatTextBlockContentStyle = CSSProperties &
  Partial<Record<"--flat-text-block-font-size", string>>;

const NESTED_ROW_RAIL_BASE_CLASS_NAME = "flat-section-prototype__row--rail";

const NESTED_ROW_RAIL_CLASS_NAMES: Record<FlatPrototypeNestedRailRole, string> =
  {
    single: "flat-section-prototype__row--rail-single",
    start: "flat-section-prototype__row--rail-start",
    middle: "flat-section-prototype__row--rail-middle",
    end: "flat-section-prototype__row--rail-end",
  };

const NESTED_ROW_RAIL_ROLE_BY_CONTINUITY = {
  "0:0": "single",
  "0:1": "start",
  "1:0": "end",
  "1:1": "middle",
} satisfies Record<string, FlatPrototypeNestedRailRole>;

const CALLABLE_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "limit",
    valueLabel: "connected",
    emphasis: "edge",
  },
];

const CALLABLE_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "items",
    valueLabel: "list[str]",
    emphasis: "required",
  },
  {
    keyLabel: "reverse",
    valueLabel: "false",
    emphasis: "optional",
  },
  {
    keyLabel: "key",
    valueLabel: "callable | none",
    emphasis: "optional",
  },
];

const DICT_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "workspace",
    valueLabel: "string",
    emphasis: "pinned",
  },
];

const DICT_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "user",
    valueLabel: "dict",
    emphasis: "group",
  },
  {
    keyLabel: "name",
    valueLabel: '"setta"',
    depth: 1,
    emphasis: "nested",
  },
  {
    keyLabel: "mode",
    valueLabel: '"rewrite"',
    depth: 1,
    emphasis: "nested",
  },
  {
    keyLabel: "flags",
    valueLabel: "list[str]",
    emphasis: "optional",
  },
];

const GLOBAL_VARIABLES_FIXTURE = {
  sectionId: "global-variables",
  topLevelParamId: "global-root",
  exportMode: "top-level",
  selectedParams: ["api_token"],
  pinnedParams: ["workspace_id"],
  edgeInputParams: ["api_token"],
  filter: "global",
} satisfies {
  sectionId: string;
  topLevelParamId: string;
  exportMode: "top-level";
  selectedParams: string[];
  pinnedParams: string[];
  edgeInputParams: string[];
  filter: string;
};

const GLOBAL_VARIABLES_ACTIONS = [
  {
    action: "remove-kwarg",
    label: "Remove global variable",
    iconClassName: "gg-math-minus flat-section-prototype__icon-minus",
  },
  {
    action: "add-kwarg",
    label: "Add global variable",
    iconClassName: "gg-math-plus",
  },
  {
    action: "pin-selected",
    label: "Pin selected global variable",
    iconClassName: "gg-pin-alt",
  },
  {
    action: "convert-edge-input",
    label: "Convert selected global variable to edge connector",
    iconClassName: "gg-link",
  },
  {
    action: "delete-selected",
    label: "Delete selected global variables",
    iconClassName: "gg-close",
  },
] satisfies Array<{
  action:
    | "add-kwarg"
    | "convert-edge-input"
    | "delete-selected"
    | "pin-selected"
    | "remove-kwarg";
  label: string;
  iconClassName: string;
}>;

const GLOBAL_VARIABLES_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "workspace_id",
    valueLabel: 'TextParam "alpha"',
    emphasis: "pinned",
    trailing: null,
  },
  {
    keyLabel: "api_token",
    valueLabel: "PasswordParam connected",
    emphasis: "edge",
    trailing: null,
  },
];

const GLOBAL_VARIABLES_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "runtime",
    valueLabel: "NestedParam",
    emphasis: "group",
    trailing: null,
  },
  {
    keyLabel: "environment",
    valueLabel: 'TextParam "staging"',
    depth: 1,
    emphasis: "nested",
    trailing: null,
  },
  {
    keyLabel: "retry_limit",
    valueLabel: "CodeParam 3",
    depth: 1,
    emphasis: "nested",
    trailing: null,
  },
  {
    keyLabel: "release_notes_url",
    valueLabel: "TextParam",
    emphasis: "optional",
    trailing: null,
  },
];

const STATE_MACHINE_START_ACTIONS: FlatStateMachineStartAction[] = [
  {
    action: "start",
    label: "Start workflow run",
    iconClassName: "gg-play-list-add",
    status: "disabled",
  },
  {
    action: "stop",
    label: "Stop workflow run",
    iconClassName: "gg-shape-square",
    status: "available",
  },
  {
    action: "reset",
    label: "Reset workflow run",
    iconClassName: "gg-repeat",
    status: "available",
  },
];

const STATE_MACHINE_START_ACTIVITY: FlatStateMachineStartActivity[] = [
  {
    label: "Signal merge_decision reported",
    tone: "success",
  },
  {
    label: "Dispatched 2 start actions",
    tone: "default",
  },
  {
    label: "Workflow started",
    tone: "default",
  },
];

const STATE_MACHINE_GATE_STATUS_ROWS: FlatStateMachineGateStatusRow[] = [
  {
    label: "Machine",
    value: "Running",
    state: "running",
  },
  {
    label: "Gate",
    value: "Satisfied",
    state: "satisfied",
  },
  {
    label: "Inputs",
    value: "3 / 3",
    state: "complete",
  },
];

const STATE_MACHINE_GATE_ACTIVITY: FlatStateMachineGateActivity[] = [
  {
    id: "gate-satisfied",
    label: "Gate satisfied",
    tone: "success",
  },
  {
    id: "gate-input-edge-c",
    label: "Input received",
    tone: "default",
  },
];

const LIST_ROOT_CHILDREN: FlatListRootChild[] = [
  {
    id: "rank-items",
    orderLabel: "01",
    sectionType: SectionTypeEnum.Callable,
    title: "rank_items",
  },
  {
    id: "review-notes",
    orderLabel: "02",
    sectionType: SectionTypeEnum.TextBlock,
    title: "review_notes",
  },
  {
    id: "draft-prompt",
    orderLabel: "03",
    sectionType: SectionTypeEnum.Prompt,
    title: "draft_prompt",
  },
];

const GROUP_CHILDREN: FlatGroupChild[] = [
  {
    id: "source-config",
    orderLabel: "01",
    sectionType: SectionTypeEnum.Dict,
    title: "source_config",
  },
  {
    id: "normalize-inputs",
    orderLabel: "02",
    sectionType: SectionTypeEnum.Callable,
    title: "normalize_inputs",
  },
  {
    id: "preview-notes",
    orderLabel: "03",
    sectionType: SectionTypeEnum.TextBlock,
    title: "preview_notes",
  },
];

const IMAGE_FIXTURE = {
  path: "artifacts/source-image.png",
  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f8fafc'/%3E%3Crect x='36' y='36' width='568' height='288' fill='%23dbeafe'/%3E%3Cpath d='M36 324 196 176 292 252 384 128 604 324Z' fill='%231e40af'/%3E%3Cpath d='M36 324 236 214 328 272 444 188 604 324Z' fill='%2393c5fd'/%3E%3Ccircle cx='488' cy='96' r='36' fill='%23ffffff'/%3E%3C/svg%3E",
};

const CHART_FIXTURE = {
  path: "artifacts/metrics.csv",
  chartType: ChartTypeEnum.line,
  xAxisColumn: "time",
  columns: ["time", "temperature", "humidity", "pressure"],
  logScales: {
    xAxisLog: false,
    y1AxisLog: true,
    y2AxisLog: false,
  },
  datasets: [
    {
      id: "temperature",
      axis: "y1",
      label: "temperature",
      status: "visible",
      tone: "primary",
    },
    {
      id: "humidity",
      axis: "y2",
      label: "humidity",
      status: "visible",
      tone: "secondary",
    },
    {
      id: "pressure",
      axis: "y1",
      label: "pressure",
      status: "hidden",
      tone: "muted",
    },
  ],
  points: [
    { id: "temperature-0", tone: "primary", x: "12%", y: "68%" },
    { id: "temperature-1", tone: "primary", x: "33%", y: "47%" },
    { id: "temperature-2", tone: "primary", x: "55%", y: "53%" },
    { id: "temperature-3", tone: "primary", x: "79%", y: "29%" },
    { id: "humidity-0", tone: "secondary", x: "12%", y: "38%" },
    { id: "humidity-1", tone: "secondary", x: "33%", y: "57%" },
    { id: "humidity-2", tone: "secondary", x: "55%", y: "43%" },
    { id: "humidity-3", tone: "secondary", x: "79%", y: "61%" },
  ],
  segments: [
    {
      id: "temperature-0-1",
      tone: "primary",
      x: "12%",
      y: "68%",
      width: "25%",
      angle: "-29deg",
    },
    {
      id: "temperature-1-2",
      tone: "primary",
      x: "33%",
      y: "47%",
      width: "23%",
      angle: "9deg",
    },
    {
      id: "temperature-2-3",
      tone: "primary",
      x: "55%",
      y: "53%",
      width: "29%",
      angle: "-32deg",
    },
    {
      id: "humidity-0-1",
      tone: "secondary",
      x: "12%",
      y: "38%",
      width: "24%",
      angle: "28deg",
    },
    {
      id: "humidity-1-2",
      tone: "secondary",
      x: "33%",
      y: "57%",
      width: "24%",
      angle: "-19deg",
    },
    {
      id: "humidity-2-3",
      tone: "secondary",
      x: "55%",
      y: "43%",
      width: "26%",
      angle: "25deg",
    },
  ],
} satisfies {
  path: string;
  chartType: typeof ChartTypeEnum.line;
  xAxisColumn: string;
  columns: string[];
  logScales: {
    xAxisLog: boolean;
    y1AxisLog: boolean;
    y2AxisLog: boolean;
  };
  datasets: FlatChartDataset[];
  points: FlatChartPoint[];
  segments: FlatChartSegment[];
};

const DRAW_MODE_CONTROLS: FlatDrawModeControl[] = [
  {
    mode: DrawAreaModeEnum.draw,
    label: "Draw",
    iconClassName: "gg-pen",
  },
  {
    mode: DrawAreaModeEnum.erase,
    label: "Erase",
    iconClassName: "gg-erase",
  },
  {
    mode: DrawAreaModeEnum.edit,
    label: "Edit",
    iconClassName: "gg-maximize",
  },
];

const DRAW_FIXTURE = {
  brushColor: "#ff0000",
  brushOpacity: 0.8,
  brushShape: DrawAreaBrushShapeEnum.round,
  brushSize: 16,
  eraserBrushSize: 24,
  canvasMode: DrawAreaModeEnum.draw,
  colorChoices: ["#ff0000", "#1e40af", "#22c55e"],
  layers: [
    {
      id: "ink-layer",
      orderLabel: "03",
      name: "Layer 3 Ink",
      visible: true,
      active: true,
      layerOpacity: 0.65,
      elements: [
        {
          id: "stroke-main",
          type: ArtifactTypeEnum.BrushStroke,
          label: "BrushStroke",
          dataPath: "artifacts/stroke-main.json",
          transformId: "artifacts/stroke-main-transform.json",
          x: "16%",
          y: "58%",
          width: "48%",
          height: "0.375rem",
          angle: "-12deg",
        },
        {
          id: "stroke-note",
          type: ArtifactTypeEnum.BrushStroke,
          label: "BrushStroke",
          dataPath: "artifacts/stroke-note.json",
          transformId: "artifacts/stroke-note-transform.json",
          x: "46%",
          y: "34%",
          width: "32%",
          height: "0.3125rem",
          angle: "20deg",
        },
      ],
    },
    {
      id: "image-layer",
      orderLabel: "02",
      name: "Layer 2 Image",
      visible: true,
      active: false,
      layerOpacity: 1,
      elements: [
        {
          id: "reference-image",
          type: ArtifactTypeEnum.Image,
          label: "Image",
          dataPath: "artifacts/reference-image.png",
          transformId: "artifacts/reference-image-transform.json",
          x: "25%",
          y: "18%",
          width: "42%",
          height: "42%",
        },
      ],
    },
    {
      id: "hidden-layer",
      orderLabel: "01",
      name: "Layer 1 Hidden",
      visible: false,
      active: false,
      layerOpacity: 0.35,
      elements: [],
    },
  ],
} satisfies {
  brushColor: string;
  brushOpacity: number;
  brushShape: (typeof DrawAreaBrushShapeEnum)[keyof typeof DrawAreaBrushShapeEnum];
  brushSize: number;
  eraserBrushSize: number;
  canvasMode: (typeof DrawAreaModeEnum)[keyof typeof DrawAreaModeEnum];
  colorChoices: string[];
  layers: FlatDrawLayer[];
};

const TEXT_BLOCK_FIXTURE = {
  title: "Review Notes",
  format: TextBlockFormatEnum.Markdown,
  textDisplayMode: TextBlockDisplayModeEnum.Render,
  masterFontSizePx: 18,
  headingAsSectionName: false,
  metaControlStyle: false,
  body: {
    heading: "Review Notes",
    paragraph:
      "Summarize the source material and keep owner follow-ups visible.",
    checklist: ["Capture open questions", "Link the generated draft"],
    inlineCode: "status: ready",
    code: 'owner = "platform"\nstatus = "review"',
  },
} satisfies {
  title: string;
  format: (typeof TextBlockFormatEnum)[keyof typeof TextBlockFormatEnum];
  textDisplayMode: (typeof TextBlockDisplayModeEnum)[keyof typeof TextBlockDisplayModeEnum];
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  body: {
    heading: string;
    paragraph: string;
    checklist: string[];
    inlineCode: string;
    code: string;
  };
};

const TEXT_BLOCK_SETTINGS: FlatTextBlockSetting[] = [
  {
    id: "format",
    label: "Markdown",
    value: TEXT_BLOCK_FIXTURE.format,
    active: TEXT_BLOCK_FIXTURE.format === TextBlockFormatEnum.Markdown,
  },
  {
    id: "display",
    label: "Render",
    value: TEXT_BLOCK_FIXTURE.textDisplayMode,
    active:
      TEXT_BLOCK_FIXTURE.textDisplayMode === TextBlockDisplayModeEnum.Render,
  },
  {
    id: "heading-name",
    label: "Heading name",
    value: String(TEXT_BLOCK_FIXTURE.headingAsSectionName),
    active: TEXT_BLOCK_FIXTURE.headingAsSectionName,
  },
  {
    id: "transparent",
    label: "Transparent",
    value: String(TEXT_BLOCK_FIXTURE.metaControlStyle),
    active: TEXT_BLOCK_FIXTURE.metaControlStyle,
  },
];

const PROMPT_FIXTURE = {
  title: "Draft Prompt",
  promptTemplateId: "template-release-brief",
  linkedTemplateName: "Release Brief",
  linkedTemplateDescription: "Summarizes release notes for reviewers.",
  format: FormatEnum.Jinja,
  template:
    "Write a {{ tone }} release brief for {{ product }}.\n\nInclude risks, owner follow-ups, and launch criteria from {{ owner }}.",
  inputs: [
    {
      name: "product",
      value: "Setta",
    },
    {
      name: "tone",
      value: "concise",
    },
  ],
  missingVariables: ["owner"],
  renderError: "Missing variables: owner",
  renderedText:
    "Write a concise release brief for Setta.\n\nInclude risks, owner follow-ups, and launch criteria.",
} satisfies {
  title: string;
  promptTemplateId: string;
  linkedTemplateName: string;
  linkedTemplateDescription: string;
  format: (typeof FormatEnum)[keyof typeof FormatEnum];
  template: string;
  inputs: FlatPromptInput[];
  missingVariables: string[];
  renderError: string;
  renderedText: string;
};

const META_CONTROL_FIXTURE = {
  title: "Sampling Controls",
  paramId: "param-temperature",
  paramVariantId: "param-temperature-v1",
  controlName: "temperature",
  codeObjType: CodeObjTypeEnum.SliderParam,
  value: "0.72",
  min: "0",
  max: "1",
  step: "0.01",
  showSectionTitle: true,
  selectedParams: ["param-temperature"],
  pinnedParams: ["param-temperature"],
} satisfies {
  title: string;
  paramId: string;
  paramVariantId: string;
  controlName: string;
  codeObjType: typeof CodeObjTypeEnum.SliderParam;
  value: string;
  min: string;
  max: string;
  step: string;
  showSectionTitle: boolean;
  selectedParams: string[];
  pinnedParams: string[];
};

const META_CONTROL_WIDGET_PREVIEWS: FlatMetaControlWidgetPreview[] = [
  {
    id: "run-action",
    codeObjType: CodeObjTypeEnum.ButtonParam,
    label: "run_action",
    value: "Run",
    detail: ButtonActionModeEnum.SETTA_API,
  },
  {
    id: "enabled",
    codeObjType: CodeObjTypeEnum.SwitchParam,
    label: "enabled",
    value: "true",
    detail: "Realtime value",
  },
  {
    id: "accent",
    codeObjType: CodeObjTypeEnum.ColorPickerParam,
    label: "accent",
    value: "#2563eb",
    detail: "Literal color",
  },
  {
    id: "mode",
    codeObjType: CodeObjTypeEnum.DropdownParam,
    label: "mode",
    value: "balanced",
    detail: "Choice value",
  },
  {
    id: "run-date",
    codeObjType: CodeObjTypeEnum.DateParam,
    label: "run_date",
    value: "2026-04-28",
    detail: DateControlModeEnum.calendar,
  },
  {
    id: "start-time",
    codeObjType: CodeObjTypeEnum.TimeParam,
    label: "start_time",
    value: "13:45",
    detail: TimeDisplayFormatEnum.twelve_hour,
  },
  {
    id: "upload",
    codeObjType: CodeObjTypeEnum.DropzoneParam,
    label: "upload",
    value: DropzoneModeEnum.STATELESS,
    detail: "Action event",
  },
];

const SOCIAL_FIXTURE = {
  title: "Launch Clip",
  url: "https://www.youtube.com/watch?v=setta-launch",
  provider: "youtube",
  videoId: "setta-launch",
  tweetId: "1784926812345678901",
  editable: true,
  playerState: "thumbnail",
  sizeMode: "auto",
  caption: "YouTube thumbnail waits for click before player load.",
  providerOptions: [
    {
      id: "youtube",
      label: "YouTube",
      status: "active",
      provider: "youtube",
    },
    {
      id: "twitter",
      label: "Twitter/X",
      status: "supported",
      provider: "twitter",
    },
  ],
} satisfies {
  title: string;
  url: string;
  provider: "youtube";
  videoId: string;
  tweetId: string;
  editable: boolean;
  playerState: "thumbnail" | "player";
  sizeMode: "auto";
  caption: string;
  providerOptions: FlatSocialProviderOption[];
};

const CODE_FIXTURE = {
  title: "Manual Runner",
  language: CodeLanguageEnum.python,
  filePath: "code/sections/manual_runner.py",
  accessMode: CodeFileAccessModeEnum.read_write,
  autoBinding: true,
  canRun: true,
  entryCodeBlock: true,
  attachedTerminalId: "terminal-manual-runner",
  terminalVisible: true,
  diagnosticsMuted: false,
  diagnosticsCount: 2,
  suppressedCodes: ["reportUnusedCall"],
  previewSource: "persisted",
  lines: [
    { number: 1, text: "def run(context):" },
    { number: 2, text: '    profile = context["profile"]' },
    {
      number: 3,
      text: "    score = rank_items(profile.items)",
      diagnostic: {
        severity: "warning",
        code: "reportMissingTypeStubs",
        message: "Type information is unavailable for rank_items.",
      },
    },
    {
      number: 4,
      text: '    return {"top_item": score[0]}',
      diagnostic: {
        severity: "error",
        code: "reportPossiblyUnboundVariable",
        message: "score may be unbound.",
      },
    },
  ],
} satisfies {
  title: string;
  language: typeof CodeLanguageEnum.python;
  filePath: string;
  accessMode: typeof CodeFileAccessModeEnum.read_write;
  autoBinding: boolean;
  canRun: boolean;
  entryCodeBlock: boolean;
  attachedTerminalId: string;
  terminalVisible: boolean;
  diagnosticsMuted: boolean;
  diagnosticsCount: number;
  suppressedCodes: string[];
  previewSource: "persisted" | "preview";
  lines: FlatCodeEditorLine[];
};

const CODE_HEADER_ACTIONS: FlatCodeHeaderAction[] = [
  {
    id: "run",
    label: "Run this code block",
    iconClassName: "gg-play-button-o",
    state: "ready",
  },
  {
    id: "entry",
    label: "Toggle Entry Code Block",
    iconClassName: "flat-section-prototype__entry-glyph",
    state: "selected",
  },
  {
    id: "terminal",
    label: "Hide terminal",
    iconClassName: "flat-section-prototype__terminal-glyph",
    state: "visible",
  },
  {
    id: "diagnostics",
    label: "Problems 2",
    iconClassName: "flat-section-prototype__diagnostics-glyph",
    state: "issues",
  },
];

const GEN_PYTHON_CODE_FIXTURE = {
  title: "Generated Python Code",
  language: CodeLanguageEnum.python,
  filePath: "code/sections/alpha/setta_gen.py",
  accessMode: CodeFileAccessModeEnum.write_only,
  autoBinding: false,
  codegenEnabled: true,
  canRun: true,
  entryCodeBlock: true,
  attachedTerminalId: "terminal-gen-python",
  terminalVisible: true,
  diagnosticsCount: 1,
  diagnosticsSource: "unmappedGenCode",
  separatorNewlines: 2,
  prefix: "import math",
  suffix: "state = SettaState()",
  lines: [
    { number: 1, region: "prefix", text: "import math" },
    { number: 4, region: "generated", text: "class SettaState:" },
    { number: 5, region: "generated", text: "    def __init__(state):" },
    {
      number: 6,
      region: "generated",
      text: '        state.workspace_id = "alpha"',
    },
    {
      number: 7,
      region: "generated",
      text: "        state.retry_limit = 3",
      diagnostic: {
        severity: "warning",
        code: "reportGeneratedValue",
        message: "Generated value needs runtime data.",
      },
    },
    { number: 10, region: "suffix", text: "state = SettaState()" },
  ],
} satisfies {
  title: string;
  language: typeof CodeLanguageEnum.python;
  filePath: string;
  accessMode: typeof CodeFileAccessModeEnum.write_only;
  autoBinding: boolean;
  codegenEnabled: boolean;
  canRun: boolean;
  entryCodeBlock: boolean;
  attachedTerminalId: string;
  terminalVisible: boolean;
  diagnosticsCount: number;
  diagnosticsSource: "unmappedGenCode";
  separatorNewlines: number;
  prefix: string;
  suffix: string;
  lines: FlatGenPythonCodeEditorLine[];
};

const GEN_PYTHON_CODE_HEADER_ACTIONS: FlatCodeHeaderAction[] = [
  {
    id: "run",
    label: "Run this code block",
    iconClassName: "gg-play-button-o",
    state: "ready",
  },
  {
    id: "entry",
    label: "Toggle Entry Code Block",
    iconClassName: "flat-section-prototype__entry-glyph",
    state: "selected",
  },
  {
    id: "terminal",
    label: "Hide terminal",
    iconClassName: "flat-section-prototype__terminal-glyph",
    state: "visible",
  },
  {
    id: "diagnostics",
    label: "Issues 1",
    iconClassName: "flat-section-prototype__diagnostics-glyph",
    state: "issues",
  },
];

const GEN_PYTHON_METADATA_FIXTURE = {
  title: "Generated Python Metadata",
  language: CodeLanguageEnum.python,
  filePath: "code/sections/alpha/setta_gen_meta.py",
  accessMode: CodeFileAccessModeEnum.write_only,
  autoBinding: false,
  metadataEnabled: true,
  readonly: true,
  sectionCount: 3,
  projectName: "Alpha",
  activeViewModeId: "view-mode-1",
  lines: [
    {
      number: 1,
      kind: "definition",
      text: "from dataclasses import dataclass",
    },
    { number: 4, kind: "definition", text: "class ProjectMetadata:" },
    { number: 15, kind: "definition", text: "class SectionMetadata:" },
    { number: 27, kind: "definition", text: "class SettaGenMetadata:" },
    { number: 32, kind: "project", text: "project = ProjectMetadata(" },
    { number: 34, kind: "project", text: "    name='Alpha'," },
    {
      number: 35,
      kind: "project",
      text: "    activeViewModeId='view-mode-1',",
    },
    { number: 41, kind: "sections", text: "sections = {" },
    { number: 42, kind: "sections", text: "    'Runner': SectionMetadata(" },
    {
      number: 46,
      kind: "sections",
      text: "        fullPathName='Runner',",
    },
    { number: 72, kind: "sections_by_id", text: "sections_by_id = {" },
    {
      number: 73,
      kind: "sections_by_id",
      text: "    'callable': SectionMetadata(",
    },
    {
      number: 105,
      kind: "meta",
      text: "meta = SettaGenMetadata(project=project, sections=sections, sections_by_id=sections_by_id)",
    },
  ],
} satisfies {
  title: string;
  language: typeof CodeLanguageEnum.python;
  filePath: string;
  accessMode: typeof CodeFileAccessModeEnum.write_only;
  autoBinding: boolean;
  metadataEnabled: boolean;
  readonly: boolean;
  sectionCount: number;
  projectName: string;
  activeViewModeId: string;
  lines: FlatGenPythonMetadataLine[];
};

const TERMINAL_FIXTURE = {
  title: "Managed Console",
  sectionId: "terminal-managed-console",
  context: "top-level",
  sessionMode: "managed_console",
  status: "ready",
  access: "read-write",
  cols: 96,
  rows: 24,
  scrollbackLines: 128,
  prompt: "setta@workspace:~$",
  activeInput: "tail -f logs/runtime.log",
  lines: [
    {
      id: "ready",
      kind: "system",
      text: "terminal websocket ready",
    },
    {
      id: "pwd-command",
      kind: "command",
      prompt: "setta@workspace:~$",
      text: "pwd",
    },
    {
      id: "pwd-output",
      kind: "output",
      text: "/home/ubuntu/dev/setta",
    },
    {
      id: "resize",
      kind: "system",
      text: "fit 96 cols x 24 rows",
    },
    {
      id: "test-command",
      kind: "command",
      prompt: "setta@workspace:~$",
      text: "pnpm -C frontend exec vitest run src/components/Section/Layouts/TerminalArea.test.tsx",
    },
    {
      id: "test-output",
      kind: "output",
      text: "PASS TerminalArea.test.tsx",
    },
  ],
} satisfies {
  title: string;
  sectionId: string;
  context: "top-level" | "attached";
  sessionMode: "managed_console" | "interactive";
  status: "ready" | "connecting";
  access: "read-write" | "read-only";
  cols: number;
  rows: number;
  scrollbackLines: number;
  prompt: string;
  activeInput: string;
  lines: FlatTerminalLine[];
};

const IFRAME_FIXTURE = {
  title: "Example Embed",
  code: "<iframe src='https://example.com/embed' title='demo'></iframe>",
  src: "https://example.com/embed",
  iframeTitle: "demo",
  validationState: "valid",
  resizeMode: "container-fit",
  defaultSize: "250x150",
  srcDoc: `
    <!doctype html>
    <html>
      <head>
        <style>
          html,
          body {
            box-sizing: border-box;
            margin: 0;
            width: 100%;
            height: 100%;
            background: #f8fafc;
            color: #0f172a;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          }

          body {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
          }

          main {
            width: 100%;
            max-width: 360px;
          }

          p,
          h1 {
            margin: 0;
          }

          h1 {
            font-size: 14px;
            line-height: 20px;
          }

          p {
            margin-top: 8px;
            color: #475569;
            font-size: 11px;
            line-height: 16px;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>demo</h1>
          <p>Embedded iframe content sized by the section body.</p>
        </main>
      </body>
    </html>
  `,
} satisfies {
  title: string;
  code: string;
  src: string;
  iframeTitle: string;
  validationState: "valid" | "empty" | "invalid";
  resizeMode: "container-fit";
  defaultSize: string;
  srcDoc: string;
};

const CHAT_FIXTURE = {
  title: "Review Chat",
  managed: true,
  chatId: "chat-release-review",
  engineConfigId: "engine-setta-llm",
  engineType: EngineTypeEnum.setta_llm,
  agentProfileId: "agent-reviewer",
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
  thinking: true,
  dictationMode: ChatDictationModeEnum.auto,
  waitingForResponse: true,
  contextWindowTokens: "64k",
  contextUsedTokens: "18.4k",
  contextUsageIsEstimated: false,
  activeBranchId: "branch-main",
  branchCount: 3,
  scopeTargets: 1,
  scopeSources: 2,
  inputText: "Add launch blockers before sending.",
  slashCommands: ["/new", "/resume", "/help"],
  messages: [
    {
      id: "msg-user-review",
      role: ChatRoleEnum.user,
      label: "User",
      text: "Review the current project sections and call out launch risks.",
      meta: "09:42",
      attachmentName: "release-notes.md",
      branchLabel: "1/3",
    },
    {
      id: "msg-assistant-risks",
      role: ChatRoleEnum.assistant,
      label: "Assistant",
      text: "I found two risks: missing regression coverage and an unresolved browser verification gap.",
      meta: "09:43",
    },
    {
      id: "msg-tool-section-state",
      role: ChatRoleEnum.tool,
      label: "Tool",
      text: "section_state returned 4 matching sections.",
      meta: "tool result",
      toolCallId: "call-scope-1",
      toolName: "section_state",
    },
    {
      id: "msg-assistant-streaming",
      role: ChatRoleEnum.assistant,
      label: "Assistant",
      text: "Checking section scope before drafting the final response.",
      meta: "streaming",
      streaming: true,
      toolCallId: "call-scope-2",
      toolName: "section_state",
    },
  ],
  toolCallArguments: [
    {
      id: "call-scope-2",
      toolName: "section_state",
      value: '{"sectionId":"global-variables"}',
    },
  ],
} satisfies {
  title: string;
  managed: boolean;
  chatId: string;
  engineConfigId: string;
  engineType: typeof EngineTypeEnum.setta_llm;
  agentProfileId: string;
  permissionMode: typeof ChatPermissionModeEnum.minimal;
  searchEnabled: boolean;
  thinking: boolean;
  dictationMode: typeof ChatDictationModeEnum.auto;
  waitingForResponse: boolean;
  contextWindowTokens: string;
  contextUsedTokens: string;
  contextUsageIsEstimated: boolean;
  activeBranchId: string;
  branchCount: number;
  scopeTargets: number;
  scopeSources: number;
  inputText: string;
  slashCommands: string[];
  messages: FlatChatMessage[];
  toolCallArguments: FlatChatToolArgument[];
};

const BROWSER_FIXTURE = {
  title: "Workspace Browser",
  rootPath: "/workspace",
  folder: "/workspace/assets",
  pathSeparator: "/",
  ignorePatterns: ["node_modules", ".git"],
  hideColumn: false,
  viewMode: BrowserAreaViewModeEnum.list,
  searchScope: BrowserSearchScopeEnum.recursive,
  filterText: "release",
  columnWidth: "72%",
  typesColumnWidth: "220px",
  sortKey: "name",
  sortDirection: "asc",
  allowOutsideWorkspaceRoot: true,
  missingFolderBehavior: "empty",
  loadedVia: "getFolderContents",
  breadcrumbs: [
    { label: "workspace", path: "/workspace" },
    { label: "assets", path: "/workspace/assets" },
  ],
  typeFilters: [
    { id: "image", label: "Image", active: true, count: 12 },
    { id: "video", label: "Video", active: false, count: 3 },
    { id: "audio", label: "Audio", active: false, count: 1 },
    { id: "text", label: "Text", active: true, count: 8 },
    { id: "data", label: "Other", active: true, count: 5 },
  ],
  savedSearches: [
    {
      id: "search-release-media",
      name: "Release media",
      query: "release",
      searchScope: BrowserSearchScopeEnum.recursive,
      active: true,
      color: "#2563eb",
      quickInfo: "Query: release / Scope: recursive",
    },
    {
      id: "search-local-docs",
      name: "Local docs",
      query: "*.md",
      searchScope: BrowserSearchScopeEnum.local,
      active: false,
      color: "#16a34a",
      quickInfo: "Query: *.md / Scope: local",
    },
  ],
  items: [
    {
      id: "screenshots",
      name: "screenshots",
      fullPath: "/workspace/assets/screenshots",
      type: "folder",
      previewKind: "folder",
      depth: 0,
      modifiedLabel: "Today 09:31",
      draggable: true,
      droppable: true,
      expanded: true,
      status: "4 items",
    },
    {
      id: "release-cover",
      name: "release-cover.png",
      fullPath: "/workspace/assets/screenshots/release-cover.png",
      type: "file",
      previewKind: "image",
      depth: 1,
      modifiedLabel: "Today 09:42",
      draggable: true,
      droppable: false,
      selected: true,
      status: "image",
    },
    {
      id: "release-notes",
      name: "release-notes.md",
      fullPath: "/workspace/assets/release-notes.md",
      type: "file",
      previewKind: "text",
      depth: 0,
      modifiedLabel: "Yesterday 18:10",
      draggable: true,
      droppable: false,
      status: "text",
    },
    {
      id: "metrics",
      name: "metrics.csv",
      fullPath: "/workspace/assets/metrics.csv",
      type: "file",
      previewKind: "data",
      depth: 0,
      modifiedLabel: "Apr 27 16:04",
      draggable: true,
      droppable: false,
      status: "data",
    },
    {
      id: "raw",
      name: "raw",
      fullPath: "/workspace/assets/raw",
      type: "folder",
      previewKind: "folder",
      depth: 0,
      modifiedLabel: "Apr 26 11:22",
      draggable: true,
      droppable: true,
      expanded: false,
      status: "folder",
    },
  ],
} satisfies {
  title: string;
  rootPath: string;
  folder: string;
  pathSeparator: string;
  ignorePatterns: string[];
  hideColumn: boolean;
  viewMode: (typeof BrowserAreaViewModeEnum)[keyof typeof BrowserAreaViewModeEnum];
  searchScope: (typeof BrowserSearchScopeEnum)[keyof typeof BrowserSearchScopeEnum];
  filterText: string;
  columnWidth: string;
  typesColumnWidth: string;
  sortKey: "modified" | "name";
  sortDirection: "asc" | "desc";
  allowOutsideWorkspaceRoot: boolean;
  missingFolderBehavior: "empty";
  loadedVia: "getFolderContents";
  breadcrumbs: Array<{ label: string; path: string }>;
  typeFilters: FlatBrowserTypeFilter[];
  savedSearches: FlatBrowserSavedSearch[];
  items: FlatBrowserItem[];
};

const PLUGIN_FIXTURE = {
  title: "React Fixture Card",
  sectionId: "plugin-react-fixture",
  pluginId: "setta-fixture-frontend-react",
  kind: "fixture-react-card",
  description: "Section kind rendered with React component tree.",
  schemaVersion: 1,
  serverMode: "ide",
  readOnly: false,
  effectiveCapabilities: ["registerSectionKinds", "updateSection"],
  lifecycle: ["mount", "update", "unmount"],
  data: {
    title: "React Fixture",
    details: "React renderer is active.",
    tags: ["react", "fixture"],
    pinned: false,
    pulses: 2,
  },
  localClicks: 1,
  stats: [
    {
      id: "words",
      label: "words",
      value: 5,
      source: "computed",
    },
    {
      id: "local-clicks",
      label: "local clicks",
      value: 1,
      source: "local",
    },
    {
      id: "saved-pulses",
      label: "saved pulses",
      value: 2,
      source: "data",
    },
    {
      id: "state",
      label: "state",
      value: "Unpinned",
      source: "data",
    },
  ],
} satisfies {
  title: string;
  sectionId: string;
  pluginId: string;
  kind: string;
  description: string;
  schemaVersion: number;
  serverMode: "ide";
  readOnly: boolean;
  effectiveCapabilities: string[];
  lifecycle: Array<"mount" | "unmount" | "update">;
  data: {
    title: string;
    details: string;
    tags: string[];
    pinned: boolean;
    pulses: number;
  };
  localClicks: number;
  stats: FlatPluginRendererStat[];
};

const TASK_BOARD_FIXTURE = {
  title: "Release Board",
  viewMode: TaskBoardViewModeEnum.kanban,
  editable: true,
  newTaskTitle: "Add task title",
  columns: [
    {
      id: "todo",
      name: "Todo",
      color: "#3b82f6",
      sortIndex: 0,
    },
    {
      id: "doing",
      name: "Doing",
      color: "#f59e0b",
      sortIndex: 1,
    },
    {
      id: "done",
      name: "Done",
      color: "#22c55e",
      sortIndex: 2,
    },
  ],
  tasks: [
    {
      id: "draft-owner-brief",
      title: "Draft owner brief",
      description: "Capture launch criteria before review.",
      columnId: "todo",
      completed: false,
      dueDateIso: "2026-04-30",
      dueSummary: "Due: 2026-04-30",
      recurrence: TaskBoardTaskRecurrenceEnum.none,
      recurrenceSummary: null,
      sortIndex: 0,
    },
    {
      id: "verify-visual-pass",
      title: "Verify visual pass",
      description: "",
      columnId: "doing",
      completed: false,
      dueDateIso: "2026-04-28T16:00",
      dueSummary: "Due: 2026-04-28 16:00",
      recurrence: TaskBoardTaskRecurrenceEnum.specified_days,
      recurrenceSummary: "Repeat: Mon, Wed, Fri",
      sortIndex: 1,
    },
    {
      id: "package-screenshots",
      title: "Package screenshots",
      description: "",
      columnId: "doing",
      completed: false,
      dueDateIso: "",
      dueSummary: null,
      recurrence: TaskBoardTaskRecurrenceEnum.daily,
      recurrenceSummary: "Repeat: Daily",
      sortIndex: 2,
    },
    {
      id: "ship-section-prototype",
      title: "Ship section prototype",
      description: "Progress entry and tests recorded.",
      columnId: "done",
      completed: true,
      dueDateIso: "2026-04-28",
      dueSummary: "Due: 2026-04-28",
      recurrence: TaskBoardTaskRecurrenceEnum.none,
      recurrenceSummary: null,
      sortIndex: 3,
    },
  ],
} satisfies {
  title: string;
  viewMode: typeof TaskBoardViewModeEnum.kanban;
  editable: boolean;
  newTaskTitle: string;
  columns: FlatTaskBoardColumn[];
  tasks: FlatTaskBoardTask[];
};

const SPREADSHEET_FIXTURE = {
  title: "Forecast Sheet",
  filePath: "/workspace/reports/forecast.xlsx",
  fileName: "forecast.xlsx",
  activeSheet: "Q2 Forecast",
  readOnly: false,
  showRowNumbers: true,
  density: SpreadsheetGridDensityEnum.compact,
  autoReloadOnExternalChange: true,
  filterQuery: "region:west",
  sortColumnId: "B",
  sortDirection: "desc",
  isDirty: true,
  hasExternalDiskChange: true,
  statusText: "Save to overwrite or reload.",
  errorText: null,
  selectedRange: "B2:C3",
  displayedRowCount: 3,
  rowCount: 4,
  columnCount: 4,
  supportedFormats: ["CSV", "TSV", "XLS", "XLSX"],
  columns: [
    { id: "A", label: "A", sortState: "none" },
    { id: "B", label: "B", sortState: "desc" },
    { id: "C", label: "C", sortState: "none" },
    { id: "D", label: "D", sortState: "none" },
  ],
  rows: [
    {
      id: "row-1",
      rowNumber: 1,
      cells: ["Region", "Owner", "Revenue", "Confidence"],
    },
    {
      id: "row-2",
      rowNumber: 2,
      cells: ["West", "Ari", "$42k", "High"],
    },
    {
      id: "row-3",
      rowNumber: 3,
      cells: ["West", "Mina", "$37k", "Medium"],
    },
    {
      id: "row-4",
      rowNumber: 4,
      cells: ["North", "Jules", "$31k", "Low"],
    },
  ],
} satisfies {
  title: string;
  filePath: string;
  fileName: string;
  activeSheet: string;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: typeof SpreadsheetGridDensityEnum.compact;
  autoReloadOnExternalChange: boolean;
  filterQuery: string;
  sortColumnId: string;
  sortDirection: "asc" | "desc";
  isDirty: boolean;
  hasExternalDiskChange: boolean;
  statusText: string;
  errorText: string | null;
  selectedRange: string;
  displayedRowCount: number;
  rowCount: number;
  columnCount: number;
  supportedFormats: string[];
  columns: FlatSpreadsheetColumn[];
  rows: FlatSpreadsheetRow[];
};

const FLAT_PROTOTYPE_ACTIONS = [
  {
    label: "Remove",
    iconClassName: "gg-math-minus flat-section-prototype__icon-minus",
  },
  {
    label: "Add",
    iconClassName: "gg-math-plus",
  },
  {
    label: "Pin",
    iconClassName: "gg-pin-alt",
  },
  {
    label: "Resize columns",
    iconClassName: "gg-push-left",
    extraClassName: "flat-section-prototype__action-button--resize",
    dataAttr: "column-resize",
  },
  {
    label: "Edge",
    iconClassName: "gg-link",
  },
];

const FLAT_PROTOTYPE_SECTION_CONTROLS = [
  {
    id: "lock",
    label: "Lock section",
    buttonClassName: "flat-section-prototype__top-button--lock",
    iconClassName: "gg-lock",
  },
  {
    id: "minimize",
    label: "Minimize section",
    buttonClassName: "flat-section-prototype__top-button--standard",
    iconClassName: "gg-math-minus flat-section-prototype__icon-minus",
  },
  {
    id: "close",
    label: "Close section",
    buttonClassName: "flat-section-prototype__top-button--standard",
    iconClassName: "gg-close",
  },
];

const SECTION_KIND_ICON_CLASS_NAMES: Record<FlatSectionKind, string> = {
  browser: "gg-folder",
  callable: "gg-code-slash",
  chart: "flat-section-prototype__chart-glyph",
  chat: "flat-section-prototype__chat-glyph",
  code: "gg-code-slash",
  dict: "gg-list",
  draw: "gg-pen",
  "gen-python-code": "gg-code-slash",
  "gen-python-metadata": "flat-section-prototype__metadata-glyph",
  "global-variables": "flat-section-prototype__global-glyph",
  group: "gg-folder",
  image: "gg-image",
  iframe: "gg-code-slash",
  "list-root": "gg-menu",
  "meta-control": "flat-section-prototype__meta-control-glyph",
  plugin: "flat-section-prototype__plugin-glyph",
  prompt: "flat-section-prototype__prompt-glyph",
  social: "flat-section-prototype__social-glyph",
  spreadsheet: "flat-section-prototype__spreadsheet-glyph",
  "task-board": "flat-section-prototype__task-board-glyph",
  terminal: "flat-section-prototype__terminal-glyph",
  "text-block": "flat-section-prototype__text-block-glyph",
  "state-machine-start": "gg-play-list-add",
  "state-machine-gate": "gg-git-branch",
  "state-machine-end": "gg-check",
};

function FlatSectionShell({
  kind,
  title,
  controlLabel,
  controlsInitiallyOpen = false,
  hideMinimizeControl = false,
  theme = "dark",
  lead,
  headerActions,
  children,
}: FlatSectionShellProps) {
  const controlBarId = useId();
  const [isControlBarOpen, setIsControlBarOpen] = useState(
    controlsInitiallyOpen,
  );
  const toggleControlBar = () => {
    setIsControlBarOpen((wasOpen) => !wasOpen);
  };

  return (
    <section
      className={`flat-section-prototype flat-section-prototype--${theme}`}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
      data-flat-preview-theme={theme}
    >
      <FlatPrototypeHeader
        kind={kind}
        title={title}
        controlLabel={controlLabel}
        controlBarId={controlBarId}
        headerActions={headerActions}
        hideMinimizeControl={hideMinimizeControl}
        isControlBarOpen={isControlBarOpen}
        onToggleControlBar={toggleControlBar}
      />
      {lead}
      {isControlBarOpen ? (
        <FlatPrototypeActionBar id={controlBarId} label={controlLabel} />
      ) : null}
      {children}
    </section>
  );
}

function FlatPrototypeGalleryItem({
  label,
  children,
}: FlatPrototypeGalleryItemProps) {
  return (
    <section
      className="flat-section-prototype-gallery__item"
      data-flat-section-gallery-item={label}
    >
      <p
        className="flat-section-prototype-gallery__label"
        data-flat-section-gallery-label={label}
      >
        {label}
      </p>
      {children}
    </section>
  );
}

function FlatPrototypeHeader({
  kind,
  title,
  controlLabel,
  controlBarId,
  headerActions,
  hideMinimizeControl,
  isControlBarOpen,
  onToggleControlBar,
}: FlatPrototypeHeaderProps) {
  const standardControls = hideMinimizeControl
    ? FLAT_PROTOTYPE_SECTION_CONTROLS.filter(
        (control) => control.id !== "minimize",
      )
    : FLAT_PROTOTYPE_SECTION_CONTROLS;

  return (
    <header className="flat-section-prototype__header">
      <FlatPrototypeIconButton
        label={`Open ${kind} section menu`}
        buttonClassName="flat-section-prototype__kind-button"
        iconClassName={SECTION_KIND_ICON_CLASS_NAMES[kind]}
        dataSectionTypeMenu
      />
      <h2 className="flat-section-prototype__title">{title}</h2>
      <nav
        className="flat-section-prototype__top-controls"
        aria-label={`${kind} section controls`}
      >
        {headerActions}
        <FlatPrototypeIconButton
          label={`${isControlBarOpen ? "Hide" : "Show"} ${controlLabel.toLowerCase()} controls`}
          buttonClassName="flat-section-prototype__top-button flat-section-prototype__control-toggle"
          iconClassName="gg-options"
          controlsId={controlBarId}
          expanded={isControlBarOpen}
          dataControlToggle
          onClick={onToggleControlBar}
        />
        {standardControls.map((control) => (
          <FlatPrototypeIconButton
            key={control.label}
            label={control.label}
            buttonClassName={`flat-section-prototype__top-button ${control.buttonClassName}`}
            iconClassName={control.iconClassName}
          />
        ))}
      </nav>
    </header>
  );
}

function FlatPrototypeIconButton({
  label,
  buttonClassName,
  iconClassName,
  controlsId,
  dataAttr,
  dataControlToggle = false,
  dataSectionTypeMenu = false,
  expanded,
  onClick,
}: FlatPrototypeIconButtonProps) {
  return (
    <button
      type="button"
      className={`flat-section-prototype__icon-button ${buttonClassName ?? ""}`}
      aria-controls={controlsId}
      aria-expanded={expanded}
      aria-label={label}
      data-flat-control={dataAttr}
      data-flat-control-toggle={dataControlToggle || undefined}
      data-flat-section-type-menu={dataSectionTypeMenu || undefined}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={`flat-section-prototype__icon-glyph ${iconClassName}`}
      />
    </button>
  );
}

function FlatCallableTarget({ value }: { value: string }) {
  return (
    <input
      aria-label="Callable function name"
      className="flat-section-prototype__callable-target"
      name="callable-function"
      placeholder="please enter function name"
      readOnly
      value={value}
    />
  );
}

function FlatPrototypeActionBar({ id, label }: { id: string; label: string }) {
  return (
    <nav
      id={id}
      className="flat-section-prototype__action-bar"
      data-flat-action-bar="true"
    >
      {FLAT_PROTOTYPE_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`flat-section-prototype__icon-button flat-section-prototype__action-button ${action.extraClassName ?? ""}`}
          aria-label={`${action.label} placeholder action`}
          data-flat-control={action.dataAttr}
        >
          <span
            aria-hidden="true"
            className={`flat-section-prototype__icon-glyph ${action.iconClassName}`}
          />
        </button>
      ))}
      <b
        aria-hidden="true"
        className="flat-section-prototype__filter-icon gg-search"
      />
      <input
        aria-label={`${label} filter`}
        className="flat-section-prototype__filter-input"
        name={`${label.toLowerCase()}-filter`}
        readOnly
        value="filter"
      />
    </nav>
  );
}

function FlatPrototypePortList({
  align,
  label,
  ports,
}: {
  align: FlatPrototypePortAlign;
  label: string;
  ports: string[];
}) {
  const isRightAligned = align === "right";
  const alignClassName = isRightAligned ? "right" : "left";

  return (
    <ol
      className={`flat-section-prototype__port-list flat-section-prototype__port-list--${alignClassName}`}
      data-flat-port-label={label.toUpperCase()}
    >
      {ports.map((port) => (
        <li
          key={`${align}-${port}`}
          className={`flat-section-prototype__port-row flat-section-prototype__port-row--${alignClassName}`}
        >
          {port}
        </li>
      ))}
    </ol>
  );
}

function FlatPrototypeStrip({
  inputPorts,
  outputPorts,
}: {
  inputPorts: string[];
  outputPorts: string[];
}) {
  return (
    <section
      className="flat-section-prototype__ports"
      data-flat-shell-strip="ports"
    >
      <FlatPrototypePortList align="left" label="In" ports={inputPorts} />
      <FlatPrototypePortList align="right" label="Out" ports={outputPorts} />
    </section>
  );
}

function getRowGroupClassName(variant: "pinned" | "body") {
  return `flat-section-prototype__row-group flat-section-prototype__row-group--${variant}`;
}

function FlatPrototypeRows({
  rows,
  variant = "body",
}: {
  rows: FlatPrototypeRow[];
  variant?: "pinned" | "body";
}) {
  return (
    <ol className={getRowGroupClassName(variant)} data-flat-row-group={variant}>
      {rows.map((row, index) => (
        <FlatPrototypeRowItem
          key={`${variant}-${row.keyLabel}-${index}`}
          {...row}
          nestedRailRole={getNestedRailRole(rows, index)}
        />
      ))}
    </ol>
  );
}

function getNestedRailRole(
  rows: FlatPrototypeRow[],
  index: number,
): FlatPrototypeNestedRailRole | undefined {
  const depth = rows[index]?.depth ?? 0;
  if (depth <= 0) {
    return undefined;
  }

  const previousContinuity = Number((rows[index - 1]?.depth ?? 0) >= depth);
  const nextContinuity = Number((rows[index + 1]?.depth ?? 0) >= depth);
  return NESTED_ROW_RAIL_ROLE_BY_CONTINUITY[
    `${previousContinuity}:${nextContinuity}`
  ];
}

function FlatPrototypeRowItem({
  keyLabel,
  valueLabel,
  depth = 0,
  emphasis = "required",
  trailing = ":",
  nestedRailRole,
}: FlatPrototypeRowProps) {
  const railDepth = Math.max(depth - 1, 0);
  const rowStyle =
    depth > 0
      ? ({
          "--flat-depth-offset": `${depth * 0.875}rem`,
          "--flat-rail-left": `${railDepth * 0.875 + 1}rem`,
        } satisfies FlatPrototypeRowStyle)
      : undefined;
  const nestedClassName = nestedRailRole
    ? `${NESTED_ROW_RAIL_BASE_CLASS_NAME} ${NESTED_ROW_RAIL_CLASS_NAMES[nestedRailRole]}`
    : "";
  const rowClassName = `flat-section-prototype__row ${nestedClassName}`;
  const valueWithTrailing = trailing ? `${valueLabel}${trailing}` : valueLabel;

  return (
    <li
      className={rowClassName}
      data-flat-row-emphasis={emphasis}
      data-flat-row-key={keyLabel}
      style={rowStyle}
    >
      <b className="flat-section-prototype__row-key">{keyLabel}</b>
      <code className="flat-section-prototype__row-value">
        {valueWithTrailing}
      </code>
    </li>
  );
}

function FlatGlobalVariablesBody() {
  return (
    <section
      className="flat-section-prototype__global"
      data-flat-global-edge-input-params={GLOBAL_VARIABLES_FIXTURE.edgeInputParams.join(
        ",",
      )}
      data-flat-global-export-mode={GLOBAL_VARIABLES_FIXTURE.exportMode}
      data-flat-global-pinned-params={GLOBAL_VARIABLES_FIXTURE.pinnedParams.join(
        ",",
      )}
      data-flat-global-selected-params={GLOBAL_VARIABLES_FIXTURE.selectedParams.join(
        ",",
      )}
      data-flat-global-singleton="true"
      data-flat-global-title-editable="false"
      data-flat-global-top-level-param-id={
        GLOBAL_VARIABLES_FIXTURE.topLevelParamId
      }
      data-flat-global-variables="true"
    >
      <section
        aria-label="Global variable controls"
        className="flat-section-prototype__global-toolbar"
      >
        <nav
          aria-label="Global variable param actions"
          className="flat-section-prototype__global-actions"
        >
          {GLOBAL_VARIABLES_ACTIONS.map((action) => (
            <button
              key={action.action}
              type="button"
              aria-label={action.label}
              className="flat-section-prototype__global-action"
              data-flat-global-action={action.action}
            >
              <span
                aria-hidden="true"
                className={`flat-section-prototype__icon-glyph ${action.iconClassName}`}
              />
            </button>
          ))}
        </nav>
        <label className="flat-section-prototype__global-filter">
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-search"
          />
          <input
            aria-label="Global variables filter"
            className="flat-section-prototype__global-filter-input"
            name="global-variables-filter"
            readOnly
            value={GLOBAL_VARIABLES_FIXTURE.filter}
          />
        </label>
      </section>

      <section
        aria-label="Global variables status"
        className="flat-section-prototype__global-status"
      >
        <p
          className="flat-section-prototype__global-status-item"
          data-flat-global-status="singleton"
        >
          <span>Singleton</span>
          <b>{SectionTypeEnum.GlobalVariables}</b>
        </p>
        <p
          className="flat-section-prototype__global-status-item"
          data-flat-global-status="top-level-param"
        >
          <span>Top-level root</span>
          <code>{GLOBAL_VARIABLES_FIXTURE.topLevelParamId}</code>
        </p>
        <p
          className="flat-section-prototype__global-status-item"
          data-flat-global-status="python-export"
        >
          <span>Python export</span>
          <b>{GLOBAL_VARIABLES_FIXTURE.exportMode}</b>
        </p>
      </section>

      <section
        aria-label="Global variable params"
        className="flat-section-prototype__global-params"
      >
        <FlatPrototypeRows
          rows={GLOBAL_VARIABLES_PINNED_ROWS}
          variant="pinned"
        />
        <FlatPrototypeRows rows={GLOBAL_VARIABLES_ROWS} />
      </section>
    </section>
  );
}

function FlatListRootBody() {
  const selectedViewMode = ListRootViewModeEnum.default;

  return (
    <section
      className="flat-section-prototype__list-root"
      data-flat-list-root="true"
      data-flat-list-root-view-mode={selectedViewMode}
    >
      <section
        aria-label="Child section controls"
        className="flat-section-prototype__list-root-toolbar"
      >
        <p className="flat-section-prototype__list-root-count">
          <span className="flat-section-prototype__list-root-kicker">
            Children
          </span>
          <input
            aria-label="Child count"
            className="flat-section-prototype__list-root-count-input"
            name="list-root-child-count"
            readOnly
            value={LIST_ROOT_CHILDREN.length}
          />
        </p>
        <nav
          aria-label="Child section count actions"
          className="flat-section-prototype__list-root-actions"
        >
          <button
            type="button"
            aria-label="Delete child sections"
            className="flat-section-prototype__list-root-action"
            data-flat-list-root-action="delete"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-math-minus flat-section-prototype__icon-minus"
            />
          </button>
          <button
            type="button"
            aria-label="Create child sections"
            className="flat-section-prototype__list-root-action"
            data-flat-list-root-action="create"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-math-plus"
            />
          </button>
        </nav>
        <p
          className="flat-section-prototype__list-root-default"
          data-flat-list-root-default-child-type={SectionTypeEnum.Callable}
        >
          <span className="flat-section-prototype__list-root-kicker">
            Default child
          </span>
          <b>{SectionTypeEnum.Callable}</b>
        </p>
      </section>

      <section
        aria-label="Nested child sections"
        className="flat-section-prototype__list-root-children"
        data-flat-list-root-children="default-stack"
        data-flat-list-root-layout="stacked-children"
      >
        <ol className="flat-section-prototype__list-root-child-list">
          {LIST_ROOT_CHILDREN.map((child) => (
            <li
              key={child.id}
              className="flat-section-prototype__list-root-child"
              data-flat-list-root-child-type={child.sectionType}
              data-flat-list-root-sortable-child="true"
            >
              <b className="flat-section-prototype__list-root-child-order">
                {child.orderLabel}
              </b>
              <span className="flat-section-prototype__list-root-child-main">
                <strong className="flat-section-prototype__list-root-child-title">
                  {child.title}
                </strong>
                <code className="flat-section-prototype__list-root-child-type">
                  {child.sectionType}
                </code>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function FlatGroupBody() {
  return (
    <section
      className="flat-section-prototype__group"
      data-flat-group="true"
      data-flat-group-orientation="vertical"
      data-flat-group-overflow-mode="off"
    >
      <section
        aria-label="Group layout controls"
        className="flat-section-prototype__group-toolbar"
      >
        <p
          className="flat-section-prototype__group-setting"
          data-flat-group-default-child-type={SectionTypeEnum.Callable}
        >
          <span className="flat-section-prototype__group-kicker">
            Default child
          </span>
          <b>{SectionTypeEnum.Callable}</b>
        </p>
        <p
          className="flat-section-prototype__group-setting"
          data-flat-group-overflow="off"
        >
          <span className="flat-section-prototype__group-kicker">Overflow</span>
          <b>Off</b>
        </p>
        <nav
          aria-label="Group orientation"
          className="flat-section-prototype__group-orientation"
        >
          <button
            type="button"
            aria-label="Use vertical group orientation"
            aria-pressed="true"
            className="flat-section-prototype__group-orientation-button"
            data-flat-group-orientation-option="vertical"
          >
            Vertical
          </button>
          <button
            type="button"
            aria-label="Use horizontal group orientation"
            aria-pressed="false"
            className="flat-section-prototype__group-orientation-button"
            data-flat-group-orientation-option="horizontal"
          >
            Horizontal
          </button>
        </nav>
        <button
          type="button"
          aria-label="Ungroup sections"
          className="flat-section-prototype__group-ungroup"
          data-flat-group-action="ungroup"
        >
          Ungroup
        </button>
      </section>

      <section
        aria-label="Group child section controls"
        className="flat-section-prototype__group-child-controls"
      >
        <p className="flat-section-prototype__group-child-count">
          <span className="flat-section-prototype__group-kicker">Children</span>
          <input
            aria-label="Group child count"
            className="flat-section-prototype__group-count-input"
            name="group-child-count"
            readOnly
            value={GROUP_CHILDREN.length}
          />
        </p>
        <nav
          aria-label="Group child count actions"
          className="flat-section-prototype__group-child-actions"
        >
          <button
            type="button"
            aria-label="Delete group child sections"
            className="flat-section-prototype__group-child-action"
            data-flat-group-action="delete"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-math-minus flat-section-prototype__icon-minus"
            />
          </button>
          <button
            type="button"
            aria-label="Create group child sections"
            className="flat-section-prototype__group-child-action"
            data-flat-group-action="create"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-math-plus"
            />
          </button>
        </nav>
      </section>

      <section
        aria-label="Nested group children"
        className="flat-section-prototype__group-children"
        data-flat-group-children="vertical"
      >
        <ol className="flat-section-prototype__group-child-list">
          {GROUP_CHILDREN.map((child) => (
            <li
              key={child.id}
              className="flat-section-prototype__group-child"
              data-flat-group-child-type={child.sectionType}
              data-flat-group-sortable-child="true"
            >
              <b className="flat-section-prototype__group-child-order">
                {child.orderLabel}
              </b>
              <span className="flat-section-prototype__group-child-main">
                <strong className="flat-section-prototype__group-child-title">
                  {child.title}
                </strong>
                <code className="flat-section-prototype__group-child-type">
                  {child.sectionType}
                </code>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function FlatDrawBody() {
  const activeLayer = DRAW_FIXTURE.layers.find((layer) => layer.active);

  return (
    <section
      className="flat-section-prototype__draw"
      data-flat-draw="true"
      data-flat-draw-active-layer={activeLayer?.id}
      data-flat-draw-mode={DRAW_FIXTURE.canvasMode}
    >
      <section
        aria-label="Draw tool controls"
        className="flat-section-prototype__draw-toolbar"
      >
        <section
          aria-label="Brush color"
          className="flat-section-prototype__draw-color"
          data-flat-draw-color={DRAW_FIXTURE.brushColor}
        >
          <span className="flat-section-prototype__draw-kicker">Color</span>
          <ol className="flat-section-prototype__draw-color-list">
            {DRAW_FIXTURE.colorChoices.map((color) => (
              <li key={color}>
                <button
                  type="button"
                  aria-label={`Use brush color ${color}`}
                  aria-pressed={color === DRAW_FIXTURE.brushColor}
                  className="flat-section-prototype__draw-color-swatch"
                  data-flat-draw-color-choice={color}
                  style={{ background: color }}
                />
              </li>
            ))}
          </ol>
        </section>

        <nav
          aria-label="Draw canvas mode"
          className="flat-section-prototype__draw-modes"
        >
          {DRAW_MODE_CONTROLS.map((control) => (
            <button
              key={control.mode}
              type="button"
              aria-label={`${control.label} mode`}
              aria-pressed={control.mode === DRAW_FIXTURE.canvasMode}
              className="flat-section-prototype__draw-mode"
              data-flat-draw-mode-option={control.mode}
            >
              <span
                aria-hidden="true"
                className={`flat-section-prototype__icon-glyph ${control.iconClassName}`}
              />
              <span className="flat-section-prototype__draw-mode-label">
                {control.label}
              </span>
            </button>
          ))}
        </nav>

        <section
          aria-label="Brush settings"
          className="flat-section-prototype__draw-settings"
        >
          <label className="flat-section-prototype__draw-setting">
            <span className="flat-section-prototype__draw-kicker">Size</span>
            <input
              aria-label="Brush size"
              className="flat-section-prototype__draw-number"
              name="draw-brush-size"
              readOnly
              value={DRAW_FIXTURE.brushSize}
            />
          </label>
          <label className="flat-section-prototype__draw-setting">
            <span className="flat-section-prototype__draw-kicker">Opacity</span>
            <input
              aria-label="Brush Opacity"
              className="flat-section-prototype__draw-number"
              name="draw-brush-alpha"
              readOnly
              value={DRAW_FIXTURE.brushOpacity}
            />
          </label>
          <section
            aria-label="Brush shape"
            className="flat-section-prototype__draw-shapes"
            data-flat-draw-brush-shape={DRAW_FIXTURE.brushShape}
          >
            <button
              type="button"
              aria-label="Use butt brush shape"
              aria-pressed={
                DRAW_FIXTURE.brushShape === DrawAreaBrushShapeEnum.butt
              }
              className="flat-section-prototype__draw-shape"
              data-flat-draw-brush-shape-option={DrawAreaBrushShapeEnum.butt}
            >
              <span
                aria-hidden="true"
                className="flat-section-prototype__icon-glyph gg-shape-square"
              />
            </button>
            <button
              type="button"
              aria-label="Use round brush shape"
              aria-pressed={
                DRAW_FIXTURE.brushShape === DrawAreaBrushShapeEnum.round
              }
              className="flat-section-prototype__draw-shape"
              data-flat-draw-brush-shape-option={DrawAreaBrushShapeEnum.round}
            >
              <span
                aria-hidden="true"
                className="flat-section-prototype__icon-glyph gg-shape-circle"
              />
            </button>
          </section>
        </section>

        <label className="flat-section-prototype__draw-setting">
          <span className="flat-section-prototype__draw-kicker">Eraser</span>
          <input
            aria-label="Eraser brush size"
            className="flat-section-prototype__draw-number"
            name="draw-eraser-size"
            readOnly
            value={DRAW_FIXTURE.eraserBrushSize}
          />
        </label>

        <button
          type="button"
          aria-label="Clear active layer brush strokes"
          className="flat-section-prototype__draw-clear"
          data-flat-draw-action="clear-strokes"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-trash"
          />
        </button>
      </section>

      <section
        aria-label="Draw canvas and layer stack"
        className="flat-section-prototype__draw-workspace"
      >
        <figure
          aria-label="Layered draw canvas preview"
          className="flat-section-prototype__draw-canvas"
          data-flat-draw-canvas="true"
        >
          <figcaption className="flat-section-prototype__draw-canvas-caption">
            <span>Canvas</span>
            <code>{activeLayer?.name}</code>
          </figcaption>
          <ol
            aria-hidden="true"
            className="flat-section-prototype__draw-canvas-layers"
          >
            {DRAW_FIXTURE.layers
              .filter((layer) => layer.visible)
              .map((layer) => (
                <li
                  key={layer.id}
                  className="flat-section-prototype__draw-canvas-layer"
                  data-flat-draw-canvas-layer={layer.id}
                  data-flat-draw-layer-active={layer.active || undefined}
                  style={
                    {
                      "--flat-draw-layer-alpha": layer.layerOpacity,
                    } satisfies FlatDrawLayerStyle
                  }
                >
                  <ol className="flat-section-prototype__draw-canvas-items">
                    {layer.elements.map((item) => (
                      <li
                        key={item.id}
                        className="flat-section-prototype__draw-canvas-item"
                        data-flat-draw-layer-item={item.id}
                        data-flat-draw-layer-item-type={item.type}
                        data-flat-draw-layer-item-path={item.dataPath}
                        data-flat-draw-layer-item-transform={item.transformId}
                        style={
                          {
                            "--flat-draw-item-angle": item.angle ?? "0deg",
                            "--flat-draw-item-height": item.height,
                            "--flat-draw-item-width": item.width,
                            "--flat-draw-item-x": item.x,
                            "--flat-draw-item-y": item.y,
                          } satisfies FlatDrawItemStyle
                        }
                      >
                        {item.type === ArtifactTypeEnum.Image ? (
                          <>
                            <span className="flat-section-prototype__draw-image-fill" />
                            <span
                              aria-hidden="true"
                              className="flat-section-prototype__draw-transform-handle flat-section-prototype__draw-transform-handle--nw"
                            />
                            <span
                              aria-hidden="true"
                              className="flat-section-prototype__draw-transform-handle flat-section-prototype__draw-transform-handle--ne"
                            />
                            <span
                              aria-hidden="true"
                              className="flat-section-prototype__draw-transform-handle flat-section-prototype__draw-transform-handle--sw"
                            />
                            <span
                              aria-hidden="true"
                              className="flat-section-prototype__draw-transform-handle flat-section-prototype__draw-transform-handle--se"
                            />
                          </>
                        ) : (
                          <span className="flat-section-prototype__draw-stroke-fill" />
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            <li
              className="flat-section-prototype__draw-draft-layer"
              data-flat-draw-draft-canvas="true"
            >
              <span className="flat-section-prototype__draw-draft-point" />
            </li>
          </ol>
        </figure>

        <aside
          aria-label="Draw layers"
          className="flat-section-prototype__draw-layer-panel"
        >
          <label className="flat-section-prototype__draw-layer-alpha">
            <span className="flat-section-prototype__draw-kicker">
              Layer Opacity
            </span>
            <input
              aria-label="Active Layer Opacity"
              className="flat-section-prototype__draw-number"
              name="draw-layer-alpha"
              readOnly
              value={activeLayer?.layerOpacity ?? ""}
            />
          </label>
          <ol
            aria-label="Layer list"
            className="flat-section-prototype__draw-layer-list"
          >
            {[...DRAW_FIXTURE.layers].reverse().map((layer) => (
              <li
                key={layer.id}
                className="flat-section-prototype__draw-layer-row"
                data-flat-draw-layer={layer.id}
                data-flat-draw-layer-active={layer.active || undefined}
                data-flat-draw-layer-visible={layer.visible}
                data-flat-draw-layer-reorder="true"
              >
                <button
                  type="button"
                  aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  className="flat-section-prototype__draw-layer-visibility"
                  data-flat-draw-layer-action="toggle-visibility"
                >
                  <span
                    aria-hidden="true"
                    className="flat-section-prototype__icon-glyph gg-eye"
                  />
                </button>
                <span className="flat-section-prototype__draw-layer-main">
                  <strong className="flat-section-prototype__draw-layer-name">
                    {layer.name}
                  </strong>
                  <code className="flat-section-prototype__draw-layer-meta">
                    {layer.elements.length} elements
                  </code>
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${layer.name}`}
                  className="flat-section-prototype__draw-layer-delete"
                  data-flat-draw-layer-action="delete"
                >
                  <span
                    aria-hidden="true"
                    className="flat-section-prototype__icon-glyph gg-close"
                  />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            aria-label="Add draw layer"
            className="flat-section-prototype__draw-add-layer"
            data-flat-draw-layer-action="add"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-math-plus"
            />
            <span>Add Layer</span>
          </button>
        </aside>
      </section>
    </section>
  );
}

function FlatImageBody() {
  return (
    <section
      className="flat-section-prototype__image"
      data-flat-image="true"
      data-flat-image-path={IMAGE_FIXTURE.path}
    >
      <section
        aria-label="Image artifact controls"
        className="flat-section-prototype__image-toolbar"
      >
        <label className="flat-section-prototype__image-path-field">
          <span className="flat-section-prototype__image-kicker">
            Image Path
          </span>
          <input
            aria-label="Image path"
            className="flat-section-prototype__image-path-input"
            name="image-path"
            readOnly
            value={IMAGE_FIXTURE.path}
          />
        </label>
        <button
          type="button"
          aria-label="Add artifact by filepath"
          className="flat-section-prototype__image-artifact-button"
          data-flat-image-action="add-artifact-by-filepath"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-math-plus"
          />
          <span className="flat-section-prototype__image-artifact-button-text">
            Add Artifact
          </span>
        </button>
      </section>

      <figure
        aria-label="Decoded image preview"
        className="flat-section-prototype__image-preview"
        data-flat-image-fit="contain"
        data-flat-image-preview="decoded"
      >
        <img
          alt=""
          className="flat-section-prototype__image-preview-img"
          src={IMAGE_FIXTURE.src}
        />
      </figure>
    </section>
  );
}

function FlatChartBody() {
  return (
    <section
      className="flat-section-prototype__chart"
      data-flat-chart="true"
      data-flat-chart-data-path={CHART_FIXTURE.path}
      data-flat-chart-type={CHART_FIXTURE.chartType}
    >
      <section
        aria-label="Chart data controls"
        className="flat-section-prototype__chart-toolbar"
      >
        <label className="flat-section-prototype__chart-path-field">
          <span className="flat-section-prototype__chart-kicker">
            Data Path
          </span>
          <input
            aria-label="Chart data path"
            className="flat-section-prototype__chart-path-input"
            name="chart-data-path"
            readOnly
            value={CHART_FIXTURE.path}
          />
        </label>
        <button
          type="button"
          aria-label="Add chart artifact by filepath"
          className="flat-section-prototype__chart-artifact-button"
          data-flat-chart-action="add-artifact-by-filepath"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-math-plus"
          />
          <span className="flat-section-prototype__chart-artifact-button-text">
            Add Artifact
          </span>
        </button>
      </section>

      <section
        aria-label="Chart configuration and preview"
        className="flat-section-prototype__chart-content"
      >
        <section
          aria-label="Chart settings"
          className="flat-section-prototype__chart-settings"
        >
          <section
            aria-label="Chart type"
            className="flat-section-prototype__chart-type"
          >
            <span className="flat-section-prototype__chart-kicker">
              Chart Type
            </span>
            <span className="flat-section-prototype__chart-type-options">
              <button
                type="button"
                aria-pressed={CHART_FIXTURE.chartType === ChartTypeEnum.line}
                className="flat-section-prototype__chart-type-option"
                data-flat-chart-type-option={ChartTypeEnum.line}
              >
                Line
              </button>
              <button
                type="button"
                aria-pressed={CHART_FIXTURE.chartType === ChartTypeEnum.scatter}
                className="flat-section-prototype__chart-type-option"
                data-flat-chart-type-option={ChartTypeEnum.scatter}
              >
                Scatter
              </button>
            </span>
          </section>

          <label className="flat-section-prototype__chart-column-field">
            <span className="flat-section-prototype__chart-kicker">X Axis</span>
            <input
              aria-label="X-axis column"
              className="flat-section-prototype__chart-column-input"
              name="chart-x-axis-column"
              readOnly
              value={CHART_FIXTURE.xAxisColumn}
            />
          </label>

          <section
            aria-label="Loaded chart data columns"
            className="flat-section-prototype__chart-columns"
          >
            <span className="flat-section-prototype__chart-kicker">
              Columns
            </span>
            <ol className="flat-section-prototype__chart-column-list">
              {CHART_FIXTURE.columns.map((column) => (
                <li
                  key={column}
                  className="flat-section-prototype__chart-column"
                  data-flat-chart-column={column}
                >
                  {column}
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-label="Log scale toggles"
            className="flat-section-prototype__chart-log-scales"
          >
            <span className="flat-section-prototype__chart-kicker">
              Log Scale
            </span>
            <FlatChartLogToggle
              label="X"
              name="xAxisLog"
              value={CHART_FIXTURE.logScales.xAxisLog}
            />
            <FlatChartLogToggle
              label="Y1"
              name="y1AxisLog"
              value={CHART_FIXTURE.logScales.y1AxisLog}
            />
            <FlatChartLogToggle
              label="Y2"
              name="y2AxisLog"
              value={CHART_FIXTURE.logScales.y2AxisLog}
            />
          </section>
        </section>

        <figure
          aria-label="Rendered line chart preview"
          className="flat-section-prototype__chart-preview"
          data-flat-chart-preview="line"
          data-flat-chart-x-axis={CHART_FIXTURE.xAxisColumn}
        >
          <figcaption className="flat-section-prototype__chart-caption">
            <span>Line</span>
            <code>{CHART_FIXTURE.xAxisColumn}</code>
          </figcaption>
          <ol
            aria-label="Chart datasets"
            className="flat-section-prototype__chart-legend"
          >
            {CHART_FIXTURE.datasets.map((dataset) => (
              <li
                key={dataset.id}
                className="flat-section-prototype__chart-legend-item"
                data-flat-chart-axis={dataset.axis}
                data-flat-chart-dataset={dataset.id}
                data-flat-chart-dataset-state={dataset.status}
                data-flat-chart-tone={dataset.tone}
              >
                <span className="flat-section-prototype__chart-legend-swatch" />
                <span className="flat-section-prototype__chart-legend-label">
                  {dataset.label}
                </span>
                <code className="flat-section-prototype__chart-legend-axis">
                  {dataset.axis}
                </code>
              </li>
            ))}
          </ol>
          <section
            aria-label="Chart plot area"
            className="flat-section-prototype__chart-plot"
          >
            <b className="flat-section-prototype__chart-axis flat-section-prototype__chart-axis--y1">
              y1
            </b>
            <b className="flat-section-prototype__chart-axis flat-section-prototype__chart-axis--y2">
              y2
            </b>
            <b className="flat-section-prototype__chart-axis flat-section-prototype__chart-axis--x">
              time
            </b>
            <ol
              aria-hidden="true"
              className="flat-section-prototype__chart-segments"
            >
              {CHART_FIXTURE.segments.map((segment) => (
                <li
                  key={segment.id}
                  className="flat-section-prototype__chart-segment"
                  data-flat-chart-segment={segment.id}
                  data-flat-chart-tone={segment.tone}
                  style={
                    {
                      "--flat-chart-x": segment.x,
                      "--flat-chart-y": segment.y,
                      "--flat-chart-segment-angle": segment.angle,
                      "--flat-chart-segment-width": segment.width,
                    } satisfies FlatChartSegmentStyle
                  }
                />
              ))}
            </ol>
            <ol
              aria-hidden="true"
              className="flat-section-prototype__chart-points"
            >
              {CHART_FIXTURE.points.map((point) => (
                <li
                  key={point.id}
                  className="flat-section-prototype__chart-point"
                  data-flat-chart-point={point.id}
                  data-flat-chart-tone={point.tone}
                  style={
                    {
                      "--flat-chart-x": point.x,
                      "--flat-chart-y": point.y,
                    } satisfies FlatChartPointStyle
                  }
                />
              ))}
            </ol>
          </section>
        </figure>
      </section>
    </section>
  );
}

function FlatChartLogToggle({
  label,
  name,
  value,
}: {
  label: string;
  name: keyof typeof CHART_FIXTURE.logScales;
  value: boolean;
}) {
  return (
    <label
      className="flat-section-prototype__chart-log-toggle"
      data-flat-chart-log-scale={name}
    >
      <input
        aria-label={`${label} axis log scale`}
        checked={value}
        name={`chart-${name}`}
        readOnly
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function FlatTextBlockDisplayModeButton() {
  return (
    <button
      type="button"
      aria-label="Edit Markdown"
      className="flat-section-prototype__icon-button flat-section-prototype__top-button flat-section-prototype__text-block-display-toggle"
      data-flat-text-block-action="toggle-display-mode"
      data-flat-text-block-next-display-mode={TextBlockDisplayModeEnum.Edit}
    >
      <span
        aria-hidden="true"
        className="flat-section-prototype__icon-glyph gg-pen"
      />
    </button>
  );
}

function FlatTextBlockBody() {
  return (
    <section
      className="flat-section-prototype__text-block"
      data-flat-text-block="true"
      data-flat-text-block-display-mode={TEXT_BLOCK_FIXTURE.textDisplayMode}
      data-flat-text-block-format={TEXT_BLOCK_FIXTURE.format}
      data-flat-text-block-heading-as-section-name={
        TEXT_BLOCK_FIXTURE.headingAsSectionName
      }
      data-flat-text-block-master-font-size={
        TEXT_BLOCK_FIXTURE.masterFontSizePx
      }
      data-flat-text-block-meta-control-style={
        TEXT_BLOCK_FIXTURE.metaControlStyle
      }
    >
      <section
        aria-label="Text block settings"
        className="flat-section-prototype__text-block-toolbar"
      >
        <ol className="flat-section-prototype__text-block-setting-list">
          {TEXT_BLOCK_SETTINGS.map((setting) => (
            <li
              key={setting.id}
              className="flat-section-prototype__text-block-setting"
              data-flat-text-block-setting={setting.id}
              data-flat-text-block-setting-active={setting.active}
            >
              <span className="flat-section-prototype__text-block-kicker">
                {setting.label}
              </span>
              <code>{setting.value}</code>
            </li>
          ))}
        </ol>
        <label className="flat-section-prototype__text-block-font">
          <span className="flat-section-prototype__text-block-kicker">
            Master Font
          </span>
          <input
            aria-label="Master font size"
            max={48}
            min={8}
            name="text-block-master-font-size"
            readOnly
            type="range"
            value={TEXT_BLOCK_FIXTURE.masterFontSizePx}
          />
          <output>{TEXT_BLOCK_FIXTURE.masterFontSizePx}px</output>
        </label>
      </section>

      <article
        aria-label="Rendered markdown text"
        className="flat-section-prototype__text-block-content"
        data-flat-text-block-rendered="true"
        style={
          {
            "--flat-text-block-font-size": `${TEXT_BLOCK_FIXTURE.masterFontSizePx}px`,
          } satisfies FlatTextBlockContentStyle
        }
      >
        <h1>{TEXT_BLOCK_FIXTURE.body.heading}</h1>
        <p>
          {TEXT_BLOCK_FIXTURE.body.paragraph}{" "}
          <code>{TEXT_BLOCK_FIXTURE.body.inlineCode}</code>
        </p>
        <ul>
          {TEXT_BLOCK_FIXTURE.body.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <pre data-flat-text-block-code-block="true">
          <button
            type="button"
            aria-label="Copy code"
            className="flat-section-prototype__text-block-code-copy"
            data-flat-text-block-code-copy="true"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-copy"
            />
          </button>
          <code>{TEXT_BLOCK_FIXTURE.body.code}</code>
        </pre>
      </article>
    </section>
  );
}

function FlatPromptBody() {
  return (
    <section
      className="flat-section-prototype__prompt"
      data-flat-prompt="true"
      data-flat-prompt-format={PROMPT_FIXTURE.format}
      data-flat-prompt-missing-count={PROMPT_FIXTURE.missingVariables.length}
      data-flat-prompt-source="linked-template"
      data-flat-prompt-template-id={PROMPT_FIXTURE.promptTemplateId}
    >
      <section
        aria-label="Prompt view mode"
        className="flat-section-prototype__prompt-modebar"
      >
        <button
          type="button"
          aria-pressed="true"
          className="flat-section-prototype__prompt-mode"
          data-flat-prompt-view-mode="template"
        >
          Template
        </button>
        <button
          type="button"
          aria-pressed="false"
          className="flat-section-prototype__prompt-mode"
          data-flat-prompt-view-mode="preview"
        >
          Preview
        </button>
        <b
          className="flat-section-prototype__prompt-state"
          data-flat-prompt-state="render-error"
        >
          Missing {PROMPT_FIXTURE.missingVariables.length}
        </b>
      </section>

      <section
        aria-label="Prompt source controls"
        className="flat-section-prototype__prompt-source"
      >
        <p className="flat-section-prototype__prompt-linked">
          <span className="flat-section-prototype__prompt-kicker">
            Linked Template
          </span>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-label="Linked prompt template selector"
            className="flat-section-prototype__prompt-template-selector"
            data-flat-prompt-template-selector="true"
          >
            {PROMPT_FIXTURE.linkedTemplateName}
          </button>
        </p>
        <button
          type="button"
          className="flat-section-prototype__prompt-local-copy"
          data-flat-prompt-action="make-local-copy"
        >
          Make Local Copy
        </button>
        <label className="flat-section-prototype__prompt-format">
          <span className="flat-section-prototype__prompt-kicker">Format</span>
          <select
            aria-label="Prompt format"
            defaultValue={PROMPT_FIXTURE.format}
            disabled
            name="prompt-format"
          >
            <option value={PROMPT_FIXTURE.format}>
              {PROMPT_FIXTURE.format}
            </option>
          </select>
        </label>
      </section>

      <p
        className="flat-section-prototype__prompt-description"
        data-flat-prompt-template-description="true"
      >
        {PROMPT_FIXTURE.linkedTemplateDescription}
      </p>

      <p
        className="flat-section-prototype__prompt-notice"
        data-flat-prompt-linked-template-note="true"
      >
        Linked to prompt template "{PROMPT_FIXTURE.linkedTemplateName}". Edit it
        in Project AI Settings or make a local copy in section settings.
      </p>

      <section
        aria-label="Prompt editor and preview"
        className="flat-section-prototype__prompt-workspace"
      >
        <article
          aria-label="Prompt template editor"
          className="flat-section-prototype__prompt-panel flat-section-prototype__prompt-panel--editor"
          data-flat-prompt-template-editor="true"
          data-flat-prompt-template-readonly="true"
        >
          <header className="flat-section-prototype__prompt-panel-header">
            <span>Template</span>
            <code>read-only</code>
          </header>
          <textarea
            aria-label="Prompt template source"
            className="flat-section-prototype__prompt-template"
            name="prompt-template-source"
            readOnly
            spellCheck="false"
            value={PROMPT_FIXTURE.template}
          />
        </article>

        <article
          aria-label="Rendered prompt preview"
          className="flat-section-prototype__prompt-panel flat-section-prototype__prompt-panel--preview"
          data-flat-prompt-render-preview="true"
        >
          <header className="flat-section-prototype__prompt-panel-header">
            <span>Preview</span>
            <code>render-error</code>
          </header>
          <p
            className="flat-section-prototype__prompt-error"
            data-flat-prompt-render-error="true"
          >
            {PROMPT_FIXTURE.renderError}
          </p>
          <pre className="flat-section-prototype__prompt-rendered">
            {PROMPT_FIXTURE.renderedText || "No prompt rendered yet."}
          </pre>
        </article>
      </section>

      <section
        aria-label="Prompt inputs and missing variables"
        className="flat-section-prototype__prompt-status"
      >
        <section
          aria-label="Prompt inputs"
          className="flat-section-prototype__prompt-status-group"
        >
          <span className="flat-section-prototype__prompt-kicker">Inputs</span>
          <ol className="flat-section-prototype__prompt-token-list">
            {PROMPT_FIXTURE.inputs.map((input) => (
              <li
                key={input.name}
                className="flat-section-prototype__prompt-token"
                data-flat-prompt-input={input.name}
              >
                <b>{input.name}</b>
                <code>{input.value}</code>
              </li>
            ))}
          </ol>
        </section>
        <section
          aria-label="Missing prompt variables"
          className="flat-section-prototype__prompt-status-group"
        >
          <span className="flat-section-prototype__prompt-kicker">Missing</span>
          <ol className="flat-section-prototype__prompt-token-list">
            {PROMPT_FIXTURE.missingVariables.map((variable) => (
              <li
                key={variable}
                className="flat-section-prototype__prompt-token"
                data-flat-prompt-missing-variable={variable}
              >
                <b>{variable}</b>
                <code>required</code>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </section>
  );
}

function FlatMetaControlBody() {
  return (
    <section
      className="flat-section-prototype__meta-control"
      data-flat-meta-control="true"
      data-flat-meta-control-code-obj-type={META_CONTROL_FIXTURE.codeObjType}
      data-flat-meta-control-code-obj-variant-map={`${META_CONTROL_FIXTURE.paramId}:${META_CONTROL_FIXTURE.paramVariantId}`}
      data-flat-meta-control-param-id={META_CONTROL_FIXTURE.paramId}
      data-flat-meta-control-persistence="setParamEnteredValue"
      data-flat-meta-control-realtime="section-dependency"
      data-flat-meta-control-show-section-title={
        META_CONTROL_FIXTURE.showSectionTitle
      }
    >
      <section
        aria-label="Active meta control"
        className="flat-section-prototype__meta-control-active"
        data-flat-meta-control-active-param={META_CONTROL_FIXTURE.paramId}
      >
        <button
          type="button"
          aria-label="Open MetaControl menu"
          className="flat-section-prototype__meta-control-menu"
          data-flat-meta-control-menu="true"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-menu"
          />
        </button>

        <section
          aria-label="SliderParam meta control value"
          className="flat-section-prototype__meta-control-widget flat-section-prototype__meta-control-widget--active"
          data-flat-meta-control-widget-type={META_CONTROL_FIXTURE.codeObjType}
        >
          <span
            className="flat-section-prototype__meta-control-section-title"
            data-flat-meta-control-section-title="visible"
          >
            {META_CONTROL_FIXTURE.title}
          </span>
          <label className="flat-section-prototype__meta-control-slider">
            <span className="flat-section-prototype__meta-control-kicker">
              {META_CONTROL_FIXTURE.controlName}
            </span>
            <input
              aria-label="temperature slider value"
              max={META_CONTROL_FIXTURE.max}
              min={META_CONTROL_FIXTURE.min}
              name="meta-control-temperature"
              readOnly
              step={META_CONTROL_FIXTURE.step}
              type="range"
              value={META_CONTROL_FIXTURE.value}
            />
            <output>{META_CONTROL_FIXTURE.value}</output>
          </label>
        </section>
      </section>

      <section
        aria-label="MetaControl menu state"
        className="flat-section-prototype__meta-control-menu-state"
      >
        <b data-flat-meta-control-menu-action="show-title">Show title On</b>
        <b data-flat-meta-control-menu-action="lock-position">Lock</b>
        <b data-flat-meta-control-menu-action="hide-or-close">Hide</b>
      </section>

      <ol
        aria-label="Supported meta control widget examples"
        className="flat-section-prototype__meta-control-widget-list"
      >
        {META_CONTROL_WIDGET_PREVIEWS.map((widget) => (
          <FlatMetaControlWidgetPreviewItem key={widget.id} widget={widget} />
        ))}
      </ol>

      <section
        aria-label="MetaControl param state"
        className="flat-section-prototype__meta-control-state"
      >
        <b data-flat-meta-control-selected-param={META_CONTROL_FIXTURE.paramId}>
          selected
        </b>
        <b data-flat-meta-control-pinned-param={META_CONTROL_FIXTURE.paramId}>
          pinned
        </b>
        <code>{META_CONTROL_FIXTURE.paramVariantId}</code>
      </section>
    </section>
  );
}

function FlatMetaControlWidgetPreviewItem({
  widget,
}: {
  widget: FlatMetaControlWidgetPreview;
}) {
  return (
    <li
      className="flat-section-prototype__meta-control-widget-preview"
      data-flat-meta-control-widget={widget.id}
      data-flat-meta-control-widget-type={widget.codeObjType}
    >
      <span className="flat-section-prototype__meta-control-preview-label">
        {widget.label}
      </span>
      <FlatMetaControlPreviewControl widget={widget} />
      <code className="flat-section-prototype__meta-control-preview-detail">
        {widget.detail}
      </code>
    </li>
  );
}

function FlatMetaControlPreviewControl({
  widget,
}: {
  widget: FlatMetaControlWidgetPreview;
}) {
  if (widget.codeObjType === CodeObjTypeEnum.ButtonParam) {
    return (
      <button
        type="button"
        className="flat-section-prototype__meta-control-button"
        data-flat-meta-control-action-mode={widget.detail}
      >
        {widget.value}
      </button>
    );
  }

  if (widget.codeObjType === CodeObjTypeEnum.SwitchParam) {
    return (
      <input
        aria-label={`${widget.label} switch`}
        checked={widget.value === "true"}
        className="flat-section-prototype__meta-control-switch"
        name={`meta-control-${widget.id}`}
        readOnly
        type="checkbox"
      />
    );
  }

  if (widget.codeObjType === CodeObjTypeEnum.ColorPickerParam) {
    return (
      <span className="flat-section-prototype__meta-control-color">
        <span
          aria-hidden="true"
          className="flat-section-prototype__meta-control-color-swatch"
          style={{ background: widget.value }}
        />
        <code>{widget.value}</code>
      </span>
    );
  }

  if (widget.codeObjType === CodeObjTypeEnum.DropdownParam) {
    return (
      <select
        aria-label={`${widget.label} dropdown`}
        className="flat-section-prototype__meta-control-select"
        defaultValue={widget.value}
        disabled
        name={`meta-control-${widget.id}`}
      >
        <option value={widget.value}>{widget.value}</option>
      </select>
    );
  }

  if (widget.codeObjType === CodeObjTypeEnum.DateParam) {
    return (
      <input
        aria-label={`${widget.label} date`}
        className="flat-section-prototype__meta-control-date"
        data-flat-meta-control-date-mode={DateControlModeEnum.calendar}
        data-flat-meta-control-date-selection={DateSelectionModeEnum.single}
        name={`meta-control-${widget.id}`}
        readOnly
        type="date"
        value={widget.value}
      />
    );
  }

  if (widget.codeObjType === CodeObjTypeEnum.TimeParam) {
    return (
      <input
        aria-label={`${widget.label} time`}
        className="flat-section-prototype__meta-control-time"
        data-flat-meta-control-time-mode={TimeControlModeEnum.input}
        name={`meta-control-${widget.id}`}
        readOnly
        type="time"
        value={widget.value}
      />
    );
  }

  return (
    <button
      type="button"
      className="flat-section-prototype__meta-control-dropzone"
      data-flat-meta-control-dropzone-mode={widget.value}
    >
      Drop files
    </button>
  );
}

function FlatSocialBody() {
  return (
    <section
      className="flat-section-prototype__social"
      data-flat-social="true"
      data-flat-social-editable={SOCIAL_FIXTURE.editable}
      data-flat-social-provider={SOCIAL_FIXTURE.provider}
      data-flat-social-size-mode={SOCIAL_FIXTURE.sizeMode}
      data-flat-social-url={SOCIAL_FIXTURE.url}
    >
      <section
        aria-label="Social URL settings"
        className="flat-section-prototype__social-toolbar"
      >
        <label className="flat-section-prototype__social-url-field">
          <span className="flat-section-prototype__social-kicker">
            Social Media URL
          </span>
          <input
            aria-label="Social Media URL"
            className="flat-section-prototype__social-url-input"
            name="social-media-url"
            readOnly
            value={SOCIAL_FIXTURE.url}
          />
        </label>
        <ol
          aria-label="Detected social providers"
          className="flat-section-prototype__social-provider-list"
        >
          {SOCIAL_FIXTURE.providerOptions.map((option) => (
            <li
              key={option.id}
              className="flat-section-prototype__social-provider"
              data-flat-social-provider-option={option.provider}
              data-flat-social-provider-status={option.status}
            >
              {option.label}
            </li>
          ))}
        </ol>
      </section>

      <figure
        aria-label="YouTube social embed preview"
        className="flat-section-prototype__social-embed"
        data-flat-social-embed-provider="youtube"
        data-flat-social-player-state={SOCIAL_FIXTURE.playerState}
        data-flat-social-youtube-video-id={SOCIAL_FIXTURE.videoId}
      >
        <section
          aria-label="YouTube thumbnail click target"
          className="flat-section-prototype__social-video"
          data-flat-social-thumbnail-click="show-video"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__social-video-backdrop"
          />
          <button
            type="button"
            aria-label="Play YouTube video"
            className="flat-section-prototype__social-play"
            data-flat-social-action="play-youtube"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-play-button-o"
            />
          </button>
        </section>
        <figcaption className="flat-section-prototype__social-caption">
          <span>{SOCIAL_FIXTURE.caption}</span>
          <code>{SOCIAL_FIXTURE.videoId}</code>
        </figcaption>
      </figure>

      <section
        aria-label="Twitter/X embed route"
        className="flat-section-prototype__social-tweet-route"
        data-flat-social-embed-provider="twitter"
        data-flat-social-twitter-tweet-id={SOCIAL_FIXTURE.tweetId}
      >
        <span className="flat-section-prototype__social-kicker">
          Twitter/X Route
        </span>
        <code>{SOCIAL_FIXTURE.tweetId}</code>
      </section>
    </section>
  );
}

function FlatCodeHeaderActions() {
  return (
    <>
      {CODE_HEADER_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          className="flat-section-prototype__icon-button flat-section-prototype__top-button flat-section-prototype__code-header-action"
          data-flat-code-header-action={action.id}
          data-flat-code-header-action-state={action.state}
        >
          <span
            aria-hidden="true"
            className={`flat-section-prototype__icon-glyph ${action.iconClassName}`}
          />
        </button>
      ))}
    </>
  );
}

function FlatCodeBody() {
  return (
    <section
      className="flat-section-prototype__code"
      data-flat-code="true"
      data-flat-code-access-mode={CODE_FIXTURE.accessMode}
      data-flat-code-attached-terminal-id={CODE_FIXTURE.attachedTerminalId}
      data-flat-code-auto-binding={CODE_FIXTURE.autoBinding}
      data-flat-code-can-run={CODE_FIXTURE.canRun}
      data-flat-code-diagnostics-muted={CODE_FIXTURE.diagnosticsMuted}
      data-flat-code-entry-code-block={CODE_FIXTURE.entryCodeBlock}
      data-flat-code-language={CODE_FIXTURE.language}
      data-flat-code-preview-source={CODE_FIXTURE.previewSource}
      data-flat-code-terminal-visible={CODE_FIXTURE.terminalVisible}
    >
      <section
        aria-label="Code file binding and runtime status"
        className="flat-section-prototype__code-status"
      >
        <label className="flat-section-prototype__code-field flat-section-prototype__code-field--path">
          <span className="flat-section-prototype__code-kicker">File Path</span>
          <input
            aria-label="Code file path"
            className="flat-section-prototype__code-path-input"
            name="code-file-path"
            readOnly
            value={CODE_FIXTURE.filePath}
          />
        </label>
        <label className="flat-section-prototype__code-field flat-section-prototype__code-field--mode">
          <span className="flat-section-prototype__code-kicker">
            Access Mode
          </span>
          <select
            aria-label="Code file access mode"
            className="flat-section-prototype__code-access-select"
            name="code-access-mode"
            defaultValue={CODE_FIXTURE.accessMode}
          >
            <option value={CodeFileAccessModeEnum.read_write}>
              Read &amp; Write
            </option>
            <option value={CodeFileAccessModeEnum.read_only}>Read Only</option>
            <option value={CodeFileAccessModeEnum.write_only}>
              Write Only
            </option>
          </select>
        </label>
        <ol
          aria-label="Code section status"
          className="flat-section-prototype__code-status-list"
        >
          <li data-flat-code-status="language">
            <span>Language</span>
            <b>{CODE_FIXTURE.language}</b>
          </li>
          <li data-flat-code-status="binding">
            <span>Binding</span>
            <b>{CODE_FIXTURE.autoBinding ? "auto" : "manual"}</b>
          </li>
          <li data-flat-code-status="entry">
            <span>Entry</span>
            <b>{CODE_FIXTURE.entryCodeBlock ? "selected" : "available"}</b>
          </li>
        </ol>
      </section>

      <section
        aria-label="Code diagnostics summary"
        className="flat-section-prototype__code-diagnostics"
        data-flat-code-diagnostics-count={CODE_FIXTURE.diagnosticsCount}
        data-flat-code-suppressed-codes={CODE_FIXTURE.suppressedCodes.join(",")}
      >
        <p data-flat-code-diagnostics-state="active">
          <span>Problems</span>
          <b>{CODE_FIXTURE.diagnosticsCount}</b>
        </p>
        <p data-flat-code-diagnostics-state="muted">
          <span>Muted</span>
          <b>{CODE_FIXTURE.diagnosticsMuted ? "on" : "off"}</b>
        </p>
        <p data-flat-code-diagnostics-state="suppressed">
          <span>Suppressed</span>
          <code>{CODE_FIXTURE.suppressedCodes[0]}</code>
        </p>
      </section>

      <section
        aria-label="Code editor"
        className="flat-section-prototype__code-editor"
        data-flat-code-editor="true"
        data-flat-code-editor-language={CODE_FIXTURE.language}
        tabIndex={0}
      >
        <ol className="flat-section-prototype__code-lines">
          {CODE_FIXTURE.lines.map((line) => (
            <li
              key={line.number}
              data-flat-code-diagnostic={line.diagnostic?.severity}
              data-flat-code-diagnostic-code={line.diagnostic?.code}
              data-flat-code-line={line.number}
            >
              <span className="flat-section-prototype__code-line-number">
                {line.number}
              </span>
              <code className="flat-section-prototype__code-line-text">
                {line.text}
              </code>
              {line.diagnostic ? (
                <span className="flat-section-prototype__code-line-diagnostic">
                  {line.diagnostic.message}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label="Attached terminal child"
        className="flat-section-prototype__code-terminal"
        data-flat-code-terminal-child={CODE_FIXTURE.attachedTerminalId}
      >
        <span
          aria-hidden="true"
          className="flat-section-prototype__icon-glyph flat-section-prototype__terminal-glyph"
        />
        <span>Attached terminal</span>
        <code>{CODE_FIXTURE.attachedTerminalId}</code>
        <b>{CODE_FIXTURE.terminalVisible ? "visible" : "hidden"}</b>
      </section>
    </section>
  );
}

function FlatGenPythonCodeHeaderActions() {
  return (
    <>
      {GEN_PYTHON_CODE_HEADER_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          className="flat-section-prototype__icon-button flat-section-prototype__top-button flat-section-prototype__code-header-action"
          data-flat-gen-python-header-action={action.id}
          data-flat-gen-python-header-action-state={action.state}
        >
          <span
            aria-hidden="true"
            className={`flat-section-prototype__icon-glyph ${action.iconClassName}`}
          />
        </button>
      ))}
    </>
  );
}

function FlatGenPythonCodeBody() {
  const prefixLines = GEN_PYTHON_CODE_FIXTURE.lines.filter(
    (line) => line.region === "prefix",
  );
  const generatedLines = GEN_PYTHON_CODE_FIXTURE.lines.filter(
    (line) => line.region === "generated",
  );
  const suffixLines = GEN_PYTHON_CODE_FIXTURE.lines.filter(
    (line) => line.region === "suffix",
  );

  return (
    <section
      className="flat-section-prototype__gen-python"
      data-flat-gen-python-code="true"
      data-flat-gen-python-access-mode={GEN_PYTHON_CODE_FIXTURE.accessMode}
      data-flat-gen-python-attached-terminal-id={
        GEN_PYTHON_CODE_FIXTURE.attachedTerminalId
      }
      data-flat-gen-python-auto-binding={GEN_PYTHON_CODE_FIXTURE.autoBinding}
      data-flat-gen-python-can-run={GEN_PYTHON_CODE_FIXTURE.canRun}
      data-flat-gen-python-codegen-enabled={
        GEN_PYTHON_CODE_FIXTURE.codegenEnabled
      }
      data-flat-gen-python-diagnostics-source={
        GEN_PYTHON_CODE_FIXTURE.diagnosticsSource
      }
      data-flat-gen-python-entry-code-block={
        GEN_PYTHON_CODE_FIXTURE.entryCodeBlock
      }
      data-flat-gen-python-file-binding={GEN_PYTHON_CODE_FIXTURE.filePath}
      data-flat-gen-python-language={GEN_PYTHON_CODE_FIXTURE.language}
      data-flat-gen-python-separator-newlines={
        GEN_PYTHON_CODE_FIXTURE.separatorNewlines
      }
      data-flat-gen-python-terminal-visible={
        GEN_PYTHON_CODE_FIXTURE.terminalVisible
      }
    >
      <section
        aria-label="Generated Python file binding and runtime status"
        className="flat-section-prototype__code-status flat-section-prototype__gen-python-status"
      >
        <label className="flat-section-prototype__code-field flat-section-prototype__code-field--path">
          <span className="flat-section-prototype__code-kicker">
            Generated File
          </span>
          <input
            aria-label="Generated Python file path"
            className="flat-section-prototype__code-path-input"
            name="gen-python-file-path"
            readOnly
            value={GEN_PYTHON_CODE_FIXTURE.filePath}
          />
        </label>
        <label className="flat-section-prototype__code-field flat-section-prototype__code-field--mode">
          <span className="flat-section-prototype__code-kicker">
            Access Mode
          </span>
          <select
            aria-label="Generated Python file access mode"
            className="flat-section-prototype__code-access-select"
            name="gen-python-access-mode"
            defaultValue={GEN_PYTHON_CODE_FIXTURE.accessMode}
          >
            <option value={CodeFileAccessModeEnum.write_only}>
              Write Only
            </option>
            <option value={CodeFileAccessModeEnum.read_only}>Read Only</option>
            <option value={CodeFileAccessModeEnum.read_write}>
              Read &amp; Write
            </option>
          </select>
        </label>
        <ol
          aria-label="Generated Python section status"
          className="flat-section-prototype__code-status-list"
        >
          <li data-flat-gen-python-status="language">
            <span>Language</span>
            <b>{GEN_PYTHON_CODE_FIXTURE.language}</b>
          </li>
          <li data-flat-gen-python-status="binding">
            <span>Binding</span>
            <b>{GEN_PYTHON_CODE_FIXTURE.autoBinding ? "auto" : "manual"}</b>
          </li>
          <li data-flat-gen-python-status="codegen">
            <span>Codegen</span>
            <b>{GEN_PYTHON_CODE_FIXTURE.codegenEnabled ? "enabled" : "off"}</b>
          </li>
        </ol>
      </section>

      <section
        aria-label="Generated Python diagnostics summary"
        className="flat-section-prototype__code-diagnostics flat-section-prototype__gen-python-diagnostics"
        data-flat-gen-python-diagnostics-count={
          GEN_PYTHON_CODE_FIXTURE.diagnosticsCount
        }
      >
        <p data-flat-code-diagnostics-state="active">
          <span>Generated Issues</span>
          <b>{GEN_PYTHON_CODE_FIXTURE.diagnosticsCount}</b>
        </p>
        <p data-flat-code-diagnostics-state="source">
          <span>Source</span>
          <code>{GEN_PYTHON_CODE_FIXTURE.diagnosticsSource}</code>
        </p>
        <p data-flat-code-diagnostics-state="readonly">
          <span>Body</span>
          <b>read-only</b>
        </p>
      </section>

      <section
        aria-label="Generated Python editor"
        className="flat-section-prototype__code-editor flat-section-prototype__gen-python-editor"
        data-flat-gen-python-editor="true"
        data-flat-gen-python-editor-language={GEN_PYTHON_CODE_FIXTURE.language}
        tabIndex={0}
      >
        <FlatGenPythonCodeZone
          editable
          label="Prefix"
          lines={prefixLines}
          zone="prefix"
        />
        <FlatGenPythonCodeZone
          label="Generated read-only"
          lines={generatedLines}
          readonly
          zone="generated"
        />
        <FlatGenPythonCodeZone
          editable
          label="Suffix"
          lines={suffixLines}
          zone="suffix"
        />
      </section>

      <section
        aria-label="Attached generated Python terminal child"
        className="flat-section-prototype__code-terminal flat-section-prototype__gen-python-terminal"
        data-flat-gen-python-terminal-child={
          GEN_PYTHON_CODE_FIXTURE.attachedTerminalId
        }
      >
        <span
          aria-hidden="true"
          className="flat-section-prototype__icon-glyph flat-section-prototype__terminal-glyph"
        />
        <span>Attached terminal</span>
        <code>{GEN_PYTHON_CODE_FIXTURE.attachedTerminalId}</code>
        <b>{GEN_PYTHON_CODE_FIXTURE.terminalVisible ? "visible" : "hidden"}</b>
      </section>
    </section>
  );
}

function FlatGenPythonCodeZone({
  editable = false,
  label,
  lines,
  readonly = false,
  zone,
}: {
  editable?: boolean;
  label: string;
  lines: FlatGenPythonCodeEditorLine[];
  readonly?: boolean;
  zone: FlatGenPythonCodeEditorLine["region"];
}) {
  return (
    <section
      aria-label={`Generated Python ${zone} region`}
      className="flat-section-prototype__gen-python-zone"
      data-flat-gen-python-editable={editable || undefined}
      data-flat-gen-python-readonly={readonly || undefined}
      data-flat-gen-python-zone={zone}
    >
      <header className="flat-section-prototype__gen-python-zone-header">
        <span>{label}</span>
        <b>{readonly ? "protected" : "editable"}</b>
      </header>
      <ol className="flat-section-prototype__code-lines flat-section-prototype__gen-python-lines">
        {lines.map((line) => (
          <li
            key={`${zone}-${line.number}`}
            data-flat-code-diagnostic={line.diagnostic?.severity}
            data-flat-code-diagnostic-code={line.diagnostic?.code}
            data-flat-gen-python-line={line.number}
            data-flat-gen-python-line-region={line.region}
          >
            <span className="flat-section-prototype__code-line-number">
              {line.number}
            </span>
            <code className="flat-section-prototype__code-line-text">
              {line.text}
            </code>
            {line.diagnostic ? (
              <span className="flat-section-prototype__code-line-diagnostic">
                {line.diagnostic.message}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FlatGenPythonMetadataBody() {
  return (
    <section
      className="flat-section-prototype__gen-python-metadata"
      data-flat-gen-python-metadata="true"
      data-flat-gen-python-metadata-access-mode={
        GEN_PYTHON_METADATA_FIXTURE.accessMode
      }
      data-flat-gen-python-metadata-auto-binding={
        GEN_PYTHON_METADATA_FIXTURE.autoBinding
      }
      data-flat-gen-python-metadata-enabled={
        GEN_PYTHON_METADATA_FIXTURE.metadataEnabled
      }
      data-flat-gen-python-metadata-file-binding={
        GEN_PYTHON_METADATA_FIXTURE.filePath
      }
      data-flat-gen-python-metadata-language={
        GEN_PYTHON_METADATA_FIXTURE.language
      }
      data-flat-gen-python-metadata-readonly={
        GEN_PYTHON_METADATA_FIXTURE.readonly
      }
      data-flat-gen-python-metadata-section-count={
        GEN_PYTHON_METADATA_FIXTURE.sectionCount
      }
    >
      <section
        aria-label="Generated Python metadata status"
        className="flat-section-prototype__code-status flat-section-prototype__gen-python-metadata-status"
      >
        <div className="flat-section-prototype__code-field flat-section-prototype__code-field--path">
          <span className="flat-section-prototype__code-kicker">
            Metadata File
          </span>
          <code className="flat-section-prototype__code-path-value">
            {GEN_PYTHON_METADATA_FIXTURE.filePath}
          </code>
        </div>
        <ol
          aria-label="Generated Python metadata section status"
          className="flat-section-prototype__code-status-list"
        >
          <li data-flat-gen-python-metadata-status="language">
            <span>Language</span>
            <b>{GEN_PYTHON_METADATA_FIXTURE.language}</b>
          </li>
          <li data-flat-gen-python-metadata-status="metadata">
            <span>Metadata</span>
            <b>
              {GEN_PYTHON_METADATA_FIXTURE.metadataEnabled ? "enabled" : "off"}
            </b>
          </li>
          <li data-flat-gen-python-metadata-status="access">
            <span>Binding</span>
            <b>{GEN_PYTHON_METADATA_FIXTURE.accessMode}</b>
          </li>
          <li data-flat-gen-python-metadata-status="body">
            <span>Body</span>
            <b>{GEN_PYTHON_METADATA_FIXTURE.readonly ? "read-only" : "edit"}</b>
          </li>
          <li data-flat-gen-python-metadata-status="sections">
            <span>Sections</span>
            <b>{GEN_PYTHON_METADATA_FIXTURE.sectionCount}</b>
          </li>
        </ol>
      </section>

      <section
        aria-label="Generated Python metadata editor"
        className="flat-section-prototype__code-editor flat-section-prototype__gen-python-metadata-editor"
        data-flat-gen-python-metadata-editor="readonly"
        data-flat-gen-python-metadata-editor-language={
          GEN_PYTHON_METADATA_FIXTURE.language
        }
        tabIndex={0}
      >
        <ol
          aria-label="Generated Python metadata code lines"
          className="flat-section-prototype__code-lines flat-section-prototype__gen-python-metadata-lines"
        >
          {GEN_PYTHON_METADATA_FIXTURE.lines.map((line) => (
            <li
              key={`${line.kind}-${line.number}`}
              data-flat-gen-python-metadata-line={line.number}
              data-flat-gen-python-metadata-line-kind={line.kind}
            >
              <span className="flat-section-prototype__code-line-number">
                {line.number}
              </span>
              <code className="flat-section-prototype__code-line-text">
                {line.text}
              </code>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function FlatTerminalBody() {
  return (
    <section
      className="flat-section-prototype__terminal"
      data-flat-terminal="true"
      data-flat-terminal-access={TERMINAL_FIXTURE.access}
      data-flat-terminal-cols={TERMINAL_FIXTURE.cols}
      data-flat-terminal-context={TERMINAL_FIXTURE.context}
      data-flat-terminal-rows={TERMINAL_FIXTURE.rows}
      data-flat-terminal-scrollback-lines={TERMINAL_FIXTURE.scrollbackLines}
      data-flat-terminal-section-id={TERMINAL_FIXTURE.sectionId}
      data-flat-terminal-session-mode={TERMINAL_FIXTURE.sessionMode}
      data-flat-terminal-status={TERMINAL_FIXTURE.status}
    >
      <section
        aria-label="Terminal session status"
        className="flat-section-prototype__terminal-status"
      >
        <p data-flat-terminal-status-item="connection">
          <span>Connection</span>
          <b>{TERMINAL_FIXTURE.status}</b>
        </p>
        <p data-flat-terminal-status-item="mode">
          <span>Mode</span>
          <b>{TERMINAL_FIXTURE.sessionMode}</b>
        </p>
        <p data-flat-terminal-status-item="access">
          <span>Input</span>
          <b>{TERMINAL_FIXTURE.access}</b>
        </p>
        <p data-flat-terminal-status-item="geometry">
          <span>Fit</span>
          <b>
            {TERMINAL_FIXTURE.cols}x{TERMINAL_FIXTURE.rows}
          </b>
        </p>
      </section>

      <section
        aria-label="Read/write terminal surface"
        className="flat-section-prototype__terminal-surface"
        data-flat-terminal-surface="xterm"
        data-section-main-editor
        tabIndex={0}
      >
        <ol
          aria-label="Terminal scrollback"
          className="flat-section-prototype__terminal-lines"
        >
          {TERMINAL_FIXTURE.lines.map((line) => (
            <li
              key={line.id}
              data-flat-terminal-line={line.id}
              data-flat-terminal-line-kind={line.kind}
            >
              {line.prompt ? (
                <span className="flat-section-prototype__terminal-prompt">
                  {line.prompt}
                </span>
              ) : null}
              <code>{line.text}</code>
            </li>
          ))}
        </ol>
        <p
          className="flat-section-prototype__terminal-input"
          data-flat-terminal-active-input="true"
        >
          <span className="flat-section-prototype__terminal-prompt">
            {TERMINAL_FIXTURE.prompt}
          </span>
          <code>{TERMINAL_FIXTURE.activeInput}</code>
          <span
            aria-hidden="true"
            className="flat-section-prototype__terminal-cursor"
          />
        </p>
      </section>
    </section>
  );
}

function FlatIFrameBody() {
  return (
    <section
      className="flat-section-prototype__iframe"
      data-flat-iframe="true"
      data-flat-iframe-code={IFRAME_FIXTURE.code}
      data-flat-iframe-default-size={IFRAME_FIXTURE.defaultSize}
      data-flat-iframe-resize-mode={IFRAME_FIXTURE.resizeMode}
      data-flat-iframe-src={IFRAME_FIXTURE.src}
      data-flat-iframe-title={IFRAME_FIXTURE.iframeTitle}
      data-flat-iframe-validation={IFRAME_FIXTURE.validationState}
    >
      <section
        aria-label="Iframe source status"
        className="flat-section-prototype__iframe-status"
      >
        <p data-flat-iframe-status-item="source">
          <span>Source</span>
          <code>{IFRAME_FIXTURE.src}</code>
        </p>
        <p data-flat-iframe-status-item="validation">
          <span>Validation</span>
          <b>valid iframe</b>
        </p>
        <p data-flat-iframe-status-item="resize">
          <span>Resize</span>
          <b>fills section</b>
        </p>
      </section>

      <figure
        aria-label="Rendered iframe embed"
        className="flat-section-prototype__iframe-preview"
        data-flat-iframe-preview="rendered"
      >
        <iframe
          className="flat-section-prototype__iframe-frame"
          data-flat-iframe-frame="true"
          srcDoc={IFRAME_FIXTURE.srcDoc}
          title={IFRAME_FIXTURE.iframeTitle}
        />
        <figcaption className="flat-section-prototype__iframe-caption">
          <span>Title</span>
          <code>{IFRAME_FIXTURE.iframeTitle}</code>
        </figcaption>
      </figure>
    </section>
  );
}

function FlatChatBody() {
  return (
    <section
      className="flat-section-prototype__chat"
      data-flat-chat="true"
      data-flat-chat-active-branch-id={CHAT_FIXTURE.activeBranchId}
      data-flat-chat-agent-profile-id={CHAT_FIXTURE.agentProfileId}
      data-flat-chat-branch-count={CHAT_FIXTURE.branchCount}
      data-flat-chat-chat-id={CHAT_FIXTURE.chatId}
      data-flat-chat-dictation-mode={CHAT_FIXTURE.dictationMode}
      data-flat-chat-engine-config-id={CHAT_FIXTURE.engineConfigId}
      data-flat-chat-engine-type={CHAT_FIXTURE.engineType}
      data-flat-chat-managed={CHAT_FIXTURE.managed}
      data-flat-chat-permission-mode={CHAT_FIXTURE.permissionMode}
      data-flat-chat-search-enabled={CHAT_FIXTURE.searchEnabled}
      data-flat-chat-thinking={CHAT_FIXTURE.thinking}
      data-flat-chat-waiting-for-response={CHAT_FIXTURE.waitingForResponse}
    >
      <section
        aria-label="Chat thread and execution state"
        className="flat-section-prototype__chat-threadbar"
      >
        <p data-flat-chat-thread="active">
          <span>Chat</span>
          <b>{CHAT_FIXTURE.chatId}</b>
        </p>
        <p data-flat-chat-thread="engine">
          <span>Engine</span>
          <b>Setta LLM</b>
        </p>
        <p data-flat-chat-thread="status">
          <span>Status</span>
          <b>{CHAT_FIXTURE.waitingForResponse ? "Waiting" : "Ready"}</b>
        </p>
        <nav
          aria-label="Managed chat thread controls"
          className="flat-section-prototype__chat-thread-actions"
        >
          <button type="button" data-flat-chat-action="history">
            History
          </button>
          <button type="button" data-flat-chat-action="new-chat">
            New Chat
          </button>
        </nav>
      </section>

      <section
        aria-label="Chat execution settings"
        className="flat-section-prototype__chat-settings"
      >
        <p
          data-flat-chat-setting="permission"
          data-flat-chat-setting-value={CHAT_FIXTURE.permissionMode}
        >
          <span>Perm</span>
          <b>{CHAT_FIXTURE.permissionMode}</b>
        </p>
        <p
          data-flat-chat-setting="search"
          data-flat-chat-setting-value={String(CHAT_FIXTURE.searchEnabled)}
        >
          <span>Search</span>
          <b>{CHAT_FIXTURE.searchEnabled ? "on" : "off"}</b>
        </p>
        <p
          data-flat-chat-setting="thinking"
          data-flat-chat-setting-value={String(CHAT_FIXTURE.thinking)}
        >
          <span>Thinking</span>
          <b>{CHAT_FIXTURE.thinking ? "on" : "off"}</b>
        </p>
        <p
          data-flat-chat-setting="dictation"
          data-flat-chat-setting-value={CHAT_FIXTURE.dictationMode}
        >
          <span>Dictation</span>
          <b>{CHAT_FIXTURE.dictationMode}</b>
        </p>
        <p
          data-flat-chat-setting="context"
          data-flat-chat-context-estimated={
            CHAT_FIXTURE.contextUsageIsEstimated
          }
        >
          <span>Context</span>
          <b>
            {CHAT_FIXTURE.contextUsedTokens} /{" "}
            {CHAT_FIXTURE.contextWindowTokens}
          </b>
        </p>
      </section>

      <section
        aria-label="Chat edge scope handles"
        className="flat-section-prototype__chat-scope"
      >
        <p
          data-flat-agentic-edge-kind="chat_chat"
          data-flat-chat-edge-handle="target"
          data-flat-chat-scope-targets={CHAT_FIXTURE.scopeTargets}
        >
          <b aria-hidden="true" />
          <span>scope target</span>
        </p>
        <p
          data-flat-agentic-edge-kind="chat_section"
          data-flat-chat-edge-handle="source"
          data-flat-chat-scope-sources={CHAT_FIXTURE.scopeSources}
        >
          <span>scope source</span>
          <b aria-hidden="true" />
        </p>
      </section>

      <section
        aria-label="Chat message transcript"
        className="flat-section-prototype__chat-transcript"
        data-flat-chat-transcript="scroll"
      >
        <ol className="flat-section-prototype__chat-message-list">
          {CHAT_FIXTURE.messages.map((message) => (
            <li
              key={message.id}
              className="flat-section-prototype__chat-message"
              data-flat-chat-message={message.id}
              data-flat-chat-message-streaming={message.streaming || undefined}
              data-flat-chat-role={message.role}
            >
              <header className="flat-section-prototype__chat-message-header">
                <span>{message.label}</span>
                <b>{message.meta}</b>
                {message.branchLabel ? (
                  <code data-flat-chat-branch-switch={message.branchLabel}>
                    {message.branchLabel}
                  </code>
                ) : null}
              </header>
              <p>{message.text}</p>
              {message.attachmentName ? (
                <p
                  className="flat-section-prototype__chat-attachment"
                  data-flat-chat-attachment={message.attachmentName}
                >
                  <span
                    aria-hidden="true"
                    className="flat-section-prototype__chat-attachment-glyph"
                  />
                  <code>{message.attachmentName}</code>
                </p>
              ) : null}
              {message.toolCallId ? (
                <p
                  className="flat-section-prototype__chat-tool-call"
                  data-flat-chat-tool-call={message.toolCallId}
                  data-flat-chat-tool-name={message.toolName}
                >
                  <span>Tool</span>
                  <code>{message.toolName}</code>
                </p>
              ) : null}
            </li>
          ))}
        </ol>

        <ol
          aria-label="Active tool-call arguments"
          className="flat-section-prototype__chat-tool-arguments"
        >
          {CHAT_FIXTURE.toolCallArguments.map((entry) => (
            <li
              key={entry.id}
              data-flat-chat-tool-argument={entry.id}
              data-flat-chat-tool-argument-name={entry.toolName}
            >
              <span>{entry.toolName}</span>
              <code>{entry.value}</code>
            </li>
          ))}
        </ol>
      </section>

      <form
        aria-label="Chat composer"
        className="flat-section-prototype__chat-composer"
        data-flat-chat-composer="true"
      >
        <textarea
          aria-label="Chat message draft"
          name="chat-message-draft"
          readOnly
          value={CHAT_FIXTURE.inputText}
        />
        <section
          aria-label="Chat composer controls"
          className="flat-section-prototype__chat-composer-controls"
        >
          <button
            type="button"
            aria-label="Attach file"
            data-flat-chat-composer-action="attach"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__chat-attachment-glyph"
            />
          </button>
          <button
            type="button"
            aria-label="Start dictation"
            data-flat-chat-composer-action="dictation"
            data-flat-chat-dictation-mode={CHAT_FIXTURE.dictationMode}
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__chat-mic-glyph"
            />
          </button>
          <p
            data-flat-chat-slash-commands={CHAT_FIXTURE.slashCommands.join(" ")}
          >
            <span>Slash</span>
            <code>{CHAT_FIXTURE.slashCommands.join(" ")}</code>
          </p>
          <button
            type="button"
            aria-label="Stop chat response"
            data-flat-chat-composer-action="stop"
          >
            <span
              aria-hidden="true"
              className="flat-section-prototype__icon-glyph gg-shape-square"
            />
          </button>
        </section>
      </form>
    </section>
  );
}

function FlatBrowserViewModeButton({
  mode,
  label,
}: {
  mode: (typeof BrowserAreaViewModeEnum)[keyof typeof BrowserAreaViewModeEnum];
  label: string;
}) {
  const isActive = BROWSER_FIXTURE.viewMode === mode;
  return (
    <button
      type="button"
      aria-label={`${label} view`}
      aria-pressed={isActive}
      className="flat-section-prototype__browser-view-button"
      data-flat-browser-view-active={isActive || undefined}
      data-flat-browser-view-option={mode}
    >
      {label}
    </button>
  );
}

function FlatBrowserItemRow({ item }: { item: FlatBrowserItem }) {
  return (
    <li
      className="flat-section-prototype__browser-row"
      data-flat-browser-item={item.fullPath}
      data-flat-browser-item-draggable={item.draggable || undefined}
      data-flat-browser-item-droppable={item.droppable || undefined}
      data-flat-browser-item-expanded={item.expanded || undefined}
      data-flat-browser-item-kind={item.type}
      data-flat-browser-item-preview-kind={item.previewKind}
      data-flat-browser-item-selected={item.selected || undefined}
    >
      {item.type === "folder" ? (
        <button
          type="button"
          aria-label={`${item.expanded ? "Collapse" : "Expand"} ${item.name}`}
          className="flat-section-prototype__browser-row-toggle"
          data-flat-browser-folder-toggle={item.fullPath}
          data-flat-browser-folder-toggle-state={
            item.expanded ? "expanded" : "collapsed"
          }
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__browser-toggle-glyph"
          />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="flat-section-prototype__browser-row-spacer"
        />
      )}
      <button
        type="button"
        aria-label={`Open ${item.name}`}
        className="flat-section-prototype__browser-row-main"
        data-flat-browser-row-open="double-click"
        draggable={item.draggable}
        style={{ paddingLeft: `${item.depth * 0.75}rem` }}
      >
        <span
          aria-hidden="true"
          className="flat-section-prototype__browser-row-icon"
          data-flat-browser-row-icon={item.previewKind}
        />
        <span className="flat-section-prototype__browser-row-name">
          {item.name}
        </span>
        {item.status ? (
          <code className="flat-section-prototype__browser-row-status">
            {item.status}
          </code>
        ) : null}
      </button>
      <span className="flat-section-prototype__browser-row-date">
        {item.modifiedLabel}
      </span>
    </li>
  );
}

function FlatBrowserBody() {
  return (
    <section
      className="flat-section-prototype__browser"
      data-flat-browser="true"
      data-flat-browser-allow-outside-workspace-root={
        BROWSER_FIXTURE.allowOutsideWorkspaceRoot
      }
      data-flat-browser-column-width={BROWSER_FIXTURE.columnWidth}
      data-flat-browser-filter-text={BROWSER_FIXTURE.filterText}
      data-flat-browser-folder={BROWSER_FIXTURE.folder}
      data-flat-browser-hide-column={BROWSER_FIXTURE.hideColumn}
      data-flat-browser-ignore-patterns={BROWSER_FIXTURE.ignorePatterns.join(
        ",",
      )}
      data-flat-browser-loaded-via={BROWSER_FIXTURE.loadedVia}
      data-flat-browser-missing-folder-behavior={
        BROWSER_FIXTURE.missingFolderBehavior
      }
      data-flat-browser-path-separator={BROWSER_FIXTURE.pathSeparator}
      data-flat-browser-root-path={BROWSER_FIXTURE.rootPath}
      data-flat-browser-search-scope={BROWSER_FIXTURE.searchScope}
      data-flat-browser-sort-key={BROWSER_FIXTURE.sortKey}
      data-flat-browser-types-column-width={BROWSER_FIXTURE.typesColumnWidth}
      data-flat-browser-view-mode={BROWSER_FIXTURE.viewMode}
    >
      <aside
        aria-label="Browser filters and saved searches"
        className="flat-section-prototype__browser-filters"
        data-flat-browser-filters-visible={!BROWSER_FIXTURE.hideColumn}
      >
        <header className="flat-section-prototype__browser-filters-header">
          <b>Filters</b>
          <button
            type="button"
            aria-label="Select all Browser type filters"
            data-flat-browser-type-filter-action="select-all"
          >
            Select All
          </button>
        </header>
        <ol
          aria-label="Browser type filters"
          className="flat-section-prototype__browser-type-list"
        >
          {BROWSER_FIXTURE.typeFilters.map((filter) => (
            <li key={filter.id}>
              <button
                type="button"
                aria-label={`${filter.label} filter`}
                aria-pressed={filter.active}
                data-flat-browser-type-filter={filter.id}
                data-flat-browser-type-filter-active={
                  filter.active || undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="flat-section-prototype__browser-type-icon"
                  data-flat-browser-type-icon={filter.id}
                />
                <span>{filter.label}</span>
                <b>{filter.count}</b>
              </button>
            </li>
          ))}
        </ol>
        <section
          aria-label="Browser saved searches"
          className="flat-section-prototype__browser-saved"
        >
          <p>Saved searches</p>
          <ol>
            {BROWSER_FIXTURE.savedSearches.map((search) => (
              <li key={search.id}>
                <button
                  type="button"
                  aria-label={`Apply saved search ${search.name}`}
                  aria-pressed={search.active}
                  data-flat-browser-saved-search={search.id}
                  data-flat-browser-saved-search-active={
                    search.active || undefined
                  }
                  data-flat-browser-saved-search-query={search.query}
                  data-flat-browser-saved-search-scope={search.searchScope}
                >
                  <span
                    aria-hidden="true"
                    className="flat-section-prototype__browser-saved-color"
                    style={{ backgroundColor: search.color }}
                  />
                  <span>{search.name}</span>
                  <code>{search.quickInfo}</code>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <span
          aria-hidden="true"
          className="flat-section-prototype__browser-rail-resize"
          data-flat-browser-column-resize="types"
        />
      </aside>

      <section
        aria-label="Browser file explorer"
        className="flat-section-prototype__browser-main"
      >
        <section
          aria-label="Browser path, filter, and view controls"
          className="flat-section-prototype__browser-toolbar"
        >
          <nav
            aria-label="Browser folder history"
            className="flat-section-prototype__browser-history"
          >
            <button type="button" aria-label="Go back" disabled>
              <span
                aria-hidden="true"
                className="flat-section-prototype__browser-history-glyph flat-section-prototype__browser-history-glyph--back"
              />
            </button>
            <button type="button" aria-label="Go forward" disabled>
              <span
                aria-hidden="true"
                className="flat-section-prototype__browser-history-glyph flat-section-prototype__browser-history-glyph--forward"
              />
            </button>
            <button
              type="button"
              aria-label="Go up"
              data-flat-browser-action="go-up"
            >
              <span
                aria-hidden="true"
                className="flat-section-prototype__browser-history-glyph flat-section-prototype__browser-history-glyph--up"
              />
            </button>
          </nav>
          <label className="flat-section-prototype__browser-path-field">
            <span>Path</span>
            <input
              aria-label="Browser folder path"
              name="browser-folder-path"
              readOnly
              value={BROWSER_FIXTURE.folder}
            />
          </label>
          <label className="flat-section-prototype__browser-filter-field">
            <span>Filter</span>
            <input
              aria-label="Browser filter"
              name="browser-filter"
              readOnly
              value={BROWSER_FIXTURE.filterText}
            />
          </label>
          <button
            type="button"
            aria-label="Save Browser search"
            className="flat-section-prototype__browser-save-search"
            data-flat-browser-action="save-search"
          >
            Save
          </button>
          <nav
            aria-label="Browser view mode"
            className="flat-section-prototype__browser-view"
          >
            <FlatBrowserViewModeButton
              mode={BrowserAreaViewModeEnum.list}
              label="List"
            />
            <FlatBrowserViewModeButton
              mode={BrowserAreaViewModeEnum.thumbnail}
              label="Thumbnail"
            />
            <FlatBrowserViewModeButton
              mode={BrowserAreaViewModeEnum.carousel}
              label="Carousel"
            />
          </nav>
        </section>

        <nav
          aria-label="Browser breadcrumbs"
          className="flat-section-prototype__browser-breadcrumbs"
        >
          {BROWSER_FIXTURE.breadcrumbs.map((crumb, index) => (
            <button
              key={crumb.path}
              type="button"
              aria-current={
                index === BROWSER_FIXTURE.breadcrumbs.length - 1
                  ? "page"
                  : undefined
              }
              data-flat-browser-breadcrumb={crumb.path}
            >
              {crumb.label}
            </button>
          ))}
        </nav>

        <section
          aria-label="Browser list view"
          className="flat-section-prototype__browser-list"
          data-flat-browser-list="true"
        >
          <header
            aria-label="Browser list columns"
            className="flat-section-prototype__browser-list-header"
          >
            <button
              type="button"
              aria-label="Sort by name (A to Z)"
              data-flat-browser-sort-column="name"
              data-flat-browser-sort-direction={BROWSER_FIXTURE.sortDirection}
            >
              Files
            </button>
            <span
              aria-hidden="true"
              className="flat-section-prototype__browser-list-resize"
              data-flat-browser-column-resize="files"
            />
            <button
              type="button"
              aria-label="Sort by date modified (newest to oldest)"
              data-flat-browser-sort-column="modified"
            >
              Date modified
            </button>
          </header>
          <ol
            aria-label="Browser folder items"
            className="flat-section-prototype__browser-rows"
            data-flat-browser-visible-item-count={BROWSER_FIXTURE.items.length}
          >
            {BROWSER_FIXTURE.items.map((item) => (
              <FlatBrowserItemRow key={item.id} item={item} />
            ))}
          </ol>
        </section>
      </section>
    </section>
  );
}

function FlatPluginBody() {
  return (
    <section
      className="flat-section-prototype__plugin"
      data-flat-plugin="true"
      data-flat-plugin-effective-capabilities={PLUGIN_FIXTURE.effectiveCapabilities.join(
        ",",
      )}
      data-flat-plugin-kind={PLUGIN_FIXTURE.kind}
      data-flat-plugin-plugin-id={PLUGIN_FIXTURE.pluginId}
      data-flat-plugin-read-only={PLUGIN_FIXTURE.readOnly}
      data-flat-plugin-schema-version={PLUGIN_FIXTURE.schemaVersion}
      data-flat-plugin-section-id={PLUGIN_FIXTURE.sectionId}
      data-flat-plugin-server-mode={PLUGIN_FIXTURE.serverMode}
      data-flat-plugin-section-type={SectionTypeEnum.Plugin}
    >
      <section
        aria-label="Plugin runtime host"
        className="flat-section-prototype__plugin-host"
      >
        <p data-flat-plugin-host-field="pluginId">
          <span>pluginId</span>
          <code>{PLUGIN_FIXTURE.pluginId}</code>
        </p>
        <p data-flat-plugin-host-field="kind">
          <span>kind</span>
          <code>{PLUGIN_FIXTURE.kind}</code>
        </p>
        <p data-flat-plugin-host-field="schemaVersion">
          <span>schema</span>
          <b>{PLUGIN_FIXTURE.schemaVersion}</b>
        </p>
        <p data-flat-plugin-host-field="serverMode">
          <span>mode</span>
          <b>{PLUGIN_FIXTURE.serverMode}</b>
        </p>
        <p data-flat-plugin-host-field="capabilities">
          <span>capabilities</span>
          <code>{PLUGIN_FIXTURE.effectiveCapabilities.join(" + ")}</code>
        </p>
      </section>

      <section
        aria-label="Mounted plugin renderer"
        className="flat-section-prototype__plugin-mount"
        data-flat-plugin-renderer="mounted"
        data-flat-plugin-renderer-description={PLUGIN_FIXTURE.description}
        data-flat-plugin-renderer-lifecycle={PLUGIN_FIXTURE.lifecycle.join(",")}
        data-flat-plugin-renderer-title={PLUGIN_FIXTURE.title}
      >
        <article
          className="flat-section-prototype__plugin-renderer"
          data-flat-plugin-renderer-kind={PLUGIN_FIXTURE.kind}
          data-flat-plugin-renderer-read-only={PLUGIN_FIXTURE.readOnly}
        >
          <header className="flat-section-prototype__plugin-renderer-header">
            <h3>{PLUGIN_FIXTURE.title}</h3>
            <span
              className="flat-section-prototype__plugin-mode"
              data-flat-plugin-renderer-mode={PLUGIN_FIXTURE.serverMode}
            >
              mode:{PLUGIN_FIXTURE.serverMode}
            </span>
          </header>
          <p
            className="flat-section-prototype__plugin-details"
            data-flat-plugin-data-field="details"
          >
            {PLUGIN_FIXTURE.data.details}
          </p>
          <ol
            aria-label="Plugin renderer stats"
            className="flat-section-prototype__plugin-stats"
          >
            {PLUGIN_FIXTURE.stats.map((stat) => (
              <li
                key={stat.id}
                data-flat-plugin-renderer-stat={stat.id}
                data-flat-plugin-renderer-stat-source={stat.source}
              >
                <span>{stat.label}</span>
                <b>{stat.value}</b>
              </li>
            ))}
          </ol>
          <nav
            aria-label="Plugin renderer controls"
            className="flat-section-prototype__plugin-controls"
          >
            <button type="button" data-flat-plugin-renderer-action="toggle-pin">
              Pin
            </button>
            <button
              type="button"
              data-flat-plugin-renderer-action="save-pulse"
              data-flat-plugin-update-section="data.pulses"
            >
              Save Pulse
            </button>
            <button
              type="button"
              data-flat-plugin-renderer-action="local-click"
              data-flat-plugin-local-state="true"
            >
              Local Click
            </button>
          </nav>
          <ol
            aria-label="Plugin renderer tags"
            className="flat-section-prototype__plugin-tags"
            data-flat-plugin-data-field="tags"
          >
            {PLUGIN_FIXTURE.data.tags.map((tag) => (
              <li key={tag} data-flat-plugin-tag={tag}>
                {tag}
              </li>
            ))}
          </ol>
        </article>
      </section>
    </section>
  );
}

function getFlatTaskBoardTasksForColumn(columnId: string): FlatTaskBoardTask[] {
  return TASK_BOARD_FIXTURE.tasks.filter((task) => task.columnId === columnId);
}

function FlatTaskBoardViewModeButton({
  mode,
  label,
}: {
  mode: (typeof TaskBoardViewModeEnum)[keyof typeof TaskBoardViewModeEnum];
  label: string;
}) {
  const isActive = TASK_BOARD_FIXTURE.viewMode === mode;

  return (
    <button
      type="button"
      aria-label={`${label} view`}
      aria-pressed={isActive}
      data-flat-task-board-view-active={isActive || undefined}
      data-flat-task-board-view-option={mode}
    >
      {label}
    </button>
  );
}

function FlatTaskBoardTaskCard({ task }: { task: FlatTaskBoardTask }) {
  return (
    <li
      className="flat-section-prototype__task-board-task"
      data-flat-task-board-task={task.id}
      data-flat-task-board-task-column={task.columnId}
      data-flat-task-board-task-completed={task.completed}
      data-flat-task-board-task-due={task.dueDateIso || undefined}
      data-flat-task-board-task-recurrence={task.recurrence}
      data-flat-task-board-task-sort-index={task.sortIndex}
    >
      <div className="flat-section-prototype__task-board-task-main">
        <button
          type="button"
          aria-label={`Drag task ${task.title}`}
          className="flat-section-prototype__task-board-task-drag"
          data-flat-task-board-task-drag="true"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__task-board-drag-glyph"
          />
        </button>
        <input
          type="checkbox"
          aria-label={`Mark ${task.title} done`}
          checked={task.completed}
          className="flat-section-prototype__task-board-checkbox"
          readOnly
        />
        <input
          aria-label={`${task.title} title`}
          className="flat-section-prototype__task-board-title-input"
          readOnly
          value={task.title}
        />
        <button
          type="button"
          aria-label={`Task schedule settings for ${task.title}`}
          className="flat-section-prototype__task-board-card-action"
          data-flat-task-board-task-action="schedule"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-calendar-dates"
          />
        </button>
        <button
          type="button"
          aria-label={`Toggle description for ${task.title}`}
          className="flat-section-prototype__task-board-card-action"
          data-flat-task-board-task-action="description"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-list"
          />
        </button>
        <button
          type="button"
          aria-label={`Remove task ${task.title}`}
          className="flat-section-prototype__task-board-card-action"
          data-flat-task-board-task-action="remove"
        >
          <span
            aria-hidden="true"
            className="flat-section-prototype__icon-glyph gg-trash"
          />
        </button>
      </div>
      {task.description.trim() !== "" ? (
        <p
          className="flat-section-prototype__task-board-description"
          data-flat-task-board-task-description={task.id}
        >
          {task.description}
        </p>
      ) : null}
      {task.dueSummary || task.recurrenceSummary ? (
        <dl className="flat-section-prototype__task-board-schedule">
          {task.dueSummary ? (
            <div data-flat-task-board-schedule-field="due">
              <dt>Due</dt>
              <dd>{task.dueSummary}</dd>
            </div>
          ) : null}
          {task.recurrenceSummary ? (
            <div data-flat-task-board-schedule-field="repeat">
              <dt>Repeat</dt>
              <dd>{task.recurrenceSummary}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}

function FlatTaskBoardLane({
  column,
  index,
}: {
  column: FlatTaskBoardColumn;
  index: number;
}) {
  const tasks = getFlatTaskBoardTasksForColumn(column.id);
  const previousColumn = TASK_BOARD_FIXTURE.columns[index - 1];

  return (
    <div className="flat-section-prototype__task-board-lane-frame">
      {previousColumn ? (
        <span
          aria-hidden="true"
          className="flat-section-prototype__task-board-column-resize"
          data-flat-task-board-column-resize={`${previousColumn.id}:${column.id}`}
        />
      ) : null}
      <article
        className="flat-section-prototype__task-board-lane"
        data-flat-task-board-column={column.id}
        data-flat-task-board-column-color={column.color}
        data-flat-task-board-column-sort-index={column.sortIndex}
      >
        <header className="flat-section-prototype__task-board-lane-header">
          <button
            type="button"
            aria-label={`${column.name} column color`}
            className="flat-section-prototype__task-board-color"
            data-flat-task-board-column-color-control={column.id}
            style={{ backgroundColor: column.color }}
          />
          <input
            aria-label={`${column.name} column name`}
            className="flat-section-prototype__task-board-column-name"
            readOnly
            value={column.name}
          />
          <b aria-label={`${tasks.length} tasks`}>{tasks.length}</b>
        </header>
        <ol
          aria-label={`${column.name} tasks`}
          className="flat-section-prototype__task-board-task-list"
          data-flat-task-board-lane-task-count={tasks.length}
        >
          {tasks.map((task) => (
            <FlatTaskBoardTaskCard key={task.id} task={task} />
          ))}
        </ol>
        <button
          type="button"
          aria-label={`Add task to ${column.name}`}
          className="flat-section-prototype__task-board-lane-add"
          data-flat-task-board-lane-action="add-task"
          data-flat-task-board-lane-action-column={column.id}
        >
          Task
        </button>
      </article>
    </div>
  );
}

function FlatTaskBoardBody() {
  return (
    <section
      className="flat-section-prototype__task-board"
      data-flat-task-board="true"
      data-flat-task-board-column-count={TASK_BOARD_FIXTURE.columns.length}
      data-flat-task-board-editable={TASK_BOARD_FIXTURE.editable}
      data-flat-task-board-section-type={SectionTypeEnum.TaskBoard}
      data-flat-task-board-task-count={TASK_BOARD_FIXTURE.tasks.length}
      data-flat-task-board-view-mode={TASK_BOARD_FIXTURE.viewMode}
    >
      <section
        aria-label="Task board controls"
        className="flat-section-prototype__task-board-toolbar"
      >
        <nav
          aria-label="Task board view mode"
          className="flat-section-prototype__task-board-view"
        >
          <FlatTaskBoardViewModeButton
            mode={TaskBoardViewModeEnum.task_list}
            label="Task List"
          />
          <FlatTaskBoardViewModeButton
            mode={TaskBoardViewModeEnum.kanban}
            label="Kanban"
          />
        </nav>
        <label className="flat-section-prototype__task-board-new-task">
          <span>Task</span>
          <input
            aria-label="New task title"
            name="task-board-new-task-title"
            readOnly
            value={TASK_BOARD_FIXTURE.newTaskTitle}
          />
        </label>
        <button
          type="button"
          aria-label="Add task"
          className="flat-section-prototype__task-board-toolbar-action"
          data-flat-task-board-action="add-task"
        >
          Task
        </button>
        <button
          type="button"
          aria-label="Add task board column"
          className="flat-section-prototype__task-board-toolbar-action"
          data-flat-task-board-action="add-column"
        >
          Column
        </button>
      </section>

      <section
        aria-label="Task board Kanban lanes"
        className="flat-section-prototype__task-board-board"
        data-flat-task-board-kanban="true"
      >
        {TASK_BOARD_FIXTURE.columns.map((column, index) => (
          <FlatTaskBoardLane key={column.id} column={column} index={index} />
        ))}
      </section>
    </section>
  );
}

function isFlatSpreadsheetCellSelected(rowNumber: number, columnIndex: number) {
  return (
    rowNumber >= 2 && rowNumber <= 3 && columnIndex >= 1 && columnIndex <= 2
  );
}

function FlatSpreadsheetColumnHeader({
  column,
  index,
}: {
  column: FlatSpreadsheetColumn;
  index: number;
}) {
  return (
    <div
      className="flat-section-prototype__spreadsheet-grid-cell flat-section-prototype__spreadsheet-grid-cell--header"
      data-flat-spreadsheet-column={column.id}
      data-flat-spreadsheet-column-index={index}
      data-flat-spreadsheet-sort-state={column.sortState}
      role="columnheader"
    >
      <button
        type="button"
        aria-label={`Sort column ${column.label}`}
        data-flat-spreadsheet-action="sort-column"
        data-flat-spreadsheet-action-column={column.id}
      >
        {column.label}
        {column.sortState === "asc" ? " ↑" : ""}
        {column.sortState === "desc" ? " ↓" : ""}
      </button>
      {index > 0 ? (
        <span
          aria-hidden="true"
          className="flat-section-prototype__spreadsheet-column-resize"
          data-flat-spreadsheet-column-resize={`${SPREADSHEET_FIXTURE.columns[index - 1]?.id}:${column.id}`}
        />
      ) : null}
    </div>
  );
}

function FlatSpreadsheetRowView({ row }: { row: FlatSpreadsheetRow }) {
  return (
    <>
      <div
        className="flat-section-prototype__spreadsheet-grid-cell flat-section-prototype__spreadsheet-grid-cell--row-number"
        data-flat-spreadsheet-row-number={row.rowNumber}
        role="rowheader"
      >
        {row.rowNumber}
      </div>
      {row.cells.map((value, columnIndex) => {
        const column = SPREADSHEET_FIXTURE.columns[columnIndex];
        const columnLabel = column?.label ?? String(columnIndex + 1);
        const columnKey = column?.id ?? String(columnIndex);
        const cellId = `${row.rowNumber}:${columnLabel}`;
        const isEdited = row.rowNumber === 2 && column?.id === "C";
        const isSelected = isFlatSpreadsheetCellSelected(
          row.rowNumber,
          columnIndex,
        );

        return (
          <input
            key={`${row.id}-${columnKey}`}
            aria-label={`Cell ${row.rowNumber}-${columnLabel}`}
            className="flat-section-prototype__spreadsheet-grid-cell flat-section-prototype__spreadsheet-grid-cell--data"
            data-flat-spreadsheet-cell={cellId}
            data-flat-spreadsheet-cell-selected={isSelected || undefined}
            data-flat-spreadsheet-cell-edited={isEdited || undefined}
            name={`spreadsheet-cell-${cellId.replace(":", "-")}`}
            readOnly
            role="gridcell"
            value={value}
          />
        );
      })}
    </>
  );
}

function FlatSpreadsheetBody() {
  return (
    <section
      className="flat-section-prototype__spreadsheet"
      data-flat-spreadsheet="true"
      data-flat-spreadsheet-active-sheet={SPREADSHEET_FIXTURE.activeSheet}
      data-flat-spreadsheet-auto-reload={
        SPREADSHEET_FIXTURE.autoReloadOnExternalChange
      }
      data-flat-spreadsheet-column-count={SPREADSHEET_FIXTURE.columnCount}
      data-flat-spreadsheet-density={SPREADSHEET_FIXTURE.density}
      data-flat-spreadsheet-displayed-row-count={
        SPREADSHEET_FIXTURE.displayedRowCount
      }
      data-flat-spreadsheet-file-path={SPREADSHEET_FIXTURE.filePath}
      data-flat-spreadsheet-read-only={SPREADSHEET_FIXTURE.readOnly}
      data-flat-spreadsheet-row-count={SPREADSHEET_FIXTURE.rowCount}
      data-flat-spreadsheet-section-type={SectionTypeEnum.Spreadsheet}
      data-flat-spreadsheet-selected-range={SPREADSHEET_FIXTURE.selectedRange}
      data-flat-spreadsheet-show-row-numbers={
        SPREADSHEET_FIXTURE.showRowNumbers
      }
      data-flat-spreadsheet-supported-formats={SPREADSHEET_FIXTURE.supportedFormats.join(
        ",",
      )}
    >
      <section
        aria-label="Spreadsheet file binding"
        className="flat-section-prototype__spreadsheet-file"
        data-flat-spreadsheet-drop-target="supported"
      >
        <p data-flat-spreadsheet-file-field="filePath">
          <span>file</span>
          <code>{SPREADSHEET_FIXTURE.filePath}</code>
        </p>
        <p data-flat-spreadsheet-file-field="activeSheet">
          <span>sheet</span>
          <b>{SPREADSHEET_FIXTURE.activeSheet}</b>
        </p>
        <p data-flat-spreadsheet-file-field="settings">
          <span>settings</span>
          <code>
            {SPREADSHEET_FIXTURE.density} / rows{" "}
            {SPREADSHEET_FIXTURE.showRowNumbers ? "on" : "off"} / reload{" "}
            {SPREADSHEET_FIXTURE.autoReloadOnExternalChange ? "on" : "off"}
          </code>
        </p>
      </section>

      <section
        aria-label="Spreadsheet controls"
        className="flat-section-prototype__spreadsheet-toolbar"
      >
        <label className="flat-section-prototype__spreadsheet-filter">
          <span>Filter</span>
          <input
            aria-label="Filter rows"
            name="spreadsheet-filter"
            readOnly
            value={SPREADSHEET_FIXTURE.filterQuery}
          />
        </label>
        <label className="flat-section-prototype__spreadsheet-sort">
          <span>Sort</span>
          <select
            aria-label="Sort column"
            data-flat-spreadsheet-action="sort-column-select"
            defaultValue={SPREADSHEET_FIXTURE.sortColumnId}
            name="spreadsheet-sort-column"
          >
            <option value="">None</option>
            {SPREADSHEET_FIXTURE.columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Toggle spreadsheet sort direction"
          data-flat-spreadsheet-action="sort-direction"
        >
          Desc
        </button>
        <button
          type="button"
          aria-label="Clear spreadsheet filter and sort"
          data-flat-spreadsheet-action="clear-view"
        >
          Clear
        </button>
        <button
          type="button"
          aria-label="Add spreadsheet column"
          data-flat-spreadsheet-action="add-column"
        >
          Column
        </button>
        <button
          type="button"
          aria-label="Add spreadsheet row"
          data-flat-spreadsheet-action="add-row"
        >
          Row
        </button>
        <button
          type="button"
          aria-label="Reload spreadsheet file"
          data-flat-spreadsheet-action="reload"
        >
          Reload
        </button>
        <button
          type="button"
          aria-label="Save spreadsheet file"
          data-flat-spreadsheet-action="save"
          data-flat-spreadsheet-save-enabled="true"
        >
          Save
        </button>
        <button
          type="button"
          aria-label="Spreadsheet settings"
          data-flat-spreadsheet-action="settings"
        >
          Settings
        </button>
      </section>

      <section
        aria-label="Spreadsheet status"
        className="flat-section-prototype__spreadsheet-status"
        data-flat-spreadsheet-dirty={SPREADSHEET_FIXTURE.isDirty}
        data-flat-spreadsheet-external-change={
          SPREADSHEET_FIXTURE.hasExternalDiskChange
        }
      >
        {SPREADSHEET_FIXTURE.isDirty ? <span>Unsaved edits.</span> : null}
        {SPREADSHEET_FIXTURE.hasExternalDiskChange ? (
          <span>File changed on disk.</span>
        ) : null}
        <span>{SPREADSHEET_FIXTURE.statusText}</span>
      </section>

      <section
        aria-label="Spreadsheet grid viewport"
        className="flat-section-prototype__spreadsheet-grid-viewport"
        data-flat-spreadsheet-grid-mode="glide"
      >
        <div
          className="flat-section-prototype__spreadsheet-grid"
          role="grid"
          aria-label={`${SPREADSHEET_FIXTURE.fileName} ${SPREADSHEET_FIXTURE.activeSheet}`}
        >
          <div
            className="flat-section-prototype__spreadsheet-grid-cell flat-section-prototype__spreadsheet-grid-cell--corner"
            role="presentation"
          >
            #
          </div>
          {SPREADSHEET_FIXTURE.columns.map((column, index) => (
            <FlatSpreadsheetColumnHeader
              key={column.id}
              column={column}
              index={index}
            />
          ))}
          {SPREADSHEET_FIXTURE.rows.map((row) => (
            <FlatSpreadsheetRowView key={row.id} row={row} />
          ))}
        </div>
      </section>

      <footer
        className="flat-section-prototype__spreadsheet-footer"
        data-flat-spreadsheet-selection-summary={
          SPREADSHEET_FIXTURE.selectedRange
        }
      >
        <span>
          {SPREADSHEET_FIXTURE.displayedRowCount} shown of{" "}
          {SPREADSHEET_FIXTURE.rowCount} rows /{" "}
          {SPREADSHEET_FIXTURE.columnCount} columns
        </span>
        <b>Selected {SPREADSHEET_FIXTURE.selectedRange}</b>
      </footer>
    </section>
  );
}

function FlatStateMachineStartBody() {
  return (
    <section
      className="flat-section-prototype__machine-start"
      data-flat-state-machine-start="true"
    >
      <section
        aria-label="Workflow identity"
        className="flat-section-prototype__machine-summary"
      >
        <p className="flat-section-prototype__machine-kicker">Start</p>
        <p className="flat-section-prototype__machine-group">workflow-main</p>
        <b
          className="flat-section-prototype__machine-status"
          data-flat-state-machine-status="running"
        >
          Running
        </b>
      </section>

      <section
        aria-label="Workflow run controls"
        className="flat-section-prototype__machine-run"
      >
        <ol className="flat-section-prototype__machine-actions">
          {STATE_MACHINE_START_ACTIONS.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                aria-label={action.label}
                className="flat-section-prototype__machine-action"
                data-flat-state-machine-action={action.action}
                data-flat-state-machine-action-state={action.status}
                disabled={action.status === "disabled"}
              >
                <span
                  aria-hidden="true"
                  className={`flat-section-prototype__icon-glyph ${action.iconClassName}`}
                />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label="Recent workflow activity"
        className="flat-section-prototype__machine-activity"
      >
        <h3 className="flat-section-prototype__machine-activity-title">
          Recent Activity
        </h3>
        <ol className="flat-section-prototype__machine-activity-list">
          {STATE_MACHINE_START_ACTIVITY.map((item) => (
            <li
              key={item.label}
              className="flat-section-prototype__machine-activity-item"
              data-flat-state-machine-activity-tone={item.tone}
            >
              {item.label}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label="Outgoing workflow edge source"
        className="flat-section-prototype__workflow-source"
        data-flat-workflow-handle="workflow-source"
      >
        <span className="flat-section-prototype__workflow-source-label">
          workflow-source
        </span>
        <b
          aria-hidden="true"
          className="flat-section-prototype__workflow-source-dot"
        />
      </section>
    </section>
  );
}

function FlatStateMachineGateBody() {
  return (
    <section
      className="flat-section-prototype__machine-gate"
      data-flat-state-machine-gate="true"
    >
      <section
        aria-label="Workflow identity"
        className="flat-section-prototype__machine-summary"
      >
        <p
          className="flat-section-prototype__machine-kicker"
          data-flat-state-machine-gate-type="AND"
        >
          AND Gate
        </p>
        <p className="flat-section-prototype__machine-group">workflow-main</p>
        <b
          className="flat-section-prototype__machine-status"
          data-flat-state-machine-status="running"
        >
          Running
        </b>
      </section>

      <section
        aria-label="Gate status"
        className="flat-section-prototype__gate-status"
      >
        {STATE_MACHINE_GATE_STATUS_ROWS.map((row) => (
          <p
            key={row.label}
            className="flat-section-prototype__gate-status-row"
            data-flat-state-machine-gate-status={row.state}
          >
            <span className="flat-section-prototype__gate-status-label">
              {row.label}
            </span>
            <b className="flat-section-prototype__gate-status-value">
              {row.value}
            </b>
          </p>
        ))}
      </section>

      <section
        aria-label="Gate Activity"
        className="flat-section-prototype__machine-activity"
        data-flat-state-machine-gate-activity="true"
      >
        <h3 className="flat-section-prototype__machine-activity-title">
          Gate Activity
        </h3>
        <ol className="flat-section-prototype__machine-activity-list">
          {STATE_MACHINE_GATE_ACTIVITY.map((item) => (
            <li
              key={item.id}
              className="flat-section-prototype__machine-activity-item"
              data-flat-state-machine-activity-tone={item.tone}
            >
              {item.label}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label="Workflow edge handles"
        className="flat-section-prototype__workflow-gate-edges"
      >
        <section
          aria-label="Incoming workflow edge target"
          className="flat-section-prototype__workflow-gate-edge flat-section-prototype__workflow-gate-edge--target"
          data-flat-workflow-handle="workflow-target"
          data-flat-workflow-reverse-start="workflow-reverse-start"
        >
          <b
            aria-hidden="true"
            className="flat-section-prototype__workflow-gate-dot"
          />
          <span className="flat-section-prototype__workflow-gate-label">
            workflow-target
          </span>
        </section>
        <section
          aria-label="Outgoing workflow edge source"
          className="flat-section-prototype__workflow-gate-edge flat-section-prototype__workflow-gate-edge--source"
          data-flat-workflow-handle="workflow-source"
        >
          <span className="flat-section-prototype__workflow-gate-label">
            workflow-source
          </span>
          <b
            aria-hidden="true"
            className="flat-section-prototype__workflow-gate-dot"
          />
        </section>
      </section>
    </section>
  );
}

function FlatStateMachineEndBody() {
  return (
    <section
      className="flat-section-prototype__machine-end"
      data-flat-state-machine-end="true"
    >
      <section
        aria-label="Workflow identity"
        className="flat-section-prototype__machine-summary"
      >
        <p className="flat-section-prototype__machine-kicker">End</p>
        <p className="flat-section-prototype__machine-group">workflow-main</p>
      </section>

      <section
        aria-label="Incoming workflow edge target"
        className="flat-section-prototype__workflow-end-edge"
        data-flat-workflow-handle="workflow-target"
        data-flat-workflow-reverse-start="workflow-reverse-start"
      >
        <b
          aria-hidden="true"
          className="flat-section-prototype__workflow-gate-dot"
        />
        <span className="flat-section-prototype__workflow-gate-label">
          workflow-target
        </span>
      </section>
    </section>
  );
}

export function FlatCallableSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="callable"
      title="rank_items"
      controlLabel="Args"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
      lead={<FlatCallableTarget value="builtins.sorted" />}
    >
      <FlatPrototypeStrip
        inputPorts={["items", "limit"]}
        outputPorts={["result"]}
      />
      <FlatPrototypeRows rows={CALLABLE_PINNED_ROWS} variant="pinned" />
      <FlatPrototypeRows rows={CALLABLE_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatDictSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="dict"
      title="workspace_profile"
      controlLabel="Entries"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatPrototypeRows rows={DICT_PINNED_ROWS} variant="pinned" />
      <FlatPrototypeRows rows={DICT_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatGlobalVariablesSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="global-variables"
      title="Global Variables"
      controlLabel="Globals"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatGlobalVariablesBody />
    </FlatSectionShell>
  );
}

export function FlatListRootSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="list-root"
      title="Sprint Intake"
      controlLabel="Children"
      controlsInitiallyOpen={controlsInitiallyOpen}
      hideMinimizeControl
      theme={theme}
    >
      <FlatListRootBody />
    </FlatSectionShell>
  );
}

export function FlatGroupSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="group"
      title="Prototype Group"
      controlLabel="Group"
      controlsInitiallyOpen={controlsInitiallyOpen}
      hideMinimizeControl
      theme={theme}
    >
      <FlatGroupBody />
    </FlatSectionShell>
  );
}

export function FlatDrawSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="draw"
      title="Sketch Layer"
      controlLabel="Draw"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatDrawBody />
    </FlatSectionShell>
  );
}

export function FlatImageSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="image"
      title="Source Image"
      controlLabel="Image"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatImageBody />
    </FlatSectionShell>
  );
}

export function FlatChartSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="chart"
      title="Metrics Chart"
      controlLabel="Chart"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatChartBody />
    </FlatSectionShell>
  );
}

export function FlatTextBlockSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="text-block"
      title={TEXT_BLOCK_FIXTURE.title}
      controlLabel="Text"
      controlsInitiallyOpen={controlsInitiallyOpen}
      headerActions={<FlatTextBlockDisplayModeButton />}
      theme={theme}
    >
      <FlatTextBlockBody />
    </FlatSectionShell>
  );
}

export function FlatPromptSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="prompt"
      title={PROMPT_FIXTURE.title}
      controlLabel="Prompt"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatPromptBody />
    </FlatSectionShell>
  );
}

export function FlatMetaControlSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="meta-control"
      title={META_CONTROL_FIXTURE.title}
      controlLabel="Control"
      controlsInitiallyOpen={controlsInitiallyOpen}
      hideMinimizeControl
      theme={theme}
    >
      <FlatMetaControlBody />
    </FlatSectionShell>
  );
}

export function FlatSocialSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="social"
      title={SOCIAL_FIXTURE.title}
      controlLabel="Social"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatSocialBody />
    </FlatSectionShell>
  );
}

export function FlatCodeSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="code"
      title={CODE_FIXTURE.title}
      controlLabel="Code"
      controlsInitiallyOpen={controlsInitiallyOpen}
      headerActions={<FlatCodeHeaderActions />}
      theme={theme}
    >
      <FlatCodeBody />
    </FlatSectionShell>
  );
}

export function FlatGenPythonCodeSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="gen-python-code"
      title={GEN_PYTHON_CODE_FIXTURE.title}
      controlLabel="Generated Python"
      controlsInitiallyOpen={controlsInitiallyOpen}
      headerActions={<FlatGenPythonCodeHeaderActions />}
      theme={theme}
    >
      <FlatGenPythonCodeBody />
    </FlatSectionShell>
  );
}

export function FlatGenPythonMetadataSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="gen-python-metadata"
      title={GEN_PYTHON_METADATA_FIXTURE.title}
      controlLabel="Metadata"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatGenPythonMetadataBody />
    </FlatSectionShell>
  );
}

export function FlatTerminalSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="terminal"
      title={TERMINAL_FIXTURE.title}
      controlLabel="Terminal"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatTerminalBody />
    </FlatSectionShell>
  );
}

export function FlatIFrameSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="iframe"
      title={IFRAME_FIXTURE.title}
      controlLabel="IFrame"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatIFrameBody />
    </FlatSectionShell>
  );
}

export function FlatChatSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="chat"
      title={CHAT_FIXTURE.title}
      controlLabel="Chat"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatChatBody />
    </FlatSectionShell>
  );
}

export function FlatBrowserSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="browser"
      title={BROWSER_FIXTURE.title}
      controlLabel="Browse"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatBrowserBody />
    </FlatSectionShell>
  );
}

export function FlatPluginSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="plugin"
      title={PLUGIN_FIXTURE.title}
      controlLabel="Plugin"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatPluginBody />
    </FlatSectionShell>
  );
}

export function FlatTaskBoardSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="task-board"
      title={TASK_BOARD_FIXTURE.title}
      controlLabel="Board"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatTaskBoardBody />
    </FlatSectionShell>
  );
}

export function FlatSpreadsheetSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="spreadsheet"
      title={SPREADSHEET_FIXTURE.title}
      controlLabel="Sheet"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatSpreadsheetBody />
    </FlatSectionShell>
  );
}

export function FlatStateMachineStartSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="state-machine-start"
      title="Kickoff"
      controlLabel="Workflow"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatStateMachineStartBody />
    </FlatSectionShell>
  );
}

export function FlatStateMachineGateSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="state-machine-gate"
      title="Review Gate"
      controlLabel="Workflow"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatStateMachineGateBody />
    </FlatSectionShell>
  );
}

export function FlatStateMachineEndSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="state-machine-end"
      title="Done"
      controlLabel="Workflow"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatStateMachineEndBody />
    </FlatSectionShell>
  );
}

export function FlatSectionPrototypeGallery() {
  return (
    <article
      className="flat-section-prototype-gallery"
      data-flat-section-gallery="true"
    >
      <section
        aria-label="Dark section prototypes"
        className="flat-section-prototype-gallery__column"
        data-flat-theme-preview="dark"
      >
        <FlatPrototypeGalleryItem label="Callable">
          <FlatCallableSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Param Dict / Dict">
          <FlatDictSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="ListRoot">
          <FlatListRootSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Group">
          <FlatGroupSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineStart">
          <FlatStateMachineStartSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineGate">
          <FlatStateMachineGateSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineEnd">
          <FlatStateMachineEndSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Draw">
          <FlatDrawSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="TextBlock">
          <FlatTextBlockSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Prompt">
          <FlatPromptSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="MetaControl">
          <FlatMetaControlSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Social">
          <FlatSocialSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GlobalVariables">
          <FlatGlobalVariablesSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Code">
          <FlatCodeSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GenPythonCode">
          <FlatGenPythonCodeSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GenPythonMetadata">
          <FlatGenPythonMetadataSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Terminal">
          <FlatTerminalSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="IFrame">
          <FlatIFrameSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Chat">
          <FlatChatSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Browser">
          <FlatBrowserSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Plugin">
          <FlatPluginSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="TaskBoard">
          <FlatTaskBoardSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Spreadsheet">
          <FlatSpreadsheetSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Image">
          <FlatImageSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Chart">
          <FlatChartSectionPrototype theme="dark" />
        </FlatPrototypeGalleryItem>
      </section>
      <section
        aria-label="Light section prototypes"
        className="flat-section-prototype-gallery__column"
        data-flat-theme-preview="light"
      >
        <FlatPrototypeGalleryItem label="Callable">
          <FlatCallableSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Param Dict / Dict">
          <FlatDictSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="ListRoot">
          <FlatListRootSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Group">
          <FlatGroupSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineStart">
          <FlatStateMachineStartSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineGate">
          <FlatStateMachineGateSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="StateMachineEnd">
          <FlatStateMachineEndSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Draw">
          <FlatDrawSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="TextBlock">
          <FlatTextBlockSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Prompt">
          <FlatPromptSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="MetaControl">
          <FlatMetaControlSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Social">
          <FlatSocialSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GlobalVariables">
          <FlatGlobalVariablesSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Code">
          <FlatCodeSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GenPythonCode">
          <FlatGenPythonCodeSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="GenPythonMetadata">
          <FlatGenPythonMetadataSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Terminal">
          <FlatTerminalSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="IFrame">
          <FlatIFrameSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Chat">
          <FlatChatSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Browser">
          <FlatBrowserSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Plugin">
          <FlatPluginSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="TaskBoard">
          <FlatTaskBoardSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Spreadsheet">
          <FlatSpreadsheetSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Image">
          <FlatImageSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
        <FlatPrototypeGalleryItem label="Chart">
          <FlatChartSectionPrototype theme="light" />
        </FlatPrototypeGalleryItem>
      </section>
    </article>
  );
}
