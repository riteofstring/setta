import { getDndSectionId, useDndState } from "forks/dnd-kit/dndState";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useRef } from "react";
import { justMoveANode } from "state/actions/nodeInternals";
import {
  getSectionChildren,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { moveSectionWithBackend } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import type { DragEndEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import { useDndChildren } from "./dndChildren";
import { BehaviorDropTypeEnum } from "./dropTypes";
import { getOverId } from "./useDropType";

function onSortEnd({
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const parentId = active.data?.current?.sortable?.containerId;
  if (!parentId) {
    return;
  }

  const overId = getOverId(over, collisions);
  if (!overId || active.id === overId) {
    return;
  }

  const children = getSectionChildren(useProjectState.getState(), parentId);
  const activeIndex = children.indexOf(active.id);
  const overIndex = children.indexOf(overId);

  if (activeIndex < 0 || overIndex < 0) {
    return;
  }

  let newIndex = overIndex;
  const pastHalfway = getPastHalfwayFromCollisions(overId, collisions);
  if (pastHalfway !== null) {
    newIndex = computeNewIndex(
      activeIndex,
      overIndex,
      pastHalfway,
      children.length,
    );
  }

  if (newIndex === activeIndex) {
    return;
  }

  moveSectionWithBackend({
    oldParentId: parentId,
    newParentId: parentId,
    sectionId: active.id,
    newIndex,
    position: null,
  });
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
  const resolvedOverId = getOverId(over, collisions);
  const overId = resolvedOverId ? String(resolvedOverId) : null;
  const oldParentId = useProjectState.getState().parentSectionMap[sectionId];
  let newParentId = dndChildrenState.y[dndSectionId] ?? null;
  let activeIdx: number | null = null;
  let newIndex: number | null = null;
  let position: Position | null = null;
  let pastHalfway: boolean | null = null;
  let indexSource: "placeholder" | "collision" | null = null;
  const behaviorDropType = useDndState.getState().behaviorDropType;
  const hasCollisions = Boolean(collisions && collisions.length > 0);

  if (!hasCollisions && !overId) {
    newParentId = null;
  }

  if (newParentId) {
    const children = dndChildrenState.x[newParentId];
    if (!children) {
      manualDndChildrenReset();
      return;
    }
    const overIdx = overId ? children.indexOf(overId) : -1;
    activeIdx = children.indexOf(dndSectionId);
    if (activeIdx >= 0) {
      newIndex = activeIdx;
      indexSource = "placeholder";
    } else {
      const overCollision =
        collisions?.find((collision) => String(collision.id) === overId) ?? null;
      pastHalfway = Boolean(overCollision?.pastHalfway);
      if (overIdx >= 0) {
        newIndex = pastHalfway ? overIdx + 1 : overIdx;
      } else {
        newIndex = 0;
      }
      indexSource = "collision";
    }

  }
  // dropping nested section onto pane
  else if (!overId) {
    if (!dummyRef.current) {
      manualDndChildrenReset();
      return;
    }
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = screenToFlowPosition({ x, y });

    if (!oldParentId) {
      justMoveANode(sectionId, position);
      manualDndChildrenReset();
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
  // if (maybeNewSectionData.sections) {
  //   updateProjectState({ ...maybeNewSectionData, state });
  //   newSectionId = Object.keys(maybeNewSectionData.sections)[0];
  // } else {
  //   newSectionId = maybeNewSectionData;
  // }
  moveSectionWithBackend({
    oldParentId,
    newParentId,
    sectionId: newSectionId,
    newIndex,
    position,
  });
  manualDndChildrenReset();
}

export function useOnDragEnd() {
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({ active, over, collisions, canceled }: DragEndEvent) {
    if (canceled) {
      manualDndChildrenReset();
      return;
    }

    if (useDndState.getState().isSorting) {
      onSortEnd({ active, over, collisions });
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
    const additionalResetState = (state) => {
      const dndState = state.getState();
      const shouldDeactivate = dndState.pendingDeactivation;
      return {
        isMovingFree: dndState.isMovingFree,
        isSorting: dndState.isSorting,
        pendingDeactivation: shouldDeactivate,
        disabled: dndState.disabled,
      };
    };
    useDndState.getState().reset(additionalResetState);
  }

  return { dummyRef, onDragEnd };
}

function getPastHalfwayFromCollisions(
  overId: string | number,
  collisions: DragEndEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  const matching = collisions.find((collision) => collision.id === overId);
  const resolved = matching ?? collisions[0];

  if (!resolved || resolved.pastHalfway === undefined) {
    return null;
  }

  return Boolean(resolved.pastHalfway);
}
