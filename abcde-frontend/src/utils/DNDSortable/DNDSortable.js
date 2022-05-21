import { DndContext, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useStore } from "react-flow-renderer";

import { updateWithArrayMove } from "../utils";
import { useDNDSensors } from "./useDNDSensors";

export function DNDSortable({ items, setItems, ...props }) {
  const zoom = useStore((x) => x.transform[2]);
  const sensors = useDNDSensors();
  function handleDragEnd(event) {
    const { active, over } = event;

    if (active.id !== over.id) {
      setItems(updateWithArrayMove(active, over));
    }
  }

  function useDragWithZoomModifier(args) {
    const { transform } = args;
    return {
      ...transform,
      x: transform.x / zoom,
      y: transform.y / zoom,
    };
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, useDragWithZoomModifier]}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  );
}
