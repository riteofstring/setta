import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates, Rectangle } from "@dnd-kit/geometry";
import { getParamDndParentByChild } from "../paramDndChildren";
import { useParamDndState } from "../paramDndState";
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

type ActiveDragData = {
  type?: string;
  listKey?: ReturnType<typeof useParamDndState.getState>["listKey"] | null;
};

type CurrentValueWrapper = {
  current?: unknown;
};

type LayoutRectSource = {
  translated?: unknown;
  initial?: unknown;
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

  return promoteBestCollision(
    collisions as SettaCollision[],
    getParamCollisionParentByChild(active),
  );
}

function getParamCollisionParentByChild(active: Draggable) {
  const activeData = getActiveDragData(active);
  if (activeData?.type !== "param") {
    return undefined;
  }

  const listKey = activeData.listKey ?? useParamDndState.getState().listKey;
  return getParamDndParentByChild(listKey ?? null);
}

function getActiveDragData(active: Draggable): ActiveDragData | null {
  return (
    (active.data as { current?: ActiveDragData } | undefined)?.current ?? null
  );
}

function getManagerBoundingRect(
  activeId: Draggable["id"],
  manager?: DragDropManager,
): Rectangle["boundingRectangle"] | null {
  return (
    manager?.dragOperation.shape?.current?.boundingRectangle ??
    manager?.registry.droppables.get(activeId)?.shape?.boundingRectangle ??
    null
  );
}

function getCurrentValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("current" in value)) {
    return value;
  }

  return (value as CurrentValueWrapper).current;
}

function getTranslatedOrInitialValue(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const layoutSource = value as LayoutRectSource;
  return layoutSource.translated ?? layoutSource.initial ?? value;
}

function getActiveLayoutRect(active: Draggable): unknown {
  const activeRectValue = (active as { rect?: unknown }).rect;
  return getTranslatedOrInitialValue(getCurrentValue(activeRectValue));
}

function resolveActiveRect(
  active: Draggable,
  manager?: DragDropManager,
): DragStartEvent["activeRect"] {
  const managerRect = getManagerBoundingRect(active.id, manager);
  if (managerRect) {
    return rectFromBoundingRect(managerRect);
  }

  return coerceClientRect(getActiveLayoutRect(active));
}
