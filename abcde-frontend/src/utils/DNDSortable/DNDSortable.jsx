import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, ...props }) {
  const disabled = useDisableSort(sectionId);
  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={verticalListSortingStrategy}
      disabled={disabled}
    >
      {props.children}
    </SortableContext>
  );
}
