import {
  addDndChild,
  removeDndChild,
  replaceDndSectionWithTemp,
  useDndChildren,
} from "forks/dnd-kit/dndChildren";
import {
  getDndSectionId,
  setActiveDnd,
  setDndTime,
  useDndState,
  ZustandDndState,
} from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { getSectionRectWithNested } from "forks/xyflow/core/utils/graph";
import {
  getCurrSectionVariant,
  getSectionChildren,
  getSectionType,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";

export function onDragStart({ active }: DragStartEvent) {
  if (!active.data || !active.data.current) {
    return;
  }
  const { width, height } = getSectionRectWithNested(active.id);
  const dndState = useDndState.getState();
  setActiveDnd(active.id, active.data.current.isTopLevel, width, height);
  if (dndState.isMovingFree) {
    replaceDndSectionWithTemp(active.id);
  }
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({ active, collisions }: DragMoveEvent) {
  const triggerDistCondition = collisions?.[0]?.triggerDistCondition;
  const dndState = useDndState.getState();

  if (triggerDistCondition !== dndState.triggerDistCondition) {
    useDndState.setState({ triggerDistCondition });
    const over = collisions?.[0];
    if (over && over.id === dndState.overId) {
      onDragOver({
        active,
        over,
        collisions,
        calledFromOnDragMove: true,
      });
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

function onDragOver({
  active,
  over,
  collisions,
  calledFromOnDragMove,
}: DragOverEvent & { calledFromOnDragMove?: boolean }) {
  if (!collisions) {
    return;
  }

  const overId = getOverId(over);
  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getDndParentId(dndSectionId);

  // There can be discrepancy between over and collisions due to the way state updates in DndContext.
  // Collisions will be more up-to-date. If it's empty, reset relevant state and return early.
  if (collisions.length === 0) {
    removeDndChild(dndSectionId);
    setNullBehavior(null);
    return;
  }

  if (calledFromOnDragMove && dndState.triggerDistCondition) {
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    });
    return;
  }

  // Don't allow very recent overId to be revisited (hack to avoid infinite loops)
  if (!calledFromOnDragMove && overId && getTimeDiff(dndState, overId) < 100) {
    setNullBehavior(overId);
    return;
  }

  setDndTime(overId);

  // Dragging onto the pane or over self.
  if (!overId) {
    removeDndChild(dndSectionId);
    setNullBehavior(overId);
    return;
  }

  if (dndState.triggerDistCondition) {
    leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
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
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
  });
}

function maybeMoveToNewParent({
  active,
  over,
  dndSectionId,
  oldParentId,
  newParentId,
  dndChildrenState,
  collisions,
}: DragOverEvent & {
  dndSectionId: string;
  oldParentId: string;
  newParentId: string;
  dndChildrenState: ZustandDndState;
}) {
  const overId = getOverId(over);
  // Check if section can actually be dropped onto newParentId
  console.log("newParentId", newParentId);
  const behaviorDropType = getBehaviorDropType(active.id, newParentId);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    removeDndChild(dndSectionId);
    useDndState.setState({ behaviorDropType, overId });
    return;
  }

  const newParentNumChildren = getSectionChildren(
    useProjectState.getState(),
    newParentId,
  ).length;

  // Special case where you move a section out of its parent
  // and back in, and the section is the only-child of the parent
  if (
    newParentNumChildren === 1 &&
    useProjectState.getState().parentSectionMap[active.id] === newParentId
  ) {
    addDndChild(oldParentId, newParentId, dndSectionId, 0);
    return;
  }

  // I don't remember this logic, but it seems to help
  // prevent flickering when dragging a section into
  // a list with nested sections, from the left.
  if (overId === newParentId && newParentNumChildren > 0) {
    removeDndChild(dndSectionId);
    return;
  }

  // Check if the temporary section has a new parent
  if (newParentId !== oldParentId) {
    // If the active was from a sortable, and we're not in that sortable anymore.
    const newParentChildren = dndChildrenState.x[newParentId];
    const _index = newParentChildren.indexOf(overId);
    let index = _index;
    if (_index >= 0) {
      if (collisions[0].pastHalfway) {
        index = _index + 1;
      }
    } else {
      index = 0;
    }
    addDndChild(oldParentId, newParentId, dndSectionId, index);
  }

  setNullBehavior(overId);
}

function leftDistBehavior({
  active,
  over,
  dndChildrenState,
  oldParentId,
  dndSectionId,
  collisions,
}) {
  const overId = getOverId(over);
  // Consider overId to be the new parent, if it's not the temp section.
  if (overId !== dndSectionId) {
    maybeMoveToNewParent({
      active,
      over,
      dndSectionId,
      oldParentId,
      newParentId: overId,
      dndChildrenState,
      collisions,
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

export function getDndParentId(dndSectionId: string) {
  return useDndChildren.getState().y[dndSectionId];
}

function getBehaviorDropType(activeId: string, newParentId: string) {
  // invalid
  // if parent can't have children
  // or if parent variant is frozen
  // or if dragged section is global variables (TODO: loosen this restriction)
  if (
    !getSectionIsRoot(newParentId) ||
    getCurrSectionVariant(useProjectState.getState(), newParentId).isFrozen ||
    getSectionIsGlobalVariables(activeId)
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  return null;
}

function getOverId(over: { id: string | number } | null) {
  return over ? over.id : null;
}

function getSectionIsGlobalVariables(sectionId: string) {
  return (
    useProjectState.getState().singletonSections.GlobalVariables === sectionId
  );
}

function getSectionIsRoot(sectionId: string) {
  return getIsRoot(getSectionType(useProjectState.getState(), sectionId));
}
