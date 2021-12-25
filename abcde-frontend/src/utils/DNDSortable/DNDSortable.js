import { DndContext, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useDNDSensors } from "./useDNDSensors";

export function DNDSortable({ items, setItems, ...props }) {
  const sensors = useDNDSensors();
  function handleDragEnd(event) {
    const { active, over } = event;

    if (active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
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

export function DNDSortableWithoutSortableContext({
  setItems,
  swapIdsBetweenGroups,
  ...props
}) {
  const sensors = useDNDSensors();
  function handleDragEnd(event) {
    const { active, over } = event;
    const activeGroupId = active.data.current.sortable.containerId;
    const overGroupId = over.data.current.sortable.containerId;
    console.log("activeGroupId, overGroupId", activeGroupId, overGroupId);

    if (active.id !== over.id) {
      if (activeGroupId === overGroupId) {
        setItems({
          childrenInfoId: activeGroupId,
          newStateFn: (items) => {
            const oldIndex = items.indexOf(active.id);
            const newIndex = items.indexOf(over.id);

            return arrayMove(items, oldIndex, newIndex);
          },
        });
      } else {
        swapIdsBetweenGroups({
          group1: activeGroupId,
          group2: overGroupId,
          sectionId1: active.id,
          sectionId2: over.id,
        });
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {props.children}
    </DndContext>
  );
}
