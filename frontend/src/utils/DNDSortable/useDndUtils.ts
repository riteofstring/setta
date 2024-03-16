import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import colors from "tailwindcss/colors";
import { getSectionParentId } from "thunks/sections/getters";
import { useDndState } from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { getDropType } from "utils/DNDSortable/useDropType";
import { useHasNested } from "../../hooks/useSectionChildren";

export function useHighlightDroppable(sectionId: string) {
  const overIsSelf = useOverIsSelf(sectionId);
  const shouldDrop = useDndState((x) => x.shouldDrop && overIsSelf);
  const leftDistCondition = useDndState((x) => x.leftDistCondition);
  const movingFreeInSortable = useDndState((x) => x.movingFreeInSortable);
  const { positionDropType, behaviorDropType } = getDropType({
    leftDistCondition,
    shouldDrop,
    movingFreeInSortable
  });
  const invalid = behaviorDropType === BehaviorDropType.INVALID;

  const style =
    !shouldDrop || !invalid
      ? {}
      : {
          borderRadius: "1.5rem",
          padding: "0.75rem",
          margin: "-0.75rem",
          transition: "background-color 0.2s",
          backgroundColor: invalid ? colors.red[600] : colors.blue[500],
        };

  return {
    style,
    positionDropType: positionDropType[0],
    behaviorDropType,
  };
}

export function useDisableSortable(sectionId: string) {
  const { isSorting, isMovingFree } = useDndMode();
  const [disabled, setDisabled] = useState({
    draggable: false,
    droppable: false,
  });

  function activeIdInAncestorSet(activeId) {
    let parentId = getSectionParentId(sectionId);
    while (parentId) {
      if (activeId === parentId) {
        return true;
      }
      parentId = getSectionParentId(parentId);
    }
    return false;
  }

  function disableSort({ active }) {
    const containerId = active.data.current.sortable?.containerId;

    // Freely moving this section or ancestor of this section
    if (
      isMovingFree &&
      (active.id === sectionId || activeIdInAncestorSet(active.id))
    ) {
      setDisabled({ draggable: true, droppable: true });
    }
    // // Freely moving a child of this section
    // else if (isMovingFree && containerId === sectionId) {
    //   setDisabled({ draggable: true, droppable: false });
    // }
    // Sorting a child of different section
    else if (isSorting && containerId !== sectionId) {
      setDisabled({ draggable: true, droppable: true });
    }
  }

  function onDragDone() {
    setDisabled({ draggable: false, droppable: false });
  }

  useDndMonitor({
    onDragStart: disableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled;
}

export function useIsDraggingFreely() {
  const { isMovingFree } = useDndMode();
  const activeIsTruthy = useDndState((x) => !!x.activeId);
  return isMovingFree && activeIsTruthy;
}

export function useDndMode() {
  const activeIsTopLevel = useDndState((x) => x.activeIsTopLevel);
  const isSorting = useDndState((x) => x.isSorting);
  const isMovingFree = useDndState((x) => x.isMovingFree);
  // only allow one of sorting or movingFree to be true
  // if sorting, then active section must nested
  if (
    isMovingFree !== isSorting &&
    (!isSorting || (isSorting && !activeIsTopLevel))
  ) {
    return { isSorting, isMovingFree };
  }
  return { isSorting: false, isMovingFree: false };
}

export function useDndProps({ sectionId, isTopLevel }) {
  const hasNested = useHasNested(sectionId);

  return {
    id: sectionId,
    data: { isTopLevel, hasNested },
  };
}

export function useOverIsSelf(sectionId) {
  return useDndState((x) => x.overId === sectionId);
}
