import _ from "lodash";
import { useRef } from "react";
import { setAllChildren } from "state/actions/children";
import { moveSection } from "state/actions/sectionOps";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { justMoveANode } from "state/definitions/nodeInternals";
import { manualDndChildrenReset } from "state/definitions/sectionInfos";
import { getSectionParentId } from "state/getters/sectionInfo";
import { PANEID } from "utils/constants";
import { getDndSectionId, useDndState } from "utils/DNDSortable/dndState";
import { updateWithArrayMove } from "utils/utils";
import { screenToFlowPosition } from "xyflow/core/hooks/useViewportHelper";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropType } from "./dropTypes";

function onSortEnd({ active, over }) {
  if (active.id !== over.id) {
    setAllChildren(
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
