import { describe, expect, test } from "vitest";

import { NiriMetricsCollector } from "./metrics";
import type { ResizePhase } from "./types";

describe("niri metrics collector", () => {
  test("keeps settled resize commits out of active resize percentiles", () => {
    const metrics = new NiriMetricsCollector();

    metrics.recordFrame(frameSample("active", 1.5));
    metrics.recordFrame(frameSample("active", 2.5));
    metrics.recordFrame(frameSample("active", 3.5));
    metrics.recordFrame(frameSample("settled", 18));

    const snapshot = metrics.snapshot();

    expect(snapshot.resize.frameCount).toBe(4);
    expect(snapshot.resize.settledFrameCount).toBe(1);
    expect(snapshot.resize.frameTime).toBe(18);
    expect(snapshot.resize.p95FrameTime).toBe(2.5);
    expect(snapshot.resize.p99FrameTime).toBe(2.5);
  });
});

function frameSample(resizePhase: ResizePhase, frameTime: number) {
  return {
    boxWrites: 0,
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    frameTime,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    nativeBoundsUpdates: 0,
    resizePhase,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
    transformWrites: 0,
    visiblePaneCount: 40,
  };
}
