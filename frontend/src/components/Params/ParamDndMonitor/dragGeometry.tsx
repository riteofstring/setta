import type { DragDropManager } from "@dnd-kit/dom";

import type { DragOverEvent, DragStartEvent } from "forks/dnd-kit/adapter";

import { rectFromBoundingRect } from "forks/dnd-kit/adapter/rect";

export function getCollisionTriggerDistCondition(
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

export function getPastHalfwayFromCollisions(
  collisions: DragOverEvent["collisions"] | null,
  overId: string | number | null,
): boolean | null {
  if (!collisions || collisions.length === 0 || !overId) {
    return null;
  }

  const match = collisions.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (!match || match.pastHalfway === undefined) {
    return null;
  }

  return Boolean(match.pastHalfway);
}

export function measureParamDragSize(
  manager: DragDropManager | null,
  dndIds: string[],
) {
  let width = 0;
  let height = 0;
  for (const dndId of dndIds) {
    const rect = getDroppableRect(manager, dndId);
    if (!rect) {
      continue;
    }
    width = Math.max(width, rect.width);
    height += rect.height;
  }
  if (width === 0) {
    width = 220;
  }
  if (height === 0) {
    height = 32;
  }
  return { width, height };
}

export function measureParamActiveRect(
  manager: DragDropManager | null,
  dndId: string,
  fallbackRect: DragStartEvent["activeRect"] | null,
) {
  return getDroppableRect(manager, dndId) ?? fallbackRect ?? null;
}

export function getDroppableRect(
  manager: DragDropManager | null,
  droppableId: string,
) {
  const shape = manager?.registry.droppables.get(droppableId)?.shape;
  if (!shape) {
    return null;
  }
  return rectFromBoundingRect(shape.boundingRectangle);
}
