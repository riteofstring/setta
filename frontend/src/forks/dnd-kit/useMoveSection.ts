import { getDndSectionId, useDndState } from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useRef } from "react";
import { justMoveANode } from "state/actions/nodeInternals";
import {
  getSectionChildren,
  getSectionParentId,
  manualDndChildrenReset,
  setSectionChildren,
} from "state/actions/sectionInfos";
import { moveSection } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { DragEndEvent } from "./CustomCore";
import { arrayMove } from "./CustomSortable";
import { computeNewIndex } from "./CustomSortable/strategies/computeNewIndex";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropTypeEnum } from "./dropTypes";

function onSortEnd({ active, over }: Pick<DragEndEvent, "active" | "over">) {
  if (over && active.id !== over.id) {
    const parentId = active.data.current?.sortable?.containerId;
    if (!parentId) {
      return;
    }
    useProjectState.setState((state) => {
      setSectionChildren(state, parentId, (x) => {
        const activeIndex = x.indexOf(active.id);
        const overIndex = x.indexOf(over.id);
        return arrayMove(x, activeIndex, overIndex);
      });
    });
  }
}

async function onFreeMoveEnd({
  active,
  over,
  collisions,
  dummyRef,
}: Pick<DragEndEvent, "active" | "over" | "collisions"> & {
  dummyRef: React.RefObject<HTMLDivElement>;
}) {
  const dndChildrenState = useDndChildren.getState();
  const sectionId = active.id;
  const dndSectionId = getDndSectionId(sectionId);
  const overId = over?.id;
  const oldParentId = getSectionParentId(sectionId);
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  let activeIdx: number | null = null;
  let newIndex: number | null = null;
  let position: Position | null = null;
  const behaviorDropType = useDndState.getState().behaviorDropType;

  if (newParentId) {
    const children = dndChildrenState.x[newParentId];
    if (!children || !overId || !collisions?.[0]) {
      return;
    }
    activeIdx = children.indexOf(dndSectionId);
    const overIdx = children.indexOf(overId);
    const pastHalfway = collisions[0].pastHalfway;
    const maxIdx = children.length;
    newIndex = computeNewIndex(activeIdx, overIdx, pastHalfway, maxIdx);
  }
  // dropping nested section onto pane
  else if (!overId) {
    if (!dummyRef.current) {
      return;
    }
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });

    if (!oldParentId) {
      justMoveANode(sectionId, position);
      return;
    }
  }

  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    manualDndChildrenReset();
    return;
  }

  // If dropping the section into where it already was,
  // then just do manualDndChildrenReset
  if (
    oldParentId === newParentId &&
    (!oldParentId ||
      getSectionChildren(useProjectState.getState(), oldParentId).indexOf(
        sectionId,
      ) === newIndex)
  ) {
    manualDndChildrenReset();
    return;
  }

  // const maybeNewSectionData = await maybeMakeCopyOfSection({
  //   sectionId,
  //   oldParentId,
  //   newParentId,
  // });

  let newSectionId = sectionId;
  useProjectState.setState((state) => {
    // if (maybeNewSectionData.sections) {
    //   updateProjectState({ ...maybeNewSectionData, state });
    //   newSectionId = Object.keys(maybeNewSectionData.sections)[0];
    // } else {
    //   newSectionId = maybeNewSectionData;
    // }

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
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({ active, over, collisions }: DragEndEvent) {
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
