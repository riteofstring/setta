import type { DesktopPlatform } from "@shared/types";
import type { WorkspaceUILayout } from "@generated/backend";
import { AlertTriangle, X } from "lucide-react";
import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { isMobileViewportWidth } from "../app-layout";
import { useAppearanceStore } from "../stores/appearance-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useViewportSize } from "../use-viewport-size";
import { FrameScheduler } from "./frame-scheduler";
import type { WorkspaceLayoutStore } from "./layout-store";
import { installWindowResizeReportHooks } from "./performance-report";
import type { WorkspaceSceneMode } from "./runtime-mode-options";
import { createWorkspaceTrackpadNavigationState } from "./trackpad-navigation";
import { createWorkspaceRuntime, type WorkspaceRuntime } from "./workspace-runtime";
import {
  cleanupActivePaneDragSession,
  cleanupOverviewDragSource,
  clearSchedulerRefIfCurrent,
  type OverviewDragSession,
} from "./workspace-layout-area-cleanup";
import {
  installWindowReportHooksForRuntime,
  observeStageResize,
  requireWorkspaceLayoutElements,
} from "./workspace-layout-area-mount";
import {
  focusOrOpenPaneBySurfaceKind,
  WorkspaceMobileControlsLayer,
  WorkspaceOverviewGhostButton,
  WorkspaceToolbarLayer,
} from "./workspace-layout-layers";
import {
  eventTargetsOverviewGhost,
  overviewGhostTargetFromPointer,
  overviewPaneIdFromPointer,
  overviewPaneDropIntentFromGhost,
  setOverviewGhostTargetIfChanged,
  type OverviewGhostTarget,
} from "./workspace-overview-ghost";
import {
  eventTargetsWorkspaceWheelNavigation,
  eventTargetsPaneChromeAction,
  handleForwardedBrowserViewKey,
  handleWorkspaceClick,
  handleWorkspaceKeyDown,
  handleWorkspaceWheel,
} from "./workspace-interactions";
import {
  applyPaneDrop,
  beginPaneDragSession,
  finishPaneDragSession,
  syncPaneDragSourceOffset,
  updatePaneDragSession,
  visiblePaneHostForPane,
  type PaneDragSession,
} from "./pane-drag-reorder";
import { paneResizeTargetFromPointer } from "./pane-resize-target";
import {
  commitPaneResize,
  paneResizePreviewForPointerMove,
  paneResizeSessionFromTarget,
  type PaneResizeSession,
} from "./pane-resize-session";
import { workspaceOpenPaneRequestEvent } from "./open-pane-events";
import {
  WorkspaceLayoutLoading,
  useWorkspaceUILayoutLoad,
  useWorkspaceUILayoutPersistence,
  workspaceLayoutAreaLabel,
  workspaceLayoutRecoveryMessage,
} from "./workspace-ui-layout";
import type { OpenPaneRequest, Rect, SurfaceKind } from "./types";

export interface WorkspaceSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

const overviewDragThresholdPx = 6;

export function WorkspaceLayoutArea({
  focusSurfaceRequest = null,
  onToggleProjectPane,
  platform,
  projectPaneOpen,
  projectPaneWidth,
}: {
  focusSurfaceRequest?: WorkspaceSurfaceFocusRequest | null;
  onToggleProjectPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
}) {
  const workspace = useSelectedWorkspaceSummary();
  const mode = workspaceSceneMode();
  const { workspaceId, workspaceName } = workspaceRuntimeIdentity(workspace);
  const layoutLoad = useWorkspaceUILayoutLoad(workspaceId, mode);
  if (layoutLoad.status === "loading") {
    return <WorkspaceLayoutLoading mode={mode} platform={platform} workspaceId={workspaceId} />;
  }
  return (
    <WorkspaceLayoutRuntimeArea
      focusSurfaceRequest={focusSurfaceRequest}
      initialLayout={layoutLoad.layout}
      layoutLoadError={layoutLoad.error}
      mode={mode}
      onToggleProjectPane={onToggleProjectPane}
      platform={platform}
      projectPaneOpen={projectPaneOpen}
      projectPaneWidth={projectPaneWidth}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
    />
  );
}

function WorkspaceLayoutRuntimeArea({
  focusSurfaceRequest,
  initialLayout,
  layoutLoadError,
  mode,
  onToggleProjectPane,
  platform,
  projectPaneOpen,
  projectPaneWidth,
  workspaceId,
  workspaceName,
}: {
  focusSurfaceRequest: WorkspaceSurfaceFocusRequest | null;
  initialLayout: WorkspaceUILayout | null;
  layoutLoadError: string | null;
  mode: WorkspaceSceneMode;
  onToggleProjectPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
  workspaceId: string;
  workspaceName: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);
  const hostRefs = useRef<Array<HTMLDivElement | null>>([]);
  const overviewDragSessionRef = useRef<OverviewDragSession | null>(null);
  const paneDragSessionRef = useRef<PaneDragSession | null>(null);
  const paneResizePreviewRef = useRef<HTMLDivElement | null>(null);
  const paneResizeStageOriginRef = useRef<{ left: number; top: number } | null>(null);
  const paneResizeSessionRef = useRef<PaneResizeSession | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const suppressNextClickRef = useRef(false);
  const trackpadNavigationRef = useRef(createWorkspaceTrackpadNavigationState());
  const [overviewGhostTarget, setOverviewGhostTarget] = useState<OverviewGhostTarget | null>(null);
  const showPerformanceStats = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.developer?.showPerformanceStats ?? false,
  );
  const shortcuts = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.shortcuts ?? null,
  );
  const allowResizedPanesToOverflowViewport = useAppearanceStore(
    (state) =>
      (state.draft ?? state.settings)?.developer?.allowResizedPanesToOverflowViewport ?? false,
  );
  const overviewCardMaxWidthPx = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.developer?.overviewCardMaxWidthPx,
  );
  const overviewCardMinWidthPx = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.developer?.overviewCardMinWidthPx,
  );
  const viewport = useViewportSize();
  const mobileLayout = isMobileViewportWidth(viewport.width);
  const runtime = useMemo(
    () =>
      createWorkspaceRuntime({
        allowResizedPanesToOverflowViewport,
        mode,
        overviewCardMaxWidthPx,
        overviewCardMinWidthPx,
        storedLayout: initialLayout,
        workspaceId,
        workspaceName,
      }),
    [
      allowResizedPanesToOverflowViewport,
      initialLayout,
      mode,
      overviewCardMaxWidthPx,
      overviewCardMinWidthPx,
      workspaceId,
      workspaceName,
    ],
  );
  const [layoutRecoveryDismissed, setLayoutRecoveryDismissed] = useState(false);
  const layoutSnapshot = useWorkspaceLayoutSnapshot(runtime.store);
  const currentScene = runtime.store.toScene();
  const { layoutPersistenceError, persistLayout, resetLayoutPersistenceError } =
    useWorkspaceUILayoutPersistence(runtime, workspaceId);
  const projectPaneWidthRef = useRef(projectPaneWidth);
  projectPaneWidthRef.current = projectPaneWidth;
  const stageViewport = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      throw new Error("workspace layout stage is not mounted");
    }
    return viewportRect(stage, projectPaneWidthRef.current);
  }, []);
  const runLayoutAction = useCallback(
    (action: () => void) => {
      action();
      persistLayout();
    },
    [persistLayout],
  );
  useEffect(() => {
    setLayoutRecoveryDismissed(false);
    resetLayoutPersistenceError();
  }, [resetLayoutPersistenceError, workspaceId]);
  useEffect(() => {
    runtime.engine.setCompactLayout(mobileLayout);
    schedulerRef.current?.requestFrame();
  }, [mobileLayout, runtime]);
  useEffect(() => {
    if (runtime.mode === "workspace") {
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
    }
    schedulerRef.current?.requestFrame();
  }, [projectPaneWidth, runtime, stageViewport]);
  const openOverviewGhostPane = useCallback(
    (target: OverviewGhostTarget) => {
      setOverviewGhostTarget(null);
      runLayoutAction(() => {
        runtime.store.openEmptyFrameNear(target.paneId, target.placement);
        runtime.store.toggleOverviewMode();
        runtime.store.ensureFocusedPaneVisible(stageViewport());
        runtime.store.snapScrollToTarget();
      });
    },
    [runLayoutAction, runtime, stageViewport],
  );

  useEffect(() => {
    if (!focusSurfaceRequest || runtime.mode !== "workspace") {
      return;
    }
    runLayoutAction(() => {
      focusOrOpenPaneBySurfaceKind(runtime, focusSurfaceRequest.surfaceKind);
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
    });
  }, [focusSurfaceRequest, runLayoutAction, runtime, stageViewport]);

  useEffect(() => {
    if (runtime.mode !== "workspace") {
      return;
    }
    const handleOpenPaneRequest = (event: Event) => {
      const request = (event as CustomEvent<OpenPaneRequest>).detail;
      if (!request?.surfaceKind) {
        return;
      }
      const surfaceKind = request.surfaceKind;
      runLayoutAction(() => {
        const maximizedPaneId = runtime.store.getSnapshot().maximizedPaneId;
        if (maximizedPaneId !== null) {
          runtime.store.togglePaneMaximized(maximizedPaneId);
        }
        if (runtime.store.canOpenPane(request)) {
          runtime.store.openPane(request);
        } else {
          runtime.store.focusPaneBySurfaceKind(surfaceKind);
        }
        runtime.store.ensureFocusedColumnVisible(stageViewport());
        runtime.store.snapScrollToTarget();
      });
    };
    window.addEventListener(workspaceOpenPaneRequestEvent, handleOpenPaneRequest);
    return () => {
      window.removeEventListener(workspaceOpenPaneRequestEvent, handleOpenPaneRequest);
    };
  }, [runLayoutAction, runtime, stageViewport]);

  useEffect(() => {
    const { hosts, root, stage } = requireWorkspaceLayoutElements({
      hostPoolSize: runtime.hostPoolSize,
      hostRefs: hostRefs.current,
      root: rootRef.current,
      stage: stageRef.current,
    });
    runtime.presentation.mount(hosts, debugRef.current);
    installWindowReportHooksForRuntime(runtime);
    const viewportProvider = () => viewportRect(stage, projectPaneWidthRef.current);
    const uninstallResizeReportHooks = installResizeReportHooksForRuntime(
      runtime,
      viewportProvider,
    );
    const scheduler = new FrameScheduler({
      engine: runtime.engine,
      layoutStore: runtime.store,
      metrics: runtime.metrics,
      presentation: runtime.presentation,
      reportWriter: runtime.reportWriter,
      runtimePolicy: runtime.runtimePolicy,
      viewportProvider,
      continuous: runtime.mode === "benchmark",
    });
    schedulerRef.current = scheduler;
    if (!workspaceBenchmarkShouldRun(runtime.mode)) {
      scheduler.pauseBenchmark();
    }
    const requestSchedulerFrame = () => scheduler.requestFrame();
    const stageResizeObserver = observeStageResize(stage, requestSchedulerFrame);
    const handleKeyDown = (event: KeyboardEvent) =>
      handleWorkspaceKeyDown({
        event,
        persistLayout,
        runLayoutAction,
        runtime,
        scheduler,
        shortcuts: shortcuts ?? undefined,
        viewportProvider: stageViewport,
      });
    const handleWheel = (event: WheelEvent) => {
      if (!eventTargetsWorkspaceWheelNavigation(event, root)) {
        return;
      }
      handleWorkspaceWheel({
        event,
        persistLayout,
        root,
        runtime,
        scheduler,
        state: trackpadNavigationRef.current,
        viewportProvider: stageViewport,
      });
    };
    const handleClick = (event: MouseEvent) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      handleWorkspaceClick({
        event,
        runLayoutAction,
        runtime,
        scheduler,
        viewportProvider: stageViewport,
      });
    };
    const syncOverviewGhostTarget = (event: PointerEvent) => {
      if (runtime.store.getSnapshot().presentationMode !== "overview") {
        setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
        return;
      }
      setOverviewGhostTargetIfChanged(
        setOverviewGhostTarget,
        overviewGhostTargetFromPointer(event, stage),
      );
    };
    const clearPaneResizePreview = () => {
      const preview = paneResizePreviewRef.current;
      if (!preview) {
        return;
      }
      preview.dataset.visible = "false";
      preview.dataset.axis = "";
      preview.style.transform = "";
      paneResizeStageOriginRef.current = null;
    };
    const syncPaneResizePreview = (session: PaneResizeSession, event: PointerEvent) => {
      const previewElement = paneResizePreviewRef.current;
      if (!previewElement) {
        return;
      }
      const stageOrigin =
        paneResizeStageOriginRef.current ??
        (() => {
          const rect = stage.getBoundingClientRect();
          return { left: rect.left, top: rect.top };
        })();
      paneResizeStageOriginRef.current = stageOrigin;
      const preview = paneResizePreviewForPointerMove(session, event);
      previewElement.dataset.axis = preview.axis;
      previewElement.dataset.visible = "true";
      if (session.axis === "horizontal" && preview.axis === "horizontal") {
        const x = session.startClientX + preview.width - session.startWidth - stageOrigin.left;
        previewElement.style.transform = `translate3d(${Math.round(x)}px, 0, 0)`;
        return;
      }
      if (session.axis === "height" && preview.axis === "height") {
        const y = session.startClientY + preview.height - session.startHeight - stageOrigin.top;
        previewElement.dataset.axis = "vertical";
        previewElement.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
        return;
      }
      if (session.axis !== "vertical" || preview.axis !== "vertical") {
        return;
      }
      const y =
        session.startClientY + preview.upperHeight - session.upperStartHeight - stageOrigin.top;
      previewElement.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
    };
    const beginOverviewDrag = (event: PointerEvent): boolean => {
      if (eventTargetsOverviewGhost(event)) {
        return true;
      }
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      if (eventTargetsPaneChromeAction(event)) {
        return true;
      }
      const sourcePaneId = overviewPaneIdFromPointer(event);
      if (!sourcePaneId) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      root.dataset.overviewDragging = "false";
      visiblePaneHostForPane(sourcePaneId)?.setAttribute("data-drag-source", "true");
      overviewDragSessionRef.current = {
        dragging: false,
        pendingDropFrame: null,
        pendingDropPointer: null,
        pointerId: event.pointerId,
        sourcePaneId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return true;
    };
    const applyOverviewDropPreview = (
      overviewSession: OverviewDragSession,
      pointer: { clientX: number; clientY: number },
    ) => {
      const ghostTarget = overviewGhostTargetFromPointer(pointer, stage);
      const dropIntent =
        ghostTarget && ghostTarget.paneId !== overviewSession.sourcePaneId
          ? overviewPaneDropIntentFromGhost(ghostTarget, runtime.store.toScene())
          : null;
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, dropIntent ? ghostTarget : null);
      if (dropIntent) {
        runtime.store.previewPaneDropIntent(overviewSession.sourcePaneId, dropIntent);
      } else {
        runtime.store.clearPaneDropPreview();
      }
    };
    const flushOverviewDropPreview = (overviewSession: OverviewDragSession) => {
      const pointer = overviewSession.pendingDropPointer;
      if (!pointer) {
        return;
      }
      overviewSession.pendingDropPointer = null;
      applyOverviewDropPreview(overviewSession, pointer);
    };
    const cancelOverviewDropPreview = (overviewSession: OverviewDragSession) => {
      if (overviewSession.pendingDropFrame === null) {
        return;
      }
      window.cancelAnimationFrame?.(overviewSession.pendingDropFrame);
      overviewSession.pendingDropFrame = null;
      overviewSession.pendingDropPointer = null;
    };
    const scheduleOverviewDropPreview = (
      overviewSession: OverviewDragSession,
      event: PointerEvent,
    ) => {
      overviewSession.pendingDropPointer = { clientX: event.clientX, clientY: event.clientY };
      if (overviewSession.pendingDropFrame !== null) {
        return;
      }
      overviewSession.pendingDropFrame = window.requestAnimationFrame(() => {
        overviewSession.pendingDropFrame = null;
        flushOverviewDropPreview(overviewSession);
      });
    };
    const beginPaneDrag = (event: PointerEvent): boolean => {
      const paneDragSession = beginPaneDragSession(event, root);
      if (!paneDragSession) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      paneDragSessionRef.current = paneDragSession;
      return true;
    };
    const beginPaneResize = (event: PointerEvent): boolean => {
      const target = paneResizeTargetFromPointer(event);
      if (!target) {
        return false;
      }
      const resizeSession = paneResizeSessionFromTarget(target, event, runtime.store);
      if (!resizeSession) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      root.dataset.paneResizing = "true";
      root.dataset.paneResizingAxis = resizeSession.axis;
      paneResizeSessionRef.current = resizeSession;
      const rect = stage.getBoundingClientRect();
      paneResizeStageOriginRef.current = { left: rect.left, top: rect.top };
      syncPaneResizePreview(resizeSession, event);
      return true;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (runtime.mode !== "workspace") {
        return;
      }
      if (runtime.store.getSnapshot().presentationMode === "overview") {
        beginOverviewDrag(event);
        return;
      }
      if (beginPaneDrag(event)) {
        return;
      }
      beginPaneResize(event);
    };
    const updateOverviewDrag = (event: PointerEvent): boolean => {
      const overviewSession = overviewDragSessionRef.current;
      if (!overviewSession || event.pointerId !== overviewSession.pointerId) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      const distance = Math.hypot(
        event.clientX - overviewSession.startClientX,
        event.clientY - overviewSession.startClientY,
      );
      if (distance <= overviewDragThresholdPx) {
        return true;
      }
      overviewSession.dragging = true;
      root.dataset.overviewDragging = "true";
      syncPaneDragSourceOffset(overviewSession, event);
      scheduleOverviewDropPreview(overviewSession, event);
      return true;
    };
    const updatePaneDrag = (event: PointerEvent): boolean => {
      const paneDragSession = paneDragSessionRef.current;
      if (!paneDragSession || event.pointerId !== paneDragSession.pointerId) {
        return false;
      }
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      event.preventDefault();
      event.stopPropagation();
      updatePaneDragSession(event, root, paneDragSession, runtime.store);
      return true;
    };
    const updatePaneResize = (event: PointerEvent): boolean => {
      const session = paneResizeSessionRef.current;
      if (!session) {
        syncOverviewGhostTarget(event);
        return true;
      }
      if (event.pointerId !== session.pointerId) {
        return true;
      }
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      event.preventDefault();
      event.stopPropagation();
      syncPaneResizePreview(session, event);
      return true;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (updateOverviewDrag(event)) {
        return;
      }
      if (updatePaneDrag(event)) {
        return;
      }
      updatePaneResize(event);
    };
    const suppressNextPaneClick = () => {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    };
    const finishActiveOverviewDrag = (event: PointerEvent): boolean => {
      const overviewSession = overviewDragSessionRef.current;
      if (!overviewSession || event.pointerId !== overviewSession.pointerId) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressNextPaneClick();
      overviewDragSessionRef.current = null;
      delete root.dataset.overviewDragging;
      cancelOverviewDropPreview(overviewSession);
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      const sourceHost = visiblePaneHostForPane(overviewSession.sourcePaneId);
      if (sourceHost) {
        sourceHost.removeAttribute("data-drag-source");
        sourceHost.style.translate = "";
      }
      runtime.store.clearPaneDropPreview();
      if (overviewSession.dragging) {
        const ghostTarget = overviewGhostTargetFromPointer(event, stage);
        const dropIntent =
          ghostTarget && ghostTarget.paneId !== overviewSession.sourcePaneId
            ? overviewPaneDropIntentFromGhost(ghostTarget, runtime.store.toScene())
            : null;
        if (dropIntent) {
          runLayoutAction(() => {
            runtime.store.applyPaneDropIntent(overviewSession.sourcePaneId, dropIntent);
          });
        }
        return true;
      }
      runLayoutAction(() => {
        runtime.store.focusPane(overviewSession.sourcePaneId);
        runtime.store.toggleOverviewMode();
        runtime.store.ensureFocusedPaneVisible(stageViewport());
        runtime.store.snapScrollToTarget();
      });
      return true;
    };
    const finishActivePaneDrag = (event: PointerEvent): boolean => {
      const paneDragSession = paneDragSessionRef.current;
      if (!paneDragSession || event.pointerId !== paneDragSession.pointerId) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      const dragFinish = finishPaneDragSession(event, root, paneDragSession, runtime.store);
      paneDragSessionRef.current = null;
      runtime.store.clearPaneDropPreview();
      if (dragFinish.dragging) {
        suppressNextPaneClick();
      }
      const dropTarget = dragFinish.target;
      if (dragFinish.shouldCommitDrop && dragFinish.dragging && dropTarget) {
        runLayoutAction(() => {
          applyPaneDrop(runtime.store, dragFinish.sourcePaneId, dropTarget);
          runtime.store.ensureFocusedPaneVisible(stageViewport());
          runtime.store.snapScrollToTarget();
        });
      }
      return true;
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (finishActiveOverviewDrag(event)) {
        return;
      }
      if (finishActivePaneDrag(event)) {
        return;
      }
      const session = paneResizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      paneResizeSessionRef.current = null;
      const resizeCommitted =
        event.type !== "pointercancel" && commitPaneResize(runtime.store, session, event);
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      clearPaneResizePreview();
      if (resizeCommitted) {
        persistLayout();
      }
    };
    const unsubscribeNativeKey =
      window.setta.workspaceNativeViews?.onBrowserViewKey((event) => {
        if (event.workspaceId !== runtime.scene.id) {
          return;
        }
        handleForwardedBrowserViewKey({
          event,
          persistLayout,
          runLayoutAction,
          runtime,
          scheduler,
          shortcuts: shortcuts ?? undefined,
          viewportProvider: stageViewport,
        });
      }) ?? (() => {});
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerUp, { capture: true });
    window.addEventListener("resize", requestSchedulerFrame);
    root.addEventListener("click", handleClick, { capture: true });
    root.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    scheduler.start();
    return () => {
      uninstallResizeReportHooks();
      unsubscribeNativeKey();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("pointercancel", handlePointerUp, { capture: true });
      window.removeEventListener("resize", requestSchedulerFrame);
      root.removeEventListener("click", handleClick, { capture: true });
      root.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("wheel", handleWheel, { capture: true });
      cleanupOverviewDragSource(overviewDragSessionRef);
      cleanupActivePaneDragSession(root, paneDragSessionRef);
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      runtime.store.clearPaneDropPreview();
      paneResizeSessionRef.current = null;
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      clearPaneResizePreview();
      scheduler.teardown();
      clearSchedulerRefIfCurrent(schedulerRef, scheduler);
      stageResizeObserver?.disconnect();
    };
  }, [persistLayout, runLayoutAction, runtime, shortcuts, stageViewport]);

  useEffect(() => {
    runtime.presentation.setDebugOverlay(showPerformanceStats ? debugRef.current : null);
    schedulerRef.current?.requestFrame();
  }, [runtime, showPerformanceStats]);

  // The full-screen project pane overlay covers the stage, so any workspace
  // action from the bottom bar dismisses it first to reveal its effect.
  const dismissProjectPaneOverlay = () => {
    if (projectPaneOpen) {
      onToggleProjectPane();
    }
  };

  const layoutRecoveryMessage = workspaceLayoutRecoveryMessage({
    dismissed: layoutRecoveryDismissed,
    layoutLoadError,
    layoutPersistenceError,
    runtime,
  });

  return (
    <section
      aria-label={workspaceLayoutAreaLabel(runtime.mode)}
      className="workspace-layout-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count={runtime.browserPaneCount}
      data-compact-layout={mobileLayout}
      data-desktop-platform={platform}
      data-maximized-pane-id={layoutSnapshot.maximizedPaneId ?? ""}
      data-pane-count={currentScene.totalPanes}
      data-presentation-mode={layoutSnapshot.presentationMode}
      data-workspace-mode={runtime.mode}
      data-workspace-id={runtime.scene.id}
      data-testid="workspace-layout-area"
      ref={rootRef}
    >
      <WorkspaceLayoutRecoveryNotice
        message={layoutRecoveryMessage}
        onDismiss={() => setLayoutRecoveryDismissed(true)}
      />
      <div className="workspace-stage" data-testid="workspace-presentation-engine" ref={stageRef}>
        <WorkspaceOverviewGhostButton
          onOpen={openOverviewGhostPane}
          presentationMode={layoutSnapshot.presentationMode}
          target={overviewGhostTarget}
        />
        <div
          aria-hidden="true"
          className="workspace-pane-resize-preview"
          data-axis=""
          data-visible="false"
          ref={paneResizePreviewRef}
        />
        <Profiler id="workspace-pane-hosts" onRender={() => runtime.metrics.recordReactCommit()}>
          {Array.from({ length: runtime.hostPoolSize }, (_, index) => (
            <WorkspacePaneHost
              key={`workspace_host_${index}`}
              refCallback={(host) => {
                hostRefs.current[index] = host;
              }}
            />
          ))}
        </Profiler>
      </div>
      <WorkspaceToolbarLayer
        debugRef={debugRef}
        mobileLayout={mobileLayout}
        overviewActive={layoutSnapshot.presentationMode === "overview"}
        runLayoutAction={runLayoutAction}
        runtime={runtime}
        showPerformanceStats={showPerformanceStats}
      />
      <WorkspaceMobileControlsLayer
        dismissProjectPaneOverlay={dismissProjectPaneOverlay}
        mobileLayout={mobileLayout}
        onToggleProjectPane={onToggleProjectPane}
        overviewActive={layoutSnapshot.presentationMode === "overview"}
        persistLayout={persistLayout}
        projectPaneOpen={projectPaneOpen}
        runLayoutAction={runLayoutAction}
        runtime={runtime}
        stageViewport={stageViewport}
      />
    </section>
  );
}

function installResizeReportHooksForRuntime(
  runtime: WorkspaceRuntime,
  viewportProvider: () => Rect,
): () => void {
  if (runtime.mode !== "benchmark") {
    return () => {};
  }
  return installWindowResizeReportHooks({
    metrics: runtime.metrics,
    viewportProvider,
    writer: runtime.resizeReportWriter,
  });
}

function workspaceBenchmarkShouldRun(mode: WorkspaceSceneMode): boolean {
  return mode === "benchmark" && workspaceAutoBenchmarkEnabled();
}

function WorkspaceLayoutRecoveryNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="app-no-drag absolute top-10 right-3 left-3 z-50 flex min-w-0 items-start gap-2 rounded-sm border border-amber-500/35 bg-amber-950/70 px-2.5 py-2 text-xs text-amber-100 shadow-lg"
      data-testid="workspace-layout-recovery"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words leading-4">{message}</div>
      <button
        aria-label="Dismiss layout recovery notice"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-amber-100/80 hover:bg-amber-100/10 hover:text-amber-50 focus-visible:bg-amber-100/10 focus-visible:text-amber-50"
        onClick={onDismiss}
        title="Dismiss layout recovery notice"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function WorkspacePaneHost({
  refCallback,
}: {
  refCallback: (host: HTMLDivElement | null) => void;
}) {
  return (
    <article
      className="workspace-pane-host app-no-drag"
      data-focused="false"
      data-maximized="false"
      data-moving="false"
      data-pane-id=""
      data-runtime-state="live"
      data-surface-kind=""
      data-testid="workspace-pane-host"
      data-tone="slate"
      data-visible="false"
      ref={refCallback}
    />
  );
}

function workspaceSceneMode(): WorkspaceSceneMode {
  if (typeof window === "undefined") {
    return "workspace";
  }
  return new URLSearchParams(window.location?.search ?? "").get("workspaceScene") === "benchmark"
    ? "benchmark"
    : "workspace";
}

function workspaceAutoBenchmarkEnabled(): boolean {
  return new URLSearchParams(window.location?.search ?? "").get("workspaceAuto") !== "false";
}

function workspaceRuntimeIdentity(workspace: { displayName: string; id: string } | null): {
  workspaceId: string;
  workspaceName: string;
} {
  if (!workspace) {
    return { workspaceId: "empty", workspaceName: "No workspace" };
  }
  return { workspaceId: workspace.id, workspaceName: workspace.displayName };
}

function useWorkspaceLayoutSnapshot(store: WorkspaceLayoutStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

function useSelectedWorkspaceSummary() {
  const session = useWorkspaceStore((state) => state.session);
  return useMemo(() => {
    if (!session) {
      return null;
    }
    return (
      session.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}

function viewportRect(element: HTMLElement, reservedLeftWidth = 0): Rect {
  const rect = element.getBoundingClientRect();
  const reservedWidth = Math.max(0, Math.min(rect.width - 1, reservedLeftWidth));
  return {
    height: rect.height,
    width: rect.width - reservedWidth,
    x: reservedWidth,
    y: 0,
  };
}
