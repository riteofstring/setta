import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates, Rectangle } from "@dnd-kit/geometry";
import type { DragDropEventHandlers } from "@dnd-kit/react";
import type { WorkspaceHost } from "../../workspaceHost";
import { getDndChildrenStore } from "../dndChildren";
import { getItemDndParentByChild } from "../itemDndChildren";
import { getItemDndStateStore, type ItemListKey } from "../itemDndState";
import { promoteBestCollision } from "./collisionCompare";
import { coerceClientRect, rectFromBoundingRect } from "./rect";
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  SettaCollision,
} from "./types";

export type DndEventHandlers = Partial<{
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
}>;

export function createDragEventHandlers(
  host: WorkspaceHost,
  handlers: DndEventHandlers,
): Pick<
  DragDropEventHandlers,
  "onDragStart" | "onDragMove" | "onDragOver" | "onDragEnd"
> {
  return {
    onDragStart: (event, manager) => {
      const mapped = mapDragStartEvent(host, event, manager);
      if (mapped) handlers.onDragStart?.(mapped);
    },
    onDragMove: (event, manager) => {
      const mapped = mapDragEvent(host, event, manager);
      if (mapped) handlers.onDragMove?.(mapped);
    },
    onDragOver: (event, manager) => {
      const mapped = mapDragEvent(host, event, manager);
      if (mapped) handlers.onDragOver?.(mapped);
    },
    onDragEnd: (event, manager) => {
      const mapped = mapDragEvent(host, event, manager, event.canceled);
      const onEnd = event.canceled ? handlers.onDragCancel : handlers.onDragEnd;
      if (mapped) onEnd?.(mapped);
    },
  };
}

type DragStartOperation = {
  source: Draggable | null;
};

type ActiveDragData = {
  type?: string;
  listKey?: ItemListKey | null;
};

type DragOperation = {
  source: Draggable | null;
  target: Droppable | null;
  activatorEvent: Event | null;
  transform: Coordinates;
};

type CurrentValueWrapper = {
  current?: unknown;
};

type LayoutRectSource = {
  translated?: unknown;
  initial?: unknown;
};

export function mapDragStartEvent(
  host: WorkspaceHost,
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
  host: WorkspaceHost,
  event: { operation: DragOperation },
  manager: DragDropManager,
  canceled?: boolean,
): DragMoveEvent | DragOverEvent | DragEndEvent | null {
  const active = event.operation.source;
  if (!active) {
    return null;
  }

  const collisions = getCollisions(host, manager, active);
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
  host: WorkspaceHost,
  manager: DragDropManager,
  active: Draggable,
): SettaCollision[] {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return [];
  }

  return promoteBestCollision(
    collisions as SettaCollision[],
    getItemCollisionParentByChild(host, active) ??
      getDndChildrenStore(host).getState().y,
  );
}

function getItemCollisionParentByChild(host: WorkspaceHost, active: Draggable) {
  const activeData = getActiveDragData(active);
  if (activeData?.type !== "item") {
    return undefined;
  }

  const listKey =
    activeData.listKey ?? getItemDndStateStore(host).getState().listKey;
  return getItemDndParentByChild(host, listKey ?? null);
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
