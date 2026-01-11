import { DragDropProvider } from "forks/dnd-kit/adapter";
import { useDNDSensors } from "./useDNDSensors";
import { onDragStart, useOnDragOver } from "./useDropType";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function GlobalDndContext({ children }) {
  const { onDragEnd } = useOnDragEndMoveSection();
  const onDragOver = useOnDragOver();
  const sensors = useDNDSensors();

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      {children}
    </DragDropProvider>
  );
}
