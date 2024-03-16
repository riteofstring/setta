import { addNodes, deleteNodes } from "models/info/nodeInternals";
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
  console.log("onDragStart", active);
  useDndState
    .getState()
    .setActive({ id: active.id, isTopLevel: active.data.current.isTopLevel });
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
  if (isSorting) {
    useDndState.setState({ behaviorDropType: null });
    return;
  }
  if (!over) {
    const oldParentId = active.data.current.sortable?.containerId;
    if (oldParentId) {
      useDndChildren.getState().setChildren({
        sectionId: oldParentId,
        children: useDndChildren
          .getState()
          .x[oldParentId].filter((x) => x !== active.id),
      });
    }
    useDndState.setState({ behaviorDropType: null });
    console.log("active", active);
    if (useDndState.getState().activeIsTopLevel) {
      addNodes([
        { id: active.id, position: { x: 0, y: 0 }, zIndex: 0, tempZIndex: 0 },
      ]);
    }
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
    useDndState.setState({ behaviorDropType });
    return;
  }
  if (newParentId && newParentId !== active.id) {
    const newParentChildren = useDndChildren.getState().x[newParentId];
    if (newParentId !== oldParentId) {
      deleteNodes([active.id]);
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
      if (oldParentId) {
        useDndChildren.getState().setChildren({
          sectionId: oldParentId,
          children: useDndChildren
            .getState()
            .x[oldParentId].filter((x) => x !== active.id),
        });
      }
    } else {
      // const oldIndex = newParentChildren.indexOf(active.id);
      // const newIndex = newParentChildren.indexOf(over.id);
      // useDndChildren.getState().setChildren({
      //   sectionId: oldParentId,
      //   children: moveElement(newParentChildren, oldIndex, newIndex),
      // });
    }
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
