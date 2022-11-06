import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";

export function useHighlightDroppable(sectionId) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState(false);

  function onDragDone() {
    setHighlight(false);
  }

  function highlightArea({ active, over }) {
    if (
      isMovingFree &&
      over?.data?.current?.sortable?.containerId === sectionId &&
      active.id !== sectionId // Can't drop a deck into itself
    ) {
      setHighlight(true);
    } else {
      setHighlight(false);
    }
  }

  useDndMonitor({
    onDragOver: highlightArea,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return highlight;
}

export function useDisableSort(sectionId) {
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
