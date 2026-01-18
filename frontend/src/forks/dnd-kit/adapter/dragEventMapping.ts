import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import { promoteBestCollision } from "./collisionCompare";
import { useParamDndChildren } from "../paramDndChildren";
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

  const collisions = getCollisions(manager, active);
  return {
    activatorEvent: event.operation.activatorEvent ?? null,
    active,
    collisions,
    delta: event.operation.transform,
    over: event.operation.target ?? null,
    canceled,
  };
}

function getCollisions(
  manager: DragDropManager,
  active: Draggable,
): SettaCollision[] {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return [];
  }

  const activeData = active.data as { current?: { type?: string } } | undefined;
  const isParamDrag = activeData?.current?.type === "param";
  const parentByChild = isParamDrag
    ? useParamDndChildren.getState().y
    : undefined;
  return promoteBestCollision(collisions as SettaCollision[], parentByChild);
}
