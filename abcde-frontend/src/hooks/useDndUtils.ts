import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";

export enum DropType {
  NONE = "NONE",
  INTO = "INTO",
  ABOVE = "ABOVE",
  BELOW = "BELOW",
}

function getLeftDistCondition(collisions) {
  return collisions[0]?.data.leftDist > 50;
}

export function getDropType(over, collisions) {
  const leftDistCondition = getLeftDistCondition(collisions);
  const centerYCondition = collisions[0]?.data.centerYDist < 0;

  // Drop into section if leftOffset is large enough or if there is no parent
  if (leftDistCondition || !over.data?.current?.sortable) {
    return DropType.INTO;
  }
  // Drop above section
  if (centerYCondition) {
    return DropType.ABOVE;
  }
  // Drop below section
  if (!centerYCondition) {
    return DropType.BELOW;
  }
  return DropType.NONE;
}

export function useHighlightDroppable(sectionId: string) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState<DropType>(DropType.NONE);

  function onDragDone() {
    setHighlight(DropType.NONE);
  }

  function onDragMove({ active, over, collisions }) {
    if (
      isMovingFree &&
      active.id !== sectionId &&
      over &&
      collisions[0]?.id === over.id //avoid weird case where collisions[0] doesn't agree with over.id
    ) {
      let dropType = DropType.NONE;
      // Highlight for this section
      if (over.id === sectionId) {
        dropType = getDropType(over, collisions);
      } else if (
        // Highlight for parent section
        over.data.current?.sortable?.containerId === sectionId &&
        !getLeftDistCondition(collisions)
      ) {
        dropType = DropType.INTO;
      }
      highlight !== dropType && setHighlight(dropType);
      return;
    }
    highlight !== DropType.NONE && setHighlight(DropType.NONE);
  }

  useDndMonitor({
    onDragMove,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });
  // before:content-none before:absolute before:left-0 before:bottom-0 before:h-[100px] before:w-1/2

  const topborder = "[&>_.sectiondndtop]:opacity-100";
  const bottomborder = "[&>_.sectiondndbtm]:opacity-100";

  const className = "rounded-3xl relative py-3 px-3 -my-3 -mx-3";

  const transition = "background-color 0.2s";

  if (highlight === DropType.NONE) {
    return {
      className,
      style: { transition, outline: "rgba(0, 0, 0, 0) solid 5px" },
    };
  } else if (highlight === DropType.INTO) {
    return {
      className: `${className} z-[100]`,
      style: {
        transition,
        backgroundColor: "hsla(245, 100%, 78%, 1)",
        // backgroundImage: dotted
        // outline: "hsla(95, 100%, 50%, 1) solid 5px",
        // boxShadow:
        //   "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  } else if (highlight === DropType.ABOVE) {
    return {
      className: `${className} ${topborder} z-[100] `,
      style: {
        transition,
        // backgroundColor: "hsla(176, 100%, 78%, 1)",
        // backgroundImage: dotted
        // outline: "hsla(0, 50%, 50%, 1) solid 5px",
        // boxShadow:
        //   "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  } else if (highlight === DropType.BELOW) {
    return {
      className: `${className} ${bottomborder} z-[100]`,
      style: {
        transition,
        // backgroundColor: "hsla(126, 100%, 78%, 1)",
        // backgroundImage: dotted
        // outline: "hsla(50, 100%, 50%, 1) solid 5px",
        // boxShadow:
        //   "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  }
}

export function useDisableSortable(sectionId: string, ancestorSet) {
  const { isSorting, isMovingFree } = useDragActivation();
  const [disabled, setDisabled] = useState({
    draggable: false,
    droppable: false,
  });

  function disableSort({ active }) {
    const containerId = active?.data.current.sortable?.containerId;
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
