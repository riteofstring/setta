import { DragDropProvider } from "forks/dnd-kit/adapter";
import { DeferredDndDeactivation } from "./DeferredDndDeactivation";
import { DragOperationShapeSync } from "./DragOperationShapeSync";
import { DummyDragOverlay } from "./DummySection";
import { useDndMode } from "./dndState";
import { useParamDndState } from "./paramDndState";
import { useDNDSensors } from "./useDNDSensors";
import { onDragStart, useOnDragMove, useOnDragOver } from "./useDropType";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function GlobalDndContext({ children }) {
  const { dummyRef, onDragEnd } = useOnDragEndMoveSection();
  const onDragMove = useOnDragMove();
  const onDragOver = useOnDragOver();
  const { modifiers } = useModifiers();
  const sensors = useDNDSensors();
  const { isMovingFree } = useDndMode();
  const isParamDragging = useParamDndState((x) => x.activeId !== null);

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers ?? undefined}
    >
      <DragOperationShapeSync />
      <DeferredDndDeactivation />
      {children}
      {isMovingFree && !isParamDragging ? (
        <DummyDragOverlay ref={dummyRef} />
      ) : null}
    </DragDropProvider>
  );
}
