import { useDndMonitor } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { useKeyPress } from "react-flow-renderer";

export function DNDSortable({ sectionId, items, ...props }) {
  const isSorting = useKeyPress("Control");
  const isMovingOut = useKeyPress("Alt");
  const [disabled, setDisabled] = useState(false);
  const [highlight, setHighlight] = useState(false);

  function disableSort({ active }) {
    if (!active) {
      return;
    }
    if (
      //The currently dragged section is a child of this section
      (isMovingOut && active.data.current.sortable.containerId === sectionId) ||
      //The currently dragged section is this section (e.g. a deck)
      (isMovingOut && active.id === sectionId) ||
      //The currently dragged section is not a child of this section
      (isSorting && active.data.current.sortable.containerId !== sectionId)
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
      isMovingOut &&
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
