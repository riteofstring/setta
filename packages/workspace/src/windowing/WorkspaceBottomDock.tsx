import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { WorkspaceBottomDockPanelRow } from "./WorkspaceBottomDockPanelRow";
import { WorkspaceBottomDockRecoveryStrip } from "./WorkspaceBottomDockRecoveryStrip";
import {
  resolveWorkspaceBottomDockViewport,
  resolveWorkspaceBottomDockVisibility,
} from "./workspaceBottomDockGeometry";
import type { WorkspaceWindowDockLayoutUpdate } from "./windowingState";
import type {
  WorkspaceBottomDockRenderWindowOptions,
  WorkspaceBottomDockResizeDirection,
} from "./workspaceBottomDockInternal";
import {
  resolveNextWorkspaceBottomDockPillDisplayMode,
  resolveWorkspaceBottomDockWindowWidthsToFit,
  WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX,
  WORKSPACE_BOTTOM_DOCK_CYCLE_CONTROL_BUTTON_WIDTH_PX,
  WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX,
  WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX,
  WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX,
  WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX,
  WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX,
  WORKSPACE_BOTTOM_DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX,
  type WorkspaceBottomDockPillDisplayMode,
} from "./workspaceBottomDockLayout";
import type {
  WorkspaceFloatingWindow,
  WorkspaceWindowViewport,
} from "./windowingTypes";

const WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX = 220;
const WORKSPACE_BOTTOM_DOCK_DEFAULT_HEIGHT_FRACTION = 0.7;

/**
 * The dock stays content-neutral. The integrated manager can map this callback
 * to its generic chrome or the package section-window surface without a dock
 * dependency on either owner.
 */
export type WorkspaceBottomDockRenderWindow = (
  window: WorkspaceFloatingWindow,
  options: WorkspaceBottomDockRenderWindowOptions,
) => ReactNode;

export type WorkspaceBottomDockProps = {
  readonly windows: readonly WorkspaceFloatingWindow[];
  readonly viewport: WorkspaceWindowViewport | null;
  readonly layoutEditable: boolean;
  readonly renderWindow: WorkspaceBottomDockRenderWindow;
  readonly onFocusWindow: (windowId: string) => void;
  readonly onReopenWindow: (windowId: string) => void;
  readonly onMoveWindowToCanvasSection: (windowId: string) => void;
  readonly onMoveWindowToFloating: (windowId: string) => void;
  readonly onMaximizeWindow: (windowId: string) => void;
  readonly onMinimizeWindow: (windowId: string) => void;
  readonly onCloseWindow: (windowId: string) => void;
  /** Receives exactly one complete dock layout candidate on a resize release. */
  readonly onDockLayoutCommit: (
    updates: readonly WorkspaceWindowDockLayoutUpdate[],
  ) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly zIndex?: number;
};

type DockPreviewSize = {
  readonly height: number;
  readonly width: number;
};

type ActiveDockResize = {
  readonly pointerId: number;
  readonly window: WorkspaceFloatingWindow;
  readonly direction: WorkspaceBottomDockResizeDirection;
  readonly startX: number;
  readonly startY: number;
  readonly startWidth: number;
  readonly startHeight: number;
  readonly maximumHeight: number;
  lastHeight: number;
  lastWidth: number;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined | false>
): string {
  return classNames.filter(Boolean).join(" ");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isOpenDockedWindow(window: WorkspaceFloatingWindow): boolean {
  return (
    window.placement === "bottom_docked" &&
    !window.isClosed &&
    !window.isMinimized
  );
}

function isRecoverableWindow(window: WorkspaceFloatingWindow): boolean {
  return !window.isClosed && window.isMinimized;
}

function getTopWindowId(
  windows: readonly WorkspaceFloatingWindow[],
): string | null {
  let top: WorkspaceFloatingWindow | null = null;
  for (const window of windows) {
    if (!top || window.zIndex > top.zIndex) top = window;
  }
  return top?.id ?? null;
}

function getDockedWindowHeight(
  window: WorkspaceFloatingWindow,
  preview: DockPreviewSize | undefined,
  availableHeight: number,
): number {
  const defaultHeight = clamp(
    availableHeight * WORKSPACE_BOTTOM_DOCK_DEFAULT_HEIGHT_FRACTION,
    WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
    availableHeight,
  );
  const candidate = preview?.height ?? window.bounds.height;
  return clamp(
    Number.isFinite(candidate) && candidate > 0 ? candidate : defaultHeight,
    WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
    availableHeight,
  );
}

function estimateFullPillWidth(window: WorkspaceFloatingWindow): number {
  return clamp(40 + window.title.length * 7, 72, 184);
}

function resizeDirectionIncludes(
  direction: WorkspaceBottomDockResizeDirection,
  side: "left" | "right" | "top" | "bottom",
): boolean {
  return direction === side || direction.includes(side);
}

/**
 * A controlled, content-neutral bottom dock. It owns only responsive panel
 * selection and local resize previews; every persistent state transition is
 * reported through one caller-provided callback.
 */
export function WorkspaceBottomDock({
  ariaLabel = "Workspace bottom dock",
  className,
  layoutEditable,
  onCloseWindow,
  onDockLayoutCommit,
  onFocusWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onMoveWindowToCanvasSection,
  onMoveWindowToFloating,
  onReopenWindow,
  renderWindow,
  viewport,
  windows,
  zIndex,
}: WorkspaceBottomDockProps) {
  const { insets, usableHeight, viewportWidth, workWidth } =
    resolveWorkspaceBottomDockViewport(viewport);
  const openDockedWindows = useMemo(
    () => windows.filter(isOpenDockedWindow),
    [windows],
  );
  const nonClosedWindowCount = useMemo(
    () => windows.filter((window) => !window.isClosed).length,
    [windows],
  );
  const showManager = windows.length > 0;
  const [dockCycleOffsetFromEnd, setDockCycleOffsetFromEnd] = useState(0);
  const [pillCycleStartIndex, setPillCycleStartIndex] = useState(0);
  const [pillDisplayMode, setPillDisplayMode] =
    useState<WorkspaceBottomDockPillDisplayMode>("full");
  const [previewSizeById, setPreviewSizeById] = useState<
    Readonly<Record<string, DockPreviewSize>>
  >({});
  const activeDockResizeRef = useRef<ActiveDockResize | null>(null);
  const previewSizeRef = useRef<Readonly<Record<string, DockPreviewSize>>>({});
  const previewAnimationFrameRef = useRef<number | null>(null);
  const pendingRevealWindowIdRef = useRef<string | null>(null);
  const {
    dockAvailableWidth,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    visibleDockedStartIndex,
    visibleDockedWindows,
  } = resolveWorkspaceBottomDockVisibility({
    dockCycleOffsetFromEnd,
    nonClosedWindowCount,
    openDockedWindows,
    showManager,
    workWidth,
  });

  useEffect(() => {
    setDockCycleOffsetFromEnd((current) =>
      clamp(current, 0, maxDockCycleOffset),
    );
  }, [maxDockCycleOffset]);

  const hiddenDockedWindowIds = useMemo(
    () =>
      new Set(
        openDockedWindows
          .filter(
            (window) =>
              !visibleDockedWindows.some(
                (visibleWindow) => visibleWindow.id === window.id,
              ),
          )
          .map((window) => window.id),
      ),
    [openDockedWindows, visibleDockedWindows],
  );
  const recoveryWindows = useMemo(
    () =>
      windows.filter(
        (window) =>
          isRecoverableWindow(window) || hiddenDockedWindowIds.has(window.id),
      ),
    [hiddenDockedWindowIds, windows],
  );

  const desiredWidthsById = useMemo(() => {
    const widths: Record<string, number> = {};
    for (const window of visibleDockedWindows) {
      widths[window.id] =
        previewSizeById[window.id]?.width ??
        window.dockMetrics.preferredWidthPx ??
        WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX;
    }
    return widths;
  }, [previewSizeById, visibleDockedWindows]);
  const resolvedWidthsById = useMemo(
    () =>
      resolveWorkspaceBottomDockWindowWidthsToFit(
        visibleDockedWindows,
        desiredWidthsById,
        dockAvailableWidth,
      ),
    [desiredWidthsById, dockAvailableWidth, visibleDockedWindows],
  );
  const resolvedHeightsById = useMemo(() => {
    const heights: Record<string, number> = {};
    for (const window of visibleDockedWindows) {
      heights[window.id] = getDockedWindowHeight(
        window,
        previewSizeById[window.id],
        usableHeight,
      );
    }
    return heights;
  }, [previewSizeById, usableHeight, visibleDockedWindows]);
  const panelTargetWidth = useMemo(
    () =>
      visibleDockedWindows.reduce(
        (total, window) =>
          total +
          (resolvedWidthsById[window.id] ??
            WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX),
        Math.max(0, visibleDockedWindows.length - 1) *
          WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX +
          WORKSPACE_BOTTOM_DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2,
      ),
    [resolvedWidthsById, visibleDockedWindows],
  );
  const panelTargetHeight = useMemo(
    () =>
      visibleDockedWindows.reduce(
        (maximum, window) =>
          Math.max(
            maximum,
            resolvedHeightsById[window.id] ??
              WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
          ),
        WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
      ),
    [resolvedHeightsById, visibleDockedWindows],
  );

  const stripAvailableWidth = Math.max(
    0,
    workWidth -
      (visibleDockedWindows.length > 0
        ? panelTargetWidth + WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX
        : 0),
  );
  const fullPillWidth = useMemo(
    () =>
      recoveryWindows.reduce(
        (total, window) => total + estimateFullPillWidth(window),
        Math.max(0, recoveryWindows.length - 1) *
          WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX,
      ),
    [recoveryWindows],
  );
  const compactPillWidth =
    recoveryWindows.length * WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX +
    Math.max(0, recoveryWindows.length - 1) * WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX;

  useEffect(() => {
    setPillDisplayMode((current) =>
      resolveNextWorkspaceBottomDockPillDisplayMode({
        availableWidthPx: stripAvailableWidth,
        compactWidthPx: compactPillWidth,
        currentMode: current,
        fullWidthPx: fullPillWidth,
        stripPillCount: recoveryWindows.length,
        viewportWidthPx: viewportWidth,
      }),
    );
  }, [
    compactPillWidth,
    fullPillWidth,
    recoveryWindows.length,
    stripAvailableWidth,
    viewportWidth,
  ]);

  const cycleVisiblePillCount = useMemo(() => {
    if (recoveryWindows.length === 0) return 0;
    if (pillDisplayMode !== "cycle") return recoveryWindows.length;
    const availablePillWidth = Math.max(
      0,
      stripAvailableWidth -
        WORKSPACE_BOTTOM_DOCK_CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 -
        WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX * 3,
    );
    return clamp(
      Math.floor(
        (availablePillWidth + WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX) /
          (WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX +
            WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX),
      ),
      1,
      recoveryWindows.length,
    );
  }, [pillDisplayMode, recoveryWindows.length, stripAvailableWidth]);
  const maxPillCycleStartIndex = Math.max(
    0,
    recoveryWindows.length - cycleVisiblePillCount,
  );

  useEffect(() => {
    setPillCycleStartIndex((current) =>
      clamp(current, 0, maxPillCycleStartIndex),
    );
  }, [maxPillCycleStartIndex]);

  const visibleRecoveryWindows = useMemo(() => {
    if (pillDisplayMode === "menu") return [];
    if (pillDisplayMode !== "cycle") return recoveryWindows;
    return recoveryWindows.slice(
      pillCycleStartIndex,
      pillCycleStartIndex + cycleVisiblePillCount,
    );
  }, [
    cycleVisiblePillCount,
    pillCycleStartIndex,
    pillDisplayMode,
    recoveryWindows,
  ]);

  const focusDockedWindow = useCallback(
    (windowId: string) => {
      if (maxVisibleDockedCount > 0) {
        const targetIndex = openDockedWindows.findIndex(
          (window) => window.id === windowId,
        );
        if (targetIndex >= 0) {
          const visibleEndIndex =
            visibleDockedStartIndex + maxVisibleDockedCount;
          const nextStartIndex =
            targetIndex < visibleDockedStartIndex
              ? targetIndex
              : targetIndex >= visibleEndIndex
                ? targetIndex - maxVisibleDockedCount + 1
                : visibleDockedStartIndex;
          setDockCycleOffsetFromEnd(
            maxDockCycleOffset - clamp(nextStartIndex, 0, maxDockCycleOffset),
          );
        }
      }
      onFocusWindow(windowId);
    },
    [
      maxDockCycleOffset,
      maxVisibleDockedCount,
      onFocusWindow,
      openDockedWindows,
      visibleDockedStartIndex,
    ],
  );

  useEffect(() => {
    const pendingWindowId = pendingRevealWindowIdRef.current;
    if (!pendingWindowId) return;
    const openedWindow = windows.find(
      (window) => window.id === pendingWindowId,
    );
    if (!openedWindow || openedWindow.isClosed || openedWindow.isMinimized) {
      return;
    }
    pendingRevealWindowIdRef.current = null;
    if (openedWindow.placement === "bottom_docked") {
      focusDockedWindow(pendingWindowId);
      return;
    }
    if (openedWindow.placement !== "canvas_section") {
      onFocusWindow(pendingWindowId);
    }
  }, [focusDockedWindow, onFocusWindow, windows]);

  const openRecoveryWindow = useCallback(
    (window: WorkspaceFloatingWindow) => {
      if (window.isClosed || window.isMinimized) {
        pendingRevealWindowIdRef.current = window.id;
        onReopenWindow(window.id);
        return;
      }
      if (window.placement === "bottom_docked") {
        focusDockedWindow(window.id);
        return;
      }
      onFocusWindow(window.id);
    },
    [focusDockedWindow, onFocusWindow, onReopenWindow],
  );

  const cycleDockedBackward = useCallback(() => {
    if (visibleDockedStartIndex <= 0 || maxVisibleDockedCount <= 0) return;
    const target = openDockedWindows[visibleDockedStartIndex - 1];
    setDockCycleOffsetFromEnd((current) =>
      clamp(current + 1, 0, maxDockCycleOffset),
    );
    if (target) onFocusWindow(target.id);
  }, [
    maxDockCycleOffset,
    maxVisibleDockedCount,
    onFocusWindow,
    openDockedWindows,
    visibleDockedStartIndex,
  ]);
  const cycleDockedForward = useCallback(() => {
    if (dockCycleOffsetFromEnd <= 0 || maxVisibleDockedCount <= 0) return;
    const target =
      openDockedWindows[visibleDockedStartIndex + maxVisibleDockedCount];
    setDockCycleOffsetFromEnd((current) => Math.max(0, current - 1));
    if (target) onFocusWindow(target.id);
  }, [
    dockCycleOffsetFromEnd,
    maxVisibleDockedCount,
    onFocusWindow,
    openDockedWindows,
    visibleDockedStartIndex,
  ]);

  const queuePreviewSize = useCallback(
    (windowId: string, size: DockPreviewSize) => {
      previewSizeRef.current = {
        ...previewSizeRef.current,
        [windowId]: size,
      };
      if (previewAnimationFrameRef.current !== null) return;
      const flush = () => {
        previewAnimationFrameRef.current = null;
        setPreviewSizeById(previewSizeRef.current);
      };
      if (typeof globalThis.requestAnimationFrame === "function") {
        previewAnimationFrameRef.current =
          globalThis.requestAnimationFrame(flush);
        return;
      }
      flush();
    },
    [],
  );

  const clearPreviewSize = useCallback((windowId: string) => {
    const current = previewSizeRef.current;
    if (!(windowId in current)) return;
    const next = { ...current };
    delete next[windowId];
    previewSizeRef.current = next;
    setPreviewSizeById(next);
  }, []);

  useEffect(
    () => () => {
      if (previewAnimationFrameRef.current !== null) {
        globalThis.cancelAnimationFrame?.(previewAnimationFrameRef.current);
      }
    },
    [],
  );

  const beginDockResize = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      window: WorkspaceFloatingWindow,
      direction: WorkspaceBottomDockResizeDirection,
    ) => {
      if (!layoutEditable || event.button !== 0) return;
      const startWidth =
        resolvedWidthsById[window.id] ??
        window.dockMetrics.preferredWidthPx ??
        WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX;
      const startHeight =
        resolvedHeightsById[window.id] ??
        getDockedWindowHeight(window, undefined, usableHeight);
      activeDockResizeRef.current = {
        direction,
        lastHeight: startHeight,
        lastWidth: startWidth,
        maximumHeight: usableHeight,
        pointerId: event.pointerId,
        startHeight,
        startWidth,
        startX: event.clientX,
        startY: event.clientY,
        window,
      };
      queuePreviewSize(window.id, { height: startHeight, width: startWidth });
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [
      layoutEditable,
      queuePreviewSize,
      resolvedHeightsById,
      resolvedWidthsById,
      usableHeight,
    ],
  );

  const updateDockResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const active = activeDockResizeRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - active.startX;
      const deltaY = event.clientY - active.startY;
      let width = active.startWidth;
      let height = active.startHeight;
      if (resizeDirectionIncludes(active.direction, "left")) {
        width -= deltaX;
      } else if (resizeDirectionIncludes(active.direction, "right")) {
        width += deltaX;
      }
      if (resizeDirectionIncludes(active.direction, "top")) {
        height -= deltaY;
      } else if (resizeDirectionIncludes(active.direction, "bottom")) {
        height += deltaY;
      }
      active.lastWidth = clamp(
        width,
        WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX,
        WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX,
      );
      active.lastHeight = clamp(
        height,
        WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
        active.maximumHeight,
      );
      queuePreviewSize(active.window.id, {
        height: active.lastHeight,
        width: active.lastWidth,
      });
    },
    [queuePreviewSize],
  );

  const finishDockResize = useCallback(
    (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
      const active = activeDockResizeRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      activeDockResizeRef.current = null;
      if (commit) {
        const widthFraction = clamp(
          active.lastWidth / Math.max(1, dockAvailableWidth),
          Number.EPSILON,
          1,
        );
        onDockLayoutCommit([
          {
            bounds: {
              ...active.window.bounds,
              height: active.lastHeight,
              width: active.lastWidth,
            },
            dockMetrics: {
              preferredWidthPx: active.lastWidth,
              widthFraction,
            },
            id: active.window.id,
          },
        ]);
      }
      clearPreviewSize(active.window.id);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [clearPreviewSize, dockAvailableWidth, onDockLayoutCommit],
  );

  const focusedDockedWindowId = getTopWindowId(openDockedWindows);
  const showHeaderCycleControls =
    visibleDockedWindows.length > 0 &&
    openDockedWindows.length > visibleDockedWindows.length;
  const resizeHandlers = {
    begin: beginDockResize,
    finish: finishDockResize,
    update: updateDockResize,
  };
  const showPreviousPills = () => {
    setPillCycleStartIndex((current) => Math.max(0, current - 1));
  };
  const showNextPills = () => {
    setPillCycleStartIndex((current) =>
      Math.min(maxPillCycleStartIndex, current + 1),
    );
  };

  if (!showManager && visibleDockedWindows.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      className={joinClassNames("setta-workspace-bottom-dock", className)}
      data-testid="workspace-bottom-dock"
      data-workspace-bottom-dock="true"
      role="region"
      style={{ zIndex }}
    >
      <WorkspaceBottomDockPanelRow
        bottom={insets.bottom}
        focusedWindowId={focusedDockedWindowId}
        height={panelTargetHeight}
        layoutEditable={layoutEditable}
        onCloseWindow={onCloseWindow}
        onFocusWindow={focusDockedWindow}
        onMaximizeWindow={onMaximizeWindow}
        onMinimizeWindow={onMinimizeWindow}
        onMoveWindowToCanvasSection={onMoveWindowToCanvasSection}
        onMoveWindowToFloating={onMoveWindowToFloating}
        onShowNextWindow={cycleDockedForward}
        onShowPreviousWindow={cycleDockedBackward}
        renderWindow={renderWindow}
        resizeHandlers={resizeHandlers}
        right={insets.right}
        showHeaderCycleControls={showHeaderCycleControls}
        showNextWindowDisabled={dockCycleOffsetFromEnd <= 0}
        showPreviousWindowDisabled={visibleDockedStartIndex <= 0}
        width={panelTargetWidth}
        windowHeightsById={resolvedHeightsById}
        windowWidthsById={resolvedWidthsById}
        windows={visibleDockedWindows}
      />
      <WorkspaceBottomDockRecoveryStrip
        bottom={insets.bottom}
        layoutEditable={layoutEditable}
        maxPillCycleStartIndex={maxPillCycleStartIndex}
        onFocusWindow={onFocusWindow}
        onMinimizeWindow={onMinimizeWindow}
        onMoveWindowToCanvasSection={onMoveWindowToCanvasSection}
        onMoveWindowToFloating={onMoveWindowToFloating}
        onOpenWindow={openRecoveryWindow}
        onShowNextPills={showNextPills}
        onShowPreviousPills={showPreviousPills}
        panelWidth={panelTargetWidth}
        pillCycleStartIndex={pillCycleStartIndex}
        pillDisplayMode={pillDisplayMode}
        recoveryWindows={recoveryWindows}
        right={insets.right}
        showManager={showManager}
        stripAvailableWidth={stripAvailableWidth}
        visibleDockedWindowCount={visibleDockedWindows.length}
        visibleRecoveryWindows={visibleRecoveryWindows}
        windows={windows}
      />
    </div>
  );
}
