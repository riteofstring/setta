import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";

import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";

import {
  addParamChild,
  getParamDndParentByChild,
  getParamDndParentId,
  resetParamDndChildren,
  useParamDndChildren,
} from "forks/dnd-kit/paramDndChildren";

import {
  getParamDndItemId,
  getParamIdFromDndItemId,
  getTempParamDndId,
  resetParamDndState,
  setParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";

import { addTemporaryNotification } from "state/actions/notifications";

import { isDescendantOfSelection } from "state/actions/params/paramTree";

import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";

import {
  useMisc,
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";

import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

import { resolveParamPlaceholderMovePlan } from "../paramDndMonitorUtils";

import {
  CollisionDroppableData,
  ParamDragData,
  ParamListView,
  debugParamDnd,
  updateParamDragOver,
} from "./dragOverlayAndStart";

import {
  getCollisionTriggerDistCondition,
  getPastHalfwayFromCollisions,
} from "./dragGeometry";

type ParamDragOverResolution = {
  overParamId: string;
  pastHalfway: boolean;
  triggerDistCondition: boolean;
  filteredCollisions: NonNullable<DragOverEvent["collisions"]>;
};

let lastResolvedOverId: string | null = null;

let lastResolvedPastHalfway: boolean | null = null;

let lastResolvedTriggerDistCondition: boolean | null = null;

let lastFilteredCollisionEmpty: boolean | null = null;

export type ParamDragOverInput = Pick<
  DragMoveEvent,
  "active" | "collisions" | "over"
>;

let pendingParamDragOver: ParamDragOverInput | null = null;

let paramDragOverRaf: number | null = null;

export function isNoopParamDragMove({
  newParentId,
  oldParentId,
  orderedDraggingIds,
  newIndex,
  newParentImpl,
}: {
  newParentId: string;
  oldParentId: string;
  orderedDraggingIds: string[];
  newIndex: number;
  newParentImpl: ReturnType<typeof getCurrEffectiveCodeObjImpl>;
}) {
  if (newParentId !== oldParentId || !isBaseParentCodeObjImpl(newParentImpl)) {
    return false;
  }
  const currentIndex = newParentImpl.children.indexOf(orderedDraggingIds[0]);
  return currentIndex === newIndex;
}

export function getLoggedFilteredParamCollisions(
  collisions: NonNullable<DragOverEvent["collisions"]>,
  listKey: ParamListKey,
) {
  const filteredCollisions = filterCollisionsForListKey(collisions, listKey);
  if (!filteredCollisions || filteredCollisions.length === 0) {
    noteFilteredCollisionEmpty(collisions, listKey);
    return null;
  }
  noteFilteredCollisionResume(filteredCollisions, listKey);
  return filteredCollisions;
}

function noteFilteredCollisionEmpty(
  collisions: NonNullable<DragOverEvent["collisions"]>,
  listKey: ParamListKey,
) {
  if (collisions.length === 0 || lastFilteredCollisionEmpty === true) {
    return;
  }
  lastFilteredCollisionEmpty = true;
  debugParamDnd("over:filtered-empty", {
    collisions: collisions.map((collision) => String(collision.id)),
    listKey,
  });
}

function noteFilteredCollisionResume(
  filteredCollisions: NonNullable<DragOverEvent["collisions"]>,
  listKey: ParamListKey,
) {
  if (!lastFilteredCollisionEmpty) {
    return;
  }
  lastFilteredCollisionEmpty = false;
  debugParamDnd("over:filtered-resume", {
    collisions: filteredCollisions.map((collision) => String(collision.id)),
    listKey,
  });
}

export function resolveParamDragOverResolution({
  filteredCollisions,
  over,
  listKey,
  sectionId,
  rootId,
}: {
  filteredCollisions: NonNullable<DragOverEvent["collisions"]>;
  over: DragOverEvent["over"];
  listKey: ParamListKey;
  sectionId: string;
  rootId: string | null;
}): ParamDragOverResolution | null {
  const resolvedOverId = resolveOverCollisionId(
    filteredCollisions,
    getOverIdForListKey(over, listKey),
    getParamDndParentByChild(listKey),
  );
  const normalizedOverId = normalizeParamOverId(
    resolvedOverId ? String(resolvedOverId) : null,
    sectionId,
    rootId,
  );
  if (!normalizedOverId) {
    return null;
  }
  return {
    overParamId: getParamIdFromDndItemId(normalizedOverId),
    pastHalfway:
      getPastHalfwayFromCollisions(filteredCollisions, resolvedOverId) ?? false,
    triggerDistCondition:
      getCollisionTriggerDistCondition(resolvedOverId, filteredCollisions) ??
      false,
    filteredCollisions,
  };
}

function normalizeParamOverId(
  overId: string | null,
  sectionId: string,
  rootId: string | null,
) {
  if (!overId) {
    return null;
  }
  return overId === sectionId && rootId ? rootId : overId;
}

export function updateResolvedParamDragOverState({
  overParamId,
  pastHalfway,
  triggerDistCondition,
}: ParamDragOverResolution) {
  if (
    overParamId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return false;
  }

  lastResolvedOverId = overParamId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;
  return true;
}

export function resolveParamDragPlaceholderMove({
  activeId,
  listKey,
  parentById,
  draggingIds,
  overId,
  pastHalfway,
  triggerDistCondition,
}: {
  activeId: string;
  listKey: ParamListKey;
  parentById: Record<string, string | null>;
  draggingIds: string[];
  overId: string;
  pastHalfway: boolean;
  triggerDistCondition: boolean;
}) {
  const tempId = getTempParamDndId(getParamDndItemId(activeId, listKey));
  const newParentId = resolveParamDragParent({
    overId,
    parentById,
    draggingIds,
    triggerDistCondition,
  });
  if (!newParentId) {
    return null;
  }
  return {
    tempId,
    overId,
    oldParentId: getParamDndParentId(tempId) ?? null,
    newParentId,
    pastHalfway,
  };
}

function resolveParamDragParent({
  overId,
  parentById,
  draggingIds,
  triggerDistCondition,
}: {
  overId: string;
  parentById: Record<string, string | null>;
  draggingIds: string[];
  triggerDistCondition: boolean;
}) {
  if (!Object.prototype.hasOwnProperty.call(parentById, overId)) {
    return null;
  }
  if (isDescendantOfSelection(parentById, overId, new Set(draggingIds))) {
    return null;
  }
  if (triggerDistCondition) {
    return overId;
  }
  return getParamDndParentId(overId) ?? overId;
}

export function maybeMovePlaceholder({
  tempId,
  overId,
  oldParentId,
  newParentId,
  pastHalfway,
}: {
  tempId: string;
  overId: string;
  oldParentId: string | null;
  newParentId: string;
  pastHalfway: boolean;
}) {
  const dndChildrenState = useParamDndChildren.getState();
  const movePlan = resolveParamPlaceholderMovePlan({
    tempId,
    overId,
    oldParentId,
    newParentId,
    pastHalfway,
    newParentChildren: dndChildrenState.x[newParentId] ?? [],
  });
  if (!movePlan) {
    return;
  }

  if (movePlan.type === "move-parent") {
    debugParamDnd("placeholder:move-parent", {
      tempId,
      oldParentId,
      newParentId,
      overId,
      overIndex: movePlan.overIndex,
      index: movePlan.index,
      pastHalfway,
    });
    addParamChild(oldParentId, newParentId, tempId, movePlan.index);
    return;
  }

  debugParamDnd("placeholder:reorder", {
    tempId,
    parentId: newParentId,
    overId,
    activeIndex: movePlan.activeIndex,
    overIndex: movePlan.overIndex,
    nextIndex: movePlan.index,
    pastHalfway,
  });
  addParamChild(oldParentId, newParentId, tempId, movePlan.index);
}

export function getParamDragData(event: DragStartEvent): {
  sectionId: string;
  listKey: ParamListKey | null;
  paramId: string | null;
} | null {
  const data = event.active.data?.current as ParamDragData | undefined;
  if (!data || data.type !== "param" || !data.sectionId) {
    return null;
  }
  return {
    sectionId: data.sectionId,
    listKey: data.listKey ?? null,
    paramId: data.paramId ?? null,
  };
}

export function isParamDrag(active: DragStartEvent["active"]) {
  return (active.data?.current as ParamDragData | undefined)?.type === "param";
}

function filterCollisionsForListKey(
  collisions: DragOverEvent["collisions"] | null,
  listKey: ParamListKey | null,
) {
  if (!collisions || !listKey) {
    return collisions;
  }
  return collisions.filter((collision) => {
    const data = collision.data?.droppable?.data as
      | CollisionDroppableData
      | undefined;
    return data?.current?.listKey === listKey;
  });
}

function getOverIdForListKey(
  over: DragOverEvent["over"] | null,
  listKey: ParamListKey | null,
) {
  if (!over) {
    return null;
  }
  if (!listKey) {
    return over.id;
  }
  const data = over.data as CollisionDroppableData | undefined;
  if (data?.current?.listKey !== listKey) {
    return null;
  }
  return over.id;
}

export function canStartParamDrag(sectionId: string) {
  if (!useMisc.getState().isSelectingParams) {
    return false;
  }
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (sectionImpl.paramFilter.trim().length > 0) {
    addTemporaryNotification("Param move disabled while filter is active.");
    return false;
  }
  return true;
}

export function resolveParamListView(
  state: ZustandProjectState,
  sectionId: string,
  activeId: string,
  listKey: ParamListKey | null,
): ParamListView | null {
  if (listKey) {
    const view = getParamListView(state, sectionId, listKey);
    if (
      view &&
      Object.prototype.hasOwnProperty.call(
        view.requiredParamIdsToPaths,
        activeId,
      )
    ) {
      return view;
    }
  }
  const pinned = getParamListView(state, sectionId, "pinned");
  if (
    pinned &&
    Object.prototype.hasOwnProperty.call(
      pinned.requiredParamIdsToPaths,
      activeId,
    )
  ) {
    return pinned;
  }
  const unpinned = getParamListView(state, sectionId, "unpinned");
  if (
    unpinned &&
    Object.prototype.hasOwnProperty.call(
      unpinned.requiredParamIdsToPaths,
      activeId,
    )
  ) {
    return unpinned;
  }
  return null;
}

function getParamListView(
  state: ZustandProjectState,
  sectionId: string,
  listKey: ParamListKey,
): ParamListView {
  const { requiredParamIdsToPaths, topLevelParamIds } = getCurrShownParamIds(
    state,
    sectionId,
    listKey === "pinned",
    true,
  );
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const filtered = filterEdgeInputs(
    requiredParamIdsToPaths,
    topLevelParamIds,
    impl.edgeInputParams,
  );
  return {
    listKey,
    requiredParamIdsToPaths: filtered.requiredParamIdsToPaths,
    topLevelParamIds: filtered.topLevelParamIds,
  };
}

function filterEdgeInputs(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<string>,
  edgeInputParams: Array<string>,
) {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }
  const filteredTopLevel = topLevelParamIds.filter(
    (paramId) => !edgeInputSet.has(paramId),
  );
  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: filteredTopLevel,
  };
}

export function resetParamDragState() {
  resetScheduledParamDragOver();
  resetParamDndChildren();
  resetParamDndState();
  resetParamDragOverState();
}

export function deferParamDragReset(reason: string) {
  resetScheduledParamDragOver();
  resetParamDragOverState();
  setParamDndState({ pendingReset: true });
  debugParamDnd("end:defer-reset", { reason });
}

export function resetParamDragOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
  lastFilteredCollisionEmpty = null;
}

export function scheduleParamDragOver(event: ParamDragOverInput) {
  pendingParamDragOver = {
    active: event.active,
    collisions: event.collisions,
    over: event.over,
  };
  if (paramDragOverRaf !== null) {
    return;
  }
  paramDragOverRaf = requestAnimationFrame(() => {
    paramDragOverRaf = null;
    const nextEvent = pendingParamDragOver;
    pendingParamDragOver = null;
    if (nextEvent) {
      updateParamDragOver(nextEvent);
    }
  });
}

function resetScheduledParamDragOver() {
  if (paramDragOverRaf !== null) {
    cancelAnimationFrame(paramDragOverRaf);
    paramDragOverRaf = null;
  }
  pendingParamDragOver = null;
}
