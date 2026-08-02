import { describe, expect, it } from "vitest";

import {
  GraphFrameSampler,
  GraphFrameStopwatch,
  GraphGpuTimer,
  graphCpuMarks,
  type GraphFrameSample,
} from "./graph-instrumentation";

function sample(overrides: Partial<GraphFrameSample> = {}): GraphFrameSample {
  return {
    cpuFrameMs: 1,
    gpuFrameMs: 2,
    frameDeltaMs: 8.33,
    marks: { projection: 0.1, packing: 0.2, upload: 0.3, draw: 0.4 },
    ...overrides,
  };
}

describe("graph frame sampler", () => {
  it("reports percentiles rather than an average", () => {
    const sampler = new GraphFrameSampler();
    for (let index = 1; index <= 100; index += 1) {
      sampler.record(sample({ cpuFrameMs: index, frameDeltaMs: index }));
    }
    const summary = sampler.summary();
    expect(summary.frames).toBe(100);
    expect(summary.cpuFrameMs.p50).toBe(50);
    expect(summary.cpuFrameMs.p95).toBe(95);
    // Nearest-rank below, the same convention the committed E2E budget harness
    // asserts against, so a graph report and a workflow report agree on p99.
    expect(summary.cpuFrameMs.p99).toBe(99);
    expect(summary.cpuFrameMs.maximum).toBe(100);
  });

  it("keeps GPU time optional", () => {
    const sampler = new GraphFrameSampler();
    sampler.record(sample({ gpuFrameMs: null }));
    expect(sampler.summary().gpuFrameMs).toBeNull();
    sampler.record(sample({ gpuFrameMs: 4 }));
    expect(sampler.summary().gpuFrameMs?.p50).toBe(4);
  });

  it("counts dropped frames and the slow-frame ratio against the budget", () => {
    const sampler = new GraphFrameSampler();
    sampler.record(sample({ frameDeltaMs: 8 }));
    sampler.record(sample({ frameDeltaMs: 12 }));
    sampler.record(sample({ frameDeltaMs: 60 }));
    sampler.record(sample({ frameDeltaMs: 8 }));
    const summary = sampler.summary();
    expect(summary.framesOverDroppedThreshold).toBe(1);
    expect(summary.slowFrameRatio).toBeCloseTo(0.5, 5);
  });

  it("keeps a mark series per stage", () => {
    const sampler = new GraphFrameSampler();
    sampler.record(sample({ marks: { projection: 1, packing: 2, upload: 3, draw: 4 } }));
    const summary = sampler.summary();
    expect(graphCpuMarks.map((mark) => summary.marks[mark].p50)).toEqual([1, 2, 3, 4]);
  });

  it("records long tasks alongside the frames", () => {
    const sampler = new GraphFrameSampler();
    sampler.recordLongTask(53);
    sampler.recordLongTask(70);
    const summary = sampler.summary();
    expect(summary.longTasks).toBe(2);
    expect(summary.longTaskTotalMs).toBe(123);
  });

  it("starts clean after a reset", () => {
    const sampler = new GraphFrameSampler();
    sampler.record(sample());
    sampler.recordLongTask(51);
    sampler.reset();
    const summary = sampler.summary();
    expect(summary.frames).toBe(0);
    expect(summary.longTasks).toBe(0);
    expect(summary.cpuFrameMs.p95).toBe(0);
  });

  it("bounds memory by keeping a fixed sample window", () => {
    const sampler = new GraphFrameSampler();
    for (let index = 0; index < 5000; index += 1) {
      sampler.record(sample({ cpuFrameMs: index }));
    }
    expect(sampler.summary().frames).toBeLessThanOrEqual(1200);
  });
});

describe("graph frame stopwatch", () => {
  it("attributes elapsed time to the open mark", () => {
    let clock = 0;
    const stopwatch = new GraphFrameStopwatch(() => clock);
    stopwatch.beginFrame();
    stopwatch.begin("projection");
    clock += 2;
    stopwatch.begin("packing");
    clock += 3;
    stopwatch.begin("upload");
    clock += 1;
    stopwatch.begin("draw");
    clock += 4;
    expect(stopwatch.marks()).toEqual({ projection: 2, packing: 3, upload: 1, draw: 4 });
  });

  it("clears the previous frame's marks", () => {
    let clock = 0;
    const stopwatch = new GraphFrameStopwatch(() => clock);
    stopwatch.beginFrame();
    stopwatch.begin("draw");
    clock += 5;
    stopwatch.marks();
    stopwatch.beginFrame();
    expect(stopwatch.marks()).toEqual({ projection: 0, packing: 0, upload: 0, draw: 0 });
  });
});

class FakeGpuTimerContext {
  readonly QUERY_RESULT_AVAILABLE = 1;
  readonly QUERY_RESULT = 2;
  available = false;
  disjoint = false;
  nanoseconds = 4_000_000;
  deleted = 0;
  ended = 0;
  private readonly query = {} as WebGLQuery;

  getExtension(name: string): object | null {
    return name === "EXT_disjoint_timer_query_webgl2"
      ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }
      : null;
  }

  createQuery(): WebGLQuery {
    return this.query;
  }

  beginQuery(): void {}

  endQuery(): void {
    this.ended += 1;
  }

  getQueryParameter(_query: WebGLQuery, field: number): boolean | number {
    return field === this.QUERY_RESULT_AVAILABLE ? this.available : this.nanoseconds;
  }

  getParameter(): boolean {
    return this.disjoint;
  }

  deleteQuery(): void {
    this.deleted += 1;
  }

  context(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }
}

describe("graph GPU timer", () => {
  it("reports a completed query once instead of repeating a stale sample", () => {
    const context = new FakeGpuTimerContext();
    const timer = new GraphGpuTimer(context.context());
    timer.beginFrame();
    timer.endFrame();
    expect(timer.poll()).toBeNull();
    context.available = true;
    expect(timer.poll()).toBe(4);
    expect(timer.poll()).toBeNull();
    expect(context.deleted).toBe(0);
    timer.dispose();
    expect(context.deleted).toBe(2);
  });

  it("drops disjoint and reset queries", () => {
    const context = new FakeGpuTimerContext();
    const timer = new GraphGpuTimer(context.context());
    timer.beginFrame();
    timer.endFrame();
    context.available = true;
    context.disjoint = true;
    expect(timer.poll()).toBeNull();
    timer.beginFrame();
    timer.reset();
    expect(context.ended).toBe(2);
    expect(context.deleted).toBe(1);
    expect(timer.poll()).toBeNull();
    timer.dispose();
    expect(context.deleted).toBe(2);
  });
});
