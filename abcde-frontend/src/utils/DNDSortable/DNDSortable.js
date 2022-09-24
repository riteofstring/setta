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
    <div style={{ backgroundColor: highlight ? "black" : "" }}>
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {props.children}
      </SortableContext>
    </div>
  );
}
