import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, children }) {
  const disabled = useDisableSort(sectionId);
  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={
        disabled ? DisabledSortingStrategy : verticalListSortingStrategy
      }
      disabled={{ draggable: disabled, droppable: false }}
    >
      {children}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}
