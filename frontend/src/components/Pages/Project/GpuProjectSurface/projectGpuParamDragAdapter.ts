import type { GpuRetainedContentInteractionHit } from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedContentDropMarkerEdge } from "gpuFlow/retainedContentScene";
import type { GpuPoint } from "gpuFlow/viewportMath";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  orderParamIdsByParent,
  selectOnlyParam,
} from "state/actions/params/moveParams";
import {
  buildParamParentMap,
  buildParamTreeView,
  getParamRootId,
  getRootSelectedParamIds,
  getSharedParentId,
  isDescendantOfSelection,
  resolveFullIndexForVisibleInsertion,
} from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import type { ProjectGpuParamListKey } from "./projectGpuParamContentAdapter";

export type ProjectGpuRetainedParamDragSession = {
  readonly activeParamId: string;
  readonly draggingParamIds: readonly string[];
  readonly listKey: ProjectGpuParamListKey;
  readonly oldParentId: string;
  readonly parentById: Readonly<Record<string, string | null>>;
  readonly sectionId: string;
  readonly surfaceId: string;
  readonly visibleChildrenByParent: Readonly<Record<string, readonly string[]>>;
};

type ProjectGpuRetainedParamDropMove = {
  readonly newIndex: number;
  readonly newParentId: string;
  readonly paramIds: readonly string[];
  readonly sectionId: string;
};

export type ProjectGpuRetainedParamDragPreview = {
  readonly draggingParamIds: readonly string[];
  readonly dropMarker: {
    readonly edge: GpuRetainedContentDropMarkerEdge;
    readonly rowId: string;
  } | null;
  readonly pointerLocal: GpuPoint | null;
  readonly sectionId: string;
  readonly surfaceId: string;
};

const PROJECT_GPU_PARAM_CONTENT_SURFACE_SEPARATOR = ":param-content:";

export function createProjectGpuRetainedParamDragSession({
  activeParamId,
  projectState,
  sectionId,
  surfaceId,
}: {
  readonly activeParamId: string;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly surfaceId: string;
}): ProjectGpuRetainedParamDragSession | null {
  const listKey = getProjectGpuParamListKeyFromSurfaceId(surfaceId);
  if (!listKey) {
    return null;
  }
  const sectionImpl = getProjectGpuRetainedParamDragSectionImpl({
    activeParamId,
    projectState,
    sectionId,
  });
  if (!sectionImpl) {
    return null;
  }
  const rootId = getParamRootId(projectState, sectionId);
  const parentById = buildParamParentMap(projectState, sectionId, rootId);
  if (!Object.prototype.hasOwnProperty.call(parentById, activeParamId)) {
    return null;
  }
  const draggingParamIds = resolveProjectGpuRetainedParamDragSelectionIds({
    activeId: activeParamId,
    parentById,
    sectionId,
    selectedParams: sectionImpl.selectedParams ?? [],
  });
  const oldParentId =
    getSharedParentId(parentById, draggingParamIds) ??
    parentById[draggingParamIds[0] ?? ""] ??
    null;
  if (!oldParentId) {
    return null;
  }
  const visibleChildrenByParent = getProjectGpuRetainedParamVisibleChildren({
    projectState,
    sectionId,
    listKey,
    surfaceId,
  });
  return {
    activeParamId,
    draggingParamIds,
    listKey,
    oldParentId,
    parentById,
    sectionId,
    surfaceId,
    visibleChildrenByParent,
  };
}

export function resolveProjectGpuRetainedParamDropMove({
  event,
  projectState,
  session,
}: {
  readonly event: GpuRetainedContentInteractionHit | null;
  readonly projectState: ZustandProjectState;
  readonly session: ProjectGpuRetainedParamDragSession;
}): ProjectGpuRetainedParamDropMove | null {
  return (
    resolveProjectGpuRetainedParamResolvedDrop({
      event,
      projectState,
      session,
    })?.move ?? null
  );
}

export function createProjectGpuRetainedParamDragPreview({
  hit,
  pointerLocal,
  projectState,
  session,
}: {
  readonly hit: GpuRetainedContentInteractionHit | null;
  readonly pointerLocal?: GpuPoint | null | undefined;
  readonly projectState: ZustandProjectState;
  readonly session: ProjectGpuRetainedParamDragSession;
}): ProjectGpuRetainedParamDragPreview {
  const resolvedDrop = resolveProjectGpuRetainedParamResolvedDrop({
    event: hit,
    projectState,
    session,
  });
  return {
    draggingParamIds: session.draggingParamIds,
    dropMarker: resolvedDrop
      ? {
          edge: resolvedDrop.markerEdge,
          rowId: resolvedDrop.target.overParamId,
        }
      : null,
    pointerLocal: pointerLocal ?? hit?.localPoint ?? null,
    sectionId: session.sectionId,
    surfaceId: session.surfaceId,
  };
}

function resolveProjectGpuRetainedParamResolvedDrop({
  event,
  projectState,
  session,
}: {
  readonly event: GpuRetainedContentInteractionHit | null;
  readonly projectState: ZustandProjectState;
  readonly session: ProjectGpuRetainedParamDragSession;
}): {
  readonly markerEdge: GpuRetainedContentDropMarkerEdge;
  readonly move: ProjectGpuRetainedParamDropMove;
  readonly target: ProjectGpuRetainedParamDropTarget;
} | null {
  const target = getProjectGpuRetainedParamDropTarget({
    event,
    projectState,
    session,
  });
  if (!target) {
    return null;
  }
  const { newParentId, overParamId, targetVisibleIndex, visibleSiblings } =
    target;
  const draggingSet = new Set(session.draggingParamIds);
  if (
    draggingSet.has(overParamId) ||
    isDescendantOfSelection(session.parentById, overParamId, draggingSet) ||
    draggingSet.has(newParentId)
  ) {
    return null;
  }
  const orderedParamIds = orderParamIdsByParent(
    projectState,
    session.sectionId,
    session.oldParentId,
    [...session.draggingParamIds],
  );
  if (orderedParamIds.length === 0) {
    return null;
  }
  const newParentImpl = getCurrEffectiveCodeObjImpl(
    projectState,
    session.sectionId,
    newParentId,
  );
  const newParentChildren = getProjectGpuRetainedParamParentChildren({
    impl: newParentImpl,
    newParentId,
    sectionId: session.sectionId,
  });
  const newIndex = resolveFullIndexForVisibleInsertion({
    fullChildren: newParentChildren,
    movingIds: new Set(orderedParamIds),
    targetVisibleIndex,
    visibleSiblings,
  });
  if (newIndex === null) {
    return null;
  }
  if (
    isProjectGpuRetainedParamDropNoop(
      newParentChildren,
      orderedParamIds,
      newIndex,
    )
  ) {
    return null;
  }
  return {
    markerEdge: target.markerEdge,
    move: {
      newIndex,
      newParentId,
      paramIds: orderedParamIds,
      sectionId: session.sectionId,
    },
    target,
  };
}

type ProjectGpuRetainedParamDropTarget = {
  readonly dropEvent: GpuRetainedContentInteractionHit;
  readonly markerEdge: GpuRetainedContentDropMarkerEdge;
  readonly newParentId: string;
  readonly overParamId: string;
  readonly targetVisibleIndex: number;
  readonly visibleSiblings: string[];
};

function getProjectGpuRetainedParamDragSectionImpl({
  activeParamId,
  projectState,
  sectionId,
}: {
  readonly activeParamId: string;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
}) {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    projectState,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if ((sectionImpl.paramFilter ?? "").trim().length > 0) {
    return null;
  }
  if ((sectionImpl.edgeInputParams ?? []).includes(activeParamId)) {
    return null;
  }
  return sectionImpl;
}

function getProjectGpuRetainedParamVisibleChildren({
  listKey,
  projectState,
  sectionId,
  surfaceId,
}: {
  readonly listKey: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly surfaceId: string;
}): Record<string, string[]> {
  const shown = getCurrShownParamIds(
    projectState,
    sectionId,
    listKey === "pinned",
    true,
  );
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    normalizeProjectGpuRetainedParamTopLevelIds({
      sectionId,
      surfaceId,
      value: shown.topLevelParamIds,
    }),
    normalizeProjectGpuRetainedParamPaths({
      sectionId,
      surfaceId,
      value: shown.requiredParamIdsToPaths,
    }),
  );
  return tree.visibleChildrenByParent;
}

function getProjectGpuRetainedParamDropTarget({
  event,
  projectState,
  session,
}: {
  readonly event: GpuRetainedContentInteractionHit | null;
  readonly projectState: ZustandProjectState;
  readonly session: ProjectGpuRetainedParamDragSession;
}): ProjectGpuRetainedParamDropTarget | null {
  if (!isProjectGpuRetainedParamDropEventForSession(event, session)) {
    return null;
  }
  const overParamId = event.hit.ownerRowId;
  if (!Object.prototype.hasOwnProperty.call(session.parentById, overParamId)) {
    return null;
  }
  const emptyParentTarget = getProjectGpuRetainedParamEmptyParentDropTarget({
    event,
    overParamId,
    projectState,
  });
  if (emptyParentTarget) {
    return emptyParentTarget;
  }
  if (event.hit.kind !== "row" && event.hit.kind !== "label") {
    return null;
  }
  return getProjectGpuRetainedParamRowDropTarget({
    event,
    overParamId,
    session,
  });
}

function getProjectGpuRetainedParamEmptyParentDropTarget({
  event,
  overParamId,
  projectState,
}: {
  readonly event: GpuRetainedContentInteractionHit;
  readonly overParamId: string;
  readonly projectState: ZustandProjectState;
}): ProjectGpuRetainedParamDropTarget | null {
  if (!isProjectGpuRetainedParamEmptyParentDropEvent(event, projectState)) {
    return null;
  }
  return {
    dropEvent: event,
    markerEdge: "inside",
    newParentId: overParamId,
    overParamId,
    targetVisibleIndex: 0,
    visibleSiblings: [],
  };
}

function getProjectGpuRetainedParamRowDropTarget({
  event,
  overParamId,
  session,
}: {
  readonly event: GpuRetainedContentInteractionHit;
  readonly overParamId: string;
  readonly session: ProjectGpuRetainedParamDragSession;
}): ProjectGpuRetainedParamDropTarget | null {
  const newParentId = session.parentById[overParamId] ?? null;
  if (!newParentId) {
    return null;
  }
  const visibleSiblings = [
    ...(session.visibleChildrenByParent[newParentId] ?? []),
  ];
  const overIndex = visibleSiblings.indexOf(overParamId);
  if (overIndex < 0) {
    return null;
  }
  const dropAfter = isProjectGpuRetainedParamDropAfter(event);
  return {
    dropEvent: event,
    markerEdge: dropAfter ? "after" : "before",
    newParentId,
    overParamId,
    targetVisibleIndex: getProjectGpuRetainedParamDropVisibleIndex({
      draggingSet: new Set(session.draggingParamIds),
      insertAfter: dropAfter,
      overIndex,
      visibleSiblings,
    }),
    visibleSiblings,
  };
}

function isProjectGpuRetainedParamDropEventForSession(
  event: GpuRetainedContentInteractionHit | null,
  session: ProjectGpuRetainedParamDragSession,
): event is GpuRetainedContentInteractionHit {
  return Boolean(
    event &&
      event.ownerSectionId === session.sectionId &&
      event.surfaceId === session.surfaceId,
  );
}

function isProjectGpuRetainedParamEmptyParentDropEvent(
  event: GpuRetainedContentInteractionHit,
  projectState: ZustandProjectState,
): boolean {
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (row?.controlKind !== "nested") {
    return false;
  }
  const impl = getCurrEffectiveCodeObjImpl(
    projectState,
    event.ownerSectionId,
    event.hit.ownerRowId,
  );
  const children = (impl as { readonly children?: unknown }).children;
  return Array.isArray(children) && children.length === 0;
}

function resolveProjectGpuRetainedParamDragSelectionIds({
  activeId,
  parentById,
  sectionId,
  selectedParams,
}: {
  readonly activeId: string;
  readonly parentById: Record<string, string | null>;
  readonly sectionId: string;
  readonly selectedParams: readonly string[];
}): string[] {
  // Retained GPU drags cannot depend on the legacy dnd-kit monitor; this stays
  // local to the project adapter until the remaining DOM param DnD path is gone.
  if (!selectedParams.includes(activeId)) {
    selectOnlyParam(sectionId, activeId);
    return [activeId];
  }

  const rootSelected = getRootSelectedParamIds(parentById, [...selectedParams]);
  const draggingIds = rootSelected.length > 0 ? rootSelected : [activeId];
  if (draggingIds.length === 1) {
    return draggingIds;
  }
  if (getSharedParentId(parentById, draggingIds)) {
    return draggingIds;
  }

  addTemporaryNotification("Param selection spans multiple parents.");
  selectOnlyParam(sectionId, activeId);
  return [activeId];
}

function normalizeProjectGpuRetainedParamTopLevelIds({
  sectionId,
  surfaceId,
  value,
}: {
  readonly sectionId: string;
  readonly surfaceId: string;
  readonly value: readonly string[] | null;
}): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid retained param row order for GPU surface ${surfaceId} in section ${sectionId}.`,
    );
  }
  return [...value];
}

function normalizeProjectGpuRetainedParamPaths({
  sectionId,
  surfaceId,
  value,
}: {
  readonly sectionId: string;
  readonly surfaceId: string;
  readonly value: Readonly<Record<string, readonly string[] | null>> | null;
}): Record<string, string[]> {
  if (!value) {
    return {};
  }
  const paths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(value)) {
    if (!Array.isArray(path)) {
      throw new Error(
        `Invalid retained param path for row ${paramId} on GPU surface ${surfaceId} in section ${sectionId}.`,
      );
    }
    paths[paramId] = [...path];
  }
  return paths;
}

function getProjectGpuRetainedParamParentChildren({
  impl,
  newParentId,
  sectionId,
}: {
  readonly impl: ReturnType<typeof getCurrEffectiveCodeObjImpl>;
  readonly newParentId: string;
  readonly sectionId: string;
}): string[] {
  const children = (impl as { readonly children?: unknown }).children;
  if (!Array.isArray(children)) {
    throw new Error(
      `Retained param drop parent ${newParentId} in section ${sectionId} is missing children.`,
    );
  }
  return [...children];
}

export function getProjectGpuParamListKeyFromSurfaceId(
  surfaceId: string,
): ProjectGpuParamListKey | null {
  const separatorIndex = surfaceId.lastIndexOf(
    PROJECT_GPU_PARAM_CONTENT_SURFACE_SEPARATOR,
  );
  if (separatorIndex < 0) {
    return null;
  }
  const key = surfaceId.slice(
    separatorIndex + PROJECT_GPU_PARAM_CONTENT_SURFACE_SEPARATOR.length,
  );
  return key === "pinned" || key === "unpinned" ? key : null;
}

function isProjectGpuRetainedParamDropAfter(
  event: GpuRetainedContentInteractionHit,
): boolean {
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  const rect = row?.projectedRect ?? event.hit.rect;
  return event.localPoint.y >= rect.y + rect.height / 2;
}

function getProjectGpuRetainedParamDropVisibleIndex({
  draggingSet,
  insertAfter,
  overIndex,
  visibleSiblings,
}: {
  readonly draggingSet: ReadonlySet<string>;
  readonly insertAfter: boolean;
  readonly overIndex: number;
  readonly visibleSiblings: readonly string[];
}): number {
  const originalTargetIndex = overIndex + (insertAfter ? 1 : 0);
  let movingRowsBeforeTarget = 0;
  for (let index = 0; index < originalTargetIndex; index++) {
    const siblingId = visibleSiblings[index];
    if (siblingId && draggingSet.has(siblingId)) {
      movingRowsBeforeTarget += 1;
    }
  }
  return originalTargetIndex - movingRowsBeforeTarget;
}

function isProjectGpuRetainedParamDropNoop(
  currentChildren: readonly string[],
  orderedParamIds: readonly string[],
  newIndex: number,
): boolean {
  return currentChildren.indexOf(orderedParamIds[0] ?? "") === newIndex;
}
