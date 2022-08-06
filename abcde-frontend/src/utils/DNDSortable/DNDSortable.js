import { useDndMonitor } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { useKeyPress } from "react-flow-renderer";

export function DNDSortable({ sectionId, items, setItems, ...props }) {
  const isSorting = useKeyPress("Control");
  const [disabled, setDisabled] = useState(false);

  function disableIfSortIsExternal({ active }) {
    if (
      isSorting &&
      active &&
      active.data.current.sortable.containerId !== sectionId
    ) {
      setDisabled(true);
    }
  }

  function enable() {
    setDisabled(false);
  }

  useDndMonitor({
    onDragStart: disableIfSortIsExternal,
    onDragEnd: enable,
    onDragCancel: enable,
  });

  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={verticalListSortingStrategy}
      disabled={disabled}
    >
      {props.children}
    </SortableContext>
  );
}
