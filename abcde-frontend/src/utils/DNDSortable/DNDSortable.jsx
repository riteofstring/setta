import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort, useHighlightDroppable } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, ...props }) {
  const { className, style } = useHighlightDroppable(sectionId);
  const disabled = useDisableSort(sectionId);
  return (
    <div className={className} style={style}>
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {props.children}
      </SortableContext>
    </div>
  );
}
