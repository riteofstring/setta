import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useKeyPress } from "react-flow-renderer";
import { updateWithArrayMove } from "utils/utils";
import { DummySection } from "./DummySection";

import { useDNDSensors } from "./useDNDSensors";

export function GlobalDndContext(props) {
  const [active, setActive] = useState(null);
  const activeId = active?.id;
  const lastOverId = useRef(null);
  const recentlyMovedToNewContainer = useRef(false);

  function onDragStart({ active }) {
    setActive(active);
  }

  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const moveChildThunk = useStoreActions((x) => x.sectionInfos.moveChildThunk);
  const allCurrChildren = useStoreState((x) => x.sectionInfos.currChildren);

  const isSorting = useKeyPress("Control");
  const isMovingOut = useKeyPress("Alt");

  const sensors = useDNDSensors();

  const collisionDetectionStrategy = useCallback(
    (args) => {
      // Start by finding any intersecting droppable
      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0
          ? // If there are droppables intersecting with the pointer, return those
            pointerIntersections
          : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        if (overId in allCurrChildren) {
          const containerItems = allCurrChildren[overId];

          // If a container is matched and it contains items (columns 'A', 'B', 'C')
          if (containerItems.length > 0) {
            // Return the closest droppable within that container
            overId = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  container.id !== overId &&
                  containerItems.includes(container.id)
              ),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;

        return [{ id: overId }];
      }

      // When a draggable item moves to a new container, the layout may shift
      // and the `overId` may become `null`. We manually set the cached `lastOverId`
      // to the id of the draggable item that was moved to the new container, otherwise
      // the previous `overId` will be returned which can cause items to incorrectly shift positions
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      // If no droppable is matched, return the last match
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [active?.id, allCurrChildren]
  );

  function onDragOver({ active, over }) {
    if (active && over) {
      // const overId = over?.id;

      // if (overId == null || active.id in allCurrChildren) {
      //   return;
      // }

      console.log("active", active);
      console.log("over", over);
      const activeContainer = active.data.current.sortable.containerId;
      const overContainer = over.data.current.sortable.containerId;
      if (!overContainer || !activeContainer) {
        return;
      }

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
      collisionDetection={collisionDetectionStrategy}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      modifiers={modifiers}
    >
      {props.children}
      {createPortal(
        <DragOverlay>
          {activeId ? <DummySection zoom={active.data.current.zoom} /> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
