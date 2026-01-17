import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import { promoteBestCollision } from "./collisionCompare";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  SettaCollision,
} from "./types";

type DragStartOperation = {
  source: Draggable | null;
};

type DragOperation = {
  source: Draggable | null;
  target: Droppable | null;
  activatorEvent: Event | null;
  transform: Coordinates;
};

export function mapDragStartEvent(event: {
  operation: DragStartOperation;
}): DragStartEvent | null {
  const active = event.operation.source;
  if (!active) {
    return null;
  }

  return { active };
}

export function mapDragEvent(
  event: { operation: DragOperation },
  manager: DragDropManager,
  canceled?: boolean,
): DragMoveEvent | DragOverEvent | DragEndEvent | null {
  const active = event.operation.source;
  if (!active) {
    return null;
  }

  const collisions = getCollisions(manager);
  return {
    activatorEvent: event.operation.activatorEvent ?? null,
    active,
    collisions,
    delta: event.operation.transform,
    over: event.operation.target ?? null,
    canceled,
  };
}

function getCollisions(manager: DragDropManager): SettaCollision[] {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return [];
  }

  return promoteBestCollision(collisions as SettaCollision[]);
}
