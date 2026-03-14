import { arrayMove } from "@dnd-kit/helpers";
import { type DragEndEvent, type SettaCollision } from "forks/dnd-kit/adapter";

export const DRAFT_THREAD_ENTRY_ID = "__setta_project_chat_draft_thread__";
const THREAD_DND_PREFIX = "project-chat-thread::";
const THREAD_GROUP_DND_PREFIX = "project-chat-thread-group::";
const THREAD_SECTION_DROP_TARGET_PREFIX = "project-chat-thread-section-drop::";
const THREAD_DROP_TARGET_PREFIX = "project-chat-thread-drop::";
export const GROUP_DRAG_RELEASE_THRESHOLD_PX = 4;

export type ThreadPinDomain = "pinned" | "unpinned";
export const PINNED_THREAD_DOMAIN: ThreadPinDomain = "pinned";
export const UNPINNED_THREAD_DOMAIN: ThreadPinDomain = "unpinned";

export type ThreadDropPlacement = "before" | "after";

export type ThreadDropTarget = {
  groupId: string | null;
  targetThreadId: string | null;
  placement: ThreadDropPlacement;
  pinDomain: ThreadPinDomain;
};

export function normalizeUniqueThreadIds(
  threadIds: Array<string>,
): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];
  for (const threadId of threadIds) {
    const nextId = threadId.trim();
    if (!nextId || seen.has(nextId)) {
      continue;
    }
    seen.add(nextId);
    normalized.push(nextId);
  }
  return normalized;
}

export function toThreadDndId(threadId: string): string {
  return `${THREAD_DND_PREFIX}${threadId}`;
}

export function getThreadIdFromDndId(dndId: string): string | null {
  if (!dndId.startsWith(THREAD_DND_PREFIX)) {
    return null;
  }
  const threadId = dndId.slice(THREAD_DND_PREFIX.length).trim();
  if (!threadId) {
    return null;
  }
  return threadId;
}

export function toThreadGroupDndId(groupId: string): string {
  return `${THREAD_GROUP_DND_PREFIX}${groupId}`;
}

export function getThreadGroupIdFromDndId(
  dndId: string,
  groupIdSet: Set<string>,
): string | null {
  if (!dndId.startsWith(THREAD_GROUP_DND_PREFIX)) {
    return null;
  }
  const groupId = dndId.slice(THREAD_GROUP_DND_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return null;
  }
  return groupId;
}

export function toThreadDropTargetId(
  groupId: string | null,
  pinDomain: ThreadPinDomain,
): string {
  const groupToken = groupId === null ? "ungrouped" : groupId;
  return `${THREAD_DROP_TARGET_PREFIX}${groupToken}::${pinDomain}`;
}

export function toThreadSectionDropTargetId(groupId: string): string {
  return `${THREAD_SECTION_DROP_TARGET_PREFIX}${groupId}`;
}

export function parseThreadDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): { groupId: string | null; pinDomain: ThreadPinDomain } | undefined {
  if (!dndId.startsWith(THREAD_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const rawPayload = dndId.slice(THREAD_DROP_TARGET_PREFIX.length).trim();
  if (!rawPayload) {
    return undefined;
  }
  const [groupToken, pinDomainToken] = rawPayload.split("::");
  if (!groupToken || !pinDomainToken) {
    return undefined;
  }
  const pinDomain =
    pinDomainToken === PINNED_THREAD_DOMAIN
      ? PINNED_THREAD_DOMAIN
      : pinDomainToken === UNPINNED_THREAD_DOMAIN
        ? UNPINNED_THREAD_DOMAIN
        : null;
  if (!pinDomain) {
    return undefined;
  }
  if (groupToken === "ungrouped") {
    return { groupId: null, pinDomain };
  }
  if (!groupIdSet.has(groupToken)) {
    return undefined;
  }
  return { groupId: groupToken, pinDomain };
}

export function getGroupIdFromThreadSectionDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): string | undefined {
  if (!dndId.startsWith(THREAD_SECTION_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const groupId = dndId.slice(THREAD_SECTION_DROP_TARGET_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return undefined;
  }
  return groupId;
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
  const sourcePinDomain = sourceThreadPinned
    ? PINNED_THREAD_DOMAIN
    : UNPINNED_THREAD_DOMAIN;
  const candidateIds: Array<string> = [];
  const overId = event.over ? String(event.over.id) : null;
  if (overId) {
    candidateIds.push(overId);
  }
  for (const collision of event.collisions ?? []) {
    const collisionId = String(collision.id);
    if (candidateIds.includes(collisionId)) {
      continue;
    }
    candidateIds.push(collisionId);
  }

  if (overId) {
    const overThreadId = getThreadIdFromDndId(overId);
    const overThreadGroupId =
      overThreadId && overThreadId !== DRAFT_THREAD_ENTRY_ID
        ? threadGroupById.get(overThreadId) ?? null
        : null;
    const overThreadPinned =
      overThreadId && overThreadId !== DRAFT_THREAD_ENTRY_ID
        ? threadPinnedById.get(overThreadId) ?? false
        : sourceThreadPinned;
    if (
      overThreadId &&
      overThreadId !== sourceThreadId &&
      overThreadId !== DRAFT_THREAD_ENTRY_ID &&
      overThreadPinned === sourceThreadPinned
    ) {
      const conflictingDropGroupId = resolveFirstConflictingDropGroupId({
        candidateIds,
        groupIdSet,
        overThreadGroupId,
      });
      if (conflictingDropGroupId !== undefined) {
        return {
          groupId: conflictingDropGroupId,
          targetThreadId: null,
          placement: "after",
          pinDomain: sourcePinDomain,
        };
      }
      return {
        groupId: overThreadGroupId,
        targetThreadId: overThreadId,
        placement: resolveThreadPlacement(event, overId),
        pinDomain: sourcePinDomain,
      };
    }
    if (
      overThreadId &&
      overThreadId !== sourceThreadId &&
      overThreadId !== DRAFT_THREAD_ENTRY_ID &&
      overThreadPinned !== sourceThreadPinned
    ) {
      return null;
    }
    const parsedDropTarget = parseThreadDropTargetId(overId, groupIdSet);
    if (parsedDropTarget && parsedDropTarget.pinDomain !== sourcePinDomain) {
      return null;
    }
    if (parsedDropTarget && parsedDropTarget.pinDomain === sourcePinDomain) {
      return {
        groupId: parsedDropTarget.groupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const overSectionDropGroupId = getGroupIdFromThreadSectionDropTargetId(
      overId,
      groupIdSet,
    );
    if (overSectionDropGroupId !== undefined) {
      return {
        groupId: overSectionDropGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const overGroupId = getThreadGroupIdFromDndId(overId, groupIdSet);
    if (overGroupId) {
      return {
        groupId: overGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    if (groupIdSet.has(overId)) {
      return {
        groupId: overId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
  }

  for (const candidateId of candidateIds) {
    const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
    if (parsedDropTarget && parsedDropTarget.pinDomain === sourcePinDomain) {
      return {
        groupId: parsedDropTarget.groupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const sectionGroupId = getGroupIdFromThreadSectionDropTargetId(
      candidateId,
      groupIdSet,
    );
    if (sectionGroupId !== undefined) {
      return {
        groupId: sectionGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
  }

  for (const candidateId of candidateIds) {
    const targetThreadId = getThreadIdFromDndId(candidateId);
    if (!targetThreadId || targetThreadId === sourceThreadId) {
      continue;
    }
    if (targetThreadId === DRAFT_THREAD_ENTRY_ID) {
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
      pinDomain: sourcePinDomain,
    };
  }

  for (const candidateId of candidateIds) {
    const groupId = getThreadGroupIdFromDndId(candidateId, groupIdSet);
    if (!groupId) {
      if (!groupIdSet.has(candidateId)) {
        continue;
      }
      return {
        groupId: candidateId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    if (!groupIdSet.has(groupId)) {
      continue;
    }
    return {
      groupId,
      targetThreadId: null,
      placement: "after",
      pinDomain: sourcePinDomain,
    };
  }

  return null;
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
    const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
    const groupId =
      parsedDropTarget?.groupId ??
      getGroupIdFromThreadSectionDropTargetId(candidateId, groupIdSet) ??
      getThreadGroupIdFromDndId(candidateId, groupIdSet);
    if (
      groupId === undefined ||
      groupId === null ||
      groupId === overThreadGroupId
    ) {
      continue;
    }
    return groupId;
  }
  for (const candidateId of candidateIds) {
    if (!groupIdSet.has(candidateId) || candidateId === overThreadGroupId) {
      continue;
    }
    return candidateId;
  }
  return undefined;
}

export function resolveNextGroupOrderFromDrag({
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
  const primaryDelta = Math.abs(event.delta.y);
  const secondaryDelta = Math.abs(event.delta.x);
  if (
    primaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX &&
    secondaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX
  ) {
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
  if (event.delta.y < 0 && overIndex > sourceIndex) {
    return null;
  }
  if (event.delta.y > 0 && overIndex < sourceIndex) {
    return null;
  }
  const nextGroupOrder = arrayMove(orderedGroupIds, sourceIndex, overIndex);
  if (isSameGroupOrder(nextGroupOrder, orderedGroupIds)) {
    return null;
  }
  return nextGroupOrder;
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
  const candidateIds: Array<string> = [];
  if (event.over) {
    candidateIds.push(String(event.over.id));
  }
  for (const collision of event.collisions ?? []) {
    const collisionId = String(collision.id);
    if (candidateIds.includes(collisionId)) {
      continue;
    }
    candidateIds.push(collisionId);
  }
  for (const candidateId of candidateIds) {
    const candidateGroupId =
      getThreadGroupIdFromDndId(candidateId, groupIdSet) ??
      getGroupIdFromThreadSectionDropTargetId(candidateId, groupIdSet) ??
      (groupIdSet.has(candidateId) ? candidateId : null);
    if (!candidateGroupId || candidateGroupId === sourceGroupId) {
      continue;
    }
    return candidateGroupId;
  }
  return null;
}

function isSameGroupOrder(left: Array<string>, right: Array<string>): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function getPointerClientPoint(
  activatorEvent: Event | null,
): { x: number; y: number } | null {
  if (!activatorEvent) {
    return null;
  }
  const mouseLike = activatorEvent as Event & {
    clientX?: number;
    clientY?: number;
  };
  if (
    typeof mouseLike.clientX === "number" &&
    typeof mouseLike.clientY === "number"
  ) {
    return { x: mouseLike.clientX, y: mouseLike.clientY };
  }
  const touchLike = activatorEvent as TouchEvent;
  const touch = touchLike.touches?.[0] ?? touchLike.changedTouches?.[0] ?? null;
  if (!touch) {
    return null;
  }
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function resolvePointerLocation({
  pointerCurrent,
  pointerStart,
  delta,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
  delta: { x: number; y: number };
}): { x: number; y: number } | null {
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

export function resolveGroupIdFromPointerPosition({
  pointerCurrent,
  pointerStart,
  delta,
  groupIdSet,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
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
  const elementsAtPoint =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(resolvedPointer.x, resolvedPointer.y)
      : [];
  const fallbackElement = document.elementFromPoint(
    resolvedPointer.x,
    resolvedPointer.y,
  );
  if (elementsAtPoint.length === 0 && !fallbackElement) {
    return null;
  }
  const candidates =
    elementsAtPoint.length > 0
      ? elementsAtPoint
      : fallbackElement
        ? [fallbackElement]
        : [];
  for (const element of candidates) {
    const groupRow = element.closest(
      '[data-testid="project-chat-thread-group-row"]',
    );
    if (!groupRow) {
      continue;
    }
    const rawGroupId = groupRow.getAttribute("data-group-id") ?? "";
    const groupId = rawGroupId.trim();
    if (!groupId || !groupIdSet.has(groupId)) {
      continue;
    }
    return groupId;
  }
  return null;
}

export function isPointerWithinThreadGroupDomain({
  pointerCurrent,
  pointerStart,
  delta,
  pinDomain,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
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
  return (
    resolvedPointer.x >= domainRect.left &&
    resolvedPointer.x <= domainRect.right &&
    resolvedPointer.y >= domainRect.top &&
    resolvedPointer.y <= domainRect.bottom
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
  const nextOrder = normalizeUniqueThreadIds([
    ...preferredOrder.filter((threadId) => visibleThreadIds.has(threadId)),
    ...fallbackOrder,
  ]).filter((threadId) => threadId !== sourceThreadId);

  let insertIndex = nextOrder.length;
  const normalizedTargetThreadId =
    targetThreadId && visibleThreadIds.has(targetThreadId)
      ? targetThreadId
      : null;
  const targetPinned =
    normalizedTargetThreadId !== null
      ? threadPinnedById.get(normalizedTargetThreadId) ?? false
      : null;
  if (
    normalizedTargetThreadId !== null &&
    targetPinned === sourceThreadPinned
  ) {
    const targetIndex = nextOrder.indexOf(normalizedTargetThreadId);
    if (targetIndex >= 0) {
      insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    }
  } else {
    let lastMatchIndex = -1;
    for (let index = 0; index < nextOrder.length; index += 1) {
      const candidateThreadId = nextOrder[index];
      const candidateGroupId = threadGroupById.get(candidateThreadId) ?? null;
      const candidatePinned = threadPinnedById.get(candidateThreadId) ?? false;
      if (
        candidateGroupId === targetGroupId &&
        candidatePinned === sourceThreadPinned
      ) {
        lastMatchIndex = index;
      }
    }
    if (lastMatchIndex >= 0) {
      insertIndex = lastMatchIndex + 1;
    }
  }
  nextOrder.splice(insertIndex, 0, sourceThreadId);
  return normalizeUniqueThreadIds(nextOrder);
}

export function buildDefaultThreadGroupName(groupNames: Array<string>): string {
  const normalizedNames = new Set(
    groupNames.map((name) => name.trim().toLowerCase()),
  );
  let suffix = 1;
  while (suffix < 10_000) {
    const candidate = suffix === 1 ? "New Group" : `New Group ${suffix}`;
    if (!normalizedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }
  return `New Group ${Date.now()}`;
}
