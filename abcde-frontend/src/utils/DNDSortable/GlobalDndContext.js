import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useKeyPress } from "react-flow-renderer";
import { updateWithArrayMove } from "utils/utils";
import { DummySection } from "./DummySection";

import { useDNDSensors } from "./useDNDSensors";

export function GlobalDndContext(props) {
  const [active, setActive] = useState(null);

  function onDragStart({ active }) {
    setActive(active);
  }

  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const moveChildThunk = useStoreActions((x) => x.sectionInfos.moveChildThunk);

  const isSorting = useKeyPress("Control");
  const isMovingOut = useKeyPress("Alt");

  const sensors = useDNDSensors();

  function onDragOver({ active, over }) {
    if (active && over) {
      const activeContainer = active.data.current.sortable.containerId;
      const overContainer = over.data.current.sortable.containerId;
      console.log(
        "activeContainer, overContainer",
        activeContainer,
        overContainer
      );
      if (activeContainer !== overContainer) {
        const overItems = over.data.current.sortable.items;
        const overIndex = overItems.indexOf(over.id);
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;

        const newIndex =
          overIndex >= 0 ? overIndex + modifier : overItems.length + 1;

        moveChildThunk({
          oldParentId: activeContainer,
          newParentId: overContainer,
          childId: active.id,
          newIndex,
        });
      }
    }
  }

  function onDragEnd({ active, over }) {
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
        moveChildThunk({
          oldParentId: activeContainer,
          newParentId: overContainer,
          childId: active.id,
          newIndex: 0,
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
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
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
