import {
  canUseManagedChatLLM,
  windowSurfaceRequiresManagedChat,
} from "components/Chat/sharePolicyChatAccess";
import { resolveProjectChatShortcutActiveSectionId } from "components/ChatWindowing/projectChatActiveSelection";
import {
  DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
  resolveDockedWindowLayout,
} from "components/ChatWindowing/projectChatBottomDockLayout";
import {
  MinimizedPillStrip,
  type ChatWindowPillExitAnimationKind,
} from "components/ChatWindowing/projectChatBottomDockPillStrip";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  PaneTrackedRect,
  ResolvedWindowPill,
} from "components/ChatWindowing/projectChatBottomDockTypes";
import { ProjectChatDockedWindowsSurface } from "components/ChatWindowing/ProjectChatDockedWindowsSurface";
import { useProjectChatDockResize } from "components/ChatWindowing/projectChatDockResize";
import {
  FLOATING_WINDOW_MIN_HEIGHT_PX,
  FLOATING_WINDOW_MIN_WIDTH_PX,
  FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
  areFloatingBoundsEqual,
  clampFloatingBoundsToViewport,
  useProjectChatFloatingInteractions,
} from "components/ChatWindowing/projectChatFloatingInteractions";
import { ProjectChatFloatingWindowsLayer } from "components/ChatWindowing/ProjectChatFloatingWindowsLayer";
import { ProjectChatMaximizedWindowSurface } from "components/ChatWindowing/ProjectChatMaximizedWindowSurface";
import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
} from "components/ChatWindowing/projectChatSnapLayout";
import {
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX,
  resolveProjectChatFloatingBoundaryInsets,
} from "components/ChatWindowing/projectChatViewport";
import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BiHide, BiShow } from "react-icons/bi";
import { bootProjectChatWindowToCanvasSection } from "state/actions/projectChatWindowingCanvasBoot";
import { resolveDefaultFloatingChatBounds } from "state/actions/projectChatWindowingDefaultBounds";
import { getOpenExternalProjectChatWindowInstanceForSectionInState } from "state/actions/projectChatWindowingSelectors";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
} from "state/actions/projectChatWindowingTrackedGitPaneState";
import {
  setProjectChatWindowBounds,
  setProjectChatWindowBoundsById,
  setProjectChatWindowDockFractions,
  setProjectChatWindowPlacement,
} from "state/actions/projectChatWindowLayoutCommands";
import {
  closeProjectChatWindow,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  maximizeProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  unmaximizeProjectChatWindow,
} from "state/actions/projectChatWindowLifecycleCommands";
import {
  setProjectChatWindowChatId,
  setProjectChatWindowTitle,
} from "state/actions/projectChatWindowMetadataCommands";
import { showSectionInProjectChatWindow } from "state/actions/projectChatWindowSectionCommands";
import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import { useMisc } from "state/stores/layoutInteractionStores";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { useProjectChatWindowShortcuts } from "./projectChatWindowShortcuts";

const DOCK_BAR_HEIGHT_PX = 40;
const DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX = 0;
const VIEW_MODE_TABS_HEIGHT_PX = PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX;
const SIDE_RAIL_WIDTH_PX = PROJECT_CHAT_SIDE_RAIL_WIDTH_PX;
const FALLBACK_WORKSPACE_TOP_INSET_PX =
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
const DOCK_SURFACE_MIN_WIDTH_PX = 420;
const CHAT_WINDOW_LAYER_Z_INDEX = 24;
const TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX = 31;
const CHAT_WINDOW_CHROME_LAYER_Z_INDEX = CHAT_WINDOW_LAYER_Z_INDEX + 1;
const CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX = CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 1;
const CHAT_WINDOW_TOGGLE_Z_INDEX = CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 2;
const CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS = 16;
const CHAT_WINDOW_ENTER_DURATION_MS = 110;
const CHAT_WINDOW_PILL_EXIT_DURATION_MS = 72;
const CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS = 115;
const CHAT_WINDOW_CLOSE_EXIT_DURATION_MS = 125;
const SNAP_TOP_LEFT_SHORTCUT = "Mod + Alt + Shift + Q";
const SNAP_TOP_RIGHT_SHORTCUT = "Mod + Alt + Shift + W";
const SNAP_BOTTOM_LEFT_SHORTCUT = "Mod + Alt + Shift + A";
const SNAP_BOTTOM_RIGHT_SHORTCUT = "Mod + Alt + Shift + S";

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function getViewportDimensions(): { width: number; height: number } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

const CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS =
  "fixed inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-setta-300 bg-setta-50/95 text-setta-400 shadow-sm backdrop-blur-sm transition-colors hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-800 dark:bg-setta-900/95 dark:text-setta-600 dark:hover:text-setta-500";
const CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS =
  "border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400 dark:hover:text-white";

export function ProjectChatBottomDock() {
  const hasViewModeTabs = useHasViewModeTabs();
  const { canEditLayout } = useShareCapabilities();
  const activeSectionUiId = useActiveSectionUI(
    (state) => state.activeIds[0] ?? null,
  );
  const { isDeploymentMode, allowLLM } = useShareSession((state) => ({
    isDeploymentMode: state.isDeploymentMode,
    allowLLM: state.sharePolicy?.allowLLM ?? false,
  }));
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const canCreateManagedChatWindow = canEditLayout && canUseManagedChat;
  const autoCreateInitialChat = useSettings(
    (state) => state.chatWindowing?.autoCreateInitialChat ?? true,
  );
  const chatWindowingShortcuts = useSettings(
    (state) => ({
      canvasToggle:
        state.chatWindowing?.shortcuts?.canvasToggle ?? "Shift + Esc",
      maximizeFocused:
        state.chatWindowing?.shortcuts?.maximizeFocused ??
        "Mod + Shift + Enter",
      minimizeFocused:
        state.chatWindowing?.shortcuts?.minimizeFocused ?? "Mod + Shift + M",
      snapLeft:
        state.chatWindowing?.shortcuts?.snapLeft ?? "Mod + Alt + ArrowLeft",
      snapRight:
        state.chatWindowing?.shortcuts?.snapRight ?? "Mod + Alt + ArrowRight",
      snapTop: state.chatWindowing?.shortcuts?.snapTop ?? "Mod + Alt + ArrowUp",
      snapBottom:
        state.chatWindowing?.shortcuts?.snapBottom ?? "Mod + Alt + ArrowDown",
    }),
    _.isEqual,
  );
  const {
    projectConfigId,
    order,
    instancesById,
    sectionNamesById,
    durableActiveSectionId,
  } = useProjectState(
    (state) => ({
      projectConfigId: state.projectConfig.id,
      order: state.projectChatWindowing.order,
      instancesById: state.projectChatWindowing.instancesById,
      durableActiveSectionId: state.projectConfig.activeIds[0] ?? null,
      sectionNamesById: Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, section]) => [
          sectionId,
          section.name,
        ]),
      ),
    }),
    _.isEqual,
  );
  const activeSectionId = resolveProjectChatShortcutActiveSectionId(
    activeSectionUiId,
    durableActiveSectionId,
  );
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      shallow,
    );
  const managedChatAuthorityState = useMemo(
    () => ({
      projectConfig: {
        sectionVariantMap,
      },
      sections,
      sectionVariants,
      sectionImpls,
    }),
    [sectionImpls, sectionVariantMap, sectionVariants, sections],
  );
  const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage(
    (state) => ({
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
    }),
    _.isEqual,
  );
  const trackedGitPaneGraphWindowInstanceKey = useMisc(
    (state) => state.projectChatTrackedGitPaneGraphWindowInstanceId,
  );
  const trackedGitPaneGraphWindowInstanceId = useMemo(
    () => getTrackedGitPaneGraphWindowInstanceIdForProject(projectConfigId),
    [projectConfigId, trackedGitPaneGraphWindowInstanceKey],
  );
  const [dockCycleOffsetFromEnd, setDockCycleOffsetFromEnd] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState(0);
  const [workspaceTopInsetPx, setWorkspaceTopInsetPx] = useState(
    FALLBACK_WORKSPACE_TOP_INSET_PX,
  );
  const [isCanvasVisibilitySuppressed, setIsCanvasVisibilitySuppressed] =
    useState(false);
  const [windowExitAnimationsById, setWindowExitAnimationsById] = useState<
    Record<string, ChatWindowExitAnimationKind>
  >({});
  const [windowEnterAnimationsById, setWindowEnterAnimationsById] = useState<
    Record<string, ChatWindowEnterAnimationKind>
  >({});
  const [pillExitAnimationsById, setPillExitAnimationsById] = useState<
    Record<string, ChatWindowPillExitAnimationKind>
  >({});
  const [windowEnterAnimationPrimesById, setWindowEnterAnimationPrimesById] =
    useState<Record<string, ChatWindowEnterAnimationKind>>({});
  const [trackedGitPaneGraphRect, setTrackedGitPaneGraphRect] =
    useState<PaneTrackedRect | null>(null);
  const dockBottomOffsetPx = hasViewModeTabs ? VIEW_MODE_TABS_HEIGHT_PX : 0;
  const floatingBottomInsetPx = dockBottomOffsetPx;
  const autoCreateProjectConfigIdRef = useRef<string | null>(null);
  const windowExitTimeoutsRef = useRef<Record<string, number>>({});
  const pillExitTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterPrimeTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterAnimationTimeoutsRef = useRef<Record<string, number>>({});
  const floatingRestoreBoundsByIdRef = useRef<Record<string, ChatWindowBounds>>(
    {},
  );

  useEffect(() => {
    if (!canUseManagedChat) {
      return;
    }
    if (!canEditLayout) {
      return;
    }
    if (!autoCreateInitialChat) {
      return;
    }
    if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
      return;
    }
    if (order.length > 0) {
      return;
    }
    if (autoCreateProjectConfigIdRef.current === projectConfigId) {
      return;
    }
    autoCreateProjectConfigIdRef.current = projectConfigId;
    createProjectChatWindowInstance();
  }, [
    autoCreateInitialChat,
    canEditLayout,
    canUseManagedChat,
    order.length,
    projectConfigId,
  ]);

  useEffect(() => {
    let frameRequestId: number | null = null;
    const applyViewportResize = () => {
      frameRequestId = null;
      setViewportWidthPx((current) =>
        current === window.innerWidth ? current : window.innerWidth,
      );
      setViewportHeightPx((current) =>
        current === window.innerHeight ? current : window.innerHeight,
      );
      const pane = document.querySelector(".react-flow__pane");
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      const nextTopInsetPx = pane.getBoundingClientRect().top;
      if (Number.isFinite(nextTopInsetPx) && nextTopInsetPx > 0) {
        setWorkspaceTopInsetPx((current) => {
          if (Math.abs(nextTopInsetPx - current) <= 0.5) {
            return current;
          }
          return nextTopInsetPx;
        });
      }
    };
    const scheduleViewportResize = () => {
      if (frameRequestId !== null) {
        return;
      }
      frameRequestId = window.requestAnimationFrame(applyViewportResize);
    };
    applyViewportResize();
    const delayedRefreshTimer = window.setTimeout(scheduleViewportResize, 180);
    window.addEventListener("resize", scheduleViewportResize);
    return () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      window.clearTimeout(delayedRefreshTimer);
      window.removeEventListener("resize", scheduleViewportResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!trackedGitPaneGraphWindowInstanceId) {
      setTrackedGitPaneGraphRect(null);
      return;
    }
    const left = overviewTrueWidth;
    const top = workspaceTopInsetPx;
    const width = viewportWidthPx - overviewTrueWidth - uiEditorTrueWidth;
    const height = viewportHeightPx - workspaceTopInsetPx - dockBottomOffsetPx;
    if (width <= 0 || height <= 0) {
      setTrackedGitPaneGraphRect(null);
      return;
    }
    const nextRect: PaneTrackedRect = {
      left,
      top,
      width,
      height,
    };
    setTrackedGitPaneGraphRect((current) => {
      if (
        current &&
        Math.abs(current.left - nextRect.left) <= 0.5 &&
        Math.abs(current.top - nextRect.top) <= 0.5 &&
        Math.abs(current.width - nextRect.width) <= 0.5 &&
        Math.abs(current.height - nextRect.height) <= 0.5
      ) {
        return current;
      }
      return nextRect;
    });
  }, [
    dockBottomOffsetPx,
    overviewTrueWidth,
    trackedGitPaneGraphWindowInstanceId,
    uiEditorTrueWidth,
    workspaceTopInsetPx,
    viewportHeightPx,
    viewportWidthPx,
  ]);

  useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(windowExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      windowExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(pillExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      pillExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterPrimeTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterPrimeTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterAnimationTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterAnimationTimeoutsRef.current = {};
    };
  }, []);

  const orderedPills = useMemo<ResolvedWindowPill[]>(() => {
    const output: ResolvedWindowPill[] = [];
    const seen = new Set<string>();
    const maybePushPill = (
      instanceId: string,
      instance: (typeof instancesById)[string] | undefined,
    ) => {
      if (!instance) {
        return;
      }
      if (
        !canUseManagedChat &&
        windowSurfaceRequiresManagedChat(instance, managedChatAuthorityState)
      ) {
        return;
      }
      if (
        instance.sectionIdOrNull &&
        !Object.hasOwn(sectionNamesById, instance.sectionIdOrNull)
      ) {
        return;
      }
      output.push({
        instanceId,
        title: buildProjectChatWindowTitle(
          instance.mode,
          instanceId,
          instance.sectionIdOrNull,
          instance.title,
          sectionNamesById,
        ),
        mode: instance.mode,
        isClosed: instance.isClosed,
        isMinimized: instance.isMinimized,
        placement: instance.placement,
        zIndex: instance.zIndex,
        bounds: instance.bounds,
        dockWidthFraction: instance.dockMetrics.widthFraction,
        dockPreferredWidthPx: instance.dockMetrics.preferredWidthPx,
        sectionId: instance.sectionIdOrNull,
        chatId: instance.chatId,
      });
    };
    for (const instanceId of order) {
      if (seen.has(instanceId)) {
        continue;
      }
      seen.add(instanceId);
      maybePushPill(instanceId, instancesById[instanceId]);
    }
    for (const [instanceId, instance] of Object.entries(instancesById)) {
      if (seen.has(instanceId)) {
        continue;
      }
      maybePushPill(instanceId, instance);
    }
    return output;
  }, [
    canUseManagedChat,
    instancesById,
    managedChatAuthorityState,
    order,
    sectionNamesById,
  ]);

  const openDockedPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          !pill.isClosed &&
          !pill.isMinimized &&
          pill.placement === ChatWindowPlacementEnum.bottom_docked,
      ),
    [orderedPills],
  );
  const minimizedPills = useMemo(
    () => orderedPills.filter((pill) => pill.isMinimized),
    [orderedPills],
  );
  const nonClosedPills = useMemo(
    () => orderedPills.filter((pill) => !pill.isClosed),
    [orderedPills],
  );

  const openFloatingPills = useMemo(
    () =>
      orderedPills
        .filter(
          (pill) =>
            !pill.isClosed &&
            !pill.isMinimized &&
            pill.placement === ChatWindowPlacementEnum.floating,
        )
        .sort((a, b) => a.zIndex - b.zIndex),
    [orderedPills],
  );

  const openMaximizedWindow = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of orderedPills) {
      if (
        pill.isClosed ||
        pill.isMinimized ||
        pill.placement !== ChatWindowPlacementEnum.maximized
      ) {
        continue;
      }
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow;
  }, [orderedPills]);

  const hasOverlayWindows =
    openDockedPills.length > 0 ||
    openFloatingPills.length > 0 ||
    openMaximizedWindow !== null;

  const activeVisibleWindowId = useMemo(() => {
    if (isCanvasVisibilitySuppressed) {
      return null;
    }
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of orderedPills) {
      if (
        pill.isClosed ||
        pill.isMinimized ||
        (pill.placement !== ChatWindowPlacementEnum.bottom_docked &&
          pill.placement !== ChatWindowPlacementEnum.floating &&
          pill.placement !== ChatWindowPlacementEnum.maximized)
      ) {
        continue;
      }
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [isCanvasVisibilitySuppressed, orderedPills]);

  const activeDockedWindowId = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of openDockedPills) {
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [openDockedPills]);

  const activeFloatingWindowId = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of openFloatingPills) {
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [openFloatingPills]);

  const floatingWindowBoundaryInsets = useMemo(
    () =>
      resolveProjectChatFloatingBoundaryInsets(
        workspaceTopInsetPx,
        floatingBottomInsetPx,
      ),
    [floatingBottomInsetPx, workspaceTopInsetPx],
  );
  const dockedWindowIdsKey = useMemo(
    () => openDockedPills.map((pill) => pill.instanceId).join("|"),
    [openDockedPills],
  );
  const handleCommitSingleDockResize = useCallback(
    ({
      instanceId,
      widthPx,
      heightPx,
    }: {
      instanceId: string;
      widthPx: number;
      heightPx: number;
    }) => {
      setProjectChatWindowDockFractions({
        widthFractionsByInstanceId: {
          [instanceId]: 1,
        },
        dockContainerWidthPx: widthPx,
      });
      setProjectChatWindowBounds(instanceId, {
        height: heightPx,
      });
    },
    [],
  );
  const {
    dockPreviewWidthsById,
    dockPreviewHeightsById,
    handleSingleDockResizePointerDown,
    handleSingleDockResizePointerMove,
    handleSingleDockResizePointerUp,
  } = useProjectChatDockResize({
    dockBottomOffsetPx,
    dockedWindowIdsKey,
    dockedPills: openDockedPills,
    workspaceTopInsetPx,
    onCommitResize: handleCommitSingleDockResize,
  });

  const dockSurfaceRightPx =
    SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX;
  const showDockManagerMenu =
    canCreateManagedChatWindow || orderedPills.length > 0;
  const {
    dockAvailableHeightPx,
    resolvedDockWindowWidthsById,
    resolvedDockWindowHeightsById,
    maxVisibleDockedCount,
    maxDockCycleOffset,
    dockVisibleStartIndex,
    visibleDockedPills,
    responsiveHiddenDockedIds,
    resolvedVisibleDockWindowWidthsById,
    dockSurfaceWidthCss,
    dockSurfaceHeightCss,
  } = useMemo(
    () =>
      resolveDockedWindowLayout({
        dockedPills: openDockedPills,
        previewWidthsById: dockPreviewWidthsById,
        previewHeightsById: dockPreviewHeightsById,
        viewportWidthPx,
        viewportHeightPx,
        workspaceTopInsetPx,
        dockBottomOffsetPx,
        sideRailWidthPx: SIDE_RAIL_WIDTH_PX,
        nonClosedChatCount: nonClosedPills.length,
        showManagerMenu: showDockManagerMenu,
        dockCycleOffsetFromEnd,
      }),
    [
      dockBottomOffsetPx,
      dockCycleOffsetFromEnd,
      dockPreviewHeightsById,
      dockPreviewWidthsById,
      nonClosedPills.length,
      openDockedPills,
      showDockManagerMenu,
      viewportHeightPx,
      viewportWidthPx,
      workspaceTopInsetPx,
    ],
  );

  const stripPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          pill.isMinimized || responsiveHiddenDockedIds.has(pill.instanceId),
      ),
    [orderedPills, responsiveHiddenDockedIds],
  );

  useEffect(() => {
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current, 0, maxDockCycleOffset),
    );
  }, [maxDockCycleOffset]);

  useEffect(() => {
    if (hasOverlayWindows) {
      return;
    }
    setIsCanvasVisibilitySuppressed(false);
  }, [hasOverlayWindows]);

  const showDockedChatSurface =
    visibleDockedPills.length > 0 && !isCanvasVisibilitySuppressed;
  const showCanvasVisibilityToggle =
    isCanvasVisibilitySuppressed || openMaximizedWindow !== null;
  const showStandaloneMinimizedPills = !showDockedChatSurface;

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

  const clearWindowExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete windowExitTimeoutsRef.current[instanceId];
    }
    setWindowExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearWindowEnterAnimation = useCallback((instanceId: string) => {
    const activePrimeTimeoutId =
      windowEnterPrimeTimeoutsRef.current[instanceId];
    if (activePrimeTimeoutId !== undefined) {
      window.clearTimeout(activePrimeTimeoutId);
      delete windowEnterPrimeTimeoutsRef.current[instanceId];
    }
    const activeAnimationTimeoutId =
      windowEnterAnimationTimeoutsRef.current[instanceId];
    if (activeAnimationTimeoutId !== undefined) {
      window.clearTimeout(activeAnimationTimeoutId);
      delete windowEnterAnimationTimeoutsRef.current[instanceId];
    }
    setWindowEnterAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
    setWindowEnterAnimationPrimesById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearPillExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete pillExitTimeoutsRef.current[instanceId];
    }
    setPillExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const startWindowEnterAnimation = useCallback(
    (instanceId: string, kind: ChatWindowEnterAnimationKind) => {
      setWindowEnterAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      setWindowEnterAnimationPrimesById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activePrimeTimeoutId =
        windowEnterPrimeTimeoutsRef.current[instanceId];
      if (activePrimeTimeoutId !== undefined) {
        window.clearTimeout(activePrimeTimeoutId);
      }
      const activeAnimationTimeoutId =
        windowEnterAnimationTimeoutsRef.current[instanceId];
      if (activeAnimationTimeoutId !== undefined) {
        window.clearTimeout(activeAnimationTimeoutId);
      }
      windowEnterPrimeTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterPrimeTimeoutsRef.current[instanceId];
          setWindowEnterAnimationPrimesById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS,
      );
      windowEnterAnimationTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterAnimationTimeoutsRef.current[instanceId];
          setWindowEnterAnimationsById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_DURATION_MS,
      );
    },
    [],
  );

  const startPillExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowPillExitAnimationKind,
      onComplete: () => void,
    ) => {
      setPillExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      pillExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete pillExitTimeoutsRef.current[instanceId];
        setPillExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        onComplete();
      }, CHAT_WINDOW_PILL_EXIT_DURATION_MS);
    },
    [],
  );

  const startWindowExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowExitAnimationKind,
      { focusAfterClose = false }: { focusAfterClose?: boolean } = {},
    ) => {
      if (!instancesById[instanceId]) {
        return;
      }
      clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
      clearWindowEnterAnimation(instanceId);
      setWindowExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      const durationMs =
        kind === "minimize"
          ? CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS
          : CHAT_WINDOW_CLOSE_EXIT_DURATION_MS;
      windowExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete windowExitTimeoutsRef.current[instanceId];
        if (kind === "minimize") {
          minimizeProjectChatWindow(instanceId);
        } else {
          closeProjectChatWindow(instanceId);
        }
        setWindowExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        if (focusAfterClose) {
          const nextVisibleWindowId = orderedPills.find(
            (candidatePill) =>
              candidatePill.instanceId !== instanceId &&
              !candidatePill.isClosed &&
              !candidatePill.isMinimized,
          );
          if (nextVisibleWindowId) {
            focusProjectChatWindow(nextVisibleWindowId.instanceId);
          }
        }
      }, durationMs);
    },
    [clearWindowEnterAnimation, instancesById, orderedPills, projectConfigId],
  );

  const handleOpenWindow = useCallback(
    (instanceId: string, source: "pill" | "menu") => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return;
      }
      if (
        instance.placement === ChatWindowPlacementEnum.bottom_docked &&
        maxVisibleDockedCount > 0
      ) {
        let targetDockIndex = 0;
        let foundTarget = false;
        for (const pill of orderedPills) {
          if (
            pill.isClosed ||
            pill.placement !== ChatWindowPlacementEnum.bottom_docked
          ) {
            continue;
          }
          if (pill.isMinimized && pill.instanceId !== instanceId) {
            continue;
          }
          if (pill.instanceId === instanceId) {
            foundTarget = true;
            break;
          }
          targetDockIndex += 1;
        }
        if (foundTarget) {
          const currentEndIndex = dockVisibleStartIndex + maxVisibleDockedCount;
          let nextStartIndex = dockVisibleStartIndex;
          if (targetDockIndex < dockVisibleStartIndex) {
            nextStartIndex = targetDockIndex;
          } else if (targetDockIndex >= currentEndIndex) {
            nextStartIndex = targetDockIndex - maxVisibleDockedCount + 1;
          }
          const nextTotalDockCount =
            openDockedPills.length + (instance.isMinimized ? 1 : 0);
          const nextMaxStartIndex = Math.max(
            0,
            nextTotalDockCount - maxVisibleDockedCount,
          );
          setDockCycleOffsetFromEnd(
            nextMaxStartIndex -
              clampNumber(nextStartIndex, 0, nextMaxStartIndex),
          );
        }
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
  ]);

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

  const handleShowInCanvas = useCallback((instanceId: string) => {
    void bootProjectChatWindowToCanvasSection(instanceId);
  }, []);

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
        sideRailWidthPx: SIDE_RAIL_WIDTH_PX,
        minWidthPx: FLOATING_WINDOW_MIN_WIDTH_PX,
        minHeightPx: FLOATING_WINDOW_MIN_HEIGHT_PX,
      }),
    );
  }, [
    clampFloatingBoundsForCurrentViewport,
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

  const rememberFloatingRestoreBounds = useCallback(
    (instanceId: string, bounds: ChatWindowBounds) => {
      const existingBounds = floatingRestoreBoundsByIdRef.current[instanceId];
      if (existingBounds && areFloatingBoundsEqual(existingBounds, bounds)) {
        return;
      }
      floatingRestoreBoundsByIdRef.current = {
        ...floatingRestoreBoundsByIdRef.current,
        [instanceId]: { ...bounds },
      };
    },
    [],
  );

  const {
    floatingPreviewBoundsById,
    activeFloatingSnapPreview,
    handleFloatingDragPointerDown,
    handleFloatingDragPointerMove,
    handleFloatingDragPointerUp,
    handleFloatingResizePointerDown,
    handleFloatingResizePointerMove,
    handleFloatingResizePointerUp,
    handleFloatingSnapResizePointerDown,
    handleFloatingSnapResizePointerMove,
    handleFloatingSnapResizePointerUp,
  } = useProjectChatFloatingInteractions({
    floatingWindowBoundaryInsets,
    floatingWindowIdsKey: openFloatingPills
      .map((pill) => pill.instanceId)
      .join("|"),
    openFloatingPills,
    onCommitBounds: setProjectChatWindowBounds,
    onCommitBoundsById: setProjectChatWindowBoundsById,
    onFocusWindow: handleFocusWindow,
    onRememberFloatingRestoreBounds: rememberFloatingRestoreBounds,
    clampFloatingBoundsForCurrentViewport,
    resolveFloatingRestoreBounds,
    positionFloatingBoundsForUnsnap,
  });

  const floatingBoundsById = useMemo(() => {
    const nextBoundsById: Record<string, ChatWindowBounds> = {};
    for (const pill of openFloatingPills) {
      nextBoundsById[pill.instanceId] =
        floatingPreviewBoundsById[pill.instanceId] ?? pill.bounds;
    }
    return nextBoundsById;
  }, [floatingPreviewBoundsById, openFloatingPills]);
  const snappedFloatingWindows = useMemo(() => {
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      return [];
    }
    return openFloatingPills.flatMap((pill) => {
      const bounds = floatingBoundsById[pill.instanceId];
      if (!bounds) {
        return [];
      }
      const snapPreset = resolveFloatingSnapPresetFromBounds(
        bounds,
        viewportWidthPx,
        viewportHeightPx,
        floatingWindowBoundaryInsets,
      );
      if (!snapPreset) {
        return [];
      }
      return [
        {
          instanceId: pill.instanceId,
          bounds,
          snapPreset,
        },
      ];
    });
  }, [
    floatingBoundsById,
    floatingWindowBoundaryInsets,
    openFloatingPills,
    viewportHeightPx,
    viewportWidthPx,
  ]);
  const floatingSnapPresetById = useMemo(() => {
    const nextPresetById: Record<string, FloatingSnapPreset> = {};
    for (const snappedWindow of snappedFloatingWindows) {
      nextPresetById[snappedWindow.instanceId] = snappedWindow.snapPreset;
    }
    return nextPresetById;
  }, [snappedFloatingWindows]);
  const floatingSnapResizeHandles = useMemo(
    () => buildFloatingSnapResizeHandles(snappedFloatingWindows),
    [snappedFloatingWindows],
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
      if (existing && areFloatingBoundsEqual(existing, clampedBounds)) {
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

  const toggleCanvasVisibility = useCallback(() => {
    setIsCanvasVisibilitySuppressed((current) => !current);
  }, []);

  const maximizeFocusedVisibleWindow = useCallback(() => {
    if (!activeVisibleWindowId) {
      return;
    }
    maximizeProjectChatWindow(activeVisibleWindowId);
    focusProjectChatWindow(activeVisibleWindowId);
    setIsCanvasVisibilitySuppressed(false);
  }, [activeVisibleWindowId]);

  const minimizeFocusedVisibleWindow = useCallback(() => {
    if (!activeVisibleWindowId) {
      return;
    }
    startWindowExitAnimation(activeVisibleWindowId, "minimize", {
      focusAfterClose: true,
    });
  }, [activeVisibleWindowId, startWindowExitAnimation]);

  useProjectChatWindowShortcuts({
    shortcuts: {
      canvasToggle: chatWindowingShortcuts.canvasToggle,
      maximizeFocused: chatWindowingShortcuts.maximizeFocused,
      minimizeFocused: chatWindowingShortcuts.minimizeFocused,
      snapLeft: chatWindowingShortcuts.snapLeft,
      snapRight: chatWindowingShortcuts.snapRight,
      snapTop: chatWindowingShortcuts.snapTop,
      snapBottom: chatWindowingShortcuts.snapBottom,
      snapTopLeft: SNAP_TOP_LEFT_SHORTCUT,
      snapTopRight: SNAP_TOP_RIGHT_SHORTCUT,
      snapBottomLeft: SNAP_BOTTOM_LEFT_SHORTCUT,
      snapBottomRight: SNAP_BOTTOM_RIGHT_SHORTCUT,
    },
    hasOverlayWindows,
    hasActiveVisibleWindow: Boolean(activeVisibleWindowId),
    onToggleCanvasVisibility: toggleCanvasVisibility,
    onMaximizeFocusedWindow: activeVisibleWindowId
      ? maximizeFocusedVisibleWindow
      : null,
    onMinimizeFocusedWindow: activeVisibleWindowId
      ? minimizeFocusedVisibleWindow
      : null,
    onSnapPreset: snapWindowTargetByPreset,
  });

  const showDockHeaderCycleControls =
    openDockedPills.length > visibleDockedPills.length &&
    visibleDockedPills.length > 0;
  const canCycleDockBackward = dockVisibleStartIndex > 0;
  const canCycleDockForward = dockCycleOffsetFromEnd > 0;
  const maximizedExitAnimation = openMaximizedWindow
    ? windowExitAnimationsById[openMaximizedWindow.instanceId] ?? null
    : null;
  const maximizedEnterAnimation = openMaximizedWindow
    ? windowEnterAnimationsById[openMaximizedWindow.instanceId] ?? null
    : null;
  const maximizedEnterAnimationPrime = openMaximizedWindow
    ? windowEnterAnimationPrimesById[openMaximizedWindow.instanceId] ?? null
    : null;
  const isPaneTrackedMaximizedGitGraphWindow =
    openMaximizedWindow?.mode === ChatWindowModeEnum.git_graph_mode &&
    openMaximizedWindow?.instanceId === trackedGitPaneGraphWindowInstanceId;

  if (!canUseManagedChat && orderedPills.length === 0) {
    return null;
  }

  return (
    <>
      <ProjectChatDockedWindowsSurface
        showDockedChatSurface={showDockedChatSurface}
        dockSurfaceRightPx={dockSurfaceRightPx}
        dockBottomOffsetPx={dockBottomOffsetPx}
        dockSurfaceWidthCss={dockSurfaceWidthCss}
        dockSurfaceHeightCss={dockSurfaceHeightCss}
        stripPills={stripPills}
        pillExitAnimationsById={pillExitAnimationsById}
        canCreateManagedChatWindow={canCreateManagedChatWindow}
        showDockManagerMenu={showDockManagerMenu}
        viewportWidthPx={viewportWidthPx}
        visibleDockedPills={visibleDockedPills}
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
        canEditLayout={canEditLayout}
        projectConfigId={projectConfigId}
        dockAvailableHeightPx={dockAvailableHeightPx}
        sideRailWidthPx={SIDE_RAIL_WIDTH_PX}
        chromeLayerZIndex={CHAT_WINDOW_CHROME_LAYER_Z_INDEX}
        onOpenWindow={handleOpenWindow}
        onCreateWindow={handleCreate}
        onFocusWindow={handleFocusWindow}
        onSetWindowTitle={handleSetWindowTitle}
        onShowInCanvas={handleShowInCanvas}
        onUndockWindow={handleUndockWindow}
        onMaximizeWindow={handleMaximizeWindow}
        onMinimizeWindow={handleMinimizeWindow}
        onCloseWindow={handleCloseWindow}
        onCycleDockWindowsBackward={handleCycleDockWindowsBackward}
        onCycleDockWindowsForward={handleCycleDockWindowsForward}
        onSetProjectChatId={setProjectChatWindowChatId}
        onSingleDockResizePointerDown={handleSingleDockResizePointerDown}
        onSingleDockResizePointerMove={handleSingleDockResizePointerMove}
        onSingleDockResizePointerUp={handleSingleDockResizePointerUp}
      />
      <ProjectChatFloatingWindowsLayer
        isCanvasVisibilitySuppressed={isCanvasVisibilitySuppressed}
        canEditLayout={canEditLayout}
        activeFloatingSnapPreview={activeFloatingSnapPreview}
        floatingSnapResizeHandles={floatingSnapResizeHandles}
        chromeLayerZIndex={CHAT_WINDOW_CHROME_LAYER_Z_INDEX}
        snapPreviewLayerZIndex={CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX}
        openFloatingPills={openFloatingPills}
        floatingBoundsById={floatingBoundsById}
        floatingSnapPresetById={floatingSnapPresetById}
        windowExitAnimationsById={windowExitAnimationsById}
        windowEnterAnimationsById={windowEnterAnimationsById}
        windowEnterAnimationPrimesById={windowEnterAnimationPrimesById}
        projectConfigId={projectConfigId}
        onFocusWindow={handleFocusWindow}
        onSetWindowTitle={handleSetWindowTitle}
        onShowInCanvas={handleShowInCanvas}
        onDockWindow={handleDockWindow}
        onMaximizeWindow={handleMaximizeWindow}
        onMinimizeWindow={handleMinimizeWindow}
        onCloseWindow={handleCloseWindow}
        onSetProjectChatId={setProjectChatWindowChatId}
        onFloatingDragPointerDown={handleFloatingDragPointerDown}
        onFloatingDragPointerMove={handleFloatingDragPointerMove}
        onFloatingDragPointerUp={handleFloatingDragPointerUp}
        onFloatingResizePointerDown={handleFloatingResizePointerDown}
        onFloatingResizePointerMove={handleFloatingResizePointerMove}
        onFloatingResizePointerUp={handleFloatingResizePointerUp}
        onFloatingSnapResizePointerDown={handleFloatingSnapResizePointerDown}
        onFloatingSnapResizePointerMove={handleFloatingSnapResizePointerMove}
        onFloatingSnapResizePointerUp={handleFloatingSnapResizePointerUp}
      />
      {!isCanvasVisibilitySuppressed ? (
        <ProjectChatMaximizedWindowSurface
          openMaximizedWindow={openMaximizedWindow}
          maximizedExitAnimation={maximizedExitAnimation}
          maximizedEnterAnimation={maximizedEnterAnimation}
          maximizedEnterAnimationPrime={maximizedEnterAnimationPrime}
          isPaneTrackedMaximizedGitGraphWindow={
            isPaneTrackedMaximizedGitGraphWindow
          }
          trackedGitPaneGraphRect={trackedGitPaneGraphRect}
          trackedPaneWindowLayerZIndex={TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX}
          chatWindowLayerZIndex={CHAT_WINDOW_LAYER_Z_INDEX}
          workspaceTopInsetPx={workspaceTopInsetPx}
          dockBottomOffsetPx={dockBottomOffsetPx}
          sideRailWidthPx={SIDE_RAIL_WIDTH_PX}
          canEditLayout={canEditLayout}
          projectConfigId={projectConfigId}
          onFocusWindow={handleFocusWindow}
          onSetWindowTitle={handleSetWindowTitle}
          onShowInCanvas={handleShowInCanvas}
          onRestoreWindow={handleRestoreWindow}
          onDockWindow={handleDockWindow}
          onMinimizeWindow={handleMinimizeWindow}
          onCloseWindow={handleCloseWindow}
          onSetProjectChatId={setProjectChatWindowChatId}
        />
      ) : null}
      {showStandaloneMinimizedPills ? (
        <div
          className="pointer-events-none fixed"
          style={{
            zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
            left: SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
            right: dockSurfaceRightPx,
            bottom: dockBottomOffsetPx,
          }}
        >
          <MinimizedPillStrip
            pills={stripPills}
            pillExitAnimationsById={pillExitAnimationsById}
            canCreateWindow={canCreateManagedChatWindow}
            showManagerMenu={showDockManagerMenu}
            viewportWidthPx={viewportWidthPx}
            onOpenWindow={handleOpenWindow}
            onCreateWindow={handleCreate}
          />
        </div>
      ) : null}
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
      {showCanvasVisibilityToggle ? (
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
          onClick={() => {
            setIsCanvasVisibilitySuppressed((current) => !current);
          }}
          aria-label={getWindowControlQuickInfoText({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
          aria-pressed={isCanvasVisibilitySuppressed}
          data-testid="project-chat-canvas-visibility-toggle"
          title={getWindowControlQuickInfoText({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
          {...getWindowControlQuickInfoHandlers({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
        >
          {isCanvasVisibilitySuppressed ? (
            <BiShow size={18} />
          ) : (
            <BiHide size={18} />
          )}
        </button>
      ) : null}
    </>
  );
}
