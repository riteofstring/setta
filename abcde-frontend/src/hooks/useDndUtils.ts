import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";

enum HType {
  NONE = "NONE",
  BOX = "BOX",
  LINE_ABOVE = "LINE_ABOVE",
  LINE_BELOW = "LINE_BELOW",
}

export function useHighlightDroppable(sectionId: string) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState<HType>(HType.NONE);

  function onDragDone() {
    setHighlight(HType.NONE);
  }

  function onDragMove({ active, over, collisions }) {
    if (isMovingFree && active.id !== sectionId && over) {
      const leftDistCondition = collisions[0]?.data.leftDist > 50;
      const centerYCondition = collisions[0]?.data.centerYDist < 0;
      const isThisSection = over.id === sectionId;

      // Draw box around section if leftOffset is large enough or if there is no parent
      if (
        isThisSection &&
        (leftDistCondition || !over.data?.current?.sortable)
      ) {
        highlight !== HType.BOX && setHighlight(HType.BOX);
        return;
      }
      // Draw box around parent of current section if leftOffset is small
      if (
        over.data?.current?.sortable?.containerId === sectionId &&
        !leftDistCondition
      ) {
        highlight !== HType.BOX && setHighlight(HType.BOX);
        return;
      }
      // Draw line above section
      if (isThisSection && centerYCondition) {
        highlight !== HType.LINE_ABOVE && setHighlight(HType.LINE_ABOVE);
        return;
      }
      // Draw line below section
      if (isThisSection && !centerYCondition) {
        highlight !== HType.LINE_BELOW && setHighlight(HType.LINE_BELOW);
        return;
      }
    }
    highlight !== HType.NONE && setHighlight(HType.NONE);
  }

  useDndMonitor({
    onDragMove,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  const className = "rounded-3xl relative py-3 px-3 -my-3 -mx-3";
  const transition = "box-shadow 0.2s, background-color 0.2s, outline 0.2s";

  if (highlight === HType.NONE) {
    return {
      className,
      style: { transition, outline: "rgba(0, 0, 0, 0) solid 5px" },
    };
  } else if (highlight === HType.BOX) {
    return {
      className: `${className} z-[100]`,
      style: {
        transition,
        backgroundColor: "hsla(95, 100%, 0%, 0.1)",
        outline: "hsla(95, 100%, 50%, 1) solid 5px",
        boxShadow:
          "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  } else if (highlight === HType.LINE_ABOVE) {
    return {
      className: `${className} z-[100]`,
      style: {
        transition,
        backgroundColor: "hsla(95, 100%, 0%, 0.1)",
        outline: "hsla(0, 50%, 50%, 1) solid 5px",
        boxShadow:
          "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  } else if (highlight === HType.LINE_BELOW) {
    return {
      className: `${className} z-[100]`,
      style: {
        transition,
        backgroundColor: "hsla(95, 100%, 0%, 0.1)",
        outline: "hsla(50, 100%, 50%, 1) solid 5px",
        boxShadow:
          "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)",
      },
    };
  }
}

export function useDisableSort(sectionId: string) {
  const { isSorting, isMovingFree } = useDragActivation();
  const [disabled, setDisabled] = useState(false);

  function disableSort({ active }) {
    const sortableInfo = active?.data.current.sortable;
    if (
      //The currently dragged section is a child of this section
      (isMovingFree && sortableInfo?.containerId === sectionId) ||
      //The currently dragged section is this section (e.g. a deck)
      (isMovingFree && active.id === sectionId) ||
      //The currently dragged section is not a child of this section
      (isSorting && sortableInfo?.containerId !== sectionId)
    ) {
      setDisabled(true);
    }
  }

  function onDragDone() {
    setDisabled(false);
  }

  useDndMonitor({
    onDragStart: disableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled;
}
