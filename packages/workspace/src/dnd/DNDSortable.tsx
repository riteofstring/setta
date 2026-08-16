import type { ReactNode } from "react";
import { getSectionIsHorizontalOrientation } from "../document/documentSelectors";
import type { Disabled } from "./adapter";
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "./adapter";
import { useDndState } from "./dndState";
import { useDisableSortable } from "./useDndUtils";
import { getDndParentId } from "./useDropType";

export function DNDSortable({
  sectionId,
  items,
  children,
}: {
  sectionId: string;
  items: Array<string>;
  children: ReactNode;
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

function DisabledSortingStrategy(): [
  { x: number; y: number; scaleX: number; scaleY: number },
  number,
] {
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
