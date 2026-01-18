import { DragDropProvider } from "forks/dnd-kit/adapter";
import { createCollisionTracker } from "forks/dnd-kit/adapter/collision";
import { useMemo } from "react";
import { DeferredDndDeactivation } from "./DeferredDndDeactivation";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { DummyDragOverlay } from "./DummySection";
import { useDndChildren } from "./dndChildren";
import { useDndMode } from "./dndState";
import { useSectionDndSensors } from "./useDNDSensors";
import { onDragStart, useOnDragMove, useOnDragOver } from "./useDropType";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function SectionDndContext({ children }) {
  const { dummyRef, onDragEnd } = useOnDragEndMoveSection();
  const onDragMove = useOnDragMove();
  const onDragOver = useOnDragOver();
  const { modifiers } = useModifiers();
  const sensors = useSectionDndSensors();
  const { isMovingFree, isSorting } = useDndMode();
  const collisionTracker = useMemo(
    () =>
      createCollisionTracker({
        mode: "section",
        getParentByChild: () => useDndChildren.getState().y,
      }),
    [],
  );
  const dndContext = useMemo(
    () => ({
      isMovingFree,
      isSorting,
    }),
    [isMovingFree, isSorting],
  );

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers ?? undefined}
      dndContext={dndContext}
      collisionTracker={collisionTracker}
      debugLabel="section"
    >
      <DragOperationShapeSync />
      <DeferredDndDeactivation />
      {children}
      {isMovingFree ? <DummyDragOverlay ref={dummyRef} /> : null}
    </DragDropProvider>
  );
}
