import { DropType, useDndState } from "models/info/dndState";
import { useKeyActivations } from "models/keyActivations";
import { useCallback } from "react";
import { useStore } from "react-flow-renderer";

export function useOnDragMove() {
  const zoom = useStore((x) => x.transform[2]);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const currOver = useDndState((x) => x.over);
  const currParent = useDndState((x) => x.parent);
  const currOverDropType = useDndState((x) => x.overDropType);
  const currParentDropType = useDndState((x) => x.parentDropType);
  const setOver = useDndState((x) => x.setOver);
  return useCallback(
    (props) =>
      onDragMove({
        ...props,
        zoom,
        isMovingFree,
        currOver,
        currParent,
        currOverDropType,
        currParentDropType,
        setOver,
      }),
    [
      zoom,
      isMovingFree,
      currOver,
      currParent,
      currOverDropType,
      currParentDropType,
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
  currParent,
  currOverDropType,
  currParentDropType,
  setOver,
}) {
  if (isMovingFree) {
    let overDropType = DropType.NONE;
    let parentDropType = DropType.NONE;
    let overId = null;
    let parentId = null;
    if (over) {
      overId = over.id;
      overDropType = getDropType(active, over, collisions, zoom);
      if (
        over.data.current.sortable?.containerId &&
        !getLeftDistCondition(collisions, zoom)
      ) {
        parentId = over.data.current.sortable?.containerId;
        parentDropType = DropType.INTO;
      }
    }
    if (
      overId !== currOver ||
      parentId !== currParent ||
      overDropType !== currOverDropType ||
      parentDropType !== currParentDropType
    ) {
      setOver({ over: overId, parent: parentId, overDropType, parentDropType });
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
  if (collisions[0]?.id !== over.id || active.id === over.id) {
    return DropType.NONE;
  }

  // Drop into section if leftOffset is large enough or if there is no parent
  if (!over.data.current.sortable || getLeftDistCondition(collisions, zoom)) {
    return DropType.INTO;
  }

  const siblings =
    collisions[0].data.droppableContainer.data.current.sortable?.items;
  const overIndex = siblings.indexOf(over.id);

  // Is effectively sorting
  if (
    active.data.current.sortable?.containerId ===
    over.data.current.sortable?.containerId
  ) {
    const activeIndex = siblings.indexOf(active.id);
    // Drop below the target if moving down the list
    if (activeIndex < overIndex) {
      return DropType.BELOW;
    }
    // Drop above the target if moving up the list
    return DropType.ABOVE;
  }

  // Dropping into a list from outside
  // If the target is anything other than the first element, then drop below it
  if (overIndex > 0) {
    return DropType.BELOW;
  }
  // If the target is the first element
  const centerYCondition = collisions[0].data.centerYDist < 0;
  // Drop above section
  if (centerYCondition) {
    return DropType.ABOVE;
  }
  // Drop below section
  return DropType.BELOW;
}
