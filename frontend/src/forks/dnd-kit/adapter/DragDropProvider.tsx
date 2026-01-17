import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { AutoScroller, defaultPreset } from "@dnd-kit/dom";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import type { PropsWithChildren } from "react";
import {
  resetCollisionHysteresis,
  updateCollisionHysteresis,
} from "./collision";
import { mapDragEvent, mapDragStartEvent } from "./dragEventMapping";
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  SettaCollision,
} from "./types";

type Props = PropsWithChildren<{
  sensors?: Sensors<DragDropManager>;
  modifiers?: Modifiers<DragDropManager>;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
}>;

const plugins = defaultPreset.plugins.filter(
  (plugin) => plugin !== AutoScroller,
);

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
        if (event.canceled) {
          const control = event.suspend();
          control.abort();
        }

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
