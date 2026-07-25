import { describe, expect, it } from "vitest";

import {
  GraphFrameSampler,
  GraphFrameStopwatch,
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
    sampler.setFrameBudgetMs(8.33);
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

  it("records long tasks and quality changes alongside the frames", () => {
    const sampler = new GraphFrameSampler();
    sampler.recordLongTask(53);
    sampler.recordLongTask(70);
    sampler.recordQuality(1, false);
    sampler.recordQuality(0.72, true);
    const summary = sampler.summary();
    expect(summary.longTasks).toBe(2);
    expect(summary.longTaskTotalMs).toBe(123);
    expect(summary.renderScaleMinimum).toBe(0.72);
    expect(summary.renderScaleMaximum).toBe(1);
    expect(summary.tierChanges).toBe(1);
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
    expect(summary.renderScaleMinimum).toBe(1);
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
