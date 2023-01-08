import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useDragActivation } from "hooks/useDragActivation";
import { useSectionInfos } from "models/info/sectionInfos";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "react-flow-renderer";
import { moveSection } from "thunks/sections/sectionOps";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { customCollisionDetection } from "./collisionDetection";
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

export function GlobalDndContext({ children }) {
  const [active, setActive] = useState(null);
  const dummyRef = useRef(null);
  const setAllChildren = useSectionInfos((x) => x.setAllChildren);
  const { isSorting, isMovingFree } = useDragActivation();
  const sensors = useDNDSensors();
  const { project } = useReactFlow();

  function onDragStart({ active }) {
    setActive(active);
  }

  function onDragEnd({ active, over }) {
    if (!active) {
      return;
    }

    let activeContainer = active.data.current.sortable?.containerId;
    if (!activeContainer) {
      activeContainer = PANEID;
    }

    let overContainer = over?.data.current?.sortable.containerId;
    const overIsSortable = !!overContainer;
    if (!overContainer) {
      overContainer = over ? over.id : PANEID;
    }

    // can't drop section into itself
    if (active.id === overContainer) {
      return;
    }

    if (
      isSorting &&
      activeContainer === overContainer &&
      active.id !== over.id
    ) {
      setAllChildren({
        sectionId: activeContainer,
        newStateFn: updateWithArrayMove(active, over),
      });
    } else if (isMovingFree && activeContainer !== overContainer) {
      let newIndex;
      let position = null;
      if (overIsSortable) {
        newIndex = getNewIndex(active, over);
      } else {
        // else its a droppable (e.g. an empty deck)
        newIndex = 0;
        if (dummyRef?.current) {
          const { x, y } = dummyRef.current.getBoundingClientRect();
          position = project({ x, y: y - NAVBAR_HEIGHT });
        }
      }
      moveSection({
        oldParentId: activeContainer,
        newParentId: overContainer,
        sectionId: active.id,
        newIndex,
        position,
      });
    }
  }

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : closestCorners;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      modifiers={modifiers}
    >
      {children}
      {active?.id &&
        active.data.current.depth !== 0 &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            <DummySection zoom={active.data.current.zoom} ref={dummyRef} />
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
