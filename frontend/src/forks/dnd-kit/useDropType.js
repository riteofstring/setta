import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { getDndSectionId, useDndState } from "forks/dnd-kit/dndState";
import { BehaviorDropType } from "forks/dnd-kit/dropTypes";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRectWithNested } from "forks/xyflow/core/utils/graph";
import { getSectionChildren } from "state/actions/sectionVariants";
import {
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
} from "state/getters/sectionInfo";

export function onDragStart({ active }) {
  const { width, height } = getSectionRectWithNested(active.id);
  const dndState = useDndState.getState();
  dndState.setActive({
    id: active.id,
    isTopLevel: active.data.current.isTopLevel,
    width,
    height,
  });
  if (dndState.isMovingFree) {
    useDndChildren.getState().replaceWithTemp(active.id);
  }
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({ active, over, collisions }) {
  const leftDistCondition = getLeftDistCondition(collisions);
  const dndState = useDndState.getState();

  if (leftDistCondition !== dndState.leftDistCondition) {
    useDndState.setState({ leftDistCondition });
    if (over && over.id === dndState.overId) {
      if (leftDistCondition) {
        onDragOver({ active, over, triggeredByLeftDist: true });
      } else {
        onDragOver({ active, over, triggeredByLeftDist: false });
      }
    }
  }
}

export function useOnDragOver() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragOver;
  }
  return () => {};
}

function onDragOver({ active, over, triggeredByLeftDist }) {
  const overId = over ? over.id : null;
  console.log("overId", overId)
  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getDndParentId(dndSectionId);

  if (triggeredByLeftDist === true) {
    leftDistBehavior({
      active,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      overId,
    });
    return;
  }

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (
    triggeredByLeftDist === undefined &&
    overId &&
    getTimeDiff(dndState, overId) < 100
  ) {
    setNullBehavior(overId);
    return;
  }

  dndState.setTime(overId);

  // Dragging onto the pane or over self.
  if (!overId) {
    dndChildrenState.removeChild(dndSectionId);
    setNullBehavior(overId);
    return;
  }

  if (dndState.leftDistCondition) {
    leftDistBehavior({
      active,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      overId,
    });
    return;
  }

  // Dragging over the temporary section
  if (dndSectionId === overId) {
    setNullBehavior(overId);
    return;
  }

  // If overId doesn't have a parent, then set newParent to be overId
  const newParentId = getDndParentId(overId) ?? overId;

  maybeMoveToNewParent({
    active,
    overId,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
  });
}

function maybeMoveToNewParent({
  active,
  overId,
  dndSectionId,
  oldParentId,
  newParentId,
  dndChildrenState,
}) {
  console.log("maybeMoveToNewParent")
  // Check if section can actually be dropped onto newParentId
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    dndChildrenState.removeChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    return;
  }

  if (overId === newParentId && getSectionChildren(newParentId).length > 0) {
    dndChildrenState.removeChild(dndSectionId);
    return;
  }

  // Check if the temporary section has a new parent
  if (newParentId !== oldParentId) {
    // If the active was from a sortable, and we're not in that sortable anymore.
    const newParentChildren = dndChildrenState.x[newParentId];
    const _index = newParentChildren.indexOf(overId);
    const index = _index >= 0 ? _index : 0;

    dndChildrenState.addChild({
      oldParentId,
      newParentId,
      childId: dndSectionId,
      index,
    });
  }

  setNullBehavior(overId);
}

function leftDistBehavior({
  active,
  dndChildrenState,
  oldParentId,
  dndSectionId,
  overId,
}) {
  // Remove temporary section if it's not the only child.
  if (dndChildrenState.x[oldParentId]?.length > 1) {
    dndChildrenState.removeChild(dndSectionId);
  }
  // Consider overId to be the new parent, if it's not the temp section.
  if (overId !== dndSectionId) {
    maybeMoveToNewParent({
      active,
      overId,
      dndSectionId,
      oldParentId,
      newParentId: overId,
      dndChildrenState,
    });
  }
}

function setNullBehavior(overId) {
  useDndState.setState({
    behaviorDropType: null,
    overId,
  });
}

function getTimeDiff(state, sectionId) {
  return Date.now() - (state.times[sectionId] ?? 0);
}

export function getDndParentId(dndSectionId) {
  return useDndChildren.getState().y[dndSectionId];
}

function getLeftDistCondition(collisions) {
  // true if section is not top level and doesn't have children
  // and active section is to the right of this section by at least 200 pixels (adjusted by zoom)
  return (
    !collisions[0]?.data.droppableContainer.data.current.isTopLevel &&
    !collisions[0]?.data.droppableContainer.data.current.hasNested &&
    collisions[0]?.data.leftDist > 200 * useReactFlow.getState().transform[2]
  );
}

function getBehaviorDropType(activeId, newParentId) {
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
