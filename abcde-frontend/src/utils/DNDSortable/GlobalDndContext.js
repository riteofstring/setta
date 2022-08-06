import {
  closestCorners,
  DndContext,
  DragOverlay,
  rectIntersection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useKeyPress } from "react-flow-renderer";
import { updateWithArrayMove } from "utils/utils";
import { DummySection } from "./DummySection";

import { useDNDSensors } from "./useDNDSensors";

function getNewIndex(active, over) {
  const isBelowOverItem =
    over &&
    active.rect.current.translated &&
    active.rect.current.translated.top > over.rect.top + over.rect.height / 2;

  const modifier = isBelowOverItem ? 1 : 0;
  const overItems = over.data.current.sortable.items;
  const overIndex = overItems.indexOf(over.id);
  return overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
}

export function GlobalDndContext(props) {
  const [active, setActive] = useState(null);

  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const moveChildThunk = useStoreActions((x) => x.sectionInfos.moveChildThunk);
  const isSorting = useKeyPress("Control");
  const isMovingOut = useKeyPress("Alt");
  const sensors = useDNDSensors();

  function onDragStart({ active }) {
    setActive(active);
  }

  function onDragEnd({ active, over }) {
    if (!active || !over) {
      return;
    }

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
      const newIndex = getNewIndex(active, over);
      moveChildThunk({
        oldParentId: activeContainer,
        newParentId: overContainer,
        childId: active.id,
        newIndex,
      });
    }
  }

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingOut ? rectIntersection : closestCorners;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
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
