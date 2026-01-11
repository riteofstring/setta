import type { PropsWithChildren } from "react";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import { AutoScroller, defaultPreset } from "@dnd-kit/dom";
import type { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";
import type { Coordinates } from "@dnd-kit/geometry";
import type {
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

type Props = PropsWithChildren<{
  sensors?: Sensors<DragDropManager>;
  modifiers?: Modifiers<DragDropManager>;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
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

        onDragEnd?.(mapped);
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
): SettaCollision[] | null {
  const collisions = manager.collisionObserver.collisions;
  if (!collisions || collisions.length === 0) {
    return null;
  }

  return collisions as SettaCollision[];
}
