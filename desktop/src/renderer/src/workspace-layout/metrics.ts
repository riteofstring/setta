import type {
  WorkspaceFrameMetrics,
  Rect,
  ResizePhase,
  SurfaceSnapshotFreshness,
  WorkspaceResizeMetrics,
} from "./types";

const maxRecordedFrames = 720;
const targetFrameMs = 8.33;

export class WorkspaceMetricsCollector {
  private currentFrameMoving = false;
  private currentFrameResizeActive = false;
  private droppedFrames = 0;
  private frameTimes: number[] = [];
  private latestFrameTime = 0;
  private latestNativeBoundsUpdates = 0;
  private latestBoxWrites = 0;
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
    deferredHeavyViewportWrites,
    frameTime,
    heavyViewportWrites,
    nativeBoundsUpdates,
    resizePhase,
    surfaceViewportWrites,
    transformWrites,
    visiblePaneCount,
  }: {
    boxWrites: number;
    browserViewportWrites: number;
    deferredHeavyViewportWrites: number;
    frameTime: number;
    heavyViewportWrites: number;
    nativeBoundsUpdates: number;
    resizePhase: ResizePhase;
    surfaceViewportWrites: number;
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
      deferredHeavyViewportWrites,
      frameTime,
      heavyViewportWrites,
      nativeBoundsUpdates,
      resizePhase,
      surfaceViewportWrites,
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
    this.latestBoxWrites = 0;
    this.latestNativeBoundsUpdates = 0;
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
    deferredHeavyViewportWrites,
    frameTime,
    heavyViewportWrites,
    nativeBoundsUpdates,
    resizePhase,
    surfaceViewportWrites,
    transformWrites,
  }: {
    boxWrites: number;
    browserViewportWrites: number;
    deferredHeavyViewportWrites: number;
    frameTime: number;
    heavyViewportWrites: number;
    nativeBoundsUpdates: number;
    resizePhase: ResizePhase;
    surfaceViewportWrites: number;
    transformWrites: number;
  }): void {
    if (resizePhase === "idle") {
      this.resizeMetrics.active = false;
      return;
    }

    this.resizeMetrics.active = resizePhase === "active";
    this.resizeMetrics.boxWrites += boxWrites;
    this.resizeMetrics.browserViewportWrites += browserViewportWrites;
    this.resizeMetrics.deferredHeavyViewportWrites += deferredHeavyViewportWrites;
    this.resizeMetrics.frameCount += 1;
    this.resizeMetrics.frameTime = frameTime;
    this.resizeMetrics.heavyViewportWrites += heavyViewportWrites;
    this.resizeMetrics.nativeBoundsUpdates += nativeBoundsUpdates;
    this.resizeMetrics.surfaceViewportWrites += surfaceViewportWrites;
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

function emptyResizeMetrics(): WorkspaceResizeMetrics {
  return {
    active: false,
    boxWrites: 0,
    browserViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    finalViewport: null,
    finalViewportCommits: 0,
    frameCount: 0,
    frameTime: 0,
    heavyViewportWrites: 0,
    longTasks: 0,
    nativeBoundsUpdates: 0,
    p50FrameTime: 0,
    p95FrameTime: 0,
    p99FrameTime: 0,
    settledFrameCount: 0,
    surfaceViewportWrites: 0,
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
