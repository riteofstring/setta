import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort, useHighlightDroppable } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, children }) {
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
        {children}
      </SortableContext>
    </div>
  );
}
