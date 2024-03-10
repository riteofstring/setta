import { DndContext } from "@dnd-kit/core";
import { DummyDragOverlay } from "./DummySection";
import { useDNDSensors } from "./useDNDSensors";
import {
  onDragOver,
  onDragStart as onDragStartDropType,
  useOnDragMove as useOnDragMoveDropType,
} from "./useDropType";
import { useMeasuring } from "./useMeasuring";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function GlobalDndContext({ children }) {
  const { dummyRef, onDragEnd: onDragEndMoveSections } =
    useOnDragEndMoveSection();
  const onDragMoveDropType = useOnDragMoveDropType();
  const { modifiers, collisionDetection } = useModifiers();
  const sensors = useDNDSensors();
  const measuring = useMeasuring();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStartDropType}
      onDragMove={onDragMoveDropType}
      onDragEnd={onDragEndMoveSections}
      onDragOver={onDragOver}
      modifiers={modifiers}
      // measuring={measuring}
    >
      {children}
      <DummyDragOverlay ref={dummyRef} />
    </DndContext>
  );
}
