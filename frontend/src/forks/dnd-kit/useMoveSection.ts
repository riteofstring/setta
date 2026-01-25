import {
  forceDeactivateDnd,
  getDndSectionId,
  useDndState,
} from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useRef } from "react";
import {
  getSectionChildren,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { moveSectionsWithBackend } from "state/actions/sections/moveSections";
import {
  getSharedParentId,
  isDescendantOfSectionSelection,
} from "state/actions/sections/sectionSelection";
import { useProjectState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import type { DragEndEvent } from "./adapter";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropTypeEnum } from "./dropTypes";
import { getSortingOverState } from "./sortingOverState";
import { getOverId } from "./useDropType";

function onSortEnd({
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  console.log("[dnd-debug] section:onSortEnd:start", {
    activeId: String(active.id),
    overId: over ? String(over.id) : null,
    collisionCount: collisions?.length ?? 0,
    parentId: active.data?.current?.sortable?.containerId ?? null,
  });
  const parentId = active.data?.current?.sortable?.containerId;
  if (!parentId) {
    console.log("[dnd-debug] section:onSortEnd:no-parent");
    manualDndChildrenReset();
    return;
  }

  const state = useProjectState.getState();
  const children = getSectionChildren(state, parentId);
  const activeId = String(active.id);
  const draggingIds = resolveDraggingIds(activeId);
  const draggingSet = new Set(draggingIds);
  if (isDescendantOfSectionSelection(state, parentId, draggingSet)) {
    console.log("[dnd-debug] section:onSortEnd:descendant", {
      parentId,
      draggingIds,
    });
    manualDndChildrenReset();
    return;
  }
  const sortingOverState = getSortingOverState(parentId);
  const overId = resolveSortingOverId({
    collisions,
    items: children,
    fallbackOverId: sortingOverState?.overId ?? null,
    over,
  });
  if (!overId || draggingSet.has(overId)) {
    console.log("[dnd-debug] section:onSortEnd:invalid-over", {
      overId,
      draggingIds,
    });
    manualDndChildrenReset();
    return;
  }

  const filteredChildren = children.filter(
    (childId) => !draggingSet.has(childId),
  );
  const overIndex = filteredChildren.indexOf(overId);

  if (overIndex < 0) {
    console.log("[dnd-debug] section:onSortEnd:over-not-found", {
      overId,
      childrenCount: children.length,
    });
    manualDndChildrenReset();
    return;
  }

  let newIndex = overIndex;
  const pastHalfway =
    getPastHalfwayFromCollisions(overId, collisions) ??
    sortingOverState?.pastHalfway ??
    null;
  if (pastHalfway !== null) {
    newIndex = pastHalfway ? overIndex + 1 : overIndex;
  }

  const nextChildren = insertIntoArray(
    filteredChildren,
    newIndex,
    ...draggingIds,
  );
  if (arraysEqual(nextChildren, children)) {
    console.log("[dnd-debug] section:onSortEnd:no-change");
    manualDndChildrenReset();
    return;
  }

  console.log("[dnd-debug] section:onSortEnd:move", {
    draggingIds,
    parentId,
    newIndex,
  });
  moveSectionsWithBackend({
    sectionIds: draggingIds,
    newParentId: parentId,
    newIndex,
    positionsById: null,
  });
  manualDndChildrenReset();
}

async function onFreeMoveEnd({
  active,
  over,
  collisions,
  delta,
}: Pick<DragEndEvent, "active" | "over" | "collisions" | "delta">) {
  console.log("[dnd-debug] section:onFreeMoveEnd:start", {
    activeId: String(active.id),
    overId: over ? String(over.id) : null,
    collisionCount: collisions?.length ?? 0,
    delta,
  });
  const dndChildrenState = useDndChildren.getState();
  const activeId = String(active.id);
  const draggingIds = resolveDraggingIds(activeId);
  const draggingSet = new Set(draggingIds);
  const dndSectionId = getDndSectionId(activeId);
  const resolvedOverId = getOverId(over, collisions);
  const overId = resolvedOverId ? String(resolvedOverId) : null;
  const state = useProjectState.getState();
  const sharedParentId = getSharedParentId(state, draggingIds);
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  let newIndex: number | null = null;
  let positionsById: Record<string, Position> | null = null;
  const behaviorDropType = useDndState.getState().behaviorDropType;
  const hasCollisions = Boolean(collisions && collisions.length > 0);

  if (!hasCollisions && !overId) {
    newParentId = null;
  }

  if (newParentId) {
    const children = dndChildrenState.x[newParentId];
    if (!children) {
      console.log("[dnd-debug] section:onFreeMoveEnd:no-children", {
        newParentId,
      });
      manualDndChildrenReset();
      return;
    }
    const activeIdx = children.indexOf(dndSectionId);
    if (activeIdx >= 0) {
      newIndex = activeIdx;
    } else {
      const overIdx = overId ? children.indexOf(overId) : -1;
      const overCollision =
        collisions?.find((collision) => String(collision.id) === overId) ??
        null;
      const pastHalfway = Boolean(overCollision?.pastHalfway);
      if (overIdx >= 0) {
        newIndex = pastHalfway ? overIdx + 1 : overIdx;
      } else {
        newIndex = 0;
      }
    }
  } else if (!overId) {
    newIndex = 0;
    positionsById = resolvePaneDropPositions(
      draggingIds,
      useDndState.getState().draggingRectsById,
      delta,
    );
    if (!positionsById) {
      console.log("[dnd-debug] section:onFreeMoveEnd:no-positions");
      manualDndChildrenReset();
      return;
    }
  }

  if (
    newParentId &&
    isDescendantOfSectionSelection(state, newParentId, draggingSet)
  ) {
    console.log("[dnd-debug] section:onFreeMoveEnd:descendant", {
      newParentId,
      draggingIds,
    });
    manualDndChildrenReset();
    return;
  }

  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    console.log("[dnd-debug] section:onFreeMoveEnd:invalid-drop");
    manualDndChildrenReset();
    return;
  }

  // If dropping the section into where it already was,
  // then just do manualDndChildrenReset
  if (newParentId && sharedParentId === newParentId && newIndex !== null) {
    const children = getSectionChildren(state, newParentId);
    const filteredChildren = children.filter(
      (childId) => !draggingSet.has(childId),
    );
    const nextChildren = insertIntoArray(
      filteredChildren,
      newIndex,
      ...draggingIds,
    );
    if (arraysEqual(nextChildren, children)) {
      console.log("[dnd-debug] section:onFreeMoveEnd:no-change");
      manualDndChildrenReset();
      return;
    }
  }
  if (
    newParentId === null &&
    positionsById &&
    areAllTopLevel(state, draggingIds) &&
    positionsMatchTopLevelLayouts(state, positionsById)
  ) {
    console.log("[dnd-debug] section:onFreeMoveEnd:no-layout-change");
    manualDndChildrenReset();
    return;
  }

  // const maybeNewSectionData = await maybeMakeCopyOfSection({
  //   sectionId,
  //   oldParentId,
  //   newParentId,
  // });

  moveSectionsWithBackend({
    sectionIds: draggingIds,
    newParentId,
    newIndex,
    positionsById,
  });
  console.log("[dnd-debug] section:onFreeMoveEnd:move", {
    draggingIds,
    newParentId,
    newIndex,
    positionsById,
  });
  manualDndChildrenReset();
  scheduleSelectionBoundsUpdate();
}

export function useOnDragEnd() {
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({
    active,
    over,
    collisions,
    canceled,
    delta,
  }: DragEndEvent) {
    console.log("[dnd-debug] section:onDragEnd", {
      activeId: String(active.id),
      overId: over ? String(over.id) : null,
      collisionCount: collisions?.length ?? 0,
      canceled,
      delta,
      isSorting: useDndState.getState().isSorting,
      isMovingFree: useDndState.getState().isMovingFree,
    });
    if (canceled) {
      forceDeactivateDnd();
      return;
    }

    if (useDndState.getState().isSorting) {
      onSortEnd({ active, over, collisions });
    } else if (useDndState.getState().isMovingFree) {
      onFreeMoveEnd({
        active,
        over,
        collisions,
        delta,
      });
    } else {
      manualDndChildrenReset();
    }
    // don't reset isMovingFree or isSorting
    const additionalResetState = (state) => {
      const dndState = state.getState();
      const shouldDeactivate = dndState.pendingDeactivation;
      return {
        isMovingFree: dndState.isMovingFree,
        isSorting: dndState.isSorting,
        pendingDeactivation: shouldDeactivate,
        disabled: dndState.disabled,
      };
    };
    useDndState.getState().reset(additionalResetState);
  }

  return { dummyRef, onDragEnd };
}

function getPastHalfwayFromCollisions(
  overId: string | number,
  collisions: DragEndEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  const overIdKey = String(overId);
  const matching = collisions.find(
    (collision) => String(collision.id) === overIdKey,
  );
  if (!matching || matching.pastHalfway === undefined) {
    return null;
  }

  return Boolean(matching.pastHalfway);
}

function resolveSortingOverId({
  collisions,
  items,
  fallbackOverId,
  over,
}: {
  collisions: DragEndEvent["collisions"] | null;
  items: string[];
  fallbackOverId: string | null;
  over: DragEndEvent["over"] | null;
}): string | null {
  const collisionOverId = getSortingOverIdFromCollisions(collisions, items);
  if (collisionOverId) {
    return collisionOverId;
  }

  const overId = over ? String(over.id) : null;
  if (overId && items.includes(overId)) {
    return overId;
  }

  if (collisions && collisions.length > 0) {
    if (fallbackOverId && items.includes(fallbackOverId)) {
      return fallbackOverId;
    }
  }

  return null;
}

function resolveDraggingIds(activeId: string): string[] {
  const draggingIds = useDndState.getState().draggingIds;
  if (draggingIds.length > 0) {
    return draggingIds;
  }
  return [activeId];
}

function resolvePaneDropPositions(
  draggingIds: string[],
  draggingRectsById: Record<
    string,
    {
      top: number;
      left: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }
  > | null,
  delta: DragEndEvent["delta"] | null,
): Record<string, Position> | null {
  if (!draggingRectsById) {
    return null;
  }
  const positions: Record<string, Position> = {};
  for (const sectionId of draggingIds) {
    const rect = draggingRectsById[sectionId];
    if (!rect) {
      return null;
    }
    const x = rect.left + (delta?.x ?? 0);
    const y = rect.top + (delta?.y ?? 0);
    positions[sectionId] = screenToFlowPosition({ x, y });
  }
  return positions;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function areAllTopLevel(
  state: ReturnType<typeof useProjectState.getState>,
  sectionIds: string[],
): boolean {
  for (const sectionId of sectionIds) {
    const parentId = state.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      return false;
    }
  }
  return true;
}

function positionsMatchTopLevelLayouts(
  state: ReturnType<typeof useProjectState.getState>,
  positionsById: Record<string, Position>,
): boolean {
  for (const [sectionId, position] of Object.entries(positionsById)) {
    const layout = state.projectConfig.topLevelSections[sectionId];
    if (!layout) {
      return false;
    }
    if (layout.x !== position.x || layout.y !== position.y) {
      return false;
    }
  }
  return true;
}

function getSortingOverIdFromCollisions(
  collisions: DragEndEvent["collisions"] | null,
  items: string[],
): string | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  for (const collision of collisions) {
    const collisionId = String(collision.id);
    if (items.includes(collisionId)) {
      return collisionId;
    }
  }

  return null;
}

function scheduleSelectionBoundsUpdate() {
  const activeIds = useProjectState.getState().projectConfig.activeIds;
  if (activeIds.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    useReactFlow.getState().setNodesSelection(activeIds.length, true);
  });
}
