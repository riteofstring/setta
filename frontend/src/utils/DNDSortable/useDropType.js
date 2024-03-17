import {
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
} from "thunks/sections/getters";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import {
  getActualSectionId,
  getDndSectionId,
  useDndState,
} from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { useDndMode } from "utils/DNDSortable/useDndUtils";
import { useReactFlow } from "xyflow/core/store";
import { getSectionRectWithNested } from "xyflow/core/utils/graph";

export function useOnDragMove() {
  const { isMovingFree } = useDndMode();
  return (props) => {
    onDragMove({
      ...props,
      isMovingFree,
    });
  };
}

export function onDragStart({ active }) {
  const { width, height } = getSectionRectWithNested(active.id);
  useDndState.getState().setActive({
    id: active.id,
    isTopLevel: active.data.current.isTopLevel,
    width,
    height,
  });
}

function onDragMove({ active, over, collisions, isMovingFree }) {
  if (isMovingFree) {
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
}

export function useOnDragOver() {
  const { isSorting } = useDndMode();
  if (isSorting) {
    return () => {};
  }
  return onDragOver;
}

function onDragOver({ active, over, collisions }) {
  console.log("collisions.length", collisions.length);
  if (!over) {
    console.log("!over");
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  if (active.id === over.id) {
    console.log("active.id === over.id");
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  console.log("over", over)
  let newParentHasChildren = true;
  let newParentId = getParentId(over.id);
  if (!newParentId) {
    newParentId = over.id;
    newParentHasChildren = false;
  }
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    console.log("behaviorDropType === BehaviorDropType.INVALID");
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({ behaviorDropType });
    return;
  }
  if (
    newParentId &&
    newParentId !== active.id &&
    newParentId !== getDndSectionId(active.id)
  ) {
    const newParentChildren = useDndChildren.getState().x[newParentId];
    const oldParentId = getParentId(getDndSectionId(active.id));
    const trueOldParentId = getParentId(active.id);
    if (newParentId !== oldParentId && newParentId !== trueOldParentId) {
      console.log("setting!", oldParentId, newParentId);

      const index = newParentHasChildren
        ? newParentChildren.indexOf(over.id)
        : 0;

      const dndSectionId = getDndSectionId(active.id);

      useDndChildren
        .getState()
        .addChild({ oldParentId, newParentId, childId: dndSectionId, index });
    }
  }
  useDndState.setState({ behaviorDropType: null });
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
