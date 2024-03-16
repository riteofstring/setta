import { DndContext } from "@dnd-kit/core";
import { DummyDragOverlay } from "./DummySection";
import { useDNDSensors } from "./useDNDSensors";
import {
  onDragEnd as onDragEndDropType,
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

  function onDragStart(props) {
    onDragStartDropType(props);
  }

  function onDragMove(props) {
    onDragMoveDropType(props);
  }

  function onDragEnd(props) {
    onDragEndMoveSections(props);
    onDragEndDropType(props);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      modifiers={modifiers}
      measuring={measuring}
    >
      {children}
      <DummyDragOverlay ref={dummyRef} />
    </DndContext>
  );
}
