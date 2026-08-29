import { useMemo, type ReactNode } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import { ItemDndMonitor } from "../items/ItemDndMonitor";
import { filterCollisionsForListKey } from "../items/itemDndMonitorUtils";
import { ItemDragOverlay } from "../items/ItemDragOverlay";
import { DragDropProvider } from "./adapter";
import {
  createCollisionTracker,
  type CollisionTracker,
} from "./adapter/collision";
import type { SettaCollision } from "./adapter/types";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { getItemDndChildrenStore } from "./itemDndChildren";
import { getItemDndStateStore, useItemDndState } from "./itemDndState";
import { useItemDndSensors } from "./useDNDSensors";

export function ItemDndContext({ children }: { children: ReactNode }) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const isSelectingItems = useItemSelectionMode(
    (state) => state.isSelectingItems,
  );
  const itemDndEnabled = canEditStructure && isSelectingItems;
  const itemDndActive = useItemDndState(
    (state) => Boolean(state.activeId) || state.pendingReset,
  );
  const shouldRenderHelpers = itemDndEnabled || itemDndActive;
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
