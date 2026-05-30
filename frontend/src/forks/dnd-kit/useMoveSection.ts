import {
  forceDeactivateDnd,
  getDndSectionId,
  useDndState,
} from "forks/dnd-kit/dndState";
import { updateNodesSelectionBoundsForSections } from "gpuFlow/selectionBounds";
import { screenToFlowPosition } from "gpuFlow/viewportActions";
import { useRef } from "react";
import {
  getSectionChildren,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { moveSectionsWithBackend } from "state/actions/sections/moveSections";
import {
  getSharedParentId,
  isDescendantOfSectionSelection,
} from "state/actions/sections/sectionSelection";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
} from "state/definitions";
import type { Position } from "utils/generatedTypes";
import type { DragEndEvent } from "./adapter";
import { useDndChildren } from "./dndChildren";
import { getSortingOverState } from "./sortingOverState";
import { getOverId } from "./useDropType";
import { planFreeMove, planSortingMove } from "./useMoveSectionPlans";

function onSortEnd({
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const plan = resolveSortPlan({ active, over, collisions });
  if (!plan) {
    manualDndChildrenReset();
    return;
  }

  moveSectionsWithBackend(plan);
  manualDndChildrenReset();
}

function onFreeMoveEnd({
  active,
  over,
  collisions,
  delta,
}: Pick<DragEndEvent, "active" | "over" | "collisions" | "delta">) {
  const state = useProjectState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndState = useDndState.getState();
  const activeId = String(active.id);
  const draggingIds = resolveDraggingIds(activeId);
  const draggingSet = new Set(draggingIds);
  const dndSectionId = getDndSectionId(activeId);
  const resolvedOverId = getOverId(over, collisions);
  const overId = resolvedOverId ? String(resolvedOverId) : null;
  const sharedParentId = getSharedParentId(state, draggingIds);
  const plan = planFreeMove({
    behaviorDropType: dndState.behaviorDropType,
    collisions,
    delta,
    dndChildrenState,
    dndSectionId,
    draggingIds,
    draggingRectsById: dndState.draggingRectsById,
    draggingSet,
    isInvalidParent: (parentId) =>
      isDescendantOfSectionSelection(state, parentId, draggingSet),
    overId,
    parentSectionMap: state.parentSectionMap,
    sharedParentChildren:
      sharedParentId !== null
        ? getSectionChildren(state, sharedParentId)
        : null,
    sharedParentId,
    topLevelSections: state.projectConfig.topLevelSections,
    toFlowPosition: screenToDndFlowPosition,
  });
  if (!plan) {
    manualDndChildrenReset();
    return;
  }

  moveSectionsWithBackend(plan);
  manualDndChildrenReset();
  scheduleSelectionBoundsUpdate();
}

export function useOnDragEnd() {
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({
    active,
    over,
    collisions,
    canceled,
    delta,
  }: DragEndEvent) {
    if (canceled) {
      forceDeactivateDnd();
      return;
    }

    if (useDndState.getState().isSorting) {
      onSortEnd({ active, over, collisions });
    } else if (useDndState.getState().isMovingFree) {
      onFreeMoveEnd({
        active,
        over,
        collisions,
        delta,
      });
    } else {
      manualDndChildrenReset();
    }
    // don't reset isMovingFree or isSorting
    const additionalResetState = (state) => {
      const dndState = state.getState();
      const shouldDeactivate = dndState.pendingDeactivation;
      return {
        isMovingFree: dndState.isMovingFree,
        isSorting: dndState.isSorting,
        pendingDeactivation: shouldDeactivate,
        disabled: dndState.disabled,
      };
    };
    useDndState.getState().reset(additionalResetState);
  }

  return { dummyRef, onDragEnd };
}

function resolveDraggingIds(activeId: string): string[] {
  const draggingIds = useDndState.getState().draggingIds;
  if (draggingIds.length > 0) {
    return draggingIds;
  }
  return [activeId];
}

function resolveSortPlan({
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const parentId = resolveSortableParentId(active);
  if (!parentId) {
    return null;
  }

  const state = useProjectState.getState();
  const activeId = String(active.id);
  return planSortingMove(
    buildSortingMovePlanInput({
      activeId,
      collisions,
      over,
      parentId,
      state,
    }),
  );
}

function resolveSortableParentId(
  active: Pick<DragEndEvent, "active">["active"],
): string | null {
  const sortable = active.data?.current?.sortable;
  return sortable?.containerId ?? null;
}

function buildSortingMovePlanInput({
  activeId,
  collisions,
  over,
  parentId,
  state,
}: {
  activeId: string;
  collisions: DragEndEvent["collisions"];
  over: DragEndEvent["over"];
  parentId: string;
  state: ReturnType<typeof useProjectState.getState>;
}) {
  const draggingIds = resolveDraggingIds(activeId);
  const draggingSet = new Set(draggingIds);

  return {
    children: getSectionChildren(state, parentId),
    collisions,
    draggingIds,
    draggingSet,
    ...resolveSortingFallback(parentId),
    isInvalidTarget: isDescendantOfSectionSelection(
      state,
      parentId,
      draggingSet,
    ),
    over,
    parentId,
  };
}

function resolveSortingFallback(parentId: string) {
  const sortingOverState = getSortingOverState(parentId);
  return {
    fallbackOverId: sortingOverState?.overId ?? null,
    fallbackPastHalfway: sortingOverState?.pastHalfway ?? null,
  };
}

function scheduleSelectionBoundsUpdate() {
  const activeIds = getActiveSectionUIIds();
  if (activeIds.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    updateNodesSelectionBoundsForSections(activeIds);
  });
}

function screenToDndFlowPosition(position: Position): Position {
  return screenToFlowPosition(position, {
    snapGrid: useSettings.getState().gui.snapGrid,
    snapToGrid: useLocalStorage.getState().snapToGrid,
  });
}
