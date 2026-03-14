import { PointerSensor } from "@dnd-kit/dom";
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DRAFT_THREAD_ENTRY_ID,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  GROUP_DRAG_RELEASE_THRESHOLD_PX,
  isPointerWithinThreadGroupDomain,
  PINNED_THREAD_DOMAIN,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  UNPINNED_THREAD_DOMAIN,
  type ThreadDropTarget,
} from "./projectChatHistoryDragUtils";
import { type ThreadGroupSection } from "./projectChatHistoryViewModel";

const PROJECT_CHAT_HISTORY_THREAD_DND_CONTEXT = {
  isMovingFree: false,
  isSorting: false,
};

export function useProjectChatHistoryDragController({
  groupSections,
  pinnedSortableGroupIds,
  unpinnedSortableGroupIds,
  groupsSortableEnabled,
  threadsSortableEnabled,
  pinnedThreadIdsSet,
  threadGroupById,
  threadPinnedById,
  onMoveThread,
  onReorderGroups,
}: {
  groupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupIds: Array<string>;
  unpinnedSortableGroupIds: Array<string>;
  groupsSortableEnabled: boolean;
  threadsSortableEnabled: boolean;
  pinnedThreadIdsSet: Set<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
  onMoveThread: (sourceThreadId: string, dropTarget: ThreadDropTarget) => void;
  onReorderGroups: (nextOrderedGroupIds: Array<string>) => void;
}) {
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

  const groupIdSet = useMemo(() => {
    return new Set(groupSections.map((section) => section.id));
  }, [groupSections]);

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
      const initialHoverGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: pointerStart,
        pointerStart,
        delta: { x: 0, y: 0 },
        groupIdSet,
      });
      setThreadDragHoverGroupId(initialHoverGroupId);
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
      const hoverGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        groupIdSet,
      });
      setThreadDragHoverGroupId(hoverGroupId);
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
          primaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX &&
          secondaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX
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
          onMoveThread(sourceThreadId, {
            groupId: pointerGroupId,
            targetThreadId: null,
            placement: "after",
            pinDomain: sourceThreadPinDomain,
          });
          return;
        }
        onMoveThread(sourceThreadId, dropTarget);
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
      onReorderGroups([
        ...(sourceGroupPinned ? nextOrderedGroupIds : pinnedSortableGroupIds),
        ...(sourceGroupPinned ? unpinnedSortableGroupIds : nextOrderedGroupIds),
      ]);
    },
    [
      groupIdSet,
      groupSections,
      onMoveThread,
      onReorderGroups,
      pinnedSortableGroupIds,
      pinnedThreadIdsSet,
      stopPointerTracking,
      threadGroupById,
      threadPinnedById,
      unpinnedSortableGroupIds,
    ],
  );

  return {
    activeThreadDragId,
    threadDragHoverGroupId,
    threadDndSensors,
    threadDndContext: PROJECT_CHAT_HISTORY_THREAD_DND_CONTEXT,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  };
}
