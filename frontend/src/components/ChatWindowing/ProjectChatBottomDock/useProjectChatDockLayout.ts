import { resolveSingleDockResizeMetrics } from "components/ChatWindowing/projectChatBottomDockInteractions";
import {
  DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX,
  resolveDockStripReservedWidthPx,
  resolveDockWindowWidthsToFit,
  resolveMaxVisibleDockWindowCount,
  resolveNextPillDisplayMode,
  type PillDisplayMode,
} from "components/ChatWindowing/projectChatBottomDockLayout";
import { PROJECT_CHAT_SIDE_RAIL_WIDTH_PX } from "components/ChatWindowing/projectChatViewport";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent,
  type SetStateAction,
} from "react";
import {
  focusProjectChatWindow,
  resolveDefaultDockedChatHeightPx,
  setProjectChatWindowBounds,
  setProjectChatWindowDockFractions,
} from "state/actions/projectChatWindowing";
import {
  ActiveSingleDockResize,
  COMPACT_PILL_WIDTH_PX,
  CYCLE_CONTROL_BUTTON_WIDTH_PX,
  DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
  DOCK_SURFACE_MAX_WIDTH_PX,
  DOCK_WINDOW_DEFAULT_HEIGHT_PX,
  DOCK_WINDOW_DEFAULT_WIDTH_PX,
  DOCK_WINDOW_GAP_PX,
  MIN_DOCK_CHAT_HEIGHT_PX,
  MIN_DOCK_CHAT_WIDTH_PX,
  PILL_GAP_PX,
  ResolvedWindowPill,
  WindowResizeDirection,
  clampNumber,
  getViewportDimensions,
  resizeDirectionIncludesAxis,
} from "./shared";

type UseProjectChatDockLayoutInput = {
  activeSingleDockResizeRef: MutableRefObject<ActiveSingleDockResize | null>;
  canCreateManagedChatWindow: boolean;
  compactMeasureRowRef: MutableRefObject<HTMLDivElement | null>;
  dockBottomOffsetPx: number;
  dockCycleOffsetFromEnd: number;
  dockPreviewHeightsById: Record<string, number>;
  dockPreviewWidthsById: Record<string, number>;
  fullMeasureRowRef: MutableRefObject<HTMLDivElement | null>;
  hasOverlayWindows: boolean;
  isCanvasVisibilitySuppressed: boolean;
  nonClosedPills: readonly ResolvedWindowPill[];
  openDockedPills: readonly ResolvedWindowPill[];
  openMaximizedWindow: ResolvedWindowPill | null;
  orderedPills: readonly ResolvedWindowPill[];
  pillCycleStartIndex: number;
  pillDisplayMode: PillDisplayMode;
  pillViewportRef: MutableRefObject<HTMLDivElement | null>;
  pillViewportWidthPx: number;
  setDockCycleOffsetFromEnd: Dispatch<SetStateAction<number>>;
  setDockPreviewHeightsById: Dispatch<SetStateAction<Record<string, number>>>;
  setDockPreviewWidthsById: Dispatch<SetStateAction<Record<string, number>>>;
  setIsCanvasVisibilitySuppressed: Dispatch<SetStateAction<boolean>>;
  setPillCycleStartIndex: Dispatch<SetStateAction<number>>;
  setPillDisplayMode: Dispatch<SetStateAction<PillDisplayMode>>;
  viewportHeightPx: number;
  viewportWidthPx: number;
  workspaceTopInsetPx: number;
};

export function useProjectChatDockLayout({
  activeSingleDockResizeRef,
  canCreateManagedChatWindow,
  compactMeasureRowRef,
  dockBottomOffsetPx,
  dockCycleOffsetFromEnd,
  dockPreviewHeightsById,
  dockPreviewWidthsById,
  fullMeasureRowRef,
  hasOverlayWindows,
  isCanvasVisibilitySuppressed,
  nonClosedPills,
  openDockedPills,
  openMaximizedWindow,
  orderedPills,
  pillCycleStartIndex,
  pillDisplayMode,
  pillViewportRef,
  pillViewportWidthPx,
  setDockCycleOffsetFromEnd,
  setDockPreviewHeightsById,
  setDockPreviewWidthsById,
  setIsCanvasVisibilitySuppressed,
  setPillCycleStartIndex,
  setPillDisplayMode,
  viewportHeightPx,
  viewportWidthPx,
  workspaceTopInsetPx,
}: UseProjectChatDockLayoutInput) {
  const dockAvailableHeightPx = useMemo(() => {
    const fallbackViewportHeight = 900;
    const resolvedViewportHeight =
      viewportHeightPx > 0 ? viewportHeightPx : fallbackViewportHeight;
    return Math.max(
      MIN_DOCK_CHAT_HEIGHT_PX,
      resolvedViewportHeight - workspaceTopInsetPx - dockBottomOffsetPx,
    );
  }, [dockBottomOffsetPx, viewportHeightPx, workspaceTopInsetPx]);

  const defaultDockWindowHeightPx = useMemo(
    () =>
      resolveDefaultDockedChatHeightPx({
        viewportHeightPx,
        workspaceTopInsetPx,
        bottomInsetPx: dockBottomOffsetPx,
        minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
      }),
    [dockBottomOffsetPx, viewportHeightPx, workspaceTopInsetPx],
  );

  const dockSurfaceLeftPx =
    PROJECT_CHAT_SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX;
  const dockSurfaceRightPx = dockSurfaceLeftPx;
  const showDockManagerMenu = useMemo(
    () => canCreateManagedChatWindow || orderedPills.length > 0,
    [canCreateManagedChatWindow, orderedPills.length],
  );
  const dockStripReservedWidthPx = resolveDockStripReservedWidthPx({
    nonClosedChatCount: nonClosedPills.length,
    showManagerMenu: showDockManagerMenu,
  });

  const dockSurfaceAvailableWidthPx = useMemo(() => {
    const fallbackViewportWidth =
      DOCK_SURFACE_MAX_WIDTH_PX +
      dockSurfaceLeftPx * 2 +
      dockStripReservedWidthPx;
    const resolvedViewportWidth =
      viewportWidthPx > 0 ? viewportWidthPx : fallbackViewportWidth;
    const usableViewportWidthPx =
      resolvedViewportWidth - dockSurfaceLeftPx * 2 - dockStripReservedWidthPx;
    return clampNumber(usableViewportWidthPx, 0, DOCK_SURFACE_MAX_WIDTH_PX);
  }, [dockStripReservedWidthPx, dockSurfaceLeftPx, viewportWidthPx]);

  const baseDockWindowWidthsById = useMemo(() => {
    const nextWidthsById: Record<string, number> = {};
    for (const pill of openDockedPills) {
      const candidateWidthPx =
        typeof pill.dockPreferredWidthPx === "number" &&
        Number.isFinite(pill.dockPreferredWidthPx) &&
        pill.dockPreferredWidthPx > 0
          ? pill.dockPreferredWidthPx
          : DOCK_WINDOW_DEFAULT_WIDTH_PX;
      nextWidthsById[pill.instanceId] = clampNumber(
        candidateWidthPx,
        MIN_DOCK_CHAT_WIDTH_PX,
        DOCK_SURFACE_MAX_WIDTH_PX,
      );
    }
    return nextWidthsById;
  }, [openDockedPills]);

  const baseDockWindowHeightsById = useMemo(() => {
    const nextHeightsById: Record<string, number> = {};
    for (const pill of openDockedPills) {
      const candidateHeightPx =
        typeof pill.bounds.height === "number" &&
        Number.isFinite(pill.bounds.height) &&
        pill.bounds.height > 0
          ? pill.bounds.height
          : DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      const shouldUseAutoFillHeight =
        Math.abs(candidateHeightPx - DOCK_WINDOW_DEFAULT_HEIGHT_PX) <= 0.5;
      const resolvedHeightPx = shouldUseAutoFillHeight
        ? defaultDockWindowHeightPx
        : candidateHeightPx;
      nextHeightsById[pill.instanceId] = clampNumber(
        resolvedHeightPx,
        MIN_DOCK_CHAT_HEIGHT_PX,
        dockAvailableHeightPx,
      );
    }
    return nextHeightsById;
  }, [defaultDockWindowHeightPx, dockAvailableHeightPx, openDockedPills]);

  const resolvedDockWindowWidthsById = useMemo(() => {
    const nextWidthsById: Record<string, number> = {
      ...baseDockWindowWidthsById,
    };
    for (const [instanceId, previewWidthPx] of Object.entries(
      dockPreviewWidthsById,
    )) {
      if (!nextWidthsById[instanceId]) {
        continue;
      }
      nextWidthsById[instanceId] = clampNumber(
        previewWidthPx,
        MIN_DOCK_CHAT_WIDTH_PX,
        DOCK_SURFACE_MAX_WIDTH_PX,
      );
    }
    return nextWidthsById;
  }, [baseDockWindowWidthsById, dockPreviewWidthsById]);

  const resolvedDockWindowHeightsById = useMemo(() => {
    const nextHeightsById: Record<string, number> = {
      ...baseDockWindowHeightsById,
    };
    for (const [instanceId, previewHeightPx] of Object.entries(
      dockPreviewHeightsById,
    )) {
      if (!nextHeightsById[instanceId]) {
        continue;
      }
      nextHeightsById[instanceId] = clampNumber(
        previewHeightPx,
        MIN_DOCK_CHAT_HEIGHT_PX,
        dockAvailableHeightPx,
      );
    }
    return nextHeightsById;
  }, [
    baseDockWindowHeightsById,
    dockAvailableHeightPx,
    dockPreviewHeightsById,
  ]);

  const dockedWindowIdsKey = useMemo(
    () => openDockedPills.map((pill) => pill.instanceId).join("|"),
    [openDockedPills],
  );
  const maxVisibleDockedCount = useMemo(
    () =>
      resolveMaxVisibleDockWindowCount(
        openDockedPills.length,
        dockSurfaceAvailableWidthPx,
      ),
    [dockSurfaceAvailableWidthPx, openDockedPills.length],
  );
  const { maxDockCycleOffset, dockVisibleStartIndex, visibleDockedPills } =
    useMemo(() => {
      const nextMaxDockCycleOffset = Math.max(
        0,
        openDockedPills.length - maxVisibleDockedCount,
      );
      const nextDockVisibleStartIndex =
        maxVisibleDockedCount === 0
          ? openDockedPills.length
          : Math.max(0, nextMaxDockCycleOffset - dockCycleOffsetFromEnd);
      return {
        maxDockCycleOffset: nextMaxDockCycleOffset,
        dockVisibleStartIndex: nextDockVisibleStartIndex,
        visibleDockedPills:
          maxVisibleDockedCount === 0
            ? ([] as ResolvedWindowPill[])
            : openDockedPills.slice(
                nextDockVisibleStartIndex,
                nextDockVisibleStartIndex + maxVisibleDockedCount,
              ),
      };
    }, [dockCycleOffsetFromEnd, maxVisibleDockedCount, openDockedPills]);

  const responsiveHiddenDockedIds = useMemo(() => {
    const visibleIds = new Set(
      visibleDockedPills.map((pill) => pill.instanceId),
    );
    return new Set(
      openDockedPills
        .filter((pill) => !visibleIds.has(pill.instanceId))
        .map((pill) => pill.instanceId),
    );
  }, [openDockedPills, visibleDockedPills]);
  const stripPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          pill.isMinimized || responsiveHiddenDockedIds.has(pill.instanceId),
      ),
    [orderedPills, responsiveHiddenDockedIds],
  );
  const resolvedVisibleDockWindowWidthsById = useMemo(
    () =>
      resolveDockWindowWidthsToFit(
        visibleDockedPills,
        resolvedDockWindowWidthsById,
        dockSurfaceAvailableWidthPx,
      ),
    [
      dockSurfaceAvailableWidthPx,
      resolvedDockWindowWidthsById,
      visibleDockedPills,
    ],
  );

  useEffect(() => {
    activeSingleDockResizeRef.current = null;
    const allowedDockedWindowIds = new Set(
      dockedWindowIdsKey
        .split("|")
        .map((windowId) => windowId.trim())
        .filter((windowId) => windowId.length > 0),
    );
    setDockPreviewWidthsById((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [instanceId, previewWidthPx] of Object.entries(current)) {
        if (!allowedDockedWindowIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = previewWidthPx;
      }
      return changed ? next : current;
    });
    setDockPreviewHeightsById((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [instanceId, previewHeightPx] of Object.entries(current)) {
        if (!allowedDockedWindowIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = previewHeightPx;
      }
      return changed ? next : current;
    });
  }, [
    activeSingleDockResizeRef,
    dockedWindowIdsKey,
    setDockPreviewHeightsById,
    setDockPreviewWidthsById,
  ]);

  useEffect(() => {
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current, 0, maxDockCycleOffset),
    );
  }, [maxDockCycleOffset, setDockCycleOffsetFromEnd]);

  useEffect(() => {
    if (hasOverlayWindows) {
      return;
    }
    setIsCanvasVisibilitySuppressed(false);
  }, [hasOverlayWindows, setIsCanvasVisibilitySuppressed]);

  const {
    showDockedChatSurface,
    showCanvasVisibilityToggle,
    showStandaloneMinimizedPills,
  } = useMemo(() => {
    const nextShowDockedChatSurface =
      visibleDockedPills.length > 0 && !isCanvasVisibilitySuppressed;
    return {
      showDockedChatSurface: nextShowDockedChatSurface,
      showCanvasVisibilityToggle:
        isCanvasVisibilitySuppressed || openMaximizedWindow !== null,
      showStandaloneMinimizedPills: !nextShowDockedChatSurface,
    };
  }, [
    isCanvasVisibilitySuppressed,
    openMaximizedWindow,
    visibleDockedPills.length,
  ]);

  const dockSurfaceTargetWidthPx = useMemo(() => {
    if (visibleDockedPills.length === 0) {
      return 0;
    }
    let totalWindowWidthsPx = 0;
    for (const pill of visibleDockedPills) {
      totalWindowWidthsPx +=
        resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_WIDTH_PX;
    }
    const totalGapWidthPx =
      Math.max(0, visibleDockedPills.length - 1) * DOCK_WINDOW_GAP_PX;
    const rowPaddingWidthPx = DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    const targetWidthPx =
      totalWindowWidthsPx + totalGapWidthPx + rowPaddingWidthPx;
    return clampNumber(targetWidthPx, 0, DOCK_SURFACE_MAX_WIDTH_PX);
  }, [resolvedVisibleDockWindowWidthsById, visibleDockedPills]);

  const dockSurfaceTargetHeightPx = useMemo(() => {
    if (visibleDockedPills.length === 0) {
      return MIN_DOCK_CHAT_HEIGHT_PX;
    }
    let maxHeightPx = MIN_DOCK_CHAT_HEIGHT_PX;
    for (const pill of visibleDockedPills) {
      const nextHeightPx =
        resolvedDockWindowHeightsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      if (nextHeightPx > maxHeightPx) {
        maxHeightPx = nextHeightPx;
      }
    }
    return clampNumber(
      maxHeightPx,
      MIN_DOCK_CHAT_HEIGHT_PX,
      dockAvailableHeightPx,
    );
  }, [
    dockAvailableHeightPx,
    resolvedDockWindowHeightsById,
    visibleDockedPills,
  ]);

  const dockSurfaceWidthCss = useMemo(() => {
    if (dockSurfaceTargetWidthPx <= 0) {
      return "0px";
    }
    return `min(${dockSurfaceTargetWidthPx}px, ${DOCK_SURFACE_MAX_WIDTH_PX}px, calc(100vw - ${dockSurfaceLeftPx * 2 + dockStripReservedWidthPx}px))`;
  }, [dockStripReservedWidthPx, dockSurfaceLeftPx, dockSurfaceTargetWidthPx]);

  const dockSurfaceHeightCss = useMemo(() => {
    const topBottomReservedPx = workspaceTopInsetPx + dockBottomOffsetPx;
    return `min(${dockSurfaceTargetHeightPx}px, calc(100vh - ${topBottomReservedPx}px))`;
  }, [dockBottomOffsetPx, dockSurfaceTargetHeightPx, workspaceTopInsetPx]);

  const handleCycleDockWindowsBackward = useCallback(() => {
    if (dockVisibleStartIndex <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex - 1;
    const focusTargetId = openDockedPills[nextStartIndex]?.instanceId;
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current + 1, 0, maxDockCycleOffset),
    );
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockVisibleStartIndex,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    openDockedPills,
    setDockCycleOffsetFromEnd,
  ]);

  const handleCycleDockWindowsForward = useCallback(() => {
    if (dockCycleOffsetFromEnd <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex + 1;
    const focusTargetId =
      openDockedPills[nextStartIndex + maxVisibleDockedCount - 1]?.instanceId;
    setDockCycleOffsetFromEnd((current) => Math.max(0, current - 1));
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockCycleOffsetFromEnd,
    dockVisibleStartIndex,
    maxVisibleDockedCount,
    openDockedPills,
    setDockCycleOffsetFromEnd,
  ]);

  const handleSingleDockResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      pill: ResolvedWindowPill,
      direction: WindowResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const panelNode = event.currentTarget.closest(
        `[data-chat-window-instance-id="${pill.instanceId}"]`,
      );
      const panelBounds = panelNode?.getBoundingClientRect();
      const viewport = getViewportDimensions();
      const { startWidthPx, startHeightPx, maxHeightPx } =
        resolveSingleDockResizeMetrics({
          panelBounds,
          resolvedWidthPx: resolvedDockWindowWidthsById[pill.instanceId],
          resolvedHeightPx: resolvedDockWindowHeightsById[pill.instanceId],
          viewportHeightPx: viewport?.height ?? null,
          workspaceTopInsetPx,
          dockBottomOffsetPx,
          dockAvailableHeightPx,
          defaultWidthPx: DOCK_WINDOW_DEFAULT_WIDTH_PX,
          defaultHeightPx: DOCK_WINDOW_DEFAULT_HEIGHT_PX,
          minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
        });
      activeSingleDockResizeRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startWidthPx,
        startHeightPx,
        lastWidthPx: startWidthPx,
        lastHeightPx: startHeightPx,
        minWidthPx: MIN_DOCK_CHAT_WIDTH_PX,
        maxWidthPx: DOCK_SURFACE_MAX_WIDTH_PX,
        minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
        maxHeightPx,
      };
      setDockPreviewWidthsById((current) => ({
        ...current,
        [pill.instanceId]: startWidthPx,
      }));
      setDockPreviewHeightsById((current) => ({
        ...current,
        [pill.instanceId]: startHeightPx,
      }));
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeSingleDockResizeRef,
      dockAvailableHeightPx,
      dockBottomOffsetPx,
      resolvedDockWindowHeightsById,
      resolvedDockWindowWidthsById,
      setDockPreviewHeightsById,
      setDockPreviewWidthsById,
      workspaceTopInsetPx,
    ],
  );

  const handleSingleDockResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
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
      let nextWidthPx = activeResize.startWidthPx;
      let nextHeightPx = activeResize.startHeightPx;
      if (resizingLeft) {
        nextWidthPx = activeResize.startWidthPx - deltaX;
      } else if (resizingRight) {
        nextWidthPx = activeResize.startWidthPx + deltaX;
      }
      if (resizingTop) {
        nextHeightPx = activeResize.startHeightPx - deltaY;
      } else if (resizingBottom) {
        nextHeightPx = activeResize.startHeightPx + deltaY;
      }
      nextWidthPx = clampNumber(
        nextWidthPx,
        activeResize.minWidthPx,
        activeResize.maxWidthPx,
      );
      nextHeightPx = clampNumber(
        nextHeightPx,
        activeResize.minHeightPx,
        activeResize.maxHeightPx,
      );
      activeResize.lastWidthPx = nextWidthPx;
      activeResize.lastHeightPx = nextHeightPx;
      setDockPreviewWidthsById((current) => {
        if (current[activeResize.instanceId] === nextWidthPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextWidthPx,
        };
      });
      setDockPreviewHeightsById((current) => {
        if (current[activeResize.instanceId] === nextHeightPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextHeightPx,
        };
      });
    },
    [
      activeSingleDockResizeRef,
      setDockPreviewHeightsById,
      setDockPreviewWidthsById,
    ],
  );

  const handleSingleDockResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowDockFractions({
        widthFractionsByInstanceId: {
          [activeResize.instanceId]: 1,
        },
        dockContainerWidthPx: activeResize.lastWidthPx,
      });
      setProjectChatWindowBounds(activeResize.instanceId, {
        height: activeResize.lastHeightPx,
      });
      setDockPreviewWidthsById((current) => {
        if (!(activeResize.instanceId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[activeResize.instanceId];
        return next;
      });
      setDockPreviewHeightsById((current) => {
        if (!(activeResize.instanceId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[activeResize.instanceId];
        return next;
      });
      activeSingleDockResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [
      activeSingleDockResizeRef,
      setDockPreviewHeightsById,
      setDockPreviewWidthsById,
    ],
  );

  useLayoutEffect(() => {
    const viewportNode = pillViewportRef.current;
    const fullMeasureNode = fullMeasureRowRef.current;
    const compactMeasureNode = compactMeasureRowRef.current;
    if (!viewportNode || !fullMeasureNode || !compactMeasureNode) {
      return;
    }
    const availableWidthPx = viewportNode.clientWidth;
    if (availableWidthPx <= 0) {
      return;
    }
    const fullWidthPx = fullMeasureNode.scrollWidth;
    const compactWidthPx = compactMeasureNode.scrollWidth;
    const nextMode = resolveNextPillDisplayMode({
      currentMode: pillDisplayMode,
      stripPillCount: stripPills.length,
      viewportWidthPx,
      availableWidthPx,
      fullWidthPx,
      compactWidthPx,
    });
    if (nextMode !== pillDisplayMode) {
      setPillDisplayMode(nextMode);
    }
  }, [
    compactMeasureRowRef,
    fullMeasureRowRef,
    pillDisplayMode,
    pillViewportRef,
    pillViewportWidthPx,
    setPillDisplayMode,
    stripPills.length,
    viewportWidthPx,
  ]);

  const cycleVisibleCount = useMemo(() => {
    if (stripPills.length === 0) {
      return 0;
    }
    if (pillDisplayMode !== "cycle") {
      return stripPills.length;
    }
    if (pillViewportWidthPx <= 0) {
      return 1;
    }
    const availablePillsWidthPx = Math.max(
      0,
      pillViewportWidthPx -
        CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 -
        PILL_GAP_PX * 2 -
        COMPACT_PILL_WIDTH_PX -
        PILL_GAP_PX,
    );
    const compactSlotWidthPx = COMPACT_PILL_WIDTH_PX + PILL_GAP_PX;
    const nextVisibleCount = Math.floor(
      (availablePillsWidthPx + PILL_GAP_PX) / compactSlotWidthPx,
    );
    return clampNumber(nextVisibleCount, 1, stripPills.length);
  }, [pillDisplayMode, pillViewportWidthPx, stripPills.length]);

  useEffect(() => {
    const maxStartIndex = Math.max(0, stripPills.length - cycleVisibleCount);
    setPillCycleStartIndex((current) => clampNumber(current, 0, maxStartIndex));
  }, [cycleVisibleCount, setPillCycleStartIndex, stripPills.length]);

  const visiblePills = useMemo(() => {
    if (pillDisplayMode !== "cycle") {
      return stripPills;
    }
    return stripPills.slice(
      pillCycleStartIndex,
      pillCycleStartIndex + cycleVisibleCount,
    );
  }, [cycleVisibleCount, pillCycleStartIndex, pillDisplayMode, stripPills]);

  const {
    maxCycleStartIndex,
    canCycleBackward,
    canCycleForward,
    useCompactPills,
    showDockHeaderCycleControls,
    canCycleDockBackward,
    canCycleDockForward,
  } = useMemo(() => {
    const nextMaxCycleStartIndex = Math.max(
      0,
      stripPills.length - cycleVisibleCount,
    );
    return {
      maxCycleStartIndex: nextMaxCycleStartIndex,
      canCycleBackward: pillDisplayMode === "cycle" && pillCycleStartIndex > 0,
      canCycleForward:
        pillDisplayMode === "cycle" &&
        pillCycleStartIndex < nextMaxCycleStartIndex,
      useCompactPills:
        pillDisplayMode === "compact" || pillDisplayMode === "cycle",
      showDockHeaderCycleControls:
        openDockedPills.length > visibleDockedPills.length &&
        visibleDockedPills.length > 0,
      canCycleDockBackward: dockVisibleStartIndex > 0,
      canCycleDockForward: dockCycleOffsetFromEnd > 0,
    };
  }, [
    cycleVisibleCount,
    dockCycleOffsetFromEnd,
    dockVisibleStartIndex,
    openDockedPills.length,
    pillCycleStartIndex,
    pillDisplayMode,
    stripPills.length,
    visibleDockedPills.length,
  ]);

  const handlePillCycleBackward = useCallback(() => {
    setPillCycleStartIndex((current) => Math.max(0, current - 1));
  }, [setPillCycleStartIndex]);

  const handlePillCycleForward = useCallback(() => {
    setPillCycleStartIndex((current) =>
      Math.min(maxCycleStartIndex, current + 1),
    );
  }, [maxCycleStartIndex, setPillCycleStartIndex]);

  const handleToggleCanvasVisibility = useCallback(() => {
    setIsCanvasVisibilitySuppressed((current) => !current);
  }, [setIsCanvasVisibilitySuppressed]);

  return {
    canCycleBackward,
    canCycleDockBackward,
    canCycleDockForward,
    canCycleForward,
    dockAvailableHeightPx,
    dockSurfaceHeightCss,
    dockSurfaceLeftPx,
    dockSurfaceRightPx,
    dockSurfaceWidthCss,
    dockVisibleStartIndex,
    handleCycleDockWindowsBackward,
    handleCycleDockWindowsForward,
    handlePillCycleBackward,
    handlePillCycleForward,
    handleSingleDockResizePointerDown,
    handleSingleDockResizePointerMove,
    handleSingleDockResizePointerUp,
    handleToggleCanvasVisibility,
    maxCycleStartIndex,
    maxVisibleDockedCount,
    resolvedDockWindowHeightsById,
    resolvedVisibleDockWindowWidthsById,
    showCanvasVisibilityToggle,
    showDockHeaderCycleControls,
    showDockManagerMenu,
    showDockedChatSurface,
    showStandaloneMinimizedPills,
    stripPills,
    useCompactPills,
    visibleDockedPills,
    visiblePills,
  };
}
