import { resolveFloatingDragMove } from "components/ChatWindowing/projectChatBottomDockInteractions";
import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { PROJECT_CHAT_SIDE_RAIL_WIDTH_PX } from "components/ChatWindowing/projectChatViewport";
import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent,
  type SetStateAction,
} from "react";
import {
  focusProjectChatWindow,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  resolveDefaultFloatingChatBounds,
  setProjectChatWindowBounds,
  setProjectChatWindowBoundsById,
  setProjectChatWindowPlacement,
  showSectionInProjectChatWindow,
} from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";
import {
  ActiveFloatingDrag,
  ActiveFloatingResize,
  ActiveFloatingSnapPreview,
  ActiveFloatingSnapResize,
  FLOATING_UNSNAP_DRAG_THRESHOLD_PX,
  FLOATING_WINDOW_MIN_HEIGHT_PX,
  FLOATING_WINDOW_MIN_WIDTH_PX,
  FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
  ResolvedWindowPill,
  WindowResizeDirection,
  areBoundsEqual,
  buildFloatingDragState,
  clampFloatingBoundsToViewport,
  clampNumber,
  getViewportDimensions,
  resizeDirectionIncludesAxis,
  shouldIgnoreFloatingDragPointerDown,
} from "./shared";

type ProjectChatWindowInstanceForFloatingInteractions = {
  placement: (typeof ChatWindowPlacementEnum)[keyof typeof ChatWindowPlacementEnum];
};

function cloneFloatingSnapResizeStartBounds(
  handle: FloatingSnapResizeHandle,
  floatingBoundsById: Record<string, ChatWindowBounds>,
): Record<string, ChatWindowBounds> | null {
  const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
  const involvedInstanceIds = [
    ...handle.leadingInstanceIds,
    ...handle.trailingInstanceIds,
  ];

  for (const instanceId of involvedInstanceIds) {
    const bounds = floatingBoundsById[instanceId];
    if (!bounds) {
      return null;
    }
    startBoundsByInstanceId[instanceId] = { ...bounds };
  }

  return startBoundsByInstanceId;
}

function resolveVerticalSnapResizeLimits({
  handle,
  startBoundsByInstanceId,
}: {
  handle: FloatingSnapResizeHandle;
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
}): { minCoordinate: number; maxCoordinate: number } | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of handle.leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.x + FLOATING_WINDOW_MIN_WIDTH_PX,
    );
  }
  for (const instanceId of handle.trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.x + bounds.width - FLOATING_WINDOW_MIN_WIDTH_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveHorizontalSnapResizeLimits({
  handle,
  startBoundsByInstanceId,
}: {
  handle: FloatingSnapResizeHandle;
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
}): { minCoordinate: number; maxCoordinate: number } | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of handle.leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.y + FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  for (const instanceId of handle.trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.y + bounds.height - FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveSnapResizeCoordinateLimits({
  handle,
  startBoundsByInstanceId,
}: {
  handle: FloatingSnapResizeHandle;
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
}): { minCoordinate: number; maxCoordinate: number } | null {
  if (handle.axis === "vertical") {
    return resolveVerticalSnapResizeLimits({ handle, startBoundsByInstanceId });
  }
  return resolveHorizontalSnapResizeLimits({ handle, startBoundsByInstanceId });
}

type UseProjectChatFloatingWindowInteractionsInput = {
  activeFloatingDragRef: MutableRefObject<ActiveFloatingDrag | null>;
  activeFloatingResizeRef: MutableRefObject<ActiveFloatingResize | null>;
  activeFloatingSnapPreviewRef: MutableRefObject<ActiveFloatingSnapPreview | null>;
  activeFloatingSnapResizeRef: MutableRefObject<ActiveFloatingSnapResize | null>;
  activeFloatingWindowId: string | null;
  activeSectionId: string | null;
  activeVisibleWindowId: string | null;
  floatingBottomInsetPx: number;
  floatingBoundsById: Record<string, ChatWindowBounds>;
  floatingPreviewAnimationFrameRef: MutableRefObject<number | null>;
  floatingPreviewBoundsById: Record<string, ChatWindowBounds>;
  floatingPreviewBoundsRef: MutableRefObject<Record<string, ChatWindowBounds>>;
  floatingRestoreBoundsByIdRef: MutableRefObject<
    Record<string, ChatWindowBounds>
  >;
  floatingSnapPresetById: Record<string, FloatingSnapPreset>;
  floatingWindowBoundaryInsets: FloatingWindowBoundaryInsets;
  handleFocusWindow: (instanceId: string) => void;
  instancesById: Record<
    string,
    ProjectChatWindowInstanceForFloatingInteractions | undefined
  >;
  openFloatingPills: ResolvedWindowPill[];
  queuedFloatingPreviewBoundsRef: MutableRefObject<Record<
    string,
    ChatWindowBounds
  > | null>;
  setActiveFloatingSnapPreview: Dispatch<
    SetStateAction<ActiveFloatingSnapPreview | null>
  >;
  setFloatingPreviewBoundsById: Dispatch<
    SetStateAction<Record<string, ChatWindowBounds>>
  >;
  setIsCanvasVisibilitySuppressed: Dispatch<SetStateAction<boolean>>;
  viewportHeightPx: number;
  viewportWidthPx: number;
  workspaceTopInsetPx: number;
};

export function useProjectChatFloatingWindowInteractions({
  activeFloatingDragRef,
  activeFloatingResizeRef,
  activeFloatingSnapPreviewRef,
  activeFloatingSnapResizeRef,
  activeFloatingWindowId,
  activeSectionId,
  activeVisibleWindowId,
  floatingBottomInsetPx,
  floatingBoundsById,
  floatingPreviewAnimationFrameRef,
  floatingPreviewBoundsById,
  floatingPreviewBoundsRef,
  floatingRestoreBoundsByIdRef,
  floatingSnapPresetById,
  floatingWindowBoundaryInsets,
  handleFocusWindow,
  instancesById,
  openFloatingPills,
  queuedFloatingPreviewBoundsRef,
  setActiveFloatingSnapPreview,
  setFloatingPreviewBoundsById,
  setIsCanvasVisibilitySuppressed,
  viewportHeightPx,
  viewportWidthPx,
  workspaceTopInsetPx,
}: UseProjectChatFloatingWindowInteractionsInput) {
  const clampFloatingBoundsForCurrentViewport = useCallback(
    (bounds: ChatWindowBounds): ChatWindowBounds => {
      const viewport = getViewportDimensions();
      if (!viewport) {
        return bounds;
      }
      return clampFloatingBoundsToViewport(
        bounds,
        viewport.width,
        viewport.height,
        floatingWindowBoundaryInsets,
      );
    },
    [floatingWindowBoundaryInsets],
  );

  const resolveDefaultFloatingBoundsForCurrentViewport = useCallback(() => {
    const viewport = getViewportDimensions();
    return clampFloatingBoundsForCurrentViewport(
      resolveDefaultFloatingChatBounds({
        viewportWidthPx: viewport?.width ?? viewportWidthPx,
        viewportHeightPx: viewport?.height ?? viewportHeightPx,
        workspaceTopInsetPx,
        bottomInsetPx: floatingBottomInsetPx,
        sideRailWidthPx: PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
        minWidthPx: FLOATING_WINDOW_MIN_WIDTH_PX,
        minHeightPx: FLOATING_WINDOW_MIN_HEIGHT_PX,
      }),
    );
  }, [
    floatingBottomInsetPx,
    viewportHeightPx,
    viewportWidthPx,
    workspaceTopInsetPx,
  ]);

  const resolveFloatingRestoreBounds = useCallback(
    (instanceId: string): ChatWindowBounds => {
      const existingBounds = floatingRestoreBoundsByIdRef.current[instanceId];
      if (existingBounds) {
        return clampFloatingBoundsForCurrentViewport(existingBounds);
      }
      return resolveDefaultFloatingBoundsForCurrentViewport();
    },
    [
      clampFloatingBoundsForCurrentViewport,
      resolveDefaultFloatingBoundsForCurrentViewport,
    ],
  );

  const positionFloatingBoundsForUnsnap = useCallback(
    ({
      currentBounds,
      restoreBounds,
      pointerX,
      pointerY,
    }: {
      currentBounds: ChatWindowBounds;
      restoreBounds: ChatWindowBounds;
      pointerX: number;
      pointerY: number;
    }): ChatWindowBounds => {
      const pointerOffsetFractionX = clampNumber(
        (pointerX - currentBounds.x) / Math.max(1, currentBounds.width),
        0.15,
        0.85,
      );
      const pointerOffsetY = clampNumber(
        pointerY - currentBounds.y,
        8,
        FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX - 8,
      );
      return clampFloatingBoundsForCurrentViewport({
        ...restoreBounds,
        x: pointerX - restoreBounds.width * pointerOffsetFractionX,
        y: pointerY - pointerOffsetY,
      });
    },
    [clampFloatingBoundsForCurrentViewport],
  );

  useEffect(() => {
    const nextRestoreBoundsById = {
      ...floatingRestoreBoundsByIdRef.current,
    };
    let changed = false;

    for (const pill of openFloatingPills) {
      if (floatingSnapPresetById[pill.instanceId]) {
        continue;
      }
      const bounds = floatingBoundsById[pill.instanceId];
      if (!bounds) {
        continue;
      }
      const clampedBounds = clampFloatingBoundsForCurrentViewport(bounds);
      const existing = nextRestoreBoundsById[pill.instanceId];
      if (existing && areBoundsEqual(existing, clampedBounds)) {
        continue;
      }
      nextRestoreBoundsById[pill.instanceId] = clampedBounds;
      changed = true;
    }

    for (const instanceId of Object.keys(nextRestoreBoundsById)) {
      if (instancesById[instanceId]) {
        continue;
      }
      delete nextRestoreBoundsById[instanceId];
      changed = true;
    }

    if (changed) {
      floatingRestoreBoundsByIdRef.current = nextRestoreBoundsById;
    }
  }, [
    clampFloatingBoundsForCurrentViewport,
    floatingBoundsById,
    floatingSnapPresetById,
    instancesById,
    openFloatingPills,
  ]);

  const resolveSnapTargetWindowId = useCallback((): string | null => {
    if (activeFloatingWindowId) {
      return activeFloatingWindowId;
    }
    if (!activeSectionId) {
      if (!activeVisibleWindowId) {
        return null;
      }
      const activeVisibleWindow = instancesById[activeVisibleWindowId];
      if (!activeVisibleWindow) {
        return null;
      }
      if (activeVisibleWindow.placement !== ChatWindowPlacementEnum.floating) {
        setProjectChatWindowPlacement(
          activeVisibleWindowId,
          ChatWindowPlacementEnum.floating,
        );
      }
      return activeVisibleWindowId;
    }
    showSectionInProjectChatWindow(
      activeSectionId,
      ChatWindowPlacementEnum.floating,
    );
    return (
      getOpenExternalProjectChatWindowInstanceForSectionInState(
        useProjectState.getState().projectChatWindowing,
        activeSectionId,
      )?.instanceId ?? null
    );
  }, [
    activeFloatingWindowId,
    activeSectionId,
    activeVisibleWindowId,
    instancesById,
  ]);

  const snapWindowTargetByPreset = useCallback(
    (preset: FloatingSnapPreset) => {
      const targetWindowId = resolveSnapTargetWindowId();
      if (!targetWindowId) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }
      const nextBounds = clampFloatingBoundsForCurrentViewport(
        buildFloatingSnapBounds(
          preset,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        ),
      );
      setProjectChatWindowBounds(targetWindowId, nextBounds);
      focusProjectChatWindow(targetWindowId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      resolveSnapTargetWindowId,
    ],
  );

  const commitQueuedFloatingPreviewBounds = useCallback(() => {
    floatingPreviewAnimationFrameRef.current = null;
    const nextBoundsById = queuedFloatingPreviewBoundsRef.current;
    queuedFloatingPreviewBoundsRef.current = null;
    if (!nextBoundsById) {
      return;
    }
    floatingPreviewBoundsRef.current = nextBoundsById;
    setFloatingPreviewBoundsById((current) =>
      current === nextBoundsById ? current : nextBoundsById,
    );
  }, []);

  const scheduleFloatingPreviewBoundsCommit = useCallback(() => {
    if (floatingPreviewAnimationFrameRef.current !== null) {
      return;
    }
    floatingPreviewAnimationFrameRef.current = window.requestAnimationFrame(
      commitQueuedFloatingPreviewBounds,
    );
  }, [commitQueuedFloatingPreviewBounds]);

  const setFloatingPreviewBoundsImmediately = useCallback(
    (nextBoundsById: Record<string, ChatWindowBounds>) => {
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
      floatingPreviewBoundsRef.current = nextBoundsById;
      setFloatingPreviewBoundsById((current) =>
        current === nextBoundsById ? current : nextBoundsById,
      );
    },
    [],
  );

  const handleFloatingBoundsPreview = useCallback(
    (instanceId: string, bounds: ChatWindowBounds) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      const existing = current[instanceId];
      if (existing && areBoundsEqual(existing, bounds)) {
        return;
      }
      const next = {
        ...current,
        [instanceId]: bounds,
      };
      queuedFloatingPreviewBoundsRef.current = next;
      floatingPreviewBoundsRef.current = next;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const handleFloatingBoundsPreviewBatch = useCallback(
    (boundsByInstanceId: Record<string, ChatWindowBounds>) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      let next = current;
      for (const [instanceId, bounds] of Object.entries(boundsByInstanceId)) {
        const existing = next[instanceId];
        if (existing && areBoundsEqual(existing, bounds)) {
          continue;
        }
        if (next === current) {
          next = { ...current };
        }
        next[instanceId] = bounds;
      }
      if (next === current) {
        return;
      }
      queuedFloatingPreviewBoundsRef.current = next;
      floatingPreviewBoundsRef.current = next;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const clearFloatingBoundsPreview = useCallback(
    (instanceId: string) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      if (!current[instanceId]) {
        return;
      }
      const next = { ...current };
      delete next[instanceId];
      setFloatingPreviewBoundsImmediately(next);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const clearFloatingBoundsPreviewBatch = useCallback(
    (instanceIds: string[]) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      let next = current;
      for (const instanceId of instanceIds) {
        if (!next[instanceId]) {
          continue;
        }
        if (next === current) {
          next = { ...current };
        }
        delete next[instanceId];
      }
      if (next === current) {
        return;
      }
      setFloatingPreviewBoundsImmediately(next);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const updateActiveFloatingSnapPreview = useCallback(
    (nextSnapPreview: ActiveFloatingSnapPreview | null) => {
      activeFloatingSnapPreviewRef.current = nextSnapPreview;
      setActiveFloatingSnapPreview((current) => {
        if (!current && !nextSnapPreview) {
          return current;
        }
        if (current && nextSnapPreview) {
          const sameBounds = areBoundsEqual(
            current.bounds,
            nextSnapPreview.bounds,
          );
          if (
            current.instanceId === nextSnapPreview.instanceId &&
            current.preset === nextSnapPreview.preset &&
            sameBounds
          ) {
            return current;
          }
        }
        return nextSnapPreview;
      });
    },
    [],
  );

  useEffect(() => {
    if (openFloatingPills.length === 0) {
      return;
    }

    const applyViewportGuardrails = () => {
      if (
        activeFloatingDragRef.current ||
        activeFloatingResizeRef.current ||
        activeFloatingSnapResizeRef.current
      ) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }

      for (const pill of openFloatingPills) {
        const clampedBounds = clampFloatingBoundsToViewport(
          pill.bounds,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        );
        if (areBoundsEqual(pill.bounds, clampedBounds)) {
          continue;
        }
        setProjectChatWindowBounds(pill.instanceId, clampedBounds);
      }
    };

    applyViewportGuardrails();

    let frameRequestId: number | null = null;
    const onResize = () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      frameRequestId = window.requestAnimationFrame(() => {
        frameRequestId = null;
        applyViewportGuardrails();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [floatingWindowBoundaryInsets, openFloatingPills]);

  const handleFloatingDragPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, pill: ResolvedWindowPill) => {
      if (shouldIgnoreFloatingDragPointerDown(event)) {
        return;
      }
      const previewBounds = floatingPreviewBoundsById[pill.instanceId];
      const currentBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const snapPreset = floatingSnapPresetById[pill.instanceId] ?? null;
      const restoreBoundsOnUnsnap = snapPreset
        ? resolveFloatingRestoreBounds(pill.instanceId)
        : null;
      if (
        restoreBoundsOnUnsnap &&
        !floatingRestoreBoundsByIdRef.current[pill.instanceId]
      ) {
        floatingRestoreBoundsByIdRef.current = {
          ...floatingRestoreBoundsByIdRef.current,
          [pill.instanceId]: { ...restoreBoundsOnUnsnap },
        };
      }
      activeFloatingDragRef.current = buildFloatingDragState({
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        currentBounds,
        restoreBoundsOnUnsnap,
        positionFloatingBoundsForUnsnap,
      });
      updateActiveFloatingSnapPreview(null);
      handleFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingPreviewBoundsById,
      floatingSnapPresetById,
      handleFocusWindow,
      positionFloatingBoundsForUnsnap,
      resolveFloatingRestoreBounds,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const viewport = getViewportDimensions();
      const nextDragState = resolveFloatingDragMove({
        activeDrag,
        pointerX: event.clientX,
        pointerY: event.clientY,
        unsnapThresholdPx: FLOATING_UNSNAP_DRAG_THRESHOLD_PX,
        viewportWidthPx: viewport?.width ?? null,
        viewportHeightPx: viewport?.height ?? null,
        insets: floatingWindowBoundaryInsets,
        clampBounds: clampFloatingBoundsForCurrentViewport,
      });
      activeDrag.hasActivatedUnsnap = nextDragState.hasActivatedUnsnap;
      activeDrag.lastBounds = nextDragState.nextBounds;
      updateActiveFloatingSnapPreview(nextDragState.nextSnapPreview);
      if (nextDragState.hasActivatedUnsnap) {
        handleFloatingBoundsPreview(
          activeDrag.instanceId,
          nextDragState.nextBounds,
        );
      }
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      handleFloatingBoundsPreview,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const activeSnap = activeFloatingSnapPreviewRef.current;
      if (activeSnap && activeSnap.instanceId === activeDrag.instanceId) {
        setProjectChatWindowBounds(activeDrag.instanceId, activeSnap.bounds);
      } else if (!activeDrag.hasActivatedUnsnap) {
        setProjectChatWindowBounds(
          activeDrag.instanceId,
          activeDrag.startBounds,
        );
      } else {
        setProjectChatWindowBounds(
          activeDrag.instanceId,
          activeDrag.lastBounds,
        );
      }
      clearFloatingBoundsPreview(activeDrag.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreview, updateActiveFloatingSnapPreview],
  );

  const handleFloatingResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      pill: ResolvedWindowPill,
      direction: WindowResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const previewBounds = floatingPreviewBoundsById[pill.instanceId];
      const startBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const clonedBounds = { ...startBounds };
      activeFloatingResizeRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startBounds: clonedBounds,
        lastBounds: clonedBounds,
      };
      updateActiveFloatingSnapPreview(null);
      handleFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingPreviewBoundsById,
      handleFocusWindow,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - activeResize.startX;
      const deltaY = event.clientY - activeResize.startY;
      const resizingLeft = resizeDirectionIncludesAxis(
        activeResize.direction,
        "left",
      );
      const resizingRight = resizeDirectionIncludesAxis(
        activeResize.direction,
        "right",
      );
      const resizingTop = resizeDirectionIncludesAxis(
        activeResize.direction,
        "top",
      );
      const resizingBottom = resizeDirectionIncludesAxis(
        activeResize.direction,
        "bottom",
      );

      let nextWidth = activeResize.startBounds.width;
      let nextHeight = activeResize.startBounds.height;
      let nextX = activeResize.startBounds.x;
      let nextY = activeResize.startBounds.y;

      if (resizingLeft) {
        nextWidth = Math.max(
          FLOATING_WINDOW_MIN_WIDTH_PX,
          activeResize.startBounds.width - deltaX,
        );
        nextX =
          activeResize.startBounds.x +
          activeResize.startBounds.width -
          nextWidth;
      } else if (resizingRight) {
        nextWidth = Math.max(
          FLOATING_WINDOW_MIN_WIDTH_PX,
          activeResize.startBounds.width + deltaX,
        );
      }

      if (resizingTop) {
        nextHeight = Math.max(
          FLOATING_WINDOW_MIN_HEIGHT_PX,
          activeResize.startBounds.height - deltaY,
        );
        nextY =
          activeResize.startBounds.y +
          activeResize.startBounds.height -
          nextHeight;
      } else if (resizingBottom) {
        nextHeight = Math.max(
          FLOATING_WINDOW_MIN_HEIGHT_PX,
          activeResize.startBounds.height + deltaY,
        );
      }

      const nextBounds = clampFloatingBoundsForCurrentViewport({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
      activeResize.lastBounds = nextBounds;
      handleFloatingBoundsPreview(activeResize.instanceId, nextBounds);
    },
    [clampFloatingBoundsForCurrentViewport, handleFloatingBoundsPreview],
  );

  const handleFloatingResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowBounds(
        activeResize.instanceId,
        activeResize.lastBounds,
      );
      clearFloatingBoundsPreview(activeResize.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreview, updateActiveFloatingSnapPreview],
  );

  const handleFloatingSnapResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, handle: FloatingSnapResizeHandle) => {
      if (event.button !== 0) {
        return;
      }
      const startBoundsByInstanceId = cloneFloatingSnapResizeStartBounds(
        handle,
        floatingBoundsById,
      );
      if (!startBoundsByInstanceId) {
        return;
      }
      const coordinateLimits = resolveSnapResizeCoordinateLimits({
        handle,
        startBoundsByInstanceId,
      });
      if (!coordinateLimits) {
        return;
      }
      activeFloatingSnapResizeRef.current = {
        pointerId: event.pointerId,
        axis: handle.axis,
        startPointerPosition:
          handle.axis === "vertical" ? event.clientX : event.clientY,
        startCoordinate: handle.coordinate,
        minCoordinate: coordinateLimits.minCoordinate,
        maxCoordinate: coordinateLimits.maxCoordinate,
        leadingInstanceIds: handle.leadingInstanceIds,
        trailingInstanceIds: handle.trailingInstanceIds,
        startBoundsByInstanceId,
        lastBoundsByInstanceId: startBoundsByInstanceId,
      };

      updateActiveFloatingSnapPreview(null);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [floatingBoundsById, updateActiveFloatingSnapPreview],
  );

  const handleFloatingSnapResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const pointerPosition =
        activeResize.axis === "vertical" ? event.clientX : event.clientY;
      const nextCoordinate = clampNumber(
        activeResize.startCoordinate +
          (pointerPosition - activeResize.startPointerPosition),
        activeResize.minCoordinate,
        activeResize.maxCoordinate,
      );
      const nextBoundsByInstanceId = buildFloatingSnapResizeBounds(
        {
          axis: activeResize.axis,
          coordinate: activeResize.startCoordinate,
          leadingInstanceIds: activeResize.leadingInstanceIds,
          trailingInstanceIds: activeResize.trailingInstanceIds,
          startBoundsByInstanceId: activeResize.startBoundsByInstanceId,
        },
        nextCoordinate,
      );

      activeResize.lastBoundsByInstanceId = nextBoundsByInstanceId;
      handleFloatingBoundsPreviewBatch(nextBoundsByInstanceId);
    },
    [handleFloatingBoundsPreviewBatch],
  );

  const handleFloatingSnapResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowBoundsById(activeResize.lastBoundsByInstanceId);
      clearFloatingBoundsPreviewBatch([
        ...activeResize.leadingInstanceIds,
        ...activeResize.trailingInstanceIds,
      ]);
      updateActiveFloatingSnapPreview(null);
      activeFloatingSnapResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreviewBatch, updateActiveFloatingSnapPreview],
  );

  return {
    clampFloatingBoundsForCurrentViewport,
    handleFloatingDragPointerDown,
    handleFloatingDragPointerMove,
    handleFloatingDragPointerUp,
    handleFloatingResizePointerDown,
    handleFloatingResizePointerMove,
    handleFloatingResizePointerUp,
    handleFloatingSnapResizePointerDown,
    handleFloatingSnapResizePointerMove,
    handleFloatingSnapResizePointerUp,
    snapWindowTargetByPreset,
  };
}
