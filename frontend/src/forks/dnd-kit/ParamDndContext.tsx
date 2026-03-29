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
import { useMisc } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import {
  buildParamDndCollisionScopeView,
  buildParamDndContextView,
} from "./paramDndContextView";
import { useParamDndChildren } from "./paramDndChildren";
import { useParamDndState } from "./paramDndState";
import { useParamDndSensors } from "./useDNDSensors";

function debugParamDnd(_message: string, _details?: Record<string, unknown>) {}

export function ParamDndContext({ children }: { children: ReactNode }) {
  const { canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const paramDndActive = useParamDndState(
    (state) => Boolean(state.activeId) || state.pendingReset,
  );
  const { dndContext, shouldRenderHelpers } = buildParamDndContextView({
    canEditStructure,
    isSelectingParams,
    paramDndActive,
  });
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
        const collisionScope = buildParamDndCollisionScopeView({
          collisions,
          listKey,
        });
        if (collisionScope.filteredToEmpty) {
          debugParamDnd("tracker:filtered-empty", {
            listKey,
            collisions: collisions?.map((collision) => String(collision.id)),
          });
          baseTracker.update(collisionScope.collisions);
          return;
        }
        if (collisionScope.filteredOutCollisions) {
          debugParamDnd("tracker:filtered", {
            listKey,
            collisions: collisions.map((collision) => String(collision.id)),
            filtered: collisionScope.collisions?.map((collision) =>
              String(collision.id),
            ),
          });
        }
        baseTracker.update(collisionScope.collisions);
      },
    };
  }, []);

  return (
    <DragDropProvider
      sensors={sensors}
      dndContext={dndContext}
      collisionTracker={collisionTracker}
      debugLabel="param"
    >
      {shouldRenderHelpers && (
        <>
          <DragOperationShapeSync />
          <ParamDndMonitor />
          <ParamDragOverlay />
        </>
      )}
      {children}
    </DragDropProvider>
  );
}
