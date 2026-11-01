import type { ReactNode } from "react";
import { getSectionIsHorizontalOrientation } from "../document/documentSelectors.js";
import type { Disabled } from "./adapter/index.js";
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "./adapter/index.js";
import { useDndState } from "./dndState.js";
import { useDisableSortable } from "./useDndUtils.js";
import { getDndParentId } from "./useDropType.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

export function DNDSortable({
  sectionId,
  items,
  children,
}: {
  sectionId: string;
  items: Array<string>;
  children: ReactNode;
}) {
  const host = useWorkspaceHost();
  const disabled = useDisableSortable(sectionId);
  const idForDeterminingStrategy = useDndState((x) =>
    x.isSorting ? x.activeId : x.overId,
  );

  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={getSortingStrategy(
        host,
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
  host: ReturnType<typeof useWorkspaceHost>,
  disabled: Disabled,
  idForDeterminingStrategy: string | null,
  containerId: string,
) {
  if (disabled.draggable || disabled.droppable) {
    return DisabledSortingStrategy;
  }

  const parentId = idForDeterminingStrategy
    ? getDndParentId(host, idForDeterminingStrategy)
    : null;
  const resolvedParentId = parentId ?? containerId;
  return getSectionIsHorizontalOrientation(host, resolvedParentId)
    ? horizontalListSortingStrategy
    : verticalListSortingStrategy;
}
