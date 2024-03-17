import _ from "lodash";
import { useRef } from "react";
import { setAllChildren } from "thunks/sections/children";
import { getSectionParentId } from "thunks/sections/getters";
import { moveSection } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID } from "utils/constants";
import { getDndSectionId, useDndState } from "utils/DNDSortable/dndState";
import { updateWithArrayMove } from "utils/utils";
import { screenToFlowPosition } from "xyflow/core/hooks/useViewportHelper";
import { useDndChildren } from "./dndChildren";

function onSortEnd({ active, over }) {
  if (active.id !== over.id) {
    setAllChildren(
      active.data.current.sortable?.containerId,
      updateWithArrayMove(active, over),
    );

    maybeIncrementProjectStateVersion(true);
  }
}

function onFreeMoveEnd({ active, over, dummyRef }) {
  const dndState = useDndState.getState();
  const { activeId: sectionId, overId } = dndState;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId =
    useDndChildren.getState().y[getDndSectionId(active.id)] ||
    (active.data.current.sortable?.containerId ===
    over?.data.current.sortable?.containerId
      ? active.data.current.sortable?.containerId
      : null);
  let newIndex = null;
  let position = null;
  let behaviorDropType = null;

  if (newParentId) {
    newIndex = useDndChildren.getState().x[newParentId].indexOf(overId);
  }
  // dropping nested section onto pane
  else if (oldParentId !== PANEID && !overId) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });
  }

  moveSection({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
    position,
    behaviorDropType,
    incrementVersion: true,
  });
}

export function useOnDragEnd() {
  const dummyRef = useRef(null);

  function onDragEnd({ active, over, collisions }) {
    if (useDndState.getState().isSorting) {
      onSortEnd({ active, over });
    } else if (useDndState.getState().isMovingFree) {
      onFreeMoveEnd({
        active,
        over,
        collisions,
        dummyRef,
      });
    }
    useDndState.getState().reset();
  }

  return { dummyRef, onDragEnd };
}
