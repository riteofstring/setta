import {
  closestCorners,
  DndContext,
  DragOverlay,
  rectIntersection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions } from "easy-peasy";
import { useDragActivation } from "hooks/useDragActivation";
import { useState } from "react";
import { createPortal } from "react-dom";
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
  const { isSorting, isMovingFree } = useDragActivation();
  const sensors = useDNDSensors();

  function onDragStart({ active }) {
    setActive(active);
  }

  function onDragEnd({ active, over }) {
    if (!active || !over) {
      return;
    }
    const activeContainer = active.data.current.sortable?.containerId;
    let overContainer = over.data.current?.sortable.containerId;
    const overIsSortable = !!overContainer;
    if (!overContainer) {
      overContainer = over.id;
    }
    if (
      isSorting &&
      activeContainer === overContainer &&
      active.id !== over.id
    ) {
      setIdsOverviewThunk({
        sectionId: activeContainer,
        newStateFn: updateWithArrayMove(active, over),
      });
    } else if (isMovingFree && activeContainer !== overContainer) {
      let newIndex;
      if (overIsSortable) {
        newIndex = getNewIndex(active, over);
      } else {
        // else its a droppable (e.g. an empty deck)
        newIndex = 0;
      }
      moveChildThunk({
        oldParentId: activeContainer,
        newParentId: overContainer,
        childId: active.id,
        newIndex,
      });
    }
  }

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree ? rectIntersection : closestCorners;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      modifiers={modifiers}
    >
      {props.children}
      {active?.id &&
        active.data.current.depth !== 0 &&
        createPortal(
          <DragOverlay>
            <DummySection zoom={active.data.current.zoom} />
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
