import type {
  CanvasSurfaceStats,
  GitGraphSurfaceStats,
  WorkspaceFrameMetrics,
  Rect,
  ResizePhase,
  SurfaceSnapshotFreshness,
  WorkspaceResizeMetrics,
  TerminalSurfaceStats,
} from "./types";

const maxRecordedFrames = 720;
const targetFrameMs = 8.33;

export class WorkspaceMetricsCollector {
  private currentFrameMoving = false;
  private currentFrameResizeActive = false;
  private droppedFrames = 0;
  private frameTimes: number[] = [];
  private latestFrameTime = 0;
  private latestCanvasStats: CanvasSurfaceStats = emptyCanvasStats();
  private latestGitGraphStats: GitGraphSurfaceStats = emptyGitGraphStats();
  private latestNativeBoundsUpdates = 0;
  private latestBoxWrites = 0;
  private latestTerminalStats: TerminalSurfaceStats = emptyTerminalStats();
  private latestTransformWrites = 0;
  private latestVisiblePaneCount = 0;
  private longTasks = 0;
  private paneDragPreviewClears = 0;
  private paneDragPreviewUpdates = 0;
  private reactCommitsDuringMovement = 0;
  private reactCommitsDuringResize = 0;
  private resizeMetrics = emptyResizeMetrics();
  private activeResizeFrameTimes: number[] = [];
  private snapshotBitmapCaptureRequests = 0;
  private snapshotCapturePromisesAwaitedByTransition = 0;
  private snapshotCaptureRequests = 0;
  private snapshotCaptureRequestsDuringTransition = 0;
  private snapshotFreshTextureUses = 0;
  private snapshotMissingTextureUses = 0;
  private snapshotStaleTextureUses = 0;
  private snapshotTextureCaptureRequests = 0;

  beginFrame({ moving, resizePhase }: { moving: boolean; resizePhase: ResizePhase }): void {
    this.currentFrameMoving = moving;
    this.currentFrameResizeActive = resizePhase === "active";
  }

  recordFrame({
    boxWrites,
    browserViewportWrites,
    canvasViewportWrites,
    deferredHeavyViewportWrites,
    frameTime,
    gitGraphViewportWrites,
    heavyViewportWrites,
    nativeBoundsUpdates,
    resizePhase,
    surfaceViewportWrites,
    terminalViewportWrites,
    transformWrites,
    visiblePaneCount,
  }: {
    boxWrites: number;
    browserViewportWrites: number;
    canvasViewportWrites: number;
    deferredHeavyViewportWrites: number;
    frameTime: number;
    gitGraphViewportWrites: number;
    heavyViewportWrites: number;
    nativeBoundsUpdates: number;
    resizePhase: ResizePhase;
    surfaceViewportWrites: number;
    terminalViewportWrites: number;
    transformWrites: number;
    visiblePaneCount: number;
  }): void {
    this.latestFrameTime = frameTime;
    this.latestBoxWrites = boxWrites;
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
    this.recordResizeFrame({
      boxWrites,
      browserViewportWrites,
      canvasViewportWrites,
      deferredHeavyViewportWrites,
      frameTime,
      gitGraphViewportWrites,
      heavyViewportWrites,
      nativeBoundsUpdates,
      resizePhase,
      surfaceViewportWrites,
      terminalViewportWrites,
      transformWrites,
    });
  }

  recordLongTask(): void {
    this.longTasks += 1;
    if (this.currentFrameResizeActive) {
      this.resizeMetrics.longTasks += 1;
    }
  }

  recordResizeFinalViewport(viewport: Rect): void {
    this.resizeMetrics.finalViewport = { ...viewport };
    this.resizeMetrics.finalViewportCommits += 1;
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

  recordSnapshotCaptureRequest({
    duringTransition,
    kind,
  }: {
    duringTransition: boolean;
    kind: "bitmap" | "texture";
  }): void {
    this.snapshotCaptureRequests += 1;
    switch (kind) {
      case "bitmap":
        this.snapshotBitmapCaptureRequests += 1;
        break;
      case "texture":
        this.snapshotTextureCaptureRequests += 1;
        break;
      default:
        assertNever(kind);
    }
    if (duringTransition) {
      this.snapshotCaptureRequestsDuringTransition += 1;
    }
  }

  recordSnapshotCapturePromiseAwaitedByTransition(): void {
    this.snapshotCapturePromisesAwaitedByTransition += 1;
  }

  recordSnapshotTextureUse(freshness: SurfaceSnapshotFreshness): void {
    switch (freshness) {
      case "fresh":
        this.snapshotFreshTextureUses += 1;
        break;
      case "stale":
        this.snapshotStaleTextureUses += 1;
        break;
      case "missing":
        this.snapshotMissingTextureUses += 1;
        break;
      default:
        assertNever(freshness);
    }
  }

  recordReactCommit(): void {
    if (this.currentFrameMoving) {
      this.reactCommitsDuringMovement += 1;
    }
    if (this.currentFrameResizeActive) {
      this.reactCommitsDuringResize += 1;
    }
  }

  recordPaneDragPreviewUpdate(): void {
    this.paneDragPreviewUpdates += 1;
  }

  recordPaneDragPreviewClear(): void {
    this.paneDragPreviewClears += 1;
  }

  reset(): void {
    this.currentFrameMoving = false;
    this.currentFrameResizeActive = false;
    this.droppedFrames = 0;
    this.frameTimes = [];
    this.latestFrameTime = 0;
    this.latestCanvasStats = emptyCanvasStats();
    this.latestGitGraphStats = emptyGitGraphStats();
    this.latestBoxWrites = 0;
    this.latestNativeBoundsUpdates = 0;
    this.latestTerminalStats = emptyTerminalStats();
    this.latestTransformWrites = 0;
    this.latestVisiblePaneCount = 0;
    this.longTasks = 0;
    this.paneDragPreviewClears = 0;
    this.paneDragPreviewUpdates = 0;
    this.reactCommitsDuringMovement = 0;
    this.reactCommitsDuringResize = 0;
    this.snapshotBitmapCaptureRequests = 0;
    this.snapshotCapturePromisesAwaitedByTransition = 0;
    this.snapshotCaptureRequests = 0;
    this.snapshotCaptureRequestsDuringTransition = 0;
    this.snapshotFreshTextureUses = 0;
    this.snapshotMissingTextureUses = 0;
    this.snapshotStaleTextureUses = 0;
    this.snapshotTextureCaptureRequests = 0;
    this.resetResizeMetrics();
  }

  resetResizeMetrics(): void {
    this.activeResizeFrameTimes = [];
    this.resizeMetrics = emptyResizeMetrics();
    this.reactCommitsDuringResize = 0;
  }

  snapshot(): WorkspaceFrameMetrics {
    return {
      droppedFrames: this.droppedFrames,
      frameCount: this.frameTimes.length,
      frameTime: this.latestFrameTime,
      longTasks: this.longTasks,
      nativeBoundsUpdates: this.latestNativeBoundsUpdates,
      p50FrameTime: percentile(this.frameTimes, 0.5),
      p95FrameTime: percentile(this.frameTimes, 0.95),
      p99FrameTime: percentile(this.frameTimes, 0.99),
      paneDragPreviewClears: this.paneDragPreviewClears,
      paneDragPreviewUpdates: this.paneDragPreviewUpdates,
      reactCommitsDuringMovement: this.reactCommitsDuringMovement,
      reactCommitsDuringResize: this.reactCommitsDuringResize,
      resize: this.resizeSnapshot(),
      canvasDrawCalls: this.latestCanvasStats.drawCalls,
      canvasBackingStorePixels: this.latestCanvasStats.backingStorePixels,
      canvasGpuMemoryEstimateBytes: this.latestCanvasStats.gpuMemoryEstimateBytes,
      canvasRendererResizeCount: this.latestCanvasStats.rendererResizeCount,
      canvasTickerFramesWhileFrozen: this.latestCanvasStats.tickerFramesWhileFrozen,
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
      snapshotBitmapCaptureRequests: this.snapshotBitmapCaptureRequests,
      snapshotCapturePromisesAwaitedByTransition: this.snapshotCapturePromisesAwaitedByTransition,
      snapshotCaptureRequests: this.snapshotCaptureRequests,
      snapshotCaptureRequestsDuringTransition: this.snapshotCaptureRequestsDuringTransition,
      snapshotFreshTextureUses: this.snapshotFreshTextureUses,
      snapshotMissingTextureUses: this.snapshotMissingTextureUses,
      snapshotStaleTextureUses: this.snapshotStaleTextureUses,
      snapshotTextureCaptureRequests: this.snapshotTextureCaptureRequests,
      boxWrites: this.latestBoxWrites,
      transformWrites: this.latestTransformWrites,
      visiblePaneCount: this.latestVisiblePaneCount,
    };
  }

  private recordResizeFrame({
    boxWrites,
    browserViewportWrites,
    canvasViewportWrites,
    deferredHeavyViewportWrites,
    frameTime,
    gitGraphViewportWrites,
    heavyViewportWrites,
    nativeBoundsUpdates,
    resizePhase,
    surfaceViewportWrites,
    terminalViewportWrites,
    transformWrites,
  }: {
    boxWrites: number;
    browserViewportWrites: number;
    canvasViewportWrites: number;
    deferredHeavyViewportWrites: number;
    frameTime: number;
    gitGraphViewportWrites: number;
    heavyViewportWrites: number;
    nativeBoundsUpdates: number;
    resizePhase: ResizePhase;
    surfaceViewportWrites: number;
    terminalViewportWrites: number;
    transformWrites: number;
  }): void {
    if (resizePhase === "idle") {
      this.resizeMetrics.active = false;
      return;
    }

    this.resizeMetrics.active = resizePhase === "active";
    this.resizeMetrics.boxWrites += boxWrites;
    this.resizeMetrics.browserViewportWrites += browserViewportWrites;
    this.resizeMetrics.canvasViewportWrites += canvasViewportWrites;
    this.resizeMetrics.deferredHeavyViewportWrites += deferredHeavyViewportWrites;
    this.resizeMetrics.frameCount += 1;
    this.resizeMetrics.frameTime = frameTime;
    this.resizeMetrics.gitGraphViewportWrites += gitGraphViewportWrites;
    this.resizeMetrics.heavyViewportWrites += heavyViewportWrites;
    this.resizeMetrics.nativeBoundsUpdates += nativeBoundsUpdates;
    this.resizeMetrics.surfaceViewportWrites += surfaceViewportWrites;
    this.resizeMetrics.terminalViewportWrites += terminalViewportWrites;
    this.resizeMetrics.transformWrites += transformWrites;
    if (resizePhase === "settled") {
      this.resizeMetrics.settledFrameCount += 1;
    }

    if (resizePhase === "active") {
      this.activeResizeFrameTimes.push(frameTime);
      if (this.activeResizeFrameTimes.length > maxRecordedFrames) {
        this.activeResizeFrameTimes.shift();
      }
    }
  }

  private resizeSnapshot(): WorkspaceResizeMetrics {
    return {
      ...this.resizeMetrics,
      p50FrameTime: percentile(this.activeResizeFrameTimes, 0.5),
      p95FrameTime: percentile(this.activeResizeFrameTimes, 0.95),
      p99FrameTime: percentile(this.activeResizeFrameTimes, 0.99),
    };
  }
}

function emptyCanvasStats(): CanvasSurfaceStats {
  return {
    backingStorePixels: null,
    drawCalls: 0,
    farZoomSimplified: false,
    gpuMemoryEstimateBytes: null,
    liveCanvasPaneCount: 0,
    rendererResizeCount: 0,
    renderedFrames: 0,
    tickerFramesWhileFrozen: 0,
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

function emptyResizeMetrics(): WorkspaceResizeMetrics {
  return {
    active: false,
    boxWrites: 0,
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    finalViewport: null,
    finalViewportCommits: 0,
    frameCount: 0,
    frameTime: 0,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    longTasks: 0,
    nativeBoundsUpdates: 0,
    p50FrameTime: 0,
    p95FrameTime: 0,
    p99FrameTime: 0,
    settledFrameCount: 0,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
    transformWrites: 0,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace metrics value: ${String(value)}`);
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile));
  return sorted[index] ?? 0;
}
