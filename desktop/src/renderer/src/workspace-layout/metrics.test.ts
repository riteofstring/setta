import { describe, expect, test } from "vitest";

import { WorkspaceMetricsCollector } from "./metrics";
import type { ResizePhase } from "./types";

describe("workspace metrics collector", () => {
  test("keeps settled resize commits out of active resize percentiles", () => {
    const metrics = new WorkspaceMetricsCollector();

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

  test("records snapshot capture guard metrics", () => {
    const metrics = new WorkspaceMetricsCollector();

    metrics.recordSnapshotCaptureRequest({ duringTransition: false, kind: "bitmap" });
    metrics.recordSnapshotCaptureRequest({ duringTransition: true, kind: "texture" });
    metrics.recordSnapshotCapturePromiseAwaitedByTransition();
    metrics.recordSnapshotTextureUse("fresh");
    metrics.recordSnapshotTextureUse("stale");
    metrics.recordSnapshotTextureUse("missing");

    expect(metrics.snapshot()).toMatchObject({
      snapshotBitmapCaptureRequests: 1,
      snapshotCapturePromisesAwaitedByTransition: 1,
      snapshotCaptureRequests: 2,
      snapshotCaptureRequestsDuringTransition: 1,
      snapshotFreshTextureUses: 1,
      snapshotMissingTextureUses: 1,
      snapshotStaleTextureUses: 1,
      snapshotTextureCaptureRequests: 1,
    });

    metrics.reset();

    expect(metrics.snapshot()).toMatchObject({
      snapshotBitmapCaptureRequests: 0,
      snapshotCapturePromisesAwaitedByTransition: 0,
      snapshotCaptureRequests: 0,
      snapshotCaptureRequestsDuringTransition: 0,
      snapshotFreshTextureUses: 0,
      snapshotMissingTextureUses: 0,
      snapshotStaleTextureUses: 0,
      snapshotTextureCaptureRequests: 0,
    });
  });

  test("records pane drag preview churn metrics", () => {
    const metrics = new WorkspaceMetricsCollector();

    metrics.recordPaneDragPreviewUpdate();
    metrics.recordPaneDragPreviewUpdate();
    metrics.recordPaneDragPreviewClear();

    expect(metrics.snapshot()).toMatchObject({
      paneDragPreviewClears: 1,
      paneDragPreviewUpdates: 2,
    });

    metrics.reset();

    expect(metrics.snapshot()).toMatchObject({
      paneDragPreviewClears: 0,
      paneDragPreviewUpdates: 0,
    });
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
