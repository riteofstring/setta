import { PointerSensor } from "@dnd-kit/dom";
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreadGroupAssignments";
import { reorderProjectChatThreadGroups } from "state/actions/projectChatThreadGroupOrdering";
import { reorderProjectChatThreads } from "state/actions/projectChatThreadMutations";
import {
  buildNextThreadOrder,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  isPointerWithinThreadGroupDomain,
  PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadGroupDndId,
  type ThreadDropTarget,
} from "./projectChatHistoryDnd";
import {
  DRAFT_THREAD_ENTRY_ID,
  normalizeUniqueThreadIds,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type ProjectChatHistoryDndSessionArgs = {
  groupIdSet: Set<string>;
  groupSections: Array<ThreadGroupSection>;
  groupsSortableEnabled: boolean;
  onSelectedGroupChange?: (groupId: string | null) => void;
  orderedVisibleThreadIds: Array<string>;
  pinnedSortableGroupIds: Array<string>;
  pinnedThreadIdsSet: Set<string>;
  projectConfigId: string;
  threadGroupById: Map<string, string | null>;
  threadOrderIds: Array<string>;
  threadPinnedById: Map<string, boolean>;
  threadsSortableEnabled: boolean;
  unpinnedSortableGroupIds: Array<string>;
};

// Owns the thread/group drag session so ProjectChatHistory can stay focused on
// polling, search state, and thread/group commands.
export function useProjectChatHistoryDndSession({
  groupIdSet,
  groupSections,
  groupsSortableEnabled,
  onSelectedGroupChange,
  orderedVisibleThreadIds,
  pinnedSortableGroupIds,
  pinnedThreadIdsSet,
  projectConfigId,
  threadGroupById,
  threadOrderIds,
  threadPinnedById,
  threadsSortableEnabled,
  unpinnedSortableGroupIds,
}: ProjectChatHistoryDndSessionArgs) {
  const [activeThreadDragId, setActiveThreadDragId] = useState<string | null>(
    null,
  );
  const [threadDragHoverGroupId, setThreadDragHoverGroupId] = useState<
    string | null
  >(null);
  const latestThreadDropTargetRef = useRef<ThreadDropTarget | null>(null);
  const dragPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerMoveListenerRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const pinnedSortableGroupDndIds = useMemo(() => {
    return pinnedSortableGroupIds.map((groupId) => toThreadGroupDndId(groupId));
  }, [pinnedSortableGroupIds]);
  const unpinnedSortableGroupDndIds = useMemo(() => {
    return unpinnedSortableGroupIds.map((groupId) =>
      toThreadGroupDndId(groupId),
    );
  }, [unpinnedSortableGroupIds]);
  const threadDndSensors = useMemo(() => {
    if (!threadsSortableEnabled && !groupsSortableEnabled) {
      return [];
    }
    return [
      PointerSensor.configure({
        activatorElements: (source: { handle?: Element | null }) => {
          if (!source.handle) {
            return [];
          }
          return [source.handle];
        },
        preventActivation: () => false,
      }),
    ];
  }, [groupsSortableEnabled, threadsSortableEnabled]);
  const threadDndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );

  const handleMoveThread = useCallback(
    (sourceThreadId: string, dropTarget: ThreadDropTarget) => {
      if (!sourceThreadId || sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
        return;
      }
      if (dropTarget.targetThreadId === sourceThreadId) {
        return;
      }
      const sourceThreadPinned = pinnedThreadIdsSet.has(sourceThreadId);
      const sourceThreadPinDomain = sourceThreadPinned
        ? PINNED_THREAD_DOMAIN
        : UNPINNED_THREAD_DOMAIN;
      if (dropTarget.pinDomain !== sourceThreadPinDomain) {
        return;
      }
      const nextThreadOrder = buildNextThreadOrder({
        sourceThreadId,
        targetThreadId: dropTarget.targetThreadId,
        targetGroupId: dropTarget.groupId,
        placement: dropTarget.placement,
        sourceThreadPinned,
        preferredOrder: normalizeUniqueThreadIds(threadOrderIds),
        fallbackOrder: orderedVisibleThreadIds,
        threadGroupById,
        threadPinnedById,
      });
      setProjectChatThreadGroupAssignment(
        projectConfigId,
        sourceThreadId,
        dropTarget.groupId,
      );
      reorderProjectChatThreads(projectConfigId, nextThreadOrder);
      onSelectedGroupChange?.(dropTarget.groupId);
    },
    [
      onSelectedGroupChange,
      orderedVisibleThreadIds,
      pinnedThreadIdsSet,
      projectConfigId,
      threadGroupById,
      threadOrderIds,
      threadPinnedById,
    ],
  );
  const stopPointerTracking = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const listener = dragPointerMoveListenerRef.current;
    if (!listener) {
      return;
    }
    window.removeEventListener("pointermove", listener, true);
    dragPointerMoveListenerRef.current = null;
  }, []);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      latestThreadDropTargetRef.current = null;
      const activeId = String(event.active.id);
      const sourceThreadId = getThreadIdFromDndId(activeId);
      if (sourceThreadId && sourceThreadId !== DRAFT_THREAD_ENTRY_ID) {
        setActiveThreadDragId(sourceThreadId);
      } else {
        setActiveThreadDragId(null);
        setThreadDragHoverGroupId(null);
      }
      stopPointerTracking();
      const pointerStart = getPointerClientPoint(event.activatorEvent);
      dragPointerStartRef.current = pointerStart;
      dragPointerCurrentRef.current = pointerStart;
      setThreadDragHoverGroupId(
        resolveGroupIdFromPointerPosition({
          pointerCurrent: pointerStart,
          pointerStart,
          delta: { x: 0, y: 0 },
          groupIdSet,
        }),
      );
      if (typeof window === "undefined") {
        return;
      }
      const listener = (pointerEvent: PointerEvent) => {
        dragPointerCurrentRef.current = {
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        };
      };
      dragPointerMoveListenerRef.current = listener;
      window.addEventListener("pointermove", listener, true);
    },
    [groupIdSet, stopPointerTracking],
  );
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const sourceThreadId = getThreadIdFromDndId(String(event.active.id));
      if (sourceThreadId === null || sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
        setThreadDragHoverGroupId(null);
        return;
      }
      setThreadDragHoverGroupId(
        resolveGroupIdFromPointerPosition({
          pointerCurrent: dragPointerCurrentRef.current,
          pointerStart: dragPointerStartRef.current,
          delta: event.delta,
          groupIdSet,
        }),
      );
      const dropTarget = resolveThreadDropTarget({
        event,
        sourceThreadId,
        groupIdSet,
        threadGroupById,
        threadPinnedById,
      });
      if (!dropTarget) {
        return;
      }
      latestThreadDropTargetRef.current = dropTarget;
    },
    [groupIdSet, threadGroupById, threadPinnedById],
  );
  const handleDragCancel = useCallback(() => {
    latestThreadDropTargetRef.current = null;
    setActiveThreadDragId(null);
    setThreadDragHoverGroupId(null);
    dragPointerStartRef.current = null;
    dragPointerCurrentRef.current = null;
    stopPointerTracking();
  }, [stopPointerTracking]);

  useEffect(() => {
    return () => {
      stopPointerTracking();
    };
  }, [stopPointerTracking]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      setActiveThreadDragId(null);
      setThreadDragHoverGroupId(null);
      const pointerGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        groupIdSet,
      });
      dragPointerStartRef.current = null;
      dragPointerCurrentRef.current = null;
      stopPointerTracking();

      const sourceThreadId = getThreadIdFromDndId(activeId);
      if (sourceThreadId !== null) {
        const primaryDelta = Math.abs(event.delta.y);
        const secondaryDelta = Math.abs(event.delta.x);
        if (
          primaryDelta <= PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX &&
          secondaryDelta <= PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX
        ) {
          latestThreadDropTargetRef.current = null;
          return;
        }
        if (sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
          latestThreadDropTargetRef.current = null;
          return;
        }
        const sourceThreadPinDomain = pinnedThreadIdsSet.has(sourceThreadId)
          ? PINNED_THREAD_DOMAIN
          : UNPINNED_THREAD_DOMAIN;
        const dropTarget =
          resolveThreadDropTarget({
            event,
            sourceThreadId,
            groupIdSet,
            threadGroupById,
            threadPinnedById,
          }) ??
          latestThreadDropTargetRef.current ??
          (pointerGroupId !== null
            ? {
                groupId: pointerGroupId,
                targetThreadId: null,
                placement: "after",
                pinDomain: sourceThreadPinDomain,
              }
            : null);
        latestThreadDropTargetRef.current = null;
        if (!dropTarget) {
          return;
        }
        if (pointerGroupId !== null && dropTarget.groupId !== pointerGroupId) {
          handleMoveThread(sourceThreadId, {
            groupId: pointerGroupId,
            targetThreadId: null,
            placement: "after",
            pinDomain: sourceThreadPinDomain,
          });
          return;
        }
        handleMoveThread(sourceThreadId, dropTarget);
        return;
      }

      const sourceGroupId = getThreadGroupIdFromDndId(activeId, groupIdSet);
      if (!sourceGroupId) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const sourceGroupSection = groupSections.find(
        (section) => section.id === sourceGroupId,
      );
      const sourceGroupPinned = sourceGroupSection?.pinned ?? false;
      const sourceGroupPinDomain = sourceGroupPinned
        ? PINNED_THREAD_DOMAIN
        : UNPINNED_THREAD_DOMAIN;
      const pointerInsideSourceDomain = isPointerWithinThreadGroupDomain({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        pinDomain: sourceGroupPinDomain,
      });
      if (pointerInsideSourceDomain === false) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const scopedOrderedGroupIds = sourceGroupPinned
        ? pinnedSortableGroupIds
        : unpinnedSortableGroupIds;
      const scopedGroupIdSet = new Set(scopedOrderedGroupIds);
      if (pointerGroupId !== null && !scopedGroupIdSet.has(pointerGroupId)) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const overId = event.over ? String(event.over.id) : null;
      if (overId) {
        const overGroupId =
          getThreadGroupIdFromDndId(overId, groupIdSet) ??
          getGroupIdFromThreadSectionDropTargetId(overId, groupIdSet) ??
          (groupIdSet.has(overId) ? overId : null);
        if (overGroupId && !scopedGroupIdSet.has(overGroupId)) {
          latestThreadDropTargetRef.current = null;
          return;
        }
      }
      const nextOrderedGroupIds = resolveNextGroupOrderFromDrag({
        event,
        sourceGroupId,
        orderedGroupIds: scopedOrderedGroupIds,
        groupIdSet: scopedGroupIdSet,
      });
      if (!nextOrderedGroupIds) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      latestThreadDropTargetRef.current = null;
      reorderProjectChatThreadGroups(projectConfigId, [
        ...(sourceGroupPinned ? nextOrderedGroupIds : pinnedSortableGroupIds),
        ...(sourceGroupPinned ? unpinnedSortableGroupIds : nextOrderedGroupIds),
      ]);
    },
    [
      groupIdSet,
      groupSections,
      handleMoveThread,
      pinnedSortableGroupIds,
      pinnedThreadIdsSet,
      projectConfigId,
      stopPointerTracking,
      threadGroupById,
      threadPinnedById,
      unpinnedSortableGroupIds,
    ],
  );

  return {
    activeThreadDragId,
    handleDragCancel,
    handleDragEnd,
    handleDragMove,
    handleDragStart,
    pinnedSortableGroupDndIds,
    threadDndContext,
    threadDndSensors,
    threadDragHoverGroupId,
    unpinnedSortableGroupDndIds,
  };
}
