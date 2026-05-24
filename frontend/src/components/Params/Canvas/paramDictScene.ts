import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseCodeObjImplUnion,
  type CodeObjType,
  type Core,
  type DictSectionImpl,
  type ProjectConfig,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { deriveParamDictMinimapScene } from "./paramDictSceneMinimap";
import {
  PARAM_DICT_SCENE_DEFAULT_GEOMETRY,
  type ParamDictScene,
  type ParamDictSceneControlKind,
  type ParamDictSceneGeometry,
  type ParamDictSceneOptions,
  type ParamDictSceneRect,
  type ParamDictSceneRow,
  type ParamDictSceneRowList,
  type ParamDictSceneRowListKey,
  type ParamDictSceneTypeErrors,
  type ParamDictSceneViewport,
  type ParamDictSceneVisibleRowRange,
  type ParamDictSectionScene,
} from "./paramDictSceneTypes";

export { PARAM_DICT_SCENE_DEFAULT_GEOMETRY } from "./paramDictSceneTypes";
export type {
  ParamDictMinimapScene,
  ParamDictMinimapSection,
  ParamDictScene,
  ParamDictSceneControlKind,
  ParamDictSceneGeometry,
  ParamDictSceneOptions,
  ParamDictSceneRect,
  ParamDictSceneRow,
  ParamDictSceneRowList,
  ParamDictSceneRowListKey,
  ParamDictSceneTypeErrors,
  ParamDictSceneViewport,
  ParamDictSceneVisibleRowRange,
  ParamDictSectionScene,
} from "./paramDictSceneTypes";

const DEFAULT_VIEWPORT_SIZE = {
  width: 1440,
  height: 900,
};

const DEFAULT_MINIMAP_SIZE = {
  width: 200,
  height: 150,
};

const DEFAULT_SECTION_SIZE = {
  width: 250,
  height: 150,
};

type NormalizedShownParamIds = {
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
};

type ParamDictSectionRects = {
  bounds: ParamDictSceneRect;
  headerRect: ParamDictSceneRect;
  bodyRect: ParamDictSceneRect;
};

type ParamDictShownParamLists = {
  pinned: NormalizedShownParamIds;
  unpinned: NormalizedShownParamIds;
};

type DeriveParamDictSectionSceneArgs = {
  state: ZustandProjectState;
  sectionId: string;
  layout: TopLevelSectionLayout | undefined;
  scrollOffset?: number;
  geometry?: ParamDictSceneGeometry;
  overscanRows?: number;
  typeErrors?: ParamDictSceneTypeErrors;
  preview?: boolean;
};

type ResolvedParamDictSectionSceneArgs = {
  state: ZustandProjectState;
  sectionId: string;
  layout: TopLevelSectionLayout;
  scrollOffset: number;
  geometry: ParamDictSceneGeometry;
  overscanRows: number;
  typeErrors: ParamDictSceneTypeErrors;
  preview: boolean;
};

type BuildRowListArgs = {
  state: ZustandProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  selectedParamIds: Set<string>;
  listKey: ParamDictSceneRowListKey;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  viewportRect: ParamDictSceneRect;
  columnWidth: number;
  scrollOffset: number;
  geometry: ParamDictSceneGeometry;
  overscanRows: number;
  typeErrors: ParamDictSceneTypeErrors;
  preview: boolean;
};

export function deriveParamDictScene(
  state: ZustandProjectState,
  options: ParamDictSceneOptions = {},
): ParamDictScene {
  const geometry = {
    ...PARAM_DICT_SCENE_DEFAULT_GEOMETRY,
    ...(options.geometry ?? {}),
  };
  const preview = options.preview ?? true;
  const viewportSize = options.viewportSize ?? DEFAULT_VIEWPORT_SIZE;
  const minimapSize = options.minimapSize ?? DEFAULT_MINIMAP_SIZE;
  const scrollOffsets = options.scrollOffsets ?? {};
  const overscanRows = options.overscanRows ?? 2;
  const topLevelSections = getSceneTopLevelSections(state);
  const sections = Object.keys(topLevelSections)
    .map((sectionId) =>
      deriveParamDictSectionScene({
        state,
        sectionId,
        layout: topLevelSections[sectionId],
        scrollOffset: scrollOffsets[sectionId] ?? 0,
        geometry,
        overscanRows,
        typeErrors: options.typeErrors ?? {},
        preview,
      }),
    )
    .filter((section): section is ParamDictSectionScene => section !== null)
    .sort((left, right) => left.bounds.y - right.bounds.y);
  const bounds = getUnionBounds(sections.map((section) => section.bounds));
  return {
    viewport: normalizeViewport(state.projectConfig),
    viewportSize,
    bounds,
    sections,
    visibleRows: sections.flatMap((section) => section.visibleRows),
    minimap: deriveParamDictMinimapScene({
      sections,
      sceneBounds: bounds,
      viewport: normalizeViewport(state.projectConfig),
      viewportSize,
      minimapSize,
      geometry,
    }),
  };
}

export function deriveParamDictSectionScene(
  args: DeriveParamDictSectionSceneArgs,
): ParamDictSectionScene | null {
  if (!args.layout) {
    return null;
  }
  return deriveParamDictSectionSceneForLayout({
    state: args.state,
    sectionId: args.sectionId,
    layout: args.layout,
    scrollOffset: args.scrollOffset ?? 0,
    geometry: args.geometry ?? PARAM_DICT_SCENE_DEFAULT_GEOMETRY,
    overscanRows: args.overscanRows ?? 2,
    typeErrors: args.typeErrors ?? {},
    preview: args.preview ?? true,
  });
}

function deriveParamDictSectionSceneForLayout({
  state,
  sectionId,
  layout,
  scrollOffset,
  geometry,
  overscanRows,
  typeErrors,
  preview,
}: ResolvedParamDictSectionSceneArgs): ParamDictSectionScene | null {
  const sectionImpl = getDictSectionImplForScene(state, sectionId, preview);
  if (!sectionImpl) {
    return null;
  }
  const { bounds, headerRect, bodyRect } = deriveSectionRects({
    layout,
    sectionImpl,
    sectionId,
    geometry,
  });
  const columnWidth = resolveColumnWidth(sectionImpl, bodyRect, geometry);
  const shownParams = getShownParamLists({
    state,
    sectionId,
    sectionImpl,
    preview,
  });
  const { pinned, unpinned, rows } = buildSectionRowLists({
    state,
    sectionId,
    sectionImpl,
    shownParams,
    bodyRect,
    columnWidth,
    scrollOffset,
    geometry,
    overscanRows,
    typeErrors,
    preview,
  });
  return {
    id: sectionId,
    name: state.sections[sectionId]?.name ?? sectionImpl.name,
    bounds,
    headerRect,
    bodyRect,
    columnWidth,
    contentHeight: pinned.viewportRect.height + unpinned.contentHeight,
    rows,
    visibleRows: rows.filter((row) => row.isVisible),
    pinned,
    unpinned,
    selectedParamIds: sectionImpl.selectedParams ?? [],
  };
}

export function computeVisibleRowRange({
  rowCount,
  rowHeight,
  rowGap,
  viewportHeight,
  scrollOffset,
  paddingTop,
  overscanRows,
}: {
  rowCount: number;
  rowHeight: number;
  rowGap: number;
  viewportHeight: number;
  scrollOffset: number;
  paddingTop: number;
  overscanRows: number;
}): ParamDictSceneVisibleRowRange {
  if (rowCount <= 0 || viewportHeight <= 0) {
    return { start: 0, end: 0 };
  }
  const stride = rowHeight + rowGap;
  const firstVisible = Math.floor((scrollOffset - paddingTop) / stride);
  const lastVisible = Math.ceil(
    (scrollOffset + viewportHeight - paddingTop) / stride,
  );
  return {
    start: clampInt(firstVisible - overscanRows, 0, rowCount),
    end: clampInt(lastVisible + overscanRows, 0, rowCount),
  };
}

function getDictSectionImplForScene(
  state: ZustandProjectState,
  sectionId: string,
  preview: boolean,
): DictSectionImpl | null {
  const sectionWithParamsImpl =
    getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
      preview,
    );
  if (
    !sectionWithParamsImpl ||
    sectionWithParamsImpl.type !== SectionTypeEnum.Dict
  ) {
    return null;
  }
  return sectionWithParamsImpl as DictSectionImpl;
}

function deriveSectionRects({
  layout,
  sectionImpl,
  sectionId,
  geometry,
}: {
  layout: TopLevelSectionLayout;
  sectionImpl: DictSectionImpl;
  sectionId: string;
  geometry: ParamDictSceneGeometry;
}): ParamDictSectionRects {
  const width =
    layout.w ??
    resolveSectionSizeValue(
      sectionImpl.size.width,
      DEFAULT_SECTION_SIZE.width,
      sectionId,
      "width",
    );
  const height =
    layout.h ??
    resolveSectionSizeValue(
      sectionImpl.size.height,
      DEFAULT_SECTION_SIZE.height,
      sectionId,
      "height",
    );
  const bounds = {
    x: layout.x,
    y: layout.y,
    width,
    height,
  };
  const headerRect = {
    x: bounds.x,
    y: bounds.y,
    width,
    height: Math.min(height, geometry.sectionHeaderHeight),
  };
  return {
    bounds,
    headerRect,
    bodyRect: {
      x: bounds.x,
      y: bounds.y + headerRect.height,
      width,
      height: Math.max(0, height - headerRect.height),
    },
  };
}

function getShownParamLists({
  state,
  sectionId,
  sectionImpl,
  preview,
}: {
  state: ZustandProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  preview: boolean;
}): ParamDictShownParamLists {
  return {
    pinned: filterEdgeInputs(
      normalizeShownParamIds(
        getCurrShownParamIds(state, sectionId, true, preview),
      ),
      sectionImpl.edgeInputParams,
    ),
    unpinned: filterEdgeInputs(
      normalizeShownParamIds(
        getCurrShownParamIds(state, sectionId, false, preview),
      ),
      sectionImpl.edgeInputParams,
    ),
  };
}

function buildSectionRowLists({
  state,
  sectionId,
  sectionImpl,
  shownParams,
  bodyRect,
  columnWidth,
  scrollOffset,
  geometry,
  overscanRows,
  typeErrors,
  preview,
}: {
  state: ZustandProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  shownParams: ParamDictShownParamLists;
  bodyRect: ParamDictSceneRect;
  columnWidth: number;
  scrollOffset: number;
  geometry: ParamDictSceneGeometry;
  overscanRows: number;
  typeErrors: ParamDictSceneTypeErrors;
  preview: boolean;
}): Pick<ParamDictSectionScene, "pinned" | "rows" | "unpinned"> {
  const selectedParamIds = new Set(sectionImpl.selectedParams ?? []);
  const pinnedViewportRect = getPinnedViewportRect({
    state,
    sectionId,
    sectionImpl,
    shownPinned: shownParams.pinned,
    bodyRect,
    geometry,
  });
  const unpinnedViewportRect = getUnpinnedViewportRect(
    bodyRect,
    pinnedViewportRect,
  );
  const unpinnedParams = getRenderableUnpinnedParams(
    sectionImpl,
    shownParams.unpinned,
  );
  const pinned = buildRowList({
    state,
    sectionId,
    sectionImpl,
    selectedParamIds,
    listKey: "pinned",
    topLevelParamIds: shownParams.pinned.topLevelParamIds,
    requiredParamIdsToPaths: shownParams.pinned.requiredParamIdsToPaths,
    viewportRect: pinnedViewportRect,
    columnWidth,
    scrollOffset: 0,
    geometry,
    overscanRows,
    typeErrors,
    preview,
  });
  const unpinned = buildRowList({
    state,
    sectionId,
    sectionImpl,
    selectedParamIds,
    listKey: "unpinned",
    topLevelParamIds: unpinnedParams.topLevelParamIds,
    requiredParamIdsToPaths: unpinnedParams.requiredParamIdsToPaths,
    viewportRect: unpinnedViewportRect,
    columnWidth,
    scrollOffset,
    geometry,
    overscanRows,
    typeErrors,
    preview,
  });
  return {
    pinned,
    unpinned,
    rows: [...pinned.rows, ...unpinned.rows],
  };
}

function getPinnedViewportRect({
  state,
  sectionId,
  sectionImpl,
  shownPinned,
  bodyRect,
  geometry,
}: {
  state: ZustandProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  shownPinned: NormalizedShownParamIds;
  bodyRect: ParamDictSceneRect;
  geometry: ParamDictSceneGeometry;
}) {
  const pinnedRowCount = getFlattenedRowCount({
    state,
    sectionId,
    sectionImpl,
    topLevelParamIds: shownPinned.topLevelParamIds,
    requiredParamIdsToPaths: shownPinned.requiredParamIdsToPaths,
  });
  const pinnedContentHeight = getRowsContentHeight(pinnedRowCount, geometry);
  if (shownPinned.topLevelParamIds.length === 0) {
    return zeroHeightRect(bodyRect.x, bodyRect.y, bodyRect.width);
  }
  return {
    x: bodyRect.x,
    y: bodyRect.y,
    width: bodyRect.width,
    height: geometry.pinnedHeaderHeight + pinnedContentHeight,
  };
}

function getUnpinnedViewportRect(
  bodyRect: ParamDictSceneRect,
  pinnedViewportRect: ParamDictSceneRect,
) {
  return {
    x: bodyRect.x,
    y: bodyRect.y + pinnedViewportRect.height,
    width: bodyRect.width,
    height: Math.max(0, bodyRect.height - pinnedViewportRect.height),
  };
}

function getRenderableUnpinnedParams(
  sectionImpl: DictSectionImpl,
  shownUnpinned: NormalizedShownParamIds,
) {
  if (sectionImpl.hideUnpinnedParams) {
    return {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    };
  }
  return shownUnpinned;
}

function buildRowList({
  state,
  sectionId,
  sectionImpl,
  selectedParamIds,
  listKey,
  topLevelParamIds,
  requiredParamIdsToPaths,
  viewportRect,
  columnWidth,
  scrollOffset,
  geometry,
  overscanRows,
  typeErrors,
  preview,
}: BuildRowListArgs): ParamDictSceneRowList {
  if (topLevelParamIds.length === 0) {
    return {
      key: listKey,
      topLevelParamIds,
      requiredParamIdsToPaths,
      rows: [],
      visibleRange: { start: 0, end: 0 },
      viewportRect,
      contentHeight: 0,
      scrollOffset: 0,
      maxScrollOffset: 0,
    };
  }
  if (!sectionImpl.topLevelParamId) {
    throw new Error(`Dict section ${sectionId} missing top-level param root.`);
  }
  const tree = buildParamTreeView(
    state,
    sectionId,
    topLevelParamIds,
    requiredParamIdsToPaths,
  );
  const contentHeight = getRowsContentHeight(tree.flat.length, geometry);
  const maxScrollOffset =
    listKey === "unpinned"
      ? Math.max(0, contentHeight - viewportRect.height)
      : 0;
  const resolvedScrollOffset =
    listKey === "unpinned" ? clamp(scrollOffset, 0, maxScrollOffset) : 0;
  const visibleRange =
    listKey === "pinned"
      ? { start: 0, end: tree.flat.length }
      : computeVisibleRowRange({
          rowCount: tree.flat.length,
          rowHeight: geometry.rowHeight,
          rowGap: geometry.rowGap,
          viewportHeight: viewportRect.height,
          scrollOffset: resolvedScrollOffset,
          paddingTop: geometry.rowPaddingY,
          overscanRows,
        });
  const rows = tree.flat
    .map((item, indexInList) =>
      buildSceneRow({
        state,
        sectionId,
        listKey,
        item,
        indexInList,
        selectedParamIds,
        requiredParamIdsToPaths,
        viewportRect,
        columnWidth,
        scrollOffset: resolvedScrollOffset,
        geometry,
        visibleRange,
        typeErrors,
        preview,
      }),
    )
    .filter((row): row is ParamDictSceneRow => row !== null);
  return {
    key: listKey,
    topLevelParamIds,
    requiredParamIdsToPaths,
    rows,
    visibleRange,
    viewportRect,
    contentHeight,
    scrollOffset: resolvedScrollOffset,
    maxScrollOffset,
  };
}

function getFlattenedRowCount({
  state,
  sectionId,
  sectionImpl,
  topLevelParamIds,
  requiredParamIdsToPaths,
}: {
  state: ZustandProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
}) {
  if (topLevelParamIds.length === 0) {
    return 0;
  }
  if (!sectionImpl.topLevelParamId) {
    throw new Error(`Dict section ${sectionId} missing top-level param root.`);
  }
  return buildParamTreeView(
    state,
    sectionId,
    topLevelParamIds,
    requiredParamIdsToPaths,
  ).flat.length;
}

function buildSceneRow({
  state,
  sectionId,
  listKey,
  item,
  indexInList,
  selectedParamIds,
  requiredParamIdsToPaths,
  viewportRect,
  columnWidth,
  scrollOffset,
  geometry,
  visibleRange,
  typeErrors,
  preview,
}: {
  state: ZustandProjectState;
  sectionId: string;
  listKey: ParamDictSceneRowListKey;
  item: {
    id: string;
    parentId: string;
    depth: number;
    isParent: boolean;
  };
  indexInList: number;
  selectedParamIds: Set<string>;
  requiredParamIdsToPaths: Record<string, string[]>;
  viewportRect: ParamDictSceneRect;
  columnWidth: number;
  scrollOffset: number;
  geometry: ParamDictSceneGeometry;
  visibleRange: ParamDictSceneVisibleRowRange;
  typeErrors: ParamDictSceneTypeErrors;
  preview: boolean;
}): ParamDictSceneRow | null {
  const codeObjImpl = getCurrEffectiveCodeObjImplIfPresent(
    state,
    sectionId,
    item.id,
    preview,
  ) as BaseCodeObjImplUnion | null;
  const codeObjCore = state.codeObjs[item.id];
  if (!codeObjImpl || !codeObjCore) {
    return null;
  }
  const rowY =
    viewportRect.y +
    geometry.rowPaddingY +
    getListHeaderHeight(listKey, geometry) +
    indexInList * (geometry.rowHeight + geometry.rowGap) -
    scrollOffset;
  const rect = {
    x: viewportRect.x + geometry.sectionBodyPaddingX,
    y: rowY,
    width: Math.max(0, viewportRect.width - geometry.sectionBodyPaddingX * 2),
    height: geometry.rowHeight,
  };
  const depthInset = item.depth * geometry.rowIndentWidth;
  const labelRect = {
    x: rect.x + geometry.rowPaddingX + depthInset,
    y: rect.y + geometry.rowPaddingY,
    width: Math.max(0, columnWidth - depthInset),
    height: rect.height - geometry.rowPaddingY * 2,
  };
  const valueRectX =
    rect.x + geometry.rowPaddingX + columnWidth + geometry.rowCenterGutterWidth;
  const valueRect = {
    x: valueRectX,
    y: rect.y + geometry.rowPaddingY,
    width: Math.max(
      geometry.minValueColumnWidth,
      rect.x + rect.width - valueRectX - geometry.rowPaddingX,
    ),
    height: rect.height - geometry.rowPaddingY * 2,
  };
  const controlKind = getControlKind(codeObjImpl);
  const controlRect = getControlRect(controlKind, valueRect, geometry);
  return {
    id: item.id,
    sectionId,
    listKey,
    parentId: item.parentId,
    depth: item.depth,
    indexInList,
    path: requiredParamIdsToPaths[item.id] ?? [],
    codeObjType: codeObjImpl.type,
    label: resolveParamLabel(state.projectConfig, codeObjCore, codeObjImpl),
    valuePreview: getValuePreview(codeObjImpl),
    isParent: item.isParent,
    isSelected: selectedParamIds.has(item.id),
    errorMessages: typeErrors[sectionId]?.params[item.id] ?? [],
    rect,
    labelRect,
    valueRect,
    controlKind,
    controlRect,
    isVisible:
      indexInList >= visibleRange.start && indexInList < visibleRange.end,
  };
}

function getActiveValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function getValuePreview(codeObjImpl: BaseCodeObjImplUnion): string {
  if (!isBaseChildlessCodeObjImpl(codeObjImpl) || !("value" in codeObjImpl)) {
    return "";
  }
  return getActiveValue(codeObjImpl.value);
}

function resolveParamLabel(
  projectConfig: ProjectConfig,
  codeObjCore: Core,
  codeObjImpl: BaseCodeObjImplUnion,
): string {
  if (!projectConfig.showParamDisplayNames) {
    return codeObjCore.name;
  }
  if (
    isBaseParamCodeObjImpl(codeObjImpl) &&
    "coreNameEditable" in codeObjImpl &&
    codeObjImpl.coreNameEditable
  ) {
    return codeObjCore.name;
  }
  const displayName = codeObjCore.displayName.trim();
  return displayName.length > 0 ? displayName : codeObjCore.name;
}

const CONTROL_KIND_BY_CODE_OBJ_TYPE: Partial<
  Record<CodeObjType, ParamDictSceneControlKind>
> = {
  [CodeObjTypeEnum.SwitchParam]: "switch",
  [CodeObjTypeEnum.ColorPickerParam]: "color",
  [CodeObjTypeEnum.DropdownParam]: "dropdown",
  [CodeObjTypeEnum.CodeParam]: "editor",
  [CodeObjTypeEnum.DateParam]: "editor",
  [CodeObjTypeEnum.PasswordParam]: "editor",
  [CodeObjTypeEnum.TextAreaParam]: "editor",
  [CodeObjTypeEnum.TextParam]: "editor",
  [CodeObjTypeEnum.TimeParam]: "editor",
  [CodeObjTypeEnum.NestedParam]: "nested",
};

function getControlKind(
  codeObjImpl: BaseCodeObjImplUnion,
): ParamDictSceneControlKind {
  return CONTROL_KIND_BY_CODE_OBJ_TYPE[codeObjImpl.type] ?? "passive";
}

function getControlRect(
  controlKind: ParamDictSceneControlKind,
  valueRect: ParamDictSceneRect,
  geometry: ParamDictSceneGeometry,
): ParamDictSceneRect {
  const width =
    controlKind === "switch"
      ? geometry.switchControlWidth
      : controlKind === "color"
        ? geometry.swatchControlWidth
        : geometry.controlWidth;
  const height =
    controlKind === "switch"
      ? geometry.switchControlHeight
      : controlKind === "color"
        ? geometry.swatchControlHeight
        : valueRect.height;
  return {
    x: valueRect.x + valueRect.width - width,
    y: valueRect.y + (valueRect.height - height) / 2,
    width,
    height,
  };
}

function filterEdgeInputs(
  shownParamIds: NormalizedShownParamIds,
  edgeInputParams: string[] | null,
) {
  if (!edgeInputParams || edgeInputParams.length === 0) {
    return shownParamIds;
  }
  const edgeInputSet = new Set(edgeInputParams);
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(
    shownParamIds.requiredParamIdsToPaths,
  )) {
    if (!edgeInputSet.has(paramId)) {
      requiredParamIdsToPaths[paramId] = path;
    }
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: shownParamIds.topLevelParamIds.filter(
      (paramId) => !edgeInputSet.has(paramId),
    ),
  };
}

function normalizeShownParamIds(
  shownParamIds: ReturnType<typeof getCurrShownParamIds>,
): NormalizedShownParamIds {
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(
    shownParamIds.requiredParamIdsToPaths,
  )) {
    requiredParamIdsToPaths[paramId] = path ?? [];
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: shownParamIds.topLevelParamIds ?? [],
  };
}

function getSceneTopLevelSections(
  state: ZustandProjectState,
): ProjectConfig["topLevelSections"] {
  const { activeViewModeId, topLevelSections, viewModes } = state.projectConfig;
  const viewMode = activeViewModeId ? viewModes[activeViewModeId] : undefined;
  if (!viewMode) {
    return topLevelSections;
  }
  const viewModeLayout = viewMode.topLevelSections;
  if (!viewModeLayout || Object.keys(viewModeLayout).length === 0) {
    return topLevelSections;
  }
  if (Object.keys(topLevelSections).length === 0) {
    return viewModeLayout;
  }
  return { ...topLevelSections, ...viewModeLayout };
}

function normalizeViewport(
  projectConfig: ProjectConfig,
): ParamDictSceneViewport | null {
  const viewport = projectConfig.viewport;
  if (!viewport || viewport.zoom <= 0) {
    return null;
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

function resolveColumnWidth(
  sectionImpl: DictSectionImpl,
  bodyRect: ParamDictSceneRect,
  geometry: ParamDictSceneGeometry,
) {
  const requested = sectionImpl.columnWidth ?? geometry.defaultColumnWidth;
  const maxColumnWidth = Math.max(
    0,
    bodyRect.width -
      geometry.sectionBodyPaddingX * 2 -
      geometry.rowCenterGutterWidth -
      geometry.minValueColumnWidth,
  );
  return clamp(requested, 0, maxColumnWidth);
}

function resolveSectionSizeValue(
  value: unknown,
  fallback: number,
  sectionId: string,
  fieldName: "height" | "width",
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === "auto") {
    return fallback;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "Value" in value &&
    typeof value.Value === "number" &&
    Number.isFinite(value.Value)
  ) {
    return value.Value;
  }
  throw new Error(`Dict section ${sectionId} has invalid ${fieldName} size.`);
}

function getRowsContentHeight(
  rowCount: number,
  geometry: ParamDictSceneGeometry,
) {
  if (rowCount <= 0) {
    return 0;
  }
  return (
    geometry.rowPaddingY * 2 +
    rowCount * geometry.rowHeight +
    (rowCount - 1) * geometry.rowGap
  );
}

function getListHeaderHeight(
  listKey: ParamDictSceneRowListKey,
  geometry: ParamDictSceneGeometry,
) {
  return listKey === "pinned" ? geometry.pinnedHeaderHeight : 0;
}

function zeroHeightRect(
  x: number,
  y: number,
  width: number,
): ParamDictSceneRect {
  return { x, y, width, height: 0 };
}

function getUnionBounds(rects: ParamDictSceneRect[]): ParamDictSceneRect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
