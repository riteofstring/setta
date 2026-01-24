import { useDragDropMonitor } from "@dnd-kit/react";
import { mapDragEvent, mapDragStartEvent } from "./dragEventMapping";
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "./types";

type DndMonitorHandlers = Partial<{
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
}>;

export function useDndMonitor(handlers: DndMonitorHandlers): void {
  useDragDropMonitor({
    onDragStart: (event, manager) => {
      const mapped = mapDragStartEvent(event, manager);
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
        return;
      }

      if (event.canceled) {
        handlers.onDragCancel?.(mapped);
      } else {
        handlers.onDragEnd?.(mapped);
      }
    },
  });
}
