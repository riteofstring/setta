import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";
// import resolveConfig from 'tailwindcss/resolveConfig'
// import tailwindConfig from '../../tailwind.config.js'
import colors from 'tailwindcss/colors'

export enum DropType {
  NONE = "NONE",
  INTO = "INTO",
  ABOVE = "ABOVE",
  BELOW = "BELOW",
}

function getLeftDistCondition(collisions) {
  return collisions[0]?.data.leftDist > 50;
}

export function getDropType(active, over, collisions) {
  // Weird case where collisions[0] doesn't agree with over.id).
  // Or if active === over
  if (collisions[0]?.id !== over.id || active.id === over.id) {
    return DropType.NONE;
  }

  // Drop into section if leftOffset is large enough or if there is no parent
  if (!over.data.current.sortable || getLeftDistCondition(collisions)) {
    return DropType.INTO;
  }

  const siblings =
    collisions[0].data.droppableContainer.data.current.sortable?.items;
  const overIndex = siblings.indexOf(over.id);

  // Is effectively sorting
  if (
    active.data.current.sortable?.containerId ===
    over.data.current.sortable?.containerId
  ) {
    const activeIndex = siblings.indexOf(active.id);
    // Drop below the target if moving down the list
    if (activeIndex < overIndex) {
      return DropType.BELOW;
    }
    // Drop above the target if moving up the list
    return DropType.ABOVE;
  }

  // Dropping into a list from outside
  // If the target is anything other than the first element, then drop below it
  if (overIndex > 0) {
    return DropType.BELOW;
  }
  // If the target is the first element
  const centerYCondition = collisions[0].data.centerYDist < 0;
  // Drop above section
  if (centerYCondition) {
    return DropType.ABOVE;
  }
  // Drop below section
  return DropType.BELOW;
}

export function useHighlightDroppable(sectionId: string) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState<DropType>(DropType.NONE);

  function onDragDone() {
    setHighlight(DropType.NONE);
  }

  function onDragMove({ active, over, collisions }) {
    if (isMovingFree && active.id !== sectionId && over) {
      let dropType = DropType.NONE;
      // Highlight for this section
      if (over.id === sectionId) {
        dropType = getDropType(active, over, collisions);
      } else if (
        // Highlight for parent section
        over.data.current.sortable?.containerId === sectionId &&
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

  // py-3 px-3 -my-3 -mx-3
  const className = "rounded-3xl py-3 px-3 -my-3 -mx-3";
  const transition = "background-color 0.2s";

  

  if (highlight === DropType.NONE) {
    return {
      // className: `${className} [&_.dndline::after]:opacity-0 [&_.dndline::before]:opacity-0`,
      // style: { transition, outline: "rgba(0, 0, 0, 0) solid 5px" },
      // highlight
    };
    // [&_.dndline::after]:opacity-0 [&_.dndline::before]:opacity-0 z-[100]
  } else if (highlight === DropType.INTO) {
    return {
      className: `${className} `,
      style: {
        transition,
        backgroundColor: colors.blue[500]

      },
      highlight
    };
  } else if (highlight === DropType.ABOVE) {
    return {
      // className: `${className} [&>.dndline::before]:opacity-100 z-[100]`,
      // style: {
      //   transition,
      // },
    };
  } else if (highlight === DropType.BELOW) {
    return {
      // className: `${className} [&>.dndline::after]:opacity-100 z-[100]`,
      // style: {
      //   transition,
      // },
      highlight
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
    const containerId = active.data.current.sortable?.containerId;
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
