import { AnimationClock } from "./animation-clock";
import type { NiriLikeLayoutEngine } from "./layout-engine";
import type { NiriLayoutStore } from "./layout-store";
import type { NiriMetricsCollector } from "./metrics";
import type { PerformanceReportWriter } from "./performance-report";
import type { PaneRenderItem, Rect } from "./types";
import type { PresentationEngine } from "./presentation-engine";

const focusStepIntervalMs = 120;

interface FrameSchedulerDependencies {
  engine: NiriLikeLayoutEngine;
  layoutStore: NiriLayoutStore;
  metrics: NiriMetricsCollector;
  presentation: PresentationEngine;
  reportWriter: PerformanceReportWriter;
  viewportProvider: () => Rect;
}

export class FrameScheduler {
  private benchmarkDirection: "left" | "right" = "right";
  private clock: AnimationClock;
  private items: PaneRenderItem[] = [];
  private lastFocusStepTimestamp = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private reportWritten = false;
  private startedAt = 0;

  private readonly engine: NiriLikeLayoutEngine;
  private readonly layoutStore: NiriLayoutStore;
  private readonly metrics: NiriMetricsCollector;
  private readonly presentation: PresentationEngine;
  private readonly reportWriter: PerformanceReportWriter;
  private readonly viewportProvider: () => Rect;

  constructor(dependencies: FrameSchedulerDependencies) {
    this.engine = dependencies.engine;
    this.layoutStore = dependencies.layoutStore;
    this.metrics = dependencies.metrics;
    this.presentation = dependencies.presentation;
    this.reportWriter = dependencies.reportWriter;
    this.viewportProvider = dependencies.viewportProvider;
    this.clock = new AnimationClock(this.tick);
  }

  start(): void {
    this.startedAt = performance.now();
    this.observeLongTasks();
    this.clock.start();
  }

  teardown(): void {
    this.clock.stop();
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.presentation.teardown();
  }

  private advanceBenchmarkFocus(timestamp: number): void {
    if (timestamp - this.lastFocusStepTimestamp < focusStepIntervalMs) {
      return;
    }
    this.lastFocusStepTimestamp = timestamp;
    const snapshot = this.layoutStore.getSnapshot();
    const lastColumn = Math.max(0, this.engine.columnCount() - 1);
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

  private renderFrame(deltaMs: number): void {
    const viewport = this.viewportProvider();
    const movementPhase = this.layoutStore.advanceFrame(deltaMs);
    const snapshot = this.layoutStore.getSnapshot();
    this.items.length = 0;
    this.metrics.beginFrame(movementPhase === "moving");
    this.engine.renderFrame(
      {
        focusedPaneId: snapshot.focusedPaneId,
        movementPhase,
        scrollColumn: snapshot.scrollColumn,
        viewport,
      },
      (item) => this.items.push(item),
    );
  }

  private tick = (timestamp: number, deltaMs: number): void => {
    const frameStart = performance.now();
    this.advanceBenchmarkFocus(timestamp);
    this.renderFrame(deltaMs);
    const writeCounts = this.presentation.apply(this.items);
    const frameTime = performance.now() - frameStart;
    this.metrics.recordFrame({
      frameTime,
      nativeBoundsUpdates: writeCounts.nativeBoundsUpdates,
      transformWrites: writeCounts.transformWrites,
      visiblePaneCount: this.items.length,
    });
    this.presentation.updateDebugOverlay();
    this.writeReportWhenReady(frameStart);
  };

  private writeReportWhenReady(timestamp: number): void {
    if (this.reportWritten || timestamp - this.startedAt < 5000) {
      return;
    }
    this.reportWritten = true;
    this.reportWriter.write(this.metrics, this.viewportProvider());
  }
}
