import type { PropsWithChildren } from "react";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import { AutoScroller, defaultPreset } from "@dnd-kit/dom";
import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import type {
  ClientRect,
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  SettaCollision,
} from "./types";
import {
  resetCollisionHysteresis,
  updateCollisionHysteresis,
} from "./collision";
import { promoteBestCollision } from "./collisionCompare";

type Props = PropsWithChildren<{
  sensors?: Sensors<DragDropManager>;
  modifiers?: Modifiers<DragDropManager>;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
}>;

const plugins = defaultPreset.plugins.filter((plugin) => plugin !== AutoScroller);

export function DragDropProvider({
  children,
  sensors,
  modifiers,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: Props) {
  return (
    <DndKitProvider
      sensors={sensors}
      modifiers={modifiers}
      plugins={plugins}
      onCollision={(event) => {
        const collisions = event.collisions as SettaCollision[];
        updateCollisionHysteresis(collisions);
      }}
      onDragStart={(event) => {
        const mapped = mapDragStartEvent(event);
        if (!mapped) {
          return;
        }

        onDragStart?.(mapped);
      }}
      onDragMove={(event, manager) => {
        const mapped = mapDragEvent(event, manager);
        if (!mapped) {
          return;
        }

        onDragMove?.(mapped);
      }}
      onDragOver={(event, manager) => {
        const mapped = mapDragEvent(event, manager);
        if (!mapped) {
          return;
        }

        onDragOver?.(mapped);
      }}
      onDragEnd={(event, manager) => {
        const mapped = mapDragEvent(event, manager, event.canceled);
        if (!mapped) {
          resetCollisionHysteresis();
          return;
        }

        if (event.canceled) {
          onDragCancel?.(mapped);
        } else {
          onDragEnd?.(mapped);
        }
        resetCollisionHysteresis();
      }}
    >
      {children}
    </DndKitProvider>
  );
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
