import { arrayMove } from "@dnd-kit/helpers";
import type { DragEndEvent, SettaCollision } from "forks/dnd-kit/adapter";
import {
  DRAFT_THREAD_ENTRY_ID,
  getGroupIdFromThreadSectionDropTargetId,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  GROUP_DRAG_RELEASE_THRESHOLD_PX,
  normalizeUniqueThreadIds,
  parseThreadDropTargetId,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ThreadDropPlacement,
  type ThreadDropTarget,
  type ThreadGroupSection,
  type ThreadPinDomain,
} from "./projectChatHistoryShared";

type PointerCoordinates = { x: number; y: number };

type ProjectChatDragEndOutcome =
  | { kind: "noop" }
  | {
      kind: "move-thread";
      sourceThreadId: string;
      dropTarget: ThreadDropTarget;
    }
  | {
      kind: "reorder-groups";
      nextOrderedGroupIds: Array<string>;
      sourceGroupPinned: boolean;
    };

export function getPointerClientPoint(
  activatorEvent: Event | null,
): PointerCoordinates | null {
  if (!activatorEvent) {
    return null;
  }
  const mouseLike = activatorEvent as Event & {
    clientX?: number;
    clientY?: number;
  };
  if (typeof mouseLike.clientX === "number") {
    return { x: mouseLike.clientX, y: mouseLike.clientY ?? 0 };
  }
  const touchLike = activatorEvent as TouchEvent;
  const touch = touchLike.touches?.[0] ?? touchLike.changedTouches?.[0] ?? null;
  if (!touch) {
    return null;
  }
  return { x: touch.clientX, y: touch.clientY };
}

export function resolveProjectChatDragEndOutcome({
  event,
  groupIdSet,
  groupSections,
  latestThreadDropTarget,
  pinnedSortableGroupIds,
  pinnedThreadIdsSet,
  pointerCurrent,
  pointerGroupId,
  pointerStart,
  threadGroupById,
  threadPinnedById,
  unpinnedSortableGroupIds,
}: {
  event: DragEndEvent;
  groupIdSet: Set<string>;
  groupSections: Array<ThreadGroupSection>;
  latestThreadDropTarget: ThreadDropTarget | null;
  pinnedSortableGroupIds: Array<string>;
  pinnedThreadIdsSet: Set<string>;
  pointerCurrent: PointerCoordinates | null;
  pointerGroupId: string | null;
  pointerStart: PointerCoordinates | null;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
  unpinnedSortableGroupIds: Array<string>;
}): ProjectChatDragEndOutcome {
  const activeId = String(event.active.id);
  const sourceThreadId = getThreadIdFromDndId(activeId);
  if (sourceThreadId !== null) {
    return resolveThreadDragEndOutcome({
      event,
      groupIdSet,
      latestThreadDropTarget,
      pinnedThreadIdsSet,
      pointerGroupId,
      sourceThreadId,
      threadGroupById,
      threadPinnedById,
    });
  }
  return resolveGroupDragEndOutcome({
    activeId,
    event,
    groupIdSet,
    groupSections,
    pinnedSortableGroupIds,
    pointerCurrent,
    pointerGroupId,
    pointerStart,
    unpinnedSortableGroupIds,
  });
}

export function resolveThreadDropTarget({
  event,
  sourceThreadId,
  groupIdSet,
  threadGroupById,
  threadPinnedById,
}: {
  event: DragEndEvent;
  sourceThreadId: string;
  groupIdSet: Set<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ThreadDropTarget | null {
  const sourceThreadPinned = threadPinnedById.get(sourceThreadId) ?? false;
  const sourcePinDomain = getThreadPinDomain(sourceThreadPinned);
  const candidateIds = collectCandidateIds(event);
  const overTarget = resolveOverThreadDropTarget({
    event,
    groupIdSet,
    sourcePinDomain,
    sourceThreadId,
    sourceThreadPinned,
    threadGroupById,
    threadPinnedById,
  });
  if (overTarget !== undefined) {
    return overTarget;
  }

  const dropZoneTarget = resolveCandidateDropZoneTarget({
    candidateIds,
    groupIdSet,
    sourcePinDomain,
  });
  if (dropZoneTarget) {
    return dropZoneTarget;
  }

  const threadTarget = resolveCandidateThreadDropTarget({
    candidateIds,
    event,
    sourceThreadId,
    sourceThreadPinned,
    threadGroupById,
    threadPinnedById,
  });
  if (threadTarget) {
    return threadTarget;
  }

  return resolveCandidateGroupDropTarget({
    candidateIds,
    groupIdSet,
    sourcePinDomain,
  });
}

function resolveNextGroupOrderFromDrag({
  event,
  sourceGroupId,
  orderedGroupIds,
  groupIdSet,
}: {
  event: DragEndEvent;
  sourceGroupId: string;
  orderedGroupIds: Array<string>;
  groupIdSet: Set<string>;
}): Array<string> | null {
  if (isDragReleaseWithinThreshold(event.delta)) {
    return null;
  }
  const sourceIndex = orderedGroupIds.indexOf(sourceGroupId);
  if (sourceIndex < 0) {
    return null;
  }
  const overGroupId = resolveGroupDropOverId({
    event,
    sourceGroupId,
    groupIdSet,
  });
  if (!overGroupId) {
    return null;
  }
  const overIndex = orderedGroupIds.indexOf(overGroupId);
  if (overIndex < 0 || overIndex === sourceIndex) {
    return null;
  }
  if (!isGroupReorderDirectionValid(event.delta.y, sourceIndex, overIndex)) {
    return null;
  }
  const nextGroupOrder = arrayMove(orderedGroupIds, sourceIndex, overIndex);
  return isSameGroupOrder(nextGroupOrder, orderedGroupIds)
    ? null
    : nextGroupOrder;
}

export function resolveGroupIdFromPointerPosition({
  pointerCurrent,
  pointerStart,
  delta,
  groupIdSet,
}: {
  pointerCurrent: PointerCoordinates | null;
  pointerStart: PointerCoordinates | null;
  delta: { x: number; y: number };
  groupIdSet: Set<string>;
}): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const resolvedPointer = resolvePointerLocation({
    pointerCurrent,
    pointerStart,
    delta,
  });
  if (!resolvedPointer) {
    return null;
  }
  for (const element of getElementsAtPoint(resolvedPointer)) {
    const groupRow = element.closest(
      '[data-testid="project-chat-thread-group-row"]',
    );
    const groupId = groupRow?.getAttribute("data-group-id")?.trim() ?? "";
    if (groupId && groupIdSet.has(groupId)) {
      return groupId;
    }
  }
  return null;
}

function isPointerWithinThreadGroupDomain({
  pointerCurrent,
  pointerStart,
  delta,
  pinDomain,
}: {
  pointerCurrent: PointerCoordinates | null;
  pointerStart: PointerCoordinates | null;
  delta: { x: number; y: number };
  pinDomain: ThreadPinDomain;
}): boolean | null {
  if (typeof document === "undefined") {
    return null;
  }
  const resolvedPointer = resolvePointerLocation({
    pointerCurrent,
    pointerStart,
    delta,
  });
  if (!resolvedPointer) {
    return null;
  }
  const domainContainer = document.querySelector(
    `[data-thread-group-domain="${pinDomain}"]`,
  );
  if (!domainContainer) {
    return null;
  }
  const domainRect = domainContainer.getBoundingClientRect();
  return isPointerWithinRect(resolvedPointer, domainRect);
}

export function buildNextThreadOrder({
  sourceThreadId,
  targetThreadId,
  targetGroupId,
  placement,
  sourceThreadPinned,
  preferredOrder,
  fallbackOrder,
  threadGroupById,
  threadPinnedById,
}: {
  sourceThreadId: string;
  targetThreadId: string | null;
  targetGroupId: string | null;
  placement: ThreadDropPlacement;
  sourceThreadPinned: boolean;
  preferredOrder: Array<string>;
  fallbackOrder: Array<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): Array<string> {
  const visibleThreadIds = new Set(fallbackOrder);
  const nextOrder = buildInitialThreadOrder({
    fallbackOrder,
    preferredOrder,
    sourceThreadId,
    visibleThreadIds,
  });
  const insertIndex =
    resolveTargetThreadInsertIndex({
      nextOrder,
      placement,
      sourceThreadPinned,
      targetThreadId,
      threadPinnedById,
      visibleThreadIds,
    }) ??
    resolveGroupInsertIndex({
      nextOrder,
      sourceThreadPinned,
      targetGroupId,
      threadGroupById,
      threadPinnedById,
    });
  nextOrder.splice(insertIndex, 0, sourceThreadId);
  return normalizeUniqueThreadIds(nextOrder);
}

function resolveThreadDragEndOutcome({
  event,
  groupIdSet,
  latestThreadDropTarget,
  pinnedThreadIdsSet,
  pointerGroupId,
  sourceThreadId,
  threadGroupById,
  threadPinnedById,
}: {
  event: DragEndEvent;
  groupIdSet: Set<string>;
  latestThreadDropTarget: ThreadDropTarget | null;
  pinnedThreadIdsSet: Set<string>;
  pointerGroupId: string | null;
  sourceThreadId: string;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ProjectChatDragEndOutcome {
  if (
    sourceThreadId === DRAFT_THREAD_ENTRY_ID ||
    isDragReleaseWithinThreshold(event.delta)
  ) {
    return { kind: "noop" };
  }
  const sourceThreadPinDomain = getThreadPinDomain(
    pinnedThreadIdsSet.has(sourceThreadId),
  );
  const dropTarget =
    resolveThreadDropTarget({
      event,
      sourceThreadId,
      groupIdSet,
      threadGroupById,
      threadPinnedById,
    }) ??
    latestThreadDropTarget ??
    buildGroupDropTarget(pointerGroupId, sourceThreadPinDomain);
  if (!dropTarget) {
    return { kind: "noop" };
  }
  if (pointerGroupId && dropTarget.groupId !== pointerGroupId) {
    const pointerGroupDropTarget = buildGroupDropTarget(
      pointerGroupId,
      sourceThreadPinDomain,
    );
    return {
      kind: "move-thread",
      sourceThreadId,
      dropTarget: pointerGroupDropTarget,
    };
  }
  return { kind: "move-thread", sourceThreadId, dropTarget };
}

function resolveGroupDragEndOutcome({
  activeId,
  event,
  groupIdSet,
  groupSections,
  pinnedSortableGroupIds,
  pointerCurrent,
  pointerGroupId,
  pointerStart,
  unpinnedSortableGroupIds,
}: {
  activeId: string;
  event: DragEndEvent;
  groupIdSet: Set<string>;
  groupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupIds: Array<string>;
  pointerCurrent: PointerCoordinates | null;
  pointerGroupId: string | null;
  pointerStart: PointerCoordinates | null;
  unpinnedSortableGroupIds: Array<string>;
}): ProjectChatDragEndOutcome {
  const sourceGroupId = getThreadGroupIdFromDndId(activeId, groupIdSet);
  if (!sourceGroupId) {
    return { kind: "noop" };
  }
  const sourceGroupPinned = isSourceGroupPinned(groupSections, sourceGroupId);
  const sourceGroupPinDomain = getThreadPinDomain(sourceGroupPinned);
  const pointerInsideSourceDomain = isPointerWithinThreadGroupDomain({
    pointerCurrent,
    pointerStart,
    delta: event.delta,
    pinDomain: sourceGroupPinDomain,
  });
  if (pointerInsideSourceDomain === false) {
    return { kind: "noop" };
  }
  const scopedOrderedGroupIds = sourceGroupPinned
    ? pinnedSortableGroupIds
    : unpinnedSortableGroupIds;
  const scopedGroupIdSet = new Set(scopedOrderedGroupIds);
  if (pointerGroupId && !scopedGroupIdSet.has(pointerGroupId)) {
    return { kind: "noop" };
  }
  if (isOverGroupOutsideScopedDomain(event, groupIdSet, scopedGroupIdSet)) {
    return { kind: "noop" };
  }
  const nextOrderedGroupIds = resolveNextGroupOrderFromDrag({
    event,
    sourceGroupId,
    orderedGroupIds: scopedOrderedGroupIds,
    groupIdSet: scopedGroupIdSet,
  });
  if (!nextOrderedGroupIds) {
    return { kind: "noop" };
  }
  return {
    kind: "reorder-groups",
    nextOrderedGroupIds,
    sourceGroupPinned,
  };
}

function resolveOverThreadDropTarget({
  event,
  groupIdSet,
  sourcePinDomain,
  sourceThreadId,
  sourceThreadPinned,
  threadGroupById,
  threadPinnedById,
}: {
  event: DragEndEvent;
  groupIdSet: Set<string>;
  sourcePinDomain: ThreadPinDomain;
  sourceThreadId: string;
  sourceThreadPinned: boolean;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ThreadDropTarget | null | undefined {
  const overId = event.over ? String(event.over.id) : null;
  if (!overId) {
    return undefined;
  }
  const overThreadResolution = resolveOverThreadTarget({
    candidateIds: collectCandidateIds(event),
    event,
    groupIdSet,
    overId,
    sourcePinDomain,
    sourceThreadId,
    sourceThreadPinned,
    threadGroupById,
    threadPinnedById,
  });
  if (overThreadResolution !== undefined) {
    return overThreadResolution;
  }

  const overDropTarget = parseThreadDropTargetId(overId, groupIdSet);
  if (!overDropTarget) {
    return resolveGroupLikeDropTarget(overId, groupIdSet, sourcePinDomain);
  }
  if (overDropTarget.pinDomain !== sourcePinDomain) {
    return null;
  }
  return buildGroupDropTarget(overDropTarget.groupId, sourcePinDomain);
}

function resolveOverThreadTarget({
  candidateIds,
  event,
  groupIdSet,
  overId,
  sourcePinDomain,
  sourceThreadId,
  sourceThreadPinned,
  threadGroupById,
  threadPinnedById,
}: {
  candidateIds: Array<string>;
  event: DragEndEvent;
  groupIdSet: Set<string>;
  overId: string;
  sourcePinDomain: ThreadPinDomain;
  sourceThreadId: string;
  sourceThreadPinned: boolean;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ThreadDropTarget | null | undefined {
  const overThreadId = getThreadIdFromDndId(overId);
  if (!overThreadId || overThreadId === DRAFT_THREAD_ENTRY_ID) {
    return undefined;
  }
  const overThreadPinned =
    threadPinnedById.get(overThreadId) ?? sourceThreadPinned;
  if (overThreadPinned !== sourceThreadPinned) {
    return null;
  }
  if (overThreadId === sourceThreadId) {
    return undefined;
  }
  const overThreadGroupId = threadGroupById.get(overThreadId) ?? null;
  const conflictingDropGroupId = resolveFirstConflictingDropGroupId({
    candidateIds,
    groupIdSet,
    overThreadGroupId,
  });
  if (conflictingDropGroupId !== undefined) {
    return buildGroupDropTarget(conflictingDropGroupId, sourcePinDomain);
  }
  return {
    groupId: overThreadGroupId,
    targetThreadId: overThreadId,
    placement: resolveThreadPlacement(event, overId),
    pinDomain: sourcePinDomain,
  };
}

function resolveCandidateDropZoneTarget({
  candidateIds,
  groupIdSet,
  sourcePinDomain,
}: {
  candidateIds: Array<string>;
  groupIdSet: Set<string>;
  sourcePinDomain: ThreadPinDomain;
}): ThreadDropTarget | null {
  for (const candidateId of candidateIds) {
    const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
    if (parsedDropTarget?.pinDomain === sourcePinDomain) {
      return buildGroupDropTarget(parsedDropTarget.groupId, sourcePinDomain);
    }
    const sectionGroupId = getGroupIdFromThreadSectionDropTargetId(
      candidateId,
      groupIdSet,
    );
    if (sectionGroupId !== undefined) {
      return buildGroupDropTarget(sectionGroupId, sourcePinDomain);
    }
  }
  return null;
}

function resolveCandidateThreadDropTarget({
  candidateIds,
  event,
  sourceThreadId,
  sourceThreadPinned,
  threadGroupById,
  threadPinnedById,
}: {
  candidateIds: Array<string>;
  event: DragEndEvent;
  sourceThreadId: string;
  sourceThreadPinned: boolean;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ThreadDropTarget | null {
  for (const candidateId of candidateIds) {
    const targetThreadId = getThreadIdFromDndId(candidateId);
    if (!isEligibleDropThread(targetThreadId, sourceThreadId)) {
      continue;
    }
    const targetThreadPinned = threadPinnedById.get(targetThreadId) ?? false;
    if (targetThreadPinned !== sourceThreadPinned) {
      continue;
    }
    return {
      groupId: threadGroupById.get(targetThreadId) ?? null,
      targetThreadId,
      placement: resolveThreadPlacement(event, candidateId),
      pinDomain: getThreadPinDomain(sourceThreadPinned),
    };
  }
  return null;
}

function resolveCandidateGroupDropTarget({
  candidateIds,
  groupIdSet,
  sourcePinDomain,
}: {
  candidateIds: Array<string>;
  groupIdSet: Set<string>;
  sourcePinDomain: ThreadPinDomain;
}): ThreadDropTarget | null {
  for (const candidateId of candidateIds) {
    const groupId =
      getThreadGroupIdFromDndId(candidateId, groupIdSet) ??
      (groupIdSet.has(candidateId) ? candidateId : null);
    if (groupId) {
      return buildGroupDropTarget(groupId, sourcePinDomain);
    }
  }
  return null;
}

function resolveGroupLikeDropTarget(
  overId: string,
  groupIdSet: Set<string>,
  sourcePinDomain: ThreadPinDomain,
): ThreadDropTarget | undefined {
  const overSectionDropGroupId = getGroupIdFromThreadSectionDropTargetId(
    overId,
    groupIdSet,
  );
  if (overSectionDropGroupId !== undefined) {
    return buildGroupDropTarget(overSectionDropGroupId, sourcePinDomain);
  }
  const overGroupId = getThreadGroupIdFromDndId(overId, groupIdSet);
  if (overGroupId) {
    return buildGroupDropTarget(overGroupId, sourcePinDomain);
  }
  if (groupIdSet.has(overId)) {
    return buildGroupDropTarget(overId, sourcePinDomain);
  }
  return undefined;
}

function resolveFirstConflictingDropGroupId({
  candidateIds,
  groupIdSet,
  overThreadGroupId,
}: {
  candidateIds: Array<string>;
  groupIdSet: Set<string>;
  overThreadGroupId: string | null;
}): string | null | undefined {
  for (const candidateId of candidateIds) {
    const groupId = resolveCandidateGroupId(candidateId, groupIdSet);
    if (
      groupId !== undefined &&
      groupId !== null &&
      groupId !== overThreadGroupId
    ) {
      return groupId;
    }
  }
  return undefined;
}

function resolveCandidateGroupId(
  candidateId: string,
  groupIdSet: Set<string>,
): string | null | undefined {
  const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
  return (
    parsedDropTarget?.groupId ??
    getGroupIdFromThreadSectionDropTargetId(candidateId, groupIdSet) ??
    getThreadGroupIdFromDndId(candidateId, groupIdSet) ??
    (groupIdSet.has(candidateId) ? candidateId : undefined)
  );
}

function resolveGroupDropOverId({
  event,
  sourceGroupId,
  groupIdSet,
}: {
  event: DragEndEvent;
  sourceGroupId: string;
  groupIdSet: Set<string>;
}): string | null {
  for (const candidateId of collectCandidateIds(event)) {
    const candidateGroupId = resolveCandidateGroupId(candidateId, groupIdSet);
    if (candidateGroupId && candidateGroupId !== sourceGroupId) {
      return candidateGroupId;
    }
  }
  return null;
}

function collectCandidateIds(event: DragEndEvent): Array<string> {
  const candidateIds: Array<string> = [];
  const overId = event.over ? String(event.over.id) : null;
  if (overId) {
    candidateIds.push(overId);
  }
  for (const collision of event.collisions ?? []) {
    const collisionId = String(collision.id);
    if (!candidateIds.includes(collisionId)) {
      candidateIds.push(collisionId);
    }
  }
  return candidateIds;
}

function resolvePointerLocation({
  pointerCurrent,
  pointerStart,
  delta,
}: {
  pointerCurrent: PointerCoordinates | null;
  pointerStart: PointerCoordinates | null;
  delta: { x: number; y: number };
}): PointerCoordinates | null {
  const resolvedPointer =
    pointerCurrent ??
    (pointerStart
      ? {
          x: pointerStart.x + delta.x,
          y: pointerStart.y + delta.y,
        }
      : null);
  if (!resolvedPointer) {
    return null;
  }
  if (
    !Number.isFinite(resolvedPointer.x) ||
    !Number.isFinite(resolvedPointer.y)
  ) {
    return null;
  }
  return resolvedPointer;
}

function getElementsAtPoint(pointer: PointerCoordinates): Array<Element> {
  if (typeof document === "undefined") {
    return [];
  }
  const elementsAtPoint =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(pointer.x, pointer.y)
      : [];
  if (elementsAtPoint.length > 0) {
    return elementsAtPoint;
  }
  const fallbackElement = document.elementFromPoint(pointer.x, pointer.y);
  return fallbackElement ? [fallbackElement] : [];
}

function isPointerWithinRect(
  pointer: PointerCoordinates,
  rect: DOMRect,
): boolean {
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.right &&
    pointer.y >= rect.top &&
    pointer.y <= rect.bottom
  );
}

function resolveThreadPlacement(
  event: DragEndEvent,
  overId: string,
): ThreadDropPlacement {
  const collisions = event.collisions as SettaCollision[] | null;
  const collision = collisions?.find(
    (candidate) => String(candidate.id) === overId,
  );
  if (collision?.pastHalfway === true) {
    return "after";
  }
  if (collision?.pastHalfway === false) {
    return "before";
  }
  return event.delta.y >= 0 ? "after" : "before";
}

function buildInitialThreadOrder({
  fallbackOrder,
  preferredOrder,
  sourceThreadId,
  visibleThreadIds,
}: {
  fallbackOrder: Array<string>;
  preferredOrder: Array<string>;
  sourceThreadId: string;
  visibleThreadIds: Set<string>;
}): Array<string> {
  return normalizeUniqueThreadIds([
    ...preferredOrder.filter((threadId) => visibleThreadIds.has(threadId)),
    ...fallbackOrder,
  ]).filter((threadId) => threadId !== sourceThreadId);
}

function resolveTargetThreadInsertIndex({
  nextOrder,
  placement,
  sourceThreadPinned,
  targetThreadId,
  threadPinnedById,
  visibleThreadIds,
}: {
  nextOrder: Array<string>;
  placement: ThreadDropPlacement;
  sourceThreadPinned: boolean;
  targetThreadId: string | null;
  threadPinnedById: Map<string, boolean>;
  visibleThreadIds: Set<string>;
}): number | null {
  if (!targetThreadId || !visibleThreadIds.has(targetThreadId)) {
    return null;
  }
  const targetPinned = threadPinnedById.get(targetThreadId) ?? false;
  if (targetPinned !== sourceThreadPinned) {
    return null;
  }
  const targetIndex = nextOrder.indexOf(targetThreadId);
  if (targetIndex < 0) {
    return null;
  }
  return placement === "after" ? targetIndex + 1 : targetIndex;
}

function resolveGroupInsertIndex({
  nextOrder,
  sourceThreadPinned,
  targetGroupId,
  threadGroupById,
  threadPinnedById,
}: {
  nextOrder: Array<string>;
  sourceThreadPinned: boolean;
  targetGroupId: string | null;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): number {
  let lastMatchIndex = -1;
  for (const [index, candidateThreadId] of nextOrder.entries()) {
    const candidateGroupId = threadGroupById.get(candidateThreadId) ?? null;
    const candidatePinned = threadPinnedById.get(candidateThreadId) ?? false;
    if (
      candidateGroupId === targetGroupId &&
      candidatePinned === sourceThreadPinned
    ) {
      lastMatchIndex = index;
    }
  }
  return lastMatchIndex >= 0 ? lastMatchIndex + 1 : nextOrder.length;
}

function buildGroupDropTarget(
  groupId: string | null,
  pinDomain: ThreadPinDomain,
): ThreadDropTarget {
  return {
    groupId,
    targetThreadId: null,
    placement: "after",
    pinDomain,
  };
}

function getThreadPinDomain(pinned: boolean): ThreadPinDomain {
  return pinned ? PINNED_THREAD_DOMAIN : UNPINNED_THREAD_DOMAIN;
}

function isEligibleDropThread(
  targetThreadId: string | null,
  sourceThreadId: string,
): targetThreadId is string {
  return (
    Boolean(targetThreadId) &&
    targetThreadId !== sourceThreadId &&
    targetThreadId !== DRAFT_THREAD_ENTRY_ID
  );
}

function isSameGroupOrder(left: Array<string>, right: Array<string>): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((groupId, index) => groupId === right[index]);
}

function isGroupReorderDirectionValid(
  deltaY: number,
  sourceIndex: number,
  overIndex: number,
): boolean {
  if (deltaY < 0 && overIndex > sourceIndex) {
    return false;
  }
  if (deltaY > 0 && overIndex < sourceIndex) {
    return false;
  }
  return true;
}

function isSourceGroupPinned(
  groupSections: Array<ThreadGroupSection>,
  sourceGroupId: string,
): boolean {
  return (
    groupSections.find((section) => section.id === sourceGroupId)?.pinned ??
    false
  );
}

function isOverGroupOutsideScopedDomain(
  event: DragEndEvent,
  groupIdSet: Set<string>,
  scopedGroupIdSet: Set<string>,
): boolean {
  const overId = event.over ? String(event.over.id) : null;
  if (!overId) {
    return false;
  }
  const overGroupId = resolveCandidateGroupId(overId, groupIdSet);
  return Boolean(overGroupId && !scopedGroupIdSet.has(overGroupId));
}

function isDragReleaseWithinThreshold(delta: {
  x: number;
  y: number;
}): boolean {
  return (
    Math.abs(delta.y) <= GROUP_DRAG_RELEASE_THRESHOLD_PX &&
    Math.abs(delta.x) <= GROUP_DRAG_RELEASE_THRESHOLD_PX
  );
}
