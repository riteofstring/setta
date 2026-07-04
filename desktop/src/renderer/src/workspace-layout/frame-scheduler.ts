import { AnimationClock } from "./animation-clock";
import type { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { WorkspaceLayoutSnapshot, WorkspaceLayoutStore } from "./layout-store";
import type { WorkspaceMetricsCollector } from "./metrics";
import { interpolatePaneRenderItems } from "./pane-render-interpolation";
import type { PerformanceReportWriter } from "./performance-report";
import type { LayoutFrameInput, PaneRenderItem, Rect } from "./types";
import type { PresentationEngine } from "./presentation-engine";
import type { PaneRuntimePolicy } from "./runtime-policy";
import { ResizePhaseTracker } from "./resize-phase-tracker";

const focusStepIntervalMs = 120;
const benchmarkWarmupMs = 2000;

interface FrameSchedulerDependencies {
  continuous?: boolean;
  engine: WorkspaceLikeLayoutEngine;
  layoutStore: WorkspaceLayoutStore;
  metrics: WorkspaceMetricsCollector;
  movementOverride?: () => boolean;
  presentation: PresentationEngine;
  reportWriter: PerformanceReportWriter | null;
  runtimePolicy: PaneRuntimePolicy;
  viewportProvider: () => Rect;
}

interface ZoomEndpointFrames {
  key: string;
  normalItems: PaneRenderItem[];
  overviewItems: PaneRenderItem[];
}

interface RenderFrameState {
  frameInput: Omit<LayoutFrameInput, "presentationMode">;
  moving: boolean;
  renderMovementPhase: "idle" | "moving";
  snapshot: WorkspaceLayoutSnapshot;
  zooming: boolean;
}

export class FrameScheduler {
  private benchmarkDirection: "left" | "right" = "right";
  private benchmarkPaused = false;
  private clock: AnimationClock;
  private destroyed = false;
  private frameRequestSequence = 0;
  private items: PaneRenderItem[] = [];
  private lastFrameNeedsContinuation = false;
  private lastFocusStepTimestamp = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private measurementStartedAt = 0;
  private overviewViewport: Rect | null = null;
  private reportWritten = false;
  private renderedFrameRequestSequence = 0;
  private resizePhaseTracker = new ResizePhaseTracker();
  private started = false;
  private startedAt = 0;
  private unsubscribeLayoutStore: (() => void) | null = null;
  private zoomEndpointFrames: ZoomEndpointFrames | null = null;

  private readonly continuous: boolean;
  private readonly engine: WorkspaceLikeLayoutEngine;
  private readonly layoutStore: WorkspaceLayoutStore;
  private readonly metrics: WorkspaceMetricsCollector;
  private readonly movementOverride: () => boolean;
  private readonly presentation: PresentationEngine;
  private readonly reportWriter: PerformanceReportWriter | null;
  private readonly runtimePolicy: PaneRuntimePolicy;
  private readonly viewportProvider: () => Rect;

  constructor(dependencies: FrameSchedulerDependencies) {
    this.continuous = dependencies.continuous ?? false;
    this.engine = dependencies.engine;
    this.layoutStore = dependencies.layoutStore;
    this.metrics = dependencies.metrics;
    this.movementOverride = dependencies.movementOverride ?? (() => false);
    this.presentation = dependencies.presentation;
    this.reportWriter = dependencies.reportWriter;
    this.runtimePolicy = dependencies.runtimePolicy;
    this.viewportProvider = dependencies.viewportProvider;
    this.clock = new AnimationClock(this.tick);
  }

  start(): void {
    if (this.started || this.destroyed) {
      return;
    }
    this.started = true;
    this.startedAt = performance.now();
    this.observeLongTasks();
    this.unsubscribeLayoutStore = this.layoutStore.subscribe(() => {
      this.requestFrame();
    });
    this.requestFrame();
  }

  pauseBenchmark(): void {
    this.benchmarkPaused = true;
  }

  requestFrame(): void {
    if (this.destroyed) {
      return;
    }
    this.frameRequestSequence += 1;
    if (this.started) {
      this.clock.start();
    }
  }

  teardown(): void {
    this.destroyed = true;
    this.started = false;
    this.clock.stop();
    this.unsubscribeLayoutStore?.();
    this.unsubscribeLayoutStore = null;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.zoomEndpointFrames = null;
    this.presentation.teardown();
  }

  private advanceBenchmarkFocus(timestamp: number): void {
    if (this.benchmarkPaused) {
      return;
    }
    if (timestamp - this.lastFocusStepTimestamp < focusStepIntervalMs) {
      return;
    }
    this.lastFocusStepTimestamp = timestamp;
    const snapshot = this.layoutStore.getSnapshot();
    const lastColumn = Math.max(0, this.layoutStore.visibleColumnCount() - 1);
    if (snapshot.focusedColumnIndex >= lastColumn) {
      this.benchmarkDirection = "left";
    } else if (snapshot.focusedColumnIndex <= 0) {
      this.benchmarkDirection = "right";
    }
    this.layoutStore.moveFocus(this.benchmarkDirection);
  }

  private observeLongTasks(): void {
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      return;
    }
    this.longTaskObserver = new PerformanceObserver((entries) => {
      const longTaskCount = entries.getEntries().length;
      for (let index = 0; index < longTaskCount; index += 1) {
        this.metrics.recordLongTask();
      }
    });
    this.longTaskObserver.observe({ type: "longtask", buffered: true });
  }

  private renderFrame(
    deltaMs: number,
    viewport: Rect,
    resizePhase: "active" | "idle" | "settled",
  ): "active" | "idle" | "settled" {
    const initialSnapshot = this.layoutStore.getSnapshot();
    const focusViewport = this.focusVisibilityViewport(initialSnapshot, viewport);
    this.layoutStore.ensureFocusedPaneVisible(focusViewport);
    const frameState = this.renderFrameState(deltaMs, viewport, resizePhase);
    this.lastFrameNeedsContinuation = frameState.moving || resizePhase === "active";
    this.items.length = 0;
    this.metrics.beginFrame({ moving: frameState.moving, resizePhase });
    this.renderPaneItems({
      frameInput: frameState.frameInput,
      resizePhase,
      snapshot: frameState.snapshot,
      viewport,
      zooming: frameState.zooming,
    });
    for (const item of this.items) {
      item.resizing = resizePhase === "active";
    }
    this.runtimePolicy.apply(
      this.items,
      resizePhase === "active" ? "moving" : frameState.renderMovementPhase,
    );
    if (resizePhase === "settled") {
      this.metrics.recordResizeFinalViewport(viewport);
    }
    return resizePhase;
  }

  private renderFrameState(
    deltaMs: number,
    viewport: Rect,
    resizePhase: "active" | "idle" | "settled",
  ): RenderFrameState {
    const movementPhase = this.sampleMovementPhase(deltaMs, resizePhase);
    const snapshot = this.layoutStore.getSnapshot();
    this.syncOverviewViewport(snapshot, viewport);
    const zooming = this.snapshotIsZooming(snapshot);
    const renderMovementPhase = this.renderMovementPhase(movementPhase, zooming);
    return {
      frameInput: {
        focusedPaneId: snapshot.focusedPaneId,
        maximizedPaneId: snapshot.maximizedPaneId,
        movementPhase: renderMovementPhase,
        scrollColumn: snapshot.scrollColumn,
        scrollRow: snapshot.scrollRow,
        viewport,
      },
      moving: renderMovementPhase === "moving",
      renderMovementPhase,
      snapshot,
      zooming,
    };
  }

  private renderMovementPhase(
    movementPhase: "idle" | "moving",
    zooming: boolean,
  ): "idle" | "moving" {
    return zooming || this.layoutStore.hasPaneDropPreview() || this.movementOverride()
      ? "moving"
      : movementPhase;
  }

  private sampleMovementPhase(
    deltaMs: number,
    resizePhase: "active" | "idle" | "settled",
  ): "idle" | "moving" {
    if (resizePhase !== "active") {
      return this.layoutStore.advanceFrame(deltaMs);
    }
    this.layoutStore.snapScrollToTarget();
    return "moving";
  }

  private snapshotIsZooming(snapshot: WorkspaceLayoutSnapshot): boolean {
    const targetOverviewProgress = snapshot.presentationMode === "overview" ? 1 : 0;
    return Math.abs(snapshot.overviewProgress - targetOverviewProgress) > 0.001;
  }

  private renderPaneItems({
    frameInput,
    resizePhase,
    snapshot,
    viewport,
    zooming,
  }: {
    frameInput: Omit<LayoutFrameInput, "presentationMode">;
    resizePhase: "active" | "idle" | "settled";
    snapshot: WorkspaceLayoutSnapshot;
    viewport: Rect;
    zooming: boolean;
  }): void {
    if (zooming) {
      this.renderZoomingPaneItems({ frameInput, resizePhase, snapshot, viewport });
      return;
    }
    this.engine.renderFrame(
      {
        ...frameInput,
        presentationMode: snapshot.presentationMode,
        ...(snapshot.presentationMode === "overview"
          ? {
              overviewPanX: snapshot.overviewPanX,
              overviewPanY: snapshot.overviewPanY,
              overviewZoom: snapshot.overviewZoom,
              scrollColumn: 0,
              scrollRow: 0,
              viewport: this.overviewEndpointViewport(viewport),
            }
          : { viewport }),
      },
      (item) => this.items.push(item),
    );
    this.zoomEndpointFrames = null;
  }

  private renderZoomingPaneItems({
    frameInput,
    resizePhase,
    snapshot,
    viewport,
  }: {
    frameInput: Omit<LayoutFrameInput, "presentationMode">;
    resizePhase: "active" | "idle" | "settled";
    snapshot: WorkspaceLayoutSnapshot;
    viewport: Rect;
  }): void {
    const { normalItems, overviewItems } = this.zoomEndpointFrameItems({
      normalFrameInput: frameInput,
      overviewFrameInput: {
        ...frameInput,
        overviewPanX: snapshot.overviewPanX,
        overviewPanY: snapshot.overviewPanY,
        overviewZoom: snapshot.overviewZoom,
        scrollColumn: 0,
        scrollRow: 0,
        viewport: this.overviewEndpointViewport(viewport),
      },
      resizePhase,
      snapshot,
    });
    this.items.push(
      ...interpolatePaneRenderItems({
        normalItems,
        overviewItems,
        overviewProgress: snapshot.overviewProgress,
        presentationMode: snapshot.presentationMode,
      }),
    );
  }

  private tick = (timestamp: number, deltaMs: number): void => {
    const requestSequenceAtFrameStart = this.frameRequestSequence;
    const frameStart = performance.now();
    const viewport = this.viewportProvider();
    const resizePhase = this.resizePhaseTracker.sample(viewport, timestamp);
    if (resizePhase === "idle") {
      this.advanceBenchmarkFocus(timestamp);
    }
    const resizePhaseAfterRender = this.renderFrame(deltaMs, viewport, resizePhase);
    const writeCounts = this.presentation.apply(this.items, { resizePhase });
    const frameTime = performance.now() - frameStart;
    this.metrics.recordFrame({
      boxWrites: writeCounts.boxWrites,
      browserViewportWrites: writeCounts.browserViewportWrites,
      canvasViewportWrites: writeCounts.canvasViewportWrites,
      deferredHeavyViewportWrites: writeCounts.deferredHeavyViewportWrites,
      frameTime,
      gitGraphViewportWrites: writeCounts.gitGraphViewportWrites,
      heavyViewportWrites: writeCounts.heavyViewportWrites,
      nativeBoundsUpdates: writeCounts.nativeBoundsUpdates,
      resizePhase: resizePhaseAfterRender,
      surfaceViewportWrites: writeCounts.surfaceViewportWrites,
      terminalViewportWrites: writeCounts.terminalViewportWrites,
      transformWrites: writeCounts.transformWrites,
      visiblePaneCount: this.items.length,
    });
    this.presentation.updateDebugOverlay(this.runtimePolicy.getSummary());
    this.startMeasurementAfterWarmup(frameStart);
    this.writeReportWhenReady(frameStart);
    this.renderedFrameRequestSequence = Math.max(
      this.renderedFrameRequestSequence,
      requestSequenceAtFrameStart,
    );
    const requestPending = this.renderedFrameRequestSequence < this.frameRequestSequence;
    if (!this.continuous && !this.lastFrameNeedsContinuation && !requestPending) {
      this.clock.stop();
    }
  };

  private zoomEndpointFrameItems({
    normalFrameInput,
    overviewFrameInput,
    resizePhase,
    snapshot,
  }: {
    normalFrameInput: {
      focusedPaneId: string;
      maximizedPaneId: string | null;
      movementPhase: "idle" | "moving";
      scrollColumn: number;
      scrollRow: number;
      viewport: Rect;
    };
    overviewFrameInput: {
      focusedPaneId: string;
      maximizedPaneId: string | null;
      movementPhase: "idle" | "moving";
      overviewPanX?: number;
      overviewPanY?: number;
      overviewZoom?: number;
      scrollColumn: number;
      scrollRow: number;
      viewport: Rect;
    };
    resizePhase: "active" | "idle" | "settled";
    snapshot: WorkspaceLayoutSnapshot;
  }): ZoomEndpointFrames {
    const key = this.zoomEndpointFrameKey({
      normalFrameInput,
      overviewFrameInput,
      resizePhase,
      snapshot,
    });
    if (this.zoomEndpointFrames?.key === key) {
      return this.zoomEndpointFrames;
    }
    const normalItems: PaneRenderItem[] = [];
    this.engine.renderFrame(
      { ...normalFrameInput, presentationMode: "normal", renderAllColumns: true },
      (item) => normalItems.push(item),
    );
    const overviewItems: PaneRenderItem[] = [];
    this.engine.renderFrame({ ...overviewFrameInput, presentationMode: "overview" }, (item) =>
      overviewItems.push(item),
    );
    this.zoomEndpointFrames = {
      key,
      normalItems,
      overviewItems,
    };
    return this.zoomEndpointFrames;
  }

  private zoomEndpointFrameKey({
    normalFrameInput,
    overviewFrameInput,
    resizePhase,
    snapshot,
  }: {
    normalFrameInput: {
      focusedPaneId: string;
      maximizedPaneId: string | null;
      movementPhase: "idle" | "moving";
      scrollColumn: number;
      scrollRow: number;
      viewport: Rect;
    };
    overviewFrameInput: {
      focusedPaneId: string;
      maximizedPaneId: string | null;
      movementPhase: "idle" | "moving";
      overviewPanX?: number;
      overviewPanY?: number;
      overviewZoom?: number;
      scrollColumn: number;
      scrollRow: number;
      viewport: Rect;
    };
    resizePhase: "active" | "idle" | "settled";
    snapshot: WorkspaceLayoutSnapshot;
  }): string {
    return [
      snapshot.revision,
      normalFrameInput.focusedPaneId,
      normalFrameInput.maximizedPaneId ?? "",
      normalFrameInput.movementPhase,
      resizePhase,
      (overviewFrameInput.overviewZoom ?? 1).toFixed(3),
      normalFrameInput.scrollColumn.toFixed(3),
      normalFrameInput.scrollRow.toFixed(3),
      normalFrameInput.viewport.x.toFixed(1),
      normalFrameInput.viewport.y.toFixed(1),
      normalFrameInput.viewport.width.toFixed(1),
      normalFrameInput.viewport.height.toFixed(1),
      overviewFrameInput.viewport.x.toFixed(1),
      overviewFrameInput.viewport.y.toFixed(1),
      overviewFrameInput.viewport.width.toFixed(1),
      overviewFrameInput.viewport.height.toFixed(1),
    ].join("|");
  }

  private focusVisibilityViewport(snapshot: WorkspaceLayoutSnapshot, viewport: Rect): Rect {
    if (snapshot.presentationMode !== "overview") {
      return viewport;
    }
    return this.overviewEndpointViewport(viewport);
  }

  private overviewEndpointViewport(viewport: Rect): Rect {
    if (!this.overviewViewport) {
      this.overviewViewport = { ...viewport };
    }
    return this.overviewViewport;
  }

  private syncOverviewViewport(snapshot: WorkspaceLayoutSnapshot, viewport: Rect): void {
    if (snapshot.presentationMode === "overview") {
      this.overviewEndpointViewport(viewport);
      return;
    }
    if (snapshot.overviewProgress <= 0.001) {
      this.overviewViewport = null;
    }
  }

  private startMeasurementAfterWarmup(timestamp: number): void {
    if (this.measurementStartedAt > 0 || timestamp - this.startedAt < benchmarkWarmupMs) {
      return;
    }
    this.metrics.reset();
    this.measurementStartedAt = timestamp;
  }

  private writeReportWhenReady(timestamp: number): void {
    if (
      !this.reportWriter ||
      this.reportWritten ||
      this.measurementStartedAt === 0 ||
      timestamp - this.measurementStartedAt < 5000
    ) {
      return;
    }
    this.reportWritten = true;
    this.reportWriter.write(this.metrics, this.viewportProvider());
  }
}
