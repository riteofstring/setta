import { getDndSectionId, useDndState } from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useRef } from "react";
import { justMoveANode } from "state/actions/nodeInternals";
import {
  maybeMakeCopyOfSection,
  moveSection,
} from "state/actions/sections/moveSections";
import { manualDndChildrenReset } from "state/actions/sections/sectionInfos";
import { setSectionVariantChildren } from "state/actions/sectionVariants";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { getSectionParentId } from "state/getters/sectionInfo";
import { PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { computeNewIndex } from "./CustomSortable/strategies/computeNewIndex";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropType } from "./dropTypes";

function onSortEnd({ active, over }) {
  if (over && active.id !== over.id) {
    useSectionInfos.setState((state) => {
      setSectionVariantChildren(
        active.data.current.sortable?.containerId,
        updateWithArrayMove(active, over),
        state,
      );
    });

    maybeIncrementProjectStateVersion(true);
  }
}

async function onFreeMoveEnd({ active, over, collisions, dummyRef }) {
  const dndChildrenState = useDndChildren.getState();
  const sectionId = active.id;
  const dndSectionId = getDndSectionId(sectionId);
  const overId = over?.id;
  const oldParentId = _.defaultTo(getSectionParentId(sectionId), PANEID);
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  let newIndex = null;
  let position = null;
  const behaviorDropType = useDndState.getState().behaviorDropType;

  if (newParentId) {
    const children = dndChildrenState.x[newParentId];
    const activeIdx = children.indexOf(dndSectionId);
    const overIdx = children.indexOf(overId);
    const pastHalfway = collisions[0].pastHalfway;
    const maxIdx = children.length;
    newIndex = computeNewIndex(activeIdx, overIdx, pastHalfway, maxIdx);
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

  if (behaviorDropType === BehaviorDropType.INVALID) {
    manualDndChildrenReset();
    return;
  }

  if (!newParentId) {
    return;
  }

  const newSectionId = await maybeMakeCopyOfSection({
    sectionId,
    oldParentId,
    newParentId,
  });

  useSectionInfos.setState((state) => {
    moveSection({
      oldParentId,
      newParentId,
      oldSectionId: sectionId,
      newSectionId,
      newIndex,
      position,
      state,
    });
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
    } else {
      manualDndChildrenReset();
    }
    // don't reset isMovingFree or isSorting
    const additionalResetState = (state) => ({
      isMovingFree: state.getState().isMovingFree,
      isSorting: state.getState().isSorting,
      disabled: state.getState().disabled,
    });
    useDndState.getState().reset(additionalResetState);
  }

  return { dummyRef, onDragEnd };
}
