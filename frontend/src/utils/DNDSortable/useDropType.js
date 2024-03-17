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

function onDragMove({ over, collisions }) {
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

  // Dragging over the temporary section
  // Or dragging over self, which is possible when moving free in original sortable.
  if (active.id === overId || dndSectionId === overId) {
    setNullBehavior(overId);
    return;
  }

  const newParentId = getParentId(overId) ?? overId;
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropType.INVALID) {
    dndChildrenState.removeChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    return;
  }

  const oldParentId = getParentId(dndSectionId);
  if (newParentId !== oldParentId) {
    const trueOldParentId = getParentId(active.id);
    if (newParentId !== trueOldParentId) {
      const newParentChildren = dndChildrenState.x[newParentId];
      const _index = newParentChildren.indexOf(over.id);
      const index = _index >= 0 ? _index : 0;

      dndChildrenState.addChild({
        oldParentId,
        newParentId,
        childId: dndSectionId,
        index,
      });
    } else {
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
