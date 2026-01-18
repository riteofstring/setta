import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";
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
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getCurrSectionVariant,
  getSectionChildren,
  getSectionType,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState, useSectionRefs } from "state/definitions";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import { resetSortingOverState } from "./sortingOverState";
let lastPastHalfwayByOverId: Record<string, boolean> = {};
let lastResolvedOverId: string | number | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;

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

function resetLastPastHalfwayByOverId() {
  lastPastHalfwayByOverId = {};
}

function resetLastResolvedOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
}

export function onDragStart({ active }: DragStartEvent) {
  resetLastPastHalfwayByOverId();
  resetLastResolvedOverState();
  resetSortingOverState();
  if (!active.data || !active.data.current) {
    return;
  }
  const sectionRef = useSectionRefs.getState().withNested[active.id];
  const rect = sectionRef?.getBoundingClientRect() ?? null;
  const rawWidth = rect?.width ?? sectionRef?.clientWidth ?? 0;
  const rawHeight = rect?.height ?? sectionRef?.clientHeight ?? 0;
  const activeRect = rect
    ? {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    : null;
  const zoom = useReactFlow.getState().transform[2];
  const safeZoom = zoom > 0 ? zoom : 1;
  const normalizedWidth = rawWidth;
  const normalizedHeight = rawHeight / safeZoom;
  const dndState = useDndState.getState();
  setActiveDnd(
    active.id,
    active.data.current.isTopLevel,
    normalizedWidth,
    normalizedHeight,
    activeRect,
  );
  if (dndState.isMovingFree) {
    manualDndChildrenReset();
    requestAnimationFrame(() => {
      const latestState = useDndState.getState();
      if (!latestState.isMovingFree || latestState.activeId !== active.id) {
        return;
      }
      replaceDndSectionWithTemp(active.id);
    });
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
  const dndState = useDndState.getState();
  const overCandidate = collisions?.[0] ?? over;
  const overCandidateId = overCandidate ? String(overCandidate.id) : null;
  const resolvedOverId = getOverId(overCandidate, collisions);
  const triggerDistCondition =
    getCollisionTriggerDistCondition(resolvedOverId, collisions) ?? false;
  const pastHalfway = getOverCollisionPastHalfway(resolvedOverId, collisions);
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
  const dndStateOverIdKey = dndState.overId ? String(dndState.overId) : null;
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

  if (triggerDistChanged) {
    useDndState.setState({ triggerDistCondition });
  }

  if (shouldUpdateForTrigger || shouldUpdateForPastHalfway || overIdChanged) {
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
    });
    return;
  }

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (!calledFromOnDragMove && overId && getTimeDiff(dndState, overId) < 100) {
    setNullBehavior(overId);
    return;
  }

  setDndTime(overId);

  // Dragging onto the pane or over self.
  if (!overId) {
    removeDndChild(dndSectionId);
    setNullBehavior(overId);
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
    });
    return;
  }

  // Dragging over the temporary section
  if (dndSectionId === overId) {
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
  const pastHalfway = getOverCollisionPastHalfway(overId, collisions) ?? false;
  const overIdKey = overId ? String(overId) : null;
  const tempInNewParent = newParentChildren.includes(dndSectionId);

  if (
    overIdKey &&
    oldParentId &&
    overIdKey === oldParentId &&
    newParentId !== oldParentId
  ) {
    setNullBehavior(overId);
    return;
  }

  // Check if section can actually be dropped onto newParentId
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    removeDndChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
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
  const fallbackId = over ? over.id : null;
  return resolveOverCollisionId(collisions, fallbackId);
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
      return lastPastHalfwayByOverId[overIdKey];
    }
    return null;
  }

  const overCollision = collisions[0];
  if (!overCollision || overCollision.pastHalfway === undefined) {
    return null;
  }

  return Boolean(overCollision.pastHalfway);
}

function getSectionIsGlobalVariables(sectionId: string) {
  return (
    useProjectState.getState().singletonSections.GlobalVariables === sectionId
  );
}

function getSectionIsRoot(sectionId: string) {
  return getIsRoot(getSectionType(useProjectState.getState(), sectionId));
}
