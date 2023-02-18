import { useDndMonitor } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useState } from "react";
import colors from "tailwindcss/colors";
import { PositionDropType } from "utils/DNDSortable/dropTypes";
import { getDropTypeForOneSection } from "utils/DNDSortable/useDropType";

export function useHighlightDroppable(sectionId: string) {
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const activeId = useDndState((x) => x.activeId);
  const overId = useDndState((x) => x.overId);
  const overParentIdIsSelf = useSectionInfos(
    (x) => x.x[overId]?.parentId === sectionId
  );
  const shouldDrop = useDndState(
    (x) =>
      isMovingFree &&
      (overId === sectionId || overParentIdIsSelf) &&
      x.shouldDrop
  );
  const centerYCondition = useDndState((x) => x.centerYCondition);
  const leftDistCondition = useDndState((x) => x.leftDistCondition);
  const { positionDropType, behaviorDropType } = getDropTypeForOneSection({
    sectionId,
    activeId,
    overId,
    centerYCondition,
    leftDistCondition,
    shouldDrop,
  });

  const style =
    !shouldDrop || positionDropType === PositionDropType.NONE
      ? {}
      : {
          borderRadius: "1.5rem",
          padding: "0.75rem",
          margin: "-0.75rem",
          transition: "background-color 0.2s",
          backgroundColor: colors.blue[500],
        };

  if (!shouldDrop) {
    return {
      style,
      positionDropType,
      behaviorDropType,
    };
  } else {
    return {
      style,
      positionDropType,
      behaviorDropType,
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
  const activeIsTruthy = useDndState((x) => !!x.activeId);
  return isMovingFree && activeIsTruthy;
}
