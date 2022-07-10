import { closestCenter, DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { updateWithArrayMove } from "../utils";
import { useDNDSensors } from "./useDNDSensors";

export function DNDSortable({ items, setItems, ...props }) {
  const sensors = useDNDSensors();
  function handleDragEnd(event) {
    const { active, over } = event;

    if (active.id !== over.id) {
      setItems(updateWithArrayMove(active, over));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  );
}
