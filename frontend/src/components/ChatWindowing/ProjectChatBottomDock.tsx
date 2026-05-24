import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import { useCallback, useMemo } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  bootProjectChatWindowToCanvasSection,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  maximizeProjectChatWindow,
  reopenProjectChatWindow,
  setProjectChatWindowPlacement,
  setProjectChatWindowTitle,
  unmaximizeProjectChatWindow,
} from "state/actions/projectChatWindowing";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";
import { DockedChatSurfaceLayer } from "./ProjectChatBottomDock/dockedWindows";
import {
  FloatingSnapResizeOverlay,
  FloatingWindowsLayer,
} from "./ProjectChatBottomDock/floatingWindows";
import { MaximizedWindowLayer } from "./ProjectChatBottomDock/maximizedWindows";
import { MinimizedPillStrip } from "./ProjectChatBottomDock/MinimizedPillStrip";
import {
  CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS,
  CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS,
  CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
  CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX,
  CHAT_WINDOW_TOGGLE_Z_INDEX,
  DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX,
  DOCK_BAR_HEIGHT_PX,
  getValueByInstanceId,
  resolveDockCycleOffsetForWindowOpen,
} from "./ProjectChatBottomDock/shared";
import { useProjectChatBottomDockSetup } from "./ProjectChatBottomDock/useProjectChatBottomDockSetup";
import { useProjectChatDockLayout } from "./ProjectChatBottomDock/useProjectChatDockLayout";
import { useProjectChatFloatingWindowGeometry } from "./ProjectChatBottomDock/useProjectChatFloatingWindowGeometry";
import { useProjectChatFloatingWindowInteractions } from "./ProjectChatBottomDock/useProjectChatFloatingWindowInteractions";
import { useProjectChatWindowShortcuts } from "./ProjectChatBottomDock/useProjectChatWindowShortcuts";

export function ProjectChatBottomDock() {
  const {
    activeFloatingDragRef,
    activeFloatingResizeRef,
    activeFloatingSnapPreview,
    activeFloatingSnapPreviewRef,
    activeFloatingSnapResizeRef,
    activeFloatingWindowId,
    activeSectionId,
    activeSingleDockResizeRef,
    activeVisibleWindowId,
    canCreateManagedChatWindow,
    canEditLayout,
    canUseManagedChat,
    chatWindowingShortcuts,
    clearPillExitAnimation,
    clearWindowEnterAnimation,
    clearWindowExitAnimation,
    compactMeasureRowRef,
    dockBottomOffsetPx,
    dockCycleOffsetFromEnd,
    dockPreviewHeightsById,
    dockPreviewWidthsById,
    floatingBottomInsetPx,
    floatingPreviewAnimationFrameRef,
    floatingPreviewBoundsById,
    floatingPreviewBoundsRef,
    floatingRestoreBoundsByIdRef,
    floatingWindowBoundaryInsets,
    fullMeasureRowRef,
    hasOverlayWindows,
    instancesById,
    isCanvasVisibilitySuppressed,
    nonClosedPills,
    openDockedPills,
    openFloatingPills,
    openMaximizedWindow,
    orderedPills,
    pillCycleStartIndex,
    pillDisplayMode,
    pillExitAnimationsById,
    pillViewportRef,
    pillViewportWidthPx,
    projectConfigId,
    queuedFloatingPreviewBoundsRef,
    setActiveFloatingSnapPreview,
    setDockCycleOffsetFromEnd,
    setDockPreviewHeightsById,
    setDockPreviewWidthsById,
    setFloatingPreviewBoundsById,
    setIsCanvasVisibilitySuppressed,
    setPillCycleStartIndex,
    setPillDisplayMode,
    startPillExitAnimation,
    startWindowEnterAnimation,
    startWindowExitAnimation,
    trackedGitPaneGraphRect,
    trackedGitPaneGraphWindowInstanceId,
    viewportHeightPx,
    viewportWidthPx,
    windowEnterAnimationPrimesById,
    windowEnterAnimationsById,
    windowExitAnimationsById,
    workspaceTopInsetPx,
  } = useProjectChatBottomDockSetup();

  const {
    floatingBoundsById,
    floatingSnapPresetById,
    floatingSnapResizeHandles,
  } = useProjectChatFloatingWindowGeometry({
    activeFloatingDragRef,
    activeFloatingResizeRef,
    activeFloatingSnapPreviewRef,
    activeFloatingSnapResizeRef,
    floatingPreviewBoundsById,
    floatingWindowBoundaryInsets,
    openFloatingPills,
    setActiveFloatingSnapPreview,
    setFloatingPreviewBoundsById,
    viewportHeightPx,
    viewportWidthPx,
  });

  const {
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
  } = useProjectChatDockLayout({
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
  });

  const handleCreate = useCallback(() => {
    if (!canCreateManagedChatWindow) {
      return;
    }
    const instanceId = createProjectChatWindowInstance();
    if (!instanceId) {
      return;
    }
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, [canCreateManagedChatWindow]);

  const handleOpenWindow = useCallback(
    (instanceId: string, source: "pill" | "menu") => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return;
      }
      const nextDockCycleOffset = resolveDockCycleOffsetForWindowOpen({
        instanceId,
        isMinimized: instance.isMinimized,
        orderedPills,
        dockVisibleStartIndex,
        maxVisibleDockedCount,
        openDockedCount: openDockedPills.length,
      });
      if (
        instance.placement === ChatWindowPlacementEnum.bottom_docked &&
        nextDockCycleOffset !== null
      ) {
        setDockCycleOffsetFromEnd(nextDockCycleOffset);
      }
      clearWindowExitAnimation(instanceId);
      clearWindowEnterAnimation(instanceId);
      clearPillExitAnimation(instanceId);
      if (instance.isMinimized && source === "pill") {
        startPillExitAnimation(instanceId, "restore_from_minimize", () => {
          startWindowEnterAnimation(instanceId, "restore_from_minimize");
          reopenProjectChatWindow(instanceId);
          focusProjectChatWindow(instanceId);
          setIsCanvasVisibilitySuppressed(false);
        });
        return;
      }
      if (instance.isClosed || instance.isMinimized) {
        startWindowEnterAnimation(instanceId, "restore_from_minimize");
      }
      reopenProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      clearPillExitAnimation,
      clearWindowEnterAnimation,
      clearWindowExitAnimation,
      dockVisibleStartIndex,
      instancesById,
      maxVisibleDockedCount,
      openDockedPills.length,
      orderedPills,
      startPillExitAnimation,
      startWindowEnterAnimation,
    ],
  );

  const handleMinimizeWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "minimize", {
        focusAfterClose: true,
      });
    },
    [startWindowExitAnimation],
  );

  const handleCloseWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "close", { focusAfterClose: true });
    },
    [startWindowExitAnimation],
  );

  const handleFocusWindow = useCallback((instanceId: string) => {
    focusProjectChatWindow(instanceId);
  }, []);

  const handleSetWindowTitle = useCallback(
    (instanceId: string, nextTitle: string) => {
      setProjectChatWindowTitle(instanceId, nextTitle);
    },
    [],
  );

  const handleUndockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.floating,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleDockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.bottom_docked,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleMaximizeWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      maximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleRestoreWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      unmaximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleShowWindowInCanvas = useCallback((instanceId: string) => {
    void bootProjectChatWindowToCanvasSection(instanceId);
  }, []);

  const {
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
  } = useProjectChatFloatingWindowInteractions({
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
  });
  useProjectChatWindowShortcuts({
    activeVisibleWindowId,
    chatWindowingShortcuts,
    hasOverlayWindows,
    setIsCanvasVisibilitySuppressed,
    snapWindowTargetByPreset,
    startWindowExitAnimation,
  });

  const maximizedWindowInstanceId = openMaximizedWindow?.instanceId ?? null;
  const maximizedExitAnimation = getValueByInstanceId(
    maximizedWindowInstanceId,
    windowExitAnimationsById,
  );
  const maximizedEnterAnimation = getValueByInstanceId(
    maximizedWindowInstanceId,
    windowEnterAnimationsById,
  );
  const maximizedEnterAnimationPrime = getValueByInstanceId(
    maximizedWindowInstanceId,
    windowEnterAnimationPrimesById,
  );
  const isPaneTrackedMaximizedGitGraphWindow =
    openMaximizedWindow?.mode === ChatWindowModeEnum.git_graph_mode &&
    maximizedWindowInstanceId === trackedGitPaneGraphWindowInstanceId;
  const dockedChatSurfaceElement = useMemo(() => {
    if (!showDockedChatSurface) {
      return null;
    }
    return (
      <div
        className="pointer-events-none fixed"
        style={{
          zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
          left: dockSurfaceLeftPx,
          right: dockSurfaceRightPx,
          bottom: dockBottomOffsetPx,
        }}
      >
        <div className="flex min-w-0 items-end justify-end gap-3">
          <div className="pointer-events-auto flex min-w-0 max-w-[28rem] items-end justify-end">
            <MinimizedPillStrip
              pills={stripPills}
              visiblePills={visiblePills}
              pillExitAnimationsById={pillExitAnimationsById}
              useCompactPills={useCompactPills}
              canCreateWindow={canCreateManagedChatWindow}
              showManagerMenu={showDockManagerMenu}
              canCycleBackward={canCycleBackward}
              canCycleForward={canCycleForward}
              maxCycleStartIndex={maxCycleStartIndex}
              pillDisplayMode={pillDisplayMode}
              pillViewportRef={pillViewportRef}
              fullMeasureRowRef={fullMeasureRowRef}
              compactMeasureRowRef={compactMeasureRowRef}
              onCycleBackward={handlePillCycleBackward}
              onCycleForward={handlePillCycleForward}
              onOpenWindow={handleOpenWindow}
              onCreateWindow={handleCreate}
            />
          </div>
          <DockedChatSurfaceLayer
            visibleDockedPills={visibleDockedPills}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            dockAvailableHeightPx={dockAvailableHeightPx}
            dockSurfaceWidthCss={dockSurfaceWidthCss}
            dockSurfaceHeightCss={dockSurfaceHeightCss}
            resolvedVisibleDockWindowWidthsById={
              resolvedVisibleDockWindowWidthsById
            }
            resolvedDockWindowHeightsById={resolvedDockWindowHeightsById}
            windowExitAnimationsById={windowExitAnimationsById}
            windowEnterAnimationsById={windowEnterAnimationsById}
            windowEnterAnimationPrimesById={windowEnterAnimationPrimesById}
            showDockHeaderCycleControls={showDockHeaderCycleControls}
            canCycleDockBackward={canCycleDockBackward}
            canCycleDockForward={canCycleDockForward}
            onCycleDockBackward={handleCycleDockWindowsBackward}
            onCycleDockForward={handleCycleDockWindowsForward}
            onFocusWindow={handleFocusWindow}
            onShowInCanvas={handleShowWindowInCanvas}
            onUndockWindow={handleUndockWindow}
            onMaximizeWindow={handleMaximizeWindow}
            onMinimizeWindow={handleMinimizeWindow}
            onCloseWindow={handleCloseWindow}
            onSetWindowTitle={handleSetWindowTitle}
            onSingleDockResizePointerDown={handleSingleDockResizePointerDown}
            onSingleDockResizePointerMove={handleSingleDockResizePointerMove}
            onSingleDockResizePointerUp={handleSingleDockResizePointerUp}
          />
        </div>
      </div>
    );
  }, [
    canCreateManagedChatWindow,
    canCycleBackward,
    canCycleDockBackward,
    canCycleDockForward,
    canCycleForward,
    canEditLayout,
    dockAvailableHeightPx,
    dockBottomOffsetPx,
    dockSurfaceLeftPx,
    dockSurfaceHeightCss,
    dockSurfaceRightPx,
    dockSurfaceWidthCss,
    handleCloseWindow,
    handleCreate,
    handleCycleDockWindowsBackward,
    handleCycleDockWindowsForward,
    handleFocusWindow,
    handleMaximizeWindow,
    handleMinimizeWindow,
    handleOpenWindow,
    handlePillCycleBackward,
    handlePillCycleForward,
    handleSetWindowTitle,
    handleShowWindowInCanvas,
    handleSingleDockResizePointerDown,
    handleSingleDockResizePointerMove,
    handleSingleDockResizePointerUp,
    handleUndockWindow,
    maxCycleStartIndex,
    pillDisplayMode,
    pillExitAnimationsById,
    projectConfigId,
    resolvedDockWindowHeightsById,
    resolvedVisibleDockWindowWidthsById,
    showDockHeaderCycleControls,
    showDockManagerMenu,
    showDockedChatSurface,
    stripPills,
    useCompactPills,
    visibleDockedPills,
    visiblePills,
    windowEnterAnimationPrimesById,
    windowEnterAnimationsById,
    windowExitAnimationsById,
  ]);
  const floatingSnapPreviewElement = useMemo(() => {
    if (
      isCanvasVisibilitySuppressed ||
      !canEditLayout ||
      !activeFloatingSnapPreview
    ) {
      return null;
    }
    return (
      <div
        className="pointer-events-none fixed rounded-none border-2 border-setta-400/80 bg-setta-300/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-setta-500/90 dark:bg-setta-500/25 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
        style={{
          zIndex: CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX,
          left: activeFloatingSnapPreview.bounds.x,
          top: activeFloatingSnapPreview.bounds.y,
          width: activeFloatingSnapPreview.bounds.width,
          height: activeFloatingSnapPreview.bounds.height,
        }}
        data-testid="project-chat-floating-snap-ghost-zone"
        data-chat-window-snap-preset={activeFloatingSnapPreview.preset}
      />
    );
  }, [activeFloatingSnapPreview, canEditLayout, isCanvasVisibilitySuppressed]);
  const floatingSnapResizeElement = useMemo(() => {
    if (
      isCanvasVisibilitySuppressed ||
      !canEditLayout ||
      floatingSnapResizeHandles.length === 0
    ) {
      return null;
    }
    return (
      <FloatingSnapResizeOverlay
        handles={floatingSnapResizeHandles}
        onPointerDown={handleFloatingSnapResizePointerDown}
        onPointerMove={handleFloatingSnapResizePointerMove}
        onPointerUp={handleFloatingSnapResizePointerUp}
      />
    );
  }, [
    canEditLayout,
    floatingSnapResizeHandles,
    handleFloatingSnapResizePointerDown,
    handleFloatingSnapResizePointerMove,
    handleFloatingSnapResizePointerUp,
    isCanvasVisibilitySuppressed,
  ]);
  const floatingWindowsElement = useMemo(() => {
    if (isCanvasVisibilitySuppressed) {
      return null;
    }
    return (
      <FloatingWindowsLayer
        openFloatingPills={openFloatingPills}
        projectConfigId={projectConfigId}
        canEditLayout={canEditLayout}
        floatingBoundsById={floatingBoundsById}
        floatingSnapPresetById={floatingSnapPresetById}
        windowExitAnimationsById={windowExitAnimationsById}
        windowEnterAnimationsById={windowEnterAnimationsById}
        windowEnterAnimationPrimesById={windowEnterAnimationPrimesById}
        onFocusWindow={handleFocusWindow}
        onShowInCanvas={handleShowWindowInCanvas}
        onDockWindow={handleDockWindow}
        onMaximizeWindow={handleMaximizeWindow}
        onMinimizeWindow={handleMinimizeWindow}
        onCloseWindow={handleCloseWindow}
        onSetWindowTitle={handleSetWindowTitle}
        onFloatingDragPointerDown={handleFloatingDragPointerDown}
        onFloatingDragPointerMove={handleFloatingDragPointerMove}
        onFloatingDragPointerUp={handleFloatingDragPointerUp}
        onFloatingResizePointerDown={handleFloatingResizePointerDown}
        onFloatingResizePointerMove={handleFloatingResizePointerMove}
        onFloatingResizePointerUp={handleFloatingResizePointerUp}
      />
    );
  }, [
    canEditLayout,
    floatingBoundsById,
    floatingSnapPresetById,
    handleCloseWindow,
    handleDockWindow,
    handleFloatingDragPointerDown,
    handleFloatingDragPointerMove,
    handleFloatingDragPointerUp,
    handleFloatingResizePointerDown,
    handleFloatingResizePointerMove,
    handleFloatingResizePointerUp,
    handleFocusWindow,
    handleMaximizeWindow,
    handleMinimizeWindow,
    handleSetWindowTitle,
    handleShowWindowInCanvas,
    isCanvasVisibilitySuppressed,
    openFloatingPills,
    projectConfigId,
    windowEnterAnimationPrimesById,
    windowEnterAnimationsById,
    windowExitAnimationsById,
  ]);
  const maximizedWindowElement = useMemo(() => {
    if (isCanvasVisibilitySuppressed || !openMaximizedWindow) {
      return null;
    }
    return (
      <MaximizedWindowLayer
        openMaximizedWindow={openMaximizedWindow}
        projectConfigId={projectConfigId}
        canEditLayout={canEditLayout}
        maximizedExitAnimation={maximizedExitAnimation}
        maximizedEnterAnimation={maximizedEnterAnimation}
        maximizedEnterAnimationPrime={maximizedEnterAnimationPrime}
        isPaneTrackedMaximizedGitGraphWindow={
          isPaneTrackedMaximizedGitGraphWindow
        }
        trackedGitPaneGraphRect={trackedGitPaneGraphRect}
        workspaceTopInsetPx={workspaceTopInsetPx}
        dockBottomOffsetPx={dockBottomOffsetPx}
        onFocusWindow={handleFocusWindow}
        onShowInCanvas={handleShowWindowInCanvas}
        onRestoreWindow={handleRestoreWindow}
        onDockWindow={handleDockWindow}
        onMinimizeWindow={handleMinimizeWindow}
        onCloseWindow={handleCloseWindow}
        onSetWindowTitle={handleSetWindowTitle}
      />
    );
  }, [
    canEditLayout,
    dockBottomOffsetPx,
    handleCloseWindow,
    handleDockWindow,
    handleFocusWindow,
    handleMinimizeWindow,
    handleRestoreWindow,
    handleSetWindowTitle,
    handleShowWindowInCanvas,
    isCanvasVisibilitySuppressed,
    isPaneTrackedMaximizedGitGraphWindow,
    maximizedEnterAnimation,
    maximizedEnterAnimationPrime,
    maximizedExitAnimation,
    openMaximizedWindow,
    projectConfigId,
    trackedGitPaneGraphRect,
    workspaceTopInsetPx,
  ]);
  const standaloneMinimizedPillsElement = useMemo(() => {
    if (!showStandaloneMinimizedPills) {
      return null;
    }
    return (
      <div
        className="pointer-events-none fixed"
        style={{
          zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
          left: dockSurfaceLeftPx,
          right: dockSurfaceRightPx,
          bottom: dockBottomOffsetPx,
        }}
      >
        <MinimizedPillStrip
          pills={stripPills}
          visiblePills={visiblePills}
          pillExitAnimationsById={pillExitAnimationsById}
          useCompactPills={useCompactPills}
          canCreateWindow={canCreateManagedChatWindow}
          showManagerMenu={showDockManagerMenu}
          canCycleBackward={canCycleBackward}
          canCycleForward={canCycleForward}
          maxCycleStartIndex={maxCycleStartIndex}
          pillDisplayMode={pillDisplayMode}
          pillViewportRef={pillViewportRef}
          fullMeasureRowRef={fullMeasureRowRef}
          compactMeasureRowRef={compactMeasureRowRef}
          onCycleBackward={handlePillCycleBackward}
          onCycleForward={handlePillCycleForward}
          onOpenWindow={handleOpenWindow}
          onCreateWindow={handleCreate}
        />
      </div>
    );
  }, [
    canCreateManagedChatWindow,
    canCycleBackward,
    canCycleForward,
    dockBottomOffsetPx,
    dockSurfaceLeftPx,
    dockSurfaceRightPx,
    handleCreate,
    handleOpenWindow,
    handlePillCycleBackward,
    handlePillCycleForward,
    maxCycleStartIndex,
    pillDisplayMode,
    pillExitAnimationsById,
    showDockManagerMenu,
    showStandaloneMinimizedPills,
    stripPills,
    useCompactPills,
    visiblePills,
  ]);
  const canvasVisibilityToggleElement = useMemo(() => {
    if (!showCanvasVisibilityToggle) {
      return null;
    }
    const toggleAction = isCanvasVisibilitySuppressed
      ? "show_chats"
      : "show_canvas";
    const toggleLabel = getWindowControlQuickInfoText({
      action: toggleAction,
    });
    return (
      <button
        type="button"
        className={`${CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS} ${
          isCanvasVisibilitySuppressed
            ? CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS
            : ""
        }`}
        style={{
          zIndex: CHAT_WINDOW_TOGGLE_Z_INDEX,
          left: 6,
          bottom: dockBottomOffsetPx + 136,
        }}
        onClick={handleToggleCanvasVisibility}
        aria-label={toggleLabel}
        aria-pressed={isCanvasVisibilitySuppressed}
        data-testid="project-chat-canvas-visibility-toggle"
        title={toggleLabel}
        {...getWindowControlQuickInfoHandlers({
          action: toggleAction,
        })}
      >
        {isCanvasVisibilitySuppressed ? (
          <BiShow size={18} />
        ) : (
          <BiHide size={18} />
        )}
      </button>
    );
  }, [
    dockBottomOffsetPx,
    handleToggleCanvasVisibility,
    isCanvasVisibilitySuppressed,
    showCanvasVisibilityToggle,
  ]);

  if (!canUseManagedChat && orderedPills.length === 0) {
    return null;
  }

  return (
    <>
      {dockedChatSurfaceElement}
      {floatingSnapPreviewElement}
      {floatingSnapResizeElement}
      {floatingWindowsElement}
      {maximizedWindowElement}
      {standaloneMinimizedPillsElement}
      <nav
        className="pointer-events-none fixed"
        style={{
          zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
          right: dockSurfaceRightPx,
          width: dockSurfaceWidthCss,
          bottom: dockBottomOffsetPx + DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX,
          height: DOCK_BAR_HEIGHT_PX,
        }}
        data-testid="project-chat-bottom-dock-strip"
      />
      {canvasVisibilityToggleElement}
    </>
  );
}
