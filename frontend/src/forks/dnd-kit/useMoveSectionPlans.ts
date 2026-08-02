import type { Position } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import type { DragEndEvent } from "./adapter";
import { BehaviorDropTypeEnum, type BehaviorDropType } from "./dropTypes";

type TopLevelSectionLayout = {
  x: number;
  y: number;
  zIndex: number;
};

type DndChildrenSnapshot = {
  x: Record<string, string[]>;
  y: Record<string, string>;
};

export type DndRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type SectionMovePlan = {
  sectionIds: string[];
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};

export function planSortingMove({
  children,
  collisions,
  draggingIds,
  draggingSet,
  fallbackOverId,
  fallbackPastHalfway,
  isInvalidTarget,
  over,
  parentId,
}: {
  children: string[];
  collisions: DragEndEvent["collisions"] | null;
  draggingIds: string[];
  draggingSet: Set<string>;
  fallbackOverId: string | null;
  fallbackPastHalfway: boolean | null;
  isInvalidTarget: boolean;
  over: DragEndEvent["over"] | null;
  parentId: string | null;
}): SectionMovePlan | null {
  if (!parentId || isInvalidTarget) {
    return null;
  }

  const overId = resolveSortingOverId({
    collisions,
    items: children,
    fallbackOverId,
    over,
  });
  if (!overId || draggingSet.has(overId)) {
    return null;
  }

  const filteredChildren = children.filter(
    (childId) => !draggingSet.has(childId),
  );
  const overIndex = filteredChildren.indexOf(overId);
  if (overIndex < 0) {
    return null;
  }

  const newIndex = resolveSortInsertIndex({
    collisions,
    fallbackPastHalfway,
    overId,
    overIndex,
  });
  if (
    !doesChildOrderChange(children, filteredChildren, draggingIds, newIndex)
  ) {
    return null;
  }

  return {
    sectionIds: draggingIds,
    newParentId: parentId,
    newIndex,
    positionsById: null,
  };
}

export function planFreeMove({
  behaviorDropType,
  collisions,
  delta,
  dndChildrenState,
  dndSectionId,
  draggingIds,
  draggingRectsById,
  draggingSet,
  isInvalidParent,
  overId,
  parentSectionMap,
  sharedParentChildren,
  sharedParentId,
  topLevelSections,
  toFlowPosition,
}: {
  behaviorDropType: BehaviorDropType | null;
  collisions: DragEndEvent["collisions"] | null;
  delta: DragEndEvent["delta"] | null;
  dndChildrenState: DndChildrenSnapshot;
  dndSectionId: string;
  draggingIds: string[];
  draggingRectsById: Record<string, DndRect> | null;
  draggingSet: Set<string>;
  isInvalidParent: (parentId: string) => boolean;
  overId: string | null;
  parentSectionMap: Record<string, string | null>;
  sharedParentChildren: string[] | null;
  sharedParentId: string | null;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  toFlowPosition: (position: Position) => Position;
}): SectionMovePlan | null {
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    return null;
  }

  const destination = resolveFreeMoveDestination({
    collisions,
    delta,
    dndChildrenState,
    dndSectionId,
    draggingIds,
    draggingRectsById,
    overId,
    toFlowPosition,
  });
  if (!destination) {
    return null;
  }
  if (destination.newParentId && isInvalidParent(destination.newParentId)) {
    return null;
  }
  if (
    shouldSkipFreeMove({
      destination,
      draggingIds,
      draggingSet,
      parentSectionMap,
      sharedParentChildren,
      sharedParentId,
      topLevelSections,
    })
  ) {
    return null;
  }

  return {
    sectionIds: draggingIds,
    newParentId: destination.newParentId,
    newIndex: destination.newIndex,
    positionsById: destination.positionsById,
  };
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

function resolveSortInsertIndex({
  collisions,
  fallbackPastHalfway,
  overId,
  overIndex,
}: {
  collisions: DragEndEvent["collisions"] | null;
  fallbackPastHalfway: boolean | null;
  overId: string;
  overIndex: number;
}): number {
  const pastHalfway =
    getPastHalfwayFromCollisions(overId, collisions) ??
    fallbackPastHalfway ??
    null;
  if (pastHalfway === null) {
    return overIndex;
  }
  return pastHalfway ? overIndex + 1 : overIndex;
}

function resolveFreeMoveDestination({
  collisions,
  delta,
  dndChildrenState,
  dndSectionId,
  draggingIds,
  draggingRectsById,
  overId,
  toFlowPosition,
}: {
  collisions: DragEndEvent["collisions"] | null;
  delta: DragEndEvent["delta"] | null;
  dndChildrenState: DndChildrenSnapshot;
  dndSectionId: string;
  draggingIds: string[];
  draggingRectsById: Record<string, DndRect> | null;
  overId: string | null;
  toFlowPosition: (position: Position) => Position;
}): Omit<SectionMovePlan, "sectionIds"> | null {
  const hasCollisions = Boolean(collisions && collisions.length > 0);
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  if (!hasCollisions && !overId) {
    newParentId = null;
  }

  if (newParentId) {
    const newIndex = resolveParentChildDropIndex({
      children: dndChildrenState.x[newParentId],
      collisions,
      dndSectionId,
      overId,
    });
    if (newIndex === null) {
      return null;
    }
    return {
      newParentId,
      newIndex,
      positionsById: null,
    };
  }

  if (!overId) {
    const positionsById = resolvePaneDropPositions(
      draggingIds,
      draggingRectsById,
      delta,
      toFlowPosition,
    );
    if (!positionsById) {
      return null;
    }
    return {
      newParentId: null,
      newIndex: 0,
      positionsById,
    };
  }

  return {
    newParentId,
    newIndex: null,
    positionsById: null,
  };
}

function resolveParentChildDropIndex({
  children,
  collisions,
  dndSectionId,
  overId,
}: {
  children: string[] | undefined;
  collisions: DragEndEvent["collisions"] | null;
  dndSectionId: string;
  overId: string | null;
}): number | null {
  if (!children) {
    return null;
  }

  const activeIndex = children.indexOf(dndSectionId);
  if (activeIndex >= 0) {
    return activeIndex;
  }

  const overIndex = overId ? children.indexOf(overId) : -1;
  if (overIndex < 0) {
    return 0;
  }

  const pastHalfway = Boolean(getPastHalfwayFromCollisions(overId, collisions));
  return pastHalfway ? overIndex + 1 : overIndex;
}

function shouldSkipFreeMove({
  destination,
  draggingIds,
  draggingSet,
  parentSectionMap,
  sharedParentChildren,
  sharedParentId,
  topLevelSections,
}: {
  destination: Omit<SectionMovePlan, "sectionIds">;
  draggingIds: string[];
  draggingSet: Set<string>;
  parentSectionMap: Record<string, string | null>;
  sharedParentChildren: string[] | null;
  sharedParentId: string | null;
  topLevelSections: Record<string, TopLevelSectionLayout>;
}): boolean {
  return (
    keepsCurrentChildOrder({
      destination,
      draggingIds,
      draggingSet,
      sharedParentChildren,
      sharedParentId,
    }) ||
    keepsCurrentTopLevelLayout({
      destination,
      draggingIds,
      parentSectionMap,
      topLevelSections,
    })
  );
}

function keepsCurrentChildOrder({
  destination,
  draggingIds,
  draggingSet,
  sharedParentChildren,
  sharedParentId,
}: {
  destination: Omit<SectionMovePlan, "sectionIds">;
  draggingIds: string[];
  draggingSet: Set<string>;
  sharedParentChildren: string[] | null;
  sharedParentId: string | null;
}): boolean {
  if (
    !destination.newParentId ||
    destination.newIndex === null ||
    destination.newParentId !== sharedParentId ||
    !sharedParentChildren
  ) {
    return false;
  }

  const filteredChildren = sharedParentChildren.filter(
    (childId) => !draggingSet.has(childId),
  );
  return !doesChildOrderChange(
    sharedParentChildren,
    filteredChildren,
    draggingIds,
    destination.newIndex,
  );
}

function keepsCurrentTopLevelLayout({
  destination,
  draggingIds,
  parentSectionMap,
  topLevelSections,
}: {
  destination: Omit<SectionMovePlan, "sectionIds">;
  draggingIds: string[];
  parentSectionMap: Record<string, string | null>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
}): boolean {
  if (destination.newParentId !== null || !destination.positionsById) {
    return false;
  }

  return (
    areAllTopLevel(parentSectionMap, draggingIds) &&
    positionsMatchTopLevelLayouts(topLevelSections, destination.positionsById)
  );
}

function doesChildOrderChange(
  existingChildren: string[],
  filteredChildren: string[],
  draggingIds: string[],
  newIndex: number,
): boolean {
  const nextChildren = insertIntoArray(
    filteredChildren,
    newIndex,
    ...draggingIds,
  );
  return !arraysEqual(nextChildren, existingChildren);
}

function resolvePaneDropPositions(
  draggingIds: string[],
  draggingRectsById: Record<string, DndRect> | null,
  delta: DragEndEvent["delta"] | null,
  toFlowPosition: (position: Position) => Position,
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
    positions[sectionId] = toFlowPosition({
      x: rect.left + (delta?.x ?? 0),
      y: rect.top + (delta?.y ?? 0),
    });
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
  parentSectionMap: Record<string, string | null>,
  sectionIds: string[],
): boolean {
  for (const sectionId of sectionIds) {
    if ((parentSectionMap[sectionId] ?? null) !== null) {
      return false;
    }
  }
  return true;
}

function positionsMatchTopLevelLayouts(
  topLevelSections: Record<string, TopLevelSectionLayout>,
  positionsById: Record<string, Position>,
): boolean {
  for (const [sectionId, position] of Object.entries(positionsById)) {
    const layout = topLevelSections[sectionId];
    if (!layout) {
      return false;
    }
    if (layout.x !== position.x || layout.y !== position.y) {
      return false;
    }
  }
  return true;
}

function getPastHalfwayFromCollisions(
  overId: string | number,
  collisions: DragEndEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  const matching = collisions.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (!matching || matching.pastHalfway === undefined) {
    return null;
  }

  return Boolean(matching.pastHalfway);
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
