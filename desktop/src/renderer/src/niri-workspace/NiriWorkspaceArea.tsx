import {
  AppWindow,
  ChevronDown,
  Columns2,
  GitBranch,
  MessageSquarePlus,
  PanelBottom,
  PanelTop,
  Settings,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Terminal,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Profiler,
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { FloatingMenu } from "../components/floating-menu";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { generateBenchmarkScene, phaseOneVisiblePaneCount } from "./benchmark-scene";
import { FrameScheduler } from "./frame-scheduler";
import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import { NiriMetricsCollector } from "./metrics";
import { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import {
  installWindowResizeReportHooks,
  installWindowReportHooks,
  LocalStoragePerformanceReportWriter,
  LocalStorageResizePerformanceReportWriter,
} from "./performance-report";
import { PresentationEngine } from "./presentation-engine";
import { DEFAULT_PANE_BUDGET, PaneRuntimePolicy } from "./runtime-policy";
import { createDefaultSurfaceAdapter } from "./surface-adapters";
import { SurfaceRegistry } from "./surface-registry";
import {
  createNiriTrackpadNavigationState,
  interpretNiriTrackpadWheel,
} from "./trackpad-navigation";
import { useWorkspaceStore } from "../stores/workspace-store";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  persistRealWorkspaceScene,
} from "./workspace-scene";
import type { NiriPane, OpenPaneRequest, Rect, SurfaceKind } from "./types";

type NiriSceneMode = "benchmark" | "workspace";
export interface NiriSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

const realWorkspaceHostPoolSize = 18;
const paneResizeHandleWidthPx = 10;
const minimumManualPaneWidthPx = 280;

interface PaneResizeSession {
  columnId: string;
  pointerId: number;
  startClientX: number;
  startWidth: number;
}

export function NiriWorkspaceArea({
  focusSurfaceRequest = null,
}: {
  focusSurfaceRequest?: NiriSurfaceFocusRequest | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);
  const hostRefs = useRef<Array<HTMLDivElement | null>>([]);
  const paneResizeSessionRef = useRef<PaneResizeSession | null>(null);
  const trackpadNavigationRef = useRef(createNiriTrackpadNavigationState());
  const workspace = useSelectedWorkspaceSummary();
  const mode = niriSceneMode();
  const runtime = useMemo(
    () =>
      createNiriRuntime({
        mode,
        workspaceId: workspace?.id ?? "empty",
        workspaceName: workspace?.displayName ?? "No workspace",
      }),
    [mode, workspace?.displayName, workspace?.id],
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
    const handleClick = (event: MouseEvent) => {
      if (
        runtime.mode !== "workspace" ||
        runtime.store.getSnapshot().presentationMode === "overview" ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const button = event.target.closest<HTMLButtonElement>(
        '.niri-pane-maximize-button[data-niri-pane-maximize-button="true"]',
      );
      if (!button) {
        return;
      }
      const host = button.closest<HTMLElement>('[data-testid="niri-fake-pane-host"]');
      const paneId = button.dataset.paneId ?? host?.dataset.paneId;
      if (!paneId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      runLayoutAction(() => runtime.store.togglePaneMaximized(paneId));
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        runtime.mode !== "workspace" ||
        runtime.store.getSnapshot().presentationMode === "overview"
      ) {
        return;
      }
      const target = paneResizeTargetFromPointer(event);
      if (!target) {
        return;
      }
      const columnId = runtime.store.toScene().paneById.get(target.paneId)?.columnId;
      if (!columnId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      scheduler.pauseBenchmark();
      root.dataset.paneResizing = "true";
      paneResizeSessionRef.current = {
        columnId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startWidth: target.width,
      };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const session = paneResizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const width = Math.max(
        minimumManualPaneWidthPx,
        Math.round(session.startWidth + event.clientX - session.startClientX),
      );
      runtime.store.resizeColumn(session.columnId, { unit: "px", value: width });
    };
    const handlePointerUp = (event: PointerEvent) => {
      const session = paneResizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      paneResizeSessionRef.current = null;
      delete root.dataset.paneResizing;
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
      root.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      root.removeEventListener("wheel", handleWheel, { capture: true });
      paneResizeSessionRef.current = null;
      scheduler.teardown();
    };
  }, [persistLayout, runLayoutAction, runtime, stageViewport]);

  return (
    <section
      aria-label={runtime.mode === "benchmark" ? "Niri benchmark workspace" : "Niri workspace"}
      className="niri-workspace-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count={runtime.browserPaneCount}
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
          runLayoutAction={runLayoutAction}
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
      <div
        aria-live="off"
        className="niri-debug-overlay app-no-drag"
        data-testid="niri-debug-overlay"
        ref={debugRef}
      >
        frame 0.00ms | p95 0.00ms | p99 0.00ms | visible 0 | writes 0 | long 0 | react 0 | runtime
        0/0/0/0 | resize 0/0.00/0/0/0 | terminal 0/0/0 | graph 0/none/0%/0
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
  if (event.metaKey && event.key === "Enter") {
    event.preventDefault();
    runLayoutAction(() => runtime.store.splitFocusedPane(event.shiftKey ? "down" : "right"));
  } else if (event.metaKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    runLayoutAction(() => runtime.store.toggleOverviewMode());
  } else if (event.metaKey && (event.key === "Backspace" || event.key === "Delete")) {
    event.preventDefault();
    runLayoutAction(() => {
      runtime.store.closeFocusedPane();
    });
  }
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

function paneResizeTargetFromPointer(event: PointerEvent): {
  paneId: string;
  width: number;
} | null {
  if (!(event.target instanceof Element)) {
    return null;
  }
  const host = event.target.closest<HTMLElement>(
    '[data-testid="niri-fake-pane-host"][data-visible="true"]',
  );
  if (!host) {
    return null;
  }
  const paneId = host.dataset.paneId;
  if (!paneId) {
    return null;
  }
  const rect = host.getBoundingClientRect();
  const rightEdgeStart = rect.right - paneResizeHandleWidthPx;
  if (event.clientX < rightEdgeStart || event.clientX > rect.right) {
    return null;
  }
  return {
    paneId,
    width: rect.width,
  };
}

function NiriWorkspaceToolbar({
  focusedPaneId,
  openPane,
  overviewActive,
  runLayoutAction,
  store,
}: {
  focusedPaneId: string;
  openPane: (request: OpenPaneRequest) => void;
  overviewActive: boolean;
  runLayoutAction: (action: () => void) => void;
  store: NiriLayoutStore;
}) {
  const OverviewIcon = overviewActive ? ZoomIn : ZoomOut;
  const newFrameItems = openPaneActions.map(({ Icon, label, request }) => {
    const limitState = store.paneLimitState(request);
    const capped = limitState.limit !== null;
    return {
      Icon,
      disabled: !limitState.allowed,
      label,
      meta: capped ? `${limitState.count}/${limitState.limit}` : undefined,
      onSelect: () => openPane(request),
    };
  });
  return (
    <div className="niri-workspace-toolbar app-no-drag" data-testid="niri-workspace-toolbar">
      <div className="niri-workspace-toolbar-group" data-testid="niri-focused-pane-label">
        <span>{focusedPaneId}</span>
      </div>
      <div className="niri-workspace-toolbar-group">
        <NiriToolbarButton
          displayLabel="Split vertical"
          label="Frame split vertically"
          onClick={() => runLayoutAction(() => store.splitFocusedPane("down"))}
        >
          <SplitSquareVertical className="h-3.5 w-3.5" />
        </NiriToolbarButton>
        <NiriToolbarButton
          displayLabel="Add right"
          label="Add frame to the right"
          onClick={() => runLayoutAction(() => store.splitFocusedPane("right"))}
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </NiriToolbarButton>
        <NiriToolbarMenu
          displayLabel="Above / below"
          Icon={PanelBottom}
          items={[
            {
              Icon: PanelTop,
              label: "Add frame above",
              onSelect: () => runLayoutAction(() => store.splitFocusedPaneToPlane("up")),
            },
            {
              Icon: PanelBottom,
              label: "Add frame below",
              onSelect: () => runLayoutAction(() => store.splitFocusedPaneToPlane("down")),
            },
          ]}
          label="Add frame above or below"
        />
        <NiriToolbarButton
          label={overviewActive ? "Exit overview" : "Enter overview"}
          onClick={() => runLayoutAction(() => store.toggleOverviewMode())}
        >
          <OverviewIcon className="h-3.5 w-3.5" />
        </NiriToolbarButton>
        <NiriToolbarMenu
          displayLabel="New frame"
          Icon={Plus}
          items={newFrameItems}
          label="New frame"
        />
      </div>
    </div>
  );
}

function NiriToolbarButton({
  children,
  displayLabel,
  label,
  onClick,
}: {
  children: ReactNode;
  displayLabel?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="niri-workspace-toolbar-button"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      {displayLabel ? <span>{displayLabel}</span> : null}
    </button>
  );
}

interface NiriToolbarMenuItem {
  disabled?: boolean;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  meta?: string;
  onSelect: () => void;
}

function NiriToolbarMenu({
  displayLabel,
  Icon,
  items,
  label,
}: {
  displayLabel: string;
  Icon: ComponentType<{ className?: string }>;
  items: readonly NiriToolbarMenuItem[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="niri-workspace-toolbar-menu-root" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="niri-workspace-toolbar-menu-button"
        onClick={() => setOpen((current) => !current)}
        onPointerDown={(event) => event.stopPropagation()}
        ref={anchorRef}
        title={label}
        type="button"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{displayLabel}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        ariaLabel={`${label} options`}
        className="niri-workspace-toolbar-menu"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="menu"
      >
        {items.map(({ disabled = false, Icon: ItemIcon, label: itemLabel, meta, onSelect }) => (
          <button
            className="niri-workspace-toolbar-menu-item"
            disabled={disabled}
            key={itemLabel}
            onClick={() => {
              if (disabled) {
                return;
              }
              setOpen(false);
              onSelect();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="menuitem"
            title={disabled ? `${itemLabel} limit reached` : itemLabel}
            type="button"
          >
            <ItemIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{itemLabel}</span>
            {meta ? <span className="niri-workspace-toolbar-menu-item-meta">{meta}</span> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}

const openPaneActions = [
  {
    Icon: MessageSquarePlus,
    label: "Chat",
    request: openPaneRequest("Chat", "chat workspace surface", "chat-dom", "cyan"),
  },
  {
    Icon: AppWindow,
    label: "Browser",
    request: openPaneRequest("Browser", "native browser proxy", "browser", "orange"),
  },
  {
    Icon: Terminal,
    label: "Terminal",
    request: openPaneRequest("Terminal", "command surface", "terminal", "green"),
  },
  {
    Icon: Settings,
    label: "Settings",
    request: openPaneRequest("Settings", "workspace settings", "settings-dom", "slate"),
  },
  {
    Icon: GitBranch,
    label: "Git Graph",
    request: openPaneRequest("Git Graph", "repository graph", "git-graph", "pink"),
  },
  {
    Icon: Columns2,
    label: "Canvas",
    request: openPaneRequest("Canvas", "canvas placeholder", "pixi-canvas", "cyan"),
  },
] satisfies Array<{
  Icon: ComponentType<{ className?: string }>;
  label: string;
  request: OpenPaneRequest;
}>;

function openPaneRequest(
  title: string,
  subtitle: string,
  surfaceKind: SurfaceKind,
  tone: NiriPane["tone"],
): OpenPaneRequest {
  return {
    subtitle,
    surfaceKind,
    title,
    tone,
  };
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
  mode,
  workspaceId,
  workspaceName,
}: {
  mode: NiriSceneMode;
  workspaceId: string;
  workspaceName: string;
}) {
  const layoutStorageKey = `setta:niri-workspace-horizontal-v4:${workspaceId}`;
  const realScene =
    mode === "workspace"
      ? createRealWorkspaceScene({
          storageKey: layoutStorageKey,
          workspaceName,
        })
      : null;
  const scene = realScene?.scene ?? generateBenchmarkScene();
  const engine = new NiriLikeLayoutEngine(scene);
  const store = new NiriLayoutStore(engine, scene, realScene?.focusedPaneId, {
    paneLimits: mode === "workspace" ? defaultRealWorkspacePaneLimits : undefined,
  });
  const metrics = new NiriMetricsCollector();
  const browserPaneCount = scene.panes.filter((pane) => pane.surfaceKind === "browser").length;
  const nativeViewBoundsBatcher = new NativeViewBoundsBatcher({
    totalBrowserPanes: browserPaneCount,
    workspaceId: scene.id,
  });
  const surfaceRegistry = new SurfaceRegistry(
    scene.panes,
    (pane) => {
      if (pane.surfaceKind === "browser") {
        return new BrowserSurfaceProxyAdapter(pane, nativeViewBoundsBatcher);
      }
      return createDefaultSurfaceAdapter(pane);
    },
    {
      snapshotAdapter: {
        staticFallback: mode === "workspace",
      },
    },
  );
  return {
    engine,
    metrics,
    browserPaneCount,
    hostPoolSize: mode === "benchmark" ? phaseOneVisiblePaneCount : realWorkspaceHostPoolSize,
    layoutStorageKey,
    mode,
    presentation: new PresentationEngine(
      scene.panes,
      metrics,
      surfaceRegistry,
      nativeViewBoundsBatcher,
      { syncAllRenderedContentDuringMovement: mode === "workspace" },
    ),
    reportWriter: mode === "benchmark" ? new LocalStoragePerformanceReportWriter(5000) : null,
    resizeReportWriter: new LocalStorageResizePerformanceReportWriter(1500),
    runtimePolicy: new PaneRuntimePolicy(DEFAULT_PANE_BUDGET, {
      degradeDuringMovement: mode === "benchmark",
    }),
    scene,
    store,
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
