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

function onDragMove({ active, collisions, isMovingFree }) {
  if (isMovingFree) {
    if (getLeftDistCondition(active, collisions)) {
      // console.log("collisions[0]", collisions[0]);
      if (collisions[0].id !== useDndState.getState().leftDistConditionId) {
        // console.log("leftDistCondition!")
        useDndState.setState({ leftDistConditionId: collisions[0].id });
        maybeAddToNewTempParent(active, collisions[0], collisions[0].id, false);
      }
    } else {
      useDndState.setState({ leftDistConditionId: null });
    }
  }
}

export function useOnDragOver() {
  const { isSorting } = useDndMode();
  return (props) => {
    onDragOver({
      ...props,
      isSorting,
    });
  };
}

function onDragOver({ active, over, isSorting, ...props }) {
  if (isSorting) {
    useDndState.setState({
      behaviorDropType: null,
      movingFreeInSortable: false,
    });
    return;
  }
  if (!over) {
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({
      behaviorDropType: null,
      movingFreeInSortable: false,
    });
    return;
  }
  if (active.id === over.id || active.id === getActualSectionId(over.id)) {
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  let newParentIsInsideSortable = true;
  let newParentId = getParentId(over.id);
  if (!newParentId) {
    newParentId = over.id;
    newParentIsInsideSortable = false;
  }
  maybeAddToNewTempParent(active, over, newParentId, newParentIsInsideSortable);
}

function maybeAddToNewTempParent(
  active,
  over,
  newParentId,
  newParentIsInsideSortable,
) {
  // console.log("newParentId", newParentId);
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({ behaviorDropType, movingFreeInSortable: false });
    return;
  }
  if (
    newParentId &&
    newParentId !== active.id &&
    newParentId !== getDndSectionId(active.id)
  ) {
    // console.log("in first if statement")
    useDndState.setState({ movingFreeInSortable: true });
    const newParentChildren = useDndChildren.getState().x[newParentId];
    const oldParentId = getParentId(getDndSectionId(active.id));
    const trueOldParentId = getParentId(active.id);
    if (newParentId !== oldParentId && newParentId !== trueOldParentId) {
      // console.log("adding child")
      const index = newParentIsInsideSortable
        ? newParentChildren.indexOf(over.id)
        : 0;

      const dndSectionId = getDndSectionId(active.id);

      useDndChildren
        .getState()
        .addChild({ oldParentId, newParentId, childId: dndSectionId, index });
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

function getLeftDistCondition(active, collisions) {
  // true if section has not children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    collisions[0]?.id !== getDndSectionId(active.id) &&
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
