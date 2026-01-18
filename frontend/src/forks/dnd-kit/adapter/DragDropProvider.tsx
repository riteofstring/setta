import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { AutoScroller, defaultPreset } from "@dnd-kit/dom";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import { useMemo, useRef, type PropsWithChildren } from "react";
import type { CollisionTracker } from "./collision";
import { defaultCollisionTracker } from "./collision";
import { DndProviderContext } from "./DndProviderContext";
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
  collisionTracker?: CollisionTracker;
  dndContext: {
    isSorting: boolean;
    isMovingFree: boolean;
  };
  debugLabel?: string;
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
  collisionTracker,
  dndContext,
  debugLabel,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: Props) {
  const tracker = collisionTracker ?? defaultCollisionTracker;
  const collisionStatsRef = useRef<{
    moves: number;
    collisions: number;
  } | null>(null);
  const contextValue = useMemo(
    () => ({
      isSorting: dndContext.isSorting,
      isMovingFree: dndContext.isMovingFree,
      collisionDetector: tracker.collisionDetector,
      sortingCollisionDetector: tracker.sortingCollisionDetector,
    }),
    [
      dndContext.isMovingFree,
      dndContext.isSorting,
      tracker.collisionDetector,
      tracker.sortingCollisionDetector,
    ],
  );

  function recordCollisionStats(collisionCount: number): void {
    if (!import.meta.env.DEV) {
      return;
    }
    if (!debugLabel || typeof window === "undefined") {
      return;
    }

    const stats = collisionStatsRef.current ?? { moves: 0, collisions: 0 };
    stats.moves += 1;
    stats.collisions += collisionCount;
    collisionStatsRef.current = stats;

    const windowWithStats = window as Window & {
      __settaDndCollisionStats?: Record<
        string,
        { moves: number; collisions: number; average: number }
      >;
    };
    const nextStats = windowWithStats.__settaDndCollisionStats ?? {};
    nextStats[debugLabel] = {
      moves: stats.moves,
      collisions: stats.collisions,
      average: stats.moves > 0 ? stats.collisions / stats.moves : 0,
    };
    windowWithStats.__settaDndCollisionStats = nextStats;
  }

  function resetCollisionStats(): void {
    if (!import.meta.env.DEV) {
      return;
    }
    if (!debugLabel || typeof window === "undefined") {
      return;
    }

    const stats = { moves: 0, collisions: 0 };
    collisionStatsRef.current = stats;

    const windowWithStats = window as Window & {
      __settaDndCollisionStats?: Record<
        string,
        { moves: number; collisions: number; average: number }
      >;
    };
    const nextStats = windowWithStats.__settaDndCollisionStats ?? {};
    nextStats[debugLabel] = {
      moves: stats.moves,
      collisions: stats.collisions,
      average: 0,
    };
    windowWithStats.__settaDndCollisionStats = nextStats;
  }

  return (
    <DndProviderContext.Provider value={contextValue}>
      <DndKitProvider
        sensors={sensors}
        modifiers={modifiers}
        plugins={plugins}
        onCollision={(event) => {
          const collisions = event.collisions as SettaCollision[] | null;
          tracker.update(collisions);
          recordCollisionStats(collisions?.length ?? 0);
        }}
        onDragStart={(event) => {
          const mapped = mapDragStartEvent(event);
          if (!mapped) {
            return;
          }

          resetCollisionStats();
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
            tracker.reset();
            return;
          }

          if (event.canceled) {
            onDragCancel?.(mapped);
          } else {
            onDragEnd?.(mapped);
          }
          tracker.reset();
        }}
      >
        {children}
      </DndKitProvider>
    </DndProviderContext.Provider>
  );
}
