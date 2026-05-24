import {
  CodeObjTypeEnum,
  isBaseParentCodeObjImpl,
  type BaseCodeObjImplUnion,
  type Core,
  type DictSectionImpl,
} from "utils/generatedTypes";
import type {
  WorkspaceCanvasControllerState,
  WorkspaceSceneTarget,
} from "./workspaceController";
import {
  buildWorkspaceCodeHighlightCacheKey,
  getWorkspaceCodeHighlightTokenRuns,
  hashWorkspaceCodePreviewValue,
  type WorkspaceCodeHighlightCacheState,
} from "./workspaceHighlightCache";
import {
  buildCacheKey,
  clamp,
  deriveScrollbar,
  getSectionHitZIndex,
  intersectRects,
} from "./workspaceSceneGeometry";
import {
  filterEdgeInputParams,
  getEffectiveCodeObjSnapshot,
  getShownParamIdsForSection,
  normalizeShownParamDetails,
} from "./workspaceSceneProject";
import {
  WORKSPACE_PARAM_SUPPORT,
  WORKSPACE_SCENE_GEOMETRY,
  type CanvasControlKind,
  type NormalizedShownParamDetails,
  type WorkspaceDictRowScene,
  type WorkspaceDictScene,
  type WorkspaceHitRegion,
  type WorkspaceParamSupportDeclaration,
  type WorkspacePassiveCodePreview,
  type WorkspacePassiveValuePreview,
  type WorkspaceRect,
  type WorkspaceSceneProjectState,
  type WorkspaceSceneRevisionKeys,
  type WorkspaceSectionScene,
  type WorkspaceTypeErrorState,
} from "./workspaceSceneTypes";

type FlatDictParamRow = {
  id: string;
  sectionId: string;
  paramId: string;
  list: "pinned" | "unpinned";
  depth: number;
  parentParamId: string | null;
  path: Array<string>;
};

type PassivePreviewBuilder = (
  impl: BaseCodeObjImplUnion,
) => WorkspacePassiveValuePreview;

const PASSIVE_PREVIEW_BUILDERS: Record<string, PassivePreviewBuilder> = {
  [CodeObjTypeEnum.PasswordParam]: buildPasswordPreview,
  [CodeObjTypeEnum.SwitchParam]: buildSwitchPreview,
  [CodeObjTypeEnum.ColorPickerParam]: buildColorPreview,
  [CodeObjTypeEnum.DropdownParam]: buildDropdownPreview,
  [CodeObjTypeEnum.SliderParam]: buildNumberPreview,
  [CodeObjTypeEnum.RotaryParam]: buildNumberPreview,
  [CodeObjTypeEnum.ButtonParam]: buildButtonPreview,
  [CodeObjTypeEnum.NestedParam]: buildNestedPreview,
  [CodeObjTypeEnum.CodeParam]: buildCodePreviewValue,
  [CodeObjTypeEnum.TextParam]: buildTextPreview,
  [CodeObjTypeEnum.DateParam]: buildTextPreview,
  [CodeObjTypeEnum.TimeParam]: buildTextPreview,
  [CodeObjTypeEnum.TextAreaParam]: buildTextPreview,
};

export function getWorkspaceParamSupportDeclaration(
  impl: BaseCodeObjImplUnion,
): WorkspaceParamSupportDeclaration {
  if (
    impl.type === CodeObjTypeEnum.ColorPickerParam &&
    !hasColorChoices(impl)
  ) {
    return {
      canvasSupport: { passive: "preview", active: "dom-native-overlay" },
      activeInputStrategy: "dom-native-overlay",
      commitMode: "onExplicitApply",
      controlKind: "color-swatch",
      primaryHitIntent: "open-dom-overlay",
    };
  }
  return (
    WORKSPACE_PARAM_SUPPORT[impl.type] ?? {
      canvasSupport: {
        passive: "unsupported-placeholder",
        active: "unsupported",
      },
      activeInputStrategy: "unsupported",
      commitMode: "none",
      controlKind: "unsupported",
      primaryHitIntent: "unsupported",
    }
  );
}

export function deriveDictScene({
  projectState,
  section,
  sectionImpl,
  revisionKeys,
  controllerState,
  typeErrors,
  highlightCache,
}: {
  projectState: WorkspaceSceneProjectState;
  section: WorkspaceSectionScene;
  sectionImpl: DictSectionImpl;
  revisionKeys: WorkspaceSceneRevisionKeys;
  controllerState: WorkspaceCanvasControllerState;
  typeErrors: WorkspaceTypeErrorState;
  highlightCache: WorkspaceCodeHighlightCacheState | undefined;
}): WorkspaceDictScene {
  const { pinnedFlat, unpinnedFlat } = flattenVisibleDictRows(
    projectState,
    section.id,
    sectionImpl,
  );
  const layout = deriveDictRegionLayout({
    section,
    pinnedRowCount: pinnedFlat.length,
    unpinnedRowCount: unpinnedFlat.length,
    requestedScrollOffset:
      controllerState.sectionScrollOffsets[section.id] ?? 0,
  });
  const visibleRowRange = deriveVisibleRowRange({
    rowCount: unpinnedFlat.length,
    scrollOffset: layout.scrollOffset,
    viewportHeight: layout.unpinnedRegion.height,
    rowPitch: layout.rowPitch,
    overscan: WORKSPACE_SCENE_GEOMETRY.dictRowOverscan,
  });
  const rows = [
    ...materializeRows({
      projectState,
      section,
      sectionImpl,
      revisionKeys,
      controllerState,
      highlightCache,
      typeErrors,
      flatRows: pinnedFlat,
      region: layout.pinnedRegion,
      clipRegion: layout.pinnedRegion,
      scrollOffset: 0,
      isVisible: () => true,
    }),
    ...materializeRows({
      projectState,
      section,
      sectionImpl,
      revisionKeys,
      controllerState,
      highlightCache,
      typeErrors,
      flatRows: unpinnedFlat,
      region: layout.unpinnedRegion,
      clipRegion: layout.unpinnedRegion,
      scrollOffset: layout.scrollOffset,
      isVisible: (index) =>
        index >= visibleRowRange.start && index < visibleRowRange.end,
    }),
  ];
  const scrollbar = deriveScrollbar({
    region: layout.unpinnedRegion,
    contentHeight: layout.unpinnedContentHeight,
    scrollOffset: layout.scrollOffset,
  });
  const hitRegions = rows.flatMap((row) => row.hitRegions);
  if (scrollbar) {
    hitRegions.push(buildScrollbarHitRegion(section, scrollbar.track));
  }
  return {
    sectionId: section.id,
    pinnedRegion: layout.pinnedRegion,
    unpinnedRegion: layout.unpinnedRegion,
    scrollOffset: layout.scrollOffset,
    visibleRowRange,
    contentHeight: layout.pinnedHeight + layout.unpinnedContentHeight,
    rows,
    scrollbar,
    hitRegions,
  };
}

function flattenVisibleDictRows(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
  sectionImpl: DictSectionImpl,
) {
  const shown = getShownParamIdsForSection(projectState, sectionId);
  const edgeInputParams = new Set(sectionImpl.edgeInputParams ?? []);
  const pinned = filterEdgeInputParams(
    normalizeShownParamDetails(shown.pinned),
    edgeInputParams,
  );
  const unpinned = filterEdgeInputParams(
    normalizeShownParamDetails(shown.unpinned),
    edgeInputParams,
  );
  return {
    pinnedFlat: flattenDictParamRows({
      projectState,
      sectionId,
      sectionImpl,
      list: "pinned",
      shown: pinned,
    }),
    unpinnedFlat: sectionImpl.hideUnpinnedParams
      ? []
      : flattenDictParamRows({
          projectState,
          sectionId,
          sectionImpl,
          list: "unpinned",
          shown: unpinned,
        }),
  };
}

function flattenDictParamRows({
  projectState,
  sectionId,
  sectionImpl,
  list,
  shown,
}: {
  projectState: WorkspaceSceneProjectState;
  sectionId: string;
  sectionImpl: DictSectionImpl;
  list: "pinned" | "unpinned";
  shown: NormalizedShownParamDetails;
}): Array<FlatDictParamRow> {
  const visibleSet = new Set(Object.keys(shown.requiredParamIdsToPaths));
  const rows: Array<FlatDictParamRow> = [];
  const rootId = sectionImpl.topLevelParamId;

  function walk(paramId: string, depth: number, parentParamId: string | null) {
    if (!visibleSet.has(paramId)) {
      return;
    }
    const codeObj = getEffectiveCodeObjSnapshot(
      projectState,
      sectionImpl,
      paramId,
    );
    if (!codeObj) {
      throw new Error(
        `Workspace scene cannot derive Dict row ${paramId} in section ${sectionId}: missing Param implementation.`,
      );
    }
    rows.push({
      id: `dict-row:${sectionId}:${list}:${paramId}`,
      sectionId,
      paramId,
      list,
      depth,
      parentParamId,
      path: shown.requiredParamIdsToPaths[paramId] ?? [paramId],
    });
    const impl = codeObj.effectiveImpl;
    if (isBaseParentCodeObjImpl(impl)) {
      for (const childId of impl.children ?? []) {
        walk(childId, depth + 1, paramId);
      }
    }
  }

  for (const paramId of shown.topLevelParamIds) {
    walk(paramId, 0, rootId);
  }

  return rows;
}

function deriveDictRegionLayout({
  section,
  pinnedRowCount,
  unpinnedRowCount,
  requestedScrollOffset,
}: {
  section: WorkspaceSectionScene;
  pinnedRowCount: number;
  unpinnedRowCount: number;
  requestedScrollOffset: number;
}) {
  const body = section.geometry.body;
  const padding = WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding;
  const rowPitch =
    WORKSPACE_SCENE_GEOMETRY.dictRowHeight +
    WORKSPACE_SCENE_GEOMETRY.dictRowGap;
  const pinnedHeight = deriveRowsContentHeight(pinnedRowCount, rowPitch);
  const pinnedRegion = {
    x: body.x,
    y: body.y,
    width: body.width,
    height: Math.min(pinnedHeight, Math.max(0, body.height)),
  };
  const unpinnedRegion = {
    x: body.x,
    y: body.y + pinnedRegion.height,
    width: body.width,
    height: Math.max(0, body.height - pinnedRegion.height),
  };
  const unpinnedContentHeight = deriveRowsContentHeight(
    unpinnedRowCount,
    rowPitch,
  );
  const maxScroll = Math.max(0, unpinnedContentHeight - unpinnedRegion.height);
  return {
    rowPitch,
    pinnedHeight,
    pinnedRegion,
    unpinnedRegion,
    unpinnedContentHeight,
    scrollOffset: clamp(requestedScrollOffset, 0, maxScroll),
    padding,
  };
}

function materializeRows({
  flatRows,
  isVisible,
  ...args
}: {
  projectState: WorkspaceSceneProjectState;
  section: WorkspaceSectionScene;
  sectionImpl: DictSectionImpl;
  revisionKeys: WorkspaceSceneRevisionKeys;
  controllerState: WorkspaceCanvasControllerState;
  highlightCache: WorkspaceCodeHighlightCacheState | undefined;
  typeErrors: WorkspaceTypeErrorState;
  flatRows: Array<FlatDictParamRow>;
  region: WorkspaceRect;
  clipRegion: WorkspaceRect;
  scrollOffset: number;
  isVisible: (index: number) => boolean;
}) {
  return flatRows.map((flat, index) =>
    materializeDictRow({
      ...args,
      flat,
      listIndex: index,
      visible: isVisible(index),
    }),
  );
}

function materializeDictRow({
  projectState,
  section,
  sectionImpl,
  revisionKeys,
  controllerState,
  highlightCache,
  typeErrors,
  flat,
  listIndex,
  region,
  clipRegion,
  scrollOffset,
  visible,
}: {
  projectState: WorkspaceSceneProjectState;
  section: WorkspaceSectionScene;
  sectionImpl: DictSectionImpl;
  revisionKeys: WorkspaceSceneRevisionKeys;
  controllerState: WorkspaceCanvasControllerState;
  highlightCache: WorkspaceCodeHighlightCacheState | undefined;
  typeErrors: WorkspaceTypeErrorState;
  flat: FlatDictParamRow;
  listIndex: number;
  region: WorkspaceRect;
  clipRegion: WorkspaceRect;
  scrollOffset: number;
  visible: boolean;
}): WorkspaceDictRowScene {
  const codeObj = getEffectiveCodeObjSnapshot(
    projectState,
    sectionImpl,
    flat.paramId,
  );
  if (!codeObj) {
    throw new Error(
      `Workspace scene cannot materialize Dict row ${flat.paramId}: missing Param implementation.`,
    );
  }
  const rect = deriveRowRect(region, listIndex, scrollOffset);
  const labelColumnWidth = deriveLabelColumnWidth(sectionImpl, rect.width);
  const labelRect = deriveLabelRect(rect, labelColumnWidth, flat.depth);
  const valueRect = deriveValueRect(rect, labelColumnWidth);
  const visibleRect = visible ? intersectRects(rect, clipRegion) : null;
  const support = getWorkspaceParamSupportDeclaration(codeObj.effectiveImpl);
  const passiveValue = derivePassiveValuePreview(codeObj.effectiveImpl);
  const interactionState = deriveDictRowInteractionState(
    controllerState,
    section.id,
    flat.id,
  );
  const row = {
    ...flat,
    index: listIndex,
    paramType: codeObj.effectiveImpl.type,
    label: resolveParamLabel({
      core: codeObj.core,
      impl: codeObj.effectiveImpl,
      showParamDisplayNames: projectState.projectConfig.showParamDisplayNames,
    }),
    rect,
    labelRect,
    valueRect,
    controlRect: deriveControlRect(valueRect, support.controlKind),
    visibleRect,
    nestingRails: deriveNestingRails(rect, flat.depth),
    visible,
    ...interactionState,
    passiveValue,
    codePreview: deriveCodePreview({
      section,
      sectionImpl,
      paramId: flat.paramId,
      impl: codeObj.effectiveImpl,
      passiveValue,
      revisionKeys,
      previewWidth: valueRect.width,
      highlightCache,
    }),
    errors: typeErrors[section.id]?.params?.[flat.paramId] ?? [],
    support,
    hitRegions: [] as Array<WorkspaceHitRegion>,
    cacheKeys: deriveRowCacheKeys(revisionKeys, section.id, flat.paramId, {
      valueWidth: valueRect.width,
      valueText: passiveValue.text,
    }),
  };
  return {
    ...row,
    hitRegions: buildRowHitRegions(section, row),
  };
}

function deriveDictRowInteractionState(
  controllerState: WorkspaceCanvasControllerState,
  sectionId: string,
  rowId: string,
) {
  return {
    selected: targetReferencesDictRow(
      controllerState.selectedTarget,
      sectionId,
      rowId,
    ),
    hovered: targetReferencesDictRow(
      controllerState.hoveredTarget,
      sectionId,
      rowId,
    ),
    active: activeTargetReferencesDictRow(controllerState, sectionId, rowId),
    focused: targetReferencesDictRow(
      controllerState.keyboardFocusedTarget,
      sectionId,
      rowId,
    ),
  };
}

function activeTargetReferencesDictRow(
  controllerState: WorkspaceCanvasControllerState,
  sectionId: string,
  rowId: string,
) {
  return (
    targetReferencesDictRow(
      controllerState.activeEditorSession?.target ?? null,
      sectionId,
      rowId,
    ) ||
    targetReferencesDictRow(
      controllerState.activeControlState?.target ?? null,
      sectionId,
      rowId,
    )
  );
}

function targetReferencesDictRow(
  target: WorkspaceSceneTarget | null,
  sectionId: string,
  rowId: string,
) {
  return (
    (target?.kind === "dict-row" || target?.kind === "control") &&
    target.sectionId === sectionId &&
    target.rowId === rowId
  );
}

function deriveCodePreview({
  section,
  sectionImpl,
  paramId,
  impl,
  passiveValue,
  revisionKeys,
  previewWidth,
  highlightCache,
}: {
  section: WorkspaceSectionScene;
  sectionImpl: DictSectionImpl;
  paramId: string;
  impl: BaseCodeObjImplUnion;
  passiveValue: WorkspacePassiveValuePreview;
  revisionKeys: WorkspaceSceneRevisionKeys;
  previewWidth: number;
  highlightCache: WorkspaceCodeHighlightCacheState | undefined;
}): WorkspacePassiveCodePreview | null {
  if (impl.type !== CodeObjTypeEnum.CodeParam) {
    return null;
  }
  const language = sectionImpl.configLanguage || "python";
  const cacheKey = buildWorkspaceCodeHighlightCacheKey({
    sectionId: section.id,
    paramId,
    codeHash: hashWorkspaceCodePreviewValue(passiveValue.text),
    language,
    themeRevision: revisionKeys.themeRevision,
    fontRevision: revisionKeys.fontRevision,
    highlighterRevision: revisionKeys.highlighterRevision,
    previewWidth,
    previewLineLimit: 6,
  });
  return {
    language,
    cacheKey,
    tokenRuns: highlightCache
      ? getWorkspaceCodeHighlightTokenRuns(highlightCache, cacheKey)
      : null,
  };
}

function derivePassiveValuePreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return (
    PASSIVE_PREVIEW_BUILDERS[impl.type]?.(impl) ?? {
      kind: "unsupported",
      text: "",
      swatchColor: null,
      choices: [],
      masked: false,
    }
  );
}

function deriveVisibleRowRange({
  rowCount,
  scrollOffset,
  viewportHeight,
  rowPitch,
  overscan,
}: {
  rowCount: number;
  scrollOffset: number;
  viewportHeight: number;
  rowPitch: number;
  overscan: number;
}) {
  if (rowCount === 0 || viewportHeight <= 0) {
    return { start: 0, end: 0, overscan };
  }
  const rawStart = Math.floor(scrollOffset / rowPitch);
  const rawEnd = Math.ceil((scrollOffset + viewportHeight) / rowPitch);
  return {
    start: clamp(rawStart - overscan, 0, rowCount),
    end: clamp(rawEnd + overscan, 0, rowCount),
    overscan,
  };
}

function deriveRowsContentHeight(rowCount: number, rowPitch: number) {
  return rowCount === 0
    ? 0
    : rowCount * rowPitch -
        WORKSPACE_SCENE_GEOMETRY.dictRowGap +
        WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding * 2;
}

function deriveRowRect(
  region: WorkspaceRect,
  listIndex: number,
  scrollOffset: number,
): WorkspaceRect {
  const rowPitch =
    WORKSPACE_SCENE_GEOMETRY.dictRowHeight +
    WORKSPACE_SCENE_GEOMETRY.dictRowGap;
  return {
    x: region.x + WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding,
    y:
      region.y +
      WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding +
      listIndex * rowPitch -
      scrollOffset,
    width: Math.max(
      0,
      region.width - WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding * 2,
    ),
    height: WORKSPACE_SCENE_GEOMETRY.dictRowHeight,
  };
}

function deriveLabelColumnWidth(
  sectionImpl: DictSectionImpl,
  rowWidth: number,
) {
  const maxWidth = rowWidth * WORKSPACE_SCENE_GEOMETRY.dictLabelColumnMaxRatio;
  const preferred =
    sectionImpl.columnWidth ?? WORKSPACE_SCENE_GEOMETRY.dictLabelColumnWidth;
  return clamp(
    preferred,
    WORKSPACE_SCENE_GEOMETRY.dictLabelColumnMinWidth,
    Math.max(WORKSPACE_SCENE_GEOMETRY.dictLabelColumnMinWidth, maxWidth),
  );
}

function deriveLabelRect(
  rect: WorkspaceRect,
  labelColumnWidth: number,
  depth: number,
): WorkspaceRect {
  const labelX =
    rect.x +
    WORKSPACE_SCENE_GEOMETRY.dictNestingIndent * depth +
    WORKSPACE_SCENE_GEOMETRY.dictNestingRailWidth;
  return {
    x: labelX,
    y: rect.y,
    width: Math.max(
      WORKSPACE_SCENE_GEOMETRY.dictLabelColumnMinWidth,
      labelColumnWidth - WORKSPACE_SCENE_GEOMETRY.dictNestingIndent * depth,
    ),
    height: rect.height,
  };
}

function deriveValueRect(
  rect: WorkspaceRect,
  labelColumnWidth: number,
): WorkspaceRect {
  const valueX =
    rect.x + labelColumnWidth + WORKSPACE_SCENE_GEOMETRY.dictValueGap;
  return {
    x: valueX,
    y: rect.y,
    width: Math.max(0, rect.x + rect.width - valueX),
    height: rect.height,
  };
}

function deriveControlRect(
  valueRect: WorkspaceRect,
  controlKind: CanvasControlKind,
): WorkspaceRect {
  const fixedWidthByKind: Partial<Record<CanvasControlKind, number>> = {
    toggle: 48,
    "color-swatch": 80,
    button: 96,
    dropdown: Math.min(160, valueRect.width),
    slider: valueRect.width,
  };
  const fixedWidth = fixedWidthByKind[controlKind] ?? valueRect.width;
  const width = Math.max(
    Math.min(valueRect.width, fixedWidth),
    Math.min(valueRect.width, WORKSPACE_SCENE_GEOMETRY.dictControlMinWidth),
  );
  return {
    x: valueRect.x + valueRect.width - width,
    y: valueRect.y,
    width,
    height: valueRect.height,
  };
}

function deriveNestingRails(
  rect: WorkspaceRect,
  depth: number,
): Array<WorkspaceRect> {
  return Array.from({ length: depth }, (_, index) => ({
    x:
      rect.x +
      index * WORKSPACE_SCENE_GEOMETRY.dictNestingIndent +
      WORKSPACE_SCENE_GEOMETRY.dictNestingRailWidth / 2,
    y: rect.y + 3,
    width: WORKSPACE_SCENE_GEOMETRY.dictNestingRailWidth,
    height: Math.max(0, rect.height - 6),
  }));
}

function buildRowHitRegions(
  section: WorkspaceSectionScene,
  row: WorkspaceDictRowScene,
): Array<WorkspaceHitRegion> {
  if (!row.visibleRect) {
    return [];
  }
  const zIndexBase = getSectionRowHitZIndexBase(section);
  const rowTarget: WorkspaceSceneTarget = {
    kind: "dict-row",
    sectionId: section.id,
    sectionPath: section.sectionPath,
    rowId: row.id,
    paramId: row.paramId,
  };
  const regions: Array<WorkspaceHitRegion> = [
    {
      id: `${row.id}:row`,
      coordinateSpace: "workspace",
      rect: row.visibleRect,
      intent: "select-row",
      target: rowTarget,
      zIndex: zIndexBase + 100 + row.index,
    },
  ];
  const controlHitRect = intersectRects(row.controlRect, row.visibleRect);
  if (row.support.primaryHitIntent !== "unsupported" && controlHitRect) {
    regions.push({
      id: `${row.id}:control`,
      coordinateSpace: "workspace",
      rect: controlHitRect,
      intent: row.support.primaryHitIntent,
      target: {
        kind: "control",
        sectionId: section.id,
        sectionPath: section.sectionPath,
        rowId: row.id,
        paramId: row.paramId,
        controlId: `${row.id}:control`,
      },
      zIndex: zIndexBase + 200 + row.index,
    });
  }
  return regions;
}

function buildScrollbarHitRegion(
  section: WorkspaceSectionScene,
  track: WorkspaceRect,
): WorkspaceHitRegion {
  return {
    id: `dict:${section.id}:scrollbar`,
    coordinateSpace: "workspace",
    rect: track,
    intent: "scrollbar",
    target: {
      kind: "section",
      sectionId: section.id,
      sectionPath: section.sectionPath,
    },
    zIndex: getSectionRowHitZIndexBase(section) + 90,
  };
}

function getSectionRowHitZIndexBase(section: WorkspaceSectionScene) {
  const bodyRegion = section.hitRegions.find(
    (region) => region.id === `section:${section.id}:body`,
  );
  return bodyRegion ? bodyRegion.zIndex - 10 : getSectionHitZIndex(0, 0);
}

function deriveRowCacheKeys(
  revisionKeys: WorkspaceSceneRevisionKeys,
  sectionId: string,
  paramId: string,
  valueInfo: { valueWidth: number; valueText: string },
) {
  return {
    row: buildCacheKey(revisionKeys, "dict-row", sectionId, paramId),
    textMeasurement: buildCacheKey(
      revisionKeys,
      "text-measure",
      sectionId,
      paramId,
      String(Math.round(valueInfo.valueWidth)),
    ),
    valuePreview: buildCacheKey(
      revisionKeys,
      "value-preview",
      sectionId,
      paramId,
      valueInfo.valueText,
    ),
  };
}

function resolveParamLabel({
  core,
  impl,
  showParamDisplayNames,
}: {
  core: Core;
  impl: BaseCodeObjImplUnion;
  showParamDisplayNames: boolean;
}) {
  if (hasBooleanField(impl, "coreNameEditable") && impl.coreNameEditable) {
    return getStringField(impl, "name") || core.name || core.id;
  }
  if (showParamDisplayNames && core.displayName.trim().length > 0) {
    return core.displayName;
  }
  return core.name || getStringField(impl, "name") || core.id;
}

function buildPasswordPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "password",
    text:
      getStringValue(impl).length > 0 || getBooleanField(impl, "hasSecret")
        ? "********"
        : "",
    swatchColor: null,
    choices: [],
    masked: true,
  };
}

function buildSwitchPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const value = getStringValue(impl).toLowerCase();
  return {
    kind: "boolean",
    text: value === "true" || value === "1" ? "On" : "Off",
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildColorPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const color = getStringValue(impl);
  return {
    kind: "color",
    text: color,
    swatchColor: color.trim().length > 0 ? color : null,
    choices: getColorChoiceValues(impl),
    masked: false,
  };
}

function buildDropdownPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "choice",
    text: getStringValue(impl),
    swatchColor: null,
    choices: getStringArrayField(impl, "choices"),
    masked: false,
  };
}

function buildNumberPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "number",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildButtonPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "button",
    text: getStringField(impl, "label") || getStringField(impl, "name"),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildNestedPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const children = isBaseParentCodeObjImpl(impl) ? impl.children ?? [] : [];
  return {
    kind: "nested",
    text: `${children.length} fields`,
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildCodePreviewValue(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "code",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildTextPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "text",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function hasStringValue(
  impl: BaseCodeObjImplUnion,
): impl is BaseCodeObjImplUnion & {
  value: string;
} {
  return typeof (impl as { value?: unknown }).value === "string";
}

function getStringValue(impl: BaseCodeObjImplUnion) {
  return hasStringValue(impl) ? impl.value : getStringField(impl, "defaultVal");
}

function getStringField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function hasBooleanField<T extends string>(
  impl: BaseCodeObjImplUnion,
  key: T,
): impl is BaseCodeObjImplUnion & Record<T, boolean> {
  return typeof (impl as Record<string, unknown>)[key] === "boolean";
}

function getBooleanField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : false;
}

function getStringArrayField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function hasColorChoices(impl: BaseCodeObjImplUnion) {
  const value = (impl as { colorChoices?: unknown }).colorChoices;
  return Array.isArray(value) && value.length > 0;
}

function getColorChoiceValues(impl: BaseCodeObjImplUnion) {
  const value = (impl as { colorChoices?: unknown }).colorChoices;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const color = record.color ?? record.value;
      return typeof color === "string" ? color : null;
    })
    .filter((entry): entry is string => entry !== null);
}
