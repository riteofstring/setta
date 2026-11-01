import { useMemo, type ReactNode } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { ItemDndMonitor } from "../items/ItemDndMonitor.js";
import { filterCollisionsForListKey } from "../items/itemDndMonitorUtils.js";
import { ItemDragOverlay } from "../items/ItemDragOverlay.js";
import { DragDropProvider } from "./adapter/index.js";
import {
  createCollisionTracker,
  type CollisionTracker,
} from "./adapter/collision.js";
import type { SettaCollision } from "./adapter/types.js";
import { DragOperationShapeSync } from "./DragOperationShapeSync.js";
import { getItemDndChildrenStore } from "./itemDndChildren.js";
import { getItemDndStateStore, useItemDndState } from "./itemDndState.js";
import { useItemDndSensors } from "./useDNDSensors.js";

export function ItemDndContext({ children }: { children: ReactNode }) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const itemDndActive = useItemDndState(
    (state) => Boolean(state.activeId) || state.pendingReset,
  );
  const shouldRenderHelpers = canEditStructure || itemDndActive;
  const sensors = useItemDndSensors();
  const collisionTracker = useMemo<CollisionTracker>(
    () => createItemCollisionTracker(host),
    [host],
  );
  const dndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );

  return (
    <DragDropProvider
      sensors={sensors}
      dndContext={dndContext}
      collisionTracker={collisionTracker}
    >
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

function createItemCollisionTracker(host: WorkspaceHost): CollisionTracker {
  const baseTracker = createCollisionTracker({
    host,
    mode: "item",
    getParentByChild: () => getItemDndChildrenStore(host).getState().y,
  });
  return {
    ...baseTracker,
    update: (collisions: Array<SettaCollision> | null) => {
      const listKey = getItemDndStateStore(host).getState().listKey;
      if (!listKey || !collisions || collisions.length === 0) {
        baseTracker.update(collisions);
        return;
      }
      const filtered = filterCollisionsForListKey(collisions, listKey) ?? [];
      baseTracker.update(filtered.length === 0 ? null : filtered);
    },
  };
}
