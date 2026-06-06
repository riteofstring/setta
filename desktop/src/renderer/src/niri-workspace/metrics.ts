import type {
  CanvasSurfaceStats,
  GitGraphSurfaceStats,
  NiriFrameMetrics,
  TerminalSurfaceStats,
} from "./types";

const maxRecordedFrames = 720;
const targetFrameMs = 8.33;

export class NiriMetricsCollector {
  private currentFrameMoving = false;
  private droppedFrames = 0;
  private frameTimes: number[] = [];
  private latestFrameTime = 0;
  private latestCanvasStats: CanvasSurfaceStats = emptyCanvasStats();
  private latestGitGraphStats: GitGraphSurfaceStats = emptyGitGraphStats();
  private latestNativeBoundsUpdates = 0;
  private latestTerminalStats: TerminalSurfaceStats = emptyTerminalStats();
  private latestTransformWrites = 0;
  private latestVisiblePaneCount = 0;
  private longTasks = 0;
  private reactCommitsDuringMovement = 0;

  beginFrame(moving: boolean): void {
    this.currentFrameMoving = moving;
  }

  recordFrame({
    frameTime,
    nativeBoundsUpdates,
    transformWrites,
    visiblePaneCount,
  }: {
    frameTime: number;
    nativeBoundsUpdates: number;
    transformWrites: number;
    visiblePaneCount: number;
  }): void {
    this.latestFrameTime = frameTime;
    this.latestNativeBoundsUpdates = nativeBoundsUpdates;
    this.latestTransformWrites = transformWrites;
    this.latestVisiblePaneCount = visiblePaneCount;
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > maxRecordedFrames) {
      this.frameTimes.shift();
    }
    if (frameTime > targetFrameMs) {
      this.droppedFrames += 1;
    }
  }

  recordLongTask(): void {
    this.longTasks += 1;
  }

  recordCanvasStats(stats: CanvasSurfaceStats): void {
    this.latestCanvasStats = stats;
  }

  recordGitGraphStats(stats: GitGraphSurfaceStats): void {
    this.latestGitGraphStats = stats;
  }

  recordTerminalStats(stats: TerminalSurfaceStats): void {
    this.latestTerminalStats = stats;
  }

  recordReactCommit(): void {
    if (this.currentFrameMoving) {
      this.reactCommitsDuringMovement += 1;
    }
  }

  reset(): void {
    this.currentFrameMoving = false;
    this.droppedFrames = 0;
    this.frameTimes = [];
    this.latestFrameTime = 0;
    this.latestCanvasStats = emptyCanvasStats();
    this.latestGitGraphStats = emptyGitGraphStats();
    this.latestNativeBoundsUpdates = 0;
    this.latestTerminalStats = emptyTerminalStats();
    this.latestTransformWrites = 0;
    this.latestVisiblePaneCount = 0;
    this.longTasks = 0;
    this.reactCommitsDuringMovement = 0;
  }

  snapshot(): NiriFrameMetrics {
    return {
      droppedFrames: this.droppedFrames,
      frameCount: this.frameTimes.length,
      frameTime: this.latestFrameTime,
      longTasks: this.longTasks,
      nativeBoundsUpdates: this.latestNativeBoundsUpdates,
      p50FrameTime: percentile(this.frameTimes, 0.5),
      p95FrameTime: percentile(this.frameTimes, 0.95),
      p99FrameTime: percentile(this.frameTimes, 0.99),
      reactCommitsDuringMovement: this.reactCommitsDuringMovement,
      canvasDrawCalls: this.latestCanvasStats.drawCalls,
      canvasGpuMemoryEstimateBytes: this.latestCanvasStats.gpuMemoryEstimateBytes,
      gitGraphProgress: this.latestGitGraphStats.progress,
      gitGraphRenderedNodes: this.latestGitGraphStats.renderedNodes,
      gitGraphRenderer: this.latestGitGraphStats.renderer,
      gitGraphWorkerBatches: this.latestGitGraphStats.workerBatches,
      gitGraphWorkerPending: this.latestGitGraphStats.workerPending,
      liveCanvasPaneCount: this.latestCanvasStats.liveCanvasPaneCount,
      liveGitGraphPaneCount: this.latestGitGraphStats.liveGraphPaneCount,
      liveTerminalRendererCount: this.latestTerminalStats.liveTerminalRendererCount,
      terminalDirtyRows: this.latestTerminalStats.dirtyRows,
      terminalDroppedOutputChunks: this.latestTerminalStats.droppedOutputChunks,
      terminalPendingOutputChunks: this.latestTerminalStats.pendingOutputChunks,
      transformWrites: this.latestTransformWrites,
      visiblePaneCount: this.latestVisiblePaneCount,
    };
  }
}

function emptyCanvasStats(): CanvasSurfaceStats {
  return {
    drawCalls: 0,
    farZoomSimplified: false,
    gpuMemoryEstimateBytes: null,
    liveCanvasPaneCount: 0,
    renderedFrames: 0,
  };
}

function emptyGitGraphStats(): GitGraphSurfaceStats {
  return {
    completed: false,
    liveGraphPaneCount: 0,
    progress: 0,
    renderedEdges: 0,
    renderedNodes: 0,
    renderer: null,
    workerBatches: 0,
    workerPending: false,
  };
}

function emptyTerminalStats(): TerminalSurfaceStats {
  return {
    dirtyRows: 0,
    droppedOutputChunks: 0,
    liveTerminalRendererCount: 0,
    pendingOutputChunks: 0,
    renderedRows: 0,
    scrollbackRows: 0,
  };
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile));
  return sorted[index] ?? 0;
}
