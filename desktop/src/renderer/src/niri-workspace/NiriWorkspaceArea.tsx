import type { DesktopPlatform } from "@shared/types";
import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useAppearanceStore } from "../stores/appearance-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { FrameScheduler } from "./frame-scheduler";
import type { NiriLayoutStore } from "./layout-store";
import { installWindowResizeReportHooks, installWindowReportHooks } from "./performance-report";
import type { NiriSceneMode } from "./runtime-mode-options";
import { createNiriTrackpadNavigationState } from "./trackpad-navigation";
import { NiriWorkspaceToolbar } from "./niri-workspace-toolbar";
import { createNiriRuntime, type NiriRuntime } from "./niri-runtime";
import {
  eventTargetsOverviewGhost,
  overviewGhostLabel,
  overviewGhostTargetFromPointer,
  overviewPaneIdAtPoint,
  overviewPaneIdFromPointer,
  setOverviewGhostTargetIfChanged,
  type OverviewGhostTarget,
} from "./niri-overview-ghost";
import {
  eventTargetsNiriWheelNavigation,
  eventTargetsPaneChromeAction,
  handleForwardedBrowserViewKey,
  handleNiriWorkspaceClick,
  handleNiriWorkspaceKeyDown,
  handleNiriWorkspaceWheel,
} from "./niri-workspace-interactions";
import {
  applyPaneDrop,
  beginPaneDragSession,
  cleanupPaneDragSession,
  finishPaneDragSession,
  syncPaneDragSourceOffset,
  updatePaneDragSession,
  visiblePaneHostForPane,
  type PaneDragSession,
} from "./pane-drag-reorder";
import { paneResizeTargetFromPointer } from "./pane-resize-target";
import {
  applyPaneResizePointerMove,
  paneResizeSessionFromTarget,
  type PaneResizeSession,
} from "./pane-resize-session";
import { persistRealWorkspaceScene } from "./workspace-scene";
import type { Rect, SurfaceKind } from "./types";

export interface NiriSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

const overviewDragThresholdPx = 6;

interface OverviewDragSession {
  dragging: boolean;
  pointerId: number;
  sourcePaneId: string;
  startClientX: number;
  startClientY: number;
}

export function NiriWorkspaceArea({
  focusSurfaceRequest = null,
  platform,
}: {
  focusSurfaceRequest?: NiriSurfaceFocusRequest | null;
  platform: DesktopPlatform;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);
  const hostRefs = useRef<Array<HTMLDivElement | null>>([]);
  const overviewDragSessionRef = useRef<OverviewDragSession | null>(null);
  const paneDragSessionRef = useRef<PaneDragSession | null>(null);
  const paneResizeSessionRef = useRef<PaneResizeSession | null>(null);
  const suppressNextClickRef = useRef(false);
  const trackpadNavigationRef = useRef(createNiriTrackpadNavigationState());
  const [overviewGhostTarget, setOverviewGhostTarget] = useState<OverviewGhostTarget | null>(null);
  const workspace = useSelectedWorkspaceSummary();
  const showPerformanceStats = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.developer?.showPerformanceStats ?? false,
  );
  const allowResizedPanesToOverflowViewport = useAppearanceStore(
    (state) =>
      (state.draft ?? state.settings)?.developer?.allowResizedPanesToOverflowViewport ?? false,
  );
  const mode = niriSceneMode();
  const { workspaceId, workspaceName } = workspaceRuntimeIdentity(workspace);
  const runtime = useMemo(
    () =>
      createNiriRuntime({
        allowResizedPanesToOverflowViewport,
        mode,
        workspaceId,
        workspaceName,
      }),
    [allowResizedPanesToOverflowViewport, mode, workspaceId, workspaceName],
  );
  const layoutSnapshot = useNiriLayoutSnapshot(runtime.store);
  const currentScene = runtime.store.toScene();
  const stageViewport = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      throw new Error("niri workspace stage is not mounted");
    }
    return viewportRect(stage);
  }, []);
  const persistLayout = useCallback(() => {
    runtime.presentation.syncPanes(runtime.store.toScene().panes);
    if (runtime.mode === "workspace") {
      persistRealWorkspaceScene(
        runtime.layoutStorageKey,
        runtime.store.toScene(),
        runtime.store.focusedPaneId(),
      );
    }
  }, [runtime]);
  const runLayoutAction = useCallback(
    (action: () => void) => {
      action();
      persistLayout();
    },
    [persistLayout],
  );
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
      runtime.store.focusPaneBySurfaceKind(focusSurfaceRequest.surfaceKind);
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
    });
  }, [focusSurfaceRequest, runLayoutAction, runtime, stageViewport]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const hosts = hostRefs.current.filter((host): host is HTMLDivElement => host !== null);
    if (!root || !stage || hosts.length !== runtime.hostPoolSize) {
      throw new Error("niri workspace host pool did not mount");
    }

    runtime.presentation.mount(hosts, debugRef.current);
    if (runtime.mode === "benchmark") {
      installWindowReportHooks();
    }
    const viewportProvider = () => viewportRect(stage);
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
    });
    if (!niriBenchmarkShouldRun(runtime.mode)) {
      scheduler.pauseBenchmark();
    }
    const handleKeyDown = (event: KeyboardEvent) =>
      handleNiriWorkspaceKeyDown({
        event,
        persistLayout,
        runLayoutAction,
        runtime,
        scheduler,
        viewportProvider: stageViewport,
      });
    const handleWheel = (event: WheelEvent) => {
      if (!eventTargetsNiriWheelNavigation(event, root)) {
        return;
      }
      handleNiriWorkspaceWheel({
        event,
        persistLayout,
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
      handleNiriWorkspaceClick({
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
        pointerId: event.pointerId,
        sourcePaneId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return true;
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
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
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
      const targetPaneId = overviewPaneIdAtPoint(event, overviewSession.sourcePaneId);
      if (targetPaneId && targetPaneId !== overviewSession.sourcePaneId) {
        runtime.store.previewPaneDrop(overviewSession.sourcePaneId, targetPaneId, "before");
      } else {
        runtime.store.clearPaneDropPreview();
      }
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
      applyPaneResizePointerMove(runtime.store, session, event);
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
      const sourceHost = visiblePaneHostForPane(overviewSession.sourcePaneId);
      if (sourceHost) {
        sourceHost.removeAttribute("data-drag-source");
        sourceHost.style.translate = "";
      }
      runtime.store.clearPaneDropPreview();
      if (overviewSession.dragging) {
        const targetPaneId = overviewPaneIdAtPoint(event, overviewSession.sourcePaneId);
        if (targetPaneId && targetPaneId !== overviewSession.sourcePaneId) {
          runLayoutAction(() =>
            runtime.store.reorderPaneBefore(overviewSession.sourcePaneId, targetPaneId),
          );
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
      const dragFinish = finishPaneDragSession(event, root, paneDragSession);
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
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      persistLayout();
    };
    const unsubscribeNativeKey =
      window.setta.niriNativeViews?.onBrowserViewKey((event) => {
        if (event.workspaceId !== runtime.scene.id) {
          return;
        }
        handleForwardedBrowserViewKey({
          event,
          persistLayout,
          runLayoutAction,
          runtime,
          scheduler,
          viewportProvider: stageViewport,
        });
      }) ?? (() => {});
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerUp, { capture: true });
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
      root.removeEventListener("click", handleClick, { capture: true });
      root.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("wheel", handleWheel, { capture: true });
      const overviewSourcePaneId = overviewDragSessionRef.current?.sourcePaneId;
      overviewDragSessionRef.current = null;
      if (overviewSourcePaneId) {
        const overviewSourceHost = visiblePaneHostForPane(overviewSourcePaneId);
        overviewSourceHost?.removeAttribute("data-drag-source");
        if (overviewSourceHost) {
          overviewSourceHost.style.translate = "";
        }
      }
      if (paneDragSessionRef.current) {
        cleanupPaneDragSession(root, paneDragSessionRef.current);
        paneDragSessionRef.current = null;
      }
      setOverviewGhostTargetIfChanged(setOverviewGhostTarget, null);
      runtime.store.clearPaneDropPreview();
      paneResizeSessionRef.current = null;
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      scheduler.teardown();
    };
  }, [persistLayout, runLayoutAction, runtime, stageViewport]);

  useEffect(() => {
    runtime.presentation.setDebugOverlay(showPerformanceStats ? debugRef.current : null);
  }, [runtime, showPerformanceStats]);

  return (
    <section
      aria-label={niriWorkspaceAreaLabel(runtime.mode)}
      className="niri-workspace-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count={runtime.browserPaneCount}
      data-desktop-platform={platform}
      data-maximized-pane-id={layoutSnapshot.maximizedPaneId ?? ""}
      data-pane-count={currentScene.totalPanes}
      data-presentation-mode={layoutSnapshot.presentationMode}
      data-workspace-mode={runtime.mode}
      data-workspace-id={runtime.scene.id}
      data-testid="niri-workspace-area"
      ref={rootRef}
    >
      {runtime.mode === "workspace" ? (
        <NiriWorkspaceToolbar
          openPane={(request) => runLayoutAction(() => runtime.store.openPane(request))}
          overviewActive={layoutSnapshot.presentationMode === "overview"}
          performanceStatsRef={showPerformanceStats ? debugRef : null}
          runLayoutAction={runLayoutAction}
          showPerformanceStats={showPerformanceStats}
          store={runtime.store}
        />
      ) : null}
      <div className="niri-stage" data-testid="niri-presentation-engine" ref={stageRef}>
        {layoutSnapshot.presentationMode === "overview" && overviewGhostTarget ? (
          <button
            aria-label={overviewGhostLabel(overviewGhostTarget.placement)}
            className="niri-overview-ghost-pane app-no-drag"
            data-niri-overview-ghost="true"
            data-overview-ghost-placement={overviewGhostTarget.placement}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openOverviewGhostPane(overviewGhostTarget);
            }}
            style={{
              height: `${overviewGhostTarget.height.toFixed(2)}px`,
              left: `${overviewGhostTarget.left.toFixed(2)}px`,
              top: `${overviewGhostTarget.top.toFixed(2)}px`,
              width: `${overviewGhostTarget.width.toFixed(2)}px`,
            }}
            type="button"
          />
        ) : null}
        <Profiler id="niri-fake-pane-hosts" onRender={() => runtime.metrics.recordReactCommit()}>
          {Array.from({ length: runtime.hostPoolSize }, (_, index) => (
            <FakePaneHost
              key={`niri_host_${index}`}
              refCallback={(host) => {
                hostRefs.current[index] = host;
              }}
            />
          ))}
        </Profiler>
      </div>
    </section>
  );
}

function installResizeReportHooksForRuntime(
  runtime: NiriRuntime,
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

function niriBenchmarkShouldRun(mode: NiriSceneMode): boolean {
  return mode === "benchmark" && niriAutoBenchmarkEnabled();
}

function FakePaneHost({ refCallback }: { refCallback: (host: HTMLDivElement | null) => void }) {
  return (
    <article
      className="niri-pane-host app-no-drag"
      data-focused="false"
      data-maximized="false"
      data-moving="false"
      data-pane-id=""
      data-runtime-state="live"
      data-surface-kind=""
      data-testid="niri-fake-pane-host"
      data-tone="slate"
      data-visible="false"
      ref={refCallback}
    />
  );
}

function niriSceneMode(): NiriSceneMode {
  if (typeof window === "undefined") {
    return "workspace";
  }
  return new URLSearchParams(window.location?.search ?? "").get("niriScene") === "benchmark"
    ? "benchmark"
    : "workspace";
}

function niriAutoBenchmarkEnabled(): boolean {
  return new URLSearchParams(window.location?.search ?? "").get("niriAuto") !== "false";
}

function niriWorkspaceAreaLabel(mode: NiriSceneMode): string {
  return mode === "benchmark" ? "Niri benchmark workspace" : "Niri workspace";
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

function useNiriLayoutSnapshot(store: NiriLayoutStore) {
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

function viewportRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    width: rect.width,
    x: 0,
    y: 0,
  };
}
