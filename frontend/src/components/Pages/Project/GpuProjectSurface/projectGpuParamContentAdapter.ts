import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import {
  resolveFilteredParamRows,
  type FilteredParamRows,
} from "components/Params/paramListFiltering";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "gpuFlow/retainedContentScene";
import {
  clampGpuRetainedContentScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
} from "gpuFlow/retainedContentScroll";
import type { GpuContentSurface, GpuSectionSceneNode } from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getCurrSectionVariantId,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  getEdgesStripHeightKey,
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getPinnedParamsAreaHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type CodeObjType,
  type DictSectionImpl,
} from "utils/generatedTypes";

export const PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX = 28;

type ProjectGpuParamListKey = "pinned" | "unpinned";

type ProjectGpuParamListRows = {
  readonly key: ProjectGpuParamListKey;
  readonly rows: readonly GpuRetainedContentRowInput[];
};

export function createProjectGpuParamContentSurfaces({
  contentScrollOffsets,
  measuredHeightsByKey,
  projectState,
  sections,
}: {
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly projectState: ZustandProjectState;
  readonly sections: readonly GpuSectionSceneNode[];
}): readonly GpuContentSurface[] {
  return sections.flatMap((section) =>
    createProjectGpuParamContentSurfacesForSection({
      contentScrollOffsets,
      measuredHeightsByKey,
      projectState,
      section,
    }),
  );
}

function createProjectGpuParamContentSurfacesForSection({
  contentScrollOffsets,
  measuredHeightsByKey,
  projectState,
  section,
}: {
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly projectState: ZustandProjectState;
  readonly section: GpuSectionSceneNode;
}): readonly GpuContentSurface[] {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    projectState,
    section.sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Dict) {
    return [];
  }
  const dictSectionImpl = sectionImpl as DictSectionImpl;

  const listRows = createProjectGpuParamListRows({
    projectState,
    sectionId: section.sectionId,
    sectionImpl: dictSectionImpl,
  });
  return createProjectGpuParamListContentSurfaces({
    contentScrollOffsets,
    listRows,
    measuredHeightsByKey,
    section,
  });
}

function createProjectGpuParamListRows({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}): readonly ProjectGpuParamListRows[] {
  return (["pinned", "unpinned"] as const).flatMap((key) => {
    if (key === "unpinned" && sectionImpl.hideUnpinnedParams) {
      return [];
    }
    const shown = getProjectGpuShownParamRowsIfPresent({
      key,
      projectState,
      sectionId,
      sectionImpl,
    });
    if (!shown) {
      return [];
    }
    const normalizedShown = normalizeProjectGpuShownParamRows({
      key,
      sectionId,
      shown,
    });
    const filteredRows = resolveFilteredParamRows({
      paramFilter: sectionImpl.paramFilter,
      paramIds: normalizedShown.topLevelParamIds,
      requiredParamIdsToPaths: normalizedShown.requiredParamIdsToPaths,
      sectionId,
      state: projectState,
    });
    if (filteredRows.paramIds.length === 0) {
      return [];
    }
    return [
      {
        key,
        rows: createProjectGpuParamRows({
          filteredRows,
          projectState,
          sectionId,
          sectionImpl,
        }),
      },
    ];
  });
}

function getProjectGpuShownParamRowsIfPresent({
  key,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}) {
  const sectionVariantId = getCurrSectionVariantId(
    projectState,
    sectionId,
    true,
  );
  if (!projectState.shownParamIds[sectionVariantId]) {
    if (Object.keys(sectionImpl.codeObjVariantMap).length > 0) {
      throw new Error(
        `Missing shown param ids for GPU param content section ${sectionId}.`,
      );
    }
    return null;
  }
  return getCurrShownParamIds(projectState, sectionId, key === "pinned", true);
}

function normalizeProjectGpuShownParamRows({
  key,
  sectionId,
  shown,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly sectionId: string;
  readonly shown: ReturnType<typeof getCurrShownParamIds>;
}): {
  readonly requiredParamIdsToPaths: Record<string, string[]>;
  readonly topLevelParamIds: string[];
} {
  if (!Array.isArray(shown.topLevelParamIds)) {
    throw new Error(
      `Invalid ${key} shown param ids for GPU param content section ${sectionId}.`,
    );
  }
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(
    shown.requiredParamIdsToPaths ?? {},
  )) {
    if (!Array.isArray(path)) {
      throw new Error(
        `Invalid shown param path for GPU param content row ${paramId} in section ${sectionId}.`,
      );
    }
    requiredParamIdsToPaths[paramId] = [...path];
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: [...shown.topLevelParamIds],
  };
}

function createProjectGpuParamRows({
  filteredRows,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly filteredRows: FilteredParamRows;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}): readonly GpuRetainedContentRowInput[] {
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    filteredRows.paramIds,
    filteredRows.requiredParamIdsToPaths,
  );
  const selectedParamIds = new Set(sectionImpl.selectedParams ?? []);
  const edgeInputParamIds = new Set(sectionImpl.edgeInputParams);
  return tree.flat.map((row) => {
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      projectState,
      sectionId,
      row.id,
      isBaseParamCodeObjImpl,
    );
    if (!codeObjImpl) {
      throw new Error(
        `Missing GPU retained param row ${row.id} in section ${sectionId}.`,
      );
    }
    return {
      controlKind: getProjectGpuParamControlKind({
        fallbackType: codeObjImpl.type as CodeObjType,
        isParent: row.isParent,
        rendererFamily: getSectionParamUIRendererFamily(
          codeObjImpl.type as CodeObjType,
        ),
      }),
      depth: row.depth,
      id: row.id,
      label:
        getParamDisplayNameIfPresent(projectState, sectionId, row.id) ?? row.id,
      ports: edgeInputParamIds.has(row.id)
        ? [{ id: row.id, kind: "input", side: "left" }]
        : [],
      state: {
        selected: selectedParamIds.has(row.id),
      },
    };
  });
}

function getProjectGpuParamControlKind({
  fallbackType,
  isParent,
  rendererFamily,
}: {
  readonly fallbackType: CodeObjType;
  readonly isParent: boolean;
  readonly rendererFamily: SectionParamUIRendererFamily | null;
}): string {
  if (isParent) {
    return "nested";
  }
  return rendererFamily ?? fallbackType;
}

function createProjectGpuParamListContentSurfaces({
  contentScrollOffsets,
  listRows,
  measuredHeightsByKey,
  section,
}: {
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly listRows: readonly ProjectGpuParamListRows[];
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly section: GpuSectionSceneNode;
}): readonly GpuContentSurface[] {
  const surfaces: GpuContentSurface[] = [];
  const metrics = getProjectGpuParamContentMetrics({
    measuredHeightsByKey,
    sectionId: section.sectionId,
  });
  let nextLocalY = metrics.contentTop;
  for (const list of listRows) {
    const listLocalY = getProjectGpuParamListLocalY({
      listKey: list.key,
      metrics,
      nextLocalY,
    });
    const remainingHeight = Math.max(0, section.bodyRect.height - listLocalY);
    const contentHeight =
      list.rows.length * PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
    const height = getProjectGpuParamListSurfaceHeight({
      contentHeight,
      listKey: list.key,
      metrics,
      remainingHeight,
    });
    if (height <= 0) {
      continue;
    }
    const localRect = {
      height,
      width: section.bodyRect.width,
      x: 0,
      y: listLocalY,
    };
    const surfaceId = getProjectGpuParamContentSurfaceId(
      section.sectionId,
      list.key,
    );
    const rect = translateProjectGpuParamLocalRect(localRect, section.bodyRect);
    const viewportRect = {
      height: localRect.height,
      width: localRect.width,
      x: 0,
      y: 0,
    };
    const scrollOffset = clampGpuRetainedContentScrollOffset({
      contentRect: {
        height: contentHeight,
        width: localRect.width,
      },
      scrollOffset: contentScrollOffsets?.get(surfaceId) ?? { x: 0, y: 0 },
      viewportRect,
    });
    surfaces.push({
      clipRect: intersectProjectGpuParamRects(rect, section.clipRect),
      id: surfaceId,
      ownerSectionId: section.sectionId,
      rect,
      retainedScene: createGpuRetainedRowContentScene({
        id: surfaceId,
        ownerSectionId: section.sectionId,
        rowHeight: PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
        rows: list.rows,
        scrollOffset,
        viewportRect,
      }),
      renderer: { kind: "canvas-content", surfaceId },
      zIndex: (section.zIndex ?? 0) + 1,
    });
    nextLocalY = getProjectGpuParamNextLocalY({
      height,
      listKey: list.key,
      listLocalY,
      metrics,
    });
  }
  return surfaces;
}

function getProjectGpuParamContentMetrics({
  measuredHeightsByKey,
  sectionId,
}: {
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly sectionId: string;
}) {
  const headerHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getSectionHeaderHeightKey(sectionId),
  );
  const searchHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getSectionSearchHeightKey(sectionId),
  );
  const kwargsHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getKwargsControlsHeightKey(sectionId),
  );
  const edgesHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getEdgesStripHeightKey(sectionId),
  );
  const pinnedHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getPinnedParamsAreaHeightKey(sectionId),
  );
  const paramsFixedHeight = getMeasuredHeight(
    measuredHeightsByKey,
    getParamsFixedHeightKey(sectionId),
  );
  return {
    contentTop: headerHeight + searchHeight + kwargsHeight,
    edgesHeight,
    paramsFixedHeight,
    pinnedHeight,
  };
}

function getProjectGpuParamListLocalY({
  listKey,
  metrics,
  nextLocalY,
}: {
  readonly listKey: ProjectGpuParamListKey;
  readonly metrics: ReturnType<typeof getProjectGpuParamContentMetrics>;
  readonly nextLocalY: number;
}): number {
  if (listKey === "pinned") {
    return metrics.contentTop + metrics.edgesHeight;
  }
  return Math.max(nextLocalY, metrics.contentTop + metrics.paramsFixedHeight);
}

function getProjectGpuParamListSurfaceHeight({
  contentHeight,
  listKey,
  metrics,
  remainingHeight,
}: {
  readonly contentHeight: number;
  readonly listKey: ProjectGpuParamListKey;
  readonly metrics: ReturnType<typeof getProjectGpuParamContentMetrics>;
  readonly remainingHeight: number;
}): number {
  if (listKey === "pinned") {
    const pinnedHeight =
      metrics.pinnedHeight > 0 ? metrics.pinnedHeight : contentHeight;
    return Math.min(remainingHeight, pinnedHeight);
  }
  return remainingHeight;
}

function getProjectGpuParamNextLocalY({
  height,
  listKey,
  listLocalY,
  metrics,
}: {
  readonly height: number;
  readonly listKey: ProjectGpuParamListKey;
  readonly listLocalY: number;
  readonly metrics: ReturnType<typeof getProjectGpuParamContentMetrics>;
}): number {
  if (listKey === "pinned" && metrics.paramsFixedHeight > 0) {
    return Math.max(
      listLocalY + height,
      metrics.contentTop + metrics.paramsFixedHeight,
    );
  }
  return listLocalY + height;
}

function getMeasuredHeight(
  measuredHeightsByKey: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number {
  const value = measuredHeightsByKey?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function getProjectGpuParamContentSurfaceId(
  sectionId: string,
  key: ProjectGpuParamListKey,
): string {
  return `${sectionId}:param-content:${key}`;
}

function translateProjectGpuParamLocalRect(
  localRect: GpuRect,
  sectionRect: GpuRect,
): GpuRect {
  return {
    height: Math.min(localRect.height, sectionRect.height),
    width: Math.min(localRect.width, sectionRect.width),
    x: sectionRect.x + localRect.x,
    y: sectionRect.y + localRect.y,
  };
}

function intersectProjectGpuParamRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
