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
import { computeNewIndex } from "./adapter";

const DEBUG_DND = true;
const DEBUG_DND_VERBOSE = true;
let lastChildOverByParent: Record<string, string> = {};
let lastPastHalfwayByOverId: Record<string, boolean> = {};

function resetLastChildOverByParent() {
  lastChildOverByParent = {};
}

function resetLastPastHalfwayByOverId() {
  lastPastHalfwayByOverId = {};
}

function formatCollisions(
  collisions: DragOverEvent["collisions"] | null,
) {
  if (!collisions) {
    return null;
  }

  return collisions.map((collision, index) => ({
    index,
    id: collision.id,
    value: collision.value,
    priority: collision.priority,
    type: collision.type,
    pastHalfway: collision.pastHalfway,
    triggerDistCondition: collision.triggerDistCondition,
    absTriggerDist: collision.data?.absTriggerDist,
    triggerDist: collision.data?.triggerDist,
    intersectionRatio: collision.data?.intersectionRatio,
  }));
}

function formatCollisionsSummary(
  collisions: DragOverEvent["collisions"] | null,
): string | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  return collisions
    .map((collision) => {
      const id = String(collision.id);
      const pastHalfway = collision.pastHalfway ? "T" : "F";
      const value =
        typeof collision.value === "number"
          ? collision.value.toFixed(2)
          : String(collision.value);
      return `${id}:${pastHalfway}:${value}`;
    })
    .join(" | ");
}

function logDnd(label: string, data: Record<string, unknown>) {
  if (!DEBUG_DND_VERBOSE) {
    return;
  }

  console.log("[dnd]", label, data);
}

function logDndLine(message: string) {
  if (!DEBUG_DND_VERBOSE) {
    return;
  }

  console.log("[dnd]", message);
}

export function onDragStart({ active }: DragStartEvent) {
  resetLastChildOverByParent();
  resetLastPastHalfwayByOverId();
  if (!active.data || !active.data.current) {
    return;
  }
  const { width, height } = getSectionRectWithNested(active.id);
  const dndState = useDndState.getState();
  setActiveDnd(active.id, active.data.current.isTopLevel, width, height);
  if (dndState.isMovingFree) {
    if (DEBUG_DND) {
      const dndChildrenState = useDndChildren.getState();
      const parentId = dndChildrenState.y[active.id];
      const parentChildren = parentId ? dndChildrenState.x[parentId] : null;
      console.log("[dnd] dragstart-free", {
        activeId: active.id,
        parentId,
        parentChildren,
      });
    }
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

function onDragMove({ active, collisions, over }: DragMoveEvent) {
  const triggerDistCondition = collisions?.[0]?.triggerDistCondition;
  const dndState = useDndState.getState();
  const overCandidate = collisions?.[0] ?? over;
  const overCandidateId = overCandidate ? String(overCandidate.id) : null;
  const resolvedOverId = getOverId(overCandidate, collisions);
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
  const pastHalfwayChanged =
    hasLastPastHalfway &&
    pastHalfway !== null &&
    pastHalfway !== lastPastHalfway;
  const triggerDistChanged =
    triggerDistCondition !== dndState.triggerDistCondition;
  const shouldUpdateForTrigger =
    triggerDistChanged &&
    overCandidateId !== null &&
    overCandidateId === dndState.overId;
  const shouldUpdateForPastHalfway =
    pastHalfwayChanged &&
    resolvedOverIdKey &&
    resolvedOverIdKey === dndState.overId;

  logDnd("dragmove", {
    activeId: active.id,
    triggerDistCondition,
    overId: dndState.overId,
    collisionsSummary: formatCollisionsSummary(collisions),
    collisions: formatCollisions(collisions),
  });

  if (triggerDistChanged) {
    useDndState.setState({ triggerDistCondition });
  }

  if (shouldUpdateForTrigger || shouldUpdateForPastHalfway) {
    onDragOver({
      active,
      over: overCandidate,
      collisions,
      calledFromOnDragMove: true,
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
}: DragOverEvent & { calledFromOnDragMove?: boolean }) {
  if (!collisions) {
    logDnd("dragover-no-collisions", {
      activeId: active.id,
      overIdFromEvent: over?.id ?? null,
      overIdState: useDndState.getState().overId,
    });
    return;
  }

  const dndState = useDndState.getState();
  const overId = getOverId(over, collisions);
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getDndParentId(dndSectionId);

  logDnd("dragover", {
    activeId: active.id,
    overIdFromEvent: over?.id ?? null,
    overIdResolved: overId,
    overIdState: dndState.overId,
    triggerDistCondition: dndState.triggerDistCondition,
    calledFromOnDragMove: Boolean(calledFromOnDragMove),
    dndSectionId,
    oldParentId,
    collisionsSummary: formatCollisionsSummary(collisions),
    collisions: formatCollisions(collisions),
  });

  // There can be discrepancy between over and collisions due to the way state updates in DndContext.
  // Collisions will be more up-to-date. If it's empty, reset relevant state and return early.
  if (collisions.length === 0) {
    logDnd("dragover-empty-collisions", {
      activeId: active.id,
      overIdFromEvent: over?.id ?? null,
      overIdResolved: overId,
      dndSectionId,
      oldParentId,
    });
    setNullBehavior(dndState.overId);
    return;
  }

  if (calledFromOnDragMove && dndState.triggerDistCondition) {
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    });
    return;
  }

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (!calledFromOnDragMove && overId && getTimeDiff(dndState, overId) < 100) {
    logDnd("dragover-recent-overid", {
      activeId: active.id,
      overIdResolved: overId,
      overIdState: dndState.overId,
      timeDiff: getTimeDiff(dndState, overId),
    });
    setNullBehavior(overId);
    return;
  }

  setDndTime(overId);

  // Dragging onto the pane or over self.
  if (!overId) {
    logDnd("dragover-no-overid", {
      activeId: active.id,
      overIdResolved: overId,
      dndSectionId,
      oldParentId,
    });
    removeDndChild(dndSectionId);
    setNullBehavior(overId);
    return;
  }

  if (dndState.triggerDistCondition) {
    logDnd("dragover-left-dist", {
      activeId: active.id,
      overIdResolved: overId,
      dndSectionId,
      oldParentId,
    });
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    });
    return;
  }

  // Dragging over the temporary section
  if (dndSectionId === overId) {
    logDnd("dragover-over-self", {
      activeId: active.id,
      overIdResolved: overId,
      dndSectionId,
    });
    setNullBehavior(overId);
    return;
  }

  // If overId doesn't have a parent, then set newParent to be overId
  const newParentId = getDndParentId(overId) ?? overId;
  logDnd("dragover-new-parent", {
    activeId: active.id,
    overIdResolved: overId,
    newParentId,
    oldParentId,
  });

  maybeMoveToNewParent({
    active,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
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
}: DragOverEvent & {
  dndSectionId: string;
  oldParentId: string;
  newParentId: string;
  dndChildrenState: ZustandDndState;
}) {
  const overId = getOverId(over, collisions);
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  const oldParentChildren = oldParentId
    ? dndChildrenState.x[oldParentId] ?? []
    : [];
  const pastHalfway =
    getOverCollisionPastHalfway(overId, collisions) ?? false;

  logDnd("maybeMoveToNewParent", {
    activeId: active.id,
    overIdResolved: overId,
    newParentId,
    oldParentId,
    newParentChildren,
    oldParentChildren,
    pastHalfway,
    collisionsSummary: formatCollisionsSummary(collisions),
  });
  // Check if section can actually be dropped onto newParentId
  console.log("newParentId", newParentId);
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    logDnd("maybeMoveToNewParent-invalid", {
      activeId: active.id,
      overIdResolved: overId,
      newParentId,
      oldParentId,
      behaviorDropType,
    });
    removeDndChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    return;
  }

  const newParentNumChildren = getSectionChildren(
    useProjectState.getState(),
    newParentId,
  ).length;
  logDnd("maybeMoveToNewParent-children-counts", {
    activeId: active.id,
    newParentId,
    oldParentId,
    newParentNumChildren,
    dndChildrenCount: newParentChildren.length,
  });

  // Special case where you move a section out of its parent
  // and back in, and the section is the only-child of the parent
  if (
    newParentNumChildren === 1 &&
    useProjectState.getState().parentSectionMap[active.id] === newParentId
  ) {
    logDnd("maybeMoveToNewParent-only-child-restore", {
      activeId: active.id,
      newParentId,
      oldParentId,
    });
    addDndChild(oldParentId, newParentId, dndSectionId, 0);
    return;
  }

  const overIndex = newParentChildren.indexOf(overId);
  const activeIndex = newParentChildren.indexOf(dndSectionId);

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
    logDnd("maybeMoveToNewParent-add-child", {
      activeId: active.id,
      overIdResolved: overId,
      newParentId,
      oldParentId,
      overIndex,
      index,
      pastHalfway,
    });
    logDndLine(
      `add-child overIndex=${overIndex} index=${index} pastHalfway=${pastHalfway}`,
    );
    addDndChild(oldParentId, newParentId, dndSectionId, index);
  } else if (activeIndex >= 0 && overIndex >= 0 && overId !== dndSectionId) {
    const nextIndex = computeNewIndex(
      activeIndex,
      overIndex,
      pastHalfway,
      newParentChildren.length,
    );
    logDnd("maybeMoveToNewParent-reorder", {
      activeId: active.id,
      overIdResolved: overId,
      newParentId,
      oldParentId,
      activeIndex,
      overIndex,
      nextIndex,
      pastHalfway,
    });
    logDndLine(
      `reorder activeIndex=${activeIndex} overIndex=${overIndex} nextIndex=${nextIndex} pastHalfway=${pastHalfway}`,
    );
    if (nextIndex !== activeIndex) {
      addDndChild(oldParentId, newParentId, dndSectionId, nextIndex);
    }
  } else {
    logDnd("maybeMoveToNewParent-same-parent", {
      activeId: active.id,
      overIdResolved: overId,
      newParentId,
      oldParentId,
      activeIndex,
      overIndex,
    });
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
}) {
  const overId = getOverId(over, collisions);
  logDnd("leftDistBehavior", {
    activeId: active.id,
    overIdResolved: overId,
    oldParentId,
    dndSectionId,
  });
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
    });
  }
}

function setNullBehavior(overId) {
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

  const overCollision =
    (overId
      ? collisions.find((collision) => collision.id === overId)
      : null) ?? collisions[0];
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
  const state = useProjectState.getState();
  const dndChildrenState = useDndChildren.getState();

  for (const collision of collisions) {
    const collisionId = collision.id;
    const depth = getSectionDepth(String(collisionId), state);
    if (depth > bestDepth) {
      bestDepth = depth;
      bestId = collisionId;
    }
  }

  if (bestId) {
    const bestIdStr = String(bestId);
    const parentId = dndChildrenState.y[bestIdStr];
    if (parentId) {
      lastChildOverByParent[parentId] = bestIdStr;
      return bestId;
    }
  }

  for (const collision of collisions) {
    const containerId = String(collision.id);
    const children = dndChildrenState.x[containerId];
    if (!children || children.length === 0) {
      continue;
    }
    const stickyChildId = lastChildOverByParent[containerId];
    if (stickyChildId && children.includes(stickyChildId)) {
      return stickyChildId;
    }
  }

  return bestId ?? collisions[0]?.id ?? null;
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
