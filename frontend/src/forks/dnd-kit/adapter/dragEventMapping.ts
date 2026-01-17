import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import { promoteBestCollision } from "./collisionCompare";
import type {
  ClientRect,
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
  const activeRect = getActiveRect(manager);
  const pointerCoordinates = getPointerCoordinates(manager);

  return {
    activatorEvent: event.operation.activatorEvent ?? null,
    active,
    collisions,
    delta: event.operation.transform,
    over: event.operation.target ?? null,
    canceled,
    activeRect,
    pointerCoordinates,
  };
}

function getCollisions(manager: DragDropManager): SettaCollision[] {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return [];
  }

  return promoteBestCollision(collisions as SettaCollision[]);
}

function getActiveRect(manager: DragDropManager): ClientRect | null {
  const shape = manager.dragOperation.shape?.current ?? null;
  if (!shape) {
    return null;
  }

  const rect = shape.boundingRectangle;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getPointerCoordinates(manager: DragDropManager): Coordinates | null {
  return manager.dragOperation.position?.current ?? null;
}
