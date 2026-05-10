import {
  resolveFilteredParamRows,
  type FilteredParamRows,
} from "components/Params/paramListFiltering";
import { resolveParamUIDisabled } from "components/Params/ParamUIs/paramUIDisabled";
import {
  createGpuRetainedRowContentScene,
  getGpuRetainedRowContentHeight,
  type GpuRetainedContentActivePopupInput,
  type GpuRetainedContentDragPreviewInput,
  type GpuRetainedContentHitRecord,
  type GpuRetainedContentRow,
  type GpuRetainedContentRowInput,
} from "gpuFlow/retainedContentScene";
import type {
  GpuContentSurface,
  GpuDomIsland,
  GpuSectionSceneNode,
} from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import { buildParamDuplicateIndexIfPresent } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState, ZustandTypeErrors } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import {
  getProjectGpuParamContentControlWidth,
  getProjectGpuParamContentMetrics,
  getProjectGpuParamListLocalY,
  getProjectGpuParamListSurfaceHeight,
  getProjectGpuParamNextLocalY,
  PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX,
  PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX,
  PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
  PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
  type ProjectGpuParamListKey,
} from "./projectGpuParamContentLayout";
import {
  getProjectGpuParamRowVerticalGapBefore,
  getProjectGpuShownParamRowsIfPresent,
  normalizeProjectGpuShownParamRows,
} from "./projectGpuParamContentRowStats";
import {
  getProjectGpuParamContentEdgeStripPortCounts,
  isProjectGpuParamContentSectionImpl,
  type ProjectGpuParamContentSectionImpl,
} from "./projectGpuParamContentSection";
import {
  getProjectGpuParamDomIslandGeometry,
  intersectProjectGpuParamRects,
  translateProjectGpuParamLocalRect,
} from "./projectGpuParamDomIslandGeometry";
import type { ProjectGpuRetainedParamDragPreview } from "./projectGpuParamDragAdapter";
import {
  createProjectGpuParamRowInput,
  type ProjectGpuRetainedParamSearchState,
} from "./projectGpuParamRowAdapter";
import { isProjectGpuRetainedParamControlDomIslandActive } from "./projectGpuRetainedParamActiveControlPolicy";
import type { ProjectGpuRetainedPasswordRevealStateMap as PasswordRevealStates } from "./projectGpuRetainedParamPasswordRevealState";
import { getProjectSectionSceneHeaderHeight } from "./projectSectionSceneHeaderLayout";
import { getProjectSectionSceneKwargsControlsHeight } from "./projectSectionSceneKwargsControlsLayout";
import { getProjectSectionSceneSearchHeight } from "./projectSectionSceneSearchLayout";

export type { ProjectGpuParamListKey } from "./projectGpuParamContentLayout";

export type ProjectGpuRetainedParamTarget = {
  readonly hitRecordId: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
};

export type ProjectGpuActiveParamDomIsland = ProjectGpuRetainedParamTarget & {
  readonly activation?: GpuDomIsland["activation"] | undefined;
};

type ProjectGpuDateCalendarVisibleMonth = {
  readonly monthIndex: number;
  readonly year: number;
};

export type ProjectGpuActiveParamCanvasPopup =
  | (ProjectGpuRetainedParamTarget & {
      readonly highlightedOptionIndex?: number | null | undefined;
      readonly kind: "color-picker" | "dropdown";
    })
  | (ProjectGpuRetainedParamTarget & {
      readonly highlightedDateIso?: string | null | undefined;
      readonly kind: "date-calendar";
      readonly visibleMonth: ProjectGpuDateCalendarVisibleMonth;
    });

type OptionalParamCanvasPopup =
  | ProjectGpuActiveParamCanvasPopup
  | null
  | undefined;
type OptionalParamDomIsland = ProjectGpuActiveParamDomIsland | null | undefined;
type OptionalParamDragPreview =
  | ProjectGpuRetainedParamDragPreview
  | null
  | undefined;
type OptionalParamTarget = ProjectGpuRetainedParamTarget | null | undefined;

type ProjectGpuParamListRows = {
  readonly key: ProjectGpuParamListKey;
  readonly rows: readonly GpuRetainedContentRowInput[];
};

const PROJECT_GPU_PARAM_CONTENT_SECTION_CHROME_CLIP_INSET_PX = 1;

type ProjectGpuRetainedParamInteractionState = {
  readonly activeParamCanvasControl?: OptionalParamTarget;
  readonly activeParamCanvasPopup?: OptionalParamCanvasPopup;
  readonly activeParamDomIsland?: OptionalParamDomIsland;
  readonly hoveredParamTarget?: OptionalParamTarget;
  readonly passwordRevealStates?: PasswordRevealStates | undefined;
  readonly retainedParamDragPreview?: OptionalParamDragPreview;
};

export type ProjectGpuParamEditPolicy = {
  readonly canEditParams: boolean;
  readonly canEditStructure: boolean;
  readonly isDeploymentMode: boolean;
};

type ProjectGpuRetainedParamSurface = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

type ProjectGpuParamDomIslandGeometry = ReturnType<
  typeof getProjectGpuParamDomIslandGeometry
>;

export const DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY: ProjectGpuParamEditPolicy =
  {
    canEditParams: true,
    canEditStructure: true,
    isDeploymentMode: false,
  };

export function createProjectGpuParamContentSurfaces({
  activeParamCanvasControl,
  activeParamCanvasPopup,
  activeParamDomIsland,
  editPolicy = DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY,
  hoveredParamTarget,
  passwordRevealStates,
  projectState,
  projectSearch,
  retainedParamDragPreview,
  sections,
  typeErrors,
}: {
  readonly activeParamCanvasControl?: OptionalParamTarget;
  readonly activeParamCanvasPopup?: OptionalParamCanvasPopup;
  readonly activeParamDomIsland?: OptionalParamDomIsland;
  readonly editPolicy?: ProjectGpuParamEditPolicy | undefined;
  readonly hoveredParamTarget?: OptionalParamTarget;
  readonly passwordRevealStates?: PasswordRevealStates | undefined;
  readonly projectState: ZustandProjectState;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly retainedParamDragPreview?: OptionalParamDragPreview;
  readonly sections: readonly GpuSectionSceneNode[];
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
}): readonly GpuContentSurface[] {
  return sections.flatMap((section) =>
    createProjectGpuParamContentSurfacesForSection({
      activeParamCanvasControl,
      activeParamCanvasPopup,
      activeParamDomIsland,
      editPolicy,
      hoveredParamTarget,
      passwordRevealStates,
      projectState,
      projectSearch,
      retainedParamDragPreview,
      section,
      typeErrors,
    }),
  );
}

export function createProjectGpuParamDomIslands({
  activeParamDomIsland,
  contentSurfaces,
  editPolicy = DEFAULT_PROJECT_GPU_PARAM_EDIT_POLICY,
  projectState,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuActiveParamDomIsland
    | null
    | undefined;
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly editPolicy?: ProjectGpuParamEditPolicy | undefined;
  readonly projectState: ZustandProjectState;
}): readonly GpuDomIsland[] {
  if (!activeParamDomIsland) {
    return [];
  }
  const resolved = resolveProjectGpuParamDomIsland({
    activeParamDomIsland,
    contentSurfaces,
    editPolicy,
    projectState,
  });
  if (!resolved) {
    return [];
  }
  const { geometry, hit, kind, surface } = resolved;
  return [
    {
      ...(activeParamDomIsland.activation
        ? { activation: activeParamDomIsland.activation }
        : {}),
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
  editPolicy,
  projectState,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly editPolicy: ProjectGpuParamEditPolicy;
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
    editPolicy,
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
  editPolicy,
  hit,
  projectState,
  surface,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly editPolicy: ProjectGpuParamEditPolicy;
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
    !isProjectGpuParamDomIslandHitActive({
      hit,
      activeParamDomIsland,
      editPolicy,
      projectState,
      row,
    })
  ) {
    return null;
  }
  const geometry = getProjectGpuParamDomIslandGeometry({
    clipRect: surface.clipRect,
    controlKind: hit.kind === "control" ? row.controlKind : null,
    controlRect: translateProjectGpuParamLocalRect(hit.rect, surface.rect),
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

function isProjectGpuParamDomIslandHitActive({
  activeParamDomIsland,
  editPolicy,
  hit,
  projectState,
  row,
}: {
  readonly activeParamDomIsland: ProjectGpuActiveParamDomIsland;
  readonly editPolicy: ProjectGpuParamEditPolicy;
  readonly hit: GpuRetainedContentHitRecord;
  readonly projectState: ZustandProjectState;
  readonly row: Pick<
    GpuRetainedContentRow,
    "control" | "controlKind" | "state"
  >;
}): boolean {
  if (hit.kind === "control") {
    return isProjectGpuRetainedParamControlDomIslandActive({
      row,
    });
  }
  return (
    editPolicy.canEditStructure &&
    !row.state.disabled &&
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
  activeParamCanvasControl,
  activeParamCanvasPopup,
  activeParamDomIsland,
  editPolicy,
  hoveredParamTarget,
  passwordRevealStates,
  projectState,
  projectSearch,
  retainedParamDragPreview,
  section,
  typeErrors,
}: {
  readonly activeParamCanvasControl?: OptionalParamTarget;
  readonly activeParamCanvasPopup?: OptionalParamCanvasPopup;
  readonly activeParamDomIsland?: OptionalParamDomIsland;
  readonly editPolicy: ProjectGpuParamEditPolicy;
  readonly hoveredParamTarget?: OptionalParamTarget;
  readonly passwordRevealStates?: PasswordRevealStates | undefined;
  readonly projectState: ZustandProjectState;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly retainedParamDragPreview?: OptionalParamDragPreview;
  readonly section: GpuSectionSceneNode;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
}): readonly GpuContentSurface[] {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    projectState,
    section.sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (!sectionImpl || !isProjectGpuParamContentSectionImpl(sectionImpl)) {
    return [];
  }

  const listRows = createProjectGpuParamListRows({
    projectState,
    projectSearch,
    sectionId: section.sectionId,
    sectionImpl,
    editPolicy,
    typeErrors,
    retainedInteractionState: {
      activeParamCanvasControl,
      activeParamCanvasPopup,
      activeParamDomIsland,
      hoveredParamTarget,
      passwordRevealStates,
      retainedParamDragPreview,
    },
  });
  return createProjectGpuParamListContentSurfaces({
    activeParamCanvasPopup,
    listRows,
    retainedParamDragPreview,
    section,
    sectionImpl,
  });
}

function createProjectGpuParamListRows({
  editPolicy,
  projectState,
  projectSearch,
  retainedInteractionState,
  sectionId,
  sectionImpl,
  typeErrors,
}: {
  readonly projectState: ZustandProjectState;
  readonly editPolicy: ProjectGpuParamEditPolicy;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly retainedInteractionState: ProjectGpuRetainedParamInteractionState;
  readonly sectionId: string;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
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
          editPolicy,
          projectState,
          projectSearch,
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

function createProjectGpuParamRows({
  editPolicy,
  filteredRows,
  projectState,
  projectSearch,
  retainedInteractionState,
  sectionId,
  sectionImpl,
  surfaceId,
  typeErrors,
}: {
  readonly filteredRows: FilteredParamRows;
  readonly editPolicy: ProjectGpuParamEditPolicy;
  readonly projectState: ZustandProjectState;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly retainedInteractionState: ProjectGpuRetainedParamInteractionState;
  readonly sectionId: string;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
  readonly surfaceId: string;
  readonly typeErrors?: ZustandTypeErrors["errors"] | undefined;
}): readonly GpuRetainedContentRowInput[] {
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    filteredRows.paramIds,
    filteredRows.requiredParamIdsToPaths,
  );
  const selectedParamIds = new Set<string>(sectionImpl.selectedParams ?? []);
  const edgeInputParamIds = new Set<string>(sectionImpl.edgeInputParams ?? []);
  const paramDuplicateIndex = buildParamDuplicateIndexIfPresent(
    projectState,
    sectionId,
  );
  const sectionParamTypeErrors = typeErrors?.[sectionId]?.params ?? {};
  const draggingParamIds =
    retainedInteractionState.retainedParamDragPreview?.sectionId ===
      sectionId &&
    retainedInteractionState.retainedParamDragPreview.surfaceId === surfaceId
      ? new Set(
          retainedInteractionState.retainedParamDragPreview.draggingParamIds,
        )
      : null;
  return tree.flat.map((row, index) => {
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
    const verticalGapBefore = getProjectGpuParamRowVerticalGapBefore({
      index,
      row,
    });
    return {
      ...createProjectGpuParamRowInput({
        activeParamCanvasControl:
          retainedInteractionState.activeParamCanvasControl,
        activeParamCanvasPopup: retainedInteractionState.activeParamCanvasPopup,
        activeParamDomIsland: retainedInteractionState.activeParamDomIsland,
        codeObjImpl,
        configLanguage: sectionImpl.configLanguage,
        disabled: resolveProjectGpuRetainedParamRowDisabled({
          codeObjType: codeObjImpl.type,
          editPolicy,
          sectionImpl,
        }),
        draggingParamIds,
        edgeInputParamIds,
        hoveredParamTarget: retainedInteractionState.hoveredParamTarget,
        isDeploymentMode: editPolicy.isDeploymentMode,
        passwordRevealStates: retainedInteractionState.passwordRevealStates,
        projectSearch,
        projectState,
        paramDuplicateIndex,
        row,
        sectionId,
        sectionParamTypeErrors,
        selectedParamIds,
        surfaceId,
      }),
      ...(verticalGapBefore > 0 ? { verticalGapBefore } : {}),
    };
  });
}

function resolveProjectGpuRetainedParamRowDisabled({
  codeObjType,
  editPolicy,
  sectionImpl,
}: {
  readonly codeObjType: string;
  readonly editPolicy: ProjectGpuParamEditPolicy;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
}): boolean {
  return resolveParamUIDisabled({
    canEditParams: editPolicy.canEditParams,
    disabledOrFrozen: sectionImpl.isFrozen,
    isCodeParam: codeObjType === CodeObjTypeEnum.CodeParam,
    isDeploymentMode: editPolicy.isDeploymentMode,
    isSelectingParams: false,
  });
}

function createProjectGpuParamListContentSurfaces({
  activeParamCanvasPopup,
  listRows,
  retainedParamDragPreview,
  section,
  sectionImpl,
}: {
  readonly activeParamCanvasPopup?:
    | ProjectGpuActiveParamCanvasPopup
    | null
    | undefined;
  readonly listRows: readonly ProjectGpuParamListRows[];
  readonly retainedParamDragPreview?:
    | ProjectGpuRetainedParamDragPreview
    | null
    | undefined;
  readonly section: GpuSectionSceneNode;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
}): readonly GpuContentSurface[] {
  const surfaces: GpuContentSurface[] = [];
  const edgeStripPortCounts =
    getProjectGpuParamContentEdgeStripPortCounts(sectionImpl);
  const metrics = getProjectGpuParamContentMetrics({
    ...edgeStripPortCounts,
    headerHeight:
      getProjectSectionSceneHeaderHeight() +
      getProjectSectionSceneSearchHeight(sectionImpl),
    kwargsControlsHeight:
      getProjectSectionSceneKwargsControlsHeight(sectionImpl),
    pinnedContentHeight: getProjectGpuParamListContentHeight(
      listRows,
      "pinned",
    ),
    pinnedRowVerticalGapHeight: getProjectGpuParamListVerticalGapHeight(
      listRows,
      "pinned",
    ),
    pinnedRowCount: getProjectGpuParamListRowCount(listRows, "pinned"),
  });
  const maxNestedDepth = getProjectGpuParamMaxNestedDepth(listRows);
  let nextLocalY = metrics.contentTop;
  for (const list of listRows) {
    const listLocalY = getProjectGpuParamListLocalY({
      listKey: list.key,
      metrics,
      nextLocalY,
    });
    const remainingHeight = Math.max(0, section.bodyRect.height - listLocalY);
    const contentHeight = getProjectGpuParamRowsContentHeight(list.rows);
    const height = getProjectGpuParamListSurfaceHeight({
      contentHeight,
      listKey: list.key,
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
    const clipRect = createProjectGpuParamContentSurfaceClipRect({
      rect,
      sectionClipRect: section.clipRect,
    });
    surfaces.push({
      clipRect,
      id: surfaceId,
      ownerSectionId: section.sectionId,
      rect,
      retainedScrollResetKey: surfaceId,
      retainedScene: createGpuRetainedRowContentScene({
        activePopup: getProjectGpuParamRetainedContentActivePopupInput({
          activeParamCanvasPopup,
          surfaceId,
        }),
        controlRightInset: PROJECT_GPU_PARAM_CONTENT_CONTROL_RIGHT_INSET_PX,
        controlWidth: getProjectGpuParamContentControlWidth({
          maxNestedDepth,
          persistedColumnWidth: sectionImpl.columnWidth,
          width: localRect.width,
        }),
        dragPreview: getProjectGpuParamRetainedContentDragPreviewInput({
          retainedParamDragPreview,
          surfaceId,
        }),
        id: surfaceId,
        indentWidth: PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
        labelControlGap: PROJECT_GPU_PARAM_CONTENT_LABEL_CONTROL_GAP_PX,
        ownerSectionId: section.sectionId,
        rowHeight: PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
        rowVisualBounds: { width: localRect.width, x: 0 },
        rows: list.rows,
        scrollOffset: { x: 0, y: 0 },
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

function createProjectGpuParamContentSurfaceClipRect({
  rect,
  sectionClipRect,
}: {
  readonly rect: GpuRect;
  readonly sectionClipRect: GpuRect;
}): GpuRect {
  const baseClipRect = intersectProjectGpuParamRects(rect, sectionClipRect);
  if (
    baseClipRect.height <=
      PROJECT_GPU_PARAM_CONTENT_SECTION_CHROME_CLIP_INSET_PX ||
    baseClipRect.width <= PROJECT_GPU_PARAM_CONTENT_SECTION_CHROME_CLIP_INSET_PX
  ) {
    return baseClipRect;
  }
  return intersectProjectGpuParamRects(rect, {
    ...sectionClipRect,
    height: Math.max(
      0,
      sectionClipRect.height -
        PROJECT_GPU_PARAM_CONTENT_SECTION_CHROME_CLIP_INSET_PX,
    ),
    width: Math.max(
      0,
      sectionClipRect.width -
        PROJECT_GPU_PARAM_CONTENT_SECTION_CHROME_CLIP_INSET_PX,
    ),
  });
}

function getProjectGpuParamMaxNestedDepth(
  listRows: readonly ProjectGpuParamListRows[],
): number {
  return Math.max(
    1,
    ...listRows.flatMap((list) => list.rows.map((row) => row.depth + 1)),
  );
}

function getProjectGpuParamListRowCount(
  listRows: readonly ProjectGpuParamListRows[],
  key: ProjectGpuParamListKey,
): number {
  return listRows.find((list) => list.key === key)?.rows.length ?? 0;
}

function getProjectGpuParamListVerticalGapHeight(
  listRows: readonly ProjectGpuParamListRows[],
  key: ProjectGpuParamListKey,
): number {
  return (
    listRows
      .find((list) => list.key === key)
      ?.rows.reduce(
        (height, row) => height + (row.verticalGapBefore ?? 0),
        0,
      ) ?? 0
  );
}

function getProjectGpuParamListContentHeight(
  listRows: readonly ProjectGpuParamListRows[],
  key: ProjectGpuParamListKey,
): number {
  return getProjectGpuParamRowsContentHeight(
    listRows.find((list) => list.key === key)?.rows ?? [],
  );
}

function getProjectGpuParamRowsContentHeight(
  rows: readonly GpuRetainedContentRowInput[],
): number {
  return getGpuRetainedRowContentHeight({
    rowHeight: PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
    rows,
  });
}

function getProjectGpuParamRetainedContentActivePopupInput({
  activeParamCanvasPopup,
  surfaceId,
}: {
  readonly activeParamCanvasPopup?:
    | ProjectGpuActiveParamCanvasPopup
    | null
    | undefined;
  readonly surfaceId: string;
}): GpuRetainedContentActivePopupInput | null {
  if (
    !activeParamCanvasPopup ||
    activeParamCanvasPopup.surfaceId !== surfaceId
  ) {
    return null;
  }
  const choicePopupHighlightedOptionIndex =
    activeParamCanvasPopup.kind === "color-picker" ||
    activeParamCanvasPopup.kind === "dropdown"
      ? activeParamCanvasPopup.highlightedOptionIndex
      : undefined;
  const datePopupHighlightedDateIso =
    activeParamCanvasPopup.kind === "date-calendar"
      ? activeParamCanvasPopup.highlightedDateIso
      : undefined;
  return {
    ...(datePopupHighlightedDateIso === undefined
      ? {}
      : { highlightedDateIso: datePopupHighlightedDateIso }),
    ...(choicePopupHighlightedOptionIndex === undefined
      ? {}
      : { highlightedOptionIndex: choicePopupHighlightedOptionIndex }),
    kind: activeParamCanvasPopup.kind,
    ownerRowId: activeParamCanvasPopup.paramInfoId,
  };
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
