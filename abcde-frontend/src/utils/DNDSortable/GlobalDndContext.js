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
  function onDragEnd({ active, over }) {
    if (active && over) {
      const activeContainer = active.data.current.sortable.containerId;
      const overContainer = over.data.current.sortable.containerId;
      if (activeContainer === overContainer && active.id !== over.id) {
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
