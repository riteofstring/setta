import {
  getSectionCanOnlyBeChildOfDeck,
  getSectionIsDeck,
  getSectionIsRoot,
} from "thunks/sections/getters";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { getDndSectionId, useDndState } from "utils/DNDSortable/dndState";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { useReactFlow } from "xyflow/core/store";
import { getSectionRectWithNested } from "xyflow/core/utils/graph";

export function onDragStart({ active }) {
  const { width, height } = getSectionRectWithNested(active.id);
  useDndState.getState().setActive({
    id: active.id,
    isTopLevel: active.data.current.isTopLevel,
    width,
    height,
  });
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({ active, over, collisions }) {
  const overId = over ? over.id : null;
  const leftDistCondition = getLeftDistCondition(collisions);
  const dndState = useDndState.getState();

  if (
    overId !== dndState.overId ||
    leftDistCondition !== dndState.leftDistCondition
  ) {
    useDndState.setState({
      overId,
      leftDistCondition,
    });

    onDragOver({ active, over });
  }
}

export function useOnDragOver() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragOver;
  }
  return () => {};
}

function onDragOver({ active, over }) {
  const overId = over ? over.id : null;
  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getParentId(dndSectionId);

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (overId && getTimeDiff(dndState, overId) < 100) {
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
    console.log("leftDistCondition");
    if (dndChildrenState.x[oldParentId]?.length > 1) {
      dndChildrenState.removeChild(dndSectionId);
    }
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
    return;
  }

  // Dragging over the temporary section
  if (dndSectionId === overId) {
    setNullBehavior(overId);
    return;
  }

  // Dragging over self, which is possible when moving free in original sortable.
  if (active.id === overId) {
    // This would get triggered if dragging back into the original sortable.
    if (oldParentId) {
      dndChildrenState.removeChild(dndSectionId);
    }
    setNullBehavior(overId);
    return;
  }

  // If overId doesn't have a parent, then set newParent to be overId
  const newParentId = getParentId(overId) ?? overId;

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
  // Check if section can actually be dropped onto newParentId
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    dndChildrenState.removeChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    return;
  }

  // Check if the temporary section has a new parent
  if (newParentId !== oldParentId) {
    // The "true" old parent is the parent of the non-temporary section.
    const trueOldParentId = getParentId(active.id);
    // If the active was from a sortable, and we're not in that sortable anymore.
    if (newParentId !== trueOldParentId) {
      const newParentChildren = dndChildrenState.x[newParentId];
      const _index = newParentChildren.indexOf(overId);
      const index = _index >= 0 ? _index : 0;

      dndChildrenState.addChild({
        oldParentId,
        newParentId,
        childId: dndSectionId,
        index,
      });
    } else {
      // If the active was from a sortable, but we're still in that sortable.
      dndChildrenState.removeChild(dndSectionId);
    }
  }

  setNullBehavior(overId);
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
