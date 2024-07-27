import { getDndSectionId, useDndState } from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useRef } from "react";
import { justMoveANode } from "state/actions/nodeInternals";
import { moveSection } from "state/actions/sections/moveSections";
import { manualDndChildrenReset } from "state/actions/sections/sectionInfos";
import { setSectionChildrenAndNames } from "state/actions/sections/setters";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { getSectionParentId } from "state/getters/sectionInfo";
import { PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropType } from "./dropTypes";

function onSortEnd({ active, over }) {
  if (active.id !== over.id) {
    setSectionChildrenAndNames(
      active.data.current.sortable?.containerId,
      updateWithArrayMove(active, over),
    );

    maybeIncrementProjectStateVersion(true);
  }
}

function onFreeMoveEnd({ dummyRef }) {
  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const { activeId: sectionId, overId } = dndState;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId = dndChildrenState.y[getDndSectionId(sectionId)] ?? null;
  let newIndex = null;
  let position = null;
  const behaviorDropType = dndState.behaviorDropType;

  if (newParentId) {
    newIndex = dndChildrenState.x[newParentId].indexOf(overId);
  }
  // dropping nested section onto pane
  else if (!overId) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });

    if (oldParentId === PANEID) {
      justMoveANode(sectionId, position);
      return;
    }
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

  if (behaviorDropType === BehaviorDropType.INVALID) {
    manualDndChildrenReset();
  }
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
    } else {
      manualDndChildrenReset();
    }
    useDndState.getState().reset();
  }

  return { dummyRef, onDragEnd };
}
