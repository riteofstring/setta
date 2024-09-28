import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/CustomSortable";
import { useDisableSortable } from "forks/dnd-kit/useDndUtils";
import { getSectionInfo, getSectionParentId } from "state/getters/sectionInfo";
import { useDndState } from "./dndState";

export function DNDSortable({ sectionId, items, children }) {
  const disabled = useDisableSortable(sectionId);
  const activeId = useDndState((x) => x.activeId);

  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={getSortingStrategy(disabled, activeId)}
      disabled={disabled}
    >
      {children}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}

function getSortingStrategy(disabled, activeId) {
  if (disabled.draggable || disabled.droppable) {
    return DisabledSortingStrategy;
  }
  if (activeId) {
    const parentId = getSectionParentId(activeId);
    if (parentId) {
      return getSectionInfo(parentId).isHorizontalOrientation
        ? horizontalListSortingStrategy
        : verticalListSortingStrategy;
    }
  }
  return DisabledSortingStrategy;
}
