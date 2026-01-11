import { DragDropProvider } from "forks/dnd-kit/adapter";
import { DummyDragOverlay } from "./DummySection";
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

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers ?? undefined}
    >
      {children}
      <DummyDragOverlay ref={dummyRef} />
    </DragDropProvider>
  );
}
