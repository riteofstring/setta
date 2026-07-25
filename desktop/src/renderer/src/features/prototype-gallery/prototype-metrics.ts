import type { PrototypeMetricsSnapshot, PrototypeRenderer } from "./prototype-types";

const sampleCapacity = 240;

export class PrototypeMetricsCollector {
  private active: boolean;
  private backingHeight = 0;
  private backingWidth = 0;
  private contextLosses = 0;
  private drawCalls = 0;
  private readonly drawSubmissionDurations = new Float32Array(sampleCapacity);
  private drawSubmissionCount = 0;
  private drawSubmissionCursor = 0;
  private effectiveDpr = 1;
  private frameRequests = 0;
  private readonly intervals = new Float32Array(sampleCapacity);
  private intervalCount = 0;
  private intervalCursor = 0;
  private lastFrameTime = 0;
  private longTasks = 0;
  private readonly prototypeId: string;
  private resizeCount = 0;
  private readonly runtime: PrototypeRenderer["kind"];
  private shaderCompiles = 0;
  private skippedFrames = 0;

  constructor(
    prototypeId: string,
    runtime: PrototypeRenderer["kind"],
    active: boolean,
  ) {
    this.prototypeId = prototypeId;
    this.runtime = runtime;
    this.active = active;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.resetRenderedFrameIntervalBaseline();
    }
  }

  resetRenderedFrameIntervalBaseline(): void {
    this.lastFrameTime = 0;
  }

  recordFrameRequest(): void {
    this.frameRequests += 1;
  }

  recordRenderedFrame(timeMs: number): void {
    if (this.lastFrameTime > 0) {
      this.intervals[this.intervalCursor] = timeMs - this.lastFrameTime;
      this.intervalCursor = (this.intervalCursor + 1) % sampleCapacity;
      this.intervalCount = Math.min(this.intervalCount + 1, sampleCapacity);
    }
    this.lastFrameTime = timeMs;
  }

  recordDraw(submissionDurationMs?: number): void {
    this.drawCalls += 1;
    if (submissionDurationMs === undefined) {
      return;
    }
    this.drawSubmissionDurations[this.drawSubmissionCursor] = submissionDurationMs;
    this.drawSubmissionCursor = (this.drawSubmissionCursor + 1) % sampleCapacity;
    this.drawSubmissionCount = Math.min(this.drawSubmissionCount + 1, sampleCapacity);
  }

  recordLongTask(): void {
    if (this.active) {
      this.longTasks += 1;
    }
  }

  recordSkippedFrame(): void {
    this.skippedFrames += 1;
  }

  recordResize(width: number, height: number, dpr: number): void {
    this.backingWidth = width;
    this.backingHeight = height;
    this.effectiveDpr = dpr;
    this.resizeCount += 1;
  }

  recordShaderCompile(): void {
    this.shaderCompiles += 1;
  }

  recordContextLoss(): void {
    this.contextLosses += 1;
  }

  snapshot(): PrototypeMetricsSnapshot {
    const sortedIntervals = Array.from(this.intervals.slice(0, this.intervalCount)).sort(
      (a, b) => a - b,
    );
    const sortedDrawDurations = Array.from(
      this.drawSubmissionDurations.slice(0, this.drawSubmissionCount),
    ).sort((a, b) => a - b);
    return {
      active: this.active,
      backingHeight: this.backingHeight,
      backingWidth: this.backingWidth,
      contextLosses: this.contextLosses,
      drawCalls: this.drawCalls,
      effectiveDpr: this.effectiveDpr,
      frameRequests: this.frameRequests,
      longTasks: this.longTasks,
      maxDrawSubmissionMs: sortedDrawDurations.at(-1) ?? 0,
      maxFrameIntervalMs: sortedIntervals.at(-1) ?? 0,
      p50FrameIntervalMs: percentile(sortedIntervals, 0.5),
      p95DrawSubmissionMs: percentile(sortedDrawDurations, 0.95),
      p95FrameIntervalMs: percentile(sortedIntervals, 0.95),
      p99FrameIntervalMs: percentile(sortedIntervals, 0.99),
      prototypeId: this.prototypeId,
      resizeCount: this.resizeCount,
      runtime: this.runtime,
      shaderCompiles: this.shaderCompiles,
      skippedFrames: this.skippedFrames,
    };
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.min(values.length - 1, Math.ceil(ratio * values.length) - 1)] ?? 0;
}
