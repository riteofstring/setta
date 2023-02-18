import _ from "lodash";
import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useRef } from "react";
import { useReactFlow } from "react-flow-renderer";
import { moveSection } from "thunks/sections/sectionOps";
import { getSectionParentId } from "thunks/sections/sections";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { getDropType } from "./useDropType";

function onSortEnd({ active, over }) {
  useSectionInfos.getState().setAllChildren({
    sectionId: active.data.current.sortable?.containerId,
    newStateFn: updateWithArrayMove(active, over),
  });
}

function onFreeMoveEnd({ dummyRef, project }) {
  const dndState = useDndState.getState();
  const { activeId: sectionId, overId } = dndState;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId = null;
  let newIndex = null;
  let position = null;

  // dropping nested section onto pane
  if (oldParentId !== PANEID && !overId) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = project({ x, y: y - NAVBAR_HEIGHT });
  } else if (overId) {
    const { positionDropType, behaviorDropType } = getDropType({
      centerYCondition: dndState.centerYCondition,
      leftDistCondition: dndState.leftDistCondition,
      shouldDrop: dndState.shouldDrop,
    });
    [newParentId, newIndex] = positionDropType.slice(1);
  }

  if (!newParentId) {
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

export function useOnDragEnd() {
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
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
