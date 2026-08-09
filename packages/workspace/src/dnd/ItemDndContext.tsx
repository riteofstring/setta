import { useMemo, type ReactNode } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { ItemDndMonitor } from "../items/ItemDndMonitor";
import { filterCollisionsForListKey } from "../items/itemDndMonitorUtils";
import { ItemDragOverlay } from "../items/ItemDragOverlay";
import { DragDropProvider } from "./adapter";
import { createCollisionTracker, type CollisionTracker } from "./adapter/collision";
import type { SettaCollision } from "./adapter/types";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { useItemDndChildren } from "./itemDndChildren";
import { useItemDndState } from "./itemDndState";
import { useItemDndSensors } from "./useDNDSensors";

// The reference's fork-level `ParamDndContext`: the per-section nested drag provider that owns
// the item collision tracker (item mode, collisions filtered to the active list) and mounts
// the shape sync, monitor, and overlay helpers while item dnd is enabled or a drag is still
// resolving. Hosts mount one around a section's item lists.

export function ItemDndContext({ children }: { children: ReactNode }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const isSelectingItems = useItemSelectionMode((state) => state.isSelectingItems);
  const itemDndEnabled = canEditStructure && isSelectingItems;
  const itemDndActive = useItemDndState((state) => Boolean(state.activeId) || state.pendingReset);
  const shouldRenderHelpers = itemDndEnabled || itemDndActive;
  const sensors = useItemDndSensors();
  const collisionTracker = useMemo<CollisionTracker>(() => createItemCollisionTracker(), []);
  const dndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );

  return (
    <DragDropProvider sensors={sensors} dndContext={dndContext} collisionTracker={collisionTracker}>
      {shouldRenderHelpers && (
        <>
          <DragOperationShapeSync />
          <ItemDndMonitor />
          <ItemDragOverlay />
        </>
      )}
      {children}
    </DragDropProvider>
  );
}

function createItemCollisionTracker(): CollisionTracker {
  const baseTracker = createCollisionTracker({
    mode: "item",
    getParentByChild: () => useItemDndChildren.getState().y,
  });
  return {
    ...baseTracker,
    update: (collisions: Array<SettaCollision> | null) => {
      const listKey = useItemDndState.getState().listKey;
      if (!listKey || !collisions || collisions.length === 0) {
        baseTracker.update(collisions);
        return;
      }
      const filtered = filterCollisionsForListKey(collisions, listKey) ?? [];
      baseTracker.update(filtered.length === 0 ? null : filtered);
    },
  };
}
