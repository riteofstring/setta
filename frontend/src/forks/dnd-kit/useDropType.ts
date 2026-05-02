import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";
import {
  addDndChild,
  removeDndChild,
  replaceDndSectionsWithTemp,
  useDndChildren,
} from "forks/dnd-kit/dndChildren";
import {
  getDndSectionId,
  setActiveDnd,
  setDndTime,
  useDndState,
} from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { getZoom } from "gpuFlow/viewportActions";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getCurrSectionVariant,
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
  isBaseCodeSectionType,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import {
  getRootSelectedSectionIds,
  getSharedParentId,
  isDescendantOfSectionSelection,
  orderSectionIdsByParent,
} from "state/actions/sections/sectionSelection";
import {
  getIsRoot,
  getIsTopLevelOnlySectionType,
} from "state/actions/uiTypes/utils";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useProjectState,
  useSectionRefs,
  useShareSession,
} from "state/definitions";
import {
  isBaseParentSectionImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import { resetSortingOverState } from "./sortingOverState";
let lastPastHalfwayByOverId: Record<string, boolean> = {};
let lastResolvedOverId: string | number | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;

type DndStoreState = ReturnType<typeof useDndState.getState>;
type DndChildrenState = ReturnType<typeof useDndChildren.getState>;
type Collisions = DragOverEvent["collisions"];
type ResolvedOverSnapshot = {
  overId: string | number | null;
  pastHalfway: boolean | null;
  triggerDistCondition: boolean;
};
type LeftDistOutcome = "continue" | "handled" | "ignored";
type ParentMoveArgs = {
  activeId: string;
  over: DragOverEvent["over"];
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
  newParentAcceptsChildren: boolean;
  newParentChildren: string[];
  newParentNumChildren: number;
  pastHalfway: boolean;
  tempInNewParent: boolean;
};

function getCollisionTriggerDistCondition(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId !== null) {
    const matching = collisions.find(
      (collision) => String(collision.id) === String(overId),
    );
    if (matching && matching.triggerDistCondition !== undefined) {
      return Boolean(matching.triggerDistCondition);
    }
  }

  const fallback = collisions[0]?.triggerDistCondition;
  if (fallback === undefined) {
    return null;
  }

  return Boolean(fallback);
}

function resetLastPastHalfwayByOverId() {
  lastPastHalfwayByOverId = {};
}

function resetLastResolvedOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
}

export function onDragStart({ active, activeRect }: DragStartEvent) {
  resetLastPastHalfwayByOverId();
  resetLastResolvedOverState();
  resetSortingOverState();
  const activeData = active.data?.current;
  if (!activeData) {
    return;
  }
  const activeId = String(active.id);
  const dndState = useDndState.getState();
  const { selection, normalizedWidth, normalizedHeight } =
    resolveDragStartLayout(activeId, activeRect ?? null);
  setActiveDnd(
    activeId,
    activeData.isTopLevel,
    normalizedWidth,
    normalizedHeight,
    activeRect,
  );
  useDndState.setState({
    draggingIds: selection.draggingIds,
    draggingRectsById: selection.draggingRectsById,
  });
  scheduleTempReplacement(activeId, selection.draggingIds, dndState);
}

export function useOnDragMove() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  if (isMovingFree) {
    return onDragMove;
  }
  return () => {};
}

function onDragMove({ active, collisions, over }: DragMoveEvent) {
  const dndState = useDndState.getState();
  const update = resolveDragMoveUpdate({ collisions, over, dndState });

  if (update.triggerDistChanged) {
    useDndState.setState({ triggerDistCondition: update.triggerDistCondition });
  }

  if (shouldRunDragOverFromMove(update)) {
    onDragOver({
      active,
      over: update.overCandidate,
      collisions,
      calledFromOnDragMove: true,
    });
  }

  cachePastHalfway(update.resolvedOverIdKey, update.pastHalfway);
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

  const activeId = String(active.id);
  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(activeId);
  const oldParentId = getDndParentId(dndSectionId) ?? null;

  if (
    handleEmptyDragOverCollisions(collisions, {
      dndState,
      dndSectionId,
    })
  ) {
    return;
  }

  const snapshot = resolveDragOverSnapshot(over, collisions, dndState);
  if (!updateResolvedOverState(snapshot)) {
    return;
  }

  const leftDistOutcome = resolveLeftDistOutcome({
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
    setNullBehavior(snapshot.overId);
    return;
  }

  setDndTime(snapshot.overId);

  if (handleNullOrSelfOver(snapshot.overId, dndSectionId)) {
    return;
  }

  maybeMoveToNewParent({
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId:
      getDndParentId(String(snapshot.overId)) ?? String(snapshot.overId),
    dndChildrenState,
    collisions,
  });
}

function maybeMoveToNewParent({
  activeId,
  over,
  dndSectionId,
  oldParentId,
  newParentId,
  dndChildrenState,
  collisions,
}: ParentMoveArgs) {
  const context = resolveParentMoveContext({
    activeId,
    over,
    dndSectionId,
    oldParentId,
    newParentId,
    dndChildrenState,
    collisions,
  });

  if (shouldRejectParentExitHover(context)) {
    setNullBehavior(context.overId);
    return;
  }
  if (!allowParentDrop(context)) {
    return;
  }
  if (restoreOnlyChildToParent(context)) {
    return;
  }
  if (shouldSuppressContainerHover(context)) {
    removeDndChild(context.dndSectionId);
    return;
  }

  moveTempSectionToParent(context);
  setNullBehavior(context.overId);
}

function leftDistBehavior({
  activeId,
  over,
  dndChildrenState,
  oldParentId,
  dndSectionId,
  collisions,
}: Omit<ParentMoveArgs, "newParentId">): boolean {
  const overId = getOverId(over, collisions);
  const overIdKey = normalizeOverId(overId);
  if (!overIdKey || overIdKey === dndSectionId) {
    return true;
  }

  const behaviorDropType = getBehaviorDropType(activeId, overIdKey);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    setNullBehavior(overId);
    return false;
  }

  maybeMoveToNewParent({
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

function resolveDragStartLayout(
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
) {
  const selection = resolveSectionDragSelection(activeId, activeRect);
  const safeZoom = resolveSafeZoom();
  const placeholderSize = resolveSectionPlaceholderSize({
    draggingIds: selection.draggingIds,
    rectsById: selection.rectsById,
    zoom: safeZoom,
  });

  return {
    selection,
    normalizedWidth:
      placeholderSize?.width ?? (activeRect?.width ?? 0) / safeZoom,
    normalizedHeight:
      placeholderSize?.height ?? (activeRect?.height ?? 0) / safeZoom,
  };
}

function resolveSafeZoom() {
  const zoom = getZoom();
  return zoom > 0 ? zoom : 1;
}

function scheduleTempReplacement(
  activeId: string,
  draggingIds: string[],
  dndState: DndStoreState,
) {
  if (!dndState.isMovingFree && !dndState.isSorting) {
    return;
  }

  manualDndChildrenReset();
  requestAnimationFrame(() => {
    if (!shouldReplaceDndSectionsWithTemp(activeId)) {
      return;
    }
    replaceDndSectionsWithTemp(activeId, draggingIds);
  });
}

function shouldReplaceDndSectionsWithTemp(activeId: string) {
  const latestState = useDndState.getState();
  return (
    (latestState.isMovingFree || latestState.isSorting) &&
    latestState.activeId === activeId
  );
}

function resolveDragMoveUpdate({
  collisions,
  over,
  dndState,
}: Pick<DragMoveEvent, "collisions" | "over"> & {
  dndState: DndStoreState;
}) {
  const resolvedTarget = resolveDragMoveTarget(collisions, over);
  const changeState = resolveDragMoveChangeState(resolvedTarget, dndState);

  return {
    overCandidate: resolvedTarget.overCandidate,
    resolvedOverIdKey: resolvedTarget.resolvedOverIdKey,
    pastHalfway: resolvedTarget.pastHalfway,
    triggerDistCondition: resolvedTarget.triggerDistCondition,
    ...changeState,
  };
}

function resolveDragMoveTarget(
  collisions: DragMoveEvent["collisions"],
  over: DragMoveEvent["over"],
) {
  const overCandidate = collisions?.[0] ?? over;
  const resolvedOverId = getOverId(overCandidate, collisions);
  return {
    overCandidate,
    overCandidateId: overCandidate ? String(overCandidate.id) : null,
    resolvedOverIdKey: normalizeOverId(resolvedOverId),
    pastHalfway: getOverCollisionPastHalfway(resolvedOverId, collisions),
    triggerDistCondition:
      getCollisionTriggerDistCondition(resolvedOverId, collisions) ?? false,
  };
}

function resolveDragMoveChangeState(
  resolvedTarget: ReturnType<typeof resolveDragMoveTarget>,
  dndState: DndStoreState,
) {
  const lastPastHalfway = getCachedPastHalfway(
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
  currentOverId: string | number | null;
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
  currentOverId: string | number | null;
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

function getCachedPastHalfway(overIdKey: string | null) {
  if (
    overIdKey === null ||
    !Object.prototype.hasOwnProperty.call(lastPastHalfwayByOverId, overIdKey)
  ) {
    return null;
  }
  return lastPastHalfwayByOverId[overIdKey];
}

function cachePastHalfway(
  overIdKey: string | null,
  pastHalfway: boolean | null,
) {
  if (overIdKey === null || pastHalfway === null) {
    return;
  }
  lastPastHalfwayByOverId[overIdKey] = pastHalfway;
}

function handleEmptyDragOverCollisions(
  collisions: Collisions,
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
  if (!isResolvedOverStateIdle(dndState)) {
    lastResolvedOverId = null;
    lastResolvedPastHalfway = null;
    lastResolvedTriggerDistCondition = dndState.triggerDistCondition;
    removeDndChild(dndSectionId);
    setNullBehavior(null);
  }
  return true;
}

function isResolvedOverStateIdle(dndState: DndStoreState) {
  return (
    lastResolvedOverId === null &&
    lastResolvedPastHalfway === null &&
    lastResolvedTriggerDistCondition === dndState.triggerDistCondition &&
    dndState.overId === null &&
    dndState.behaviorDropType === null
  );
}

function resolveDragOverSnapshot(
  over: DragOverEvent["over"],
  collisions: Collisions,
  dndState: DndStoreState,
): ResolvedOverSnapshot {
  const overId = getOverId(over, collisions);
  return {
    overId,
    pastHalfway: getOverCollisionPastHalfway(overId, collisions),
    triggerDistCondition: dndState.triggerDistCondition,
  };
}

function updateResolvedOverState({
  overId,
  pastHalfway,
  triggerDistCondition,
}: ResolvedOverSnapshot) {
  if (
    overId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return false;
  }

  lastResolvedOverId = overId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;
  return true;
}

function resolveLeftDistOutcome({
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
}): LeftDistOutcome {
  if (!dndState.triggerDistCondition) {
    return "continue";
  }
  if (calledFromOnDragMove) {
    return leftDistBehavior({
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
  return leftDistBehavior({
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
  overId: string | number | null,
  dndSectionId: string,
) {
  if (overId === null) {
    removeDndChild(dndSectionId);
    setNullBehavior(null);
    return true;
  }
  if (dndSectionId !== overId) {
    return false;
  }
  setNullBehavior(overId);
  return true;
}

function resolveParentMoveContext({
  activeId,
  over,
  dndSectionId,
  oldParentId,
  newParentId,
  dndChildrenState,
  collisions,
}: ParentMoveArgs): ParentMoveContext {
  const overId = getOverId(over, collisions);
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  const newParentChildCount = getDndParentSectionChildCount(
    useProjectState.getState(),
    newParentId,
  );
  return {
    activeId,
    dndSectionId,
    oldParentId,
    newParentId,
    overId,
    overIdKey: normalizeOverId(overId),
    newParentAcceptsChildren: newParentChildCount !== null,
    newParentChildren,
    newParentNumChildren: newParentChildCount ?? 0,
    pastHalfway: getOverCollisionPastHalfway(overId, collisions) ?? false,
    tempInNewParent: newParentChildren.includes(dndSectionId),
  };
}

export function getDndParentSectionChildCount(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): number | null {
  const parentImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    state,
    sectionId,
    isBaseParentSectionImpl,
  );
  return parentImpl?.children.length ?? null;
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

function allowParentDrop({
  activeId,
  dndSectionId,
  newParentAcceptsChildren,
  newParentId,
  overId,
}: ParentMoveContext) {
  if (!newParentAcceptsChildren) {
    removeDndChild(dndSectionId);
    useDndState.setState({
      behaviorDropType: BehaviorDropTypeEnum.INVALID,
      overId,
    });
    return false;
  }

  const behaviorDropType = getBehaviorDropType(activeId, newParentId);
  if (behaviorDropType !== BehaviorDropTypeEnum.INVALID) {
    return true;
  }

  removeDndChild(dndSectionId);
  useDndState.setState({ behaviorDropType, overId });
  return false;
}

function restoreOnlyChildToParent({
  activeId,
  oldParentId,
  newParentId,
  dndSectionId,
  newParentNumChildren,
}: ParentMoveContext) {
  if (
    newParentNumChildren !== 1 ||
    useProjectState.getState().parentSectionMap[activeId] !== newParentId
  ) {
    return false;
  }
  addDndChild(oldParentId, newParentId, dndSectionId, 0);
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

function moveTempSectionToParent(context: ParentMoveContext) {
  const overIndex = context.newParentChildren.indexOf(context.overId);
  if (context.newParentId !== context.oldParentId) {
    addDndChild(
      context.oldParentId,
      context.newParentId,
      context.dndSectionId,
      resolveParentInsertionIndex(context, overIndex),
    );
    return;
  }
  maybeReorderWithinParent(context, overIndex);
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
    addDndChild(oldParentId, newParentId, dndSectionId, nextIndex);
  }
}

function setNullBehavior(overId) {
  const dndState = useDndState.getState();
  if (dndState.behaviorDropType === null && dndState.overId === overId) {
    return;
  }

  useDndState.setState({
    behaviorDropType: null,
    overId,
  });
}

function getTimeDiff(state: DndStoreState, sectionId: string | number) {
  return Date.now() - (state.times[sectionId] ?? 0);
}

export function getDndParentId(dndSectionId: string) {
  return useDndChildren.getState().y[dndSectionId];
}

export function getBehaviorDropType(activeId: string, newParentId: string) {
  const state = useProjectState.getState();
  const parentType = getSectionType(state, newParentId);
  const isCodeParent = isBaseCodeSectionType(parentType);
  const selectedIds = getSelectedDragIds(activeId);

  if (
    hasInvalidParentConstraints(
      state,
      newParentId,
      parentType,
      activeId,
      selectedIds,
    )
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  if (
    isCodeParent &&
    hasInvalidCodeParentConstraints(state, newParentId, activeId, selectedIds)
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

function getSelectedDragIds(activeId: string) {
  const draggingIds = useDndState.getState().draggingIds;
  return draggingIds.length > 0 ? draggingIds : [String(activeId)];
}

function hasInvalidParentConstraints(
  state: ReturnType<typeof useProjectState.getState>,
  newParentId: string,
  parentType: SectionTypeEnum,
  activeId: string,
  selectedIds: string[],
) {
  return (
    (!getIsRoot(parentType) && !isBaseCodeSectionType(parentType)) ||
    getCurrSectionVariant(state, newParentId).isFrozen ||
    getSectionIsGlobalVariables(activeId) ||
    selectedIds.some((sectionId) =>
      getIsTopLevelOnlySectionType(getSectionType(state, sectionId)),
    )
  );
}

function hasInvalidCodeParentConstraints(
  state: ReturnType<typeof useProjectState.getState>,
  newParentId: string,
  activeId: string,
  selectedIds: string[],
) {
  if (getSectionType(state, String(activeId)) !== SectionTypeEnum.Terminal) {
    return true;
  }
  if (selectedIds.length !== 1) {
    return true;
  }

  const children = getSectionChildren(state, newParentId);
  return (
    children.length > 1 ||
    (children.length === 1 && !selectedIds.includes(children[0]))
  );
}

export function getOverId(
  over: { id: string | number } | null,
  collisions: DragOverEvent["collisions"] | null,
) {
  const fallbackId = over ? over.id : null;
  return resolveOverCollisionId(collisions, fallbackId);
}

function getOverCollisionPastHalfway(
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

    const overIdKey = String(overId);
    const hasLastPastHalfway = Object.prototype.hasOwnProperty.call(
      lastPastHalfwayByOverId,
      overIdKey,
    );
    if (hasLastPastHalfway) {
      return lastPastHalfwayByOverId[overIdKey];
    }
    return null;
  }

  const overCollision = collisions[0];
  if (!overCollision || overCollision.pastHalfway === undefined) {
    return null;
  }

  return Boolean(overCollision.pastHalfway);
}

function getSectionIsGlobalVariables(sectionId: string) {
  return (
    useProjectState.getState().singletonSections.GlobalVariables === sectionId
  );
}

type DragRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PlaceholderSize = {
  width: number;
  height: number;
};

type PlaceholderSizeInput = {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  zoom: number;
};

type SectionOrientation = "horizontal" | "vertical";

function resolveSectionPlaceholderSize({
  draggingIds,
  rectsById,
  zoom,
}: PlaceholderSizeInput): PlaceholderSize | null {
  if (draggingIds.length === 0 || !rectsById) {
    return null;
  }

  const state = useProjectState.getState();
  const { indexById, orientation } = resolvePlaceholderLayout(
    state,
    draggingIds,
  );
  const size = accumulateSectionSizes({
    draggingIds,
    rectsById,
    orientation,
    indexById,
  });

  return scalePlaceholderSize(size, zoom);
}

function resolvePlaceholderLayout(
  state: ReturnType<typeof useProjectState.getState>,
  draggingIds: string[],
) {
  const parentId = resolvePlaceholderParentId(state, draggingIds);
  const children = parentId ? getSectionChildren(state, parentId) : null;
  return {
    indexById: children ? buildChildIndexMap(children) : null,
    orientation: resolveParentOrientation(parentId),
  };
}

function resolvePlaceholderParentId(
  state: ReturnType<typeof useProjectState.getState>,
  draggingIds: string[],
) {
  return (
    getSharedParentId(state, draggingIds) ??
    state.parentSectionMap[draggingIds[0]] ??
    null
  );
}

function buildChildIndexMap(children: string[]) {
  return new Map(children.map((childId, index) => [childId, index]));
}

function scalePlaceholderSize(
  size: PlaceholderSize,
  zoom: number,
): PlaceholderSize | null {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    width: size.width / safeZoom,
    height: size.height / safeZoom,
  };
}

function resolveParentOrientation(parentId: string | null): SectionOrientation {
  if (!parentId) {
    return "vertical";
  }
  if (getSectionIsHorizontalOrientation(parentId)) {
    return "horizontal";
  }
  return "vertical";
}

function collectSectionRects({
  activeId,
  activeRect,
  draggingIds,
}: {
  activeId: string;
  activeRect: DragStartEvent["activeRect"] | null;
  draggingIds: string[];
}): Record<string, DragRect> | null {
  const refs = useSectionRefs.getState();
  const rectsById: Record<string, DragRect> = {};

  for (const sectionId of draggingIds) {
    const ref = refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
    if (ref) {
      const rect = ref.getBoundingClientRect();
      rectsById[sectionId] = {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
      continue;
    }

    if (sectionId === activeId && activeRect) {
      rectsById[sectionId] = { ...activeRect };
    }
  }

  if (Object.keys(rectsById).length === 0) {
    return null;
  }
  return rectsById;
}

function accumulateSectionSizes({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: string[];
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number> | null;
}): PlaceholderSize {
  let width = 0;
  let height = 0;

  for (const sectionId of draggingIds) {
    const rect = rectsById[sectionId];
    if (!rect) {
      continue;
    }
    if (orientation === "horizontal") {
      width += rect.width;
      height = Math.max(height, rect.height);
    } else {
      width = Math.max(width, rect.width);
      height += rect.height;
    }
  }

  if (indexById) {
    const gapTotal = resolveAdjacentGapTotal({
      draggingIds,
      rectsById,
      orientation,
      indexById,
    });
    if (orientation === "horizontal") {
      width += gapTotal;
    } else {
      height += gapTotal;
    }
  }

  return { width, height };
}

function resolveAdjacentGapTotal({
  draggingIds,
  rectsById,
  orientation,
  indexById,
}: {
  draggingIds: string[];
  rectsById: Record<string, DragRect>;
  orientation: SectionOrientation;
  indexById: Map<string, number>;
}): number {
  let gapTotal = 0;

  for (let i = 0; i < draggingIds.length - 1; i += 1) {
    const currentId = draggingIds[i];
    const nextId = draggingIds[i + 1];
    const currentIndex = indexById.get(currentId);
    const nextIndex = indexById.get(nextId);
    if (
      currentIndex === undefined ||
      nextIndex === undefined ||
      nextIndex !== currentIndex + 1
    ) {
      continue;
    }

    const currentRect = rectsById[currentId];
    const nextRect = rectsById[nextId];
    if (!currentRect || !nextRect) {
      continue;
    }

    const gap =
      orientation === "horizontal"
        ? nextRect.left - (currentRect.left + currentRect.width)
        : nextRect.top - (currentRect.top + currentRect.height);
    if (gap > 0) {
      gapTotal += gap;
    }
  }

  return gapTotal;
}

function resolveSectionDragSelection(
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  draggingRectsById: Record<string, DragRect> | null;
} {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const state = useProjectState.getState();
  const activeIds = getActiveSectionUIIds();
  if (!activeIds.includes(activeId)) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const { rootIds } = getRootSelectedSectionIds(state, activeIds);
  if (rootIds.length === 0) {
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const sharedParentId = getSharedParentId(state, rootIds);
  if (rootIds.length > 1 && sharedParentId === undefined) {
    addTemporaryNotification("Section selection spans multiple parents.");
    return buildSectionSelection([activeId], activeId, activeRect);
  }

  const orderedIds = orderSectionIdsByParent(
    state,
    sharedParentId ?? null,
    rootIds,
  );
  return buildSectionSelection(orderedIds, activeId, activeRect);
}

function buildSectionSelection(
  draggingIds: string[],
  activeId: string,
  activeRect: DragStartEvent["activeRect"] | null,
): {
  draggingIds: string[];
  rectsById: Record<string, DragRect> | null;
  draggingRectsById: Record<string, DragRect> | null;
} {
  const rectsById = collectSectionRects({
    activeId,
    activeRect,
    draggingIds,
  });
  return {
    draggingIds,
    rectsById,
    draggingRectsById: resolveDraggingRectsForSelection(rectsById),
  };
}

function resolveDraggingRectsForSelection(
  rectsById: Record<string, DragRect> | null,
): Record<string, DragRect> | null {
  const dndState = useDndState.getState();
  if (!dndState.isMovingFree || !rectsById) {
    return null;
  }
  return rectsById;
}
