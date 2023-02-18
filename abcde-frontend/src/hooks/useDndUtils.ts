import { useDndMonitor } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import { useState } from "react";
import colors from "tailwindcss/colors";
import { getDropType } from "utils/DNDSortable/useDropType";
import {
  BehaviorDropType,

} from "utils/DNDSortable/dropTypes";

export function useHighlightDroppable(sectionId: string) {
  const overIsSelf = useDndState((x) => x.overId === sectionId);
  const shouldDrop = useDndState((x) => x.shouldDrop && overIsSelf);
  const centerYCondition = useDndState((x) => x.centerYCondition);
  const leftDistCondition = useDndState((x) => x.leftDistCondition);
  const { positionDropType, behaviorDropType } = getDropType({
    centerYCondition,
    leftDistCondition,
    shouldDrop,
  });
  const invalid = behaviorDropType === BehaviorDropType.INVALID;

  const style = !shouldDrop
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
  const activeIsTruthy = useDndState((x) => !!x.activeId);
  return isMovingFree && activeIsTruthy;
}
