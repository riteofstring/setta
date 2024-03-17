import {
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
} from "thunks/sections/getters";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { getDndSectionId, useDndState } from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { useReactFlow } from "xyflow/core/store";
import { getSectionRectWithNested } from "xyflow/core/utils/graph";

export function onDragStart({ active }) {
  const { width, height } = getSectionRectWithNested(active.id);
  useDndState.getState().setActive({
    id: active.id,
    isTopLevel: active.data.current.isTopLevel,
    width,
    height,
  });
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({ over, collisions }) {
  const overId = over ? over.id : null;
  const leftDistCondition = getLeftDistCondition(collisions);
  const dndState = useDndState.getState();

  if (
    overId !== dndState.overId ||
    leftDistCondition !== dndState.leftDistCondition
  ) {
    dndState.setOver({
      overId,
      leftDistCondition,
    });
  }
}

export function useOnDragOver() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragOver;
  }
  return () => {};
}

function onDragOver({ active, over, collisions, ...props }) {
  const overId = over ? over.id : null;

  if (
    !overId ||
    (overId &&
      (!useDndState.getState().times[overId] ||
        Date.now() - useDndState.getState().times[overId] > 100))
  ) {
    useDndState.getState().setTime(overId);
  } else {
    useDndState.setState({
      behaviorDropType: null,
      overId,
    });
    return;
  }

  if (!over) {
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({
      behaviorDropType: null,
      overId,
    });
    return;
  }

  if (active.id === over.id) {
    useDndState.setState({ behaviorDropType: null });
    maybeRemoveFromOldTempParent(active);
    return;
  }
  if (getDndSectionId(active.id) === over.id) {
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  let newParentIsInsideSortable = true;
  let newParentId = getParentId(over.id);
  if (!newParentId) {
    newParentId = over.id;
    newParentIsInsideSortable = false;
  }
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({
      behaviorDropType,
      overId,
    });
    return;
  } else {
    useDndState.setState({ behaviorDropType: null, overId });
  }
  if (
    newParentId &&
    newParentId !== active.id &&
    newParentId !== getDndSectionId(active.id)
  ) {
    const newParentChildren = useDndChildren.getState().x[newParentId];
    const oldParentId = getParentId(getDndSectionId(active.id));
    const trueOldParentId = getParentId(active.id);
    if (newParentId !== oldParentId) {
      if (newParentId !== trueOldParentId) {
        const index = newParentIsInsideSortable
          ? newParentChildren.indexOf(over.id)
          : 0;

        const dndSectionId = getDndSectionId(active.id);

        useDndChildren
          .getState()
          .addChild({ oldParentId, newParentId, childId: dndSectionId, index });
      } else {
        maybeRemoveFromOldTempParent(active);
      }
    }
  }
}

function maybeRemoveFromOldTempParent(active) {
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getParentId(dndSectionId);
  if (oldParentId) {
    useDndChildren.getState().setChildren({
      sectionId: oldParentId,
      children: useDndChildren
        .getState()
        .x[oldParentId].filter((x) => x !== dndSectionId),
    });
    useDndChildren
      .getState()
      .setParentId({ sectionId: dndSectionId, parentId: undefined });
  }
}

function getParentId(dndSectionId) {
  return useDndChildren.getState().y[dndSectionId];
}

function getLeftDistCondition(collisions) {
  // true if section has not children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    !collisions[0]?.data.droppableContainer.data.current.hasNested &&
    collisions[0]?.data.leftDist > 200 * useReactFlow.getState().transform[2]
  );
}

function getBehaviorDropType(activeId, newParentId) {
  if (!newParentId) {
    return null;
  }
  // invalid if parent can't have children
  // or if child can only be in deck and parent is not a deck
  if (
    !getSectionIsRoot(newParentId) ||
    (getSectionCanOnlyBeChildOfDeck(activeId) && !getSectionIsDeck(newParentId))
  ) {
    return BehaviorDropType.INVALID;
  }

  return null;
}
