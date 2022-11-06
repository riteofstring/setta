import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions } from "easy-peasy";
import { useDragActivation } from "hooks/useDragActivation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "react-flow-renderer";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { customCollisionDetection } from "./collisionDetection";
import { ITSELF_SUFFIX } from "./constants";
import { DummySection } from "./DummySection";

import { useDNDSensors } from "./useDNDSensors";

function getNewIndex(over, overId) {
  const overItems = over.data.current.sortable.items;
  return overItems.indexOf(overId) + 1;
}

function getActiveAndOverContainers(active, over, overId) {
  const activeContainer = active.data.current.sortable?.containerId;
  let overContainer = over?.data.current?.sortable.containerId;
  const overIsSortable = !!overContainer;
  if (!overContainer) {
    overContainer = overId;
  }
  return { activeContainer, overContainer, overIsSortable };
}

function getOverId(over) {
  if (over) {
    if (over.id.includes(ITSELF_SUFFIX)) {
      return { id: over.id.replace(ITSELF_SUFFIX, "") };
    }
    return { id: over.id };
  }
  return { id: PANEID };
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

    const activeId = active.id;
    const { id: overId } = getOverId(over);

    const { activeContainer, overContainer, overIsSortable } =
      getActiveAndOverContainers(active, over, overId);

    // can't drop section into itself
    if (activeId === overContainer) {
      return;
    }

    if (isSorting && activeContainer === overContainer && activeId !== overId) {
      setIdsOverview({
        sectionId: activeContainer,
        newStateFn: updateWithArrayMove(activeId, overId),
      });
    } else if (isMovingFree && activeContainer !== overContainer) {
      let newIndex;
      let position = null;
      if (overIsSortable) {
        newIndex = getNewIndex(over, overId);
      } else {
        newIndex = 0;
        if (overContainer === PANEID && dummyRef?.current) {
          const { x, y } = dummyRef.current.getBoundingClientRect();
          position = project({ x, y: y - NAVBAR_HEIGHT });
        }
      }
      moveSectionThunk({
        oldParentId: activeContainer,
        newParentId: overContainer,
        sectionId: activeId,
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
