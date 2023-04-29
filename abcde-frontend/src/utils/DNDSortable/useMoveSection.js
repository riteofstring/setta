import { useDndMode } from "hooks/useDndUtils";
import _ from "lodash";
import { useDndState } from "models/info/dndState";
import { useRef } from "react";
import { useReactFlow } from "react-flow-renderer";
import { moveSection } from "thunks/sections/sectionOps";
import { getSectionParentId, setAllChildren } from "thunks/sections/sections";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { getDropType } from "./useDropType";

function onSortEnd({ active, over }) {
  setAllChildren(
    active.data.current.sortable?.containerId,
    updateWithArrayMove(active, over)
  );
}

function onFreeMoveEnd({ dummyRef, project }) {
  const dndState = useDndState.getState();
  const { activeId: sectionId, overId } = dndState;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId = null;
  let newIndex = null;
  let position = null;
  let behaviorDropType = null;

  // dropping nested section onto pane
  if (oldParentId !== PANEID && !overId) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = project({ x, y: y - NAVBAR_HEIGHT * 4 });
  } else if (overId) {
    const dropType = getDropType({
      centerYCondition: dndState.centerYCondition,
      leftDistCondition: dndState.leftDistCondition,
      shouldDrop: dndState.shouldDrop,
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
  });
}

export function useOnDragEnd() {
  const { isSorting, isMovingFree } = useDndMode();
  const { project } = useReactFlow();
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
        project,
      });
    }
  }

  return { dummyRef, onDragEnd };
}
