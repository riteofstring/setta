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
  ZustandDndState,
} from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { useReactFlow } from "forks/xyflow/core/store";
import { addTemporaryNotification } from "state/actions/notifications";
import { manualDndChildrenReset } from "state/actions/sectionDisplayStructure";
import {
  getCurrSectionVariant,
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
  isBaseCodeSectionType,
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
import { useProjectState, useShareSession } from "state/definitions";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "./adapter";
import { computeNewIndex } from "./adapter";
import { resetSortingOverState } from "./sortingOverState";
let lastPastHalfwayByOverId: Record<string, boolean> = {};
let lastResolvedOverId: string | number | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;

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
  if (!active.data || !active.data.current) {
    return;
  }
  const activeId = String(active.id);
  const rawWidth = activeRect?.width ?? 0;
  const rawHeight = activeRect?.height ?? 0;
  const zoom = useReactFlow.getState().transform[2];
  const safeZoom = zoom > 0 ? zoom : 1;
  const dndState = useDndState.getState();
  const selection = resolveSectionDragSelection(activeId, activeRect ?? null);
  const placeholderSize = resolveSectionPlaceholderSize({
    draggingIds: selection.draggingIds,
    rectsById: selection.rectsById,
    zoom: safeZoom,
  });
  const normalizedWidth = placeholderSize?.width ?? rawWidth / safeZoom;
  const normalizedHeight = placeholderSize?.height ?? rawHeight / safeZoom;
  setActiveDnd(
    activeId,
    active.data.current.isTopLevel,
    normalizedWidth,
    normalizedHeight,
    activeRect,
  );
  useDndState.setState({
    draggingIds: selection.draggingIds,
    draggingRectsById: selection.draggingRectsById,
  });
  if (dndState.isMovingFree || dndState.isSorting) {
    manualDndChildrenReset();
    requestAnimationFrame(() => {
      const latestState = useDndState.getState();
      if (
        (!latestState.isMovingFree && !latestState.isSorting) ||
        latestState.activeId !== activeId
      ) {
        return;
      }
      replaceDndSectionsWithTemp(activeId, selection.draggingIds);
    });
  }
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
  const overCandidate = collisions?.[0] ?? over;
  const overCandidateId = overCandidate ? String(overCandidate.id) : null;
  const resolvedOverId = getOverId(overCandidate, collisions);
  const triggerDistCondition =
    getCollisionTriggerDistCondition(resolvedOverId, collisions) ?? false;
  const pastHalfway = getOverCollisionPastHalfway(resolvedOverId, collisions);
  const resolvedOverIdKey = resolvedOverId ? String(resolvedOverId) : null;
  const hasLastPastHalfway =
    resolvedOverIdKey !== null &&
    Object.prototype.hasOwnProperty.call(
      lastPastHalfwayByOverId,
      resolvedOverIdKey,
    );
  const lastPastHalfway = hasLastPastHalfway
    ? lastPastHalfwayByOverId[resolvedOverIdKey]
    : null;
  const dndStateOverIdKey = dndState.overId ? String(dndState.overId) : null;
  const pastHalfwayChanged =
    hasLastPastHalfway &&
    pastHalfway !== null &&
    pastHalfway !== lastPastHalfway;
  const triggerDistChanged =
    triggerDistCondition !== dndState.triggerDistCondition;
  const overIdChanged = resolvedOverIdKey !== dndStateOverIdKey;
  const shouldUpdateForTrigger =
    triggerDistChanged &&
    overCandidateId !== null &&
    overCandidateId === dndState.overId;
  const shouldUpdateForPastHalfway =
    pastHalfwayChanged &&
    resolvedOverIdKey &&
    resolvedOverIdKey === dndState.overId;

  if (triggerDistChanged) {
    useDndState.setState({ triggerDistCondition });
  }

  if (shouldUpdateForTrigger || shouldUpdateForPastHalfway || overIdChanged) {
    onDragOver({
      active,
      over: overCandidate,
      collisions,
      calledFromOnDragMove: true,
    });
  }

  if (resolvedOverIdKey && pastHalfway !== null) {
    lastPastHalfwayByOverId[resolvedOverIdKey] = pastHalfway;
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

  const dndState = useDndState.getState();
  const dndChildrenState = useDndChildren.getState();
  const dndSectionId = getDndSectionId(active.id);
  const oldParentId = getDndParentId(dndSectionId);

  // There can be discrepancy between over and collisions due to the way state updates in DndContext.
  // Collisions will be more up-to-date. If it's empty, reset relevant state and return early.
  if (collisions.length === 0) {
    if (
      lastResolvedOverId === null &&
      lastResolvedPastHalfway === null &&
      lastResolvedTriggerDistCondition === dndState.triggerDistCondition &&
      dndState.overId === null &&
      dndState.behaviorDropType === null
    ) {
      return;
    }

    lastResolvedOverId = null;
    lastResolvedPastHalfway = null;
    lastResolvedTriggerDistCondition = dndState.triggerDistCondition;
    removeDndChild(dndSectionId);
    setNullBehavior(null);
    return;
  }

  const overId = getOverId(over, collisions);
  const pastHalfway = getOverCollisionPastHalfway(overId, collisions);
  const triggerDistCondition = dndState.triggerDistCondition;

  if (
    overId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return;
  }

  lastResolvedOverId = overId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;

  let ignoredLeftDist = false;
  if (calledFromOnDragMove && dndState.triggerDistCondition) {
    const handledLeftDist = leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    });
    if (handledLeftDist) {
      return;
    }
    ignoredLeftDist = true;
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

  if (dndState.triggerDistCondition && !ignoredLeftDist) {
    const handledLeftDist = leftDistBehavior({
      active,
      over,
      dndChildrenState,
      oldParentId,
      dndSectionId,
      collisions,
    });
    if (handledLeftDist) {
      return;
    }
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
  const overId = getOverId(over, collisions);
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  const pastHalfway = getOverCollisionPastHalfway(overId, collisions) ?? false;
  const overIdKey = overId ? String(overId) : null;
  const tempInNewParent = newParentChildren.includes(dndSectionId);

  if (
    overIdKey &&
    oldParentId &&
    overIdKey === oldParentId &&
    newParentId !== oldParentId
  ) {
    setNullBehavior(overId);
    return;
  }

  // Check if section can actually be dropped onto newParentId
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

  // Prevent flicker when dragging over a container with existing children.
  if (
    overId !== null &&
    String(overId) === newParentId &&
    newParentNumChildren > 0 &&
    !tempInNewParent
  ) {
    removeDndChild(dndSectionId);
    return;
  }

  const overIndex = newParentChildren.indexOf(overId);

  // Check if the temporary section has a new parent
  if (newParentId !== oldParentId) {
    let index = 0;
    if (overIndex >= 0) {
      index = pastHalfway ? overIndex + 1 : overIndex;
    } else if (
      overId !== null &&
      String(overId) === newParentId &&
      newParentChildren.length > 0
    ) {
      index = pastHalfway ? newParentChildren.length : 0;
    }
    addDndChild(oldParentId, newParentId, dndSectionId, index);
  } else {
    const activeIndex = newParentChildren.indexOf(dndSectionId);
    if (activeIndex >= 0 && overIndex >= 0 && overId !== dndSectionId) {
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
}): boolean {
  const overId = getOverId(over, collisions);
  const overIdKey = overId ? String(overId) : null;
  if (!overIdKey || overIdKey === dndSectionId) {
    return true;
  }

  const behaviorDropType = getBehaviorDropType(active.id, overIdKey);
  if (behaviorDropType === BehaviorDropTypeEnum.INVALID) {
    // Ignore left-dist when the hovered section can't be a parent.
    setNullBehavior(overId);
    return false;
  }

  // Consider overId to be the new parent, if it's not the temp section.
  maybeMoveToNewParent({
    active,
    over,
    dndSectionId,
    oldParentId,
    newParentId: overIdKey,
    dndChildrenState,
    collisions,
  });
  return true;
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

function getTimeDiff(state, sectionId) {
  return Date.now() - (state.times[sectionId] ?? 0);
}

export function getDndParentId(dndSectionId: string) {
  return useDndChildren.getState().y[dndSectionId];
}

export function getBehaviorDropType(activeId: string, newParentId: string) {
  const state = useProjectState.getState();
  const parentType = getSectionType(state, newParentId);
  const isCodeParent = isBaseCodeSectionType(parentType);
  const isRootParent = getIsRoot(parentType);
  const draggingIds = useDndState.getState().draggingIds;
  const selectedIds = draggingIds.length > 0 ? draggingIds : [String(activeId)];
  const activeType = getSectionType(state, String(activeId));
  const hasTopLevelOnlySection = selectedIds.some((sectionId) =>
    getIsTopLevelOnlySectionType(getSectionType(state, sectionId)),
  );
  // invalid
  // if parent can't have children
  // or if parent variant is frozen
  // or if dragged section is global variables (TODO: loosen this restriction)
  if (
    (!isRootParent && !isCodeParent) ||
    getCurrSectionVariant(state, newParentId).isFrozen ||
    getSectionIsGlobalVariables(activeId) ||
    hasTopLevelOnlySection
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  if (isCodeParent) {
    if (activeType !== SectionTypeEnum.Terminal) {
      return BehaviorDropTypeEnum.INVALID;
    }
    if (selectedIds.length !== 1) {
      return BehaviorDropTypeEnum.INVALID;
    }
    const children = getSectionChildren(state, newParentId);
    if (children.length > 1) {
      return BehaviorDropTypeEnum.INVALID;
    }
    if (children.length === 1 && !selectedIds.includes(children[0])) {
      return BehaviorDropTypeEnum.INVALID;
    }
  }
  if (
    isDescendantOfSectionSelection(state, newParentId, new Set(selectedIds))
  ) {
    return BehaviorDropTypeEnum.INVALID;
  }

  return null;
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

function getSectionIsRoot(sectionId: string) {
  return getIsRoot(getSectionType(useProjectState.getState(), sectionId));
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
  const parentId =
    getSharedParentId(state, draggingIds) ??
    state.parentSectionMap[draggingIds[0]] ??
    null;
  const orientation = resolveParentOrientation(parentId);

  const children = parentId ? getSectionChildren(state, parentId) : null;
  const indexById = children
    ? new Map(children.map((childId, index) => [childId, index]))
    : null;
  const size = accumulateSectionSizes({
    draggingIds,
    rectsById,
    orientation,
    indexById,
  });

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
