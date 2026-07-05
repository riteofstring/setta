import type { DesktopPlatform } from "@shared/types";
import type { WorkspaceUILayout } from "@generated/backend";
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
import {
  finishOverviewPanSession,
  beginOverviewPanSession,
  updateOverviewPanSession,
  type OverviewPanSession,
} from "./overview-pan-session";
import {
  clearPaneResizePreview as clearPaneResizePreviewElement,
  syncPaneResizePreview as syncPaneResizePreviewElement,
} from "./pane-resize-preview";
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
import { viewportRect } from "./workspace-layout-area-geometry";
import {
  focusOrOpenPaneBySurfaceKind,
  WorkspaceMobileControlsLayer,
  WorkspaceOverviewGhostButton,
  WorkspaceToolbarLayer,
} from "./workspace-layout-layers";
import {
  captureOverviewPaneFrames,
  eventTargetsOverviewGhost,
  overviewGhostTargetFromFrames,
  overviewPaneIdAtPoint,
  type OverviewGhostTarget,
  type OverviewPaneFrame,
} from "./workspace-overview-ghost";
import {
  eventTargetsWorkspaceWheelNavigation,
  eventTargetsPaneChromeAction,
  handleForwardedBrowserViewKey,
  handleWorkspaceClick,
  handleWorkspaceKeyDown,
  handleWorkspacePaneFocusPointerDown,
  handleWorkspaceWheel,
} from "./workspace-interactions";
import {
  applyPaneDrop,
  beginPaneDragSession,
  collectVisiblePaneHostRects,
  finishPaneDragSession,
  paneDropTargetFromPointer,
  syncPaneDragSourceOffset,
  syncPaneDropTarget,
  updatePaneDragSession,
  visiblePaneHostForPane,
  type PaneDragSession,
} from "./pane-drag-reorder";
import { paneResizeTargetFromPointer } from "./pane-resize-target";
import {
  commitPaneResize,
  paneResizeSessionFromTarget,
  type PaneResizeSession,
} from "./pane-resize-session";
import {
  WorkspaceLayoutRecoveryNotice,
  WorkspacePaneHost,
} from "./workspace-layout-area-components";
import {
  workspaceBenchmarkShouldRun,
  workspaceRuntimeIdentity,
  workspaceSceneMode,
} from "./workspace-layout-area-runtime";
import { WorkspaceNoWorkspaceState } from "./workspace-empty-state";
import { workspaceOpenPaneRequestEvent } from "./open-pane-events";
import {
  WorkspaceLayoutLoading,
  useWorkspaceUILayoutLoad,
  useWorkspaceUILayoutPersistence,
  workspaceLayoutAreaLabel,
  workspaceLayoutRecoveryMessage,
} from "./workspace-ui-layout";
import type { OpenPaneRequest, PaneDropIntent, Rect, SurfaceKind } from "./types";
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
  const workspaceTarget = useWorkspaceLayoutTarget();
  const workspace = workspaceTarget.workspace;
  const mode = workspaceSceneMode();
  const { workspaceId, workspaceName } = workspaceRuntimeIdentity(workspace);
  const layoutLoad = useWorkspaceUILayoutLoad(workspaceId, mode);
  if (!workspace && mode === "workspace") {
    return <WorkspaceNoWorkspaceState platform={platform} status={workspaceTarget.status} />;
  }
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
  const overviewPanSessionRef = useRef<OverviewPanSession | null>(null);
  const paneDragSessionRef = useRef<PaneDragSession | null>(null);
  const paneDropPreviewRef = useRef<HTMLDivElement | null>(null);
  const paneResizePreviewRef = useRef<HTMLDivElement | null>(null);
  const paneResizeStageOriginRef = useRef<{ left: number; top: number } | null>(null);
  const paneResizeSessionRef = useRef<PaneResizeSession | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const suppressNextClickRef = useRef(false);
  const trackpadNavigationRef = useRef(createWorkspaceTrackpadNavigationState());
  // Committed pane frames frozen while an insert preview is active, so hover
  // resolution stays a pure function of the pre-reflow layout (no oscillation).
  const overviewInsertPreviewFramesRef = useRef<OverviewPaneFrame[] | null>(null);
  const overviewGhostTargetRef = useRef<OverviewGhostTarget | null>(null);
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
  const [overviewGhostTarget, setOverviewGhostTargetState] = useState<OverviewGhostTarget | null>(
    null,
  );
  const [nativeViewOverlayActive, setNativeViewOverlayActive] = useState(false);
  const setOverviewGhostTarget = useCallback((target: OverviewGhostTarget | null) => {
    if (sameOverviewGhostTarget(overviewGhostTargetRef.current, target)) {
      return;
    }
    overviewGhostTargetRef.current = target;
    setOverviewGhostTargetState(target);
  }, []);
  const clearOverviewInsertPreview = useCallback(() => {
    overviewInsertPreviewFramesRef.current = null;
    setOverviewGhostTarget(null);
    runtime.store.clearInsertFramePreview();
  }, [runtime, setOverviewGhostTarget]);
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
  useEffect(() => {
    schedulerRef.current?.requestFrame();
  }, [nativeViewOverlayActive]);
  const openOverviewGhostPane = useCallback(
    (target: OverviewGhostTarget) => {
      clearOverviewInsertPreview();
      runLayoutAction(() => {
        runtime.store.openEmptyFrameNear(target.paneId, target.placement);
        runtime.store.toggleOverviewMode();
        runtime.store.ensureFocusedPaneVisible(stageViewport());
        runtime.store.snapScrollToTarget();
      });
    },
    [clearOverviewInsertPreview, runLayoutAction, runtime, stageViewport],
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
          const paneId = runtime.store.focusPaneBySurfaceKind(surfaceKind);
          if (paneId !== null && request.workflowNodeDetailsConfig) {
            runtime.store.configurePane(paneId, request);
          }
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
    runtime.presentation.setDropPreviewOverlay(paneDropPreviewRef.current);
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
      movementOverride: () =>
        paneDragSessionRef.current !== null ||
        overviewDragSessionRef.current !== null ||
        overviewPanSessionRef.current !== null,
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
      // A wheel mid-drag would corrupt the drag's frozen hit rects / pan session.
      if (
        paneDragSessionRef.current !== null ||
        overviewDragSessionRef.current !== null ||
        overviewPanSessionRef.current !== null
      ) {
        return;
      }
      // Overview zoom/pan applies anywhere over the surface (including over cards),
      // so it bypasses the focus-navigation target gate that normal mode requires.
      const overview = runtime.store.getSnapshot().presentationMode === "overview";
      if (!overview && !eventTargetsWorkspaceWheelNavigation(event, root)) {
        return;
      }
      if (overview) {
        // Zoom/pan shifts the panes without a pointermove, so a cached "add pane"
        // ghost would linger out of place; drop it until the next hover recomputes.
        clearOverviewInsertPreview();
      }
      handleWorkspaceWheel({
        event,
        persistLayout,
        root,
        runtime,
        scheduler,
        stage,
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
    const syncOverviewInsertPreview = (event: PointerEvent) => {
      if (runtime.store.getSnapshot().presentationMode !== "overview") {
        clearOverviewInsertPreview();
        return;
      }
      // Resolve the add-slot against frozen frames while the ghost is visible, so
      // the hover target is stable even as the pointer moves within the empty slot.
      // The ghost is an overlay only: panes do not reflow until the user clicks.
      const frozen = overviewGhostTargetRef.current ? overviewInsertPreviewFramesRef.current : null;
      const frames = frozen ?? captureOverviewPaneFrames(stage);
      const target = overviewGhostTargetFromFrames(frames, event.clientX, event.clientY);
      if (!target) {
        clearOverviewInsertPreview();
        return;
      }
      overviewInsertPreviewFramesRef.current = frames;
      setOverviewGhostTarget(target);
    };
    const clearActivePaneResizePreview = () =>
      clearPaneResizePreviewElement(paneResizePreviewRef.current, paneResizeStageOriginRef);
    const syncActivePaneResizePreview = (session: PaneResizeSession, event: PointerEvent) =>
      syncPaneResizePreviewElement({
        event,
        previewElement: paneResizePreviewRef.current,
        session,
        stage,
        stageOriginRef: paneResizeStageOriginRef,
      });
    const beginOverviewPan = (event: PointerEvent): boolean => {
      return beginOverviewPanSession({
        clearOverviewInsertPreview,
        event,
        root,
        scheduler,
        sessionRef: overviewPanSessionRef,
      });
    };
    const beginOverviewDrag = (event: PointerEvent): boolean => {
      if (eventTargetsOverviewGhost(event)) {
        return true;
      }
      clearOverviewInsertPreview();
      if (eventTargetsPaneChromeAction(event)) {
        return true;
      }
      const sourcePaneId = overviewPaneIdAtPoint(event);
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
        hostRects: collectVisiblePaneHostRects(),
        lastDropIntent: null,
        pendingDropFrame: null,
        pendingDropPointer: null,
        pointerId: event.pointerId,
        sourcePaneId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      scheduler.requestFrame();
      return true;
    };
    const previewPaneDropIntent = (sourcePaneId: string, dropIntent: PaneDropIntent) => {
      if (runtime.store.previewPaneDropIntent(sourcePaneId, dropIntent)) {
        runtime.metrics.recordPaneDragPreviewUpdate();
      }
    };
    const clearPaneDropPreview = () => {
      if (runtime.store.clearPaneDropPreview()) {
        runtime.metrics.recordPaneDragPreviewClear();
      }
    };
    const applyOverviewDropPreview = (
      overviewSession: OverviewDragSession,
      pointer: { clientX: number; clientY: number },
    ) => {
      // Overview now uses the same drop model as normal mode (swap on a card's
      // centre, insert at its edges/gaps, extend in empty space) resolved against
      // the scaled card geometry. The dashed "add pane" ghost is no longer used
      // during a drag; the shared data-drop affordances annotate the target card.
      const target = paneDropTargetFromPointer(
        pointer,
        overviewSession.sourcePaneId,
        runtime.store,
        overviewSession.hostRects,
      );
      syncPaneDropTarget(root, target);
      clearOverviewInsertPreview();
      overviewSession.lastDropIntent = target?.intent ?? null;
      if (target) {
        previewPaneDropIntent(overviewSession.sourcePaneId, target.intent);
      } else {
        clearPaneDropPreview();
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
      scheduler.requestFrame();
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
      syncActivePaneResizePreview(resizeSession, event);
      return true;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (runtime.mode !== "workspace" && runtime.mode !== "benchmark") {
        return;
      }
      handleWorkspacePaneFocusPointerDown({
        event,
        runLayoutAction,
        runtime,
        scheduler,
        viewportProvider: stageViewport,
      });
      if (runtime.store.getSnapshot().presentationMode === "overview") {
        if (beginOverviewPan(event)) {
          return;
        }
        beginOverviewDrag(event);
        return;
      }
      if (beginPaneDrag(event)) {
        return;
      }
      beginPaneResize(event);
    };
    const updateOverviewPan = (event: PointerEvent): boolean => {
      return updateOverviewPanSession({
        clearOverviewInsertPreview,
        event,
        panOverviewBy: (deltaX, deltaY, viewportRect) =>
          runtime.store.panOverviewBy(deltaX, deltaY, viewportRect),
        sessionRef: overviewPanSessionRef,
        viewportProvider: stageViewport,
      });
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
      clearOverviewInsertPreview();
      event.preventDefault();
      event.stopPropagation();
      updatePaneDragSession(event, root, paneDragSession, runtime.store, runtime.metrics);
      return true;
    };
    const updatePaneResize = (event: PointerEvent): boolean => {
      const session = paneResizeSessionRef.current;
      if (!session) {
        syncOverviewInsertPreview(event);
        return true;
      }
      if (event.pointerId !== session.pointerId) {
        return true;
      }
      clearOverviewInsertPreview();
      event.preventDefault();
      event.stopPropagation();
      syncActivePaneResizePreview(session, event);
      return true;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (updateOverviewPan(event)) {
        return;
      }
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
    const finishActiveOverviewPan = (event: PointerEvent): boolean => {
      return finishOverviewPanSession({
        event,
        root,
        sessionRef: overviewPanSessionRef,
        suppressNextPaneClick,
      });
    };
    const finishActiveOverviewDrag = (event: PointerEvent): boolean => {
      const overviewSession = overviewDragSessionRef.current;
      if (!overviewSession || event.pointerId !== overviewSession.pointerId) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressNextPaneClick();
      flushOverviewDropPreview(overviewSession);
      overviewDragSessionRef.current = null;
      delete root.dataset.overviewDragging;
      cancelOverviewDropPreview(overviewSession);
      clearOverviewInsertPreview();
      const sourceHost = visiblePaneHostForPane(overviewSession.sourcePaneId);
      if (sourceHost) {
        sourceHost.removeAttribute("data-drag-source");
        sourceHost.style.translate = "";
      }
      syncPaneDropTarget(root, null);
      clearPaneDropPreview();
      if (overviewSession.dragging) {
        const dropIntent = overviewSession.lastDropIntent;
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
      const dragFinish = finishPaneDragSession(
        event,
        root,
        paneDragSession,
        runtime.store,
        runtime.metrics,
      );
      paneDragSessionRef.current = null;
      clearPaneDropPreview();
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
      if (finishActiveOverviewPan(event)) {
        return;
      }
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
      clearOverviewInsertPreview();
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      clearActivePaneResizePreview();
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
      overviewPanSessionRef.current = null;
      delete root.dataset.overviewPanning;
      clearOverviewInsertPreview();
      runtime.store.clearPaneDropPreview();
      paneResizeSessionRef.current = null;
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      clearActivePaneResizePreview();
      scheduler.teardown();
      clearSchedulerRefIfCurrent(schedulerRef, scheduler);
      stageResizeObserver?.disconnect();
    };
  }, [
    clearOverviewInsertPreview,
    persistLayout,
    runLayoutAction,
    runtime,
    setOverviewGhostTarget,
    shortcuts,
    stageViewport,
  ]);
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
      data-native-view-clip-left={projectPaneWidth}
      data-native-view-overlay-active={nativeViewOverlayActive}
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
        <div
          aria-hidden="true"
          className="workspace-pane-drop-preview"
          data-visible="false"
          ref={paneDropPreviewRef}
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
        onNativeOverlayActiveChange={setNativeViewOverlayActive}
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

function useWorkspaceLayoutSnapshot(store: WorkspaceLayoutStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

function useWorkspaceLayoutTarget() {
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const workspace = useMemo(() => {
    if (!session) {
      return null;
    }
    return (
      session.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
  return { status, workspace };
}

function sameOverviewGhostTarget(
  left: OverviewGhostTarget | null,
  right: OverviewGhostTarget | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const frameFields = ["left", "top", "width", "height"] as const;
  return (
    left.paneId === right.paneId &&
    left.placement === right.placement &&
    frameFields.every((field) => left[field] === right[field])
  );
}
