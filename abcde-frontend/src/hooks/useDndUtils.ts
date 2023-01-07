import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";

export function useHighlightDroppable(sectionId: string) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState(false);

  function onDragDone() {
    setHighlight(false);
  }

  function highlightArea({ active, over }) {
    if (
      isMovingFree &&
      over?.id === sectionId &&
      active.id !== sectionId // Can't drop a section into itself
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

  const className = `rounded-3xl relative py-3 px-3 -my-3 -mx-3 ${
    highlight ? "z-[100]" : ""
  }`;
  const style = {
    backgroundColor: highlight ? "hsla(95, 100%, 0%, 0.1)" : "",
    outline: `${
      highlight ? "hsla(95, 100%, 50%, 1)" : "rgba(0, 0, 0, 0)"
    } solid 5px`,
    boxShadow: highlight
      ? "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)"
      : "",
    transition: "box-shadow 0.2s, background-color 0.2s, outline 0.2s",
  };
  return { className, style };
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
