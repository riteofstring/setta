import { useDndMonitor } from "@dnd-kit/core";
import { useState } from "react";
import { useDragActivation } from "./useDragActivation";

function highlightBoxStyle(highlight) {
  return {
    backgroundColor: highlight ? "hsla(95, 100%, 0%, 0.1)" : "",
    borderRadius: "3xl",
    outline: `${
      highlight ? "hsla(95, 100%, 50%, 1)" : "rgba(0, 0, 0, 0)"
    } solid 5px`,
    boxShadow: highlight
      ? "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)"
      : "",
    position: "relative",
    zIndex: "100",
    transition: "box-shadow 0.2s, background-color 0.2s, outline 0.2s",
    py: "0.75rem",
    px: "0.75rem",
    mx: "-0.75rem",
    my: "-0.75rem",
  };
}

function highlightLineStyle(highlight) {
  const color = highlight ? "hsla(95, 100%, 50%, 1)" : "rgba(0, 0, 0, 0)";
  return {
    width: "100%",
    height: "0",
    margin: "5px",
    display: "inline-block",
    border: `1px solid ${color}`,
  };
}

export function useHighlightDroppable({
  sectionId,
  sectionIsSameAsContext = false,
}) {
  const { isMovingFree } = useDragActivation();
  const [highlight, setHighlight] = useState(false);
  const [highlightContext, setHighlightContext] = useState(false);

  function onDragDone() {
    setHighlight(false);
    setHighlightContext(false);
  }

  function highlightArea({ active, over }) {
    if (isMovingFree && over?.id === sectionId && active.id !== sectionId) {
      setHighlight(true);
    } else {
      setHighlight(false);
    }
    if (
      isMovingFree &&
      over?.data.current?.sortable.containerId === sectionId
    ) {
      setHighlightContext(true);
    } else {
      setHighlightContext(false);
    }
  }

  useDndMonitor({
    onDragOver: highlightArea,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  if (sectionIsSameAsContext) {
    return { contextStyle: highlightBoxStyle(highlight || highlightContext) };
  }
  return {
    insertionLineStyle: highlightLineStyle(highlight),
    contextStyle: highlightBoxStyle(highlightContext),
  };
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
