import {
  addDndChild,
  removeDndChild,
  replaceDndSectionWithTemp,
  useDndChildren,
} from "forks/dnd-kit/dndChildren";
import {
  getDndSectionId,
  setActiveDnd,
  setDndTime,
  useDndState,
  ZustandDndState,
} from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { getSectionRectWithNested } from "forks/xyflow/core/utils/graph";
import {
  getCurrSectionVariant,
  getSectionChildren,
  getSectionType,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState, ZustandProjectState } from "state/definitions";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";
import { pickBestCollision } from "forks/dnd-kit/adapter/collisionCompare";
import { computeNewIndex } from "./adapter";
import { resetSortingOverState } from "./sortingOverState";
let lastPastHalfwayByOverId: Record<string, boolean> = {};
let lastResolvedOverId: string | number | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;
let lastMoveResolvedOverId: string | number | null = null;
let lastMoveCollisionSignature: string | null = null;
let lastMoveCollisionCount: number | null = null;
const DND_DEBUG_COLLISION_LIMIT = 8;
let dndLogSequence = 0;

function shouldLogDnd(): boolean {
  if (!useDndState.getState().isMovingFree) {
    return false;
  }
  return true;
}

function summarizeCollisions(
  collisions: DragOverEvent["collisions"] | null,
): Array<{
  id: string;
  pastHalfway: boolean | null;
  intersectionRatio: number | null;
  absTriggerDist: number | null;
  rect: { top: number; left: number; width: number; height: number } | null;
}> {
  if (!collisions || collisions.length === 0) {
    return [];
  }

  return collisions.slice(0, DND_DEBUG_COLLISION_LIMIT).map((collision) => ({
    id: String(collision.id),
    pastHalfway: collision.pastHalfway ?? null,
    intersectionRatio: collision.data?.intersectionRatio ?? null,
    absTriggerDist: collision.data?.absTriggerDist ?? null,
    rect: summarizeRect(collision.data?.droppable?.shape?.boundingRectangle),
  }));
}

function summarizeCollisionIds(
  collisions: DragOverEvent["collisions"] | null,
): { ids: string[]; total: number } {
  if (!collisions || collisions.length === 0) {
    return { ids: [], total: 0 };
  }

  return {
    ids: collisions
      .slice(0, DND_DEBUG_COLLISION_LIMIT)
      .map((collision) => String(collision.id)),
    total: collisions.length,
  };
}

function getOverIdCollisionMatch(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!overId) {
    return null;
  }

  if (!collisions || collisions.length === 0) {
    return false;
  }

  return collisions.some((collision) => String(collision.id) === String(overId));
}

function getCollisionTriggerDistCondition(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId !== null) {
    const matching = collisions.find(
      (collision) => String(collision.id) === String(overId),
    );
    if (matching && matching.triggerDistCondition !== undefined) {
      return Boolean(matching.triggerDistCondition);
    }
  }

  const fallback = collisions[0]?.triggerDistCondition;
  if (fallback === undefined) {
    return null;
  }

  return Boolean(fallback);
}

function summarizeRect(
  rect:
    | {
        top: number;
        left: number;
        width: number;
        height: number;
      }
    | null
    | undefined,
): { top: number; left: number; width: number; height: number } | null {
  if (!rect) {
    return null;
  }

  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function logDnd(label: string, payload: Record<string, unknown>): void {
  if (!shouldLogDnd()) {
    return;
  }

  dndLogSequence += 1;
  const serialized = JSON.stringify({
    seq: dndLogSequence,
    ts: Date.now(),
    label,
    ...payload,
  });
  console.log(serialized);
}

function resetLastPastHalfwayByOverId() {
  lastPastHalfwayByOverId = {};
}

function resetLastResolvedOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
}

function resetLastMoveState() {
  lastMoveResolvedOverId = null;
  lastMoveCollisionSignature = null;
  lastMoveCollisionCount = null;
}

function logOverSkip(reason: string, payload: Record<string, unknown> = {}) {
  logDnd("free-move over skip", { reason, ...payload });
}

export function onDragStart({ active }: DragStartEvent) {
  resetLastPastHalfwayByOverId();
  resetLastResolvedOverState();
  resetLastMoveState();
  resetSortingOverState();
  if (!active.data || !active.data.current) {
    return;
  }
  const { width, height } = getSectionRectWithNested(active.id);
  const dndState = useDndState.getState();
  setActiveDnd(active.id, active.data.current.isTopLevel, width, height);
  if (dndState.isMovingFree) {
    manualDndChildrenReset();
    replaceDndSectionWithTemp(active.id);
  }
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({
  active,
  collisions,
  over,
  activeRect,
  pointerCoordinates,
}: DragMoveEvent) {
  const dndState = useDndState.getState();
  const overCandidate = collisions?.[0] ?? over;
  const overCandidateId = overCandidate ? String(overCandidate.id) : null;
  const resolvedOverId = getOverId(overCandidate, collisions);
  const triggerDistCondition =
    getCollisionTriggerDistCondition(resolvedOverId, collisions) ?? false;
  const collisionSummary = summarizeCollisionIds(collisions);
  const collisionSignature = collisionSummary.ids.join(",");
  const pastHalfway = getOverCollisionPastHalfway(
    resolvedOverId,
    collisions,
  );
  const resolvedOverIdKey = resolvedOverId ? String(resolvedOverId) : null;
  const hasLastPastHalfway =
    resolvedOverIdKey !== null &&
    Object.prototype.hasOwnProperty.call(
      lastPastHalfwayByOverId,
      resolvedOverIdKey,
    );
  const lastPastHalfway = hasLastPastHalfway
    ? lastPastHalfwayByOverId[resolvedOverIdKey]
    : null;
  const dndStateOverIdKey = dndState.overId
    ? String(dndState.overId)
    : null;
  const pastHalfwayChanged =
    hasLastPastHalfway &&
    pastHalfway !== null &&
    pastHalfway !== lastPastHalfway;
  const triggerDistChanged =
    triggerDistCondition !== dndState.triggerDistCondition;
  const overIdChanged = resolvedOverIdKey !== dndStateOverIdKey;
  const shouldUpdateForTrigger =
    triggerDistChanged &&
    overCandidateId !== null &&
    overCandidateId === dndState.overId;
  const shouldUpdateForPastHalfway =
    pastHalfwayChanged &&
    resolvedOverIdKey &&
    resolvedOverIdKey === dndState.overId;
  const shouldLogMove =
    resolvedOverIdKey !== lastMoveResolvedOverId ||
    collisionSignature !== lastMoveCollisionSignature ||
    collisionSummary.total !== lastMoveCollisionCount;

  if (triggerDistChanged) {
    useDndState.setState({ triggerDistCondition });
  }

  if (shouldLogMove) {
    logDnd("free-move move", {
      activeId: String(active.id),
      overId: resolvedOverIdKey,
      overCandidateId,
      pastHalfway,
      triggerDistCondition,
      dndStateOverId: dndState.overId,
      dndStateTriggerDistCondition: dndState.triggerDistCondition,
      activeRect: summarizeRect(activeRect),
      pointerCoordinates: pointerCoordinates
        ? {
            x: Math.round(pointerCoordinates.x),
            y: Math.round(pointerCoordinates.y),
          }
        : null,
      collisionIds: collisionSummary.ids,
      collisionCount: collisionSummary.total,
      collisions: summarizeCollisions(collisions),
    });
    lastMoveResolvedOverId = resolvedOverIdKey;
    lastMoveCollisionSignature = collisionSignature;
    lastMoveCollisionCount = collisionSummary.total;
  }

  if (shouldUpdateForTrigger || shouldUpdateForPastHalfway || overIdChanged) {
    onDragOver({
      active,
      over: overCandidate,
      collisions,
      calledFromOnDragMove: true,
      activeRect,
      pointerCoordinates,
    });
  }

  if (resolvedOverIdKey && pastHalfway !== null) {
    lastPastHalfwayByOverId[resolvedOverIdKey] = pastHalfway;
  }
}

export function useOnDragOver() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragOver;
  }
  return () => {};
}

function onDragOver({
  active,
  over,
  collisions,
  calledFromOnDragMove,
  activeRect,
  pointerCoordinates,
}: DragOverEvent & { calledFromOnDragMove?: boolean }) {
  if (!collisions) {
    logOverSkip("collisions-null", {
      activeId: String(active.id),
      overCandidateId: over ? String(over.id) : null,
    });
    return;
  }

  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getDndParentId(dndSectionId);

  // There can be discrepancy between over and collisions due to the way state updates in DndContext.
  // Collisions will be more up-to-date. If it's empty, reset relevant state and return early.
  if (collisions.length === 0) {
    if (
      lastResolvedOverId === null &&
      lastResolvedPastHalfway === null &&
      lastResolvedTriggerDistCondition === dndState.triggerDistCondition &&
      dndState.overId === null &&
      dndState.behaviorDropType === null
    ) {
      return;
    }

    lastResolvedOverId = null;
    lastResolvedPastHalfway = null;
    lastResolvedTriggerDistCondition = dndState.triggerDistCondition;
    removeDndChild(dndSectionId);
    setNullBehavior(null);
    logOverSkip("collisions-empty", {
      activeId: String(active.id),
      overCandidateId: over ? String(over.id) : null,
      dndStateOverId: dndState.overId,
      dndStateTriggerDistCondition: dndState.triggerDistCondition,
    });
    return;
  }

  const overId = getOverId(over, collisions);
  const pastHalfway = getOverCollisionPastHalfway(overId, collisions);
  const triggerDistCondition = dndState.triggerDistCondition;

  if (
    overId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return;
  }

  const collisionSummary = summarizeCollisionIds(collisions);
  logDnd("free-move over", {
    activeId: String(active.id),
    overId: overId ? String(overId) : null,
    overCandidateId: over ? String(over.id) : null,
    pastHalfway,
    triggerDistCondition,
    calledFromOnDragMove: Boolean(calledFromOnDragMove),
    overIdInCollisions: getOverIdCollisionMatch(overId, collisions),
    previousResolvedOverId: lastResolvedOverId,
    previousResolvedPastHalfway: lastResolvedPastHalfway,
    previousResolvedTriggerDistCondition: lastResolvedTriggerDistCondition,
    dndStateOverId: dndState.overId,
    dndStateTriggerDistCondition: dndState.triggerDistCondition,
    activeRect: summarizeRect(activeRect),
    pointerCoordinates: pointerCoordinates
      ? {
          x: Math.round(pointerCoordinates.x),
          y: Math.round(pointerCoordinates.y),
        }
      : null,
    collisionIds: collisionSummary.ids,
    collisionCount: collisionSummary.total,
    collisions: summarizeCollisions(collisions),
  });

  lastResolvedOverId = overId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;

  if (calledFromOnDragMove && dndState.triggerDistCondition) {
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
      activeRect,
      pointerCoordinates,
    });
    return;
  }

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (!calledFromOnDragMove && overId && getTimeDiff(dndState, overId) < 100) {
    logOverSkip("recent-overId", {
      activeId: String(active.id),
      overId: String(overId),
      timeDiff: getTimeDiff(dndState, overId),
    });
    setNullBehavior(overId);
    return;
  }

  setDndTime(overId);

  // Dragging onto the pane or over self.
  if (!overId) {
    removeDndChild(dndSectionId);
    setNullBehavior(overId);
    logOverSkip("overId-null", {
      activeId: String(active.id),
      overCandidateId: over ? String(over.id) : null,
    });
    return;
  }

  if (dndState.triggerDistCondition) {
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
      activeRect,
      pointerCoordinates,
    });
    return;
  }

  // Dragging over the temporary section
  if (dndSectionId === overId) {
    logOverSkip("over-temp", {
      activeId: String(active.id),
      overId: String(overId),
    });
    setNullBehavior(overId);
    return;
  }

  // If overId doesn't have a parent, then set newParent to be overId
  const newParentId = getDndParentId(overId) ?? overId;

  maybeMoveToNewParent({
    active,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
    activeRect,
    pointerCoordinates,
  });
}

function maybeMoveToNewParent({
  active,
  over,
  dndSectionId,
  oldParentId,
  newParentId,
  dndChildrenState,
  collisions,
  activeRect,
  pointerCoordinates,
}: DragOverEvent & {
  dndSectionId: string;
  oldParentId: string;
  newParentId: string;
  dndChildrenState: ZustandDndState;
}) {
  const overId = getOverId(over, collisions);
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  const pastHalfway =
    getOverCollisionPastHalfway(overId, collisions) ?? false;
  const overIdKey = overId ? String(overId) : null;
  const tempInNewParent = newParentChildren.includes(dndSectionId);

  if (
    overIdKey &&
    oldParentId &&
    overIdKey === oldParentId &&
    newParentId !== oldParentId
  ) {
    logDnd("free-move reparent skip", {
      activeId: String(active.id),
      dndSectionId,
      overId: overIdKey,
      oldParentId,
      newParentId,
      reason: "over-current-parent",
    });
    setNullBehavior(overId);
    return;
  }

  // Check if section can actually be dropped onto newParentId
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    removeDndChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    logDnd("free-move invalid drop", {
      activeId: String(active.id),
      overId: overId ? String(overId) : null,
      newParentId,
    });
    return;
  }

  const newParentNumChildren = getSectionChildren(
    useProjectState.getState(),
    newParentId,
  ).length;

  // Special case where you move a section out of its parent
  // and back in, and the section is the only-child of the parent
  if (
    newParentNumChildren === 1 &&
    useProjectState.getState().parentSectionMap[active.id] === newParentId
  ) {
    addDndChild(oldParentId, newParentId, dndSectionId, 0);
    return;
  }

  // Prevent flicker when dragging over a container with existing children.
  if (
    overId !== null &&
    String(overId) === newParentId &&
    newParentNumChildren > 0 &&
    !tempInNewParent
  ) {
    logDnd("free-move remove temp", {
      activeId: String(active.id),
      dndSectionId,
      overId: String(overId),
      newParentId,
      newParentNumChildren,
    });
    removeDndChild(dndSectionId);
    return;
  }

  const overIndex = newParentChildren.indexOf(overId);

  // Check if the temporary section has a new parent
  if (newParentId !== oldParentId) {
    let index = 0;
    if (overIndex >= 0) {
      index = pastHalfway ? overIndex + 1 : overIndex;
    } else if (
      overId !== null &&
      String(overId) === newParentId &&
      newParentChildren.length > 0
    ) {
      index = pastHalfway ? newParentChildren.length : 0;
    }
    logDnd("free-move reparent", {
      activeId: String(active.id),
      dndSectionId,
      oldParentId,
      newParentId,
      overId: overId ? String(overId) : null,
      overIndex,
      pastHalfway,
      index,
      newParentChildrenLength: newParentChildren.length,
      overIdInCollisions: getOverIdCollisionMatch(overId, collisions),
      collisionIds: summarizeCollisionIds(collisions).ids,
      collisionCount: summarizeCollisionIds(collisions).total,
      activeRect: summarizeRect(activeRect),
      pointerCoordinates: pointerCoordinates
        ? {
            x: Math.round(pointerCoordinates.x),
            y: Math.round(pointerCoordinates.y),
          }
        : null,
      });
    addDndChild(oldParentId, newParentId, dndSectionId, index);
  } else {
    const activeIndex = newParentChildren.indexOf(dndSectionId);
    if (activeIndex >= 0 && overIndex >= 0 && overId !== dndSectionId) {
      const nextIndex = computeNewIndex(
        activeIndex,
        overIndex,
        pastHalfway,
        newParentChildren.length,
      );
      if (nextIndex !== activeIndex) {
        logDnd("free-move reorder", {
          activeId: String(active.id),
          dndSectionId,
          parentId: newParentId,
          overId: overId ? String(overId) : null,
          activeIndex,
          overIndex,
          pastHalfway,
          nextIndex,
          newParentChildrenLength: newParentChildren.length,
          overIdInCollisions: getOverIdCollisionMatch(overId, collisions),
          collisionIds: summarizeCollisionIds(collisions).ids,
          collisionCount: summarizeCollisionIds(collisions).total,
          activeRect: summarizeRect(activeRect),
          pointerCoordinates: pointerCoordinates
            ? {
                x: Math.round(pointerCoordinates.x),
                y: Math.round(pointerCoordinates.y),
              }
            : null,
        });
        addDndChild(oldParentId, newParentId, dndSectionId, nextIndex);
      }
    }
  }

  setNullBehavior(overId);
}

function leftDistBehavior({
  active,
  over,
  dndChildrenState,
  oldParentId,
  dndSectionId,
  collisions,
  activeRect,
  pointerCoordinates,
}) {
  const overId = getOverId(over, collisions);
  // Consider overId to be the new parent, if it's not the temp section.
  if (overId !== dndSectionId) {
    maybeMoveToNewParent({
      active,
      over,
      dndSectionId,
      oldParentId,
      newParentId: overId,
      dndChildrenState,
      collisions,
      activeRect,
      pointerCoordinates,
    });
  }
}

function setNullBehavior(overId) {
  const dndState = useDndState.getState();
  if (dndState.behaviorDropType === null && dndState.overId === overId) {
    return;
  }

  useDndState.setState({
    behaviorDropType: null,
    overId,
  });
}

function getTimeDiff(state, sectionId) {
  return Date.now() - (state.times[sectionId] ?? 0);
}

export function getDndParentId(dndSectionId: string) {
  return useDndChildren.getState().y[dndSectionId];
}

function getBehaviorDropType(activeId: string, newParentId: string) {
  // invalid
  // if parent can't have children
  // or if parent variant is frozen
  // or if dragged section is global variables (TODO: loosen this restriction)
  if (
    !getSectionIsRoot(newParentId) ||
    getCurrSectionVariant(useProjectState.getState(), newParentId).isFrozen ||
    getSectionIsGlobalVariables(activeId)
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  return null;
}

export function getOverId(
  over: { id: string | number } | null,
  collisions: DragOverEvent["collisions"] | null,
) {
  const collisionOver = getCollisionOverId(collisions);
  if (collisionOver) {
    return collisionOver;
  }

  return over ? over.id : null;
}

function getOverCollisionPastHalfway(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId) {
    const matching = collisions.find((collision) => collision.id === overId);
    if (matching && matching.pastHalfway !== undefined) {
      return Boolean(matching.pastHalfway);
    }

    const overIdKey = String(overId);
    const hasLastPastHalfway = Object.prototype.hasOwnProperty.call(
      lastPastHalfwayByOverId,
      overIdKey,
    );
    if (hasLastPastHalfway) {
      const collisionSummary = summarizeCollisionIds(collisions);
      logDnd("pastHalfway fallback", {
        overId: overIdKey,
        resolvedId: null,
        collisionIds: collisionSummary.ids,
        collisionCount: collisionSummary.total,
        fallbackSource: "last-known",
        fallbackValue: lastPastHalfwayByOverId[overIdKey],
      });
      return lastPastHalfwayByOverId[overIdKey];
    }

    const collisionSummary = summarizeCollisionIds(collisions);
    logDnd("pastHalfway fallback", {
      overId: overIdKey,
      resolvedId: null,
      collisionIds: collisionSummary.ids,
      collisionCount: collisionSummary.total,
      fallbackSource: "none",
      fallbackValue: null,
    });
    return null;
  }

  const overCollision = collisions[0];
  if (!overCollision || overCollision.pastHalfway === undefined) {
    return null;
  }

  return Boolean(overCollision.pastHalfway);
}

function getCollisionOverId(
  collisions: DragOverEvent["collisions"] | null,
): string | number | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  let bestId: string | number | null = null;
  let bestDepth = -1;
  let bestParentId: string | null = null;
  let resolvedReason = "none";
  const state = useProjectState.getState();
  const dndChildrenState = useDndChildren.getState();
  const collisionDepths: Array<{ id: string; depth: number }> = [];
  let collisionIndex = 0;

  for (const collision of collisions) {
    const collisionId = collision.id;
    const depth = getSectionDepth(String(collisionId), state);
    if (collisionIndex < DND_DEBUG_COLLISION_LIMIT) {
      collisionDepths.push({ id: String(collisionId), depth });
    }
    collisionIndex += 1;
  }

  const bestCollision = pickBestCollision(collisions);
  if (bestCollision) {
    bestId = bestCollision.id;
    const bestIdStr = String(bestId);
    bestDepth = getSectionDepth(bestIdStr, state);
    const parentId = dndChildrenState.y[bestIdStr];
    if (parentId) {
      bestParentId = parentId;
      resolvedReason = "compare-child";
    } else {
      resolvedReason = "compare-collision";
    }
  }

  let resolvedId: string | number | null = null;
  if (bestId) {
    resolvedId = bestId;
  } else if (collisions[0]?.id) {
    resolvedId = collisions[0].id;
    resolvedReason = "first-collision";
  }

  const collisionSummary = summarizeCollisionIds(collisions);
  logDnd("collision over resolve", {
    collisionIds: collisionSummary.ids,
    collisionCount: collisionSummary.total,
    collisionDepths,
    bestId: bestId ? String(bestId) : null,
    bestDepth,
    bestParentId,
    resolvedId: resolvedId ? String(resolvedId) : null,
    resolvedReason,
  });

  return resolvedId ?? null;
}

function getSectionDepth(sectionId: string, state: ZustandProjectState) {
  if (!state.sections[sectionId]) {
    return -1;
  }

  let depth = 0;
  let parentId = state.parentSectionMap[sectionId];
  while (parentId) {
    depth += 1;
    parentId = state.parentSectionMap[parentId];
  }

  return depth;
}

function getSectionIsGlobalVariables(sectionId: string) {
  return (
    useProjectState.getState().singletonSections.GlobalVariables === sectionId
  );
}

function getSectionIsRoot(sectionId: string) {
  return getIsRoot(getSectionType(useProjectState.getState(), sectionId));
}
