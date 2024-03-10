import { useSectionInfos } from "models/info/sectionInfos";
import {
  getSectionCanHaveNested,
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
  getSectionParentId,
} from "thunks/sections/getters";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { useDndState } from "utils/DNDSortable/dndState";
import {
  BehaviorDropType,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";
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
  useDndState
    .getState()
    .setActive({ id: active.id, isTopLevel: active.data.current.isTopLevel });
}

function onDragMove({ active, over, collisions, isMovingFree }) {
  if (isMovingFree) {
    const shouldDrop = getShouldDrop(active, over, collisions);
    const overId = over ? over.id : null;
    const centerYCondition = collisions[0]?.data.centerYDist < 0;
    const leftDistCondition = getLeftDistCondition(collisions);
    const dndState = useDndState.getState();

    if (
      overId !== dndState.overId ||
      shouldDrop !== dndState.shouldDrop ||
      centerYCondition !== dndState.centerYCondition ||
      leftDistCondition !== dndState.leftDistCondition
    ) {
      dndState.setOver({
        overId,
        shouldDrop,
        centerYCondition,
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
    return;
  }
  if (!over) {
    const oldParentId = active?.data.current.sortable?.containerId;
    if (oldParentId) {
      useDndChildren.getState().setChildren({
        sectionId: oldParentId,
        children: useDndChildren
          .getState()
          .x[oldParentId].filter((x) => x !== active.id),
      });
    }
    return;
  }
  if (active.id === over.id) {
    return;
  }
  const oldParentId = active?.data.current.sortable?.containerId;
  const newParentId = over?.data.current.sortable?.containerId; // ?? over?.id
  if (newParentId) {
    const newParentChildren = useDndChildren.getState().x[newParentId];
    if (newParentId !== oldParentId) {
      const index = newParentChildren.indexOf(over.id);
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

function moveElement(array, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    fromIndex >= array.length ||
    toIndex < 0 ||
    toIndex >= array.length
  ) {
    throw new Error("Index out of bounds");
  }
  const newArray = [...array];
  const element = newArray.splice(fromIndex, 1)[0];
  newArray.splice(toIndex, 0, element);
  return newArray;
}

function getLeftDistCondition(collisions) {
  // true if section has not children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    !collisions[0]?.data.droppableContainer.data.current.hasNested &&
    collisions[0]?.data.leftDist > 200 * useReactFlow.getState().transform[2]
  );
}

function getShouldDrop(active, over, collisions) {
  // Make sure collisions[0] agrees with over.id).
  // Make sure active is not over
  // Make sure over is a sortable or over has no children and can have children
  return (
    !!over &&
    collisions[0]?.id === over.id &&
    active.id !== over.id &&
    (over.data.current.sortable || !over.data.current.hasNested)
  );
}

// returns [dropType, newParentId, newIndex]
function getPositionDropType({ centerYCondition, leftDistCondition }) {
  const { activeId, overId } = useDndState.getState();
  const s = useSectionInfos.getState();
  const overParentId = getSectionParentId(overId);

  // Drop into section if it is a sortable and leftOffset is large enough
  // Or if it's not a sortable and has no children.
  if ((overParentId && leftDistCondition) || !overParentId) {
    return [PositionDropType.INTO, overId, 0];
  }

  const siblings = s.x[overParentId].children;
  const overIndex = siblings.indexOf(overId);

  // Is effectively sorting
  if (overParentId === getSectionParentId(activeId)) {
    const activeIndex = siblings.indexOf(activeId);
    // Drop below the target if moving down the list
    if (activeIndex < overIndex) {
      return [PositionDropType.BELOW, overParentId, overIndex];
    }
    // Drop above the target if moving up the list
    return [PositionDropType.ABOVE, overParentId, overIndex];
  }

  // Dropping into a list from outside
  // If the target is anything other than the last element, then drop above it
  if (overIndex < siblings.length - 1) {
    return [PositionDropType.ABOVE, overParentId, overIndex];
  }

  // If the target is the last element
  return centerYCondition
    ? [PositionDropType.ABOVE, overParentId, overIndex]
    : [PositionDropType.BELOW, overParentId, overIndex + 1];
}

// returns [dropType, newParentId, newIndex]
function getBehaviorDropType({ newParentId }) {
  const activeId = useDndState.getState().activeId;
  // invalid if parent can't have children
  // or if child can only be in deck and parent is not a deck
  if (
    !getSectionCanHaveNested(newParentId) ||
    (getSectionCanOnlyBeChildOfDeck(activeId) && !getSectionIsDeck(newParentId))
  ) {
    return BehaviorDropType.INVALID;
  }

  if (getSectionIsRoot(newParentId)) {
    // dropping withint same list
    if (getSectionParentId(activeId) === newParentId) {
      return BehaviorDropType.DROP_HERE;
    }
    return BehaviorDropType.NEW_LIST_ELEMENT;
  }

  return BehaviorDropType.INVALID;
}

export function getDropType({
  shouldDrop,
  centerYCondition,
  leftDistCondition,
}) {
  if (!shouldDrop) {
    return {
      positionDropType: [null, null, null],
      behaviorDropType: null,
    };
  }

  const positionDropType = getPositionDropType({
    centerYCondition,
    leftDistCondition,
  });
  const behaviorDropType = getBehaviorDropType({
    newParentId: positionDropType[1],
  });

  return { positionDropType, behaviorDropType };
}
