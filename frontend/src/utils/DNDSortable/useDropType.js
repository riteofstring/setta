import {
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
} from "thunks/sections/getters";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { useDndState } from "utils/DNDSortable/dndState";
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
  return (props) => {
    onDragOver({
      ...props,
      isSorting,
    });
  };
}

function onDragOver({ active, over, isSorting }) {
  console.log("over", over)
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
  if (active.id === over.id) {
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  const oldParentId = active?.data.current.sortable?.containerId;
  let newParentIsInsideSortable = true;
  let newParentId = over?.data.current.sortable?.containerId;
  if (!newParentId) {
    newParentId = over.id;
    newParentIsInsideSortable = false;
  }
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    console.log("invalid")
    maybeRemoveFromOldTempParent(active);
    useDndState.setState({ behaviorDropType });
    return;
  }
  console.log("oldParentId, newParentId", oldParentId, newParentId)
  if (newParentId && newParentId !== active.id) {
    useDndState.setState({ movingFreeInSortable: true });
    const newParentChildren = useDndChildren.getState().x[newParentId];
    if (newParentId !== oldParentId) {
      const index = newParentIsInsideSortable
        ? newParentChildren.indexOf(over.id)
        : 0;
      useDndChildren.getState().setChildren({
        sectionId: newParentId,
        children: [
          ...newParentChildren.slice(0, index),
          active.id,
          ...newParentChildren.slice(index),
        ],
      });
      maybeRemoveFromOldTempParent(active);
    }
  }
}

function maybeRemoveFromOldTempParent(active) {
  const oldParentId = active?.data.current.sortable?.containerId;
  if (oldParentId) {
    useDndChildren.getState().setChildren({
      sectionId: oldParentId,
      children: useDndChildren
        .getState()
        .x[oldParentId].filter((x) => x !== active.id),
    });
  }
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
