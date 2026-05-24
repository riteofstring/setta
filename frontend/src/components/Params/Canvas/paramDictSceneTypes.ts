export type ParamDictSceneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ParamDictSceneViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ParamDictSceneRowListKey = "pinned" | "unpinned";

export type ParamDictSceneControlKind =
  | "color"
  | "dropdown"
  | "editor"
  | "nested"
  | "passive"
  | "switch";

export type ParamDictSceneRow = {
  id: string;
  sectionId: string;
  listKey: ParamDictSceneRowListKey;
  parentId: string;
  depth: number;
  indexInList: number;
  path: string[];
  codeObjType: string;
  label: string;
  valuePreview: string;
  isParent: boolean;
  isSelected: boolean;
  errorMessages: string[];
  rect: ParamDictSceneRect;
  labelRect: ParamDictSceneRect;
  valueRect: ParamDictSceneRect;
  controlKind: ParamDictSceneControlKind;
  controlRect: ParamDictSceneRect;
  isVisible: boolean;
};

export type ParamDictSceneRowList = {
  key: ParamDictSceneRowListKey;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  rows: ParamDictSceneRow[];
  visibleRange: ParamDictSceneVisibleRowRange;
  viewportRect: ParamDictSceneRect;
  contentHeight: number;
  scrollOffset: number;
  maxScrollOffset: number;
};

export type ParamDictSectionScene = {
  id: string;
  name: string;
  bounds: ParamDictSceneRect;
  headerRect: ParamDictSceneRect;
  bodyRect: ParamDictSceneRect;
  columnWidth: number;
  contentHeight: number;
  rows: ParamDictSceneRow[];
  visibleRows: ParamDictSceneRow[];
  pinned: ParamDictSceneRowList;
  unpinned: ParamDictSceneRowList;
  selectedParamIds: string[];
};

export type ParamDictMinimapSection = {
  sectionId: string;
  rect: ParamDictSceneRect;
};

export type ParamDictMinimapScene = {
  bounds: ParamDictSceneRect;
  rect: ParamDictSceneRect;
  scale: number;
  sections: ParamDictMinimapSection[];
  viewportMask: ParamDictSceneRect | null;
};

export type ParamDictScene = {
  viewport: ParamDictSceneViewport | null;
  viewportSize: {
    width: number;
    height: number;
  };
  bounds: ParamDictSceneRect;
  sections: ParamDictSectionScene[];
  visibleRows: ParamDictSceneRow[];
  minimap: ParamDictMinimapScene;
};

export type ParamDictSceneTypeErrors = Record<
  string,
  {
    params: Record<string, string[]>;
  }
>;

export type ParamDictSceneOptions = {
  preview?: boolean;
  viewportSize?: {
    width: number;
    height: number;
  };
  minimapSize?: {
    width: number;
    height: number;
  };
  scrollOffsets?: Record<string, number>;
  overscanRows?: number;
  typeErrors?: ParamDictSceneTypeErrors;
  geometry?: Partial<ParamDictSceneGeometry>;
};

export type ParamDictSceneVisibleRowRange = {
  start: number;
  end: number;
};

export type ParamDictSceneGeometry = {
  sectionHeaderHeight: number;
  sectionBodyPaddingX: number;
  pinnedHeaderHeight: number;
  rowHeight: number;
  rowGap: number;
  rowPaddingX: number;
  rowPaddingY: number;
  rowIndentWidth: number;
  rowCenterGutterWidth: number;
  defaultColumnWidth: number;
  minValueColumnWidth: number;
  controlWidth: number;
  switchControlWidth: number;
  switchControlHeight: number;
  swatchControlWidth: number;
  swatchControlHeight: number;
  minimapPadding: number;
};

export const PARAM_DICT_SCENE_DEFAULT_GEOMETRY: ParamDictSceneGeometry = {
  sectionHeaderHeight: 34,
  sectionBodyPaddingX: 6,
  pinnedHeaderHeight: 18,
  rowHeight: 22,
  rowGap: 4,
  rowPaddingX: 2,
  rowPaddingY: 2,
  rowIndentWidth: 14,
  rowCenterGutterWidth: 12,
  defaultColumnWidth: 200,
  minValueColumnWidth: 60,
  controlWidth: 28,
  switchControlWidth: 28,
  switchControlHeight: 10,
  swatchControlWidth: 28,
  swatchControlHeight: 16,
  minimapPadding: 1,
};
