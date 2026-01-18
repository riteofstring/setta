import {
  ParamDndMonitor,
  ParamDragOverlay,
} from "components/Params/ParamDndMonitor";
import { DragDropProvider } from "forks/dnd-kit/adapter";
import { createCollisionTracker } from "forks/dnd-kit/adapter/collision";
import { useMemo, type ReactNode } from "react";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { useParamDndChildren } from "./paramDndChildren";
import { useParamDndSensors } from "./useDNDSensors";

export function ParamDndContext({ children }: { children: ReactNode }) {
  const sensors = useParamDndSensors();
  const collisionTracker = useMemo(
    () =>
      createCollisionTracker({
        mode: "param",
        getParentByChild: () => useParamDndChildren.getState().y,
      }),
    [],
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
      debugLabel="param"
    >
      <DragOperationShapeSync />
      <ParamDndMonitor />
      <ParamDragOverlay />
      {children}
    </DragDropProvider>
  );
}
