import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { Accessibility, AutoScroller, defaultPreset } from "@dnd-kit/dom";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import { useMemo, type PropsWithChildren } from "react";
import { useWorkspaceHost } from "../../workspaceHostContext";
import type { CollisionTracker } from "./collision";
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

// The reference's provider minus its DEV-only collision-stats instrumentation
// (`window.__settaDndCollisionStats`), which is Vite-app debug tooling.
type Props = PropsWithChildren<{
  sensors?: Sensors<DragDropManager>;
  modifiers?: Modifiers<DragDropManager>;
  collisionTracker: CollisionTracker;
  dndContext: {
    isSorting: boolean;
    isMovingFree: boolean;
  };
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
}>;

// The dependency accessibility plugin imperatively turns every full-surface drag activator into
// an ARIA button with pressed/grabbed state. Section and item activators contain real controls, so
// that role flattens their interactive descendants in screen-reader trees. The package supplies
// explicit selection, keyboard movement, and focus semantics at those surfaces instead.
const plugins = defaultPreset.plugins.filter(
  (plugin) => plugin !== Accessibility && plugin !== AutoScroller,
);

export function DragDropProvider({
  children,
  sensors,
  modifiers,
  collisionTracker,
  dndContext,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: Props) {
  const host = useWorkspaceHost();
  const tracker = collisionTracker;
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

  return (
    <DndProviderContext.Provider value={contextValue}>
      <DndKitProvider
        sensors={sensors}
        modifiers={modifiers}
        plugins={plugins}
        onCollision={(event) => {
          tracker.update(event.collisions as SettaCollision[] | null);
        }}
        onDragStart={(event, manager) => {
          const mapped = mapDragStartEvent(host, event, manager);
          if (!mapped) {
            return;
          }

          onDragStart?.(mapped);
        }}
        onDragMove={(event, manager) => {
          const mapped = mapDragEvent(host, event, manager);
          if (!mapped) {
            return;
          }

          onDragMove?.(mapped);
        }}
        onDragOver={(event, manager) => {
          const mapped = mapDragEvent(host, event, manager);
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

          const mapped = mapDragEvent(host, event, manager, event.canceled);
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
