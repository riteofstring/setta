import {
  forceDeactivateDnd,
  getDndSectionId,
  useDndState,
} from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useRef } from "react";
import { justMoveANode } from "state/actions/nodeInternals";
import {
  getSectionChildren,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { moveSectionWithBackend } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import type { DragEndEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropTypeEnum } from "./dropTypes";
import { logSortDnd } from "./sortingLog";
import { getSortingOverState } from "./sortingOverState";
import { getOverId } from "./useDropType";

function onSortEnd({
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const parentId = active.data?.current?.sortable?.containerId;
  if (!parentId) {
    logSortDnd("sorting drop skip", {
      reason: "no-parent",
      activeId: String(active.id),
    });
    return;
  }

  const children = getSectionChildren(useProjectState.getState(), parentId);
  const activeId = String(active.id);
  const sortingOverState = getSortingOverState(parentId);
  const collisionSummary = summarizeSortingCollisions(collisions, 6);
  const overId = resolveSortingOverId({
    collisions,
    items: children,
    fallbackOverId: sortingOverState?.overId ?? null,
    over,
  });
  if (!overId || activeId === overId) {
    logSortDnd("sorting drop skip", {
      reason: !overId ? "no-over" : "self-over",
      activeId,
      overId,
      parentId,
      sortingOverId: sortingOverState?.overId ?? null,
      sortingPastHalfway: sortingOverState?.pastHalfway ?? null,
      collisionIds: collisionSummary.items,
      collisionCount: collisionSummary.total,
    });
    return;
  }

  const activeIndex = children.indexOf(activeId);
  const overIndex = children.indexOf(overId);

  if (activeIndex < 0 || overIndex < 0) {
    logSortDnd("sorting drop skip", {
      reason: "index-missing",
      activeId,
      overId,
      parentId,
      activeIndex,
      overIndex,
      sortingOverId: sortingOverState?.overId ?? null,
      sortingPastHalfway: sortingOverState?.pastHalfway ?? null,
      collisionIds: collisionSummary.items,
      collisionCount: collisionSummary.total,
    });
    return;
  }

  let newIndex = overIndex;
  const pastHalfway =
    getPastHalfwayFromCollisions(overId, collisions) ??
    sortingOverState?.pastHalfway ??
    null;
  if (pastHalfway !== null) {
    newIndex = computeNewIndex(
      activeIndex,
      overIndex,
      pastHalfway,
      children.length,
    );
  }

  logSortDnd("sorting drop resolve", {
    activeId,
    overId,
    parentId,
    activeIndex,
    overIndex,
    pastHalfway,
    newIndex,
    sortingOverId: sortingOverState?.overId ?? null,
    sortingPastHalfway: sortingOverState?.pastHalfway ?? null,
    collisionIds: collisionSummary.items,
    collisionCount: collisionSummary.total,
  });

  if (newIndex === activeIndex) {
    logSortDnd("sorting drop no-op", {
      activeId,
      overId,
      parentId,
      activeIndex,
      overIndex,
      pastHalfway,
      newIndex,
    });
    return;
  }

  moveSectionWithBackend({
    oldParentId: parentId,
    newParentId: parentId,
    sectionId: activeId,
    newIndex,
    position: null,
  });
}

async function onFreeMoveEnd({
  active,
  over,
  collisions,
  dummyRef,
}: Pick<DragEndEvent, "active" | "over" | "collisions"> & {
  dummyRef: React.RefObject<HTMLDivElement>;
}) {
  const dndChildrenState = useDndChildren.getState();
  const sectionId = active.id;
  const dndSectionId = getDndSectionId(sectionId);
  const resolvedOverId = getOverId(over, collisions);
  const overId = resolvedOverId ? String(resolvedOverId) : null;
  const oldParentId = useProjectState.getState().parentSectionMap[sectionId];
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  let activeIdx: number | null = null;
  let newIndex: number | null = null;
  let position: Position | null = null;
  let pastHalfway: boolean | null = null;
  let indexSource: "placeholder" | "collision" | null = null;
  const behaviorDropType = useDndState.getState().behaviorDropType;
  const hasCollisions = Boolean(collisions && collisions.length > 0);

  if (!hasCollisions && !overId) {
    newParentId = null;
  }

  if (newParentId) {
    const children = dndChildrenState.x[newParentId];
    if (!children) {
      manualDndChildrenReset();
      return;
    }
    const overIdx = overId ? children.indexOf(overId) : -1;
    activeIdx = children.indexOf(dndSectionId);
    if (activeIdx >= 0) {
      newIndex = activeIdx;
      indexSource = "placeholder";
    } else {
      const overCollision =
        collisions?.find((collision) => String(collision.id) === overId) ??
        null;
      pastHalfway = Boolean(overCollision?.pastHalfway);
      if (overIdx >= 0) {
        newIndex = pastHalfway ? overIdx + 1 : overIdx;
      } else {
        newIndex = 0;
      }
      indexSource = "collision";
    }
  }
  // dropping nested section onto pane
  else if (!overId) {
    if (!dummyRef.current) {
      manualDndChildrenReset();
      return;
    }
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });

    if (!oldParentId) {
      justMoveANode(sectionId, position);
      manualDndChildrenReset();
      return;
    }
  }

  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    manualDndChildrenReset();
    return;
  }

  // If dropping the section into where it already was,
  // then just do manualDndChildrenReset
  if (
    oldParentId === newParentId &&
    (!oldParentId ||
      getSectionChildren(useProjectState.getState(), oldParentId).indexOf(
        sectionId,
      ) === newIndex)
  ) {
    manualDndChildrenReset();
    return;
  }

  // const maybeNewSectionData = await maybeMakeCopyOfSection({
  //   sectionId,
  //   oldParentId,
  //   newParentId,
  // });

  let newSectionId = sectionId;
  // if (maybeNewSectionData.sections) {
  //   updateProjectState({ ...maybeNewSectionData, state });
  //   newSectionId = Object.keys(maybeNewSectionData.sections)[0];
  // } else {
  //   newSectionId = maybeNewSectionData;
  // }
  moveSectionWithBackend({
    oldParentId,
    newParentId,
    sectionId: newSectionId,
    newIndex,
    position,
  });
  manualDndChildrenReset();
}

export function useOnDragEnd() {
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({ active, over, collisions, canceled }: DragEndEvent) {
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
        dummyRef,
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

function summarizeSortingCollisions(
  collisions: DragEndEvent["collisions"] | null,
  limit: number,
): {
  items: Array<{ id: string; pastHalfway: boolean | null }>;
  total: number;
} {
  if (!collisions || collisions.length === 0) {
    return { items: [], total: 0 };
  }

  const items = collisions.slice(0, limit).map((collision) => ({
    id: String(collision.id),
    pastHalfway: collision.pastHalfway ?? null,
  }));

  return { items, total: collisions.length };
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
  if (fallbackOverId && items.includes(fallbackOverId)) {
    return fallbackOverId;
  }

  const collisionOverId = getSortingOverIdFromCollisions(collisions, items);
  if (collisionOverId) {
    return collisionOverId;
  }

  const overId = over ? String(over.id) : null;
  if (overId && items.includes(overId)) {
    return overId;
  }

  return null;
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
