import {
  CodeObjTypeEnum,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type CodeObjType,
  type Core,
  type SectionType,
  type SingleConfig,
  type Variant,
} from "utils/generatedTypes";
import type {
  WorkspaceCanvasControllerState,
  WorkspaceCommitMode,
  WorkspaceSceneTarget,
} from "./workspaceController";
import type {
  WorkspaceCodeHighlightCacheState,
  WorkspaceCodeTokenRun,
} from "./workspaceHighlightCache";

export type WorkspacePoint = {
  x: number;
  y: number;
};

export type WorkspaceSize = {
  width: number;
  height: number;
};

export type WorkspaceRect = WorkspacePoint & WorkspaceSize;

export type WorkspaceViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type WorkspaceSceneProjectState = Pick<
  SingleConfig,
  | "codeObjImpls"
  | "codeObjs"
  | "codeObjVariants"
  | "parentSectionMap"
  | "projectConfig"
  | "sectionImpls"
  | "sections"
  | "sectionVariants"
  | "shownParamIds"
> & {
  previewSectionVariantMap?: Record<string, string | undefined>;
};

export type WorkspaceTypeErrorState = Record<
  string,
  {
    params?: Record<string, Array<string>>;
  }
>;

export type WorkspaceSceneRevisionKeys = {
  projectRevision: string;
  viewportRevision: string;
  sectionScrollRevision: string;
  themeRevision: string;
  fontRevision: string;
  devicePixelRatioRevision: string;
  textMeasurementRevision: string;
  highlighterRevision: string;
};

export type WorkspaceSceneOptions = {
  projectState: WorkspaceSceneProjectState;
  viewportSize: WorkspaceSize;
  controllerState?: WorkspaceCanvasControllerState;
  revisionKeys?: Partial<WorkspaceSceneRevisionKeys>;
  typeErrors?: WorkspaceTypeErrorState;
  highlightCache?: WorkspaceCodeHighlightCacheState;
};

export type WorkspaceHitCoordinateSpace = "workspace" | "screen";

export type WorkspaceHitIntent = "pan-viewport" | "open-context-menu";

export type SectionHitIntent =
  | "select-section"
  | "drag-section"
  | "resize-section"
  | "scroll-section"
  | "scrollbar"
  | "open-context-menu";

export type DictRowHitIntent =
  | "select-row"
  | "drag-row"
  | "activate-editor"
  | "open-context-menu";

export type ControlHitIntent =
  | "activate-editor"
  | "toggle-immediate"
  | "open-canvas-popup"
  | "open-dom-overlay"
  | "open-context-menu";

export type MinimapHitIntent = "minimap-pan" | "minimap-zoom" | "minimap-jump";

export type EdgePortHitIntent = "edge-or-port";

export type HitRegionIntent =
  | WorkspaceHitIntent
  | SectionHitIntent
  | DictRowHitIntent
  | ControlHitIntent
  | MinimapHitIntent
  | EdgePortHitIntent
  | "unsupported";

export type WorkspaceHitRegion = {
  id: string;
  coordinateSpace: WorkspaceHitCoordinateSpace;
  rect: WorkspaceRect;
  intent: HitRegionIntent;
  target: WorkspaceSceneTarget;
  zIndex: number;
};

export type WorkspaceSectionGeometry = {
  header: WorkspaceRect;
  body: WorkspaceRect;
  childContentRegion: WorkspaceRect;
  clipRegion: WorkspaceRect;
};

export type WorkspaceResizeHandleRegions = {
  right: WorkspaceRect;
  bottom: WorkspaceRect;
  corner: WorkspaceRect;
};

export type WorkspaceNestedDropZone = {
  id: string;
  parentSectionId: string;
  index: number;
  kind: "inside-parent" | "before-child" | "after-child";
  childSectionId: string | null;
  rect: WorkspaceRect;
};

export type WorkspaceSectionRenderModel =
  | {
      kind: "dict";
      dict: WorkspaceDictScene;
    }
  | {
      kind: "placeholder";
      reason: string;
    };

export type WorkspaceSectionScene = {
  id: string;
  type: SectionType | string;
  name: string;
  parentId: string | null;
  childIds: Array<string>;
  sectionPath: Array<string>;
  localBounds: WorkspaceRect;
  worldBounds: WorkspaceRect;
  zIndex: number;
  selected: boolean;
  hovered: boolean;
  active: boolean;
  childLayoutDirection: "horizontal" | "vertical";
  scrollOffset: number;
  geometry: WorkspaceSectionGeometry;
  resizeHandles: WorkspaceResizeHandleRegions;
  nestedDropZones: Array<WorkspaceNestedDropZone>;
  edgePortRegions: Array<WorkspaceHitRegion>;
  renderModel: WorkspaceSectionRenderModel;
  hitRegions: Array<WorkspaceHitRegion>;
  cacheKeys: {
    section: string;
    geometry: string;
  };
};

export type ActiveInputStrategy =
  | "canvas-immediate"
  | "canvas-popup"
  | "canvas-drag"
  | "dom-native-overlay"
  | "dom-rich-overlay"
  | "right-pane"
  | "unsupported";

export type CanvasParamSupport =
  | { passive: "preview"; active: ActiveInputStrategy }
  | { passive: "unsupported-placeholder"; active: "unsupported" };

export type ParamCommitMode = WorkspaceCommitMode;

export type CanvasControlKind =
  | "none"
  | "value-cell"
  | "toggle"
  | "dropdown"
  | "color-swatch"
  | "slider"
  | "button"
  | "disclosure"
  | "unsupported";

export type WorkspaceParamSupportDeclaration = {
  canvasSupport: CanvasParamSupport;
  activeInputStrategy: ActiveInputStrategy;
  commitMode: ParamCommitMode;
  controlKind: CanvasControlKind;
  primaryHitIntent: DictRowHitIntent | ControlHitIntent | "unsupported";
};

export type WorkspacePassiveValuePreview = {
  kind:
    | "text"
    | "code"
    | "password"
    | "boolean"
    | "color"
    | "choice"
    | "number"
    | "button"
    | "nested"
    | "unsupported";
  text: string;
  swatchColor: string | null;
  choices: Array<string>;
  masked: boolean;
};

export type WorkspacePassiveCodePreview = {
  language: string;
  cacheKey: string;
  tokenRuns: Array<WorkspaceCodeTokenRun> | null;
};

export type WorkspaceDictRowScene = {
  id: string;
  sectionId: string;
  paramId: string;
  paramType: CodeObjType | string;
  list: "pinned" | "unpinned";
  index: number;
  depth: number;
  parentParamId: string | null;
  path: Array<string>;
  label: string;
  rect: WorkspaceRect;
  labelRect: WorkspaceRect;
  valueRect: WorkspaceRect;
  controlRect: WorkspaceRect;
  visibleRect: WorkspaceRect | null;
  nestingRails: Array<WorkspaceRect>;
  visible: boolean;
  selected: boolean;
  hovered: boolean;
  active: boolean;
  focused: boolean;
  passiveValue: WorkspacePassiveValuePreview;
  codePreview: WorkspacePassiveCodePreview | null;
  errors: Array<string>;
  support: WorkspaceParamSupportDeclaration;
  hitRegions: Array<WorkspaceHitRegion>;
  cacheKeys: {
    row: string;
    textMeasurement: string;
    valuePreview: string;
  };
};

export type WorkspaceScrollbarScene = {
  track: WorkspaceRect;
  thumb: WorkspaceRect;
  contentHeight: number;
  viewportHeight: number;
};

export type WorkspaceDictScene = {
  sectionId: string;
  pinnedRegion: WorkspaceRect;
  unpinnedRegion: WorkspaceRect;
  scrollOffset: number;
  visibleRowRange: {
    start: number;
    end: number;
    overscan: number;
  };
  contentHeight: number;
  rows: Array<WorkspaceDictRowScene>;
  scrollbar: WorkspaceScrollbarScene | null;
  hitRegions: Array<WorkspaceHitRegion>;
};

export type WorkspaceMinimapSectionPreview = {
  sectionId: string;
  rect: WorkspaceRect;
};

export type WorkspaceMinimapScene = {
  id: string;
  bounds: WorkspaceRect;
  transform: {
    scale: number;
    translateX: number;
    translateY: number;
  };
  viewportMask: WorkspaceRect;
  sectionPreviews: Array<WorkspaceMinimapSectionPreview>;
  hitRegions: Array<WorkspaceHitRegion>;
};

export type WorkspaceScene = {
  viewport: WorkspaceViewport;
  viewportSize: WorkspaceSize;
  visibleWorkspaceRect: WorkspaceRect;
  projectBounds: WorkspaceRect;
  rootSectionIds: Array<string>;
  sectionOrder: Array<string>;
  sectionsById: Record<string, WorkspaceSectionScene>;
  minimap: WorkspaceMinimapScene;
  hitRegions: Array<WorkspaceHitRegion>;
  revisionKeys: WorkspaceSceneRevisionKeys;
  cacheKeys: {
    scene: string;
    projectBounds: string;
    minimap: string;
    textMeasurement: string;
    highlighter: string;
  };
};

export type EffectiveSectionSnapshot = {
  core: Core;
  variant: Variant;
  impl: BaseSectionImplUnion;
  effectiveImpl: BaseSectionImplUnion;
};

export type EffectiveCodeObjSnapshot = {
  core: Core;
  variant: Variant;
  impl: BaseCodeObjImplUnion;
  effectiveImpl: BaseCodeObjImplUnion;
};

export type NormalizedShownParamDetails = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

export type PendingSectionRecord = Omit<
  WorkspaceSectionScene,
  "nestedDropZones" | "renderModel" | "hitRegions"
> & {
  nestedDropZones: Array<WorkspaceNestedDropZone>;
  renderModel: WorkspaceSectionRenderModel | null;
  hitRegions: Array<WorkspaceHitRegion>;
};

// These constants mirror stable visual anchors from the current DOM workspace:
// compact headers, small rounded Param rows, 200px-ish Param label columns, and
// right-side section scrollbars. They are scene geometry inputs, not DOM reads.
export const WORKSPACE_SCENE_GEOMETRY = {
  sectionHeaderHeight: 36,
  sectionBodyPadding: 8,
  sectionNestedGap: 12,
  sectionResizeHandleSize: 12,
  dictRowHeight: 28,
  dictRowGap: 4,
  dictRowOverscan: 3,
  dictNestingIndent: 16,
  dictNestingRailWidth: 4,
  dictLabelColumnWidth: 200,
  dictLabelColumnMinWidth: 96,
  dictLabelColumnMaxRatio: 0.48,
  dictValueGap: 12,
  dictControlMinWidth: 44,
  dictScrollbarWidth: 8,
  minimapWidth: 202,
  minimapHeight: 152,
  minimapPadding: 8,
  minimapViewportMargin: 16,
} as const;

export const DEFAULT_WORKSPACE_SCENE_REVISIONS: WorkspaceSceneRevisionKeys = {
  projectRevision: "0",
  viewportRevision: "0",
  sectionScrollRevision: "0",
  themeRevision: "0",
  fontRevision: "0",
  devicePixelRatioRevision: "0",
  textMeasurementRevision: "0",
  highlighterRevision: "0",
};

export const WORKSPACE_PARAM_SUPPORT = {
  [CodeObjTypeEnum.CodeCallable]: {
    canvasSupport: {
      passive: "unsupported-placeholder",
      active: "unsupported",
    },
    activeInputStrategy: "unsupported",
    commitMode: "none",
    controlKind: "unsupported",
    primaryHitIntent: "unsupported",
  },
  [CodeObjTypeEnum.CodeParam]: {
    canvasSupport: { passive: "preview", active: "dom-rich-overlay" },
    activeInputStrategy: "dom-rich-overlay",
    commitMode: "onBlurOrEnter",
    controlKind: "value-cell",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.TextParam]: {
    canvasSupport: { passive: "preview", active: "dom-native-overlay" },
    activeInputStrategy: "dom-native-overlay",
    commitMode: "onBlurOrEnter",
    controlKind: "value-cell",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.DateParam]: {
    canvasSupport: { passive: "preview", active: "dom-native-overlay" },
    activeInputStrategy: "dom-native-overlay",
    commitMode: "onExplicitApply",
    controlKind: "value-cell",
    primaryHitIntent: "open-dom-overlay",
  },
  [CodeObjTypeEnum.TimeParam]: {
    canvasSupport: { passive: "preview", active: "dom-native-overlay" },
    activeInputStrategy: "dom-native-overlay",
    commitMode: "onExplicitApply",
    controlKind: "value-cell",
    primaryHitIntent: "open-dom-overlay",
  },
  [CodeObjTypeEnum.ButtonParam]: {
    canvasSupport: { passive: "preview", active: "canvas-immediate" },
    activeInputStrategy: "canvas-immediate",
    commitMode: "immediate",
    controlKind: "button",
    primaryHitIntent: "toggle-immediate",
  },
  [CodeObjTypeEnum.SliderParam]: {
    canvasSupport: { passive: "preview", active: "canvas-drag" },
    activeInputStrategy: "canvas-drag",
    commitMode: "onRelease",
    controlKind: "slider",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.RotaryParam]: {
    canvasSupport: { passive: "preview", active: "canvas-drag" },
    activeInputStrategy: "canvas-drag",
    commitMode: "onRelease",
    controlKind: "slider",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.SwitchParam]: {
    canvasSupport: { passive: "preview", active: "canvas-immediate" },
    activeInputStrategy: "canvas-immediate",
    commitMode: "immediate",
    controlKind: "toggle",
    primaryHitIntent: "toggle-immediate",
  },
  [CodeObjTypeEnum.ColorPickerParam]: {
    canvasSupport: { passive: "preview", active: "canvas-popup" },
    activeInputStrategy: "canvas-popup",
    commitMode: "onExplicitApply",
    controlKind: "color-swatch",
    primaryHitIntent: "open-canvas-popup",
  },
  [CodeObjTypeEnum.DropdownParam]: {
    canvasSupport: { passive: "preview", active: "canvas-popup" },
    activeInputStrategy: "canvas-popup",
    commitMode: "onExplicitApply",
    controlKind: "dropdown",
    primaryHitIntent: "open-canvas-popup",
  },
  [CodeObjTypeEnum.PasswordParam]: {
    canvasSupport: { passive: "preview", active: "dom-native-overlay" },
    activeInputStrategy: "dom-native-overlay",
    commitMode: "onBlurOrEnter",
    controlKind: "value-cell",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.TextAreaParam]: {
    canvasSupport: { passive: "preview", active: "dom-native-overlay" },
    activeInputStrategy: "dom-native-overlay",
    commitMode: "onBlurOrEnter",
    controlKind: "value-cell",
    primaryHitIntent: "activate-editor",
  },
  [CodeObjTypeEnum.DropzoneParam]: {
    canvasSupport: {
      passive: "unsupported-placeholder",
      active: "unsupported",
    },
    activeInputStrategy: "unsupported",
    commitMode: "none",
    controlKind: "unsupported",
    primaryHitIntent: "unsupported",
  },
  [CodeObjTypeEnum.NestedParam]: {
    canvasSupport: { passive: "preview", active: "unsupported" },
    activeInputStrategy: "unsupported",
    commitMode: "none",
    controlKind: "disclosure",
    primaryHitIntent: "select-row",
  },
} satisfies Record<CodeObjType, WorkspaceParamSupportDeclaration>;
