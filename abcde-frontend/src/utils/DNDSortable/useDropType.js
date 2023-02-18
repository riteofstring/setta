import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useCallback } from "react";
import { useStore } from "react-flow-renderer";
import { getCurrObjParamKwargInfos } from "thunks/sections/sectionContents";
import { getSectionIsRoot } from "thunks/sections/sections";
import {
  BehaviorDropType,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";

export function useOnDragMove() {
  const zoom = useStore((x) => x.transform[2]);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const currOver = useDndState((x) => x.overId);
  const currShouldDrop = useDndState((x) => x.shouldDrop);
  const currCenterYCondition = useDndState((x) => x.centerYCondition);
  const currLeftDistCondition = useDndState((x) => x.centerLeftDistCondition);
  const setOver = useDndState((x) => x.setOver);
  return useCallback(
    (props) =>
      onDragMove({
        ...props,
        zoom,
        isMovingFree,
        currOver,
        currShouldDrop,
        currCenterYCondition,
        currLeftDistCondition,
        setOver,
      }),
    [
      zoom,
      isMovingFree,
      currOver,
      currShouldDrop,
      currCenterYCondition,
      currLeftDistCondition,
      setOver,
    ]
  );
}

export function onDragStart({ active }) {
  useDndState
    .getState()
    .setActive({ id: active.id, isTopLevel: active.data.current.isTopLevel });
}

export function onDragEnd() {
  useDndState.getState().reset();
}

function onDragMove({
  active,
  over,
  collisions,
  zoom,
  isMovingFree,
  currOver,
  currShouldDrop,
  currCenterYCondition,
  currLeftDistCondition,
  setOver,
}) {
  if (isMovingFree) {
    const shouldDrop = getShouldDrop(active, over, collisions);
    const overId = over ? over.id : null;
    const centerYCondition = collisions[0]?.data.centerYDist < 0;
    const leftDistCondition = getLeftDistCondition(collisions, zoom);

    if (
      overId !== currOver ||
      shouldDrop !== currShouldDrop ||
      centerYCondition !== currCenterYCondition ||
      leftDistCondition !== currLeftDistCondition
    ) {
      setOver({ overId, shouldDrop, centerYCondition, leftDistCondition });
    }
  }
}

function getLeftDistCondition(collisions, zoom) {
  // true if section has not children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    !collisions[0]?.data.droppableContainer.data.current.hasNested &&
    collisions[0]?.data.leftDist > 200 * zoom
  );
}

export function getShouldDrop(active, over, collisions) {
  // Weird case where collisions[0] doesn't agree with over.id).
  // Or if active === over
  // Plus a normal case: if section is top-level (not sortable)
  // and it has children, then it shouldn't be dropped into
  if (
    !over ||
    collisions[0]?.id !== over.id ||
    active.id === over.id ||
    (!over.data.current.sortable && over.data.current.hasNested)
  ) {
    return false;
  }
  return true;
}

// returns [dropType, newParentId, newIndex]
export function getPositionDropType({ centerYCondition, leftDistCondition }) {
  const { activeId, overId } = useDndState.getState();
  const s = useSectionInfos.getState();
  const overParentId = s.x[overId].parentId;

  // Drop into section if it is a sortable and leftOffset is large enough
  // Or if it's not a sortable and has no children.
  if ((overParentId && leftDistCondition) || !overParentId) {
    return [PositionDropType.INTO, overId, 0];
  }

  const siblings = s.currChildren[overParentId];
  const overIndex = siblings.indexOf(overId);

  // Is effectively sorting
  if (overParentId === s.x[activeId].parentId) {
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
export function getBehaviorDropType({ newParentId }) {
  const activeId = useDndState.getState().activeId;

  if (getSectionIsRoot(newParentId)) {
    return BehaviorDropType.NEW_LIST_CHILD;
  }

  const activeName = useSectionInfos.getState().x[activeId].name;
  const params = getCurrObjParamKwargInfos(newParentId);
  let nameAlreadyExists = false;
  for (const p of params) {
    if (activeName === p.name) {
      nameAlreadyExists = true;
      break;
    }
  }

  if (!nameAlreadyExists) {
    return BehaviorDropType.NEW_ARG;
  }

  return BehaviorDropType.EXISTING_ARG;
}

export function getDropType({
  shouldDrop,
  centerYCondition,
  leftDistCondition,
}) {
  if (!shouldDrop) {
    return {
      positionDropType: [PositionDropType.NONE, null, null],
      behaviorDropType: BehaviorDropType.NONE,
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

export function getDropTypeForOneSection({ sectionId, overIsSelf, ...props }) {
  const { positionDropType, behaviorDropType } = getDropType(props);

  // section is new parent
  if (sectionId === positionDropType[1]) {
    if (positionDropType[0] !== PositionDropType.INTO) {
      return {
        positionDropType: PositionDropType.NONE,
        behaviorDropType,
      };
    }
    return { positionDropType: positionDropType[0], behaviorDropType };
  } else if (overIsSelf) {
    return {
      positionDropType: positionDropType[0],
      behaviorDropType: BehaviorDropType.NONE,
    };
  }

  return {
    positionDropType: PositionDropType.NONE,
    behaviorDropType: BehaviorDropType.NONE,
  };
}
