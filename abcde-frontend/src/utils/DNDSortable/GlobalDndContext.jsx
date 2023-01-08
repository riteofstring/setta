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

function onSortEnd({ active, over }) {
  useSectionInfos.getState().setAllChildren({
    sectionId: active.data.current.sortable?.containerId,
    newStateFn: updateWithArrayMove(active, over),
  });
}

function onFreeMoveEnd({ active, over, dummyRef, project }) {
  const sectionId = active.id;
  const oldParentId = useSectionInfos.getState().x[sectionId].parentId;
  let newParentId = null;
  let newIndex = null;
  let position = null;

  // dropping nested section onto pane
  if (oldParentId && !over) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = project({ x, y: y - NAVBAR_HEIGHT });
  } else if (over) {
    newParentId = useSectionInfos.getState().x[over.id].parentId;
    console.log("newParentId", newParentId);
    return;
  } else {
    return;
  }

  moveSection({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
    position,
  });
}

export function GlobalDndContext({ children }) {
  const [active, setActive] = useState(null);
  const dummyRef = useRef(null);
  const { isSorting, isMovingFree } = useDragActivation();
  const sensors = useDNDSensors();
  const { project } = useReactFlow();

  function onDragStart({ active }) {
    setActive(active);
  }

  // TODO: setActive(null) in here
  function onDragEnd({ active, over }) {
    if (isSorting) {
      onSortEnd({ active, over });
    } else if (isMovingFree) {
      onFreeMoveEnd({ active, over, dummyRef, project });
    }
    setActive(null);
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
        !active.data.current.isTopLevel &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            <DummySection zoom={active.data.current.zoom} ref={dummyRef} />
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
