import type { Disabled } from "forks/dnd-kit/adapter";
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { useDisableSortable } from "forks/dnd-kit/useDndUtils";
import { getSectionIsHorizontalOrientation } from "state/actions/sectionInfos";
import { useDndState } from "./dndState";
import { getDndParentId } from "./useDropType";

export function DNDSortable({
  sectionId,
  items,
  children,
}: {
  sectionId: string;
  items: Array<string>;
  children: React.ReactNode;
}) {
  const disabled = useDisableSortable(sectionId);
  const idForDeterminingStrategy = useDndState((x) =>
    x.isSorting ? x.activeId : x.overId,
  );

  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={getSortingStrategy(
        disabled,
        idForDeterminingStrategy,
        sectionId,
      )}
      disabled={disabled}
    >
      {children}
    </SortableContext>
  );
}

function DisabledSortingStrategy() {
  return [{ x: 0, y: 0, scaleX: 1, scaleY: 1 }, -1];
}

function getSortingStrategy(
  disabled: Disabled,
  idForDeterminingStrategy: string | null,
  containerId: string,
) {
  if (disabled.draggable || disabled.droppable) {
    return DisabledSortingStrategy;
  }

  const parentId = idForDeterminingStrategy
    ? getDndParentId(idForDeterminingStrategy)
    : null;
  const resolvedParentId = parentId ?? containerId;
  return getSectionIsHorizontalOrientation(resolvedParentId)
    ? horizontalListSortingStrategy
    : verticalListSortingStrategy;
}
