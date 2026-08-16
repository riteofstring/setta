import { useRef } from "react";
import { useReactFlow } from "../canvas/store";
import { screenToFlowPosition } from "../canvas/viewportPosition";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionChildren } from "../document/documentSelectors";
import { moveSections } from "../document/moveSections";
import {
  getSharedParentId,
  isDescendantOfSectionSelection,
} from "../document/sectionSelection";
import {
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "../document/stores";
import type { DragEndEvent } from "./adapter";
import { manualDndChildrenReset, useDndChildren } from "./dndChildren";
import { getDndSectionId } from "./dndIds";
import { forceDeactivateDnd, useDndState } from "./dndState";
import { getSortingOverState } from "./sortingOverState";
import { getOverId } from "./useDropType";
import { planFreeMove, planSortingMove } from "./useMoveSectionPlans";

// The reference's drag-end commit (`useMoveSection.ts`): one canonical document change per
// gesture through the package move funnel instead of `moveSectionsWithBackend`.

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

  moveSections(plan);
  manualDndChildrenReset();
}

function onFreeMoveEnd({
  active,
  over,
  collisions,
  delta,
}: Pick<DragEndEvent, "active" | "over" | "collisions" | "delta">) {
  const state = useWorkspaceDocument.getState();
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
      sharedParentId !== null && sharedParentId !== undefined
        ? getSectionChildren(state, sharedParentId)
        : null,
    sharedParentId: sharedParentId ?? null,
    topLevelSections: state.topLevelSections,
    toFlowPosition: screenToFlowPosition,
  });
  if (!plan) {
    manualDndChildrenReset();
    return;
  }

  moveSections(plan);
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
    useDndState.getState().reset((api) => {
      const dndState = api.getState() as ReturnType<
        typeof useDndState.getState
      >;
      return {
        isMovingFree: dndState.isMovingFree,
        isSorting: dndState.isSorting,
        pendingDeactivation: dndState.pendingDeactivation,
        disabled: dndState.disabled,
      };
    });
  }

  return { dummyRef, onDragEnd };
}

function resolveDraggingIds(activeId: string): Array<string> {
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

  const state = useWorkspaceDocument.getState();
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
  active: DragEndEvent["active"],
): string | null {
  const activeData = active.data?.current as
    { sortable?: { containerId?: string } } | undefined;
  return activeData?.sortable?.containerId ?? null;
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
  state: WorkspaceDocumentState;
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
  const activeIds = getActiveSectionIds();
  if (activeIds.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    useReactFlow.getState().setNodesSelection(activeIds.length, true);
  });
}
