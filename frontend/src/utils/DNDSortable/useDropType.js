import { useDndMode } from "hooks/useDndUtils";
import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import {
  getSectionCanHaveNested,
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
  getSectionParentId,
} from "thunks/sections/getters";
import { REACT_FLOW_STORE } from "utils/constants";
import {
  BehaviorDropType,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";

export function useOnDragMove() {
  const { isMovingFree } = useDndMode();
  const rfStore = REACT_FLOW_STORE.store;
  return (props) => {
    onDragMove({
      ...props,
      isMovingFree,
      rfStore,
    });
  };
}

export function onDragStart({ active }) {
  useDndState
    .getState()
    .setActive({ id: active.id, isTopLevel: active.data.current.isTopLevel });
}

export function onDragEnd() {
  useDndState.getState().reset();
}

function onDragMove({ active, over, collisions, isMovingFree, rfStore }) {
  if (isMovingFree) {
    const shouldDrop = getShouldDrop(active, over, collisions);
    const overId = over ? over.id : null;
    const centerYCondition = collisions[0]?.data.centerYDist < 0;
    const leftDistCondition = getLeftDistCondition(collisions, rfStore);
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

function getLeftDistCondition(collisions, rfStore) {
  // true if section has not children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    !collisions[0]?.data.droppableContainer.data.current.hasNested &&
    collisions[0]?.data.leftDist > 200 * rfStore.getState().transform[2]
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
