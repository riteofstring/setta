import { closestCorners, DndContext, useDroppable } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useStoreActions } from "easy-peasy";
import { useKeyPress } from "react-flow-renderer";
import { updateWithArrayMove } from "utils/utils";

import { useDNDSensors } from "./useDNDSensors";

export function DNDSortable({ sectionId, items, setItems, ...props }) {
  const data = { setItems };
  const { setNodeRef } = useDroppable({
    id: `${sectionId}`,
  });


  return (
    <div ref={setNodeRef}>
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
        data={data}
      >
        {props.children}
      </SortableContext>
    </div>
  );
}

export function GlobalDndContext(props) {
  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const isSorting = useKeyPress("Control");

  const sensors = useDNDSensors();
  function handleDragEnd({ active, over }) {
    if (isSorting) {
      const droppableId = over.data.current.droppableId;
      console.log("active", active);
      console.log("over", over);
      if (active.id !== over.id) {
        console.log("attemping sort");
        // over.data.current.setItems(updateWithArrayMove(active, over));
      }
    }
  }

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      modifiers={modifiers}
    >
      {props.children}
    </DndContext>
  );
}
