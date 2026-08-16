import { useRef } from "react";
import { getReactFlowStore } from "../canvas/store";
import { screenToFlowPosition } from "../canvas/viewportPosition";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionChildren } from "../document/documentSelectors";
import { moveSections } from "../document/moveSections";
import {
  getSharedParentId,
  isDescendantOfSectionSelection,
} from "../document/sectionSelection";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type { DragEndEvent } from "./adapter";
import { getDndChildrenStore, manualDndChildrenReset } from "./dndChildren";
import { getDndSectionId } from "./dndIds";
import { forceDeactivateDnd, getDndStateStore } from "./dndState";
import { getSortingOverState } from "./sortingOverState";
import { getOverId } from "./useDropType";
import { planFreeMove, planSortingMove } from "./useMoveSectionPlans";

// The reference's drag-end commit (`useMoveSection.ts`): one canonical document change per
// gesture through the package move funnel instead of `moveSectionsWithBackend`.

function onSortEnd(host: WorkspaceHost, {
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const plan = resolveSortPlan(host, { active, over, collisions });
  if (!plan) {
    manualDndChildrenReset(host);
    return;
  }

  moveSections(host, plan);
  manualDndChildrenReset(host);
}

function onFreeMoveEnd(host: WorkspaceHost, {
  active,
  over,
  collisions,
  delta,
}: Pick<DragEndEvent, "active" | "over" | "collisions" | "delta">) {
  const state = getWorkspaceDocumentStore(host).getState();
  const dndChildrenState = getDndChildrenStore(host).getState();
  const dndState = getDndStateStore(host).getState();
  const activeId = String(active.id);
  const draggingIds = resolveDraggingIds(host, activeId);
  const draggingSet = new Set(draggingIds);
  const dndSectionId = getDndSectionId(activeId);
  const resolvedOverId = getOverId(host, over, collisions);
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
    toFlowPosition: (position) => screenToFlowPosition(host, position),
  });
  if (!plan) {
    manualDndChildrenReset(host);
    return;
  }

  moveSections(host, plan);
  manualDndChildrenReset(host);
  scheduleSelectionBoundsUpdate(host);
}

export function useOnDragEnd() {
  const host = useWorkspaceHost();
  const dummyRef = useRef<HTMLDivElement>(null);

  function onDragEnd({
    active,
    over,
    collisions,
    canceled,
    delta,
  }: DragEndEvent) {
    if (canceled) {
      forceDeactivateDnd(host);
      return;
    }

    if (getDndStateStore(host).getState().isSorting) {
      onSortEnd(host, { active, over, collisions });
    } else if (getDndStateStore(host).getState().isMovingFree) {
      onFreeMoveEnd(host, {
        active,
        over,
        collisions,
        delta,
      });
    } else {
      manualDndChildrenReset(host);
    }
    // don't reset isMovingFree or isSorting
    getDndStateStore(host).getState().reset((api) => {
      const dndState = api.getState() as ReturnType<
        ReturnType<typeof getDndStateStore>["getState"]
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

function resolveDraggingIds(host: WorkspaceHost, activeId: string): Array<string> {
  const draggingIds = getDndStateStore(host).getState().draggingIds;
  if (draggingIds.length > 0) {
    return draggingIds;
  }
  return [activeId];
}

function resolveSortPlan(host: WorkspaceHost, {
  active,
  over,
  collisions,
}: Pick<DragEndEvent, "active" | "over" | "collisions">) {
  const parentId = resolveSortableParentId(active);
  if (!parentId) {
    return null;
  }

  const state = getWorkspaceDocumentStore(host).getState();
  const activeId = String(active.id);
  return planSortingMove(
    buildSortingMovePlanInput(host, {
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

function buildSortingMovePlanInput(host: WorkspaceHost, {
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
  const draggingIds = resolveDraggingIds(host, activeId);
  const draggingSet = new Set(draggingIds);

  return {
    children: getSectionChildren(state, parentId),
    collisions,
    draggingIds,
    draggingSet,
    ...resolveSortingFallback(host, parentId),
    isInvalidTarget: isDescendantOfSectionSelection(
      state,
      parentId,
      draggingSet,
    ),
    over,
    parentId,
  };
}

function resolveSortingFallback(host: WorkspaceHost, parentId: string) {
  const sortingOverState = getSortingOverState(host, parentId);
  return {
    fallbackOverId: sortingOverState?.overId ?? null,
    fallbackPastHalfway: sortingOverState?.pastHalfway ?? null,
  };
}

const selectionFramesByHost = new WeakMap<WorkspaceHost, Set<number>>();

function getSelectionFrames(host: WorkspaceHost): Set<number> {
  const existing = selectionFramesByHost.get(host);
  if (existing) {
    return existing;
  }
  const frames = new Set<number>();
  selectionFramesByHost.set(host, frames);
  registerWorkspaceHostCleanup(host, () => {
    for (const frame of frames) {
      cancelAnimationFrame(frame);
    }
    selectionFramesByHost.delete(host);
  });
  return frames;
}

function scheduleSelectionBoundsUpdate(host: WorkspaceHost) {
  const activeIds = getActiveSectionIds(host);
  if (activeIds.length === 0) {
    return;
  }
  const frames = getSelectionFrames(host);
  const frame = requestAnimationFrame(() => {
    frames.delete(frame);
    getReactFlowStore(host).getState().setNodesSelection(activeIds.length, true);
  });
  frames.add(frame);
}
