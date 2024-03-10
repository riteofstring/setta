import { DndContext } from "@dnd-kit/core";
import { useDndChildren } from "models/info/dndChildren";
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

  function onDragOver({ active, over }) {
    const oldParentId = active?.data.current.sortable?.containerId;
    const newParentId = over?.data.current.sortable?.containerId; // ?? over?.id
    if (newParentId && oldParentId && newParentId !== oldParentId) {
      const newParentChildren = useDndChildren.getState().x[newParentId];
      const index = newParentChildren.indexOf(over.id);
      useDndChildren.getState().setChildren({
        sectionId: newParentId,
        children: [
          ...newParentChildren.slice(0, index),
          active.id,
          ...newParentChildren.slice(index),
        ],
      });
      useDndChildren.getState().setChildren({
        sectionId: oldParentId,
        children: useDndChildren
          .getState()
          .x[oldParentId].filter((x) => x !== active.id),
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
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
