import {
  ParamDndMonitor,
  ParamDragOverlay,
} from "components/Params/ParamDndMonitor";
import { DragDropProvider } from "forks/dnd-kit/adapter";
import {
  createCollisionTracker,
  type CollisionTracker,
} from "forks/dnd-kit/adapter/collision";
import type { SettaCollision } from "forks/dnd-kit/adapter/types";
import { useMemo, type ReactNode } from "react";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { useParamDndChildren } from "./paramDndChildren";
import { useParamDndState } from "./paramDndState";
import { useParamDndSensors } from "./useDNDSensors";

function debugParamDnd(_message: string, _details?: Record<string, unknown>) {}

export function ParamDndContext({ children }: { children: ReactNode }) {
  const sensors = useParamDndSensors();
  const collisionTracker = useMemo<CollisionTracker>(() => {
    const baseTracker = createCollisionTracker({
      mode: "param",
      getParentByChild: () => useParamDndChildren.getState().y,
    });
    return {
      ...baseTracker,
      update: (collisions: SettaCollision[] | null) => {
        const listKey = useParamDndState.getState().listKey;
        if (!listKey || !collisions || collisions.length === 0) {
          baseTracker.update(collisions);
          return;
        }
        const filtered = collisions.filter((collision) => {
          const data = collision.data?.droppable?.data as
            | { current?: { listKey?: string | null } }
            | undefined;
          return data?.current?.listKey === listKey;
        });
        if (filtered.length === 0) {
          debugParamDnd("tracker:filtered-empty", {
            listKey,
            collisions: collisions.map((collision) => String(collision.id)),
          });
          return;
        }
        if (filtered.length !== collisions.length) {
          debugParamDnd("tracker:filtered", {
            listKey,
            collisions: collisions.map((collision) => String(collision.id)),
            filtered: filtered.map((collision) => String(collision.id)),
          });
        }
        baseTracker.update(filtered);
      },
    };
  }, []);
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
      debugLabel="param"
    >
      <DragOperationShapeSync />
      <ParamDndMonitor />
      <ParamDragOverlay />
      {children}
    </DragDropProvider>
  );
}
