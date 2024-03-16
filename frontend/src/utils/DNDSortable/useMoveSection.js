import _ from "lodash";
import { useRef } from "react";
import { setAllChildren } from "thunks/sections/children";
import { getSectionParentId } from "thunks/sections/getters";
import { moveSection } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID } from "utils/constants";
import { useDndState } from "utils/DNDSortable/dndState";
import { useDndMode } from "utils/DNDSortable/useDndUtils";
import { updateWithArrayMove } from "utils/utils";
import { screenToFlowPosition } from "xyflow/core/hooks/useViewportHelper";
import { useDndChildren } from "./dndChildren";
import { getDropType } from "./useDropType";

function onSortEnd({ active, over }) {
  if (active.id !== over.id) {
    setAllChildren(
      active.data.current.sortable?.containerId,
      updateWithArrayMove(active, over),
    );

    maybeIncrementProjectStateVersion(true);
  }
}

function onFreeMoveEnd({ active, dummyRef }) {
  const dndState = useDndState.getState();
  const { activeId: sectionId, overId } = dndState;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId = null;
  let newIndex = null;
  let position = null;
  let behaviorDropType = null;

  if (dndState.movingFreeInSortable) {
    newParentId = active.data.current.sortable.containerId
    newIndex = useDndChildren.getState().x[newParentId].indexOf(overId);
  }
  // dropping nested section onto pane
  else if (oldParentId !== PANEID && !overId) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });
  } else if (overId) {
    const dropType = getDropType({
      leftDistCondition: dndState.leftDistCondition,
      shouldDrop: dndState.shouldDrop,
      movingFreeInSortable: dndState.movingFreeInSortable,
    });
    behaviorDropType = dropType.behaviorDropType;
    [newParentId, newIndex] = dropType.positionDropType.slice(1);
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
  const { isSorting, isMovingFree } = useDndMode();
  const dummyRef = useRef(null);

  function onDragEnd({ active, over, collisions }) {
    if (isSorting) {
      onSortEnd({ active, over });
    } else if (isMovingFree) {
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
