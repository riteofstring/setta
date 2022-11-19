import {
  closestCorners,
  DndContext,
  DragOverlay,
  rectIntersection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions } from "easy-peasy";
import { useDragActivation } from "hooks/useDragActivation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "react-flow-renderer";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
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
  const dummyRef = useRef(null);
  const setIdsOverview = useStoreActions((x) => x.sectionInfos.setIdsOverview);
  const moveSectionThunk = useStoreActions(
    (x) => x.sectionInfos.moveSectionThunk
  );
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

    const activeContainer = active.data.current.sortable?.containerId;
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
      setIdsOverview({
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
      moveSectionThunk({
        oldParentId: activeContainer,
        newParentId: overContainer,
        sectionId: active.id,
        newIndex,
        position,
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
            <DummySection zoom={active.data.current.zoom} ref={dummyRef} />
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
