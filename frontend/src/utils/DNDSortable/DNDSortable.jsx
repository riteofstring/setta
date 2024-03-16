import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import React from "react";
import { getDndSectionId } from "utils/DNDSortable/dndState";
import { useDisableSortable } from "utils/DNDSortable/useDndUtils";

export function DNDSortable({ sectionId, items, children }) {
  const dndSectionId = getDndSectionId(sectionId);
  const disabled = useDisableSortable(sectionId, dndSectionId);
  return (
    <SortableContext
      id={dndSectionId}
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
