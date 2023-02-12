import { DndContext } from "@dnd-kit/core";
import { DummyDragOverlay } from "./DummySection";
import { useDNDSensors } from "./useDNDSensors";
import {
  onDragEnd as onDragEndDropType,
  onDragStart as onDragStartDropType,
  useOnDragMove as useOnDragMoveDropType,
} from "./useDropType";
import { useModifiers } from "./useModifiers";
import { useOnDragEnd as useOnDragEndMoveSection } from "./useMoveSection";

export function GlobalDndContext({ children }) {
  const { dummyRef, onDragEnd: onDragEndMoveSections } =
    useOnDragEndMoveSection();
  const onDragMoveDropType = useOnDragMoveDropType();
  const { modifiers, collisionDetection } = useModifiers();
  const sensors = useDNDSensors();

  function onDragStart(props) {
    onDragStartDropType(props);
  }

  function onDragMove(props) {
    onDragMoveDropType(props);
  }

  function onDragEnd(props) {
    onDragEndDropType(props);
    onDragEndMoveSections(props);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      modifiers={modifiers}
    >
      {children}
      <DummyDragOverlay ref={dummyRef} />
    </DndContext>
  );
}
