import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import { useParamDndChildren } from "../paramDndChildren";
import { promoteBestCollision } from "./collisionCompare";
import { coerceClientRect, rectFromBoundingRect } from "./rect";
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

export function mapDragStartEvent(
  event: {
    operation: DragStartOperation;
  },
  manager?: DragDropManager,
): DragStartEvent | null {
  const active = event.operation.source;
  if (!active) {
    return null;
  }

  return {
    active,
    activeRect: resolveActiveRect(active, manager),
  };
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

function resolveActiveRect(
  active: Draggable,
  manager?: DragDropManager,
): DragStartEvent["activeRect"] {
  const operationRect =
    manager?.dragOperation.shape?.current?.boundingRectangle;
  if (operationRect) {
    return rectFromBoundingRect(operationRect);
  }

  const droppableRect = manager?.registry.droppables.get(active.id)?.shape
    ?.boundingRectangle;
  if (droppableRect) {
    return rectFromBoundingRect(droppableRect);
  }

  const activeRectValue = (active as { rect?: unknown }).rect;
  const resolvedRectValue =
    activeRectValue &&
    typeof activeRectValue === "object" &&
    "current" in activeRectValue
      ? (activeRectValue as { current?: unknown }).current
      : activeRectValue;
  const layoutSource =
    resolvedRectValue &&
    typeof resolvedRectValue === "object" &&
    ("translated" in resolvedRectValue || "initial" in resolvedRectValue)
      ? (resolvedRectValue as { translated?: unknown; initial?: unknown })
      : null;
  const layoutRect =
    layoutSource?.translated ?? layoutSource?.initial ?? resolvedRectValue;
  return coerceClientRect(layoutRect);
}
