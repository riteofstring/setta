import type { Modifiers, Sensors } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { Accessibility, AutoScroller, defaultPreset } from "@dnd-kit/dom";
import { DragDropProvider as DndKitProvider } from "@dnd-kit/react";
import { useMemo, type PropsWithChildren } from "react";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import type { CollisionTracker } from "./collision.js";
import { DndProviderContext } from "./DndProviderContext.js";
import {
  createDragEventHandlers,
  type DndEventHandlers,
} from "./dragEventMapping.js";
import type { SettaCollision } from "./types.js";

type Props = PropsWithChildren<
  DndEventHandlers & {
    sensors?: Sensors<DragDropManager>;
    modifiers?: Modifiers<DragDropManager>;
    collisionTracker: CollisionTracker;
    dndContext: {
      isSorting: boolean;
      isMovingFree: boolean;
    };
  }
>;

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
  const handlers = createDragEventHandlers(host, {
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  });
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
        {...handlers}
        sensors={sensors}
        modifiers={modifiers}
        plugins={plugins}
        onCollision={(event) => {
          tracker.update(event.collisions as SettaCollision[] | null);
        }}
        onDragEnd={(event, manager) => {
          if (event.canceled) {
            const control = event.suspend();
            control.abort();
          }

          handlers.onDragEnd(event, manager);
          tracker.reset();
        }}
      >
        {children}
      </DndKitProvider>
    </DndProviderContext.Provider>
  );
}
