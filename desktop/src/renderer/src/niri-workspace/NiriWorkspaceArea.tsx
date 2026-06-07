import type { DesktopPlatform } from "@shared/types";
import { Profiler, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { useAppearanceStore } from "../stores/appearance-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { FrameScheduler } from "./frame-scheduler";
import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import { NiriMetricsCollector } from "./metrics";
import { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import {
  installWindowResizeReportHooks,
  installWindowReportHooks,
  LocalStorageResizePerformanceReportWriter,
} from "./performance-report";
import { PresentationEngine } from "./presentation-engine";
import {
  browserPaneCountForScene,
  createRealSceneForRuntime,
  hostPoolSizeForRuntime,
  initialFocusedPaneIdForRuntime,
  paneLimitsForRuntime,
  presentationOptionsForRuntime,
  reportWriterForRuntime,
  runtimePolicyOptionsForRuntime,
  sceneForRuntime,
  snapshotStaticFallbackForRuntime,
  type NiriSceneMode,
} from "./runtime-mode-options";
import { DEFAULT_PANE_BUDGET, PaneRuntimePolicy } from "./runtime-policy";
import { createDefaultSurfaceAdapter, EmptyFrameSurfaceAdapter } from "./surface-adapters";
import { SurfaceRegistry } from "./surface-registry";
import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import { eventTargetsTerminalSurface } from "./terminal-surface-utils";
import {
  createNiriTrackpadNavigationState,
  interpretNiriTrackpadWheel,
} from "./trackpad-navigation";
import {
  emptyFrameOptionsForStore,
  NiriWorkspaceToolbar,
  openPaneActionForSurfaceKind,
  openPaneActions,
} from "./niri-workspace-toolbar";
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
import { paneFocusTargetFromClick } from "./pane-focus-click";
import { handlePaneTitleEditorFocusOut, handlePaneTitleEditorKeyDown } from "./pane-title-editor";
import { paneResizeTargetFromPointer } from "./pane-resize-target";
import {
  applyPaneResizePointerMove,
  paneResizeSessionFromTarget,
  type PaneResizeSession,
} from "./pane-resize-session";
import { persistRealWorkspaceScene } from "./workspace-scene";
import type { NiriPane, Rect, SurfaceKind } from "./types";

export interface NiriSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

const overviewDragThresholdPx = 6;
type PaneChromeAction =
  | "add-above"
  | "add-below"
  | "close"
  | "maximize"
  | "split-down"
  | "split-right";

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
  const workspace = useSelectedWorkspaceSummary();
  const showPerformanceStats = useAppearanceStore(
    (state) => (state.draft ?? state.settings)?.developer?.showPerformanceStats ?? false,
  );
  const allowResizedPanesToOverflowViewport = useAppearanceStore(
    (state) =>
      (state.draft ?? state.settings)?.developer?.allowResizedPanesToOverflowViewport ?? false,
  );
  const mode = niriSceneMode();
  const runtime = useMemo(
    () =>
      createNiriRuntime({
        allowResizedPanesToOverflowViewport,
        mode,
        workspaceId: workspace?.id ?? "empty",
        workspaceName: workspace?.displayName ?? "No workspace",
      }),
    [allowResizedPanesToOverflowViewport, mode, workspace?.displayName, workspace?.id],
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
    const handleWheel = (event: WheelEvent) =>
      handleNiriWorkspaceWheel({
        event,
        persistLayout,
        runtime,
        scheduler,
        state: trackpadNavigationRef.current,
        viewportProvider: stageViewport,
      });
    const titleEditorContext = { runLayoutAction, runtime };
    const handleFocusOut = (event: FocusEvent) =>
      handlePaneTitleEditorFocusOut({ ...titleEditorContext, event });
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
    const handlePointerDown = (event: PointerEvent) => {
      if (runtime.mode !== "workspace") {
        return;
      }
      if (runtime.store.getSnapshot().presentationMode === "overview") {
        if (eventTargetsPaneChromeAction(event)) {
          return;
        }
        const sourcePaneId = overviewPaneIdFromPointer(event);
        if (!sourcePaneId) {
          return;
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
        return;
      }
      const paneDragSession = beginPaneDragSession(event, root);
      if (paneDragSession) {
        event.preventDefault();
        event.stopPropagation();
        scheduler.pauseBenchmark();
        paneDragSessionRef.current = paneDragSession;
        return;
      }
      const target = paneResizeTargetFromPointer(event);
      if (!target) {
        return;
      }
      const resizeSession = paneResizeSessionFromTarget(target, event, runtime.store);
      if (!resizeSession) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      root.dataset.paneResizing = "true";
      root.dataset.paneResizingAxis = resizeSession.axis;
      paneResizeSessionRef.current = resizeSession;
    };
    const handlePointerMove = (event: PointerEvent) => {
      const overviewSession = overviewDragSessionRef.current;
      if (overviewSession && event.pointerId === overviewSession.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const distance = Math.hypot(
          event.clientX - overviewSession.startClientX,
          event.clientY - overviewSession.startClientY,
        );
        if (distance > overviewDragThresholdPx) {
          overviewSession.dragging = true;
          root.dataset.overviewDragging = "true";
          syncPaneDragSourceOffset(overviewSession, event);
          const targetPaneId = overviewPaneIdAtPoint(event, overviewSession.sourcePaneId);
          if (targetPaneId && targetPaneId !== overviewSession.sourcePaneId) {
            runtime.store.previewPaneDrop(overviewSession.sourcePaneId, targetPaneId, "before");
          } else {
            runtime.store.clearPaneDropPreview();
          }
        }
        return;
      }
      const paneDragSession = paneDragSessionRef.current;
      if (paneDragSession && event.pointerId === paneDragSession.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        updatePaneDragSession(event, root, paneDragSession, runtime.store);
        return;
      }
      const session = paneResizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      applyPaneResizePointerMove(runtime.store, session, event);
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
      delete root.dataset.paneResizing;
      delete root.dataset.paneResizingAxis;
      persistLayout();
    };
    const unsubscribeNativeKey =
      window.setta.niriNativeViews?.onBrowserViewKey((event) => {
        if (event.workspaceId !== runtime.scene.id) {
          return;
        }
        scheduler.pauseBenchmark();
        runtime.store.moveFocus(arrowDirection(event.key), stageViewport());
        persistLayout();
      }) ?? (() => {});
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerUp, { capture: true });
    root.addEventListener("click", handleClick, { capture: true });
    root.addEventListener("focusout", handleFocusOut, { capture: true });
    root.addEventListener("pointerdown", handlePointerDown, { capture: true });
    root.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    scheduler.start();
    return () => {
      uninstallResizeReportHooks();
      unsubscribeNativeKey();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("pointercancel", handlePointerUp, { capture: true });
      root.removeEventListener("click", handleClick, { capture: true });
      root.removeEventListener("focusout", handleFocusOut, { capture: true });
      root.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      root.removeEventListener("wheel", handleWheel, { capture: true });
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
      aria-label={runtime.mode === "benchmark" ? "Niri benchmark workspace" : "Niri workspace"}
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
          focusedPaneId={layoutSnapshot.focusedPaneId}
          openPane={(request) => runLayoutAction(() => runtime.store.openPane(request))}
          overviewActive={layoutSnapshot.presentationMode === "overview"}
          performanceStatsRef={showPerformanceStats ? debugRef : null}
          runLayoutAction={runLayoutAction}
          showPerformanceStats={showPerformanceStats}
          store={runtime.store}
        />
      ) : null}
      <div className="niri-stage" data-testid="niri-presentation-engine" ref={stageRef}>
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

type NiriRuntime = ReturnType<typeof createNiriRuntime>;

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

function handleNiriWorkspaceClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): void {
  if (runtime.mode !== "workspace" || !(event.target instanceof Element)) {
    return;
  }
  if (
    handlePaneChromeActionClick({
      event,
      runLayoutAction,
      runtime,
      scheduler,
      viewportProvider,
    })
  ) {
    return;
  }
  if (runtime.store.getSnapshot().presentationMode === "overview") {
    return;
  }
  if (handleEmptyFrameActionClick({ event, runLayoutAction, runtime, scheduler })) {
    return;
  }
  handlePaneChromeFocusClick({ event, runLayoutAction, runtime, scheduler, viewportProvider });
}

function eventTargetsPaneChromeAction(event: PointerEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-niri-pane-action]") instanceof HTMLButtonElement
  );
}

function handleEmptyFrameActionClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
}): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const button = event.target.closest<HTMLButtonElement>('[data-niri-empty-frame-action="true"]');
  const paneId = emptyFrameHostPaneId(button);
  const action = openPaneActionForSurfaceKind(button?.dataset.surfaceKind ?? "");
  if (!button || !paneId || !action || !runtime.store.canOpenPane(action.request)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  runLayoutAction(() => runtime.store.configurePane(paneId, action.request));
  return true;
}

function emptyFrameHostPaneId(button: HTMLButtonElement | null): string | null {
  const host = button?.closest<HTMLElement>('[data-testid="niri-fake-pane-host"]');
  return host?.dataset.paneId ?? null;
}

function handlePaneChromeActionClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const button = event.target.closest<HTMLButtonElement>("[data-niri-pane-action]");
  const action = paneChromeActionFromButton(button);
  const paneId = paneChromeActionButtonPaneId(button);
  if (!button || !action || !paneId) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  runPaneChromeAction({ action, paneId, runLayoutAction, runtime, viewportProvider });
  return true;
}

function paneChromeActionButtonPaneId(button: HTMLButtonElement | null): string | null {
  const host = button?.closest<HTMLElement>('[data-testid="niri-fake-pane-host"]');
  return button?.dataset.paneId ?? host?.dataset.paneId ?? null;
}

function paneChromeActionFromButton(button: HTMLButtonElement | null): PaneChromeAction | null {
  const action = button?.dataset.niriPaneAction;
  switch (action) {
    case "add-above":
    case "add-below":
    case "close":
    case "maximize":
    case "split-down":
    case "split-right":
      return action;
    case undefined:
    default:
      return null;
  }
}

function runPaneChromeAction({
  action,
  paneId,
  runLayoutAction,
  runtime,
  viewportProvider,
}: {
  action: PaneChromeAction;
  paneId: string;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  viewportProvider: () => Rect;
}): void {
  switch (action) {
    case "add-above":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPaneToPlane("up");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "add-below":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPaneToPlane("down");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "close":
      closePaneWithConfirmation({ paneId, runLayoutAction, runtime, viewportProvider });
      return;
    case "maximize":
      runLayoutAction(() => {
        runtime.store.togglePaneMaximized(paneId);
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "split-down":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPane("down");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "split-right":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPane("right");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    default:
      assertNever(action);
  }
}

function handlePaneChromeFocusClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): boolean {
  const paneId = paneFocusTargetFromClick(event);
  if (!paneId || paneId === runtime.store.focusedPaneId()) {
    return false;
  }
  scheduler.pauseBenchmark();
  runLayoutAction(() => {
    if (runtime.store.focusPane(paneId)) {
      runtime.store.ensureFocusedPaneVisible(viewportProvider());
    }
  });
  return true;
}

function handleNiriWorkspaceKeyDown({
  event,
  persistLayout,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: KeyboardEvent;
  persistLayout: () => void;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): void {
  if (handlePaneTitleEditorKeyDown({ event, runLayoutAction, runtime })) {
    return;
  }
  if (eventTargetsTerminalSurface(event)) {
    return;
  }
  if (event.metaKey && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    scheduler.pauseBenchmark();
    runLayoutAction(() =>
      runtime.store.splitFocusedPaneToPlane(event.key === "ArrowUp" ? "up" : "down"),
    );
    return;
  }
  if (!isArrowKey(event.key)) {
    handleNiriWorkspaceCommandKey({ event, runLayoutAction, runtime });
    return;
  }
  event.preventDefault();
  scheduler.pauseBenchmark();
  if (event.shiftKey) {
    runLayoutAction(() => runtime.store.moveFocusedPane(arrowDirection(event.key)));
    return;
  }
  runtime.store.moveFocus(arrowDirection(event.key), viewportProvider());
  persistLayout();
}

function handleNiriWorkspaceCommandKey({
  event,
  runLayoutAction,
  runtime,
}: {
  event: KeyboardEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
}): void {
  const handlers = [
    handleNewEmptyFrameCommand,
    handleSplitFocusedPaneCommand,
    handleOpenPaneShortcutCommand,
    handleToggleOverviewCommand,
    handleCloseFocusedPaneCommand,
  ];
  for (const handler of handlers) {
    if (handler({ event, runLayoutAction, runtime })) {
      return;
    }
  }
}

type NiriWorkspaceCommandHandler = (context: {
  event: KeyboardEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
}) => boolean;

const handleNewEmptyFrameCommand: NiriWorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.key.toLowerCase() !== "n") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.openEmptyFrame());
  return true;
};

const handleSplitFocusedPaneCommand: NiriWorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.key !== "Enter") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.splitFocusedPane(event.shiftKey ? "down" : "right"));
  return true;
};

const handleOpenPaneShortcutCommand: NiriWorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || !event.altKey) {
    return false;
  }
  const action = openPaneActions.find(
    (candidate) => candidate.shortcutKey === event.key.toLowerCase(),
  );
  if (!action) {
    return false;
  }
  event.preventDefault();
  if (runtime.store.canOpenPane(action.request)) {
    runLayoutAction(() => runtime.store.openPane(action.request));
  }
  return true;
};

const handleToggleOverviewCommand: NiriWorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.key.toLowerCase() !== "o") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.toggleOverviewMode());
  return true;
};

const handleCloseFocusedPaneCommand: NiriWorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || !isClosePaneKey(event.key)) {
    return false;
  }
  event.preventDefault();
  const focusedPaneId = runtime.store.focusedPaneId();
  closePaneWithConfirmation({ paneId: focusedPaneId, runLayoutAction, runtime });
  return true;
};

function isClosePaneKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

function closePaneWithConfirmation({
  paneId,
  runLayoutAction,
  runtime,
  viewportProvider,
}: {
  paneId: string;
  runLayoutAction: (action: () => void) => void;
  runtime: NiriRuntime;
  viewportProvider?: () => Rect;
}): void {
  const pane = runtime.store.toScene().paneById.get(paneId);
  if (
    pane?.surfaceKind === "terminal" &&
    terminalPaneCloseRequiresConfirmation(paneId) &&
    !window.confirm("Close running terminal session?")
  ) {
    return;
  }
  runLayoutAction(() => {
    if (!runtime.store.focusPane(paneId)) {
      return;
    }
    runtime.store.closeFocusedPane();
    if (viewportProvider) {
      runtime.store.ensureFocusedPaneVisible(viewportProvider());
    }
  });
}

function terminalPaneCloseRequiresConfirmation(paneId: string): boolean {
  const host = visiblePaneHostForPane(paneId);
  const sessionId = host?.dataset.terminalSessionId ?? "";
  if (sessionId === "") {
    return false;
  }
  const status = host?.dataset.terminalStatus ?? "";
  return status === "" || status === "running" || status === "starting";
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}

function handleNiriWorkspaceWheel({
  event,
  persistLayout,
  runtime,
  scheduler,
  state,
  viewportProvider,
}: {
  event: WheelEvent;
  persistLayout: () => void;
  runtime: NiriRuntime;
  scheduler: FrameScheduler;
  state: ReturnType<typeof createNiriTrackpadNavigationState>;
  viewportProvider: () => Rect;
}): void {
  const presentationMode = runtime.store.getSnapshot().presentationMode;
  const result = interpretNiriTrackpadWheel(
    {
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      modifierRequired: presentationMode !== "overview",
    },
    state,
  );
  if (!result.shouldHandle) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (result.directions.length === 0) {
    return;
  }

  scheduler.pauseBenchmark();
  for (const direction of result.directions) {
    runtime.store.moveFocus(direction, viewportProvider());
  }
  persistLayout();
}

function overviewPaneIdFromPointer(event: PointerEvent): string | null {
  return event.target instanceof Element ? visiblePaneHostId(event.target) : null;
}

function overviewPaneIdAtPoint(event: PointerEvent, excludedPaneId?: string): string | null {
  return visiblePaneHostIdAtPoint(event.clientX, event.clientY, excludedPaneId);
}

function visiblePaneHostId(element: Element | null): string | null {
  const host = element?.closest<HTMLElement>(
    '[data-testid="niri-fake-pane-host"][data-visible="true"]',
  );
  return host?.dataset.paneId ?? null;
}

function visiblePaneHostIdAtPoint(
  clientX: number,
  clientY: number,
  excludedPaneId?: string,
): string | null {
  const elements =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(
          (element): element is Element => element !== null,
        );
  for (const element of elements) {
    const paneId = visiblePaneHostId(element);
    if (paneId && paneId !== excludedPaneId) {
      return paneId;
    }
  }
  return null;
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

function arrowDirection(key: string): "up" | "down" | "left" | "right" {
  switch (key) {
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    default:
      throw new Error(`unsupported niri focus key: ${key}`);
  }
}

function createNiriRuntime({
  allowResizedPanesToOverflowViewport,
  mode,
  workspaceId,
  workspaceName,
}: {
  allowResizedPanesToOverflowViewport: boolean;
  mode: NiriSceneMode;
  workspaceId: string;
  workspaceName: string;
}) {
  const layoutStorageKey = `setta:niri-workspace-horizontal-v4:${workspaceId}`;
  const realScene = createRealSceneForRuntime({ layoutStorageKey, mode, workspaceName });
  const scene = sceneForRuntime(realScene);
  const engine = new NiriLikeLayoutEngine(scene, { allowResizedPanesToOverflowViewport });
  const store = new NiriLayoutStore(
    engine,
    scene,
    initialFocusedPaneIdForRuntime(mode, engine, realScene),
    {
      paneLimits: paneLimitsForRuntime(mode),
    },
  );
  const metrics = new NiriMetricsCollector();
  const browserPaneCount = browserPaneCountForScene(scene);
  const nativeViewBoundsBatcher = new NativeViewBoundsBatcher({
    totalBrowserPanes: browserPaneCount,
    workspaceId: scene.id,
  });
  const persistPaneConfig = () => {
    if (mode !== "workspace") {
      return;
    }
    persistRealWorkspaceScene(layoutStorageKey, store.toScene(), store.focusedPaneId());
  };
  const createSurfaceAdapter = createSurfaceAdapterFactory(
    store,
    nativeViewBoundsBatcher,
    workspaceId,
    persistPaneConfig,
  );
  const surfaceRegistry = new SurfaceRegistry(scene.panes, createSurfaceAdapter, {
    snapshotAdapter: {
      staticFallback: snapshotStaticFallbackForRuntime(mode),
    },
  });
  return {
    engine,
    metrics,
    browserPaneCount,
    hostPoolSize: hostPoolSizeForRuntime(mode),
    layoutStorageKey,
    mode,
    presentation: new PresentationEngine(
      scene.panes,
      metrics,
      surfaceRegistry,
      nativeViewBoundsBatcher,
      presentationOptionsForRuntime(mode),
    ),
    reportWriter: reportWriterForRuntime(mode),
    resizeReportWriter: new LocalStorageResizePerformanceReportWriter(1500),
    runtimePolicy: new PaneRuntimePolicy(DEFAULT_PANE_BUDGET, runtimePolicyOptionsForRuntime(mode)),
    scene,
    store,
  };
}

function createSurfaceAdapterFactory(
  store: NiriLayoutStore,
  nativeViewBoundsBatcher: NativeViewBoundsBatcher,
  workspaceId: string,
  persistPaneConfig: () => void,
) {
  return (pane: NiriPane) => {
    if (pane.surfaceKind === "browser") {
      return new BrowserSurfaceProxyAdapter(pane, nativeViewBoundsBatcher);
    }
    if (pane.surfaceKind === "empty-frame") {
      return new EmptyFrameSurfaceAdapter(pane, () => emptyFrameOptionsForStore(store));
    }
    if (pane.surfaceKind === "terminal") {
      return new TerminalSurfaceAdapter(pane, workspaceId, {
        onProfileSelected: (paneId, profileId) => {
          store.setPaneTerminalConfig(paneId, {
            ...(pane.terminalConfig ?? {}),
            profileId,
          });
          persistPaneConfig();
        },
      });
    }
    return createDefaultSurfaceAdapter(pane);
  };
}

function isArrowKey(key: string): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
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
