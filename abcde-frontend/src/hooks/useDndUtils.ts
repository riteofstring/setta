import { useDndMonitor } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import { useState } from "react";
import colors from "tailwindcss/colors";
import { DropType } from "utils/DNDSortable/dropTypes";
import { getSiblingDropType } from "utils/DNDSortable/useDropType";

export function useHighlightDroppable(sectionId: string) {
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const highlight = useDndState((x) => {
    if (isMovingFree && x.over === sectionId) {
      return x.overDropType;
    }
    return DropType.NONE;
  });
  const activeId = useDndState((x) => x.active);
  const overId = useDndState((x) => x.over);
  const centerYCondition = useDndState((x) => x.centerYCondition);
  const highlightSiblingType = getSiblingDropType({
    activeId,
    overId,
    centerYCondition,
    dropType: highlight,
  });

  if (highlight === DropType.NONE) {
    return {
      style: {},
      highlight,
      highlightSiblingType,
    };
  } else {
    return {
      style: {
        borderRadius: "1.5rem",
        padding: "0.75rem",
        margin: "-0.75rem",
        transition: "background-color 0.2s",
        backgroundColor: colors.blue[500],
      },
      highlight,
      highlightSiblingType,
    };
  }
}

export function useDisableSortable(sectionId: string, ancestorSet) {
  const [disabled, setDisabled] = useState({
    draggable: false,
    droppable: false,
  });

  function disableSort({ active }) {
    const containerId = active.data.current.sortable?.containerId;
    const { isSorting, isMovingFree } = useKeyActivations.getState();
    // Freely moving this section or ancestor of this section
    if (isMovingFree && (active.id === sectionId || active.id in ancestorSet)) {
      setDisabled({ draggable: true, droppable: true });
    }
    // Freely moving a child of this section
    else if (isMovingFree && containerId === sectionId) {
      setDisabled({ draggable: true, droppable: false });
    }
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
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const activeIsTruthy = useDndState((x) => !!x.active);
  return isMovingFree && activeIsTruthy;
}
