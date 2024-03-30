import {
  SortableContext,
  verticalListSortingStrategy,
} from "utils/DNDSortable/CustomSortable";
import { useDisableSortable } from "utils/DNDSortable/useDndUtils";

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
      {children}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}
