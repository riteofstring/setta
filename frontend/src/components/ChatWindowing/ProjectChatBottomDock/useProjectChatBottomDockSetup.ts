import {
  canUseManagedChatLLM,
  windowSurfaceRequiresManagedChat,
} from "components/Chat/sharePolicyChatAccess";
import { resolveProjectChatShortcutActiveSectionId } from "components/ChatWindowing/projectChatActiveSelection";
import { type PillDisplayMode } from "components/ChatWindowing/projectChatBottomDockLayout";
import { resolveChatWindowingShortcuts } from "components/ChatWindowing/projectChatKeyboardShortcuts";
import {
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX,
  resolveProjectChatFloatingBoundaryInsets,
} from "components/ChatWindowing/projectChatViewport";
import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import _ from "lodash";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createProjectChatWindowInstance } from "state/actions/projectChatWindowing";
import { getTrackedGitPaneGraphWindowInstanceIdForProject } from "state/actions/projectChatWindowingEphemeral";
import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { useProjectChatWindowAnimationState } from "./animationState";
import {
  ActiveFloatingDrag,
  ActiveFloatingResize,
  ActiveFloatingSnapPreview,
  ActiveFloatingSnapResize,
  ActiveSingleDockResize,
  PaneTrackedRect,
  ResolvedWindowPill,
  resolveActiveVisibleWindowId,
  resolveTopZIndexWindowId,
} from "./shared";

export function useProjectChatBottomDockSetup() {
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
    (state) => resolveChatWindowingShortcuts(state.chatWindowing?.shortcuts),
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
        Object.entries(state.sections as Record<string, { name: string }>).map(
          ([sectionId, section]) => [sectionId, section.name],
        ),
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
  const [pillDisplayMode, setPillDisplayMode] =
    useState<PillDisplayMode>("full");
  const [pillCycleStartIndex, setPillCycleStartIndex] = useState(0);
  const [dockCycleOffsetFromEnd, setDockCycleOffsetFromEnd] = useState(0);
  const [pillViewportWidthPx, setPillViewportWidthPx] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState(0);
  const [workspaceTopInsetPx, setWorkspaceTopInsetPx] = useState(
    PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  );
  const [isCanvasVisibilitySuppressed, setIsCanvasVisibilitySuppressed] =
    useState(false);
  const [floatingPreviewBoundsById, setFloatingPreviewBoundsById] = useState<
    Record<string, ChatWindowBounds>
  >({});
  const [activeFloatingSnapPreview, setActiveFloatingSnapPreview] =
    useState<ActiveFloatingSnapPreview | null>(null);
  const [dockPreviewWidthsById, setDockPreviewWidthsById] = useState<
    Record<string, number>
  >({});
  const [dockPreviewHeightsById, setDockPreviewHeightsById] = useState<
    Record<string, number>
  >({});
  const [trackedGitPaneGraphRect, setTrackedGitPaneGraphRect] =
    useState<PaneTrackedRect | null>(null);
  const dockBottomOffsetPx = hasViewModeTabs
    ? PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX
    : 0;
  const floatingBottomInsetPx = dockBottomOffsetPx;
  const pillViewportRef = useRef<HTMLDivElement | null>(null);
  const fullMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const compactMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const activeSingleDockResizeRef = useRef<ActiveSingleDockResize | null>(null);
  const activeFloatingDragRef = useRef<ActiveFloatingDrag | null>(null);
  const activeFloatingResizeRef = useRef<ActiveFloatingResize | null>(null);
  const activeFloatingSnapResizeRef = useRef<ActiveFloatingSnapResize | null>(
    null,
  );
  const autoCreateProjectConfigIdRef = useRef<string | null>(null);
  const activeFloatingSnapPreviewRef = useRef<ActiveFloatingSnapPreview | null>(
    null,
  );
  const floatingPreviewBoundsRef = useRef<Record<string, ChatWindowBounds>>({});
  const queuedFloatingPreviewBoundsRef = useRef<Record<
    string,
    ChatWindowBounds
  > | null>(null);
  const floatingPreviewAnimationFrameRef = useRef<number | null>(null);
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
    const viewportNode = pillViewportRef.current;
    if (!viewportNode) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidthPx = entries[0]?.contentRect.width;
      if (!nextWidthPx) {
        return;
      }
      setPillViewportWidthPx(nextWidthPx);
    });
    observer.observe(viewportNode);
    return () => {
      observer.disconnect();
    };
  }, []);

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
      const pane = document.querySelector(".setta-gpu-flow__pane");
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
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
    };
  }, []);

  useEffect(() => {
    floatingPreviewBoundsRef.current = floatingPreviewBoundsById;
  }, [floatingPreviewBoundsById]);

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
  const {
    windowExitAnimationsById,
    windowEnterAnimationsById,
    pillExitAnimationsById,
    windowEnterAnimationPrimesById,
    clearWindowExitAnimation,
    clearWindowEnterAnimation,
    clearPillExitAnimation,
    startWindowEnterAnimation,
    startPillExitAnimation,
    startWindowExitAnimation,
  } = useProjectChatWindowAnimationState({
    instancesById,
    orderedPills,
    projectConfigId,
  });

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

  const hasOverlayWindows = useMemo(
    () =>
      openDockedPills.length > 0 ||
      openFloatingPills.length > 0 ||
      openMaximizedWindow !== null,
    [openDockedPills.length, openFloatingPills.length, openMaximizedWindow],
  );

  const activeVisibleWindowId = useMemo(
    () =>
      resolveActiveVisibleWindowId(orderedPills, isCanvasVisibilitySuppressed),
    [isCanvasVisibilitySuppressed, orderedPills],
  );

  const activeFloatingWindowId = useMemo(
    () => resolveTopZIndexWindowId(openFloatingPills),
    [openFloatingPills],
  );

  const floatingWindowBoundaryInsets = useMemo(
    () =>
      resolveProjectChatFloatingBoundaryInsets(
        workspaceTopInsetPx,
        floatingBottomInsetPx,
      ),
    [floatingBottomInsetPx, workspaceTopInsetPx],
  );

  return {
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
  };
}
