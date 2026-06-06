import { AnimationClock } from "./animation-clock";
import type { NiriLikeLayoutEngine } from "./layout-engine";
import type { NiriLayoutStore } from "./layout-store";
import type { NiriMetricsCollector } from "./metrics";
import { interpolatePaneRenderItems } from "./pane-render-interpolation";
import type { PerformanceReportWriter } from "./performance-report";
import type { PaneRenderItem, Rect } from "./types";
import type { PresentationEngine } from "./presentation-engine";
import type { PaneRuntimePolicy } from "./runtime-policy";
import { ResizePhaseTracker } from "./resize-phase-tracker";

const focusStepIntervalMs = 120;
const benchmarkWarmupMs = 2000;

interface FrameSchedulerDependencies {
  engine: NiriLikeLayoutEngine;
  layoutStore: NiriLayoutStore;
  metrics: NiriMetricsCollector;
  presentation: PresentationEngine;
  reportWriter: PerformanceReportWriter | null;
  runtimePolicy: PaneRuntimePolicy;
  viewportProvider: () => Rect;
}

export class FrameScheduler {
  private benchmarkDirection: "left" | "right" = "right";
  private benchmarkPaused = false;
  private clock: AnimationClock;
  private items: PaneRenderItem[] = [];
  private lastFocusStepTimestamp = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private measurementStartedAt = 0;
  private reportWritten = false;
  private resizePhaseTracker = new ResizePhaseTracker();
  private startedAt = 0;

  private readonly engine: NiriLikeLayoutEngine;
  private readonly layoutStore: NiriLayoutStore;
  private readonly metrics: NiriMetricsCollector;
  private readonly presentation: PresentationEngine;
  private readonly reportWriter: PerformanceReportWriter | null;
  private readonly runtimePolicy: PaneRuntimePolicy;
  private readonly viewportProvider: () => Rect;

  constructor(dependencies: FrameSchedulerDependencies) {
    this.engine = dependencies.engine;
    this.layoutStore = dependencies.layoutStore;
    this.metrics = dependencies.metrics;
    this.presentation = dependencies.presentation;
    this.reportWriter = dependencies.reportWriter;
    this.runtimePolicy = dependencies.runtimePolicy;
    this.viewportProvider = dependencies.viewportProvider;
    this.clock = new AnimationClock(this.tick);
  }

  start(): void {
    this.startedAt = performance.now();
    this.observeLongTasks();
    this.clock.start();
  }

  pauseBenchmark(): void {
    this.benchmarkPaused = true;
  }

  teardown(): void {
    this.clock.stop();
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
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
    this.layoutStore.ensureFocusedPaneVisible(viewport);
    if (resizePhase === "active") {
      this.layoutStore.snapScrollToTarget();
    }
    const movementPhase =
      resizePhase === "active" ? "moving" : this.layoutStore.advanceFrame(deltaMs);
    const snapshot = this.layoutStore.getSnapshot();
    const targetOverviewProgress = snapshot.presentationMode === "overview" ? 1 : 0;
    const zooming = Math.abs(snapshot.overviewProgress - targetOverviewProgress) > 0.001;
    const renderMovementPhase = zooming ? "moving" : movementPhase;
    this.items.length = 0;
    this.metrics.beginFrame({ moving: renderMovementPhase === "moving", resizePhase });
    const frameInput = {
      focusedPaneId: snapshot.focusedPaneId,
      maximizedPaneId: snapshot.maximizedPaneId,
      movementPhase: renderMovementPhase,
      scrollColumn: snapshot.scrollColumn,
      scrollRow: snapshot.scrollRow,
      viewport,
    } as const;
    if (zooming) {
      const normalItems: PaneRenderItem[] = [];
      const overviewItems: PaneRenderItem[] = [];
      this.engine.renderFrame(
        { ...frameInput, presentationMode: "normal", renderAllColumns: true },
        (item) => normalItems.push(item),
      );
      this.engine.renderFrame({ ...frameInput, presentationMode: "overview" }, (item) =>
        overviewItems.push(item),
      );
      this.items.push(
        ...interpolatePaneRenderItems({
          normalItems,
          overviewItems,
          overviewProgress: snapshot.overviewProgress,
          presentationMode: snapshot.presentationMode,
        }),
      );
    } else {
      this.engine.renderFrame(
        { ...frameInput, presentationMode: snapshot.presentationMode },
        (item) => this.items.push(item),
      );
    }
    for (const item of this.items) {
      item.resizing = resizePhase === "active";
    }
    this.runtimePolicy.apply(this.items, resizePhase === "active" ? "moving" : renderMovementPhase);
    if (resizePhase === "settled") {
      this.metrics.recordResizeFinalViewport(viewport);
    }
    return resizePhase;
  }

  private tick = (timestamp: number, deltaMs: number): void => {
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
  };

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
