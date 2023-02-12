import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useCallback } from "react";
import { useStore } from "react-flow-renderer";
import { getSectionIsRoot } from "thunks/sections/sections";
import {
  DropType,
  IntoDropType,
  SiblingDropType,
} from "utils/DNDSortable/dropTypes";

export function useOnDragMove() {
  const zoom = useStore((x) => x.transform[2]);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const currOver = useDndState((x) => x.overId);
  const currOverDropType = useDndState((x) => x.overDropType);
  const currCenterYCondition = useDndState((x) => x.centerYCondition);
  const setOver = useDndState((x) => x.setOver);
  return useCallback(
    (props) =>
      onDragMove({
        ...props,
        zoom,
        isMovingFree,
        currOver,
        currOverDropType,
        currCenterYCondition,
        setOver,
      }),
    [
      zoom,
      isMovingFree,
      currOver,
      currOverDropType,
      currCenterYCondition,
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
  currOverDropType,
  currCenterYCondition,
  setOver,
}) {
  if (isMovingFree) {
    const overDropType = over
      ? getDropType(active, over, collisions, zoom)
      : DropType.NONE;
    const overId = over ? over.id : null;
    const centerYCondition = collisions[0]?.data.centerYDist < 0;

    if (
      overId !== currOver ||
      overDropType !== currOverDropType ||
      centerYCondition !== currCenterYCondition
    ) {
      setOver({ overId, overDropType, centerYCondition });
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

export function getDropType(active, over, collisions, zoom) {
  // Weird case where collisions[0] doesn't agree with over.id).
  // Or if active === over
  // Plus a normal case: if section is top-level (not sortable)
  // and it has children, then it shouldn't be dropped into
  if (
    collisions[0]?.id !== over.id ||
    active.id === over.id ||
    (!over.data.current.sortable && over.data.current.hasNested)
  ) {
    return DropType.NONE;
  }

  // Drop into section if it is a sortable and leftOffset is large enough
  // Or if it's not a sortable and has no children. (The 'has children' case is covered above)
  if (
    (over.data.current.sortable && getLeftDistCondition(collisions, zoom)) ||
    !over.data.current.sortable
  ) {
    return DropType.INTO;
  }

  return DropType.AS_SIBLING;
}

// returns [dropType, newParentId, newIndex]
export function getSiblingDropType({ activeId, overId, centerYCondition }) {
  const s = useSectionInfos.getState();
  const overParentId = s.x[overId].parentId;
  const siblings = s.currChildren[overParentId];
  const overIndex = siblings.indexOf(overId);

  // Is effectively sorting
  if (overParentId === s.x[activeId].parentId) {
    const activeIndex = siblings.indexOf(activeId);
    // Drop below the target if moving down the list
    if (activeIndex < overIndex) {
      return [SiblingDropType.BELOW, overParentId, overIndex];
    }
    // Drop above the target if moving up the list
    return [SiblingDropType.ABOVE, overParentId, overIndex];
  }

  // Dropping into a list from outside
  // If the target is anything other than the last element, then drop above it
  if (overIndex < siblings.length - 1) {
    return [SiblingDropType.ABOVE, overParentId, overIndex];
  }

  // If the target is the last element
  return centerYCondition
    ? [SiblingDropType.ABOVE, overParentId, overIndex]
    : [SiblingDropType.BELOW, overParentId, overIndex + 1];
}

// returns [dropType, newParentId, newIndex]
export function getIntoDropType({ activeId, overId }) {
  if (getSectionIsRoot(activeId)) {
    return [IntoDropType.NEW_LIST_CHILD, overId, 0];
  }

  // const

  // if ()
}

export function getDropSubType({
  activeId,
  overId,
  dropType,
  centerYCondition,
}) {
  if (dropType === DropType.AS_SIBLING) {
    return getSiblingDropType({ activeId, overId, centerYCondition });
  } else if (dropType === DropType.INTO) {
    return getIntoDropType({ activeId, overId });
  }
  return [null, null, null]
}
