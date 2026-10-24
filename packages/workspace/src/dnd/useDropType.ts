import {
  getSectionChildren,
  getSectionOrThrow,
} from "../document/documentSelectors";
import { canWorkspaceSectionAcceptNestedSection } from "../document/sectionKindRegistry";
import { isDescendantOfSectionSelection } from "../document/sectionSelection";
import { getWorkspaceDocumentStore } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  assertWorkspaceHostActive,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import {
  getCollisionTriggerDistCondition,
  resolveOverCollisionId,
} from "./adapter/collisionCompare";
import {
  addDndChild,
  manualDndChildrenReset,
  removeDndChild,
  replaceDndSectionsWithTemp,
  getDndChildrenStore,
} from "./dndChildren";
import { getDndSectionId } from "./dndIds";
import {
  getDndStateStore,
  setActiveDnd,
  setDndTime,
  useDndState,
} from "./dndState";
import { resolveDragStartLayout } from "./dropTypeDragLayout";
import { BehaviorDropTypeEnum } from "./dropTypes";
import { resetSortingOverState } from "./sortingOverState";

type DropTypeRuntime = {
  lastPastHalfwayByOverId: Record<string, boolean>;
  lastResolvedOverId: string | number | null;
  lastResolvedPastHalfway: boolean | null;
  lastResolvedTriggerDistCondition: boolean | null;
  tempReplacementFrames: Set<number>;
};

const runtimesByHost = new WeakMap<WorkspaceHost, DropTypeRuntime>();

function getDropTypeRuntime(host: WorkspaceHost): DropTypeRuntime {
  assertWorkspaceHostActive(host);
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const runtime: DropTypeRuntime = {
    lastPastHalfwayByOverId: {},
    lastResolvedOverId: null,
    lastResolvedPastHalfway: null,
    lastResolvedTriggerDistCondition: null,
    tempReplacementFrames: new Set(),
  };
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    for (const frame of runtime.tempReplacementFrames) {
      cancelAnimationFrame(frame);
    }
    runtime.tempReplacementFrames.clear();
    runtimesByHost.delete(host);
  });
  return runtime;
}

type DndStoreState = ReturnType<
  ReturnType<typeof getDndStateStore>["getState"]
>;
type DndChildrenState = ReturnType<
  ReturnType<typeof getDndChildrenStore>["getState"]
>;
type Collisions = DragOverEvent["collisions"];
type ResolvedOverSnapshot = {
  overId: string | number | null;
  pastHalfway: boolean | null;
  triggerDistCondition: boolean;
};
type LeftDistOutcome = "continue" | "handled" | "ignored";
type ParentMoveArgs = {
  activeId: string;
  over: { id: string | number } | null;
  dndSectionId: string;
  oldParentId: string | null;
  newParentId: string;
  dndChildrenState: DndChildrenState;
  collisions: Collisions;
};
type ParentMoveContext = {
  activeId: string;
  dndSectionId: string;
  oldParentId: string | null;
  newParentId: string;
  overId: string | number | null;
  overIdKey: string | null;
  newParentChildren: Array<string>;
  newParentNumChildren: number;
  pastHalfway: boolean;
  tempInNewParent: boolean;
};

function resetLastPastHalfwayByOverId(host: WorkspaceHost) {
  getDropTypeRuntime(host).lastPastHalfwayByOverId = {};
}

function resetLastResolvedOverState(host: WorkspaceHost) {
  const runtime = getDropTypeRuntime(host);
  runtime.lastResolvedOverId = null;
  runtime.lastResolvedPastHalfway = null;
  runtime.lastResolvedTriggerDistCondition = null;
}

export function onDragStart(
  host: WorkspaceHost,
  { active, activeRect }: DragStartEvent,
) {
  resetLastPastHalfwayByOverId(host);
  resetLastResolvedOverState(host);
  resetSortingOverState(host);
  const activeData = active.data?.current as
    { isTopLevel?: boolean } | undefined;
  if (!activeData) {
    return;
  }
  const activeId = String(active.id);
  if (
    !getDndStateStore(host).getState().isMovingFree &&
    !getDndStateStore(host).getState().isSorting
  ) {
    getDndStateStore(host).setState({ isMovingFree: true, isHandleDrag: true });
  }
  const dndState = getDndStateStore(host).getState();
  const { selection, normalizedWidth, normalizedHeight } =
    resolveDragStartLayout(host, activeId, activeRect ?? null);
  setActiveDnd(host, {
    activeId,
    activeIsTopLevel: Boolean(activeData.isTopLevel),
    activeRect,
    height: normalizedHeight,
    width: normalizedWidth,
  });
  getDndStateStore(host).setState({
    draggingIds: selection.draggingIds,
    draggingRectsById: selection.draggingRectsById,
  });
  scheduleTempReplacement(host, activeId, selection.draggingIds, dndState);
}

export function useOnDragMove() {
  const host = useWorkspaceHost();
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return (event: DragMoveEvent) => onDragMove(host, event);
  }
  return () => {};
}

function onDragMove(
  host: WorkspaceHost,
  { active, collisions, over }: DragMoveEvent,
) {
  const dndState = getDndStateStore(host).getState();
  const update = resolveDragMoveUpdate(host, { collisions, over, dndState });

  if (update.triggerDistChanged) {
    getDndStateStore(host).setState({
      triggerDistCondition: update.triggerDistCondition,
    });
  }

  if (shouldRunDragOverFromMove(update)) {
    onDragOver(host, {
      active,
      over: update.overCandidate,
      collisions,
      calledFromOnDragMove: true,
    });
  }

  cachePastHalfway(host, update.resolvedOverIdKey, update.pastHalfway);
}

export function useOnDragOver() {
  const host = useWorkspaceHost();
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return (event: DragOverEvent) => onDragOver(host, event);
  }
  return () => {};
}

function onDragOver(
  host: WorkspaceHost,
  {
    active,
    over,
    collisions,
    calledFromOnDragMove,
  }: Pick<DragOverEvent, "active" | "collisions"> & {
    over: { id: string | number } | null;
    calledFromOnDragMove?: boolean;
  },
) {
  if (!collisions) {
    return;
  }

  const activeId = String(active.id);
  const dndState = getDndStateStore(host).getState();
  const dndChildrenState = getDndChildrenStore(host).getState();
  const dndSectionId = getDndSectionId(activeId);
  const oldParentId = getDndParentId(host, dndSectionId) ?? null;

  if (
    handleEmptyDragOverCollisions(host, collisions, {
      dndState,
      dndSectionId,
    })
  ) {
    return;
  }

  const snapshot = resolveDragOverSnapshot(host, over, collisions, dndState);
  if (!updateResolvedOverState(host, snapshot)) {
    return;
  }

  const leftDistOutcome = resolveLeftDistOutcome(host, {
    activeId,
    over,
    dndChildrenState,
    oldParentId,
    dndSectionId,
    collisions,
    calledFromOnDragMove,
    dndState,
  });
  if (leftDistOutcome === "handled") {
    return;
  }

  if (
    shouldThrottleRecentOver(calledFromOnDragMove, snapshot.overId, dndState)
  ) {
    setNullBehavior(host, snapshot.overId);
    return;
  }

  recordOverTime(host, snapshot.overId);

  if (handleNullOrSelfOver(host, snapshot.overId, dndSectionId)) {
    return;
  }

  maybeMoveToNewParent(host, {
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId: resolveOverNewParentId(host, snapshot.overId),
    dndChildrenState,
    collisions,
  });
}

function resolveOverNewParentId(
  host: WorkspaceHost,
  overId: string | number | null,
): string {
  return getDndParentId(host, String(overId)) ?? String(overId);
}

function maybeMoveToNewParent(
  host: WorkspaceHost,
  {
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
  }: ParentMoveArgs,
) {
  const context = resolveParentMoveContext(host, {
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
  });

  if (shouldRejectParentExitHover(context)) {
    setNullBehavior(host, context.overId);
    return;
  }
  if (!allowParentDrop(host, context)) {
    return;
  }
  if (restoreOnlyChildToParent(host, context)) {
    return;
  }
  if (shouldSuppressContainerHover(context)) {
    removeDndChild(host, context.dndSectionId);
    return;
  }

  moveTempSectionToParent(host, context);
  setNullBehavior(host, context.overId);
}

function leftDistBehavior(
  host: WorkspaceHost,
  {
    activeId,
    over,
    dndChildrenState,
    oldParentId,
    dndSectionId,
    collisions,
  }: Omit<ParentMoveArgs, "newParentId">,
): boolean {
  const overId = getOverId(host, over, collisions);
  const overIdKey = normalizeOverId(overId);
  if (!overIdKey || overIdKey === dndSectionId) {
    return true;
  }

  const behaviorDropType = getBehaviorDropType(host, activeId, overIdKey);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    setNullBehavior(host, overId);
    return false;
  }

  maybeMoveToNewParent(host, {
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId: overIdKey,
    dndChildrenState,
    collisions,
  });
  return true;
}

function scheduleTempReplacement(
  host: WorkspaceHost,
  activeId: string,
  draggingIds: Array<string>,
  dndState: DndStoreState,
) {
  if (!dndState.isMovingFree && !dndState.isSorting) {
    return;
  }

  manualDndChildrenReset(host);
  const runtime = getDropTypeRuntime(host);
  const frame = requestAnimationFrame(() => {
    runtime.tempReplacementFrames.delete(frame);
    if (!shouldReplaceDndSectionsWithTemp(host, activeId)) {
      return;
    }
    replaceDndSectionsWithTemp(host, activeId, draggingIds);
  });
  runtime.tempReplacementFrames.add(frame);
}

function shouldReplaceDndSectionsWithTemp(
  host: WorkspaceHost,
  activeId: string,
) {
  const latestState = getDndStateStore(host).getState();
  return (
    (latestState.isMovingFree || latestState.isSorting) &&
    latestState.activeId === activeId
  );
}

function resolveDragMoveUpdate(
  host: WorkspaceHost,
  {
    collisions,
    over,
    dndState,
  }: Pick<DragMoveEvent, "collisions" | "over"> & {
    dndState: DndStoreState;
  },
) {
  const resolvedTarget = resolveDragMoveTarget(host, collisions, over);
  const changeState = resolveDragMoveChangeState(
    host,
    resolvedTarget,
    dndState,
  );

  return {
    overCandidate: resolvedTarget.overCandidate,
    resolvedOverIdKey: resolvedTarget.resolvedOverIdKey,
    pastHalfway: resolvedTarget.pastHalfway,
    triggerDistCondition: resolvedTarget.triggerDistCondition,
    ...changeState,
  };
}

function resolveDragMoveTarget(
  host: WorkspaceHost,
  collisions: DragMoveEvent["collisions"],
  over: DragMoveEvent["over"],
) {
  const overCandidate = collisions?.[0] ?? over;
  const resolvedOverId = getOverId(host, overCandidate, collisions);
  return {
    overCandidate,
    overCandidateId: overCandidate ? String(overCandidate.id) : null,
    resolvedOverIdKey: normalizeOverId(resolvedOverId),
    pastHalfway: getOverCollisionPastHalfway(host, resolvedOverId, collisions),
    triggerDistCondition:
      getCollisionTriggerDistCondition(resolvedOverId, collisions) ?? false,
  };
}

function resolveDragMoveChangeState(
  host: WorkspaceHost,
  resolvedTarget: ReturnType<typeof resolveDragMoveTarget>,
  dndState: DndStoreState,
) {
  const lastPastHalfway = getCachedPastHalfway(
    host,
    resolvedTarget.resolvedOverIdKey,
  );
  const triggerDistChanged =
    resolvedTarget.triggerDistCondition !== dndState.triggerDistCondition;

  return {
    triggerDistChanged,
    overIdChanged:
      resolvedTarget.resolvedOverIdKey !== normalizeOverId(dndState.overId),
    shouldUpdateForTrigger: shouldUpdateDragMoveTrigger({
      currentOverId: dndState.overId,
      overCandidateId: resolvedTarget.overCandidateId,
      triggerDistChanged,
    }),
    shouldUpdateForPastHalfway: shouldUpdatePastHalfwayChange({
      currentOverId: dndState.overId,
      lastPastHalfway,
      pastHalfway: resolvedTarget.pastHalfway,
      resolvedOverIdKey: resolvedTarget.resolvedOverIdKey,
    }),
  };
}

function shouldUpdateDragMoveTrigger({
  currentOverId,
  overCandidateId,
  triggerDistChanged,
}: {
  currentOverId: string | null;
  overCandidateId: string | null;
  triggerDistChanged: boolean;
}) {
  return (
    triggerDistChanged &&
    overCandidateId !== null &&
    overCandidateId === currentOverId
  );
}

function shouldUpdatePastHalfwayChange({
  currentOverId,
  lastPastHalfway,
  pastHalfway,
  resolvedOverIdKey,
}: {
  currentOverId: string | null;
  lastPastHalfway: boolean | null;
  pastHalfway: boolean | null;
  resolvedOverIdKey: string | null;
}) {
  return (
    pastHalfway !== null &&
    lastPastHalfway !== null &&
    pastHalfway !== lastPastHalfway &&
    resolvedOverIdKey === currentOverId
  );
}

function shouldRunDragOverFromMove(
  update: ReturnType<typeof resolveDragMoveUpdate>,
) {
  return (
    update.shouldUpdateForTrigger ||
    update.shouldUpdateForPastHalfway ||
    update.overIdChanged
  );
}

function normalizeOverId(overId: string | number | null) {
  return overId === null ? null : String(overId);
}

function getCachedPastHalfway(host: WorkspaceHost, overIdKey: string | null) {
  const { lastPastHalfwayByOverId } = getDropTypeRuntime(host);
  if (
    overIdKey === null ||
    !Object.prototype.hasOwnProperty.call(lastPastHalfwayByOverId, overIdKey)
  ) {
    return null;
  }
  return lastPastHalfwayByOverId[overIdKey] ?? null;
}

function cachePastHalfway(
  host: WorkspaceHost,
  overIdKey: string | null,
  pastHalfway: boolean | null,
) {
  if (overIdKey === null || pastHalfway === null) {
    return;
  }
  getDropTypeRuntime(host).lastPastHalfwayByOverId[overIdKey] = pastHalfway;
}

function handleEmptyDragOverCollisions(
  host: WorkspaceHost,
  collisions: NonNullable<Collisions>,
  {
    dndState,
    dndSectionId,
  }: {
    dndState: DndStoreState;
    dndSectionId: string;
  },
) {
  if (collisions.length > 0) {
    return false;
  }
  if (!isResolvedOverStateIdle(host, dndState)) {
    const runtime = getDropTypeRuntime(host);
    runtime.lastResolvedOverId = null;
    runtime.lastResolvedPastHalfway = null;
    runtime.lastResolvedTriggerDistCondition = dndState.triggerDistCondition;
    removeDndChild(host, dndSectionId);
    setNullBehavior(host, null);
  }
  return true;
}

function isResolvedOverStateIdle(host: WorkspaceHost, dndState: DndStoreState) {
  const runtime = getDropTypeRuntime(host);
  return (
    runtime.lastResolvedOverId === null &&
    runtime.lastResolvedPastHalfway === null &&
    runtime.lastResolvedTriggerDistCondition ===
      dndState.triggerDistCondition &&
    dndState.overId === null &&
    dndState.behaviorDropType === null
  );
}

function resolveDragOverSnapshot(
  host: WorkspaceHost,
  over: { id: string | number } | null,
  collisions: Collisions,
  dndState: DndStoreState,
): ResolvedOverSnapshot {
  const overId = getOverId(host, over, collisions);
  return {
    overId,
    pastHalfway: getOverCollisionPastHalfway(host, overId, collisions),
    triggerDistCondition: dndState.triggerDistCondition,
  };
}

function updateResolvedOverState(
  host: WorkspaceHost,
  { overId, pastHalfway, triggerDistCondition }: ResolvedOverSnapshot,
) {
  const runtime = getDropTypeRuntime(host);
  if (
    overId === runtime.lastResolvedOverId &&
    pastHalfway === runtime.lastResolvedPastHalfway &&
    triggerDistCondition === runtime.lastResolvedTriggerDistCondition
  ) {
    return false;
  }

  runtime.lastResolvedOverId = overId;
  runtime.lastResolvedPastHalfway = pastHalfway;
  runtime.lastResolvedTriggerDistCondition = triggerDistCondition;
  return true;
}

function resolveLeftDistOutcome(
  host: WorkspaceHost,
  {
    activeId,
    over,
    dndChildrenState,
    oldParentId,
    dndSectionId,
    collisions,
    calledFromOnDragMove,
    dndState,
  }: Omit<ParentMoveArgs, "newParentId"> & {
    calledFromOnDragMove?: boolean;
    dndState: DndStoreState;
  },
): LeftDistOutcome {
  if (!dndState.triggerDistCondition) {
    return "continue";
  }
  if (calledFromOnDragMove) {
    return leftDistBehavior(host, {
      activeId,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    })
      ? "handled"
      : "ignored";
  }
  return leftDistBehavior(host, {
    activeId,
    over,
    dndChildrenState,
    oldParentId,
    dndSectionId,
    collisions,
  })
    ? "handled"
    : "continue";
}

function recordOverTime(host: WorkspaceHost, overId: string | number | null) {
  if (overId !== null) {
    setDndTime(host, overId);
  }
}

function shouldThrottleRecentOver(
  calledFromOnDragMove: boolean | undefined,
  overId: string | number | null,
  dndState: DndStoreState,
) {
  return (
    !calledFromOnDragMove &&
    overId !== null &&
    getTimeDiff(dndState, overId) < 100
  );
}

function handleNullOrSelfOver(
  host: WorkspaceHost,
  overId: string | number | null,
  dndSectionId: string,
) {
  if (overId === null) {
    removeDndChild(host, dndSectionId);
    setNullBehavior(host, null);
    return true;
  }
  if (dndSectionId !== overId) {
    return false;
  }
  setNullBehavior(host, overId);
  return true;
}

function resolveParentMoveContext(
  host: WorkspaceHost,
  {
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
  }: ParentMoveArgs,
): ParentMoveContext {
  const overId = getOverId(host, over, collisions);
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  return {
    activeId,
    dndSectionId,
    oldParentId,
    newParentId,
    overId,
    overIdKey: normalizeOverId(overId),
    newParentChildren,
    newParentNumChildren: getSectionChildren(
      getWorkspaceDocumentStore(host).getState(),
      newParentId,
    ).length,
    pastHalfway: getOverCollisionPastHalfway(host, overId, collisions) ?? false,
    tempInNewParent: newParentChildren.includes(dndSectionId),
  };
}

function shouldRejectParentExitHover({
  overIdKey,
  oldParentId,
  newParentId,
}: ParentMoveContext) {
  return (
    overIdKey !== null &&
    oldParentId !== null &&
    overIdKey === oldParentId &&
    newParentId !== oldParentId
  );
}

function allowParentDrop(
  host: WorkspaceHost,
  { activeId, dndSectionId, newParentId, overId }: ParentMoveContext,
) {
  const behaviorDropType = getBehaviorDropType(host, activeId, newParentId);
  if (behaviorDropType !== BehaviorDropTypeEnum.INVALID) {
    return true;
  }

  removeDndChild(host, dndSectionId);
  getDndStateStore(host).setState({
    behaviorDropType,
    overId: normalizeOverId(overId),
  });
  return false;
}

function restoreOnlyChildToParent(
  host: WorkspaceHost,
  {
    activeId,
    oldParentId,
    newParentId,
    dndSectionId,
    newParentNumChildren,
  }: ParentMoveContext,
) {
  if (
    newParentNumChildren !== 1 ||
    (getWorkspaceDocumentStore(host).getState().parentSectionMap[activeId] ??
      null) !== newParentId
  ) {
    return false;
  }
  addDndChild(host, oldParentId, newParentId, dndSectionId, 0);
  return true;
}

function shouldSuppressContainerHover({
  overId,
  newParentId,
  newParentNumChildren,
  tempInNewParent,
}: ParentMoveContext) {
  return (
    overId !== null &&
    String(overId) === newParentId &&
    newParentNumChildren > 0 &&
    !tempInNewParent
  );
}

function moveTempSectionToParent(
  host: WorkspaceHost,
  context: ParentMoveContext,
) {
  const overIndex =
    context.overIdKey === null
      ? -1
      : context.newParentChildren.indexOf(context.overIdKey);
  if (context.newParentId !== context.oldParentId) {
    addDndChild(
      host,
      context.oldParentId,
      context.newParentId,
      context.dndSectionId,
      resolveParentInsertionIndex(context, overIndex),
    );
    return;
  }
  maybeReorderWithinParent(host, context, overIndex);
}

function resolveParentInsertionIndex(
  context: ParentMoveContext,
  overIndex: number,
) {
  if (overIndex >= 0) {
    return context.pastHalfway ? overIndex + 1 : overIndex;
  }
  if (shouldInsertAtParentBoundary(context)) {
    return context.pastHalfway ? context.newParentChildren.length : 0;
  }
  return 0;
}

function shouldInsertAtParentBoundary({
  overId,
  newParentId,
  newParentChildren,
}: ParentMoveContext) {
  return (
    overId !== null &&
    String(overId) === newParentId &&
    newParentChildren.length > 0
  );
}

function maybeReorderWithinParent(
  host: WorkspaceHost,
  {
    oldParentId,
    newParentId,
    dndSectionId,
    overId,
    pastHalfway,
    newParentChildren,
  }: ParentMoveContext,
  overIndex: number,
) {
  const activeIndex = newParentChildren.indexOf(dndSectionId);
  if (activeIndex < 0 || overIndex < 0 || overId === dndSectionId) {
    return;
  }

  const nextIndex = computeNewIndex(
    activeIndex,
    overIndex,
    pastHalfway,
    newParentChildren.length,
  );
  if (nextIndex !== activeIndex) {
    addDndChild(host, oldParentId, newParentId, dndSectionId, nextIndex);
  }
}

function setNullBehavior(host: WorkspaceHost, overId: string | number | null) {
  const normalizedOverId = normalizeOverId(overId);
  const dndState = getDndStateStore(host).getState();
  if (
    dndState.behaviorDropType === null &&
    dndState.overId === normalizedOverId
  ) {
    return;
  }

  getDndStateStore(host).setState({
    behaviorDropType: null,
    overId: normalizedOverId,
  });
}

function getTimeDiff(state: DndStoreState, sectionId: string | number) {
  return Date.now() - (state.times[sectionId] ?? 0);
}

export function getDndParentId(host: WorkspaceHost, dndSectionId: string) {
  return getDndChildrenStore(host).getState().y[dndSectionId];
}

export function getBehaviorDropType(
  host: WorkspaceHost,
  activeId: string,
  newParentId: string,
) {
  const state = getWorkspaceDocumentStore(host).getState();
  const selectedIds = getSelectedDragIds(host, activeId);

  const newParent = getSectionOrThrow(state, newParentId);
  if (
    !selectedIds.every((selectedId) =>
      canWorkspaceSectionAcceptNestedSection(
        host,
        newParent,
        getSectionOrThrow(state, selectedId),
      ),
    )
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }
  if (
    isDescendantOfSectionSelection(state, newParentId, new Set(selectedIds))
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  return null;
}

function getSelectedDragIds(host: WorkspaceHost, activeId: string) {
  const draggingIds = getDndStateStore(host).getState().draggingIds;
  return draggingIds.length > 0 ? draggingIds : [String(activeId)];
}

export function getOverId(
  host: WorkspaceHost,
  over: { id: string | number } | null,
  collisions: DragOverEvent["collisions"] | null,
) {
  const fallbackId = over ? over.id : null;
  return resolveOverCollisionId(
    collisions,
    fallbackId,
    getDndChildrenStore(host).getState().y,
  );
}

function getOverCollisionPastHalfway(
  host: WorkspaceHost,
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId) {
    const matching = collisions.find((collision) => collision.id === overId);
    if (matching && matching.pastHalfway !== undefined) {
      return Boolean(matching.pastHalfway);
    }

    return getCachedPastHalfway(host, String(overId));
  }

  const overCollision = collisions[0];
  if (!overCollision || overCollision.pastHalfway === undefined) {
    return null;
  }

  return Boolean(overCollision.pastHalfway);
}
