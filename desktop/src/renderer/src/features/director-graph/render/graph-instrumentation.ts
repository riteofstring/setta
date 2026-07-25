/**
 * Measurement ownership for the graph renderer.
 *
 * The plan names four things the WebGL2 graph needs that the pane-era sampler
 * never had: CPU marks for projection, packing, buffer upload, and draw
 * submission; GPU timer-query sampling; p50/p95/p99 rather than average FPS;
 * and long-task counting that survives the pane shell's deletion.
 *
 * `workspace-layout/metrics.ts` is the pane shell's frame sampler and is inside
 * the Phase 5 deletion scope, so this rehomes the parts the graph needs instead
 * of importing them. The percentile convention is deliberately the same one the
 * committed E2E budget harness already asserts against, so a graph report and a
 * workflow report mean the same thing by p95.
 */

export const graphCpuMarks = ["projection", "packing", "upload", "draw"] as const;
export type GraphCpuMark = (typeof graphCpuMarks)[number];

/** Samples kept for the percentile window; ~10 s at 120 Hz. */
const sampleCapacity = 1200;

/** A frame at or over this is a dropped frame in every report. */
const droppedFrameMs = 50;

export interface GraphFrameSample {
  readonly cpuFrameMs: number;
  readonly gpuFrameMs: number | null;
  readonly frameDeltaMs: number;
  readonly marks: Readonly<Record<GraphCpuMark, number>>;
}

interface GraphPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly maximum: number;
}

export interface GraphPerformanceSummary {
  readonly frames: number;
  readonly cpuFrameMs: GraphPercentiles;
  readonly frameDeltaMs: GraphPercentiles;
  readonly gpuFrameMs: GraphPercentiles | null;
  readonly marks: Readonly<Record<GraphCpuMark, GraphPercentiles>>;
  readonly longTasks: number;
  readonly longTaskTotalMs: number;
  readonly framesOverDroppedThreshold: number;
  readonly slowFrameRatio: number;
  readonly renderScaleMinimum: number;
  readonly renderScaleMaximum: number;
  readonly tierChanges: number;
}

class RingBuffer {
  private readonly values = new Float64Array(sampleCapacity);
  private count = 0;
  private cursor = 0;

  push(value: number): void {
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % sampleCapacity;
    this.count = Math.min(sampleCapacity, this.count + 1);
  }

  reset(): void {
    this.count = 0;
    this.cursor = 0;
  }

  size(): number {
    return this.count;
  }

  percentiles(): GraphPercentiles {
    if (this.count === 0) {
      return { p50: 0, p95: 0, p99: 0, maximum: 0 };
    }
    const sorted = Array.from(this.values.subarray(0, this.count)).sort(
      (left, right) => left - right,
    );
    return {
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
      maximum: quantile(sorted, 1),
    };
  }

  countAtLeast(threshold: number): number {
    let total = 0;
    for (let index = 0; index < this.count; index += 1) {
      if ((this.values[index] ?? 0) >= threshold) {
        total += 1;
      }
    }
    return total;
  }
}

function quantile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
  return sorted[index] ?? 0;
}

function emptyMarks(): Record<GraphCpuMark, RingBuffer> {
  return {
    projection: new RingBuffer(),
    packing: new RingBuffer(),
    upload: new RingBuffer(),
    draw: new RingBuffer(),
  };
}

/**
 * Accumulates frames. It stores numbers only: the renderer owns the stopwatch,
 * so a sample can be produced from a real clock, a replayed trace, or a test
 * without this module knowing the difference.
 */
export class GraphFrameSampler {
  private readonly cpuFrames = new RingBuffer();
  private readonly frameDeltas = new RingBuffer();
  private readonly gpuFrames = new RingBuffer();
  private readonly markBuffers = emptyMarks();
  private longTasks = 0;
  private longTaskTotalMs = 0;
  private renderScaleMinimum = Number.POSITIVE_INFINITY;
  private renderScaleMaximum = Number.NEGATIVE_INFINITY;
  private tierChanges = 0;
  private slowFrameBudgetMs = 1000 / 120;

  setFrameBudgetMs(budgetMs: number): void {
    this.slowFrameBudgetMs = budgetMs;
  }

  record(sample: GraphFrameSample): void {
    this.cpuFrames.push(sample.cpuFrameMs);
    this.frameDeltas.push(sample.frameDeltaMs);
    if (sample.gpuFrameMs !== null) {
      this.gpuFrames.push(sample.gpuFrameMs);
    }
    for (const mark of graphCpuMarks) {
      this.markBuffers[mark].push(sample.marks[mark]);
    }
  }

  recordLongTask(durationMs: number): void {
    this.longTasks += 1;
    this.longTaskTotalMs += durationMs;
  }

  recordQuality(renderScale: number, tierChanged: boolean): void {
    this.renderScaleMinimum = Math.min(this.renderScaleMinimum, renderScale);
    this.renderScaleMaximum = Math.max(this.renderScaleMaximum, renderScale);
    if (tierChanged) {
      this.tierChanges += 1;
    }
  }

  reset(): void {
    this.cpuFrames.reset();
    this.frameDeltas.reset();
    this.gpuFrames.reset();
    for (const mark of graphCpuMarks) {
      this.markBuffers[mark].reset();
    }
    this.longTasks = 0;
    this.longTaskTotalMs = 0;
    this.renderScaleMinimum = Number.POSITIVE_INFINITY;
    this.renderScaleMaximum = Number.NEGATIVE_INFINITY;
    this.tierChanges = 0;
  }

  summary(): GraphPerformanceSummary {
    const frames = this.cpuFrames.size();
    return {
      frames,
      cpuFrameMs: this.cpuFrames.percentiles(),
      frameDeltaMs: this.frameDeltas.percentiles(),
      gpuFrameMs: this.gpuFrames.size() > 0 ? this.gpuFrames.percentiles() : null,
      marks: {
        projection: this.markBuffers.projection.percentiles(),
        packing: this.markBuffers.packing.percentiles(),
        upload: this.markBuffers.upload.percentiles(),
        draw: this.markBuffers.draw.percentiles(),
      },
      longTasks: this.longTasks,
      longTaskTotalMs: this.longTaskTotalMs,
      framesOverDroppedThreshold: this.frameDeltas.countAtLeast(droppedFrameMs),
      slowFrameRatio:
        frames === 0 ? 0 : this.frameDeltas.countAtLeast(this.slowFrameBudgetMs * 1.25) / frames,
      renderScaleMinimum: Number.isFinite(this.renderScaleMinimum) ? this.renderScaleMinimum : 1,
      renderScaleMaximum: Number.isFinite(this.renderScaleMaximum) ? this.renderScaleMaximum : 1,
      tierChanges: this.tierChanges,
    };
  }
}

/**
 * Times the four stages of a frame. Held open across a frame and read once, so
 * measurement costs four clock reads rather than a `performance.measure` entry
 * per stage per frame.
 */
export class GraphFrameStopwatch {
  private readonly totals: Record<GraphCpuMark, number> = {
    projection: 0,
    packing: 0,
    upload: 0,
    draw: 0,
  };
  private openedAt = 0;
  private open: GraphCpuMark | null = null;

  constructor(private readonly now: () => number) {}

  beginFrame(): number {
    for (const mark of graphCpuMarks) {
      this.totals[mark] = 0;
    }
    this.open = null;
    return this.now();
  }

  begin(mark: GraphCpuMark): void {
    if (this.open !== null) {
      this.end();
    }
    this.open = mark;
    this.openedAt = this.now();
  }

  end(): void {
    if (this.open === null) {
      return;
    }
    this.totals[this.open] += this.now() - this.openedAt;
    this.open = null;
  }

  marks(): Readonly<Record<GraphCpuMark, number>> {
    this.end();
    return { ...this.totals };
  }
}

/**
 * GPU frame time through `EXT_disjoint_timer_query_webgl2`. One query is in
 * flight at a time and results are read on a later frame, so sampling never
 * stalls the pipeline. A disjoint result is discarded rather than reported,
 * because a wrong GPU number is worse than no GPU number.
 */
export class GraphGpuTimer {
  private extension: {
    readonly TIME_ELAPSED_EXT: number;
    readonly GPU_DISJOINT_EXT: number;
  } | null;
  private active: WebGLQuery | null = null;
  private pending: WebGLQuery | null = null;
  private lastMs: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
      readonly TIME_ELAPSED_EXT: number;
      readonly GPU_DISJOINT_EXT: number;
    } | null;
  }

  supported(): boolean {
    return this.extension !== null;
  }

  beginFrame(): void {
    if (this.extension === null || this.pending !== null || this.active !== null) {
      return;
    }
    const query = this.gl.createQuery();
    if (query === null) {
      return;
    }
    this.active = query;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
  }

  endFrame(): void {
    if (this.extension === null || this.active === null) {
      return;
    }
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending = this.active;
    this.active = null;
  }

  /** The most recent completed GPU frame time, or null while none is ready. */
  poll(): number | null {
    if (this.extension === null || this.pending === null) {
      return this.lastMs;
    }
    const available = this.gl.getQueryParameter(
      this.pending,
      this.gl.QUERY_RESULT_AVAILABLE,
    ) as boolean;
    if (!available) {
      return this.lastMs;
    }
    const disjoint = this.gl.getParameter(this.extension.GPU_DISJOINT_EXT) as boolean;
    if (!disjoint) {
      const nanoseconds = this.gl.getQueryParameter(this.pending, this.gl.QUERY_RESULT) as number;
      this.lastMs = nanoseconds / 1e6;
    }
    this.gl.deleteQuery(this.pending);
    this.pending = null;
    return this.lastMs;
  }

  dispose(): void {
    if (this.active !== null && this.extension !== null) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.active);
      this.active = null;
    }
    if (this.pending !== null) {
      this.gl.deleteQuery(this.pending);
      this.pending = null;
    }
  }
}

/** Feeds renderer long tasks into a sampler. Returns the disconnect. */
export function observeGraphLongTasks(sampler: GraphFrameSampler): () => void {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    return () => {};
  }
  const observer = new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      sampler.recordLongTask(entry.duration);
    }
  });
  observer.observe({ type: "longtask", buffered: true });
  return () => observer.disconnect();
}
