import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSortable } from "utils/DNDSortable/useDndUtils";
import React from "react";

export function DNDSortable({ sectionId, items, children }) {
  const disabled = useDisableSortable(sectionId);
  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={
        disabled.draggable || disabled.droppable
          ? DisabledSortingStrategy
          : verticalListSortingStrategy
      }
      disabled={disabled}
    >
      {React.cloneElement(children, { droppableDisabled: disabled.droppable })}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}
