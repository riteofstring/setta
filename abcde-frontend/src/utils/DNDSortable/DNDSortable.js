import { Box } from "@chakra-ui/react";
import { useDndMonitor } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDragActivation } from "hooks/useDragActivation";
import { useState } from "react";

export function DNDSortable({ sectionId, items, ...props }) {
  const { isSorting, isMovingFree } = useDragActivation();
  const [disabled, setDisabled] = useState(false);
  const [highlight, setHighlight] = useState(false);

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
    onDragStart: disableSort,
    onDragOver: highlightArea,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return (
    <Box
      backgroundColor={highlight ? "hsla(95, 100%, 20%, 0.2)" : ""}
      borderRadius="3xl"
      borderWidth="5px"
      borderColor={highlight ? "hsla(95, 100%, 50%, 1)" : "rgba(0, 0, 0, 0)"}
      boxShadow={
        highlight
          ? "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 0px 0px 10px hsla(95, 100%, 75%, 0.5)"
          : ""
      }
      transition="box-shadow 0.2s, background-color 0.2s, border 0.2s"
      pt="0.5rem"
      px="0.5rem"
      mx="-0.5rem"
      my="-0.5rem"
      className="SORTABLE"
    >
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {props.children}
      </SortableContext>
    </Box>
  );
}
