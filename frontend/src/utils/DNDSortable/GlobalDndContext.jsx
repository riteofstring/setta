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
    if (newParentId) {
      const newParentChildren = useDndChildren.getState().x[newParentId];
      if (newParentId !== oldParentId) {
        const index = newParentChildren.indexOf(over.id);
        useDndChildren.getState().setChildren({
          sectionId: newParentId,
          children: [
            ...newParentChildren.slice(0, index),
            active.id,
            ...newParentChildren.slice(index),
          ],
        });
        if (oldParentId) {
          useDndChildren.getState().setChildren({
            sectionId: oldParentId,
            children: useDndChildren
              .getState()
              .x[oldParentId].filter((x) => x !== active.id),
          });
        }
      } else {
        const oldIndex = newParentChildren.indexOf(active.id);
        const newIndex = newParentChildren.indexOf(over.id);
        useDndChildren.getState().setChildren({
          sectionId: oldParentId,
          children: moveElement(newParentChildren, oldIndex, newIndex),
        });
      }
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

function moveElement(array, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    fromIndex >= array.length ||
    toIndex < 0 ||
    toIndex >= array.length
  ) {
    throw new Error("Index out of bounds");
  }
  const newArray = [...array];
  const element = newArray.splice(fromIndex, 1)[0];
  newArray.splice(toIndex, 0, element);
  return newArray;
}
