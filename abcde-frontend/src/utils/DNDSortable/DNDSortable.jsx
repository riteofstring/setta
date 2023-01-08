import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSortable } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, ancestorSet, children }) {
  const disabled = useDisableSortable(sectionId, ancestorSet);
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
      {children}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}
