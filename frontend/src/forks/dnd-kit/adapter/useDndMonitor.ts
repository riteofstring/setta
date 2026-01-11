import { useDragDropMonitor } from "@dnd-kit/react";
import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "./types";

export type DndMonitorHandlers = Partial<{
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
}>;

export function useDndMonitor(handlers: DndMonitorHandlers): void {
  useDragDropMonitor({
    onCollision: (event) => {
      const collisions = event.collisions as SettaCollision[];
      updateCollisionHysteresis(collisions);
    },
    onDragStart: (event) => {
      const mapped = mapDragStartEvent(event);
      if (!mapped) {
        return;
      }

      handlers.onDragStart?.(mapped);
    },
    onDragMove: (event, manager) => {
      const mapped = mapDragEvent(event, manager);
      if (!mapped) {
        return;
      }

      handlers.onDragMove?.(mapped);
    },
    onDragOver: (event, manager) => {
      const mapped = mapDragEvent(event, manager);
      if (!mapped) {
        return;
      }

      handlers.onDragOver?.(mapped);
    },
    onDragEnd: (event, manager) => {
      const mapped = mapDragEvent(event, manager, event.canceled);
      if (!mapped) {
        resetCollisionHysteresis();
        return;
      }

      if (event.canceled) {
        handlers.onDragCancel?.(mapped);
      } else {
        handlers.onDragEnd?.(mapped);
      }

      resetCollisionHysteresis();
    },
  });
}

function mapDragStartEvent(event: {
  operation: { source: Draggable | null };
}): DragStartEvent | null {
  const active = event.operation.source;
  if (!active) {
    return null;
  }

  return { active };
}

function mapDragEvent(
  event: {
    operation: {
      source: Draggable | null;
      target: Droppable | null;
      activatorEvent: Event | null;
      transform: Coordinates;
    };
  },
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

function getCollisions(manager: DragDropManager) {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return [];
  }

  return collisions;
}
