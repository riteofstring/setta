import {
  closestCorners,
  DndContext,
  DragOverlay,
  useDndMonitor,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useKeyPress } from "react-flow-renderer";
import { updateWithArrayMove } from "utils/utils";
import { DummySection } from "./DummySection";

import { useDNDSensors } from "./useDNDSensors";

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

export function GlobalDndContext(props) {
  const [active, setActive] = useState(null);

  function onDragStart({ active }) {
    setActive(active);
  }

  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const isSorting = useKeyPress("Control");
  const isMovingOut = useKeyPress("Alt");

  const sensors = useDNDSensors();
  function handleDragEnd({ active, over }) {
    if (active && over) {
      const activeContainer = active.data.current.sortable.containerId;
      const overContainer = over.data.current.sortable.containerId;
      if (
        isSorting &&
        activeContainer === overContainer &&
        active.id !== over.id
      ) {
        setIdsOverviewThunk({
          sectionId: activeContainer,
          newStateFn: updateWithArrayMove(active, over),
        });
      } else if (isMovingOut && activeContainer !== overContainer) {
        setIdsOverviewThunk({
          sectionId: activeContainer,
          newStateFn: (x) => x.filter((y) => y !== active.id),
        });
        setIdsOverviewThunk({
          sectionId: overContainer,
          newStateFn: (x) => [...x, active.id],
        });
      }
    }
  }

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
      modifiers={modifiers}
    >
      {props.children}
      {createPortal(
        <DragOverlay>
          {active?.id ? <DummySection zoom={active.data.current.zoom} /> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
