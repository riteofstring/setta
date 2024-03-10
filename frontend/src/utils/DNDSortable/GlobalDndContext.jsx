import { DndContext } from "@dnd-kit/core";
import { DummyDragOverlay } from "./DummySection";
import { useDNDSensors } from "./useDNDSensors";
import {
  onDragStart as onDragStartDropType,
  useOnDragMove as useOnDragMoveDropType,
  useOnDragOver,
} from "./useDropType";
import { useMeasuring } from "./useMeasuring";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function GlobalDndContext({ children }) {
  const { dummyRef, onDragEnd } = useOnDragEndMoveSection();
  const onDragMoveDropType = useOnDragMoveDropType();
  const onDragOver = useOnDragOver();
  const { modifiers, collisionDetection } = useModifiers();
  const sensors = useDNDSensors();
  const measuring = useMeasuring();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStartDropType}
      // onDragMove={onDragMoveDropType}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers}
      // measuring={measuring}
    >
      {children}
      <DummyDragOverlay ref={dummyRef} />
    </DndContext>
  );
}
