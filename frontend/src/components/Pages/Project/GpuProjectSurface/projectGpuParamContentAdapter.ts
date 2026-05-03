import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import {
  resolveFilteredParamRows,
  type FilteredParamRows,
} from "components/Params/paramListFiltering";
import type { GpuRetainedContentNavigationTarget } from "gpuFlow/retainedContentKeyboard";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentDragPreviewInput,
  type GpuRetainedContentHitRecord,
  type GpuRetainedContentRowInput,
} from "gpuFlow/retainedContentScene";
import {
  clampGpuRetainedContentScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
} from "gpuFlow/retainedContentScroll";
import type {
  GpuContentSurface,
  GpuDomIsland,
  GpuFlowScene,
  GpuSectionSceneNode,
} from "gpuFlow/scene";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getCurrSectionVariantId,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState, ZustandTypeErrors } from "state/definitions";
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
import {
  getProjectGpuParamDomIslandGeometry,
  intersectProjectGpuParamRects,
  translateProjectGpuParamLocalRect,
} from "./projectGpuParamDomIslandGeometry";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";

export const PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX = 28;

export type ProjectGpuParamListKey = "pinned" | "unpinned";

export type ProjectGpuRetainedParamTarget = {
  readonly hitRecordId: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
};

export type ProjectGpuActiveParamDomIsland = ProjectGpuRetainedParamTarget;

type ProjectGpuParamListRows = {
  readonly key: ProjectGpuParamListKey;
  readonly rows: readonly GpuRetainedContentRowInput[];
};

type ProjectGpuRetainedParamInteractionState = {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
};

type ProjectGpuRetainedParamSurface = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

type ProjectGpuParamDomIslandGeometry = ReturnType<
  typeof getProjectGpuParamDomIslandGeometry
>;

export function getProjectGpuRetainedParamNavigationTarget({
  activeSectionIds,
  projectState,
  scene,
}: {
  readonly activeSectionIds: readonly string[];
  readonly projectState: ZustandProjectState;
  readonly scene: GpuFlowScene;
}): GpuRetainedContentNavigationTarget | null {
  const activeSectionRank = new Map(
    activeSectionIds.map((sectionId, index) => [sectionId, index]),
  );
  const surfaces = scene.contentSurfaces
    .map((surface, index) => ({
      activeRank:
        activeSectionRank.get(surface.ownerSectionId) ??
        Number.MAX_SAFE_INTEGER,
      index,
      surface,
    }))
    .filter(
      (
        item,
      ): item is {
        readonly activeRank: number;
        readonly index: number;
        readonly surface: GpuContentSurface & {
          readonly retainedScene: NonNullable<
            GpuContentSurface["retainedScene"]
          >;
        };
      } => isProjectGpuRetainedParamSurface(item.surface),
    )
    .sort(
      (left, right) =>
        left.activeRank - right.activeRank ||
        right.surface.zIndex - left.surface.zIndex ||
        right.index - left.index,
    );
  for (const { surface } of surfaces) {
    const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      projectState,
      surface.ownerSectionId,
      isBaseSectionWithParamsImpl,
    );
    const selectedParams = sectionImpl?.selectedParams ?? [];
    if (selectedParams.length === 0) {
      continue;
    }
    const rowIds = new Set(surface.retainedScene.rowOrder);
    for (const selectedParamId of [...selectedParams].reverse()) {
      if (!rowIds.has(selectedParamId)) {
        continue;
      }
      return {
        ownerSectionId: surface.ownerSectionId,
        rowId: selectedParamId,
        surfaceId: surface.id,
      };
    }
  }
  return null;
}

export function createProjectGpuParamContentSurfaces({
  activeParamDomIsland,
  contentScrollOffsets,
  hoveredParamTarget,
  measuredHeightsByKey,
  projectState,
  retainedParamDragPreview,
  sections,
  typeErrors,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly projectState: ZustandProjectState;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
  readonly sections: readonly GpuSectionSceneNode[];
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
}): readonly GpuContentSurface[] {
  return sections.flatMap((section) =>
    createProjectGpuParamContentSurfacesForSection({
      activeParamDomIsland,
      contentScrollOffsets,
      hoveredParamTarget,
      measuredHeightsByKey,
      projectState,
      retainedParamDragPreview,
      section,
      typeErrors,
    }),
  );
}

export function createProjectGpuParamDomIslands({
  activeParamDomIsland,
  contentSurfaces,
  projectState,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly projectState: ZustandProjectState;
}): readonly GpuDomIsland[] {
  if (!activeParamDomIsland) {
    return [];
  }
  const resolved = resolveProjectGpuParamDomIsland({
    activeParamDomIsland,
    contentSurfaces,
    projectState,
  });
  if (!resolved) {
    return [];
  }
  const { geometry, hit, kind, surface } = resolved;
  return [
    {
      clipOwnerId: surface.id,
      contentRect: geometry.contentRect,
      id: getProjectGpuParamDomIslandId(activeParamDomIsland),
      kind,
      ownerSectionId: activeParamDomIsland.sectionId,
      rect: geometry.rect,
      source: {
        hitRecordId: hit.id,
        kind: "retained-content",
        ownerRowId: hit.ownerRowId,
        surfaceId: surface.id,
      },
      zIndex: surface.zIndex + 1,
    },
  ];
}

function resolveProjectGpuParamDomIsland({
  activeParamDomIsland,
  contentSurfaces,
  projectState,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly projectState: ZustandProjectState;
}): {
  readonly geometry: NonNullable<ProjectGpuParamDomIslandGeometry>;
  readonly hit: GpuRetainedContentHitRecord;
  readonly kind: GpuDomIsland["kind"];
  readonly surface: ProjectGpuRetainedParamSurface;
} | null {
  const surface = getProjectGpuParamDomIslandSurface({
    activeParamDomIsland,
    contentSurfaces,
  });
  const hit = surface
    ? getProjectGpuParamDomIslandHit({ activeParamDomIsland, surface })
    : null;
  if (!surface || !hit) {
    return null;
  }
  return getProjectGpuParamDomIslandResolvedRecord({
    activeParamDomIsland,
    hit,
    projectState,
    surface,
  });
}

function getProjectGpuParamDomIslandSurface({
  activeParamDomIsland,
  contentSurfaces,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly contentSurfaces: readonly GpuContentSurface[];
}): ProjectGpuRetainedParamSurface | null {
  const surface = contentSurfaces.find(
    (candidate) => candidate.id === activeParamDomIsland.surfaceId,
  );
  if (
    !surface ||
    !isProjectGpuRetainedParamSurface(surface) ||
    surface.ownerSectionId !== activeParamDomIsland.sectionId
  ) {
    return null;
  }
  return surface;
}

function getProjectGpuParamDomIslandHit({
  activeParamDomIsland,
  surface,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly surface: ProjectGpuRetainedParamSurface;
}): GpuRetainedContentHitRecord | null {
  return (
    surface.retainedScene.hitRecords.find(
      (candidate) =>
        candidate.id === activeParamDomIsland.hitRecordId &&
        (candidate.kind === "control" || candidate.kind === "label") &&
        candidate.ownerRowId === activeParamDomIsland.paramInfoId,
    ) ?? null
  );
}

function getProjectGpuParamDomIslandResolvedRecord({
  activeParamDomIsland,
  hit,
  projectState,
  surface,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly hit: GpuRetainedContentHitRecord;
  readonly projectState: ZustandProjectState;
  readonly surface: ProjectGpuRetainedParamSurface;
}): {
  readonly geometry: NonNullable<ProjectGpuParamDomIslandGeometry>;
  readonly hit: GpuRetainedContentHitRecord;
  readonly kind: GpuDomIsland["kind"];
  readonly surface: ProjectGpuRetainedParamSurface;
} | null {
  const row = surface.retainedScene.rows.find(
    (candidate) => candidate.id === hit.ownerRowId,
  );
  if (
    !row ||
    !isProjectGpuParamDomIslandHitActive(
      hit,
      activeParamDomIsland,
      projectState,
    )
  ) {
    return null;
  }
  const geometry = getProjectGpuParamDomIslandGeometry({
    clipRect: surface.clipRect,
    controlKind: hit.kind === "control" ? row.controlKind : null,
    controlRect: translateProjectGpuParamLocalRect(hit.rect, surface.rect),
    paramInfoId: hit.ownerRowId,
    projectState,
    sectionId: activeParamDomIsland.sectionId,
  });
  if (!geometry) {
    return null;
  }
  return {
    geometry,
    hit,
    kind:
      hit.kind === "label"
        ? "retained-content-label"
        : "retained-content-control",
    surface,
  };
}

function isProjectGpuParamDomIslandHitActive(
  hit: GpuRetainedContentHitRecord,
  activeParamDomIsland: ProjectGpuActiveParamDomIsland,
  projectState: ZustandProjectState,
): boolean {
  return (
    hit.kind === "control" ||
    isProjectGpuRetainedParamLabelEditable({
      paramInfoId: hit.ownerRowId,
      projectState,
      sectionId: activeParamDomIsland.sectionId,
    })
  );
}

function isProjectGpuRetainedParamSurface(
  surface: GpuContentSurface,
): surface is ProjectGpuRetainedParamSurface {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}

function isProjectGpuRetainedParamLabelEditable({
  paramInfoId,
  projectState,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
}): boolean {
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    projectState,
    sectionId,
    paramInfoId,
    isBaseParamCodeObjImpl,
  );
  return hasProjectGpuCoreNameEditable(codeObjImpl);
}

function hasProjectGpuCoreNameEditable(codeObjImpl: unknown): boolean {
  return (
    typeof codeObjImpl === "object" &&
    codeObjImpl !== null &&
    "coreNameEditable" in codeObjImpl &&
    codeObjImpl.coreNameEditable === true
  );
}

function createProjectGpuParamContentSurfacesForSection({
  activeParamDomIsland,
  contentScrollOffsets,
  hoveredParamTarget,
  measuredHeightsByKey,
  projectState,
  retainedParamDragPreview,
  section,
  typeErrors,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTarget
    | null
    | undefined;
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly projectState: ZustandProjectState;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
  readonly section: GpuSectionSceneNode;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
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
    typeErrors,
    retainedInteractionState: {
      activeParamDomIsland,
      hoveredParamTarget,
      retainedParamDragPreview,
    },
  });
  return createProjectGpuParamListContentSurfaces({
    contentScrollOffsets,
    listRows,
    measuredHeightsByKey,
    retainedParamDragPreview,
    section,
  });
}

function createProjectGpuParamListRows({
  projectState,
  retainedInteractionState,
  sectionId,
  sectionImpl,
  typeErrors,
}: {
  readonly projectState: ZustandProjectState;
  readonly retainedInteractionState: ProjectGpuRetainedParamInteractionState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
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
          retainedInteractionState,
          sectionId,
          sectionImpl,
          surfaceId: getProjectGpuParamContentSurfaceId(sectionId, key),
          typeErrors,
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
  retainedInteractionState,
  sectionId,
  sectionImpl,
  surfaceId,
  typeErrors,
}: {
  readonly filteredRows: FilteredParamRows;
  readonly projectState: ZustandProjectState;
  readonly retainedInteractionState: ProjectGpuRetainedParamInteractionState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
  readonly surfaceId: string;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
}): readonly GpuRetainedContentRowInput[] {
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    filteredRows.paramIds,
    filteredRows.requiredParamIdsToPaths,
  );
  const selectedParamIds = new Set(sectionImpl.selectedParams ?? []);
  const edgeInputParamIds = new Set(sectionImpl.edgeInputParams);
  const sectionParamTypeErrors = typeErrors?.[sectionId]?.params ?? {};
  const draggingParamIds =
    retainedInteractionState.retainedParamDragPreview?.sectionId ===
      sectionId &&
    retainedInteractionState.retainedParamDragPreview.surfaceId === surfaceId
      ? new Set(
          retainedInteractionState.retainedParamDragPreview.draggingParamIds,
        )
      : null;
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
        dragging: draggingParamIds?.has(row.id) ?? false,
        focused: isProjectGpuRetainedParamTargetForRow(
          retainedInteractionState.activeParamDomIsland,
          {
            paramInfoId: row.id,
            sectionId,
            surfaceId,
          },
        ),
        hovered: isProjectGpuRetainedParamTargetForRow(
          retainedInteractionState.hoveredParamTarget,
          {
            paramInfoId: row.id,
            sectionId,
            surfaceId,
          },
        ),
        error: (sectionParamTypeErrors[row.id]?.length ?? 0) > 0,
        selected: selectedParamIds.has(row.id),
      },
    };
  });
}

function isProjectGpuRetainedParamTargetForRow(
  target: ProjectGpuRetainedParamTarget | null | undefined,
  row: {
    readonly paramInfoId: string;
    readonly sectionId: string;
    readonly surfaceId: string;
  },
): boolean {
  return Boolean(
    target &&
      target.paramInfoId === row.paramInfoId &&
      target.sectionId === row.sectionId &&
      target.surfaceId === row.surfaceId,
  );
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
  retainedParamDragPreview,
  section,
}: {
  readonly contentScrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly listRows: readonly ProjectGpuParamListRows[];
  readonly measuredHeightsByKey?: Readonly<Record<string, unknown>> | undefined;
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
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
        dragPreview: getProjectGpuParamRetainedContentDragPreviewInput({
          retainedParamDragPreview,
          surfaceId,
        }),
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

function getProjectGpuParamRetainedContentDragPreviewInput({
  retainedParamDragPreview,
  surfaceId,
}: {
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
  readonly surfaceId: string;
}): GpuRetainedContentDragPreviewInput | null {
  if (
    !retainedParamDragPreview ||
    retainedParamDragPreview.surfaceId !== surfaceId
  ) {
    return null;
  }
  return {
    draggingRowIds: retainedParamDragPreview.draggingParamIds,
    dropMarker: retainedParamDragPreview.dropMarker,
    pointerLocal: retainedParamDragPreview.pointerLocal,
  };
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

function getProjectGpuParamDomIslandId({
  hitRecordId,
  paramInfoId,
  sectionId,
}: Pick<
  ProjectGpuActiveParamDomIsland,
  "hitRecordId" | "paramInfoId" | "sectionId"
>): string {
  return hitRecordId.startsWith("label:")
    ? `param-label:${sectionId}:${paramInfoId}`
    : `param-control:${sectionId}:${paramInfoId}`;
}
